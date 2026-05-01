// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewQueuePreviewPanel } from './review-queue-preview-panel'

describe('ReviewQueuePreviewPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('routes first-run users back to Find jobs from the empty shortlist state', () => {
    render(
      <ReviewQueuePreviewPanel
        displayedProgress={0}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        previewState={null}
        queue={[]}
        selectedAsset={null}
        selectedItem={null}
        selectedJob={null}
      />,
    )

    expect(screen.getByText('No shortlisted jobs yet')).toBeTruthy()
    expect(screen.getByText('Find jobs first, then shortlist the strongest matches to start building tailored resumes.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Find jobs' }).getAttribute('href')).toBe('#/job-finder/discovery')
  })
})
