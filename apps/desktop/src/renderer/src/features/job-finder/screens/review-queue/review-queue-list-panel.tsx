import type { ReviewQueueItem } from "@unemployed/contracts";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { Badge, Button, ProgressBar } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
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
  countQueueStageReady,
  countTailoredDraftPreparationEligible,
  getReviewQueueWorkflowStatus,
  isQueueStageReady,
  isResumeGenerationInProgress,
  type TailoredDraftPreparationViewState,
} from "./review-queue-status";

interface ReviewQueueListPanelProps {
  draftPreparation?: TailoredDraftPreparationViewState;
  isJobPending: (jobId: string) => boolean;
  onPrepareTailoredDrafts?: () => void;
  onSelectItem: (jobId: string) => void;
  onStopTailoredDraftPreparation?: () => void;
  onToggleQueueSelection: (jobId: string, checked: boolean) => void;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  selectedItem: ReviewQueueItem | null;
}

export function ReviewQueueListPanel({
  draftPreparation = {
    attemptedCount: 0,
    completedCount: 0,
    currentIndex: null,
    failedCount: 0,
    status: "idle",
    totalCount: 0,
  },
  isJobPending,
  onPrepareTailoredDrafts = () => undefined,
  onSelectItem,
  onStopTailoredDraftPreparation = () => undefined,
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
  const [queuePage, setQueuePage] = useState(1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const queuePageCount = Math.max(
    1,
    Math.ceil(visibleQueue.length / COLLECTION_PAGE_SIZE),
  );
  const currentQueuePage = Math.min(queuePage, queuePageCount);
  const selectedQueueIndex = useMemo(
    () =>
      selectedItem
        ? visibleQueue.findIndex((item) => item.jobId === selectedItem.jobId)
        : -1,
    [selectedItem, visibleQueue],
  );
  useEffect(() => {
    setQueuePage(1);
  }, [deferredQuery]);
  useEffect(() => {
    setQueuePage((currentPage) => Math.min(currentPage, queuePageCount));
  }, [queuePageCount]);
  useEffect(() => {
    if (selectedQueueIndex < 0) return;
    setQueuePage(Math.floor(selectedQueueIndex / COLLECTION_PAGE_SIZE) + 1);
  }, [selectedQueueIndex]);
  useEffect(() => {
    if (!pendingFocusId) return;
    focusCollectionItem(pendingFocusId);
    setPendingFocusId(null);
  }, [currentQueuePage, pendingFocusId]);
  const pagedVisibleQueue = useMemo(
    () =>
      visibleQueue.slice(
        (currentQueuePage - 1) * COLLECTION_PAGE_SIZE,
        currentQueuePage * COLLECTION_PAGE_SIZE,
      ),
    [currentQueuePage, visibleQueue],
  );
  const queueSelectionSet = useMemo(
    () => new Set(queueSelection),
    [queueSelection],
  );
  const queueableVisibleIds = useMemo(
    () =>
      visibleQueue
        .filter((item) => isQueueStageReady(item))
        .map((item) => item.jobId),
    [visibleQueue],
  );
  const draftEligibleCount = useMemo(
    () => countTailoredDraftPreparationEligible(queue),
    [queue],
  );
  const readyToStageCount = useMemo(() => countQueueStageReady(queue), [queue]);
  const isDraftPreparationRunning = draftPreparation.status === "running";
  const draftPreparationResultMessage =
    draftPreparation.status === "completed"
      ? `Prepared ${draftPreparation.completedCount} tailored draft${draftPreparation.completedCount === 1 ? "" : "s"}. Each draft still needs your review and approval. Nothing was approved, queued, submitted, or sent.`
      : draftPreparation.status === "stopped"
        ? `Stopped after ${draftPreparation.completedCount} completed draft${draftPreparation.completedCount === 1 ? "" : "s"}. Nothing was approved, queued, submitted, or sent.`
        : draftPreparation.status === "failed"
          ? `Stopped after ${draftPreparation.completedCount} completed draft${draftPreparation.completedCount === 1 ? "" : "s"}; ${draftPreparation.failedCount} failed. Nothing was approved, queued, submitted, or sent. Fix the failed job and rerun to target only remaining eligible jobs.`
          : null;
  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, jobId: string) => {
      const nextId = getAdjacentCollectionItemId(
        visibleQueue.map((item) => item.jobId),
        jobId,
        event.key,
      );
      if (!nextId) return;
      event.preventDefault();
      const nextIndex = visibleQueue.findIndex((item) => item.jobId === nextId);
      const nextPage = Math.floor(nextIndex / COLLECTION_PAGE_SIZE) + 1;
      if (nextPage !== currentQueuePage) {
        setQueuePage(nextPage);
      }
      onSelectItem(nextId);
      setPendingFocusId(nextId);
    },
    [currentQueuePage, onSelectItem, visibleQueue],
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
      {queue.length > 0 ? (
        <div
          className="mx-5 mb-3 grid gap-2 rounded-(--radius-panel) border border-primary/30 bg-primary/5 px-4 py-3"
          data-testid="tailored-draft-preparation"
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="grid min-w-0 gap-1">
              <strong className="text-sm font-semibold text-(--text-headline)">
                Prepare tailored drafts
              </strong>
              <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                Prepare the next up to 10 shortlisted jobs that need a tailored
                draft. Each draft uses your current saved profile and approach
                when its turn starts.
              </p>
            </div>
            <Badge variant="section">Bounded to 10</Badge>
          </div>
          <p className="m-0 text-(length:--text-small) font-medium text-foreground">
            Draft eligible: {draftEligibleCount} · Ready to stage:{" "}
            {readyToStageCount}
          </p>
          {isDraftPreparationRunning ? (
            <div className="grid gap-2" role="status" aria-live="polite">
              <p className="m-0 text-(length:--text-small) leading-5 text-primary">
                Preparing tailored drafts — {draftPreparation.currentIndex ?? 1}{" "}
                of {draftPreparation.totalCount}. Each draft still needs your
                review and approval.
              </p>
              <Button
                className="w-full justify-center sm:w-auto sm:justify-start"
                onClick={onStopTailoredDraftPreparation}
                size="compact"
                type="button"
                variant="outline"
              >
                Stop after current draft
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              {draftPreparationResultMessage ? (
                <p
                  aria-live="polite"
                  className="m-0 text-(length:--text-small) leading-5 text-primary"
                  role="status"
                >
                  {draftPreparationResultMessage}
                </p>
              ) : null}
              <Button
                className="w-full justify-center sm:w-auto sm:justify-start"
                disabled={draftEligibleCount === 0}
                onClick={onPrepareTailoredDrafts}
                size="compact"
                type="button"
                variant="secondary"
              >
                Prepare tailored drafts
              </Button>
              {draftEligibleCount === 0 ? (
                <p className="m-0 text-(length:--text-small) leading-5 text-muted-foreground">
                  No shortlisted jobs currently need a new tailored draft.
                </p>
              ) : null}
            </div>
          )}
        </div>
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
          {pagedVisibleQueue.map((item) => {
            const isPending = isJobPending(item.jobId);
            const displayedProgress = getDisplayedResumeProgress(
              item,
              isPending,
            );
            const workflowStatus = getReviewQueueWorkflowStatus(item);
            const showProgress =
              isResumeGenerationInProgress(item) || isPending;
            const queueReady = isQueueStageReady(item);
            const selectedForQueue = queueSelectionSet.has(item.jobId);
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
                      Queue staging needs a ready resume file: an approved
                      tailored PDF or unchanged original CV.
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
      {queue.length > 0 && visibleQueue.length > 0 ? (
        <CollectionPagination
          itemLabel="shortlisted jobs"
          onPageChange={setQueuePage}
          page={currentQueuePage}
          pageSize={COLLECTION_PAGE_SIZE}
          totalCount={visibleQueue.length}
        />
      ) : null}
    </section>
  );
}
