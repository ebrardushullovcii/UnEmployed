// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateProfileSchema, ResumeImportFieldCandidateSummarySchema } from '@unemployed/contracts'
import { ProfileSetupReviewQueueCard } from './profile-setup-screen-sections'
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
          importDisabledReason="Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten."
          isImportResumePending={false}
          isProfileSetupPending={false}
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

  it('summarizes imported text-vs-vision conflict choices', () => {
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
        fileName: 'alex-vanguard.pdf',
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
          importDisabledReason={null}
          isImportResumePending={false}
          isProfileSetupPending={false}
          latestResumeImportReviewCandidates={[
            ResumeImportFieldCandidateSummarySchema.parse({
              id: 'candidate_conflict_1',
              target: { section: 'identity', key: 'headline', recordId: null },
              label: 'Headline',
              value: 'Staff Platform Engineer',
              valuePreview: 'Staff Platform Engineer',
              evidenceText: 'Staff Platform Engineer',
              confidence: 0.8,
              resolution: 'needs_review',
              resolutionReason: 'text_vs_visual_conflict_requires_review',
              notes: [],
              conflictChoices: [
                {
                  id: 'choice_text',
                  label: 'Headline',
                  sourceLabel: 'Document text',
                  value: 'Senior Software Engineer',
                  valuePreview: 'Senior Software Engineer',
                  confidence: 0.86,
                  recommended: true,
                },
                {
                  id: 'choice_vision',
                  label: 'Headline',
                  sourceLabel: 'Visual scan',
                  value: 'Staff Platform Engineer',
                  valuePreview: 'Staff Platform Engineer',
                  confidence: 0.8,
                  recommended: false,
                },
              ],
            }),
          ]}
          onContinueToProfile={vi.fn()}
          onImportResume={vi.fn()}
          onSaveAndGoToStep={vi.fn()}
          profile={profile}
          renderFooter={() => null}
          reviewItemCount={1}
        />,
      )
    })

    expect(container?.textContent).toContain('Staff Platform Engineer')
    expect(container?.textContent).toContain('Compare Document text and Visual scan before confirming.')
  })

  it('lets users confirm a specific text-vs-vision conflict choice', () => {
    const onApplyReviewAction = vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root?.render(
        <ProfileSetupReviewQueueCard
          actionsDisabledReason={null}
          isReviewItemPending={() => false}
          items={[
            {
              id: 'review_headline_conflict',
              step: 'essentials',
              target: { domain: 'identity', key: 'headline', recordId: null },
              label: 'Headline',
              reason: 'Choose the imported headline to keep.',
              severity: 'recommended',
              status: 'pending',
              savedStatus: 'pending',
              statusSource: 'saved',
              proposedValue: 'Senior Software Engineer',
              sourceSnippet: 'Senior Software Engineer',
              sourceCandidateId: 'candidate_conflict_1',
              sourceRunId: 'resume_import_run_1',
              createdAt: '2026-04-11T10:00:00.000Z',
              resolvedAt: null,
            },
          ]}
          latestResumeImportReviewCandidates={[
            ResumeImportFieldCandidateSummarySchema.parse({
              id: 'candidate_conflict_1',
              target: { section: 'identity', key: 'headline', recordId: null },
              label: 'Headline',
              value: 'Senior Software Engineer',
              valuePreview: 'Senior Software Engineer',
              evidenceText: 'Senior Software Engineer',
              confidence: 0.86,
              resolution: 'needs_review',
              resolutionReason: 'text_vs_visual_conflict_requires_review',
              notes: [],
              conflictChoices: [
                {
                  id: 'choice_text',
                  label: 'Headline',
                  sourceLabel: 'Document text',
                  value: 'Senior Software Engineer',
                  valuePreview: 'Senior Software Engineer',
                  confidence: 0.86,
                  recommended: true,
                },
                {
                  id: 'choice_vision',
                  label: 'Headline',
                  sourceLabel: 'Visual scan',
                  value: 'Staff Platform Engineer',
                  valuePreview: 'Staff Platform Engineer',
                  confidence: 0.8,
                  recommended: false,
                },
              ],
            }),
          ]}
          onApplyReviewAction={onApplyReviewAction}
          onEditReviewItem={vi.fn()}
        />,
      )
    })

    const genericConfirmButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Confirm')
    expect(genericConfirmButton).toBeUndefined()

    const visualChoiceButton = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes('Use Visual scan'))
    expect(visualChoiceButton).toBeTruthy()

    act(() => {
      visualChoiceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onApplyReviewAction).toHaveBeenCalledWith('review_headline_conflict', 'confirm', {
      selectedConflictChoiceId: 'choice_vision',
    })
  })
})
