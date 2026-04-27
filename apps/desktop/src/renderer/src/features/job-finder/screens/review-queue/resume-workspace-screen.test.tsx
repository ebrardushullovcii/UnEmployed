// @vitest-environment jsdom

import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  ResumeDraft,
  ResumeTemplateDefinition,
} from '@unemployed/contracts'
import { JobFinderResumeWorkspaceSchema } from '@unemployed/contracts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApplyQueueDemoState } from '../../../../../../main/adapters/job-finder-demo-state'
import { ResumeWorkspaceScreen } from './resume-workspace-screen'

const availableResumeTemplates: readonly ResumeTemplateDefinition[] = [
  {
    id: 'classic_ats',
    label: 'Swiss Minimal - Standard',
    familyId: 'swiss_minimal',
    familyLabel: 'Swiss Minimal',
    familyDescription: 'Calm ATS-safe layouts.',
    variantLabel: 'Standard',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.',
    fitSummary: 'A clean all-rounder.',
    avoidSummary: 'Less distinctive for project-led portfolios.',
    bestFor: ['General applications'],
    visualTags: ['Minimal', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 10,
  },
  {
    id: 'technical_matrix',
    label: 'Engineering Spec - Systems',
    familyId: 'engineering_spec',
    familyLabel: 'Engineering Spec',
    familyDescription: 'Spec-like ATS-safe layouts.',
    variantLabel: 'Systems',
    description: 'Skills-forward single-column layout that highlights technical depth before chronology.',
    fitSummary: 'Best when systems depth should land early.',
    avoidSummary: 'Can feel too technical for generalist roles.',
    bestFor: ['Engineering roles'],
    visualTags: ['Skills matrix', 'Technical'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 20,
  },
  {
    id: 'project_showcase',
    label: 'Portfolio Narrative - Proof-led',
    familyId: 'portfolio_narrative',
    familyLabel: 'Portfolio Narrative',
    familyDescription: 'Proof-led ATS-safe layouts.',
    variantLabel: 'Proof-led',
    description: 'Project-forward single-column layout for candidates whose proof lands best through shipped work.',
    fitSummary: 'Useful when shipped work is your strongest evidence.',
    avoidSummary: 'Less ideal for conservative chronology-first screens.',
    bestFor: ['Portfolio-heavy candidates'],
    visualTags: ['Projects first', 'Proof led'],
    density: 'comfortable',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 30,
  },
]

function buildWorkspace(): JobFinderResumeWorkspace {
  const state = createApplyQueueDemoState()
  const job = state.savedJobs.find((entry) => entry.id === 'job_ready')
  const draft = state.resumeDrafts.find((entry) => entry.jobId === 'job_ready')
  const tailoredAsset = state.tailoredAssets.find((entry) => entry.jobId === 'job_ready') ?? null

  if (!job || !draft) {
    throw new Error('Expected demo state to contain the ready resume workspace fixture.')
  }

  return JobFinderResumeWorkspaceSchema.parse({
    job,
    draft,
    validation: null,
    exports: state.resumeExportArtifacts.filter((entry) => entry.jobId === 'job_ready'),
    research: [],
    assistantMessages: [],
    tailoredAsset,
    sharedProfile: {},
  })
}

function buildPreview(revisionKey: string, htmlText: string): JobFinderResumePreview {
  return {
    draftId: 'resume_draft_job_ready',
    revisionKey,
    html: `<!doctype html><html><body>${htmlText}</body></html>`,
    warnings: [],
    metadata: {
      templateId: 'classic_ats',
      renderedAt: '2026-04-27T00:00:00.000Z',
      pageCount: null,
      sectionCount: 2,
      entryCount: 1,
    },
  }
}

function renderScreen(options?: {
  onPreviewDraft?: (draft: ResumeDraft) => Promise<JobFinderResumePreview>
}) {
  const onPreviewDraft = options?.onPreviewDraft ?? (() => Promise.resolve(buildPreview('preview_ready', 'ready-preview')))

  return render(
    <ResumeWorkspaceScreen
      actionMessage={null}
      assistantMessages={[]}
      assistantPending={false}
      availableResumeTemplates={availableResumeTemplates}
      isWorkspacePending={false}
      jobId="job_ready"
      onApplyPatch={vi.fn()}
      onApproveResume={vi.fn()}
      onBack={vi.fn()}
      onClearResumeApproval={vi.fn()}
      onDirtyChange={vi.fn()}
      onExportPdf={vi.fn()}
      onPreviewDraft={onPreviewDraft}
      onRefresh={vi.fn()}
      onRegenerateDraft={vi.fn()}
      onRegenerateSection={vi.fn()}
      onSaveDraft={vi.fn()}
      onSaveDraftAndThen={vi.fn()}
      onSendAssistantMessage={vi.fn()}
      workspace={buildWorkspace()}
    />,
  )
}

describe('ResumeWorkspaceScreen', () => {
  const globalScope = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean
  }
  const originalActEnvironment = globalScope.IS_REACT_ACT_ENVIRONMENT
  const originalResizeObserver = globalThis.ResizeObserver
  const originalScrollIntoView = (element: HTMLElement, ...args: Parameters<HTMLElement['scrollIntoView']>) =>
    HTMLElement.prototype.scrollIntoView.call(element, ...args)

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

  beforeEach(() => {
    vi.useFakeTimers()

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    cleanup()
    HTMLElement.prototype.scrollIntoView = function restoreScrollIntoView(...args) {
      return originalScrollIntoView(this, ...args)
    }
    if (originalResizeObserver) {
      vi.stubGlobal('ResizeObserver', originalResizeObserver)
    } else {
      vi.unstubAllGlobals()
    }
    vi.clearAllMocks()
  })

  it('shows preview fallback while keeping editing available when preview rendering fails', async () => {
    const onPreviewDraft = vi.fn().mockRejectedValue(
      new Error(
        "Error invoking remote method 'job-finder:preview-resume-draft': Error: Preview rendering failed in desktop test mode.",
      ),
    )

    renderScreen({ onPreviewDraft })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getAllByText('Preview unavailable').length).toBeGreaterThan(0)

    expect(screen.getAllByText('Preview rendering failed in desktop test mode.').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Section text').length).toBeGreaterThan(0)
  })

  it('debounces unsaved preview refreshes and ignores stale preview responses', async () => {
    const previewResolvers: Array<(preview: JobFinderResumePreview) => void> = []
    const onPreviewDraft = vi.fn().mockImplementation(
      () => new Promise<JobFinderResumePreview>((resolve) => {
        previewResolvers.push(resolve)
      }),
    )

    renderScreen({ onPreviewDraft })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(99)
    })
    expect(onPreviewDraft).toHaveBeenCalledTimes(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(onPreviewDraft).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getAllByLabelText('Section text')[0]!, {
      target: { value: 'Updated unsaved summary for preview coverage.' },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(249)
    })
    expect(onPreviewDraft).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(onPreviewDraft).toHaveBeenCalledTimes(2)

    await act(async () => {
      previewResolvers[1]?.(buildPreview('preview_fresh', 'fresh-preview'))
      await Promise.resolve()
    })

    const freshPreviewFrame = screen.getAllByTitle('Live resume preview')[0] as HTMLIFrameElement
    expect(freshPreviewFrame.getAttribute('srcdoc') ?? freshPreviewFrame.srcdoc).toContain('fresh-preview')

    await act(async () => {
      previewResolvers[0]?.(buildPreview('preview_stale', 'stale-preview'))
      await Promise.resolve()
    })

    const staleCheckFrame = screen.getAllByTitle('Live resume preview')[0] as HTMLIFrameElement
    const renderedHtml = staleCheckFrame.getAttribute('srcdoc') ?? staleCheckFrame.srcdoc

    expect(renderedHtml).toContain('fresh-preview')
    expect(renderedHtml).not.toContain('stale-preview')
    expect(screen.getAllByText('Unsaved edits rendered').length).toBeGreaterThan(0)
  })

  it('shows grounded template recommendations for the current draft', async () => {
    renderScreen()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(screen.getAllByText('Template strategy').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Recommended').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Engineering Spec').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Open guided edits' }).length).toBeGreaterThan(0)
  })
})
