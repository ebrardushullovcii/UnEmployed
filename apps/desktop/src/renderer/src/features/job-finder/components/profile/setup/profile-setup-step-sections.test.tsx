// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateProfileSchema } from '@unemployed/contracts'
import { ProfileSetupImportStep } from './profile-setup-step-sections'

describe('ProfileSetupImportStep', () => {
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

  it('disables resume import when the current setup step has unsaved edits', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_1',
      firstName: 'Alex',
      lastName: 'Vanguard',
      fullName: 'Alex Vanguard',
      headline: 'Senior systems designer',
      summary: 'Builds resilient workflows.',
      currentLocation: 'London, UK',
      yearsExperience: 10,
      email: 'alex@example.com',
      phone: '+44 7700 900123',
      baseResume: {
        id: 'resume_1',
        fileName: 'alex-vanguard.txt',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        extractionStatus: 'ready',
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: ['Principal Designer'],
      locations: ['Remote'],
      skills: ['Figma'],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileSetupImportStep
          busy={false}
          importDisabledReason="Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten."
          latestResumeImportReviewCandidates={[]}
          onContinueToProfile={vi.fn()}
          onImportResume={vi.fn()}
          onSaveAndGoToStep={vi.fn()}
          profile={profile}
          renderFooter={() => null}
          reviewItemCount={0}
        />,
      )
    })

    const importButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('Import or refresh resume'))
    expect(importButton?.hasAttribute('disabled')).toBe(true)
    expect(container?.textContent).toContain('Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten.')
  })
})
