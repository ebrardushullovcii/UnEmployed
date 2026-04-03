import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderDiscoveryStateSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
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
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets));
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
      state.tailoredAssets = upsertById(state.tailoredAssets, normalizedAsset);
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
