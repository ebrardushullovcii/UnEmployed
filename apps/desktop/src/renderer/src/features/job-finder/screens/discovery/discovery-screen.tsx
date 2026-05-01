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
import { LockedScreenLayout } from '@renderer/features/job-finder/components/locked-screen-layout'
import { PageHeader } from '@renderer/features/job-finder/components/page-header'
import { JOB_FINDER_ROUTE_HREFS } from '@renderer/features/job-finder/lib/job-finder-route-hrefs'
import { formatCountLabel } from '@renderer/features/job-finder/lib/job-finder-utils'
import { DiscoveryHistoryModal } from './discovery-activity-panel'
import { DiscoveryDetailPanel } from './discovery-detail-panel'
import { DiscoveryFiltersPanel } from './discovery-filters-panel'
import { DiscoveryResultsPanel } from './discovery-results-panel'

export function getDiscoveryConfiguredFilters(searchPreferences: JobSearchPreferences) {
  const enabledSourceCount = searchPreferences.discovery.targets.filter(
    (target) => target.enabled,
  ).length
  const searchTargetCount =
    searchPreferences.targetRoles.length + searchPreferences.jobFamilies.length

  return [
    formatCountLabel(searchTargetCount, 'search target'),
    formatCountLabel(searchPreferences.locations.length, 'location'),
    formatCountLabel(searchPreferences.workModes.length, 'work mode'),
    formatCountLabel(enabledSourceCount, 'source'),
  ]
}

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
  const enabledTargetIds = new Set(
    searchPreferences.discovery.targets
      .filter((target) => target.enabled)
      .map((target) => target.id),
  )
  const enabledSourceAccessPrompts = sourceAccessPrompts.filter((prompt) =>
    enabledTargetIds.has(prompt.targetId),
  )
  const primarySourceAccessPrompt =
    enabledSourceAccessPrompts.find(
      (prompt) => prompt.state === 'prompt_login_required',
    ) ?? enabledSourceAccessPrompts[0] ?? null
  const primaryRecoveryAction =
    browserSession.status === 'ready'
      ? null
      : primarySourceAccessPrompt
        ? {
            label: primarySourceAccessPrompt.actionLabel,
            pending: isBrowserSessionPendingForTarget(
              primarySourceAccessPrompt.targetId,
            ),
            nextStep: primarySourceAccessPrompt.rerunLabel
              ? `Then ${primarySourceAccessPrompt.rerunLabel}.`
              : 'Then search again.',
            onAction: () =>
              onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId),
          }
        : {
            label:
              browserSession.status === 'blocked'
                ? 'Open browser to recover'
                : 'Open browser to sign in',
            pending: isBrowserSessionPending,
            nextStep: 'Then search again.',
            onAction: onOpenBrowserSession,
          }
  const configuredFilters = getDiscoveryConfiguredFilters(searchPreferences)
  const hasSearchRoles =
    searchPreferences.targetRoles.length > 0 || searchPreferences.jobFamilies.length > 0
  const hasEnabledSources = enabledTargetIds.size > 0
  const hasLocations = searchPreferences.locations.length > 0
  const searchSetupBlocker = showEmptyDiscoveryState && (!hasSearchRoles || !hasEnabledSources)
    ? {
        title:
          !hasSearchRoles && !hasEnabledSources
            ? 'Set your search before you start the browser'
            : !hasSearchRoles
              ? 'Add a target role before searching'
              : 'Choose at least one source before searching',
        description:
          !hasSearchRoles && !hasEnabledSources
            ? 'Add at least one role and one enabled source in Profile so Find jobs knows what to search for.'
            : !hasSearchRoles
              ? 'Add at least one target role in Profile so Find jobs can aim the next search.'
              : 'Enable at least one source in Profile so Find jobs has somewhere to search.',
        actionLabel: 'Edit search in Profile',
        actionHref: JOB_FINDER_ROUTE_HREFS.profile,
        nextStep: hasLocations
          ? 'Then search again.'
          : 'Then add locations if you want tighter matches and search again.',
      }
    : null

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

  const recoveryActionProps = primaryRecoveryAction
    ? {
        onRecoveryAction: primaryRecoveryAction.onAction,
        recoveryActionLabel: primaryRecoveryAction.label,
        recoveryActionNextStep: primaryRecoveryAction.nextStep,
        recoveryActionPending: primaryRecoveryAction.pending
      }
    : {}

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
            <section className="surface-panel-shell order-1 relative flex min-h-124 min-w-0 flex-col gap-5 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-6 xl:order-2 xl:h-full xl:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">Job results</p>
                <span className="inline-flex items-center rounded-(--radius-small) border border-border bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-(--tracking-heading) text-muted-foreground">0 jobs</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {configuredFilters.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto pr-1">
                <DiscoveryResultsPanel
                  browserSession={browserSession}
                  emptyClassName="min-h-80"
                  jobs={jobs}
                  onSelectJob={onSelectJob}
                  searchSetupBlocker={searchSetupBlocker}
                  selectedJob={selectedJob}
                  {...recoveryActionProps}
                />
                <p className="max-w-176 text-(length:--text-description) leading-6 text-foreground-soft">
                  Need better matches? Update roles, locations, or sources in Profile, then search again.
                </p>
              </div>
            </section>
            <div className="order-2 min-h-0 min-w-0 xl:order-1">{filtersPanel}</div>
          </div>
        ) : (
          <div className="grid min-h-124 min-w-0 items-stretch gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem] xl:overflow-hidden 2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]">
            <div className="order-2 min-h-0 min-w-0 xl:order-1">{filtersPanel}</div>
            <div className="order-1 min-h-0 min-w-0 xl:order-2">
              <DiscoveryResultsPanel
                browserSession={browserSession}
                jobs={jobs}
                onSelectJob={onSelectJob}
                searchSetupBlocker={searchSetupBlocker}
                selectedJob={selectedJob}
                {...recoveryActionProps}
              />
            </div>
            <div className="order-3 min-h-0 min-w-0 xl:order-3">
              <DiscoveryDetailPanel
                discoveryTargets={searchPreferences.discovery.targets}
                isJobPending={isJobPending}
                onDismissJob={onDismissJob}
                onQueueJob={onQueueJob}
                selectedJob={selectedJob}
              />
            </div>
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
