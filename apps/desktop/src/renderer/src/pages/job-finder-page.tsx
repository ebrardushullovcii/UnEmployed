import { JobFinderShell } from "@renderer/features/job-finder/components/job-finder-shell";
import { StartupDatabaseRecoveryNotice } from "@renderer/features/job-finder/components/startup-database-recovery-notice";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Button } from "@renderer/components/ui/button";
import { useModalFocusTrap } from "@renderer/features/job-finder/components/profile/use-modal-focus-trap";
import { X } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { buildJobFinderStartupDatabaseRecoveryBlockedDetail } from "../../../shared/job-finder-startup-db-recovery";
import { WorkspaceStateScreen } from "./job-finder-page-routes";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { JobFinderUnsavedChangesDialog } from "./job-finder-unsaved-changes-dialog";
import { JobFinderWindowCloseGuard } from "./job-finder-window-close-guard";
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
  JobFinderDocumentsRoute,
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

/**
 * Exactly one window-close responder stays mounted across every render state
 * of this page (loading, both post-ready error branches, loaded shell). It is
 * always the stable first child of the returned tree, so React preserves its
 * subscription and any parked close dialog across branch switches instead of
 * tearing the handshake down mid-decision.
 */
function withJobFinderWindowCloseGuard(content: ReactNode): ReactNode {
  return (
    <>
      <JobFinderWindowCloseGuard />
      {content}
    </>
  );
}

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
                  location.pathname === destination.path ? "secondary" : "ghost"
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

/**
 * Per-run consent gate for optional visual checkpoints during Apply Copilot
 * preparation. Consent must stay voluntary and explicit: the privacy-preserving
 * action ("Continue without") renders as the primary, initially focused control
 * and owns the first position in the dialog's tab order, while enabling page
 * screenshot sharing remains an explicit secondary opt-in. Escape, the scrim,
 * and the header X all resolve through onClose, which cancels the request, so
 * dismissing this dialog can never enable sharing. Copy states the sensitivity
 * plainly without confirm-shaming.
 */
export function ApplyCopilotVisualCheckpointDialog(props: {
  onClose: () => void;
  onResolve: (visualCheckpointsEnabled: boolean) => void;
  request: ApplyCopilotVisualCheckpointRequest | null;
}) {
  const dialogTitleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const continueWithoutRef = useRef<HTMLButtonElement | null>(null);
  const open = props.request !== null;
  useModalFocusTrap(open, dialogRef, props.onClose);

  // Declared after the shared trap so it runs second on open: the safe,
  // privacy-preserving action receives initial focus instead of the header X
  // (the same safe-default convention as the unsaved-changes and campaign
  // dialogs), so a stray Enter lands on "Continue without", never on enabling.
  useEffect(() => {
    if (!open) {
      return;
    }
    continueWithoutRef.current?.focus();
  }, [open]);

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
              Prepare application
            </p>
            <h2
              className="text-(length:--text-section-title) font-semibold text-(--text-headline)"
              id={dialogTitleId}
            >
              Use visual checkpoints?
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
          Optional visual checkpoints use temporary screenshots of the
          application page to identify visible blockers. Choose whether to share
          this sensitive page data for preparation. Job Finder cannot submit the
          application.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {/* Sharing page screenshots is the sensitive outcome, so the
              privacy-preserving choice stays visually primary, first in the
              row, and initially focused; enabling remains an explicit
              secondary opt-in. */}
          <Button
            onClick={() => props.onResolve(false)}
            ref={continueWithoutRef}
            type="button"
          >
            Continue without
          </Button>
          <Button
            onClick={() => props.onResolve(true)}
            type="button"
            variant="secondary"
          >
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
  const {
    appearanceTheme,
    applyCopilotVisualCheckpointRequest,
    cancelApplyCopilotVisualCheckpointRequest,
    context,
    dismissSavedStatus,
    navigateFromShell,
    platform,
    resolveResumeWorkspaceLeaveRequest,
    resolveUnsavedChangesLeave,
    resolveUnsavedChangesStay,
    retryLastSave,
    resumeWorkspaceLeaveConfirmation,
    saveState,
    resolveApplyCopilotVisualCheckpointRequest,
    unsavedChangesConfirmation,
    workspace,
    workspaceState,
  } = useJobFinderPageController();

  // One shared closure for both consumers of the existing fenced
  // cancellation request: the shell Task Center and the Discovery route's
  // header stop action. No new IPC or controller action is introduced.
  const cancelDiscovery = useCallback(() => {
    window.unemployed.jobFinder.cancelAgentDiscovery();
  }, []);
  // The route context gains only this optional member; memoized on the same
  // inputs so outlet consumers keep the controller's context identity.
  const routeContext = useMemo(
    () =>
      context
        ? { ...context, onCancelDiscovery: cancelDiscovery }
        : context,
    [cancelDiscovery, context],
  );

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
    // The marker is a post-commit signal for direct hash changes and older
    // preload builds that do not expose bootstrap timing marks.
    if (!context) {
      return;
    }
    markJobFinderTiming(`job-finder:route:${location.pathname}:committed`);
  }, [context, location.pathname]);

  if (!context || !workspace || !platform) {
    if (workspaceState.status === "loading") {
      return withJobFinderWindowCloseGuard(<JobFinderOpeningShell />);
    }

    if (
      workspaceState.status === "error" &&
      workspaceState.startupDatabaseRecovery
    ) {
      // A typed recovery incident blocks the workspace on purpose: no retry
      // action is offered because retrying would re-run recovery without any
      // new information and every retained file stays untouched.
      return withJobFinderWindowCloseGuard(
        <WorkspaceStateScreen
          kicker="Workspace error"
          message={buildJobFinderStartupDatabaseRecoveryBlockedDetail({
            incidentId: workspaceState.startupDatabaseRecovery.incidentId,
            outcome: workspaceState.startupDatabaseRecovery.outcome,
          })}
          title="Couldn't open Job Finder"
          tone="error"
        />,
      );
    }

    return withJobFinderWindowCloseGuard(
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
      />,
    );
  }

  return withJobFinderWindowCloseGuard(
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
        onCancelApplyRun={(runId) => {
          const assignedResults = workspace.applyJobResults.filter(
            (result) =>
              result.runId === runId && result.applicationRecordId !== null,
          );
          if (assignedResults.length !== 1) {
            return Promise.resolve(false);
          }
          const result = assignedResults[0];
          if (!result?.applicationRecordId) {
            return Promise.resolve(false);
          }
          return context.onCancelApplyRun({
            runId,
            jobId: result.jobId,
            applicationRecordId: result.applicationRecordId,
          });
        }}
        onCancelDiscovery={cancelDiscovery}
        onDismissSavedStatus={dismissSavedStatus}
        onNavigate={navigateFromShell}
        onRetrySave={retryLastSave}
        onStopTailoredDraftPreparation={context.onStopTailoredDraftPreparation}
        platform={platform}
        resumeImportProgress={context.resumeImportProgress}
        saveState={saveState}
        tailoredDraftPreparation={context.tailoredDraftPreparation}
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
          <Outlet context={routeContext} />
          <JobFinderRouteReadyMarker />
        </Suspense>
      </JobFinderShell>
      <ApplyCopilotVisualCheckpointDialog
        onClose={cancelApplyCopilotVisualCheckpointRequest}
        onResolve={resolveApplyCopilotVisualCheckpointRequest}
        request={applyCopilotVisualCheckpointRequest}
      />
      <JobFinderUnsavedChangesDialog
        confirmation={unsavedChangesConfirmation}
        onLeaveWithoutSaving={resolveUnsavedChangesLeave}
        onStay={resolveUnsavedChangesStay}
      />
      {/* Same branded dialog, second parked decision: actions that leave
          dirty Resume Studio work ask it through the controller's async
          request instead of a native window.confirm. */}
      <JobFinderUnsavedChangesDialog
        confirmation={resumeWorkspaceLeaveConfirmation}
        onLeaveWithoutSaving={() => resolveResumeWorkspaceLeaveRequest(true)}
        onStay={() => resolveResumeWorkspaceLeaveRequest(false)}
      />
      {/* The window-close responder is mounted once by
          withJobFinderWindowCloseGuard above this tree so it also answers on
          loading and error screens. */}
      <StartupDatabaseRecoveryNotice />
    </ThemeProvider>,
  );
}
