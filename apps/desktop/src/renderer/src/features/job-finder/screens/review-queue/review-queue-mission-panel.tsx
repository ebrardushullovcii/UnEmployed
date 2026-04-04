import { Info, Pencil, Trash2, View } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

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
  const hasApprovedResumeExport = selectedItem?.resumeReview.status === 'approved'
  const canApproveApply = browserSession.status === 'ready' && hasApprovedResumeExport
  const tailoringStateLabel = selectedItem ? formatStatusLabel(selectedItem.assetStatus) : 'No asset'
  const tailoringStateTone = selectedItem ? getAssetTone(selectedItem.assetStatus) : 'muted'

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">Mission Details</p>
        <Info className="size-4 text-muted-foreground" />
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-6 pb-6 pt-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Confidence Score</div>
            <div className="font-display text-xl font-bold text-positive">{selectedItem?.matchScore ?? '--'}%</div>
          </div>
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Session State</div>
            <div className="font-display text-xl font-bold text-primary">{formatStatusLabel(browserSession.status)}</div>
          </div>
        </div>
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Tailoring state</span>
            <StatusBadge tone={tailoringStateTone}>{tailoringStateLabel}</StatusBadge>
          </div>
          <div
            aria-label="Tailoring progress"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={selectedItem?.progressPercent ?? 0}
            className="h-2 w-full rounded-full bg-(--surface-progress-track)"
            role="progressbar"
          >
            <div className="h-full bg-primary shadow-(--progress-active-glow)" style={{ width: `${selectedItem?.progressPercent ?? 0}%` }} />
          </div>
        </div>
        {selectedItem && selectedJob ? (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Template</span>
                <strong className="mt-2 block font-display text-sm uppercase text-foreground">{selectedAsset?.templateName ?? 'Pending'}</strong>
              </div>
              <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Generation</span>
                <strong className="mt-2 block font-display text-sm uppercase text-foreground">{selectedAsset ? formatStatusLabel(selectedAsset.generationMethod) : 'Pending'}</strong>
              </div>
            </div>
            <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Resume review</span>
                <StatusBadge tone={resumeReviewStatus === 'stale' ? 'critical' : resumeReviewStatus === 'approved' ? 'positive' : 'active'}>
                  {resumeReviewStatus.replaceAll('_', ' ')}
                </StatusBadge>
              </div>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                {resumeReviewStatus === 'approved'
                  ? 'Resume approval is complete and the latest approved export can be used for apply.'
                  : 'Open Resume Workspace to review the draft, export the PDF, and approve the resume before apply.'}
              </p>
              {resumeReviewStatus === 'stale' ? (
                <p className="text-(length:--text-small) leading-6 text-(--warning-text)">
                  The approved resume is stale. Re-open the workspace and re-approve before continuing.
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
              {selectedAsset?.storagePath ? (
                <div className="grid min-w-0 gap-1">
                  <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Generated file</span>
                  <p className="min-w-0 break-all font-mono text-[10px] text-foreground-soft">{selectedAsset.storagePath}</p>
                </div>
              ) : null}
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <PreferenceList label="Role fit" values={selectedJob.matchAssessment.reasons} />
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <h3 className="mb-4 block font-display text-[10px] font-bold uppercase tracking-(--tracking-caps) text-muted-foreground">Telemetry Stream</h3>
              <div className="min-w-0 space-y-1 font-mono text-[9px] leading-relaxed text-foreground-soft">
                {selectedAsset?.notes.length
                  ? selectedAsset.notes.map((note, index) => (
                    <div className="min-w-0 break-all" key={`telemetry_${index}`}>{note}</div>
                  ))
                  : <div>No telemetry recorded yet.</div>}
              </div>
            </div>
            {actionMessage ? <p className="min-w-0 break-words font-mono text-[10px] uppercase tracking-(--tracking-normal) text-primary">{actionMessage}</p> : null}
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

                  if (!selectedAsset) {
                    return
                  }

                  onApproveApply(selectedItem.jobId)
                }}
                type="button"
              >
                 {needsGeneration ? 'Generate tailored resume' : 'Approve Easy Apply'}
               </Button>
              <div className="grid gap-2">
                <Button
                  className="h-11 w-full"
                  disabled={!selectedItem}
                  onClick={() => selectedItem && onEditResumeWorkspace(selectedItem.jobId)}
                  type="button"
                  variant="secondary"
                ><Pencil className="size-4" />Edit asset</Button>
                <Button className="h-11 w-full" disabled type="button" variant="secondary"><View className="size-4" />View source</Button>
              </div>
            </div>
            <Button className="h-11 w-full" disabled type="button" variant="destructive"><Trash2 className="size-4" />Purge job application</Button>
          </>
        ) : (
          <EmptyState
            title="Choose a queued item"
            description="Select a job in the review queue to inspect asset readiness and pre-apply context."
          />
        )}
      </div>
    </section>
  )
}
