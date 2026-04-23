import { describe, expect, test } from 'vitest'

import { getSearchResultsExtractionReviewBudget } from './search-results-budget'

describe('getSearchResultsExtractionReviewBudget', () => {
  test('keeps the wider seeded LinkedIn review budget for query-first search routes', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: [
          'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
        ],
        promptContext: {
          siteLabel: 'LinkedIn Jobs',
        },
        targetJobCount: 8,
      }),
    ).toBe(16)
  })

  test('widens review budget for weak same-host non-provider boards', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 8,
      }),
    ).toBe(16)
  })

  test('widens review budget for standard mixed-run weak-board targets too', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 4,
      }),
    ).toBe(16)
  })

  test('scales seeded LinkedIn review budget up with larger discovery targets', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: [
          'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
        ],
        promptContext: {
          siteLabel: 'LinkedIn Jobs',
        },
        targetJobCount: 12,
      }),
    ).toBe(16)
  })

  test('scales weak-board review budget up with larger discovery targets', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 14,
      }),
    ).toBe(16)
  })

  test('does not widen review budget for phase-driven runs', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
          taskPacket: {
            phaseGoal: 'Probe search controls.',
            knownFacts: [],
            avoidStrategyFingerprints: [],
            successCriteria: [],
            stopConditions: [],
          },
        },
        targetJobCount: 8,
      }),
    ).toBeNull()
  })

  test('does not widen review budget for small discovery targets', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 3,
      }),
    ).toBeNull()
  })
})
