// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  COPILOT_BOTTOM_OFFSET,
  COPILOT_NAV_SAFE_OFFSET,
  clampCopilotPosition,
  getDraggedCopilotPosition,
  getCopilotPanelDimensions,
  parseCopilotPosition,
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

  test('anchors the open rail stack at the bottom while keeping its panel below the shell header', () => {
    setViewportSize(1024, 720)

    const position = clampCopilotPosition({
      x: 20,
      y: 20,
      isOpen: true,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    })

    expect(position).toEqual({ x: 20, y: 20 })
    expect(getCopilotPanelDimensions(COPILOT_BOTTOM_OFFSET).expandedHeight).toBe(496)
  })

  test('clamps an open rail dragged below the bottom edge', () => {
    setViewportSize(1024, 720)

    const position = clampCopilotPosition({
      x: 20,
      y: -20,
      isOpen: true,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    })

    expect(position).toEqual({ x: 20, y: 20 })
  })

  test('keeps a tall open rail below the shell header when dragged upward', () => {
    setViewportSize(1440, 920)

    const position = clampCopilotPosition({
      x: 20,
      y: 180,
      isOpen: true,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    })

    expect(position).toEqual({ x: 20, y: 44 })
  })

  test('lets the collapsed bubble move without leaving the viewport', () => {
    setViewportSize(1024, 720)

    const position = clampCopilotPosition({
      x: 900,
      y: 900,
      isOpen: false,
      minBottomOffset: COPILOT_BOTTOM_OFFSET,
    })

    expect(position).toEqual({ x: 688, y: 624 })
  })

  test('uses the shell-safe inset that clears the fixed navigation', () => {
    expect(COPILOT_NAV_SAFE_OFFSET).toBeGreaterThanOrEqual(112)
  })

  test('uses a predictable near-bottom default offset', () => {
    expect(COPILOT_BOTTOM_OFFSET).toBe(20)
  })

  test('uses the final pointer coordinate for a fast drag', () => {
    expect(
      getDraggedCopilotPosition({
        clientX: 320,
        clientY: 280,
        originX: 980,
        originY: 680,
        startX: 20,
        startY: 20,
      }),
    ).toEqual({
      moved: true,
      position: { x: 680, y: 420 },
    })
  })

  test('parses only finite persisted positions', () => {
    expect(parseCopilotPosition('{"x":120,"y":48}')).toEqual({ x: 120, y: 48 })
    expect(parseCopilotPosition('{"x":"120","y":48}')).toBeNull()
    expect(parseCopilotPosition('not-json')).toBeNull()
  })
})
