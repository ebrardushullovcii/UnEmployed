import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowserSessionState,
  ApplicationRecord,
  GlobalDailyApplicationPreparationCapacity,
  JobFinderApplicationStartTarget,
  ResumeApplicationMode,
  ResumeSourceDocument,
  ResumeStrategy,
  ResumeStrategyRecommendation,
  ResumeStrategySelection,
  ReviewQueueItem,
  SavedJob,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  TailoredAsset,
} from "@unemployed/contracts";
import {
  APPLICATION_PREPARATION_BATCH_LIMIT,
  getReviewQueueWorkflowStatus,
  isQueueStageReady,
  isResumeGenerationInProgress,
} from "./review-queue-status";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { PageHeader } from "../../components/page-header";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { MatchEvidenceMatrix } from "../../components/match-evidence-matrix";
import { jobDescriptionToText } from "../../lib/job-description-text";
import {
  formatJobEmployerLocationLine,
  scrubJobAbsencePlaceholdersList,
} from "../../lib/job-employer-location-display";
import { getMatchAssessmentPresentation } from "../../lib/match-assessment-presentation";
import { RESUME_OPERATION_LONG_RUNNING_MS } from "./review-queue-progress";
import {
  readReviewQueueBatchSelection,
  writeReviewQueueBatchSelection,
} from "./review-queue-batch-selection";
import type { JobFinderAutoApplyQueueStartOutcome } from "../../lib/job-finder-types";
import { ReviewQueueListPanel } from "./review-queue-list-panel";
import { ReviewQueueMissionPanel } from "./review-queue-mission-panel";
import { ReviewQueuePreviewPanel } from "./review-queue-preview-panel";
import type { TailoredDraftPreparationViewState } from "./review-queue-status";

const workspacePanelId = "review-queue-workspace-panel";

/**
 * Restores a persisted batch curation only for jobs that are still in the
 * current queue and still eligible for batch preparation, deduplicated and
 * capped at the application batch limit. Disappeared or ineligible ids are
 * dropped instead of being restored as ghost selections.
 */
function selectRestorableQueueSelection(
  storedJobIds: readonly string[],
  queue: readonly ReviewQueueItem[],
): readonly string[] {
  const restorableJobIds: string[] = [];
  for (const storedJobId of storedJobIds) {
    if (restorableJobIds.length >= APPLICATION_PREPARATION_BATCH_LIMIT) {
      break;
    }

    if (restorableJobIds.includes(storedJobId)) {
      continue;
    }

    const queuedItem = queue.find((item) => item.jobId === storedJobId);
    if (!queuedItem || !isQueueStageReady(queuedItem)) {
      continue;
    }

    restorableJobIds.push(storedJobId);
  }

  return restorableJobIds;
}

export function ReviewQueueScreen(props: {
  resumeOperationStarts?: Readonly<Record<string, number>> | undefined;
  actionState: { message: string | null };
  applicationRecords: readonly ApplicationRecord[];
  browserSession: BrowserSessionState;
  campaignId: string;
  campaignDefaultResumeStrategyId?: string | null | undefined;
  draftPreparation: TailoredDraftPreparationViewState;
  globalDailyApplicationPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  isResumeStrategyPending: (jobId: string) => boolean;
  onPrepareTailoredDrafts: () => void;
  onStopTailoredDraftPreparation: () => void;
  onStartAutoApplyQueue: (
    jobIds: string[],
  ) => Promise<JobFinderAutoApplyQueueStartOutcome>;
  onStartApplyCopilot: (input: JobFinderApplicationStartTarget) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (
    jobId: string,
    options?: { selectAfter?: boolean },
  ) => Promise<boolean>;
  onOpenBrowserSession: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenProfile: () => void;
  onRecommendResumeStrategy: (input: {
    jobId: string;
  }) => Promise<ResumeStrategyRecommendation | null>;
  onRemoveReviewJob: (jobId: string) => void;
  onSelectResumeStrategy: (input: SelectResumeStrategyInput) => void;
  onSetCampaignResumeStrategyDefault?:
    | ((input: SetCampaignResumeStrategyDefaultInput) => void)
    | undefined;
  onSetJobResumeApplicationMode: (
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ) => void;
  onSelectItem: (jobId: string) => void;
  originalResume: ResumeSourceDocument;
  queue: readonly ReviewQueueItem[];
  resumeStrategies: readonly ResumeStrategy[];
  resumeStrategySelections: readonly ResumeStrategySelection[];
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
  tailoredAssets?: readonly TailoredAsset[] | undefined;
}) {
  const {
    resumeOperationStarts,
    actionState,
    applicationRecords,
    browserSession,
    campaignId,
    campaignDefaultResumeStrategyId,
    draftPreparation,
    globalDailyApplicationPreparationCapacity,
    isApplyPending,
    isJobPending,
    isResumeStrategyPending,
    onPrepareTailoredDrafts,
    onStopTailoredDraftPreparation,
    onStartAutoApplyQueue,
    onStartApplyCopilot,
    onEditResumeWorkspace,
    onGenerateResume,
    onOpenBrowserSession,
    onOpenJobDetails,
    onOpenProfile,
    onRecommendResumeStrategy,
    onRemoveReviewJob,
    onSelectResumeStrategy,
    onSetCampaignResumeStrategyDefault,
    onSetJobResumeApplicationMode,
    onSelectItem,
    originalResume,
    queue,
    resumeStrategies,
    resumeStrategySelections,
    selectedAsset,
    selectedItem,
    selectedJob,
    tailoredAssets,
  } = props;
  const previewState =
    selectedItem &&
    selectedItem.resumeApplicationMode !== "original_resume" &&
    !selectedAsset &&
    selectedItem.assetStatus === "ready"
      ? "missing"
      : null;
  // The curated batch selection survives route remounts per active campaign:
  // it is restored from durable renderer storage, then kept pruned to jobs
  // that are still current and eligible for batch preparation.
  const [selectionCampaignId, setSelectionCampaignId] = useState(campaignId);
  const [queueSelection, setQueueSelection] = useState<readonly string[]>(() =>
    selectRestorableQueueSelection(
      readReviewQueueBatchSelection(campaignId),
      queue,
    ),
  );
  if (selectionCampaignId !== campaignId) {
    setSelectionCampaignId(campaignId);
    setQueueSelection(
      selectRestorableQueueSelection(
        readReviewQueueBatchSelection(campaignId),
        queue,
      ),
    );
  }
  const selectedJobPending = selectedItem
    ? isJobPending(selectedItem.jobId)
    : false;
  const selectedJobId = selectedItem?.jobId ?? null;
  const [selectedJobPendingTooLong, setSelectedJobPendingTooLong] =
    useState(false);
  const isSelectedJobPreparing =
    selectedJobPending || isResumeGenerationInProgress(selectedItem);
  const [pendingElapsedSeconds, setPendingElapsedSeconds] = useState(0);
  const actionMessageScopeRef = useRef<{
    jobId: string | null;
    message: string | null;
  }>({ jobId: selectedItem?.jobId ?? null, message: actionState.message });
  if (actionMessageScopeRef.current.message !== actionState.message) {
    actionMessageScopeRef.current = {
      jobId: selectedItem?.jobId ?? null,
      message: actionState.message,
    };
  }
  const scopedActionMessage =
    actionMessageScopeRef.current.jobId === (selectedItem?.jobId ?? null)
      ? actionState.message
      : null;
  const eligibleQueueJobIds = useMemo(
    () =>
      new Set(
        queue
          .filter((item) => isQueueStageReady(item))
          .map((item) => item.jobId),
      ),
    [queue],
  );
  const selectedWorkflowStatus = getReviewQueueWorkflowStatus(
    selectedItem,
    selectedAsset,
  );
  const selectedJobEmployerLocationLine = selectedJob
    ? formatJobEmployerLocationLine({
        company: selectedJob.company,
        location: selectedJob.location,
        canonicalUrl: selectedJob.canonicalUrl,
      })
    : "";
  const selectedJobFitReasons = selectedJob
    ? scrubJobAbsencePlaceholdersList(selectedJob.matchAssessment.reasons)
    : [];
  const selectedJobAssessment = selectedJob
    ? getMatchAssessmentPresentation(selectedJob)
    : null;
  // A "summary" that only repeats the job title is not listing text.
  const selectedJobSummaryText = (() => {
    if (!selectedJob) {
      return "";
    }
    const text = jobDescriptionToText(
      selectedJob.summary ?? selectedJob.description,
    ).trim();
    return text.toLowerCase() === selectedJob.title.trim().toLowerCase()
      ? ""
      : text;
  })();

  const operationStartedAt = selectedJobId
    ? resumeOperationStarts?.[selectedJobId]
    : undefined;

  useEffect(() => {
    setSelectedJobPendingTooLong(false);

    if (!selectedJobPending || selectedJobId === null) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => {
        setSelectedJobPendingTooLong(true);
      },
      Math.max(
        0,
        RESUME_OPERATION_LONG_RUNNING_MS -
          (operationStartedAt === undefined
            ? 0
            : Date.now() - operationStartedAt),
      ),
    );

    return () => window.clearTimeout(timeoutId);
  }, [selectedJobId, selectedJobPending, operationStartedAt]);

  // The draft reports no real progress, so the honest thing to move is the
  // clock, not a fabricated percentage. Same shape the resume import and the
  // Assistant already use. Keyed to the same condition the panels use to show
  // the indicator, so the bar never appears beside a stopped clock.
  useEffect(() => {
    if (!isSelectedJobPreparing || selectedJobId === null) {
      setPendingElapsedSeconds(0);
      return;
    }

    const startedAt = operationStartedAt ?? Date.now();
    const updateElapsed = () =>
      setPendingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);

    return () => window.clearInterval(timer);
  }, [isSelectedJobPreparing, selectedJobId, operationStartedAt]);

  useEffect(() => {
    writeReviewQueueBatchSelection(campaignId, queueSelection);
  }, [campaignId, queueSelection]);

  useEffect(() => {
    setQueueSelection((current) => {
      const nextSelection = current.filter((jobId) =>
        eligibleQueueJobIds.has(jobId),
      );

      return nextSelection.length === current.length ? current : nextSelection;
    });
  }, [eligibleQueueJobIds]);

  const handleToggleQueueSelection = useCallback(
    (jobId: string, checked: boolean) => {
      setQueueSelection((current) => {
        if (checked) {
          return current.includes(jobId) ? current : [...current, jobId];
        }

        return current.filter((entry) => entry !== jobId);
      });
    },
    [],
  );
  const handleClearQueueSelection = useCallback(() => {
    setQueueSelection([]);
  }, []);
  const handleStartAutoApplyQueue = useCallback(
    (jobIds: string[]) => {
      void onStartAutoApplyQueue(jobIds).then((outcome) => {
        // Staging the batch consumes its curated selection only when the
        // queue run creation is confirmed. A capacity refusal, a handled
        // backend failure, or any unknown ending preserves the exact staged
        // selection (and the panel) so the curation is never silently lost;
        // visible feedback for those endings is owned by the controller.
        if (outcome.status !== "confirmed") {
          return;
        }

        setQueueSelection((current) => {
          const stagedJobIds = new Set(jobIds);
          const nextSelection = current.filter(
            (jobId) => !stagedJobIds.has(jobId),
          );

          return nextSelection.length === current.length
            ? current
            : nextSelection;
        });
      });
    },
    [onStartAutoApplyQueue],
  );
  // Below the `xl` two-pane breakpoint the job workspace stacks under the queue
  // list, so selecting a job moved the one next action (`Review and approve
  // resume` / `Prepare application`) below the fold with nothing saying so.
  // Find jobs and Applications both reveal their stacked detail region on
  // pointer selection; Shortlisted now uses the same mechanism, against the
  // same 1280px boundary as its own `xl:` grid.
  const selectItemAndRevealWorkspace = useCallback(
    (jobId: string) => {
      onSelectItem(jobId);

      if (
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(min-width: 1280px)").matches
      ) {
        return;
      }

      window.requestAnimationFrame(() => {
        document
          .getElementById(workspacePanelId)
          ?.scrollIntoView({ block: "start" });
      });
    },
    [onSelectItem],
  );
  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      lockContentHeight
      topContent={
        <PageHeader
          compact
          eyebrow="Shortlisted"
          title="Shortlisted jobs"
          description={
            selectedItem?.resumeApplicationMode === "original_resume"
              ? "Review your imported resume and choose whether to use it unchanged."
              : "Review saved jobs, approve a resume, and prepare applications."
          }
        />
      }
    >
      <div className="grid min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(24rem,0.72fr)_minmax(34rem,1fr)] xl:overflow-hidden">
        <ReviewQueueListPanel
          draftPreparation={draftPreparation}
          isJobPending={isJobPending}
          onPrepareTailoredDrafts={onPrepareTailoredDrafts}
          onSelectItem={selectItemAndRevealWorkspace}
          onStopTailoredDraftPreparation={onStopTailoredDraftPreparation}
          onToggleQueueSelection={handleToggleQueueSelection}
          queue={queue}
          queueSelection={queueSelection}
          selectedItem={selectedItem}
          tailoredAssets={tailoredAssets}
        />
        <section className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
          {/* Pinned: reading a long resume or job description must not scroll
              away the job title or its state. */}
          <header className="sticky top-0 z-10 grid shrink-0 gap-1 border-b border-(--surface-panel-border) bg-(--surface-panel) px-5 pb-3 pt-4 xl:static">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-(--text-headline)">
                  {selectedJob?.title ?? "Job workspace"}
                </h2>
                {selectedJob ? (
                  selectedJobEmployerLocationLine ? (
                    <p className="mt-1 truncate text-(length:--text-small) text-foreground-muted">
                      {selectedJobEmployerLocationLine}
                    </p>
                  ) : null
                ) : (
                  <p className="mt-1 truncate text-(length:--text-small) text-foreground-muted">
                    Choose a shortlisted job to review it.
                  </p>
                )}
              </div>
              {selectedItem ? (
                <StatusBadge tone={selectedWorkflowStatus.tone}>
                  {selectedWorkflowStatus.label}
                </StatusBadge>
              ) : null}
            </div>
          </header>
          {/* One column, in the order the work happens: what state this job is
              in and its one next action, then the resume once it exists, then
              the job facts. The three tabs split a strictly sequential job
              across three destinations, two of which were nearly empty. */}
          <div
            className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto pb-6"
            data-locked-pane-scroll-region
            data-testid="review-queue-workspace-column"
            id={workspacePanelId}
          >
            {selectedItem ? (
              <ReviewQueueMissionPanel
                actionMessage={scopedActionMessage}
                applicationRecords={applicationRecords}
                browserSession={browserSession}
                campaignId={campaignId}
                campaignDefaultResumeStrategyId={
                  campaignDefaultResumeStrategyId
                }
                pendingElapsedSeconds={pendingElapsedSeconds}
                globalDailyApplicationPreparationCapacity={
                  globalDailyApplicationPreparationCapacity
                }
                embedded
                isApplyPending={isApplyPending}
                isJobPending={isJobPending}
                isSelectedJobPendingTooLong={selectedJobPendingTooLong}
                isResumeStrategyPending={isResumeStrategyPending}
                onClearQueueSelection={handleClearQueueSelection}
                onStartAutoApplyQueue={handleStartAutoApplyQueue}
                onStartApplyCopilot={onStartApplyCopilot}
                onEditResumeWorkspace={onEditResumeWorkspace}
                onGenerateResume={onGenerateResume}
                onOpenBrowserSession={onOpenBrowserSession}
                onOpenJobDetails={onOpenJobDetails}
                onOpenProfile={onOpenProfile}
                onRecommendResumeStrategy={onRecommendResumeStrategy}
                onRemoveReviewJob={onRemoveReviewJob}
                onSelectResumeStrategy={onSelectResumeStrategy}
                onSetCampaignResumeStrategyDefault={
                  onSetCampaignResumeStrategyDefault
                }
                onSetJobResumeApplicationMode={onSetJobResumeApplicationMode}
                originalResume={originalResume}
                queue={queue}
                queueSelection={queueSelection}
                resumeStrategies={resumeStrategies}
                resumeStrategySelections={resumeStrategySelections}
                selectedAsset={selectedAsset}
                selectedItem={selectedItem}
                selectedJob={selectedJob}
                stacked
              />
            ) : null}
            {selectedItem && (selectedAsset || previewState === "missing") ? (
              // The resume appears in place once one exists; before that the
              // tab was a ~600px empty box duplicating the primary above it.
              <ReviewQueuePreviewPanel
                pendingElapsedSeconds={pendingElapsedSeconds}
                embedded
                isGenerating={selectedJobPending}
                isPendingTooLong={selectedJobPendingTooLong}
                onEditResumeWorkspace={onEditResumeWorkspace}
                onGenerateResume={onGenerateResume}
                originalResume={originalResume}
                previewState={previewState}
                queue={queue}
                selectedAsset={selectedAsset}
                selectedItem={selectedItem}
                selectedJob={selectedJob}
                stacked
              />
            ) : null}
            {selectedJob && selectedItem ? (
              <div className="min-w-0 px-6 pt-2">
                {/* Every level down to the listing text resets its minimum
                    width, and the text may break inside a word: a listing
                    with one long unbroken token (a URL, a hashtag run)
                    otherwise sets the column's minimum content width and
                    pushes the whole workspace past the pane's right edge. */}
                <div className="grid min-w-0 max-w-3xl gap-6">
                  <section className="grid min-w-0 gap-2 border-t border-(--surface-panel-border) pt-5">
                    <span className="label-mono-xs text-foreground-muted">
                      About this job
                    </span>
                    {/* An echoed title under a heading looks like a bug; the
                        listing text only appears when it is real text. */}
                    {selectedJobSummaryText ? (
                      <p className="min-w-0 wrap-anywhere whitespace-pre-line text-(length:--text-body) leading-7 text-foreground-soft">
                        {selectedJobSummaryText}
                      </p>
                    ) : (
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                        The listing text was not captured. Open the full job
                        details to read it.
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <strong
                        aria-label={
                          selectedJobAssessment?.headlineScoreAriaLabel
                        }
                        className="text-(length:--text-body) text-(--text-headline)"
                        data-testid="review-queue-fit-score"
                      >
                        {/* One shared rule decides whether a percentage was
                            earned. A withheld score reads as what it is
                            instead of a confident number above five
                            "we don't know" rows. */}
                        {selectedJobAssessment?.headlineScoreLabel}
                      </strong>
                      <span className="min-w-0 text-(length:--text-small) leading-6 text-foreground-soft">
                        {selectedJobAssessment?.withheldReason ??
                          selectedJobFitReasons[0] ??
                          "Estimated from the listing and your approved profile."}
                      </span>
                    </div>
                    <Button
                      className="mt-1 w-fit"
                      onClick={() => onOpenJobDetails(selectedItem.jobId)}
                      type="button"
                      variant="secondary"
                    >
                      Open full job details
                    </Button>
                  </section>
                  {/* One honest line above, the full reasoning behind a
                      disclosure: five UNKNOWN cards cost ~900px to say the
                      listing title was all that could be read. */}
                  <details className="min-w-0 rounded-(--radius-field) border border-(--surface-panel-border)">
                    <summary className="cursor-pointer px-4 py-3 text-(length:--text-small) font-medium text-foreground-soft">
                      How this was scored
                    </summary>
                    <div className="px-4 pb-4">
                      <MatchEvidenceMatrix
                        assessment={selectedJob.matchAssessment}
                        // Always authoritative, including the null case: an
                        // unbound assessment must print no number at all
                        // rather than fall back to the matrix's own default.
                        scoreLabel={
                          selectedJobAssessment?.breakdownScoreLabel ?? null
                        }
                      />
                    </div>
                  </details>
                </div>
              </div>
            ) : null}
            {!selectedItem ? (
              <div className="grid place-items-center p-8">
                <EmptyState
                  description="Select a shortlisted job to review its details."
                  title="Choose a job"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </LockedScreenLayout>
  );
}
