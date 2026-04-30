// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  COPILOT_CONTENT_SAFE_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
} from './profile-copilot-rail-layout'

describe('profile copilot rail layout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function setViewportSize(width: number, height: number) {
    vi.stubGlobal('window', {
      innerWidth: width,
      innerHeight: height,
    })
  }

  test('keeps the open rail below the shell header safe area when the bubble sits high above the footer', () => {
    setViewportSize(1440, 920)

    const position = clampCopilotPosition({
      x: 20,
      y: 180,
      isOpen: true,
      minBottomOffset: 160,
    })

    expect(position).toEqual({ x: 20, y: 160 })
  })

  test('keeps the open rail above the footer-safe offset too', () => {
    setViewportSize(1440, 920)

    const position = clampCopilotPosition({
      x: 20,
      y: 20,
      isOpen: true,
      minBottomOffset: 160,
    })

    expect(position).toEqual({ x: 20, y: 160 })
  })

  test('keeps the open rail above the footer-safe offset when dragged too low', () => {
    setViewportSize(1440, 920)

    const position = clampCopilotPosition({
      x: 20,
      y: -20,
      isOpen: true,
      minBottomOffset: 160,
    })

    expect(position).toEqual({ x: 20, y: 160 })
  })

  test('preserves the larger footer-safe bottom offset while the bubble stays collapsed', () => {
    setViewportSize(1440, 920)

    const position = clampCopilotPosition({
      x: 20,
      y: 20,
      isOpen: false,
      minBottomOffset: 160,
    })

    expect(position).toEqual({ x: 20, y: 160 })
  })

  test('uses the shell-safe inset that clears the fixed navigation', () => {
    expect(COPILOT_NAV_SAFE_OFFSET).toBeGreaterThanOrEqual(112)
  })

  test('exports a larger content-safe offset for setup-heavy screens', () => {
    expect(COPILOT_CONTENT_SAFE_OFFSET).toBeGreaterThanOrEqual(160)
  })
})
