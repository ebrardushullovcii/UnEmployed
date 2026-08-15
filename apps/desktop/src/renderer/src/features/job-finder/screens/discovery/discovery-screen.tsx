import { useState } from "react";
import type {
  BrowserSessionState,
  CompanyEntity,
  DiscoveryAdapterSessionState,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  DiscoveryRunRecord,
  JobSearchPreferences,
  SourceAccessPrompt,
  SavedJob,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { LockedScreenLayout } from "@renderer/features/job-finder/components/locked-screen-layout";
import { PageHeader } from "@renderer/features/job-finder/components/page-header";
import { JOB_FINDER_ROUTE_HREFS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import { formatCountLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { DiscoveryHistoryModal } from "./discovery-activity-panel";
import { DiscoveryDetailPanel } from "./discovery-detail-panel";
import { DiscoveryFiltersPanel } from "./discovery-filters-panel";
import { DiscoveryResultsPanel } from "./discovery-results-panel";
import { getDiscoverySearchReadiness } from "./discovery-search-readiness";

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
    formatCountLabel(enabledSourceCount, "source"),
  ];
}
export function getDiscoveryResultVisibility(
  jobs: readonly SavedJob[],
  selectedJob: SavedJob | null,
  showClearMismatches: boolean,
): {
  hiddenMismatchCount: number;
  jobs: readonly SavedJob[];
  selectedJob: SavedJob | null;
} {
  const clearMismatches = jobs.filter(
    (job) => job.matchAssessment.recommendation === "skip",
  );
  const displayCandidates = showClearMismatches
    ? jobs
    : jobs.filter((job) => job.matchAssessment.recommendation !== "skip");
  const visibleJobs = displayCandidates
    .map((job, sourceIndex) => ({ job, sourceIndex }))
    .sort(
      (left, right) =>
        Number(left.job.matchAssessment.recommendation === "skip") -
          Number(right.job.matchAssessment.recommendation === "skip") ||
        right.job.matchAssessment.score - left.job.matchAssessment.score ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ job }) => job);
  const visibleSelectedJob =
    selectedJob && visibleJobs.some((job) => job.id === selectedJob.id)
      ? selectedJob
      : (visibleJobs[0] ?? null);

  return {
    hiddenMismatchCount: clearMismatches.length,
    jobs: visibleJobs,
    selectedJob: visibleSelectedJob,
  };
}

export function DiscoveryScreen(props: {
  actionState: { message: string | null };
  activeRun: DiscoveryRunRecord | null;
  browserSession: BrowserSessionState;
  companies?: readonly CompanyEntity[];
  discoverySessions: readonly DiscoveryAdapterSessionState[];
  isBrowserSessionPending: boolean;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
  isDiscoveryAllPending: boolean;
  isJobPending: (jobId: string) => boolean;
  isTargetPending: (targetId: string) => boolean;
  jobs: readonly SavedJob[];
  dismissedJobs: readonly SavedJob[];
  liveEvents: readonly DiscoveryActivityEvent[];
  onDismissJob: (
    jobId: string,
    reasons: readonly DiscoveryFeedbackReason[],
  ) => void;
  onRestoreDismissedJob: (jobId: string) => void;
  onOpenBrowserSession: () => void;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onOpenCompany?: (companyId: string) => void;
  onQueueJob: (jobId: string) => void;
  onRunAgentDiscovery: (() => void) | undefined;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onSelectJob: (jobId: string) => void;
  recentRuns: readonly DiscoveryRunRecord[];
  searchPreferences: JobSearchPreferences;
  selectedJob: SavedJob | null;
  sourceAccessPrompts: readonly SourceAccessPrompt[];
}) {
  const {
    actionState,
    activeRun,
    browserSession,
    companies,
    discoverySessions,
    isBrowserSessionPending,
    isBrowserSessionPendingForTarget,
    isDiscoveryAllPending,
    isJobPending,
    isTargetPending,
    jobs,
    dismissedJobs,
    liveEvents,
    onDismissJob,
    onRestoreDismissedJob,
    onOpenBrowserSession,
    onOpenBrowserSessionForTarget,
    onOpenCompany,
    onQueueJob,
    onRunAgentDiscovery,
    onSelectJob,
    recentRuns,
    searchPreferences,
    selectedJob,
    sourceAccessPrompts,
  } = props;
  const [showHistory, setShowHistory] = useState(false);
  const [showClearMismatches, setShowClearMismatches] = useState(false);
  const resultVisibility = getDiscoveryResultVisibility(
    jobs,
    selectedJob,
    showClearMismatches,
  );
  const selectedJobCompanyId =
    resultVisibility.selectedJob && (companies ?? []).length > 0
      ? ((companies ?? []).find((company) =>
          company.jobIds.includes(resultVisibility.selectedJob!.id),
        )?.id ?? null)
      : null;
  const hiddenJobCount = showClearMismatches
    ? 0
    : resultVisibility.hiddenMismatchCount;
  const allResultsHidden =
    hiddenJobCount > 0 && resultVisibility.jobs.length === 0;

  const showEmptyDiscoveryState = jobs.length === 0;
  const enabledTargetIds = new Set(
    searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
  );
  const enabledSourceAccessPrompts = sourceAccessPrompts.filter((prompt) =>
    enabledTargetIds.has(prompt.targetId),
  );
  const primarySourceAccessPrompt =
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
  const searchSetupBlocker =
    showEmptyDiscoveryState && !hasEnabledSources
      ? {
          title: "Choose at least one source before searching",
          description:
            "Enable at least one source in Profile so Find jobs has somewhere to search. Your profile will guide the search even when you leave target roles blank.",
          actionLabel: "Add a job source",
          actionHref: JOB_FINDER_ROUTE_HREFS.profileSources,
          nextStep: hasLocations
            ? "Then search again."
            : "Then add locations if you want tighter matches and search again.",
        }
      : null;

  const filtersPanel = (
    <DiscoveryFiltersPanel
      activeRun={activeRun}
      actionMessage={actionState.message}
      browserSession={browserSession}
      discoverySessions={discoverySessions}
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

  return (
    <>
      <LockedScreenLayout
        contentClassName="xl:overflow-hidden"
        topClassName="pb-(--gap-section) pt-8"
        topContent={
          <PageHeader
            eyebrow="Find jobs"
            title="Find jobs"
            description="Search your saved roles and job sources, then review the strongest matches."
          />
        }
      >
        {showEmptyDiscoveryState ? (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(23rem,25rem)_minmax(0,1fr)] xl:overflow-hidden">
            <div className="min-h-0 min-w-0">{filtersPanel}</div>
            <div className="grid min-h-124 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 xl:h-full xl:min-h-0">
              <div
                aria-label="Active search setup"
                className="flex flex-wrap gap-2 px-1"
              >
                {configuredFilters.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
              <DiscoveryResultsPanel
                browserSession={browserSession}
                emptyClassName="min-h-80"
                hasCompletedSearch={recentRuns.some(
                  (run) => run.state === "completed",
                )}
                isSearchInProgress={activeRun?.state === "running"}
                jobs={jobs}
                onSelectJob={onSelectJob}
                searchSetupBlocker={searchSetupBlocker}
                selectedJob={selectedJob}
                {...recoveryActionProps}
              />
              <p className="max-w-176 px-1 text-(length:--text-description) leading-6 text-foreground-soft">
                Need better matches? Update roles, locations, or sources in
                Profile, then search again.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem] xl:overflow-hidden 2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]">
            <div className="min-h-0 min-w-0">{filtersPanel}</div>
            <div
              className={
                resultVisibility.hiddenMismatchCount > 0
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
                    These choices stay on this device and never change job facts
                    or fit scores.
                  </p>
                  <ul className="mt-3 grid gap-2">
                    {dismissedJobs.map((job) => (
                      <li
                        className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-3"
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
                        <Button
                          disabled={isJobPending(job.id)}
                          onClick={() => onRestoreDismissedJob(job.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Show again and reset
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}{" "}
              {resultVisibility.hiddenMismatchCount > 0 && !allResultsHidden ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2">
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="text-(length:--text-small) leading-5 text-foreground-soft"
                  >
                    {showClearMismatches
                      ? `Showing ${resultVisibility.hiddenMismatchCount} clear mismatch${resultVisibility.hiddenMismatchCount === 1 ? "" : "es"} for transparency.`
                      : `${resultVisibility.hiddenMismatchCount} clear mismatch${resultVisibility.hiddenMismatchCount === 1 ? "" : "es"} hidden so your strongest jobs stay easy to review.`}
                  </p>
                  <Button
                    aria-pressed={showClearMismatches}
                    onClick={() =>
                      setShowClearMismatches((current) => !current)
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {showClearMismatches
                      ? "Hide mismatches"
                      : "Show mismatches"}
                  </Button>
                </div>
              ) : null}
              <DiscoveryResultsPanel
                browserSession={browserSession}
                hasCompletedSearch={recentRuns.some(
                  (run) => run.state === "completed",
                )}
                isSearchInProgress={activeRun?.state === "running"}
                hiddenJobCount={hiddenJobCount}
                jobs={resultVisibility.jobs}
                {...(onRunAgentDiscovery
                  ? { onSearchAgain: onRunAgentDiscovery }
                  : {})}
                onShowHiddenJobs={() => setShowClearMismatches(true)}
                onSelectJob={onSelectJob}
                searchAgainDisabled={
                  !searchReadiness.ready || isDiscoveryAllPending
                }
                searchAgainPending={isDiscoveryAllPending}
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
                {...(onOpenCompany ? { onOpenCompany } : {})}
                onQueueJob={onQueueJob}
                selectedJob={resultVisibility.selectedJob}
                selectedJobCompanyId={selectedJobCompanyId}
              />
            </div>
          </div>
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
