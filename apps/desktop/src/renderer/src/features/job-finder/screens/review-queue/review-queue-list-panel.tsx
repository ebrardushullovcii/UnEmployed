import type { ReviewQueueItem } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatCountLabel, formatStatusLabel, getAssetTone } from '../../lib/job-finder-utils'

interface ReviewQueueListPanelProps {
  onSelectItem: (jobId: string) => void
  queue: readonly ReviewQueueItem[]
  selectedItem: ReviewQueueItem | null
}

export function ReviewQueueListPanel({ onSelectItem, queue, selectedItem }: ReviewQueueListPanelProps) {
  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-5">
        <p className="font-display text-[11px] font-bold uppercase tracking-(--tracking-caps) text-foreground">Active Queue</p>
        <Badge variant="section">{formatCountLabel(queue.length, 'item')}</Badge>
      </div>
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-5 pt-4">
          <EmptyState
            title="No jobs in review yet"
            description="Discovery and tailoring are wired to support review queue items once jobs move beyond the shortlist stage."
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-x-hidden overflow-y-auto px-5 pb-5 pt-4">
          {queue.map((item) => (
            <Button
              aria-current={selectedItem?.jobId === item.jobId ? 'true' : undefined}
              key={item.jobId}
              className={cn(
                'flex h-auto min-w-0 w-full flex-col items-stretch justify-start gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) px-3 py-4 text-left whitespace-normal text-foreground transition-colors hover:bg-(--field)',
                selectedItem?.jobId === item.jobId ? 'border-(--field-border) bg-(--field)' : 'surface-card-tint'
              )}
              onClick={() => onSelectItem(item.jobId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <div className="flex min-w-0 w-full flex-col gap-3">
                <div className="flex w-full justify-end">
                  <StatusBadge tone={getAssetTone(item.assetStatus)}>{formatStatusLabel(item.assetStatus)}</StatusBadge>
                </div>
                <div className="min-w-0 w-full">
                  <strong className="block break-words font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground">{item.title}</strong>
                </div>
              </div>
              <span className="block w-full text-[0.8rem] text-foreground-muted">{item.company}</span>
              <div className="grid min-w-0 w-full gap-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--surface-progress-track)">
                  <span
                    className="block h-full bg-accent"
                    style={{ width: `${item.progressPercent ?? 0}%` }}
                  />
                </div>
                <span className="block w-full text-right font-mono text-[9px] uppercase tracking-(--tracking-normal) text-primary">{item.progressPercent ?? 0}%</span>
              </div>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
