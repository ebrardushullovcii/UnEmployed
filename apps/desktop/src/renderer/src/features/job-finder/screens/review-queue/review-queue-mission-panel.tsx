import { Pencil } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button, ProgressBar } from '@renderer/components/ui'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { getAssetTone } from '../../lib/job-finder-utils'

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  onApproveApply: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

function getResumeStatusLabel(status: ReviewQueueItem['assetStatus']): string {
  switch (status) {
    case 'not_started':
      return 'Needs resume'
    case 'generating':
      return 'Creating'
    case 'queued':
      return 'Queued'
    case 'failed':
      return 'Needs attention'
    default:
      return 'Ready'
  }
}

function getResumeReviewStatusLabel(status: ReviewQueueItem['resumeReview']['status']): string {
  switch (status) {
    case 'approved':
      return 'Approved'
    case 'stale':
      return 'Out of date'
    case 'needs_review':
      return 'Needs approval'
    default:
      return 'Not started'
  }
}

export function ReviewQueueMissionPanel({
  actionMessage,
  browserSession,
  busy,
  onApproveApply,
  onEditResumeWorkspace,
  onGenerateResume,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueueMissionPanelProps) {
  const needsGeneration = selectedItem?.assetStatus === 'not_started' || selectedItem?.assetStatus === 'failed'
  const isGenerating = selectedItem?.assetStatus === 'generating' || selectedItem?.assetStatus === 'queued'
  const resumeReviewStatus = selectedItem?.resumeReview.status ?? 'not_started'
  const approvedResumeReview = selectedItem?.resumeReview.status === 'approved'
    ? selectedItem.resumeReview
    : null
  const hasApprovedResumeExport = approvedResumeReview !== null
  const hasReadyApprovedAsset =
    selectedAsset !== null &&
    selectedAsset.status === 'ready' &&
    selectedItem?.resumeAssetId === selectedAsset.id &&
    approvedResumeReview !== null &&
    selectedAsset.storagePath === approvedResumeReview.approvedFilePath
  const canApproveApply =
    browserSession.status === 'ready' &&
    hasApprovedResumeExport &&
    hasReadyApprovedAsset
  const tailoringStateLabel = selectedItem ? getResumeStatusLabel(selectedItem.assetStatus) : 'No resume'
  const tailoringStateTone = selectedItem ? getAssetTone(selectedItem.assetStatus) : 'muted'
  const resumeReviewLabel = getResumeReviewStatusLabel(resumeReviewStatus)
  const primaryActionLabel = isGenerating
    ? 'Creating resume...'
    : needsGeneration
      ? 'Create resume'
      : 'Move to Applied'
  const browserActionMessage =
    browserSession.status === 'ready'
      ? null
      : browserSession.status === 'login_required'
        ? 'Sign in to the browser before moving this job into Applied.'
        : browserSession.status === 'blocked'
          ? 'Resolve the browser issue before moving this job into Applied.'
          : 'Wait for the browser to finish starting before moving this job into Applied.'

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="font-display text-(length:--text-small) font-bold uppercase tracking-(--tracking-caps) text-primary">Actions</p>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-6 pb-6 pt-4">
        <div className="grid min-w-0 gap-3">
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
            <div className="mb-1 text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Job match</div>
            <div className="font-display text-xl font-bold text-positive">{selectedItem?.matchScore ?? '--'}%</div>
          </div>
        </div>
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Resume status</span>
            <StatusBadge tone={tailoringStateTone}>{tailoringStateLabel}</StatusBadge>
          </div>
          <ProgressBar ariaLabel="Resume progress" percent={selectedItem?.progressPercent ?? 0} />
        </div>
        {selectedItem && selectedJob ? (
          <>
            <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Resume approval</span>
                <StatusBadge tone={resumeReviewStatus === 'stale' ? 'critical' : resumeReviewStatus === 'approved' ? 'positive' : 'active'}>
                  {resumeReviewLabel}
                </StatusBadge>
              </div>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                {resumeReviewStatus === 'approved'
                  ? 'The approved PDF is ready. Move this job into Applied when you are ready.'
                  : 'Open the resume editor to update the draft, export the PDF, and approve it before this job moves forward.'}
              </p>
              {resumeReviewStatus === 'stale' ? (
                <p className="text-(length:--text-small) leading-6 text-(--warning-text)">
                  The approved PDF is out of date. Open the resume editor and approve a fresh version.
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedJob.summary ?? selectedJob.description}</p>
              {selectedJob.employerWebsiteUrl ? (
                <p className="min-w-0 break-words text-(length:--text-small) leading-6 text-foreground-soft">
                  Employer site: {selectedJob.employerWebsiteUrl}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <PreferenceList label="Why it fits" values={selectedJob.matchAssessment.reasons} />
            </div>
            {actionMessage ? <p aria-atomic="true" aria-live="polite" className="min-w-0 break-words text-(length:--text-small) leading-6 text-primary" role="status">{actionMessage}</p> : null}
            {!needsGeneration && browserActionMessage ? (
              <p className="min-w-0 break-words text-(length:--text-small) leading-6 text-(--warning-text)">
                {browserActionMessage}
              </p>
            ) : null}
            <div className="grid min-w-0 gap-2.5">
              <Button
                className="h-11 w-full"
                variant="primary"
                disabled={busy || isGenerating || (needsGeneration ? false : !canApproveApply)}
                onClick={() => {
                  if (needsGeneration) {
                    onGenerateResume(selectedItem.jobId)
                    return
                  }

                  onApproveApply(selectedItem.jobId)
                }}
                type="button"
              >
                {primaryActionLabel}
              </Button>
              <Button
                className="h-11 w-full"
                onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                type="button"
                variant="secondary"
              >
                <Pencil aria-hidden="true" className="size-4" focusable="false" />
                Open resume editor
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="Choose a shortlisted job"
            description="Select a job to see its resume progress, approval status, and next step."
          />
        )}
      </div>
    </section>
  )
}
