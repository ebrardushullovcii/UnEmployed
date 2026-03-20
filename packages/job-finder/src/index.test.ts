import { describe, expect, test } from 'vitest'
import { createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
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
        uploadedAt: '2026-03-20T10:00:00.000Z',
        storagePath: '/tmp/alex-vanguard.pdf'
      },
      targetRoles: ['Principal Designer'],
      locations: ['Remote'],
      skills: ['Figma', 'React', 'Design Systems']
    },
    searchPreferences: {
      targetRoles: ['Principal Designer', 'Senior Product Designer', 'Principal UX Engineer'],
      locations: ['Remote', 'London'],
      workModes: ['remote', 'hybrid'],
      seniorityLevels: ['senior'],
      minimumSalaryUsd: 170000,
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      companyBlacklist: [],
      companyWhitelist: ['Signal Systems']
    },
    savedJobs: [
      {
        id: 'job_ready',
        source: 'linkedin',
        sourceJobId: 'linkedin_signal_ready',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_signal_ready',
        title: 'Senior Product Designer',
        company: 'Signal Systems',
        location: 'Remote',
        workMode: 'remote',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        postedAt: '2026-03-20T09:00:00.000Z',
        discoveredAt: '2026-03-20T09:05:00.000Z',
        salaryText: '$180k - $220k',
        summary: 'Own the design system.',
        description: 'Own the design system and workflow platform.',
        keySkills: ['Figma', 'Design Systems'],
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
        sourceJobId: 'linkedin_northwind_generating',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_northwind_generating',
        title: 'Principal UX Engineer',
        company: 'Northwind Labs',
        location: 'Hybrid, London',
        workMode: 'hybrid',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        postedAt: '2026-03-20T08:00:00.000Z',
        discoveredAt: '2026-03-20T08:05:00.000Z',
        salaryText: '$175k - $205k',
        summary: 'Lead cross-functional UI platform work.',
        description: 'Lead cross-functional UI platform work with portfolio review required.',
        keySkills: ['React'],
        status: 'drafting',
        matchAssessment: {
          score: 88,
          reasons: ['Strong platform overlap'],
          gaps: ['Accessibility leadership']
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
        storagePath: null,
        contentText: 'Resume text',
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
        storagePath: null,
        contentText: null,
        previewSections: []
      }
    ],
    applicationRecords: [],
    applicationAttempts: [],
    settings: {
      resumeFormat: 'pdf',
      fontPreset: 'inter_requisite',
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true
    }
  }
}

function createBrowserRuntime() {
  return createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: 'linkedin',
        status: 'ready',
        label: 'Browser session ready',
        detail: 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      }
    ],
    catalog: [
      {
        source: 'linkedin',
        sourceJobId: 'linkedin_signal_ready',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_signal_ready',
        title: 'Senior Product Designer',
        company: 'Signal Systems',
        location: 'Remote',
        workMode: 'remote',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        postedAt: '2026-03-20T09:00:00.000Z',
        discoveredAt: '2026-03-20T10:04:00.000Z',
        salaryText: '$180k - $220k',
        summary: 'Own the design system.',
        description: 'Own the design system and workflow platform.',
        keySkills: ['Figma', 'Design Systems']
      },
      {
        source: 'linkedin',
        sourceJobId: 'linkedin_pause_case',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_pause_case',
        title: 'Principal UX Engineer',
        company: 'Void Industries',
        location: 'Remote',
        workMode: 'remote',
        applyPath: 'easy_apply',
        easyApplyEligible: true,
        postedAt: '2026-03-20T09:30:00.000Z',
        discoveredAt: '2026-03-20T10:04:00.000Z',
        salaryText: '$185k - $210k',
        summary: 'Lead UI platform work.',
        description: 'Lead UI platform work. Additional work authorization details are required during apply.',
        keySkills: ['React', 'Design Systems']
      }
    ]
  })
}

describe('createJobFinderWorkspaceService', () => {
  test('builds a snapshot with derived review queue ordering', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    const snapshot = await workspaceService.getWorkspaceSnapshot()

    expect(snapshot.discoveryJobs).toHaveLength(2)
    expect(snapshot.reviewQueue).toHaveLength(2)
    expect(snapshot.reviewQueue[0]?.jobId).toBe('job_ready')
    expect(snapshot.reviewQueue[1]?.assetStatus).toBe('generating')
  })

  test('runs discovery and upserts saved jobs from the adapter', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: [],
      applicationRecords: [],
      applicationAttempts: []
    })
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    const snapshot = await workspaceService.runDiscovery()

    expect(snapshot.discoveryJobs).toHaveLength(2)
    expect(snapshot.discoveryJobs[0]?.canonicalUrl).toContain('linkedin_signal_ready')
    expect(snapshot.discoveryJobs[0]?.matchAssessment.reasons.length).toBeGreaterThan(0)
  })

  test('generates a tailored resume and submits a supported Easy Apply attempt', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    const snapshot = await workspaceService.approveApply('job_ready')

    expect(snapshot.discoveryJobs.some((job) => job.id === 'job_ready')).toBe(false)
    expect(snapshot.applicationRecords.some((record) => record.jobId === 'job_ready')).toBe(true)
    expect(snapshot.applicationAttempts[0]?.state).toBe('submitted')
  })

  test('pauses unsupported Easy Apply branches instead of submitting blindly', async () => {
    const seed = createSeed()
    seed.savedJobs.push({
      source: 'linkedin',
      sourceJobId: 'linkedin_pause_case',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_pause_case',
      id: 'job_pause_case',
      title: 'Principal UX Engineer',
      company: 'Void Industries',
      location: 'Remote',
      workMode: 'remote',
      applyPath: 'easy_apply',
      easyApplyEligible: true,
      postedAt: '2026-03-20T09:30:00.000Z',
      discoveredAt: '2026-03-20T10:04:00.000Z',
      salaryText: '$185k - $210k',
      summary: 'Lead UI platform work.',
      description: 'Lead UI platform work. Additional work authorization details are required during apply.',
      keySkills: ['React', 'Design Systems'],
      status: 'approved',
      matchAssessment: {
        score: 91,
        reasons: ['Strong UI platform overlap'],
        gaps: []
      }
    })
    seed.tailoredAssets.push({
      id: 'asset_pause_case',
      jobId: 'job_pause_case',
      kind: 'resume',
      status: 'ready',
      label: 'Tailored Resume',
      version: 'v1',
      templateName: 'Classic ATS',
      compatibilityScore: 94,
      progressPercent: 100,
      updatedAt: '2026-03-20T10:04:00.000Z',
      storagePath: null,
      contentText: 'Resume text',
      previewSections: []
    })

    const repository = createInMemoryJobFinderRepository(seed)
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({ repository, browserRuntime })

    const snapshot = await workspaceService.approveApply('job_pause_case')
    const applicationRecord = snapshot.applicationRecords.find((record) => record.jobId === 'job_pause_case')

    expect(applicationRecord?.lastAttemptState).toBe('paused')
    expect(applicationRecord?.status).toBe('approved')
    expect(snapshot.applicationAttempts.some((attempt) => attempt.state === 'paused')).toBe(true)
  })
})
