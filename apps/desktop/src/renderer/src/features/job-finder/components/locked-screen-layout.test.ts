import { describe, expect, test } from 'vitest'
import { getLockedHeaderWheelTarget } from './locked-screen-layout'

describe('getLockedHeaderWheelTarget', () => {
  test('moves the wide locked layout header before a nested pane consumes downward wheel input', () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 0,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBe(120)
  })

  test('stops at the header boundary so the next wheel event reaches the nested pane', () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 180,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBe(240)
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 240,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBeNull()
  })

  test('leaves narrow layouts and upward boundary handoff to normal scrolling', () => {
    expect(
      getLockedHeaderWheelTarget({
        deltaY: 120,
        scrollTop: 0,
        topHeight: 240,
        viewportWidth: 1024,
      }),
    ).toBeNull()
    expect(
      getLockedHeaderWheelTarget({
        deltaY: -120,
        scrollTop: 120,
        topHeight: 240,
        viewportWidth: 1440,
      }),
    ).toBeNull()
  })
})
