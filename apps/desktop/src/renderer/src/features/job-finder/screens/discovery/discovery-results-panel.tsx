import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '../../components/empty-state'
import { StatusBadge } from '../../components/status-badge'
import { formatDateOnly, formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'

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
  const baseButtonClasses =
    'grid gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] p-5 text-left transition-colors'

  return (
    <section className="grid min-h-[31rem] min-w-0 content-start gap-4 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Saved results</p>
        <Badge variant="section">{jobCount} {jobCount === 1 ? 'job' : 'jobs'}</Badge>
      </div>

      {browserSession.status !== 'ready' ? (
        <EmptyState
          className="min-h-[18rem]"
          description="Discovery is blocked until the browser runtime reports a ready session for the LinkedIn adapter."
          title="LinkedIn session needs attention"
        />
      ) : null}

      {browserSession.status === 'ready' && jobs.length === 0 ? (
        <EmptyState
          className="min-h-[18rem]"
          description="The discovery surface is wired and ready, but there are no matching jobs in the current repository state."
          title="No jobs saved yet"
        />
      ) : null}

      {browserSession.status === 'ready' && jobs.length > 0 ? (
        <div aria-label="Saved job results" className="grid content-start gap-3 pr-1">
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
                  <span aria-label={`Match ${job.matchAssessment.score}%`} className="text-[1rem] font-semibold text-[var(--text-headline)]">
                    Match {job.matchAssessment.score}
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
