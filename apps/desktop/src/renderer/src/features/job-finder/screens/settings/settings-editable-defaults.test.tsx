// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsEditableDefaults } from './settings-editable-defaults'

describe('SettingsEditableDefaults', () => {
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

  it('shows available ATS-safe templates and the selected template description', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <SettingsEditableDefaults
          actionMessage={null}
          availableResumeTemplates={[
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
          ]}
          isSavePending={false}
          onSaveSettings={vi.fn()}
          settings={{
            resumeFormat: 'pdf',
            resumeTemplateId: 'compact_exec',
            fontPreset: 'inter_requisite',
            appearanceTheme: 'system',
            humanReviewRequired: true,
            allowAutoSubmitOverride: false,
            keepSessionAlive: false,
            discoveryOnly: false,
          }}
        />,
      )
    })

    expect(container?.textContent).toContain('Default resume theme')
    expect(container?.textContent).toContain('Compact ATS')
    expect(container?.textContent).toContain('Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.')
    expect(container?.textContent).toContain('Content-dense resumes')
  })
})
