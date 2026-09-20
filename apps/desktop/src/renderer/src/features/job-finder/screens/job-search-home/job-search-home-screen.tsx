import type {
  CampaignNotification,
  DiscoveryRunRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { listSourceAttentionReasons } from "@unemployed/job-finder/source-health";
import { projectPlanSafeguardPauses } from "@unemployed/job-finder/plan-safeguard-pauses";
import { PlanSafeguardPauseCards } from "../../components/plan-safeguard-pause-cards";
import { Button } from "@renderer/components/ui/button";
import { PageHeaderStack } from "../../components/page-header";
import { JobFinderActivityControl } from "../../components/job-finder-activity-control";
import { JobFinderGlobalSearch } from "../../components/job-finder-global-search";
import { CampaignNotificationCenter } from "../../components/campaign-notification-center";
import { StatusBadge } from "../../components/status-badge";
import { buildJobFinderGlobalSearchEntries } from "../../lib/build-job-finder-global-search-entries";
import {
  countApplicationRecords,
  countDiscoveryVisibleJobs,
  countNeedsYou,
  countShortlistedJobs,
  selectCampaignJobIds,
} from "../../lib/destination-counts";
import {
  formatDiscoveryRunCountLabel,
  formatDiscoveryRunReportLabel,
  formatLastSearchSummarySentence,
  formatSearchFinishedStatusLine,
  getDiscoveryRunCountEvidence,
  getDiscoveryRunReportCounts,
  hasDiscoveryRunReportCounts,
} from "../../lib/discovery-run-count-label";
import type { JobFinderGlobalSearchEntry } from "../../lib/job-finder-global-search";
import {
  DISCOVERY_OFFLINE_RUNTIME_LABEL,
  DISCOVERY_OFFLINE_SETUP_NOTICE,
} from "../discovery/discovery-search-readiness";
import { DiscoveryRunFeedbackCallout } from "../discovery/discovery-run-feedback-callout";
import {
  getDiscoveryLatestRunNotices,
  type DiscoveryRunFeedback,
} from "../discovery/discovery-run-feedback";
import {
  formatDiscoveryRunSourceProblemSummary,
  selectCardOnlyEvidenceNotices,
  selectNewestSettledDiscoveryRun,
} from "./home-source-health-summary";

/**
 * The recommended card already carries the action as its heading; repeating
 * the identical sentence on the button said one thing twice. The button says
 * where it goes instead.
 */
function formatRecommendedActionButtonLabel(route: string): string {
  if (route.startsWith("/job-finder/discovery")) {
    return "Open Find jobs";
  }
  if (route.startsWith("/job-finder/review-queue")) {
    return "Open Shortlisted";
  }
  if (route.startsWith("/job-finder/applications")) {
    return "Open Applications";
  }
  if (
    route.startsWith("/job-finder/action-inbox") ||
    route.startsWith("/job-finder/actions")
  ) {
    return "Open Needs you";
  }
  if (route.startsWith("/job-finder/rapid-review")) {
    return "Open Quick review";
  }
  if (route.startsWith("/job-finder/profile")) {
    return "Open Profile";
  }
  return "Open";
}

/**
 * The same population the header badge and the Needs you page count. Home
 * used to derive its own number here, without the applications paused on a
 * site step, so the stat card said 2 while the recommendation said 1.
 */
function countHomeNeedsYou(workspace: JobFinderWorkspaceSnapshot): number {
  return countNeedsYou(workspace);
}

/**
 * Newest persisted run, used only as count evidence. The canonical count
 * helper owns the wording so Home, Task center and Search history cannot
 * report three different numbers for one search (F28).
 */
function newestDiscoveryRun(
  workspace: JobFinderWorkspaceSnapshot,
): DiscoveryRunRecord | null {
  const runs = workspace.recentDiscoveryRuns ?? [];
  let newest: DiscoveryRunRecord | null = null;
  for (const run of runs) {
    if (!newest || run.startedAt > newest.startedAt) {
      newest = run;
    }
  }
  return workspace.activeDiscoveryRun ?? newest;
}

/**
 * Zero states are not status: `0 need attention · 0 running` printed two
 * facts nobody asked about beside the one that mattered.
 */
function formatSourceHealthCounts(counts: {
  healthy: number;
  needsAttention: number;
  running: number;
}): string | null {
  const parts: string[] = [];
  if (counts.healthy > 0) parts.push(`${counts.healthy} healthy`);
  if (counts.needsAttention > 0) {
    parts.push(
      `${counts.needsAttention} ${counts.needsAttention === 1 ? "needs" : "need"} attention`,
    );
  }
  if (counts.running > 0) parts.push(`${counts.running} running`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function JobSearchHomeScreen(props: {
  activityPending: boolean;
  /**
   * Tailored-resume drafts the renderer is waiting on. The dashboard's own
   * background count never includes them, so without this Home said
   * "Nothing is running right now." while a 60-second draft ran.
   */
  activeResumeDraftCount?: number;
  campaignNotificationError?: string | null;
  campaignNotificationPending?: (notificationId: string) => boolean;
  campaignNotificationAllPending?: boolean;
  campaignNotifications?: readonly CampaignNotification[];
  discoveryRunFeedback?: DiscoveryRunFeedback | null;
  discoveryRunPending?: boolean;
  browserSessionPending?: boolean;
  onMarkAllCampaignNotificationsRead?: () => void;
  onMarkCampaignNotificationRead?: (notificationId: string) => void;
  onNavigate: (path: string) => void;
  onNavigateGlobalEntry: (entry: JobFinderGlobalSearchEntry) => void;
  onPauseActivity: () => void;
  onOpenBrowserSession?: () => void;
  onResumeActivity: () => void;
  onRunDiscovery?: () => void;
  onSelectCampaign: (campaignId: string) => void;
  workspace: JobFinderWorkspaceSnapshot;
}) {
  const { dashboard } = props.workspace;
  const needsYouCount = countHomeNeedsYou(props.workspace);
  const safeguardPauses = projectPlanSafeguardPauses(props.workspace.intelligence?.safeguards, props.workspace.campaigns);
  const globalEntries = buildJobFinderGlobalSearchEntries(props.workspace);
  const activeBrowserCount =
    (props.workspace.activeDiscoveryRun?.state === "running" ? 1 : 0) +
    (props.workspace.activeSourceDebugRun?.state === "running" ? 1 : 0);
  const activeApplicationCount = props.workspace.applyRuns.filter(
    (run) => run.state === "running",
  ).length;
  const activeResumeDraftCount = props.activeResumeDraftCount ?? 0;
  const backgroundOperationCount =
    dashboard.backgroundOperationCount + activeResumeDraftCount;
  const profileSetupState = props.workspace.profileSetupState;
  const hasIncompleteProfileSetup = profileSetupState?.status !== "completed";
  const activeCampaign = props.workspace.campaigns.find(
    (campaign) => campaign.id === props.workspace.activeCampaignId,
  );
  const activeCampaignJobIds = new Set(activeCampaign?.jobIds ?? []);
  const hasSearchHistory =
    (activeCampaign?.history?.some((entry) => entry.kind === "discovery_run") ??
      false) ||
    (props.workspace.recentDiscoveryRuns?.length ?? 0) > 0;
  const showProfileSetupBlocker =
    hasIncompleteProfileSetup && !hasSearchHistory;
  // A brand-new workspace has nothing to continue, so the card must invite
  // setup instead of narrating a resumed step that never started.
  const isFreshProfileSetup =
    (profileSetupState?.status ?? "not_started") === "not_started";
  const profileSetupStepLabel =
    {
      import: "resume import",
      essentials: "your basics",
      background: "your work history",
      targeting: "your job targets",
      extras: "the optional extras",
      narrative: "the optional extras",
      answers: "the optional extras",
      ready_check: "your job targets",
    }[profileSetupState?.currentStep ?? "import"] ?? "your profile setup";

  const isZeroMetrics =
    dashboard.jobsFoundToday === 0 &&
    dashboard.jobsAwaitingReview === 0 &&
    dashboard.applicationsReadyForApproval === 0 &&
    needsYouCount === 0 &&
    dashboard.applicationsAppliedToday === 0 &&
    dashboard.applicationsAppliedThisWeek === 0 &&
    dashboard.upcomingInterviews === 0 &&
    dashboard.upcomingFollowUps === 0;

  // `dashboard.sourceHealth` comes from the shared source-health derivation
  // (`deriveEnabledSourceHealthCounts` over enabled targets only), so its
  // `total` is the enabled count and can never distinguish "none saved" from
  // "saved but all switched off". The saved list is the only place that fact
  // lives, and Find jobs already separates the two; Home must agree.
  const liveSourceTargets = props.workspace.searchPreferences.discovery.targets;
  const savedSourceCount =
    liveSourceTargets.length > 0
      ? liveSourceTargets.length
      : dashboard.sourceHealth.total;
  const enabledSourceCount =
    liveSourceTargets.length > 0
      ? liveSourceTargets.filter(
      (target) => target.enabled,
        ).length
      : dashboard.sourceHealth.total;
  const hasNoEnabledSources = enabledSourceCount === 0;
  const hasSavedSourcesAllDisabled =
    hasNoEnabledSources && savedSourceCount > 0;
  const hasCatalogRows = props.workspace.discoveryJobs.some(
    (job) => job.discoveryMethod === "catalog_seed",
  );
  const showOfflineCatalogNotice = hasNoEnabledSources && hasCatalogRows;
  const hasSourceHealthAttention = dashboard.sourceHealth.needsAttention > 0;
  const sourcesReadyButNoMetrics =
    !hasNoEnabledSources && isZeroMetrics && !hasSearchHistory;
  const showZeroGuidance = isZeroMetrics && sourcesReadyButNoMetrics;
  const canRunFirstSearch =
    !showProfileSetupBlocker &&
    !hasNoEnabledSources &&
    sourcesReadyButNoMetrics &&
    Boolean(props.onRunDiscovery);
  const firstRunPresentation = showProfileSetupBlocker || hasNoEnabledSources;
  const showReturningDashboardModules = !firstRunPresentation;
  // Home states what is true, not what a dashboard could hold: an idle
  // background pane and two "Not enough data yet" rows were pure furniture.
  const showBackgroundWorkPane =
    dashboard.backgroundOperationCount > 0 ||
    Boolean(props.workspace.activityControl.reason);
  const showResultsPane = Boolean(
    dashboard.responseRate || dashboard.interviewRate,
  );
  // `Pause background work` used to appear only while something was running,
  // which made it unfindable: people looking for a way to stop background work
  // could not find one, and the control vanished the moment they resumed. It
  // now always states whether background work is paused, and always offers the
  // switch.
  const newestRun = newestDiscoveryRun(props.workspace);
  const homeDiscoveryFeedback =
    props.discoveryRunFeedback?.targetLabel === null &&
    (props.discoveryRunFeedback.status === "started" || newestRun === null)
      ? props.discoveryRunFeedback
      : null;
  // A finished search is a status fact, not a second next action. It reads as
  // one line inside the recommended card instead of a green banner plus its
  // own button outranking the card.

  const profileJobSourcesRoute =
    "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources";
  const profileSetupRoute = "/job-finder/profile/setup";
  const discoveryRoute = "/job-finder/discovery";
  const reviewQueueRoute = "/job-finder/review-queue";
  // The page promises "see progress"; these four numbers are that progress,
  // read from the same counters the sidebar badges use so they never disagree.
  const pipelineJobIds = selectCampaignJobIds(props.workspace);
  const pipeline = [
    {
      // "Results", not "Jobs found": Search plans prints the plan's whole
      // retained count under that name, and this tile counts only what Find
      // jobs lists by default.
      label: "Results",
      count: countDiscoveryVisibleJobs(props.workspace, pipelineJobIds),
      route: discoveryRoute,
    },
    {
      label: "Shortlisted",
      count: countShortlistedJobs(props.workspace, pipelineJobIds),
      route: reviewQueueRoute,
    },
    {
      label: "Applications",
      count: countApplicationRecords(props.workspace, pipelineJobIds),
      route: "/job-finder/applications",
    },
    {
      label: "Needs you",
      count: countNeedsYou(props.workspace),
      route: "/job-finder/actions",
    },
  ] as const;

  const profileSetupCardLabel = isFreshProfileSetup
    ? "Set up your profile"
    : "Continue setup";
  const profileSetupCardAction = isFreshProfileSetup
    ? "Start setup"
    : "Continue setup";
  // A fresh setup card already says "Set up your profile" in its heading; a
  // caption repeating it a third time is noise. A resumed card earns its
  // caption because it names the step the button lands on.
  const profileSetupCardHelper = isFreshProfileSetup
    ? null
    : `Opens guided setup at ${profileSetupStepLabel}.`;

  // One canonical number for one search. The shared helper owns both the
  // count and the vocabulary, so Home can never claim a "found" volume that
  // Find jobs and Search history do not recognise.
  const searchSucceeded = newestRun
    ? newestRun.state === "completed"
    : hasSearchHistory;
  const countEvidence = getDiscoveryRunCountEvidence(newestRun, null);
  const hasCountEvidence =
    countEvidence.distinctJobsRetained > 0 ||
    countEvidence.duplicatesMerged > 0;
  // A run that froze its own report is quoted verbatim: "N found · M new ·
  // K kept" is the same sentence Find jobs, Search history, the plan card and
  // Tasks print for that run, so the five screens cannot disagree. Only runs
  // recorded before the report existed fall back to the older label.
  const runReport = getDiscoveryRunReportCounts(newestRun);
  const hasRunReport = hasDiscoveryRunReportCounts(runReport);
  const lastSearchCountLabel = hasRunReport
    ? formatDiscoveryRunReportLabel(runReport)
    : hasCountEvidence
      ? formatDiscoveryRunCountLabel(countEvidence)
      : null;
  // Find jobs lists the active plan's jobs, not everything a run saved, so
  // Home reads the same population before it prints a number about it — and
  // it must be the *same* population, not just the same plan. `jobIds` is the
  // plan's membership ledger and is never pruned, while Find jobs and the
  // sidebar badge both list `discoveryJobs` intersected with that ledger,
  // which drops dismissed, applied, and otherwise retired rows. Counting the
  // ledger made one "Not interested" click print "15 kept in your current
  // search plan" beside Find jobs' "14 jobs kept in this search plan" in
  // otherwise identical words.
  const keptInActivePlan = activeCampaign
    ? props.workspace.discoveryJobs.filter((job) =>
        activeCampaignJobIds.has(job.id),
      ).length
    : 0;
  // Exactly one owner for the counts clause inside the recommended card. The
  // status line below states it for a search that just finished; only when
  // there is no such line does the recommendation body carry the same numbers,
  // so the card can never print the identical sentence twice in a row.
  const lastSearchSentence =
    lastSearchCountLabel && !searchSucceeded
      ? hasRunReport
        ? // The frozen label already names all three populations, so nothing
          // is reconciled against current inventory here.
          `Your last search: ${lastSearchCountLabel}.`
        : formatLastSearchSummarySentence({
            runCountLabel: lastSearchCountLabel,
            savedByRun: countEvidence.distinctJobsRetained,
            keptInPlan: keptInActivePlan,
          })
      : null;

  const awaitingReview = dashboard.jobsAwaitingReview;
  // The returning user's actual next move is the search loop, so it owns the
  // recommended slot — unless something is blocked on them or waiting for
  // their approval. Then the backend's own recommendation ("Resolve what
  // needs you") wins: sending them back to a shortlisted job that already has
  // an approved resume and a blocked application hides the real next step.
  const searchLoopRecommendation =
    showReturningDashboardModules &&
    !canRunFirstSearch &&
    awaitingReview > 0 &&
    needsYouCount === 0 &&
    dashboard.applicationsReadyForApproval === 0
      ? {
          label: `Review ${awaitingReview} shortlisted ${
            awaitingReview === 1 ? "job" : "jobs"
          }`,
          detail: lastSearchSentence
            ? `${lastSearchSentence} Open Shortlisted to decide which ones deserve a tailored resume.`
            : "Open Shortlisted to decide which ones deserve a tailored resume.",
          route: reviewQueueRoute,
        }
      : null;

  const rawRecommendedNext = safeguardPauses[0] ? {
    label: "Open Safeguards", detail: safeguardPauses[0].explanation, route: safeguardPauses[0].route,
  } : showProfileSetupBlocker
    ? {
        label: profileSetupCardLabel,
        detail: isFreshProfileSetup
          ? "Import your resume and tell Job Finder what you're looking for. Takes about five minutes."
          : `Pick up at ${profileSetupStepLabel} so Job Finder can use your job targets, sources, and resume tailoring when you search.`,
        route: profileSetupRoute,
      }
    : hasSavedSourcesAllDisabled
      ? {
          // The same fact, in the same words, as the Find jobs setup blocker.
          label: "Enable a source before searching",
          detail:
            "Sources are saved but none are turned on, so searches have nowhere to look. Enable a saved source in Profile, then search.",
          route: profileJobSourcesRoute,
        }
      : hasNoEnabledSources
        ? {
            label: "Set up job sources",
            detail:
              "Add at least one enabled job source in Profile to start discovering relevant openings. You can enable a public board like Greenhouse or Lever in seconds.",
            route: profileJobSourcesRoute,
          }
        : showZeroGuidance
          ? {
              label: "Run your first search",
              detail:
                "Your job sources are ready. Run a search to collect your first openings and see them here.",
              route: discoveryRoute,
            }
          : (searchLoopRecommendation ?? dashboard.recommendedNextAction);
  // The dashboard's recommendation is built in the main process from live
  // browser-step requests only; the badge beside it counts applications
  // paused on a site step too. One number on the page, from one selector.
  const effectiveRecommendedNext =
    rawRecommendedNext.route === "/job-finder/actions" && needsYouCount > 0
      ? {
          ...rawRecommendedNext,
          detail: `${needsYouCount} ${needsYouCount === 1 ? "item" : "items"} cannot continue without you.`,
        }
      : rawRecommendedNext;

  const unresolvedDiscoveryFeedback = searchSucceeded
    ? null
    : homeDiscoveryFeedback;
  const recommendedActionButtonLabel = formatRecommendedActionButtonLabel(
    effectiveRecommendedNext.route,
  );
  const searchStatusLine = searchSucceeded
    ? lastSearchCountLabel
      ? // Both populations, each with the noun that separates it. The run
        // total alone read as a contradiction of the smaller "kept in this
        // search plan" count that Find jobs prints for the same search. While
        // this line is showing it is the card's only carrier of those numbers.
        (hasRunReport
          ? `Search finished · ${lastSearchCountLabel}.`
          : formatSearchFinishedStatusLine({
              runCountLabel: lastSearchCountLabel,
              savedByRun: countEvidence.distinctJobsRetained,
              keptInPlan: keptInActivePlan,
            }))
      : "Search finished · nothing new was saved, and nothing was deleted."
    : null;

  // Continuing the search is the point of the product, so Home always offers
  // it once setup and sources are done — even when the recommended action is
  // something else.
  const canContinueSearch =
    showReturningDashboardModules && !canRunFirstSearch && !hasNoEnabledSources;
  const showReviewResultsAction =
    canContinueSearch &&
    !effectiveRecommendedNext.route.startsWith(discoveryRoute) &&
    (hasCountEvidence || props.workspace.discoveryJobs.length > 0);

  // Attention is only red when an enabled source is actually failing (a
  // recorded stale reason). Never-verified or guidance-only attention stays
  // neutral so a fresh source that just worked is not painted as broken.
  // The `failing` reason itself comes from the shared classification so Home
  // and the Profile Job sources library can never disagree about which
  // enabled source is broken.
  const failingSourceCount =
    props.workspace.searchPreferences.discovery.targets.filter(
      (target) =>
        target.enabled &&
        listSourceAttentionReasons(target).includes("failing"),
    ).length;
  // While setup is unfinished there is nothing to alarm about: sources are
  // chosen inside setup, so the badge and its neutral line would only repeat
  // each other in an alarm colour on a normal first run.
  const showSourceHealthBadge = !showProfileSetupBlocker;
  const sourceHealthBadgeTone = hasNoEnabledSources
    ? failingSourceCount > 0
      ? "critical"
      : "neutral"
    : hasSourceHealthAttention
      ? failingSourceCount > 0
        ? "critical"
        : "neutral"
      : dashboard.sourceHealth.healthy > 0
        ? "positive"
        : "muted";

  const sourceHealthCountsLabel = formatSourceHealthCounts(
    dashboard.sourceHealth,
  );
  // Source health is exactly where a run-level shortfall about what a source
  // could be read belongs. The run itself recorded the sentence; Home prints
  // it verbatim rather than re-deriving the condition from saved results.
  //
  // Only the product-authored card-only evidence sentence earns a line of its
  // own. Every other per-source warning is a raw internal error string, and a
  // large plan produces one per source, so those collapse into the single
  // classified count line below instead of a wall of debug prose (G7). The
  // caveat is extracted rather than filtered because production joins it onto
  // whatever partial warning a source already had.
  const latestSettledDiscoveryRun = selectNewestSettledDiscoveryRun(
    props.workspace.recentDiscoveryRuns ?? [],
  );
  const sourceHealthRunNotices = selectCardOnlyEvidenceNotices(
    getDiscoveryLatestRunNotices(
      latestSettledDiscoveryRun ? [latestSettledDiscoveryRun] : [],
    ),
  );
  const sourceProblemSummaryLine = formatDiscoveryRunSourceProblemSummary(
    latestSettledDiscoveryRun,
  );
  const sourceHealthBadgeLabel = hasSavedSourcesAllDisabled
    ? "No job sources turned on"
    : hasNoEnabledSources
      ? "No job sources configured"
      : (sourceHealthCountsLabel ?? "Not checked yet");

  // The global search only helps once there is something to find; on an empty
  // workspace it is one more empty control above an empty page.
  const hasSearchableWorkspaceRecords =
    (props.workspace.discoveryJobs?.length ?? 0) > 0 ||
    (props.workspace.applicationRecords?.length ?? 0) > 0;

  // The campaign layer stays hidden until it is earned: with one plan there is
  // nothing to switch between, so the selector is configuration furniture.
  const showSearchPlanSelector =
    showReturningDashboardModules && props.workspace.campaigns.length > 1;

  const recommendedIsNeedsYou =
    effectiveRecommendedNext.route.startsWith("/job-finder/action");
  const recommendedIsReviewQueue =
    effectiveRecommendedNext.route.startsWith(reviewQueueRoute);
  const recommendedIsApplications = effectiveRecommendedNext.route.startsWith(
    "/job-finder/applications",
  );

  const runSearchAgain = () => {
    if (props.onRunDiscovery) {
      props.onRunDiscovery();
      return;
    }
    props.onNavigate(discoveryRoute);
  };

  return (
    <section className="grid min-w-0 gap-5 pb-8">
      <PageHeaderStack
        actions={
          <JobFinderActivityControl
            onPause={props.onPauseActivity}
            onResume={props.onResumeActivity}
            state={{
              activeApplicationCount,
              activeBrowserCount,
              paused: props.workspace.activityControl.paused,
              pausedAt: props.workspace.activityControl.pausedAt,
              pending: props.activityPending,
            }}
          />
        }
        description="See progress, open tasks, and the best next step."
        title="Home"
      />

      <div
        aria-label="Source health"
        className="flex min-w-0 flex-wrap items-center gap-2"
        data-testid="source-health-badge-top"
      >
        {showSourceHealthBadge ? (
          <StatusBadge tone={sourceHealthBadgeTone}>
            {sourceHealthBadgeLabel}
          </StatusBadge>
        ) : null}
        <span className="text-xs text-foreground-muted">
          {showProfileSetupBlocker
            ? // Nothing to say yet: the user has not met the word "source",
              // and setup chooses them.
              ""
            : hasSavedSourcesAllDisabled
              ? `${savedSourceCount} saved source${savedSourceCount === 1 ? "" : "s"} • Turn one on in Profile`
              : hasNoEnabledSources
                ? "No job sources yet • Add one in Profile"
                : `${enabledSourceCount} enabled source${enabledSourceCount === 1 ? "" : "s"}`}
        </span>
        {/* Gated with the badge and the summary line: during setup the user
            has not met the word "source" yet, so a lone review action would
            point at something Home is not showing. */}
        {showSourceHealthBadge &&
        (hasSourceHealthAttention || sourceProblemSummaryLine !== null) ? (
          <Button
            onClick={() => props.onNavigate(profileJobSourcesRoute)}
            size="sm"
            type="button"
            variant="outline"
          >
            Review source health
          </Button>
        ) : null}
        {showSearchPlanSelector ? (
          <label className="flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
            <span>Search plan</span>
            <select
              aria-label="Active search plan"
              className="h-9 min-w-0 max-w-56 rounded-(--radius-field) border border-(--field-border) bg-(--field) px-2 text-sm outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]"
              onChange={(event) => props.onSelectCampaign(event.target.value)}
              value={props.workspace.activeCampaignId}
            >
              {props.workspace.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showProfileSetupBlocker || sourceProblemSummaryLine === null ? null : (
          <p
            className="w-full min-w-0 break-words text-xs text-foreground-muted"
            data-testid="source-health-problem-summary"
          >
            {sourceProblemSummaryLine}
          </p>
        )}
        {showProfileSetupBlocker
          ? null
          : sourceHealthRunNotices.map((notice) => (
              <p
                className="w-full min-w-0 break-words text-xs text-foreground-muted"
                data-testid="source-health-run-notice"
                key={notice}
              >
                {notice}
              </p>
            ))}
      </div>

      {showOfflineCatalogNotice ? (
        <div
          aria-live="polite"
          className="min-w-0 break-words rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-sm leading-6 text-(--info-text)"
          data-testid="home-offline-catalog-notice"
          role="status"
        >
          <strong>{DISCOVERY_OFFLINE_RUNTIME_LABEL}.</strong>{" "}
          {DISCOVERY_OFFLINE_SETUP_NOTICE}
        </div>
      ) : null}

      {unresolvedDiscoveryFeedback ? (
        // Only an outcome the user has to do something about earns a callout.
        // A successful search is reported as one status line inside the
        // recommended card instead.
        <div
          className="grid min-w-0 gap-2"
          data-testid="home-discovery-run-feedback"
        >
          <DiscoveryRunFeedbackCallout
            feedback={unresolvedDiscoveryFeedback}
            {...(props.browserSessionPending !== undefined
              ? { isRecoveryPending: props.browserSessionPending }
              : {})}
            {...(props.onOpenBrowserSession
              ? { onOpenBrowserSession: props.onOpenBrowserSession }
              : {})}
          />
        </div>
      ) : null}

      {showReturningDashboardModules ? (
        <nav
          aria-label="Your pipeline"
          className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4"
          data-testid="home-pipeline"
        >
          {pipeline.map((stage) => (
            <button
              key={stage.label}
              className="surface-panel-shell grid min-w-0 gap-0.5 rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-3 text-left outline-none transition-colors hover:border-(--control-border-hover) hover:bg-secondary/35 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => props.onNavigate(stage.route)}
              type="button"
            >
              <span className="text-(length:--text-heading-2) font-semibold tabular-nums leading-tight text-(--text-headline)">
                {stage.count}
              </span>
              <span className="text-(length:--text-small) text-foreground-soft">
                {stage.label}
              </span>
            </button>
          ))}
        </nav>
      ) : null}

      <PlanSafeguardPauseCards
        pauses={safeguardPauses}
        onNavigate={props.onNavigate}
      />
      {/* One recommended action, full width. Home used to put a second card
          of plan controls beside it, so the page opened with two competing
          places to act. */}
      <div className="surface-panel-shell grid min-w-0 gap-3 rounded-(--radius-panel) border border-primary/40 bg-primary/10 p-5">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-muted-foreground">
          Recommended next
        </p>
        <h2 className="min-w-0 break-words font-semibold text-(--text-headline)">
          {effectiveRecommendedNext.label}
        </h2>
        <p className="min-w-0 break-words text-sm text-foreground-soft">
          {effectiveRecommendedNext.detail}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            className="h-11 w-fit px-5"
            onClick={() => {
              if (canRunFirstSearch) {
                props.onRunDiscovery?.();
                return;
              }

              props.onNavigate(effectiveRecommendedNext.route);
            }}
            pending={canRunFirstSearch && Boolean(props.discoveryRunPending)}
            type="button"
          >
            {/* The heading already names the action; the button says what
                pressing it does. */}
            {showProfileSetupBlocker
              ? profileSetupCardAction
              : hasNoEnabledSources
                ? "Open job sources"
                : canRunFirstSearch
                  ? "Search now"
                  : recommendedIsReviewQueue && searchLoopRecommendation
                    ? "Open Shortlisted"
                    : recommendedActionButtonLabel}
          </Button>
          {showReviewResultsAction ? (
            <Button
              className="h-11 w-fit px-4"
              onClick={() => props.onNavigate(discoveryRoute)}
              size="sm"
              type="button"
              variant="outline"
            >
              Open Find jobs
            </Button>
          ) : null}
          {canContinueSearch ? (
            <Button
              className="h-11 w-fit px-4"
              onClick={runSearchAgain}
              pending={Boolean(
                props.onRunDiscovery && props.discoveryRunPending,
              )}
              size="sm"
              type="button"
              variant="outline"
            >
              Search again
            </Button>
          ) : null}
        </div>
        {searchStatusLine ? (
          <p
            className="min-w-0 break-words text-xs text-foreground-muted"
            data-testid="home-status-line"
          >
            {searchStatusLine}
          </p>
        ) : null}
        {showProfileSetupBlocker ? (
          profileSetupCardHelper ? (
            <p className="text-xs text-foreground-muted">
              {profileSetupCardHelper}
            </p>
          ) : null
        ) : hasNoEnabledSources ? (
          // The setup blocker owns this card when it is showing, so the
          // sources caption must not contradict a "Start setup" button. It
          // also avoids "public board", a term first-run users have not met.
          <p className="text-xs text-foreground-muted">
            Opens Profile, where you choose which job sites Job Finder searches.
          </p>
        ) : null}
      </div>

      {hasSearchableWorkspaceRecords ? (
        // The search box used to float between two cards as the only bordered
        // thing on the page, so it read as belonging to nothing.
        <section
          className="surface-panel-shell grid min-w-0 gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5"
          data-testid="home-workspace-search"
        >
          <JobFinderGlobalSearch
            entries={globalEntries}
            onNavigate={props.onNavigateGlobalEntry}
          />
        </section>
      ) : null}

      {showResultsPane || showBackgroundWorkPane ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {showResultsPane ? (
            <section className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
              <h2 className="font-semibold text-(--text-headline)">
                Results so far
              </h2>
              <p className="text-sm text-foreground-soft">
                Response rate:{" "}
                {dashboard.responseRate
                  ? `${dashboard.responseRate.percent}% (${dashboard.responseRate.numerator} of ${dashboard.responseRate.denominator})`
                  : "Not enough data yet"}
              </p>
              <p className="text-sm text-foreground-soft">
                Interview rate:{" "}
                {dashboard.interviewRate
                  ? `${dashboard.interviewRate.percent}% (${dashboard.interviewRate.numerator} of ${dashboard.interviewRate.denominator})`
                  : "Not enough data yet"}
              </p>
            </section>
          ) : null}
          {/* Source health has exactly one owner on this page: the badge
              beside the title. The card below repeated the same three numbers
              in different casing, with a plural bug of its own. */}
          {showBackgroundWorkPane ? (
            <section className="surface-panel-shell grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
              <h2 className="font-semibold text-(--text-headline)">
                Background work
              </h2>
              <p className="text-sm text-foreground-soft">
                {backgroundOperationCount === 0
                  ? "Nothing is running right now."
                  : activeResumeDraftCount > 0 &&
                      activeResumeDraftCount === backgroundOperationCount
                    ? `Writing ${activeResumeDraftCount} ${activeResumeDraftCount === 1 ? "resume" : "resumes"}.`
                    : `${backgroundOperationCount} ${backgroundOperationCount === 1 ? "operation is" : "operations are"} running.`}
              </p>
              {props.workspace.activityControl.reason ? (
                <p className="text-xs text-foreground-muted">
                  Pause reason: {props.workspace.activityControl.reason}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {(props.onMarkCampaignNotificationRead ||
        props.onMarkAllCampaignNotificationsRead) &&
      (showReturningDashboardModules ||
        (props.campaignNotifications?.length ?? 0) > 0) ? (
        <CampaignNotificationCenter
          errorMessage={props.campaignNotificationError ?? null}
          loading={false}
          notifications={props.campaignNotifications ?? []}
          onNavigate={props.onNavigate}
          // Derived from the same workspace state as the sidebar badges, so a
          // finished search with work waiting can never render "Nothing here
          // yet" beside a NEEDS YOU badge. Anything already carried by
          // Recommended next is suppressed here so one blocked item cannot
          // generate three advertisements for itself.
          outstandingWork={[
            ...(needsYouCount > 0 && !recommendedIsNeedsYou
              ? [
                  {
                    id: "needs-you",
                    label: `${needsYouCount} ${needsYouCount === 1 ? "item needs" : "items need"} you`,
                    openLabel: "Open Needs you",
                    onOpen: () => props.onNavigate("/job-finder/actions"),
                  },
                ]
              : []),
            ...(dashboard.jobsAwaitingReview > 0 && !recommendedIsReviewQueue
              ? [
                  {
                    id: "awaiting-review",
                    label: `${dashboard.jobsAwaitingReview} ${dashboard.jobsAwaitingReview === 1 ? "job is" : "jobs are"} waiting for your review`,
                    openLabel: "Open Shortlisted",
                    onOpen: () => props.onNavigate(reviewQueueRoute),
                  },
                ]
              : []),
            ...(dashboard.applicationsReadyForApproval > 0 &&
            !recommendedIsApplications
              ? [
                  {
                    id: "awaiting-approval",
                    label: `${dashboard.applicationsReadyForApproval} ${dashboard.applicationsReadyForApproval === 1 ? "application is" : "applications are"} ready for your approval`,
                    openLabel: "Open Applications",
                    onOpen: () => props.onNavigate("/job-finder/applications"),
                  },
                ]
              : []),
          ]}
          onMarkAllRead={() => props.onMarkAllCampaignNotificationsRead?.()}
          onMarkRead={(notificationId) =>
            props.onMarkCampaignNotificationRead?.(notificationId)
          }
          pendingMarkAll={props.campaignNotificationAllPending ?? false}
          pendingNotificationId={(notificationId) =>
            props.campaignNotificationPending?.(notificationId) ?? false
          }
        />
      ) : null}
    </section>
  );
}
