import type { ReviewQueueItem } from '@unemployed/contracts'
import { Badge } from '../../../../components/ui/badge'
import { Button } from '../../../../components/ui/button'
import { cn } from '../../../../lib/cn'
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
    <section className="border-r border-border/20 bg-surface-muted p-4 grid content-start gap-4 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">Active Queue</p>
        <Badge variant="section">{formatCountLabel(queue.length, 'item')}</Badge>
      </div>
      {queue.length === 0 ? (
        <EmptyState
          title="No jobs in review yet"
          description="Discovery and tailoring are wired to support review queue items once jobs move beyond the shortlist stage."
        />
      ) : (
        <div className="grid gap-2">
          {queue.map((item) => (
            <Button
              key={item.jobId}
              className={cn(
                'grid gap-3 rounded-none border border-transparent bg-card px-4 py-4 text-left text-foreground transition-colors hover:bg-secondary',
                selectedItem?.jobId === item.jobId ? 'border-l-2 border-l-primary bg-secondary' : ''
              )}
              onClick={() => onSelectItem(item.jobId)}
              type="button"
            >
              <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <span className="mb-1 block font-mono text-[10px] text-muted-foreground">ID: {item.jobId.toUpperCase()}</span>
                  <strong className="font-display text-sm font-bold uppercase tracking-[0.04em] text-foreground">{item.title}</strong>
                </div>
                <StatusBadge tone={getAssetTone(item.assetStatus)}>{formatStatusLabel(item.assetStatus)}</StatusBadge>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{item.company}</span>
              <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto]">
                <div className="h-1.5 w-full overflow-hidden bg-background">
                  <span className="block h-full bg-accent" style={{ width: `${item.progressPercent ?? 0}%` }} />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-primary">{item.progressPercent ?? 0}%</span>
              </div>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
