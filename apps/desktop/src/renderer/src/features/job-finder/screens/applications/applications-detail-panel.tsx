import { Bolt } from 'lucide-react'
import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatTimestamp, formatStatusLabel, getApplicationTone, getAssetTone, getEventTone } from '../../lib/job-finder-utils'

interface ApplicationsDetailPanelProps {
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
}

export function ApplicationsDetailPanel({ selectedAttempt, selectedRecord }: ApplicationsDetailPanelProps) {
  return (
    <section className="flex min-h-[31rem] min-w-0 flex-col gap-6 overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-8 py-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[var(--tracking-badge)] text-muted-foreground">Current record</p>
          <strong className="font-mono text-[10px] uppercase tracking-[var(--tracking-heading)] text-primary">
            {selectedRecord ? `#${selectedRecord.id.slice(0, 7).toUpperCase()}` : 'No selection'}
          </strong>
        </div>
        <StatusBadge tone={selectedRecord ? getApplicationTone(selectedRecord.status) : 'muted'}>
          {selectedRecord ? formatStatusLabel(selectedRecord.status) : 'No selection'}
        </StatusBadge>
      </div>
      {selectedRecord ? (
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
           <div className="grid gap-2">
             <h2 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-[var(--text-headline)]">{selectedRecord.title}</h2>
             <p className="text-[var(--text-field)] text-foreground-muted">{selectedRecord.company}</p>
           </div>
           <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4"><span className="font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Last updated</span><strong className="mt-2 block text-[var(--text-field)] font-semibold text-foreground">{formatTimestamp(selectedRecord.lastUpdatedAt)}</strong></div>
              <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4"><span className="font-mono text-[9px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">Next step</span><strong className="mt-2 block text-[var(--text-field)] font-semibold text-foreground">{selectedRecord.nextActionLabel ?? 'None'}</strong></div>
           </div>
           {selectedAttempt ? (
             <section className="grid gap-2 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4">
                <p className="font-display text-[10px] uppercase tracking-[var(--tracking-mono)] text-primary">Latest apply attempt</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{selectedAttempt.summary}</strong>
                <StatusBadge tone={getAssetTone(selectedAttempt.state === 'submitted' ? 'ready' : selectedAttempt.state === 'paused' ? 'queued' : selectedAttempt.state === 'unsupported' ? 'failed' : selectedAttempt.state === 'failed' ? 'failed' : 'generating')}>
                  {formatStatusLabel(selectedAttempt.state)}
                </StatusBadge>
              </div>
              <p className="text-[var(--text-body)] leading-7 text-foreground-soft">{selectedAttempt.detail}</p>
            </section>
          ) : null}
          <div className="grid gap-0">
            {selectedRecord.events.map((event) => (
              <article key={event.id} className="relative grid gap-3 border-l border-border/20 pl-8 pb-8 sm:grid-cols-[1fr]">
                <div className={cn('absolute left-[-5px] top-1 h-2.5 w-2.5', getEventTone(event) === 'positive' ? 'bg-positive' : getEventTone(event) === 'active' ? 'bg-primary' : getEventTone(event) === 'critical' ? 'bg-destructive' : 'border border-border bg-background')} />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[var(--tracking-heading)] text-muted-foreground">{formatTimestamp(event.at)}</div>
                  <strong className={cn('mt-1 block text-xs uppercase', getEventTone(event) === 'positive' ? 'text-positive' : getEventTone(event) === 'active' ? 'text-primary' : getEventTone(event) === 'critical' ? 'text-destructive' : 'text-foreground')}>{event.title}</strong>
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground-soft">{event.detail}</p>
                </div>
              </article>
            ))}
          </div>
           <div className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Bolt className="size-4 text-primary" />
              <span className="font-display text-[10px] font-bold uppercase tracking-[var(--tracking-mono)] text-primary">Predictive next step</span>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-foreground">Based on historical data for this entity, the next interview step will likely focus on concurrent process management.</p>
            <Button className="w-full" variant="secondary" type="button">Run simulation</Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="Choose an application record"
            description="Select a tracked application to inspect the latest events and determine what needs attention next."
          />
        </div>
      )}
    </section>
  )
}
