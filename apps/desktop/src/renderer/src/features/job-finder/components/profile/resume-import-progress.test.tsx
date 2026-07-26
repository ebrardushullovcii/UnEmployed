// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResumeImportProgress } from './resume-import-progress'

describe('ResumeImportProgress', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    vi.useRealTimers()
    container?.remove()
    container = null
    root = null
  })

  it('shows the real pipeline stage, exact elapsed time, and a long-import expectation', () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeImportProgress
          isPending
          progress={{
            stage: 'building_profile',
            message: 'Building grounded profile suggestions for your review.',
            occurredAt: '2026-07-16T10:00:00.000Z',
          }}
        />,
      )
    })

    expect(container.textContent).toContain('Building profile suggestions')
    expect(container.textContent).toContain('0s elapsed')

    act(() => {
      vi.advanceTimersByTime(61_000)
    })

    expect(container.textContent).toContain('1m 01s elapsed')
    expect(container.textContent).toContain('Larger or image-heavy resumes can take a couple of minutes')
  })
})
