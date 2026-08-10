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
      />
    )

    expect(screen.getByText('No shortlisted jobs yet')).toBeTruthy()
    expect(screen.getByText('Find jobs first, then shortlist the strongest matches to start building tailored resumes.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Find jobs' }).getAttribute('href')).toBe('#/job-finder/discovery')
  })

  it('shows the imported CV and makes the unchanged-file behavior explicit', () => {
    const selectedItem = {
      jobId: 'job_1',
      title: 'Product Designer',
      company: 'Signal Systems',
      location: 'Remote',
      matchScore: 92,
      applicationStatus: 'ready_for_review' as const,
      resumeApplicationMode: 'original_resume' as const,
      assetStatus: 'ready' as const,
      progressPercent: 100,
      resumeAssetId: 'resume_1',
      resumeReview: {
        status: 'original_resume' as const,
        sourceDocumentId: 'resume_1',
        fileName: 'alex-original.pdf',
        filePath: '/tmp/alex-original.pdf'
      },
      updatedAt: '2026-07-14T10:00:00.000Z'
    }

    render(
      <ReviewQueuePreviewPanel
        displayedProgress={100}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        originalResume={{
          id: 'resume_1',
          fileName: 'alex-original.pdf',
          uploadedAt: '2026-07-14T10:00:00.000Z',
          storagePath: '/tmp/alex-original.pdf',
          textContent: 'Alex Example\nProduct designer\nFull work history',
          textUpdatedAt: '2026-07-14T10:00:00.000Z',
          extractionStatus: 'ready',
          lastAnalyzedAt: '2026-07-14T10:00:00.000Z',
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: []
        }}
        previewState={null}
        queue={[selectedItem]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={null}
      />
    )

    expect(screen.getByText('Original CV · unchanged')).toBeTruthy()
    expect(screen.getAllByText('alex-original.pdf')).toHaveLength(2)
    expect(screen.getByText(/will not rewrite it, remove roles/i)).toBeTruthy()
    expect(screen.getByText('File selected for attachment')).toBeTruthy()
    expect(screen.getByText('Read-only extracted text preview')).toBeTruthy()
    expect(screen.getByText(/attachment remains the original imported file/i)).toBeTruthy()
    expect(screen.getByText(/Check sensitive personal details before attaching/i)).toBeTruthy()
    expect(screen.getByText(/home address, date of birth, nationality/i)).toBeTruthy()
    expect(screen.getByText(/Full work history/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /create tailored resume/i })).toBeNull()
  })

  it('keeps the estimated percentage readable outside the progress fill', () => {
    const selectedItem = {
      jobId: 'job_generating',
      title: 'Senior Frontend Engineer',
      company: 'Mercury',
      location: 'Remote',
      matchScore: 86,
      applicationStatus: 'shortlisted',
      resumeApplicationMode: 'tailored_per_job',
      assetStatus: 'generating',
      progressPercent: 69,
      resumeAssetId: null,
      resumeReview: {
        status: 'not_started'
      },
      updatedAt: '2026-07-31T12:00:00.000Z'
    } as never

    render(
      <ReviewQueuePreviewPanel
        displayedProgress={69}
        isGenerating
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        previewState={null}
        queue={[selectedItem]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={null}
      />
    )

    const progress = screen.getByRole('progressbar', {
      name: 'Estimated resume preparation progress'
    })

    expect(progress.getAttribute('aria-valuenow')).toBe('69')
    expect(progress.getAttribute('aria-valuetext')).toBe('69% estimated')
    expect(screen.getByText('69% estimated').className).toContain('text-(--text-headline)')
    expect(screen.getByText(/Progress keeps its place/i)).toBeTruthy()
  })
})
