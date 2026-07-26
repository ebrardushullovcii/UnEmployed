// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PROFILE_SETUP_STEP_HEADING_ID,
  resetProfileSetupStepView,
} from './profile-setup-step-focus'

describe('resetProfileSetupStepView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('resets the setup scroller and focuses the new step heading without scrolling it away', () => {
    document.body.innerHTML = `
      <div class="screen-scroll-area">
        <div>
          <h2 id="${PROFILE_SETUP_STEP_HEADING_ID}" tabindex="-1">Background setup step</h2>
        </div>
      </div>
    `
    const scrollContainer = document.querySelector<HTMLElement>('.screen-scroll-area')
    const stepHeading = document.getElementById(PROFILE_SETUP_STEP_HEADING_ID)
    const scrollTo = vi.fn()

    if (!scrollContainer || !stepHeading) {
      throw new Error('Expected the setup test fixture to render')
    }

    scrollContainer.scrollTop = 640
    scrollContainer.scrollTo = scrollTo

    expect(resetProfileSetupStepView()).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', left: 0, top: 0 })
    expect(document.activeElement).toBe(stepHeading)
  })

  it('does nothing when the setup step is not mounted', () => {
    expect(resetProfileSetupStepView()).toBe(false)
  })
})
