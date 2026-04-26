// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
})
