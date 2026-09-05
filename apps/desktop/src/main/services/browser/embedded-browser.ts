import { randomUUID } from "node:crypto";
import {
  app,
  type BrowserWindow,
  dialog,
  session,
  WebContentsView,
  type Session,
  type BrowserWindowConstructorOptions,
} from "electron";
import { chromium, type Browser } from "playwright";
import {
  DesktopBrowserStateSchema,
  type DesktopBrowserState,
  type DesktopBrowserAttention,
  type DesktopBrowserCommand,
  type DesktopBrowserViewport,
} from "@unemployed/contracts";
import { BrowserCdpBridge, type BrowserCdpPage } from "./browser-cdp-bridge";
import {
  browserDisplayUrl,
  browserUserAgent,
  isBrowserNavigationAllowed,
  normalizeBrowserNavigation,
} from "./browser-navigation";

export const EMBEDDED_BROWSER_PARTITION = "persist:unemployed-browser";
const MAX_TABS = 8;
interface BrowserPage extends BrowserCdpPage {
  view: WebContentsView;
}
interface ActivityHooks {
  pause(reason: string): Promise<void>;
  resume(): Promise<void>;
}

export class EmbeddedBrowser {
  private window: BrowserWindow | null = null;
  private browserSession: Session | null = null;
  private readonly pageMap = new Map<string, BrowserPage>();
  private readonly pageListeners = new Set<(page: BrowserCdpPage) => void>();
  private stateListeners = new Set<(state: DesktopBrowserState) => void>();
  private activeTabId: string | null = null;
  private presentation: DesktopBrowserState["presentation"] = "minimized";
  private closed = true;
  private closing = false;
  private paused = false;
  private activityHooks: ActivityHooks | null = null;
  private viewport: DesktopBrowserViewport = {
    x: 50,
    y: 130,
    width: 1100,
    height: 640,
    visible: false,
  };
  private readonly operations = new Map<AbortController, string>();
  private bridge: BrowserCdpBridge | null = null;
  private connection: Promise<Browser> | null = null;
  private attention: DesktopBrowserAttention | null = null;
  private revision = 0;
  private closePromise: Promise<void> | null = null;
  private connectionGeneration = 0;
  private handoverPromise: Promise<void> | null = null;

  attachWindow(window: BrowserWindow): void {
    if (this.window === window) return;
    this.window = window;
    window.on("resize", () => this.layout());
    window.on("show", () => this.layout());
    window.on("restore", () => this.layout());
    window.on("closed", () => {
      if (this.window !== window) return;
      this.window = null;
      void this.close(false);
    });
  }

  ownsRenderer(id: number): boolean {
    return (
      !!this.window &&
      !this.window.isDestroyed() &&
      this.window.webContents.id === id
    );
  }

  setActivityHooks(hooks: ActivityHooks): void {
    this.activityHooks = hooks;
  }
  syncActivityPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.abortOperations();
    this.emit();
  }
  onStateChanged(listener: (state: DesktopBrowserState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  getState(): DesktopBrowserState {
    return DesktopBrowserStateSchema.parse({
      revision: this.revision,
      phase: this.closing
        ? "closing"
        : this.closed
          ? "closed"
          : this.handoverPromise
            ? "pausing"
            : this.attention
              ? "needs_you"
              : this.operations.size > 0
                ? "working"
                : this.paused
                  ? "paused"
                  : "ready",
      presentation: this.presentation,
      activeTabId: this.activeTabId,
      activity: [...this.operations.values()].at(-1) ?? null,
      attention: this.attention,
      automationPaused: this.paused,
      tabs: [...this.pageMap.values()]
        .filter((page) => !page.contents.isDestroyed())
        .map((page) => ({
          id: page.id,
          title: (page.contents.getTitle() || "New tab").slice(0, 300),
          url: browserDisplayUrl(page.contents.getURL()),
          loading: page.contents.isLoading(),
          canGoBack: page.contents.navigationHistory.canGoBack(),
          canGoForward: page.contents.navigationHistory.canGoForward(),
        })),
    });
  }

  private emit(): void {
    this.revision += 1;
    const state = this.getState();
    for (const listener of this.stateListeners) listener(state);
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("browser:state-changed", state);
    }
  }

  getSession(): Session {
    if (this.browserSession) return this.browserSession;
    const browserSession = session.fromPartition(EMBEDDED_BROWSER_PARTITION);
    browserSession.setUserAgent(
      browserUserAgent(browserSession.getUserAgent(), app.getName()),
    );
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setPermissionRequestHandler(
      (contents, permission, callback) => {
        // Website capabilities are user-owned, independent of agent authority.
        const page = [...this.pageMap.values()].find(
          (item) => item.contents.id === contents?.id,
        );
        if (
          !page ||
          !this.window ||
          this.operations.size > 0 ||
          this.presentation === "minimized"
        ) {
          callback(false);
          this.requestAttention({
            kind: "permission",
            title: "Website permission requested",
            detail:
              "Open the browser and take control to review this website’s permission request.",
          });
          return;
        }
        const supported = [
          "media",
          "geolocation",
          "notifications",
          "clipboard-sanitized-write",
          "fullscreen",
        ].includes(permission);
        if (!supported) {
          callback(false);
          return;
        }
        void dialog
          .showMessageBox(this.window, {
            type: "question",
            title: "Website permission",
            message: `${new URL(contents.getURL()).hostname} wants ${permission.replaceAll("-", " ")} access.`,
            detail: "Allow only if you expected this request from the website.",
            buttons: ["Don’t allow", "Allow once"],
            defaultId: 0,
            cancelId: 0,
          })
          .then(
            (result) => callback(result.response === 1),
            () => callback(false),
          );
      },
    );
    browserSession.on("will-download", (event, item, contents) => {
      const owned = [...this.pageMap.values()].some(
        (page) => page.contents.id === contents.id,
      );
      if (
        !owned ||
        this.operations.size > 0 ||
        this.presentation === "minimized"
      ) {
        event.preventDefault();
        this.requestAttention({
          kind: "user_action",
          title: "A download needs you",
          detail:
            "Take control in the browser, then click the download again to choose where to save it.",
        });
        return;
      }
      // Electron's native save dialog keeps filesystem selection with the user.
      item.setSaveDialogOptions({ title: "Save browser download" });
    });
    const stopForWorker = () => {
      if (this.operations.size === 0 || this.paused || this.closing) return;
      void this.takeControl().catch(() => undefined);
      this.requestAttention({
        kind: "user_action",
        title: "Browser activity paused",
        detail:
          "A website started background activity outside the preparation guard. Close the browser, then resume activity to start a fresh guarded session.",
      });
    };
    browserSession.serviceWorkers.on("registration-completed", stopForWorker);
    browserSession.serviceWorkers.on("running-status-changed", (event) => {
      if (
        event.runningStatus === "starting" ||
        event.runningStatus === "running"
      )
        stopForWorker();
    });
    this.browserSession = browserSession;
    return browserSession;
  }

  requestAttention(attention: DesktopBrowserAttention): void {
    this.attention = attention;
    this.emit();
  }

  assertAutomationSafe(): void {
    if (
      Object.keys(this.getSession().serviceWorkers.getAllRunning()).length > 0
    ) {
      throw new Error(
        "A website has a background worker running. Close the browser, then resume activity to start a guarded session.",
      );
    }
  }

  private createPage(
    url: string,
    openerId?: string,
    popupOptions?: BrowserWindowConstructorOptions,
  ): BrowserPage {
    if (this.closing)
      throw new Error(
        "The browser is closing. Open it again when it has finished.",
      );
    if (!this.window || this.window.isDestroyed())
      throw new Error("The app window is not available.");
    if (this.pageMap.size >= MAX_TABS)
      throw new Error("Close a browser tab before opening another one.");
    const destination = normalizeBrowserNavigation(url);
    const view = new WebContentsView({
      ...popupOptions,
      webPreferences: {
        ...popupOptions?.webPreferences,
        session: this.getSession(),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: this.operations.size === 0,
        spellcheck: true,
        safeDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    const page: BrowserPage = {
      id: randomUUID(),
      contents: view.webContents,
      view,
      ...(openerId ? { openerId } : {}),
    };
    this.pageMap.set(page.id, page);
    this.closed = false;
    this.activeTabId = page.id;
    view.setBorderRadius(12);
    this.window.contentView.addChildView(view);
    const update = () => {
      if (!page.contents.isDestroyed()) this.emit();
    };
    page.contents.on("did-start-loading", update);
    page.contents.on("did-stop-loading", update);
    page.contents.on("page-title-updated", update);
    page.contents.on("did-navigate", update);
    page.contents.on("did-navigate-in-page", update);
    page.contents.on("will-navigate", (event, target) => {
      if (!isBrowserNavigationAllowed(target)) event.preventDefault();
    });
    page.contents.on("will-redirect", (event, target) => {
      if (!isBrowserNavigationAllowed(target)) event.preventDefault();
    });
    page.contents.on("will-frame-navigate", (event) => {
      if (
        event.url &&
        !isBrowserNavigationAllowed(event.url) &&
        event.url !== "about:srcdoc"
      )
        event.preventDefault();
    });
    page.contents.on(
      "did-fail-load",
      (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3 && !this.closing) {
          this.requestAttention({
            kind: "error",
            title: "This page couldn’t load",
            detail:
              "Check your connection or try reloading. You can enter another website above.",
          });
        }
      },
    );
    page.contents.on("render-process-gone", () => {
      if (!this.closing)
        this.requestAttention({
          kind: "error",
          title: "This browser tab stopped",
          detail:
            "Reload the page to continue. Your saved sign-ins are still kept.",
        });
    });
    page.contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      const mod = process.platform === "darwin" ? input.meta : input.control;
      if (input.key === "Escape" && !input.isComposing) {
        event.preventDefault();
        this.presentation = "minimized";
        this.layout();
        this.emit();
      }
      if (mod && input.key.toLowerCase() === "w") {
        event.preventDefault();
        void this.command({ type: "close_tab", tabId: page.id });
      }
      if (mod && input.key.toLowerCase() === "l") {
        event.preventDefault();
        this.window?.webContents.focus();
        this.window?.webContents.send("browser:focus-address");
      }
    });
    // Return a WebContentsView directly: popups remain in this window and session.
    // No app-level CDP auto-attach pauses Electron's synchronous createWindow path.
    page.contents.setWindowOpenHandler((details) => {
      if (
        !isBrowserNavigationAllowed(details.url) ||
        this.pageMap.size >= MAX_TABS ||
        this.closing
      )
        return { action: "deny" };
      return {
        action: "allow",
        createWindow: (options) => {
          const popup = this.createPage("about:blank", page.id, options);
          return popup.contents;
        },
      };
    });
    page.contents.once("destroyed", () => {
      this.pageMap.delete(page.id);
      if (this.activeTabId === page.id)
        this.activeTabId = [...this.pageMap.keys()].at(-1) ?? null;
      if (this.window && !this.window.isDestroyed())
        this.window.contentView.removeChildView(view);
      this.layout();
      this.emit();
    });
    this.layout();
    // Attaching Debugger inside Electron's synchronous popup factory deadlocks
    // the opener. Wait until createWindow has returned before attaching a popup.
    if (openerId)
      setImmediate(() => {
        if (!page.contents.isDestroyed())
          for (const listener of this.pageListeners) listener(page);
      });
    else for (const listener of this.pageListeners) listener(page);
    this.emit();
    if (!openerId) {
      void page.contents.loadURL(destination).catch(() => undefined);
    }
    return page;
  }

  private selectPage(id: string): void {
    if (!this.pageMap.has(id)) return;
    this.activeTabId = id;
    this.layout();
    this.emit();
  }
  private closePage(id: string): void {
    const page = this.pageMap.get(id);
    if (!page || page.contents.isDestroyed()) return;
    page.contents.close({ waitForBeforeUnload: false });
  }

  setViewport(viewport: DesktopBrowserViewport): void {
    this.viewport = { ...viewport };
    this.layout();
  }
  private layout(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const zoom = this.window.webContents.getZoomFactor();
    const [windowWidth = 1, windowHeight = 1] = this.window.getContentSize();
    const x = Math.max(
      0,
      Math.min(windowWidth, Math.round(this.viewport.x * zoom)),
    );
    const y = Math.max(
      0,
      Math.min(windowHeight, Math.round(this.viewport.y * zoom)),
    );
    const width = Math.max(
      1,
      Math.min(windowWidth - x, Math.round(this.viewport.width * zoom)),
    );
    const height = Math.max(
      1,
      Math.min(windowHeight - y, Math.round(this.viewport.height * zoom)),
    );
    for (const page of this.pageMap.values()) {
      if (page.contents.isDestroyed()) continue;
      // Minimize preserves the last usable viewport; never resize a live page to 0.
      if (width > 100 && height > 100)
        page.view.setBounds({ x, y, width, height });
      page.view.setVisible(
        !this.closed &&
          !this.closing &&
          this.presentation !== "minimized" &&
          this.viewport.visible &&
          this.activeTabId === page.id,
      );
      // Native view visibility can hide a newly created render widget after
      // its preferences were applied. Reassert the active-run rendering policy
      // after visibility changes so background tabs keep animation frames.
      page.contents.setBackgroundThrottling(this.operations.size === 0);
    }
  }

  private disconnectAutomation(): void {
    this.connectionGeneration += 1;
    this.bridge?.close();
    this.bridge = null;
    this.connection = null;
  }
  private abortOperations(): void {
    for (const controller of this.operations.keys())
      controller.abort(
        new DOMException("Browser activity paused by the user.", "AbortError"),
      );
    this.disconnectAutomation();
  }

  async getOpenBrowser(): Promise<Browser | null> {
    if (this.pageMap.size === 0 || this.closing) return null;
    return this.connectInternal(true);
  }

  async connect(): Promise<Browser> {
    return this.connectInternal(false);
  }

  private async connectInternal(observationOnly: boolean): Promise<Browser> {
    if ((!observationOnly && this.paused) || this.closing)
      throw new Error(
        "Browser activity is paused. Resume it from the browser toolbar.",
      );
    if (this.connection) return this.connection;
    const generation = this.connectionGeneration;
    const creation = (async () => {
      if (this.pageMap.size === 0) this.createPage("about:blank");
      const bridge = new BrowserCdpBridge({
        pages: () => [...this.pageMap.values()],
        createPage: (url) => Promise.resolve(this.createPage(url)),
        closePage: (id) => this.closePage(id),
        selectPage: (id) => this.selectPage(id),
        onPageCreated: (listener) => {
          this.pageListeners.add(listener);
          return () => this.pageListeners.delete(listener);
        },
        userAgent: () => this.getSession().getUserAgent(),
        emulateFocus: () => this.operations.size > 0 && !this.paused,
      });
      this.bridge = bridge;
      const transport = await bridge.start();
      const browser = await chromium.connectOverCDP(transport.endpoint, {
        headers: transport.headers,
        noDefaults: true,
        timeout: 15_000,
      });
      if (
        generation !== this.connectionGeneration ||
        (!observationOnly && this.paused) ||
        this.closing
      ) {
        bridge.close();
        throw new Error("Browser activity was stopped while connecting.");
      }
      browser.once("disconnected", () => {
        if (this.bridge === bridge) this.disconnectAutomation();
      });
      return browser;
    })();
    this.connection = creation;
    void creation.catch(() => {
      if (this.connection === creation) this.disconnectAutomation();
    });
    return creation;
  }

  async runAutomation<T>(
    label: string,
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.paused || this.closing)
      throw new Error(
        "Browser activity is paused. Resume it from the browser toolbar.",
      );
    signal?.throwIfAborted();
    const controller = new AbortController();
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    this.operations.set(controller, label);
    this.attention = null;
    this.closed = false;
    for (const page of this.pageMap.values())
      if (!page.contents.isDestroyed())
        page.contents.setBackgroundThrottling(false);
    this.emit();
    try {
      await this.bridge?.setAutomationActive(true);
      combined.throwIfAborted();
      return await work(combined);
    } catch (error) {
      combined.throwIfAborted();
      throw error;
    } finally {
      this.operations.delete(controller);
      if (this.operations.size === 0)
        for (const page of this.pageMap.values()) {
          if (!page.contents.isDestroyed())
            page.contents.setBackgroundThrottling(true);
        }
      if (this.operations.size === 0)
        await this.bridge?.setAutomationActive(false).catch(() => undefined);
      this.emit();
    }
  }

  async command(command: DesktopBrowserCommand): Promise<DesktopBrowserState> {
    if (command.type === "close") {
      await this.close(true);
      return this.getState();
    }
    if (this.closing) return this.getState();
    if (command.type === "open") {
      this.closed = false;
      this.presentation = "peek";
      if (command.url) {
        if (this.operations.size > 0) await this.takeControl();
        this.createPage(command.url);
      }
    } else if (command.type === "minimize") this.presentation = "minimized";
    else if (command.type === "expand")
      this.presentation = command.expanded ? "expanded" : "peek";
    else if (command.type === "take_control") await this.takeControl();
    else if (command.type === "resume") {
      await this.handoverPromise;
      await this.closePromise;
      await this.activityHooks?.resume();
      this.paused = false;
      this.attention = null;
    } else if (command.type === "select_tab") this.selectPage(command.tabId);
    else if (command.type === "close_tab") {
      if (this.operations.size > 0) await this.takeControl();
      this.closePage(command.tabId);
      if (this.pageMap.size === 0) await this.close(false);
    } else {
      if (this.operations.size > 0) await this.takeControl();
      const page = this.activeTabId
        ? this.pageMap.get(this.activeTabId)
        : undefined;
      this.attention = null;
      if (command.type === "new_tab") this.createPage("about:blank");
      if (command.type === "navigate") {
        const url = normalizeBrowserNavigation(command.url);
        if (!page) this.createPage(url);
        else void page.contents.loadURL(url).catch(() => undefined);
      }
      if (page && !page.contents.isDestroyed()) {
        if (
          command.type === "back" &&
          page.contents.navigationHistory.canGoBack()
        )
          page.contents.navigationHistory.goBack();
        if (
          command.type === "forward" &&
          page.contents.navigationHistory.canGoForward()
        )
          page.contents.navigationHistory.goForward();
        if (command.type === "reload") page.contents.reload();
        if (command.type === "stop") page.contents.stop();
      }
    }
    this.layout();
    this.emit();
    return this.getState();
  }

  async takeControl(): Promise<void> {
    if (this.handoverPromise) return this.handoverPromise;
    this.paused = true;
    this.abortOperations();
    const handover = Promise.resolve()
      .then(() => this.activityHooks?.pause("Browser handed over to you."))
      .finally(() => {
        this.handoverPromise = null;
        this.emit();
      });
    this.handoverPromise = handover;
    this.emit();
    return handover;
  }

  async releaseAutomationSession(): Promise<void> {
    // Workflow finally-blocks must not close a page handed to the user, nor
    // wait on Close while Close is waiting for those same workflows to settle.
    if (this.paused || this.closing) return;
    await this.close(false);
  }

  async close(pauseActivity: boolean): Promise<void> {
    if (this.closePromise) {
      const pending = this.closePromise;
      if (pauseActivity) await this.takeControl();
      return pending;
    }
    this.closing = true;
    if (pauseActivity) this.paused = true;
    this.abortOperations();
    this.presentation = "minimized";
    this.viewport.visible = false;
    this.emit();
    const closing = (async () => {
      for (const id of [...this.pageMap.keys()]) this.closePage(id);
      this.pageMap.clear();
      this.activeTabId = null;
      if (this.browserSession) {
        await this.browserSession.cookies.flushStore();
        // Workers must not outlive Close; cookies and site sign-in storage remain.
        await this.browserSession.clearStorageData({
          storages: ["serviceworkers", "cachestorage"],
        });
        await this.browserSession.closeAllConnections();
      }
    })().finally(() => {
      this.closed = true;
      this.closing = false;
      this.attention = null;
      this.closePromise = null;
      this.emit();
    });
    this.closePromise = closing;
    if (pauseActivity) await this.takeControl();
    return closing;
  }
}

let browser: EmbeddedBrowser | null = null;
export function getEmbeddedBrowser(): EmbeddedBrowser {
  return (browser ??= new EmbeddedBrowser());
}
