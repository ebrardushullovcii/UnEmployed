import type { BrowserWindow, RenderProcessGoneDetails } from "electron";

export const DEFAULT_MAIN_WINDOW_STARTUP_LOAD_TIMEOUT_MS = 20_000;
export const DEFAULT_MAIN_WINDOW_MAX_RECOVERY_ATTEMPTS = 1;

export type MainWindowFailureReason =
  | "startup-load-timeout"
  | "renderer-load-failed"
  | "renderer-crashed"
  | "renderer-unresponsive"
  | "renderer-recovery-failed";

export type MainWindowRecoveryChoice = "retry" | "quit";

export interface MainWindowFailure {
  reason: MainWindowFailureReason;
  detail: string;
  errorCode?: number;
  exitCode?: number;
  rendererReason?: RenderProcessGoneDetails["reason"];
}

export interface MainWindowLifecycleOptions {
  startupLoadTimeoutMs?: number;
  maxRecoveryAttempts?: number;
  showRecoveryDialog: (
    failure: MainWindowFailure,
    canRetry: boolean,
  ) => Promise<MainWindowRecoveryChoice>;
  recover: (failure: MainWindowFailure) => Promise<void> | void;
  requestQuit: () => Promise<void> | void;
  onFailure?: (failure: MainWindowFailure) => void;
}

export interface MainWindowLifecycleBinding {
  reportLoadPromiseFailure(error: unknown): void;
  dispose(): void;
}

function describeUnknown(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  if (typeof error === "string") {
    return error;
  }

  return "The renderer did not provide additional failure details.";
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value) || value === undefined) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

export function bindMainWindowLifecycle(
  window: BrowserWindow,
  options: MainWindowLifecycleOptions,
): MainWindowLifecycleBinding {
  const startupLoadTimeoutMs = normalizePositiveInteger(
    options.startupLoadTimeoutMs,
    DEFAULT_MAIN_WINDOW_STARTUP_LOAD_TIMEOUT_MS,
  );
  const maxRecoveryAttempts = normalizePositiveInteger(
    options.maxRecoveryAttempts,
    DEFAULT_MAIN_WINDOW_MAX_RECOVERY_ATTEMPTS,
  );

  let disposed = false;
  let startupLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let recoveryAttempts = 0;
  let recoveryDialogInFlight: Promise<void> | null = null;
  let exhaustedRecoveryDialogShown = false;

  const clearStartupLoadTimeout = () => {
    if (startupLoadTimeoutId === null) {
      return;
    }

    clearTimeout(startupLoadTimeoutId);
    startupLoadTimeoutId = null;
  };

  const beginStartupLoadTimeout = () => {
    clearStartupLoadTimeout();
    startupLoadTimeoutId = setTimeout(() => {
      startupLoadTimeoutId = null;
      handleFailure({
        reason: "startup-load-timeout",
        detail: `The main window did not finish loading within ${startupLoadTimeoutMs}ms.`,
      });
    }, startupLoadTimeoutMs);
  };

  const requestQuit = () => {
    try {
      void Promise.resolve(options.requestQuit()).catch((error: unknown) => {
        console.warn(
          "[Desktop] Failed to request quit after renderer failure.",
          error,
        );
      });
    } catch (error) {
      console.warn(
        "[Desktop] Failed to request quit after renderer failure.",
        error,
      );
    }
  };

  const handleRecoveryActionFailure = async (
    failure: MainWindowFailure,
    error: unknown,
  ) => {
    const recoveryFailure: MainWindowFailure = {
      reason: "renderer-recovery-failed",
      detail: `${failure.detail} Recovery failed: ${describeUnknown(error)}`,
    };
    options.onFailure?.(recoveryFailure);

    try {
      await options.showRecoveryDialog(recoveryFailure, false);
    } catch (dialogError) {
      console.warn(
        "[Desktop] Failed to show renderer recovery failure.",
        dialogError,
      );
    }

    requestQuit();
  };

  const showRecoveryDialog = async (
    failure: MainWindowFailure,
    canRetry: boolean,
  ) => {
    let choice: MainWindowRecoveryChoice = "quit";
    try {
      choice = await options.showRecoveryDialog(failure, canRetry);
    } catch (error) {
      console.warn("[Desktop] Renderer recovery dialog failed.", error);
    }

    if (disposed) {
      return;
    }

    if (choice !== "retry" || !canRetry) {
      requestQuit();
      return;
    }

    recoveryAttempts += 1;
    beginStartupLoadTimeout();

    try {
      await options.recover(failure);
    } catch (error) {
      await handleRecoveryActionFailure(failure, error);
    }
  };

  function handleFailure(failure: MainWindowFailure) {
    if (disposed || recoveryDialogInFlight) {
      return;
    }

    clearStartupLoadTimeout();
    options.onFailure?.(failure);

    const canRetry = recoveryAttempts < maxRecoveryAttempts;
    if (!canRetry && exhaustedRecoveryDialogShown) {
      return;
    }
    if (!canRetry) {
      exhaustedRecoveryDialogShown = true;
    }

    const dialogPromise = showRecoveryDialog(failure, canRetry);
    recoveryDialogInFlight = dialogPromise;
    void dialogPromise.finally(() => {
      if (recoveryDialogInFlight === dialogPromise) {
        recoveryDialogInFlight = null;
      }
    });
  }

  const onDidFinishLoad = () => {
    clearStartupLoadTimeout();
  };

  const onDidFailLoad = (
    _event: unknown,
    errorCode: number,
    errorDescription: string,
    _validatedURL: string,
    isMainFrame: boolean,
  ) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }

    handleFailure({
      reason: "renderer-load-failed",
      detail: `${errorDescription || "The main window failed to load."} (code ${errorCode}).`,
      errorCode,
    });
  };

  const onRenderProcessGone = (
    _event: unknown,
    details: RenderProcessGoneDetails,
  ) => {
    if (details.reason === "clean-exit") {
      return;
    }

    handleFailure({
      reason: "renderer-crashed",
      detail: `The renderer process ended unexpectedly (${details.reason}, exit code ${details.exitCode}).`,
      exitCode: details.exitCode,
      rendererReason: details.reason,
    });
  };

  const onUnresponsive = () => {
    handleFailure({
      reason: "renderer-unresponsive",
      detail: "The main window stopped responding to input.",
    });
  };

  const onResponsive = () => {
    // A responsive event is useful evidence for diagnostics, but it must not
    // dismiss a recovery dialog or silently reload a window.
  };

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    clearStartupLoadTimeout();
    window.webContents.removeListener("did-finish-load", onDidFinishLoad);
    window.webContents.removeListener("did-fail-load", onDidFailLoad);
    window.webContents.removeListener(
      "render-process-gone",
      onRenderProcessGone,
    );
    window.webContents.removeListener("unresponsive", onUnresponsive);
    window.webContents.removeListener("responsive", onResponsive);
  };

  window.webContents.on("did-finish-load", onDidFinishLoad);
  window.webContents.on("did-fail-load", onDidFailLoad);
  window.webContents.on("render-process-gone", onRenderProcessGone);
  window.webContents.on("unresponsive", onUnresponsive);
  window.webContents.on("responsive", onResponsive);
  beginStartupLoadTimeout();

  return {
    reportLoadPromiseFailure(error: unknown) {
      handleFailure({
        reason: "renderer-load-failed",
        detail: `The main window load promise failed: ${describeUnknown(error)}`,
      });
    },
    dispose,
  };
}
