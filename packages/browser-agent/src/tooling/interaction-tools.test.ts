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
      visitedUrls: new Set<string>()
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
  })
})
