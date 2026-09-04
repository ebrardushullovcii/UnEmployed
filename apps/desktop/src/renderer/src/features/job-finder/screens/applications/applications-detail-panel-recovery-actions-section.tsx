import type {
  GlobalDailyApplicationPreparationCapacity,
  JobFinderExactApplicationTarget,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { useId, useState } from "react";
import { Button } from "@renderer/components/ui";
import { formatStatusLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  formatDailyPreparationBatchExceedsRemainingText,
  formatDailyPreparationCapacityReachedText,
  isDailyPreparationCapacityExhausted,
} from "@renderer/features/job-finder/lib/job-finder-daily-capacity";
import {
  CONFIRM_STEP_DONE_ACTION,
  CONFIRM_STEP_DONE_PENDING_LABEL,
  formatJobFinderBrowserHandoffFailedStatus,
  JOB_FINDER_BROWSER_NAME,
  JOB_FINDER_BROWSER_OPENED_WITHOUT_PAGE_STATUS,
  JOB_FINDER_BROWSER_UNAVAILABLE_NOTE,
  OPEN_JOB_FINDER_BROWSER_ACTION,
  REOPEN_JOB_FINDER_BROWSER_ACTION,
  RUN_PREPARATION_AGAIN_ACTION,
  RUN_PREPARATION_AGAIN_LATER_ACTION,
} from "../../lib/job-finder-browser-handoff-copy";
import { StatusBadge } from "../../components/status-badge";
import {
  applyResultIsServiceWorkerBlocked,
  applyResultNeedsManualFieldFinish,
  applyResultNeedsResumeAttachment,
  FINISH_IN_BROWSER_OPENED_STATUS,
  getApplyResultDestinationUrl,
  getCustomerFacingApplyText,
  getQueueRecoveryTone,
  getQueueStateExplanation,
  getVerifiedExternalWriteRecoveryText,
  type QueueEntry,
} from "./applications-detail-panel-helpers";

/**
 * Exact lineage handed to the page route so it can open or focus the managed
 * Job Finder browser on the paused application (the same browser-owned
 * "open page" step Needs you exposes for this result's pending request).
 */
export type FinishInBrowserInput = {
  jobId: string;
  resultId: string;
  runId: string;
  applicationRecordId: string;
  destinationUrl: string | null;
};

/**
 * What the hand-off actually did. The status used to be set optimistically and
 * unconditionally, so a fall-back that opened nothing but a bare browser — and
 * an open that errored outright — both still claimed "Opened in the Job Finder
 * browser. Switch to that window to finish the step", sending the user to a
 * window that never showed the step.
 */
export type FinishInBrowserOutcome =
  | { kind: "opened_application_page" }
  | { kind: "opened_browser_only" }
  | { kind: "failed"; reason?: string | null };

/**
 * The hand-off itself. It is asynchronous in production — opening the window
 * or sending the "open browser step" command is an IPC round trip — so the
 * outcome is a promise, and the status beside the control is written only once
 * that promise has settled. A synchronous outcome (or none) is still accepted
 * so a handler that reports nothing gets no status at all rather than an
 * unearned success claim.
 */
export type FinishInBrowserHandler = (
  input: FinishInBrowserInput,
) => FinishInBrowserOutcome | void | Promise<FinishInBrowserOutcome | void>;

/**
 * True when the hand-off handed back work that has not finished yet. Checked
 * structurally rather than with `instanceof Promise` so a handler returning any
 * thenable — including one from another realm, as a test double or a preload
 * bridge can be — is still awaited instead of being written straight into the
 * status as an outcome object.
 */
function isFinishInBrowserOutcomePromise(
  outcome:
    | FinishInBrowserOutcome
    | void
    | Promise<FinishInBrowserOutcome | void>,
): outcome is Promise<FinishInBrowserOutcome | void> {
  return (
    typeof outcome === "object" &&
    outcome !== null &&
    typeof (outcome as { then?: unknown }).then === "function"
  );
}

/**
 * The cause carried into the failed status when the hand-off rejects. An
 * unreadable rejection reports no cause rather than inventing one; the status
 * sentence is truthful about the failure either way.
 */
function getFinishInBrowserFailureReason(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return null;
}

/**
 * Resolution state of the "I finished this step" verification, derived from
 * the exact pending browser-step request rather than from the fire-and-forget
 * command that starts it.
 */
export type ConfirmFinishedInBrowserStatus =
  | "idle"
  | "checking"
  | "still_blocked";

/**
 * Every control in the recovery row shares one box metric so the row cannot
 * render at three heights and three tops the way it did in the round-eight
 * captures. Weight and fill carry the hierarchy; geometry does not.
 */
const RECOVERY_ACTION_CLASS_NAME =
  "h-auto min-h-11 w-fit min-w-0 max-w-full whitespace-normal px-4 py-2.5 text-(length:--text-body) leading-5";
const RECOVERY_PRIMARY_ACTION_CLASS_NAME = `${RECOVERY_ACTION_CLASS_NAME} font-semibold`;

export function ApplicationsDetailPanelRecoveryActionsSection(props: {
  canRestageAutoRun: boolean;
  canRestageQueueRun: boolean;
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onStartApplyCopilot: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApply: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onOpenSafeguards?: () => void;
  /**
   * Reports what the hand-off did so the status beside it can say the same
   * thing. Every intermediate panel declares this same return type, so the
   * outcome is not under-reported on the way down. `void` stays accepted so a
   * handler that reports nothing gets no status at all rather than an
   * unearned success claim.
   */
  onFinishInBrowser?: FinishInBrowserHandler;
  /**
   * Runs the exact verification Needs you runs for the pending browser step on
   * this result. Without it the loop had two homes: Applications sent the user
   * to the browser and only Needs you — a page they were never told to visit —
   * could take them back in.
   */
  onConfirmFinishedInBrowser?: (input: FinishInBrowserInput) => void;
  canConfirmFinishedInBrowser?: boolean;
  /**
   * Live state of the verification this section starts, read from the exact
   * pending browser-step request. `checking` while the check runs and
   * `still_blocked` once it came back without the step being complete; without
   * it the click produced a "Verification started…" banner and then nothing
   * changed in place for the rest of the wait.
   */
  confirmFinishedInBrowserStatus?: ConfirmFinishedInBrowserStatus;
  confirmFinishedInBrowserBlockerText?: string | null;
  selectedQueueOutcomeEntries: QueueEntry[];
  selectedQueueRecoveryEntries: QueueEntry[];
  selectedQueueRecoveryJobIds: string[];
  selectedRecordJobId: string;
  selectedApplicationRecordId: string;
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
}) {
  const {
    canRestageAutoRun,
    canRestageQueueRun,
    dailyPreparationCapacity,
    excludedQueueRecoveryEntries,
    isApplyPending,
    onStartApplyCopilot,
    onStartAutoApply,
    onStartAutoApplyQueue,
    onOpenSafeguards,
    onFinishInBrowser,
    onConfirmFinishedInBrowser,
    canConfirmFinishedInBrowser,
    confirmFinishedInBrowserStatus = "idle",
    confirmFinishedInBrowserBlockerText,
    selectedQueueOutcomeEntries,
    selectedQueueRecoveryEntries,
    selectedQueueRecoveryJobIds,
    selectedRecordJobId,
    selectedApplicationRecordId,
    selectedRun,
    visibleApplyResult,
  } = props;
  const isWaitingForSignIn =
    visibleApplyResult?.blockerReason === "auth_required";
  const isNavigationUnreachable =
    visibleApplyResult?.blockerReason === "application_page_unreachable";
  const needsResumeAttachment =
    applyResultNeedsResumeAttachment(visibleApplyResult);
  const isServiceWorkerBlocked =
    applyResultIsServiceWorkerBlocked(visibleApplyResult);
  const needsManualFieldFinish =
    applyResultNeedsManualFieldFinish(visibleApplyResult);
  const requiresSubmissionOutcomeVerification =
    visibleApplyResult?.blockerReason === "submission_outcome_uncertain" ||
    visibleApplyResult?.privacyReceipt?.submissionOutcome?.outcome ===
      "outcome_uncertain";
  // Finish-yourself pauses (site block or field conflicts) own the primary
  // path — never show an in-progress spinner that contradicts Next step.
  const needsUserFinishPath = isServiceWorkerBlocked || needsManualFieldFinish;
  const showPreparingState =
    isApplyPending &&
    !needsUserFinishPath &&
    !requiresSubmissionOutcomeVerification;
  // The queue action is meaningful only when the selected run produced a
  // recoverable queue. Keep an empty or non-queue selection out of the action
  // group instead of leaving a disabled control without a target.
  const showQueueRecoveryAction =
    !needsUserFinishPath &&
    canRestageQueueRun &&
    selectedQueueRecoveryJobIds.length > 0;
  const externalWriteRecoveryText = getVerifiedExternalWriteRecoveryText(
    visibleApplyResult?.privacyReceipt,
  );
  // The fixed local-day safeguard is enforced fail-closed by the workspace
  // service. When nothing remains, every start control is disabled here so no
  // dialog or run can begin, and the reached state is stated in plain text
  // with the exact usage and reset timing instead of a silent no-op.
  const isDailyCapacityExhausted = isDailyPreparationCapacityExhausted(
    dailyPreparationCapacity,
  );
  const dailyCapacityReachedText =
    dailyPreparationCapacity && isDailyCapacityExhausted
      ? formatDailyPreparationCapacityReachedText(dailyPreparationCapacity)
      : null;
  // A partial exceedance keeps its own control-associated reason so the
  // disabled multi-job control names the selected count, the remaining
  // slots, and the local reset timing instead of reading as full
  // exhaustion, which stays owned by the reached summary below. Single-job
  // retry keeps working while any slot remains.
  const selectedQueueRecoveryExceedsDailyRemaining =
    showQueueRecoveryAction &&
    dailyPreparationCapacity !== null &&
    !isDailyCapacityExhausted &&
    selectedQueueRecoveryJobIds.length > dailyPreparationCapacity.remaining;
  const queueRecoveryExceedsNoteId = useId();
  const dailyQueueRecoveryExceedsRemainingReason =
    dailyPreparationCapacity && selectedQueueRecoveryExceedsDailyRemaining
      ? formatDailyPreparationBatchExceedsRemainingText({
          capacity: dailyPreparationCapacity,
          selectedCount: selectedQueueRecoveryJobIds.length,
        })
      : null;
  const secondaryRecoveryActionCount =
    Number(canRestageAutoRun) + Number(showQueueRecoveryAction);
  const secondaryRecoveryActionsClassName =
    "flex min-w-0 max-w-full flex-wrap items-start justify-start gap-2";

  // Finish-first pauses already own the Next step callout above, which is in
  // the accessibility tree. This section used to restate the same sentence in
  // an sr-only paragraph as well, so the instruction arrived three times
  // (list row, Next step, and here). It is action-only now.
  // What the Job Finder browser hand-off reported for the exact result it ran
  // for; reset whenever a different result is selected.
  const [finishInBrowserReport, setFinishInBrowserReport] = useState<{
    resultId: string;
    outcome: FinishInBrowserOutcome;
  } | null>(null);
  const finishInBrowserOutcome =
    needsManualFieldFinish &&
    visibleApplyResult &&
    finishInBrowserReport?.resultId === visibleApplyResult.id
      ? finishInBrowserReport.outcome
      : null;
  /**
   * True once this exact result's application page has actually been opened
   * in the Job Finder browser. Pressing the primary action used to leave the
   * button identical and still primary, so the only proof anything had
   * happened was a passive grey box; a real hand-off now visibly demotes the
   * open action and promotes the confirm action in its place. A fall-back
   * that only opened the window, or a failure, must not demote it: the page
   * still needs opening.
   */
  const hasHandedOffToBrowser =
    finishInBrowserOutcome?.kind === "opened_application_page";
  const finishInBrowserStatus =
    finishInBrowserOutcome === null
      ? null
      : finishInBrowserOutcome.kind === "opened_application_page"
        ? FINISH_IN_BROWSER_OPENED_STATUS
        : finishInBrowserOutcome.kind === "opened_browser_only"
          ? JOB_FINDER_BROWSER_OPENED_WITHOUT_PAGE_STATUS
          : formatJobFinderBrowserHandoffFailedStatus(
              finishInBrowserOutcome.reason,
            );
  const finishInBrowserUnavailableNoteId = useId();
  const canFinishInBrowser = Boolean(onFinishInBrowser && visibleApplyResult);
  const handleFinishInBrowser = () => {
    if (!onFinishInBrowser || !visibleApplyResult) {
      return;
    }

    const resultId = visibleApplyResult.id;
    const reportOutcome = (outcome: FinishInBrowserOutcome | void) => {
      setFinishInBrowserReport(outcome ? { resultId, outcome } : null);
    };
    const outcome = onFinishInBrowser({
      jobId: visibleApplyResult.jobId,
      resultId,
      runId: visibleApplyResult.runId,
      applicationRecordId:
        visibleApplyResult.applicationRecordId ?? selectedApplicationRecordId,
      destinationUrl: getApplyResultDestinationUrl(
        visibleApplyResult.privacyReceipt,
      ),
    });

    if (isFinishInBrowserOutcomePromise(outcome)) {
      // Nothing is claimed while the hand-off is still running, and any status
      // left from a previous attempt is dropped rather than left standing as
      // this attempt's answer.
      setFinishInBrowserReport(null);
      void outcome.then(reportOutcome, (error: unknown) => {
        reportOutcome({
          kind: "failed",
          reason: getFinishInBrowserFailureReason(error),
        });
      });
      return;
    }

    reportOutcome(outcome);
  };
  const canConfirmFinished = Boolean(
    onConfirmFinishedInBrowser &&
    canConfirmFinishedInBrowser &&
    visibleApplyResult,
  );
  // The verification runs in the background after the click. Until it settles,
  // the button says so in place and stays disabled; when it comes back without
  // the step complete, the same place says why and offers the check again.
  const isCheckingFinishedInBrowser =
    canConfirmFinished && confirmFinishedInBrowserStatus === "checking";
  const isStillBlockedAfterCheck =
    canConfirmFinished && confirmFinishedInBrowserStatus === "still_blocked";
  const confirmFinishedInBrowserStatusBaseId = useId();
  const confirmFinishedInBrowserStatusId =
    isCheckingFinishedInBrowser || isStillBlockedAfterCheck
      ? confirmFinishedInBrowserStatusBaseId
      : null;
  const handleConfirmFinishedInBrowser = () => {
    if (!onConfirmFinishedInBrowser || !visibleApplyResult) {
      return;
    }

    onConfirmFinishedInBrowser({
      jobId: visibleApplyResult.jobId,
      resultId: visibleApplyResult.id,
      runId: visibleApplyResult.runId,
      applicationRecordId:
        visibleApplyResult.applicationRecordId ?? selectedApplicationRecordId,
      destinationUrl: getApplyResultDestinationUrl(
        visibleApplyResult.privacyReceipt,
      ),
    });
  };

  return (
    <>
      <section className="surface-card-tint grid gap-5 rounded-(--radius-field) border border-(--surface-panel-border) px-5 py-5">
        {/* The saved-run count adds nothing above the one recovery action;
            run history stays in its own section below. */}
        <div className="grid min-w-0 max-w-prose gap-1.5">
          {/* The Next step callout above already says "finish this application
              in the open browser". Repeating it as a heading here made one
              instruction arrive in four stacked layers, so on that path the
              section keeps only its accessible name and its action. */}
          <h3
            className={
              needsUserFinishPath && !requiresSubmissionOutcomeVerification
                ? "sr-only"
                : "text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground"
            }
          >
            {requiresSubmissionOutcomeVerification
              ? "Manual verification required"
              : needsUserFinishPath
                ? "Finish this application"
                : "Try again"}
          </h3>
          {requiresSubmissionOutcomeVerification ? (
            <p
              className="text-(length:--text-small) leading-6 text-foreground-soft"
              data-testid="submission-outcome-verification-guidance"
            >
              Check this application on the employer site before doing anything
              else. Automatic retry and preparation stay unavailable until you
              record what the employer site shows.
            </p>
          ) : needsUserFinishPath ? null : (
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {isDailyCapacityExhausted
                ? `"${RUN_PREPARATION_AGAIN_ACTION}" stays available after today's application slots reset.`
                : isWaitingForSignIn
                  ? `Job Finder is waiting while you sign in in ${JOB_FINDER_BROWSER_NAME}, a separate window outside this app. It never handles or stores your credentials. Come back here after sign-in and run preparation again. That creates a fresh run and uses one of today's remaining application slots.`
                  : isNavigationUnreachable
                    ? `Last time, ${JOB_FINDER_BROWSER_NAME} could not open this employer page, so preparation stopped before anything was filled or submitted. That failed attempt did not count against today's application slots. Run preparation again below when you are ready.`
                    : needsResumeAttachment
                      ? `The approved resume was not attached. ${externalWriteRecoveryText} Use the action below to approve that attachment. Job Finder will prepare the page and stop before the final submit control.`
                      : "Start a fresh safe run for this job without leaving Applications. Each recovery action creates a new run, uses one of today's remaining application slots, and still stops before any final submit click."}
            </p>
          )}
        </div>
        {requiresSubmissionOutcomeVerification ? null : (
          <div
            aria-label="Application recovery actions"
            className="flex min-w-0 max-w-full flex-wrap items-start justify-start gap-2"
            data-testid="applications-recovery-actions"
            role="group"
          >
            <div
              aria-label="Primary application recovery action"
              className="flex min-w-0 max-w-full flex-wrap items-stretch gap-2"
              data-testid="applications-recovery-primary-action"
              role="group"
            >
              {isServiceWorkerBlocked && onOpenSafeguards ? (
                <Button
                  className={RECOVERY_PRIMARY_ACTION_CLASS_NAME}
                  data-testid="site-blocked-safeguards-primary"
                  onClick={onOpenSafeguards}
                  type="button"
                  variant="primary"
                >
                  {`Open Safeguards to reset ${JOB_FINDER_BROWSER_NAME}`}
                </Button>
              ) : null}
              {needsManualFieldFinish ? (
                <Button
                  aria-describedby={
                    canFinishInBrowser
                      ? undefined
                      : finishInBrowserUnavailableNoteId
                  }
                  className={
                    hasHandedOffToBrowser
                      ? RECOVERY_ACTION_CLASS_NAME
                      : RECOVERY_PRIMARY_ACTION_CLASS_NAME
                  }
                  data-testid="manual-field-finish-primary"
                  disabled={!canFinishInBrowser}
                  onClick={handleFinishInBrowser}
                  type="button"
                  variant={hasHandedOffToBrowser ? "secondary" : "primary"}
                >
                  {hasHandedOffToBrowser
                    ? REOPEN_JOB_FINDER_BROWSER_ACTION
                    : OPEN_JOB_FINDER_BROWSER_ACTION}
                </Button>
              ) : null}
              {needsUserFinishPath && canConfirmFinished ? (
                <Button
                  aria-describedby={
                    confirmFinishedInBrowserStatusId ?? undefined
                  }
                  className={
                    hasHandedOffToBrowser
                      ? RECOVERY_PRIMARY_ACTION_CLASS_NAME
                      : RECOVERY_ACTION_CLASS_NAME
                  }
                  data-testid="confirm-finished-in-browser"
                  disabled={isApplyPending || isCheckingFinishedInBrowser}
                  onClick={handleConfirmFinishedInBrowser}
                  pending={isApplyPending || isCheckingFinishedInBrowser}
                  type="button"
                  variant={hasHandedOffToBrowser ? "primary" : "secondary"}
                >
                  {/* One name, always. The round-eight build renamed this
                      control in place twice ("I finished this step" ->
                      "Check again" -> "Step is complete"), so the same
                      action looked like three. A running check is a pending
                      state and a failed check is reported beside the row. */}
                  {isCheckingFinishedInBrowser
                    ? CONFIRM_STEP_DONE_PENDING_LABEL
                    : CONFIRM_STEP_DONE_ACTION}
                </Button>
              ) : null}
              {!needsUserFinishPath || needsManualFieldFinish ? (
                <Button
                  className={
                    needsUserFinishPath
                      ? RECOVERY_ACTION_CLASS_NAME
                      : RECOVERY_PRIMARY_ACTION_CLASS_NAME
                  }
                  onClick={() =>
                    onStartApplyCopilot({
                      jobId: selectedRecordJobId,
                      applicationRecordId: selectedApplicationRecordId,
                    })
                  }
                  pending={showPreparingState}
                  type="button"
                  variant={needsUserFinishPath ? "ghost" : "primary"}
                  disabled={
                    showPreparingState ||
                    isDailyCapacityExhausted ||
                    isServiceWorkerBlocked
                  }
                >
                  {showPreparingState
                    ? "Preparing safely..."
                    : isWaitingForSignIn
                      ? "I'm signed in — run preparation again"
                      : needsResumeAttachment
                        ? "Approve and reattach the resume"
                        : needsManualFieldFinish
                          ? RUN_PREPARATION_AGAIN_LATER_ACTION
                          : RUN_PREPARATION_AGAIN_ACTION}
                </Button>
              ) : null}
            </div>
            {confirmFinishedInBrowserStatusId ? (
              <p
                className={
                  isCheckingFinishedInBrowser
                    ? "flex w-full min-w-0 items-center gap-2 text-(length:--text-small) leading-6 text-foreground-soft"
                    : "flex w-full min-w-0 items-start gap-2 text-(length:--text-small) leading-6 text-(--warning-text)"
                }
                data-testid="confirm-finished-in-browser-status"
                id={confirmFinishedInBrowserStatusId}
                role="status"
              >
                {isCheckingFinishedInBrowser ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                      data-testid="confirm-finished-in-browser-spinner"
                    />
                    <span>
                      {`Checking the application page in ${JOB_FINDER_BROWSER_NAME}… Job Finder only reads what that page shows and never submits.`}
                    </span>
                  </>
                ) : (
                  <span>
                    {`Not done yet — ${
                      confirmFinishedInBrowserBlockerText?.trim() ||
                      "the application page still shows the step you need to finish."
                    } Switch to ${JOB_FINDER_BROWSER_NAME}, finish that step, then choose "${CONFIRM_STEP_DONE_ACTION}" again.`}
                  </span>
                )}
              </p>
            ) : null}
            {!needsUserFinishPath && secondaryRecoveryActionCount > 0 ? (
              <div
                aria-label="Optional application preparation actions"
                className="flex min-w-0 max-w-full flex-wrap items-start gap-2"
                data-testid="applications-recovery-secondary-actions"
                role="group"
              >
                <div
                  className={secondaryRecoveryActionsClassName}
                  data-testid="applications-recovery-secondary-action-list"
                >
                  {canRestageAutoRun ? (
                    <Button
                      className={RECOVERY_ACTION_CLASS_NAME}
                      onClick={() =>
                        onStartAutoApply({
                          jobId: selectedRecordJobId,
                          applicationRecordId: selectedApplicationRecordId,
                        })
                      }
                      pending={showPreparingState}
                      type="button"
                      variant="secondary"
                      disabled={showPreparingState || isDailyCapacityExhausted}
                    >
                      Prepare this job automatically
                    </Button>
                  ) : null}
                  {showQueueRecoveryAction ? (
                    <Button
                      aria-describedby={
                        dailyQueueRecoveryExceedsRemainingReason
                          ? queueRecoveryExceedsNoteId
                          : undefined
                      }
                      className={RECOVERY_ACTION_CLASS_NAME}
                      onClick={() =>
                        onStartAutoApplyQueue(selectedQueueRecoveryJobIds)
                      }
                      pending={showPreparingState}
                      type="button"
                      variant="secondary"
                      disabled={
                        showPreparingState ||
                        isDailyCapacityExhausted ||
                        selectedQueueRecoveryExceedsDailyRemaining
                      }
                    >
                      Prepare remaining jobs
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
        {needsManualFieldFinish && !canFinishInBrowser ? (
          <p
            className="text-(length:--text-small) leading-6 text-foreground-soft"
            data-testid="manual-field-finish-unavailable-note"
            id={finishInBrowserUnavailableNoteId}
          >
            {JOB_FINDER_BROWSER_UNAVAILABLE_NOTE}
          </p>
        ) : null}
        {finishInBrowserStatus && finishInBrowserOutcome ? (
          <p
            aria-live="polite"
            className={
              finishInBrowserOutcome.kind === "opened_application_page"
                ? "rounded-(--radius-field) border border-primary/25 bg-primary/5 px-3 py-2 text-(length:--text-small) leading-6 text-foreground"
                : "rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-6 text-foreground"
            }
            data-handoff-outcome={finishInBrowserOutcome.kind}
            data-testid="manual-field-finish-status"
            role="status"
          >
            {finishInBrowserStatus}
          </p>
        ) : null}
        {dailyQueueRecoveryExceedsRemainingReason ? (
          <p
            aria-live="polite"
            className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-6 text-foreground"
            data-testid="queue-recovery-daily-capacity-exceeded-note"
            id={queueRecoveryExceedsNoteId}
          >
            {dailyQueueRecoveryExceedsRemainingReason}
          </p>
        ) : null}
        {dailyCapacityReachedText ? (
          <p
            className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-6 text-foreground"
            data-testid="daily-capacity-reached-alert"
            role="alert"
          >
            {dailyCapacityReachedText}
          </p>
        ) : null}
        {showPreparingState ? (
          <p
            aria-live="polite"
            className="text-(length:--text-small) leading-6 text-foreground-soft"
            role="status"
          >
            {/* The guidance paragraph above already ends on "still stops
                before any final submit click"; two no-submit sentences at
                once made the boundary read as boilerplate. */}
            {`Preparing the application in ${JOB_FINDER_BROWSER_NAME} now. This can take up to a minute while Job Finder verifies every retained field.`}
          </p>
        ) : null}
        <div className="grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
          {!needsUserFinishPath && !canRestageAutoRun ? (
            <p>
              Staging an automatic preparation stays available only while this
              job is still review-ready.
            </p>
          ) : null}
          {!needsUserFinishPath && selectedRun?.mode === "queue_auto" ? (
            <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
              <p>
                Run recovery targets {selectedQueueRecoveryJobIds.length}
                &nbsp;remaining, blocked, failed, or skipped job
                {selectedQueueRecoveryJobIds.length === 1 ? "" : "s"} from the
                selected run.
              </p>
              <div className="grid gap-2 2xl:grid-cols-2">
                <QueueEntryList
                  entries={selectedQueueRecoveryEntries}
                  emptyMessage="No jobs from this run still need recovery."
                  heading="Will be prepared"
                  statusFallback="planned"
                />
                <QueueEntryList
                  entries={excludedQueueRecoveryEntries}
                  emptyMessage="No jobs are excluded from this historical run yet."
                  heading="Already completed or review-ready"
                  statusFallback="awaiting_review"
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {!needsUserFinishPath && selectedRun?.mode === "queue_auto" ? (
        <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground">
                Run outcome summary
              </h3>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                Review how each job in the selected historical run finished
                before you prepare anything again.
              </p>
            </div>
            <StatusBadge tone={canRestageQueueRun ? "active" : "muted"}>
              {selectedQueueOutcomeEntries.length} job
              {selectedQueueOutcomeEntries.length === 1 ? "" : "s"} in run
            </StatusBadge>
          </div>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {getQueueStateExplanation(
              selectedRun
                ? {
                    runState: selectedRun.state,
                    selectedJobCount: selectedQueueOutcomeEntries.length,
                    blockedJobCount: selectedQueueOutcomeEntries.filter(
                      (entry) => entry.runResult?.state === "blocked",
                    ).length,
                    skippedJobCount: selectedQueueOutcomeEntries.filter(
                      (entry) => entry.runResult?.state === "skipped",
                    ).length,
                    failedJobCount: selectedQueueOutcomeEntries.filter(
                      (entry) => entry.runResult?.state === "failed",
                    ).length,
                    completedJobCount: selectedQueueOutcomeEntries.filter(
                      (entry) =>
                        entry.runResult?.state === "awaiting_review" ||
                        entry.runResult?.state === "submitted",
                    ).length,
                  }
                : null,
            )}
          </p>
          <div className="grid gap-2">
            {selectedQueueOutcomeEntries.map((entry) => {
              const resolvedState = entry.runResult?.state ?? "planned";

              return (
                <div
                  key={`queue-outcome-${entry.jobId}`}
                  className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-foreground">{entry.label}</strong>
                    <StatusBadge tone={getQueueRecoveryTone(resolvedState)}>
                      {formatStatusLabel(resolvedState)}
                    </StatusBadge>
                  </div>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    {getCustomerFacingApplyText(
                      entry.runResult?.summary,
                      entry.runResult?.privacyReceipt,
                    ) ??
                      "This job never started before the queue paused or was cancelled."}
                  </p>
                  {entry.runResult?.blockerSummary ? (
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {getCustomerFacingApplyText(
                        entry.runResult.blockerSummary,
                        entry.runResult.privacyReceipt,
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

function QueueEntryList(props: {
  entries: QueueEntry[];
  emptyMessage: string;
  heading: string;
  statusFallback: JobFinderWorkspaceSnapshot["applyJobResults"][number]["state"];
}) {
  const { entries, emptyMessage, heading, statusFallback } = props;

  return (
    <div className="grid gap-2">
      <p className="text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-badge) text-muted-foreground">
        {heading}
      </p>
      {entries.length ? (
        entries.map((entry) =>
          (() => {
            const resolvedState = entry.runResult?.state ?? statusFallback;

            return (
              <div
                key={`${heading}-${entry.jobId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/50 px-3 py-2"
              >
                <span className="text-foreground">{entry.label}</span>
                <StatusBadge tone={getQueueRecoveryTone(resolvedState)}>
                  {formatStatusLabel(resolvedState)}
                </StatusBadge>
              </div>
            );
          })(),
        )
      ) : (
        <p>{emptyMessage}</p>
      )}
    </div>
  );
}
