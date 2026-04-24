import { describe, expect, test, vi } from 'vitest'
import type { Page } from 'playwright'

import { createConfig } from '../agent.test-fixtures'
import { buildStructuredCandidateJobs } from './job-extraction'
import { detectSeededSearchQueryDrift, restoreSeededQuerySurfaceIfNeeded } from './tool-execution'
import type { AgentState } from '../types'

function createState(): AgentState {
  return {
    conversation: [],
    reviewTranscript: [],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    failedInteractionAttempts: new Map([
      ['navigate:placeholder', { count: 1, lastError: 'placeholder drift' }],
    ]),
    failedInteractionPageStateToken: 'stale-page',
    visitedUrls: new Set(['https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo']),
    stepCount: 1,
    currentUrl: 'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    lastStableUrl: 'https://jobs.example.com/search?location=Prishtina%2C+Kosovo&keywords=Senior+Full-Stack+Software+Engineer',
    isRunning: true,
    phaseEvidence: {
      visibleControls: [],
      successfulInteractions: [],
      routeSignals: [],
      attemptedControls: [],
      warnings: [],
    },
    compactionState: null,
    compactionStatus: {
      lastTriggerKind: null,
      usedMessageCountFallback: false,
      lastEstimatedTokensBefore: null,
      lastEstimatedTokensAfter: null,
    },
  }
}

describe('deferred search-surface card identity', () => {
  test('keeps distinct seeded-search fallback cards when merging repeated captures of the same results page', () => {
    const pageUrl =
      'https://www.linkedin.com/jobs/search/?keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo'

    const mergedCardCandidates = [
      {
        canonicalUrl: pageUrl,
        anchorText: 'Senior Frontend Engineer',
        headingText: 'Senior Frontend Engineer',
        lines: ['Senior Frontend Engineer', 'Fresha', 'Prishtina (On-site)'],
      },
      {
        canonicalUrl: pageUrl,
        anchorText: 'Full Stack Developer (AI-First)',
        headingText: 'Full Stack Developer (AI-First)',
        lines: [
          'Full Stack Developer (AI-First)',
          'Full Circle Agency',
          'Prishtina (Remote)',
          'Dismiss Full Stack Developer (AI-First) job',
        ],
      },
    ]

    const jobs = buildStructuredCandidateJobs({
      pageUrl,
      maxJobs: 5,
      cardCandidates: mergedCardCandidates,
      searchPreferences: {
        targetRoles: ['Senior Full-Stack Software Engineer'],
        locations: ['Prishtina, Kosovo'],
      },
    })

    expect(jobs).toHaveLength(2)
    expect(jobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Senior Frontend Engineer' }),
        expect.objectContaining({ title: 'Full Stack Developer (AI-First)' }),
      ]),
    )
  })
})

describe('seeded search query guard', () => {
  test('blocks broader search urls after the seeded query already produced evidence', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    config.searchPreferences = {
      targetRoles: ['Senior Full-Stack Software Engineer'],
      locations: ['Prishtina, Kosovo'],
    }
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map([
            ['seed', { key: 'seed', pageUrl: seededUrl, pageText: '...', capturedAt: '2026-04-21T00:00:00.000Z' }],
          ]),
        },
        url: 'https://jobs.example.com/search?keywords=Software%20Engineer&location=Kosovo',
        previousUrl: seededUrl,
      }),
    ).toContain('Blocked a broader seeded query')
  })

  test('allows equivalent search urls that keep the seeded role and location intent', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    config.searchPreferences = {
      targetRoles: ['Senior Full-Stack Software Engineer'],
      locations: ['Prishtina, Kosovo'],
    }
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map([
            ['seed', { key: 'seed', pageUrl: seededUrl, pageText: '...', capturedAt: '2026-04-21T00:00:00.000Z' }],
          ]),
        },
        url: 'https://jobs.example.com/search?currentJobId=4404542575&keywords=Senior%20Full-Stack%20Software%20Engineer&location=Prishtina%2C%20Kosovo',
        previousUrl: seededUrl,
      }),
    ).toBeNull()
  })

  test('does not block broader seeded-query rewrites before any evidence exists', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map(),
        },
        url: 'https://jobs.example.com/search?keywords=Software%20Engineer&location=Kosovo',
        previousUrl: 'https://jobs.example.com/feed/',
      }),
    ).toBeNull()
  })

  test('blocks placeholder search urls before any evidence exists', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map(),
        },
        url: 'https://jobs.example.com/search?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE',
        previousUrl: seededUrl,
      }),
    ).toContain('placeholder query values')
  })

  test('ignores placeholder starting urls when choosing the seeded query', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=JOB_TITLE&geoId=GEO_ID',
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map(),
        },
        url: 'https://jobs.example.com/search?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE',
        previousUrl: 'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
      }),
    ).toContain('placeholder query values')
  })

  test('blocks leaving the seeded search surface before extraction evidence exists', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map(),
        },
        previousUrl: seededUrl,
        url: 'https://jobs.example.com/jobs/',
      }),
    ).toContain('Blocked a route change away from the seeded search results before extraction proved that the seeded route was insufficient')
  })

  test('blocks leaving the seeded search surface after evidence exists', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    config.searchPreferences = {
      targetRoles: ['Senior Full-Stack Software Engineer'],
      locations: ['Prishtina, Kosovo'],
    }
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map([
            ['seed', { key: 'seed', pageUrl: seededUrl, pageText: '...', capturedAt: '2026-04-21T00:00:00.000Z' }],
          ]),
        },
        url: 'https://jobs.example.com/jobs/collections/remote-jobs/?currentJobId=4384607994&discover=true',
        previousUrl: seededUrl,
      }),
    ).toContain('Blocked a route change away from the seeded search results')
  })

  test('blocks equivalent-looking search-result routes that drop seeded location evidence', () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    config.searchPreferences = {
      targetRoles: ['Senior Full-Stack Software Engineer'],
      locations: ['Prishtina, Kosovo'],
    }
    const seededUrl = config.startingUrls[0] ?? ''

    expect(
      detectSeededSearchQueryDrift({
        config,
        state: {
          collectedJobs: [],
          deferredSearchExtractions: new Map([
            ['seed', { key: 'seed', pageUrl: seededUrl, pageText: '...', capturedAt: '2026-04-21T00:00:00.000Z' }],
          ]),
        },
        url: 'https://jobs.example.com/search-results?currentJobId=4404574355&geoId=104640522&keywords=Senior%20Full-Stack%20Software%20Engineer&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&refresh=true',
        previousUrl: seededUrl,
      }),
    ).toContain('Blocked a broader seeded query')
  })

  test('keeps state unchanged when seeded-query restore still lands on a drifting route', async () => {
    const config = createConfig()
    config.startingUrls = [
      'https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
    ]
    config.navigationPolicy = {
      allowedHostnames: ['jobs.example.com'],
    }
    const state = createState()
    let pageUrl = 'https://jobs.example.com/search?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE'
    const goto = vi.fn<NonNullable<Page['goto']>>(async () => {
      pageUrl = 'https://jobs.example.com/search?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE'
      return null
    })
    const page: Partial<Page> = {
      goto,
      url: () => pageUrl,
    }

    const result = await restoreSeededQuerySurfaceIfNeeded({
      pageRef: { current: page as Page },
      state,
      config,
    })

    expect(result?.restoredUrl).toBeNull()
    expect(goto).toHaveBeenCalledTimes(2)
    expect(state.currentUrl).toBe('https://jobs.example.com/search?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo')
    expect(state.lastStableUrl).toBe('https://jobs.example.com/search?location=Prishtina%2C+Kosovo&keywords=Senior+Full-Stack+Software+Engineer')
    expect(state.failedInteractionAttempts?.size).toBe(1)
    expect(state.failedInteractionPageStateToken).toBe('stale-page')
  })
})
