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
  SourceDebugCompactionState,
  SourceDebugPhaseCompletionMode,
  SourceDebugPhaseEvidence
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
            label: 'Primary target',
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
        source: 'target_site',
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
        source: 'target_site',
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
        source: 'target_site',
        status: 'ready',
        driver: 'catalog_seed',
        label: 'Browser session ready',
        detail: 'Validated recently.',
        lastCheckedAt: '2026-03-20T10:04:00.000Z'
      }
    ],
    catalog: [
      {
        source: 'target_site',
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
        source: 'target_site',
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
    reviewTranscriptByPhase?: Partial<Record<string, string[]>>
    phaseCompletionModeByPhase?: Partial<Record<string, SourceDebugPhaseCompletionMode | null>>
    phaseCompletionReasonByPhase?: Partial<Record<string, string | null>>
    phaseEvidenceByPhase?: Partial<Record<string, SourceDebugPhaseEvidence | null>>
  }
): BrowserSessionRuntime {
  const baseRuntime = createCatalogBrowserSessionRuntime({
    sessions: [
      {
        source: 'target_site',
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
      const phaseCompletionMode =
        runtimeOptions?.phaseCompletionModeByPhase?.[phaseKey] ??
        runtimeOptions?.phaseCompletionModeByPhase?.[phaseLabel] ??
        'structured_finish'
      const phaseCompletionReason =
        runtimeOptions?.phaseCompletionReasonByPhase?.[phaseKey] ??
        runtimeOptions?.phaseCompletionReasonByPhase?.[phaseLabel] ??
        null
      const phaseEvidence =
        runtimeOptions?.phaseEvidenceByPhase?.[phaseKey] ??
        runtimeOptions?.phaseEvidenceByPhase?.[phaseLabel] ??
        null
      const reviewTranscript =
        runtimeOptions?.reviewTranscriptByPhase?.[phaseKey] ??
        runtimeOptions?.reviewTranscriptByPhase?.[phaseLabel] ??
        []
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
          reviewTranscript,
          compactionState: runtimeOptions?.compactionState ?? null,
          phaseCompletionMode,
          phaseCompletionReason,
          phaseEvidence,
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
      summary: 'Use the dedicated jobs/listings route or reusable recommendation lists instead of staying on the homepage.',
      reliableControls: ['The jobs navigation link opens a dedicated listings page.', 'Recommendation rows expose show-all links that open reusable prefiltered job lists.'],
      trickyFilters: [],
      navigationTips: ['Start future discovery from the dedicated jobs/listings route rather than the homepage.', 'If a recommendation row looks relevant, its show-all route is a valid entry path for a prefiltered result set.'],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'Keyword search plus the visible location and industry filters change the result set reliably.',
      reliableControls: [
        'Use the keyword search box on the listings route to refresh the visible job set.',
        'Use the visible location filter to narrow the listings by city or region.',
        'Use the visible industry filter to narrow the listings by sector.',
        'Recommendation show-all routes can open large reusable result sets with site-preselected filters already applied.'
      ],
      trickyFilters: ['Homepage promo chips that do not open a full result list should be ignored.'],
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
      summary: 'Replay from the listings route reproduced the searchable and filterable job flow.',
      reliableControls: ['The listings route, keyword search, and visible filters remained stable on replay.'],
      trickyFilters: [],
      navigationTips: ['Reuse the listings route, recommendation show-all paths, and keyword search path during normal discovery.'],
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

function createUnprovenVisibleControlFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    site_structure_mapping: {
      summary: 'Jobs are listed directly on the homepage.',
      reliableControls: ['Use the homepage as the initial jobs surface.'],
      trickyFilters: [],
      navigationTips: ['Jobs appear directly on the homepage without a separate jobs route.'],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'The homepage shows visible search and filter controls, but they were not proven reusable in this pass.',
      reliableControls: [],
      trickyFilters: [
        'Search box exists but functionality was not confirmed in this probe.',
        'Visible city and industry filters were present but not tested to completion.'
      ],
      navigationTips: [],
      applyTips: [],
      warnings: []
    },
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

function createUrlShortcutOnlyFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    site_structure_mapping: {
      summary: 'Direct URL navigation to /jobs/search with geoId reaches a results page.',
      reliableControls: ['Jobs landing URL: https://www.linkedin.com/jobs/search/?location=Prishtina%2C%20Kosovo&geoId=103175575'],
      trickyFilters: [],
      navigationTips: ['Jobs URL pattern: /jobs/search/?location={location}&geoId={geoId}'],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'Direct URL navigation with geoId loads results and a filter button, but no visible control was proven beyond the shortcut URL.',
      reliableControls: [
        'Direct URL navigation to /jobs/search with geoId works.',
        'Filter button present at index 0 opens full filter options.'
      ],
      trickyFilters: ['CurrentJobId appears in the URL after opening a listing.'],
      navigationTips: [],
      applyTips: [],
      warnings: []
    },
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
      summary: 'Replay verification reached the same listings again through the URL shortcut.',
      reliableControls: ['Replay repeated the same /jobs/search/?location={location}&geoId={geoId} route.'],
      trickyFilters: [],
      navigationTips: [],
      applyTips: [],
      warnings: []
    }
  }
}

function createMixedAuthSurfaceFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    access_auth_probe: {
      summary: 'The /jobs page showed a login form before authenticated browsing was available.',
      reliableControls: [
        'Login form is the only visible surface - no public job listings accessible',
        'Authentication required - cannot access job listings without target site account'
      ],
      trickyFilters: [],
      navigationTips: [],
      applyTips: [],
      warnings: []
    },
    site_structure_mapping: {
      summary: 'Authenticated browsing later exposed reusable recommendation and collection routes.',
      reliableControls: ['Show all top job picks for you opens a reusable recommended collection.'],
      trickyFilters: [],
      navigationTips: ['Start from /jobs/ and open a reusable show-all or collection route when recommendation modules are visible.'],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'Authenticated results exposed a search box and visible filters.',
      reliableControls: [
        'Search box is visible on the results surface.',
        'Remote and on-site filters are visible on the results surface.'
      ],
      trickyFilters: [],
      navigationTips: ['The fuller search surface lives under the main jobs search route.'],
      applyTips: [],
      warnings: []
    },
    job_detail_validation: {
      summary: 'Job detail pages use stable /jobs/view/{jobId} URLs.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: ['Use same-host detail pages as the canonical source of job data.'],
      applyTips: [],
      warnings: []
    },
    apply_path_validation: {
      summary: 'Easy Apply is visible on some authenticated listings.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: [],
      applyTips: ['Use the on-site apply entry when the detail page exposes it.'],
      warnings: []
    },
    replay_verification: {
      summary: 'Replay reached the same authenticated collection and results surfaces again.',
      reliableControls: ['The collection route and visible filters were stable on replay.'],
      trickyFilters: [],
      navigationTips: [],
      applyTips: [],
      warnings: []
    }
  }
}

function createNoisySourceDebugFindingsByPhase(): Partial<Record<string, AgentDebugFindings | null>> {
  return {
    site_structure_mapping: {
      summary: 'Clicked link "Show all top job picks for you"',
      reliableControls: [
        'Show all top job picks for you: opens reusable recommended jobs collection',
        'Clicked link "Show all top job picks for you"',
        'Some direct URL patterns may return 404 - use the main /jobs/ landing page instead'
      ],
      trickyFilters: [],
      navigationTips: [
        'Show all top job picks for you: opens reusable /collections/recommended/ path',
        'Job cards are clickable for detail view'
      ],
      applyTips: [],
      warnings: []
    },
    search_filter_probe: {
      summary: 'Clicked button "Show all filters. Clicking this button displays all available filter options."',
      reliableControls: [
        'link "Senior Frontend Engineer (Verified job) Fresha • Pristina (On-site) Dismiss Senior Frontend Engineer job 1 connection works here Viewed · Promoted"',
        'button "Show all filters. Clicking this button displays all available filter options."'
      ],
      trickyFilters: [
        'click failed: locator.click: Timeout 10000ms exceeded. Call log: waiting for getByRole(...)',
        'Location filter links visible: Prishtinë, Gjithë Kosovën, Jashtë Vendit'
      ],
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
      summary: 'Primary target exposes a stable apply path via Easy Apply buttons on job cards.',
      reliableControls: [],
      trickyFilters: [],
      navigationTips: [],
      applyTips: [
        'Job listings show Easy Apply button on cards - this is the primary apply entry point',
        'Treat applications as manual until a reliable on-site apply entry is proven - the Easy Apply button is the proven on-site entry',
        'Use the on-site apply entry when the detail page exposes it.'
      ],
      warnings: []
    },
    replay_verification: {
      summary: 'Replay from the listings route reproduced the searchable and filterable job flow.',
      reliableControls: ['The listings route, keyword search, and visible filters remained stable on replay.'],
      trickyFilters: [],
      navigationTips: ['Reuse the listings route and show-all collection path during normal discovery.'],
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
    const catalog = createBrowserRuntime().runDiscovery('target_site', createSeed().searchPreferences)
    const discoveryResult = await catalog
    const baseAgentRuntime = createAgentBrowserRuntime(discoveryResult.jobs)
    let openSessionCalls = 0
    let closeSessionCalls = 0
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      openSession(source) {
        openSessionCalls += 1
        return baseAgentRuntime.openSession(source)
      },
      closeSession(source) {
        closeSessionCalls += 1
        return baseAgentRuntime.closeSession(source)
      }
    }
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
    expect(openSessionCalls).toBe(1)
    expect(closeSessionCalls).toBe(1)
  })

  test('agent discovery uses the active draft-or-validated instructions for the matching target', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: 'target_linkedin_accepted_draft',
        label: 'Draft target',
        startingUrl: 'https://www.linkedin.com/jobs/',
        instructionStatus: 'draft',
        validatedInstructionId: null,
        draftInstructionId: 'instruction_linkedin_draft_accepted'
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: 'target_linkedin_validated',
        label: 'Validated target',
        startingUrl: 'https://www.linkedin.com/jobs/search/',
        instructionStatus: 'validated',
        validatedInstructionId: 'instruction_linkedin_validated',
        draftInstructionId: null
      }
    ]
    seed.sourceInstructionArtifacts = [
      {
        id: 'instruction_linkedin_draft_accepted',
        targetId: 'target_linkedin_accepted_draft',
        status: 'draft',
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        acceptedAt: null,
        basedOnRunId: 'debug_run_draft',
        basedOnAttemptIds: ['debug_attempt_draft'],
        notes: 'Accepted draft guidance.',
        navigationGuidance: ['Use the accepted draft recommendation route first.'],
        searchGuidance: ['Open the accepted draft collection before trying broader search.'],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'v1',
          toolsetVersion: 'v1',
          adapterVersion: 'v1',
          appSchemaVersion: 'v1'
        },
        verification: null
      },
      {
        id: 'instruction_linkedin_validated',
        targetId: 'target_linkedin_validated',
        status: 'validated',
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        acceptedAt: '2026-03-20T10:06:00.000Z',
        basedOnRunId: 'debug_run_validated',
        basedOnAttemptIds: ['debug_attempt_validated'],
        notes: 'Validated guidance.',
        navigationGuidance: ['Use the validated jobs search route directly.'],
        searchGuidance: ['Use the validated location filter after opening the results page.'],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'v1',
          toolsetVersion: 'v1',
          adapterVersion: 'v1',
          appSchemaVersion: 'v1'
        },
        verification: {
          id: 'verification_linkedin_validated',
          replayRunId: 'debug_run_replay_validated',
          verifiedAt: '2026-03-20T10:07:00.000Z',
          outcome: 'passed',
          proofSummary: 'Replay succeeded.',
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
    const catalog = await createBrowserRuntime().runDiscovery('target_site', createSeed().searchPreferences)
    const baseAgentRuntime = createAgentBrowserRuntime(catalog.jobs)
    const capturedInstructionsByLabel = new Map<string, readonly string[]>()
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      runAgentDiscovery(source, options) {
        capturedInstructionsByLabel.set(options.siteLabel, [...(options.siteInstructions ?? [])])
        return baseAgentRuntime.runAgentDiscovery!(source, options)
      }
    }
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    await workspaceService.runAgentDiscovery(() => {}, new AbortController().signal)

    expect(capturedInstructionsByLabel.get('Draft target')).toEqual(
      expect.arrayContaining([
        'Use the accepted draft recommendation route first.',
        'Open the accepted draft collection before trying broader search.'
      ])
    )
    expect(capturedInstructionsByLabel.get('Draft target')?.join('\n')).not.toContain('validated jobs search route directly')
    expect(capturedInstructionsByLabel.get('Validated target')).toEqual(
      expect.arrayContaining([
        'Use the validated jobs search route directly.',
        'Use the validated location filter after opening the results page.'
      ])
    )
    expect(capturedInstructionsByLabel.get('Validated target')?.join('\n')).not.toContain('accepted draft recommendation route first')
  })

  test('saveSourceInstructionArtifact updates a bound target artifact and rejects unbound edits', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: 'draft',
        validatedInstructionId: null,
        draftInstructionId: 'instruction_linkedin_draft_editable'
      }
    ]
    seed.sourceInstructionArtifacts = [
      {
        id: 'instruction_linkedin_draft_editable',
        targetId: 'target_linkedin_default',
        status: 'draft',
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        acceptedAt: null,
        basedOnRunId: 'debug_run_editable',
        basedOnAttemptIds: ['debug_attempt_editable'],
        notes: 'Editable draft guidance.',
        navigationGuidance: ['Start from the jobs homepage.'],
        searchGuidance: ['Use the visible search box first.'],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'v1',
          toolsetVersion: 'v1',
          adapterVersion: 'v1',
          appSchemaVersion: 'v1'
        },
        verification: null
      }
    ]

    const repository = createInMemoryJobFinderRepository(seed)
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime: createBrowserRuntime(),
      aiClient: createAiClient(),
      documentManager: createDocumentManager()
    })

    const originalArtifact = seed.sourceInstructionArtifacts[0]!
    const updatedSnapshot = await workspaceService.saveSourceInstructionArtifact('target_linkedin_default', {
      ...originalArtifact,
      searchGuidance: ['Use the edited search guidance instead.']
    })

    expect(
      updatedSnapshot.sourceInstructionArtifacts.find((artifact) => artifact.id === originalArtifact.id)?.searchGuidance
    ).toEqual(['Use the edited search guidance instead.'])

    await expect(
      workspaceService.saveSourceInstructionArtifact('target_linkedin_default', {
        ...originalArtifact,
        id: 'instruction_not_bound_to_target'
      })
    ).rejects.toThrow(/not bound to target/i)
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
    const discoveryResult = await createBrowserRuntime().runDiscovery('target_site', createSeed().searchPreferences)
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
      source: 'target_site',
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
            resolvedAdapterKind: 'target_site',
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
        notes: 'Validated apply guidance for the target-site target.',
        navigationGuidance: ['Open the job detail page before acting on apply controls.'],
        searchGuidance: ['Use the jobs search entrypoint rather than the site home feed.'],
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
        'Use the jobs search entrypoint rather than the site home feed.',
        'Open the job detail page before acting on apply controls.',
        'Use the Easy Apply branch when the listing exposes it; otherwise pause for review.'
      ])
    )
  })

  test('forwards a draft source guidance set into apply execution for its own target', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: 'draft',
        validatedInstructionId: null,
        draftInstructionId: 'instruction_linkedin_draft_accepted'
      }
    ]
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        provenance: [
          {
            targetId: 'target_linkedin_default',
            adapterKind: 'auto',
            resolvedAdapterKind: 'target_site',
            startingUrl: 'https://www.linkedin.com/jobs/',
            discoveredAt: '2026-03-20T10:04:00.000Z'
          }
        ]
      },
      ...seed.savedJobs.slice(1)
    ]
    seed.sourceInstructionArtifacts = [
      {
        id: 'instruction_linkedin_draft_accepted',
        targetId: 'target_linkedin_default',
        status: 'draft',
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:04:00.000Z',
        acceptedAt: null,
        basedOnRunId: 'debug_run_accepted_draft',
        basedOnAttemptIds: ['debug_attempt_accepted_draft'],
        notes: 'Accepted draft apply guidance for the target-site target.',
        navigationGuidance: ['Open the accepted draft collection route first.'],
        searchGuidance: ['Use the accepted draft jobs surface before refining filters.'],
        detailGuidance: ['Open the job detail page after entering through the accepted draft route.'],
        applyGuidance: ['Use the accepted draft Easy Apply entry when it is exposed on the detail page.'],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'v1',
          toolsetVersion: 'v1',
          adapterVersion: 'v1',
          appSchemaVersion: 'v1'
        },
        verification: null
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
        'Open the accepted draft collection route first.',
        'Use the accepted draft jobs surface before refining filters.',
        'Open the job detail page after entering through the accepted draft route.',
        'Use the accepted draft Easy Apply entry when it is exposed on the detail page.'
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
          source: 'target_site',
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
          avoidStrategyFingerprints: ['site_structure_mapping:target_site:site structure mapping'],
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
          source: 'target_site',
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

  test('keeps learned instructions in draft when visible search controls were mentioned but never proven reusable', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      id: 'target_generic_default',
      label: 'KosovaJob',
      startingUrl: 'https://kosovajob.com/',
      adapterKind: 'auto'
    }
    const repositoryWithGenericTarget = createInMemoryJobFinderRepository({
      ...seed,
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'generic_source_debug_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://kosovajob.com/jobs/view/generic_source_debug_1',
          title: 'Customer Experience Specialist',
          company: 'KosovaJob',
          location: 'Prishtina',
          workMode: ['onsite'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Homepage listing.',
          description: 'Homepage listing.',
          keySkills: ['Support']
        }
      ],
      {
        debugFindingsByPhase: createUnprovenVisibleControlFindingsByPhase(),
        phaseEvidenceByPhase: {
          search_filter_probe: {
            visibleControls: [
              'searchbox "Kërko sipas pozitës së punës"',
              'combobox "Qyteti"',
              'combobox "Industria"'
            ],
            successfulInteractions: ['Returned to the top of the current page to re-check header controls'],
            routeSignals: ['Returned to the top of https://kosovajob.com/ to probe header controls again'],
            attemptedControls: [
              'Filled searchbox "Kërko sipas pozitës së punës"',
              'Selected "Prishtinë" from combobox "Qyteti"',
              'Selected "Teknologji e Informacionit" from combobox "Industria"'
            ],
            warnings: ['fill failed: Timeout 10000ms exceeded.']
          }
        }
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository: repositoryWithGenericTarget,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_generic_default')
    const latestArtifact = (await repositoryWithGenericTarget.listSourceInstructionArtifacts()).at(-1)

    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('draft')
    expect(latestArtifact?.status).toBe('draft')
    expect(latestArtifact?.warnings.some((warning) => /still unproven/i.test(warning))).toBe(true)
  })

  test('keeps learned instructions in draft when search guidance relies only on url shortcuts', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_source_debug_geoid',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_geoid',
          title: 'Frontend Developer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'URL shortcut only coverage.',
          description: 'URL shortcut only coverage.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: createUrlShortcutOnlyFindingsByPhase()
      }
    )
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
      ...(latestArtifact?.warnings ?? [])
    ].join('\n').toLowerCase()

    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('draft')
    expect(latestArtifact?.status).toBe('draft')
    expect(learnedLines).not.toContain('geoid')
    expect(learnedLines).not.toContain('currentjobid')
  })

  test('curates mixed guest-auth and authenticated job-surface guidance toward the surface that actually exposed jobs', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_source_debug_mixed_auth',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_mixed_auth',
          title: 'Senior Frontend Engineer',
          company: 'Signal Systems',
          location: 'Prishtina',
          workMode: ['onsite'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Mixed auth surface coverage.',
          description: 'Mixed auth surface coverage.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: createMixedAuthSurfaceFindingsByPhase()
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? [])
    ].join('\n').toLowerCase()

    expect(learnedLines).toContain('show all')
    expect(learnedLines).toContain('search box')
    expect(learnedLines).not.toContain('login form is the only visible surface')
    expect(learnedLines).not.toContain('cannot access job listings without target site account')
    expect(latestArtifact?.warnings.some((warning) => /crossed both guest\/login and job-bearing surfaces/i.test(warning))).toBe(true)
  })

  test('filters raw interaction traces from learned instructions and reconciles apply guidance', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_source_debug_cleaned',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_cleaned',
          title: 'Frontend Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Noise cleanup coverage.',
          description: 'Noise cleanup coverage.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: createNoisySourceDebugFindingsByPhase(),
        phaseEvidenceByPhase: {
          site_structure_mapping: {
            visibleControls: [
              'link "Show all top job picks for you"',
              'searchbox "Search by title, skill, or company"'
            ],
            successfulInteractions: ['Clicked link "Show all top job picks for you"'],
            routeSignals: ['Control click opened https://www.linkedin.com/jobs/collections/recommended/'],
            attemptedControls: ['Clicked link "Show all top job picks for you"'],
            warnings: []
          },
          search_filter_probe: {
            visibleControls: [
              'searchbox "Search by title, skill, or company"',
              'combobox "Location"',
              'combobox "Industry"',
              'button "Show all filters"'
            ],
            successfulInteractions: ['Scrolled down on the current jobs surface'],
            routeSignals: [
              'Search submit opened https://www.linkedin.com/jobs/search/',
              'Scrolling revealed additional content on https://www.linkedin.com/jobs/collections/recommended/'
            ],
            attemptedControls: [
              'Filled searchbox "Search by title, skill, or company"',
              'Selected "Prishtina" from combobox "Location"',
              'Selected "Information Technology" from combobox "Industry"'
            ],
            warnings: [
              'fill failed: Timeout 10000ms exceeded.',
              'click failed: element is not visible until the page is scrolled.'
            ]
          }
        }
      }
    )
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
      ...(latestArtifact?.applyGuidance ?? [])
    ].join('\n').toLowerCase()

    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).not.toBe('missing')
    expect(learnedLines).not.toContain('clicked link')
    expect(learnedLines).not.toContain('locator.click')
    expect(learnedLines).not.toContain('promoted')
    expect(learnedLines).not.toContain('dismiss senior frontend engineer')
    expect(learnedLines).not.toContain('timed out')
    expect(learnedLines).not.toContain('element is not visible')
    expect(learnedLines).toContain('show all')
    expect(learnedLines).toContain('collection')
    expect(learnedLines).toContain('visible keyword search box')
    expect(learnedLines).toContain('visible location filter')
    expect(learnedLines).toContain('visible industry or category filter')
    expect(learnedLines).toContain('did not prove they change the result set reliably')
    expect(learnedLines).toContain('may need scrolling into view before interaction')
    expect(learnedLines).toContain('easy apply')
    expect(learnedLines).not.toContain('treat applications as manual until a reliable on-site apply entry is proven')
  })

  test('reconciles earlier search and detail failures away when later phases prove the reusable path', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_reconcile_case',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_reconcile_case',
          title: 'Frontend Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Reconciliation case.',
          description: 'Reconciliation case.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: {
          access_auth_probe: createStrongSourceDebugFindingsByPhase().access_auth_probe ?? null,
          site_structure_mapping: {
            summary: 'The jobs landing page shows recommendation modules and visible controls before the fuller results route is opened.',
            reliableControls: ['Show all recommendation routes can open reusable collections.'],
            trickyFilters: [
              'A visible keyword search box exists, but this run did not prove it changes the result set reliably.',
              'Visible location filters exist, but this run did not prove they change the result set reliably.',
              'Visible industry or category filters exist, but this run did not prove they change the result set reliably.'
            ],
            navigationTips: ['Use Show all on recommendation modules to reach a reusable collection before broader search.'],
            applyTips: [],
            warnings: []
          },
          search_filter_probe: {
            summary: 'Search textbox "Search everything" is a reliable control and changes the result set when submitted.',
            reliableControls: [
              'Use the keyword search box to change the result set reliably.',
              'Use the visible location filter to narrow the listings by city.',
              'Use the visible industry filter to narrow the listings by sector.'
            ],
            trickyFilters: [],
            navigationTips: [],
            applyTips: [],
            warnings: []
          },
          job_detail_validation: {
            summary: 'Job detail validation successful. Confirmed stable URL pattern: /jobs/view/{jobId}.',
            reliableControls: [],
            trickyFilters: ['Job extraction consistently returned 0 despite visible job cards - tool limitation.'],
            navigationTips: ['Use same-host detail pages as the canonical source of job data.'],
            applyTips: [],
            warnings: []
          },
          apply_path_validation: {
            summary: 'Easy Apply is visible on supported listings.',
            reliableControls: [],
            trickyFilters: [],
            navigationTips: [],
            applyTips: [
              'Use the on-site apply entry when the detail page exposes it.',
              'Treat applications as manual until a reliable on-site apply entry is proven.'
            ],
            warnings: []
          },
          replay_verification: {
            summary: 'Replay verification reached the same listings again.',
            reliableControls: [
              'The keyword search box, visible location filter, and visible industry filter remained stable on replay.'
            ],
            trickyFilters: [],
            navigationTips: [],
            applyTips: [],
            warnings: []
          }
        }
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? [])
    ].join('\n').toLowerCase()

    expect(learnedLines).toContain('changes the result set when submitted')
    expect(learnedLines).toContain('location filter')
    expect(learnedLines).toContain('industry filter')
    expect(learnedLines).toContain('confirmed stable url pattern')
    expect(learnedLines).toContain('on-site apply entry')
    expect(learnedLines).not.toContain('did not prove it changes the result set reliably')
    expect(learnedLines).not.toContain('tool limitation')
    expect(learnedLines).not.toContain('treat applications as manual until a reliable on-site apply entry is proven')
  })

  test('final source-instruction reviewer receives rich phase context and can override final curation', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const reviewPrompts: string[] = []
    const fallbackClient = createDeterministicJobFinderAiClient('Tests use the deterministic fallback agent.')
    const aiClient: JobFinderAiClient = {
      ...fallbackClient,
      chatWithTools(messages) {
        reviewPrompts.push(messages[1]?.content ?? '')
        return Promise.resolve({
          content: JSON.stringify({
            navigationGuidance: ['Use the curated recommendation collection before broader search.'],
            searchGuidance: ['Use the keyword search box and visible location filter to change the result set reliably.'],
            detailGuidance: ['Use same-host detail pages as the canonical source of job data.'],
            applyGuidance: ['Use the on-site apply entry when the detail page exposes it.'],
            warnings: ['Keep the source in draft if a future replay loses the collection route.']
          }),
          toolCalls: []
        })
      }
    }
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_review_case',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_review_case',
          title: 'Frontend Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Reviewer context case.',
          description: 'Reviewer context case.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
        reviewTranscriptByPhase: {
          search_filter_probe: [
            'assistant: inspected the visible keyword search box and location filter',
            'tool call search_submit: {"success":true,"summary":"query changed results"}'
          ],
          replay_verification: [
            'assistant: replayed the same collection route and search flow',
            'tool call finish: {"success":true,"reason":"replay stayed stable"}'
          ]
        }
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient,
      documentManager: createDocumentManager()
    })

    await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)

    expect(reviewPrompts).toHaveLength(1)
    expect(reviewPrompts[0]).toContain('2026-03-20T10:00:00.000Z')
    expect(reviewPrompts[0]).toContain('assistant: inspected the visible keyword search box and location filter')
    expect(reviewPrompts[0]).toContain('tool call finish')
    expect(latestArtifact?.navigationGuidance).toContain('Use the curated recommendation collection before broader search.')
    expect(latestArtifact?.warnings).toContain('Keep the source in draft if a future replay loses the collection route.')
  })

  test('final source-instruction reviewer is told to write future-run instructions and noisy extraction counts are filtered out', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const reviewPrompts: string[] = []
    const fallbackClient = createDeterministicJobFinderAiClient('Tests use the deterministic fallback agent.')
    const aiClient: JobFinderAiClient = {
      ...fallbackClient,
      chatWithTools(messages) {
        reviewPrompts.push(messages[1]?.content ?? '')
        return Promise.resolve({
          content: JSON.stringify({
            navigationGuidance: [
              '0 or 1 jobs extracted from the current page.',
              'Use the show all collection route before broader search.'
            ],
            searchGuidance: [
              'Only 2 jobs found during this run.',
              'Use the visible location filter to narrow the listings by city.'
            ],
            detailGuidance: [
              'Job extraction consistently returned 0 despite visible job cards - tool limitation.',
              'Open same-host detail pages as the canonical source of job data.'
            ],
            applyGuidance: [
              'Use the on-site apply entry when the detail page exposes it.'
            ],
            warnings: [
              'Keep the source in draft if a future replay loses the collection route.'
            ]
          }),
          toolCalls: []
        })
      }
    }
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'source_debug_reviewer_noise_case',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://example.com/jobs/view/source_debug_reviewer_noise_case',
          title: 'Frontend Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Reviewer noise cleanup case.',
          description: 'Reviewer noise cleanup case.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
        reviewTranscriptByPhase: {
          search_filter_probe: [
            'assistant: the visible location filter changes the result set',
            'tool call extract_jobs: {"success":true,"summary":"0 or 1 jobs extracted"}'
          ]
        }
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient,
      documentManager: createDocumentManager()
    })

    await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? []),
      ...(latestArtifact?.warnings ?? [])
    ].join('\n').toLowerCase()

    expect(reviewPrompts).toHaveLength(1)
    expect(reviewPrompts[0]).toContain('reusable instructions for future discovery runs')
    expect(reviewPrompts[0]).toContain('Never keep extracted-job counts')
    expect(learnedLines).toContain('show all collection route')
    expect(learnedLines).toContain('visible location filter')
    expect(learnedLines).toContain('same-host detail pages')
    expect(learnedLines).not.toContain('0 or 1 jobs extracted')
    expect(learnedLines).not.toContain('only 2 jobs found')
    expect(learnedLines).not.toContain('tool limitation')
  })

  test('keeps timed-out partial evidence in draft and exposes completion metadata in run details', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_source_debug_partial',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_partial',
          title: 'Frontend Engineer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Partial evidence coverage.',
          description: 'Partial evidence coverage.',
          keySkills: ['React']
        }
      ],
      {
        debugFindingsByPhase: {
          access_auth_probe: createStrongSourceDebugFindingsByPhase().access_auth_probe ?? null,
          site_structure_mapping: {
            summary: 'Show-all routes and recommendation collections were visible before timeout.',
            reliableControls: ['Show all top job picks route was visible on the jobs hub'],
            trickyFilters: [],
            navigationTips: ['Recommendation collection route opened a reusable list surface'],
            applyTips: [],
            warnings: []
          },
          search_filter_probe: {
            summary: 'Visible search and filter controls were observed before timeout.',
            reliableControls: ['Keyword search box was visible on the results surface'],
            trickyFilters: [],
            navigationTips: [],
            applyTips: [],
            warnings: []
          },
          job_detail_validation: createStrongSourceDebugFindingsByPhase().job_detail_validation ?? null,
          apply_path_validation: createStrongSourceDebugFindingsByPhase().apply_path_validation ?? null,
          replay_verification: createStrongSourceDebugFindingsByPhase().replay_verification ?? null
        },
        phaseCompletionModeByPhase: {
          site_structure_mapping: 'timed_out_with_partial_evidence',
          search_filter_probe: 'timed_out_with_partial_evidence'
        },
        phaseCompletionReasonByPhase: {
          site_structure_mapping: 'The phase timed out before the worker returned a structured finish call.',
          search_filter_probe: 'The phase timed out before the worker returned a structured finish call.'
        },
        phaseEvidenceByPhase: {
          site_structure_mapping: {
            visibleControls: ['button "Show all"', 'searchbox "Search by title, skill, or company"'],
            successfulInteractions: ['Clicked button "Show all"'],
            routeSignals: ['Control click opened https://www.linkedin.com/jobs/collections/recommended/'],
            attemptedControls: ['Clicked button "Show all"'],
            warnings: []
          },
          search_filter_probe: {
            visibleControls: ['searchbox "Search by title, skill, or company"', 'combobox "Location"'],
            successfulInteractions: ['Filled searchbox "Search by title, skill, or company" with "frontend engineer"'],
            routeSignals: ['Search submit opened https://www.linkedin.com/jobs/search/'],
            attemptedControls: ['Filled searchbox "Search by title, skill, or company"'],
            warnings: []
          }
        }
      }
    )
    const workspaceService = createJobFinderWorkspaceService({
      repository,
      browserRuntime,
      aiClient: createAgentAiClient(),
      documentManager: createDocumentManager()
    })

    const snapshot = await workspaceService.runSourceDebug('target_linkedin_default')
    const latestRunId = snapshot.searchPreferences.discovery.targets[0]?.lastDebugRunId
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)

    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('draft')
    expect(latestArtifact?.status).toBe('draft')
    expect(latestArtifact?.warnings.some((warning) => /timed out before structured conclusion/i.test(warning))).toBe(true)

    expect(latestRunId).toBeTruthy()
    if (!latestRunId) {
      return
    }

    const details = await workspaceService.getSourceDebugRunDetails(latestRunId)
    const timedOutAttempts = details.attempts.filter((attempt) => attempt.completionMode === 'timed_out_with_partial_evidence')

    expect(timedOutAttempts.length).toBeGreaterThan(0)
    expect(timedOutAttempts[0]?.completionReason).toContain('timed out before the worker returned a structured finish call')
    expect(timedOutAttempts[0]?.phaseEvidence?.visibleControls).toContain('button "Show all"')
  })

  test('clears prior learned instructions for the target before a fresh source-debug run', async () => {
    const seed = createSeed()
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      instructionStatus: 'validated',
      validatedInstructionId: 'instruction_old_validated',
      draftInstructionId: 'instruction_old_draft',
      lastVerifiedAt: '2026-03-20T10:05:00.000Z',
      staleReason: 'Old verification state'
    }
    seed.sourceInstructionArtifacts = [
      {
        id: 'instruction_old_validated',
        targetId: 'target_linkedin_default',
        status: 'validated',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        acceptedAt: '2026-03-20T10:05:00.000Z',
        basedOnRunId: 'old_run',
        basedOnAttemptIds: ['old_attempt'],
        notes: 'Old validated instructions',
        navigationGuidance: ['Old navigation guidance'],
        searchGuidance: ['Old search guidance'],
        detailGuidance: ['Old detail guidance'],
        applyGuidance: ['Old apply guidance'],
        warnings: [],
        versionInfo: {
          promptProfileVersion: 'source-debug-v1',
          toolsetVersion: 'browser-tools-v1',
          adapterVersion: 'target-site-adapter-v1',
          appSchemaVersion: 'job-finder-source-debug-v1'
        },
        verification: null
      },
      {
        id: 'instruction_old_draft',
        targetId: 'target_linkedin_default',
        status: 'draft',
        createdAt: '2026-03-20T10:01:00.000Z',
        updatedAt: '2026-03-20T10:06:00.000Z',
        acceptedAt: null,
        basedOnRunId: 'old_run_2',
        basedOnAttemptIds: ['old_attempt_2'],
        notes: 'Old draft instructions',
        navigationGuidance: ['Old draft navigation guidance'],
        searchGuidance: [],
        detailGuidance: [],
        applyGuidance: [],
        warnings: ['Old warning'],
        versionInfo: {
          promptProfileVersion: 'source-debug-v1',
          toolsetVersion: 'browser-tools-v1',
          adapterVersion: 'target-site-adapter-v1',
          appSchemaVersion: 'job-finder-source-debug-v1'
        },
        verification: null
      }
    ]

    const repository = createInMemoryJobFinderRepository(seed)
    const browserRuntime = createAgentBrowserRuntime(
      [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_source_debug_reset_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_source_debug_reset_1',
          title: 'Product Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Reset coverage.',
          description: 'Reset coverage.',
          keySkills: ['Figma']
        }
      ],
      {
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
    const artifacts = await repository.listSourceInstructionArtifacts()

    expect(artifacts.some((artifact) => artifact.id === 'instruction_old_validated')).toBe(false)
    expect(artifacts.some((artifact) => artifact.id === 'instruction_old_draft')).toBe(false)
    expect(snapshot.searchPreferences.discovery.targets[0]?.validatedInstructionId).not.toBe('instruction_old_validated')
    expect(snapshot.searchPreferences.discovery.targets[0]?.draftInstructionId).not.toBe('instruction_old_draft')
    expect(snapshot.sourceInstructionArtifacts.every((artifact) => artifact.targetId === 'target_linkedin_default')).toBe(true)
  })

  test('pauses source debug when the phase worker reports a login blocker', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [],
      catalog: []
    })
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: '2026-03-20T10:00:00.000Z',
          completedAt: '2026-03-20T10:01:00.000Z',
          querySummary: 'Agent discovery test run',
          warning: 'Login required: Sign in before source debugging can continue.',
          jobs: [],
          agentMetadata: {
            steps: 1,
            incomplete: false,
            transcriptMessageCount: 3,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: 'blocked_auth',
            phaseCompletionReason: 'Login required: Sign in before source debugging can continue.',
            phaseEvidence: null,
            debugFindings: {
              summary: 'Login wall blocks further source debugging until the user signs in.',
              reliableControls: [],
              trickyFilters: [],
              navigationTips: [],
              applyTips: [],
              warnings: ['Sign in before continuing the source-debug run.']
            }
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
    const attempts = await repository.listSourceDebugAttempts()

    expect(snapshot.activeSourceDebugRun?.state).toBe('paused_manual')
    expect(snapshot.activeSourceDebugRun?.manualPrerequisiteSummary).toContain('Sign in')
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe('paused_manual')
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.outcome).toBe('blocked_auth')
    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe('missing')
  })

  test('source debug skips session preflight, passes skipSessionValidation to the runtime, and keeps internal agent failures out of learned guidance', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [
        {
          source: 'target_site',
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
    let closeSessionCalls = 0
    const skipSessionValidationFlags: boolean[] = []
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
      closeSession(source) {
        closeSessionCalls += 1
        return Promise.resolve({
          source,
          status: 'unknown',
          driver: 'catalog_seed',
          label: 'Browser session closed',
          detail: 'Closed after source debug.',
          lastCheckedAt: '2026-03-20T10:06:00.000Z'
        })
      },
      runAgentDiscovery(source, options) {
        skipSessionValidationFlags.push(options.skipSessionValidation === true)
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
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: 'runtime_failed',
            phaseCompletionReason: 'Discovery encountered an error: LLM call failed after 3 attempts: temporary upstream failure',
            phaseEvidence: null,
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

    expect(openSessionCalls).toBe(1)
    expect(closeSessionCalls).toBe(1)
    expect(skipSessionValidationFlags.length).toBeGreaterThan(0)
    expect(skipSessionValidationFlags.every(Boolean)).toBe(true)
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe('failed')
    expect(learnedLines.toLowerCase()).not.toContain('agent runtime failed')
    expect(learnedLines.toLowerCase()).not.toContain('llm call failed')
    expect(learnedLines.toLowerCase()).not.toContain('discovery encountered an error')
  })

  test('filters noisy step-budget and direct-url hack lines out of learned source guidance', async () => {
    const repository = createInMemoryJobFinderRepository({
      ...createSeed(),
      savedJobs: [],
      tailoredAssets: []
    })
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [
        {
          source: 'target_site',
          status: 'ready',
          driver: 'catalog_seed',
          label: 'Browser session ready',
          detail: 'Validated recently.',
          lastCheckedAt: '2026-03-20T10:04:00.000Z'
        }
      ],
      catalog: [
        {
          source: 'target_site',
          sourceJobId: 'linkedin_noise_case',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_noise_case',
          title: 'Frontend Developer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T09:00:00.000Z',
          discoveredAt: '2026-03-20T10:04:00.000Z',
          salaryText: null,
          summary: 'Noise filter case.',
          description: 'Noise filter case.',
          keySkills: ['React']
        }
      ]
    })
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: '2026-03-20T10:00:00.000Z',
          completedAt: '2026-03-20T10:01:00.000Z',
          querySummary: 'Agent discovery test run',
          warning: 'Agent discovery stopped after 12 steps. Found 0 jobs.',
          jobs: [
            {
              source: 'target_site',
              sourceJobId: 'linkedin_noise_case',
              discoveryMethod: 'catalog_seed',
              canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_noise_case',
              title: 'Frontend Developer',
              company: 'Signal Systems',
              location: 'Remote',
              workMode: ['remote'],
              applyPath: 'easy_apply',
              easyApplyEligible: true,
              postedAt: '2026-03-20T09:00:00.000Z',
              discoveredAt: '2026-03-20T10:04:00.000Z',
              salaryText: null,
              summary: 'Noise filter case.',
              description: 'Noise filter case.',
              keySkills: ['React']
            }
          ],
          agentMetadata: {
            steps: 12,
            incomplete: true,
            transcriptMessageCount: 7,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: 'timed_out_with_partial_evidence',
            phaseCompletionReason: 'The phase timed out before the worker returned a structured finish call.',
            phaseEvidence: null,
            debugFindings: {
              summary: 'Use the jobs route and reusable show-all collection path.',
              reliableControls: [
                'Recommendation rows expose show-all links that open reusable prefiltered job lists.',
                'Location encoding: Use %2C for comma and %20 for spaces.',
                'Jobs landing URL: https://www.linkedin.com/jobs/search/?location=Prishtina%2C%20Kosovo&geoId=103175575'
              ],
              trickyFilters: [
                'Job availability may change frequently - verify current postings before applying.',
                'Direct URL navigation with query parameters bypasses the need to use the search box manually.',
                'CurrentJobId appears in the URL after viewing a listing.'
              ],
              navigationTips: ['Start from the jobs hub and recommendation collections rather than the homepage.'],
              applyTips: ['Use the on-site apply entry when the detail page exposes it.'],
              warnings: ['Agent discovery stopped after 12 steps. Found 0 jobs.']
            }
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

    await workspaceService.runSourceDebug('target_linkedin_default')
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1)
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? []),
      ...(latestArtifact?.warnings ?? [])
    ].join('\n').toLowerCase()

    expect(learnedLines).not.toContain('agent discovery stopped after')
    expect(learnedLines).not.toContain('location encoding')
    expect(learnedLines).not.toContain('%2c')
    expect(learnedLines).not.toContain('query parameters')
    expect(learnedLines).not.toContain('geoid')
    expect(learnedLines).not.toContain('currentjobid')
    expect(learnedLines).not.toContain('job availability may change frequently')
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


