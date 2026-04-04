import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '@renderer/features/job-finder/components/empty-state'
import { StatusBadge } from '@renderer/features/job-finder/components/status-badge'
import { formatOptionalDateOnly, formatStatusLabel, getApplicationTone } from '@renderer/features/job-finder/lib/job-finder-utils'

interface DiscoveryResultsPanelProps {
  browserSession: BrowserSessionState
  jobs: readonly SavedJob[]
  onSelectJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

export function DiscoveryResultsPanel({
  browserSession,
  jobs,
  onSelectJob,
  selectedJob
}: DiscoveryResultsPanelProps) {
  const jobCount = jobs.length
  const sessionNeedsAttention = browserSession.status === 'login_required' || browserSession.status === 'blocked'
  const sessionWaitingOnRuntime = browserSession.status === 'unknown'
  const baseButtonClasses =
    'grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30'

  return (
    <section className="flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) xl:h-full xl:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Saved results</h2>
        <Badge variant="section">{jobCount} {jobCount === 1 ? 'job' : 'jobs'}</Badge>
      </header>

      {sessionNeedsAttention && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="Discovery is blocked until the browser runtime reports a ready session for the active adapter."
            title="Discovery session needs attention"
          />
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="The browser runtime has not published a session snapshot yet. Saved results will still appear here when available."
            title="Waiting for runtime"
          />
        </div>
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div aria-atomic="true" className="rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--warning-text)" role="alert">
            Saved results are still available below. Open the browser profile again when you want to run a fresh discovery.
          </div>
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div aria-atomic="true" aria-live="polite" className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)" role="status">
            Saved results are available below while the browser runtime finishes publishing the latest session snapshot.
          </div>
        </div>
      ) : null}

      {!sessionNeedsAttention && !sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="The discovery surface is wired and ready, but there are no matching jobs in the current repository state."
            title="No jobs saved yet"
          />
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <ul className="m-0 grid min-h-full list-none content-start gap-3 p-0">
            {jobs.map((job) => {
              const isSelected = selectedJob?.id === job.id

              return (
                <li key={job.id} className="min-w-0">
                  <button
                    aria-pressed={isSelected}
                    className={`${baseButtonClasses} w-full ${
                      isSelected
                        ? 'bg-(--surface-panel-raised)'
                        : 'bg-transparent hover:bg-(--surface-panel-raised)'
                    }`}
                    onClick={() => onSelectJob(job.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <strong className="text-(length:--text-section-title) text-(--text-headline)">{job.title}</strong>
                        <span className="text-(length:--text-description) text-foreground-muted">
                          {job.company} - {job.location}
                        </span>
                      </div>
                      <span className="text-(length:--text-body) font-semibold text-(--text-headline)">
                        Match {job.matchAssessment.score}%
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={getApplicationTone(job.status)}>{formatStatusLabel(job.status)}</StatusBadge>
                      <Badge variant="outline">{formatStatusLabel(job.applyPath)}</Badge>
                      <Badge variant="outline">Posted {formatOptionalDateOnly(job.postedAt, job.postedAtText)}</Badge>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
