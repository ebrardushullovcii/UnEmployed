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
    <section className="flex min-h-[31rem] min-w-0 flex-col gap-4 overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-[var(--tracking-caps)] text-foreground">Active Queue</p>
        <Badge variant="section">{formatCountLabel(queue.length, 'item')}</Badge>
      </div>
      {queue.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="No jobs in review yet"
            description="Discovery and tailoring are wired to support review queue items once jobs move beyond the shortlist stage."
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
          {queue.map((item) => (
            <Button
              key={item.jobId}
              className={cn(
                'h-auto grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4 text-left text-foreground transition-colors hover:bg-[var(--field)]',
                selectedItem?.jobId === item.jobId ? 'border-[var(--field-border)] bg-[var(--field)]' : ''
              )}
              onClick={() => onSelectItem(item.jobId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <span className="mb-1 block font-mono text-[10px] text-muted-foreground">ID: {item.jobId.toUpperCase()}</span>
                  <strong className="line-clamp-2 font-display text-[1rem] font-semibold tracking-[-0.015em] text-foreground">{item.title}</strong>
                </div>
                <StatusBadge tone={getAssetTone(item.assetStatus)}>{formatStatusLabel(item.assetStatus)}</StatusBadge>
              </div>
              <span className="text-[0.8rem] text-foreground-muted">{item.company}</span>
              <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto]">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.4)]">
                  <span className="block h-full bg-accent" style={{ width: `${item.progressPercent ?? 0}%` }} />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[var(--tracking-normal)] text-primary">{item.progressPercent ?? 0}%</span>
              </div>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
