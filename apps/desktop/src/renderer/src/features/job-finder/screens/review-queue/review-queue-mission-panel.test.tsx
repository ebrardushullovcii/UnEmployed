// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob } from '@unemployed/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewQueueMissionPanel } from './review-queue-mission-panel'

afterEach(cleanup)

describe('ReviewQueueMissionPanel', () => {
  it('keeps the primary Apply Copilot action outside the scrolling evidence content', () => {
    const onStartApplyCopilot = vi.fn()
    const selectedItem = {
      jobId: 'job_circle',
      title: 'Senior Full-Stack Software Engineer',
      company: 'Circle',
      location: 'Remote',
      matchScore: 90,
      applicationStatus: 'ready_for_review',
      resumeApplicationMode: 'original_resume',
      assetStatus: 'ready',
      progressPercent: 100,
      resumeAssetId: 'resume_ebrar',
      resumeReview: {
        status: 'original_resume',
        sourceDocumentId: 'resume_ebrar',
        fileName: 'Ebrar.pdf',
        filePath: '/tmp/Ebrar.pdf',
      },
      updatedAt: '2026-07-16T10:00:00.000Z',
    } as ReviewQueueItem
    const selectedJob = {
      id: 'job_circle',
      title: selectedItem.title,
      company: selectedItem.company,
      summary: 'Build applied AI products for a global remote team.',
      description: 'Build applied AI products for a global remote team.',
      employerWebsiteUrl: null,
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      matchAssessment: {
        score: 90,
        reasons: ['Relevant full-stack experience'],
        gaps: [],
        recommendation: 'review_before_applying',
        recommendationRationale: 'Remote eligibility still needs confirmation.',
        requirements: [],
      },
    } as unknown as SavedJob
    const browserSession = {
      source: 'target_site',
      status: 'ready',
      driver: 'chrome_profile_agent',
      label: 'Browser ready',
      detail: 'Ready when needed.',
      lastCheckedAt: '2026-07-16T10:00:00.000Z',
    } as BrowserSessionState

    render(
      <ReviewQueueMissionPanel
        actionMessage={null}
        browserSession={browserSession}
        displayedProgress={100}
        isApplyPending={false}
        isJobPending={() => false}
        onApproveApply={vi.fn()}
        onClearQueueSelection={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        onRemoveReviewJob={vi.fn()}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        queue={[selectedItem]}
        queueSelection={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    )

    const footer = screen.getByTestId('apply-copilot-footer')
    expect(footer.parentElement?.lastElementChild).toBe(footer)
    expect(footer.className).toContain('absolute')
    fireEvent.click(screen.getByRole('button', { name: 'Start apply copilot' }))
    expect(onStartApplyCopilot).toHaveBeenCalledWith('job_circle')
  })
})
