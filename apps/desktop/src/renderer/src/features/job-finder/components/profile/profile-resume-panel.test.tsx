// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateProfileSchema } from '@unemployed/contracts'
import { ProfileResumePanel } from './profile-resume-panel'

describe('ProfileResumePanel', () => {
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

  it('disables resume import and refresh while a draft would be overwritten', () => {
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
        textContent: 'Alex Vanguard',
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
        <ProfileResumePanel
          importDisabledReason="Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten."
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      )
    })

    const buttons = [...(container?.querySelectorAll('button') ?? [])]
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(expect.arrayContaining(['Replace resume', 'Refresh from resume']))
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true)
    expect(container?.textContent).toContain('Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten.')
  })

  it('keeps a visible fallback import quality note even when raw low-level warnings are hidden', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_2',
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
        id: 'resume_2',
        fileName: 'alex-vanguard.txt',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        textContent: 'Alex Vanguard',
        extractionStatus: 'ready',
        analysisWarnings: [
          'Python resume parser sidecar fallback: Python sidecar unavailable',
          'pdfplumber is unavailable, so PDF import stayed on the lightweight sidecar fallback.',
        ],
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
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      )
    })

    expect(container?.textContent).toContain('This import used a fallback parsing path, so review the imported details more closely before saving them.')
    expect(container?.textContent).not.toContain('Python resume parser sidecar fallback: Python sidecar unavailable')
  })

  it('shows import ready to use when only optional resume suggestions remain', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_3',
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
        id: 'resume_3',
        fileName: 'alex-vanguard.txt',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        textContent: 'Alex Vanguard',
        extractionStatus: 'ready',
        analysisWarnings: ['1 optional proof suggestion is available to review before using them in tailored resume narratives.'],
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
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          latestResumeImportRun={{
            id: 'resume_import_run_1',
            sourceResumeId: 'resume_3',
            sourceResumeFileName: 'alex-vanguard.txt',
            trigger: 'import',
            status: 'applied',
            startedAt: '2026-03-20T10:00:00.000Z',
            completedAt: '2026-03-20T10:00:03.000Z',
            primaryParserKind: 'plain_text',
            parserKinds: ['plain_text'],
            analysisProviderKind: 'deterministic',
            analysisProviderLabel: 'Test AI',
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          }}
          onAnalyzeProfileFromResume={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      )
    })

    expect(container?.textContent).toContain('0 auto-applied, import ready to use.')
  })
})
