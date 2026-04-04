import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumeExportArtifactSchema,
  ResumeResearchArtifactSchema,
  ResumeValidationResultSchema,
  SavedJobSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
  type JobFinderRepositoryState,
} from "@unemployed/contracts";
import { DatabaseSync } from "node:sqlite";

import { secureDatabaseFile, runMigrations } from "./internal/migrations";
import { readLegacySeed } from "./internal/legacy";
import {
  bootstrapState,
  cloneValue,
  hasPersistedState,
  listResumeDraftValues,
  readState,
  replaceCollection,
  replaceIndexedCollection,
  saveSingletonValue,
  upsertCollectionValue,
  upsertIndexedCollectionValue,
  writeState,
} from "./internal/state";
import type {
  FileJobFinderRepositoryOptions,
  JobFinderRepository,
} from "./repository-types";

function runImmediateTransaction<TValue>(
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

function syncApprovedResumeExportsForJob(
  database: DatabaseSync,
  jobId: string,
  approvedExportId: string | null = null,
): void {
  const currentArtifacts = listResumeDraftValues(
    database,
    "resume_export_artifacts",
    ResumeExportArtifactSchema,
    {
      whereSql: "job_id = ?",
      params: [jobId],
      orderBySql: "exported_at DESC, id ASC",
    },
  );

  for (const artifact of currentArtifacts) {
    const shouldBeApproved = approvedExportId !== null && artifact.id === approvedExportId;

    if (artifact.isApproved === shouldBeApproved) {
      continue;
    }

    upsertIndexedCollectionValue(database, "resume_export_artifacts", {
      ...artifact,
      isApproved: shouldBeApproved,
    } as { id: string }, {
      columnNames: ["job_id", "draft_id", "exported_at", "is_approved"],
      getColumns: (candidate) => {
        const normalizedArtifact = ResumeExportArtifactSchema.parse(
          cloneValue(candidate),
        );
        return [
          normalizedArtifact.jobId,
          normalizedArtifact.draftId,
          normalizedArtifact.exportedAt,
          normalizedArtifact.isApproved ? 1 : 0,
        ];
      },
    });
  }
}

export async function createFileJobFinderRepository(
  options: FileJobFinderRepositoryOptions,
): Promise<JobFinderRepository> {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(
    cloneValue(options.seed),
  );
  const database = new DatabaseSync(options.filePath);

  runMigrations(database);

  if (!hasPersistedState(database)) {
    const legacySeed = await readLegacySeed(options.filePath, normalizedSeed);
    bootstrapState(database, legacySeed ?? normalizedSeed);
    await secureDatabaseFile(options.filePath);
  }

  function persist(
    mutator: (state: JobFinderRepositoryState) => void,
  ): Promise<void> {
    runImmediateTransaction(database, () => {
      const state = readState(database, normalizedSeed);
      mutator(state);
      saveSingletonValue(database, "profile", state.profile);
      saveSingletonValue(database, "search_preferences", state.searchPreferences);
      saveSingletonValue(database, "settings", state.settings);
      saveSingletonValue(database, "discovery_state", state.discovery);
      replaceCollection(database, "saved_jobs", state.savedJobs);
      replaceCollection(database, "tailored_assets", state.tailoredAssets);
      replaceIndexedCollection(database, "resume_drafts", state.resumeDrafts, {
        columnNames: ["job_id", "created_at", "updated_at"],
        getColumns: (value) => {
          const draft = ResumeDraftSchema.parse(cloneValue(value));
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
            const revision = ResumeDraftRevisionSchema.parse(cloneValue(value));
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
            const artifact = ResumeExportArtifactSchema.parse(cloneValue(value));
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
        "resume_research_artifacts",
        state.resumeResearchArtifacts,
        {
          columnNames: ["job_id", "fetched_at"],
          getColumns: (value) => {
            const artifact = ResumeResearchArtifactSchema.parse(cloneValue(value));
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
            const validation = ResumeValidationResultSchema.parse(
              cloneValue(value),
            );
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
            const message = ResumeAssistantMessageSchema.parse(cloneValue(value));
            return [message.jobId, message.createdAt];
          },
        },
      );
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
    });

    return secureDatabaseFile(options.filePath);
  }

  function upsertPersistedValue(
    tableName:
      | "tailored_assets"
      | "resume_drafts"
      | "resume_draft_revisions"
      | "resume_export_artifacts"
      | "resume_research_artifacts"
      | "resume_validation_results"
      | "resume_assistant_messages"
      | "application_records"
      | "application_attempts"
      | "source_debug_runs"
      | "source_debug_attempts"
      | "source_instruction_artifacts"
      | "source_debug_evidence_refs",
    value: { id: string },
  ): Promise<void> {
    runImmediateTransaction(database, () => {
      writePersistedValue(tableName, value);
    });

    return secureDatabaseFile(options.filePath);
  }

  function writePersistedValue(
    tableName:
      | "tailored_assets"
      | "resume_drafts"
      | "resume_draft_revisions"
      | "resume_export_artifacts"
      | "resume_research_artifacts"
      | "resume_validation_results"
      | "resume_assistant_messages"
      | "application_records"
      | "application_attempts"
      | "source_debug_runs"
      | "source_debug_attempts"
      | "source_instruction_artifacts"
      | "source_debug_evidence_refs",
    value: { id: string },
  ): void {
      if (tableName === "resume_drafts") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["job_id", "created_at", "updated_at"],
          getColumns: (candidate) => {
            const draft = ResumeDraftSchema.parse(cloneValue(candidate));
            return [draft.jobId, draft.createdAt, draft.updatedAt];
          },
        });
        return;
      }

      if (tableName === "resume_draft_revisions") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["draft_id", "created_at"],
          getColumns: (candidate) => {
            const revision = ResumeDraftRevisionSchema.parse(
              cloneValue(candidate),
            );
            return [revision.draftId, revision.createdAt];
          },
        });
        return;
      }

      if (tableName === "resume_export_artifacts") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["job_id", "draft_id", "exported_at", "is_approved"],
          getColumns: (candidate) => {
            const artifact = ResumeExportArtifactSchema.parse(
              cloneValue(candidate),
            );
            return [
              artifact.jobId,
              artifact.draftId,
              artifact.exportedAt,
              artifact.isApproved ? 1 : 0,
            ];
          },
        });
        return;
      }

      if (tableName === "resume_research_artifacts") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["job_id", "fetched_at"],
          getColumns: (candidate) => {
            const artifact = ResumeResearchArtifactSchema.parse(
              cloneValue(candidate),
            );
            return [artifact.jobId, artifact.fetchedAt];
          },
        });
        return;
      }

      if (tableName === "resume_validation_results") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["draft_id", "validated_at"],
          getColumns: (candidate) => {
            const validation = ResumeValidationResultSchema.parse(
              cloneValue(candidate),
            );
            return [validation.draftId, validation.validatedAt];
          },
        });
        return;
      }

      if (tableName === "resume_assistant_messages") {
        upsertIndexedCollectionValue(database, tableName, value, {
          columnNames: ["job_id", "created_at"],
          getColumns: (candidate) => {
            const message = ResumeAssistantMessageSchema.parse(
              cloneValue(candidate),
            );
            return [message.jobId, message.createdAt];
          },
        });
        return;
      }

      upsertCollectionValue(database, tableName, value);
  }

  return {
    close() {
      database.close();
      return Promise.resolve();
    },
    reset(nextSeed) {
      const nextState = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed));
      writeState(database, nextState);
      return secureDatabaseFile(options.filePath);
    },
    getProfile() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).profile));
    },
    saveProfile(profile) {
      return persist((state) => {
        state.profile = CandidateProfileSchema.parse(cloneValue(profile));
      });
    },
    getSearchPreferences() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).searchPreferences),
      );
    },
    saveSearchPreferences(searchPreferences) {
      return persist((state) => {
        state.searchPreferences = JobSearchPreferencesSchema.parse(
          cloneValue(searchPreferences),
        );
      });
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      const normalizedProfile = CandidateProfileSchema.parse(cloneValue(profile));
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );

      return persist((state) => {
        state.profile = normalizedProfile;
        state.searchPreferences = normalizedSearchPreferences;
      });
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).savedJobs));
    },
    replaceSavedJobs(savedJobs) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]));
      return persist((state) => {
        state.savedJobs = normalizedJobs;
      });
    },
    replaceSavedJobsAndClearResumeApproval({
      savedJobs,
      draft,
      staleReason,
      tailoredAsset,
    }) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]));
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          staleReason,
          approvedAt: null,
          approvedExportId: null,
        }),
      );
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      runImmediateTransaction(database, () => {
        replaceCollection(database, "saved_jobs", normalizedJobs);
        syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null);

        writePersistedValue("resume_drafts", normalizedDraft);
        if (normalizedAsset) {
          writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    listTailoredAssets() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).tailoredAssets),
      );
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
      return upsertPersistedValue("tailored_assets", normalizedAsset);
    },
    listResumeDrafts() {
      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(database, "resume_drafts", ResumeDraftSchema, {
            orderBySql: "updated_at DESC, id ASC",
          }),
        ),
      );
    },
    getResumeDraftByJobId(jobId) {
      const draft = listResumeDraftValues(
        database,
        "resume_drafts",
        ResumeDraftSchema,
        {
          whereSql: "job_id = ?",
          params: [jobId],
          orderBySql: "updated_at DESC, id ASC",
        },
      )[0];
      return Promise.resolve(draft ? cloneValue(draft) : null);
    },
    upsertResumeDraft(draft) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      return upsertPersistedValue("resume_drafts", normalizedDraft);
    },
    listResumeDraftRevisions(draftId) {
      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(
            database,
            "resume_draft_revisions",
            ResumeDraftRevisionSchema,
            draftId
              ? {
                  whereSql: "draft_id = ?",
                  params: [draftId],
                  orderBySql: "created_at DESC, id ASC",
                }
              : { orderBySql: "created_at DESC, id ASC" },
          ),
        ),
      );
    },
    upsertResumeDraftRevision(revision) {
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      return upsertPersistedValue("resume_draft_revisions", normalizedRevision);
    },
    listResumeExportArtifacts(options) {
      const whereParts: string[] = [];
      const params: Array<string> = [];

      if (options?.jobId) {
        whereParts.push("job_id = ?");
        params.push(options.jobId);
      }

      if (options?.draftId) {
        whereParts.push("draft_id = ?");
        params.push(options.draftId);
      }

      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(
            database,
            "resume_export_artifacts",
            ResumeExportArtifactSchema,
            {
              ...(whereParts.length > 0
                ? { whereSql: whereParts.join(" AND "), params }
                : {}),
              orderBySql: "exported_at DESC, id ASC",
            },
          ),
        ),
      );
    },
    upsertResumeExportArtifact(artifact) {
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue(artifact),
      );
      return upsertPersistedValue("resume_export_artifacts", normalizedArtifact);
    },
    listResumeResearchArtifacts(jobId) {
      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(
            database,
            "resume_research_artifacts",
            ResumeResearchArtifactSchema,
            jobId
              ? {
                  whereSql: "job_id = ?",
                  params: [jobId],
                  orderBySql: "fetched_at DESC, id ASC",
                }
              : { orderBySql: "fetched_at DESC, id ASC" },
          ),
        ),
      );
    },
    upsertResumeResearchArtifact(artifact) {
      const normalizedArtifact = ResumeResearchArtifactSchema.parse(
        cloneValue(artifact),
      );
      return upsertPersistedValue("resume_research_artifacts", normalizedArtifact);
    },
    listResumeValidationResults(draftId) {
      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(
            database,
            "resume_validation_results",
            ResumeValidationResultSchema,
            draftId
              ? {
                  whereSql: "draft_id = ?",
                  params: [draftId],
                  orderBySql: "validated_at DESC, id ASC",
                }
              : { orderBySql: "validated_at DESC, id ASC" },
          ),
        ),
      );
    },
    upsertResumeValidationResult(validationResult) {
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validationResult),
      );
      return upsertPersistedValue("resume_validation_results", normalizedValidation);
    },
    listResumeAssistantMessages(jobId) {
      return Promise.resolve(
        cloneValue(
          listResumeDraftValues(
            database,
            "resume_assistant_messages",
            ResumeAssistantMessageSchema,
            jobId
              ? {
                  whereSql: "job_id = ?",
                  params: [jobId],
                  orderBySql: "created_at ASC, id ASC",
                }
              : { orderBySql: "created_at ASC, id ASC" },
          ),
        ),
      );
    },
    upsertResumeAssistantMessage(message) {
      const normalizedMessage = ResumeAssistantMessageSchema.parse(
        cloneValue(message),
      );
      return upsertPersistedValue("resume_assistant_messages", normalizedMessage);
    },
    saveResumeDraftWithValidation({ draft, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      runImmediateTransaction(database, () => {
        if (!normalizedDraft.approvedExportId) {
          syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null);
        }

        writePersistedValue("resume_drafts", normalizedDraft);
        writePersistedValue("resume_validation_results", normalizedValidation);
        if (normalizedAsset) {
          writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    applyResumePatchWithRevision({ draft, revision, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      runImmediateTransaction(database, () => {
        if (!normalizedDraft.approvedExportId) {
          syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null);
        }

        writePersistedValue("resume_drafts", normalizedDraft);
        writePersistedValue("resume_draft_revisions", normalizedRevision);
        writePersistedValue("resume_validation_results", normalizedValidation);
        if (normalizedAsset) {
          writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    approveResumeExport({ draft, exportArtifact, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          approvedExportId: exportArtifact.id,
        }),
      );
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue({ ...exportArtifact, isApproved: true }),
      );
      const normalizedValidation = validation
        ? ResumeValidationResultSchema.parse(cloneValue(validation))
        : null;
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      if (normalizedDraft.id !== normalizedArtifact.draftId) {
        throw new Error("Approved export does not belong to the provided resume draft.");
      }

      if (normalizedDraft.jobId !== normalizedArtifact.jobId) {
        throw new Error("Approved export job does not match the provided resume draft.");
      }

      runImmediateTransaction(database, () => {
        syncApprovedResumeExportsForJob(
          database,
          normalizedArtifact.jobId,
          normalizedArtifact.id,
        );
        writePersistedValue("resume_drafts", normalizedDraft);
        writePersistedValue("resume_export_artifacts", normalizedArtifact);
        if (normalizedValidation) {
          writePersistedValue("resume_validation_results", normalizedValidation);
        }
        if (normalizedAsset) {
          writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    clearResumeApproval({ draft, staleReason, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          staleReason,
          approvedAt: null,
          approvedExportId: null,
        }),
      );
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      runImmediateTransaction(database, () => {
        syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null);

        writePersistedValue("resume_drafts", normalizedDraft);
        if (normalizedAsset) {
          writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    listApplicationRecords() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).applicationRecords),
      );
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(
        cloneValue(applicationRecord),
      );
      return upsertPersistedValue("application_records", normalizedRecord);
    },
    listApplicationAttempts() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).applicationAttempts),
      );
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      return upsertPersistedValue("application_attempts", normalizedAttempt);
    },
    listSourceDebugRuns() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).sourceDebugRuns),
      );
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run));
      return upsertPersistedValue("source_debug_runs", normalizedRun);
    },
    listSourceDebugAttempts() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).sourceDebugAttempts),
      );
    },
    upsertSourceDebugAttempt(attempt) {
      const normalizedAttempt = SourceDebugWorkerAttemptSchema.parse(
        cloneValue(attempt),
      );
      return upsertPersistedValue("source_debug_attempts", normalizedAttempt);
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).sourceInstructionArtifacts),
      );
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(
        cloneValue(artifact),
      );
      return upsertPersistedValue(
        "source_instruction_artifacts",
        normalizedArtifact,
      );
    },
    deleteSourceInstructionArtifactsForTarget(targetId) {
      runImmediateTransaction(database, () => {
        database
          .prepare(
            "DELETE FROM source_instruction_artifacts WHERE json_extract(value, '$.targetId') = ?",
          )
          .run(targetId);
      });

      return secureDatabaseFile(options.filePath);
    },
    listSourceDebugEvidenceRefs() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).sourceDebugEvidenceRefs),
      );
    },
    upsertSourceDebugEvidenceRef(evidenceRef) {
      const normalizedEvidenceRef = SourceDebugEvidenceRefSchema.parse(
        cloneValue(evidenceRef),
      );
      return upsertPersistedValue(
        "source_debug_evidence_refs",
        normalizedEvidenceRef,
      );
    },
    getSettings() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).settings));
    },
    saveSettings(settings) {
      return persist((state) => {
        state.settings = JobFinderSettingsSchema.parse(cloneValue(settings));
      });
    },
    getDiscoveryState() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).discovery),
      );
    },
    saveDiscoveryState(discoveryState) {
      return persist((state) => {
        state.discovery = JobFinderDiscoveryStateSchema.parse(
          cloneValue(discoveryState),
        );
      });
    },
  };
}
