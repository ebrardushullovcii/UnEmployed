import type { BrowserSessionState, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/features/job-finder/components/empty-state'
import { StatusBadge } from '@renderer/features/job-finder/components/status-badge'
import { JOB_FINDER_ROUTE_HREFS } from '@renderer/features/job-finder/lib/job-finder-route-hrefs'
import { cn } from '@renderer/lib/cn'
import { formatOptionalDateOnly, formatStatusLabel, getApplicationTone } from '@renderer/features/job-finder/lib/job-finder-utils'

interface DiscoveryResultsPanelProps {
  browserSession: BrowserSessionState
  emptyClassName?: string
  jobs: readonly SavedJob[]
  onRecoveryAction?: (() => void) | null
  onSelectJob: (jobId: string) => void
  recoveryActionLabel?: string | null
  recoveryActionNextStep?: string | null
  recoveryActionPending?: boolean
  searchSetupBlocker?: {
    title: string
    description: string
    actionLabel?: string | null
    actionHref?: string | null
    nextStep?: string | null
  } | null
  selectedJob: SavedJob | null
}

function RecoveryCallout(props: {
  description: string
  onRecoveryAction?: (() => void) | null
  recoveryActionLabel?: string | null
  recoveryActionNextStep?: string | null
  recoveryActionPending?: boolean
}) {
  const recoveryActionProps = props.onRecoveryAction ? { onClick: props.onRecoveryAction } : {}
  const recoveryPendingProps = props.recoveryActionPending ? { pending: true } : {}

  return (
    <div aria-atomic="true" className="rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--warning-text)" role="alert">
      <p>{props.description}</p>
      {props.recoveryActionLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            type="button"
            variant="primary"
            {...recoveryActionProps}
            {...recoveryPendingProps}
          >
            {props.recoveryActionLabel}
          </Button>
          <span className="text-(length:--text-small) opacity-80">
            {props.recoveryActionNextStep ?? 'Then search again.'}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function ResultsEmptyState(props: {
  actionHref?: string | null
  className?: string
  description: string
  onRecoveryAction?: (() => void) | null
  recoveryActionLabel?: string | null
  recoveryActionNextStep?: string | null
  recoveryActionPending?: boolean
  title: string
}) {
  const emptyStateProps = props.className ? { className: props.className } : {}
  const recoveryActionProps = props.onRecoveryAction ? { onClick: props.onRecoveryAction } : {}
  const recoveryPendingProps = props.recoveryActionPending ? { pending: true } : {}
  const actionButton = props.recoveryActionLabel
    ? props.actionHref
      ? (
          <Button asChild size="sm" type="button" variant="primary">
            <a href={props.actionHref}>{props.recoveryActionLabel}</a>
          </Button>
        )
      : (
          <Button
            size="sm"
            type="button"
            variant="primary"
            {...recoveryActionProps}
            {...recoveryPendingProps}
          >
            {props.recoveryActionLabel}
          </Button>
        )
    : null

  return (
    <div className="grid gap-4">
      <EmptyState
        description={props.description}
        title={props.title}
        {...emptyStateProps}
      />
      {props.recoveryActionLabel ? (
        <div className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-4 text-left text-(length:--text-description) text-(--warning-text)">
          <div className="grid gap-1">
            <p className="font-medium">Next step</p>
            <p className="leading-6">
              {props.recoveryActionNextStep ?? 'Open the browser, then search again.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actionButton}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function getApplyPathLabel(applyPath: SavedJob['applyPath']): string {
  switch (applyPath) {
    case 'easy_apply':
      return 'Easy Apply'
    case 'external_redirect':
      return 'Apply on company site'
    default:
      return 'Manual application'
  }
}

export function DiscoveryResultsPanel({
  browserSession,
  emptyClassName,
  jobs,
  onRecoveryAction,
  onSelectJob,
  recoveryActionLabel,
  recoveryActionNextStep,
  recoveryActionPending = false,
  searchSetupBlocker = null,
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
          <h2 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Job results</h2>
          <Badge variant="section">{jobCount} {jobCount === 1 ? 'job' : 'jobs'}</Badge>
        </header>

      {searchSetupBlocker && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            actionHref={searchSetupBlocker.actionHref ?? JOB_FINDER_ROUTE_HREFS.profile}
            className={emptyClassName ?? 'min-h-72'}
            description={searchSetupBlocker.description}
            recoveryActionLabel={searchSetupBlocker.actionLabel ?? 'Edit search in Profile'}
            recoveryActionNextStep={searchSetupBlocker.nextStep ?? 'Then search again.'}
            title={searchSetupBlocker.title}
          />
        </div>
      ) : null}

      {!searchSetupBlocker && sessionNeedsAttention && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? 'min-h-72'}
            description="Open the browser, sign in or fix the issue, then search again."
            title="Search blocked by browser"
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined ? { recoveryActionLabel } : {})}
            {...(recoveryActionNextStep !== undefined ? { recoveryActionNextStep } : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {!searchSetupBlocker && sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? 'min-h-72'}
            description="New results will appear here after browser-based sources are ready."
            title="Browser is starting"
          />
        </div>
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <RecoveryCallout
            description="You're viewing results from the last completed search. Open the browser when you're ready to run a new one."
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined ? { recoveryActionLabel } : {})}
            {...(recoveryActionNextStep !== undefined ? { recoveryActionNextStep } : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length > 0 ? (
        <div className="px-5 pt-4">
          <div aria-atomic="true" aria-live="polite" className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)" role="status">
            You're viewing results from the last completed search while the browser gets ready.
          </div>
        </div>
      ) : null}

      {!searchSetupBlocker && !sessionNeedsAttention && !sessionWaitingOnRuntime && jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? 'min-h-72'}
            description="Try broader roles, locations, or sources, then search again."
            title="No matches from this search"
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
                      {job.status === 'shortlisted' || job.status === 'submitted' ? (
                        <StatusBadge tone={getApplicationTone(job.status)}>{formatStatusLabel(job.status)}</StatusBadge>
                      ) : null}
                      <Badge variant="outline">{getApplyPathLabel(job.applyPath)}</Badge>
                      {job.salaryText ? <Badge variant="outline">{job.salaryText}</Badge> : null}
                      {job.workMode.length > 0 ? <Badge variant="outline">{job.workMode.join(', ')}</Badge> : null}
                      {job.postedAt || job.postedAtText ? <Badge variant="outline">Posted {formatOptionalDateOnly(job.postedAt, job.postedAtText)}</Badge> : null}
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
