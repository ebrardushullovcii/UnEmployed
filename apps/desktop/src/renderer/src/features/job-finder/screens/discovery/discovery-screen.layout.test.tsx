// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import type { BrowserSessionState, JobSearchPreferences, SavedJob } from '@unemployed/contracts'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/features/job-finder/components/locked-screen-layout', () => ({
  LockedScreenLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}))
vi.mock('./discovery-activity-panel', () => ({
  DiscoveryHistoryModal: () => null
}))
vi.mock('./discovery-detail-panel', () => ({
  DiscoveryDetailPanel: () => <section aria-label="Job details">Job details</section>
}))
vi.mock('./discovery-filters-panel', () => ({
  DiscoveryFiltersPanel: () => <section aria-label="Current search">Current search</section>
}))
vi.mock('./discovery-results-panel', () => ({
  DiscoveryResultsPanel: () => <section aria-label="Job results">Job results</section>
}))

import { DiscoveryScreen } from './discovery-screen'

const browserSession = {
  source: 'target_site',
  status: 'ready',
  driver: 'chrome_profile_agent',
  label: 'Browser ready',
  detail: 'Browser session is ready.',
  lastCheckedAt: '2026-07-31T10:00:00.000Z'
} as BrowserSessionState

const searchPreferences: JobSearchPreferences = {
  targetRoles: ['Software Engineer'],
  jobFamilies: [],
  locations: ['Remote'],
  excludedLocations: [],
  workModes: ['remote'],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: 'USD',
  compensation: {
    minimum: null,
    maximum: null,
    interval: 'year',
    currency: 'USD',
    currencyStatus: 'inherited'
  },
  approvalMode: 'review_before_submit',
  tailoringMode: 'balanced',
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: {
    historyLimit: 5,
    targets: []
  }
}

function createJob(id: string, recommendation: SavedJob['matchAssessment']['recommendation']): SavedJob {
  return {
    id,
    matchAssessment: { recommendation }
  } as unknown as SavedJob
}

function renderEstablishedResults() {
  const selectedJob = createJob('strong', 'strong_fit')
  const hiddenMismatch = createJob('mismatch', 'skip')

  render(
    <DiscoveryScreen
      actionState={{ message: null }}
      activeRun={null}
      browserSession={browserSession}
      discoverySessions={[]}
      isBrowserSessionPending={false}
      isBrowserSessionPendingForTarget={() => false}
      isDiscoveryAllPending={false}
      isJobPending={() => false}
      isTargetPending={() => false}
      jobs={[selectedJob, hiddenMismatch]}
      dismissedJobs={[]}
      liveEvents={[]}
      onDismissJob={vi.fn()}
      onRestoreDismissedJob={vi.fn()}
      onOpenBrowserSession={vi.fn()}
      onOpenBrowserSessionForTarget={vi.fn()}
      onQueueJob={vi.fn()}
      onRunAgentDiscovery={vi.fn()}
      onSelectJob={vi.fn()}
      recentRuns={[]}
      searchPreferences={searchPreferences}
      selectedJob={selectedJob}
      sourceAccessPrompts={[]}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe('DiscoveryScreen established-results layout', () => {
  it('keeps the search controls in the first desktop column before and after results load', () => {
    renderEstablishedResults()

    const resultsPane = screen.getByRole('region', {
      name: 'Job results'
    }).parentElement
    const searchPane = screen.getByRole('region', {
      name: 'Current search'
    }).parentElement
    const detailsPane = screen.getByRole('region', {
      name: 'Job details'
    }).parentElement

    if (!resultsPane || !searchPane || !detailsPane) {
      throw new Error('Expected all three established discovery panes.')
    }
    const layout = resultsPane.parentElement
    if (!layout) {
      throw new Error('Expected the established discovery grid.')
    }

    expect(Array.from(layout.children)).toEqual([searchPane, resultsPane, detailsPane])
    expect(layout.className).toContain('xl:grid-cols-[minmax(22rem,24rem)_minmax(24rem,1fr)_23rem]')
    expect(layout.className).toContain('2xl:grid-cols-[minmax(23rem,25rem)_minmax(28rem,1fr)_24rem]')
    for (const pane of [resultsPane, searchPane, detailsPane]) {
      expect(pane.className).not.toMatch(/(?:^|\s)(?:\w+:)?order-/u)
    }
  })
})
