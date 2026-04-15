import {
  ApplyExecutionResultSchema,
  DiscoveryRunResultSchema,
  type AgentDiscoveryProgress,
  type ApplyExecutionResult,
  type BrowserSessionState,
  type CandidateProfile,
  type DiscoveryRunResult,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type ResumeExportArtifact,
  type SavedJob,
} from '@unemployed/contracts'
import { buildApplyReplay, buildScreeningQuestions } from './apply'
import {
  buildDiscoveryQuerySummary,
  filterCatalogAgentDiscoveryJobs,
  filterCatalogDiscoveryJobs,
} from './discovery'
import { normalizeText } from './shared'

export interface CatalogSessionRuntimePrimitives {
  getSessionState(source: JobSource): BrowserSessionState
  listCatalogJobs(source: JobSource): readonly JobPosting[]
}

export interface CatalogSessionAgentDiscoveryOptions {
  searchPreferences: {
    targetRoles: string[]
    locations: string[]
  }
  targetJobCount: number
  startingUrls: string[]
  siteLabel: string
  skipSessionValidation?: boolean
  onProgress?: (progress: AgentDiscoveryProgress) => void
}

export interface CatalogSessionEasyApplyInput {
  job: SavedJob
  resumeExport: ResumeExportArtifact
  resumeFilePath: string
  profile: CandidateProfile
  settings: JobFinderSettings
  instructions?: readonly string[]
}

function buildSessionBlockedResult(session: BrowserSessionState): Error {
  const detail = session.detail ? ` ${session.detail}` : ''
  return new Error(`Browser session is not ready for automation.${detail}`)
}

export function createCatalogSessionAgent(primitives: CatalogSessionRuntimePrimitives) {
  return {
    runDiscovery(
      source: JobSource,
      searchPreferences: JobSearchPreferences,
    ): Promise<DiscoveryRunResult> {
      const session = primitives.getSessionState(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const startedAt = new Date().toISOString()
      const filteredJobs = filterCatalogDiscoveryJobs(
        primitives.listCatalogJobs(source),
        searchPreferences,
      )
      const completedAt = new Date().toISOString()

      return Promise.resolve(
        DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt,
          querySummary: buildDiscoveryQuerySummary(searchPreferences),
          warning:
            filteredJobs.length === 0
              ? 'No supported listings matched the current preferences in the configured discovery target.'
              : null,
          jobs: filteredJobs,
        }),
      )
    },
    executeEasyApply(
      source: JobSource,
      input: CatalogSessionEasyApplyInput,
    ): Promise<ApplyExecutionResult> {
      const session = primitives.getSessionState(source)

      if (session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      const now = new Date().toISOString()
      const { job, resumeExport, resumeFilePath } = input
      const questions = buildScreeningQuestions({
        job,
        profile: input.profile,
        now,
      })
      const replay = buildApplyReplay(job)

      if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'unsupported',
            summary: 'Easy Apply path is unsupported',
            detail: `${job.title} at ${job.company} no longer exposes a supported Easy Apply path for this slice.`,
            submittedAt: null,
            outcome: null,
            questions: [],
            blocker: {
              code: 'unsupported_apply_path',
              summary: 'The saved job no longer exposes a supported Easy Apply path.',
              detail:
                'The deterministic adapter stopped before entering an unsupported or external branch.',
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [],
            replay,
            nextActionLabel: 'Inspect the listing manually',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_unsupported`,
                at: now,
                label: 'Unsupported apply path',
                detail:
                  'The adapter stopped before entering an unsupported or external branch.',
                state: 'unsupported',
              },
            ],
          }),
        )
      }

      if (!resumeFilePath.trim()) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'failed',
            summary: 'Approved resume export is missing',
            detail:
              'The apply flow cannot continue until an approved tailored resume export path is available.',
            submittedAt: null,
            outcome: null,
            questions: [],
            blocker: {
              code: 'missing_resume',
              summary: 'The approved tailored resume export is missing.',
              detail:
                'The adapter refused to submit without an approved resume export file path.',
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [],
            replay,
            nextActionLabel: 'Re-export and approve the tailored resume',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_asset_missing`,
                at: now,
                label: 'Resume export missing',
                detail:
                  'The adapter refused to submit without an approved resume export file path.',
                state: 'failed',
              },
            ],
          }),
        )
      }

      const normalizedDescription = normalizeText(job.description)
      const requiresHumanPause =
        normalizedDescription.includes('portfolio') ||
        normalizedDescription.includes('work authorization') ||
        normalizedDescription.includes('visa sponsorship') ||
        normalizedDescription.includes('salary expectation')

      if (requiresHumanPause) {
        return Promise.resolve(
          ApplyExecutionResultSchema.parse({
            state: 'paused',
            summary: 'Easy Apply needs manual review',
            detail: `${job.company} asks for additional information that the safe automation path will not guess.`,
            submittedAt: null,
            outcome: null,
            questions,
            blocker: {
              code: 'requires_manual_review',
              summary: 'Extra application questions need manual review.',
              detail:
                'The deterministic adapter detected unsupported questions before submission.',
              questionIds: questions.map((question) => question.id),
              sourceDebugEvidenceRefIds: [],
              url: job.applicationUrl ?? job.canonicalUrl,
            },
            consentDecisions: [
              {
                id: `consent_${job.id}_resume_use`,
                kind: 'resume_use',
                label: 'Use the approved tailored resume for this apply flow',
                status: 'approved',
                decidedAt: now,
                detail: `Approved export ${resumeExport.id} stayed selected for this attempt.`,
              },
              {
                id: `consent_${job.id}_manual_follow_up`,
                kind: 'manual_follow_up',
                label: 'Finish unsupported answers manually',
                status: 'requested',
                decidedAt: null,
                detail: 'The remaining questions need a human answer before submission.',
              },
            ],
            replay,
            nextActionLabel:
              'Open the application and finish the unsupported fields manually',
            checkpoints: [
              {
                id: `checkpoint_${job.id}_open_listing`,
                at: now,
                label: 'Opened Easy Apply',
                detail:
                  'The adapter validated the listing and started the Easy Apply flow.',
                state: 'in_progress',
              },
              {
                id: `checkpoint_${job.id}_manual_review`,
                at: now,
                label: 'Paused for manual review',
                detail: 'Unsupported questions were detected before submission.',
                state: 'paused',
              },
            ],
          }),
        )
      }

      return Promise.resolve(
        ApplyExecutionResultSchema.parse({
          state: 'submitted',
          summary: 'Easy Apply submitted',
          detail: `Submitted ${job.title} at ${job.company} with your approved tailored resume.`,
          submittedAt: now,
          outcome: 'submitted',
          questions: [
            {
              id: `question_${job.id}_resume_upload`,
              prompt: 'Upload the approved tailored resume.',
              kind: 'resume',
              isRequired: true,
              detectedAt: now,
              answerOptions: [],
              suggestedAnswers: [
                {
                  id: `suggested_answer_${job.id}_resume_upload`,
                  text: resumeFilePath,
                  sourceKind: 'resume' as const,
                  sourceId: resumeExport.id,
                  confidenceLabel: 'approved export',
                  provenance: [
                    {
                      id: `answer_provenance_resume_${resumeExport.id}`,
                      sourceKind: 'resume',
                      sourceId: resumeExport.id,
                      label: 'Approved tailored resume export',
                      snippet: resumeFilePath,
                    },
                  ],
                },
              ],
              submittedAnswer: resumeFilePath,
              status: 'submitted',
            },
          ],
          blocker: null,
          consentDecisions: [
            {
              id: `consent_${job.id}_resume_use`,
              kind: 'resume_use',
              label: 'Use the approved tailored resume for this apply flow',
              status: 'approved',
              decidedAt: now,
              detail: `Applied with your approved tailored resume.`,
            },
            {
              id: `consent_${job.id}_autofill_profile`,
              kind: 'autofill_profile',
              label: 'Use saved profile details where the supported flow requests them',
              status: 'approved',
              decidedAt: now,
              detail: 'The supported path completed without extra manual questions.',
            },
          ],
          replay,
          nextActionLabel: 'Monitor your inbox for recruiter follow-up',
          checkpoints: [
            {
              id: `checkpoint_${job.id}_open_listing`,
              at: now,
              label: 'Opened Easy Apply',
              detail:
                'The adapter opened the Easy Apply workflow from the selected listing.',
              state: 'in_progress',
            },
            {
              id: `checkpoint_${job.id}_resume_attached`,
              at: now,
              label: 'Attached tailored resume',
              detail: `Attached approved resume export from ${resumeFilePath}.`,
              state: 'in_progress',
            },
            {
              id: `checkpoint_${job.id}_submitted`,
              at: now,
              label: 'Submission confirmed',
              detail: 'The supported Easy Apply path completed successfully.',
              state: 'submitted',
            },
          ],
        }),
      )
    },
    runAgentDiscovery(
      source: JobSource,
      options: CatalogSessionAgentDiscoveryOptions,
    ): Promise<DiscoveryRunResult> {
      const session = primitives.getSessionState(source)

      if (!options.skipSessionValidation && session.status !== 'ready') {
        throw buildSessionBlockedResult(session)
      }

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: 0,
        stepCount: 1,
        currentAction: 'navigate',
        targetId: null,
        adapterKind: source,
      })

      const startedAt = new Date().toISOString()
      const filteredJobs = filterCatalogAgentDiscoveryJobs(
        primitives.listCatalogJobs(source),
        options,
      )

      options.onProgress?.({
        currentUrl: options.startingUrls[0] ?? 'about:blank',
        jobsFound: filteredJobs.length,
        stepCount: 2,
        currentAction: 'extract_jobs',
        targetId: null,
        adapterKind: source,
      })

      return Promise.resolve(
        DiscoveryRunResultSchema.parse({
          source,
          startedAt,
          completedAt: new Date().toISOString(),
          querySummary: `${options.searchPreferences.targetRoles.join(', ') || 'all roles'} | ${options.searchPreferences.locations.join(', ') || 'all locations'} | ${options.siteLabel}`,
          warning:
            filteredJobs.length === 0
              ? `No catalog jobs matched the current ${options.siteLabel} target.`
              : null,
          jobs: filteredJobs,
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 0,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        }),
      )
    },
  }
}
