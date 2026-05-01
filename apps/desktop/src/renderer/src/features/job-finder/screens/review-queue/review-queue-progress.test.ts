import { describe, expect, it } from 'vitest'
import { getDisplayedResumeProgress, getNextDisplayedResumeProgress } from './review-queue-progress'

describe('review queue progress helpers', () => {
  it('shows a minimum optimistic progress value while a job is pending', () => {
    expect(getDisplayedResumeProgress(null, true)).toBe(8)
  })

  it('preserves stored progress when it is already ahead of the optimistic floor', () => {
    expect(getDisplayedResumeProgress({ progressPercent: 42 } as never, true)).toBe(42)
  })

  it('eases progress upward without reaching completion early', () => {
    expect(getNextDisplayedResumeProgress(8)).toBeGreaterThan(8)
    expect(getNextDisplayedResumeProgress(94)).toBe(94)
    expect(getNextDisplayedResumeProgress(99)).toBe(94)
  })
})
