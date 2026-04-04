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
    (left, right) => {
      const difference = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
  );
}

function sortNewestFirst<TValue extends { createdAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) => {
      const difference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
  );
}

function sortValidationResults<TValue extends { validatedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) => {
      const difference = new Date(right.validatedAt).getTime() - new Date(left.validatedAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
  );
}

function sortExports<TValue extends { exportedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) => {
      const difference = new Date(right.exportedAt).getTime() - new Date(left.exportedAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
  );
}

function sortResearch<TValue extends { fetchedAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) => {
      const difference = new Date(right.fetchedAt).getTime() - new Date(left.fetchedAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
  );
}

function sortMessages<TValue extends { createdAt: string }>(
  values: readonly TValue[],
): TValue[] {
  return [...values].sort(
    (left, right) => {
      const difference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return difference !== 0
        ? difference
        : String((left as { id?: string }).id ?? "").localeCompare(
            String((right as { id?: string }).id ?? ""),
          );
    },
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

function resolveApprovedExportId(
  currentArtifacts: readonly { id: string; draftId: string; jobId: string }[],
  draft: { approvedExportId: string | null; id: string; jobId: string },
): string | null {
  if (!draft.approvedExportId) {
    return null;
  }

  return currentArtifacts.some(
    (artifact) =>
      artifact.id === draft.approvedExportId &&
      artifact.draftId === draft.id &&
      artifact.jobId === draft.jobId,
  )
    ? draft.approvedExportId
    : null;
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
        throw new Error("Tailored asset job does not match the provided draft.");
      }

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
        approvedExportId: resolveApprovedExportId(state.resumeExportArtifacts, parsedDraft),
      };
      if (!normalizedDraft.approvedExportId) {
        normalizedDraft.approvedAt = null;
      }

      if (normalizedValidation.draftId !== normalizedDraft.id) {
        throw new Error("Resume validation result does not belong to the provided draft.");
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      ).map((artifact) =>
        artifact.jobId === normalizedDraft.jobId && artifact.id === normalizedDraft.approvedExportId
          ? { ...artifact, isApproved: true }
          : artifact,
      );
      const nextResumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      const nextTailoredAssets = tailoredAsset
        ? (() => {
            const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
            if (normalizedAsset.jobId !== normalizedDraft.jobId) {
              throw new Error("Tailored asset job does not match the provided draft.");
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
    applyResumePatchWithRevision({ draft, revision, validation, tailoredAsset }) {
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
        approvedExportId: resolveApprovedExportId(state.resumeExportArtifacts, parsedDraft),
      };
      if (!normalizedDraft.approvedExportId) {
        normalizedDraft.approvedAt = null;
      }

      if (normalizedRevision.draftId !== normalizedDraft.id) {
        throw new Error("Resume revision does not belong to the provided draft.");
      }

      if (normalizedValidation.draftId !== normalizedDraft.id) {
        throw new Error("Resume validation result does not belong to the provided draft.");
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      ).map((artifact) =>
        artifact.jobId === normalizedDraft.jobId && artifact.id === normalizedDraft.approvedExportId
          ? { ...artifact, isApproved: true }
          : artifact,
      );
      const nextResumeDraftRevisions = upsertById(
        state.resumeDraftRevisions,
        normalizedRevision,
      );
      const nextResumeValidationResults = upsertById(
        state.resumeValidationResults,
        normalizedValidation,
      );
      const nextTailoredAssets = tailoredAsset
        ? (() => {
            const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
            if (normalizedAsset.jobId !== normalizedDraft.jobId) {
              throw new Error("Tailored asset job does not match the provided draft.");
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
      const normalizedDraft = ResumeDraftSchema.parse(
        cloneValue({
          ...draft,
          approvedExportId: exportArtifact.id,
        }),
      );
      const normalizedArtifact = ResumeExportArtifactSchema.parse(
        cloneValue({ ...exportArtifact, isApproved: true }),
      );

      if (normalizedArtifact.draftId !== normalizedDraft.id) {
        throw new Error("Approved export does not belong to the provided resume draft.");
      }

      if (normalizedArtifact.jobId !== normalizedDraft.jobId) {
        throw new Error("Approved export job does not match the provided resume draft.");
      }

      const normalizedValidation = validation
        ? ResumeValidationResultSchema.parse(cloneValue(validation))
        : null;
      if (normalizedValidation && normalizedValidation.draftId !== normalizedDraft.id) {
        throw new Error("Resume validation result does not belong to the provided draft.");
      }
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;
      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error("Tailored asset job does not match the provided draft.");
      }

      const nextResumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      const nextResumeExportArtifacts = upsertById(
        state.resumeExportArtifacts,
        normalizedArtifact,
      ).map((entry) =>
        entry.jobId === normalizedArtifact.jobId && entry.id !== normalizedArtifact.id
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
      state.resumeDrafts = upsertById(state.resumeDrafts, normalizedDraft);
      state.resumeExportArtifacts = clearApprovedResumeExportsForJob(
        state.resumeExportArtifacts,
        normalizedDraft.jobId,
      );
      if (tailoredAsset) {
        const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
        if (normalizedAsset.jobId !== normalizedDraft.jobId) {
          throw new Error("Tailored asset job does not match the provided draft.");
        }
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
