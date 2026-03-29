import { createDeterministicJobFinderAiClient, type JobFinderAiClient, type ResumeProfileExtraction } from '@unemployed/ai-providers'
import { describe, expect, test } from 'vitest'
import { createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
import { createInMemoryJobFinderRepository } from '@unemployed/db'
import type { JobFinderRepositorySeed } from '@unemployed/db'
import type { AgentDiscoveryOptions, BrowserSessionRuntime } from '@unemployed/browser-runtime'
import type {
  AgentDebugFindings,
  AgentDiscoveryProgress,
  DiscoveryActivityEvent,
  DiscoveryRunResult,
  JobPosting,
  SourceDebugCompactionState
} from '@unemployed/contracts'
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
            customInstructions: null,
            instructionStatus: 'missing',
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null
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
    sourceDebugRuns: [],
    sourceDebugAttempts: [],
    sourceInstructionArtifacts: [],
    sourceDebugEvidenceRefs: [],
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
      activeSourceDebugRun: null,
      recentSourceDebugRuns: [],
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

function createAgentAiClient() {
  const fallbackClient = createDeterministicJobFinderAiClient('Tests use the deterministic fallback agent.')

  return {
    ...fallbackClient,
    chatWithTools: () => Promise.resolve({ content: 'ok', toolCalls: [] })
  } satisfies JobFinderAiClient
}

function createAgentBrowserRuntime(
  catalog: readonly JobPosting[],
  runtimeOptions?: {
    sessionStatus?: 'ready' | 'login_required' | 'blocked'
    sessionDetail?: string
    compactionState?: SourceDebugCompactionState | null
    debugFindingsByPhase?: Partial<Record<string, AgentDebugFindings | null>>
  }
): BrowserSessionRuntime {
  const baseRuntime = createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: 'linkedin',
        status: runtimeOptions?.sessionStatus ?? 'ready',
        driver: 'catalog_seed',
        label: 'Browser session ready',
        detail: runtimeOptions?.sessionDetail ?? 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      }
    ],
    catalog: [...catalog]
  })

  return {
    ...baseRuntime,
    async runAgentDiscovery(source, options: AgentDiscoveryOptions): Promise<DiscoveryRunResult> {
      const phaseLabel = options.taskPacket?.strategyLabel ?? 'discovery'
      const phaseKey = phaseLabel.toLowerCase().replace(/\s+/g, '_')
      const debugFindings =
        runtimeOptions?.debugFindingsByPhase?.[phaseKey] ??
        runtimeOptions?.debugFindingsByPhase?.[phaseLabel] ??
        null
      const emitProgress = (progress: AgentDiscoveryProgress) => {
        options.onProgress?.(progress)
      }

      emitProgress({
        currentUrl: options.startingUrls[0] ?? 'https://www.linkedin.com/jobs/search/',
        jobsFound: 0,
        stepCount: 1,
        currentAction: 'navigate',
        targetId: null,
        adapterKind: source
      })

      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      await Promise.resolve()

      emitProgress({
        currentUrl: options.startingUrls[0] ?? 'https://www.linkedin.com/jobs/search/',
        jobsFound: catalog.length,
        stepCount: 2,
        currentAction: `extract_result:${catalog.length}:${catalog.length}:${catalog.length}`,
        targetId: null,
        adapterKind: source
      })

      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      return {
        source,
        startedAt: '2026-03-20T10:00:00.000Z',
        completedAt: '2026-03-20T10:01:00.000Z',
        querySummary: 'Agent discovery test run',
        warning: null,
        jobs: [...catalog],
        agentMetadata: {
          steps: 2,
          incomplete: false,
          transcriptMessageCount: 7,
          compactionState: runtimeOptions?.compactionState ?? null,
          debugFindings
        }
      }
    }
  }
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

function createStrongSourceDebugFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    access_auth_probe: {
      summary: 'Public job browsing is available without login or consent blockers.',
      reliableControls: ['The homepage and jobs navigation are accessible without authentication.'],
      trickyFilters: [],
      navigationTips: ['Confirm public access first, then move to the dedicated jobs/listings route for repeatable discovery.'],
      applyTips: [],
      warnings: []
    },
    site_structure_mapping: {
      summary: 'Use the dedicated jobs/listings route instead of staying on the homepage.',
      reliableControls: ['The jobs navigation link opens a dedicated listings page.'],
      trickyFilters: [],
      navigationTips: ['Start future discovery from the dedicated jobs/listings route rather than the homepage.'],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'Keyword search on the listings route changes the result set reliably.',
      reliableControls: ['Use the keyword search box on the listings route to refresh the visible job set.'],
      trickyFilters: ['Homepage promo chips did not reliably change the listing set and should be ignored.'],
      navigationTips: [],
      applyTips: [],
      warnings: []
    },
    job_detail_validation: {
      summary: 'Open the same-host detail page from the listing card to recover canonical job data.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: ['Open the listing card detail page instead of relying on inline card previews.'],
      applyTips: [],
      warnings: []
    },
    apply_path_validation: {
      summary: 'Sampled job details did not expose a reliable on-site apply entry.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: [],
      applyTips: ['Treat applications as manual unless a detail page clearly exposes a stable apply entry.'],
      warnings: []
    },
    replay_verification: {
      summary: 'Replay from the listings route reproduced the searchable job flow.',
      reliableControls: ['The listings route and keyword search remained stable on replay.'],
      trickyFilters: [],
      navigationTips: ['Reuse the listings route and keyword search path during normal discovery.'],
      applyTips: [],
      warnings: []
    }
  }
}

function createThinSourceDebugFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    job_detail_validation: {
      summary: 'Job details resolve to same-host detail pages instead of only inline cards.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: ['Different listings resolve to distinct canonical detail URLs.'],
      applyTips: [],
      warnings: []
    },
    apply_path_validation: {
      summary: 'Sampled job details did not expose a reliable apply entry on the site.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: [],
      applyTips: ['Treat applications as manual for now.'],
      warnings: []
    },
    replay_verification: {
      summary: 'Replay verification reached the same listings again.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: [],
      applyTips: [],
      warnings: []
    }
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
    expect(snapshot.discoveryJobs[0]?.provenance).toHaveLength(1)

    // Verify jobs are pending (can be reviewed/queued) rather than auto-saved
    expect(snapshot.reviewQueue).toHaveLength(0)
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0)

    // Ensure no application records or attempts were created
    expect(snapshot.applicationRecords).toHaveLength(0)
    expect(snapshot.applicationAttempts).toHaveLength(0)

    const secondSnapshot = await workspaceService.runDiscovery()

    expect(secondSnapshot.discoveryJobs).toHaveLength(2)
    expect(secondSnapshot.discoveryJobs.filter((job) => job.sourceJobId === 'linkedin_signal_ready')).toHaveLength(1)
    expect(secondSnapshot.discoveryJobs[0]?.provenance).toHaveLength(1)
    expect(secondSnapshot.reviewQueue).toHaveLength(0)
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0)
  })

  test('agent discovery streams activity and keeps discovery-only jobs pending', async () => {
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
    const catalog = createBrowserRuntime().runDiscovery('linkedin', createSeed().searchPreferences)
    const discoveryResult = await catalog
    const browserRuntime = createAgentBrowserRuntime(discoveryResult.jobs)
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })
    const streamedEvents: DiscoveryActivityEvent[] = []
    const snapshot = await workspaceService.runAgentDiscovery((event) => {
      streamedEvents.push(event)
    }, new AbortController().signal)

    expect(streamedEvents.length).toBeGreaterThan(0)
    expect(streamedEvents.some((event) => event.kind === 'progress')).toBe(true)
    expect(snapshot.discoveryJobs).toHaveLength(2)
    expect(snapshot.discoveryJobs.every((job) => job.status === 'discovered')).toBe(true)
    expect(snapshot.reviewQueue).toHaveLength(0)
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0)
    expect(snapshot.applicationRecords).toHaveLength(0)
    expect(snapshot.applicationAttempts).toHaveLength(0)
  })

  test('agent discovery abort keeps streamed activity and avoids persistence', async () => {
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
    const discoveryResult = await createBrowserRuntime().runDiscovery('linkedin', createSeed().searchPreferences)
    const browserRuntime = createAgentBrowserRuntime(discoveryResult.jobs)
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })
    const streamedEvents: DiscoveryActivityEvent[] = []
    const controller = new AbortController()

    const snapshot = await workspaceService.runAgentDiscovery((event) => {
      streamedEvents.push(event)
      if (event.kind === 'progress') {
        controller.abort()
      }
    }, controller.signal)

    expect(streamedEvents.some((event) => event.kind === 'progress')).toBe(true)
    expect(snapshot.discoveryJobs).toHaveLength(0)
    expect(snapshot.reviewQueue).toHaveLength(0)
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0)
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

  test('forwards validated source guidance into apply execution', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: 'validated',
        validatedInstructionId: 'instruction_linkedin_validated'
      }
    ]
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        provenance: [
          {
            targetId: 'target_linkedin_default',
            adapterKind: 'auto',
            resolvedAdapterKind: 'linkedin',
            startingUrl: 'https://www.linkedin.com/jobs/search/',
            discoveredAt: '2026-03-20T10:04:00.000Z'
          }
        ]
      },
      ...seed.savedJobs.slice(1)
    ]
    seed.sourceInstructionArtifacts = [
      {
        id: 'instruction_linkedin_validated',
        targetId: 'target_linkedin_default',
        status: 'validated',
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:04:00.000Z',
        acceptedAt: '2026-03-20T10:04:00.000Z',
        basedOnRunId: 'debug_run_1',
        basedOnAttemptIds: ['debug_attempt_1'],
        notes: 'Validated apply guidance for the LinkedIn target.',
        navigationGuidance: ['Open the job detail page before acting on apply controls.'],
        searchGuidance: ['Use the jobs search entrypoint rather than the generic LinkedIn home feed.'],
        detailGuidance: ['Prefer the dedicated jobs search entrypoint for this source.'],
        applyGuidance: ['Use the Easy Apply branch when the listing exposes it; otherwise pause for review.'],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'v1',
          toolsetVersion: 'v1',
          adapterVersion: 'v1',
          appSchemaVersion: 'v1'
        },
        verification: {
          id: 'verification_linkedin_validated',
          replayRunId: 'debug_run_replay_1',
          verifiedAt: '2026-03-20T10:04:00.000Z',
          outcome: 'passed',
          proofSummary: 'Replay reached the apply path successfully.',
          reason: null,
          versionInfo: {
            promptProfileVersion: 'v1',
            toolsetVersion: 'v1',
            adapterVersion: 'v1',
            appSchemaVersion: 'v1'
          }
        }
      }
    ]

    const repository = createInMemoryJobFinderRepository(seed)
    const browserRuntime = createBrowserRuntime()
    let capturedInstructions: readonly string[] = []
    const instrumentedRuntime: BrowserSessionRuntime = {
      ...browserRuntime,
      async executeEasyApply(source, input) {
        capturedInstructions = input.instructions ?? []
        return browserRuntime.executeEasyApply(source, input)
      }
    }
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime: instrumentedRuntime,
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    await workspaceService.approveApply('job_ready')

    expect(capturedInstructions).toEqual(
      expect.arrayContaining([
        'Prefer the dedicated jobs search entrypoint for this source.',
        'Use the jobs search entrypoint rather than the generic LinkedIn home feed.',
        'Open the job detail page before acting on apply controls.',
        'Use the Easy Apply branch when the listing exposes it; otherwise pause for review.'
      ])
    )
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

  test('runs source debug, persists artifacts, and validates learned instructions after replay', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'linkedin',
          sourceJobId: 'linkedin_source_debug_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_1',
          title: 'Staff Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: '$180k - $220k',
          summary: 'Validate stable job detail routes.',
          description: 'Validate stable job detail routes.',
          keySkills: ['Figma', 'React']
        }
      ],
      {
        compactionState: {
          compactedAt: '2026-03-20T10:00:30.000Z',
          compactionCount: 1,
          summary: 'Compacted execution summary.',
          confirmedFacts: ['Visited 3 pages.'],
          blockerNotes: [],
          avoidStrategyFingerprints: ['site_structure_mapping:linkedin:site structure mapping'],
          preservedContext: ['Staff Product Designer at Signal Systems']
        },
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase()
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_linkedin_default')
    const runs = await repository.listSourceDebugRuns()
    const attempts = await repository.listSourceDebugAttempts()
    const artifacts = await repository.listSourceInstructionArtifacts()
    const evidenceRefs = await repository.listSourceDebugEvidenceRefs()
    const validatedArtifact = artifacts.find((artifact) => artifact.status === 'validated')

    expect(snapshot.activeSourceDebugRun).toBeNull()
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe('completed')
    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('validated')
    expect(snapshot.searchPreferences.discovery.targets[0]?.validatedInstructionId).not.toBeNull()
    expect(snapshot.searchPreferences.discovery.targets[0]?.draftInstructionId).toBeNull()
    expect(runs).toHaveLength(1)
    expect(attempts).toHaveLength(6)
    expect(attempts.every((attempt) => attempt.runId === runs[0]?.id)).toBe(true)
    expect(attempts[0]?.compactionState?.compactionCount).toBe(1)
    expect(snapshot.sourceInstructionArtifacts.some((artifact) => artifact.status === 'validated')).toBe(true)
    expect(artifacts.some((artifact) => artifact.status === 'validated')).toBe(true)
    expect(validatedArtifact?.applyGuidance.length).toBeGreaterThan(0)
    expect(
      [
        ...(validatedArtifact?.navigationGuidance ?? []),
        ...(validatedArtifact?.searchGuidance ?? []),
        ...(validatedArtifact?.detailGuidance ?? []),
        ...(validatedArtifact?.applyGuidance ?? [])
      ].some((line) => /candidate job result/i.test(line))
    ).toBe(false)
    const learnedLines = [
      ...(validatedArtifact?.navigationGuidance ?? []),
      ...(validatedArtifact?.searchGuidance ?? []),
      ...(validatedArtifact?.detailGuidance ?? []),
      ...(validatedArtifact?.applyGuidance ?? [])
    ]
    expect(new Set(learnedLines).size).toBe(learnedLines.length)
    expect(evidenceRefs.length).toBeGreaterThan(0)
  })

  test('keeps learned instructions in draft when replay passes but reusable guidance is still too thin', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'linkedin',
          sourceJobId: 'linkedin_source_debug_thin_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_thin_1',
          title: 'Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Thin source-debug coverage.',
          description: 'Thin source-debug coverage.',
          keySkills: ['Figma']
        }
      ],
      {
        debugFindingsByPhase: createThinSourceDebugFindingsByPhase()
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_linkedin_default')
    const artifacts = await repository.listSourceInstructionArtifacts()
    const latestArtifact = artifacts.at(-1)

    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('draft')
    expect(snapshot.searchPreferences.discovery.targets[0]?.validatedInstructionId).toBeNull()
    expect(snapshot.searchPreferences.discovery.targets[0]?.draftInstructionId).not.toBeNull()
    expect(latestArtifact?.status).toBe('draft')
    expect(latestArtifact?.warnings.some((warning) => /still too thin|still missing/i.test(warning))).toBe(true)
    expect((latestArtifact?.searchGuidance ?? []).length).toBe(0)
  })

  test('pauses source debug when the managed session requires login', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const browserRuntime = createAgentBrowserRuntime([], {
      sessionStatus: 'login_required',
      sessionDetail: 'Sign in before source debugging can continue.'
    })
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_linkedin_default')
    const attempts = await repository.listSourceDebugAttempts()

    expect(snapshot.activeSourceDebugRun?.state).toBe('paused_manual')
    expect(snapshot.activeSourceDebugRun?.manualPrerequisiteSummary).toContain('Sign in')
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe('paused_manual')
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.outcome).toBe('blocked_auth')
    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('missing')
  })

  test('opens the managed session before source debug and keeps internal agent failures out of learned guidance', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [
        {
          source: 'linkedin',
          status: 'login_required',
          driver: 'catalog_seed',
          label: 'Browser session needs login',
          detail: 'Sign in first.',
          lastCheckedAt: '2026-03-20T10:04:00.000Z'
        }
      ],
      catalog: []
    })
    let openSessionCalls = 0
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      openSession(source) {
        openSessionCalls += 1
        return Promise.resolve({
          source,
          status: 'ready',
          driver: 'catalog_seed',
          label: 'Browser session ready',
          detail: 'Opened for source debug.',
          lastCheckedAt: '2026-03-20T10:05:00.000Z'
        })
      },
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: '2026-03-20T10:00:00.000Z',
          completedAt: '2026-03-20T10:01:00.000Z',
          querySummary: 'Agent discovery test run',
          warning: 'Discovery encountered an error: LLM call failed after 3 attempts: temporary upstream failure',
          jobs: [],
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 5,
            compactionState: null,
            debugFindings: null
          }
        })
      }
    }
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? []),
      ...(latestArtifact?.warnings ?? [])
    ].join('\n')

    expect(openSessionCalls).toBeGreaterThan(0)
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe('failed')
    expect(learnedLines.toLowerCase()).not.toContain('llm call failed')
    expect(learnedLines.toLowerCase()).not.toContain('discovery encountered an error')
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
