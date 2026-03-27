import { createDeterministicJobFinderAiClient, type JobFinderAiClient, type ResumeProfileExtraction } from '@unemployed/ai-providers'
import { describe, expect, test } from 'vitest'
import { createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
import { createInMemoryJobFinderRepository } from '@unemployed/db'
import type { JobFinderRepositorySeed } from '@unemployed/db'
import { createJobFinderWorkspaceService } from './index'

function createSeed(): JobFinderRepositorySeed {
  return {
    profile: {
      id: 'candidate_1',
      firstName: 'Alex',
      lastName: 'Vanguard',
      middleName: null,
      fullName: 'Alex Vanguard',
      preferredDisplayName: null,
      headline: 'Senior systems designer',
      summary: 'Builds resilient workflows.',
      currentLocation: 'London, UK',
      currentCity: null,
      currentRegion: null,
      currentCountry: null,
      timeZone: null,
      yearsExperience: 10,
      email: 'alex@example.com',
      secondaryEmail: null,
      phone: '+44 7700 900123',
      portfolioUrl: 'https://alex.example.com',
      linkedinUrl: 'https://www.linkedin.com/in/alex-vanguard',
      githubUrl: null,
      personalWebsiteUrl: null,
      baseResume: {
        id: 'resume_1',
        fileName: 'alex-vanguard.pdf',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        storagePath: '/tmp/alex-vanguard.pdf',
        textContent:
          'Alex Vanguard\nSenior systems designer\nLondon, UK\nalex@example.com\n+44 7700 900123\nhttps://alex.example.com\nhttps://www.linkedin.com/in/alex-vanguard\n\n10 years of experience building resilient workflow tools with Figma, React, and design systems.',
        textUpdatedAt: '2026-03-20T10:00:00.000Z',
        extractionStatus: 'ready',
        lastAnalyzedAt: '2026-03-20T10:01:00.000Z',
        analysisProviderKind: null,
        analysisProviderLabel: null,
        analysisWarnings: []
      },
      workEligibility: {
        authorizedWorkCountries: [],
        requiresVisaSponsorship: null,
        willingToRelocate: null,
        preferredRelocationRegions: [],
        willingToTravel: null,
        remoteEligible: null,
        noticePeriodDays: null,
        availableStartDate: null,
        securityClearance: null
      },
      professionalSummary: {
        shortValueProposition: null,
        fullSummary: null,
        careerThemes: [],
        leadershipSummary: null,
        domainFocusSummary: null,
        strengths: []
      },
      skillGroups: {
        coreSkills: [],
        tools: [],
        languagesAndFrameworks: [],
        softSkills: [],
        highlightedSkills: []
      },
      targetRoles: ['Principal Designer'],
      locations: ['Remote'],
      skills: ['Figma', 'React', 'Design Systems'],
      experiences: [
        {
          id: 'experience_1',
          companyName: 'Signal Systems',
          companyUrl: null,
          title: 'Senior systems designer',
          employmentType: 'Full-time',
          location: 'London, UK',
          workMode: ['hybrid'],
          startDate: '2020-01',
          endDate: null,
          isCurrent: true,
          isDraft: false,
          summary: 'Builds resilient workflow tools.',
          achievements: ['Led design-system rollout across core surfaces.'],
          skills: ['Figma', 'Design Systems'],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null
        }
      ],
      education: [
        {
          id: 'education_1',
          schoolName: 'Royal College of Art',
          degree: 'MA',
          fieldOfStudy: 'Design Products',
          location: 'London, UK',
          startDate: '2012-09',
          endDate: '2014-06',
          isDraft: false,
          summary: null
        }
      ],
      certifications: [],
      links: [
        {
          id: 'link_1',
          label: 'Portfolio',
          url: 'https://alex.example.com',
          kind: 'portfolio',
          isDraft: false
        }
      ],
      projects: [],
      spokenLanguages: []
    },
    searchPreferences: {
      targetRoles: ['Principal Designer', 'Senior Product Designer', 'Principal UX Engineer'],
      jobFamilies: [],
      locations: ['Remote', 'London'],
      excludedLocations: [],
      workModes: ['remote', 'hybrid'],
      seniorityLevels: ['senior'],
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      minimumSalaryUsd: 170000,
      targetSalaryUsd: null,
      salaryCurrency: 'USD',
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      companyBlacklist: [],
      companyWhitelist: ['Signal Systems'],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: 'target_linkedin_default',
            label: 'LinkedIn Jobs',
            startingUrl: 'https://www.linkedin.com/jobs/search/',
            enabled: true,
            adapterKind: 'auto',
            customInstructions: null
          }
        ]
      }
    },
    savedJobs: [
      {
        id: 'job_ready',
        source: 'linkedin',
        sourceJobId: 'linkedin_signal_ready',
        discoveryMethod: 'catalog_seed',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_signal_ready',
        title: 'Senior Product Designer',
        company: 'Signal Systems',
        location: 'Remote',
        workMode: ['remote'],
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
        },
        provenance: []
      },
      {
        id: 'job_generating',
        source: 'linkedin',
        sourceJobId: 'linkedin_northwind_generating',
        discoveryMethod: 'catalog_seed',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_northwind_generating',
        title: 'Principal UX Engineer',
        company: 'Northwind Labs',
        location: 'Hybrid, London',
        workMode: ['hybrid'],
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
        },
        provenance: []
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
        previewSections: [],
        generationMethod: 'deterministic',
        notes: []
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
        previewSections: [],
        generationMethod: 'deterministic',
        notes: []
      }
    ],
    applicationRecords: [],
    applicationAttempts: [],
    settings: {
      resumeFormat: 'html',
      resumeTemplateId: 'classic_ats',
      fontPreset: 'inter_requisite',
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: false
    },
    discovery: {
      sessions: [],
      runState: 'idle',
      activeRun: null,
      recentRuns: [],
      pendingDiscoveryJobs: []
    }
  }
}

function createBrowserRuntime() {
  return createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: 'linkedin',
        status: 'ready',
        driver: 'catalog_seed',
        label: 'Browser session ready',
        detail: 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      }
    ],
    catalog: [
      {
        source: 'linkedin',
        sourceJobId: 'linkedin_signal_ready',
        discoveryMethod: 'catalog_seed',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_signal_ready',
        title: 'Senior Product Designer',
        company: 'Signal Systems',
        location: 'Remote',
        workMode: ['remote'],
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
        discoveryMethod: 'catalog_seed',
        canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_pause_case',
        title: 'Principal UX Engineer',
        company: 'Void Industries',
        location: 'Remote',
        workMode: ['remote'],
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

function createAiClient() {
  return createDeterministicJobFinderAiClient('Tests use the deterministic fallback agent.')
}

function createResumeExtraction(overrides: Partial<ResumeProfileExtraction> = {}): ResumeProfileExtraction {
  return {
    firstName: null,
    lastName: null,
    middleName: null,
    fullName: null,
    headline: null,
    summary: null,
    currentLocation: null,
    timeZone: null,
    salaryCurrency: null,
    yearsExperience: null,
    email: null,
    phone: null,
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: []
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: []
    },
    skills: [],
    targetRoles: [],
    preferredLocations: [],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
    analysisProviderKind: 'deterministic',
    analysisProviderLabel: 'Stub extraction',
    notes: [],
    ...overrides
  }
}

function createExtractionAiClient(extraction: ResumeProfileExtraction): JobFinderAiClient {
  const fallbackClient = createDeterministicJobFinderAiClient('Tests use the deterministic fallback agent.')

  return {
    ...fallbackClient,
    extractProfileFromResume: () => Promise.resolve(extraction)
  }
}

function createDocumentManager() {
  return {
    listResumeTemplates() {
      return [
        {
          id: 'classic_ats' as const,
          label: 'Classic ATS',
          description: 'Single-column and ATS-friendly.'
        }
      ]
    },
    renderResumeArtifact() {
      return Promise.resolve({
        fileName: 'generated-resume.html',
        storagePath: '/tmp/generated-resume.html'
      })
    }
  }
}

describe('createJobFinderWorkspaceService', () => {
  test('builds a snapshot with derived review queue ordering', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

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
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runDiscovery()

    expect(snapshot.discoveryJobs).toHaveLength(2)
    expect(snapshot.discoveryJobs[0]?.canonicalUrl).toContain('linkedin_signal_ready')
    expect(snapshot.discoveryJobs[0]?.matchAssessment.reasons.length).toBeGreaterThan(0)
  })

  test('discovery-only mode treats jobs as pending and does not persist to saved jobs', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      settings: {
        resumeFormat: 'html',
        resumeTemplateId: 'classic_ats',
        fontPreset: 'inter_requisite',
        humanReviewRequired: true,
        allowAutoSubmitOverride: false,
        keepSessionAlive: true,
        discoveryOnly: true
      },
      savedJobs: [],
      tailoredAssets: [],
      applicationRecords: [],
      applicationAttempts: []
    })
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runDiscovery()

    // Jobs should appear in discoveryJobs but not in savedJobs
    expect(snapshot.discoveryJobs).toHaveLength(2)
    expect(snapshot.discoveryJobs[0]?.status).toBe('discovered')

    // Verify jobs are pending (can be reviewed/queued) rather than auto-saved
    expect(snapshot.reviewQueue).toHaveLength(0)
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0)

    // Ensure no application records or attempts were created
    expect(snapshot.applicationRecords).toHaveLength(0)
    expect(snapshot.applicationAttempts).toHaveLength(0)
  })

  test('generates a tailored resume and submits a supported Easy Apply attempt', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    await workspaceService.generateResume('job_ready')
    const snapshot = await workspaceService.approveApply('job_ready')
    const tailoredAsset = snapshot.tailoredAssets.find((asset) => asset.jobId === 'job_ready')

    expect(snapshot.discoveryJobs.some((job) => job.id === 'job_ready')).toBe(false)
    expect(snapshot.applicationRecords.some((record) => record.jobId === 'job_ready')).toBe(true)
    expect(snapshot.applicationAttempts[0]?.state).toBe('submitted')
    expect(tailoredAsset?.storagePath).toBe('/tmp/generated-resume.html')
  })

  test('pauses unsupported Easy Apply branches instead of submitting blindly', async () => {
    const seed = createSeed()
    seed.savedJobs.push({
      source: 'linkedin',
      sourceJobId: 'linkedin_pause_case',
      discoveryMethod: 'catalog_seed',
      canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_pause_case',
      id: 'job_pause_case',
      title: 'Principal UX Engineer',
      company: 'Void Industries',
      location: 'Remote',
      workMode: ['remote'],
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
      },
      provenance: []
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
      previewSections: [],
      generationMethod: 'deterministic',
      notes: []
    })

    const repository = createInMemoryJobFinderRepository(seed)
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.approveApply('job_pause_case')
    const applicationRecord = snapshot.applicationRecords.find((record) => record.jobId === 'job_pause_case')

    expect(applicationRecord?.lastAttemptState).toBe('paused')
    expect(applicationRecord?.status).toBe('approved')
    expect(snapshot.applicationAttempts.some((attempt) => attempt.state === 'paused')).toBe(true)
  })

  test('extracts profile details from stored resume text', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      profile: {
        ...createSeed().profile,
        fullName: 'Candidate',
        headline: 'Placeholder headline',
        email: null,
        phone: null,
        portfolioUrl: null,
        linkedinUrl: null,
        baseResume: {
          ...createSeed().profile.baseResume,
          extractionStatus: 'not_started',
          lastAnalyzedAt: null,
          textContent:
            'Jamie Rivers\nStaff Frontend Engineer\nBerlin, Germany\njamie@example.com\n+49 555 1234\nhttps://jamie.dev\nhttps://www.linkedin.com/in/jamie-rivers\n\n12 years of experience building React, TypeScript, and design systems for product teams.'
        }
      }
    })
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.analyzeProfileFromResume()

    expect(snapshot.profile.fullName).toBe('Jamie Rivers')
    expect(snapshot.profile.headline).toContain('Engineer')
    expect(snapshot.profile.email).toBe('jamie@example.com')
    expect(snapshot.profile.baseResume.extractionStatus).toBe('ready')
    expect(snapshot.profile.skillGroups.highlightedSkills.length).toBeGreaterThan(0)
    expect(snapshot.profile.professionalSummary.fullSummary).toContain('12 years of experience')
    expect(snapshot.searchPreferences.salaryCurrency).toBe('EUR')
  })

  test('maps two-part locations to city and region without forcing a country', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createExtractionAiClient(
        createResumeExtraction({
          currentLocation: 'New York, NY'
        })
      ),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.analyzeProfileFromResume()

    expect(snapshot.profile.currentCity).toBe('New York')
    expect(snapshot.profile.currentRegion).toBe('NY')
    expect(snapshot.profile.currentCountry).toBeNull()
  })

  test('keeps saved links, projects, and languages when extracted records are invalid', async () => {
    const seed = createSeed()
    seed.profile.projects = [
      {
        id: 'project_1',
        name: 'Signal Design System',
        projectType: 'Product',
        summary: 'Unified the product UI layer.',
        role: 'Lead designer',
        skills: ['Figma', 'React'],
        outcome: 'Improved release speed.',
        projectUrl: null,
        repositoryUrl: null,
        caseStudyUrl: null
      }
    ]
    seed.profile.spokenLanguages = [
      {
        id: 'language_1',
        language: 'English',
        proficiency: 'Native',
        interviewPreference: true,
        notes: null
      }
    ]

    const repository = createInMemoryJobFinderRepository(seed)
    const browserRuntime = createBrowserRuntime()
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createExtractionAiClient(
        createResumeExtraction({
          links: [{ label: 'Broken link', url: 'notaurl', kind: 'portfolio' }],
          projects: [
            {
              name: null,
              projectType: 'Portfolio',
              summary: 'Ignored project',
              role: null,
              skills: [],
              outcome: null,
              projectUrl: null,
              repositoryUrl: null,
              caseStudyUrl: null
            }
          ],
          spokenLanguages: [
            {
              language: null,
              proficiency: null,
              interviewPreference: false,
              notes: null
            }
          ]
        })
      ),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.analyzeProfileFromResume()

    expect(snapshot.profile.links).toEqual(seed.profile.links)
    expect(snapshot.profile.projects).toEqual(seed.profile.projects)
    expect(snapshot.profile.spokenLanguages).toEqual(seed.profile.spokenLanguages)
  })
})
