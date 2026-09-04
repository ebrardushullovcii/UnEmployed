import type { ReviewQueueItem, TailoredAsset } from "@unemployed/contracts";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@renderer/components/ui/checkbox";
import {
  Button,
  ProgressBar,
  SelectableRow,
  SelectableRowLine,
} from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  CollectionPagination,
  COLLECTION_PAGE_SIZE,
} from "../../components/collection-pagination";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "../../components/collection-search-toolbar";
import { EmptyState } from "../../components/empty-state";
import { formatJobEmployerLocationLine } from "../../lib/job-employer-location-display";
import {
  jobFinderListRegionClassName,
  jobFinderListRowBadgeSlotClassName,
  jobFinderListRowClassName,
  jobFinderListRowLinesClassName,
  jobFinderListRowMetaClassName,
  jobFinderListRowStatusClassName,
  jobFinderListRowTitleClassName,
  jobFinderListRowTitleLineClassName,
} from "../../components/list-row";
import { StatusBadge } from "../../components/status-badge";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import {
  focusCollectionItem,
  getAdjacentCollectionItemId,
} from "../../lib/collection-keyboard-navigation";
import { Link } from "react-router-dom";
import { buildJobFinderContextRoute } from "../../lib/job-finder-context-navigation";
import {
  APPLICATION_PREPARATION_BATCH_LIMIT,
  TAILORED_DRAFT_PREPARATION_LIMIT,
  countQueueStageReady,
  countTailoredDraftPreparationEligible,
  getReviewQueueResumePolicyCaption,
  getReviewQueueWorkflowStatus,
  getTailoredDraftPreparationResultMessage,
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
  tailoredAssets?: readonly TailoredAsset[] | undefined;
}

export function ReviewQueueListPanel({
  draftPreparation = {
    attemptedCount: 0,
    completedCount: 0,
    currentIndex: null,
    eligibleRemainingCount: 0,
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
  tailoredAssets,
}: ReviewQueueListPanelProps) {
  const queueCheckboxIdPrefix = useId();
  const view = usePersistedCollectionView("shortlisted", "comfortable");
  const deferredQuery = useDeferredValue(view.query);
  // Per-job asset evidence lets legacy failed-without-detail restored rows
  // resolve to the same review-pending status as the selected detail panels.
  const assetsByJobId = useMemo(
    () => new Map((tailoredAssets ?? []).map((asset) => [asset.jobId, asset])),
    [tailoredAssets],
  );
  const visibleQueue = useMemo(
    () =>
      queue.filter((item) =>
        matchesCollectionSearch(deferredQuery, [
          item.title,
          item.company,
          item.location,
          item.resumeApplicationMode,
          getReviewQueueWorkflowStatus(item, assetsByJobId.get(item.jobId))
            .label,
        ]),
      ),
    [assetsByJobId, deferredQuery, queue],
  );
  const [queuePage, setQueuePage] = useState(1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const queueListRegionRef = useRef<HTMLDivElement | null>(null);
  const [batchActionsOpen, setBatchActionsOpen] = useState(
    queueSelection.length > 0,
  );
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
    // Scoped to this panel's scroll region so the deferred frame can never
    // land focus in another surface's rows.
    focusCollectionItem(pendingFocusId, {
      region: queueListRegionRef.current,
    });
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
  const selectedReadyQueueIds = useMemo(
    () =>
      new Set(
        queue
          .filter(
            (item) =>
              isQueueStageReady(item) && queueSelectionSet.has(item.jobId),
          )
          .map((item) => item.jobId),
      ),
    [queue, queueSelectionSet],
  );
  const queueSelectionLimitReached =
    selectedReadyQueueIds.size >= APPLICATION_PREPARATION_BATCH_LIMIT;
  const queueableVisibleIds = useMemo(
    () => [
      ...new Set(
        visibleQueue
          .filter((item) => isQueueStageReady(item))
          .map((item) => item.jobId),
      ),
    ],
    [visibleQueue],
  );
  const draftEligibleCount = useMemo(
    () => countTailoredDraftPreparationEligible(queue),
    [queue],
  );
  const readyToStageCount = useMemo(() => countQueueStageReady(queue), [queue]);
  const isDraftPreparationRunning = draftPreparation.status === "running";
  const overDraftPreparationLimit =
    draftEligibleCount > TAILORED_DRAFT_PREPARATION_LIMIT;
  const draftPreparationRemainder =
    draftEligibleCount - TAILORED_DRAFT_PREPARATION_LIMIT;
  const draftPreparationCapNote = overDraftPreparationLimit
    ? `Only the next ${TAILORED_DRAFT_PREPARATION_LIMIT} eligible jobs run now, in list order; ${draftPreparationRemainder === 1 ? "1 more remains" : `${draftPreparationRemainder} more remain`}.`
    : null;
  const draftPreparationResultMessage =
    getTailoredDraftPreparationResultMessage(draftPreparation);
  // With a single job the row already says "Needs a tailored resume", so the
  // header count would only repeat it; the cue earns its place from two.
  const draftBacklogCue =
    isDraftPreparationRunning || draftEligibleCount < 2
      ? null
      : `${draftEligibleCount} jobs still need their first tailored draft`;
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

  return (
    <section className="surface-panel-shell relative flex min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-muted-foreground">
          Jobs
        </p>
        <div className="flex min-w-0 items-center gap-2">
          {draftBacklogCue ? (
            <p className="m-0 text-xs text-foreground-muted">
              {draftBacklogCue}
            </p>
          ) : null}
          {/* The search toolbar directly below owns the live count (and the
              filtered "x of y" form), so a second static chip here only
              repeats it. */}
        </div>
      </div>
      {/* A search field, a density switch and named views are list
          management for a list that usually holds one to eight rows. Only the
          search survives, and only once there is more than one row to search. */}
      {queue.length > 1 ? (
        <CollectionSearchToolbar
          compact
          label="Find a shortlisted job"
          onQueryChange={view.setQuery}
          placeholder="Search jobs"
          query={view.query}
          totalCount={queue.length}
          visibleCount={visibleQueue.length}
        />
      ) : null}
      {queue.length > 1 ? (
        <details
          className="group mx-5 border-b border-(--surface-panel-border) py-2"
          data-testid="batch-actions"
          open={batchActionsOpen}
        >
          {/* Same disclosure grammar as the workspace panel: chevron plus a
              sentence-case label. */}
          <summary
            aria-expanded={batchActionsOpen}
            className="flex cursor-pointer select-none list-none items-center gap-1.5 text-sm font-medium text-foreground outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-[3px] focus-visible:ring-ring/40"
            data-testid="batch-actions-summary"
            onClick={(event) => {
              event.preventDefault();
              setBatchActionsOpen((open) => !open);
            }}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 transition-transform",
                batchActionsOpen ? "rotate-90" : null,
              )}
            />
            Batch actions
          </summary>
          {batchActionsOpen ? (
            <div className="grid gap-3 pb-1 pt-3">
              <div
                className="grid min-w-0 gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/20 p-3 text-xs text-foreground-muted"
                data-testid="tailored-draft-preparation"
              >
                <div className="grid min-w-0 gap-0.5">
                  <strong className="text-sm text-foreground">
                    Prepare up to {TAILORED_DRAFT_PREPARATION_LIMIT} drafts
                    (review required)
                  </strong>
                  <p className="m-0">
                    {draftEligibleCount} eligible · {readyToStageCount} ready to
                    prepare
                  </p>
                  {draftPreparationCapNote ? (
                    <p className="m-0 text-foreground-muted">
                      {draftPreparationCapNote}
                    </p>
                  ) : null}
                </div>
                {isDraftPreparationRunning ? (
                  <div
                    className="flex items-center gap-2"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="m-0 text-xs text-primary">
                      Preparing {draftPreparation.currentIndex ?? 1} of{" "}
                      {draftPreparation.totalCount}
                    </p>
                    <Button
                      className="h-7 border-(--border-strong) px-2 text-xs font-medium tracking-normal normal-case"
                      onClick={onStopTailoredDraftPreparation}
                      size="compact"
                      type="button"
                      variant="ghost"
                    >
                      Stop after current draft
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {draftPreparationResultMessage ? (
                      <p
                        aria-live="polite"
                        className="m-0 min-w-0 text-xs text-primary"
                        role="status"
                      >
                        {draftPreparationResultMessage}
                      </p>
                    ) : null}
                    <Button
                      className="w-fit whitespace-normal text-sm font-medium normal-case tracking-normal"
                      disabled={draftEligibleCount === 0}
                      onClick={onPrepareTailoredDrafts}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Prepare up to {TAILORED_DRAFT_PREPARATION_LIMIT} drafts
                      (review required)
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <strong>
                  {queueSelectionSet.size} selected for batch preparation
                </strong>
                <div className="flex flex-wrap gap-2">
                  {queueableVisibleIds.length > 0 ? (
                    <button
                      className="font-medium underline underline-offset-4"
                      onClick={() => {
                        const availableSlots = Math.max(
                          0,
                          APPLICATION_PREPARATION_BATCH_LIMIT -
                            selectedReadyQueueIds.size,
                        );
                        queueableVisibleIds
                          .filter((jobId) => !queueSelectionSet.has(jobId))
                          .slice(0, availableSlots)
                          .forEach((jobId) =>
                            onToggleQueueSelection(jobId, true),
                          );
                      }}
                      type="button"
                    >
                      Select all ready jobs
                    </button>
                  ) : null}
                  {queueSelection.length > 0 ? (
                    <button
                      className="font-medium underline underline-offset-4"
                      onClick={() =>
                        queueSelectionSet.forEach((jobId) =>
                          onToggleQueueSelection(jobId, false),
                        )
                      }
                      type="button"
                    >
                      Clear selection
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </details>
      ) : null}
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5 pt-4">
          <div className="grid w-full max-w-136 justify-items-center gap-4">
            <EmptyState
              title="No shortlisted jobs yet"
              description="Shortlist a job from Find jobs to start resume review."
            />
            <Button asChild size="lg">
              <Link
                to={buildJobFinderContextRoute("/job-finder/discovery", {})}
              >
                Go to Find jobs
              </Link>
            </Button>
          </div>
        </div>
      ) : visibleQueue.length === 0 ? (
        <CollectionNoMatches
          noun="shortlisted jobs"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : (
        <div
          className={cn(
            jobFinderListRegionClassName,
            "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
          )}
          data-locked-pane-scroll-region
          ref={queueListRegionRef}
        >
          {pagedVisibleQueue.map((item) => {
            const isPending = isJobPending(item.jobId);
            const workflowStatus = getReviewQueueWorkflowStatus(
              item,
              assetsByJobId.get(item.jobId),
            );
            const showProgress =
              isResumeGenerationInProgress(item) || isPending;
            const queueReady = isQueueStageReady(item);
            const selectedForQueue = queueSelectionSet.has(item.jobId);
            const queueSelectionDisabled =
              !selectedForQueue && (!queueReady || queueSelectionLimitReached);
            const queueCheckboxId = `${queueCheckboxIdPrefix}-${item.jobId}`;
            const queueDisabledReasonId = `${queueCheckboxId}-disabled-reason`;

            return (
              // Selection is a tint plus an inset accent bar owned by the
              // shared primitive. The row's padding, margin and border-width
              // are identical in both states, so selecting a row can no longer
              // resize it or move every row below it.
              <SelectableRow
                as="div"
                key={item.jobId}
                className={cn(jobFinderListRowClassName, "text-foreground")}
                selected={selectedItem?.jobId === item.jobId}
              >
                {batchActionsOpen ? (
                  <label
                    htmlFor={queueCheckboxId}
                    className={cn(
                      "inline-flex items-center gap-2 text-(length:--text-tiny) uppercase tracking-(--tracking-badge)",
                      !queueSelectionDisabled
                        ? "text-foreground-soft"
                        : "text-muted-foreground",
                    )}
                  >
                    <Checkbox
                      aria-describedby={
                        queueSelectionDisabled
                          ? queueDisabledReasonId
                          : undefined
                      }
                      id={queueCheckboxId}
                      checked={selectedForQueue}
                      disabled={queueSelectionDisabled}
                      onCheckedChange={(value) => {
                        const checked = value === true;
                        if (
                          checked &&
                          !selectedForQueue &&
                          queueSelectionLimitReached
                        ) {
                          return;
                        }
                        onToggleQueueSelection(item.jobId, checked);
                      }}
                    />
                    Select for batch
                  </label>
                ) : null}
                <button
                  aria-current={
                    selectedItem?.jobId === item.jobId ? "true" : undefined
                  }
                  aria-keyshortcuts="ArrowUp ArrowDown Home End"
                  className={cn(
                    jobFinderListRowLinesClassName,
                    "w-full text-left outline-none transition-colors hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  )}
                  data-collection-item-id={item.jobId}
                  onClick={() => onSelectItem(item.jobId)}
                  onKeyDown={(event) => handleListKeyDown(event, item.jobId)}
                  type="button"
                >
                  {/* Title line, with the one badge slot trailing it - the
                      same slot Find jobs and Applications use. The badge used
                      to float on its own row above the title, which is what
                      made this list read as a different kind of list. It still
                      always occupies its slot: rendering it only for
                      unselected rows made the whole list jump on every
                      selection change. */}
                  <div className={jobFinderListRowTitleLineClassName}>
                    <strong className={jobFinderListRowTitleClassName}>
                      {item.title}
                    </strong>
                    <div className={jobFinderListRowBadgeSlotClassName}>
                      <SelectableRowLine className="flex justify-end">
                        {selectedItem?.jobId === item.jobId ? null : (
                          <StatusBadge
                            className="min-w-24 shrink-0 whitespace-normal break-normal [overflow-wrap:normal]"
                            tone={workflowStatus.tone}
                          >
                            {workflowStatus.label}
                          </StatusBadge>
                        )}
                      </SelectableRowLine>
                    </div>
                  </div>
                  {(() => {
                    const employerLocationLine = formatJobEmployerLocationLine({
                      company: item.company,
                      location: item.location,
                      separator: " • ",
                    });
                    return employerLocationLine ? (
                      <span className={jobFinderListRowMetaClassName}>
                        {employerLocationLine}
                      </span>
                    ) : null;
                  })()}
                  {/* Same rule as the state chip above, and the same reserved
                      slot: the detail header already states the selected job's
                      resume state, so the selected row does not restate it —
                      but the line still holds its height. */}
                  <SelectableRowLine
                    className={cn(
                      jobFinderListRowStatusClassName,
                      "font-medium text-foreground-soft",
                    )}
                  >
                    {selectedItem?.jobId === item.jobId
                      ? null
                      : getReviewQueueResumePolicyCaption(item)}
                  </SelectableRowLine>
                  {batchActionsOpen && queueSelectionDisabled ? (
                    <span
                      className="block w-full text-(length:--text-small) leading-5 text-muted-foreground"
                      id={queueDisabledReasonId}
                    >
                      {!queueReady
                        ? "Batch preparation needs a ready resume file: an approved tailored PDF or unchanged original resume."
                        : `Each employer-application batch can include up to ${APPLICATION_PREPARATION_BATCH_LIMIT} jobs. Deselect a job before choosing another.`}
                    </span>
                  ) : null}
                  {showProgress ? (
                    <div className="grid min-w-0 w-full gap-1.5">
                      {/* Row-level progress had no real percentage behind it
                          either; it only needs to say "this one is running". */}
                      <ProgressBar
                        ariaLabel="Resume preparation in progress"
                        className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-progress-track)"
                        indeterminate
                      />
                    </div>
                  ) : null}
                </button>
              </SelectableRow>
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
