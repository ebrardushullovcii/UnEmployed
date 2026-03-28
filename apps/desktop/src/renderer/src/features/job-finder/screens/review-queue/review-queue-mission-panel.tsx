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
  const tailoringStateLabel = selectedItem ? formatStatusLabel(selectedItem.assetStatus) : 'No asset'
  const tailoringStateTone = selectedItem ? getAssetTone(selectedItem.assetStatus) : 'muted'

  return (
    <section className="flex min-h-124 min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-6 py-6 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-primary">Mission Details</p>
        <Info className="size-4 text-muted-foreground" />
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Confidence Score</div>
            <div className="font-display text-xl font-bold text-positive">{selectedItem?.matchScore ?? '--'}%</div>
          </div>
          <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Session State</div>
            <div className="font-display text-xl font-bold text-primary">{formatStatusLabel(browserSession.status)}</div>
          </div>
        </div>
        <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Tailoring state</span>
            <StatusBadge tone={tailoringStateTone}>{tailoringStateLabel}</StatusBadge>
          </div>
          <div className="h-2 w-full rounded-full bg-(--surface-progress-track)">
            <div className="h-full bg-primary shadow-[0_0_8px_rgba(198,198,199,0.3)]" style={{ width: `${selectedItem?.progressPercent ?? 0}%` }} />
          </div>
        </div>
        {selectedItem && selectedJob ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div><span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Template</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{selectedAsset?.templateName ?? 'Pending'}</strong></div>
              <div><span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Generation</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{selectedAsset ? formatStatusLabel(selectedAsset.generationMethod) : 'Pending'}</strong></div>
            </div>
            <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedJob.summary}</p>
            {selectedAsset?.storagePath ? <p className="font-mono text-[10px] uppercase tracking-(--tracking-normal) text-muted-foreground">Template file: {selectedAsset.storagePath}</p> : null}
            <PreferenceList label="Role fit" values={selectedJob.matchAssessment.reasons} />
            {selectedAsset?.notes.length ? <PreferenceList label="Agent notes" values={selectedAsset.notes} /> : null}
            <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-4">
              <h3 className="mb-4 block font-display text-[10px] font-bold uppercase tracking-(--tracking-caps) text-muted-foreground">Telemetry Stream</h3>
              <div className="space-y-1 font-mono text-[9px] leading-relaxed text-foreground-soft">
                {selectedAsset?.notes.length
                  ? selectedAsset.notes.map((note, index) => <div key={`telemetry_${index}`}>{note}</div>)
                  : <div>No telemetry recorded yet.</div>}
              </div>
            </div>
            {actionMessage ? <p className="font-mono text-[10px] uppercase tracking-(--tracking-normal) text-primary">{actionMessage}</p> : null}
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
                <Button className="h-11 w-full" disabled type="button" variant="secondary"><Pencil className="size-4" />Edit asset</Button>
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
