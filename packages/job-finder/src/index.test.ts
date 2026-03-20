import { describe, expect, test } from 'vitest'
import { createStubBrowserSessionRuntime } from '@unemployed/browser-runtime'
import { createInMemoryJobFinderRepository } from '@unemployed/db'
import type { JobFinderRepositorySeed } from '@unemployed/db'
import { createJobFinderWorkspaceService } from './index'

function createSeed(): JobFinderRepositorySeed {
  return {
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
    savedJobs: [
      {
        id: 'job_ready',
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
          reasons: ['Strong design systems overlap'],
          gaps: []
        }
      },
      {
        id: 'job_generating',
        source: 'linkedin',
        title: 'Principal UX Engineer',
        company: 'Northwind Labs',
        location: 'Hybrid',
        workMode: 'hybrid',
        applyPath: 'easy_apply',
        postedAt: '2026-03-20T08:00:00.000Z',
        salaryText: '$165k - $205k',
        summary: 'Lead cross-functional UI platform work.',
        keySkills: ['React'],
        status: 'drafting',
        matchAssessment: {
          score: 88,
          reasons: ['Strong platform overlap'],
          gaps: ['Accessibility leadership']
        }
      },
      {
        id: 'job_shortlisted',
        source: 'linkedin',
        title: 'Lead Interface Architect',
        company: 'Cloudline',
        location: 'London',
        workMode: 'hybrid',
        applyPath: 'easy_apply',
        postedAt: '2026-03-19T12:00:00.000Z',
        salaryText: null,
        summary: 'Steer enterprise dashboard modernization.',
        keySkills: ['Design Systems'],
        status: 'shortlisted',
        matchAssessment: {
          score: 79,
          reasons: ['Good leadership overlap'],
          gaps: ['Cloud migration depth']
        }
      }
    ],
    tailoredAssets: [
      {
        id: 'asset_ready',
        jobId: 'job_ready',
        kind: 'resume',
        status: 'ready',
        label: 'Tailored Resume',
        version: 'v2',
        templateName: 'Classic ATS',
        compatibilityScore: 97,
        progressPercent: 100,
        updatedAt: '2026-03-20T10:01:00.000Z',
        previewSections: []
      },
      {
        id: 'asset_generating',
        jobId: 'job_generating',
        kind: 'resume',
        status: 'generating',
        label: 'Tailored Resume',
        version: 'v1',
        templateName: 'Classic ATS',
        compatibilityScore: null,
        progressPercent: 62,
        updatedAt: '2026-03-20T10:02:00.000Z',
        previewSections: []
      }
    ],
    applicationRecords: [
      {
        id: 'application_1',
        jobId: 'job_applied',
        title: 'Lead Product Designer',
        company: 'Atlas Systems',
        status: 'submitted',
        lastActionLabel: 'Submitted via Easy Apply',
        nextActionLabel: 'Monitor inbox',
        lastUpdatedAt: '2026-03-20T10:03:00.000Z',
        events: []
      }
    ],
    settings: {
      resumeFormat: 'pdf',
      fontPreset: 'inter_requisite',
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true
    }
  }
}

describe('createJobFinderWorkspaceService', () => {
  test('builds a snapshot with derived review queue ordering', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createStubBrowserSessionRuntime({
      sessions: [
        {
          source: 'linkedin',
          status: 'ready',
          label: 'Browser session ready',
          detail: 'Validated recently.',
          lastCheckedAt: '2026-03-20T10:04:00.000Z'
        }
      ]
    })
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    const snapshot = await workspaceService.getWorkspaceSnapshot()

    expect(snapshot.discoveryJobs).toHaveLength(3)
    expect(snapshot.reviewQueue).toHaveLength(2)
    expect(snapshot.reviewQueue[0]?.jobId).toBe('job_ready')
    expect(snapshot.reviewQueue[1]?.assetStatus).toBe('generating')
    expect(snapshot.selectedApplicationRecordId).toBe('application_1')
  })

  test('can move a discovery job into review and submit a ready application', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createStubBrowserSessionRuntime({
      sessions: [
        {
          source: 'linkedin',
          status: 'ready',
          label: 'Browser session ready',
          detail: 'Validated recently.',
          lastCheckedAt: '2026-03-20T10:04:00.000Z'
        }
      ]
    })
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    await workspaceService.queueJobForReview('job_shortlisted')
    await workspaceService.generateResume('job_shortlisted')
    const snapshot = await workspaceService.approveApply('job_shortlisted')

    expect(snapshot.reviewQueue.some((item) => item.jobId === 'job_shortlisted')).toBe(false)
    expect(snapshot.discoveryJobs.some((job) => job.id === 'job_shortlisted')).toBe(false)
    expect(snapshot.applicationRecords.some((record) => record.jobId === 'job_shortlisted')).toBe(true)
  })
})
