import { describe, expect, test } from 'vitest'
import {
  ApplicationAttemptSchema,
  ApplicationStatusSchema,
  CandidateProfileSchema,
  DesktopWindowControlsStateSchema,
  DiscoveryRunResultSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  applicationStatusValues
} from './index'

describe('contracts', () => {
  test('supports the full application status list', () => {
    expect(applicationStatusValues).toContain('submitted')
    expect(ApplicationStatusSchema.parse('interview')).toBe('interview')
  })

  test('parses an expanded candidate profile', () => {
    const profile = CandidateProfileSchema.parse({
      id: 'candidate_1',
      firstName: 'Alex',
      lastName: 'Vanguard',
      middleName: null,
      fullName: 'Alex Vanguard',
      headline: 'Full-stack engineer',
      summary: 'Builds reliable user-facing systems.',
      currentLocation: 'London, UK',
      yearsExperience: 8,
      baseResume: {
        id: 'resume_1',
        fileName: 'alex-vanguard.pdf',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        storagePath: '/tmp/alex-vanguard.pdf'
      },
      targetRoles: ['Frontend Engineer'],
      experiences: [],
      education: [],
      certifications: [],
      links: []
    })

    expect(profile.baseResume.storagePath).toBe('/tmp/alex-vanguard.pdf')
    expect(profile.baseResume.extractionStatus).toBe('not_started')
    expect(profile.email).toBeNull()
    expect(profile.locations).toEqual([])
    expect(profile.skills).toEqual([])
    expect(profile.experiences).toEqual([])
    expect(profile.education).toEqual([])
  })

  test('applies defaults for job search preferences', () => {
    const preferences = JobSearchPreferencesSchema.parse({
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      minimumSalaryUsd: null
    })

    expect(preferences.companyBlacklist).toEqual([])
    expect(preferences.workModes).toEqual([])
  })

  test('parses a discovery run result and application attempt', () => {
    const discovery = DiscoveryRunResultSchema.parse({
      source: 'linkedin',
      startedAt: '2026-03-20T10:00:00.000Z',
      completedAt: '2026-03-20T10:01:00.000Z',
      querySummary: 'Designer | Remote | remote',
      warning: null,
      jobs: [
        {
          source: 'linkedin',
          sourceJobId: 'linkedin_job_1',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_job_1',
          title: 'Senior Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: 'remote',
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:01:00.000Z',
          salaryText: '$180k - $220k',
          summary: 'Own the design system.',
          description: 'Own the design system and workflow platform.',
          keySkills: ['Figma']
        }
      ]
    })

    const attempt = ApplicationAttemptSchema.parse({
      id: 'attempt_1',
      jobId: 'job_1',
      state: 'submitted',
      summary: 'Easy Apply submitted',
      detail: 'Submitted successfully.',
      startedAt: '2026-03-20T10:02:00.000Z',
      updatedAt: '2026-03-20T10:03:00.000Z',
      completedAt: '2026-03-20T10:03:00.000Z',
      outcome: 'submitted',
      nextActionLabel: 'Monitor inbox',
      checkpoints: [
        {
          id: 'checkpoint_1',
          at: '2026-03-20T10:03:00.000Z',
          label: 'Submission confirmed',
          detail: 'The supported path completed successfully.',
          state: 'submitted'
        }
      ]
    })

    expect(discovery.jobs[0]?.easyApplyEligible).toBe(true)
    expect(attempt.checkpoints[0]?.state).toBe('submitted')
  })

  test('parses a job finder workspace snapshot', () => {
    const attempt = ApplicationAttemptSchema.parse({
      id: 'attempt_1',
      jobId: 'job_1',
      state: 'submitted',
      summary: 'Easy Apply submitted',
      detail: 'Submitted successfully.',
      startedAt: '2026-03-20T10:02:00.000Z',
      updatedAt: '2026-03-20T10:03:00.000Z',
      completedAt: '2026-03-20T10:03:00.000Z',
      outcome: 'submitted',
      nextActionLabel: 'Monitor inbox',
      checkpoints: [
        {
          id: 'checkpoint_1',
          at: '2026-03-20T10:03:00.000Z',
          label: 'Submission confirmed',
          detail: 'The supported path completed successfully.',
          state: 'submitted'
        }
      ]
    })

    const workspace = JobFinderWorkspaceSnapshotSchema.parse({
      module: 'job-finder',
      generatedAt: '2026-03-20T10:05:00.000Z',
      agentProvider: {
        kind: 'deterministic',
        ready: true,
        label: 'Built-in deterministic agent fallback',
        model: null,
        baseUrl: null,
        detail: 'Tests'
      },
      availableResumeTemplates: [
        {
          id: 'classic_ats',
          label: 'Classic ATS',
          description: 'Single-column and ATS-friendly.'
        }
      ],
      profile: {
        id: 'candidate_1',
        firstName: 'Alex',
        lastName: 'Vanguard',
        middleName: null,
        fullName: 'Alex Vanguard',
        headline: 'Senior systems designer',
        summary: 'Builds resilient workflows.',
        currentLocation: 'London, UK',
        yearsExperience: 10,
        email: 'alex@example.com',
        phone: null,
        portfolioUrl: null,
        linkedinUrl: null,
        baseResume: {
          id: 'resume_1',
          fileName: 'alex-vanguard.pdf',
          uploadedAt: '2026-03-20T10:00:00.000Z',
          storagePath: '/tmp/alex-vanguard.pdf',
          textContent: 'Resume text',
          textUpdatedAt: '2026-03-20T10:00:00.000Z',
          extractionStatus: 'ready',
          lastAnalyzedAt: '2026-03-20T10:01:00.000Z',
          analysisWarnings: []
        },
        targetRoles: ['Principal Designer'],
        locations: ['Remote'],
        skills: ['Figma', 'React'],
        experiences: [
          {
            id: 'experience_1',
            companyName: 'Signal Systems',
            title: 'Senior Product Designer',
            employmentType: 'Full-time',
            location: 'London, UK',
            workMode: 'hybrid',
            startDate: '2021-01',
            endDate: null,
            isCurrent: true,
            summary: 'Owns workflow tooling and design systems.',
            achievements: ['Improved designer-engineer handoff quality'],
            skills: ['Figma', 'Design Systems']
          }
        ],
        education: [
          {
            id: 'education_1',
            schoolName: 'University of the Arts London',
            degree: 'BA',
            fieldOfStudy: 'Interaction Design',
            location: 'London, UK',
            startDate: '2010-09',
            endDate: '2013-06',
            summary: null
          }
        ],
        certifications: [
          {
            id: 'certification_1',
            name: 'UX Certification',
            issuer: 'NN/g',
            issueDate: '2020-04',
            expiryDate: null,
            credentialUrl: null
          }
        ],
        links: [
          {
            id: 'link_1',
            label: 'Portfolio',
            url: 'https://alex.example.com',
            kind: 'portfolio'
          }
        ]
      },
      searchPreferences: {
        targetRoles: ['Principal Designer'],
        locations: ['Remote'],
        workModes: ['remote'],
        seniorityLevels: ['senior'],
        minimumSalaryUsd: 170000,
        approvalMode: 'review_before_submit',
        tailoringMode: 'balanced',
        companyBlacklist: [],
        companyWhitelist: []
      },
      browserSession: {
        source: 'linkedin',
        status: 'ready',
        driver: 'catalog_seed',
        label: 'Browser session ready',
        detail: 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      },
      discoveryJobs: [
        {
          id: 'job_1',
          source: 'linkedin',
          sourceJobId: 'linkedin_job_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_job_1',
          title: 'Senior Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: 'remote',
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:01:00.000Z',
          salaryText: '$180k - $220k',
          summary: 'Own the design system.',
          description: 'Own the design system and workflow platform.',
          keySkills: ['Figma'],
          status: 'ready_for_review',
          matchAssessment: {
            score: 96,
            reasons: ['Strong product design overlap'],
            gaps: []
          }
        }
      ],
      selectedDiscoveryJobId: 'job_1',
      reviewQueue: [
        {
          jobId: 'job_1',
          title: 'Senior Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          matchScore: 96,
          applicationStatus: 'ready_for_review',
          assetStatus: 'ready',
          progressPercent: 100,
          resumeAssetId: 'asset_1',
          updatedAt: '2026-03-20T10:03:00.000Z'
        }
      ],
      selectedReviewJobId: 'job_1',
      tailoredAssets: [
        {
          id: 'asset_1',
          jobId: 'job_1',
          kind: 'resume',
          status: 'ready',
          label: 'Tailored Resume',
          version: 'v1',
          templateName: 'Classic ATS',
          compatibilityScore: 98,
          progressPercent: 100,
          updatedAt: '2026-03-20T10:03:00.000Z',
          storagePath: null,
          contentText: 'Tailored resume body',
          generationMethod: 'ai_assisted',
          notes: ['Generated from stored resume text.'],
          previewSections: [
            {
              heading: 'Summary',
              lines: ['Lead cross-functional UX systems work.']
            }
          ]
        }
      ],
      applicationRecords: [
        {
          id: 'application_1',
          jobId: 'job_5',
          title: 'Lead Product Designer',
          company: 'Northwind Labs',
          status: 'interview',
          lastActionLabel: 'Technical screen scheduled',
          nextActionLabel: 'Join meeting',
          lastUpdatedAt: '2026-03-20T10:04:00.000Z',
          lastAttemptState: 'submitted',
          events: [
            {
              id: 'event_1',
              at: '2026-03-20T10:04:00.000Z',
              title: 'Technical screen scheduled',
              detail: 'Interview confirmed for tomorrow.',
              emphasis: 'positive'
            }
          ]
        }
      ],
      applicationAttempts: [attempt],
      selectedApplicationRecordId: 'application_1',
      settings: {
        resumeFormat: 'html',
        resumeTemplateId: 'classic_ats',
        fontPreset: 'inter_requisite',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: true
      }
    })

    expect(workspace.discoveryJobs).toHaveLength(1)
    expect(workspace.reviewQueue[0]?.assetStatus).toBe('ready')
    expect(workspace.applicationAttempts[0]?.state).toBe('submitted')
  })

  test('parses desktop window controls state', () => {
    const controlsState = DesktopWindowControlsStateSchema.parse({
      isMaximized: false,
      isMinimizable: true,
      isClosable: true
    })

    expect(controlsState.isClosable).toBe(true)
  })
})
