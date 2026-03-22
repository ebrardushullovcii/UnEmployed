import type { ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

interface ReviewQueuePreviewPanelProps {
  queue: readonly ReviewQueueItem[]
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

export function ReviewQueuePreviewPanel({ queue, selectedAsset, selectedItem, selectedJob }: ReviewQueuePreviewPanelProps) {
  const needsGeneration = selectedItem?.assetStatus === 'not_started' || selectedItem?.assetStatus === 'failed'
  const isGenerating = selectedItem?.assetStatus === 'generating' || selectedItem?.assetStatus === 'queued'
  const showGenerationState = needsGeneration || isGenerating

  return (
    <section className="border border-border/20 bg-background grid content-start gap-4 min-w-0 min-h-[38rem] overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="px-4 pt-4 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">Asset Preview</p>
        <StatusBadge tone={selectedItem ? getAssetTone(selectedItem.assetStatus) : 'muted'}>
          {selectedItem ? formatStatusLabel(selectedItem.assetStatus) : 'No asset'}
        </StatusBadge>
      </div>
      {queue.length === 0 ? (
        <EmptyState
          title="Review queue is empty"
          description="Once a saved job moves into drafting or ready-for-review status, its asset preview will appear here."
        />
      ) : null}
      {queue.length > 0 && selectedItem && showGenerationState ? (
        <div className="grid min-h-full place-items-center content-center gap-4 bg-background p-8 text-center">
          <div className="grid aspect-square w-40 place-items-center rounded-full border-[3px] border-border/30 border-t-primary">
            <span>{selectedItem.progressPercent ?? 0}%</span>
          </div>
          <h2>{needsGeneration ? 'Tailored resume required' : 'Tailored resume in progress'}</h2>
          <p>
            {needsGeneration
              ? `Generate a tailored resume for ${selectedItem.title} before the apply review step can continue.`
              : `Resume generation is still running for ${selectedItem.title}. Approval stays locked until the asset reaches a ready state.`}
          </p>
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && !showGenerationState && selectedAsset ? (
        <div className="relative grid min-h-full gap-4 bg-[#f8f7f3] p-10 text-[0.95rem] leading-[1.48] text-[#111111]">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
            <span className="-rotate-45 text-[120px] font-black tracking-tighter">TAILORED</span>
          </div>
          <div className="grid items-end gap-3 border-b border-black/12 pb-4 sm:grid-cols-[1fr_auto]">
            <strong>{selectedJob?.title ?? selectedItem.title}</strong>
            <span>{selectedAsset.label}</span>
          </div>
          {selectedAsset.previewSections.map((section) => (
            <div key={section.heading} className="grid gap-2">
              <p className="text-[0.68rem] uppercase tracking-[0.11em] text-foreground-muted">{section.heading}</p>
              {section.lines.map((line) => (
                <p key={line} className="text-[0.95rem] leading-7 text-foreground-soft">{line}</p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
