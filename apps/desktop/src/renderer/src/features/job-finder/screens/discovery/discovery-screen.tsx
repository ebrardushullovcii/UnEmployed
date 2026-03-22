import type { BrowserSessionState, JobSearchPreferences, SavedJob } from '@unemployed/contracts'
import { PageHeader } from '../../components/page-header'
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

  return (
    <section className="grid gap-[1.65rem]">
      <PageHeader
        eyebrow="Discovery"
        title="Discovery Ops"
        description="Search preferences, browser session status, and the highest-fit saved jobs for the current MVP source adapter."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[18rem_minmax(24rem,1fr)_26rem]">
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
    </section>
  )
}
