import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowserSessionState,
  ResumeApplicationMode,
  ResumeSourceDocument,
  ResumeStrategy,
  ResumeStrategyRecommendation,
  ResumeStrategySelection,
  ReviewQueueItem,
  SavedJob,
  SelectResumeStrategyInput,
  TailoredAsset,
} from "@unemployed/contracts";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { PageHeader } from "../../components/page-header";
import {
  getDisplayedResumeProgress,
  getNextDisplayedResumeProgress,
  rememberDisplayedResumeProgress,
} from "./review-queue-progress";
import { ReviewQueueListPanel } from "./review-queue-list-panel";
import { ReviewQueueMissionPanel } from "./review-queue-mission-panel";
import { ReviewQueuePreviewPanel } from "./review-queue-preview-panel";
import {
  getTailoredDraftPreparationCandidates,
  prepareTailoredDraftsSequentially,
  type TailoredDraftPreparationViewState,
} from "./review-queue-status";

export function ReviewQueueScreen(props: {
  actionState: { message: string | null };
  browserSession: BrowserSessionState;
  campaignId: string;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  isResumeStrategyPending: (jobId: string) => boolean;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (jobId: string) => Promise<boolean>;
  onOpenBrowserSession: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenProfile: () => void;
  onRecommendResumeStrategy: (input: {
    jobId: string;
  }) => Promise<ResumeStrategyRecommendation | null>;
  onRemoveReviewJob: (jobId: string) => void;
  onSelectResumeStrategy: (input: SelectResumeStrategyInput) => void;
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
}) {
  const {
    actionState,
    browserSession,
    campaignId,
    isApplyPending,
    isJobPending,
    isResumeStrategyPending,
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
    onSetJobResumeApplicationMode,
    onSelectItem,
    originalResume,
    queue,
    resumeStrategies,
    resumeStrategySelections,
    selectedAsset,
    selectedItem,
    selectedJob,
  } = props;
  const previewState =
    selectedItem &&
    selectedItem.resumeApplicationMode !== "original_resume" &&
    !selectedAsset &&
    selectedItem.assetStatus === "ready"
      ? "missing"
      : null;
  const [queueSelection, setQueueSelection] = useState<readonly string[]>([]);
  const [draftPreparation, setDraftPreparation] =
    useState<TailoredDraftPreparationViewState>({
      attemptedCount: 0,
      completedCount: 0,
      currentIndex: null,
      failedCount: 0,
      status: "idle",
      totalCount: 0,
    });
  const draftPreparationRunRef = useRef(false);
  const draftPreparationStopRequestedRef = useRef(false);
  const selectedJobPending = selectedItem
    ? isJobPending(selectedItem.jobId)
    : false;
  const [displayedProgress, setDisplayedProgress] = useState(() =>
    getDisplayedResumeProgress(selectedItem, selectedJobPending),
  );
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
  const queueJobIds = useMemo(() => queue.map((item) => item.jobId), [queue]);

  useEffect(() => {
    setDisplayedProgress(
      getDisplayedResumeProgress(selectedItem, selectedJobPending),
    );
  }, [selectedItem, selectedJobPending]);

  useEffect(() => {
    if (!selectedJobPending) {
      return;
    }

    const timer = window.setInterval(() => {
      setDisplayedProgress((current) => {
        const nextProgress = getNextDisplayedResumeProgress(current);
        rememberDisplayedResumeProgress(selectedItem, nextProgress);

        return nextProgress;
      });
    }, 650);

    return () => window.clearInterval(timer);
  }, [selectedItem, selectedJobPending]);

  useEffect(() => {
    setQueueSelection((current) => {
      const nextSelection = current.filter((jobId) =>
        queueJobIds.includes(jobId),
      );

      return nextSelection.length === current.length ? current : nextSelection;
    });
  }, [queueJobIds]);

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
  const handleStopTailoredDraftPreparation = useCallback(() => {
    if (!draftPreparationRunRef.current) {
      return;
    }

    draftPreparationStopRequestedRef.current = true;
  }, []);
  const handlePrepareTailoredDrafts = useCallback(async () => {
    if (draftPreparationRunRef.current) {
      return;
    }

    const candidates = getTailoredDraftPreparationCandidates(queue);
    if (candidates.length === 0) {
      return;
    }

    draftPreparationRunRef.current = true;
    draftPreparationStopRequestedRef.current = false;
    setDraftPreparation({
      attemptedCount: 0,
      completedCount: 0,
      currentIndex: null,
      failedCount: 0,
      status: "running",
      totalCount: candidates.length,
    });

    try {
      const result = await prepareTailoredDraftsSequentially(
        candidates,
        onGenerateResume,
        {
          onProgress: ({ completedCount, currentIndex, totalCount }) => {
            setDraftPreparation((current) => ({
              ...current,
              attemptedCount: currentIndex,
              completedCount,
              currentIndex,
              totalCount,
              status: "running",
            }));
          },
          shouldStop: () => draftPreparationStopRequestedRef.current,
        },
      );

      setDraftPreparation({
        attemptedCount: result.attemptedCount,
        completedCount: result.completedCount,
        currentIndex: null,
        failedCount: result.failedCount,
        status: result.failedJobId
          ? "failed"
          : result.stopped
            ? "stopped"
            : "completed",
        totalCount: result.totalCount,
      });
    } finally {
      draftPreparationRunRef.current = false;
    }
  }, [onGenerateResume, queue]);

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-4 pt-6"
      topContent={
        <PageHeader
          compact
          eyebrow="Shortlisted"
          title="Shortlisted jobs"
          description={
            selectedItem?.resumeApplicationMode === "original_resume"
              ? "Review the original CV you imported, then choose whether Apply Copilot should use it unchanged."
              : "Review each saved job, approve its PDF, and start Apply Copilot when you are ready."
          }
        />
      }
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[20rem_minmax(22rem,1fr)_24rem] xl:overflow-hidden">
        <ReviewQueueListPanel
          draftPreparation={draftPreparation}
          isJobPending={isJobPending}
          onPrepareTailoredDrafts={() => {
            void handlePrepareTailoredDrafts();
          }}
          onSelectItem={onSelectItem}
          onStopTailoredDraftPreparation={handleStopTailoredDraftPreparation}
          onToggleQueueSelection={handleToggleQueueSelection}
          queue={queue}
          queueSelection={queueSelection}
          selectedItem={selectedItem}
        />
        <ReviewQueuePreviewPanel
          displayedProgress={displayedProgress}
          isGenerating={selectedJobPending}
          onEditResumeWorkspace={onEditResumeWorkspace}
          onGenerateResume={onGenerateResume}
          originalResume={originalResume}
          previewState={previewState}
          queue={queue}
          selectedAsset={selectedAsset}
          selectedItem={selectedItem}
          selectedJob={selectedJob}
        />
        <ReviewQueueMissionPanel
          actionMessage={scopedActionMessage}
          browserSession={browserSession}
          campaignId={campaignId}
          displayedProgress={displayedProgress}
          isApplyPending={isApplyPending}
          isJobPending={isJobPending}
          isResumeStrategyPending={isResumeStrategyPending}
          onClearQueueSelection={handleClearQueueSelection}
          onStartAutoApplyQueue={onStartAutoApplyQueue}
          onStartApplyCopilot={onStartApplyCopilot}
          onEditResumeWorkspace={onEditResumeWorkspace}
          onGenerateResume={onGenerateResume}
          onOpenBrowserSession={onOpenBrowserSession}
          onOpenJobDetails={onOpenJobDetails}
          onOpenProfile={onOpenProfile}
          onRecommendResumeStrategy={onRecommendResumeStrategy}
          onRemoveReviewJob={onRemoveReviewJob}
          onSelectResumeStrategy={onSelectResumeStrategy}
          onSetJobResumeApplicationMode={onSetJobResumeApplicationMode}
          queue={queue}
          queueSelection={queueSelection}
          resumeStrategies={resumeStrategies}
          resumeStrategySelections={resumeStrategySelections}
          selectedAsset={selectedAsset}
          selectedItem={selectedItem}
          selectedJob={selectedJob}
        />
      </div>
    </LockedScreenLayout>
  );
}
