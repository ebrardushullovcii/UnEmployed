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
  type JobFinderRepositoryState,
} from "@unemployed/contracts";
import { DatabaseSync } from "node:sqlite";

import { secureDatabaseFile, runMigrations } from "./internal/migrations";
import { readLegacySeed } from "./internal/legacy";
import {
  bootstrapState,
  cloneValue,
  hasPersistedState,
  readState,
  replaceCollection,
  saveSingletonValue,
  upsertCollectionValue,
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
      | "application_records"
      | "application_attempts"
      | "source_debug_runs"
      | "source_debug_attempts"
      | "source_instruction_artifacts"
      | "source_debug_evidence_refs",
    value: { id: string },
  ): Promise<void> {
    runImmediateTransaction(database, () => {
      upsertCollectionValue(database, tableName, value);
    });

    return secureDatabaseFile(options.filePath);
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
    listTailoredAssets() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).tailoredAssets),
      );
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset));
      return upsertPersistedValue("tailored_assets", normalizedAsset);
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
