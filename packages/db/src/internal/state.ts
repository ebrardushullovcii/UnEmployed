import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  TailoredAssetSchema,
  type JobFinderRepositoryState,
} from "@unemployed/contracts";
import type { DatabaseSync } from "node:sqlite";

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
  application_attempts: "application_attempts",
  application_records: "application_records",
  saved_jobs: "saved_jobs",
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
  const discovery =
    getSingletonValue(database, "discovery_state", {
      parse: normalizeLegacyDiscoveryState,
    }) ?? fallbackSeed.discovery;

  return JobFinderRepositoryStateSchema.parse({
    profile,
    searchPreferences,
    savedJobs: listValues(database, "saved_jobs", SavedJobSchema),
    tailoredAssets: listValues(database, "tailored_assets", TailoredAssetSchema),
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
