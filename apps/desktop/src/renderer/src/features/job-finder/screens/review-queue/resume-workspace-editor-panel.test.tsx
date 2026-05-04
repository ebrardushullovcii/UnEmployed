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

  const renderPanel = (isWorkspacePending: boolean) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeWorkspaceEditorPanel
          actionMessage={null}
          draft={draft}
          hasUnsavedChanges={false}
          isWorkspacePending={isWorkspacePending}
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
          workHistoryReviewSuggestions={[]}
        />,
      )
    })
  }

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
    renderPanel(false)

    const scrollRegion = container?.querySelector('[data-resume-editor-scroll-region]')
    const editableControls = Array.from(
      scrollRegion?.querySelectorAll('input, textarea, select, button') ?? [],
    )

    expect(scrollRegion?.textContent).toContain('Structured edits')
    expect(scrollRegion?.textContent).toContain('Resume identity')
    expect(scrollRegion?.textContent).toContain('Change the schema-safe content behind the preview')
    expect(scrollRegion?.textContent).not.toContain('Choose a family')
    expect(scrollRegion?.querySelectorAll('[role="radio"]')).toHaveLength(0)
    expect(editableControls.length).toBeGreaterThan(0)
    for (const control of editableControls) {
      expect(control.hasAttribute('disabled')).toBe(false)
      expect(control.getAttribute('aria-disabled')).not.toBe('true')
    }
  })

  it('disables structured editing controls while workspace work is pending', () => {
    renderPanel(true)

    const scrollRegion = container?.querySelector('[data-resume-editor-scroll-region]')
    const editableControls = Array.from(
      scrollRegion?.querySelectorAll('input, textarea, select, button') ?? [],
    )

    expect(editableControls.length).toBeGreaterThan(0)
    for (const control of editableControls) {
      expect(control.hasAttribute('disabled')).toBe(true)
    }
  })

  it('keeps entry movement enabled for locked entries because locks protect content edits only', () => {
    const lockedEntryDraft: ResumeDraft = {
      ...draft,
      sections: [
        {
          id: 'section_experience',
          kind: 'experience',
          label: 'Experience',
          text: null,
          bullets: [],
          entries: [
            {
              id: 'experience_locked',
              entryType: 'experience',
              title: 'Locked role',
              subtitle: 'Signal Systems',
              location: null,
              dateRange: '2023 – Present',
              summary: 'Locked content.',
              bullets: [],
              origin: 'user_edited',
              locked: true,
              included: true,
              sortOrder: 0,
              profileRecordId: 'experience_locked',
              sourceRefs: [],
              updatedAt: draft.updatedAt,
            },
            {
              id: 'experience_editable',
              entryType: 'experience',
              title: 'Editable role',
              subtitle: 'Northwind Labs',
              location: null,
              dateRange: '2021 – 2022',
              summary: 'Editable content.',
              bullets: [],
              origin: 'user_edited',
              locked: false,
              included: true,
              sortOrder: 1,
              profileRecordId: 'experience_editable',
              sourceRefs: [],
              updatedAt: draft.updatedAt,
            },
          ],
          origin: 'user_edited',
          locked: false,
          included: true,
          sortOrder: 1,
          entryOrderMode: 'chronology',
          profileRecordId: null,
          sourceRefs: [],
          updatedAt: draft.updatedAt,
        },
      ],
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeWorkspaceEditorPanel
          actionMessage={null}
          draft={lockedEntryDraft}
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
          workHistoryReviewSuggestions={[]}
        />,
      )
    })

    const lockedTitleInput = Array.from(container.querySelectorAll('input')).find(
      (input) => input.id.includes('entry_title_experience_locked'),
    )
    const moveDownButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Move entry down',
    )

    expect(lockedTitleInput?.value).toBe('Locked role')
    expect(lockedTitleInput?.disabled).toBe(true)
    expect(moveDownButton?.disabled).toBe(false)
  })
})
