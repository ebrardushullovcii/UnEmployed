import { useState } from 'react'
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  JobSearchPreferences,
  SourceAccessPrompt,
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
  actionState: { message: string | null }
  activeRun: DiscoveryRunRecord | null
  browserSession: BrowserSessionState
  discoverySessions: readonly DiscoveryAdapterSessionState[]
  isBrowserSessionPending: boolean
  isBrowserSessionPendingForTarget: (targetId: string) => boolean
  isDiscoveryAllPending: boolean
  isJobPending: (jobId: string) => boolean
  isTargetPending: (targetId: string) => boolean
  jobs: readonly SavedJob[]
  liveEvents: readonly DiscoveryActivityEvent[]
  onDismissJob: (jobId: string) => void
  onOpenBrowserSession: () => void
  onOpenBrowserSessionForTarget: (targetId: string) => void
  onQueueJob: (jobId: string) => void
  onRunAgentDiscovery: (() => void) | undefined
  onRunDiscoveryForTarget?: (targetId: string) => void
  onSelectJob: (jobId: string) => void
  recentRuns: readonly DiscoveryRunRecord[]
  searchPreferences: JobSearchPreferences
  selectedJob: SavedJob | null
  sourceAccessPrompts: readonly SourceAccessPrompt[]
}) {
  const {
    actionState,
    activeRun,
    browserSession,
    discoverySessions,
    isBrowserSessionPending,
    isBrowserSessionPendingForTarget,
    isDiscoveryAllPending,
    isJobPending,
    isTargetPending,
    jobs,
    liveEvents,
    onDismissJob,
    onOpenBrowserSession,
    onOpenBrowserSessionForTarget,
    onQueueJob,
    onRunAgentDiscovery,
    onSelectJob,
    recentRuns,
    searchPreferences,
    selectedJob,
    sourceAccessPrompts,
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
          title: 'No matches from this search',
          description:
            'Try broader roles, locations, or sources, then search again.'
        }
      : {
          title: 'Search blocked by browser',
          description:
            'Open the browser, sign in or fix the issue, then search again.'
        }

  const filtersPanel = (
    <DiscoveryFiltersPanel
      activeRun={activeRun}
      actionMessage={actionState.message}
      browserSession={browserSession}
      discoverySessions={discoverySessions}
      isBrowserSessionPending={isBrowserSessionPending}
      isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
      isDiscoveryAllPending={isDiscoveryAllPending}
      isTargetPending={isTargetPending}
      onOpenBrowserSession={onOpenBrowserSession}
      onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
      onRunAgentDiscovery={onRunAgentDiscovery}
      {...(props.onRunDiscoveryForTarget ? { onRunDiscoveryForTarget: props.onRunDiscoveryForTarget } : {})}
      onViewProgress={() => setShowHistory(true)}
      searchPreferences={searchPreferences}
      sourceAccessPrompts={sourceAccessPrompts}
    />
  )

  return (
    <>
      <LockedScreenLayout
        contentClassName="xl:overflow-hidden"
        topClassName="pb-(--gap-section) pt-8"
        topContent={(
          <PageHeader
            eyebrow="Find jobs"
            title="Find jobs"
            description="Search your saved roles and job sources, then review the strongest matches."
          />
        )}
      >
        {showEmptyDiscoveryState ? (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(23rem,25rem)_minmax(0,1fr)] xl:overflow-hidden">
            {filtersPanel}
            <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-5 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-6 xl:h-full xl:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Job results</p>
                <span className="inline-flex items-center rounded-(--radius-small) border border-border bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-(--tracking-heading) text-muted-foreground">0 jobs</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {configuredFilters.map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto pr-1">
                <EmptyState className="min-h-80" description={emptyStateContent.description} title={emptyStateContent.title} />
                <p className="max-w-176 text-(length:--text-description) leading-6 text-foreground-soft">Need better matches? Update roles, locations, or sources in Profile, then search again.</p>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem] xl:overflow-hidden 2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]">
            {filtersPanel}
            <DiscoveryResultsPanel
              browserSession={browserSession}
              jobs={jobs}
              onSelectJob={onSelectJob}
              selectedJob={selectedJob}
            />
            <DiscoveryDetailPanel
              discoveryTargets={searchPreferences.discovery.targets}
              isJobPending={isJobPending}
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
