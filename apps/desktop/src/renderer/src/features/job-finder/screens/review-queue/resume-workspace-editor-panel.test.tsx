// @vitest-environment jsdom

import { act } from 'react'
import type { ResumeDraft } from '@unemployed/contracts'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ResumeWorkspaceEditorPanel } from './resume-workspace-editor-panel'

const draft: ResumeDraft = {
  id: 'draft_1',
  jobId: 'job_1',
  status: 'draft',
  templateId: 'classic_ats',
  identity: {
    fullName: 'Alex Vanguard',
    headline: 'Senior systems designer',
    location: 'London, UK',
    email: 'alex@example.com',
    phone: '+44 7700 900123',
    portfolioUrl: 'https://alex.example.com',
    linkedinUrl: 'https://www.linkedin.com/in/alex-vanguard',
    githubUrl: null,
    personalWebsiteUrl: null,
    additionalLinks: [],
  },
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

  it('keeps structured editing available while template selection lives elsewhere in studio', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeWorkspaceEditorPanel
          actionMessage={null}
          draft={draft}
          hasUnsavedChanges={false}
          isWorkspacePending={false}
          jobId="job_1"
          onApplyPatch={vi.fn()}
          onDraftChange={vi.fn()}
          onRegenerateSection={vi.fn()}
          onSectionChange={vi.fn()}
          onSelectEntry={vi.fn()}
          onSelectSection={vi.fn()}
          runWithSavedDraft={(next) => next()}
          selectedEntryId={null}
          selectedSectionId={null}
          selectedTargetId={null}
          withDraftPatch={(patch) => patch}
        />,
      )
    })

    const scrollRegion = container?.querySelector('.overflow-y-auto')
    expect(scrollRegion?.textContent).toContain('Structured edits')
    expect(scrollRegion?.textContent).toContain('Resume identity')
    expect(scrollRegion?.textContent).toContain('Change the schema-safe content behind the preview')
    expect(scrollRegion?.textContent).not.toContain('Choose a family')
    expect(scrollRegion?.querySelectorAll('[role="radio"]')).toHaveLength(0)
  })
})
