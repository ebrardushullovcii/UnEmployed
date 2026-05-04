// @vitest-environment jsdom

import { act } from 'react'
import type { ResumeTemplateDefinition } from '@unemployed/contracts'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SettingsEditableDefaults } from './settings-editable-defaults'

function makeResumeTemplate(
  overrides: Partial<ResumeTemplateDefinition> & Pick<ResumeTemplateDefinition, 'id' | 'label'>,
): ResumeTemplateDefinition {
  return {
    familyId: 'chronology_classic',
    familyLabel: 'Chronology Classic',
    familyDescription: 'Calm ATS-safe layouts.',
    variantLabel: 'Recruiter Standard',
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
    ...overrides,
  }
}

const resumeTemplateFixtures = {
  classicAts: makeResumeTemplate({
    id: 'classic_ats',
    label: 'Chronology Classic',
  }),
  compactExec: makeResumeTemplate({
    id: 'compact_exec',
    label: 'Senior Brief',
    familyId: 'senior_brief',
    familyLabel: 'Senior Brief',
    familyDescription: 'Leadership-oriented ATS-safe layouts.',
    variantLabel: 'Dense Timeline',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.',
    fitSummary: 'Good for dense senior resumes.',
    avoidSummary: 'Can feel tight for early-career profiles.',
    bestFor: ['Experienced candidates', 'Content-dense resumes'],
    visualTags: ['Dense', 'Centered header'],
    density: 'compact',
    sortOrder: 20,
  }),
} satisfies Record<string, ResumeTemplateDefinition>

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
          availableResumeTemplates={[resumeTemplateFixtures.classicAts, resumeTemplateFixtures.compactExec]}
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
    expect(container?.textContent).toContain('Senior Brief')
    expect(container?.textContent).toContain('Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.')
    expect(container?.textContent).toContain('Dense Timeline')
    expect(container?.textContent).toContain('Apply-safe')
    expect(container?.textContent).toContain('Default template picker')
    expect(container?.textContent).toContain('Applies to new drafts')
    expect(container?.textContent).toContain('The preview uses sample resume content rendered through the same template engine used for exports.')
  })

  it('disables form controls and marks save as pending while saving', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <SettingsEditableDefaults
          actionMessage={null}
          availableResumeTemplates={[resumeTemplateFixtures.classicAts]}
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
    expect(container?.textContent).toContain('Chronology Classic')

    const button = Array.from(container?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.trim() === 'Save settings',
    )
    expect(button?.getAttribute('aria-busy')).toBe('true')
    expect(button?.getAttribute('data-pending')).toBe('true')

    expect(button?.hasAttribute('disabled')).toBe(true)

    const disabledNonSaveControls = Array.from(
      container?.querySelectorAll('button, input, select, textarea') ?? [],
    ).filter(
      (element) =>
        element !== button &&
        (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'),
    )
    expect(disabledNonSaveControls.length).toBeGreaterThan(0)
  })
})
