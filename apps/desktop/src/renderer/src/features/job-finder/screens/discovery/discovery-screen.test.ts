import { describe, expect, it } from 'vitest'
import type { JobSearchPreferences } from '@unemployed/contracts'
import { getDiscoveryConfiguredFilters } from './discovery-screen'

function createSearchPreferences(overrides: Partial<JobSearchPreferences> = {}): JobSearchPreferences {
  return {
    targetRoles: [],
    jobFamilies: [],
    locations: [],
    excludedLocations: [],
    workModes: [],
    seniorityLevels: [],
    targetIndustries: [],
    targetCompanyStages: [],
    employmentTypes: [],
    minimumSalaryUsd: null,
    targetSalaryUsd: null,
    salaryCurrency: 'USD',
    approvalMode: 'review_before_submit',
    tailoringMode: 'balanced',
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      historyLimit: 5,
      targets: [],
    },
    ...overrides,
  }
}

describe('getDiscoveryConfiguredFilters', () => {
  it('counts enabled sources instead of all configured sources', () => {
    const filters = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [
            {
              id: 'enabled',
              label: 'Enabled',
              startingUrl: 'https://enabled.example/jobs',
              enabled: true,
              adapterKind: 'auto',
              customInstructions: null,
              instructionStatus: 'draft',
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            },
            {
              id: 'disabled',
              label: 'Disabled',
              startingUrl: 'https://disabled.example/jobs',
              enabled: false,
              adapterKind: 'auto',
              customInstructions: null,
              instructionStatus: 'draft',
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            },
          ],
        },
      }),
    )

    expect(filters).toContain('1 source')
    expect(filters).not.toContain('2 sources')
  })

  it('treats job families as valid search targets for filter badges', () => {
    const filters = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        jobFamilies: ['Frontend Engineering'],
      }),
    )

    expect(filters).toContain('1 search target')
    expect(filters).not.toContain('0 search targets')
  })
})
