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
    <section className="flex min-h-124 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">Asset Preview</p>
        <StatusBadge tone={selectedItem ? getAssetTone(selectedItem.assetStatus) : 'muted'}>
          {selectedItem ? formatStatusLabel(selectedItem.assetStatus) : 'No asset'}
        </StatusBadge>
      </div>
      {queue.length === 0 ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Review queue is empty"
            description="Once a saved job moves into drafting or ready-for-review status, its asset preview will appear here."
          />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && showGenerationState ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <div className="grid w-full min-h-full place-items-center content-center gap-4 bg-[rgba(255,255,255,0.02)] rounded-(--radius-field) p-8 text-center">
            <div className="grid aspect-square w-40 place-items-center rounded-full border-[3px] border-border/30 border-t-primary text-[1.1rem] font-semibold text-(--text-headline)">
              <span>{selectedItem.progressPercent ?? 0}%</span>
            </div>
            <h2 className="text-[1.4rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{needsGeneration ? 'Tailored resume required' : 'Tailored resume in progress'}</h2>
            <p className="max-w-136 text-(length:--text-body) leading-7 text-foreground-soft">
              {needsGeneration
                ? `Generate a tailored resume for ${selectedItem.title} before the apply review step can continue.`
                : `Resume generation is still running for ${selectedItem.title}. Approval stays locked until the asset reaches a ready state.`}
            </p>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && !selectedItem ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Select a job to preview"
            description="Choose a queued job to inspect the generated asset preview and review-ready resume sections."
          />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && !showGenerationState && !selectedAsset ? (
        <div className="mx-5 mb-5 flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          <EmptyState
            title="Loading preview"
            description="The tailored asset is still syncing into the preview panel. Try again in a moment."
          />
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && !showGenerationState && selectedAsset ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
              <span className="-rotate-45 text-[120px] font-black tracking-tighter">TAILORED</span>
            </div>
            <div className="grid items-end gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto]">
              <strong className="text-[1.1rem] text-(--text-headline)">{selectedJob?.title ?? selectedItem.title}</strong>
              <span className="text-[0.9rem] text-foreground-soft">{selectedAsset.label}</span>
            </div>
            {selectedAsset.previewSections.map((section) => (
              <div key={section.heading} className="grid gap-2">
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
