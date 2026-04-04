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
} from "@unemployed/contracts";

import { cloneValue } from "./internal/state";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "./repository-types";

function upsertById<TValue extends { id: string }>(
  current: readonly TValue[],
  nextValue: TValue,
): TValue[] {
  const nextValues = [...current];
  const existingIndex = nextValues.findIndex((entry) => entry.id === nextValue.id);

  if (existingIndex >= 0) {
    nextValues[existingIndex] = nextValue;
  } else {
    nextValues.push(nextValue);
  }

  return nextValues;
}

function sortResumeDrafts<TValue extends { updatedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function sortNewestFirst<TValue extends { createdAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function sortValidationResults<TValue extends { validatedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(right.validatedAt).getTime() -
      new Date(left.validatedAt).getTime(),
  );
}

function sortExports<TValue extends { exportedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(right.exportedAt).getTime() - new Date(left.exportedAt).getTime(),
  );
}

function sortResearch<TValue extends { fetchedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime(),
  );
}

function sortMessages<TValue extends { createdAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function clearApprovedResumeExportsForJob<TValue extends { jobId: string; isApproved: boolean }>(
  values: readonly TValue[],
  jobId: string,
): TValue[] {
  return values.map((entry) =>
    entry.jobId === jobId ? { ...entry, isApproved: false } : entry,
  );
}

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
      state.savedJobs = normalizedSeed.savedJobs;
      state.tailoredAssets = normalizedSeed.tailoredAssets;
      state.resumeDrafts = normalizedSeed.resumeDrafts;
      state.resumeDraftRevisions = normalizedSeed.resumeDraftRevisions;
      state.resumeExportArtifacts = normalizedSeed.resumeExportArtifacts;
      state.resumeResearchArtifacts = normalizedSeed.resumeResearchArtifacts;
      state.resumeValidationResults = normalizedSeed.resumeValidationResults;
      state.resumeAssistantMessages = normalizedSeed.resumeAssistantMessages;
      state.applicationRecords = normalizedSeed.applicationRecords;
      state.applicationAttempts = normalizedSeed.applicationAttempts;
      state.sourceDebugRuns = normalizedSeed.sourceDebugRuns;
      state.sourceDebugAttempts = normalizedSeed.sourceDebugAttempts;
      state.sourceInstructionArtifacts = normalizedSeed.sourceInstructionArtifacts;
      state.sourceDebugEvidenceRefs = normalizedSeed.sourceDebugEvidenceRefs;
      state.settings = normalizedSeed.settings;
      state.discovery = normalizedSeed.discovery;

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
    saveSearchPreferences(searchPreferences) {
      state.searchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
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
    listSavedJobs() {
      return Promise.resolve(cloneValue(state.savedJobs));
    },
    replaceSavedJobs(savedJobs) {
      state.savedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]));
      return Promise.resolve();
    },
    replaceSavedJobsAndClearResumeApproval({
      savedJobs,
      draft,
      staleReason,
      tailoredAsset,
    }) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]));
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({ ...draft, staleReason }),
      );
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;

      state.savedJobs = normalizedJobs;
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      );
      if (normalizedAsset) {
        state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      }
      return Promise.resolve();
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets));
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
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
        ? state.resumeDraftRevisions.filter((entry) => entry.draftId === draftId)
        : state.resumeDraftRevisions;
      return Promise.resolve(sortNewestFirst(cloneValue(values)));
    },
    upsertResumeDraftRevision(revision) {
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      state.resumeDraftRevisions = upsertById(
        state.resumeDraftRevisions,
        normalizedRevision,
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
    listResumeValidationResults(draftId) {
      const values = draftId
        ? state.resumeValidationResults.filter((entry) => entry.draftId === draftId)
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
    saveResumeDraftWithValidation({ draft, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      if (!normalizedDraft.approvedExportId) {
        state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
          state.resumeExportArtifacts,
          normalizedDraft.jobId,
        );
      }
      state.resumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      if (tailoredAsset) {
        const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
        state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      }
      return Promise.resolve();
    },
    applyResumePatchWithRevision({ draft, revision, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      const normalizedRevision = ResumeDraftRevisionSchema.parse(
        cloneValue(revision),
      );
      const normalizedValidation = ResumeValidationResultSchema.parse(
        cloneValue(validation),
      );
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      if (!normalizedDraft.approvedExportId) {
        state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
          state.resumeExportArtifacts,
          normalizedDraft.jobId,
        );
      }
      state.resumeDraftRevisions = upsertById(
        state.resumeDraftRevisions,
        normalizedRevision,
      );
      state.resumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      if (tailoredAsset) {
        const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
        state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      }
      return Promise.resolve();
    },
    approveResumeExport({ draft, exportArtifact, validation, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(cloneValue(draft));
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue(exportArtifact),
      );
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      state.resumeExportArtifacts = upsertById(
        state.resumeExportArtifacts,
        normalizedArtifact,
      ).map((entry) =>
        entry.jobId === normalizedArtifact.jobId && entry.id !== normalizedArtifact.id
          ? { ...entry, isApproved: false }
          : entry,
      );
      if (validation) {
        const normalizedValidation = ResumeValidationResultSchema.parse(
          cloneValue(validation),
        );
        state.resumeValidationResults = upsertById(
          state.resumeValidationResults,
          normalizedValidation,
        );
      }
      if (tailoredAsset) {
        const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
        state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      }
      return Promise.resolve();
    },
    clearResumeApproval({ draft, staleReason, tailoredAsset }) {
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({ ...draft, staleReason }),
      );
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      );
      if (tailoredAsset) {
        const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
        state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
      }
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
      state.sourceInstructionArtifacts = state.sourceInstructionArtifacts.filter(
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
  };
}
