import { Bolt } from 'lucide-react'
import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
import { Button } from '../../../../components/ui/button'
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
    <section className="border-l border-border/10 bg-surface-muted px-8 py-8 grid content-start gap-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">CURRENT_MISSION: {selectedRecord ? selectedRecord.id.slice(0, 7).toUpperCase() : 'NONE'}</p>
        <StatusBadge tone={selectedRecord ? getApplicationTone(selectedRecord.status) : 'muted'}>
          {selectedRecord ? formatStatusLabel(selectedRecord.status) : 'No selection'}
        </StatusBadge>
      </div>
      {selectedRecord ? (
        <>
          <h2>{selectedRecord.title}</h2>
          <p className="text-[0.84rem] leading-6 text-foreground-muted">{selectedRecord.company}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Last updated</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{formatTimestamp(selectedRecord.lastUpdatedAt)}</strong></div>
            <div><span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Next step</span><strong className="mt-1 block font-display text-xs uppercase text-foreground">{selectedRecord.nextActionLabel ?? 'NONE'}</strong></div>
          </div>
          {selectedAttempt ? (
            <section className="grid gap-2 border border-border/20 bg-card px-4 py-4">
              <p className="font-display text-[10px] uppercase tracking-[0.16em] text-primary">Latest apply attempt</p>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <strong>{selectedAttempt.summary}</strong>
                <StatusBadge tone={getAssetTone(selectedAttempt.state === 'submitted' ? 'ready' : selectedAttempt.state === 'paused' ? 'queued' : selectedAttempt.state === 'unsupported' ? 'failed' : selectedAttempt.state === 'failed' ? 'failed' : 'generating')}>
                  {formatStatusLabel(selectedAttempt.state)}
                </StatusBadge>
              </div>
              <p className="text-[0.95rem] leading-7 text-foreground-soft">{selectedAttempt.detail}</p>
            </section>
          ) : null}
          <div className="grid gap-0">
            {selectedRecord.events.map((event) => (
              <article key={event.id} className="relative grid gap-3 border-l border-border/20 pl-8 pb-8 sm:grid-cols-[1fr]">
                <div className={cn('absolute left-[-5px] top-1 h-2.5 w-2.5', getEventTone(event) === 'positive' ? 'bg-positive' : getEventTone(event) === 'active' ? 'bg-primary' : getEventTone(event) === 'critical' ? 'bg-destructive' : 'border border-border bg-background')} />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{formatTimestamp(event.at)}</div>
                  <strong className={cn('mt-1 block text-xs uppercase', getEventTone(event) === 'positive' ? 'text-positive' : getEventTone(event) === 'active' ? 'text-primary' : getEventTone(event) === 'critical' ? 'text-destructive' : 'text-foreground')}>{event.title}</strong>
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground-soft">{event.detail}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="border border-border/20 bg-card px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Bolt className="size-4 text-primary" />
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Predictive next step</span>
            </div>
            <p className="mb-4 text-[11px] leading-relaxed text-foreground">Based on historical data for this entity, the next interview step will likely focus on concurrent process management.</p>
            <Button className="w-full" variant="secondary" type="button">Run simulation</Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="Choose an application record"
          description="Select a tracked application to inspect the latest events and determine what needs attention next."
        />
      )}
    </section>
  )
}
