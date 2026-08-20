import type {
  BrowserSessionState,
  ReviewQueueItem,
} from "@unemployed/contracts";
import type { BadgeTone } from "../../lib/job-finder-types";

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
  failedJobId: string | null;
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
): ReviewQueueWorkflowStatus {
  if (!item) {
    return {
      label: "Choose a job",
      tone: "muted",
    };
  }

  if (item.assetStatus === "failed") {
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
          ? "Original CV ready"
          : "Ready to apply",
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
): boolean {
  return item?.assetStatus === "failed";
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
  let failedJobId: string | null = null;
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
      failedJobId = item.jobId;
      break;
    }

    completedCount += 1;
  }

  if (!failedJobId && completedCount < candidates.length && !stopped) {
    stopped = Boolean(options.shouldStop?.());
  }

  return {
    attemptedCount,
    completedCount,
    failedCount: failedJobId ? 1 : 0,
    failedJobId,
    stopped,
    totalCount: candidates.length,
  };
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
      label: "Ready to start",
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
