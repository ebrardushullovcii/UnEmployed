import { describe, expect, test } from 'vitest'
import { CandidateProfileSchema } from '@unemployed/contracts'
import { buildProfilePayload, createProfileEditorValues } from './profile-editor'

function createProfile() {
  return CandidateProfileSchema.parse({
    id: 'candidate_1',
    firstName: 'Alex',
    lastName: 'Vanguard',
    fullName: 'Alex Vanguard',
    headline: 'Senior systems designer',
    summary: 'Builds resilient workflows.',
    currentLocation: 'London, UK',
    yearsExperience: 10,
    email: 'alex@example.com',
    phone: '+44 7700 900123',
    baseResume: {
      id: 'resume_1',
      fileName: 'alex-vanguard.txt',
      uploadedAt: '2026-03-20T10:00:00.000Z'
    },
    workEligibility: {},
    professionalSummary: {},
    targetRoles: ['Principal Designer'],
    locations: ['Remote'],
    skills: ['Figma'],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: []
  })
}

describe('profile editor application identity defaults', () => {
  test('keeps application contact overrides null when the user is only inheriting main contact info', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile)
    const result = buildProfilePayload(profile, values)

    expect(result.payload?.applicationIdentity.preferredEmail).toBeNull()
    expect(result.payload?.applicationIdentity.preferredPhone).toBeNull()
  })

  test('persists explicit application contact overrides when the user enters them', () => {
    const profile = createProfile()
    const values = createProfileEditorValues(profile)

    values.applicationIdentity.preferredEmail = 'apply@example.com'
    values.applicationIdentity.preferredPhone = '+44 7000 000999'

    const result = buildProfilePayload(profile, values)

    expect(result.payload?.applicationIdentity.preferredEmail).toBe('apply@example.com')
    expect(result.payload?.applicationIdentity.preferredPhone).toBe('+44 7000 000999')
  })
})
