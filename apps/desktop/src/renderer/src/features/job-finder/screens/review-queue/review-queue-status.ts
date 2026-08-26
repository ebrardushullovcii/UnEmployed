import type {
  BrowserSessionState,
  ReviewQueueItem,
  TailoredAsset,
} from "@unemployed/contracts";
import type { BadgeTone } from "../../lib/job-finder-types";

export const APPLICATION_PREPARATION_BATCH_LIMIT = 10;
export const TAILORED_DRAFT_PREPARATION_LIMIT = 10;

export type TailoredDraftPreparationStatus =
  | "idle"
  | "running"
  | "completed"
  | "stopped"
  | "failed";

export interface TailoredDraftPreparationViewState {
  attemptedCount: number;
  completedCount: number;
  currentIndex: number | null;
  eligibleRemainingCount: number;
  failedCount: number;
  status: TailoredDraftPreparationStatus;
  totalCount: number;
}

export interface TailoredDraftPreparationProgress {
  completedCount: number;
  currentIndex: number;
  totalCount: number;
}

export interface TailoredDraftPreparationResult {
  attemptedCount: number;
  completedCount: number;
  failedCount: number;
  failedJobIds: readonly string[];
  stopped: boolean;
  totalCount: number;
}

export interface ReviewQueueWorkflowStatus {
  label: string;
  tone: BadgeTone;
}

export interface ApplyReadinessStatus {
  label: string;
  tone: "active" | "critical" | "muted" | "positive";
}

export type ApplySupportState = "incomplete" | "manual_follow_up" | "supported";

export function getReviewQueueWorkflowStatus(
  item: ReviewQueueItem | null,
  asset?: TailoredAsset | null,
): ReviewQueueWorkflowStatus {
  if (!item) {
    return {
      label: "Choose a job",
      tone: "muted",
    };
  }

  if (hasResumeGenerationFailure(item, asset)) {
    return {
      label: "Resume issue",
      tone: "critical",
    };
  }

  if (item.assetStatus === "not_started") {
    return {
      label: "Needs resume",
      tone: "muted",
    };
  }

  if (item.assetStatus === "generating" || item.assetStatus === "queued") {
    return {
      label: "Preparing resume",
      tone: "active",
    };
  }

  if (isQueueStageReady(item)) {
    return {
      label:
        item.resumeReview.status === "original_resume"
          ? "Original resume ready"
          : "Ready to prepare",
      tone: "positive",
    };
  }

  if (item.resumeReview.status === "approved" && !item.resumeAssetId) {
    return {
      label: "Resume unavailable",
      tone: "critical",
    };
  }

  if (item.resumeReview.status === "stale") {
    return {
      label: "Out of date",
      tone: "critical",
    };
  }

  return {
    label: "Needs approval",
    tone: "active",
  };
}

export function isResumeGenerationInProgress(
  item: ReviewQueueItem | null,
): boolean {
  return item?.assetStatus === "generating" || item?.assetStatus === "queued";
}

export function needsResumeGeneration(item: ReviewQueueItem | null): boolean {
  return (
    item?.resumeApplicationMode !== "original_resume" &&
    item?.assetStatus === "not_started"
  );
}

export function hasResumeGenerationFailure(
  item: ReviewQueueItem | null,
  asset?: TailoredAsset | null,
): boolean {
  if (item?.assetStatus !== "failed") {
    return false;
  }
  // A real generation failure always persists sanitized failure detail next
  // to its failed status. A failed marker without any failure detail is a
  // restored or stale review state (the tailored draft still exists), so the
  // nearest recovery is review plus export instead of regenerating.
  if (!asset) {
    return true;
  }
  return asset.failureMessage !== null || asset.failedAt !== null;
}

export function isQueueStageReady(item: ReviewQueueItem | null): boolean {
  return Boolean(
    item &&
    item.assetStatus === "ready" &&
    item.resumeAssetId &&
    (item.resumeReview.status === "approved" ||
      item.resumeReview.status === "original_resume"),
  );
}

/**
 * A bulk draft run may only schedule a tailored job that has no existing
 * review. Failed attempts remain eligible so the user can retry them; queued,
 * generating, ready, stale, approved, and already-reviewed jobs stay out of
 * the run.
 */
export function isTailoredDraftPreparationEligible(
  item: ReviewQueueItem,
): boolean {
  return (
    item.resumeApplicationMode !== "original_resume" &&
    (item.assetStatus === "not_started" || item.assetStatus === "failed") &&
    item.resumeReview.status === "not_started"
  );
}

export function getTailoredDraftPreparationCandidates(
  queue: readonly ReviewQueueItem[],
  limit = TAILORED_DRAFT_PREPARATION_LIMIT,
): ReviewQueueItem[] {
  const boundedLimit = Math.min(
    Math.max(0, limit),
    TAILORED_DRAFT_PREPARATION_LIMIT,
  );

  if (boundedLimit === 0) {
    return [];
  }

  const seenJobIds = new Set<string>();
  const candidates: ReviewQueueItem[] = [];

  for (const item of queue) {
    if (
      seenJobIds.has(item.jobId) ||
      !isTailoredDraftPreparationEligible(item)
    ) {
      continue;
    }

    seenJobIds.add(item.jobId);
    candidates.push(item);

    if (candidates.length >= boundedLimit) {
      break;
    }
  }

  return candidates;
}

export function countTailoredDraftPreparationEligible(
  queue: readonly ReviewQueueItem[],
): number {
  const seenJobIds = new Set<string>();
  let count = 0;

  for (const item of queue) {
    if (
      seenJobIds.has(item.jobId) ||
      !isTailoredDraftPreparationEligible(item)
    ) {
      continue;
    }

    seenJobIds.add(item.jobId);
    count += 1;
  }

  return count;
}

export function countQueueStageReady(
  queue: readonly ReviewQueueItem[],
): number {
  const seenJobIds = new Set<string>();
  let count = 0;

  for (const item of queue) {
    if (seenJobIds.has(item.jobId)) {
      continue;
    }

    seenJobIds.add(item.jobId);
    if (isQueueStageReady(item)) {
      count += 1;
    }
  }

  return count;
}

export async function prepareTailoredDraftsSequentially(
  queue: readonly ReviewQueueItem[],
  onGenerateResume: (jobId: string) => Promise<boolean>,
  options: {
    onProgress?: (progress: TailoredDraftPreparationProgress) => void;
    shouldStop?: () => boolean;
  } = {},
): Promise<TailoredDraftPreparationResult> {
  const candidates = getTailoredDraftPreparationCandidates(queue);
  let attemptedCount = 0;
  let completedCount = 0;
  const failedJobIds: string[] = [];
  let stopped = false;

  for (const [index, item] of candidates.entries()) {
    if (options.shouldStop?.()) {
      stopped = true;
      break;
    }

    attemptedCount += 1;
    options.onProgress?.({
      completedCount,
      currentIndex: index + 1,
      totalCount: candidates.length,
    });

    let succeeded = false;
    try {
      succeeded = await onGenerateResume(item.jobId);
    } catch {
      succeeded = false;
    }

    if (!succeeded) {
      failedJobIds.push(item.jobId);
      continue;
    }

    completedCount += 1;
  }

  return {
    attemptedCount,
    completedCount,
    failedCount: failedJobIds.length,
    failedJobIds,
    stopped,
    totalCount: candidates.length,
  };
}

function formatEligibleRemainderSentence(count: number): string {
  const safeCount = Math.max(0, count);
  return safeCount === 1
    ? "1 eligible job remains for another run."
    : `${safeCount} eligible jobs remain for another run.`;
}

/**
 * Result copy for a finished tailored-draft batch. A run that attempted every
 * candidate never reports "Stopped": failures continue the batch, and failed
 * jobs stay eligible so the exact remainder can be rerun.
 */
export function getTailoredDraftPreparationResultMessage(
  state: TailoredDraftPreparationViewState,
): string | null {
  if (
    state.status !== "completed" &&
    state.status !== "failed" &&
    state.status !== "stopped"
  ) {
    return null;
  }

  const completedCount = Math.max(0, state.completedCount);
  const failedCount = Math.max(0, state.failedCount);
  const eligibleRemainingCount = Math.max(0, state.eligibleRemainingCount);
  const completedDrafts = `${completedCount} tailored draft${completedCount === 1 ? "" : "s"}`;
  const remainderSentence =
    eligibleRemainingCount > 0
      ? ` ${formatEligibleRemainderSentence(eligibleRemainingCount)}`
      : "";

  if (state.status === "completed") {
    return `Prepared ${completedDrafts}.${remainderSentence} Each draft still needs your review and approval. Nothing was approved, queued, submitted, or sent.`;
  }

  if (state.status === "stopped") {
    return `Stopped after ${completedCount} completed draft${completedCount === 1 ? "" : "s"}. Nothing was approved, queued, submitted, or sent.`;
  }

  const ranToCompletion = state.attemptedCount >= state.totalCount;
  const leadSentence = ranToCompletion
    ? `Prepared ${completedDrafts}; ${failedCount} failed.`
    : `Stopped after ${completedCount} completed draft${completedCount === 1 ? "" : "s"}; ${failedCount} failed.`;

  return `${leadSentence}${remainderSentence} Fix the failed job${failedCount === 1 ? "" : "s"} and rerun to target only remaining eligible jobs. Nothing was approved, queued, submitted, or sent.`;
}

export function getApplyReadinessStatus(params: {
  applySupportState: ApplySupportState;
  browserSession: BrowserSessionState;
  hasGenerationFailure: boolean;
  hasReadyApprovedAsset: boolean;
  isGenerating: boolean;
  needsGeneration: boolean;
  resumeReviewStatus: ReviewQueueItem["resumeReview"]["status"] | "not_started";
  selectedItem: ReviewQueueItem | null;
}): ApplyReadinessStatus {
  const {
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isGenerating,
    needsGeneration,
    resumeReviewStatus,
    selectedItem,
  } = params;

  if (!selectedItem) {
    return {
      label: "Choose a job",
      tone: "muted",
    };
  }

  if (hasGenerationFailure) {
    return {
      label: "Resume issue",
      tone: "critical",
    };
  }

  if (needsGeneration) {
    return {
      label: "Needs resume",
      tone: "muted",
    };
  }

  if (isGenerating) {
    return {
      label: "Preparing resume",
      tone: "active",
    };
  }

  if (!hasReadyApprovedAsset) {
    return {
      label: resumeReviewStatus === "stale" ? "Out of date" : "Needs approval",
      tone: "critical",
    };
  }

  if (applySupportState === "incomplete") {
    return {
      label: "Job data missing",
      tone: "critical",
    };
  }

  if (applySupportState === "manual_follow_up") {
    if (browserSession.status === "blocked") {
      return {
        label: "Browser blocked",
        tone: "critical",
      };
    }

    if (browserSession.status === "login_required") {
      return {
        label: "Browser requires sign-in",
        tone: "active",
      };
    }

    return {
      label:
        browserSession.status === "unknown"
          ? "Browser not open"
          : "Live form check",
      tone: "active",
    };
  }

  if (browserSession.status === "ready") {
    return {
      label: "Ready to prepare",
      tone: "positive",
    };
  }

  if (browserSession.status === "unknown") {
    return {
      label: "Browser not open",
      tone: "active",
    };
  }

  if (browserSession.status === "login_required") {
    return {
      label: "Browser requires sign-in",
      tone: "active",
    };
  }

  return {
    label: "Browser blocked",
    tone: "critical",
  };
}
