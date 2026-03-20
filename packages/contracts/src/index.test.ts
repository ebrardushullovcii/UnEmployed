import { describe, expect, test } from 'vitest'
import {
  ApplicationStatusSchema,
  CandidateProfileSchema,
  DesktopWindowControlsStateSchema,
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
      fullName: 'Alex Vanguard',
      headline: 'Full-stack engineer',
      summary: 'Builds reliable user-facing systems.',
      currentLocation: 'London, UK',
      yearsExperience: 8,
      baseResume: {
        id: 'resume_1',
        fileName: 'alex-vanguard.pdf',
        uploadedAt: '2026-03-20T10:00:00.000Z'
      },
      targetRoles: ['Frontend Engineer']
    })

    expect(profile.targetRoles).toEqual(['Frontend Engineer'])
    expect(profile.locations).toEqual([])
    expect(profile.skills).toEqual([])
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

  test('parses a job finder workspace snapshot', () => {
    const workspace = JobFinderWorkspaceSnapshotSchema.parse({
      module: 'job-finder',
      generatedAt: '2026-03-20T10:05:00.000Z',
      profile: {
        id: 'candidate_1',
        fullName: 'Alex Vanguard',
        headline: 'Senior systems designer',
        summary: 'Builds resilient workflows.',
        currentLocation: 'London, UK',
        yearsExperience: 10,
        baseResume: {
          id: 'resume_1',
          fileName: 'alex-vanguard.pdf',
          uploadedAt: '2026-03-20T10:00:00.000Z'
        },
        targetRoles: ['Principal Designer'],
        locations: ['Remote'],
        skills: ['Figma', 'React']
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
        label: 'Browser session ready',
        detail: 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      },
      discoveryJobs: [
        {
          id: 'job_1',
          source: 'linkedin',
          title: 'Senior Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: 'remote',
          applyPath: 'easy_apply',
          postedAt: '2026-03-20T09:00:00.000Z',
          salaryText: '$180k - $220k',
          summary: 'Own the design system.',
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
      selectedApplicationRecordId: 'application_1',
      settings: {
        resumeFormat: 'pdf',
        fontPreset: 'inter_requisite',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: true
      }
    })

    expect(workspace.discoveryJobs).toHaveLength(1)
    expect(workspace.reviewQueue[0]?.assetStatus).toBe('ready')
    expect(workspace.applicationRecords[0]?.events[0]?.emphasis).toBe('positive')
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
