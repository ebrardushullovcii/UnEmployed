import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { LockedScreenLayout } from '../../components/locked-screen-layout'
import { PageHeader } from '../../components/page-header'
import { ReviewQueueListPanel } from './review-queue-list-panel'
import { ReviewQueueMissionPanel } from './review-queue-mission-panel'
import { ReviewQueuePreviewPanel } from './review-queue-preview-panel'

export function ReviewQueueScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  browserSession: BrowserSessionState
  onApproveApply: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onSelectItem: (jobId: string) => void
  queue: readonly ReviewQueueItem[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}) {
  const {
    actionState,
    browserSession,
    busy,
    onApproveApply,
    onEditResumeWorkspace,
    onGenerateResume,
    onSelectItem,
    queue,
    selectedAsset,
    selectedItem,
    selectedJob
  } = props
  const previewState = selectedItem && !selectedAsset && selectedItem.assetStatus === 'ready' ? 'missing' : null

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="pb-(--gap-section) pt-8"
      topContent={(
        <PageHeader
          eyebrow="Shortlisted"
          title="Shortlisted jobs"
          description="Use this queue to finish the next step for each shortlisted job, approve the PDF you want to use, and start the application when every requirement is ready."
        />
      )}
    >
      <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[20rem_minmax(22rem,1fr)_24rem] xl:overflow-hidden">
        <ReviewQueueListPanel onSelectItem={onSelectItem} queue={queue} selectedItem={selectedItem} />
        <ReviewQueuePreviewPanel previewState={previewState} queue={queue} selectedAsset={selectedAsset} selectedItem={selectedItem} selectedJob={selectedJob} />
        <ReviewQueueMissionPanel
          actionMessage={actionState.message}
          browserSession={browserSession}
          busy={busy}
          onApproveApply={onApproveApply}
          onEditResumeWorkspace={onEditResumeWorkspace}
          onGenerateResume={onGenerateResume}
          selectedAsset={selectedAsset}
          selectedItem={selectedItem}
          selectedJob={selectedJob}
        />
      </div>
    </LockedScreenLayout>
  )
}
