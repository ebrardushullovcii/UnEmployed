import type { ApplicationAttempt, ApplicationRecord } from '@unemployed/contracts'
import { cn } from '@renderer/lib/utils'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatTimestamp, formatStatusLabel, getApplicationTone, getAssetTone, getEventTone } from '../../lib/job-finder-utils'

interface ApplicationsDetailPanelProps {
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
}

function getAttemptStateLabel(state: ApplicationAttempt['state']): string {
  switch (state) {
    case 'paused':
      return 'Waiting for action'
    case 'unsupported':
      return 'Could not apply automatically'
    case 'in_progress':
      return 'In progress'
    case 'not_started':
      return 'Not started'
    default:
      return formatStatusLabel(state)
  }
}

export function ApplicationsDetailPanel({ selectedAttempt, selectedRecord }: ApplicationsDetailPanelProps) {
  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-(--tracking-badge) text-muted-foreground">Application details</p>
          {selectedRecord ? (
            <strong className="text-[0.95rem] text-(--text-headline)">{selectedRecord.company}</strong>
          ) : (
            <strong className="text-[0.95rem] text-muted-foreground">Nothing selected</strong>
          )}
        </div>
        <StatusBadge tone={selectedRecord ? getApplicationTone(selectedRecord.status) : 'muted'}>
          {selectedRecord ? formatStatusLabel(selectedRecord.status) : 'Nothing selected'}
        </StatusBadge>
      </div>
      {selectedRecord ? (
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
           <div className="grid gap-2">
             <h2 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{selectedRecord.title}</h2>
             <p className="text-(length:--text-field) text-foreground-muted">{selectedRecord.company}</p>
           </div>
           <div className="grid gap-3 md:grid-cols-2">
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4"><span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Last updated</span><strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">{formatTimestamp(selectedRecord.lastUpdatedAt)}</strong></div>
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4"><span className="font-mono text-[9px] uppercase tracking-(--tracking-heading) text-muted-foreground">Next follow-up</span><strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">{selectedRecord.nextActionLabel ?? 'No follow-up scheduled'}</strong></div>
           </div>
           {selectedAttempt ? (
              <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
                <p className="font-display text-[10px] uppercase tracking-(--tracking-mono) text-primary">Latest attempt</p>
               <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{selectedAttempt.summary}</strong>
                <StatusBadge tone={getAssetTone(selectedAttempt.state === 'submitted' ? 'ready' : selectedAttempt.state === 'paused' ? 'queued' : selectedAttempt.state === 'unsupported' ? 'failed' : selectedAttempt.state === 'failed' ? 'failed' : 'generating')}>
                  {getAttemptStateLabel(selectedAttempt.state)}
                </StatusBadge>
              </div>
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedAttempt.detail}</p>
            </section>
          ) : null}
          <div className="grid gap-0">
            {selectedRecord.events.map((event) => (
              <article key={event.id} className="relative grid gap-3 border-l border-border/20 pl-8 pb-8 sm:grid-cols-[1fr]">
                <div className={cn('absolute left-[-5px] top-1 h-2.5 w-2.5', getEventTone(event) === 'positive' ? 'bg-positive' : getEventTone(event) === 'active' ? 'bg-primary' : getEventTone(event) === 'critical' ? 'bg-destructive' : 'border border-border bg-background')} />
                 <div>
                   <div className="font-mono text-[10px] uppercase tracking-(--tracking-heading) text-muted-foreground">{formatTimestamp(event.at)}</div>
                   <strong className={cn('mt-1 block text-sm font-medium', getEventTone(event) === 'positive' ? 'text-positive' : getEventTone(event) === 'active' ? 'text-primary' : getEventTone(event) === 'critical' ? 'text-destructive' : 'text-foreground')}>{event.title}</strong>
                   <p className="mt-2 text-[0.84rem] leading-relaxed text-foreground-soft">{event.detail}</p>
                 </div>
               </article>
             ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="Choose an application"
            description="Select an application to review its latest update, follow-up, and timeline."
          />
        </div>
      )}
    </section>
  )
}
