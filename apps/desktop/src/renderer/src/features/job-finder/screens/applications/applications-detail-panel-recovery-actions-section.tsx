import type {
  GlobalDailyApplicationPreparationCapacity,
  JobFinderExactApplicationTarget,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { useId } from "react";
import { Button } from "@renderer/components/ui";
import { formatStatusLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  formatDailyPreparationBatchExceedsRemainingText,
  formatDailyPreparationCapacityReachedText,
  isDailyPreparationCapacityExhausted,
} from "@renderer/features/job-finder/lib/job-finder-daily-capacity";
import { StatusBadge } from "../../components/status-badge";
import {
  applyResultNeedsResumeAttachment,
  getCustomerFacingApplyText,
  getQueueRecoveryTone,
  getQueueStateExplanation,
  getVerifiedExternalWriteRecoveryText,
  type QueueEntry,
} from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelRecoveryActionsSection(props: {
  applyRunHistoryCount: number;
  canRestageAutoRun: boolean;
  canRestageQueueRun: boolean;
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onStartApplyCopilot: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApply: (input: JobFinderExactApplicationTarget) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
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
    applyRunHistoryCount,
    canRestageAutoRun,
    canRestageQueueRun,
    dailyPreparationCapacity,
    excludedQueueRecoveryEntries,
    isApplyPending,
    onStartApplyCopilot,
    onStartAutoApply,
    onStartAutoApplyQueue,
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
  const externalWriteRecoveryText = getVerifiedExternalWriteRecoveryText(
    visibleApplyResult?.privacyReceipt,
  );
  // The fixed local-day safeguard is enforced fail-closed by the workspace
  // service. When nothing remains, every start control is disabled here so no
  // dialog or run can begin, and the reached state is stated in plain text
  // with the exact usage and reset timing instead of a silent no-op.
  const isDailyCapacityExhausted =
    isDailyPreparationCapacityExhausted(dailyPreparationCapacity);
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

  return (
    <>
      <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h3 className="label-mono-xs text-primary">Recovery</h3>
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {isDailyCapacityExhausted
                ? "Retry preparation stays available after today's application slots reset."
                : isWaitingForSignIn
                ? "Job Finder is waiting while you sign in in the open browser. It never handles or stores your credentials. Return here after sign-in and retry this application. Retrying creates a fresh run and uses one of today's remaining application slots."
                : isNavigationUnreachable
                  ? "Last time, the dedicated browser could not open this employer page, so preparation stopped before anything was filled or submitted. That failed attempt did not count against today's application slots. Retry below when you are ready."
                  : needsResumeAttachment
                    ? `The approved resume was not attached. ${externalWriteRecoveryText} Retry below to approve that attachment. Job Finder will prepare the page and stop before the final submit control.`
                    : "Start a fresh safe run for this job without leaving Applications. Each recovery action creates a new run, uses one of today's remaining application slots, and still stops before any final submit click."}
            </p>
          </div>
          <StatusBadge tone={visibleApplyResult ? "active" : "muted"}>
            {applyRunHistoryCount} run{applyRunHistoryCount === 1 ? "" : "s"}{" "}
            saved
          </StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              onStartApplyCopilot({
                jobId: selectedRecordJobId,
                applicationRecordId: selectedApplicationRecordId,
              })
            }
            pending={isApplyPending}
            type="button"
            variant="secondary"
            disabled={isApplyPending || isDailyCapacityExhausted}
          >
            {isApplyPending
              ? "Preparing safely..."
              : isWaitingForSignIn
                ? "I'm signed in — retry preparation"
                : needsResumeAttachment
                  ? "Approve and retry resume attachment"
                  : "Retry preparation"}
          </Button>
          <Button
            onClick={() =>
              onStartAutoApply({
                jobId: selectedRecordJobId,
                applicationRecordId: selectedApplicationRecordId,
              })
            }
            pending={isApplyPending}
            type="button"
            variant="ghost"
            disabled={
              isApplyPending || !canRestageAutoRun || isDailyCapacityExhausted
            }
          >
            Queue automatic preparation
          </Button>
          <Button
            aria-describedby={
              dailyQueueRecoveryExceedsRemainingReason
                ? queueRecoveryExceedsNoteId
                : undefined
            }
            onClick={() => onStartAutoApplyQueue(selectedQueueRecoveryJobIds)}
            pending={isApplyPending}
            type="button"
            variant="ghost"
            disabled={
              isApplyPending ||
              !canRestageQueueRun ||
              isDailyCapacityExhausted ||
              selectedQueueRecoveryExceedsDailyRemaining
            }
          >
            Queue remaining jobs
          </Button>
        </div>
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
        {isApplyPending ? (
          <p
            aria-live="polite"
            className="text-(length:--text-small) leading-6 text-foreground-soft"
            role="status"
          >
            Preparing the application in the dedicated browser now. This can
            take up to a minute while Job Finder verifies every retained field.
            It will stop before the final submit control.
          </p>
        ) : null}
        <div className="grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
          {!canRestageAutoRun ? (
            <p>
              Staging an automatic preparation stays available only while this
              job is still review-ready.
            </p>
          ) : null}
          {selectedRun?.mode === "queue_auto" ? (
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
      {selectedRun?.mode === "queue_auto" ? (
        <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <h3 className="label-mono-xs text-primary">
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
      <p className="label-mono-xs">{heading}</p>
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
