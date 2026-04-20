import {
  ApplyJobResultSchema,
  ApplyRunSchema,
  ApplySubmitApprovalSchema,
  ApplicationAttemptSchema,
  ApplicationAnswerRecordSchema,
  ApplicationArtifactRefSchema,
  ApplicationConsentRequestSchema,
  ApplicationRecordSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
  CandidateProfileSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  ProfileCopilotMessageSchema,
  ProfileRevisionSchema,
  ProfileSetupStateSchema,
  ResumeDocumentBundleSchema,
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumeExportArtifactSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportRunSchema,
  ResumeResearchArtifactSchema,
  ResumeValidationResultSchema,
  SavedJobSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
  type JobFinderRepositoryState,
} from "@unemployed/contracts";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  APPLY_COLLECTION_ORDER_BY_SQL,
  APPLY_INDEXED_COLLECTION_CONFIGS,
} from "../apply-collection-support";

import {
  normalizeLegacyDiscoveryState,
  normalizeLegacySourceDebugRunRecord,
} from "./legacy";
import type {
  JobFinderRepositorySeed,
  SchemaParser,
  StateTableKey,
} from "../repository-types";

export const stateTableNames = {
  application_answer_records: "application_answer_records",
  application_artifact_refs: "application_artifact_refs",
  application_attempts: "application_attempts",
  application_consent_requests: "application_consent_requests",
  application_question_records: "application_question_records",
  application_replay_checkpoints: "application_replay_checkpoints",
  application_records: "application_records",
  apply_job_results: "apply_job_results",
  apply_runs: "apply_runs",
  apply_submit_approvals: "apply_submit_approvals",
  profile_copilot_messages: "profile_copilot_messages",
  profile_revisions: "profile_revisions",
  saved_jobs: "saved_jobs",
  resume_assistant_messages: "resume_assistant_messages",
  resume_draft_revisions: "resume_draft_revisions",
  resume_drafts: "resume_drafts",
  resume_export_artifacts: "resume_export_artifacts",
  resume_import_document_bundles: "resume_import_document_bundles",
  resume_import_field_candidates: "resume_import_field_candidates",
  resume_import_runs: "resume_import_runs",
  resume_research_artifacts: "resume_research_artifacts",
  resume_validation_results: "resume_validation_results",
  singleton_state: "singleton_state",
  source_debug_attempts: "source_debug_attempts",
  source_debug_evidence_refs: "source_debug_evidence_refs",
  source_debug_runs: "source_debug_runs",
  source_instruction_artifacts: "source_instruction_artifacts",
  tailored_assets: "tailored_assets",
} as const;

export type StateCollectionTable = Exclude<
  keyof typeof stateTableNames,
  "singleton_state"
>;

export function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function parseJsonValue<TValue>(
  rawValue: string,
  schema: SchemaParser<TValue>,
): TValue {
  return schema.parse(JSON.parse(rawValue) as unknown);
}

function tryParseJsonValue<TValue>(
  rawValue: string,
  schema: SchemaParser<TValue>,
): TValue | null {
  try {
    return parseJsonValue(rawValue, schema);
  } catch {
    return null;
  }
}

export function listValues<TValue>(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  schema: SchemaParser<TValue>,
): TValue[] {
  return database
    .prepare(`SELECT value FROM ${stateTableNames[tableName]} ORDER BY id`)
    .all()
    .flatMap((row) => {
      const parsedValue = tryParseJsonValue(String(row.value), schema);
      return parsedValue ? [parsedValue] : [];
    });
}

export function listCollectionValues<TValue>(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  schema: SchemaParser<TValue>,
  options: {
    orderBySql: string;
    whereSql?: string;
    params?: readonly SQLInputValue[];
  },
): TValue[] {
  const whereClause = options.whereSql ? ` WHERE ${options.whereSql}` : "";
  return database
    .prepare(
      `SELECT value FROM ${stateTableNames[tableName]}${whereClause} ORDER BY ${options.orderBySql}`,
    )
    .all(...(options.params ?? []))
    .flatMap((row) => {
      const parsedValue = tryParseJsonValue(String(row.value), schema);
      return parsedValue ? [parsedValue] : [];
    });
}

export function getSingletonValue<TValue>(
  database: DatabaseSync,
  key: StateTableKey,
  schema: SchemaParser<TValue>,
): TValue | null {
  const row = database
    .prepare(
      `SELECT value FROM ${stateTableNames.singleton_state} WHERE key = ?`,
    )
    .get(key);

  if (!row) {
    return null;
  }

  return tryParseJsonValue(String(row.value), schema);
}

export function saveSingletonValue(
  database: DatabaseSync,
  key: StateTableKey,
  value: unknown,
): void {
  database
    .prepare(
      `INSERT OR REPLACE INTO ${stateTableNames.singleton_state} (key, value) VALUES (?, ?)`,
    )
    .run(key, JSON.stringify(value));
}

export function replaceCollection(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  values: readonly { id: string }[],
): void {
  database.exec(`DELETE FROM ${stateTableNames[tableName]}`);
  const statement = database.prepare(
    `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (id, value) VALUES (?, ?)`,
  );

  for (const value of values) {
    statement.run(value.id, JSON.stringify(value));
  }
}

export function replaceIndexedCollection(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  values: readonly { id: string }[],
  options: {
    columnNames: readonly string[];
    getColumns: (value: { id: string }) => readonly SQLInputValue[];
  },
): void {
  database.exec(`DELETE FROM ${stateTableNames[tableName]}`);
  const columnSql = ["id", ...options.columnNames, "value"].join(", ");
  const placeholders = Array.from({
    length: options.columnNames.length + 2,
  })
    .fill("?")
    .join(", ");
  const statement = database.prepare(
    `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (${columnSql}) VALUES (${placeholders})`,
  );

  for (const value of values) {
    statement.run(
      value.id,
      ...options.getColumns(value),
      JSON.stringify(value),
    );
  }
}

export function upsertIndexedCollectionValue(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  value: { id: string },
  options: {
    columnNames: readonly string[];
    getColumns: (value: { id: string }) => readonly SQLInputValue[];
  },
): void {
  const columnSql = ["id", ...options.columnNames, "value"].join(", ");
  const placeholders = Array.from({
    length: options.columnNames.length + 2,
  })
    .fill("?")
    .join(", ");
  database
    .prepare(
      `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (${columnSql}) VALUES (${placeholders})`,
    )
    .run(value.id, ...options.getColumns(value), JSON.stringify(value));
}

export function upsertCollectionValue(
  database: DatabaseSync,
  tableName: StateCollectionTable,
  value: { id: string },
): void {
  database
    .prepare(
      `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (id, value) VALUES (?, ?)`,
    )
    .run(value.id, JSON.stringify(value));
}

export function writeState(
  database: DatabaseSync,
  state: JobFinderRepositoryState,
): void {
  database.exec("BEGIN IMMEDIATE");

  try {
    saveSingletonValue(database, "profile", state.profile);
    saveSingletonValue(database, "search_preferences", state.searchPreferences);
    saveSingletonValue(database, "profile_setup_state", state.profileSetupState);
    saveSingletonValue(database, "settings", state.settings);
    saveSingletonValue(database, "discovery_state", state.discovery);
    replaceCollection(database, "saved_jobs", state.savedJobs);
    replaceCollection(database, "tailored_assets", state.tailoredAssets);
    replaceIndexedCollection(database, "apply_runs", state.applyRuns, APPLY_INDEXED_COLLECTION_CONFIGS.apply_runs);
    replaceIndexedCollection(database, "apply_job_results", state.applyJobResults, APPLY_INDEXED_COLLECTION_CONFIGS.apply_job_results);
    replaceIndexedCollection(database, "apply_submit_approvals", state.applySubmitApprovals, APPLY_INDEXED_COLLECTION_CONFIGS.apply_submit_approvals);
    replaceIndexedCollection(
      database,
      "application_question_records",
      state.applicationQuestionRecords,
      APPLY_INDEXED_COLLECTION_CONFIGS.application_question_records,
    );
    replaceIndexedCollection(
      database,
      "application_answer_records",
      state.applicationAnswerRecords,
      APPLY_INDEXED_COLLECTION_CONFIGS.application_answer_records,
    );
    replaceIndexedCollection(
      database,
      "application_artifact_refs",
      state.applicationArtifactRefs,
      APPLY_INDEXED_COLLECTION_CONFIGS.application_artifact_refs,
    );
    replaceIndexedCollection(
      database,
      "application_replay_checkpoints",
      state.applicationReplayCheckpoints,
      APPLY_INDEXED_COLLECTION_CONFIGS.application_replay_checkpoints,
    );
    replaceIndexedCollection(
      database,
      "application_consent_requests",
      state.applicationConsentRequests,
      APPLY_INDEXED_COLLECTION_CONFIGS.application_consent_requests,
    );
    replaceIndexedCollection(database, "resume_drafts", state.resumeDrafts, {
      columnNames: ["job_id", "created_at", "updated_at"],
      getColumns: (value) => {
        const draft = ResumeDraftSchema.parse(value);
        return [draft.jobId, draft.createdAt, draft.updatedAt];
      },
    });
    replaceIndexedCollection(
      database,
      "resume_draft_revisions",
      state.resumeDraftRevisions,
      {
        columnNames: ["draft_id", "created_at"],
        getColumns: (value) => {
          const revision = ResumeDraftRevisionSchema.parse(value);
          return [revision.draftId, revision.createdAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_export_artifacts",
      state.resumeExportArtifacts,
      {
        columnNames: ["job_id", "draft_id", "exported_at", "is_approved"],
        getColumns: (value) => {
          const artifact = ResumeExportArtifactSchema.parse(value);
          return [
            artifact.jobId,
            artifact.draftId,
            artifact.exportedAt,
            artifact.isApproved ? 1 : 0,
          ];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_import_runs",
      state.resumeImportRuns,
      {
        columnNames: ["source_resume_id", "started_at", "status"],
        getColumns: (value) => {
          const run = ResumeImportRunSchema.parse(value);
          return [run.sourceResumeId, run.startedAt, run.status];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_import_document_bundles",
      state.resumeImportDocumentBundles,
      {
        columnNames: ["run_id", "source_resume_id", "created_at"],
        getColumns: (value) => {
          const bundle = ResumeDocumentBundleSchema.parse(value);
          return [bundle.runId, bundle.sourceResumeId, bundle.createdAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_import_field_candidates",
      state.resumeImportFieldCandidates,
      {
        columnNames: ["run_id", "resolution", "created_at"],
        getColumns: (value) => {
          const candidate = ResumeImportFieldCandidateSchema.parse(value);
          return [candidate.runId, candidate.resolution, candidate.createdAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_research_artifacts",
      state.resumeResearchArtifacts,
      {
        columnNames: ["job_id", "fetched_at"],
        getColumns: (value) => {
          const artifact = ResumeResearchArtifactSchema.parse(value);
          return [artifact.jobId, artifact.fetchedAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_validation_results",
      state.resumeValidationResults,
      {
        columnNames: ["draft_id", "validated_at"],
        getColumns: (value) => {
          const validation = ResumeValidationResultSchema.parse(value);
          return [validation.draftId, validation.validatedAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "resume_assistant_messages",
      state.resumeAssistantMessages,
      {
        columnNames: ["job_id", "created_at"],
        getColumns: (value) => {
          const message = ResumeAssistantMessageSchema.parse(value);
          return [message.jobId, message.createdAt];
        },
      },
    );
    replaceIndexedCollection(
      database,
      "profile_copilot_messages",
      state.profileCopilotMessages,
      {
        columnNames: ["created_at"],
        getColumns: (value) => {
          const message = ProfileCopilotMessageSchema.parse(value);
          return [message.createdAt];
        },
      },
    );
    replaceIndexedCollection(database, "profile_revisions", state.profileRevisions, {
      columnNames: ["created_at"],
      getColumns: (value) => {
        const revision = ProfileRevisionSchema.parse(value);
        return [revision.createdAt];
      },
    });
    replaceCollection(database, "application_records", state.applicationRecords);
    replaceCollection(
      database,
      "application_attempts",
      state.applicationAttempts,
    );
    replaceCollection(database, "source_debug_runs", state.sourceDebugRuns);
    replaceCollection(
      database,
      "source_debug_attempts",
      state.sourceDebugAttempts,
    );
    replaceCollection(
      database,
      "source_instruction_artifacts",
      state.sourceInstructionArtifacts,
    );
    replaceCollection(
      database,
      "source_debug_evidence_refs",
      state.sourceDebugEvidenceRefs,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function bootstrapState(
  database: DatabaseSync,
  seed: JobFinderRepositorySeed,
): void {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(seed));
  writeState(database, normalizedSeed);
}

export function hasPersistedState(database: DatabaseSync): boolean {
  const singletonCountRow = database
    .prepare(`SELECT COUNT(*) AS count FROM ${stateTableNames.singleton_state}`)
    .get() as { count?: number } | undefined;
  const singletonCount = Number(singletonCountRow?.count ?? 0);
  const jobCountRow = database
    .prepare(`SELECT COUNT(*) AS count FROM ${stateTableNames.saved_jobs}`)
    .get() as { count?: number } | undefined;
  const jobCount = Number(jobCountRow?.count ?? 0);

  return singletonCount > 0 || jobCount > 0;
}

export function readState(
  database: DatabaseSync,
  fallbackSeed: JobFinderRepositorySeed,
): JobFinderRepositoryState {
  const profile =
    getSingletonValue(database, "profile", CandidateProfileSchema) ??
    fallbackSeed.profile;
  const searchPreferences =
    getSingletonValue(
      database,
      "search_preferences",
      JobSearchPreferencesSchema,
    ) ?? fallbackSeed.searchPreferences;
  const settings =
    getSingletonValue(database, "settings", JobFinderSettingsSchema) ??
    fallbackSeed.settings;
  const profileSetupState =
    getSingletonValue(
      database,
      "profile_setup_state",
      ProfileSetupStateSchema,
    ) ?? fallbackSeed.profileSetupState;
  const discovery =
    getSingletonValue(database, "discovery_state", {
      parse: normalizeLegacyDiscoveryState,
    }) ?? fallbackSeed.discovery;

  return JobFinderRepositoryStateSchema.parse({
    profile,
    searchPreferences,
    profileSetupState,
    savedJobs: listValues(database, "saved_jobs", SavedJobSchema),
    tailoredAssets: listValues(database, "tailored_assets", TailoredAssetSchema),
    resumeDrafts: listCollectionValues(
      database,
      "resume_drafts",
      ResumeDraftSchema,
      {
        orderBySql: "updated_at DESC, id ASC",
      },
    ),
    resumeDraftRevisions: listCollectionValues(
      database,
      "resume_draft_revisions",
      ResumeDraftRevisionSchema,
      {
        orderBySql: "created_at DESC, id ASC",
      },
    ),
    resumeExportArtifacts: listCollectionValues(
      database,
      "resume_export_artifacts",
      ResumeExportArtifactSchema,
      {
        orderBySql: "exported_at DESC, id ASC",
      },
    ),
    resumeImportRuns: listCollectionValues(
      database,
      "resume_import_runs",
      ResumeImportRunSchema,
      {
        orderBySql: "started_at DESC, id ASC",
      },
    ),
    resumeImportDocumentBundles: listCollectionValues(
      database,
      "resume_import_document_bundles",
      ResumeDocumentBundleSchema,
      {
        orderBySql: "created_at DESC, id ASC",
      },
    ),
    resumeImportFieldCandidates: listCollectionValues(
      database,
      "resume_import_field_candidates",
      ResumeImportFieldCandidateSchema,
      {
        orderBySql: "created_at DESC, id ASC",
      },
    ),
    resumeResearchArtifacts: listCollectionValues(
      database,
      "resume_research_artifacts",
      ResumeResearchArtifactSchema,
      {
        orderBySql: "fetched_at DESC, id ASC",
      },
    ),
    resumeValidationResults: listCollectionValues(
      database,
      "resume_validation_results",
      ResumeValidationResultSchema,
      {
        orderBySql: "validated_at DESC, id ASC",
      },
    ),
    resumeAssistantMessages: listCollectionValues(
      database,
      "resume_assistant_messages",
      ResumeAssistantMessageSchema,
      {
        orderBySql: "created_at ASC, id ASC",
      },
    ),
    profileCopilotMessages: listCollectionValues(
      database,
      "profile_copilot_messages",
      ProfileCopilotMessageSchema,
      {
        orderBySql: "created_at ASC, id ASC",
      },
    ),
    profileRevisions: listCollectionValues(
      database,
      "profile_revisions",
      ProfileRevisionSchema,
      {
        orderBySql: "created_at DESC, id ASC",
      },
    ),
    applyRuns: listCollectionValues(database, "apply_runs", ApplyRunSchema, {
      orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_runs,
    }),
    applyJobResults: listCollectionValues(
      database,
      "apply_job_results",
      ApplyJobResultSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_job_results,
      },
    ),
    applySubmitApprovals: listCollectionValues(
      database,
      "apply_submit_approvals",
      ApplySubmitApprovalSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_submit_approvals,
      },
    ),
    applicationQuestionRecords: listCollectionValues(
      database,
      "application_question_records",
      ApplicationQuestionRecordSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_question_records,
      },
    ),
    applicationAnswerRecords: listCollectionValues(
      database,
      "application_answer_records",
      ApplicationAnswerRecordSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_answer_records,
      },
    ),
    applicationArtifactRefs: listCollectionValues(
      database,
      "application_artifact_refs",
      ApplicationArtifactRefSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_artifact_refs,
      },
    ),
    applicationReplayCheckpoints: listCollectionValues(
      database,
      "application_replay_checkpoints",
      ApplicationReplayCheckpointSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_replay_checkpoints,
      },
    ),
    applicationConsentRequests: listCollectionValues(
      database,
      "application_consent_requests",
      ApplicationConsentRequestSchema,
      {
        orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_consent_requests,
      },
    ),
    applicationRecords: listValues(
      database,
      "application_records",
      ApplicationRecordSchema,
    ),
    applicationAttempts: listValues(
      database,
      "application_attempts",
      ApplicationAttemptSchema,
    ),
    sourceDebugRuns: listValues(database, "source_debug_runs", {
      parse: normalizeLegacySourceDebugRunRecord,
    }),
    sourceDebugAttempts: listValues(
      database,
      "source_debug_attempts",
      SourceDebugWorkerAttemptSchema,
    ),
    sourceInstructionArtifacts: listValues(
      database,
      "source_instruction_artifacts",
      SourceInstructionArtifactSchema,
    ),
    sourceDebugEvidenceRefs: listValues(
      database,
      "source_debug_evidence_refs",
      SourceDebugEvidenceRefSchema,
    ),
    settings,
    discovery,
  });
}
