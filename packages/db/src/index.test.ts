import { describe, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
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
      approvalMode: 'review_before_submit' as const,
      tailoringMode: 'balanced' as const,
      companyBlacklist: [],
      companyWhitelist: []
    },
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
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
  test('returns cloned values and supports asset upserts', async () => {
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
      previewSections: []
    })

    await repository.upsertTailoredAsset({
      id: 'asset_1',
      jobId: 'job_1',
      kind: 'resume',
      status: 'generating',
      label: 'Tailored Resume',
      version: 'v2',
      templateName: 'Classic ATS',
      compatibilityScore: null,
      progressPercent: 42,
      updatedAt: '2026-03-20T10:10:00.000Z',
      previewSections: []
    })

    const assets = await repository.listTailoredAssets()

    expect(assets).toHaveLength(1)
    expect(assets[0]?.version).toBe('v2')
    expect(assets[0]?.status).toBe('generating')

    await repository.reset(createSeed())

    const resetAssets = await repository.listTailoredAssets()

    expect(resetAssets).toHaveLength(0)
  })

  test('persists repository state to a local file', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'unemployed-db-'))
    const filePath = path.join(tempDirectory, 'job-finder-state.json')

    try {
      const firstRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed()
      })

      await firstRepository.replaceSavedJobs([
        {
          id: 'job_1',
          source: 'linkedin',
          title: 'Lead Designer',
          company: 'Signal Systems',
          location: 'Remote',
          workMode: 'remote',
          applyPath: 'easy_apply',
          postedAt: '2026-03-20T10:00:00.000Z',
          salaryText: '$180k',
          summary: 'Lead product design.',
          keySkills: ['Figma'],
          status: 'ready_for_review',
          matchAssessment: {
            score: 94,
            reasons: ['Strong overlap'],
            gaps: []
          }
        }
      ])

      const secondRepository = await createFileJobFinderRepository({
        filePath,
        seed: createSeed()
      })
      const savedJobs = await secondRepository.listSavedJobs()

      expect(savedJobs).toHaveLength(1)
      expect(savedJobs[0]?.title).toBe('Lead Designer')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})
