import type { BrowserSessionState, JobSearchPreferences, SavedJob } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '../../components/empty-state'
import { PageHeader } from '../../components/page-header'
import { formatCountLabel } from '../../lib/job-finder-utils'
import { DiscoveryDetailPanel } from './discovery-detail-panel'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'
import { DiscoveryResultsPanel } from './discovery-results-panel'

export function DiscoveryScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  browserSession: BrowserSessionState
  jobs: readonly SavedJob[]
  onDismissJob: (jobId: string) => void
  onOpenBrowserSession: () => void
  onQueueJob: (jobId: string) => void
  onRefreshDiscovery: () => void
  onSelectJob: (jobId: string) => void
  searchPreferences: JobSearchPreferences
  selectedJob: SavedJob | null
}) {
  const {
    actionState,
    browserSession,
    busy,
    jobs,
    onDismissJob,
    onOpenBrowserSession,
    onQueueJob,
    onRefreshDiscovery,
    onSelectJob,
    searchPreferences,
    selectedJob
  } = props

  const showEmptyDiscoveryState = jobs.length === 0
  const configuredFilters = [
    formatCountLabel(searchPreferences.targetRoles.length, 'role'),
    formatCountLabel(searchPreferences.locations.length, 'location'),
    formatCountLabel(searchPreferences.workModes.length, 'work mode')
  ]

  const emptyStateContent =
    browserSession.status === 'ready'
      ? {
          title: 'No jobs saved yet',
          description:
            'The LinkedIn session is ready, but this search has not written any saved results yet. Refine roles, locations, or work modes in Profile preferences, then run discovery again.'
        }
      : {
          title: 'Discovery is waiting on the browser session',
          description:
            'The search controls are configured, but saved results will stay empty until the LinkedIn browser runtime reports a ready session for the current adapter.'
        }

  return (
    <section className="grid gap-[var(--gap-section)]">
      <PageHeader
        eyebrow="Discovery"
        title="LinkedIn results"
        description="Search preferences, browser session status, and the highest-fit saved jobs for the current MVP source adapter."
      />

      {showEmptyDiscoveryState ? (
        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(23rem,25rem)_minmax(0,1fr)]">
          <DiscoveryFiltersPanel
            actionMessage={actionState.message}
            browserSession={browserSession}
            busy={busy}
            onOpenBrowserSession={onOpenBrowserSession}
            onRefreshDiscovery={onRefreshDiscovery}
            searchPreferences={searchPreferences}
          />
          <section className="grid min-h-[31rem] content-start gap-5 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Saved results</p>
              <span className="inline-flex items-center rounded-[var(--radius-small)] border border-border bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-[var(--tracking-heading)] text-muted-foreground">
                0 jobs
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {configuredFilters.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
            <EmptyState className="min-h-[20rem]" description={emptyStateContent.description} title={emptyStateContent.title} />
            <p className="max-w-[44rem] text-[var(--text-description)] leading-6 text-foreground-soft">
              Keep the discovery surface lean: fill out Profile preferences first, validate the browser session, then rerun discovery from the left rail.
            </p>
          </section>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem] 2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]">
          <DiscoveryFiltersPanel
            actionMessage={actionState.message}
            browserSession={browserSession}
            busy={busy}
            onOpenBrowserSession={onOpenBrowserSession}
            onRefreshDiscovery={onRefreshDiscovery}
            searchPreferences={searchPreferences}
          />
          <DiscoveryResultsPanel
            browserSession={browserSession}
            jobs={jobs}
            onSelectJob={onSelectJob}
            selectedJob={selectedJob}
          />
          <DiscoveryDetailPanel
            busy={busy}
            onDismissJob={onDismissJob}
            onQueueJob={onQueueJob}
            selectedJob={selectedJob}
          />
        </div>
      )}
    </section>
  )
}
