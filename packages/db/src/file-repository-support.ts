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
} from "@unemployed/contracts";
import type { DatabaseSync } from "node:sqlite";

import { secureDatabaseFile } from "./internal/migrations";
import {
  cloneValue,
  listCollectionValues,
  upsertCollectionValue,
  upsertIndexedCollectionValue,
} from "./internal/state";
import { APPLY_INDEXED_COLLECTION_CONFIGS } from "./apply-collection-support";
import { USER_ACTION_INDEXED_COLLECTION_CONFIGS } from "./user-action-repository-support";

export function runImmediateTransaction<TValue>(
  database: DatabaseSync,
  operation: () => TValue,
): TValue {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function syncApprovedResumeExportsForJob(
  database: DatabaseSync,
  jobId: string,
  approvedExportId: string | null = null,
): void {
  database
    .prepare(
      `UPDATE resume_export_artifacts
       SET is_approved = CASE WHEN id = ? THEN 1 ELSE 0 END,
           value = json_set(
             value,
             '$.isApproved',
             CASE WHEN id = ? THEN json('true') ELSE json('false') END
           )
       WHERE job_id = ?`,
    )
    .run(approvedExportId, approvedExportId, jobId);
}

export function resolveApprovedExportId(
  database: DatabaseSync,
  draft: { approvedExportId: string | null; id: string; jobId: string },
): string | null {
  if (!draft.approvedExportId) {
    return null;
  }

  const matchingArtifact = listCollectionValues(
    database,
    "resume_export_artifacts",
    ResumeExportArtifactSchema,
    {
      whereSql: "id = ? AND draft_id = ? AND job_id = ?",
      params: [draft.approvedExportId, draft.id, draft.jobId],
      orderBySql: "exported_at DESC, id ASC",
    },
  )[0];

  return matchingArtifact?.id ?? null;
}

export const INDEXED_COLLECTION_CONFIGS = {
  ...APPLY_INDEXED_COLLECTION_CONFIGS,
  ...USER_ACTION_INDEXED_COLLECTION_CONFIGS,
  profile_copilot_messages: {
    columnNames: ["created_at"],
    getColumns: (value: unknown) => {
      const message = ProfileCopilotMessageSchema.parse(cloneValue(value));
      return [message.createdAt];
    },
  },
  profile_revisions: {
    columnNames: ["created_at"],
    getColumns: (value: unknown) => {
      const revision = ProfileRevisionSchema.parse(cloneValue(value));
      return [revision.createdAt];
    },
  },
  resume_assistant_messages: {
    columnNames: ["job_id", "created_at"],
    getColumns: (value: unknown) => {
      const message = ResumeAssistantMessageSchema.parse(cloneValue(value));
      return [message.jobId, message.createdAt];
    },
  },
  resume_draft_revisions: {
    columnNames: ["draft_id", "created_at"],
    getColumns: (value: unknown) => {
      const revision = ResumeDraftRevisionSchema.parse(cloneValue(value));
      return [revision.draftId, revision.createdAt];
    },
  },
  resume_drafts: {
    columnNames: ["job_id", "created_at", "updated_at"],
    getColumns: (value: unknown) => {
      const draft = ResumeDraftSchema.parse(cloneValue(value));
      return [draft.jobId, draft.createdAt, draft.updatedAt];
    },
  },
  resume_export_artifacts: {
    columnNames: ["job_id", "draft_id", "exported_at", "is_approved"],
    getColumns: (value: unknown) => {
      const artifact = ResumeExportArtifactSchema.parse(cloneValue(value));
      return [
        artifact.jobId,
        artifact.draftId,
        artifact.exportedAt,
        artifact.isApproved ? 1 : 0,
      ];
    },
  },
  resume_import_runs: {
    columnNames: ["source_resume_id", "started_at", "status"],
    getColumns: (value: unknown) => {
      const run = ResumeImportRunSchema.parse(cloneValue(value));
      return [run.sourceResumeId, run.startedAt, run.status];
    },
  },
  resume_import_document_bundles: {
    columnNames: ["run_id", "source_resume_id", "created_at"],
    getColumns: (value: unknown) => {
      const bundle = ResumeDocumentBundleSchema.parse(cloneValue(value));
      return [bundle.runId, bundle.sourceResumeId, bundle.createdAt];
    },
  },
  resume_import_field_candidates: {
    columnNames: ["run_id", "resolution", "created_at"],
    getColumns: (value: unknown) => {
      const candidate = ResumeImportFieldCandidateSchema.parse(
        cloneValue(value),
      );
      return [candidate.runId, candidate.resolution, candidate.createdAt];
    },
  },
  resume_research_artifacts: {
    columnNames: ["job_id", "fetched_at"],
    getColumns: (value: unknown) => {
      const artifact = ResumeResearchArtifactSchema.parse(cloneValue(value));
      return [artifact.jobId, artifact.fetchedAt];
    },
  },
  resume_validation_results: {
    columnNames: ["draft_id", "validated_at"],
    getColumns: (value: unknown) => {
      const validation = ResumeValidationResultSchema.parse(cloneValue(value));
      return [validation.draftId, validation.validatedAt];
    },
  },
} as const;

export type PersistedTableName =
  | "apply_runs"
  | "apply_job_results"
  | "apply_submit_approvals"
  | "application_question_records"
  | "application_answer_records"
  | "application_artifact_refs"
  | "application_replay_checkpoints"
  | "application_consent_requests"
  | "tailored_assets"
  | "resume_drafts"
  | "resume_draft_revisions"
  | "resume_export_artifacts"
  | "resume_import_runs"
  | "resume_import_document_bundles"
  | "resume_import_field_candidates"
  | "resume_research_artifacts"
  | "resume_validation_results"
  | "resume_assistant_messages"
  | "profile_copilot_messages"
  | "profile_revisions"
  | "application_records"
  | "application_attempts"
  | "source_debug_runs"
  | "source_debug_attempts"
  | "source_instruction_artifacts"
  | "saved_jobs"
  | "source_debug_evidence_refs";

export type FileRepositoryContext = {
  database: DatabaseSync;
  filePath: string;
  upsertPersistedValue: (
    tableName: PersistedTableName,
    value: { id: string },
  ) => Promise<void>;
  writePersistedValue: (
    tableName: PersistedTableName,
    value: { id: string },
  ) => void;
};

export function createFileRepositoryContext(input: {
  database: DatabaseSync;
  filePath: string;
}): FileRepositoryContext {
  const { database, filePath } = input;

  function writePersistedValue(
    tableName: PersistedTableName,
    value: { id: string },
  ): void {
    const indexedConfig =
      tableName in INDEXED_COLLECTION_CONFIGS
        ? INDEXED_COLLECTION_CONFIGS[
            tableName as keyof typeof INDEXED_COLLECTION_CONFIGS
          ]
        : null;

    if (indexedConfig) {
      upsertIndexedCollectionValue(database, tableName, value, indexedConfig);
      return;
    }

    upsertCollectionValue(database, tableName, value);
  }

  function upsertPersistedValue(
    tableName: PersistedTableName,
    value: { id: string },
  ): Promise<void> {
    runImmediateTransaction(database, () => {
      writePersistedValue(tableName, value);
    });

    return secureDatabaseFile(filePath);
  }

  return {
    database,
    filePath,
    upsertPersistedValue,
    writePersistedValue,
  };
}
