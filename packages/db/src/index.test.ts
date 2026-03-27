import { describe, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { JobFinderRepositorySeed } from './index'
import { createFileJobFinderRepository, createInMemoryJobFinderRepository } from './index'

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
      phone: null,
      portfolioUrl: null,
      linkedinUrl: null,
      githubUrl: null,
      personalWebsiteUrl: null,
      baseResume: {
        id: 'resume_1',
        fileName: 'alex-vanguard.pdf',
        uploadedAt: '2026-03-20T10:00:00.000Z',
        storagePath: '/tmp/alex-vanguard.pdf',
        textContent: 'Alex Vanguard\nSenior systems designer\nReact\nFigma',
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
      skills: ['Figma', 'React'],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: []
    },
    searchPreferences: {
      targetRoles: ['Principal Designer'],
      jobFamilies: [],
      locations: ['Remote'],
      excludedLocations: [],
      workModes: ['remote'],
      seniorityLevels: ['senior'],
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      minimumSalaryUsd: 170000,
      targetSalaryUsd: null,
      salaryCurrency: 'USD',
      approvalMode: 'review_before_submit' as const,
      tailoringMode: 'balanced' as const,
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: 'target_linkedin_default',
            label: 'LinkedIn Jobs',
            startingUrl: 'https://www.linkedin.com/jobs/search/',
            enabled: true,
            adapterKind: 'auto' as const,
            customInstructions: null
          }
        ]
      }
    },
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: [],
      settings: {
      resumeFormat: 'html' as const,
      resumeTemplateId: 'classic_ats' as const,
      fontPreset: 'inter_requisite' as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
        keepSessionAlive: true,
        discoveryOnly: false
      },
      discovery: {
        sessions: [],
        runState: 'idle' as const,
        activeRun: null,
        recentRuns: [],
        pendingDiscoveryJobs: []
      }
  }
}

describe('createInMemoryJobFinderRepository', () => {
  test('returns cloned values and supports asset and attempt upserts', async () => {
    const repository = createInMemoryJobFinderRepository(createSeed())
    const profile = await repository.getProfile()

    profile.fullName = 'Changed locally'

    const freshProfile = await repository.getProfile()

    expect(freshProfile.fullName).toBe('Alex Vanguard')

    await repository.upsertTailoredAsset({
      id: 'asset_1',
      jobId: 'job_1',
      kind: 'resume',
      status: 'ready',
      label: 'Tailored Resume',
      version: 'v1',
      templateName: 'Classic ATS',
      compatibilityScore: 98,
      progressPercent: 100,
      updatedAt: '2026-03-20T10:05:00.000Z',
      storagePath: null,
      contentText: 'Resume text',
      previewSections: [],
      generationMethod: 'deterministic',
      notes: []
    })

    await repository.upsertApplicationAttempt({
      id: 'attempt_1',
      jobId: 'job_1',
      state: 'submitted',
      summary: 'Easy Apply submitted',
      detail: 'Submitted successfully.',
      startedAt: '2026-03-20T10:04:00.000Z',
      updatedAt: '2026-03-20T10:05:00.000Z',
      completedAt: '2026-03-20T10:05:00.000Z',
      outcome: 'submitted',
      nextActionLabel: 'Monitor inbox',
      checkpoints: []
    })

    const assets = await repository.listTailoredAssets()
    const attempts = await repository.listApplicationAttempts()

    expect(assets).toHaveLength(1)
    expect(assets[0]?.contentText).toBe('Resume text')
    expect(attempts[0]?.state).toBe('submitted')

    await repository.reset(createSeed())

    const resetAssets = await repository.listTailoredAssets()
    const resetAttempts = await repository.listApplicationAttempts()

    expect(resetAssets).toHaveLength(0)
    expect(resetAttempts).toHaveLength(0)
  })



  test('falls back safely when legacy JSON contains stale saved job records', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-db-legacy-'))
    const filePath = path.join(tempDirectory, 'job-finder-state.sqlite')
    const legacyPath = path.join(tempDirectory, 'job-finder-state.json')

    try {
      await writeFile(
        legacyPath,
        JSON.stringify({
          ...createSeed(),
          savedJobs: [
            {
              id: 'legacy_job_1',
              source: 'linkedin',
              title: 'Legacy Role',
              company: 'Old Co',
              location: 'Remote',
              workMode: ['remote'],
              applyPath: 'easy_apply',
              postedAt: '2026-03-20T10:00:00.000Z',
              salaryText: '$180k',
              summary: 'Legacy data without new fields.',
              keySkills: []
            }
          ]
        })
      )

      const repository = await createFileJobFinderRepository({ filePath, seed: createSeed() })
      const savedJobs = await repository.listSavedJobs()

      expect(savedJobs).toEqual([])
      await repository.close()
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('migrates legacy string workMode values in saved jobs and experiences', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-db-work-mode-'))
    const filePath = path.join(tempDirectory, 'job-finder-state.sqlite')
    const legacyPath = path.join(tempDirectory, 'job-finder-state.json')

    try {
      await writeFile(
        legacyPath,
        JSON.stringify({
          ...createSeed(),
          profile: {
            ...createSeed().profile,
            experiences: [
              {
                id: 'experience_1',
                companyName: 'Signal Systems',
                companyUrl: null,
                title: 'Senior systems designer',
                employmentType: 'Full-time',
                location: 'London, UK',
                workMode: 'hybrid',
                startDate: '2020-01',
                endDate: null,
                isCurrent: true,
                isDraft: false,
                summary: 'Builds resilient workflows.',
                achievements: [],
                skills: [],
                domainTags: [],
                peopleManagementScope: null,
                ownershipScope: null
              }
            ]
          },
          savedJobs: [
            {
              id: 'job_legacy',
              source: 'linkedin',
              sourceJobId: 'linkedin_job_legacy',
              discoveryMethod: 'catalog_seed',
              canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_job_legacy',
              title: 'Lead Designer',
              company: 'Signal Systems',
              location: 'Remote',
              workMode: 'remote',
              applyPath: 'easy_apply',
              easyApplyEligible: true,
              postedAt: '2026-03-20T10:00:00.000Z',
              discoveredAt: '2026-03-20T10:01:00.000Z',
              salaryText: '$180k',
              summary: 'Lead product design.',
              description: 'Lead product design for operational software.',
              keySkills: ['Figma'],
              status: 'ready_for_review',
               matchAssessment: {
                 score: 94,
                 reasons: ['Strong overlap'],
                 gaps: []
                },
                provenance: []
              }
          ]
        })
      )

      const repository = await createFileJobFinderRepository({ filePath, seed: createSeed() })
      const [profile, savedJobs] = await Promise.all([repository.getProfile(), repository.listSavedJobs()])

      expect(profile.experiences[0]?.workMode).toEqual(['hybrid'])
      expect(savedJobs[0]?.workMode).toEqual(['remote'])

      await repository.close()
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  test('persists repository state to a local sqlite file', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-db-'))
    const filePath = path.join(tempDirectory, 'job-finder-state.sqlite')

    try {
      const firstRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed()
      })

      await firstRepository.replaceSavedJobs([
        {
          id: 'job_1',
          source: 'linkedin',
          sourceJobId: 'linkedin_job_1',
          discoveryMethod: 'catalog_seed',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_job_1',
          title: 'Lead Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: ['remote'],
          applyPath: 'easy_apply',
          easyApplyEligible: true,
          postedAt: '2026-03-20T10:00:00.000Z',
          discoveredAt: '2026-03-20T10:01:00.000Z',
          salaryText: '$180k',
          summary: 'Lead product design.',
          description: 'Lead product design for operational software.',
          keySkills: ['Figma'],
          status: 'ready_for_review',
            matchAssessment: {
              score: 94,
              reasons: ['Strong overlap'],
              gaps: []
            },
            provenance: []
          }
        ])

      await firstRepository.upsertApplicationAttempt({
        id: 'attempt_1',
        jobId: 'job_1',
        state: 'submitted',
        summary: 'Easy Apply submitted',
        detail: 'Submitted successfully.',
        startedAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        completedAt: '2026-03-20T10:05:00.000Z',
        outcome: 'submitted',
        nextActionLabel: 'Monitor inbox',
        checkpoints: []
      })

      const secondRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed()
      })
      const savedJobs = await secondRepository.listSavedJobs()
      const attempts = await secondRepository.listApplicationAttempts()

      expect(savedJobs).toHaveLength(1)
      expect(savedJobs[0]?.canonicalUrl).toContain('linkedin_job_1')
      expect(attempts).toHaveLength(1)
      expect(attempts[0]?.summary).toBe('Easy Apply submitted')
      await firstRepository.close()
      await secondRepository.close()
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})
