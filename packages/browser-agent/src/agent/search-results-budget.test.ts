import { describe, expect, test } from 'vitest'

import { getSearchResultsExtractionReviewBudget } from './search-results-budget'

describe('getSearchResultsExtractionReviewBudget', () => {
  test('keeps the wider seeded-query review budget for query-first search routes', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: [
          'https://example.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
        ],
        promptContext: {
          siteLabel: 'Example Jobs',
        },
        targetJobCount: 8,
      }),
    ).toBe(8)
  })

  test('widens review budget for weak same-host non-provider boards', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 8,
        weakSameHostBoard: true,
      }),
    ).toBe(8)
  })

  test('widens review budget for standard mixed-run weak-board targets too', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 4,
        weakSameHostBoard: true,
      }),
    ).toBe(4)
  })

  test('scales seeded-query review budget up with larger discovery targets below the cap', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: [
          'https://example.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
        ],
        promptContext: {
          siteLabel: 'Example Jobs',
        },
        targetJobCount: 10,
      }),
    ).toBe(10)
  })

  test('scales weak-board review budget up with larger discovery targets below the cap', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://kosovajob.com/'],
        promptContext: {
          siteLabel: 'KosovaJob',
        },
        targetJobCount: 10,
        weakSameHostBoard: true,
      }),
    ).toBe(10)
  })

  test('does not widen review budget for normal provider board runs', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://jobs.lever.co/example-company'],
        promptContext: {
          siteLabel: 'Example Lever',
        },
        targetJobCount: 8,
      }),
    ).toBeNull()
  })

  test('does not widen review budget for a single host without an explicit weak-board flag', () => {
    expect(
      getSearchResultsExtractionReviewBudget({
        startingUrls: ['https://jobs.example.com/'],
        promptContext: {
          siteLabel: 'Example Jobs',
        },
        targetJobCount: 8,
      }),
    ).toBeNull()
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
        weakSameHostBoard: true,
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
