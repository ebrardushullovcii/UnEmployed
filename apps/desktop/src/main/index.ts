import { app, BrowserWindow, Menu, ipcMain, powerMonitor } from "electron";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDesktopEnvironment } from "./setup/env";
import { configureInterviewMediaPermissions } from "./setup/interview-media-permissions";
import { areAdvancedInterviewSurfacesEnabled } from "./setup/interview-surface-mode";
import { registerCoreDesktopRoutes } from "./setup/register-core-routes";
import {
  configureDesktopUserDataDirectory,
  getDesktopStartupDiagnosticsPath,
} from "./setup/user-data-directory";
import { createMainWindow } from "./setup/window-shell";
import { runShutdownWithTimeout } from "./setup/shutdown-with-timeout";
import type * as InterviewOverlayApi from "./setup/interview-overlay-windows";
import type * as InterviewSessionControlsApi from "./setup/interview-session-controls";
import type * as CandidateAssetLibraryApi from "./services/job-finder/candidate-asset-library-instance";
import type { CampaignScheduler } from "./services/job-finder/campaign-scheduler";
import type * as CampaignSchedulerApi from "./services/job-finder/campaign-scheduler";
import type * as JobFinderServicesApi from "./services/job-finder";
import type * as InterviewHelperApi from "./services/interview-helper";

loadDesktopEnvironment();
configureDesktopUserDataDirectory(app);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
const startupDiagnosticsPath = getDesktopStartupDiagnosticsPath();

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

type JobFinderServices = typeof JobFinderServicesApi;
type CampaignSchedulerModule = typeof CampaignSchedulerApi;
type CandidateAssetLibraryModule = typeof CandidateAssetLibraryApi;
type InterviewHelperModule = typeof InterviewHelperApi;
type InterviewOverlayModule = typeof InterviewOverlayApi;
type InterviewSessionControlsModule = typeof InterviewSessionControlsApi;

let jobFinderServicesPromise: Promise<JobFinderServices> | null = null;
let campaignSchedulerModulePromise: Promise<CampaignSchedulerModule> | null = null;
let candidateAssetLibraryModulePromise: Promise<CandidateAssetLibraryModule> | null = null;
let interviewHelperModulePromise: Promise<InterviewHelperModule> | null = null;
let interviewOverlayModulePromise: Promise<InterviewOverlayModule> | null = null;
let interviewSessionControlsModulePromise: Promise<InterviewSessionControlsModule> | null = null;

function loadJobFinderServices() {
  jobFinderServicesPromise ??= import("./services/job-finder");
  return jobFinderServicesPromise;
}

function loadCampaignSchedulerModule() {
  campaignSchedulerModulePromise ??= import(
    "./services/job-finder/campaign-scheduler"
  );
  return campaignSchedulerModulePromise;
}

function loadCandidateAssetLibraryModule() {
  candidateAssetLibraryModulePromise ??= import(
    "./services/job-finder/candidate-asset-library-instance"
  );
  return candidateAssetLibraryModulePromise;
}

function loadInterviewHelperModule() {
  interviewHelperModulePromise ??= import("./services/interview-helper");
  return interviewHelperModulePromise;
}

function loadInterviewOverlayModule() {
  interviewOverlayModulePromise ??= import(
    "./setup/interview-overlay-windows"
  );
  return interviewOverlayModulePromise;
}

function loadInterviewSessionControlsModule() {
  interviewSessionControlsModulePromise ??= import(
    "./setup/interview-session-controls"
  );
  return interviewSessionControlsModulePromise;
}

let closeInterviewOverlayWindows = () => {};
let disposeInterviewSessionControls = () => {};

function loadJobFinderRoutes(): Promise<void> {
  return import("./setup/register-job-finder-routes").then(
    ({ registerJobFinderDesktopRoutes }) => {
      registerJobFinderDesktopRoutes(ipcMain);
      recordStartupDiagnostic("Job Finder routes registered");
    },
  );
}

function loadJobFinderBootstrapRoutes(): Promise<void> {
  return import("./setup/register-job-finder-bootstrap-routes").then(
    ({ registerJobFinderBootstrapDesktopRoutes }) => {
      registerJobFinderBootstrapDesktopRoutes(ipcMain);
      recordStartupDiagnostic("Job Finder bootstrap routes registered");
    },
  );
}

function loadJobFinderAssetRoutes(): Promise<void> {
  return import("./setup/register-job-finder-asset-routes").then(
    ({ registerJobFinderAssetDesktopRoutes }) => {
      registerJobFinderAssetDesktopRoutes(ipcMain);
      recordStartupDiagnostic("Job Finder asset routes registered");
    },
  );
}

function loadInterviewHelperRoutes(): Promise<void> {
  return import("./setup/register-interview-helper-routes").then(
    ({ registerInterviewHelperDesktopRoutes }) => {
      registerInterviewHelperDesktopRoutes(ipcMain);
      recordStartupDiagnostic("Interview Helper routes registered");
    },
  );
}

function createMainWindowSafely(): BrowserWindow | null {
  try {
    return createMainWindow(currentDir);
  } catch (error) {
    recordStartupDiagnostic("main window creation failed", error);
    console.error("[Desktop] Failed to create the main window.", error);
    app.quit();
    return null;
  }
}

// Keep the large feature-route graph off Electron's critical path to the first
// window. The core IPC surface is registered synchronously; the preload bridge
// waits on the readiness channel before invoking any deferred feature route.
// Loading begins on the first feature call, after the renderer has had an
// opportunity to paint its honest loading state, without exposing an IPC race.
let jobFinderBootstrapRoutesPromise: Promise<void> | null = null;
let jobFinderRoutesPromise: Promise<void> | null = null;
let jobFinderAssetRoutesPromise: Promise<void> | null = null;
let interviewHelperRoutesPromise: Promise<void> | null = null;

function ensureJobFinderBootstrapRoutesReady(): Promise<void> {
  jobFinderBootstrapRoutesPromise ??= hasSingleInstanceLock
    ? loadJobFinderBootstrapRoutes()
    : Promise.resolve();
  return jobFinderBootstrapRoutesPromise;
}

function ensureJobFinderRoutesReady(): Promise<void> {
  jobFinderRoutesPromise ??= hasSingleInstanceLock
    ? loadJobFinderRoutes()
    : Promise.resolve();
  return jobFinderRoutesPromise;
}

function ensureJobFinderAssetRoutesReady(): Promise<void> {
  jobFinderAssetRoutesPromise ??= hasSingleInstanceLock
    ? loadJobFinderAssetRoutes()
    : Promise.resolve();
  return jobFinderAssetRoutesPromise;
}

function ensureInterviewHelperRoutesReady(): Promise<void> {
  interviewHelperRoutesPromise ??= hasSingleInstanceLock
    ? loadInterviewHelperRoutes()
    : Promise.resolve();
  return interviewHelperRoutesPromise;
}

if (hasSingleInstanceLock) {
  registerCoreDesktopRoutes(
    ipcMain,
    ensureJobFinderBootstrapRoutesReady,
    ensureJobFinderRoutesReady,
    ensureJobFinderAssetRoutesReady,
    ensureInterviewHelperRoutesReady,
  );
}

recordStartupDiagnostic("main module loaded");
if (!hasSingleInstanceLock) {
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
    const mainWindow = createMainWindowSafely();
    if (!mainWindow) {
      return;
    }
    recordStartupDiagnostic("main window created");
    const backgroundInitializationTimer = setTimeout(() => {
      recordStartupDiagnostic("starting background services");
      void loadJobFinderServices()
        .then(async ({ getJobFinderWorkspaceService }) => {
          await getJobFinderWorkspaceService();
          const { createCampaignScheduler } =
            await loadCampaignSchedulerModule();
          startCampaignScheduler(createCampaignScheduler);
        })
        .catch((error) => {
          console.error(
            "[Desktop] Failed to initialize Job Finder workspace service.",
            error,
          );
        });
      void loadCandidateAssetLibraryModule()
        .then(({ getCandidateAssetLibrary }) =>
          getCandidateAssetLibrary().enforceLifecycle(),
        )
        .catch((error) => {
          console.error(
            "[Desktop] Failed to enforce Candidate Asset retention.",
            error,
          );
        });
      void loadInterviewHelperModule()
        .then(({ getInterviewHelperService }) => getInterviewHelperService())
        .catch((error) => {
          console.error(
            "[Desktop] Failed to initialize Interview Helper service.",
            error,
          );
        });

      if (advancedInterviewSurfacesEnabled) {
        void Promise.all([
          loadInterviewOverlayModule(),
          loadInterviewSessionControlsModule(),
        ])
          .then(([overlay, sessionControls]) => {
            closeInterviewOverlayWindows = overlay.closeInterviewOverlayWindows;
            disposeInterviewSessionControls =
              sessionControls.disposeInterviewSessionControls;
            overlay.initializeInterviewOverlayWindows(currentDir);
            sessionControls.initializeInterviewSessionControls();
          })
          .catch((error) => {
            console.error(
              "[Desktop] Failed to initialize advanced interview surfaces.",
              error,
            );
          });
      }
    }, 500);
    mainWindow.on("closed", () => {
      clearTimeout(backgroundInitializationTimer);
      closeInterviewOverlayWindows();
    });

    configureInterviewMediaPermissions();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindowSafely();
      }
    });
  })
  .catch((error) => {
    recordStartupDiagnostic("startup failed", error);
    console.error(
      "[Desktop] Startup failed before the main window was ready.",
      error,
    );
    app.quit();
  });

let jobFinderShutdownInFlight = false;

let campaignScheduler: CampaignScheduler | null = null;
const onPowerSuspend = () => campaignScheduler?.suspend();
const onPowerResume = () => campaignScheduler?.resume();

function startCampaignScheduler(
  createScheduler: CampaignSchedulerModule["createCampaignScheduler"],
): void {
  if (campaignScheduler) {
    return;
  }
  campaignScheduler = createScheduler();
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

async function shutdownJobFinderServicesIfLoaded(): Promise<void> {
  if (!jobFinderServicesPromise) {
    return;
  }

  const { shutdownJobFinderWorkspaceService } = await jobFinderServicesPromise;
  await shutdownJobFinderWorkspaceService();
}

async function shutdownInterviewHelperIfLoaded(): Promise<void> {
  if (!interviewHelperModulePromise) {
    return;
  }

  const { shutdownInterviewHelperService } = await interviewHelperModulePromise;
  await shutdownInterviewHelperService();
}

app.on("before-quit", (event) => {
  if (jobFinderShutdownInFlight) {
    return;
  }

  jobFinderShutdownInFlight = true;
  event.preventDefault();
  void runShutdownWithTimeout(
    () =>
      Promise.all([
        stopCampaignScheduler().then(shutdownJobFinderServicesIfLoaded),
        shutdownInterviewHelperIfLoaded(),
      ]).then(() => undefined),
    jobFinderShutdownTimeoutMs,
    () => {
      console.warn(
        `[Desktop] Desktop service shutdown exceeded ${jobFinderShutdownTimeoutMs}ms; continuing quit.`,
      );
    },
  ).then((result) => {
    if (result.status === "failed") {
      console.warn(
        "[Desktop] Failed to shut down Job Finder workspace service before quit.",
        result.error,
      );
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
