import { describe, expect, it } from 'vitest'
import {
  formatProfileSetupReviewValue,
  isBlockingPendingReviewItem,
  isOptionalPendingReviewItem,
} from './profile-setup-screen-helpers'

describe('formatProfileSetupReviewValue', () => {
  it('renders serialized education records as readable details without internal ids', () => {
    const formatted = formatProfileSetupReviewValue(JSON.stringify({
      id: 'education_internal_1',
      schoolName: 'University of Prishtina',
      degree: 'Bachelor of Science',
      fieldOfStudy: 'Computer Science',
      location: 'Prishtina, Kosovo',
    }))

    expect(formatted).toBe(
      'School name: University of Prishtina · Degree: Bachelor of Science · Field of study: Computer Science · Location: Prishtina, Kosovo',
    )
    expect(formatted).not.toContain('education_internal_1')
    expect(formatted).not.toContain('{')
  })

  it('renders structured language values with human labels', () => {
    expect(formatProfileSetupReviewValue({
      id: 'language_internal_1',
      language: 'English',
      proficiency: 'fluent',
      interviewPreference: true,
    })).toBe('Language: English · Proficiency: fluent · Interview preference: Yes')
  })

  it('leaves ordinary text untouched and safely handles malformed JSON-like text', () => {
    expect(formatProfileSetupReviewValue('Senior Software Engineer')).toBe('Senior Software Engineer')
    expect(formatProfileSetupReviewValue('{not json')).toBe('{not json')
  })
})

describe('profile setup review priority', () => {
  it('keeps pending optional suggestions out of blocking counts', () => {
    const optionalItem = { severity: 'optional' as const, status: 'pending' as const }
    const recommendedItem = { severity: 'recommended' as const, status: 'pending' as const }
    const resolvedCriticalItem = { severity: 'critical' as const, status: 'confirmed' as const }

    expect(isOptionalPendingReviewItem(optionalItem)).toBe(true)
    expect(isBlockingPendingReviewItem(optionalItem)).toBe(false)
    expect(isBlockingPendingReviewItem(recommendedItem)).toBe(true)
    expect(isBlockingPendingReviewItem(resolvedCriticalItem)).toBe(false)
  })
})
