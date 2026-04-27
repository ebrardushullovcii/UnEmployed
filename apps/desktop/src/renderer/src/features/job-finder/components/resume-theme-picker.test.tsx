// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ResumeTemplateDefinition } from '@unemployed/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildResumeThemePickerRecommendations,
  ResumeThemePicker,
  type ResumeThemePickerRecommendationContext,
} from './resume-theme-picker'

const themes: readonly ResumeTemplateDefinition[] = [
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
    id: 'compact_exec',
    label: 'Executive Brief - Dense',
    familyId: 'executive_brief',
    familyLabel: 'Executive Brief',
    familyDescription: 'Leadership-oriented ATS-safe layouts.',
    variantLabel: 'Dense',
    description: 'Single-column, tighter spacing, and still ATS-safe for concise two-page submissions.',
    fitSummary: 'Good for dense senior resumes.',
    avoidSummary: 'Can feel tight for early-career profiles.',
    bestFor: ['Experienced candidates'],
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
    bestFor: ['Portfolio-heavy candidates'],
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
    bestFor: ['Certification-heavy roles'],
    visualTags: ['Credentials first', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 50,
  },
]

function buildRecommendationContext(): ResumeThemePickerRecommendationContext {
  return {
    jobTitle: 'Staff Frontend Engineer',
    jobKeywords: ['React', 'TypeScript', 'Accessibility', 'Platform'],
    hasProjects: true,
    hasCertifications: false,
    hasFormalEducation: true,
    experienceEntryCount: 4,
    totalIncludedBulletCount: 12,
  }
}

describe('ResumeThemePicker', () => {
  const globalScope = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean
  }
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  globalScope.IS_REACT_ACT_ENVIRONMENT = true

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

  it('builds deterministic recommendations from workspace context', () => {
    expect(
      buildResumeThemePickerRecommendations({
        recommendationContext: buildRecommendationContext(),
        themes,
      }),
    ).toEqual([
      expect.objectContaining({ templateId: 'technical_matrix' }),
      expect.objectContaining({ templateId: 'project_showcase' }),
      expect.objectContaining({ templateId: 'compact_exec' }),
    ])
  })

  it('supports recommended-only filtering in the catalog', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ResumeThemePicker
          onChange={vi.fn()}
          recommendationContext={buildRecommendationContext()}
          selectedThemeId="classic_ats"
          themes={themes}
        />,
      )
    })

    expect(container?.textContent).toContain('Recommended for this draft')
    expect(container?.textContent).toContain('Engineering Spec - Systems')

    const recommendedOnlyButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent?.includes('Recommended only'),
    )
    expect(recommendedOnlyButton).toBeTruthy()

    act(() => {
      recommendedOnlyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container?.textContent).toContain('Filters active')
    expect(container?.textContent).not.toContain('Swiss Minimal')
    expect(container?.textContent).toContain('Engineering Spec')
    expect(container?.textContent).toContain('Portfolio Narrative')
  })
})
