import type {
  ApplicationRecord,
  ApplicationPrivacyReceipt,
  ApplyRunDetails,
  ApplySubmitApproval,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import {
  CONFIRM_STEP_DONE_ACTION,
  FINISH_IN_JOB_FINDER_BROWSER_INSTRUCTION,
  JOB_FINDER_BROWSER_NAME,
  JOB_FINDER_BROWSER_OPENED_STATUS,
  RUN_PREPARATION_AGAIN_ACTION,
} from "../../lib/job-finder-browser-handoff-copy";
import { formatApplicationEmployerAriaLabel } from "../../lib/job-employer-location-display";
import { formatStatusLabel } from "../../lib/job-finder-utils";

export type QueueEntry = {
  jobId: string;
  label: string;
  runResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
  includeInRecovery: boolean;
};

const APPLY_TRANSPORT_LANGUAGE =
  /\b(?:post|xhr|xmlhttprequest|fetch|network request|mutating page action|prepare-only (?:safety )?guard)\b/i;

const SERVICE_WORKER_BLOCK_PATTERN = /service worker/i;

const MANUAL_FIELD_FINISH_PATTERN =
  /prefilled application values need manual review|conflicting (?:application )?fields|mismatched prefilled|could not safely save (?:a |this )?prepared (?:field|step)|complete the affected step manually|review the conflicting|finish (?:this |the )?application(?: step)? yourself|finish .+ manually in the open application/i;

/**
 * A prepare-only autosave / intermediate-write pause: the job site tried to
 * persist a field on its own and Job Finder had no authority for that write.
 * Nothing conflicted with the saved profile; the user simply finishes in the
 * open browser.
 */
const FIELD_SAVE_PAUSE_PATTERN =
  /could not safely save (?:a |this )?prepared (?:field|step)|did not have permission for that external save|tried to save .+ while it was being prepared|paused before the application field could be saved|intermediate[_ -]write|autosave|field[_ -]save/i;

const FIELD_CONFLICT_PATTERN =
  /prefilled application values need manual review|conflicting (?:application )?fields|mismatched prefilled|do not match the exact saved candidate profile|review the conflicting/i;

const BACKGROUND_PAGE_PAUSE_PATTERN =
  /blocked a background page request|blocked a form submission before your review/i;

export function applyResultIsBackgroundPagePause(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  return Boolean(
    result && BACKGROUND_PAGE_PAUSE_PATTERN.test(getApplyResultCorpus(result)),
  );
}

export const BACKGROUND_PAGE_PAUSE_ACTION =
  "Open a fresh application page in the Job Finder browser. Review the fields and attach your approved resume there before sending it.";

const BACKGROUND_PAGE_PAUSE_REASON =
  "Job Finder could not continue preparing this page automatically. No application was sent.";

/** Plain-language next action when a job site blocks automatic preparation. */
export const SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP = `This job site blocked automatic prep. Reset ${JOB_FINDER_BROWSER_NAME} in Safeguards, then finish the application on the site yourself.`;

/** Compact list-row next step for the same site-blocked pause. */
export const SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP = `Open Safeguards to reset ${JOB_FINDER_BROWSER_NAME}, then finish on the site`;

export const SITE_BLOCKED_AUTOMATIC_PREP_GUIDANCE =
  SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP;

/**
 * Detects site-blocked finish-yourself pauses from persisted application
 * record fields when the matching apply result is not in scope (list rows).
 */
export function applicationRecordLooksSiteBlocked(
  record: Pick<
    ApplicationRecord,
    "lastActionLabel" | "latestBlocker" | "nextActionLabel"
  >,
): boolean {
  const corpus = [
    record.nextActionLabel,
    record.lastActionLabel,
    record.latestBlocker?.summary,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");

  return (
    SERVICE_WORKER_BLOCK_PATTERN.test(corpus) ||
    /job site blocked|inspect the application page manually|reset (?:the (?:job finder )?)?browser in safeguards/i.test(
      corpus,
    )
  );
}

/**
 * Plain-language next action when field conflicts or a blocked save need the
 * user. It names the window, says it is separate, and names the exact confirm
 * action they come back to — the round-eight review found the instruction
 * pointing at a window the user was never told existed.
 */
export const MANUAL_FIELD_FINISH_NEXT_STEP = `Review and fix the conflicting or unfinished fields in ${JOB_FINDER_BROWSER_NAME} — a separate window outside this app — then come back here and choose "${CONFIRM_STEP_DONE_ACTION}".`;

export const MANUAL_FIELD_FINISH_GUIDANCE = `${MANUAL_FIELD_FINISH_NEXT_STEP} Use "${RUN_PREPARATION_AGAIN_ACTION}" only if you want a fresh run after that.`;

/** One-line reason shown directly under the Next step heading for field conflicts. */
export const MANUAL_FIELD_CONFLICT_REASON =
  "Some prefilled values on the job site do not match your saved profile.";

/** One-line reason shown directly under the Next step heading for an autosave pause. */
export const FIELD_SAVE_PAUSE_REASON =
  "The job site tried to save a field automatically. Job Finder stopped to keep everything in your hands.";

/** The action that follows the autosave-pause reason. */
export const FIELD_SAVE_PAUSE_ACTION = FINISH_IN_JOB_FINDER_BROWSER_INSTRUCTION;

/**
 * One event, one cause. The runtime's own wording ("the page could not safely
 * save a prepared field") reads as a site failure, while Next step says the
 * site acted and Job Finder stopped it — and the blocker code renders as
 * "Requires manual review", a third phrasing. These two short labels keep the
 * fact strip on the exact story Next step tells.
 */
export const FIELD_SAVE_PAUSE_CAUSE =
  "The job site tried to save a field automatically";

export const FIELD_SAVE_PAUSE_ACTIVITY = "Job Finder stopped before that save";

/** Plain-language next action when the job site tried an automatic field save. */
export const FIELD_SAVE_PAUSE_NEXT_STEP = `${FIELD_SAVE_PAUSE_REASON} ${FINISH_IN_JOB_FINDER_BROWSER_INSTRUCTION}`;

export const FIELD_SAVE_PAUSE_GUIDANCE = `${FIELD_SAVE_PAUSE_NEXT_STEP} Use "${RUN_PREPARATION_AGAIN_ACTION}" only if you want a fresh run after that.`;

/**
 * Local status beside the action after the Job Finder browser was asked to show
 * the application page. The shell banner already confirms that the page
 * opened and where it went, so this line says what is true now rather than
 * restating the same sentence a second way.
 */
export const FINISH_IN_BROWSER_OPENED_STATUS = JOB_FINDER_BROWSER_OPENED_STATUS;

function getApplyResultCorpus(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number],
): string {
  return [result.summary, result.detail, result.blockerSummary]
    .filter(Boolean)
    .join(" ");
}

/**
 * True only for the autosave / intermediate-write pause. Field conflicts
 * with the saved profile keep the existing conflicting-fields copy.
 */
export function applyResultIsFieldSavePause(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  if (!result || !applyResultNeedsManualFieldFinish(result)) {
    return false;
  }

  const corpus = getApplyResultCorpus(result);
  if (FIELD_CONFLICT_PATTERN.test(corpus)) {
    return false;
  }

  return FIELD_SAVE_PAUSE_PATTERN.test(corpus);
}

/** One-line reason for a manual-finish pause, or null when not a manual finish. */
export function getManualFieldFinishReason(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): string | null {
  if (!applyResultNeedsManualFieldFinish(result)) {
    return null;
  }

  if (applyResultIsBackgroundPagePause(result)) {
    return BACKGROUND_PAGE_PAUSE_REASON;
  }

  return applyResultIsFieldSavePause(result)
    ? FIELD_SAVE_PAUSE_REASON
    : MANUAL_FIELD_CONFLICT_REASON;
}

export function getManualFieldFinishNextStep(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): string {
  if (applyResultIsBackgroundPagePause(result)) {
    return `${BACKGROUND_PAGE_PAUSE_REASON} ${BACKGROUND_PAGE_PAUSE_ACTION}`;
  }
  return applyResultIsFieldSavePause(result)
    ? FIELD_SAVE_PAUSE_NEXT_STEP
    : MANUAL_FIELD_FINISH_NEXT_STEP;
}

export function getManualFieldFinishGuidance(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): string {
  if (applyResultIsBackgroundPagePause(result)) {
    return getManualFieldFinishNextStep(result);
  }
  return applyResultIsFieldSavePause(result)
    ? FIELD_SAVE_PAUSE_GUIDANCE
    : MANUAL_FIELD_FINISH_GUIDANCE;
}

/**
 * Query-free application destination recorded in the privacy receipt, or null
 * when the run never reached an employer page.
 */
export function getApplyResultDestinationUrl(
  receipt: ApplicationPrivacyReceipt | null | undefined,
): string | null {
  const destination = receipt?.destination;
  if (!destination?.origin) {
    return null;
  }

  try {
    return new URL(destination.safePath || "/", destination.origin).toString();
  } catch {
    return null;
  }
}

const APPLY_RUN_STATE_LABELS: Partial<
  Record<JobFinderWorkspaceSnapshot["applyRuns"][number]["state"], string>
> = {
  paused_for_user_review: "Paused for your review",
  paused_for_consent: "Paused for a consent decision",
  awaiting_submit_approval: "Waiting for preparation approval",
};

const APPLY_RUN_MODE_LABELS: Partial<
  Record<JobFinderWorkspaceSnapshot["applyRuns"][number]["mode"], string>
> = {
  // "Guided preparation" is a name used nowhere else in the product; every
  // other surface says preparation or "Prepare application".
  copilot: "Preparation",
  single_job_auto: "Automatic preparation",
  queue_auto: "Automatic preparation (several jobs)",
};

/** Sentence-case run state for people instead of a title-cased status code. */
export function formatApplyRunStateLabel(
  state: JobFinderWorkspaceSnapshot["applyRuns"][number]["state"],
): string {
  return APPLY_RUN_STATE_LABELS[state] ?? formatStatusLabel(state);
}

/** Sentence-case run mode for people instead of a title-cased mode code. */
export function formatApplyRunModeLabel(
  mode: JobFinderWorkspaceSnapshot["applyRuns"][number]["mode"],
): string {
  return APPLY_RUN_MODE_LABELS[mode] ?? formatStatusLabel(mode);
}

const EXTERNAL_WRITE_CATEGORY_LABELS: Record<
  ApplicationPrivacyReceipt["externalWrites"][number]["category"],
  string
> = {
  resume_attachment: "a resume attachment",
  profile_field: "profile fields",
  application_answer: "application answers",
  consent_control: "consent choices",
  other: "other prepared fields",
};

export function getVerifiedExternalWriteRecoveryText(
  receipt: ApplicationPrivacyReceipt | null | undefined,
): string {
  const verifiedCategories = [
    ...new Set(
      (receipt?.externalWrites ?? [])
        .filter((write) => write.verified)
        .map((write) => EXTERNAL_WRITE_CATEGORY_LABELS[write.category]),
    ),
  ];

  if (verifiedCategories.length === 0) {
    return "No verified writes to the employer page were recorded for this run. Check what remains on the employer site before retrying.";
  }

  return `Job Finder recorded writes to the employer page for ${verifiedCategories.join(", ")}. That does not confirm what the site kept — review the page before retrying.`;
}

export function getCustomerFacingApplyText(
  value: string | null | undefined,
  receipt?: ApplicationPrivacyReceipt | null,
): string | null {
  const text = value?.trim() ?? "";
  if (!text) {
    return null;
  }

  if (SERVICE_WORKER_BLOCK_PATTERN.test(text)) {
    return SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP;
  }

  if (!APPLY_TRANSPORT_LANGUAGE.test(text)) {
    return text;
  }

  const externalWriteText = getVerifiedExternalWriteRecoveryText(receipt);
  if (/\b(?:resume|cv|attachment|upload)\b/i.test(text)) {
    return `The selected resume could not be attached. ${externalWriteText} Approve and retry the attachment. Job Finder stopped without a submit click. Verify the outcome on the site, and treat an unexpected completed state as site behavior to report.`;
  }

  return `The application page could not safely save this prepared step. ${externalWriteText} Job Finder stopped without a submit click. Verify the outcome on the site, and treat an unexpected completed state as site behavior to report.`;
}

export function applyResultNeedsResumeAttachment(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  if (!result) {
    return false;
  }

  if (
    result.state === "blocked" ||
    result.state === "failed" ||
    // The real-CV guard can stop at review with a required human decision;
    // those results must still offer the CV-specific approve/retry CTA.
    (result.state === "awaiting_review" &&
      result.blockerReason === "required_human_input")
  ) {
    const text = [result.summary, result.detail, result.blockerSummary]
      .filter(Boolean)
      .join(" ");
    return (
      /\b(?:resume|cv)\b/i.test(text) &&
      /\b(?:not attached|attach(?:ment)? needs|could not be attached|retry.*attach|upload.*failed)\b/i.test(
        text,
      )
    );
  }

  return false;
}

export function applyResultIsServiceWorkerBlocked(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  if (!result) {
    return false;
  }

  return SERVICE_WORKER_BLOCK_PATTERN.test(
    [result.summary, result.detail, result.blockerSummary]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Paused because fields conflict with the saved profile or a prepare-only save
 * stopped for manual finish — not a site-block, and not a resume-attachment
 * retry path where preparation is still the right primary action.
 */
export function applyResultNeedsManualFieldFinish(
  result: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null,
): boolean {
  if (!result) {
    return false;
  }

  if (
    applyResultIsServiceWorkerBlocked(result) ||
    applyResultNeedsResumeAttachment(result)
  ) {
    return false;
  }

  return (
    applyResultIsBackgroundPagePause(result) ||
    MANUAL_FIELD_FINISH_PATTERN.test(
      [result.summary, result.detail, result.blockerSummary]
        .filter(Boolean)
        .join(" "),
    )
  );
}

/**
 * When preparation is paused or blocked and the user must act, recovery is the
 * primary Applications action — cover letters and other optional docs demote.
 */
export function applicationNeedsPrimaryRecovery(input: {
  lastAttemptState: ApplicationRecord["lastAttemptState"] | null | undefined;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
}): boolean {
  const { lastAttemptState, visibleApplyResult } = input;

  if (applyResultIsServiceWorkerBlocked(visibleApplyResult)) {
    return true;
  }

  if (applyResultNeedsManualFieldFinish(visibleApplyResult)) {
    return true;
  }

  if (
    lastAttemptState === "paused" ||
    lastAttemptState === "failed" ||
    lastAttemptState === "unsupported"
  ) {
    return true;
  }

  const state = visibleApplyResult?.state;
  return state === "blocked" || state === "failed" || state === "skipped";
}

export function buildQueueEntries(input: {
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
}): QueueEntry[] {
  const { applicationRecords, applyJobResults, discoveryJobs, selectedRun } =
    input;

  if (!selectedRun) {
    return [];
  }

  const selectedRunResults = applyJobResults.filter(
    (result) => result.runId === selectedRun.id,
  );
  const discoveryJobsById = new Map(
    discoveryJobs.map((job) => [job.id, job] as const),
  );

  return selectedRun.jobIds.map((jobId) => {
    const matchingResults = selectedRunResults.filter(
      (result) => result.jobId === jobId,
    );
    const runResult = matchingResults.length === 1 ? matchingResults[0]! : null;
    const relatedRecord = runResult?.applicationRecordId
      ? (applicationRecords.find(
          (record) => record.id === runResult.applicationRecordId,
        ) ?? null)
      : null;
    const relatedSavedJob = discoveryJobsById.get(jobId) ?? null;
    const includeInRecovery =
      !runResult ||
      runResult.applicationRecordId === null ||
      runResult.state === "planned" ||
      runResult.state === "blocked" ||
      runResult.state === "failed" ||
      runResult.state === "skipped";

    return {
      jobId,
      label: relatedRecord
        ? formatApplicationEmployerAriaLabel({
            title: relatedRecord.title,
            company: relatedRecord.company,
            ...(relatedSavedJob?.canonicalUrl
              ? { canonicalUrl: relatedSavedJob.canonicalUrl }
              : {}),
          })
        : relatedSavedJob
          ? formatApplicationEmployerAriaLabel({
              title: relatedSavedJob.title,
              company: relatedSavedJob.company,
              canonicalUrl: relatedSavedJob.canonicalUrl,
            })
          : jobId,
      runResult,
      includeInRecovery,
    };
  });
}

export function getApplyDetailsStatusBadge(
  status: "idle" | "loading" | "ready" | "error",
) {
  switch (status) {
    case "loading":
      return { tone: "active" as const, label: "Loading details" };
    case "error":
      return { tone: "critical" as const, label: "Details unavailable" };
    case "ready":
      return { tone: "positive" as const, label: "Details ready" };
    default:
      return { tone: "muted" as const, label: "Details idle" };
  }
}

export function getQueueRecoveryTone(
  state: JobFinderWorkspaceSnapshot["applyJobResults"][number]["state"] | null,
) {
  if (state === "awaiting_review" || state === "submitted") {
    return "positive" as const;
  }

  if (state === "blocked" || state === "failed" || state === "skipped") {
    return "critical" as const;
  }

  if (state === "planned") {
    return "muted" as const;
  }

  return "active" as const;
}

export function getQueueStateExplanation(
  input: {
    runState: JobFinderWorkspaceSnapshot["applyRuns"][number]["state"];
    selectedJobCount: number;
    blockedJobCount: number;
    skippedJobCount: number;
    failedJobCount: number;
    completedJobCount: number;
  } | null,
) {
  if (!input) {
    return null;
  }

  if (input.runState === "paused_for_consent") {
    return "This run is paused on a live consent decision. Resolve the consent request to continue, or start a fresh safe run with only the blocked jobs.";
  }

  // A stop-rule pause holds no pending decision to resolve, so the run can
  // never resume; finishing the remaining jobs requires a fresh recovery run.
  if (input.runState === "paused_for_user_review") {
    return "Job Finder paused this run on one of its stop rules. It will not continue on its own and no consent decision is holding it here. Use Prepare remaining jobs to finish the unfinished jobs in a fresh safe recovery run.";
  }

  if (input.runState === "awaiting_submit_approval") {
    return "This run is waiting for Preparation approval and has not started yet. Approve safe preparation to let the fill-only pass begin, or stage a narrower selection if the job list changed. Final submission remains disabled.";
  }

  if (input.runState === "cancelled") {
    return "This historical run was cancelled before it finished. Remaining planned, blocked, failed, or skipped jobs can be prepared again in a fresh safe run.";
  }

  if (input.failedJobCount > 0) {
    return "Some jobs in this run failed before the flow could reach a stable review-safe state. Review the per-job outcomes below before preparing only the unfinished jobs.";
  }

  if (input.blockedJobCount > 0 || input.skippedJobCount > 0) {
    return "This historical run hit blocked or skipped jobs. Applications keeps those outcomes and can prepare only the unfinished jobs without repeating completed work.";
  }

  if (input.completedJobCount === input.selectedJobCount) {
    return "Every job in this historical run already reached a review-ready or terminal outcome. Recovery is available only if you want to start a completely fresh run another way.";
  }

  return "This run still has unfinished jobs. Review the per-job outcomes below before deciding whether to prepare the remaining work.";
}

export function formatVisibleRunId(runId: string): string {
  return runId.length <= 8 ? runId : runId.slice(-8);
}

export function getAnswerTone(
  status: ApplyRunDetails["answerRecords"][number]["status"],
) {
  switch (status) {
    case "filled":
    case "submitted":
      return "positive" as const;
    case "rejected":
    case "skipped":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

export function getConsentTone(
  status: ApplyRunDetails["consentRequests"][number]["status"],
) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

export function getApprovalTone(status: ApplySubmitApproval["status"]) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "revoked":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}
