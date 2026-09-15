import {
  isPreparedApplicationStatus,
  type ApplicationStatus,
  type BrowserSessionState,
  type ReviewQueueItem,
  type TailoredAsset,
} from "@unemployed/contracts";
import type { BadgeTone } from "../../lib/job-finder-types";
import { describeUntailorableListing } from "./resume-workspace-utils";

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
  /**
   * The renderer's own in-flight flag. The persisted asset status never moves
   * to "generating" during a draft, so without this the row and header kept
   * saying "Needs resume" for the whole run beside a progress bar.
   */
  isPending = false,
  /** Jobs whose application is already prepared; see isQueueStageReady. */
  preparedJobIds?: ReadonlySet<string>,
  /** Jobs with a preparation attempt that is still running. */
  applicationPreparingJobIds?: ReadonlySet<string>,
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

  if (isPending) {
    return {
      label: "Preparing resume",
      tone: "active",
    };
  }

  if (applicationPreparingJobIds?.has(item.jobId)) {
    return {
      label: "Preparing application",
      tone: "active",
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

  if (preparedJobIds?.has(item.jobId)) {
    return {
      label: "Application prepared",
      tone: "positive",
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
    // The approved draft is stale, not broken: the resume still exists and the
    // job is still reviewable, it just needs regenerating. `warning` (F44)
    // instead of the failure hue `critical` used before the tone existed.
    return {
      label: "Out of date",
      tone: "warning",
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

/**
 * Jobs whose application has already been prepared, read from the workspace's
 * application records. A prepared job must stop advertising itself as ready to
 * prepare: the Shortlisted list kept offering ten already-prepared jobs back to
 * the user, who re-prepared eight of them by accident. Only records that
 * reached preparation count — a run stopped before the draft existed leaves a
 * staged record behind, and that row has to stay preparable.
 */
export function collectPreparedApplicationJobIds(
  applicationRecords:
    | readonly {
        jobId: string;
        status: ApplicationStatus;
        lastAttemptState?: Parameters<
          typeof isPreparedApplicationStatus
        >[0]["lastAttemptState"];
      }[]
    | undefined,
): ReadonlySet<string> {
  return new Set(
    (applicationRecords ?? [])
      .filter((record) => isPreparedApplicationStatus(record))
      .map((record) => record.jobId),
  );
}

export function collectInProgressApplicationJobIds(
  applicationRecords:
    | readonly {
        jobId: string;
        lastAttemptState?: "in_progress" | string | null | undefined;
      }[]
    | undefined,
): ReadonlySet<string> {
  return new Set(
    (applicationRecords ?? [])
      .filter((record) => record.lastAttemptState === "in_progress")
      .map((record) => record.jobId),
  );
}

export function isQueueStageReady(
  item: ReviewQueueItem | null,
  preparedJobIds?: ReadonlySet<string>,
): boolean {
  if (!item || preparedJobIds?.has(item.jobId)) {
    return false;
  }

  // A job set to apply with the original resume already has its resume file:
  // the one the person uploaded. It has no tailored draft and never will, so
  // requiring a ready generated asset left six such rows unselectable under a
  // sentence that named the unchanged original resume as qualifying, beside a
  // batch card explaining there was no draft to write.
  if (item.resumeApplicationMode === "original_resume") {
    return true;
  }

  return Boolean(
    item.assetStatus === "ready" &&
    item.resumeAssetId &&
    (item.resumeReview.status === "approved" ||
      item.resumeReview.status === "draft" ||
      item.resumeReview.status === "needs_review" ||
      item.resumeReview.status === "original_resume"),
  );
}

/**
 * The one sentence that says a shortlisted job cannot join a preparation
 * batch. The row's disabled reason and the batch card read it from here, so
 * the row can never name a resume state the batch does not accept.
 */
export const QUEUE_STAGE_RESUME_REQUIREMENT =
  "Batch preparation needs a ready resume file: an approved tailored PDF or unchanged original resume.";

/**
 * Why no shortlisted job can be prepared right now, in the words of what
 * would change it; null when at least one job can.
 */
export function describeQueueStagePreparationBlocker(
  queue: readonly ReviewQueueItem[],
  preparedJobIds?: ReadonlySet<string>,
): string | null {
  if (countQueueStageReady(queue, preparedJobIds) > 0) {
    return null;
  }

  if (queue.length === 0) {
    return "Shortlist a job first — preparation runs on the jobs you shortlisted.";
  }

  if (queue.every((item) => preparedJobIds?.has(item.jobId))) {
    return "An application is already prepared for every shortlisted job. Open them from Applications to continue.";
  }

  return QUEUE_STAGE_RESUME_REQUIREMENT;
}

/**
 * Shortlisted list-card caption for the resume policy. Must match readiness:
 * never say a tailored resume "will be created" when an approved PDF is ready.
 */
export function getReviewQueueResumePolicyCaption(
  item: ReviewQueueItem,
  asset?: TailoredAsset | null,
): string {
  // Nothing could be written for a job whose listing text was never captured,
  // so the row must not promise a tailored resume it is not going to produce.
  if (describeUntailorableListing(asset)) {
    return "Original wording — the listing text was not captured";
  }

  if (item.resumeApplicationMode === "original_resume") {
    return item.resumeReview.status === "original_resume"
      ? "Original resume ready"
      : "Original resume will be used unchanged";
  }

  if (isQueueStageReady(item)) {
    return item.resumeReview.status === "approved"
      ? "Approved resume ready"
      : "Tailored draft ready for your review";
  }

  if (item.assetStatus === "generating" || item.assetStatus === "queued") {
    return "Creating a tailored resume…";
  }

  if (item.resumeReview.status === "stale") {
    return "Approved resume is out of date";
  }

  if (hasResumeGenerationFailure(item)) {
    return "Tailored resume needs another try";
  }

  if (
    item.assetStatus === "ready" ||
    item.resumeReview.status === "needs_review" ||
    item.resumeReview.status === "draft" ||
    item.resumeReview.status === "approved"
  ) {
    return "Tailored draft ready for your review";
  }

  // Nothing has been requested yet; name the need, not a promised action.
  return "Needs a tailored resume";
}

/**
 * A bulk draft run may only schedule a tailored job that has no existing
 * review. Failed attempts remain eligible so the user can retry them; queued,
 * generating, ready, stale, approved, and already-reviewed jobs stay out of
 * the run.
 */
export function isTailoredDraftPreparationEligible(
  item: ReviewQueueItem,
  /**
   * Jobs whose application is already prepared, read from the application
   * records — the SAME set `isQueueStageReady` is given. Both counts on the
   * batch card now come off one population, so "0 eligible · 12 ready to
   * prepare" can no longer be two answers about jobs that overlap.
   */
  preparedJobIds?: ReadonlySet<string>,
): boolean {
  if (preparedJobIds?.has(item.jobId)) {
    return false;
  }

  return (
    item.resumeApplicationMode !== "original_resume" &&
    (item.assetStatus === "not_started" || item.assetStatus === "failed") &&
    item.resumeReview.status === "not_started"
  );
}

/**
 * Why the batch-draft button cannot run, in the words of what would change it.
 * A permanently greyed control beside a number the person cannot act on is the
 * shape of the defect this replaces; null means the button is live.
 */
export function describeTailoredDraftPreparationBlocker(
  queue: readonly ReviewQueueItem[],
  preparedJobIds?: ReadonlySet<string>,
): string | null {
  if (countTailoredDraftPreparationEligible(queue, preparedJobIds) > 0) {
    return null;
  }

  if (queue.length === 0) {
    return "Shortlist a job first — this writes the first draft for jobs that have none.";
  }

  const allOriginalResume = queue.every(
    (item) => item.resumeApplicationMode === "original_resume",
  );
  if (allOriginalResume) {
    return "Every shortlisted job is set to use your original resume, so there is no draft to write. Switch a job to a tailored resume to use this.";
  }

  return "Every shortlisted job already has a draft. This only writes first drafts for jobs that have none.";
}

export function getTailoredDraftPreparationCandidates(
  queue: readonly ReviewQueueItem[],
  limit = TAILORED_DRAFT_PREPARATION_LIMIT,
  preparedJobIds?: ReadonlySet<string>,
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
      !isTailoredDraftPreparationEligible(item, preparedJobIds)
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
  preparedJobIds?: ReadonlySet<string>,
): number {
  const seenJobIds = new Set<string>();
  let count = 0;

  for (const item of queue) {
    if (
      seenJobIds.has(item.jobId) ||
      !isTailoredDraftPreparationEligible(item, preparedJobIds)
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
  preparedJobIds?: ReadonlySet<string>,
): number {
  const seenJobIds = new Set<string>();
  let count = 0;

  for (const item of queue) {
    if (seenJobIds.has(item.jobId)) {
      continue;
    }

    seenJobIds.add(item.jobId);
    if (isQueueStageReady(item, preparedJobIds)) {
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

  // An in-flight run wins over "Needs resume": both flags are true while a
  // draft is being written, and the readiness description already orders
  // them this way.
  if (isGenerating) {
    return {
      label: "Preparing resume",
      tone: "active",
    };
  }

  if (needsGeneration) {
    return {
      label: "Needs resume",
      tone: "muted",
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
