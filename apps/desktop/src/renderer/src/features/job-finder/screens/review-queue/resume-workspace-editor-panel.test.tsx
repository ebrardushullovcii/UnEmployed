// @vitest-environment jsdom

import { act } from 'react'
import type { ResumeDraft, ResumeTemplateDefinition } from '@unemployed/contracts'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ResumeWorkspaceEditorPanel } from './resume-workspace-editor-panel'

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
    bestFor: ['General applications', 'Recruiter-heavy funnels'],
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
    id: 'compact_exec',
    label: 'Executive Brief - Dense',
    familyId: 'executive_brief',
    familyLabel: 'Executive Brief',
    familyDescription: 'Leadership-oriented ATS-safe layouts.',
    variantLabel: 'Dense',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.',
    fitSummary: 'Good for dense senior resumes.',
    avoidSummary: 'Can feel tight for early-career profiles.',
    bestFor: ['Experienced candidates', 'Content-dense resumes'],
    visualTags: ['Dense', 'Centered header'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 20,
  },
  {
    id: 'modern_split',
    label: 'Swiss Minimal - Accent',
    familyId: 'swiss_minimal',
    familyLabel: 'Swiss Minimal',
    familyDescription: 'Calm ATS-safe layouts.',
    variantLabel: 'Accent',
    description: 'Single-column with a sharper modern header and restrained accents for polished but ATS-safe exports.',
    fitSummary: 'Cleaner modern signal without leaving the ATS lane.',
    avoidSummary: 'Less useful if you need dense compression.',
    bestFor: ['Product roles', 'Design-adjacent teams', 'Startup hiring loops'],
    visualTags: ['Accent header', 'Summary callout'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 11,
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
    bestFor: ['Engineering roles', 'Data roles', 'Security roles'],
    visualTags: ['Skills matrix', 'Technical'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 30,
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
    bestFor: ['Portfolio-heavy candidates', 'Career changers', 'Product builders'],
    visualTags: ['Projects first', 'Proof led'],
    density: 'comfortable',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 40,
  },
  {
    id: 'credentials_focus',
    label: 'Executive Brief - Credentials',
    familyId: 'executive_brief',
    familyLabel: 'Executive Brief',
    familyDescription: 'Leadership-oriented ATS-safe layouts.',
    variantLabel: 'Credentials',
    description: 'Credentials-first single-column layout that surfaces certifications and education earlier without leaving ATS-safe structure.',
    fitSummary: 'Stronger when credentials materially change recruiter trust.',
    avoidSummary: 'Less effective if your strongest evidence is shipped work.',
    bestFor: ['Regulated industries', 'Certification-heavy roles', 'Academic backgrounds'],
    visualTags: ['Credentials first', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 21,
  },
]

const draft: ResumeDraft = {
  id: 'draft_1',
  jobId: 'job_1',
  status: 'draft',
  templateId: 'classic_ats',
  sections: [],
  targetPageCount: 2,
  generationMethod: null,
  approvedAt: null,
  approvedExportId: null,
  staleReason: null,
  createdAt: '2026-04-26T12:00:00.000Z',
  updatedAt: '2026-04-26T12:00:00.000Z',
}

describe('ResumeWorkspaceEditorPanel', () => {
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
    vi.clearAllMocks()
  })

  it('keeps every shipped family and variant inside the scrollable editor region', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeWorkspaceEditorPanel
          actionMessage={null}
          availableResumeTemplates={availableResumeTemplates}
          draft={draft}
          hasUnsavedChanges={false}
          isWorkspacePending={false}
          jobId="job_1"
          onApplyPatch={vi.fn()}
          onRegenerateSection={vi.fn()}
          onSectionChange={vi.fn()}
          onSelectEntry={vi.fn()}
          onSelectSection={vi.fn()}
          onThemeChange={vi.fn()}
          runWithSavedDraft={(next) => next()}
          selectedEntryId={null}
          selectedSectionId={null}
          withDraftPatch={(patch) => patch}
        />,
      )
    })

    const scrollRegion = container?.querySelector('.overflow-y-auto')
    expect(scrollRegion?.querySelectorAll('[role="radio"]')).toHaveLength(6)
    expect(scrollRegion?.textContent).toContain('Swiss Minimal')
    expect(scrollRegion?.textContent).toContain('Executive Brief')
    expect(scrollRegion?.textContent).toContain('Engineering Spec')
    expect(scrollRegion?.textContent).toContain('Portfolio Narrative')
    expect(scrollRegion?.textContent).toContain('Apply-safe')
    expect(scrollRegion?.textContent).toContain('All lanes')
    expect(scrollRegion?.textContent).toContain('All density')
  })
})
