import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
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
} from "./review-queue-status";
import { LockedScreenLayout } from "../../components/locked-screen-layout";
import { PageHeader } from "../../components/page-header";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { jobDescriptionToText } from "../../lib/job-description-text";
import {
  getDisplayedResumeProgress,
  getNextDisplayedResumeProgress,
  rememberDisplayedResumeProgress,
} from "./review-queue-progress";
import {
  readReviewQueueBatchSelection,
  writeReviewQueueBatchSelection,
} from "./review-queue-batch-selection";
import type { JobFinderAutoApplyQueueStartOutcome } from "../../lib/job-finder-types";
import { ReviewQueueListPanel } from "./review-queue-list-panel";
import { ReviewQueueMissionPanel } from "./review-queue-mission-panel";
import { ReviewQueuePreviewPanel } from "./review-queue-preview-panel";
import type { TailoredDraftPreparationViewState } from "./review-queue-status";

const workspaceTabs = [
  ["readiness", "Readiness"],
  ["resume", "Resume"],
  ["job-details", "Job details"],
] as const;
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
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<
    "readiness" | "resume" | "job-details"
  >("readiness");
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
  const handleWorkspaceTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentIndex = workspaceTabs.findIndex(
        ([tab]) => tab === activeWorkspaceTab,
      );

      if (
        event.key !== "ArrowRight" &&
        event.key !== "ArrowLeft" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      event.preventDefault();

      let nextIndex = currentIndex;
      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % workspaceTabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex =
          (currentIndex - 1 + workspaceTabs.length) % workspaceTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = workspaceTabs.length - 1;
      }

      const nextTab = workspaceTabs[nextIndex];
      if (!nextTab) {
        return;
      }

      setActiveWorkspaceTab(nextTab[0]);
      const tabs =
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      tabs[nextIndex]?.focus();
    },
    [activeWorkspaceTab],
  );

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
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
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(24rem,0.72fr)_minmax(34rem,1fr)] xl:overflow-hidden">
        <ReviewQueueListPanel
          draftPreparation={draftPreparation}
          isJobPending={isJobPending}
          onPrepareTailoredDrafts={onPrepareTailoredDrafts}
          onSelectItem={onSelectItem}
          onStopTailoredDraftPreparation={onStopTailoredDraftPreparation}
          onToggleQueueSelection={handleToggleQueueSelection}
          queue={queue}
          queueSelection={queueSelection}
          selectedItem={selectedItem}
          tailoredAssets={tailoredAssets}
        />
        <section className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
          <header className="grid shrink-0 gap-3 border-b border-(--surface-panel-border) px-5 pb-0 pt-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-(--text-headline)">
                  {selectedJob?.title ?? "Job workspace"}
                </h2>
                <p className="mt-1 truncate text-(length:--text-small) text-foreground-muted">
                  {selectedJob
                    ? `${selectedJob.company} · ${selectedJob.location}`
                    : "Choose a shortlisted job to review it."}
                </p>
              </div>
              {selectedItem ? (
                <StatusBadge tone={selectedWorkflowStatus.tone}>
                  {selectedWorkflowStatus.label}
                </StatusBadge>
              ) : null}
            </div>
            <div
              aria-label="Selected job workspace"
              className="flex gap-5"
              onKeyDown={handleWorkspaceTabKeyDown}
              role="tablist"
            >
              {workspaceTabs.map(([tab, label]) => (
                <button
                  aria-controls={workspacePanelId}
                  aria-selected={activeWorkspaceTab === tab}
                  className={`min-h-10 border-b-2 px-1 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 ${activeWorkspaceTab === tab ? "border-primary text-foreground" : "border-transparent text-foreground-muted hover:text-foreground"}`}
                  id={`review-queue-workspace-${tab}-tab`}
                  key={tab}
                  onClick={() => setActiveWorkspaceTab(tab)}
                  role="tab"
                  tabIndex={activeWorkspaceTab === tab ? 0 : -1}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </header>
          <div
            aria-labelledby={`review-queue-workspace-${activeWorkspaceTab}-tab`}
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            id={workspacePanelId}
            role="tabpanel"
          >
            {activeWorkspaceTab === "readiness" ? (
              <ReviewQueueMissionPanel
                actionMessage={scopedActionMessage}
                applicationRecords={applicationRecords}
                browserSession={browserSession}
                campaignId={campaignId}
                campaignDefaultResumeStrategyId={
                  campaignDefaultResumeStrategyId
                }
                displayedProgress={displayedProgress}
                globalDailyApplicationPreparationCapacity={
                  globalDailyApplicationPreparationCapacity
                }
                embedded
                isApplyPending={isApplyPending}
                isJobPending={isJobPending}
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
              />
            ) : activeWorkspaceTab === "resume" ? (
              <ReviewQueuePreviewPanel
                displayedProgress={displayedProgress}
                embedded
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
            ) : selectedJob && selectedItem ? (
              <div
                className="h-full overflow-y-auto px-6 py-5"
                data-locked-pane-scroll-region
              >
                <div className="grid max-w-3xl gap-6">
                  <section className="grid gap-2 border-b border-(--surface-panel-border) pb-5">
                    <span className="label-mono-xs text-foreground-muted">
                      Match
                    </span>
                    <strong className="text-2xl text-(--text-headline)">
                      {selectedJob.matchAssessment.score}% fit
                    </strong>
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {selectedJob.matchAssessment.reasons.join(" · ")}
                    </p>
                  </section>
                  <section className="grid gap-2">
                    <span className="label-mono-xs text-foreground-muted">
                      Job summary
                    </span>
                    <p className="whitespace-pre-line text-(length:--text-body) leading-7 text-foreground-soft">
                      {jobDescriptionToText(
                        selectedJob.summary ?? selectedJob.description,
                      )}
                    </p>
                  </section>
                  <Button
                    className="w-fit"
                    onClick={() => onOpenJobDetails(selectedItem.jobId)}
                    type="button"
                    variant="secondary"
                  >
                    Open full job details
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center p-8">
                <EmptyState
                  description="Select a shortlisted job to review its details."
                  title="Choose a job"
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </LockedScreenLayout>
  );
}
