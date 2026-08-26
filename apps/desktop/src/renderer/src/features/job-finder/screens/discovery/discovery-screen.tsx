import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  BrowserSessionState,
  CompanyEntity,
  DiscoveryAdapterSessionState,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  EmployerExclusionPreview,
  DiscoveryRunRecord,
  JobSearchPreferences,
  SourceAccessPrompt,
  SavedJob,
} from "@unemployed/contracts";
import { PauseCircle, Play } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import {
  DISCOVERY_PAUSED_SEARCH_REASON,
} from "./discovery-search-readiness";
import { LockedScreenLayout } from "@renderer/features/job-finder/components/locked-screen-layout";
import {
  PageHeaderStack,
  PageSubnav,
} from "@renderer/features/job-finder/components/page-header";
import { JOB_FINDER_ROUTE_PATHS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import { formatCountLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { DiscoveryHistoryModal } from "./discovery-activity-panel";
import { DiscoveryDetailPanel } from "./discovery-detail-panel";
import { DiscoveryFiltersPanel } from "./discovery-filters-panel";
import { DiscoveryResultsPanel } from "./discovery-results-panel";
import { DiscoveryRunFeedbackCallout } from "./discovery-run-feedback-callout";
import {
  getDiscoveryLatestRunVerdict,
  type DiscoveryRunFeedback,
} from "./discovery-run-feedback";
import { compareDiscoveryFitOrder } from "./discovery-results-sort";
import { getDiscoverySearchReadiness } from "./discovery-search-readiness";
import type { JobFinderQueuedJobOutcome } from "@renderer/features/job-finder/lib/job-finder-types";

export function getDiscoveryConfiguredFilters(
  searchPreferences: JobSearchPreferences,
) {
  const enabledSourceCount =
    getDiscoverySearchReadiness(searchPreferences).enabledSourceCount;
  const searchTargetCount =
    searchPreferences.targetRoles.length + searchPreferences.jobFamilies.length;

  return [
    searchTargetCount > 0
      ? formatCountLabel(searchTargetCount, "search target")
      : "Profile-inferred search",
    formatCountLabel(searchPreferences.locations.length, "location"),
    formatCountLabel(searchPreferences.workModes.length, "work mode"),
    formatCountLabel(enabledSourceCount, "enabled source"),
  ];
}
export function getDiscoveryResultVisibility(
  jobs: readonly SavedJob[],
  selectedJob: SavedJob | null,
  showClearMismatches: boolean,
  preserveSelectedJob = false,
): {
  hiddenMismatchCount: number;
  jobs: readonly SavedJob[];
  mismatchCount: number;
  selectedJob: SavedJob | null;
} {
  const clearMismatches = jobs.filter(
    (job) => job.matchAssessment.recommendation === "skip",
  );
  // A deep-linked selection keeps only that job visible even when it is a
  // clear mismatch; other mismatches stay hidden so the preserve path never
  // silently reveals the whole mismatch set.
  const displayCandidates = showClearMismatches
    ? jobs
    : jobs.filter(
        (job) =>
          job.matchAssessment.recommendation !== "skip" ||
          (preserveSelectedJob && job.id === selectedJob?.id),
      );
  // Ordering is the canonical Best-match chain (see compareDiscoveryFitOrder),
  // so the visible sequence always equals the rediscovery rank-audit sequence
  // for the same candidate set instead of depending on arrival order.
  const visibleJobs = displayCandidates.slice().sort(compareDiscoveryFitOrder);
  const visibleSelectedJob =
    selectedJob && visibleJobs.some((job) => job.id === selectedJob.id)
      ? selectedJob
      : (visibleJobs[0] ?? null);
  const visibleJobIds = new Set(visibleJobs.map((job) => job.id));

  return {
    // Truthful hidden count: mismatches actually absent from the displayed
    // list, so a deep-linked mismatch held visible counts as shown.
    hiddenMismatchCount: clearMismatches.filter(
      (job) => !visibleJobIds.has(job.id),
    ).length,
    jobs: visibleJobs,
    mismatchCount: clearMismatches.length,
    selectedJob: visibleSelectedJob,
  };
}

/**
 * Resolves the job the inspector should describe. The results panel reports
 * which job it actually displays on the current filtered and paginated page;
 * until the first report arrives (`displayedJobId === undefined`), the
 * pre-existing default-selection behavior applies. An explicit `null` report
 * means the visible page is empty and the inspector must clear rather than
 * keep describing a row the user cannot see.
 */
export function getDiscoveryInspectedJob(
  rankedJobs: readonly SavedJob[],
  requestedJobId: string | null,
  displayedJobId: string | null | undefined,
): SavedJob | null {
  if (displayedJobId === undefined) {
    const requested = requestedJobId
      ? rankedJobs.find((job) => job.id === requestedJobId)
      : undefined;
    return requested ?? rankedJobs[0] ?? null;
  }
  if (displayedJobId === null) {
    return null;
  }
  return rankedJobs.find((job) => job.id === displayedJobId) ?? null;
}

/**
 * Concise, non-color paused state with the nearest Resume action. Rendered
 * above every mode and message so an unrelated failure callout can never
 * mask the pause truth.
 */
export function DiscoveryPausedBanner(props: {
  isResumePending: boolean;
  onResolve?: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) text-foreground"
      data-testid="discovery-paused-banner"
      role="status"
    >
      <PauseCircle aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">Search paused.</strong> Activity is
        paused by you, so new browser work and searches are stopped.
      </span>
      {props.onResolve ? (
        <Button
          disabled={props.isResumePending}
          onClick={props.onResolve}
          pending={props.isResumePending}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Play aria-hidden="true" className="size-4" />
          Resume activity
        </Button>
      ) : null}
    </div>
  );
}

export function DiscoveryScreen(props: {
  actionState: { message: string | null };
  activityPaused?: boolean;
  activeRun: DiscoveryRunRecord | null;
  browserSession: BrowserSessionState;
  companies?: readonly CompanyEntity[];
  discoveryRunFeedback?: DiscoveryRunFeedback | null;
  discoverySessions: readonly DiscoveryAdapterSessionState[];
  isBrowserSessionPending: boolean;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
  isDiscoveryAllPending: boolean;
  isActivityPausePending?: boolean;
  isJobPending: (jobId: string) => boolean;
  isTargetPending: (targetId: string) => boolean;
  jobs: readonly SavedJob[];
  dismissedJobs: readonly SavedJob[];
  liveEvents: readonly DiscoveryActivityEvent[];
  onBackToRapidReview?: () => void;
  /** Cancels the active run through the same fenced request the Task Center uses. */
  onCancelDiscovery?: () => void;
  onResumeActivity?: () => void;
  onDismissJob: (
    jobId: string,
    reasons: readonly DiscoveryFeedbackReason[],
    action?: "hide_job" | "hide_and_exclude_employer",
    expectedNormalizedCompanyName?: string | null,
  ) => void | Promise<void>;
  onPreviewEmployerExclusion?: (
    jobId: string,
  ) => Promise<EmployerExclusionPreview>;
  onRemoveEmployerExclusion?: (input: {
    jobId: string;
    normalizedCompanyName: string;
  }) => void;
  onRestoreDismissedJob: (jobId: string) => void;
  onOpenBrowserSession: () => void;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onOpenCompany?: (companyId: string) => void;
  onQueueJob: (
    jobId: string,
  ) => void | Promise<JobFinderQueuedJobOutcome>;
  onRunAgentDiscovery: (() => void) | undefined;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onSelectJob: (jobId: string) => void;
  recentRuns: readonly DiscoveryRunRecord[];
  searchPreferences: JobSearchPreferences;
  preserveSelectedJob?: boolean;
  selectedJob: SavedJob | null;
  selectedSourceTargetId?: string | null;
  sourceAccessPrompts: readonly SourceAccessPrompt[];
}) {
  const {
    actionState,
    activityPaused = false,
    activeRun,
    browserSession,
    companies,
    discoveryRunFeedback = null,
    discoverySessions,
    isActivityPausePending = false,
    isBrowserSessionPending,
    isBrowserSessionPendingForTarget,
    isDiscoveryAllPending,
    isJobPending,
    isTargetPending,
    jobs,
    dismissedJobs,
    liveEvents,
    onBackToRapidReview,
    onCancelDiscovery,
    onDismissJob,
    onResumeActivity,
    onPreviewEmployerExclusion,
    onRemoveEmployerExclusion,
    onRestoreDismissedJob,
    onOpenBrowserSession,
    onOpenBrowserSessionForTarget,
    onOpenCompany,
    onQueueJob,
    onRunAgentDiscovery,
    onSelectJob,
    recentRuns,
    searchPreferences,
    preserveSelectedJob,
    selectedJob,
    selectedSourceTargetId,
    sourceAccessPrompts,
  } = props;
  const [showHistory, setShowHistory] = useState(false);
  const [showClearMismatches, setShowClearMismatches] = useState(false);
  // What the results panel actually displays on its current filtered and
  // paginated page. Null state means "not reported yet"; an explicit null
  // jobId means the panel is showing no results at all.
  const [displayedSelection, setDisplayedSelection] = useState<{
    jobId: string | null;
  } | null>(null);
  // Results-mode feedback for the Shortlist decision, keyed by the exact
  // clicked job. Each `onQueueJob` call resolves its own awaited outcome, so
  // overlapping shortlists resolving out of order, search completions, and
  // Hide/Restore route messages can never cross-label a row. Route action
  // statuses share one surface above both workspaces (never duplicated in
  // either), so this per-row surface neither duplicates them nor lets a
  // route-level failure adopt another row's attribution.
  const [queueOutcomesByJobId, setQueueOutcomesByJobId] = useState<
    ReadonlyMap<string, JobFinderQueuedJobOutcome>
  >(new Map());
  // Single-shot stop request for the currently running discovery run. The
  // request reuses the same fenced cancellation as the Task Center, so the
  // local flag only keeps the header control from sending duplicates until
  // the run leaves its running state.
  const [isStopSearchRequested, setIsStopSearchRequested] = useState(false);
  const handleQueueJob = useCallback(
    (jobId: string) => {
      // Request-local attribution: each click owns its own resolved outcome,
      // so overlapping shortlists, search completions, and shared route
      // messages can never cross-label another row.
      void Promise.resolve(onQueueJob(jobId))
        .then((outcome) => {
          if (!outcome) {
            return;
          }
          setQueueOutcomesByJobId((current) =>
            new Map(current).set(jobId, outcome),
          );
        })
        .catch(() => {
          setQueueOutcomesByJobId((current) =>
            new Map(current).set(jobId, {
              message: "The requested Job Finder action failed.",
              status: "failure",
            }),
          );
        });
    },
    [onQueueJob],
  );
  const [workspaceMode, setWorkspaceMode] = useState<"results" | "setup">(() =>
    jobs.length === 0 ? "setup" : "results",
  );
  // One-shot reveal: a workspace that opens empty lands on Search setup, and
  // the first arrival of saved results switches to Results exactly once so a
  // first successful search is never hidden behind the setup tab. The flag is
  // latched, so later empty→nonempty transitions stay wherever the user
  // navigated instead of yanking them back.
  const hasRevealedFirstResultsRef = useRef(jobs.length > 0);
  useEffect(() => {
    if (hasRevealedFirstResultsRef.current || jobs.length === 0) {
      return;
    }
    hasRevealedFirstResultsRef.current = true;
    setWorkspaceMode((mode) => (mode === "setup" ? "results" : mode));
  }, [jobs.length]);
  const resultVisibility = useMemo(
    () =>
      getDiscoveryResultVisibility(
        jobs,
        selectedJob,
        showClearMismatches,
        preserveSelectedJob,
      ),
    [jobs, selectedJob, showClearMismatches, preserveSelectedJob],
  );
  const inspectedJob = getDiscoveryInspectedJob(
    resultVisibility.jobs,
    selectedJob?.id ?? null,
    displayedSelection?.jobId,
  );
  // Only the inspected job's own resolved outcome is eligible for display;
  // switching rows drops every other entry so no stale outcome replays later.
  useEffect(() => {
    const inspectedJobId = inspectedJob?.id ?? null;
    setQueueOutcomesByJobId((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Map<string, JobFinderQueuedJobOutcome>();
      for (const [jobId, outcome] of current) {
        if (jobId === inspectedJobId) {
          next.set(jobId, outcome);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [inspectedJob?.id]);
  const inspectedJobQueueFeedback = inspectedJob
    ? (queueOutcomesByJobId.get(inspectedJob.id) ?? null)
    : null;
  const selectedJobCompanyId =
    inspectedJob && (companies ?? []).length > 0
      ? ((companies ?? []).find((company) =>
          company.jobIds.includes(inspectedJob.id),
        )?.id ?? null)
      : null;
  const hiddenJobCount = resultVisibility.hiddenMismatchCount;

  const showEmptyDiscoveryState = jobs.length === 0;
  // Newest-run truth for the results panel's empty states, so a failed or
  // cancelled latest attempt never renders as "no matches" or "first search".
  const latestRunVerdict = useMemo(
    () => getDiscoveryLatestRunVerdict(recentRuns),
    [recentRuns],
  );
  const enabledTargetIds = new Set(
    searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
  );
  const enabledSourceAccessPrompts = sourceAccessPrompts.filter((prompt) =>
    enabledTargetIds.has(prompt.targetId),
  );
  const primarySourceAccessPrompt =
    (selectedSourceTargetId
      ? enabledSourceAccessPrompts.find(
          (prompt) => prompt.targetId === selectedSourceTargetId,
        )
      : null) ??
    enabledSourceAccessPrompts.find(
      (prompt) => prompt.state === "prompt_login_required",
    ) ??
    enabledSourceAccessPrompts[0] ??
    null;
  let primaryRecoveryAction: {
    label: string;
    pending: boolean;
    nextStep: string;
    onAction: () => void;
  } | null = null;
  if (primarySourceAccessPrompt?.state === "prompt_login_required") {
    if (browserSession.status === "ready" && props.onRunDiscoveryForTarget) {
      primaryRecoveryAction = {
        label: `I'm signed in — retry ${primarySourceAccessPrompt.targetLabel}`,
        pending: isTargetPending(primarySourceAccessPrompt.targetId),
        nextStep:
          "Job Finder will check only this source and show the sign-in handoff again if access is still blocked.",
        onAction: () =>
          props.onRunDiscoveryForTarget?.(primarySourceAccessPrompt.targetId),
      };
    } else {
      primaryRecoveryAction = {
        label: primarySourceAccessPrompt.actionLabel,
        pending: isBrowserSessionPendingForTarget(
          primarySourceAccessPrompt.targetId,
        ),
        nextStep:
          "Job Finder will wait while you sign in, then you can confirm and retry only this source.",
        onAction: () =>
          onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId),
      };
    }
  } else if (browserSession.status !== "ready") {
    primaryRecoveryAction = primarySourceAccessPrompt
      ? {
          label: primarySourceAccessPrompt.actionLabel,
          pending: isBrowserSessionPendingForTarget(
            primarySourceAccessPrompt.targetId,
          ),
          nextStep: primarySourceAccessPrompt.rerunLabel
            ? `Then ${primarySourceAccessPrompt.rerunLabel}.`
            : "Then search again.",
          onAction: () =>
            onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId),
        }
      : {
          label:
            browserSession.status === "blocked"
              ? "Open browser to recover"
              : "Open browser to sign in",
          pending: isBrowserSessionPending,
          nextStep: "Then search again.",
          onAction: onOpenBrowserSession,
        };
  }
  const configuredFilters = getDiscoveryConfiguredFilters(searchPreferences);
  const searchReadiness = getDiscoverySearchReadiness(searchPreferences);
  const hasEnabledSources = searchReadiness.enabledSourceCount > 0;
  const hasLocations = searchPreferences.locations.length > 0;
  // A single-source run also occupies the shared discovery pipeline; every
  // Search now control must refuse a concurrent click instead of relying on
  // the main process to reject it. Paused activity refuses for the same
  // reason: the run would be rejected, so the controls say so up front.
  const isActiveRunRunning = activeRun?.state === "running";
  // Leaving the running state always re-arms stop for the next run, whether
  // the run completed, failed, or honoured the cancellation request.
  useEffect(() => {
    if (!isActiveRunRunning) {
      setIsStopSearchRequested(false);
    }
  }, [isActiveRunRunning]);
  const handleStopSearch = useCallback(() => {
    if (!onCancelDiscovery || !isActiveRunRunning || isStopSearchRequested) {
      return;
    }
    setIsStopSearchRequested(true);
    onCancelDiscovery();
  }, [isActiveRunRunning, isStopSearchRequested, onCancelDiscovery]);
  const isAnyDiscoveryRunActive =
    activeRun?.state === "running" || isDiscoveryAllPending;
  const isSearchUnavailable =
    activityPaused || isAnyDiscoveryRunActive;
  const searchSetupBlocker =
    showEmptyDiscoveryState && !hasEnabledSources
      ? {
          title: "Choose at least one source before searching",
          description:
            "Enable at least one source in Profile so Find jobs has somewhere to search. Your profile will guide the search even when you leave target roles blank.",
          actionLabel: "Add a job source",
          actionHref: JOB_FINDER_ROUTE_PATHS.profileSources,
          nextStep: hasLocations
            ? "Then search again."
            : "Then add locations if you want tighter matches and search again.",
        }
      : null;

  const filtersPanel = (
    <DiscoveryFiltersPanel
      activeRun={activeRun}
      activityPaused={activityPaused}
      browserSession={browserSession}
      discoverySessions={discoverySessions}
      isAnyDiscoveryRunActive={isAnyDiscoveryRunActive}
      isBrowserSessionPending={isBrowserSessionPending}
      isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
      isDiscoveryAllPending={isDiscoveryAllPending}
      isTargetPending={isTargetPending}
      onOpenBrowserSession={onOpenBrowserSession}
      onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
      onRunAgentDiscovery={onRunAgentDiscovery}
      {...(props.onRunDiscoveryForTarget
        ? { onRunDiscoveryForTarget: props.onRunDiscoveryForTarget }
        : {})}
      onViewProgress={() => setShowHistory(true)}
      searchPreferences={searchPreferences}
      sourceAccessPrompts={sourceAccessPrompts}
    />
  );

  const recoveryActionProps = primaryRecoveryAction
    ? {
        onRecoveryAction: primaryRecoveryAction.onAction,
        recoveryActionLabel: primaryRecoveryAction.label,
        recoveryActionNextStep: primaryRecoveryAction.nextStep,
        recoveryActionPending: primaryRecoveryAction.pending,
      }
    : {};

  const resultsWorkspace = (
    <div
      className="grid min-h-0 min-w-0 grid-cols-1 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(30rem,1.35fr)_minmax(25rem,0.9fr)] xl:overflow-hidden"
      id="discovery-workspace-content"
    >
      <div
        className={
          dismissedJobs.length > 0
            ? "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2"
            : "min-h-0 min-w-0"
        }
      >
        {dismissedJobs.length > 0 ? (
          <details className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2">
            <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground-soft">
              Hidden by you ({dismissedJobs.length})
            </summary>
            <p className="mt-2 text-(length:--text-small) leading-5 text-foreground-muted">
              Hidden jobs stay on this device and do not change fit scores.
            </p>
            <ul className="mt-3 grid gap-2">
              {dismissedJobs.map((job) => (
                <li
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-(--surface-panel-border) pt-2"
                  key={job.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-(length:--text-small) font-medium text-foreground">
                      {job.title}
                    </p>
                    <p className="text-(length:--text-tiny) text-foreground-muted">
                      {job.discoveryFeedback?.reasons.join(" · ") ??
                        "Hidden without saved reasons"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.discoveryFeedback?.employerExclusion &&
                    onRemoveEmployerExclusion ? (
                      <Button
                        disabled={isJobPending(job.id)}
                        onClick={() =>
                          onRemoveEmployerExclusion({
                            jobId: job.id,
                            normalizedCompanyName:
                              job.discoveryFeedback!.employerExclusion!
                                .normalizedCompanyName,
                          })
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Allow this employer in future searches
                      </Button>
                    ) : null}
                    <Button
                      disabled={isJobPending(job.id)}
                      onClick={() => onRestoreDismissedJob(job.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Show again
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <DiscoveryResultsPanel
          areHiddenJobsShown={showClearMismatches}
          browserSession={browserSession}
          discoveryTargets={searchPreferences.discovery.targets}
          emptyClassName="min-h-80"
          // Active search plan identity: the running run's campaign, else the
          // most recent run's, else the shared default scope. Facet filters
          // persist per plan so switching plans never leaks selections.
          facetScopeId={
            activeRun?.campaignId ?? recentRuns[0]?.campaignId ?? null
          }
          hasCompletedSearch={recentRuns.some(
            (run) => run.state === "completed",
          )}
          isSearchInProgress={activeRun?.state === "running"}
          hiddenJobCount={hiddenJobCount}
          jobs={resultVisibility.jobs}
          latestRunVerdict={latestRunVerdict}
          mismatchJobCount={resultVisibility.mismatchCount}
          onDisplayedSelectedJobIdChange={(jobId) =>
            setDisplayedSelection({ jobId })
          }
          onShowHiddenJobs={() => setShowClearMismatches(true)}
          onToggleHiddenJobs={() =>
            setShowClearMismatches((current) => !current)
          }
          onSelectJob={onSelectJob}
          searchSetupBlocker={searchSetupBlocker}
          selectedJob={resultVisibility.selectedJob}
          {...recoveryActionProps}
        />
      </div>
      <div className="min-h-0 min-w-0">
        <DiscoveryDetailPanel
          discoveryTargets={searchPreferences.discovery.targets}
          isJobPending={isJobPending}
          onDismissJob={onDismissJob}
          {...(onPreviewEmployerExclusion
            ? { onPreviewEmployerExclusion }
            : {})}
          {...(onOpenCompany ? { onOpenCompany } : {})}
          onQueueJob={handleQueueJob}
          queueFeedback={inspectedJobQueueFeedback}
          selectedJob={inspectedJob}
          selectedJobCompanyId={selectedJobCompanyId}
        />
      </div>
    </div>
  );

  return (
    <>
      <LockedScreenLayout
        contentClassName="xl:overflow-hidden"
        topContent={
          <>
            <PageHeaderStack
              actions={
                <>
                  {onBackToRapidReview ? (
                    <Button
                      onClick={onBackToRapidReview}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Back to rapid review
                    </Button>
                  ) : null}
                  <span className="min-w-0 truncate text-(length:--text-small) text-foreground-muted">
                    {configuredFilters.join(" · ")}
                  </span>
                  {/* One primary search command per mode: Results keeps the
                      route-level header action; Search setup demotes to the
                      panel's own primary so two primaries never compete. */}
                  {workspaceMode === "results" ? (
                    <>
                      <Button
                        aria-describedby={
                          activityPaused
                            ? "discovery-header-search-paused-reason"
                            : searchReadiness.ready
                              ? undefined
                              : "discovery-header-search-disabled-reason"
                        }
                        disabled={
                          !searchReadiness.ready ||
                          isSearchUnavailable
                        }
                        onClick={onRunAgentDiscovery}
                        pending={isDiscoveryAllPending}
                        size="sm"
                        type="button"
                        variant="primary"
                      >
                        {activeRun?.state === "running"
                          ? "Searching"
                          : "Search now"}
                      </Button>
                      {/* Same-channel stop: a running run exposes the Task
                          Center cancellation beside the truthful disabled
                          Searching status. The shared pending convention
                          keeps focus stable and swallows repeat activation;
                          committed jobs always stay kept. */}
                      {onCancelDiscovery && isActiveRunRunning ? (
                        <Button
                          data-testid="discovery-header-stop-search"
                          onClick={handleStopSearch}
                          pending={isStopSearchRequested}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Stop search
                        </Button>
                      ) : null}
                      {/* Sighted users need the disabled reason too, not
                          only assistive tech. Paused activity outranks the
                          readiness reason because it changes the fix (resume
                          activity), and it must never be masked by an
                          unrelated failure message. */}
                      {activityPaused ? (
                        <span
                          className="order-first w-full text-(length:--text-description) leading-5 text-(--warning-text)"
                          id="discovery-header-search-paused-reason"
                          role="status"
                        >
                          {DISCOVERY_PAUSED_SEARCH_REASON}
                        </span>
                      ) : searchReadiness.ready ||
                        searchSetupBlocker ? null : (
                        <span
                          className="order-first w-full text-(length:--text-description) leading-5 text-(--warning-text)"
                          id="discovery-header-search-disabled-reason"
                          role="status"
                        >
                          {searchReadiness.reason}{" "}
                          <Link
                            className="font-medium underline underline-offset-4"
                            to={JOB_FINDER_ROUTE_PATHS.profileSources}
                          >
                            Review job sources
                          </Link>
                        </span>
                      )}
                    </>
                  ) : null}
                </>
              }
              description="Search your sources and review the strongest matches."
              subnav={
                <PageSubnav
                  aria-label="Find jobs workspace"
                  className="w-fit shrink-0 gap-1 rounded-(--radius-button) border border-(--surface-panel-border) bg-(--surface-panel) p-0.5"
                  role="group"
                >
                  {(["results", "setup"] as const).map((mode) => (
                    <button
                      aria-controls="discovery-workspace-content"
                      aria-pressed={workspaceMode === mode}
                      className={`min-h-8 rounded-(--radius-small) px-3 text-sm transition-colors ${workspaceMode === mode ? "bg-accent font-semibold text-accent-foreground" : "font-medium text-foreground-muted hover:text-foreground"}`}
                      key={mode}
                      onClick={() => setWorkspaceMode(mode)}
                      type="button"
                    >
                      {mode === "results" ? "Results" : "Search setup"}
                    </button>
                  ))}
                </PageSubnav>
              }
              title="Find jobs"
            />
            {activityPaused ? (
              <DiscoveryPausedBanner
                isResumePending={isActivityPausePending}
                {...(onResumeActivity ? { onResolve: onResumeActivity } : {})}
              />
            ) : null}
            {discoveryRunFeedback ? (
              <DiscoveryRunFeedbackCallout
                feedback={discoveryRunFeedback}
                isRecoveryPending={isBrowserSessionPending}
                onOpenBrowserSession={onOpenBrowserSession}
              />
            ) : null}
            {/* One route-owned action surface shared by Results and Search
                setup, so a failed Resume activity or any other authoritative
                refusal stays visible in every mode. It renders below the
                paused banner and run feedback so a stale message can never
                mask the pause truth or the newest run verdict. */}
            {actionState.message ? (
              <p
                aria-atomic="true"
                aria-live="polite"
                className="min-w-0 break-words rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) px-3 py-2 text-(length:--text-description) leading-5 text-foreground"
                data-testid="discovery-route-action-status"
                role="status"
              >
                {actionState.message}
              </p>
            ) : null}
          </>
        }
      >
        {workspaceMode === "setup" ? (
          <div
            className="min-h-0 min-w-0 xl:h-full"
            id="discovery-workspace-content"
          >
            {filtersPanel}
          </div>
        ) : (
          resultsWorkspace
        )}
      </LockedScreenLayout>

      <DiscoveryHistoryModal
        activeRun={activeRun}
        isDiscoveryPending={isDiscoveryAllPending}
        isTargetPending={isTargetPending}
        liveEvents={liveEvents}
        onClose={() => setShowHistory(false)}
        {...(props.onRunDiscoveryForTarget
          ? { onRetrySource: props.onRunDiscoveryForTarget }
          : {})}
        open={showHistory}
        recentRuns={recentRuns}
        targets={searchPreferences.discovery.targets}
      />
    </>
  );
}
