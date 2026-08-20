import { JobFinderShell } from "@renderer/features/job-finder/components/job-finder-shell";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Button } from "@renderer/components/ui/button";
import { useModalFocusTrap } from "@renderer/features/job-finder/components/profile/use-modal-focus-trap";
import { X } from "lucide-react";
import { Suspense, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  preloadJobFinderPriorityScreens,
  WorkspaceStateScreen,
} from "./job-finder-page-routes";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import {
  type ApplyCopilotVisualCheckpointRequest,
  useJobFinderPageController,
} from "./use-job-finder-page-controller";

export {
  JobFinderActionsRoute,
  JobFinderAnalyticsRoute,
  JobFinderApplicationsRoute,
  JobFinderCampaignsRoute,
  JobFinderCompaniesRoute,
  JobFinderCompanyDetailRoute,
  JobFinderDiscoveryRoute,
  JobFinderHomeRoute,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
  JobFinderResumeStrategiesRoute,
  JobFinderRouteErrorBoundary,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSafeguardsRoute,
  JobFinderSettingsRoute,
} from "./job-finder-page-routes";
export type { JobFinderPageContext } from "./job-finder-page-context";

function markJobFinderTiming(markName: string, startMarkName?: string) {
  const performanceApi = globalThis.performance;
  if (!performanceApi?.mark) {
    return;
  }

  performanceApi.mark(markName);
  if (startMarkName && performanceApi.measure) {
    try {
      performanceApi.measure(markName, startMarkName, markName);
    } catch {
      // Performance diagnostics must never affect rendering or navigation.
    }
  }
}

function measureFromLatestJobFinderMark(
  measureName: string,
  startMarkName: string,
  endMarkName: string,
) {
  const performanceApi = globalThis.performance;
  if (!performanceApi?.getEntriesByName || !performanceApi.measure) {
    return;
  }

  const starts = performanceApi.getEntriesByName(startMarkName);
  const ends = performanceApi.getEntriesByName(endMarkName);
  const start = starts.at(-1);
  const end = ends.at(-1);
  if (!start || !end) {
    return;
  }

  try {
    performanceApi.measure(measureName, {
      start: start.startTime,
      end: end.startTime,
    });
  } catch {
    // Performance diagnostics must never affect rendering or navigation.
  }
}

function scheduleJobFinderPriorityPreload(onRun: () => void) {
  let cancelled = false;
  // Let the initial workspace state paint once, then start the shared route imports.
  // Waiting for an idle period leaves the first Profile visit racing the
  // network during hydration, while a zero-delay task keeps import startup
  // off the shell's commit task without deferring it past that window.
  const timer = window.setTimeout(() => {
    if (!cancelled) {
      onRun();
    }
  }, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

function JobFinderRouteReadyMarker() {
  const location = useLocation();

  useEffect(() => {
    const routePath = location.pathname;
    const routeMark = `job-finder:route:${routePath}:meaningful-paint`;
    markJobFinderTiming(
      routeMark,
      `job-finder:route:${routePath}:navigation-start`,
    );
  }, [location.pathname]);

  return null;
}

const openingShellDestinations = [
  { label: "Home", path: "/job-finder/home" },
  { label: "Profile", path: "/job-finder/profile" },
  { label: "Find jobs", path: "/job-finder/discovery" },
  { label: "Shortlisted", path: "/job-finder/review-queue" },
  { label: "Applications", path: "/job-finder/applications" },
] as const;

function JobFinderOpeningShell() {
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    markJobFinderTiming("job-finder:opening-shell:committed");
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col bg-canvas text-foreground"
      data-job-finder-shell
    >
      <header className="border-b border-border-subtle bg-surface px-4 py-3 shadow-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0 shrink-0">
            <p className="text-(length:--text-tiny) uppercase tracking-[0.2em] text-foreground-muted">
              UnEmployed
            </p>
            <p className="font-display font-semibold text-(--text-headline)">
              Job Finder
            </p>
          </div>
          <nav
            aria-label="Job Finder sections"
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
          >
            {openingShellDestinations.map((destination) => (
              <Button
                aria-current={
                  location.pathname === destination.path ? "page" : undefined
                }
                className="shrink-0"
                key={destination.path}
                onClick={() => {
                  void navigate(destination.path);
                }}
                size="sm"
                type="button"
                variant={
                  location.pathname === destination.path
                    ? "secondary"
                    : "ghost"
                }
              >
                {destination.label}
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <WorkspaceStateScreen
        kicker="Job Finder"
        message="Opening your saved workspace. You can choose a section while your data loads."
        title="Loading Job Finder"
      />
    </div>
  );
}

function ApplyCopilotVisualCheckpointDialog(props: {
  onClose: () => void;
  onResolve: (visualCheckpointsEnabled: boolean) => void;
  request: ApplyCopilotVisualCheckpointRequest | null;
}) {
  const dialogTitleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const open = props.request !== null;
  useModalFocusTrap(open, dialogRef, props.onClose);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="surface-panel-shell grid w-full max-w-lg gap-5 rounded-(--radius-field) border border-(--surface-panel-border) p-5 shadow-(--modal-shadow)"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Apply copilot
            </p>
            <h2
              className="text-(length:--text-section-title) font-semibold text-(--text-headline)"
              id={dialogTitleId}
            >
              Enable visual checkpoints?
            </h2>
          </div>
          <Button
            aria-label="Close"
            className="size-9"
            onClick={props.onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <p
          className="text-(length:--text-item) leading-6 text-foreground-soft"
          id={descriptionId}
        >
          Optional visual checkpoints analyze temporary screenshots of the
          application page to help classify visible blockers. Screenshots are
          sensitive and temporary by default.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => props.onResolve(false)}
            type="button"
            variant="secondary"
          >
            Continue without
          </Button>
          <Button onClick={() => props.onResolve(true)} type="button">
            Enable checkpoints
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function JobFinderPage() {
  const location = useLocation();
  const shellMarkedRef = useRef(false);
  const priorityPreloadStartedRef = useRef(false);
  const {
    appearanceTheme,
    applyCopilotVisualCheckpointRequest,
    cancelApplyCopilotVisualCheckpointRequest,
    context,
    dismissSavedStatus,
    navigateFromShell,
    platform,
    retryLastSave,
    saveState,
    resolveApplyCopilotVisualCheckpointRequest,
    workspace,
    workspaceState,
  } = useJobFinderPageController();

  useEffect(() => {
    if (!context || shellMarkedRef.current) {
      return;
    }

    shellMarkedRef.current = true;
    markJobFinderTiming("job-finder:shell:mounted");
    measureFromLatestJobFinderMark(
      "job-finder:shell:time",
      "job-finder:workspace:bootstrap:ready",
      "job-finder:shell:mounted",
    );
  }, [context]);

  useEffect(() => {
    if (priorityPreloadStartedRef.current) {
      return;
    }

    let cancelled = false;
    const cancelScheduledPreload = scheduleJobFinderPriorityPreload(() => {
      if (cancelled) {
        return;
      }
      priorityPreloadStartedRef.current = true;
      preloadJobFinderPriorityScreens();
    });

    return () => {
      cancelled = true;
      cancelScheduledPreload();
    };
  }, []);

  useEffect(() => {
    // The marker is a post-commit signal for direct hash changes and older
    // preload builds that do not expose bootstrap timing marks.
    if (!context) {
      return;
    }
    markJobFinderTiming(`job-finder:route:${location.pathname}:committed`);
  }, [context, location.pathname]);

  if (!context || !workspace || !platform) {
    if (workspaceState.status === "loading") {
      return <JobFinderOpeningShell />;
    }

    return (
      <WorkspaceStateScreen
        {...(workspaceState.status === "error"
          ? {
              action: {
                label: "Retry opening Job Finder",
                onClick: workspaceState.retry,
              },
            }
          : {})}
        kicker="Workspace error"
        message={
          workspaceState.status === "error"
            ? workspaceState.message
            : "Job Finder couldn't load."
        }
        title="Couldn't open Job Finder"
        tone="error"
      />
    );
  }

  return (
    <ThemeProvider preference={appearanceTheme || "system"}>
      <JobFinderShell
        isDiscoveryPending={context.isAnyPending([
          jobFinderPendingActions.discoveryAll(),
          ...workspace.searchPreferences.discovery.targets.map((target) =>
            jobFinderPendingActions.discoveryTarget(target.id),
          ),
        ])}
        isResumeImportPending={context.isPending(
          jobFinderPendingActions.profileImport(),
        )}
        liveDiscoveryEvents={context.liveDiscoveryEvents}
        onCancelApplyRun={context.onCancelApplyRun}
        onCancelDiscovery={() =>
          window.unemployed.jobFinder.cancelAgentDiscovery()
        }
        onDismissSavedStatus={dismissSavedStatus}
        onNavigate={navigateFromShell}
        onRetrySave={retryLastSave}
        platform={platform}
        resumeImportProgress={context.resumeImportProgress}
        saveState={saveState}
        workspace={workspace}
      >
        <Suspense
          fallback={
            <WorkspaceStateScreen
              kicker="Job Finder"
              message="We’re opening this workspace surface."
              title="Loading screen"
            />
          }
        >
          <Outlet context={context} />
          <JobFinderRouteReadyMarker />
        </Suspense>
      </JobFinderShell>
      <ApplyCopilotVisualCheckpointDialog
        onClose={cancelApplyCopilotVisualCheckpointRequest}
        onResolve={resolveApplyCopilotVisualCheckpointRequest}
        request={applyCopilotVisualCheckpointRequest}
      />
    </ThemeProvider>
  );
}
