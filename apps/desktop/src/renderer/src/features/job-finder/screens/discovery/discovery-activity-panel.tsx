import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { DiscoveryActivityEvent, DiscoveryRunRecord } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import {
  buildLiveRunRecord,
  formatOutcomeLabel,
  getRunOptions,
  type DiscoveryTargetConfig
} from './discovery-history-utils'

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

function ActivityEventCard(props: { event: DiscoveryActivityEvent }) {
  const { event } = props

  return (
    <article className="grid gap-2 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-foreground-muted">
        <span className="min-w-0 break-words">{event.targetId ? `${event.resolvedAdapterKind ?? event.adapterKind ?? 'target'} · ${event.targetId}` : event.stage}</span>
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
  targets: readonly DiscoveryTargetConfig[]
}) {
  const dialogTitleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const eventStreamRef = useRef<HTMLDivElement | null>(null)
  const eventStreamEndRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const liveRun = useMemo(() => buildLiveRunRecord(props.liveEvents, props.targets), [props.liveEvents, props.targets])
  const runOptions = useMemo(
    () => getRunOptions(liveRun, props.activeRun, props.recentRuns),
    [liveRun, props.activeRun, props.recentRuns]
  )
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runOptions[0]?.id ?? null)
  const [followLiveEvents, setFollowLiveEvents] = useState(true)

  useEffect(() => {
    if (!props.open) {
      return
    }

    if (liveRun) {
      setSelectedRunId(liveRun.id)
      return
    }

    if (props.activeRun?.state === 'running') {
      setSelectedRunId(props.activeRun.id)
      return
    }

    setSelectedRunId(runOptions[0]?.id ?? null)
  }, [props.open, runOptions, liveRun?.id, props.activeRun?.id, props.activeRun?.state])

  useEffect(() => {
    if (!props.open) {
      return
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()

    return () => {
      previousFocusRef.current?.focus()
    }
  }, [props.open])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }

      const focusableElements = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"], [tabindex]:not([tabindex="-1"])'
      )].filter((element) => !element.hasAttribute('aria-hidden'))

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
        return
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  const selectedRun = runOptions.find((run) => run.id === selectedRunId) ?? runOptions[0] ?? null
  const displayedEvents = selectedRun?.activity ?? []
  const selectedRunIsLive = Boolean(liveRun && selectedRun?.id === liveRun.id)

  useEffect(() => {
    if (!props.open) {
      return
    }

    setFollowLiveEvents(selectedRunIsLive)
  }, [props.open, selectedRun?.id, selectedRunIsLive])

  useEffect(() => {
    if (!props.open || !selectedRunIsLive || !followLiveEvents) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      eventStreamEndRef.current?.scrollIntoView({ block: 'end' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [displayedEvents.length, followLiveEvents, props.open, selectedRunIsLive])

  if (!props.open) {
    return null
  }

  const handleEventStreamScroll = () => {
    const container = eventStreamRef.current

    if (!container || !selectedRunIsLive) {
      return
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setFollowLiveEvents(distanceFromBottom < 48)
  }

  const resumeLiveFollow = () => {
    setFollowLiveEvents(true)
    eventStreamEndRef.current?.scrollIntoView({ block: 'end' })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm" onClick={props.onClose}>
      <div
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="mx-auto flex min-h-0 max-h-[var(--discovery-history-max-height)] w-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] shadow-[0_32px_120px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-[var(--surface-panel-border)] px-5 py-4">
          <div className="grid gap-1">
            <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Full progress history</p>
            <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-[var(--text-headline)]" id={dialogTitleId}>Every retained discovery event for the selected run</h2>
            <p className="text-[0.9rem] leading-6 text-foreground-soft">
              {selectedRunIsLive
                ? 'The current run stays visible here in real time, including live auto-scroll while new events arrive.'
                : 'Use this view when you want the entire history instead of just the latest preview.'}
            </p>
          </div>
          <Button aria-label="Close" className="size-10" onClick={props.onClose} size="icon" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="grid min-h-0 content-start gap-3 overflow-y-auto border-b border-[var(--surface-panel-border)] px-4 py-4 lg:border-b-0 lg:border-r">
            <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Runs</p>
            <div className="grid gap-2 pb-1">
              {runOptions.length > 0 ? runOptions.map((run) => {
                const isSelected = run.id === selectedRun?.id
                const isLive = liveRun?.id === run.id

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
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.94rem] font-semibold text-[var(--text-headline)]">{formatOutcomeLabel(run.summary.outcome)}</span>
                      {isLive ? (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[var(--tracking-label)] text-primary">
                          Live
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[0.8rem] text-foreground-muted">{formatRunLabel(run.startedAt)}</span>
                    <span className="text-[0.8rem] text-foreground-muted">{run.summary.targetsCompleted}/{run.summary.targetsPlanned} targets · {run.summary.validJobsFound} found</span>
                  </button>
                )
              }) : (
                <p className="text-[0.9rem] leading-6 text-foreground-soft">No retained runs yet.</p>
              )}
            </div>
          </aside>

          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden px-4 py-4">
            {selectedRun ? (
              <div className="grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-4 sm:grid-cols-4">
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Started</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{formatRunLabel(selectedRun.startedAt)}</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Outcome</p>
                  <p className="mt-2 text-[0.95rem] font-semibold text-[var(--text-headline)]">{formatOutcomeLabel(selectedRun.summary.outcome)}</p>
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

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <p className="text-[0.78rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">
                {selectedRunIsLive ? 'Live event stream' : 'Retained event stream'}
              </p>
              {selectedRunIsLive ? (
                followLiveEvents ? (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[var(--tracking-label)] text-primary">
                    Following latest events
                  </span>
                ) : (
                  <Button onClick={resumeLiveFollow} size="sm" type="button" variant="secondary">
                    Jump to latest
                  </Button>
                )
              ) : null}
            </div>

            <div className="grid min-h-0 gap-3 overflow-y-auto pr-2 pb-1" onScroll={handleEventStreamScroll} ref={eventStreamRef}>
              {displayedEvents.length > 0 ? displayedEvents.map((event) => (
                <ActivityEventCard event={event} key={event.id} />
              )) : (
                <p className="text-[0.9rem] leading-6 text-foreground-soft">No activity events were retained for this run.</p>
              )}
              <div aria-hidden="true" ref={eventStreamEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
