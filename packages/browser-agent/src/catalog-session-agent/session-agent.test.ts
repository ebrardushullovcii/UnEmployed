import type {
  BrowserSessionState,
  JobPosting,
  ResumeExportArtifact,
  SavedJob,
} from '@unemployed/contracts'
import { describe, expect, test } from 'vitest'
import { createProfile } from '../agent.test-fixtures'
import { createCatalogSessionAgent } from './session-agent'

function createReadySession(): BrowserSessionState {
  return {
    source: 'target_site',
    status: 'ready',
    driver: 'catalog_seed',
    label: 'Ready',
    detail: 'Catalog session is ready.',
    lastCheckedAt: '2026-04-15T10:00:00.000Z',
  }
}

function createBlockedSession(): BrowserSessionState {
  return {
    ...createReadySession(),
    status: 'blocked',
    label: 'Blocked',
    detail: 'Sign-in is required before automation can continue.',
  }
}

function createCatalogJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    source: 'target_site',
    sourceJobId: 'catalog_job_1',
    discoveryMethod: 'catalog_seed',
    canonicalUrl: 'https://jobs.example.com/roles/catalog_job_1',
    applicationUrl: 'https://jobs.example.com/roles/catalog_job_1/apply',
    title: 'Lead Designer',
    company: 'Signal Systems',
    location: 'Remote',
    workMode: ['remote'],
    applyPath: 'easy_apply',
    easyApplyEligible: true,
    postedAt: null,
    postedAtText: null,
    discoveredAt: '2026-03-20T10:01:00.000Z',
    firstSeenAt: '2026-03-20T10:01:00.000Z',
    lastSeenAt: '2026-03-20T10:01:00.000Z',
    lastVerifiedActiveAt: '2026-03-20T10:01:00.000Z',
    salaryText: '$180k',
    normalizedCompensation: {
      currency: 'USD',
      interval: 'year',
      minAmount: 180000,
      maxAmount: 180000,
      minAnnualUsd: 180000,
      maxAnnualUsd: 180000,
    },
    description: 'Lead product design for operational software.',
    summary: 'Lead product design.',
    keySkills: ['Figma'],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: [],
    },
    keywordSignals: [],
    benefits: [],
    ...overrides,
  }
}

function createSavedJob(overrides: Partial<SavedJob> = {}): SavedJob {
  return {
    id: 'job_1',
    source: 'target_site',
    sourceJobId: 'target_job_1',
    discoveryMethod: 'catalog_seed',
    canonicalUrl: 'https://jobs.example.com/roles/target_job_1',
    applicationUrl: 'https://jobs.example.com/roles/target_job_1/apply',
    title: 'Lead Designer',
    company: 'Signal Systems',
    location: 'Remote',
    workMode: ['remote'],
    applyPath: 'easy_apply',
    easyApplyEligible: true,
    postedAt: '2026-03-20T10:00:00.000Z',
    postedAtText: null,
    discoveredAt: '2026-03-20T10:01:00.000Z',
    firstSeenAt: '2026-03-20T10:01:00.000Z',
    lastSeenAt: '2026-03-20T10:01:00.000Z',
    lastVerifiedActiveAt: '2026-03-20T10:01:00.000Z',
    salaryText: '$180k',
    normalizedCompensation: {
      currency: 'USD',
      interval: 'year',
      minAmount: 180000,
      maxAmount: 180000,
      minAnnualUsd: 180000,
      maxAnnualUsd: 180000,
    },
    summary: 'Lead product design.',
    description: 'Lead product design for operational software.',
    keySkills: ['Figma'],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: [],
    },
    keywordSignals: [],
    benefits: [],
    status: 'ready_for_review',
    matchAssessment: {
      score: 94,
      reasons: ['Strong overlap'],
      gaps: [],
    },
    provenance: [],
    ...overrides,
  }
}

function createResumeExportArtifact(): ResumeExportArtifact {
  return {
    id: 'resume_export_1',
    draftId: 'resume_draft_1',
    jobId: 'job_1',
    format: 'pdf',
    filePath: '/tmp/resume.pdf',
    pageCount: 2,
    templateId: 'classic_ats',
    exportedAt: '2026-03-20T10:07:00.000Z',
    isApproved: true,
  }
}

describe('createCatalogSessionAgent', () => {
  test('rejects promise-based discovery calls when the session is not ready', async () => {
    const agent = createCatalogSessionAgent({
      getSessionState: () => createBlockedSession(),
      listCatalogJobs: () => [],
    })

    await expect(
      agent.runDiscovery('target_site', {
        targetRoles: ['Designer'],
        jobFamilies: [],
        locations: ['Remote'],
        workModes: ['remote'],
        seniorityLevels: [],
        targetIndustries: [],
        targetCompanyStages: [],
        employmentTypes: [],
        companyBlacklist: [],
        companyWhitelist: [],
        excludedLocations: [],
        minimumSalaryUsd: null,
        targetSalaryUsd: null,
        salaryCurrency: 'USD',
        approvalMode: 'review_before_submit',
        tailoringMode: 'balanced',
        discovery: {
          targets: [],
          historyLimit: 5,
        },
      }),
    ).rejects.toThrow(/not ready for automation/i)
  })

  test('pauses when detected screening questions extend beyond the old keyword shortlist', async () => {
    const agent = createCatalogSessionAgent({
      getSessionState: () => createReadySession(),
      listCatalogJobs: () => [],
    })

    const result = await agent.executeEasyApply('target_site', {
      job: createSavedJob({
        description:
          'Lead product design for operational software. This application asks about relocation support before submission.',
      }),
      resumeExport: createResumeExportArtifact(),
      resumeFilePath: '/tmp/resume.pdf',
      profile: createProfile(),
      settings: {
        resumeFormat: 'pdf',
        resumeTemplateId: 'classic_ats',
        fontPreset: 'inter_requisite',
        appearanceTheme: 'system',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: true,
        discoveryOnly: false,
      },
    })

    expect(result.state).toBe('paused')
    expect(result.blocker?.code).toBe('requires_manual_review')
    expect(result.questions).toEqual([
      expect.objectContaining({
        kind: 'relocation',
        status: 'detected',
      }),
    ])
    expect(result.nextActionLabel).toMatch(/finish the unsupported fields manually/i)
  })

  test('rejects easy apply when the session is not ready', async () => {
    const agent = createCatalogSessionAgent({
      getSessionState: () => createBlockedSession(),
      listCatalogJobs: () => [],
    })

    await expect(
      agent.executeEasyApply('target_site', {
        job: createSavedJob(),
        resumeExport: createResumeExportArtifact(),
        resumeFilePath: '/tmp/resume.pdf',
        profile: createProfile(),
        settings: {
          resumeFormat: 'pdf',
          resumeTemplateId: 'classic_ats',
          fontPreset: 'inter_requisite',
          appearanceTheme: 'system',
          humanReviewRequired: true,
          allowAutoSubmitOverride: false,
          keepSessionAlive: true,
          discoveryOnly: false,
        },
      }),
    ).rejects.toThrow(/not ready for automation/i)
  })

  test('runAgentDiscovery rejects when no starting URL is provided', async () => {
    const agent = createCatalogSessionAgent({
      getSessionState: () => createReadySession(),
      listCatalogJobs: () => [],
    })

    await expect(
      agent.runAgentDiscovery('target_site', {
        searchPreferences: {
          targetRoles: ['Designer'],
          locations: ['Remote'],
        },
        targetJobCount: 5,
        startingUrls: [],
        siteLabel: 'Target Site',
      }),
    ).rejects.toThrow(/requires at least one starting URL/i)
  })

  test('runAgentDiscovery only returns easy apply eligible jobs', async () => {
    const agent = createCatalogSessionAgent({
      getSessionState: () => createReadySession(),
      listCatalogJobs: () => [
        createCatalogJob(),
        createCatalogJob({
          sourceJobId: 'catalog_job_2',
          canonicalUrl: 'https://jobs.example.com/roles/catalog_job_2',
          easyApplyEligible: false,
        }),
        createCatalogJob({
          sourceJobId: 'catalog_job_3',
          canonicalUrl: 'https://jobs.example.com/roles/catalog_job_3',
          applicationUrl: 'https://jobs.example.com/roles/catalog_job_3/apply',
          applyPath: 'external_redirect',
        }),
      ],
    })

    const result = await agent.runAgentDiscovery('target_site', {
      searchPreferences: {
        targetRoles: ['Designer'],
        locations: ['Remote'],
      },
      targetJobCount: 5,
      startingUrls: ['https://jobs.example.com/search'],
      siteLabel: 'Target Site',
    })

    expect(result.jobs).toHaveLength(1)
    expect(result.jobs[0]?.sourceJobId).toBe('catalog_job_1')
  })
})
