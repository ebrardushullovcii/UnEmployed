import type { ReviewQueueItem, TailoredAsset } from "@unemployed/contracts";
import { ChevronRight } from "lucide-react";
import { Button } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
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
import { jobFinderListRegionClassName } from "../../components/list-row";
import { usePersistedCollectionView } from "../../hooks/use-persisted-collection-view";
import { useStableCallback } from "../../hooks/use-stable-callback";
import { ReviewQueueRow } from "./review-queue-list-row";
import { stripInternalCodeParenthetical } from "./review-queue-mission-panel-helpers";
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
  describeTailoredDraftPreparationBlocker,
  getReviewQueueResumePolicyCaption,
  getReviewQueueWorkflowStatus,
  getTailoredDraftPreparationResultMessage,
  isQueueStageReady,
  isResumeGenerationInProgress,
  QUEUE_STAGE_RESUME_REQUIREMENT,
  type TailoredDraftPreparationViewState,
} from "./review-queue-status";

interface ReviewQueueListPanelProps {
  draftPreparation?: TailoredDraftPreparationViewState;
  isJobPending: (jobId: string) => boolean;
  onPrepareTailoredDrafts?: () => void;
  onOpenSafeguards?: () => void;
  /** A safeguard holding every preparation start back, in plain words. */
  safeguardBlocker?: string | null;
  onSelectItem: (jobId: string) => void;
  onStopTailoredDraftPreparation?: () => void;
  onToggleQueueSelection: (jobId: string, checked: boolean) => void;
  /**
   * Jobs whose application is already prepared. They stop counting as ready
   * to prepare and stop being offered for batch selection.
   */
  preparedJobIds?: ReadonlySet<string>;
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
  onOpenSafeguards,
  safeguardBlocker = null,
  onSelectItem,
  onStopTailoredDraftPreparation = () => undefined,
  onToggleQueueSelection,
  preparedJobIds,
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
          getReviewQueueWorkflowStatus(
            item,
            assetsByJobId.get(item.jobId),
            false,
            preparedJobIds,
          ).label,
        ]),
      ),
    [assetsByJobId, deferredQuery, preparedJobIds, queue],
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
    [preparedJobIds, queue, queueSelectionSet],
  );
  const queueSelectionLimitReached =
    selectedReadyQueueIds.size >= APPLICATION_PREPARATION_BATCH_LIMIT;
  const queueableVisibleIds = useMemo(
    () => [
      ...new Set(
        visibleQueue
          .filter((item) => isQueueStageReady(item, preparedJobIds))
          .map((item) => item.jobId),
      ),
    ],
    [preparedJobIds, visibleQueue],
  );
  // One population, read once: both numbers on this card, and the button
  // beside them, come off the same queue plus the same prepared-job set the
  // application records give. They used to be computed from two different
  // pools, so the card could print "0 eligible · 12 ready to prepare".
  const draftEligibleCount = useMemo(
    () => countTailoredDraftPreparationEligible(queue, preparedJobIds),
    [preparedJobIds, queue],
  );
  const safeguardBlockerSentence = safeguardBlocker?.trim()
    ? stripInternalCodeParenthetical(safeguardBlocker)
    : null;
  const draftPreparationBlocker = useMemo(
    () => describeTailoredDraftPreparationBlocker(queue, preparedJobIds),
    [preparedJobIds, queue],
  );
  const readyToStageCount = useMemo(
    () => countQueueStageReady(queue, preparedJobIds),
    [preparedJobIds, queue],
  );
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
  // The three row handlers keep one identity for the life of the panel. Each
  // closes over the queue, so a `useCallback` on it would be rebuilt whenever
  // any job changed and every row would re-render with it — which is exactly
  // what memoising the rows is meant to stop.
  const handleListKeyDown = useStableCallback(
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
  );
  const selectItem = useStableCallback((jobId: string) => {
    onSelectItem(jobId);
  });
  const toggleQueueSelection = useStableCallback(
    (jobId: string, checked: boolean) => {
      onToggleQueueSelection(jobId, checked);
    },
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
                    {/* Two different things, said in words that cannot be
                        read as one: a job needing its first draft is not a
                        job whose resume is finished and waiting. */}
                    {draftEligibleCount}{" "}
                    {draftEligibleCount === 1
                      ? "job needs a first draft"
                      : "jobs need a first draft"}{" "}
                    · {readyToStageCount} ready to prepare
                  </p>
                  <p className="m-0 text-foreground-muted">
                    Each resume takes about a minute, so a full batch of{" "}
                    {TAILORED_DRAFT_PREPARATION_LIMIT} takes roughly 8–12
                    minutes. Stop any time — finished drafts are kept.
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
                      Writing resume {draftPreparation.currentIndex ?? 1} of{" "}
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
                    {/* Same rule as the single-job control: while a
                        safeguard is refusing every start, the start button is
                        replaced by the one action that can change that. */}
                    {safeguardBlockerSentence ? (
                      <Button
                        className="w-fit whitespace-normal text-sm font-medium normal-case tracking-normal"
                        data-testid="tailored-draft-preparation-safeguards"
                        onClick={() => onOpenSafeguards?.()}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Open Safeguards
                      </Button>
                    ) : (
                      <Button
                        className="w-fit whitespace-normal text-sm font-medium normal-case tracking-normal"
                        disabled={draftPreparationBlocker !== null}
                        onClick={onPrepareTailoredDrafts}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Prepare up to {TAILORED_DRAFT_PREPARATION_LIMIT} drafts
                        (review required)
                      </Button>
                    )}
                    {/* A greyed control with no reason beside it is the whole
                        defect: the person could not tell whether the app was
                        broken or they had already done the thing. */}
                    {safeguardBlockerSentence || draftPreparationBlocker ? (
                      <p
                        className="m-0 text-xs text-foreground-muted"
                        data-testid="tailored-draft-preparation-blocker"
                      >
                        {safeguardBlockerSentence ?? draftPreparationBlocker}
                      </p>
                    ) : null}
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
            // Every value the row renders is derived here and handed over as a
            // string or a boolean, so a step that changes one job's status
            // leaves the other rows' props identical and they skip the render.
            const isPending = isJobPending(item.jobId);
            const workflowStatus = getReviewQueueWorkflowStatus(
              item,
              assetsByJobId.get(item.jobId),
              isPending,
              preparedJobIds,
            );
            const queueReady = isQueueStageReady(item, preparedJobIds);
            const alreadyPrepared = Boolean(preparedJobIds?.has(item.jobId));
            const selectedForQueue = queueSelectionSet.has(item.jobId);
            const queueSelectionDisabled =
              !selectedForQueue && (!queueReady || queueSelectionLimitReached);
            const queueCheckboxId = `${queueCheckboxIdPrefix}-${item.jobId}`;
            const queueDisabledReasonId = `${queueCheckboxId}-disabled-reason`;

            return (
              <ReviewQueueRow
                batchSelectionVisible={batchActionsOpen}
                checkboxId={queueCheckboxId}
                disabledReasonId={queueDisabledReasonId}
                employerLocationLine={formatJobEmployerLocationLine({
                  company: item.company,
                  location: item.location,
                  separator: " • ",
                })}
                jobId={item.jobId}
                key={item.jobId}
                onSelect={selectItem}
                onSelectionKeyDown={handleListKeyDown}
                onToggleSelection={toggleQueueSelection}
                resumePolicyCaption={getReviewQueueResumePolicyCaption(
                  item,
                  assetsByJobId.get(item.jobId),
                )}
                selected={selectedItem?.jobId === item.jobId}
                selectedForBatch={selectedForQueue}
                selectionDisabled={queueSelectionDisabled}
                selectionDisabledReason={
                  batchActionsOpen && queueSelectionDisabled
                    ? !queueReady
                      ? alreadyPrepared
                        ? "An application is already prepared for this job. Open it from Applications to continue."
                        : QUEUE_STAGE_RESUME_REQUIREMENT
                      : `Each employer-application batch can include up to ${APPLICATION_PREPARATION_BATCH_LIMIT} jobs. Deselect a job before choosing another.`
                    : null
                }
                selectionLimitReached={queueSelectionLimitReached}
                showProgress={isResumeGenerationInProgress(item) || isPending}
                statusLabel={workflowStatus.label}
                statusTone={workflowStatus.tone}
                title={item.title}
              />
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
