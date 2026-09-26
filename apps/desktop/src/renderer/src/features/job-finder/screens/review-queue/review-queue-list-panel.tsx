import type { ReviewQueueItem, TailoredAsset } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import {
  useDeferredValue,
  useEffect,
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
  isResumeGenerationInProgress,
  type TailoredDraftPreparationViewState,
} from "./review-queue-status";

interface ReviewQueueListPanelProps {
  draftPreparation?: TailoredDraftPreparationViewState;
  isJobPending: (jobId: string) => boolean;
  /** Writes the first resume for every job that has none, one after another. */
  onPrepareTailoredDrafts?: () => void;
  /** Starts the application for every job whose resume is ready. */
  onApplyToAllReady?: (readyCount: number) => void;
  /** What Apply to all does in the mode saved in Settings, in one sentence. */
  applyAllOutcome?: string | null;
  isApplyToAllPending?: boolean;
  onOpenSafeguards?: () => void;
  /** A safeguard holding every application start back, in plain words. */
  safeguardBlocker?: string | null;
  onSelectItem: (jobId: string) => void;
  onStopTailoredDraftPreparation?: () => void;
  /**
   * Jobs whose application is already prepared. They stop counting as ready
   * to apply.
   */
  preparedJobIds?: ReadonlySet<string>;
  applicationPreparingJobIds?: ReadonlySet<string>;
  queue: readonly ReviewQueueItem[];
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
  onApplyToAllReady,
  applyAllOutcome = null,
  isApplyToAllPending = false,
  onOpenSafeguards,
  safeguardBlocker = null,
  onSelectItem,
  onStopTailoredDraftPreparation = () => undefined,
  preparedJobIds,
  applicationPreparingJobIds,
  queue,
  selectedItem,
  tailoredAssets,
}: ReviewQueueListPanelProps) {
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
            applicationPreparingJobIds,
          ).label,
        ]),
      ),
    [
      applicationPreparingJobIds,
      assetsByJobId,
      deferredQuery,
      preparedJobIds,
      queue,
    ],
  );
  const [queuePage, setQueuePage] = useState(1);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const queueListRegionRef = useRef<HTMLDivElement | null>(null);
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
  const unavailableApplicationJobIds = useMemo(
    () =>
      new Set([
        ...(preparedJobIds ?? []),
        ...(applicationPreparingJobIds ?? []),
      ]),
    [applicationPreparingJobIds, preparedJobIds],
  );
  // One population, read once: both numbers on the "for all jobs" row come
  // off the same queue plus the same prepared-job set the application
  // records give.
  const draftEligibleCount = useMemo(
    () =>
      countTailoredDraftPreparationEligible(
        queue,
        unavailableApplicationJobIds,
      ),
    [queue, unavailableApplicationJobIds],
  );
  const readyToApplyCount = useMemo(
    () =>
      Math.min(
        countQueueStageReady(queue, unavailableApplicationJobIds),
        APPLICATION_PREPARATION_BATCH_LIMIT,
      ),
    [queue, unavailableApplicationJobIds],
  );
  const safeguardBlockerSentence = safeguardBlocker?.trim()
    ? stripInternalCodeParenthetical(safeguardBlocker)
    : null;
  const draftPreparationBlocker = useMemo(
    () =>
      describeTailoredDraftPreparationBlocker(
        queue,
        unavailableApplicationJobIds,
      ),
    [queue, unavailableApplicationJobIds],
  );
  const isDraftPreparationRunning = draftPreparation.status === "running";
  const draftPreparationResultMessage =
    getTailoredDraftPreparationResultMessage(draftPreparation);
  const draftRunCount = Math.min(
    draftEligibleCount,
    TAILORED_DRAFT_PREPARATION_LIMIT,
  );
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
  // The "for all jobs" row appears only when it can do something: two or
  // more jobs, and at least one of them needs a resume or is ready to apply.
  const showsAllJobsRow =
    queue.length > 1 &&
    (isDraftPreparationRunning ||
      draftEligibleCount > 0 ||
      readyToApplyCount > 0 ||
      draftPreparationResultMessage !== null);

  return (
    <section className="surface-panel-shell relative flex min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-muted-foreground">
          Jobs
        </p>
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
      {showsAllJobsRow ? (
        <div
          className="mx-5 grid gap-2 border-b border-(--surface-panel-border) py-3"
          data-testid="shortlisted-all-jobs"
        >
          <div className="flex flex-wrap items-center gap-2">
            {isDraftPreparationRunning ? (
              <>
                <p
                  aria-live="polite"
                  className="m-0 text-sm text-primary"
                  role="status"
                >
                  Writing resume {draftPreparation.currentIndex ?? 1} of{" "}
                  {draftPreparation.totalCount}…
                </p>
                <Button
                  className="h-8 px-2.5 text-xs font-medium tracking-normal normal-case"
                  onClick={onStopTailoredDraftPreparation}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  Stop after this one
                </Button>
              </>
            ) : (
              <>
                {draftEligibleCount > 0 ? (
                  <Button
                    className="whitespace-normal text-sm font-medium normal-case tracking-normal"
                    data-testid="create-missing-resumes"
                    disabled={draftPreparationBlocker !== null}
                    onClick={onPrepareTailoredDrafts}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {draftRunCount === 1
                      ? "Create the missing resume"
                      : `Create ${draftRunCount} missing resumes`}
                  </Button>
                ) : null}
                {readyToApplyCount > 0 && onApplyToAllReady ? (
                  safeguardBlockerSentence ? (
                    <Button
                      className="whitespace-normal text-sm font-medium normal-case tracking-normal"
                      data-testid="apply-all-safeguards"
                      onClick={() => onOpenSafeguards?.()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Open Safeguards
                    </Button>
                  ) : (
                    <Button
                      className="whitespace-normal text-sm font-medium normal-case tracking-normal"
                      data-testid="apply-all-ready"
                      disabled={isApplyToAllPending}
                      onClick={() => onApplyToAllReady(readyToApplyCount)}
                      pending={isApplyToAllPending}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {readyToApplyCount === 1
                        ? "Apply to the 1 ready job"
                        : `Apply to all ${readyToApplyCount} ready jobs`}
                    </Button>
                  )
                ) : null}
              </>
            )}
          </div>
          {!isDraftPreparationRunning && draftEligibleCount > 0 ? (
            <p className="m-0 text-xs text-foreground-muted">
              {draftEligibleCount > TAILORED_DRAFT_PREPARATION_LIMIT
                ? `About a minute each, ${TAILORED_DRAFT_PREPARATION_LIMIT} at a time; ${draftEligibleCount - TAILORED_DRAFT_PREPARATION_LIMIT} more after that.`
                : "About a minute each. Stop any time; finished resumes are kept."}
            </p>
          ) : null}
          {!isDraftPreparationRunning &&
          !safeguardBlockerSentence &&
          readyToApplyCount > 0 &&
          onApplyToAllReady &&
          applyAllOutcome ? (
            <p
              className="m-0 text-xs text-foreground-muted"
              data-testid="apply-all-outcome"
            >
              {applyAllOutcome}
            </p>
          ) : null}
          {safeguardBlockerSentence && readyToApplyCount > 0 ? (
            <p
              className="m-0 text-xs text-foreground-muted"
              data-testid="apply-all-blocker"
            >
              {safeguardBlockerSentence}
            </p>
          ) : null}
          {draftPreparationResultMessage && !isDraftPreparationRunning ? (
            <p
              aria-live="polite"
              className="m-0 min-w-0 text-xs text-primary"
              role="status"
            >
              {draftPreparationResultMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5 pt-4">
          <div className="grid w-full max-w-136 justify-items-center gap-4">
            <EmptyState
              title="No shortlisted jobs yet"
              description="Shortlist a job from Find jobs. It shows up here, ready for a resume and an application."
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
              applicationPreparingJobIds,
            );

            return (
              <ReviewQueueRow
                employerLocationLine={formatJobEmployerLocationLine({
                  company: item.company,
                  location: item.location,
                  separator: " • ",
                })}
                jobId={item.jobId}
                key={item.jobId}
                onSelect={selectItem}
                onSelectionKeyDown={handleListKeyDown}
                resumePolicyCaption={
                  // While this job's resume is being (re)written the row's
                  // status already says so; the caption must not still read
                  // "Resume ready — Apply approves it" for the old text.
                  workflowStatus.label === "Writing resume"
                    ? "Writing the resume…"
                    : getReviewQueueResumePolicyCaption(
                        item,
                        assetsByJobId.get(item.jobId),
                      )
                }
                selected={selectedItem?.jobId === item.jobId}
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
