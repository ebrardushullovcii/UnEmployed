// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceStateScreen } from './job-finder-page-routes'

describe('WorkspaceStateScreen', () => {
  it('offers an explicit retry after the initial workspace load fails', () => {
    const onRetry = vi.fn()
    render(
      <WorkspaceStateScreen
        action={{ label: 'Retry opening Job Finder', onClick: onRetry }}
        kicker="Workspace error"
        message="The saved workspace could not be read."
        title="Couldn't open Job Finder"
        tone="error"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry opening Job Finder' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
