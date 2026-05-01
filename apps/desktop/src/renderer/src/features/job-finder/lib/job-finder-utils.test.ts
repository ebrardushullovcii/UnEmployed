// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'
import { jobDescriptionToText } from './job-description-text'
import { getDefaultProfileRoute } from './job-finder-utils'

describe('getDefaultProfileRoute', () => {
  test('routes fresh workspaces to guided setup by default', () => {
    expect(
      getDefaultProfileRoute({
        status: 'not_started',
        currentStep: 'import',
        completedAt: null,
        reviewItems: [],
        lastResumedAt: null,
      })
    ).toBe('/job-finder/profile/setup')
  })

  test('allows explicitly opening the full profile during fresh setup', () => {
    expect(
      getDefaultProfileRoute(
        {
          status: 'not_started',
          currentStep: 'import',
          completedAt: null,
          reviewItems: [],
          lastResumedAt: null,
        },
        { forceFullProfile: true }
      )
    ).toBe('/job-finder/profile')
  })

  test('keeps in-progress and completed setup on the full profile route', () => {
    expect(
      getDefaultProfileRoute({
        status: 'in_progress',
        currentStep: 'background',
        completedAt: null,
        reviewItems: [],
        lastResumedAt: null,
      })
    ).toBe('/job-finder/profile')

    expect(
      getDefaultProfileRoute({
        status: 'completed',
        currentStep: 'ready_check',
        completedAt: '2026-04-15T00:00:00.000Z',
        reviewItems: [],
        lastResumedAt: '2026-04-15T00:00:00.000Z',
      })
    ).toBe('/job-finder/profile')
  })
})

describe('jobDescriptionToText', () => {
  test('strips encoded html markup from stored job descriptions', () => {
    expect(
      jobDescriptionToText(
        '&lt;div class="content-intro"&gt;&lt;h2&gt;&lt;strong&gt;About Remote&lt;/strong&gt;&lt;/h2&gt;&lt;div&gt;Remote is solving modern organizations&apos; biggest challenge.&lt;/div&gt;&lt;/div&gt;'
      )
    ).toBe('About Remote Remote is solving modern organizations\' biggest challenge.')
  })
})
