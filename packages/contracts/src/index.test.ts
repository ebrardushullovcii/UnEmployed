import { describe, expect, test } from 'vitest'
import {
  ApplicationStatusSchema,
  CandidateProfileSchema,
  applicationStatusValues
} from './index'

describe('contracts', () => {
  test('supports the full application status list', () => {
    expect(applicationStatusValues).toContain('submitted')
    expect(ApplicationStatusSchema.parse('interview')).toBe('interview')
  })

  test('parses a candidate profile', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_1',
      headline: 'Full-stack engineer',
      targetRoles: ['Frontend Engineer']
    })

    expect(profile.targetRoles).toEqual(['Frontend Engineer'])
    expect(profile.locations).toEqual([])
    expect(profile.skills).toEqual([])
  })
})

