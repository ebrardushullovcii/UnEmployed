import { describe, expect, it } from 'vitest'
import { getCustomerFacingApplyText } from './applications-detail-panel-helpers'

describe('getCustomerFacingApplyText', () => {
  it('keeps transport implementation language out of retained customer history', () => {
    const resumeMessage = getCustomerFacingApplyText(
      'Prepare-only guard blocked a POST xhr attempt while the resume upload was running.',
    )
    const genericMessage = getCustomerFacingApplyText(
      'Prepare-only guard blocked a mutating page action.',
    )

    expect(resumeMessage).toContain('selected CV could not be attached')
    expect(genericMessage).toContain('could not safely save this prepared step')
    expect(`${resumeMessage} ${genericMessage}`).not.toMatch(/POST|XHR|mutating page action/i)
  })

  it('preserves already customer-readable messages', () => {
    expect(getCustomerFacingApplyText('Resume attachment needs your help')).toBe(
      'Resume attachment needs your help',
    )
  })
})
