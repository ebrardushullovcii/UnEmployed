import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { PageHeader } from '../../components/page-header'
import { ReviewQueueListPanel } from './review-queue-list-panel'
import { ReviewQueueMissionPanel } from './review-queue-mission-panel'
import { ReviewQueuePreviewPanel } from './review-queue-preview-panel'

export function ReviewQueueScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  browserSession: BrowserSessionState
  onApproveApply: (jobId: string) => void
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
    onGenerateResume,
    onSelectItem,
    queue,
    selectedAsset,
    selectedItem,
    selectedJob
  } = props

  return (
    <section className="grid gap-[1.65rem]">
      <PageHeader
        eyebrow="Review Queue"
        title="Review Queue"
        description="A supervised queue for generated resume variants before the first supported Easy Apply automation path begins."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[20rem_minmax(22rem,1fr)_24rem]">
        <ReviewQueueListPanel onSelectItem={onSelectItem} queue={queue} selectedItem={selectedItem} />
        <ReviewQueuePreviewPanel queue={queue} selectedAsset={selectedAsset} selectedItem={selectedItem} selectedJob={selectedJob} />
        <ReviewQueueMissionPanel
          actionMessage={actionState.message}
          browserSession={browserSession}
          busy={busy}
          onApproveApply={onApproveApply}
          onGenerateResume={onGenerateResume}
          selectedAsset={selectedAsset}
          selectedItem={selectedItem}
          selectedJob={selectedJob}
        />
      </div>
    </section>
  )
}
