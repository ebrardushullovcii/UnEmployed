import type { ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { getReviewQueueWorkflowStatus, hasResumeGenerationFailure, isResumeGenerationInProgress, needsResumeGeneration } from './review-queue-status'

interface ReviewQueuePreviewPanelProps {
  previewState: PreviewState
  queue: readonly ReviewQueueItem[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

type PreviewState = 'missing' | null

export function ReviewQueuePreviewPanel({ previewState, queue, selectedAsset, selectedItem, selectedJob }: ReviewQueuePreviewPanelProps) {
  const needsGeneration = needsResumeGeneration(selectedItem)
  const hasGenerationFailure = hasResumeGenerationFailure(selectedItem)
  const isGenerating = isResumeGenerationInProgress(selectedItem)
  const showGenerationState = needsGeneration || isGenerating || hasGenerationFailure
  const workflowStatus = getReviewQueueWorkflowStatus(selectedItem)
  const previewTone = previewState === 'missing' ? 'critical' : workflowStatus.tone
  const previewLabel = previewState === 'missing' ? 'Resume issue' : workflowStatus.label

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">Resume</h2>
        <StatusBadge tone={previewTone}>
          {previewLabel}
        </StatusBadge>
      </header>
      {queue.length === 0 ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="No shortlisted jobs yet"
            description="Shortlist a job from Find jobs to start building a tailored resume."
          />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && showGenerationState ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
            <div className="grid w-full min-h-full place-items-center content-center gap-4 rounded-(--radius-field) bg-(--surface-panel-tint) p-8 text-center">
              {isGenerating ? (
                <div className="grid aspect-square w-40 place-items-center rounded-full border-[3px] border-border/30 border-t-primary text-[1.1rem] font-semibold text-(--text-headline)">
                  <span>{selectedItem.progressPercent ?? 0}%</span>
                </div>
              ) : null}
              <h2 className="text-[1.4rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{hasGenerationFailure ? 'Resume issue' : needsGeneration ? 'No tailored resume yet' : 'Preparing resume'}</h2>
              <p className="max-w-136 text-(length:--text-body) leading-7 text-foreground-soft">
                {hasGenerationFailure
                  ? `The last tailored resume attempt for ${selectedItem.title} did not finish. Try again to create a fresh draft.`
                  : needsGeneration
                  ? `Create a tailored resume for ${selectedItem.title} to continue.`
                  : `Job Finder is still preparing the resume for ${selectedItem.title}. You can continue once it is ready.`}
              </p>
            </div>
          </div>
      ) : null}
      {queue.length > 0 && !selectedItem ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Choose a job"
            description="Select a shortlisted job to see what the resume needs next."
          />
        </div>
      ) : null}
      {queue.length > 0 && previewState === 'missing' ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Resume unavailable"
            description="We couldn't load the latest resume. Open the workspace to refresh it or export a new PDF."
          />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && !showGenerationState && selectedAsset ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="surface-card-tint relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="grid items-end gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto]">
              <strong className="text-[1.1rem] text-(--text-headline)">{selectedJob?.title ?? selectedItem.title}</strong>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[0.9rem] text-foreground-soft">{selectedAsset.label}</span>
                <StatusBadge tone={workflowStatus.tone}>
                  {workflowStatus.label}
                </StatusBadge>
              </div>
            </div>
            {selectedItem.resumeReview.status === 'approved' ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                Approved on {new Date(selectedItem.resumeReview.approvedAt).toLocaleString()}. This is the PDF used when you start apply copilot.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === 'needs_review' ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                This is a draft preview. Export and approve a PDF before you start apply copilot.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === 'stale' ? (
              <p className="text-(length:--text-small) text-(--warning-text)">
                This approved PDF is out of date. Export a new PDF and approve it again before applying.
              </p>
            ) : null}
            {selectedAsset.previewSections.map((section, sectionIndex) => (
              <div key={`${section.heading}-${sectionIndex}`} className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">{section.heading}</p>
                {section.lines.map((line, lineIndex) => (
                  <p key={`${section.heading}-${lineIndex}-${line}`} className="text-(length:--text-body) leading-7 text-foreground-soft">{line}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
