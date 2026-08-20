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
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
  UserActionEventSchema,
  UserActionRequestSchema,
  type ApplicationAnswerRecord,
  type ApplicationQuestionRecord,
  type UserActionRequest,
} from "@unemployed/contracts";

import { cloneValue } from "./internal/state";
import {
  areSameApplicationAnswerRecords,
  areSameApplicationQuestionRecords,
  latestApplicationAnswerRecord,
  normalizeGroupedManualAnswerCommit,
  resolveGroupedManualAnswerCommit,
  type GroupedManualAnswerCurrentSnapshot,
} from "./grouped-manual-answer-support";
import type { CommitGroupedManualAnswerInput } from "./grouped-manual-answer-types";
import {
  matchesOptionalStringFilters,
  sortApplicationAnswerRecords,
  sortApplicationArtifactRefs,
  sortApplicationConsentRequests,
  sortApplicationQuestionRecords,
  sortApplicationReplayCheckpoints,
  sortApplyJobResults,
  sortApplyRuns,
  sortApplySubmitApprovals,
} from "./apply-collection-support";
import {
  areSameUserActionEvents,
  areSameUserActionRequests,
  assertUserActionTransitionCurrent,
  createPersistedUserActionCreatedEvent,
  matchesUserActionEventQuery,
  matchesUserActionRequestQuery,
  normalizeUserActionTransition,
  sortUserActionEvents,
  sortUserActionRequests,
} from "./user-action-repository-support";
import {
  clearApprovedResumeExportsForJob,
  replaceArtifactsForRun,
  resolveApprovedExportId,
  sortExports,
  sortImportRuns,
  sortMessages,
  sortNewestFirst,
  sortResearch,
  sortResumeDrafts,
  sortValidationResults,
  upsertById,
} from "./in-memory-repository-utils";
import { retainResumeDraftRevisions } from "./resume-draft-revision-retention";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "./repository-types";

export function createInMemoryJobFinderRepository(
  seed: JobFinderRepositorySeed,
): JobFinderRepository {
  const state = JobFinderRepositoryStateSchema.parse(cloneValue(seed));

  return {
    close() {
      return Promise.resolve();
    },
    reset(nextSeed) {
      const normalizedSeed = JobFinderRepositoryStateSchema.parse(
        cloneValue(nextSeed),
      );

      state.profile = normalizedSeed.profile;
      state.searchPreferences = normalizedSeed.searchPreferences;
      state.profileSetupState = normalizedSeed.profileSetupState;
      state.savedJobs = normalizedSeed.savedJobs;
      state.tailoredAssets = normalizedSeed.tailoredAssets;
      state.resumeDrafts = normalizedSeed.resumeDrafts;
      state.resumeDraftRevisions = normalizedSeed.resumeDraftRevisions;
      state.resumeExportArtifacts = normalizedSeed.resumeExportArtifacts;
      state.resumeImportRuns = normalizedSeed.resumeImportRuns;
      state.resumeImportDocumentBundles =
        normalizedSeed.resumeImportDocumentBundles;
      state.resumeImportFieldCandidates =
        normalizedSeed.resumeImportFieldCandidates;
      state.resumeResearchArtifacts = normalizedSeed.resumeResearchArtifacts;
      state.resumeValidationResults = normalizedSeed.resumeValidationResults;
      state.resumeAssistantMessages = normalizedSeed.resumeAssistantMessages;
      state.profileCopilotMessages = normalizedSeed.profileCopilotMessages;
      state.profileRevisions = normalizedSeed.profileRevisions;
      state.applyRuns = normalizedSeed.applyRuns;
      state.applyJobResults = normalizedSeed.applyJobResults;
      state.applySubmitApprovals = normalizedSeed.applySubmitApprovals;
      state.applicationQuestionRecords =
        normalizedSeed.applicationQuestionRecords;
      state.applicationAnswerRecords = normalizedSeed.applicationAnswerRecords;
      state.applicationArtifactRefs = normalizedSeed.applicationArtifactRefs;
      state.applicationReplayCheckpoints =
        normalizedSeed.applicationReplayCheckpoints;
      state.applicationConsentRequests =
        normalizedSeed.applicationConsentRequests;
      state.userActionRequests = normalizedSeed.userActionRequests;
      state.userActionEvents = normalizedSeed.userActionEvents;
      state.applicationRecords = normalizedSeed.applicationRecords;
      state.applicationAttempts = normalizedSeed.applicationAttempts;
      state.sourceDebugRuns = normalizedSeed.sourceDebugRuns;
      state.sourceDebugAttempts = normalizedSeed.sourceDebugAttempts;
      state.sourceInstructionArtifacts =
        normalizedSeed.sourceInstructionArtifacts;
      state.sourceDebugEvidenceRefs = normalizedSeed.sourceDebugEvidenceRefs;
      state.settings = normalizedSeed.settings;
      state.discovery = normalizedSeed.discovery;
      state.campaigns = normalizedSeed.campaigns;
      state.activeCampaignId = normalizedSeed.activeCampaignId;
      state.activityControl = normalizedSeed.activityControl;

      return Promise.resolve();
    },
    getProfile() {
      return Promise.resolve(cloneValue(state.profile));
    },
    saveProfile(profile) {
      state.profile = CandidateProfileSchema.parse(cloneValue(profile));
      return Promise.resolve();
    },
    getSearchPreferences() {
      return Promise.resolve(cloneValue(state.searchPreferences));
    },
    getProfileSetupState() {
      return Promise.resolve(cloneValue(state.profileSetupState));
    },
    saveSearchPreferences(searchPreferences) {
      state.searchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      return Promise.resolve();
    },
    saveProfileSetupState(profileSetupState) {
      state.profileSetupState = ProfileSetupStateSchema.parse(
        cloneValue(profileSetupState),
      );
      return Promise.resolve();
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      state.profile = CandidateProfileSchema.parse(cloneValue(profile));
      state.searchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      return Promise.resolve();
    },
    commitProfileCopilotState({
      profile,
      searchPreferences,
      profileSetupState,
      messages,
      revisions,
    }) {
      state.profile = CandidateProfileSchema.parse(cloneValue(profile));
      state.searchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      state.profileSetupState = ProfileSetupStateSchema.parse(
        cloneValue(profileSetupState),
      );

      if (messages) {
        const normalizedMessages = ProfileCopilotMessageSchema.array().parse(
          cloneValue(messages),
        );
        for (const message of normalizedMessages) {
          state.profileCopilotMessages = upsertById(
            state.profileCopilotMessages,
            message,
          );
        }
      }

      if (revisions) {
        const normalizedRevisions = ProfileRevisionSchema.array().parse(
          cloneValue(revisions),
        );
        for (const revision of normalizedRevisions) {
          state.profileRevisions = upsertById(state.profileRevisions, revision);
        }
      }

      return Promise.resolve();
    },
    listSavedJobs(options?: { limit?: number; offset?: number }) {
      const normalizePaginationValue = (
        value: number | undefined,
        fieldName: "limit" | "offset",
        defaultValue: number,
      ): number => {
        if (value === undefined) {
          return defaultValue;
        }
        if (!Number.isFinite(value)) {
          throw new RangeError(`${fieldName} must be a finite number.`);
        }
        return Math.max(0, Math.floor(value));
      };
      const limit = normalizePaginationValue(options?.limit, "limit", -1);
      const offset = normalizePaginationValue(options?.offset, "offset", 0);
      const orderedJobs = [...state.savedJobs].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      const sliced =
        limit < 0
          ? orderedJobs.slice(offset)
          : orderedJobs.slice(offset, offset + limit);
      return Promise.resolve(cloneValue(sliced));
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
      let previousJobForResumeApproval: ReturnType<
        typeof SavedJobSchema.parse
      > | null = null;
      let nextJobForResumeApproval: ReturnType<
        typeof SavedJobSchema.parse
      > | null = null;
      const existingJobIds = new Set(state.savedJobs.map((job) => job.id));

      if (update) {
        state.savedJobs = state.savedJobs.map((currentJob) => {
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
          return JSON.stringify(nextJob) === JSON.stringify(currentJob)
            ? currentJob
            : nextJob;
        });
      }

      for (const job of normalizedUpserts) {
        if (update && existingJobIds.has(job.id)) {
          continue;
        }
        state.savedJobs = upsertById(state.savedJobs, job);
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
        const draft = state.resumeDrafts.find(
          (candidate) => candidate.jobId === clearResumeApproval.jobId,
        );
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
          const existingAsset =
            state.tailoredAssets.find(
              (asset) => asset.jobId === staleDraft.jobId,
            ) ?? null;

          state.resumeDrafts = upsertById(state.resumeDrafts, staleDraft);
          state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
            state.resumeExportArtifacts,
            staleDraft.jobId,
          );
          if (existingAsset) {
            state.tailoredAssets = upsertById(state.tailoredAssets, {
              ...existingAsset,
              storagePath: null,
              updatedAt: staleDraft.updatedAt,
            });
          }
        }
      }

      if (normalizedDiscoveryState) {
        state.discovery = normalizedDiscoveryState;
      }

      return Promise.resolve();
    },
    replaceSavedJobs(savedJobs) {
      state.savedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
      return Promise.resolve();
    },
    replaceSavedJobsAndDiscoveryState({ savedJobs, discoveryState }) {
      state.savedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
      state.discovery = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      );
      return Promise.resolve();
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

      state.savedJobs = normalizedJobs;
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      );
      if (normalizedAsset) {
        state.tailoredAssets = upsertById(
          state.tailoredAssets,
          normalizedAsset,
        );
      }
      return Promise.resolve();
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets));
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(
        cloneValue(tailoredAsset),
      );
      state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      return Promise.resolve();
    },
    listResumeDrafts() {
      return Promise.resolve(sortResumeDrafts(cloneValue(state.resumeDrafts)));
    },
    getResumeDraftByJobId(jobId) {
      const draft = sortResumeDrafts(state.resumeDrafts).find(
        (entry) => entry.jobId === jobId,
      );
      return Promise.resolve(draft ? cloneValue(draft) : null);
    },
    upsertResumeDraft(draft) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      return Promise.resolve();
    },
    listResumeDraftRevisions(draftId) {
      const values = draftId
        ? state.resumeDraftRevisions.filter(
            (entry) => entry.draftId === draftId,
          )
        : state.resumeDraftRevisions;
      return Promise.resolve(sortNewestFirst(cloneValue(values)));
    },
    upsertResumeDraftRevision(revision) {
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      state.resumeDraftRevisions = retainResumeDraftRevisions(
        upsertById(state.resumeDraftRevisions, normalizedRevision),
        normalizedRevision.draftId,
      );
      return Promise.resolve();
    },
    listResumeExportArtifacts(options) {
      const values = state.resumeExportArtifacts.filter((entry) => {
        if (options?.jobId && entry.jobId !== options.jobId) {
          return false;
        }

        if (options?.draftId && entry.draftId !== options.draftId) {
          return false;
        }

        return true;
      });
      return Promise.resolve(sortExports(cloneValue(values)));
    },
    upsertResumeExportArtifact(artifact) {
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue(artifact),
      );
      state.resumeExportArtifacts = upsertById(
        state.resumeExportArtifacts,
        normalizedArtifact,
      );
      return Promise.resolve();
    },
    listResumeResearchArtifacts(jobId) {
      const values = jobId
        ? state.resumeResearchArtifacts.filter((entry) => entry.jobId === jobId)
        : state.resumeResearchArtifacts;
      return Promise.resolve(sortResearch(cloneValue(values)));
    },
    upsertResumeResearchArtifact(artifact) {
      const normalizedArtifact = ResumeResearchArtifactSchema.parse(
        cloneValue(artifact),
      );
      state.resumeResearchArtifacts = upsertById(
        state.resumeResearchArtifacts,
        normalizedArtifact,
      );
      return Promise.resolve();
    },
    listResumeImportRuns(options) {
      let values = state.resumeImportRuns;

      if (options?.sourceResumeId) {
        values = values.filter(
          (entry) => entry.sourceResumeId === options.sourceResumeId,
        );
      }

      if (options?.statuses && options.statuses.length > 0) {
        const allowedStatuses = new Set(options.statuses);
        values = values.filter((entry) => allowedStatuses.has(entry.status));
      }

      const sortedValues = sortImportRuns(cloneValue(values));
      return Promise.resolve(
        typeof options?.limit === "number"
          ? sortedValues.slice(0, Math.max(0, options.limit))
          : sortedValues,
      );
    },
    async getLatestResumeImportRun(sourceResumeId) {
      const values = await this.listResumeImportRuns({
        ...(sourceResumeId ? { sourceResumeId } : {}),
        limit: 1,
      });
      return values[0] ?? null;
    },
    upsertResumeImportRun(run) {
      const normalizedRun = ResumeImportRunSchema.parse(cloneValue(run));
      state.resumeImportRuns = upsertById(
        state.resumeImportRuns,
        normalizedRun,
      );
      return Promise.resolve();
    },
    listResumeImportDocumentBundles(options) {
      const values = state.resumeImportDocumentBundles.filter((entry) => {
        if (options?.runId && entry.runId !== options.runId) {
          return false;
        }

        if (
          options?.sourceResumeId &&
          entry.sourceResumeId !== options.sourceResumeId
        ) {
          return false;
        }

        return true;
      });

      return Promise.resolve(sortNewestFirst(cloneValue(values)));
    },
    listResumeImportFieldCandidates(options) {
      const values = state.resumeImportFieldCandidates.filter((entry) => {
        if (options?.runId && entry.runId !== options.runId) {
          return false;
        }

        if (options?.resolution && entry.resolution !== options.resolution) {
          return false;
        }

        if (options?.resolutions && options.resolutions.length > 0) {
          const allowedResolutions = new Set(options.resolutions);

          if (!allowedResolutions.has(entry.resolution)) {
            return false;
          }
        }

        return true;
      });

      return Promise.resolve(sortNewestFirst(cloneValue(values)));
    },
    replaceResumeImportRunArtifacts({ run, documentBundles, fieldCandidates }) {
      const normalizedRun = ResumeImportRunSchema.parse(cloneValue(run));
      const normalizedBundles = ResumeDocumentBundleSchema.array().parse(
        cloneValue([...documentBundles]),
      );
      const normalizedCandidates =
        ResumeImportFieldCandidateSchema.array().parse(
          cloneValue([...fieldCandidates]),
        );

      for (const bundle of normalizedBundles) {
        if (bundle.runId !== normalizedRun.id) {
          throw new Error(
            "Resume document bundle does not belong to the provided import run.",
          );
        }
      }

      for (const candidate of normalizedCandidates) {
        if (candidate.runId !== normalizedRun.id) {
          throw new Error(
            "Resume import candidate does not belong to the provided import run.",
          );
        }
      }

      state.resumeImportRuns = upsertById(
        state.resumeImportRuns,
        normalizedRun,
      );
      const nextArtifacts = replaceArtifactsForRun(
        state.resumeImportDocumentBundles,
        state.resumeImportFieldCandidates,
        normalizedRun.id,
        normalizedBundles,
        normalizedCandidates,
      );
      state.resumeImportDocumentBundles = nextArtifacts.bundles;
      state.resumeImportFieldCandidates = nextArtifacts.candidates;
      return Promise.resolve();
    },
    finalizeResumeImportRun({
      profile,
      searchPreferences,
      run,
      documentBundles,
      fieldCandidates,
    }) {
      const normalizedProfile = CandidateProfileSchema.parse(
        cloneValue(profile),
      );
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );
      const normalizedRun = ResumeImportRunSchema.parse(cloneValue(run));
      const normalizedBundles = ResumeDocumentBundleSchema.array().parse(
        cloneValue([...documentBundles]),
      );
      const normalizedCandidates =
        ResumeImportFieldCandidateSchema.array().parse(
          cloneValue([...fieldCandidates]),
        );

      for (const bundle of normalizedBundles) {
        if (bundle.runId !== normalizedRun.id) {
          throw new Error(
            "Resume document bundle does not belong to the provided import run.",
          );
        }
      }

      for (const candidate of normalizedCandidates) {
        if (candidate.runId !== normalizedRun.id) {
          throw new Error(
            "Resume import candidate does not belong to the provided import run.",
          );
        }
      }

      state.profile = normalizedProfile;
      state.searchPreferences = normalizedSearchPreferences;
      state.resumeImportRuns = upsertById(
        state.resumeImportRuns,
        normalizedRun,
      );
      const nextArtifacts = replaceArtifactsForRun(
        state.resumeImportDocumentBundles,
        state.resumeImportFieldCandidates,
        normalizedRun.id,
        normalizedBundles,
        normalizedCandidates,
      );
      state.resumeImportDocumentBundles = nextArtifacts.bundles;
      state.resumeImportFieldCandidates = nextArtifacts.candidates;
      return Promise.resolve();
    },
    listResumeValidationResults(draftId) {
      const values = draftId
        ? state.resumeValidationResults.filter(
            (entry) => entry.draftId === draftId,
          )
        : state.resumeValidationResults;
      return Promise.resolve(sortValidationResults(cloneValue(values)));
    },
    upsertResumeValidationResult(validationResult) {
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validationResult),
      );
      state.resumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      return Promise.resolve();
    },
    listResumeAssistantMessages(jobId) {
      const values = jobId
        ? state.resumeAssistantMessages.filter((entry) => entry.jobId === jobId)
        : state.resumeAssistantMessages;
      return Promise.resolve(sortMessages(cloneValue(values)));
    },
    upsertResumeAssistantMessage(message) {
      const normalizedMessage = ResumeAssistantMessageSchema.parse(
        cloneValue(message),
      );
      state.resumeAssistantMessages = upsertById(
        state.resumeAssistantMessages,
        normalizedMessage,
      );
      return Promise.resolve();
    },
    listProfileCopilotMessages() {
      return Promise.resolve(
        sortMessages(cloneValue(state.profileCopilotMessages)),
      );
    },
    upsertProfileCopilotMessage(message) {
      const normalizedMessage = ProfileCopilotMessageSchema.parse(
        cloneValue(message),
      );
      state.profileCopilotMessages = upsertById(
        state.profileCopilotMessages,
        normalizedMessage,
      );
      return Promise.resolve();
    },
    listProfileRevisions() {
      return Promise.resolve(
        sortNewestFirst(cloneValue(state.profileRevisions)),
      );
    },
    upsertProfileRevision(revision) {
      const normalizedRevision = ProfileRevisionSchema.parse(
        cloneValue(revision),
      );
      state.profileRevisions = upsertById(
        state.profileRevisions,
        normalizedRevision,
      );
      return Promise.resolve();
    },
    listApplyRuns(options) {
      const values = state.applyRuns.filter((run) =>
        matchesOptionalStringFilters(run, [["id", options?.id]]),
      );

      return Promise.resolve(sortApplyRuns(cloneValue(values)));
    },
    upsertApplyRun(run) {
      const normalizedRun = ApplyRunSchema.parse(cloneValue(run));
      state.applyRuns = upsertById(state.applyRuns, normalizedRun);
      return Promise.resolve();
    },
    listApplyJobResults(options) {
      const values = state.applyJobResults.filter((result) =>
        matchesOptionalStringFilters(result, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
        ]),
      );

      return Promise.resolve(sortApplyJobResults(cloneValue(values)));
    },
    upsertApplyJobResult(result) {
      const normalizedResult = ApplyJobResultSchema.parse(cloneValue(result));
      const existingResult = state.applyJobResults.find(
        (entry) =>
          entry.runId === normalizedResult.runId &&
          entry.jobId === normalizedResult.jobId,
      );
      const nextResult = ApplyJobResultSchema.parse({
        ...normalizedResult,
        id: existingResult?.id ?? normalizedResult.id,
      });

      state.applyJobResults = [
        ...state.applyJobResults.filter(
          (entry) =>
            entry.runId !== normalizedResult.runId ||
            entry.jobId !== normalizedResult.jobId,
        ),
        nextResult,
      ];

      return Promise.resolve();
    },
    compareAndSwapApplyJobResult(input) {
      const expected = ApplyJobResultSchema.parse(cloneValue(input.expected));
      const nextResult = ApplyJobResultSchema.parse(cloneValue(input.result));
      const current = state.applyJobResults.find(
        (entry) => entry.id === expected.id,
      );
      if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
        return Promise.resolve(false);
      }
      if (nextResult.id !== expected.id) {
        throw new Error("Apply result CAS cannot change the result identity.");
      }

      state.applyJobResults = state.applyJobResults.map((entry) =>
        entry.id === expected.id ? nextResult : entry,
      );
      return Promise.resolve(true);
    },
    listApplySubmitApprovals(options) {
      const values = state.applySubmitApprovals.filter((approval) =>
        matchesOptionalStringFilters(approval, [
          ["id", options?.id],
          ["runId", options?.runId],
        ]),
      );

      return Promise.resolve(sortApplySubmitApprovals(cloneValue(values)));
    },
    upsertApplySubmitApproval(approval) {
      const normalizedApproval = ApplySubmitApprovalSchema.parse(
        cloneValue(approval),
      );
      state.applySubmitApprovals = upsertById(
        state.applySubmitApprovals,
        normalizedApproval,
      );
      return Promise.resolve();
    },
    listApplicationQuestionRecords(options) {
      const values = state.applicationQuestionRecords.filter((record) =>
        matchesOptionalStringFilters(record, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
          ["resultId", options?.resultId],
        ]),
      );

      return Promise.resolve(
        sortApplicationQuestionRecords(cloneValue(values)),
      );
    },
    upsertApplicationQuestionRecord(record) {
      const normalizedRecord = ApplicationQuestionRecordSchema.parse(
        cloneValue(record),
      );
      state.applicationQuestionRecords = upsertById(
        state.applicationQuestionRecords,
        normalizedRecord,
      );
      return Promise.resolve();
    },
    listApplicationAnswerRecords(options) {
      const values = state.applicationAnswerRecords.filter((record) =>
        matchesOptionalStringFilters(record, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
          ["resultId", options?.resultId],
          ["questionId", options?.questionId],
        ]),
      );

      return Promise.resolve(sortApplicationAnswerRecords(cloneValue(values)));
    },
    upsertApplicationAnswerRecord(record) {
      const normalizedRecord = ApplicationAnswerRecordSchema.parse(
        cloneValue(record),
      );
      state.applicationAnswerRecords = upsertById(
        state.applicationAnswerRecords,
        normalizedRecord,
      );
      return Promise.resolve();
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

      if (
        state.applicationAnswerRecords.some(
          (record) => record.id === nextAnswer.id,
        )
      ) {
        return Promise.resolve("duplicate" as const);
      }

      const currentAnswer = latestApplicationAnswerRecord(
        state.applicationAnswerRecords,
        expectedQuestion.id,
      );
      const currentQuestion = state.applicationQuestionRecords.find(
        (record) => record.id === expectedQuestion.id,
      );
      if (
        currentQuestion === undefined ||
        !areSameApplicationQuestionRecords(currentQuestion, expectedQuestion) ||
        (expectedAnswer === null
          ? currentAnswer !== null
          : currentAnswer === null ||
            !areSameApplicationAnswerRecords(currentAnswer, expectedAnswer))
      ) {
        return Promise.resolve("stale" as const);
      }

      state.applicationAnswerRecords = upsertById(
        state.applicationAnswerRecords,
        nextAnswer,
      );
      state.applicationQuestionRecords = upsertById(
        state.applicationQuestionRecords,
        nextQuestion,
      );
      return Promise.resolve("applied" as const);
    },
    listApplicationArtifactRefs(options) {
      const values = state.applicationArtifactRefs.filter((ref) =>
        matchesOptionalStringFilters(ref, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
          ["resultId", options?.resultId],
        ]),
      );

      return Promise.resolve(sortApplicationArtifactRefs(cloneValue(values)));
    },
    upsertApplicationArtifactRef(ref) {
      const normalizedRef = ApplicationArtifactRefSchema.parse(cloneValue(ref));
      state.applicationArtifactRefs = upsertById(
        state.applicationArtifactRefs,
        normalizedRef,
      );
      return Promise.resolve();
    },
    listApplicationReplayCheckpoints(options) {
      const values = state.applicationReplayCheckpoints.filter((checkpoint) =>
        matchesOptionalStringFilters(checkpoint, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
          ["resultId", options?.resultId],
        ]),
      );

      return Promise.resolve(
        sortApplicationReplayCheckpoints(cloneValue(values)),
      );
    },
    upsertApplicationReplayCheckpoint(checkpoint) {
      const normalizedCheckpoint = ApplicationReplayCheckpointSchema.parse(
        cloneValue(checkpoint),
      );
      state.applicationReplayCheckpoints = upsertById(
        state.applicationReplayCheckpoints,
        normalizedCheckpoint,
      );
      return Promise.resolve();
    },
    listApplicationConsentRequests(options) {
      const values = state.applicationConsentRequests.filter((request) =>
        matchesOptionalStringFilters(request, [
          ["runId", options?.runId],
          ["jobId", options?.jobId],
          ["resultId", options?.resultId],
        ]),
      );

      return Promise.resolve(
        sortApplicationConsentRequests(cloneValue(values)),
      );
    },
    upsertApplicationConsentRequest(request) {
      const normalizedRequest = ApplicationConsentRequestSchema.parse(
        cloneValue(request),
      );
      state.applicationConsentRequests = upsertById(
        state.applicationConsentRequests,
        normalizedRequest,
      );
      return Promise.resolve();
    },
    listUserActionRequests(query) {
      const requests = state.userActionRequests.filter((request) =>
        matchesUserActionRequestQuery(request, query),
      );
      return Promise.resolve(sortUserActionRequests(cloneValue(requests)));
    },
    getUserActionRequest(id) {
      const request = state.userActionRequests.find((entry) => entry.id === id);
      return Promise.resolve(request ? cloneValue(request) : null);
    },
    createUserActionRequest(request) {
      const normalizedRequest = UserActionRequestSchema.parse(
        cloneValue(request),
      );
      const existingById = state.userActionRequests.find(
        (entry) => entry.id === normalizedRequest.id,
      );
      const existingByDedupeKey = state.userActionRequests.find(
        (entry) => entry.dedupeKey === normalizedRequest.dedupeKey,
      );

      if (
        existingById &&
        !areSameUserActionRequests(existingById, normalizedRequest)
      ) {
        throw new Error(
          `User action request id '${normalizedRequest.id}' already exists with different data.`,
        );
      }

      const existing = existingById ?? existingByDedupeKey;
      if (existing) {
        let createdEvent = state.userActionEvents.find(
          (event) =>
            event.requestId === existing.id && event.operation === "created",
        );
        if (!createdEvent) {
          createdEvent = createPersistedUserActionCreatedEvent(existing);
          state.userActionEvents = [...state.userActionEvents, createdEvent];
        }
        return Promise.resolve(
          cloneValue({
            status: "existing" as const,
            request: existing,
            event: createdEvent,
          }),
        );
      }

      const createdEvent =
        createPersistedUserActionCreatedEvent(normalizedRequest);
      const eventCollision = state.userActionEvents.find(
        (event) => event.id === createdEvent.id,
      );
      if (
        eventCollision &&
        !areSameUserActionEvents(eventCollision, createdEvent)
      ) {
        throw new Error(
          `User action event id '${createdEvent.id}' already exists with different data.`,
        );
      }

      state.userActionRequests = [
        ...state.userActionRequests,
        normalizedRequest,
      ];
      state.userActionEvents = eventCollision
        ? state.userActionEvents
        : [...state.userActionEvents, createdEvent];

      return Promise.resolve(
        cloneValue({
          status: "created" as const,
          request: normalizedRequest,
          event: createdEvent,
        }),
      );
    },
    listUserActionEvents(query) {
      const events = state.userActionEvents.filter((event) =>
        matchesUserActionEventQuery(event, query),
      );
      return Promise.resolve(sortUserActionEvents(cloneValue(events)));
    },
    commitUserActionTransition(input) {
      const transition = normalizeUserActionTransition(input);
      const existingEvent = state.userActionEvents.find(
        (event) => event.id === transition.event.id,
      );

      if (existingEvent) {
        if (!areSameUserActionEvents(existingEvent, transition.event)) {
          throw new Error(
            `User action event id '${transition.event.id}' already exists with different data.`,
          );
        }
        const currentRequest = state.userActionRequests.find(
          (request) => request.id === transition.request.id,
        );
        if (!currentRequest) {
          throw new Error(
            `User action request '${transition.request.id}' does not exist.`,
          );
        }
        return Promise.resolve(
          cloneValue({
            status: "duplicate" as const,
            request: currentRequest,
            event: existingEvent,
          }),
        );
      }

      const currentRequest = state.userActionRequests.find(
        (request) => request.id === transition.request.id,
      );
      if (!currentRequest) {
        throw new Error(
          `User action request '${transition.request.id}' does not exist.`,
        );
      }
      if (currentRequest.revision !== transition.event.previousRevision) {
        return Promise.resolve(
          cloneValue({
            status: "stale" as const,
            request: currentRequest,
            event: null,
          }),
        );
      }

      assertUserActionTransitionCurrent(
        currentRequest,
        transition.request,
        transition.event,
      );
      state.userActionRequests = [
        ...state.userActionRequests.filter(
          (request) => request.id !== transition.request.id,
        ),
        transition.request,
      ];
      state.userActionEvents = [
        ...state.userActionEvents,
        UserActionEventSchema.parse(cloneValue(transition.event)),
      ];

      return Promise.resolve(
        cloneValue({
          status: "applied" as const,
          request: transition.request,
          event: transition.event,
        }),
      );
    },
    commitGroupedManualAnswer(input: CommitGroupedManualAnswerInput) {
      const plan = normalizeGroupedManualAnswerCommit(input);

      const requests = new Map<string, UserActionRequest>();
      for (const entry of plan.lineage) {
        const request = state.userActionRequests.find(
          (candidate) => candidate.id === entry.requestId,
        );
        if (request) {
          requests.set(entry.requestId, request);
        }
      }

      const answersByQuestionId = new Map<
        string,
        ApplicationAnswerRecord | null
      >();
      const questionIds = [...plan.expectedAnswerRevisionByQuestionId.keys()];
      for (const questionId of questionIds) {
        answersByQuestionId.set(
          questionId,
          latestApplicationAnswerRecord(
            state.applicationAnswerRecords,
            questionId,
          ),
        );
      }

      const questions = new Map<string, ApplicationQuestionRecord>();
      for (const change of plan.questionChanges) {
        const question = state.applicationQuestionRecords.find(
          (candidate) => candidate.id === change.next.id,
        );
        if (question) {
          questions.set(change.next.id, question);
        }
      }

      const decision =
        state.intelligence.groupedDecisions.find(
          (candidate) => candidate.id === plan.decision.id,
        ) ?? null;

      const snapshot: GroupedManualAnswerCurrentSnapshot = {
        requests,
        answersByQuestionId,
        questions,
        decision,
        events: state.userActionEvents,
      };
      const outcome = resolveGroupedManualAnswerCommit(plan, snapshot);
      if (outcome.status === "stale") {
        return Promise.resolve(cloneValue(outcome));
      }
      if (outcome.status === "duplicate") {
        return Promise.resolve(cloneValue(outcome));
      }

      const nextRequests = plan.lineage.reduce((currentRequests, entry) => {
        const next = plan.requestsByRequestId.get(entry.requestId)!;
        return currentRequests.map((request) =>
          request.id === next.id ? next : request,
        );
      }, state.userActionRequests);
      const nextEvents = [
        ...state.userActionEvents,
        ...outcome.events.map((event) =>
          UserActionEventSchema.parse(cloneValue(event)),
        ),
      ];
      let nextAnswers = state.applicationAnswerRecords;
      for (const change of plan.answerChanges) {
        nextAnswers = upsertById(nextAnswers, change.next);
      }
      let nextQuestions = state.applicationQuestionRecords;
      for (const change of plan.questionChanges) {
        nextQuestions = upsertById(nextQuestions, change.next);
      }
      const nextIntelligence = JobFinderIntelligenceStateSchema.parse({
        ...state.intelligence,
        groupedDecisions: state.intelligence.groupedDecisions.map(
          (candidate) =>
            candidate.id === plan.decision.id ? plan.decision : candidate,
        ),
        updatedAt: plan.appliedAt,
      });

      // Build and validate the complete next state before swapping any member,
      // preserving the same all-or-nothing behavior as the SQLite transaction.
      state.userActionRequests = nextRequests;
      state.userActionEvents = nextEvents;
      state.applicationAnswerRecords = nextAnswers;
      state.applicationQuestionRecords = nextQuestions;
      state.intelligence = nextIntelligence;

      return Promise.resolve(
        cloneValue({
          status: "applied" as const,
          decision: plan.decision,
          lineage: plan.lineage,
          requests: plan.lineage.map(
            (entry) => plan.requestsByRequestId.get(entry.requestId)!,
          ),
        }),
      );
    },
    saveResumeDraftWithValidation({ draft, validation, tailoredAsset }) {
      const parsedDraft = ResumeDraftSchema.parse(
        cloneValue(
          draft.approvedExportId
            ? draft
            : { ...draft, approvedAt: null, approvedExportId: null },
        ),
      );
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      const normalizedDraft = {
        ...parsedDraft,
        approvedExportId: resolveApprovedExportId(
          state.resumeExportArtifacts,
          parsedDraft,
        ),
      };
      if (!normalizedDraft.approvedExportId) {
        normalizedDraft.approvedAt = null;
      }

      if (normalizedValidation.draftId !== normalizedDraft.id) {
        throw new Error(
          "Resume validation result does not belong to the provided draft.",
        );
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      ).map((artifact) =>
        artifact.jobId === normalizedDraft.jobId &&
        artifact.id === normalizedDraft.approvedExportId
          ? { ...artifact, isApproved: true }
          : artifact,
      );
      const nextResumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      const nextTailoredAssets = tailoredAsset
        ? (() => {
            const normalizedAsset = TailoredAssetSchema.parse(
              cloneValue(tailoredAsset),
            );
            if (normalizedAsset.jobId !== normalizedDraft.jobId) {
              throw new Error(
                "Tailored asset job does not match the provided draft.",
              );
            }
            return upsertById(state.tailoredAssets, normalizedAsset);
          })()
        : state.tailoredAssets;

      state.resumeDrafts = nextResumeDrafts;
      state.resumeExportArtifacts = nextResumeExportArtifacts;
      state.resumeValidationResults = nextResumeValidationResults;
      state.tailoredAssets = nextTailoredAssets;
      return Promise.resolve();
    },
    applyResumePatchWithRevision({
      expectedDraftUpdatedAt,
      draft,
      revision,
      validation,
      tailoredAsset,
    }) {
      const parsedDraft = ResumeDraftSchema.parse(
        cloneValue(
          draft.approvedExportId
            ? draft
            : { ...draft, approvedAt: null, approvedExportId: null },
        ),
      );
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      const normalizedDraft = {
        ...parsedDraft,
        approvedExportId: resolveApprovedExportId(
          state.resumeExportArtifacts,
          parsedDraft,
        ),
      };
      if (!normalizedDraft.approvedExportId) {
        normalizedDraft.approvedAt = null;
      }

      const persistedDraft = state.resumeDrafts.find(
        (entry) => entry.id === normalizedDraft.id,
      );
      if (
        !persistedDraft ||
        persistedDraft.updatedAt !== expectedDraftUpdatedAt
      ) {
        throw new Error(
          "Resume draft changed before this edit could be saved. Reload the workspace and try again.",
        );
      }

      if (normalizedRevision.draftId !== normalizedDraft.id) {
        throw new Error(
          "Resume revision does not belong to the provided draft.",
        );
      }

      if (normalizedValidation.draftId !== normalizedDraft.id) {
        throw new Error(
          "Resume validation result does not belong to the provided draft.",
        );
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      ).map((artifact) =>
        artifact.jobId === normalizedDraft.jobId &&
        artifact.id === normalizedDraft.approvedExportId
          ? { ...artifact, isApproved: true }
          : artifact,
      );
      const nextResumeDraftRevisions = retainResumeDraftRevisions(
        upsertById(state.resumeDraftRevisions, normalizedRevision),
        normalizedRevision.draftId,
      );
      const nextResumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      const nextTailoredAssets = tailoredAsset
        ? (() => {
            const normalizedAsset = TailoredAssetSchema.parse(
              cloneValue(tailoredAsset),
            );
            if (normalizedAsset.jobId !== normalizedDraft.jobId) {
              throw new Error(
                "Tailored asset job does not match the provided draft.",
              );
            }
            return upsertById(state.tailoredAssets, normalizedAsset);
          })()
        : state.tailoredAssets;

      state.resumeDrafts = nextResumeDrafts;
      state.resumeExportArtifacts = nextResumeExportArtifacts;
      state.resumeDraftRevisions = nextResumeDraftRevisions;
      state.resumeValidationResults = nextResumeValidationResults;
      state.tailoredAssets = nextTailoredAssets;
      return Promise.resolve();
    },
    approveResumeExport({ draft, exportArtifact, validation, tailoredAsset }) {
      const approvedAt = draft.approvedAt ?? new Date().toISOString();
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          approvedAt,
          approvedExportId: exportArtifact.id,
        }),
      );
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue({ ...exportArtifact, isApproved: true }),
      );

      if (normalizedArtifact.draftId !== normalizedDraft.id) {
        throw new Error(
          "Approved export does not belong to the provided resume draft.",
        );
      }

      if (normalizedArtifact.jobId !== normalizedDraft.jobId) {
        throw new Error(
          "Approved export job does not match the provided resume draft.",
        );
      }

      const normalizedValidation = validation
        ? ResumeValidationResultSchema.parse(cloneValue(validation))
        : null;
      if (
        normalizedValidation &&
        normalizedValidation.draftId !== normalizedDraft.id
      ) {
        throw new Error(
          "Resume validation result does not belong to the provided draft.",
        );
      }
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;
      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error(
          "Tailored asset job does not match the provided draft.",
        );
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = upsertById(
        state.resumeExportArtifacts,
        normalizedArtifact,
      ).map((entry) =>
        entry.jobId === normalizedArtifact.jobId &&
        entry.id !== normalizedArtifact.id
          ? { ...entry, isApproved: false }
          : entry,
      );
      const nextResumeValidationResults = normalizedValidation
        ? upsertById(state.resumeValidationResults, normalizedValidation)
        : state.resumeValidationResults;
      const nextTailoredAssets = normalizedAsset
        ? upsertById(state.tailoredAssets, normalizedAsset)
        : state.tailoredAssets;

      state.resumeDrafts = nextResumeDrafts;
      state.resumeExportArtifacts = nextResumeExportArtifacts;
      state.resumeValidationResults = nextResumeValidationResults;
      state.tailoredAssets = nextTailoredAssets;
      return Promise.resolve();
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
      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error(
          "Tailored asset job does not match the provided draft.",
        );
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      );
      const nextTailoredAssets = normalizedAsset
        ? upsertById(state.tailoredAssets, normalizedAsset)
        : state.tailoredAssets;

      state.resumeDrafts = nextResumeDrafts;
      state.resumeExportArtifacts = nextResumeExportArtifacts;
      state.tailoredAssets = nextTailoredAssets;
      return Promise.resolve();
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(state.applicationRecords));
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(
        cloneValue(applicationRecord),
      );
      state.applicationRecords = upsertById(
        state.applicationRecords,
        normalizedRecord,
      );
      return Promise.resolve();
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

      const currentById = new Map(
        state.applicationRecords.map((record) => [record.id, record]),
      );
      const missingRecordIds = expectedIds.filter((id) => !currentById.has(id));
      if (missingRecordIds.length > 0) {
        return Promise.resolve({
          status: "missing" as const,
          recordIds: missingRecordIds,
        });
      }

      const staleRecordIds = expectedRevisions
        .filter(
          ({ applicationRecordId, expectedRevision }) =>
            (currentById.get(applicationRecordId)?.crm?.revision ?? 0) !==
            expectedRevision,
        )
        .map(({ applicationRecordId }) => applicationRecordId);
      if (staleRecordIds.length > 0) {
        return Promise.resolve({
          status: "stale" as const,
          recordIds: staleRecordIds,
        });
      }

      const nextById = new Map(
        normalizedRecords.map((record) => [record.id, record]),
      );
      state.applicationRecords = state.applicationRecords.map(
        (record) => nextById.get(record.id) ?? record,
      );
      return Promise.resolve({
        status: "applied" as const,
        committedRecordIds: expectedIds,
      });
    },
    listApplicationAttempts() {
      return Promise.resolve(cloneValue(state.applicationAttempts));
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      state.applicationAttempts = upsertById(
        state.applicationAttempts,
        normalizedAttempt,
      );
      return Promise.resolve();
    },
    claimApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      if (
        state.applicationAttempts.some(
          (attempt) => attempt.id === normalizedAttempt.id,
        )
      ) {
        return Promise.resolve(false);
      }
      state.applicationAttempts = [
        ...state.applicationAttempts,
        normalizedAttempt,
      ];
      return Promise.resolve(true);
    },
    listSourceDebugRuns() {
      return Promise.resolve(cloneValue(state.sourceDebugRuns));
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run));
      state.sourceDebugRuns = upsertById(state.sourceDebugRuns, normalizedRun);
      return Promise.resolve();
    },
    listSourceDebugAttempts() {
      return Promise.resolve(cloneValue(state.sourceDebugAttempts));
    },
    upsertSourceDebugAttempt(attempt) {
      const normalizedAttempt = SourceDebugWorkerAttemptSchema.parse(
        cloneValue(attempt),
      );
      state.sourceDebugAttempts = upsertById(
        state.sourceDebugAttempts,
        normalizedAttempt,
      );
      return Promise.resolve();
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(cloneValue(state.sourceInstructionArtifacts));
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(
        cloneValue(artifact),
      );
      state.sourceInstructionArtifacts = upsertById(
        state.sourceInstructionArtifacts,
        normalizedArtifact,
      );
      return Promise.resolve();
    },
    deleteSourceInstructionArtifactsForTarget(targetId) {
      state.sourceInstructionArtifacts =
        state.sourceInstructionArtifacts.filter(
          (artifact) => artifact.targetId !== targetId,
        );
      return Promise.resolve();
    },
    listSourceDebugEvidenceRefs() {
      return Promise.resolve(cloneValue(state.sourceDebugEvidenceRefs));
    },
    upsertSourceDebugEvidenceRef(evidenceRef) {
      const normalizedEvidenceRef = SourceDebugEvidenceRefSchema.parse(
        cloneValue(evidenceRef),
      );
      state.sourceDebugEvidenceRefs = upsertById(
        state.sourceDebugEvidenceRefs,
        normalizedEvidenceRef,
      );
      return Promise.resolve();
    },
    upsertSourceDebugEvidenceRefs(evidenceRefs) {
      const normalizedEvidenceRefs = SourceDebugEvidenceRefSchema.array().parse(
        cloneValue([...evidenceRefs]),
      );

      for (const normalizedEvidenceRef of normalizedEvidenceRefs) {
        state.sourceDebugEvidenceRefs = upsertById(
          state.sourceDebugEvidenceRefs,
          normalizedEvidenceRef,
        );
      }

      return Promise.resolve();
    },
    getSettings() {
      return Promise.resolve(cloneValue(state.settings));
    },
    saveSettings(settings) {
      state.settings = JobFinderSettingsSchema.parse(cloneValue(settings));
      return Promise.resolve();
    },
    getDiscoveryState() {
      return Promise.resolve(cloneValue(state.discovery));
    },
    saveDiscoveryState(discoveryState) {
      state.discovery = JobFinderDiscoveryStateSchema.parse(
        cloneValue(discoveryState),
      );
      return Promise.resolve();
    },
    getCampaignState() {
      if (state.campaigns.length === 0 || !state.activeCampaignId) {
        return Promise.resolve(null);
      }
      return Promise.resolve(
        cloneValue(
          JobSearchCampaignCollectionSchema.parse({
            campaigns: state.campaigns,
            activeCampaignId: state.activeCampaignId,
            notifications: state.campaignNotifications,
          }),
        ),
      );
    },
    saveCampaignState(campaignState) {
      const normalized = JobSearchCampaignCollectionSchema.parse(
        cloneValue(campaignState),
      );
      state.campaigns = normalized.campaigns;
      state.activeCampaignId = normalized.activeCampaignId;
      state.campaignNotifications = normalized.notifications;
      return Promise.resolve();
    },
    getIntelligenceState() {
      return Promise.resolve(cloneValue(state.intelligence));
    },
    saveIntelligenceState(intelligenceState) {
      state.intelligence = JobFinderIntelligenceStateSchema.parse(
        cloneValue(intelligenceState),
      );
      return Promise.resolve();
    },
    getActivityControl() {
      return Promise.resolve(cloneValue(state.activityControl));
    },
    saveActivityControl(activityControl) {
      state.activityControl = JobFinderActivityControlSchema.parse(
        cloneValue(activityControl),
      );
      return Promise.resolve();
    },
  };
}
