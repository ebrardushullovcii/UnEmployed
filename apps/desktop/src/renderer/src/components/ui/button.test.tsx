// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  const globalScope = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean
  }
  const originalActEnvironment = globalScope.IS_REACT_ACT_ENVIRONMENT
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeAll(() => {
    globalScope.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterAll(() => {
    if (originalActEnvironment === undefined) {
      delete globalScope.IS_REACT_ACT_ENVIRONMENT
      return
    }

    globalScope.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }

    root = null
    container?.remove()
    container = null
  })

  it('marks pending buttons as busy and disabled with the activity rail', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <Button pending type="button">
          Save changes
        </Button>,
      )
    })

    const button = container?.querySelector('button')
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.hasAttribute('disabled')).toBe(true)
    expect(button?.getAttribute('data-pending')).toBe('true')
    expect(container?.querySelector('.button-pending-rail')).not.toBeNull()
  })

  it('does not render pending attributes when idle', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <Button type="button">
          Save changes
        </Button>,
      )
    })

    const button = container?.querySelector('button')
    expect(button?.hasAttribute('aria-busy')).toBe(false)
    expect(button?.hasAttribute('data-pending')).toBe(false)
    expect(container?.querySelector('.button-pending-rail')).toBeNull()
  })

  it('supports asChild while pending', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const clickHandler = vi.fn()

    act(() => {
      root?.render(
        <Button asChild pending>
          <a href="/job-finder/review-queue" onClick={clickHandler}>Review queue</a>
        </Button>,
      )
    })

    const link = container?.querySelector('a')
    expect(link?.getAttribute('aria-busy')).toBe('true')
    expect(link?.getAttribute('aria-disabled')).toBe('true')
    expect(link?.getAttribute('data-pending')).toBe('true')
    expect(link?.getAttribute('tabindex')).toBe('-1')
    expect(container?.querySelector('.button-pending-rail')).not.toBeNull()

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    const dispatchResult = link?.dispatchEvent(clickEvent)

    expect(dispatchResult).toBe(false)
    expect(clickEvent.defaultPrevented).toBe(true)
    expect(clickHandler).not.toHaveBeenCalled()
  })
})
