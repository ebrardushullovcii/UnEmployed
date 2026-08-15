import type { ReviewQueueItem } from "@unemployed/contracts";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { Badge, ProgressBar } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  type KeyboardEvent,
} from "react";
import {
  CollectionNoMatches,
  CollectionSavedViews,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import {
  focusCollectionItem,
  getAdjacentCollectionItemId,
} from "../../lib/collection-keyboard-navigation";
import { formatCountLabel } from "../../lib/job-finder-utils";
import { getDisplayedResumeProgress } from "./review-queue-progress";
import {
  getReviewQueueWorkflowStatus,
  isQueueStageReady,
  isResumeGenerationInProgress,
} from "./review-queue-status";

interface ReviewQueueListPanelProps {
  isJobPending: (jobId: string) => boolean;
  onSelectItem: (jobId: string) => void;
  onToggleQueueSelection: (jobId: string, checked: boolean) => void;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  selectedItem: ReviewQueueItem | null;
}

export function ReviewQueueListPanel({
  isJobPending,
  onSelectItem,
  onToggleQueueSelection,
  queue,
  queueSelection,
  selectedItem,
}: ReviewQueueListPanelProps) {
  const queueCheckboxIdPrefix = useId();
  const view = usePersistedCollectionView("shortlisted", "comfortable");
  const deferredQuery = useDeferredValue(view.query);
  const visibleQueue = useMemo(
    () =>
      queue.filter((item) =>
        matchesCollectionSearch(deferredQuery, [
          item.title,
          item.company,
          item.location,
          item.resumeApplicationMode,
          getReviewQueueWorkflowStatus(item).label,
        ]),
      ),
    [deferredQuery, queue],
  );
  const queueableVisibleIds = useMemo(
    () =>
      visibleQueue
        .filter((item) => isQueueStageReady(item))
        .map((item) => item.jobId),
    [visibleQueue],
  );
  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, jobId: string) => {
      const nextId = getAdjacentCollectionItemId(
        visibleQueue.map((item) => item.jobId),
        jobId,
        event.key,
      );
      if (!nextId) return;
      event.preventDefault();
      onSelectItem(nextId);
      focusCollectionItem(nextId);
    },
    [onSelectItem, visibleQueue],
  );
  const densityClasses =
    view.density === "compact"
      ? "gap-2 px-3 py-2"
      : view.density === "detailed"
        ? "gap-4 px-4 py-5"
        : "gap-3 px-3 py-4";

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">
          Jobs
        </p>
        <Badge variant="section">{formatCountLabel(queue.length, "job")}</Badge>
      </div>
      {queue.length > 0 ? (
        <CollectionSearchToolbar
          density={view.density}
          label="Find a shortlisted job"
          onDensityChange={view.setDensity}
          onQueryChange={view.setQuery}
          placeholder="Search role, company, location, or status"
          query={view.query}
          totalCount={queue.length}
          viewActions={
            <CollectionSavedViews
              onApply={view.applySavedView}
              onDelete={view.deleteSavedView}
              onSave={view.saveCurrentView}
              views={view.savedViews}
            />
          }
          visibleCount={visibleQueue.length}
        />
      ) : null}
      {queueSelection.length > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-(--info-border) bg-(--info-surface) px-5 py-2 text-(--info-text)">
          <strong className="text-sm">
            {queueSelection.length} selected for batch preparation
          </strong>
          <div className="flex flex-wrap gap-2">
            <button
              className="text-sm font-medium underline underline-offset-4"
              onClick={() =>
                queueableVisibleIds.forEach((jobId) =>
                  onToggleQueueSelection(jobId, true),
                )
              }
              type="button"
            >
              Select all ready results
            </button>
            <button
              className="text-sm font-medium underline underline-offset-4"
              onClick={() =>
                queueSelection.forEach((jobId) =>
                  onToggleQueueSelection(jobId, false),
                )
              }
              type="button"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5 pt-4">
          <EmptyState
            title="No shortlisted jobs yet"
            description="Shortlist a job from Find jobs to start resume review."
          />
        </div>
      ) : visibleQueue.length === 0 ? (
        <CollectionNoMatches
          noun="shortlisted jobs"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-x-hidden overflow-y-auto px-5 pb-5 pt-4">
          {visibleQueue.map((item) => {
            const isPending = isJobPending(item.jobId);
            const displayedProgress = getDisplayedResumeProgress(
              item,
              isPending,
            );
            const workflowStatus = getReviewQueueWorkflowStatus(item);
            const showProgress =
              isResumeGenerationInProgress(item) || isPending;
            const queueReady = isQueueStageReady(item);
            const selectedForQueue = queueSelection.includes(item.jobId);
            const queueCheckboxId = `${queueCheckboxIdPrefix}-${item.jobId}`;
            const queueDisabledReasonId = `${queueCheckboxId}-disabled-reason`;

            return (
              <div
                key={item.jobId}
                className={cn(
                  "grid min-w-0 w-full rounded-(--radius-panel) border border-(--surface-panel-border) text-left text-foreground transition-colors",
                  densityClasses,
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
                      aria-describedby={
                        !queueReady && !selectedForQueue
                          ? queueDisabledReasonId
                          : undefined
                      }
                      id={queueCheckboxId}
                      checked={selectedForQueue}
                      disabled={!queueReady && !selectedForQueue}
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
                  aria-keyshortcuts="ArrowUp ArrowDown Home End"
                  className="grid min-w-0 w-full gap-3 text-left outline-none transition-colors hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-ring/30"
                  data-collection-item-id={item.jobId}
                  onClick={() => onSelectItem(item.jobId)}
                  onKeyDown={(event) => handleListKeyDown(event, item.jobId)}
                  type="button"
                >
                  <div className="min-w-0 w-full">
                    <strong className="block break-words font-display text-[1rem] font-semibold tracking-(--tracking-normal) text-foreground">
                      {item.title}
                    </strong>
                  </div>
                  <span className="block w-full text-[0.8rem] text-foreground-muted">
                    {item.company} • {item.location}
                  </span>
                  <span className="label-mono-xs text-primary">
                    {item.resumeApplicationMode === "original_resume"
                      ? "Original CV unchanged"
                      : "Job-specific tailored CV"}
                  </span>
                  {!queueReady ? (
                    <span
                      className="block w-full text-[0.76rem] leading-5 text-muted-foreground"
                      id={queueDisabledReasonId}
                    >
                      Queue staging needs an approved ready PDF for this job.
                    </span>
                  ) : null}
                  {showProgress ? (
                    <div className="grid min-w-0 w-full gap-1.5">
                      <ProgressBar
                        className="h-1.5 w-full rounded-full bg-(--surface-progress-track)"
                        percent={displayedProgress}
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
