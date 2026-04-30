import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import { formatStatusLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import {
  getQueueRecoveryTone,
  getQueueStateExplanation,
  type QueueEntry,
} from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelRecoveryActionsSection(props: {
  applyRunHistoryCount: number;
  canRestageAutoRun: boolean;
  canRestageQueueRun: boolean;
  excludedQueueRecoveryEntries: QueueEntry[];
  isApplyPending: boolean;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  selectedQueueOutcomeEntries: QueueEntry[];
  selectedQueueRecoveryEntries: QueueEntry[];
  selectedQueueRecoveryJobIds: string[];
  selectedRecordJobId: string;
  selectedRun: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
}) {
  const {
    applyRunHistoryCount,
    canRestageAutoRun,
    canRestageQueueRun,
    excludedQueueRecoveryEntries,
    isApplyPending,
    onStartApplyCopilot,
    onStartAutoApply,
    onStartAutoApplyQueue,
    selectedQueueOutcomeEntries,
    selectedQueueRecoveryEntries,
    selectedQueueRecoveryJobIds,
    selectedRecordJobId,
    selectedRun,
    visibleApplyResult,
  } = props;

  return (
    <>
      <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h3 className="label-mono-xs text-primary">Recovery</h3>
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              Start a fresh safe run for this job without leaving Applications. Each
              recovery action creates a new run and still stops before any final
              submit click.
            </p>
          </div>
          <StatusBadge tone={visibleApplyResult ? "active" : "muted"}>
            {applyRunHistoryCount} run{applyRunHistoryCount === 1 ? "" : "s"} saved
          </StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => onStartApplyCopilot(selectedRecordJobId)}
            pending={isApplyPending}
            type="button"
            variant="secondary"
            disabled={isApplyPending}
          >
            Rerun apply copilot
          </Button>
          <Button
            onClick={() => onStartAutoApply(selectedRecordJobId)}
            pending={isApplyPending}
            type="button"
            variant="ghost"
            disabled={isApplyPending || !canRestageAutoRun}
          >
            Restage auto run
          </Button>
          <Button
            onClick={() => onStartAutoApplyQueue(selectedQueueRecoveryJobIds)}
            pending={isApplyPending}
            type="button"
            variant="ghost"
            disabled={isApplyPending || !canRestageQueueRun}
          >
            Restage remaining queue
          </Button>
        </div>
        <div className="grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
          {!canRestageAutoRun ? (
            <p>
              Auto-run restaging stays available only when this job is still in a
              review-ready stage.
            </p>
          ) : null}
          {selectedRun?.mode === "queue_auto" ? (
            <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
              <p>
                Queue recovery will restage {selectedQueueRecoveryJobIds.length}
                &nbsp;remaining or blocked job
                {selectedQueueRecoveryJobIds.length === 1 ? "" : "s"} from the
                selected queue run.
              </p>
              <div className="grid gap-2 2xl:grid-cols-2">
                <QueueEntryList
                  entries={selectedQueueRecoveryEntries}
                  emptyMessage="No jobs from this queue still need restaging."
                  heading="Will restage"
                  statusFallback="planned"
                />
                <QueueEntryList
                  entries={excludedQueueRecoveryEntries}
                  emptyMessage="No jobs are excluded from this historical queue yet."
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
              <h3 className="label-mono-xs text-primary">Queue outcome summary</h3>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                Review how each job in the selected historical queue finished before
                you restage anything.
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
            {selectedQueueOutcomeEntries.map((entry) => (
              (() => {
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
                      {entry.runResult?.summary ??
                        "This job never started before the queue paused or was cancelled."}
                    </p>
                    {entry.runResult?.blockerSummary ? (
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                        {entry.runResult.blockerSummary}
                      </p>
                    ) : null}
                  </div>
                );
              })()
            ))}
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
        entries.map((entry) => (
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
          })()
        ))
      ) : (
        <p>{emptyMessage}</p>
      )}
    </div>
  );
}
