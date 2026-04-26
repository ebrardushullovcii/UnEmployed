// @vitest-environment jsdom

import { act } from 'react'
import type { ResumeDraft, ResumeTemplateDefinition } from '@unemployed/contracts'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResumeWorkspaceEditorPanel } from './resume-workspace-editor-panel'

const availableResumeTemplates: readonly ResumeTemplateDefinition[] = [
  {
    id: 'classic_ats',
    label: 'Classic ATS',
    description: 'Single-column, conservative, and recruiter-friendly for high parsing reliability.',
    bestFor: ['General applications', 'Recruiter-heavy funnels'],
    density: 'balanced',
  },
  {
    id: 'compact_exec',
    label: 'Compact ATS',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.',
    bestFor: ['Experienced candidates', 'Content-dense resumes'],
    density: 'compact',
  },
  {
    id: 'modern_split',
    label: 'Modern Split ATS',
    description: 'Single-column with a sharper modern header and restrained accents for polished but ATS-safe exports.',
    bestFor: ['Product roles', 'Design-adjacent teams', 'Startup hiring loops'],
    density: 'balanced',
  },
  {
    id: 'technical_matrix',
    label: 'Technical Matrix',
    description: 'Skills-forward single-column layout that highlights technical depth before chronology.',
    bestFor: ['Engineering roles', 'Data roles', 'Security roles'],
    density: 'compact',
  },
  {
    id: 'project_showcase',
    label: 'Project Showcase',
    description: 'Project-forward single-column layout for candidates whose proof lands best through shipped work.',
    bestFor: ['Portfolio-heavy candidates', 'Career changers', 'Product builders'],
    density: 'comfortable',
  },
  {
    id: 'credentials_focus',
    label: 'Credentials Focus',
    description: 'Credentials-first single-column layout that surfaces certifications and education earlier without leaving ATS-safe structure.',
    bestFor: ['Regulated industries', 'Certification-heavy roles', 'Academic backgrounds'],
    density: 'balanced',
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
    vi.clearAllMocks()
  })

  it('keeps every shipped theme inside the scrollable editor region', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeWorkspaceEditorPanel
          actionMessage={null}
          approvedExportId={null}
          availableExportIdToApprove={null}
          availableResumeTemplates={availableResumeTemplates}
          draft={draft}
          hasUnsavedChanges={false}
          isWorkspacePending={false}
          jobId="job_1"
          onApplyPatch={vi.fn()}
          onApproveResume={vi.fn()}
          onClearResumeApproval={vi.fn()}
          onExportPdf={vi.fn()}
          onRegenerateDraft={vi.fn()}
          onRegenerateSection={vi.fn()}
          onSaveDraft={vi.fn()}
          onSectionChange={vi.fn()}
          onThemeChange={vi.fn()}
          runWithSavedDraft={(next) => next()}
          runWithSavedDraftAsync={(next) => {
            void next()
          }}
          withDraftPatch={(patch) => patch}
        />,
      )
    })

    expect(container?.querySelectorAll('[role="radio"]')).toHaveLength(6)

    const scrollRegion = container?.querySelector('.overflow-y-auto')
    expect(scrollRegion?.textContent).toContain('Technical Matrix')
    expect(scrollRegion?.textContent).toContain('Project Showcase')
    expect(scrollRegion?.textContent).toContain('Credentials Focus')
  })
})
