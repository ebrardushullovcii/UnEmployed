import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { DiscoveryActivityEvent, DiscoveryRunRecord } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRunLabel(value: string): string {
  const date = new Date(value)

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getLiveRunEvents(
  activeRun: DiscoveryRunRecord | null,
  liveEvents: readonly DiscoveryActivityEvent[],
  runId: string | null
): readonly DiscoveryActivityEvent[] {
  if (!runId) {
    return []
  }

  if (activeRun?.id === runId && liveEvents.length > 0) {
    return liveEvents
  }

  return activeRun?.id === runId ? activeRun.activity : []
}

function getRunOptions(activeRun: DiscoveryRunRecord | null, recentRuns: readonly DiscoveryRunRecord[]): DiscoveryRunRecord[] {
  const runs = [activeRun, ...recentRuns].filter((run): run is DiscoveryRunRecord => Boolean(run))
  const seen = new Set<string>()

  return runs.filter((run) => {
    if (seen.has(run.id)) {
      return false
    }

    seen.add(run.id)
    return true
  })
}

function ActivityEventCard(props: { event: DiscoveryActivityEvent }) {
  const { event } = props

  return (
    <article className="grid gap-2 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-foreground-muted">
        <span className="min-w-0 break-words">{event.targetId ? `${event.adapterKind ?? 'target'} · ${event.targetId}` : event.stage}</span>
        <span className="shrink-0">{formatTimestamp(event.timestamp)}</span>
      </div>
      <p className="text-[0.95rem] leading-6 text-[var(--text-headline)]">{event.message}</p>
      {event.url ? <p className="break-all text-[0.82rem] text-foreground-muted">{event.url}</p> : null}
      {event.jobsFound !== null || event.jobsPersisted !== null || event.jobsStaged !== null ? (
        <div className="flex flex-wrap gap-2 text-[0.76rem] text-foreground-muted">
          {event.jobsFound !== null ? <span>Found {event.jobsFound}</span> : null}
          {event.jobsPersisted !== null ? <span>Saved {event.jobsPersisted}</span> : null}
          {event.jobsStaged !== null ? <span>Staged {event.jobsStaged}</span> : null}
        </div>
      ) : null}
    </article>
  )
}

export function DiscoveryHistoryModal(props: {
  activeRun: DiscoveryRunRecord | null
  liveEvents: readonly DiscoveryActivityEvent[]
  onClose: () => void
  open: boolean
  recentRuns: readonly DiscoveryRunRecord[]
}) {
  const runOptions = useMemo(() => getRunOptions(props.activeRun, props.recentRuns), [props.activeRun, props.recentRuns])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runOptions[0]?.id ?? null)

  useEffect(() => {
    if (!props.open) {
      return
    }

    setSelectedRunId((current) => current && runOptions.some((run) => run.id === current) ? current : runOptions[0]?.id ?? null)
  }, [props.open, runOptions])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  if (!props.open) {
    return null
  }

  const selectedRun = runOptions.find((run) => run.id === selectedRunId) ?? runOptions[0] ?? null
  const events = getLiveRunEvents(props.activeRun, props.liveEvents, selectedRun?.id ?? null)
  const displayedEvents = events.length > 0 ? events : selectedRun?.activity ?? []

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm" onClick={props.onClose}>
      <div
        className="mx-auto flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] shadow-[0_32px_120px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        style={{ maxHeight: 'min(90vh, 56rem)' }}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--surface-panel-border)] px-5 py-4">
          <div className="grid gap-1">
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Full progress history</p>
            <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-[var(--text-headline)]">Every retained discovery event for the selected run</h2>
            <p className="text-[0.9rem] leading-6 text-foreground-soft">Use this view when you want the entire history instead of just the latest preview.</p>
          </div>
          <Button className="size-10" onClick={props.onClose} size="icon" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="grid min-h-0 content-start gap-3 overflow-y-auto border-b border-[var(--surface-panel-border)] px-4 py-4 lg:border-b-0 lg:border-r">
            <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Runs</p>
            <div className="grid gap-2 pb-1">
              {runOptions.length > 0 ? runOptions.map((run) => {
                const isSelected = run.id === selectedRun?.id

                return (
                  <button
                    aria-pressed={isSelected}
                    className={[
                      'grid gap-1 rounded-[var(--radius-panel)] border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] text-foreground-soft hover:bg-secondary'
                    ].join(' ')}
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    type="button"
                  >
                    <span className="text-[0.94rem] font-semibold text-[var(--text-headline)]">{run.summary.outcome}</span>
                    <span className="text-[0.8rem] text-foreground-muted">{formatRunLabel(run.startedAt)}</span>
                    <span className="text-[0.8rem] text-foreground-muted">{run.summary.targetsCompleted}/{run.summary.targetsPlanned} targets · {run.summary.validJobsFound} found</span>
                  </button>
                )
              }) : (
                <p className="text-[0.9rem] leading-6 text-foreground-soft">No retained runs yet.</p>
              )}
            </div>
          </aside>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden px-4 py-4">
            {selectedRun ? (
              <div className="grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4 sm:grid-cols-4">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Started</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{formatRunLabel(selectedRun.startedAt)}</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Outcome</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{selectedRun.summary.outcome}</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Found</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{selectedRun.summary.validJobsFound}</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Saved / staged</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{selectedRun.summary.jobsPersisted} / {selectedRun.summary.jobsStaged}</p>
                </div>
              </div>
            ) : null}

            <div className="grid min-h-0 gap-3 overflow-y-auto pr-2 pb-1">
              {displayedEvents.length > 0 ? displayedEvents.map((event) => (
                <ActivityEventCard event={event} key={event.id} />
              )) : (
                <p className="text-[0.9rem] leading-6 text-foreground-soft">No activity events were retained for this run.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
