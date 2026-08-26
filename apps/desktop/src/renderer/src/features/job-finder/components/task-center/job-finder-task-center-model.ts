import type {
  ApplyRunSummary,
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  JobFinderWorkspaceSnapshot,
  ResumeImportProgressEvent,
  ResumeImportRun,
} from "@unemployed/contracts";
import { countActiveSafeguardBlockers } from "../../lib/safeguards-blocker-count";
import {
  formatDiscoveryRunCountLabel,
  getDiscoveryRunCountEvidence,
} from "../../lib/discovery-run-count-label";
import type { TailoredDraftPreparationViewState } from "../../screens/review-queue/review-queue-status";

export type JobFinderTaskKind =
  | "discovery"
  | "resume_import"
  | "apply"
  | "safeguards"
  | "tailored_drafts";
export type JobFinderTaskStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export interface JobFinderTaskCenterItem {
  id: string;
  kind: JobFinderTaskKind;
  title: string;
  status: JobFinderTaskStatus;
  stageLabel: string;
  sourceLabel: string;
  countLabel: string;
  historyEstimateLabel: string | null;
  canCancel: boolean;
  cancelKind: "discovery" | "apply" | "tailored_drafts" | null;
  resumeRoute: string | null;
  resumeActionLabel: string | null;
}

export interface JobFinderTaskCenterModel {
  activeCount: number;
  items: readonly JobFinderTaskCenterItem[];
}

export interface BuildJobFinderTaskCenterModelInput {
  workspace: JobFinderWorkspaceSnapshot;
  isDiscoveryPending: boolean;
  isResumeImportPending: boolean;
  liveDiscoveryEvents?: readonly DiscoveryActivityEvent[] | undefined;
  resumeImportProgress?: ResumeImportProgressEvent | null | undefined;
  tailoredDraftPreparation?:
    | TailoredDraftPreparationViewState
    | null
    | undefined;
}

const discoveryStageLabels: Record<DiscoveryActivityEvent["stage"], string> = {
  planning: "Planning sources",
  target: "Checking source",
  navigation: "Opening listings",
  extraction: "Reading listings",
  scoring: "Scoring matches",
  persistence: "Saving results",
  run: "Finishing search",
};

const resumeStageLabels: Record<ResumeImportProgressEvent["stage"], string> = {
  saving_file: "Saving selected file",
  reading_document: "Reading resume",
  building_profile: "Building profile suggestions",
  saving_results: "Saving review items",
};

function timestamp(value: string): number {
  return new Date(value).getTime();
}

function newestBy<T>(
  values: readonly T[],
  getTimestamp: (value: T) => string,
): T | null {
  return values.reduce<T | null>((latest, value) => {
    if (
      !latest ||
      timestamp(getTimestamp(value)) > timestamp(getTimestamp(latest))
    ) {
      return value;
    }

    return latest;
  }, null);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) {
    return null;
  }

  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] ?? upper) + upper) / 2)
    : upper;
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1_000));
  if (seconds < 60) {
    return `about ${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0
    ? `about ${minutes}m`
    : `about ${minutes}m ${remainingSeconds}s`;
}

function historyEstimate(
  durations: readonly number[],
  singularLabel: string,
  pluralLabel: string,
  suffix = "",
): string | null {
  const typicalDuration = median(durations);
  if (typicalDuration === null) {
    return null;
  }

  const sampleLabel = durations.length === 1 ? singularLabel : pluralLabel;
  return `${formatDuration(typicalDuration)} from ${durations.length} ${sampleLabel}${suffix}`;
}

function countTargetIds(targetIds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const targetId of targetIds) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }
  return counts;
}

function sameTargetCounts(
  targetIds: readonly string[],
  expectedCounts: ReadonlyMap<string, number>,
  expectedLength: number,
): boolean {
  if (targetIds.length !== expectedLength) {
    return false;
  }

  const actualCounts = countTargetIds(targetIds);
  if (actualCounts.size !== expectedCounts.size) {
    return false;
  }

  for (const [targetId, count] of actualCounts) {
    if (expectedCounts.get(targetId) !== count) {
      return false;
    }
  }

  return true;
}

function targetSourceLabel(
  workspace: JobFinderWorkspaceSnapshot,
  targetIds: readonly string[],
): string {
  const targetLabels = new Map(
    (workspace.searchPreferences.discovery.targets ?? []).map((target) => [
      target.id,
      target.label,
    ]),
  );
  const labels = targetIds
    .map((targetId) => targetLabels.get(targetId))
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    return "Configured job sources";
  }

  if (labels.length <= 2) {
    return labels.join(" and ");
  }

  return `${labels[0]} and ${labels.length - 1} more sources`;
}

function discoveryStatus(
  run: DiscoveryRunRecord | null,
  isPending: boolean,
): JobFinderTaskStatus {
  if (isPending) {
    return "active";
  }

  if (!run || run.state === "idle") {
    return "interrupted";
  }

  if (run.state === "running") {
    return "interrupted";
  }

  return run.state;
}

function buildDiscoveryTask(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterItem | null {
  const recentRuns = input.workspace.recentDiscoveryRuns ?? [];
  const liveEvent = input.liveDiscoveryEvents?.at(-1) ?? null;
  const run =
    input.workspace.activeDiscoveryRun ??
    (liveEvent
      ? (recentRuns.find((candidate) => candidate.id === liveEvent.runId) ??
        null)
      : null) ??
    newestBy(recentRuns, (candidate) => candidate.startedAt);

  if (!run && !input.isDiscoveryPending && !liveEvent) {
    return null;
  }

  const targetIds = run?.targetIds.length
    ? run.targetIds
    : liveEvent?.targetId
      ? [liveEvent.targetId]
      : [];
  const targetIdCounts = countTargetIds(targetIds);
  const countEvidence = getDiscoveryRunCountEvidence(run, liveEvent);
  const targetsPlanned = run?.summary.targetsPlanned || targetIds.length;
  const targetsCompleted = run?.summary.targetsCompleted ?? 0;
  const status = discoveryStatus(
    run,
    input.isDiscoveryPending || Boolean(liveEvent),
  );
  const compatibleHistory = recentRuns.filter(
    (candidate) =>
      candidate.id !== run?.id &&
      candidate.state === "completed" &&
      candidate.summary.durationMs > 0 &&
      (targetIds.length === 0 ||
        sameTargetCounts(
          candidate.targetIds,
          targetIdCounts,
          targetIds.length,
        )),
  );
  const canCancel = status === "active" && input.isDiscoveryPending;
  const canRunAgain = ["cancelled", "failed", "interrupted"].includes(status);

  return {
    id: run?.id ?? liveEvent?.runId ?? "discovery-current",
    kind: "discovery",
    title: "Job search",
    status,
    stageLabel:
      status === "active"
        ? liveEvent
          ? discoveryStageLabels[liveEvent.stage]
          : "Starting search"
        : status === "completed"
          ? "Search completed"
          : status === "cancelled"
            ? "Search cancelled"
            : status === "failed"
              ? "Search failed"
              : "Search interrupted",
    sourceLabel: targetSourceLabel(input.workspace, targetIds),
    countLabel:
      targetsPlanned > 0
        ? `${targetsCompleted} of ${targetsPlanned} sources finished · ${formatDiscoveryRunCountLabel(countEvidence)}`
        : formatDiscoveryRunCountLabel(countEvidence),
    historyEstimateLabel:
      status === "active"
        ? historyEstimate(
            compatibleHistory.map((candidate) => candidate.summary.durationMs),
            "similar completed search",
            "similar completed searches",
          )
        : null,
    canCancel,
    cancelKind: canCancel ? "discovery" : null,
    resumeRoute: canRunAgain ? "/job-finder/discovery" : null,
    resumeActionLabel: canRunAgain ? "Open Find jobs" : null,
  };
}

function isCompletedResumeRun(run: ResumeImportRun): boolean {
  return run.status === "review_ready" || run.status === "applied";
}

function resumeStatus(
  run: ResumeImportRun | null,
  isPending: boolean,
): JobFinderTaskStatus {
  if (isPending) {
    return "active";
  }

  if (!run) {
    return "interrupted";
  }

  if (isCompletedResumeRun(run)) {
    return "completed";
  }

  if (run.status === "failed") {
    return "failed";
  }

  return "interrupted";
}

function buildResumeTask(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterItem | null {
  const run = input.workspace.latestResumeImportRun;
  if (!run && !input.isResumeImportPending) {
    return null;
  }

  const status = resumeStatus(run, input.isResumeImportPending);
  const count = run?.candidateCounts;
  const canRestart = status === "failed" || status === "interrupted";
  const historicalDuration =
    input.isResumeImportPending &&
    run &&
    isCompletedResumeRun(run) &&
    run.timing?.totalMs
      ? [run.timing.totalMs]
      : [];

  return {
    id: input.isResumeImportPending
      ? "resume-import-current"
      : (run?.id ?? "resume-import-interrupted"),
    kind: "resume_import",
    title: "Resume import",
    status,
    stageLabel:
      status === "active"
        ? input.resumeImportProgress
          ? resumeStageLabels[input.resumeImportProgress.stage]
          : "Waiting for file selection"
        : status === "completed"
          ? "Ready for review"
          : status === "failed"
            ? "Import failed"
            : "Import interrupted",
    sourceLabel:
      input.isResumeImportPending && (!run || isCompletedResumeRun(run))
        ? "Selected resume file"
        : (run?.sourceResumeFileName ?? "Selected resume file"),
    countLabel:
      !input.isResumeImportPending && count && count.total > 0
        ? `${count.autoApplied} accepted · ${count.needsReview} need review · ${count.total} extracted`
        : "Counts available after extraction",
    historyEstimateLabel:
      status === "active"
        ? historyEstimate(
            historicalDuration,
            "previous completed import",
            "previous completed imports",
          )
        : null,
    canCancel: false,
    cancelKind: null,
    resumeRoute: canRestart ? "/job-finder/profile" : null,
    resumeActionLabel: canRestart ? "Open Profile" : null,
  };
}

function applyStatus(run: ApplyRunSummary): JobFinderTaskStatus {
  if (
    run.state === "paused_for_user_review" ||
    run.state === "paused_for_consent"
  ) {
    return "paused";
  }

  if (run.state === "completed") {
    return "completed";
  }

  if (run.state === "cancelled" || run.state === "failed") {
    return run.state;
  }

  return "active";
}

function applySourceLabel(
  workspace: JobFinderWorkspaceSnapshot,
  jobId: string | null,
): string {
  if (!jobId) {
    return "Applications";
  }

  const job = workspace.discoveryJobs.find(
    (candidate) => candidate.id === jobId,
  );
  if (job) {
    return `${job.company ?? "Employer"} · ${job.title}`;
  }

  const application = workspace.applicationRecords.find(
    (candidate) => candidate.jobId === jobId,
  );
  return application
    ? `${application.company} · ${application.title}`
    : "Applications";
}

function applyDuration(run: ApplyRunSummary): number | null {
  if (!run.completedAt) {
    return null;
  }

  return Math.max(0, timestamp(run.completedAt) - timestamp(run.createdAt));
}

function buildApplyTask(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterItem | null {
  const runs = input.workspace.applyRuns ?? [];
  const run = newestBy(runs, (candidate) => candidate.updatedAt);
  if (!run) {
    return null;
  }

  const status = applyStatus(run);
  const finishedJobs = Math.max(0, run.totalJobs - run.pendingJobs);
  const canCancel = status === "active" || status === "paused";
  const needsReview = status === "paused";
  const canRestage = status === "cancelled" || status === "failed";
  const historyDurations = runs
    .filter(
      (candidate) =>
        candidate.id !== run.id &&
        candidate.mode === run.mode &&
        candidate.state === "completed",
    )
    .map(applyDuration)
    .filter(
      (duration): duration is number => duration !== null && duration > 0,
    );

  return {
    id: run.id,
    kind: "apply",
    title: "Applications",
    status,
    stageLabel:
      run.state === "draft"
        ? "Ready to start"
        : run.state === "awaiting_submit_approval"
          ? "Waiting for your approval"
          : run.state === "running"
            ? "Opening application"
            : run.state === "paused_for_user_review"
              ? "Waiting for your review"
              : run.state === "paused_for_consent"
                ? "Waiting for your consent"
                : run.state === "completed"
                  ? "Ready for final review"
                  : run.state === "cancelled"
                    ? "Application stopped"
                    : "Application needs attention",
    sourceLabel: applySourceLabel(
      input.workspace,
      run.currentJobId ?? run.jobIds[0] ?? null,
    ),
    countLabel: `${finishedJobs} of ${run.totalJobs} application tasks finished · ${run.blockedJobs} blocked · ${run.failedJobs} need attention`,
    historyEstimateLabel:
      status === "active"
        ? historyEstimate(
            historyDurations,
            "similar application task",
            "similar application tasks",
            " (total time, including pauses)",
          )
        : null,
    canCancel,
    cancelKind: canCancel ? "apply" : null,
    resumeRoute: needsReview || canRestage ? "/job-finder/applications" : null,
    resumeActionLabel: needsReview
      ? "Continue application"
      : canRestage
        ? "Open Applications"
        : null,
  };
}

function buildSafeguardTask(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterItem | null {
  const blockerCount = countActiveSafeguardBlockers(
    input.workspace.intelligence?.safeguards ?? {
      companyApplicationCaps: [],
      simultaneousApplicationConflicts: [],
      listingSignals: [],
      abnormalFailurePauses: [],
      preparedBatchSampleReviews: [],
      contradictoryAnswerDetections: [],
      safeguardDismissals: [],
      updatedAt: null,
    },
  );
  if (blockerCount === 0) {
    return null;
  }

  return {
    id: "safeguards-active",
    kind: "safeguards",
    title: "Safeguards need attention",
    status: "paused",
    stageLabel: "Waiting for safeguards",
    sourceLabel:
      "Job search and applications are waiting until these are resolved.",
    countLabel: `${blockerCount} active blocker${blockerCount === 1 ? "" : "s"}`,
    historyEstimateLabel: null,
    canCancel: false,
    cancelKind: null,
    resumeRoute: "/job-finder/safeguards",
    resumeActionLabel: "Open Safeguards",
  };
}

/**
 * Tailored-draft batch progress is renderer-session state, not durable
 * history: the task is visible only while a batch is actually running so the
 * center never implies that an interrupted run survived a restart.
 */
function buildTailoredDraftsTask(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterItem | null {
  const preparation = input.tailoredDraftPreparation;
  if (!preparation || preparation.status !== "running") {
    return null;
  }

  const completedCount = Math.max(0, preparation.completedCount);
  const totalCount = Math.max(0, preparation.totalCount);
  const failedCount = Math.max(0, preparation.failedCount);

  return {
    id: "tailored-drafts-current",
    kind: "tailored_drafts",
    title: "Tailored drafts",
    status: "active",
    stageLabel: "Preparing shortlisted resumes",
    sourceLabel: "Shortlisted jobs",
    countLabel: `${completedCount} of ${totalCount} prepared${
      failedCount > 0 ? ` · ${failedCount} failed` : ""
    }`,
    historyEstimateLabel: null,
    canCancel: true,
    cancelKind: "tailored_drafts",
    resumeRoute: "/job-finder/review-queue",
    resumeActionLabel: "Open Shortlisted",
  };
}

export function buildJobFinderTaskCenterModel(
  input: BuildJobFinderTaskCenterModelInput,
): JobFinderTaskCenterModel {
  const items = [
    buildDiscoveryTask(input),
    buildResumeTask(input),
    buildApplyTask(input),
    buildTailoredDraftsTask(input),
    buildSafeguardTask(input),
  ].filter((item): item is JobFinderTaskCenterItem => item !== null);

  return {
    activeCount: items.filter(
      (item) => item.status === "active" || item.status === "paused",
    ).length,
    items,
  };
}
