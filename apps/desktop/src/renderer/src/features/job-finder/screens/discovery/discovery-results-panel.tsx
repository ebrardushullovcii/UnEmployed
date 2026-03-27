import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '@renderer/features/job-finder/components/empty-state'
import { StatusBadge } from '@renderer/features/job-finder/components/status-badge'
import { formatDateOnly, formatStatusLabel, getApplicationTone } from '@renderer/features/job-finder/lib/job-finder-utils'

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
  const sessionNeedsAttention = browserSession.status !== 'ready'
  const baseButtonClasses =
    'grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] p-5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30'

  return (
    <section className="flex min-h-[31rem] min-w-0 flex-col gap-4 overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Saved results</p>
        <Badge variant="section">{jobCount} {jobCount === 1 ? 'job' : 'jobs'}</Badge>
      </div>

      {sessionNeedsAttention && jobs.length === 0 ? (
        <EmptyState
          className="min-h-[18rem]"
          description="Discovery is blocked until the browser runtime reports a ready session for the active adapter."
          title="Discovery session needs attention"
        />
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="rounded-[var(--radius-panel)] border border-[color:var(--warning-border)] bg-[color:var(--warning-surface)] px-4 py-3 text-[var(--text-description)] leading-6 text-[color:var(--warning-text)]">
          Saved results are still available below. Open the browser profile again when you want to run a fresh discovery.
        </div>
      ) : null}

      {!sessionNeedsAttention && jobs.length === 0 ? (
        <EmptyState
          className="min-h-[18rem]"
          description="The discovery surface is wired and ready, but there are no matching jobs in the current repository state."
          title="No jobs saved yet"
        />
      ) : null}

      {jobs.length > 0 ? (
        <div aria-label="Saved job results" className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1">
          {jobs.map((job) => {
            const isSelected = selectedJob?.id === job.id

            return (
              <button
                aria-pressed={isSelected}
                key={job.id}
                className={`${baseButtonClasses} ${
                  isSelected
                    ? 'bg-[var(--surface-panel-raised)]'
                    : 'bg-transparent hover:bg-[var(--surface-panel-raised)]'
                }`}
                onClick={() => onSelectJob(job.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <strong className="text-[1.15rem] text-[var(--text-headline)]">{job.title}</strong>
                    <span className="text-[var(--text-description)] text-foreground-muted">
                      {job.company} - {job.location}
                    </span>
                  </div>
                  <span className="text-[var(--text-body)] font-semibold text-[var(--text-headline)]">
                    Match {job.matchAssessment.score}%
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={getApplicationTone(job.status)}>{formatStatusLabel(job.status)}</StatusBadge>
                  <Badge variant="outline">{formatStatusLabel(job.applyPath)}</Badge>
                  <Badge variant="outline">Posted {formatDateOnly(job.postedAt)}</Badge>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
