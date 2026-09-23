import type {
  ApplicationAutomationMode,
  DiscoveryRunRecord,
  JobFinderSearchRequest,
  JobFinderWorkspaceSnapshot,
  ReviewQueueItem,
  ProfileSetupStep,
} from "@unemployed/contracts";
import {
  evaluateProfileSetupReadiness,
  getProfileSetupReadinessBlockers,
} from "@unemployed/contracts";
import { listSourceAttentionReasons } from "@unemployed/job-finder/source-health";
import {
  AUTOMATIC_APPLICATION_FAILURE_PAUSE_ID,
  projectPlanSafeguardPauses,
} from "@unemployed/job-finder/plan-safeguard-pauses";
import type {
  JobFinderTaskCenterItem,
  JobFinderTaskCenterModel,
} from "../../components/task-center/job-finder-task-center-model";
import {
  countApplicationRecords,
  countDiscoveryVisibleJobs,
  countNeedsYou,
  countSafeguardBlockers,
  countShortlistedJobs,
  selectCampaignJobIds,
} from "../../lib/destination-counts";
import {
  formatDiscoveryRunCountLabel,
  formatDiscoveryRunReportLabel,
  getDiscoveryRunCountEvidence,
  getDiscoveryRunReportCounts,
  hasDiscoveryRunReportCounts,
} from "../../lib/discovery-run-count-label";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";
import { getProfileSetupReadinessBlockerLabel } from "../../components/profile/setup/profile-setup-screen-helpers";
import { resolveApplyStatePresentation } from "../applications/apply-state";
import { isDiscoveryAlsoFoundResult } from "../discovery/discovery-result-groups";
import {
  APPLICATION_PREPARATION_BATCH_LIMIT,
  collectInProgressApplicationJobIds,
  collectPreparedApplicationJobIds,
  countTailoredDraftPreparationEligible,
  isQueueStageReady,
  needsPersonResumeReview,
} from "../review-queue/review-queue-status";
import {
  formatDiscoveryRunSourceProblemSummary,
  selectNewestSettledDiscoveryRun,
} from "./home-source-health-summary";

/**
 * Home answers three questions and nothing else: where am I, what is going on,
 * and what do I do next. This module decides the answers from the workspace;
 * the screen only renders them. Every number here comes from the same owner
 * the sidebar badges and the destination pages read, so Home can never print
 * a count another page does not recognise.
 */

export type HomeAction =
  | { kind: "navigate"; route: string }
  | { kind: "run_search"; request?: JobFinderSearchRequest }
  | { kind: "create_resumes" }
  | { kind: "resume_setup"; step: ProfileSetupStep }
  | { kind: "apply_all"; jobIds: readonly string[] }
  | { kind: "stop_search"; runId: string }
  | { kind: "stop_apply"; runId: string }
  | { kind: "stop_resumes" }
  | { kind: "pause_activity" }
  | { kind: "resume_activity" };

export interface HomeButton {
  label: string;
  action: HomeAction;
}

interface HomeNextStep {
  /** Why this is the next step, as a stable id the tests can assert on. */
  id:
    | "safeguards"
    | "paused"
    | "setup"
    | "sources"
    | "needs_you"
    | "send"
    | "daily_limit"
    | "retry"
    | "review_resumes"
    | "apply"
    | "create_resumes"
    | "wait_search"
    | "wait_resumes"
    | "wait_apply"
    | "first_search"
    | "look_through"
    | "nothing_found"
    | "search_failed"
    | "caught_up";
  title: string;
  detail: string;
  primary: HomeButton;
  secondary: readonly HomeButton[];
}

interface HomeNowItem {
  id: string;
  title: string;
  detail: string;
  stop: HomeButton | null;
  open: HomeButton | null;
}

interface HomeProblem {
  id: string;
  tone: "critical" | "warning";
  text: string;
  button: HomeButton | null;
}

interface HomeStage {
  id: "discovery" | "review-queue" | "applications";
  label: string;
  count: number;
  /** The one-line breakdown the sidebar badge cannot carry. */
  detail: string | null;
  route: string;
}

interface JobSearchHomeModel {
  /** One sentence under the title: what is going on right now. */
  statusLine: string;
  paused: boolean;
  now: readonly HomeNowItem[];
  problems: readonly HomeProblem[];
  next: HomeNextStep;
  /** Null until the workspace has anything to stand in a pipeline. */
  stages: readonly HomeStage[] | null;
  showPlanSelector: boolean;
}

export interface BuildJobSearchHomeModelInput {
  workspace: JobFinderWorkspaceSnapshot;
  tasks: JobFinderTaskCenterModel;
  /** A search request is in flight but the run has not been recorded yet. */
  discoveryRunPending: boolean;
  /** Whether Home may start a search itself. */
  canRunDiscovery: boolean;
  applicationAutomationMode: ApplicationAutomationMode;
  now?: number;
}

const discoveryRoute = JOB_FINDER_ROUTE_PATHS.discovery;
const reviewQueueRoute = JOB_FINDER_ROUTE_PATHS.reviewQueue;
const applicationsRoute = JOB_FINDER_ROUTE_PATHS.applications;
const applyingSettingsRoute = `${JOB_FINDER_ROUTE_PATHS.settings}#settings-application-authority`;
const needsYouRoute = "/job-finder/actions";
const profileSetupRoute = "/job-finder/profile/setup";
const profileSourcesRoute = `${JOB_FINDER_ROUTE_PATHS.profileSources}#profile-job-sources`;

function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function joinParts(parts: readonly (string | null)[]): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(" · ") : null;
}

function newestDiscoveryRun(
  workspace: JobFinderWorkspaceSnapshot,
): DiscoveryRunRecord | null {
  let newest: DiscoveryRunRecord | null = null;
  for (const run of workspace.recentDiscoveryRuns ?? []) {
    if (!newest || run.startedAt > newest.startedAt) {
      newest = run;
    }
  }
  return workspace.activeDiscoveryRun ?? newest;
}

/**
 * The request that continues an interrupted search on the sources that are
 * still enabled. `undefined` means the newest search was not interrupted;
 * `null` means it was, but none of its sources is still enabled.
 */
export function buildInterruptedSearchRetryRequest(
  workspace: JobFinderWorkspaceSnapshot,
): JobFinderSearchRequest | null | undefined {
  const run = newestDiscoveryRun(workspace);
  // A graceful app close cancels the live run before shutdown, so older and
  // current workspaces can represent the same interrupted search either with
  // the explicit phase or as a cancelled terminal run.
  if (run?.runPhase !== "interrupted" && run?.state !== "cancelled") {
    return undefined;
  }

  const enabledTargetIds = new Set(
    workspace.searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
  );
  const sourceIds = run.targetIds.filter((id) => enabledTargetIds.has(id));
  if (sourceIds.length === 0) return null;

  return {
    intent: run.searchIntent ?? "",
    ...(run.searchBreadth ? { breadth: run.searchBreadth } : {}),
    freshness: run.searchFreshness ?? "any",
    sourceIds,
  };
}

/** "10 found · 10 new", or null when the run recorded nothing. */
function formatRunCounts(run: DiscoveryRunRecord | null): string | null {
  if (!run) return null;
  const report = getDiscoveryRunReportCounts(run);
  if (hasDiscoveryRunReportCounts(report)) {
    // "0 found · 0 new" is not a count worth a clause; the next step says
    // the search found nothing in words.
    return (report.found ?? 0) === 0 && (report.new ?? 0) === 0
      ? null
      : formatDiscoveryRunReportLabel(report);
  }
  const evidence = getDiscoveryRunCountEvidence(run, null);
  return evidence.distinctJobsRetained > 0 || evidence.duplicatesMerged > 0
    ? formatDiscoveryRunCountLabel(evidence)
    : null;
}

function runNewCount(run: DiscoveryRunRecord | null): number {
  if (!run) return 0;
  const report = getDiscoveryRunReportCounts(run);
  if (report.new !== null) return report.new;
  return getDiscoveryRunCountEvidence(run, null).distinctJobsRetained;
}

function formatRelativeDay(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const elapsedMs = Math.max(0, now - then);
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${plural(days, "day")} ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(then),
  );
}

function describeApplyMode(mode: ApplicationAutomationMode): string {
  switch (mode) {
    case "autonomous_submit":
      return "Job Finder fills in and sends each application, and pauses only when it needs you.";
    case "confirm_before_submit":
      return "Job Finder fills in each form, then waits for your go-ahead before sending.";
    default:
      return "Job Finder fills in each form and attaches the resume; you press Send on each one.";
  }
}

interface ApplicationCounts {
  fillingIn: number;
  readyToSend: number;
  applied: number;
  needsYou: number;
  couldNotApply: number;
  /** The jobs Applications' own "Try again for all" would retry, same rule. */
  retryJobIds: readonly string[];
}

function countApplications(
  workspace: JobFinderWorkspaceSnapshot,
  jobIds: ReadonlySet<string>,
): ApplicationCounts {
  const retryJobIds: string[] = [];
  const counts: ApplicationCounts = {
    fillingIn: 0,
    readyToSend: 0,
    applied: 0,
    needsYou: 0,
    couldNotApply: 0,
    retryJobIds,
  };
  const runningJobIds = new Set(
    (workspace.applyRuns ?? [])
      .filter((run) => run.state === "running")
      .flatMap((run) => run.jobIds),
  );
  const latestResultByRecordId = new Map<
    string,
    JobFinderWorkspaceSnapshot["applyJobResults"][number]
  >();
  for (const result of workspace.applyJobResults ?? []) {
    if (!result.applicationRecordId) continue;
    const previous = latestResultByRecordId.get(result.applicationRecordId);
    if (!previous || previous.updatedAt < result.updatedAt) {
      latestResultByRecordId.set(result.applicationRecordId, result);
    }
  }
  for (const record of workspace.applicationRecords ?? []) {
    if (!jobIds.has(record.jobId)) continue;
    const result = latestResultByRecordId.get(record.id);
    if (!result) {
      if (
        record.status === "submitted" ||
        record.lastAttemptState === "submitted"
      ) {
        counts.applied += 1;
      } else if (record.lastAttemptState === "in_progress") {
        counts.fillingIn += 1;
      } else if (record.lastAttemptState === "failed") {
        counts.couldNotApply += 1;
      }
      continue;
    }
    const presentation = resolveApplyStatePresentation({
      // The same mapping `needs-you-count.ts` uses, so the tile and the badge
      // agree about which applications are waiting on the person.
      mode:
        record.automationMode === "autonomous_submit"
          ? "apply_for_me"
          : "fill_only",
      result,
      pendingQuestionCount: Math.max(
        0,
        record.questionSummary.total - record.questionSummary.answered,
      ),
      recordFailure:
        record.lastAttemptState === "failed"
          ? {
              lastActionLabel: record.lastActionLabel,
              lastUpdatedAt: record.lastUpdatedAt,
            }
          : null,
    });
    switch (presentation.kind) {
      case "filling_in":
        counts.fillingIn += 1;
        break;
      case "ready_to_send":
        counts.readyToSend += 1;
        break;
      case "applied":
        counts.applied += 1;
        break;
      case "needs_you":
        counts.needsYou += 1;
        break;
      case "could_not_apply":
        counts.couldNotApply += 1;
        if (
          presentation.action === "try_again" &&
          !runningJobIds.has(record.jobId) &&
          !retryJobIds.includes(record.jobId) &&
          retryJobIds.length < APPLICATION_PREPARATION_BATCH_LIMIT
        ) {
          retryJobIds.push(record.jobId);
        }
        break;
    }
  }
  return counts;
}

interface ShortlistCounts {
  missingResumes: number;
  writing: number;
  reviewResumes: number;
  readyToApply: number;
  readyJobIds: readonly string[];
  inApplications: number;
}

function countShortlist(
  queue: readonly ReviewQueueItem[],
  workspace: JobFinderWorkspaceSnapshot,
): ShortlistCounts {
  const prepared = collectPreparedApplicationJobIds(
    workspace.applicationRecords,
  );
  const inProgress = collectInProgressApplicationJobIds(
    workspace.applicationRecords,
  );
  const unavailable = new Set([...prepared, ...inProgress]);
  const readyJobIds = queue
    .filter((item) => isQueueStageReady(item, unavailable))
    .map((item) => item.jobId)
    .slice(0, APPLICATION_PREPARATION_BATCH_LIMIT);
  let writing = 0;
  let reviewResumes = 0;
  let inApplications = 0;
  for (const item of queue) {
    if (prepared.has(item.jobId) || inProgress.has(item.jobId)) {
      inApplications += 1;
      continue;
    }
    if (item.assetStatus === "generating" || item.assetStatus === "queued") {
      writing += 1;
    } else if (needsPersonResumeReview(item)) {
      reviewResumes += 1;
    }
  }
  return {
    missingResumes: countTailoredDraftPreparationEligible(queue, prepared),
    writing,
    reviewResumes,
    readyToApply: readyJobIds.length,
    readyJobIds,
    inApplications,
  };
}

function buildNowItem(
  item: JobFinderTaskCenterItem,
  showPausedApply: boolean,
): HomeNowItem | null {
  if (
    item.status !== "active" &&
    item.status !== "stopping" &&
    !(showPausedApply && item.kind === "apply" && item.status === "paused")
  )
    return null;
  const stopping = item.status === "stopping";
  switch (item.kind) {
    case "discovery":
      return {
        id: item.id,
        title: `Searching ${item.sourceLabel}`,
        detail: joinParts([item.stageLabel, item.countLabel]) ?? "",
        stop:
          item.canCancel && !stopping
            ? {
                label: "Stop",
                action: { kind: "stop_search", runId: item.id },
              }
            : null,
        open: {
          label: "Open Find jobs",
          action: { kind: "navigate", route: discoveryRoute },
        },
      };
    case "tailored_drafts":
      return {
        id: item.id,
        title: "Writing resumes",
        detail: joinParts([item.countLabel, "about a minute each"]) ?? "",
        stop: {
          label: "Stop after this one",
          action: { kind: "stop_resumes" },
        },
        open: {
          label: "Open Shortlisted",
          action: { kind: "navigate", route: reviewQueueRoute },
        },
      };
    case "apply":
      return {
        id: item.id,
        title: `${item.status === "paused" ? "Paused before" : "Applying:"} ${item.sourceLabel}`,
        detail: item.stageLabel,
        stop: item.canCancel
          ? { label: "Stop", action: { kind: "stop_apply", runId: item.id } }
          : null,
        open: {
          label: "Open Applications",
          action: { kind: "navigate", route: applicationsRoute },
        },
      };
    case "resume_import":
      return {
        id: item.id,
        title: "Reading your resume",
        detail: item.stageLabel,
        stop: null,
        open: {
          label: "Open Profile",
          action: { kind: "navigate", route: JOB_FINDER_ROUTE_PATHS.profile },
        },
      };
    case "source_check":
      return {
        id: item.id,
        title: `Checking ${item.sourceLabel}`,
        detail: item.stageLabel,
        stop: null,
        open: {
          label: "Open job sources",
          action: { kind: "navigate", route: profileSourcesRoute },
        },
      };
    default:
      return null;
  }
}

export function buildJobSearchHomeModel(
  input: BuildJobSearchHomeModelInput,
): JobSearchHomeModel {
  const { workspace, tasks } = input;
  const now = input.now ?? Date.now();
  const jobIds = selectCampaignJobIds(workspace);
  const queue = (workspace.reviewQueue ?? []).filter((item) =>
    jobIds.has(item.jobId),
  );

  const setupStatus = workspace.profileSetupState?.status ?? "not_started";
  const hasSearchHistory =
    (workspace.recentDiscoveryRuns?.length ?? 0) > 0 ||
    Boolean(workspace.activeDiscoveryRun);
  const setupIncomplete = setupStatus !== "completed" && !hasSearchHistory;
  const setupFresh = setupStatus === "not_started";
  const firstSetupBlocker = workspace.profile
    ? getProfileSetupReadinessBlockers(
        evaluateProfileSetupReadiness(
          workspace.profile,
          workspace.searchPreferences,
        ),
      )[0]
    : undefined;
  const setupStep = firstSetupBlocker
    ? firstSetupBlocker.step
    : (workspace.profileSetupState?.currentStep ?? "import");
  const setupStepLabel =
    {
      import: "your resume",
      essentials: "your basics",
      background: "your work history",
      targeting: "your job targets",
      extras: "the optional extras",
      narrative: "the optional extras",
      answers: "the optional extras",
      ready_check: "your job targets",
    }[setupStep] ?? "where you left off";

  const targets = workspace.searchPreferences.discovery.targets;
  const enabledTargets = targets.filter((target) => target.enabled);
  const savedSourceCount = targets.length;
  const enabledSourceCount = enabledTargets.length;
  const failingSources = enabledTargets.filter((target) =>
    listSourceAttentionReasons(target).includes("failing"),
  );

  const newestRun = newestDiscoveryRun(workspace);
  const hasDiscoveryNow = tasks.items.some(
    (item) =>
      item.kind === "discovery" &&
      (item.status === "active" || item.status === "stopping"),
  );
  const nowItems = tasks.items
    .map((item) =>
      buildNowItem(
        item,
        workspace.activityControl.paused &&
          workspace.activityControl.pauseBehavior === "finish_current",
      ),
    )
    .filter((item): item is HomeNowItem => item !== null);
  const searchRunning = hasDiscoveryNow || input.discoveryRunPending;
  const resumesWriting = tasks.items.some(
    (item) => item.kind === "tailored_drafts" && item.status === "active",
  );
  const applyRunning = tasks.items.some(
    (item) =>
      item.kind === "apply" &&
      (item.status === "active" || item.status === "stopping"),
  );

  if (input.discoveryRunPending && !hasDiscoveryNow) {
    nowItems.unshift({
      id: "discovery-pending",
      title: "Starting the search",
      detail: "Opening your job sources.",
      stop: null,
      open: {
        label: "Open Find jobs",
        action: { kind: "navigate", route: discoveryRoute },
      },
    });
  }

  const visibleJobs = countDiscoveryVisibleJobs(workspace, jobIds);
  const hiddenWeaker = (workspace.discoveryJobs ?? []).filter(
    (job) =>
      jobIds.has(job.id) &&
      !job.discoveryFeedback &&
      isDiscoveryAlsoFoundResult(job),
  ).length;
  const shortlisted = countShortlistedJobs(workspace, jobIds);
  const shortlist = countShortlist(queue, workspace);
  const applicationCount = countApplicationRecords(workspace, jobIds);
  const applications = countApplications(workspace, jobIds);
  const dailyPreparationRemaining = Math.max(
    0,
    workspace.dashboard?.globalDailyApplicationPreparationCapacity?.remaining ??
      Number.POSITIVE_INFINITY,
  );
  const retryJobIdsWithinDailyLimit = applications.retryJobIds.slice(
    0,
    dailyPreparationRemaining,
  );
  const readyJobIdsWithinDailyLimit = shortlist.readyJobIds.slice(
    0,
    dailyPreparationRemaining,
  );
  const needsYouCount = countNeedsYou(workspace);
  const safeguardPauses = projectPlanSafeguardPauses(
    workspace.intelligence?.safeguards,
    workspace.campaigns,
  );
  // The same population the sidebar's Safeguards badge counts: a prepared
  // batch waiting for its sample review, a company cap, a conflict. A sample
  // review gates further application preparation, not read-only discovery.
  const safeguardBlockerCount = countSafeguardBlockers(workspace);

  const runCounts = formatRunCounts(newestRun);
  const runFinished = newestRun?.state === "completed";
  const runFailed =
    newestRun !== null &&
    (newestRun.state === "failed" ||
      newestRun.state === "cancelled" ||
      newestRun.runPhase === "interrupted");
  const lastSearchAt = newestRun?.completedAt ?? newestRun?.startedAt ?? null;
  const retryRequest = buildInterruptedSearchRetryRequest(workspace);
  const searchAgain: HomeButton = input.canRunDiscovery
    ? retryRequest === null
      ? {
          label: "Choose sources",
          action: { kind: "navigate", route: discoveryRoute },
        }
      : {
          label: "Search again",
          action: retryRequest
            ? { kind: "run_search", request: retryRequest }
            : { kind: "run_search" },
        }
    : {
        label: "Open Find jobs",
        action: { kind: "navigate", route: discoveryRoute },
      };

  // Problems: things that are wrong, each with the one place to fix it.
  const problems: HomeProblem[] = [];
  if (!setupIncomplete && failingSources.length > 0) {
    const names = failingSources.map((target) => target.label).join(", ");
    problems.push({
      id: "failing-sources",
      tone: "critical",
      text: `${plural(failingSources.length, "job source is", "job sources are")} failing: ${names}. Searches skip ${failingSources.length === 1 ? "it" : "them"} until it is fixed.`,
      button: {
        label: "Fix in Job sources",
        action: { kind: "navigate", route: profileSourcesRoute },
      },
    });
  } else if (!setupIncomplete && !searchRunning) {
    const summary = formatDiscoveryRunSourceProblemSummary(
      selectNewestSettledDiscoveryRun(workspace.recentDiscoveryRuns ?? []),
    );
    if (summary) {
      problems.push({
        id: "source-problems",
        tone: "warning",
        text: summary,
        button: {
          label: "Open job sources",
          action: { kind: "navigate", route: profileSourcesRoute },
        },
      });
    }
  }

  // The next step, in priority order: blocked things first, then whatever is
  // closest to a sent application, then finding more.
  let next: HomeNextStep;
  const dailyLimitNext: HomeNextStep = {
    id: "daily_limit",
    title: "Today's application limit is reached",
    detail:
      "Application preparation can continue after the daily limit resets, or you can change the limit in Applying settings.",
    primary: {
      label: "Open Applying settings",
      action: { kind: "navigate", route: applyingSettingsRoute },
    },
    secondary: [searchAgain],
  };
  const firstPause = safeguardPauses[0];
  if (workspace.activityControl.paused) {
    next = {
      id: "paused",
      title: "Work is paused",
      detail: "Resume to continue or start work.",
      primary: { label: "Resume", action: { kind: "resume_activity" } },
      secondary: [],
    };
  } else if (firstPause) {
    next = {
      id: "safeguards",
      title: firstPause.id.startsWith(
        `${AUTOMATIC_APPLICATION_FAILURE_PAUSE_ID}:`,
      )
        ? "A safeguard paused application work"
        : "A safeguard paused your search plan",
      detail: firstPause.explanation,
      primary: {
        label: "Open Safeguards",
        action: { kind: "navigate", route: firstPause.route },
      },
      secondary: [],
    };
  } else if (safeguardBlockerCount > 0) {
    next = {
      id: "safeguards",
      title:
        safeguardBlockerCount === 1
          ? "A safeguard is waiting on you"
          : `${safeguardBlockerCount} safeguards are waiting on you`,
      detail:
        "Review the held application work in Safeguards. This review does not block searches.",
      primary: {
        label: "Open Safeguards",
        action: {
          kind: "navigate",
          route: "/job-finder/safeguards?tab=reviews",
        },
      },
      secondary: [],
    };
  } else if (setupIncomplete) {
    next = setupFresh
      ? {
          id: "setup",
          title: "Set up your profile",
          detail:
            "Import your resume and tell Job Finder what you're looking for. Takes about five minutes.",
          primary: {
            label: "Start setup",
            action: { kind: "navigate", route: profileSetupRoute },
          },
          secondary: [],
        }
      : {
          id: "setup",
          title: "Finish setting up",
          detail: firstSetupBlocker
            ? `${getProfileSetupReadinessBlockerLabel(firstSetupBlocker.id)} in ${setupStepLabel}.`
            : `Pick up at ${setupStepLabel} to finish setup.`,
          primary: {
            label: "Continue setup",
            action: { kind: "resume_setup", step: setupStep },
          },
          secondary: [],
        };
  } else if (needsYouCount > 0) {
    next = {
      id: "needs_you",
      title:
        needsYouCount === 1
          ? "1 thing needs you"
          : `${needsYouCount} things need you`,
      detail:
        "An application is waiting on an answer or a step only you can take. Open it to keep that application moving.",
      primary: {
        label: "Open Needs you",
        action: { kind: "navigate", route: needsYouRoute },
      },
      secondary: [],
    };
  } else if (enabledSourceCount === 0) {
    next =
      savedSourceCount > 0
        ? {
            id: "sources",
            title: "Turn on a job source",
            detail:
              "Your sources are saved but none is turned on, so a search has nowhere to look.",
            primary: {
              label: "Open job sources",
              action: { kind: "navigate", route: profileSourcesRoute },
            },
            secondary: [],
          }
        : {
            id: "sources",
            title: "Add a job source",
            detail:
              "Paste a job board or careers page you already browse. Job Finder searches only the sites you add.",
            primary: {
              label: "Open job sources",
              action: { kind: "navigate", route: profileSourcesRoute },
            },
            secondary: [],
          };
  } else if (applications.readyToSend > 0) {
    const n = applications.readyToSend;
    next = {
      id: "send",
      title: `Send ${plural(n, "application")}`,
      detail:
        input.applicationAutomationMode === "confirm_before_submit"
          ? "The forms are filled in. Look each one over and give the go-ahead."
          : "The forms are filled in and the resume is attached. Press Send on each one in the browser.",
      primary: {
        label: "Open Applications",
        action: { kind: "navigate", route: applicationsRoute },
      },
      secondary: [],
    };
  } else if (applications.retryJobIds.length > 0 && !applyRunning) {
    const n = retryJobIdsWithinDailyLimit.length;
    const total = applications.retryJobIds.length;
    next =
      n === 0
        ? dailyLimitNext
        : {
            id: "retry",
            title: `Try again for ${n < total ? `${n} of ${total} applications` : plural(n, "application")}`,
            detail:
              n < total
                ? `Today's limit allows ${plural(n, "application")} now. The others stay in Applications for later.`
                : "The last attempt stopped before the form was finished. A fresh attempt starts from the listing again, in the mode chosen in Settings.",
            primary: {
              label:
                n === 1
                  ? "Try again"
                  : n < total
                    ? `Try again for ${n}`
                    : `Try again for all ${n}`,
              action: {
                kind: "apply_all",
                jobIds: retryJobIdsWithinDailyLimit,
              },
            },
            secondary: [
              {
                label: "Open Applications",
                action: { kind: "navigate", route: applicationsRoute },
              },
            ],
          };
  } else if (shortlist.reviewResumes > 0) {
    const n = shortlist.reviewResumes;
    next = {
      id: "review_resumes",
      title: `Review ${plural(n, "resume")}`,
      detail:
        "Aggressive resumes stretch toward the posting. Confirm or remove each stretched line before applying.",
      primary: {
        label: "Open Shortlisted",
        action: { kind: "navigate", route: reviewQueueRoute },
      },
      secondary: [],
    };
  } else if (shortlist.readyToApply > 0 && !applyRunning) {
    const n = readyJobIdsWithinDailyLimit.length;
    const total = shortlist.readyToApply;
    next =
      n === 0
        ? dailyLimitNext
        : {
            id: "apply",
            title: `Apply to ${n < total ? `${n} of ${total} ready jobs` : plural(n, "ready job")}`,
            detail:
              n < total
                ? `Today's limit allows ${plural(n, "application")} now. The others stay in Shortlisted for later. ${describeApplyMode(input.applicationAutomationMode)}`
                : `${describeApplyMode(input.applicationAutomationMode)} Change this in Settings.`,
            primary: {
              label:
                n === 1
                  ? "Apply now"
                  : n < total
                    ? `Apply to ${n}`
                    : `Apply to all ${n}`,
              action: {
                kind: "apply_all",
                jobIds: readyJobIdsWithinDailyLimit,
              },
            },
            secondary: [
              {
                label: "Open Shortlisted",
                action: { kind: "navigate", route: reviewQueueRoute },
              },
            ],
          };
  } else if (shortlist.missingResumes > 0 && !resumesWriting) {
    const n = shortlist.missingResumes;
    next = {
      id: "create_resumes",
      title: `Create ${plural(n, "resume")}`,
      detail:
        "About a minute each, written here while you wait. To change a job's resume level first, open Shortlisted.",
      primary: {
        label: n === 1 ? "Create the resume" : `Create ${n} resumes`,
        action: { kind: "create_resumes" },
      },
      secondary: [
        {
          label: "Open Shortlisted",
          action: { kind: "navigate", route: reviewQueueRoute },
        },
      ],
    };
  } else if (applyRunning) {
    next = {
      id: "wait_apply",
      title: "Nothing needed from you right now",
      detail:
        "Job Finder is working through your applications. It will show up here if one needs you.",
      primary: {
        label: "Open Applications",
        action: { kind: "navigate", route: applicationsRoute },
      },
      secondary: [],
    };
  } else if (resumesWriting) {
    next = {
      id: "wait_resumes",
      title: "Nothing needed from you right now",
      detail:
        "The resumes are being written. Apply is the next step once they are ready.",
      primary: {
        label: "Open Shortlisted",
        action: { kind: "navigate", route: reviewQueueRoute },
      },
      secondary: [],
    };
  } else if (searchRunning) {
    next = {
      id: "wait_search",
      title: "Nothing needed from you right now",
      detail:
        "Results land in Find jobs as each source finishes. You can start shortlisting while it runs.",
      primary: {
        label: "Open Find jobs",
        action: { kind: "navigate", route: discoveryRoute },
      },
      secondary: [],
    };
  } else if (!hasSearchHistory) {
    next = {
      id: "first_search",
      title: "Run your first search",
      detail: `Job Finder searches ${plural(enabledSourceCount, "source")} with your profile and lists what it finds in Find jobs.`,
      primary: input.canRunDiscovery
        ? { label: "Search now", action: { kind: "run_search" } }
        : {
            label: "Open Find jobs",
            action: { kind: "navigate", route: discoveryRoute },
          },
      secondary: [],
    };
  } else if (runFailed) {
    next = {
      id: "search_failed",
      title:
        newestRun?.runPhase === "interrupted" ||
        newestRun?.state === "cancelled"
          ? "Your last search stopped early"
          : "Your last search failed",
      detail:
        retryRequest === null
          ? "The sources it used are no longer enabled. Choose which sources to search."
          : "Run it again to pick up the openings it missed.",
      primary: searchAgain,
      secondary: [],
    };
  } else if (runFinished && visibleJobs === 0 && runNewCount(newestRun) === 0) {
    next = {
      id: "nothing_found",
      title: "Your search found nothing new",
      detail:
        "Try again later, add another job source, or widen the roles and places in your profile.",
      primary: searchAgain,
      secondary: [
        {
          label: "Open job sources",
          action: { kind: "navigate", route: profileSourcesRoute },
        },
      ],
    };
  } else if (visibleJobs > 0 && shortlisted === 0) {
    next = {
      id: "look_through",
      title: `Look through ${plural(visibleJobs, "job")}`,
      detail:
        "Shortlist the ones you want to apply to. Job Finder writes a resume for each and applies.",
      primary: {
        label: "Open Find jobs",
        action: { kind: "navigate", route: discoveryRoute },
      },
      secondary: [searchAgain],
    };
  } else {
    next = {
      id: "caught_up",
      title: "All caught up",
      detail:
        shortlisted > 0
          ? "Every shortlisted job is in Applications. Search again for new openings, or shortlist more from Find jobs."
          : "Nothing is waiting on you. Search again for new openings.",
      primary: searchAgain,
      secondary: [
        {
          label: `Open Find jobs`,
          action: { kind: "navigate", route: discoveryRoute },
        },
      ],
    };
  }

  // Searching again is always one press for a returning person (the search
  // loop is the product), so every step that is not itself a search, a wait,
  // or a blocker carries it as a quiet second button.
  if (
    hasSearchHistory &&
    !searchRunning &&
    ["send", "retry", "review_resumes", "apply", "create_resumes"].includes(
      next.id,
    )
  ) {
    next = { ...next, secondary: [...next.secondary, searchAgain] };
  }

  // What is going on, in one sentence.
  const paused = workspace.activityControl.paused;
  let statusLine: string;
  if (paused) {
    statusLine =
      "Paused. New searches and applications will not start until you resume.";
  } else if (nowItems.length === 1 && nowItems[0]) {
    statusLine = `${nowItems[0].title} · ${nowItems[0].detail}`.replace(
      /\.?$/,
      ".",
    );
  } else if (nowItems.length > 1) {
    statusLine = `${nowItems.length} things are running. Nothing needs you yet.`;
  } else if (setupIncomplete) {
    statusLine = setupFresh
      ? "Nothing here yet. Set up your profile to start."
      : "Setup is not finished yet.";
  } else if (enabledSourceCount === 0) {
    statusLine = "No job source is turned on, so nothing can be searched.";
  } else if (!hasSearchHistory) {
    statusLine = `Ready to search ${plural(enabledSourceCount, "source")}. Nothing has been searched yet.`;
  } else if (newestRun && lastSearchAt) {
    const when = formatRelativeDay(lastSearchAt, now);
    const verb = runFailed
      ? newestRun.runPhase === "interrupted" || newestRun.state === "cancelled"
        ? "stopped early"
        : "failed"
      : "finished";
    statusLine = `Last search ${verb} ${when}${runCounts ? ` · ${runCounts}` : ""}.`;
  } else {
    statusLine = "Nothing is running.";
  }

  const stages: HomeStage[] | null =
    hasSearchHistory ||
    visibleJobs > 0 ||
    shortlisted > 0 ||
    applicationCount > 0
      ? [
          {
            id: "discovery",
            label: "Find jobs",
            count: visibleJobs,
            detail:
              hiddenWeaker > 0
                ? `${plural(hiddenWeaker, "weaker match", "weaker matches")} hidden`
                : null,
            route: discoveryRoute,
          },
          {
            id: "review-queue",
            label: "Shortlisted",
            count: shortlisted,
            detail: joinParts([
              shortlist.missingResumes > 0
                ? `${shortlist.missingResumes} need a resume`
                : null,
              shortlist.writing > 0
                ? `${shortlist.writing} being written`
                : null,
              shortlist.reviewResumes > 0
                ? `${shortlist.reviewResumes} to review`
                : null,
              shortlist.readyToApply > 0
                ? `${shortlist.readyToApply} ready to apply`
                : null,
              shortlist.inApplications > 0
                ? `${shortlist.inApplications} in Applications`
                : null,
            ]),
            route: reviewQueueRoute,
          },
          {
            id: "applications",
            label: "Applications",
            count: applicationCount,
            detail: joinParts([
              applications.fillingIn > 0
                ? `${applications.fillingIn} filling in`
                : null,
              applications.readyToSend > 0
                ? `${applications.readyToSend} ready to send`
                : null,
              applications.needsYou > 0
                ? `${applications.needsYou} need you`
                : null,
              applications.applied > 0
                ? `${applications.applied} applied`
                : null,
              applications.couldNotApply > 0
                ? `${applications.couldNotApply} could not apply`
                : null,
            ]),
            route: applicationsRoute,
          },
        ]
      : null;

  return {
    statusLine,
    paused,
    now: nowItems,
    problems,
    next,
    stages,
    showPlanSelector: !setupIncomplete && workspace.campaigns.length > 1,
  };
}
