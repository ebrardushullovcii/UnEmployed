import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BrowserSessionState, ResumeApplicationMode, ResumeSourceDocument, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { LockedScreenLayout } from '../../components/locked-screen-layout'
import { PageHeader } from '../../components/page-header'
import { getDisplayedResumeProgress, getNextDisplayedResumeProgress, rememberDisplayedResumeProgress } from './review-queue-progress'
import { ReviewQueueListPanel } from './review-queue-list-panel'
import { ReviewQueueMissionPanel } from './review-queue-mission-panel'
import { ReviewQueuePreviewPanel } from './review-queue-preview-panel'

export function ReviewQueueScreen(props: {
  actionState: { message: string | null }
  browserSession: BrowserSessionState
  isApplyPending: boolean
  isJobPending: (jobId: string) => boolean
  onStartAutoApplyQueue: (jobIds: string[]) => void
  onStartApplyCopilot: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onOpenBrowserSession: () => void
  onOpenJobDetails: (jobId: string) => void
  onOpenProfile: () => void
  onRemoveReviewJob: (jobId: string) => void
  onSetJobResumeApplicationMode: (jobId: string, resumeApplicationMode: ResumeApplicationMode) => void
  onSelectItem: (jobId: string) => void
  originalResume: ResumeSourceDocument
  queue: readonly ReviewQueueItem[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}) {
  const {
    actionState,
    browserSession,
    isApplyPending,
    isJobPending,
    onStartAutoApplyQueue,
    onStartApplyCopilot,
    onEditResumeWorkspace,
    onGenerateResume,
    onOpenBrowserSession,
    onOpenJobDetails,
    onOpenProfile,
    onRemoveReviewJob,
    onSetJobResumeApplicationMode,
    onSelectItem,
    originalResume,
    queue,
    selectedAsset,
    selectedItem,
    selectedJob
  } = props
  const previewState =
    selectedItem && selectedItem.resumeApplicationMode !== 'original_resume' && !selectedAsset && selectedItem.assetStatus === 'ready' ? 'missing' : null
  const [queueSelection, setQueueSelection] = useState<readonly string[]>([])
  const selectedJobPending = selectedItem ? isJobPending(selectedItem.jobId) : false
  const [displayedProgress, setDisplayedProgress] = useState(() => getDisplayedResumeProgress(selectedItem, selectedJobPending))
  const queueJobIds = useMemo(() => queue.map((item) => item.jobId), [queue])

  useEffect(() => {
    setDisplayedProgress(getDisplayedResumeProgress(selectedItem, selectedJobPending))
  }, [selectedItem, selectedJobPending])

  useEffect(() => {
    if (!selectedJobPending) {
      return
    }

    const timer = window.setInterval(() => {
      setDisplayedProgress((current) => {
        const nextProgress = getNextDisplayedResumeProgress(current)
        rememberDisplayedResumeProgress(selectedItem, nextProgress)

        return nextProgress
      })
    }, 650)

    return () => window.clearInterval(timer)
  }, [selectedItem, selectedJobPending])

  useEffect(() => {
    setQueueSelection((current) => {
      const nextSelection = current.filter((jobId) => queueJobIds.includes(jobId))

      return nextSelection.length === current.length ? current : nextSelection
    })
  }, [queueJobIds])

  const handleToggleQueueSelection = useCallback((jobId: string, checked: boolean) => {
    setQueueSelection((current) => {
      if (checked) {
        return current.includes(jobId) ? current : [...current, jobId]
      }

      return current.filter((entry) => entry !== jobId)
    })
  }, [])
  const handleClearQueueSelection = useCallback(() => {
    setQueueSelection([])
  }, [])

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
            selectedItem?.resumeApplicationMode === 'original_resume'
              ? 'Review the original CV you imported, then choose whether Apply Copilot should use it unchanged.'
              : 'Review each saved job, approve its PDF, and start Apply Copilot when you are ready.'
          }
        />
      }
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[20rem_minmax(22rem,1fr)_24rem] xl:overflow-hidden">
        <ReviewQueueListPanel
          isJobPending={isJobPending}
          onSelectItem={onSelectItem}
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
          actionMessage={actionState.message}
          browserSession={browserSession}
          displayedProgress={displayedProgress}
          isApplyPending={isApplyPending}
          isJobPending={isJobPending}
          onClearQueueSelection={handleClearQueueSelection}
          onStartAutoApplyQueue={onStartAutoApplyQueue}
          onStartApplyCopilot={onStartApplyCopilot}
          onEditResumeWorkspace={onEditResumeWorkspace}
          onGenerateResume={onGenerateResume}
          onOpenBrowserSession={onOpenBrowserSession}
          onOpenJobDetails={onOpenJobDetails}
          onOpenProfile={onOpenProfile}
          onRemoveReviewJob={onRemoveReviewJob}
          onSetJobResumeApplicationMode={onSetJobResumeApplicationMode}
          queue={queue}
          queueSelection={queueSelection}
          selectedAsset={selectedAsset}
          selectedItem={selectedItem}
          selectedJob={selectedJob}
        />
      </div>
    </LockedScreenLayout>
  )
}
