import type { Page } from 'playwright'
import { describe, expect, test, vi } from 'vitest'
import { interactionTools } from './interaction-tools'

describe('select_option', () => {
  test('fails safely instead of selecting an arbitrary combobox option', async () => {
    const popupOptions = {
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn()
    }
    const fallbackOptions = {
      count: vi.fn().mockResolvedValue(0),
      first: vi.fn()
    }
    const popupScope = {
      getByRole: vi.fn(() => popupOptions),
      locator: vi.fn(() => ({
        filter: vi.fn(() => fallbackOptions)
      }))
    }
    const inputLocator = {
      count: vi.fn().mockResolvedValue(1),
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined)
    }
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: false,
          controlType: 'combobox',
          popupId: 'location-popup'
        })
      }),
      click: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(() => ({
        first: () => inputLocator
      })),
      evaluate: vi.fn().mockResolvedValue({
        selectedLabel: 'Hybrid',
        selectedValue: 'Hybrid'
      }),
      press: vi.fn().mockResolvedValue(undefined)
    }
    locator.nth.mockReturnValue(locator)

    const keyboardPress = vi.fn().mockResolvedValue(undefined)
    const page = {
      getByRole: vi.fn(() => locator),
      locator: vi.fn(() => popupScope),
      keyboard: {
        press: keyboardPress,
        type: vi.fn().mockResolvedValue(undefined)
      },
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'select_option')
    if (!tool) {
      throw new Error('select_option tool is not registered')
    }

    const result = await tool.execute(
      {
        role: 'combobox',
        name: 'Location',
        optionText: 'Remote',
        index: 0,
        submit: false
      },
      {
        page,
        state: {
          currentUrl: 'https://example.com/jobs',
          visitedUrls: new Set<string>()
        } as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Option "Remote" was not found',
      data: expect.objectContaining({
        role: 'combobox',
        name: 'Location',
        index: 0,
        optionText: 'Remote',
        selectedLabel: 'Hybrid',
        selectedValue: 'Hybrid'
      })
    })
    expect(keyboardPress).not.toHaveBeenCalled()
  })
})

describe('click', () => {
  test('fails fast when no matching role and name are present', async () => {
    const exactLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const looseLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const page = {
      getByRole: vi.fn((_role, options) => options?.exact ? exactLocator : looseLocator),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const result = await tool.execute(
      {
        role: 'link',
        name: 'Senior Next.js Developer',
        index: 0
      },
      {
        page,
        state: {
          currentUrl: 'https://example.com/jobs',
          visitedUrls: new Set<string>()
        } as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'No link matched accessible name "Senior Next.js Developer".',
      data: expect.objectContaining({
        role: 'link',
        name: 'Senior Next.js Developer',
        index: 0,
        errorType: 'click_failed'
      })
    })
  })

  test('falls back to navigating the href directly when a matching link stays hidden', async () => {
    const hiddenLocator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(false),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue('/jobs/123'),
      textContent: vi.fn().mockResolvedValue('Customer Experience Specialist')
    }
    hiddenLocator.nth.mockReturnValue(hiddenLocator)

    let currentUrl = 'https://example.com/jobs'
    const page = {
      getByRole: vi.fn(() => hiddenLocator),
      goto: vi.fn(async (url: string) => {
        currentUrl = url
        return null
      }),
      url: vi.fn(() => currentUrl),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['click::clickable::customer experience specialist::0', {
          count: 1,
          lastError: 'No link matched accessible name "Customer Experience Specialist".'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'link',
        name: 'Customer Experience Specialist',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(page.goto).toHaveBeenCalledWith('https://example.com/jobs/123', {
      waitUntil: 'domcontentloaded',
      timeout: 5000
    })
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        navigated: true,
        newUrl: 'https://example.com/jobs/123',
        navigationMethod: 'href_fallback'
      })
    })
    expect(state.currentUrl).toBe('https://example.com/jobs/123')
    expect(state.failedInteractionAttempts.size).toBe(0)
  })

  test('fails safely when href fallback redirects off the allowlist and recovers to the prior page', async () => {
    const hiddenLocator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(false),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue('/jobs/redirector'),
      textContent: vi.fn().mockResolvedValue('Customer Experience Specialist')
    }
    hiddenLocator.nth.mockReturnValue(hiddenLocator)

    let currentUrl = 'https://example.com/jobs'
    const page = {
      getByRole: vi.fn(() => hiddenLocator),
      goto: vi.fn(async (url: string) => {
        currentUrl = url === 'https://example.com/jobs/redirector'
          ? 'https://malicious.example.net/phish'
          : url
        return null
      }),
      goBack: vi.fn(async () => {
        currentUrl = 'https://example.com/jobs'
        return null
      }),
      url: vi.fn(() => currentUrl),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map()
    }

    const result = await tool.execute(
      {
        role: 'link',
        name: 'Customer Experience Specialist',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(page.goto).toHaveBeenCalledWith('https://example.com/jobs/redirector', {
      waitUntil: 'domcontentloaded',
      timeout: 5000
    })
    expect(page.goBack).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: false,
      error: 'Navigation went to disallowed URL: https://malicious.example.net/phish',
      data: expect.objectContaining({
        role: 'link',
        name: 'Customer Experience Specialist',
        index: 0,
        invalidUrl: 'https://malicious.example.net/phish',
        recovered: true,
        navigationMethod: 'href_fallback'
      })
    })
    expect(state.currentUrl).toBe('https://example.com/jobs')
    expect(state.failedInteractionAttempts.get('click::link::customer experience specialist::0')).toEqual({
      count: 1,
      lastError: 'Navigation went to disallowed URL: https://malicious.example.net/phish'
    })
  })

  test('blocks repeated disallowed-url click failures after the threshold is reached', async () => {
    const page = {
      getByRole: vi.fn(),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['click::link::customer experience specialist::0', {
          count: 2,
          lastError: 'Navigation went to disallowed URL: https://malicious.example.net/phish'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'link',
        name: 'Customer Experience Specialist',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Skipping repeated click attempt for link "Customer Experience Specialist" after 2 similar failures: Navigation went to disallowed URL: https://malicious.example.net/phish',
      data: expect.objectContaining({
        role: 'link',
        name: 'Customer Experience Specialist',
        index: 0,
        errorType: 'repeated_click_blocked'
      })
    })
    expect(page.getByRole).not.toHaveBeenCalled()
  })

test('falls back to clicking the associated checkbox label when the input intercepts pointer events', async () => {
    const inputLocator = {
      count: vi.fn().mockResolvedValue(1),
      isChecked: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    }
    const labelLocator = {
      count: vi.fn().mockResolvedValue(1),
      isVisible: vi.fn().mockResolvedValue(true),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue(null),
      locator: vi.fn(() => ({ first: () => inputLocator })),
    }
    const checkboxLocator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      getAttribute: vi.fn().mockResolvedValue('advanced-filter-workplaceType-2'),
      textContent: vi.fn().mockResolvedValue(null),
      click: vi.fn().mockRejectedValue(new Error('locator.click: Timeout 5000ms exceeded. <label for="advanced-filter-workplaceType-2"> intercepts pointer events')),
      locator: vi.fn((selector: string) => selector.startsWith('xpath=ancestor::label') ? {
        first: () => ({
          count: vi.fn().mockResolvedValue(0),
          isVisible: vi.fn().mockResolvedValue(false),
          scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined)
        })
      } : { first: () => labelLocator }),
      page: vi.fn()
    }
    checkboxLocator.nth.mockReturnValue(checkboxLocator)

    const currentUrl = 'https://example.com/jobs'
    const page = {
      getByRole: vi.fn(() => checkboxLocator),
      locator: vi.fn(() => ({ first: () => labelLocator })),
      url: vi.fn(() => currentUrl),
      waitForTimeout: vi.fn().mockResolvedValue(undefined)
    } as unknown as Page
    checkboxLocator.page.mockReturnValue(page)

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map()
    }

    const result = await tool.execute(
      {
        role: 'checkbox',
        name: 'Filter by Remote',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(labelLocator.click).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        role: 'checkbox',
        name: 'Filter by Remote',
        index: 0,
        navigated: false
      })
    })
  })

  test('blocks repeated identical click failures after the threshold is reached', async () => {
    const exactLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const looseLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const page = {
      getByRole: vi.fn((_role, options) => options?.exact ? exactLocator : looseLocator),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['click::link::senior next js developer::0', {
          count: 2,
          lastError: 'No link matched accessible name "Senior Next.js Developer".'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'link',
        name: 'Senior Next.js Developer',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Skipping repeated click attempt for link "Senior Next.js Developer" after 2 similar failures: No link matched accessible name "Senior Next.js Developer".',
      data: expect.objectContaining({
        role: 'link',
        name: 'Senior Next.js Developer',
        index: 0,
        errorType: 'repeated_click_blocked'
      })
    })
    expect(page.getByRole).not.toHaveBeenCalled()
  })

  test('does not block button attempts from a prior link failure key', async () => {
    const exactLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const looseLocator = {
      count: vi.fn().mockResolvedValue(0),
      nth: vi.fn()
    }
    const page = {
      getByRole: vi.fn((_role, options) => options?.exact ? exactLocator : looseLocator),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['click::link::senior next js developer::0', {
          count: 2,
          lastError: 'No link matched accessible name "Senior Next.js Developer".'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'button',
        name: 'Senior Next.js Developer (Verified job) Proxify Kosovo Remote',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'No button matched accessible name "Senior Next.js Developer (Verified job) Proxify Kosovo Remote".',
      data: expect.objectContaining({
        role: 'button',
        index: 0,
        errorType: 'click_failed'
      })
    })
    expect(page.getByRole).toHaveBeenCalled()
  })

  test('blocks repeated pointer-interception click failures after the threshold is reached', async () => {
    const page = {
      getByRole: vi.fn(),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'click')
    if (!tool) {
      throw new Error('click tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['click::checkbox::filter by remote::0', {
          count: 2,
          lastError: 'The matched control is present, but another visible element intercepts direct pointer clicks.'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'checkbox',
        name: 'Filter by Remote',
        index: 0
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Skipping repeated click attempt for checkbox "Filter by Remote" after 2 similar failures: The matched control is present, but another visible element intercepts direct pointer clicks.',
      data: expect.objectContaining({
        role: 'checkbox',
        index: 0,
        errorType: 'repeated_click_blocked'
      })
    })
    expect(page.getByRole).not.toHaveBeenCalled()
  })
})

describe('fill', () => {
  test('blocks repeated fill failures across truncated searchbox-name variants', async () => {
    const page = {
      getByRole: vi.fn(),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'fill')
    if (!tool) {
      throw new Error('fill tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['fill::searchbox::search by title skill or com::0', {
          count: 2,
          lastError: 'No textbox matched accessible name "Search by title, skill, or company".'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'searchbox',
        name: 'Search by title, skill, or com',
        text: 'frontend engineer',
        index: 0,
        submit: false
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Skipping repeated fill attempt for searchbox "Search by title, skill, or com" after 2 similar failures: No textbox matched accessible name "Search by title, skill, or company".',
      data: expect.objectContaining({
        role: 'searchbox',
        index: 0,
        errorType: 'repeated_fill_blocked'
      })
    })
    expect(page.getByRole).not.toHaveBeenCalled()
  })

  test('records disallowed-url submit failures so repeated unsafe fills can be blocked', async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined)
    }
    locator.nth.mockReturnValue(locator)

    let currentUrl = 'https://example.com/jobs'
    const page = {
      getByRole: vi.fn(() => locator),
      goBack: vi.fn(async () => {
        currentUrl = 'https://example.com/jobs'
        return null
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => currentUrl)
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'fill')
    if (!tool) {
      throw new Error('fill tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map<string, { count: number; lastError: string }>()
    }

    locator.press.mockImplementationOnce(async () => {
      currentUrl = 'https://malicious.example.net/phish'
      return undefined
    })

    const result = await tool.execute(
      {
        role: 'searchbox',
        name: 'Search jobs',
        text: 'frontend engineer',
        index: 0,
        submit: true
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: false,
      error: 'Navigation went to disallowed URL: https://malicious.example.net/phish',
      data: expect.objectContaining({
        role: 'searchbox',
        name: 'Search jobs',
        index: 0,
        errorType: 'fill_failed',
        repeatedFailureCount: 1,
        recovered: true
      })
    })
    expect(state.failedInteractionAttempts.get('fill::searchbox::search jobs::0')).toEqual({
      count: 1,
      lastError: 'Navigation went to disallowed URL: https://malicious.example.net/phish'
    })
  })
})

describe('select_option navigation state', () => {
  test('clears repeated interaction failures after select_option navigates successfully', async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: true,
          controlType: 'native_select',
          selectedValue: 'remote',
          selectedLabel: 'Remote'
        })
      }),
      press: vi.fn().mockResolvedValue(undefined)
    }
    locator.nth.mockReturnValue(locator)

    let currentUrl = 'https://example.com/jobs'
    const page = {
      getByRole: vi.fn(() => locator),
      waitForTimeout: vi.fn(async () => {
        currentUrl = 'https://example.com/jobs?workMode=remote'
        return undefined
      }),
      url: vi.fn(() => currentUrl)
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'select_option')
    if (!tool) {
      throw new Error('select_option tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['fill::input::search by title skill::0', {
          count: 2,
          lastError: 'No textbox matched accessible name "Search by title, skill, or company".'
        }]
      ])
    }

    const result = await tool.execute(
      {
        role: 'combobox',
        name: 'Work mode',
        optionText: 'Remote',
        index: 0,
        submit: false
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        navigated: true,
        newUrl: 'https://example.com/jobs?workMode=remote'
      })
    })
    expect(state.failedInteractionAttempts.size).toBe(0)
  })

  test('clears repeated interaction failures when the page-state token changes without a URL change', async () => {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      elementHandle: vi.fn().mockResolvedValue({
        evaluate: vi.fn().mockResolvedValue({
          selected: true,
          controlType: 'native_select',
          selectedValue: 'remote',
          selectedLabel: 'Remote'
        })
      }),
      press: vi.fn().mockResolvedValue(undefined)
    }
    locator.nth.mockReturnValue(locator)

    const page = {
      evaluate: vi.fn()
        .mockResolvedValueOnce('https://example.com/jobs::before')
        .mockResolvedValueOnce('https://example.com/jobs::after'),
      getByRole: vi.fn(() => locator),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => 'https://example.com/jobs')
    } as unknown as Page

    const tool = interactionTools.find((candidate) => candidate.name === 'select_option')
    if (!tool) {
      throw new Error('select_option tool is not registered')
    }

    const state = {
      currentUrl: 'https://example.com/jobs',
      visitedUrls: new Set<string>(),
      failedInteractionAttempts: new Map([
        ['fill::searchbox::search jobs::0', {
          count: 2,
          lastError: 'No textbox matched accessible name "Search jobs".'
        }]
      ]),
      failedInteractionPageStateToken: 'https://example.com/jobs::before'
    }

    const result = await tool.execute(
      {
        role: 'combobox',
        name: 'Work mode',
        optionText: 'Remote',
        index: 0,
        submit: false
      },
      {
        page,
        state: state as never,
        config: {
          navigationPolicy: {
            allowedHostnames: ['example.com']
          }
        } as never
      }
    )

expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        navigated: false,
        selectedLabel: 'Remote'
      })
    })
    expect(state.failedInteractionAttempts.size).toBe(1)
    expect(state.failedInteractionAttempts.has('fill::searchbox::search jobs::0')).toBe(true)
  })
})
