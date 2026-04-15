import {
  ProfileCopilotMessageSchema,
  ProfileRevisionSchema,
  ResumeAssistantMessageSchema,
  ResumeDocumentBundleSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumeExportArtifactSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportRunSchema,
  ResumeResearchArtifactSchema,
  ResumeValidationResultSchema,
  type JobFinderRepositoryState,
} from '@unemployed/contracts'
import type { DatabaseSync } from 'node:sqlite'

import { secureDatabaseFile } from './internal/migrations'
import {
  cloneValue,
  listCollectionValues,
  readState,
  replaceCollection,
  replaceIndexedCollection,
  saveSingletonValue,
  upsertCollectionValue,
  upsertIndexedCollectionValue,
} from './internal/state'

export function runImmediateTransaction<TValue>(
  database: DatabaseSync,
  operation: () => TValue,
): TValue {
  database.exec('BEGIN IMMEDIATE')

  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function syncApprovedResumeExportsForJob(
  database: DatabaseSync,
  jobId: string,
  approvedExportId: string | null = null,
): void {
  database
    .prepare(
      'UPDATE resume_export_artifacts SET is_approved = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE job_id = ?',
    )
    .run(approvedExportId, jobId)
}

export function resolveApprovedExportId(
  database: DatabaseSync,
  draft: { approvedExportId: string | null; id: string; jobId: string },
): string | null {
  if (!draft.approvedExportId) {
    return null
  }

  const matchingArtifact = listCollectionValues(
    database,
    'resume_export_artifacts',
    ResumeExportArtifactSchema,
    {
      whereSql: 'id = ? AND draft_id = ? AND job_id = ?',
      params: [draft.approvedExportId, draft.id, draft.jobId],
      orderBySql: 'exported_at DESC, id ASC',
    },
  )[0]

  return matchingArtifact?.id ?? null
}

export const INDEXED_COLLECTION_CONFIGS = {
  profile_copilot_messages: {
    columnNames: ['created_at'],
    getColumns: (value: unknown) => {
      const message = ProfileCopilotMessageSchema.parse(cloneValue(value))
      return [message.createdAt]
    },
  },
  profile_revisions: {
    columnNames: ['created_at'],
    getColumns: (value: unknown) => {
      const revision = ProfileRevisionSchema.parse(cloneValue(value))
      return [revision.createdAt]
    },
  },
  resume_assistant_messages: {
    columnNames: ['job_id', 'created_at'],
    getColumns: (value: unknown) => {
      const message = ResumeAssistantMessageSchema.parse(cloneValue(value))
      return [message.jobId, message.createdAt]
    },
  },
  resume_draft_revisions: {
    columnNames: ['draft_id', 'created_at'],
    getColumns: (value: unknown) => {
      const revision = ResumeDraftRevisionSchema.parse(cloneValue(value))
      return [revision.draftId, revision.createdAt]
    },
  },
  resume_drafts: {
    columnNames: ['job_id', 'created_at', 'updated_at'],
    getColumns: (value: unknown) => {
      const draft = ResumeDraftSchema.parse(cloneValue(value))
      return [draft.jobId, draft.createdAt, draft.updatedAt]
    },
  },
  resume_export_artifacts: {
    columnNames: ['job_id', 'draft_id', 'exported_at', 'is_approved'],
    getColumns: (value: unknown) => {
      const artifact = ResumeExportArtifactSchema.parse(cloneValue(value))
      return [
        artifact.jobId,
        artifact.draftId,
        artifact.exportedAt,
        artifact.isApproved ? 1 : 0,
      ]
    },
  },
  resume_import_runs: {
    columnNames: ['source_resume_id', 'started_at', 'status'],
    getColumns: (value: unknown) => {
      const run = ResumeImportRunSchema.parse(cloneValue(value))
      return [run.sourceResumeId, run.startedAt, run.status]
    },
  },
  resume_import_document_bundles: {
    columnNames: ['run_id', 'source_resume_id', 'created_at'],
    getColumns: (value: unknown) => {
      const bundle = ResumeDocumentBundleSchema.parse(cloneValue(value))
      return [bundle.runId, bundle.sourceResumeId, bundle.createdAt]
    },
  },
  resume_import_field_candidates: {
    columnNames: ['run_id', 'resolution', 'created_at'],
    getColumns: (value: unknown) => {
      const candidate = ResumeImportFieldCandidateSchema.parse(cloneValue(value))
      return [candidate.runId, candidate.resolution, candidate.createdAt]
    },
  },
  resume_research_artifacts: {
    columnNames: ['job_id', 'fetched_at'],
    getColumns: (value: unknown) => {
      const artifact = ResumeResearchArtifactSchema.parse(cloneValue(value))
      return [artifact.jobId, artifact.fetchedAt]
    },
  },
  resume_validation_results: {
    columnNames: ['draft_id', 'validated_at'],
    getColumns: (value: unknown) => {
      const validation = ResumeValidationResultSchema.parse(cloneValue(value))
      return [validation.draftId, validation.validatedAt]
    },
  },
} as const

export type PersistedTableName =
  | 'tailored_assets'
  | 'resume_drafts'
  | 'resume_draft_revisions'
  | 'resume_export_artifacts'
  | 'resume_import_runs'
  | 'resume_import_document_bundles'
  | 'resume_import_field_candidates'
  | 'resume_research_artifacts'
  | 'resume_validation_results'
  | 'resume_assistant_messages'
  | 'profile_copilot_messages'
  | 'profile_revisions'
  | 'application_records'
  | 'application_attempts'
  | 'source_debug_runs'
  | 'source_debug_attempts'
  | 'source_instruction_artifacts'
  | 'source_debug_evidence_refs'

export type FileRepositoryContext = {
  database: DatabaseSync
  filePath: string
  normalizedSeed: JobFinderRepositoryState
  persist: (mutator: (state: JobFinderRepositoryState) => void) => Promise<void>
  upsertPersistedValue: (
    tableName: PersistedTableName,
    value: { id: string },
  ) => Promise<void>
  writePersistedValue: (tableName: PersistedTableName, value: { id: string }) => void
}

export function createFileRepositoryContext(input: {
  database: DatabaseSync
  filePath: string
  normalizedSeed: JobFinderRepositoryState
}): FileRepositoryContext {
  const { database, filePath, normalizedSeed } = input

  function persist(mutator: (state: JobFinderRepositoryState) => void): Promise<void> {
    runImmediateTransaction(database, () => {
      const state = readState(database, normalizedSeed)
      mutator(state)
      saveSingletonValue(database, 'profile', state.profile)
      saveSingletonValue(database, 'search_preferences', state.searchPreferences)
      saveSingletonValue(database, 'profile_setup_state', state.profileSetupState)
      saveSingletonValue(database, 'settings', state.settings)
      saveSingletonValue(database, 'discovery_state', state.discovery)
      replaceCollection(database, 'saved_jobs', state.savedJobs)
      replaceCollection(database, 'tailored_assets', state.tailoredAssets)
      replaceIndexedCollection(database, 'resume_drafts', state.resumeDrafts, {
        ...INDEXED_COLLECTION_CONFIGS.resume_drafts,
      })
      replaceIndexedCollection(database, 'resume_draft_revisions', state.resumeDraftRevisions, {
        ...INDEXED_COLLECTION_CONFIGS.resume_draft_revisions,
      })
      replaceIndexedCollection(database, 'resume_export_artifacts', state.resumeExportArtifacts, {
        ...INDEXED_COLLECTION_CONFIGS.resume_export_artifacts,
      })
      replaceIndexedCollection(database, 'resume_import_runs', state.resumeImportRuns, {
        ...INDEXED_COLLECTION_CONFIGS.resume_import_runs,
      })
      replaceIndexedCollection(database, 'resume_import_document_bundles', state.resumeImportDocumentBundles, {
        ...INDEXED_COLLECTION_CONFIGS.resume_import_document_bundles,
      })
      replaceIndexedCollection(database, 'resume_import_field_candidates', state.resumeImportFieldCandidates, {
        ...INDEXED_COLLECTION_CONFIGS.resume_import_field_candidates,
      })
      replaceIndexedCollection(database, 'resume_research_artifacts', state.resumeResearchArtifacts, {
        ...INDEXED_COLLECTION_CONFIGS.resume_research_artifacts,
      })
      replaceIndexedCollection(database, 'resume_validation_results', state.resumeValidationResults, {
        ...INDEXED_COLLECTION_CONFIGS.resume_validation_results,
      })
      replaceIndexedCollection(database, 'resume_assistant_messages', state.resumeAssistantMessages, {
        ...INDEXED_COLLECTION_CONFIGS.resume_assistant_messages,
      })
      replaceIndexedCollection(database, 'profile_copilot_messages', state.profileCopilotMessages, {
        ...INDEXED_COLLECTION_CONFIGS.profile_copilot_messages,
      })
      replaceIndexedCollection(database, 'profile_revisions', state.profileRevisions, {
        ...INDEXED_COLLECTION_CONFIGS.profile_revisions,
      })
      replaceCollection(database, 'application_records', state.applicationRecords)
      replaceCollection(database, 'application_attempts', state.applicationAttempts)
      replaceCollection(database, 'source_debug_runs', state.sourceDebugRuns)
      replaceCollection(database, 'source_debug_attempts', state.sourceDebugAttempts)
      replaceCollection(database, 'source_instruction_artifacts', state.sourceInstructionArtifacts)
      replaceCollection(database, 'source_debug_evidence_refs', state.sourceDebugEvidenceRefs)
    })

    return secureDatabaseFile(filePath)
  }

  function writePersistedValue(tableName: PersistedTableName, value: { id: string }): void {
    const indexedConfig =
      tableName in INDEXED_COLLECTION_CONFIGS
        ? INDEXED_COLLECTION_CONFIGS[tableName as keyof typeof INDEXED_COLLECTION_CONFIGS]
        : null

    if (indexedConfig) {
      upsertIndexedCollectionValue(database, tableName, value, indexedConfig)
      return
    }

    upsertCollectionValue(database, tableName, value)
  }

  function upsertPersistedValue(
    tableName: PersistedTableName,
    value: { id: string },
  ): Promise<void> {
    runImmediateTransaction(database, () => {
      writePersistedValue(tableName, value)
    })

    return secureDatabaseFile(filePath)
  }

  return {
    database,
    filePath,
    normalizedSeed,
    persist,
    upsertPersistedValue,
    writePersistedValue,
  }
}
