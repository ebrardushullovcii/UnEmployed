import type { ResumeSourceDocument, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { JOB_FINDER_ROUTE_HREFS } from '../../lib/job-finder-route-hrefs'
import { getReviewQueueWorkflowStatus, hasResumeGenerationFailure, isResumeGenerationInProgress, needsResumeGeneration } from './review-queue-status'

interface ReviewQueuePreviewPanelProps {
  displayedProgress: number
  isGenerating?: boolean
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  originalResume?: ResumeSourceDocument
  previewState: PreviewState
  queue: readonly ReviewQueueItem[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

type PreviewState = 'missing' | null

export function ReviewQueuePreviewPanel({
  displayedProgress,
  isGenerating: isSelectedJobPending = false,
  onEditResumeWorkspace,
  onGenerateResume,
  originalResume,
  previewState,
  queue,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueuePreviewPanelProps) {
  const needsGeneration = needsResumeGeneration(selectedItem)
  const hasGenerationFailure = hasResumeGenerationFailure(selectedItem)
  const isGenerating = isResumeGenerationInProgress(selectedItem) || isSelectedJobPending
  const showGenerationState = needsGeneration || isGenerating || hasGenerationFailure
  const workflowStatus = getReviewQueueWorkflowStatus(selectedItem)
  const previewTone = previewState === 'missing' ? 'critical' : workflowStatus.tone
  const previewLabel = previewState === 'missing' ? 'Resume issue' : workflowStatus.label

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">Resume</h2>
        <StatusBadge tone={previewTone}>{previewLabel}</StatusBadge>
      </header>
      {queue.length === 0 ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="No shortlisted jobs yet"
              description="Find jobs first, then shortlist the strongest matches to start building tailored resumes."
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild type="button" variant="primary">
                <a href={JOB_FINDER_ROUTE_HREFS.discovery}>Go to Find jobs</a>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && showGenerationState ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <div className="grid w-full min-h-full place-items-center content-center gap-4 rounded-(--radius-field) bg-(--surface-panel-tint) p-8 text-center">
            {isGenerating ? (
              <div
                aria-label="Estimated resume preparation progress"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={displayedProgress}
                aria-valuetext={`${displayedProgress}% estimated`}
                className="grid w-full max-w-xl gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-left"
                role="progressbar"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="label-mono-xs text-foreground-muted">Draft and PDF</span>
                  <strong className="text-[1.15rem] text-(--text-headline)">{displayedProgress}% estimated</strong>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-(--surface-progress-track)">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${displayedProgress}%` }}
                  />
                </div>
                <p className="text-(length:--text-small) leading-5 text-foreground-muted">
                  You can leave this screen. Progress keeps its place while the same resume is being prepared.
                </p>
              </div>
            ) : null}
            <h2 className="text-[1.4rem] font-semibold tracking-[-0.03em] text-(--text-headline)">
              {hasGenerationFailure ? 'Resume issue' : isGenerating ? 'Preparing resume' : needsGeneration ? 'No tailored resume yet' : 'Preparing resume'}
            </h2>
            <p className="max-w-136 text-(length:--text-body) leading-7 text-foreground-soft">
              {hasGenerationFailure
                ? `The last tailored resume attempt for ${selectedItem.title} did not finish. Try again to create a fresh draft.`
                : isGenerating
                  ? `Job Finder is preparing the resume for ${selectedItem.title}. This progress indicator is an estimate while the draft and PDF are being built.`
                  : needsGeneration
                    ? `Create a tailored resume for ${selectedItem.title} to continue.`
                    : `Job Finder is still preparing the resume for ${selectedItem.title}. You can continue once it is ready.`}
            </p>
            {!isGenerating ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  disabled={isSelectedJobPending}
                  pending={isSelectedJobPending}
                  onClick={() => onGenerateResume(selectedItem.jobId)}
                  type="button"
                  variant="primary"
                >
                  {hasGenerationFailure ? 'Try again' : 'Create tailored resume'}
                </Button>
                {hasGenerationFailure ? (
                  <Button onClick={() => onEditResumeWorkspace(selectedItem.jobId)} type="button" variant="secondary">
                    Open resume workspace
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {queue.length > 0 && !selectedItem ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState title="Choose a job" description="Select a shortlisted job to see what the resume needs next." />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem?.resumeReview.status === 'original_resume' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="surface-card-tint relative grid gap-5 rounded-(--radius-field) border border-primary/25 p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="grid gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1">
                <span className="label-mono-xs text-primary">Original CV · unchanged</span>
                <strong className="text-[1.1rem] text-(--text-headline)">{selectedItem.resumeReview.fileName}</strong>
              </div>
              <StatusBadge tone="positive">Ready for this job</StatusBadge>
            </div>
            <p className="rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm leading-6 text-foreground-soft">
              Apply Copilot will attach this exact imported file. Job Finder will not rewrite it, remove roles, or create a job-specific copy.
            </p>
            <div className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-sm leading-6 text-(--warning-text)">
              <strong className="block text-foreground">Check sensitive personal details before attaching</strong>
              Original CVs can include a home address, date of birth, nationality, phone number, or other details you may not want to share with every employer.
              Review the preview below before starting Apply Copilot.
            </div>
            <dl className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 px-4 py-3 text-sm sm:grid-cols-2">
              <div className="grid gap-1">
                <dt className="label-mono-xs">File selected for attachment</dt>
                <dd className="break-words font-medium text-foreground">{selectedItem.resumeReview.fileName}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="label-mono-xs">Imported</dt>
                <dd className="text-foreground-soft">
                  {originalResume?.uploadedAt ? new Date(originalResume.uploadedAt).toLocaleString() : 'Import date unavailable'}
                </dd>
              </div>
            </dl>
            <div className="grid gap-2">
              <span className="label-mono-xs">Read-only extracted text preview</span>
              <p className="text-sm leading-6 text-foreground-soft">
                This preview is only for review. The attachment remains the original imported file shown above.
              </p>
              {originalResume?.textContent ? (
                <div className="max-h-[56vh] overflow-y-auto whitespace-pre-wrap rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-sm leading-7 text-foreground-soft">
                  {originalResume.textContent}
                </div>
              ) : (
                <p className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-sm leading-6 text-foreground-soft">
                  The original file is available, but extracted preview text is not. Re-import it in Profile if you want a readable preview before continuing.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && selectedItem?.resumeApplicationMode === 'original_resume' && selectedItem.resumeReview.status !== 'original_resume' ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="Original CV unavailable"
              description="Import or re-import your original CV in Profile. This mode never substitutes a tailored resume when the original file is missing."
            />
            <Button asChild type="button" variant="primary">
              <a href={JOB_FINDER_ROUTE_HREFS.profile}>Go to Profile</a>
            </Button>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && previewState === 'missing' ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="Resume unavailable"
              description="We couldn't load the latest resume. Reopen the workspace to refresh the preview, export a new PDF, or approve the exact version you want to use."
            />
            {selectedItem ? (
              <Button onClick={() => onEditResumeWorkspace(selectedItem.jobId)} type="button" variant="primary">
                Open resume workspace
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && selectedItem.resumeApplicationMode !== 'original_resume' && !showGenerationState && selectedAsset ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="surface-card-tint relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="grid items-end gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto]">
              <strong className="text-[1.1rem] text-(--text-headline)">{selectedJob?.title ?? selectedItem.title}</strong>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[0.9rem] text-foreground-soft">{selectedAsset.label}</span>
                <StatusBadge tone={workflowStatus.tone}>{workflowStatus.label}</StatusBadge>
              </div>
            </div>
            {selectedItem.resumeReview.status === 'approved' ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                Approved on {new Date(selectedItem.resumeReview.approvedAt).toLocaleString()}. This is the PDF used when you start using Apply Copilot.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === 'needs_review' ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                This is a draft preview. Export and approve a PDF before you start using Apply Copilot.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === 'stale' ? (
              <p className="text-(length:--text-small) text-(--warning-text)">
                This approved PDF is out of date. Export a new PDF and approve it again before using Apply Copilot.
              </p>
            ) : null}
            {selectedItem.resumeReview.status !== 'approved' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-4">
                <div className="grid gap-1">
                  <p className="label-mono-xs text-primary">Next step</p>
                  <p className="text-sm leading-6 text-foreground-soft">
                    Open the workspace to review the live document, then export and approve the PDF you want Apply Copilot to use.
                  </p>
                </div>
                <Button onClick={() => onEditResumeWorkspace(selectedItem.jobId)} type="button" variant="primary">
                  Open resume workspace
                </Button>
              </div>
            ) : null}
            {selectedAsset.previewSections.map((section, sectionIndex) => (
              <div key={`${section.heading}-${sectionIndex}`} className="grid gap-2">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">{section.heading}</p>
                {section.lines.map((line, lineIndex) => (
                  <p key={`${section.heading}-${lineIndex}-${line}`} className="text-(length:--text-body) leading-7 text-foreground-soft">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
