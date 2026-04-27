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

    expect(container?.textContent).toContain('Default resume template')
    expect(container?.textContent).toContain('Executive Brief')
    expect(container?.textContent).toContain('Executive Brief - Dense')
    expect(container?.textContent).toContain('Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.')
    expect(container?.textContent).toContain('Dense')
    expect(container?.textContent).toContain('Apply-safe')
    expect(container?.textContent).toContain('Default template picker')
    expect(container?.textContent).toContain('Applies to new drafts')
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
              label: 'Swiss Minimal - Standard',
              familyId: 'swiss_minimal',
              familyLabel: 'Swiss Minimal',
              familyDescription: 'Calm ATS-safe layouts.',
              variantLabel: 'Standard',
              description:
                'Single-column, conservative, and recruiter-friendly for high parsing reliability.',
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

    expect(container?.textContent).toContain('Default resume template')
    expect(container?.textContent).toContain('Swiss Minimal - Standard')

    const button = Array.from(container?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Save settings',
    )
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.getAttribute('data-pending')).toBe('true')

    const disabledInputs = Array.from(
      container?.querySelectorAll('button, input, select, textarea') ?? [],
    ).filter((element) => element.hasAttribute('disabled'))
    expect(disabledInputs.length).toBeGreaterThan(0)
  })
})
