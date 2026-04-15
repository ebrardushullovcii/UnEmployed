import type { ProfileSetupState } from '@unemployed/contracts'
import { describe, expect, it } from 'vitest'
import { buildProfileSectionStarterQuestion } from './profile-copilot-prompts'

describe('buildProfileSectionStarterQuestion', () => {
  it('scopes starter questions to the active profile section', () => {
    const reviewItems: ProfileSetupState['reviewItems'] = [
      {
        id: 'headline',
        createdAt: '2026-04-15T09:00:00.000Z',
        label: 'Headline',
        proposedValue: null,
        reason: 'Missing headline',
        resolvedAt: null,
        severity: 'critical',
        sourceCandidateId: null,
        sourceRunId: null,
        sourceSnippet: null,
        status: 'pending',
        step: 'essentials',
        target: { domain: 'identity', key: 'headline', recordId: null },
      },
      {
        id: 'target-roles',
        createdAt: '2026-04-15T08:00:00.000Z',
        label: 'Target roles',
        proposedValue: null,
        reason: 'Missing target roles',
        resolvedAt: null,
        severity: 'recommended',
        sourceCandidateId: null,
        sourceRunId: null,
        sourceSnippet: null,
        status: 'pending',
        step: 'targeting',
        target: { domain: 'search_preferences', key: 'targetRoles', recordId: null },
      },
    ]

    expect(buildProfileSectionStarterQuestion(reviewItems, 'preferences')).toBe(
      'What target role or roles should I use for your job search?',
    )
    expect(buildProfileSectionStarterQuestion(reviewItems, 'basics')).toBe(
      'What headline should I save on your profile?',
    )
  })
})
