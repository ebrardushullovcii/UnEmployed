import { useState } from 'react'
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  JobSearchPreferences,
  SavedJob
} from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { EmptyState } from '@renderer/features/job-finder/components/empty-state'
import { LockedScreenLayout } from '@renderer/features/job-finder/components/locked-screen-layout'
import { PageHeader } from '@renderer/features/job-finder/components/page-header'
import { formatCountLabel } from '@renderer/features/job-finder/lib/job-finder-utils'
import { DiscoveryHistoryModal } from './discovery-activity-panel'
import { DiscoveryDetailPanel } from './discovery-detail-panel'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'
import { DiscoveryResultsPanel } from './discovery-results-panel'

export function DiscoveryScreen(props: {
  actionState: { busy: boolean; message: string | null }
  activeRun: DiscoveryRunRecord | null
  busy: boolean
  browserSession: BrowserSessionState
  discoverySessions: readonly DiscoveryAdapterSessionState[]
  jobs: readonly SavedJob[]
  liveEvents: readonly DiscoveryActivityEvent[]
  onDismissJob: (jobId: string) => void
  onOpenBrowserSession: () => void
  onQueueJob: (jobId: string) => void
  onRunAgentDiscovery: (() => void) | undefined
  onSelectJob: (jobId: string) => void
  recentRuns: readonly DiscoveryRunRecord[]
  searchPreferences: JobSearchPreferences
  selectedJob: SavedJob | null
}) {
  const {
    actionState,
    activeRun,
    browserSession,
    busy,
    discoverySessions,
    jobs,
    liveEvents,
    onDismissJob,
    onOpenBrowserSession,
    onQueueJob,
    onRunAgentDiscovery,
    onSelectJob,
    recentRuns,
    searchPreferences,
    selectedJob
  } = props
  const [showHistory, setShowHistory] = useState(false)

  const showEmptyDiscoveryState = jobs.length === 0
  const configuredFilters = [
    formatCountLabel(searchPreferences.targetRoles.length, 'role'),
    formatCountLabel(searchPreferences.locations.length, 'location'),
    formatCountLabel(searchPreferences.workModes.length, 'work mode'),
    formatCountLabel(searchPreferences.discovery.targets.length, 'source')
  ]

  const emptyStateContent =
    browserSession.status === 'ready'
      ? {
          title: 'No jobs yet',
          description:
            'Nothing matched this search yet. Adjust your roles, locations, work modes, or job sources in Profile, then run the search again.'
        }
      : {
          title: 'Search is waiting on your browser',
          description:
            'Your search is ready, but new results will only appear after the browser is available.'
        }

  return (
    <>
      <LockedScreenLayout
        contentClassName="xl:overflow-hidden"
        topClassName="pb-(--gap-section) pt-8"
        topContent={(
          <PageHeader
            eyebrow="Find Jobs"
            title="Find jobs"
            description="Search your saved roles and job sources, then review the strongest matches."
          />
        )}
      >
        {showEmptyDiscoveryState ? (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(23rem,25rem)_minmax(0,1fr)] xl:overflow-hidden">
            <DiscoveryFiltersPanel
              actionMessage={actionState.message}
              busy={busy}
              discoverySessions={discoverySessions}
              onOpenBrowserSession={onOpenBrowserSession}
              onRunAgentDiscovery={onRunAgentDiscovery}
              onViewProgress={() => setShowHistory(true)}
              searchPreferences={searchPreferences}
            />
            <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-5 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-6 xl:h-full xl:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Results</p>
                <span className="inline-flex items-center rounded-(--radius-small) border border-border bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-(--tracking-heading) text-muted-foreground">0 jobs</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {configuredFilters.map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto pr-1">
                <EmptyState className="min-h-80" description={emptyStateContent.description} title={emptyStateContent.title} />
                <p className="max-w-176 text-(length:--text-description) leading-6 text-foreground-soft">Update your search in Profile, make sure the browser is ready for any site that needs it, then run the search again from the left panel.</p>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem] xl:overflow-hidden 2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]">
            <DiscoveryFiltersPanel
              actionMessage={actionState.message}
              busy={busy}
              discoverySessions={discoverySessions}
              onOpenBrowserSession={onOpenBrowserSession}
              onRunAgentDiscovery={onRunAgentDiscovery}
              onViewProgress={() => setShowHistory(true)}
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
              discoveryTargets={searchPreferences.discovery.targets}
              onDismissJob={onDismissJob}
              onQueueJob={onQueueJob}
              selectedJob={selectedJob}
            />
          </div>
        )}
      </LockedScreenLayout>

      <DiscoveryHistoryModal
        activeRun={activeRun}
        liveEvents={liveEvents}
        onClose={() => setShowHistory(false)}
        open={showHistory}
        recentRuns={recentRuns}
        targets={searchPreferences.discovery.targets}
      />
    </>
  )
}
