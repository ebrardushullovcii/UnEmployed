import {
  CandidateProfileSchema,
  SavedJobSchema,
  type ApplicationResumeArtifact,
  type ApplyExecutionResult,
  type JobFinderSettings,
} from '@unemployed/contracts'
import { describe, expect, test } from 'vitest'
import {
  createCatalogBrowserSessionRuntime,
  createStubBrowserSessionRuntime,
} from './catalog-browser-session-runtime'

const settings: JobFinderSettings = {
  resumeFormat: 'pdf',
  resumeTemplateId: 'classic_ats',
  fontPreset: 'inter_requisite',
  appearanceTheme: 'system',
  humanReviewRequired: true,
  allowAutoSubmitOverride: false,
  keepSessionAlive: true,
  discoveryOnly: false,
}

const profile = CandidateProfileSchema.parse({
  id: 'candidate_catalog_safety',
  firstName: 'Casey',
  lastName: 'Rowan',
  fullName: 'Casey Rowan',
  headline: 'Senior frontend engineer',
  summary: 'Builds accessible web applications.',
  currentLocation: 'Portland, Oregon',
  yearsExperience: 8,
  baseResume: {
    id: 'resume_catalog_safety',
    fileName: 'casey-rowan.pdf',
    uploadedAt: '2026-07-31T00:00:00.000Z',
    textContent: 'Synthetic resume text.',
    extractionStatus: 'ready',
  },
})

const job = SavedJobSchema.parse({
  id: 'job_catalog_safety',
  source: 'target_site',
  sourceJobId: 'job_catalog_safety',
  canonicalUrl: 'https://jobs.example.com/job_catalog_safety',
  applicationUrl: 'https://jobs.example.com/job_catalog_safety/apply',
  title: 'Senior Frontend Engineer',
  company: 'Example Company',
  location: 'Remote',
  workMode: ['remote'],
  applyPath: 'easy_apply',
  easyApplyEligible: true,
  discoveredAt: '2026-07-31T00:00:00.000Z',
  salaryText: null,
  description: 'Build accessible frontend systems.',
  status: 'ready_for_review',
  matchAssessment: {
    score: 91,
  },
})

const resumeArtifact: ApplicationResumeArtifact = {
  id: 'application_resume_catalog_safety',
  jobId: job.id,
  source: 'original_upload',
  sourceDocumentId: profile.baseResume.id,
  exportArtifactId: null,
  fileName: profile.baseResume.fileName,
  filePath: 'C:\\synthetic\\casey-rowan.pdf',
  approvedAt: '2026-07-31T00:01:00.000Z',
}

function expectPreSubmitCheckpoint(result: ApplyExecutionResult) {
  expect(result.state).toBe('paused')
  expect(result.outcome).toBeNull()
  expect(result.submittedAt).toBeNull()
  expect(result.summary).toMatch(/paused before final submit/i)
  expect(result.checkpoints.some((checkpoint) => checkpoint.state === 'submitted')).toBe(false)
}

function expectSafeResumeIdentity(result: ApplyExecutionResult) {
  const serialized = JSON.stringify(result)
  const resumeQuestion = result.questions.find(
    (question) => question.kind === 'resume',
  )

  expect(serialized).not.toContain(resumeArtifact.filePath)
  expect(serialized).not.toContain('C:\\')
  expect(serialized).toContain(resumeArtifact.fileName)
  expect(resumeQuestion?.submittedAnswer).toBe(resumeArtifact.fileName)
  expect(resumeQuestion?.suggestedAnswers[0]?.text).toBe(
    resumeArtifact.fileName,
  )
  expect(resumeQuestion?.suggestedAnswers[0]?.provenance[0]?.snippet).toBe(
    resumeArtifact.fileName,
  )
  expect(
    result.checkpoints.find((checkpoint) =>
      checkpoint.id.endsWith('_resume_attached'),
    )?.detail,
  ).toContain(resumeArtifact.fileName)
}

describe('catalog apply safety invariant', () => {
  test('keeps every exported catalog runtime entrypoint and mode non-submitting', async () => {
    const runtimeFactories = [
      createCatalogBrowserSessionRuntime,
      createStubBrowserSessionRuntime,
    ]

    for (const createRuntime of runtimeFactories) {
      const runtime = createRuntime({
        sessions: [
          {
            source: 'target_site',
            status: 'ready',
            driver: 'catalog_seed',
            label: 'Ready',
            detail: 'Synthetic catalog session is ready.',
            lastCheckedAt: '2026-07-31T00:00:00.000Z',
          },
        ],
        catalog: [],
      })
      const input = {
        job,
        resumeArtifact,
        profile,
        settings,
      }

      const results = [
        await runtime.executeEasyApply('target_site', input),
        await runtime.executeApplicationFlow('target_site', {
          ...input,
          mode: 'prepare_only',
        }),
        await runtime.executeApplicationFlow('target_site', {
          ...input,
          mode: 'submit_when_ready',
          submitAuthorized: true,
        }),
      ]
      for (const result of results) {
        expectPreSubmitCheckpoint(result)
        expectSafeResumeIdentity(result)
      }
    }
  })
})
