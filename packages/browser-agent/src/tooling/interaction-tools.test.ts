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
