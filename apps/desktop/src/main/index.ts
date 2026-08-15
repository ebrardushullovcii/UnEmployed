import { app, BrowserWindow, Menu, ipcMain, powerMonitor } from "electron";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDesktopEnvironment } from "./setup/env";
import { registerDesktopRoutes } from "./setup/register-routes";
import {
  closeInterviewOverlayWindows,
  initializeInterviewOverlayWindows,
} from "./setup/interview-overlay-windows";
import { configureInterviewMediaPermissions } from "./setup/interview-media-permissions";
import {
  disposeInterviewSessionControls,
  initializeInterviewSessionControls,
} from "./setup/interview-session-controls";
import { areAdvancedInterviewSurfacesEnabled } from "./setup/interview-surface-mode";
import { configureDesktopUserDataDirectory } from "./setup/user-data-directory";
import { createMainWindow } from "./setup/window-shell";
import {
  getJobFinderWorkspaceService,
  shutdownJobFinderWorkspaceService,
} from "./services/job-finder";
import {
  createCampaignScheduler,
  type CampaignScheduler,
} from "./services/job-finder/campaign-scheduler";
import { getCandidateAssetLibrary } from "./services/job-finder/candidate-asset-library-instance";
import {
  getInterviewHelperService,
  shutdownInterviewHelperService,
} from "./services/interview-helper";

loadDesktopEnvironment();
configureDesktopUserDataDirectory(app);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const startupDiagnosticsPath = process.env.UNEMPLOYED_USER_DATA_DIR?.trim()
  ? path.join(process.env.UNEMPLOYED_USER_DATA_DIR, "startup-diagnostics.log")
  : null;

function recordStartupDiagnostic(message: string, error?: unknown) {
  if (!startupDiagnosticsPath || process.env.ELECTRON_ENABLE_LOGGING !== "1") {
    return;
  }

  try {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : "";
    appendFileSync(
      startupDiagnosticsPath,
      `${new Date().toISOString()} ${message} ${detail}\n`,
      "utf8",
    );
  } catch {
    // Startup diagnostics must never prevent the app from opening.
  }
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const jobFinderShutdownTimeoutMs = 15_000;
const advancedInterviewSurfacesEnabled = areAdvancedInterviewSurfacesEnabled();

recordStartupDiagnostic("main module loaded");
if (hasSingleInstanceLock) {
  registerDesktopRoutes(ipcMain);
  recordStartupDiagnostic("desktop routes registered");
} else {
  recordStartupDiagnostic("secondary app instance exiting");
  app.quit();
}

app.on("second-instance", () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (!existingWindow) {
    return;
  }

  if (existingWindow.isMinimized()) {
    existingWindow.restore();
  }
  existingWindow.show();
  existingWindow.focus();
});

void app
  .whenReady()
  .then(() => {
    if (!hasSingleInstanceLock) {
      return;
    }
    recordStartupDiagnostic("app ready");
    Menu.setApplicationMenu(null);
    recordStartupDiagnostic("creating main window");
    const mainWindow = createMainWindow(currentDir);
    recordStartupDiagnostic("main window created");
    mainWindow.on("closed", () => {
      closeInterviewOverlayWindows();
    });

    configureInterviewMediaPermissions();

    void Promise.resolve()
      .then(async () => {
        await getJobFinderWorkspaceService();
        startCampaignScheduler();
      })
      .catch((error) => {
        console.error(
          "[Desktop] Failed to initialize Job Finder workspace service.",
          error,
        );
      });
    void getCandidateAssetLibrary()
      .enforceLifecycle()
      .catch((error) => {
        console.error(
          "[Desktop] Failed to enforce Candidate Asset retention.",
          error,
        );
      });
    void Promise.resolve()
      .then(() => getInterviewHelperService())
      .catch((error) => {
        console.error(
          "[Desktop] Failed to initialize Interview Helper service.",
          error,
        );
      });

    if (advancedInterviewSurfacesEnabled) {
      try {
        initializeInterviewOverlayWindows(currentDir);
        initializeInterviewSessionControls();
      } catch (error) {
        console.error(
          "[Desktop] Failed to initialize advanced interview surfaces.",
          error,
        );
      }
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(currentDir);
      }
    });
  })
  .catch((error) => {
    recordStartupDiagnostic("startup failed", error);
    console.error(
      "[Desktop] Startup failed before the main window was ready.",
      error,
    );
  });

let jobFinderShutdownInFlight = false;

let campaignScheduler: CampaignScheduler | null = null;
const onPowerSuspend = () => campaignScheduler?.suspend();
const onPowerResume = () => campaignScheduler?.resume();

function startCampaignScheduler(): void {
  if (campaignScheduler) {
    return;
  }
  campaignScheduler = createCampaignScheduler();
  powerMonitor.on("suspend", onPowerSuspend);
  powerMonitor.on("resume", onPowerResume);
  campaignScheduler.start();
}

async function stopCampaignScheduler(): Promise<void> {
  const scheduler = campaignScheduler;
  campaignScheduler = null;
  if (!scheduler) {
    return;
  }
  powerMonitor.removeListener("suspend", onPowerSuspend);
  powerMonitor.removeListener("resume", onPowerResume);
  await scheduler.stop();
}

app.on("before-quit", (event) => {
  if (jobFinderShutdownInFlight) {
    return;
  }

  jobFinderShutdownInFlight = true;
  event.preventDefault();
  let shutdownTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const shutdownTimeout = new Promise<void>((resolve) => {
    shutdownTimeoutId = setTimeout(() => {
      console.warn(
        `[Desktop] Job Finder workspace service shutdown exceeded ${jobFinderShutdownTimeoutMs}ms; continuing quit.`,
      );
      resolve();
    }, jobFinderShutdownTimeoutMs);
  });
  void Promise.race([
    Promise.all([
      stopCampaignScheduler().then(() => shutdownJobFinderWorkspaceService()),
      shutdownInterviewHelperService(),
    ]).then(() => undefined),
    shutdownTimeout,
  ])
    .catch((error) => {
      console.warn(
        "[Desktop] Failed to shut down Job Finder workspace service before quit.",
        error,
      );
    })
    .finally(() => {
      if (shutdownTimeoutId) {
        clearTimeout(shutdownTimeoutId);
      }
      app.quit();
    });
});

app.on("window-all-closed", () => {
  closeInterviewOverlayWindows();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  disposeInterviewSessionControls();
});
