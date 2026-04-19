import {
  ApplyJobResultSchema,
  ApplyRunSchema,
  ApplySubmitApprovalSchema,
  ApplicationAnswerRecordSchema,
  ApplicationArtifactRefSchema,
  ApplicationAttemptSchema,
  ApplicationConsentRequestSchema,
  ApplicationRecordSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  ProfileCopilotMessageSchema,
  ProfileRevisionSchema,
  ProfileSetupStateSchema,
  ResumeDraftSchema,
  SavedJobSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
} from '@unemployed/contracts'
import { DatabaseSync } from 'node:sqlite'

import { createFileRepositoryResumeMethods } from './file-repository-resume-methods'
import {
  APPLY_COLLECTION_ORDER_BY_SQL,
  buildOptionalSqlFilters,
} from './apply-collection-support'
import {
  createFileRepositoryContext,
  runImmediateTransaction,
  syncApprovedResumeExportsForJob,
} from './file-repository-support'
import { secureDatabaseFile, runMigrations } from './internal/migrations'
import {
  normalizeLegacyDiscoveryState,
  normalizeLegacySourceDebugRunRecord,
  readLegacySeed,
} from './internal/legacy'
import {
  bootstrapState,
  cloneValue,
  getSingletonValue,
  hasPersistedState,
  listCollectionValues,
  listValues,
  replaceCollection,
  saveSingletonValue,
  writeState,
} from './internal/state'
import type { FileJobFinderRepositoryOptions, JobFinderRepository } from './repository-types'

export async function createFileJobFinderRepository(
  options: FileJobFinderRepositoryOptions,
): Promise<JobFinderRepository> {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(options.seed))
  const database = new DatabaseSync(options.filePath)

  runMigrations(database)

  if (!hasPersistedState(database)) {
    const legacySeed = await readLegacySeed(options.filePath, normalizedSeed)
    bootstrapState(database, legacySeed ?? normalizedSeed)
    await secureDatabaseFile(options.filePath)
  }

  const context = createFileRepositoryContext({
    database,
    filePath: options.filePath,
    normalizedSeed,
  })

  function listApplyCollection<TValue>(input: {
    tableName:
      | 'apply_runs'
      | 'apply_job_results'
      | 'apply_submit_approvals'
      | 'application_question_records'
      | 'application_answer_records'
      | 'application_artifact_refs'
      | 'application_replay_checkpoints'
      | 'application_consent_requests'
    schema: { parse: (value: unknown) => TValue }
    orderBySql: string
    filters?: ReadonlyArray<readonly [columnName: string, value: string | undefined]>
  }): TValue[] {
    return listCollectionValues(database, input.tableName, input.schema, {
      ...buildOptionalSqlFilters(input.filters ?? []),
      orderBySql: input.orderBySql,
    })
  }

  return {
    ...createFileRepositoryResumeMethods(context),
    close() {
      database.close()
      return Promise.resolve()
    },
    reset(nextSeed) {
      const nextState = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed))
      writeState(database, nextState)
      return secureDatabaseFile(options.filePath)
    },
    getProfile() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, 'profile', CandidateProfileSchema) ??
            normalizedSeed.profile,
        ),
      )
    },
    saveProfile(profile) {
      return context.persist((state) => {
        state.profile = CandidateProfileSchema.parse(cloneValue(profile))
      })
    },
    getSearchPreferences() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, 'search_preferences', JobSearchPreferencesSchema) ??
            normalizedSeed.searchPreferences,
        ),
      )
    },
    getProfileSetupState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, 'profile_setup_state', ProfileSetupStateSchema) ??
            normalizedSeed.profileSetupState,
        ),
      )
    },
    saveSearchPreferences(searchPreferences) {
      return context.persist((state) => {
        state.searchPreferences = JobSearchPreferencesSchema.parse(
          cloneValue(searchPreferences),
        )
      })
    },
    saveProfileSetupState(profileSetupState) {
      return context.persist((state) => {
        state.profileSetupState = ProfileSetupStateSchema.parse(
          cloneValue(profileSetupState),
        )
      })
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      const normalizedProfile = CandidateProfileSchema.parse(cloneValue(profile))
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      )

      return context.persist((state) => {
        state.profile = normalizedProfile
        state.searchPreferences = normalizedSearchPreferences
      })
    },
    commitProfileCopilotState({
      profile,
      searchPreferences,
      profileSetupState,
      messages,
      revisions,
    }) {
      const normalizedProfile = CandidateProfileSchema.parse(cloneValue(profile))
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      )
      const normalizedProfileSetupState = ProfileSetupStateSchema.parse(
        cloneValue(profileSetupState),
      )
      const normalizedMessages = ProfileCopilotMessageSchema.array().parse(
        cloneValue(messages ?? []),
      )
      const normalizedRevisions = ProfileRevisionSchema.array().parse(
        cloneValue(revisions ?? []),
      )

      runImmediateTransaction(database, () => {
        saveSingletonValue(database, 'profile', normalizedProfile)
        saveSingletonValue(database, 'search_preferences', normalizedSearchPreferences)
        saveSingletonValue(database, 'profile_setup_state', normalizedProfileSetupState)

        for (const message of normalizedMessages) {
          context.writePersistedValue('profile_copilot_messages', message)
        }

        for (const revision of normalizedRevisions) {
          context.writePersistedValue('profile_revisions', revision)
        }
      })

      return secureDatabaseFile(options.filePath)
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(listValues(database, 'saved_jobs', SavedJobSchema)))
    },
    replaceSavedJobs(savedJobs) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]))
      runImmediateTransaction(database, () => {
        replaceCollection(database, 'saved_jobs', normalizedJobs)
      })

      return secureDatabaseFile(options.filePath)
    },
    replaceSavedJobsAndDiscoveryState({ savedJobs, discoveryState }) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]))
      const normalizedDiscoveryState = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      )

      runImmediateTransaction(database, () => {
        replaceCollection(database, 'saved_jobs', normalizedJobs)
        saveSingletonValue(database, 'discovery_state', normalizedDiscoveryState)
      })

      return secureDatabaseFile(options.filePath)
    },
    replaceSavedJobsAndClearResumeApproval({
      savedJobs,
      draft,
      staleReason,
      tailoredAsset,
    }) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]))
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          staleReason,
          approvedAt: null,
          approvedExportId: null,
        }),
      )
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null

      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error('Tailored asset job does not match the provided draft.')
      }

      runImmediateTransaction(database, () => {
        replaceCollection(database, 'saved_jobs', normalizedJobs)
        syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null)
        context.writePersistedValue('resume_drafts', normalizedDraft)

        if (normalizedAsset) {
          context.writePersistedValue('tailored_assets', normalizedAsset)
        }
      })

      return secureDatabaseFile(options.filePath)
    },
    listApplyRuns(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'apply_runs',
            schema: ApplyRunSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_runs,
            filters: options?.id ? [['id', options.id]] : [],
          }),
        ),
      )
    },
    upsertApplyRun(run) {
      const normalizedRun = ApplyRunSchema.parse(cloneValue(run))
      return context.upsertPersistedValue('apply_runs', normalizedRun)
    },
    listApplyJobResults(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'apply_job_results',
            schema: ApplyJobResultSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_job_results,
            filters: [
              ...(options?.runId ? [['runId', options.runId] as const] : []),
              ...(options?.jobId ? [['jobId', options.jobId] as const] : []),
            ],
          }),
        ),
      )
    },
    upsertApplyJobResult(result) {
      const normalizedResult = ApplyJobResultSchema.parse(cloneValue(result))
      return context.upsertPersistedValue('apply_job_results', normalizedResult)
    },
    listApplySubmitApprovals(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'apply_submit_approvals',
            schema: ApplySubmitApprovalSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_submit_approvals,
            filters: [
              ...(options?.id ? [['id', options.id] as const] : []),
              ...(options?.runId ? [['runId', options.runId] as const] : []),
            ],
          }),
        ),
      )
    },
    upsertApplySubmitApproval(approval) {
      const normalizedApproval = ApplySubmitApprovalSchema.parse(cloneValue(approval))
      return context.upsertPersistedValue('apply_submit_approvals', normalizedApproval)
    },
    listApplicationQuestionRecords(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'application_question_records',
            schema: ApplicationQuestionRecordSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_question_records,
            filters: [
              ['run_id', options?.runId],
              ['job_id', options?.jobId],
              ['result_id', options?.resultId],
            ],
          }),
        ),
      )
    },
    upsertApplicationQuestionRecord(record) {
      const normalizedRecord = ApplicationQuestionRecordSchema.parse(cloneValue(record))
      return context.upsertPersistedValue('application_question_records', normalizedRecord)
    },
    listApplicationAnswerRecords(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'application_answer_records',
            schema: ApplicationAnswerRecordSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_answer_records,
            filters: [
              ['run_id', options?.runId],
              ['job_id', options?.jobId],
              ['result_id', options?.resultId],
              ['question_id', options?.questionId],
            ],
          }),
        ),
      )
    },
    upsertApplicationAnswerRecord(record) {
      const normalizedRecord = ApplicationAnswerRecordSchema.parse(cloneValue(record))
      return context.upsertPersistedValue('application_answer_records', normalizedRecord)
    },
    listApplicationArtifactRefs(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'application_artifact_refs',
            schema: ApplicationArtifactRefSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_artifact_refs,
            filters: [
              ['run_id', options?.runId],
              ['job_id', options?.jobId],
              ['result_id', options?.resultId],
            ],
          }),
        ),
      )
    },
    upsertApplicationArtifactRef(ref) {
      const normalizedRef = ApplicationArtifactRefSchema.parse(cloneValue(ref))
      return context.upsertPersistedValue('application_artifact_refs', normalizedRef)
    },
    listApplicationReplayCheckpoints(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'application_replay_checkpoints',
            schema: ApplicationReplayCheckpointSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_replay_checkpoints,
            filters: [
              ['run_id', options?.runId],
              ['job_id', options?.jobId],
              ['result_id', options?.resultId],
            ],
          }),
        ),
      )
    },
    upsertApplicationReplayCheckpoint(checkpoint) {
      const normalizedCheckpoint = ApplicationReplayCheckpointSchema.parse(cloneValue(checkpoint))
      return context.upsertPersistedValue('application_replay_checkpoints', normalizedCheckpoint)
    },
    listApplicationConsentRequests(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: 'application_consent_requests',
            schema: ApplicationConsentRequestSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_consent_requests,
            filters: [
              ['run_id', options?.runId],
              ['job_id', options?.jobId],
              ['result_id', options?.resultId],
            ],
          }),
        ),
      )
    },
    upsertApplicationConsentRequest(request) {
      const normalizedRequest = ApplicationConsentRequestSchema.parse(cloneValue(request))
      return context.upsertPersistedValue('application_consent_requests', normalizedRequest)
    },
    listApplicationRecords() {
      return Promise.resolve(
        cloneValue(listValues(database, 'application_records', ApplicationRecordSchema)),
      )
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(cloneValue(applicationRecord))
      return context.upsertPersistedValue('application_records', normalizedRecord)
    },
    listApplicationAttempts() {
      return Promise.resolve(
        cloneValue(listValues(database, 'application_attempts', ApplicationAttemptSchema)),
      )
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(cloneValue(applicationAttempt))
      return context.upsertPersistedValue('application_attempts', normalizedAttempt)
    },
    listSourceDebugRuns() {
      return Promise.resolve(
        cloneValue(
          listValues(database, 'source_debug_runs', {
            parse: normalizeLegacySourceDebugRunRecord,
          }),
        ),
      )
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run))
      return context.upsertPersistedValue('source_debug_runs', normalizedRun)
    },
    listSourceDebugAttempts() {
      return Promise.resolve(
        cloneValue(
          listValues(database, 'source_debug_attempts', SourceDebugWorkerAttemptSchema),
        ),
      )
    },
    upsertSourceDebugAttempt(attempt) {
      const normalizedAttempt = SourceDebugWorkerAttemptSchema.parse(cloneValue(attempt))
      return context.upsertPersistedValue('source_debug_attempts', normalizedAttempt)
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(
        cloneValue(
          listValues(database, 'source_instruction_artifacts', SourceInstructionArtifactSchema),
        ),
      )
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(cloneValue(artifact))
      return context.upsertPersistedValue('source_instruction_artifacts', normalizedArtifact)
    },
    deleteSourceInstructionArtifactsForTarget(targetId) {
      runImmediateTransaction(database, () => {
        database
          .prepare(
            "DELETE FROM source_instruction_artifacts WHERE json_extract(value, '$.targetId') = ?",
          )
          .run(targetId)
      })

      return secureDatabaseFile(options.filePath)
    },
    listSourceDebugEvidenceRefs() {
      return Promise.resolve(
        cloneValue(
          listValues(database, 'source_debug_evidence_refs', SourceDebugEvidenceRefSchema),
        ),
      )
    },
    upsertSourceDebugEvidenceRef(evidenceRef) {
      const normalizedEvidenceRef = SourceDebugEvidenceRefSchema.parse(cloneValue(evidenceRef))
      return context.upsertPersistedValue('source_debug_evidence_refs', normalizedEvidenceRef)
    },
    getSettings() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, 'settings', JobFinderSettingsSchema) ??
            normalizedSeed.settings,
        ),
      )
    },
    saveSettings(settings) {
      return context.persist((state) => {
        state.settings = JobFinderSettingsSchema.parse(cloneValue(settings))
      })
    },
    getDiscoveryState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, 'discovery_state', {
            parse: normalizeLegacyDiscoveryState,
          }) ?? normalizedSeed.discovery,
        ),
      )
    },
    saveDiscoveryState(discoveryState) {
      const normalizedDiscoveryState = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      )

      runImmediateTransaction(database, () => {
        saveSingletonValue(database, 'discovery_state', normalizedDiscoveryState)
      })

      return secureDatabaseFile(options.filePath)
    },
  }
}
