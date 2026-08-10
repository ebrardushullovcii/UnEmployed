import type { Event, Input, WebContents } from "electron";

export const MAIN_WINDOW_MIN_ZOOM_FACTOR = 0.5;
export const MAIN_WINDOW_MAX_ZOOM_FACTOR = 2;
export const MAIN_WINDOW_DEFAULT_ZOOM_FACTOR = 1;
export const MAIN_WINDOW_ZOOM_FACTOR_STEP = 0.1;

export type MainWindowZoomCommand = "in" | "out" | "reset";

export type MainWindowZoomShortcutInput = Pick<
  Input,
  "alt" | "code" | "control" | "isComposing" | "key" | "meta" | "type"
>;

export function getMainWindowZoomCommand(
  input: MainWindowZoomShortcutInput,
  platform: NodeJS.Platform = process.platform,
): MainWindowZoomCommand | null {
  if (input.type !== "keyDown" || input.isComposing || input.alt) {
    return null;
  }

  const primaryModifier = platform === "darwin" ? input.meta : input.control;
  const conflictingModifier =
    platform === "darwin" ? input.control : input.meta;

  if (!primaryModifier || conflictingModifier) {
    return null;
  }

  if (
    input.key === "+" ||
    input.key === "=" ||
    input.code === "Equal" ||
    input.code === "NumpadAdd"
  ) {
    return "in";
  }

  if (
    input.key === "-" ||
    input.code === "Minus" ||
    input.code === "NumpadSubtract"
  ) {
    return "out";
  }

  if (
    input.key === "0" ||
    input.code === "Digit0" ||
    input.code === "Numpad0"
  ) {
    return "reset";
  }

  return null;
}

export function getNextMainWindowZoomFactor(
  currentFactor: number,
  command: MainWindowZoomCommand,
): number {
  if (command === "reset") {
    return MAIN_WINDOW_DEFAULT_ZOOM_FACTOR;
  }

  const safeCurrentFactor = Number.isFinite(currentFactor)
    ? currentFactor
    : MAIN_WINDOW_DEFAULT_ZOOM_FACTOR;
  const direction = command === "in" ? 1 : -1;
  const steppedFactor = Number(
    (safeCurrentFactor + direction * MAIN_WINDOW_ZOOM_FACTOR_STEP).toFixed(2),
  );

  return Math.min(
    MAIN_WINDOW_MAX_ZOOM_FACTOR,
    Math.max(MAIN_WINDOW_MIN_ZOOM_FACTOR, steppedFactor),
  );
}

export function bindMainWindowZoomShortcuts(
  webContents: Pick<WebContents, "getZoomFactor" | "on" | "setZoomFactor">,
  platform: NodeJS.Platform = process.platform,
) {
  // Chromium can retain the last zoom used for an origin for the lifetime of
  // the Electron session. Product QA intentionally exercises 125%-200% zoom,
  // so normalize each fresh main window before accepting user zoom input.
  // Users can still change zoom for the current window and reset with Ctrl/Cmd+0.
  let desiredZoomFactor = MAIN_WINDOW_DEFAULT_ZOOM_FACTOR;

  webContents.setZoomFactor(desiredZoomFactor);

  webContents.on("did-start-navigation", (details) => {
    if (!details.isMainFrame || !details.isSameDocument) {
      return;
    }

    const currentFactor = webContents.getZoomFactor();
    if (Number.isFinite(currentFactor) && currentFactor > 0) {
      desiredZoomFactor = currentFactor;
    }
  });

  webContents.on("did-navigate-in-page", (_event, _url, isMainFrame) => {
    if (!isMainFrame || webContents.getZoomFactor() === desiredZoomFactor) {
      return;
    }

    // Chromium persists zoom against the complete file URL, including the hash.
    // Without restoring the pre-navigation factor, moving between Job Finder routes
    // can unexpectedly swap to an old route-specific zoom and make shell controls
    // unreachable. Keep one user-owned zoom factor for the whole desktop window.
    webContents.setZoomFactor(desiredZoomFactor);
  });

  webContents.on("before-input-event", (event: Event, input: Input) => {
    const command = getMainWindowZoomCommand(input, platform);

    if (!command) {
      return;
    }

    event.preventDefault();

    const currentFactor = webContents.getZoomFactor();
    const nextFactor = getNextMainWindowZoomFactor(currentFactor, command);

    if (nextFactor !== currentFactor) {
      desiredZoomFactor = nextFactor;
      webContents.setZoomFactor(nextFactor);
    }
  });
}
