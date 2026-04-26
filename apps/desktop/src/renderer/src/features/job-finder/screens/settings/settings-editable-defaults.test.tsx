// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SettingsEditableDefaults } from './settings-editable-defaults'

describe('SettingsEditableDefaults', () => {
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

  it('disables form controls and marks save as pending while saving', () => {
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
              description:
                'Single-column, conservative, and recruiter-friendly for high parsing reliability.',
              bestFor: ['General applications', 'Recruiter-heavy funnels'],
              density: 'balanced',
            },
          ]}
          isSavePending
          onSaveSettings={vi.fn()}
          settings={{
            resumeFormat: 'pdf',
            resumeTemplateId: 'classic_ats',
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
    expect(container?.textContent).toContain('Classic ATS')

    const button = container?.querySelector('button[data-slot="button"]')
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.getAttribute('data-pending')).toBe('true')

    const disabledInputs = [
      ...Array.from(container?.querySelectorAll('button') ?? []),
      ...Array.from(container?.querySelectorAll('input') ?? []),
    ].filter((element) => element.hasAttribute('disabled'))
    expect(disabledInputs.length).toBeGreaterThan(0)
  })
})
