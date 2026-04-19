import type { ReviewQueueItem } from "@unemployed/contracts";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { Badge, ProgressBar } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import { useId } from "react";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { formatCountLabel } from "../../lib/job-finder-utils";
import {
  getReviewQueueWorkflowStatus,
  isQueueStageReady,
  isResumeGenerationInProgress,
} from "./review-queue-status";

interface ReviewQueueListPanelProps {
  onSelectItem: (jobId: string) => void;
  onToggleQueueSelection: (jobId: string, checked: boolean) => void;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  selectedItem: ReviewQueueItem | null;
}

export function ReviewQueueListPanel({
  onSelectItem,
  onToggleQueueSelection,
  queue,
  queueSelection,
  selectedItem,
}: ReviewQueueListPanelProps) {
  const queueCheckboxIdPrefix = useId();

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">
          Jobs
        </p>
        <Badge variant="section">{formatCountLabel(queue.length, "job")}</Badge>
      </div>
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5 pt-4">
          <EmptyState
            title="No shortlisted jobs yet"
            description="Shortlist a job from Find jobs to start resume review."
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-x-hidden overflow-y-auto px-5 pb-5 pt-4">
          {queue.map((item) => {
            const progressPercent = Number.isFinite(item.progressPercent)
              ? (item.progressPercent ?? 0)
              : 0;
            const clampedProgress = Math.max(0, Math.min(100, progressPercent));
            const workflowStatus = getReviewQueueWorkflowStatus(item);
            const showProgress = isResumeGenerationInProgress(item);
            const queueReady = isQueueStageReady(item);
            const selectedForQueue = queueSelection.includes(item.jobId);
            const queueCheckboxId = `${queueCheckboxIdPrefix}-${item.jobId}`;

            return (
              <div
                key={item.jobId}
                className={cn(
                  "grid min-w-0 w-full gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) px-3 py-4 text-left text-foreground transition-colors",
                  selectedItem?.jobId === item.jobId
                    ? "border-(--field-border) bg-(--field)"
                    : "surface-card-tint",
                )}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <label
                    htmlFor={queueCheckboxId}
                    className={cn(
                      "inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-(--tracking-badge)",
                      queueReady
                        ? "text-foreground-soft"
                        : "text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      id={queueCheckboxId}
                      aria-label={`Select ${item.title} for queue automation`}
                      checked={selectedForQueue}
                      disabled={!queueReady}
                      onCheckedChange={(value) =>
                        onToggleQueueSelection(item.jobId, value === true)
                      }
                    />
                    Queue
                  </label>
                  <StatusBadge tone={workflowStatus.tone}>
                    {workflowStatus.label}
                  </StatusBadge>
                </div>
                <button
                  aria-current={
                    selectedItem?.jobId === item.jobId ? "true" : undefined
                  }
                  className="grid min-w-0 w-full gap-3 text-left outline-none transition-colors hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  onClick={() => onSelectItem(item.jobId)}
                  type="button"
                >
                  <div className="min-w-0 w-full">
                    <strong className="block wrap-break-word font-display text-[1rem] font-semibold tracking-(--tracking-normal) text-foreground">
                      {item.title}
                    </strong>
                  </div>
                  <span className="block w-full text-[0.8rem] text-foreground-muted">
                    {item.company} • {item.location}
                  </span>
                  {!queueReady ? (
                    <span className="block w-full text-[0.76rem] leading-5 text-muted-foreground">
                      Queue staging needs an approved ready PDF for this job.
                    </span>
                  ) : null}
                  {showProgress ? (
                    <div className="grid min-w-0 w-full gap-1.5">
                      <ProgressBar
                        className="h-1.5 w-full rounded-full bg-(--surface-progress-track)"
                        percent={clampedProgress}
                      />
                    </div>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
