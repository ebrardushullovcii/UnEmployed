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
  JobFinderActivityControlSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderIntelligenceStateSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchCampaignCollectionSchema,
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
} from "@unemployed/contracts";
import { DatabaseSync } from "node:sqlite";

import { createFileRepositoryResumeMethods } from "./file-repository-resume-methods";
import { createFileRepositoryUserActionMethods } from "./file-repository-user-action-methods";
import { createFileRepositoryGroupedManualAnswerMethods } from "./file-repository-grouped-manual-answer-methods";
import {
  APPLY_COLLECTION_ORDER_BY_SQL,
  APPLY_INDEXED_COLLECTION_CONFIGS,
  buildOptionalSqlFilters,
} from "./apply-collection-support";
import {
  createFileRepositoryContext,
  runImmediateTransaction,
  syncApprovedResumeExportsForJob,
} from "./file-repository-support";
import {
  areSameApplicationAnswerRecords,
  areSameApplicationQuestionRecords,
  latestApplicationAnswerRecord,
} from "./grouped-manual-answer-support";
import {
  repairLegacyCommaSplitAchievements,
  secureDatabaseFile,
  runMigrations,
} from "./internal/migrations";
import {
  normalizeLegacyDiscoveryState,
  normalizeLegacySourceDebugRunRecord,
  readLegacySeed,
} from "./internal/legacy";
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
} from "./internal/state";
import type {
  ApplicationRecordBatchCommitResult,
  FileJobFinderRepositoryOptions,
  JobFinderRepository,
} from "./repository-types";

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
    const bootstrapSeed = legacySeed
      ? JobFinderRepositoryStateSchema.parse({
          ...legacySeed,
          profile: {
            ...legacySeed.profile,
            experiences: legacySeed.profile.experiences.map((experience) => ({
              ...experience,
              achievements: repairLegacyCommaSplitAchievements(
                experience.achievements,
              ),
            })),
          },
          profileRevisions: legacySeed.profileRevisions.map((revision) => ({
            ...revision,
            snapshotProfile: {
              ...revision.snapshotProfile,
              experiences: revision.snapshotProfile.experiences.map(
                (experience) => ({
                  ...experience,
                  achievements: repairLegacyCommaSplitAchievements(
                    experience.achievements,
                  ),
                }),
              ),
            },
          })),
        })
      : normalizedSeed;
    bootstrapState(database, bootstrapSeed);
    await secureDatabaseFile(options.filePath);
  }

  const context = createFileRepositoryContext({
    database,
    filePath: options.filePath,
  });

  function listApplyCollection<TValue>(input: {
    tableName:
      | "apply_runs"
      | "apply_job_results"
      | "apply_submit_approvals"
      | "application_question_records"
      | "application_answer_records"
      | "application_artifact_refs"
      | "application_replay_checkpoints"
      | "application_consent_requests";
    schema: { parse: (value: unknown) => TValue };
    orderBySql: string;
    filters?: ReadonlyArray<
      readonly [columnName: string, value: string | undefined]
    >;
  }): TValue[] {
    return listCollectionValues(database, input.tableName, input.schema, {
      ...buildOptionalSqlFilters(input.filters ?? []),
      orderBySql: input.orderBySql,
    });
  }

  return {
    ...createFileRepositoryResumeMethods(context),
    ...createFileRepositoryUserActionMethods(context),
    ...createFileRepositoryGroupedManualAnswerMethods(context),
    close() {
      database.close();
      return Promise.resolve();
    },
    reset(nextSeed) {
      const nextState = JobFinderRepositoryStateSchema.parse(
        cloneValue(nextSeed),
      );
      writeState(database, nextState);
      return secureDatabaseFile(options.filePath);
    },
    getProfile() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, "profile", CandidateProfileSchema) ??
            normalizedSeed.profile,
        ),
      );
    },
    saveProfile(profile) {
      const normalizedProfile = CandidateProfileSchema.parse(
        cloneValue(profile),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "profile", normalizedProfile);
      });
      return secureDatabaseFile(options.filePath);
    },
    getSearchPreferences() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(
            database,
            "search_preferences",
            JobSearchPreferencesSchema,
          ) ?? normalizedSeed.searchPreferences,
        ),
      );
    },
    getProfileSetupState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(
            database,
            "profile_setup_state",
            ProfileSetupStateSchema,
          ) ?? normalizedSeed.profileSetupState,
        ),
      );
    },
    saveSearchPreferences(searchPreferences) {
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(
          database,
          "search_preferences",
          normalizedSearchPreferences,
        );
      });
      return secureDatabaseFile(options.filePath);
    },
    saveProfileSetupState(profileSetupState) {
      const normalizedProfileSetupState = ProfileSetupStateSchema.parse(
        cloneValue(profileSetupState),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(
          database,
          "profile_setup_state",
          normalizedProfileSetupState,
        );
      });
      return secureDatabaseFile(options.filePath);
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      const normalizedProfile = CandidateProfileSchema.parse(
        cloneValue(profile),
      );
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );

      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "profile", normalizedProfile);
        saveSingletonValue(
          database,
          "search_preferences",
          normalizedSearchPreferences,
        );
      });
      return secureDatabaseFile(options.filePath);
    },
    commitProfileCopilotState({
      profile,
      searchPreferences,
      profileSetupState,
      messages,
      revisions,
    }) {
      const normalizedProfile = CandidateProfileSchema.parse(
        cloneValue(profile),
      );
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      const normalizedProfileSetupState = ProfileSetupStateSchema.parse(
        cloneValue(profileSetupState),
      );
      const normalizedMessages = ProfileCopilotMessageSchema.array().parse(
        cloneValue(messages ?? []),
      );
      const normalizedRevisions = ProfileRevisionSchema.array().parse(
        cloneValue(revisions ?? []),
      );

      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "profile", normalizedProfile);
        saveSingletonValue(
          database,
          "search_preferences",
          normalizedSearchPreferences,
        );
        saveSingletonValue(
          database,
          "profile_setup_state",
          normalizedProfileSetupState,
        );

        for (const message of normalizedMessages) {
          context.writePersistedValue("profile_copilot_messages", message);
        }

        for (const revision of normalizedRevisions) {
          context.writePersistedValue("profile_revisions", revision);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    listSavedJobs(options?: { limit?: number; offset?: number }) {
      return Promise.resolve(
        cloneValue(listValues(database, "saved_jobs", SavedJobSchema, options)),
      );
    },
    commitSavedJobDelta({
      upserts = [],
      update,
      clearResumeApproval,
      discoveryState,
    }) {
      const normalizedUpserts = SavedJobSchema.array().parse(
        cloneValue([...upserts]),
      );
      const normalizedDiscoveryState = discoveryState
        ? JobFinderDiscoveryStateSchema.parse(cloneValue(discoveryState))
        : null;

      runImmediateTransaction(database, () => {
        const existingJobIds = new Set<string>();
        let previousJobForResumeApproval: ReturnType<
          typeof SavedJobSchema.parse
        > | null = null;
        let nextJobForResumeApproval: ReturnType<
          typeof SavedJobSchema.parse
        > | null = null;

        if (update) {
          const currentJobs = listValues(
            database,
            "saved_jobs",
            SavedJobSchema,
          );
          for (const currentJob of currentJobs) {
            existingJobIds.add(currentJob.id);
            const nextJob = SavedJobSchema.parse(
              cloneValue(update(cloneValue(currentJob))),
            );
            if (nextJob.id !== currentJob.id) {
              throw new Error(
                "Saved job delta updates must preserve each job id.",
              );
            }
            if (currentJob.id === clearResumeApproval?.jobId) {
              previousJobForResumeApproval = currentJob;
              nextJobForResumeApproval = nextJob;
            }
            if (JSON.stringify(nextJob) !== JSON.stringify(currentJob)) {
              context.writePersistedValue("saved_jobs", nextJob);
            }
          }
        }

        for (const job of normalizedUpserts) {
          if (update && existingJobIds.has(job.id)) {
            continue;
          }
          context.writePersistedValue("saved_jobs", job);
        }

        if (
          clearResumeApproval &&
          previousJobForResumeApproval &&
          nextJobForResumeApproval &&
          clearResumeApproval.shouldClear(
            previousJobForResumeApproval,
            nextJobForResumeApproval,
          )
        ) {
          const draft = listCollectionValues(
            database,
            "resume_drafts",
            ResumeDraftSchema,
            {
              whereSql: "job_id = ?",
              params: [clearResumeApproval.jobId],
              orderBySql: "updated_at DESC, id ASC",
            },
          )[0];
          if (
            draft &&
            (draft.approvedAt ||
              draft.approvedExportId ||
              draft.status === "approved")
          ) {
            const staleDraft = ResumeDraftSchema.parse(
              cloneValue({
                ...draft,
                status: "stale",
                staleReason: clearResumeApproval.staleReason,
                approvedAt: null,
                approvedExportId: null,
                updatedAt: new Date().toISOString(),
              }),
            );
            const existingAsset = listCollectionValues(
              database,
              "tailored_assets",
              TailoredAssetSchema,
              {
                whereSql: "job_id = ?",
                params: [draft.jobId],
                orderBySql: "updated_at DESC, id ASC",
              },
            )[0];

            syncApprovedResumeExportsForJob(database, draft.jobId, null);
            context.writePersistedValue("resume_drafts", staleDraft);
            if (existingAsset) {
              const staleAsset = TailoredAssetSchema.parse(
                cloneValue({
                  ...existingAsset,
                  storagePath: null,
                  updatedAt: staleDraft.updatedAt,
                }),
              );
              context.writePersistedValue("tailored_assets", staleAsset);
            }
          }
        }

        if (normalizedDiscoveryState) {
          saveSingletonValue(
            database,
            "discovery_state",
            normalizedDiscoveryState,
          );
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    replaceSavedJobs(savedJobs) {
      const normalizedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
      runImmediateTransaction(database, () => {
        replaceCollection(database, "saved_jobs", normalizedJobs);
      });

      return secureDatabaseFile(options.filePath);
    },
    replaceSavedJobsAndDiscoveryState({ savedJobs, discoveryState }) {
      const normalizedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
      const normalizedDiscoveryState = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      );

      runImmediateTransaction(database, () => {
        replaceCollection(database, "saved_jobs", normalizedJobs);
        saveSingletonValue(
          database,
          "discovery_state",
          normalizedDiscoveryState,
        );
      });

      return secureDatabaseFile(options.filePath);
    },
    replaceSavedJobsAndClearResumeApproval({
      savedJobs,
      draft,
      staleReason,
      tailoredAsset,
    }) {
      const normalizedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
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

      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error(
          "Tailored asset job does not match the provided draft.",
        );
      }

      runImmediateTransaction(database, () => {
        replaceCollection(database, "saved_jobs", normalizedJobs);
        syncApprovedResumeExportsForJob(database, normalizedDraft.jobId, null);
        context.writePersistedValue("resume_drafts", normalizedDraft);

        if (normalizedAsset) {
          context.writePersistedValue("tailored_assets", normalizedAsset);
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    listApplyRuns(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "apply_runs",
            schema: ApplyRunSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_runs,
            filters: options?.id ? [["id", options.id]] : [],
          }),
        ),
      );
    },
    upsertApplyRun(run) {
      const normalizedRun = ApplyRunSchema.parse(cloneValue(run));
      return context.upsertPersistedValue("apply_runs", normalizedRun);
    },
    listApplyJobResults(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "apply_job_results",
            schema: ApplyJobResultSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_job_results,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
            ],
          }),
        ),
      );
    },
    upsertApplyJobResult(result) {
      const normalizedResult = ApplyJobResultSchema.parse(cloneValue(result));
      return context.upsertPersistedValue(
        "apply_job_results",
        normalizedResult,
      );
    },
    compareAndSwapApplyJobResult(input) {
      const expected = ApplyJobResultSchema.parse(cloneValue(input.expected));
      const nextResult = ApplyJobResultSchema.parse(cloneValue(input.result));
      if (nextResult.id !== expected.id) {
        throw new Error("Apply result CAS cannot change the result identity.");
      }
      const columns =
        APPLY_INDEXED_COLLECTION_CONFIGS.apply_job_results.getColumns(
          nextResult,
        );
      const update = database
        .prepare(
          `UPDATE apply_job_results
           SET run_id = ?, job_id = ?, queue_position = ?, updated_at = ?, state = ?, value = ?
           WHERE id = ? AND value = ?`,
        )
        .run(
          ...columns,
          JSON.stringify(nextResult),
          expected.id,
          JSON.stringify(expected),
        );
      return Promise.resolve(update.changes === 1);
    },
    listApplySubmitApprovals(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "apply_submit_approvals",
            schema: ApplySubmitApprovalSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.apply_submit_approvals,
            filters: [
              ...(options?.id ? [["id", options.id] as const] : []),
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
            ],
          }),
        ),
      );
    },
    upsertApplySubmitApproval(approval) {
      const normalizedApproval = ApplySubmitApprovalSchema.parse(
        cloneValue(approval),
      );
      return context.upsertPersistedValue(
        "apply_submit_approvals",
        normalizedApproval,
      );
    },
    listApplicationQuestionRecords(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "application_question_records",
            schema: ApplicationQuestionRecordSchema,
            orderBySql:
              APPLY_COLLECTION_ORDER_BY_SQL.application_question_records,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
              ...(options?.resultId
                ? [["result_id", options.resultId] as const]
                : []),
            ],
          }),
        ),
      );
    },
    upsertApplicationQuestionRecord(record) {
      const normalizedRecord = ApplicationQuestionRecordSchema.parse(
        cloneValue(record),
      );
      return context.upsertPersistedValue(
        "application_question_records",
        normalizedRecord,
      );
    },
    listApplicationAnswerRecords(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "application_answer_records",
            schema: ApplicationAnswerRecordSchema,
            orderBySql:
              APPLY_COLLECTION_ORDER_BY_SQL.application_answer_records,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
              ...(options?.resultId
                ? [["result_id", options.resultId] as const]
                : []),
              ...(options?.questionId
                ? [["question_id", options.questionId] as const]
                : []),
            ],
          }),
        ),
      );
    },
    upsertApplicationAnswerRecord(record) {
      const normalizedRecord = ApplicationAnswerRecordSchema.parse(
        cloneValue(record),
      );
      return context.upsertPersistedValue(
        "application_answer_records",
        normalizedRecord,
      );
    },
    commitApplicationAnswerMutation(input) {
      const expectedAnswer = input.expectedAnswer
        ? ApplicationAnswerRecordSchema.parse(cloneValue(input.expectedAnswer))
        : null;
      const expectedQuestion = ApplicationQuestionRecordSchema.parse(
        cloneValue(input.expectedQuestion),
      );
      const nextAnswer = ApplicationAnswerRecordSchema.parse(
        cloneValue(input.answer),
      );
      const nextQuestion = ApplicationQuestionRecordSchema.parse(
        cloneValue(input.question),
      );

      if (
        expectedQuestion.id !== nextQuestion.id ||
        expectedQuestion.id !== nextAnswer.questionId
      ) {
        throw new Error(
          "Application answer mutation records must target the same question.",
        );
      }
      if (nextAnswer.revision !== (expectedAnswer?.revision ?? 0) + 1) {
        throw new Error(
          "Application answer mutation must advance the answer revision by one.",
        );
      }

      let result: "applied" | "duplicate" | "stale" | null = null;
      runImmediateTransaction(database, () => {
        const currentAnswers = listApplyCollection({
          tableName: "application_answer_records",
          schema: ApplicationAnswerRecordSchema,
          orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_answer_records,
          filters: [["question_id", expectedQuestion.id]],
        });
        if (currentAnswers.some((answer) => answer.id === nextAnswer.id)) {
          result = "duplicate";
          return;
        }

        const currentQuestion =
          listCollectionValues(
            database,
            "application_question_records",
            ApplicationQuestionRecordSchema,
            {
              whereSql: "id = ?",
              params: [expectedQuestion.id],
              orderBySql:
                APPLY_COLLECTION_ORDER_BY_SQL.application_question_records,
            },
          )[0] ?? null;
        const currentAnswer = latestApplicationAnswerRecord(
          currentAnswers,
          expectedQuestion.id,
        );
        if (
          currentQuestion === null ||
          !areSameApplicationQuestionRecords(
            currentQuestion,
            expectedQuestion,
          ) ||
          (expectedAnswer === null
            ? currentAnswer !== null
            : currentAnswer === null ||
              !areSameApplicationAnswerRecords(currentAnswer, expectedAnswer))
        ) {
          result = "stale";
          return;
        }

        context.writePersistedValue("application_answer_records", nextAnswer);
        context.writePersistedValue(
          "application_question_records",
          nextQuestion,
        );
        result = "applied";
      });

      if (result === null) {
        throw new Error(
          "Application answer mutation did not produce a result.",
        );
      }
      const mutationResult = result;
      return secureDatabaseFile(options.filePath).then(() => mutationResult);
    },
    listApplicationArtifactRefs(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "application_artifact_refs",
            schema: ApplicationArtifactRefSchema,
            orderBySql: APPLY_COLLECTION_ORDER_BY_SQL.application_artifact_refs,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
              ...(options?.resultId
                ? [["result_id", options.resultId] as const]
                : []),
            ],
          }),
        ),
      );
    },
    upsertApplicationArtifactRef(ref) {
      const normalizedRef = ApplicationArtifactRefSchema.parse(cloneValue(ref));
      return context.upsertPersistedValue(
        "application_artifact_refs",
        normalizedRef,
      );
    },
    listApplicationReplayCheckpoints(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "application_replay_checkpoints",
            schema: ApplicationReplayCheckpointSchema,
            orderBySql:
              APPLY_COLLECTION_ORDER_BY_SQL.application_replay_checkpoints,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
              ...(options?.resultId
                ? [["result_id", options.resultId] as const]
                : []),
            ],
          }),
        ),
      );
    },
    upsertApplicationReplayCheckpoint(checkpoint) {
      const normalizedCheckpoint = ApplicationReplayCheckpointSchema.parse(
        cloneValue(checkpoint),
      );
      return context.upsertPersistedValue(
        "application_replay_checkpoints",
        normalizedCheckpoint,
      );
    },
    listApplicationConsentRequests(options) {
      return Promise.resolve(
        cloneValue(
          listApplyCollection({
            tableName: "application_consent_requests",
            schema: ApplicationConsentRequestSchema,
            orderBySql:
              APPLY_COLLECTION_ORDER_BY_SQL.application_consent_requests,
            filters: [
              ...(options?.runId ? [["run_id", options.runId] as const] : []),
              ...(options?.jobId ? [["job_id", options.jobId] as const] : []),
              ...(options?.resultId
                ? [["result_id", options.resultId] as const]
                : []),
            ],
          }),
        ),
      );
    },
    upsertApplicationConsentRequest(request) {
      const normalizedRequest = ApplicationConsentRequestSchema.parse(
        cloneValue(request),
      );
      return context.upsertPersistedValue(
        "application_consent_requests",
        normalizedRequest,
      );
    },
    listApplicationRecords() {
      return Promise.resolve(
        cloneValue(
          listValues(database, "application_records", ApplicationRecordSchema),
        ),
      );
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(
        cloneValue(applicationRecord),
      );
      return context.upsertPersistedValue(
        "application_records",
        normalizedRecord,
      );
    },
    commitApplicationRecordBatch({ expectedRevisions, records }) {
      const normalizedRecords = ApplicationRecordSchema.array().parse(
        cloneValue([...records]),
      );
      const expectedIds = expectedRevisions.map(
        ({ applicationRecordId }) => applicationRecordId,
      );
      const expectedIdSet = new Set(expectedIds);
      const nextIdSet = new Set(normalizedRecords.map((record) => record.id));
      if (
        expectedIdSet.size !== expectedIds.length ||
        nextIdSet.size !== normalizedRecords.length ||
        expectedIdSet.size !== nextIdSet.size ||
        expectedIds.some((id) => !nextIdSet.has(id))
      ) {
        throw new Error(
          "Application record batch must contain one next record for every expected record.",
        );
      }

      const result =
        runImmediateTransaction<ApplicationRecordBatchCommitResult>(
          database,
          () => {
            const currentRecords = listValues(
              database,
              "application_records",
              ApplicationRecordSchema,
            );
            const currentById = new Map(
              currentRecords.map((record) => [record.id, record]),
            );
            const missingRecordIds = expectedIds.filter(
              (id) => !currentById.has(id),
            );
            if (missingRecordIds.length > 0) {
              return { status: "missing", recordIds: missingRecordIds };
            }

            const staleRecordIds = expectedRevisions
              .filter(
                ({ applicationRecordId, expectedRevision }) =>
                  (currentById.get(applicationRecordId)?.crm?.revision ?? 0) !==
                  expectedRevision,
              )
              .map(({ applicationRecordId }) => applicationRecordId);
            if (staleRecordIds.length > 0) {
              return { status: "stale", recordIds: staleRecordIds };
            }

            const nextById = new Map(
              normalizedRecords.map((record) => [record.id, record]),
            );
            replaceCollection(
              database,
              "application_records",
              currentRecords.map((record) => nextById.get(record.id) ?? record),
            );
            return { status: "applied", committedRecordIds: expectedIds };
          },
        );

      return result.status === "applied"
        ? secureDatabaseFile(options.filePath).then(() => result)
        : Promise.resolve(result);
    },
    listApplicationAttempts() {
      return Promise.resolve(
        cloneValue(
          listValues(
            database,
            "application_attempts",
            ApplicationAttemptSchema,
          ),
        ),
      );
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      return context.upsertPersistedValue(
        "application_attempts",
        normalizedAttempt,
      );
    },
    claimApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      const insert = database
        .prepare(
          "INSERT OR IGNORE INTO application_attempts (id, value) VALUES (?, ?)",
        )
        .run(normalizedAttempt.id, JSON.stringify(normalizedAttempt));
      return Promise.resolve(insert.changes === 1);
    },
    listSourceDebugRuns() {
      return Promise.resolve(
        cloneValue(
          listValues(database, "source_debug_runs", {
            parse: normalizeLegacySourceDebugRunRecord,
          }),
        ),
      );
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run));
      return context.upsertPersistedValue("source_debug_runs", normalizedRun);
    },
    listSourceDebugAttempts() {
      return Promise.resolve(
        cloneValue(
          listValues(
            database,
            "source_debug_attempts",
            SourceDebugWorkerAttemptSchema,
          ),
        ),
      );
    },
    upsertSourceDebugAttempt(attempt) {
      const normalizedAttempt = SourceDebugWorkerAttemptSchema.parse(
        cloneValue(attempt),
      );
      return context.upsertPersistedValue(
        "source_debug_attempts",
        normalizedAttempt,
      );
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(
        cloneValue(
          listValues(
            database,
            "source_instruction_artifacts",
            SourceInstructionArtifactSchema,
          ),
        ),
      );
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(
        cloneValue(artifact),
      );
      return context.upsertPersistedValue(
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
        cloneValue(
          listValues(
            database,
            "source_debug_evidence_refs",
            SourceDebugEvidenceRefSchema,
          ),
        ),
      );
    },
    upsertSourceDebugEvidenceRef(evidenceRef) {
      const normalizedEvidenceRef = SourceDebugEvidenceRefSchema.parse(
        cloneValue(evidenceRef),
      );
      return context.upsertPersistedValue(
        "source_debug_evidence_refs",
        normalizedEvidenceRef,
      );
    },
    upsertSourceDebugEvidenceRefs(evidenceRefs) {
      const normalizedEvidenceRefs = SourceDebugEvidenceRefSchema.array().parse(
        cloneValue([...evidenceRefs]),
      );

      runImmediateTransaction(database, () => {
        for (const normalizedEvidenceRef of normalizedEvidenceRefs) {
          context.writePersistedValue(
            "source_debug_evidence_refs",
            normalizedEvidenceRef,
          );
        }
      });

      return secureDatabaseFile(options.filePath);
    },
    getSettings() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, "settings", JobFinderSettingsSchema) ??
            normalizedSeed.settings,
        ),
      );
    },
    saveSettings(settings) {
      const normalizedSettings = JobFinderSettingsSchema.parse(
        cloneValue(settings),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "settings", normalizedSettings);
      });
      return secureDatabaseFile(options.filePath);
    },
    getDiscoveryState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(database, "discovery_state", {
            parse: normalizeLegacyDiscoveryState,
          }) ?? normalizedSeed.discovery,
        ),
      );
    },
    saveDiscoveryState(discoveryState) {
      const normalizedDiscoveryState = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      );

      runImmediateTransaction(database, () => {
        saveSingletonValue(
          database,
          "discovery_state",
          normalizedDiscoveryState,
        );
      });

      return secureDatabaseFile(options.filePath);
    },
    getCampaignState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(
            database,
            "campaign_state",
            JobSearchCampaignCollectionSchema,
          ),
        ),
      );
    },
    saveCampaignState(campaignState) {
      const normalizedCampaignState = JobSearchCampaignCollectionSchema.parse(
        cloneValue(campaignState),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "campaign_state", normalizedCampaignState);
      });
      return secureDatabaseFile(options.filePath);
    },
    getIntelligenceState() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(
            database,
            "intelligence_state",
            JobFinderIntelligenceStateSchema,
          ) ?? JobFinderIntelligenceStateSchema.parse({}),
        ),
      );
    },
    saveIntelligenceState(intelligenceState) {
      const normalized = JobFinderIntelligenceStateSchema.parse(
        cloneValue(intelligenceState),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "intelligence_state", normalized);
      });
      return secureDatabaseFile(options.filePath);
    },
    getActivityControl() {
      return Promise.resolve(
        cloneValue(
          getSingletonValue(
            database,
            "activity_control",
            JobFinderActivityControlSchema,
          ) ?? JobFinderActivityControlSchema.parse({}),
        ),
      );
    },
    saveActivityControl(activityControl) {
      const normalized = JobFinderActivityControlSchema.parse(
        cloneValue(activityControl),
      );
      runImmediateTransaction(database, () => {
        saveSingletonValue(database, "activity_control", normalized);
      });
      return secureDatabaseFile(options.filePath);
    },
  };
}
