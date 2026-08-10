import { describe, expect, it } from 'vitest'
import { getProfileSetupScrollBehavior } from './profile-setup-screen-actions'

describe('getProfileSetupScrollBehavior', () => {
  it('avoids smooth scrolling when reduced motion is requested', () => {
    const reducedMotionWindow = {
      matchMedia: () => ({ matches: true }),
    }
    const standardWindow = {
      matchMedia: () => ({ matches: false }),
    }

    expect(getProfileSetupScrollBehavior(reducedMotionWindow)).toBe('auto')
    expect(getProfileSetupScrollBehavior(standardWindow)).toBe('smooth')
  })
})
