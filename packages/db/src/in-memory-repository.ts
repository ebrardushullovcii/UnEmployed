import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
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
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
} from "@unemployed/contracts";

import { cloneValue } from "./internal/state";
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
      state.resumeImportDocumentBundles = normalizedSeed.resumeImportDocumentBundles;
      state.resumeImportFieldCandidates = normalizedSeed.resumeImportFieldCandidates;
      state.resumeResearchArtifacts = normalizedSeed.resumeResearchArtifacts;
      state.resumeValidationResults = normalizedSeed.resumeValidationResults;
      state.resumeAssistantMessages = normalizedSeed.resumeAssistantMessages;
      state.profileCopilotMessages = normalizedSeed.profileCopilotMessages;
      state.profileRevisions = normalizedSeed.profileRevisions;
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
      const normalizedCandidates = ResumeImportFieldCandidateSchema.array().parse(
        cloneValue([...fieldCandidates]),
      );

      for (const bundle of normalizedBundles) {
        if (bundle.runId !== normalizedRun.id) {
          throw new Error("Resume document bundle does not belong to the provided import run.");
        }
      }

      for (const candidate of normalizedCandidates) {
        if (candidate.runId !== normalizedRun.id) {
          throw new Error("Resume import candidate does not belong to the provided import run.");
        }
      }

      state.resumeImportRuns = upsertById(state.resumeImportRuns, normalizedRun);
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
    listProfileCopilotMessages() {
      return Promise.resolve(sortMessages(cloneValue(state.profileCopilotMessages)));
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
      return Promise.resolve(sortNewestFirst(cloneValue(state.profileRevisions)));
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
      const normalizedAsset = tailoredAsset
        ? TailoredAssetSchema.parse(cloneValue(tailoredAsset))
        : null;
      if (normalizedAsset && normalizedAsset.jobId !== normalizedDraft.jobId) {
        throw new Error("Tailored asset job does not match the provided draft.");
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
