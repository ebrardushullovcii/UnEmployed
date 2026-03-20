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
      skills: ['Figma', 'React']
    },
    searchPreferences: {
      targetRoles: ['Principal Designer'],
      locations: ['Remote'],
      workModes: ['remote'],
      seniorityLevels: ['senior'],
      minimumSalaryUsd: 170000,
      approvalMode: 'review_before_submit' as const,
      tailoringMode: 'balanced' as const,
      companyBlacklist: [],
      companyWhitelist: []
    },
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: [],
    settings: {
      resumeFormat: 'pdf' as const,
      fontPreset: 'inter_requisite' as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true
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
      previewSections: []
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
              workMode: 'remote',
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
          canonicalUrl: 'https://www.linkedin.com/jobs/view/linkedin_job_1',
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
          }
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
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})
