import { Info, Pencil, Trash2, View } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getSessionTone } from '../../lib/job-finder-utils'

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  onApproveApply: (jobId: string) => void
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
  onGenerateResume,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueueMissionPanelProps) {
  const needsGeneration = selectedItem?.assetStatus === 'not_started' || selectedItem?.assetStatus === 'failed'
  const isGenerating = selectedItem?.assetStatus === 'generating' || selectedItem?.assetStatus === 'queued'

  return (
    <section className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-6 py-6 grid content-start gap-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-[var(--tracking-caps)] text-primary">Mission Details</p>
        <Info className="size-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Confidence Score</div>
          <div className="font-display text-xl font-bold text-positive">{selectedItem?.matchScore ?? '--'}%</div>
        </div>
        <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Session State</div>
          <div className="font-display text-xl font-bold text-primary">{formatStatusLabel(browserSession.status)}</div>
        </div>
      </div>
      <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Tailoring state</span>
          <StatusBadge tone={getSessionTone(browserSession)}>{formatStatusLabel(browserSession.status)}</StatusBadge>
        </div>
        <div className="h-2 w-full rounded-full bg-[rgba(0,0,0,0.4)]">
          <div className="h-full bg-primary shadow-[0_0_8px_rgba(198,198,199,0.3)]" style={{ width: `${selectedItem?.progressPercent ?? 0}%` }} />
        </div>
      </div>
      {selectedItem && selectedJob ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div><span className="font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Template</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{selectedAsset?.templateName ?? 'Pending'}</strong></div>
            <div><span className="font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Generation</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{selectedAsset ? formatStatusLabel(selectedAsset.generationMethod) : 'Pending'}</strong></div>
          </div>
          <p className="text-[var(--text-body)] leading-7 text-foreground-soft">{selectedJob.summary}</p>
          {selectedAsset?.storagePath ? <p className="font-mono text-[10px] uppercase tracking-[var(--tracking-normal)] text-muted-foreground">Template file: {selectedAsset.storagePath}</p> : null}
          <PreferenceList label="Role fit" values={selectedJob.matchAssessment.reasons} />
          {selectedAsset?.notes.length ? <PreferenceList label="Agent notes" values={selectedAsset.notes} /> : null}
          <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
            <label className="mb-4 block font-display text-[10px] font-bold uppercase tracking-[var(--tracking-caps)] text-muted-foreground">Telemetry Stream</label>
            <div className="space-y-1 font-mono text-[9px] leading-relaxed text-foreground-soft">
              {selectedAsset?.notes.length ? selectedAsset.notes.map((note, index) => <div key={note}>{`14:22:0${index + 1}`} # {note.toUpperCase()}</div>) : <div>14:22:05 # ASSET_READY_FOR_OPERATOR_SIGNOFF</div>}
            </div>
          </div>
          {actionMessage ? <p className="font-mono text-[10px] uppercase tracking-[var(--tracking-normal)] text-primary">{actionMessage}</p> : null}
          <div className="grid gap-2.5">
            <Button
              className="h-11 w-full"
              variant="primary"
              disabled={busy || isGenerating || (!needsGeneration && browserSession.status !== 'ready')}
              onClick={() => {
                if (needsGeneration) {
                  onGenerateResume(selectedItem.jobId)
                  return
                }

                onApproveApply(selectedItem.jobId)
              }}
              type="button"
            >
              {needsGeneration ? 'Generate tailored resume' : 'Approve Easy Apply'}
            </Button>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="h-11 w-full" variant="secondary" disabled={busy} type="button"><Pencil className="size-4" />Edit asset</Button>
              <Button className="h-11 w-full" variant="secondary" disabled={busy} type="button"><View className="size-4" />View source</Button>
            </div>
          </div>
          <Button className="mt-auto h-11 w-full" variant="destructive" disabled={busy} type="button"><Trash2 className="size-4" />Purge job application</Button>
        </>
      ) : (
        <EmptyState
          title="Choose a queued item"
          description="Select a job in the review queue to inspect asset readiness and pre-apply context."
        />
      )}
    </section>
  )
}
