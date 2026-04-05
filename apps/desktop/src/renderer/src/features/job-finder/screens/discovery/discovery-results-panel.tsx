import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '@renderer/features/job-finder/components/empty-state'
import { StatusBadge } from '@renderer/features/job-finder/components/status-badge'
import { cn } from '@renderer/lib/cn'
import { formatOptionalDateOnly, formatStatusLabel, getApplicationTone } from '@renderer/features/job-finder/lib/job-finder-utils'

interface DiscoveryResultsPanelProps {
  browserSession: BrowserSessionState
  jobs: readonly SavedJob[]
  onSelectJob: (jobId: string) => void
  selectedJob: SavedJob | null
}

function getApplyPathLabel(applyPath: SavedJob['applyPath']): string {
  switch (applyPath) {
    case 'easy_apply':
      return 'Apply here'
    case 'external_redirect':
      return 'External site'
    default:
      return 'Manual apply'
  }
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
      <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Results</h2>
          <Badge variant="section">{jobCount} {jobCount === 1 ? 'job' : 'jobs'}</Badge>
        </header>

      {sessionNeedsAttention && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="Sign in or resolve the browser issue, then run the search again."
            title="Browser needs attention"
          />
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="New results will appear here after the browser finishes starting."
            title="Waiting for browser"
          />
        </div>
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div aria-atomic="true" className="rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--warning-text)" role="alert">
            Your saved results are still here. Open the browser again when you're ready to run a fresh search.
          </div>
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div aria-atomic="true" aria-live="polite" className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)" role="status">
            Saved results are still available while the browser finishes starting.
          </div>
        </div>
      ) : null}

      {!sessionNeedsAttention && !sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <EmptyState
            className="min-h-72"
            description="No jobs match this search yet. Try adjusting your roles, locations, or work modes."
            title="No jobs yet"
          />
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <ul aria-label="Results" className="m-0 grid min-h-full list-none content-start gap-3 p-0" role="listbox">
            {jobs.map((job) => {
              const isSelected = selectedJob?.id === job.id

              return (
                <li key={job.id} className="min-w-0">
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      baseButtonClasses,
                      'w-full',
                      isSelected ? 'surface-card-tint' : 'bg-transparent hover:bg-(--surface-panel-raised)'
                    )}
                    onClick={() => onSelectJob(job.id)}
                    role="option"
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <strong className="text-(length:--text-section-title) text-(--text-headline)">{job.title}</strong>
                        <span className="text-(length:--text-description) text-foreground-muted">
                          {job.company} • {job.location}
                        </span>
                      </div>
                      <span className="text-(length:--text-body) font-semibold text-(--text-headline)">
                        {job.matchAssessment.score}% fit
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={getApplicationTone(job.status)}>{formatStatusLabel(job.status)}</StatusBadge>
                      <Badge variant="outline">{getApplyPathLabel(job.applyPath)}</Badge>
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
