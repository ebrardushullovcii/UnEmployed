// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PROFILE_SECTION_SCROLL_AREA_ID,
  focusProfileDeepLink,
} from './profile-deep-link-focus'

describe('focusProfileDeepLink', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('resets the page and reveals the exact job-sources section inside Preferences', () => {
    document.body.innerHTML = `
      <div class="screen-scroll-area">
        <div id="${PROFILE_SECTION_SCROLL_AREA_ID}">
          <article id="profile-job-sources">
            <h3 id="profile-job-sources-heading" tabindex="-1">Job sources</h3>
          </article>
        </div>
      </div>
    `
    const pageScroller = document.querySelector<HTMLElement>('.screen-scroll-area')
    const sectionScroller = document.getElementById(PROFILE_SECTION_SCROLL_AREA_ID)
    const section = document.getElementById('profile-job-sources')
    const heading = document.getElementById('profile-job-sources-heading')

    if (!pageScroller || !sectionScroller || !section || !heading) {
      throw new Error('Expected the Profile deep-link test fixture to render')
    }

    const pageScrollTo = vi.fn()
    const sectionScrollTo = vi.fn()
    pageScroller.scrollTo = pageScrollTo
    sectionScroller.scrollTo = sectionScrollTo
    sectionScroller.scrollTop = 120
    vi.spyOn(sectionScroller, 'getBoundingClientRect').mockReturnValue({ top: 200 } as DOMRect)
    vi.spyOn(section, 'getBoundingClientRect').mockReturnValue({ top: 680 } as DOMRect)

    expect(focusProfileDeepLink('job-sources')).toBe(true)
    expect(pageScrollTo).toHaveBeenCalledWith({ behavior: 'auto', left: 0, top: 0 })
    expect(sectionScrollTo).toHaveBeenCalledWith({ behavior: 'auto', left: 0, top: 584 })
    expect(document.activeElement).toBe(heading)
  })

  it('waits when the requested Preferences content has not rendered yet', () => {
    expect(focusProfileDeepLink('target-roles')).toBe(false)
  })
})
