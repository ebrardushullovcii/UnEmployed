import {
  app,
  BrowserWindow,
  dialog,
  type Event as ElectronEvent,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DesktopWindowControlsStateSchema } from "@unemployed/contracts";
import {
  bindMainWindowStatePersistence,
  loadMainWindowState,
  restoreMainWindowBounds,
} from "./window-state";
import { bindMainWindowZoomShortcuts } from "./window-zoom";
import {
  bindMainWindowLifecycle,
  type MainWindowFailure,
  type MainWindowRecoveryChoice,
} from "./main-window-lifecycle";

const defaultMainWindowBounds = {
  width: 1440,
  height: 920,
} as const;

export const MAIN_WINDOW_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* http://[::1]:* ws://localhost:* ws://127.0.0.1:* ws://[::1]:* wss://localhost:* wss://127.0.0.1:* wss://[::1]:*",
].join("; ");

type RendererLoadTarget =
  | {
      kind: "dev";
      url: string;
      origin: string;
    }
  | {
      kind: "file";
      filePath: string;
      url: string;
    };

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalizedHostname === "localhost" || normalizedHostname === "::1") {
    return true;
  }

  const octets = normalizedHostname.split(".");
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.slice(1).every((octet) => {
      if (!/^\d+$/.test(octet)) {
        return false;
      }

      const value = Number(octet);
      return value >= 0 && value <= 255;
    })
  );
}

export function resolveTrustedRendererDevUrl(
  value: string | undefined,
): URL | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !isLoopbackHostname(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function resolveRendererLoadTarget(
  currentDir: string,
  rendererUrl: string | undefined,
  isPackaged: boolean,
): RendererLoadTarget {
  const filePath = path.join(currentDir, "../renderer/index.html");
  const trustedRendererUrl = isPackaged
    ? null
    : resolveTrustedRendererDevUrl(rendererUrl);

  if (trustedRendererUrl) {
    return {
      kind: "dev",
      url: trustedRendererUrl.toString(),
      origin: trustedRendererUrl.origin,
    };
  }

  return {
    kind: "file",
    filePath,
    url: pathToFileURL(filePath).toString(),
  };
}

export function isAllowedRendererNavigation(
  url: string,
  target: RendererLoadTarget,
): boolean {
  try {
    const candidate = new URL(url);
    if (candidate.username || candidate.password) {
      return false;
    }

    if (target.kind === "dev") {
      return candidate.origin === target.origin;
    }

    const entry = new URL(target.url);
    return (
      candidate.protocol === "file:" &&
      candidate.pathname === entry.pathname &&
      candidate.search === ""
    );
  } catch {
    return false;
  }
}

export function bindMainWindowNavigationGuards(
  window: Pick<BrowserWindow, "webContents">,
  target: RendererLoadTarget,
) {
  const denyUnexpectedNavigation = (event: ElectronEvent<{ url: string }>) => {
    if (!isAllowedRendererNavigation(event.url, target)) {
      event.preventDefault();
    }
  };

  window.webContents.on("will-navigate", denyUnexpectedNavigation);
  window.webContents.on("will-redirect", denyUnexpectedNavigation);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

export function getWindowControlsState(window: BrowserWindow) {
  return DesktopWindowControlsStateSchema.parse({
    isMaximized: window.isMaximized() || window.isFullScreen(),
    isMinimizable: window.isMinimizable(),
    isClosable: window.isClosable(),
  });
}

export function sendWindowControlsState(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return;
  }

  window.webContents.send(
    "window:controls-state-changed",
    getWindowControlsState(window),
  );
}

function bindWindowControlsState(window: BrowserWindow) {
  const emitControlsState = () => sendWindowControlsState(window);

  window.on("maximize", emitControlsState);
  window.on("unmaximize", emitControlsState);
  window.on("enter-full-screen", emitControlsState);
  window.on("leave-full-screen", emitControlsState);
}

function getMainWindowFailureTitle(failure: MainWindowFailure): string {
  switch (failure.reason) {
    case "renderer-unresponsive":
      return "UnEmployed stopped responding";
    case "renderer-crashed":
      return "UnEmployed encountered a window error";
    case "startup-load-timeout":
      return "UnEmployed is taking too long to start";
    case "renderer-recovery-failed":
      return "UnEmployed could not recover the window";
    case "renderer-load-failed":
      return "UnEmployed could not load the window";
  }
}

async function showMainWindowRecoveryDialog(
  window: BrowserWindow,
  failure: MainWindowFailure,
  canRetry: boolean,
): Promise<MainWindowRecoveryChoice> {
  if (window.isDestroyed()) {
    return "quit";
  }

  const buttons = canRetry ? ["Retry window", "Quit"] : ["Quit"];
  const response = await dialog.showMessageBox(window, {
    type: "error",
    title: getMainWindowFailureTitle(failure),
    message: failure.detail,
    detail: canRetry
      ? "Retry reloads the main window once and may discard unsaved in-memory edits. Already-saved workspace data is kept. Choose Quit to close the app and start again later."
      : "No bounded recovery retry remains. Quit and start the app again to avoid an endless restart loop.",
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  return canRetry && response.response === 0 ? "retry" : "quit";
}

function recoverMainWindow(window: BrowserWindow, failure: MainWindowFailure) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  if (failure.reason === "renderer-unresponsive") {
    try {
      window.webContents.forcefullyCrashRenderer();
    } catch {
      // A renderer that has already exited cannot be forcefully crashed again.
    }
  }

  window.webContents.reload();
}

export function createMainWindow(currentDir: string) {
  const rendererTarget = resolveRendererLoadTarget(
    currentDir,
    process.env.ELECTRON_RENDERER_URL,
    app.isPackaged,
  );
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const savedState = loadMainWindowState();
  const mainWindow = new BrowserWindow({
    ...restoreMainWindowBounds(defaultMainWindowBounds, savedState),
    minWidth: 1024,
    minHeight: 720,
    show: true,
    title: "UnEmployed",
    backgroundColor: "#0e1726",
    autoHideMenuBar: true,
    frame: !(isMac || isWindows),
    ...(isMac ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      preload: path.join(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  bindWindowControlsState(mainWindow);
  bindMainWindowStatePersistence(mainWindow);
  bindMainWindowZoomShortcuts(mainWindow.webContents);
  bindMainWindowNavigationGuards(mainWindow, rendererTarget);
  const lifecycle = bindMainWindowLifecycle(mainWindow, {
    showRecoveryDialog: (failure, canRetry) =>
      showMainWindowRecoveryDialog(mainWindow, failure, canRetry),
    recover: (failure) => recoverMainWindow(mainWindow, failure),
    requestQuit: () => app.quit(),
    onFailure: (failure) => {
      console.warn("[Desktop] Main window lifecycle failure.", failure);
    },
  });
  mainWindow.on("closed", () => lifecycle.dispose());

  mainWindow.on("ready-to-show", () => {
    if (savedState?.displayMode === "fullscreen") {
      mainWindow.setFullScreen(true);
    } else if (savedState?.displayMode === "maximized") {
      mainWindow.maximize();
    }

    mainWindow.show();
    sendWindowControlsState(mainWindow);
  });

  mainWindow.removeMenu();

  if (rendererTarget.kind === "dev") {
    void mainWindow.loadURL(rendererTarget.url).catch((error: unknown) => {
      lifecycle.reportLoadPromiseFailure(error);
    });
  } else {
    void mainWindow
      .loadFile(rendererTarget.filePath)
      .catch((error: unknown) => {
        lifecycle.reportLoadPromiseFailure(error);
      });
  }

  return mainWindow;
}
