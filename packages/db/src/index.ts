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
  type ApplicationAttempt,
  type ApplicationRecord,
  type CandidateProfile,
  type JobFinderDiscoveryState,
  type JobFinderRepositoryState,
  type JobFinderSettings,
  type JobSearchPreferences,
  type SavedJob,
  type SourceDebugEvidenceRef,
  type SourceDebugRunRecord,
  type SourceDebugWorkerAttempt,
  type SourceInstructionArtifact,
  type TailoredAsset,
} from "@unemployed/contracts";
import { chmod, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

type StateTableKey =
  | "profile"
  | "search_preferences"
  | "settings"
  | "discovery_state";

const stateTableNames = {
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

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function parseJsonValue<TValue>(
  rawValue: string,
  schema: { parse: (value: unknown) => TValue },
): TValue {
  return schema.parse(JSON.parse(rawValue) as unknown);
}

function tryParseJsonValue<TValue>(
  rawValue: string,
  schema: { parse: (value: unknown) => TValue },
): TValue | null {
  try {
    return parseJsonValue(rawValue, schema);
  } catch {
    return null;
  }
}

function normalizeLegacySourceDebugRunRecord(
  value: unknown,
): SourceDebugRunRecord {
  const parsedValue =
    value && typeof value === "object"
      ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
      : value;

  if (
    parsedValue &&
    typeof parsedValue === "object" &&
    "state" in parsedValue &&
    "activePhase" in parsedValue
  ) {
    const state = parsedValue.state;
    const isTerminalState =
      state === "completed" ||
      state === "cancelled" ||
      state === "failed" ||
      state === "interrupted";

    if (isTerminalState) {
      parsedValue.activePhase = null;
    }
  }

  return SourceDebugRunRecordSchema.parse(parsedValue);
}

function normalizeLegacyDiscoveryState(
  value: unknown,
): JobFinderDiscoveryState {
  const parsedValue =
    value && typeof value === "object"
      ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const activeSourceDebugRun =
    parsedValue.activeSourceDebugRun == null
      ? null
      : normalizeLegacySourceDebugRunRecord(parsedValue.activeSourceDebugRun);
  const recentSourceDebugRuns = Array.isArray(parsedValue.recentSourceDebugRuns)
    ? parsedValue.recentSourceDebugRuns.flatMap((run) => {
        try {
          return [normalizeLegacySourceDebugRunRecord(run)];
        } catch {
          return [];
        }
      })
    : [];

  return JobFinderDiscoveryStateSchema.parse({
    ...parsedValue,
    activeSourceDebugRun,
    recentSourceDebugRuns,
  });
}

function secureDatabaseFile(filePath: string): Promise<void> {
  if (process.platform === "win32") {
    return Promise.resolve();
  }

  const relatedFiles = [filePath, `${filePath}-wal`, `${filePath}-shm`];

  return Promise.all(
    relatedFiles.map(async (candidate) => {
      try {
        await chmod(candidate, 0o600);
      } catch {
        // Ignore permission updates for files that do not exist yet.
      }
    }),
  ).then(() => undefined);
}

function runMigrations(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const versionRow = database
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    )
    .get() as { version?: number } | undefined;
  const currentVersion = Number(versionRow?.version ?? 0);

  if (currentVersion >= 2) {
    return;
  }

  database.exec("BEGIN IMMEDIATE");

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS singleton_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_jobs (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tailored_assets (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_records (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_attempts (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    if (currentVersion < 1) {
      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(1, "job_finder_baseline");
    }

    if (currentVersion < 2) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS source_debug_runs (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_debug_attempts (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_instruction_artifacts (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_debug_evidence_refs (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      database
        .prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
        .run(2, "job_finder_source_debug_artifacts");
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export type JobFinderRepositorySeed = JobFinderRepositoryState;

export interface JobFinderRepository {
  close(): Promise<void>;
  reset(seed: JobFinderRepositorySeed): Promise<void>;
  getProfile(): Promise<CandidateProfile>;
  saveProfile(profile: CandidateProfile): Promise<void>;
  getSearchPreferences(): Promise<JobSearchPreferences>;
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<void>;
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ): Promise<void>;
  listSavedJobs(): Promise<readonly SavedJob[]>;
  replaceSavedJobs(savedJobs: readonly SavedJob[]): Promise<void>;
  listTailoredAssets(): Promise<readonly TailoredAsset[]>;
  upsertTailoredAsset(tailoredAsset: TailoredAsset): Promise<void>;
  listApplicationRecords(): Promise<readonly ApplicationRecord[]>;
  upsertApplicationRecord(applicationRecord: ApplicationRecord): Promise<void>;
  listApplicationAttempts(): Promise<readonly ApplicationAttempt[]>;
  upsertApplicationAttempt(
    applicationAttempt: ApplicationAttempt,
  ): Promise<void>;
  listSourceDebugRuns(): Promise<readonly SourceDebugRunRecord[]>;
  upsertSourceDebugRun(run: SourceDebugRunRecord): Promise<void>;
  listSourceDebugAttempts(): Promise<readonly SourceDebugWorkerAttempt[]>;
  upsertSourceDebugAttempt(attempt: SourceDebugWorkerAttempt): Promise<void>;
  listSourceInstructionArtifacts(): Promise<
    readonly SourceInstructionArtifact[]
  >;
  upsertSourceInstructionArtifact(
    artifact: SourceInstructionArtifact,
  ): Promise<void>;
  deleteSourceInstructionArtifactsForTarget(targetId: string): Promise<void>;
  listSourceDebugEvidenceRefs(): Promise<readonly SourceDebugEvidenceRef[]>;
  upsertSourceDebugEvidenceRef(
    evidenceRef: SourceDebugEvidenceRef,
  ): Promise<void>;
  getSettings(): Promise<JobFinderSettings>;
  saveSettings(settings: JobFinderSettings): Promise<void>;
  getDiscoveryState(): Promise<JobFinderDiscoveryState>;
  saveDiscoveryState(discoveryState: JobFinderDiscoveryState): Promise<void>;
}

interface FileJobFinderRepositoryOptions {
  filePath: string;
  seed: JobFinderRepositorySeed;
}

function getLegacyJsonPath(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, ".json");
}

function migrateWorkModeToArray(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const migrateValue = (value: unknown) => {
    if (typeof value === "string") {
      return value ? [value] : [];
    }

    if (value === null) {
      return [];
    }

    return value;
  };

  const migrateCollection = (entries: unknown, key: "workMode") => {
    if (!Array.isArray(entries)) {
      return entries;
    }

    return entries.map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return entry;
      }

      const record = entry as Record<string, unknown>;
      return {
        ...record,
        [key]: migrateValue(record[key]),
      };
    });
  };

  const nextData = { ...data };

  if (data.profile && typeof data.profile === "object") {
    const profile = data.profile as Record<string, unknown>;

    nextData.profile = {
      ...profile,
      experiences: migrateCollection(profile.experiences, "workMode"),
    };
  }

  if (Array.isArray(data.savedJobs)) {
    nextData.savedJobs = migrateCollection(data.savedJobs, "workMode");
  }

  return nextData;
}

function migrateLegacySourceIdentifiers(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const normalizeSource = (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "generic_site" || normalized === "linkedin") {
      return "target_site";
    }

    return value;
  };

  const normalizeAdapterKind = (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (
      normalized === "linkedin" ||
      normalized === "generic_site" ||
      normalized === "target_site"
    ) {
      return "auto";
    }

    return value;
  };

  const migrateRecordArray = (
    entries: unknown,
    migrateRecord: (record: Record<string, unknown>) => Record<string, unknown>,
  ): unknown => {
    if (!Array.isArray(entries)) {
      return entries;
    }

    return entries.map((entry): unknown => {
      if (typeof entry !== "object" || entry === null) {
        return entry;
      }

      return migrateRecord(entry as Record<string, unknown>);
    });
  };

  const nextData = { ...data };

  if (data.searchPreferences && typeof data.searchPreferences === "object") {
    const searchPreferences = data.searchPreferences as Record<string, unknown>;
    const discovery =
      searchPreferences.discovery && typeof searchPreferences.discovery === "object"
        ? (searchPreferences.discovery as Record<string, unknown>)
        : null;

    nextData.searchPreferences = {
      ...searchPreferences,
      ...(discovery
        ? {
            discovery: {
              ...discovery,
              targets: migrateRecordArray(discovery.targets, (record) => ({
                ...record,
                adapterKind: normalizeAdapterKind(record.adapterKind),
              })),
            },
          }
        : {}),
    };
  }

  if (Array.isArray(data.savedJobs)) {
    nextData.savedJobs = migrateRecordArray(data.savedJobs, (record) => ({
      ...record,
      source: normalizeSource(record.source),
      provenance: migrateRecordArray(record.provenance, (provenanceRecord) => ({
        ...provenanceRecord,
        adapterKind: normalizeAdapterKind(provenanceRecord.adapterKind),
        resolvedAdapterKind: normalizeSource(
          provenanceRecord.resolvedAdapterKind,
        ),
      })),
    }));
  }

  const legacyDiscovery =
    data.discovery && typeof data.discovery === "object"
      ? (data.discovery as Record<string, unknown>)
      : null;

  if (legacyDiscovery) {
    nextData.discovery = {
      ...legacyDiscovery,
      sessions: migrateRecordArray(legacyDiscovery.sessions, (record) => ({
        ...record,
        adapterKind: normalizeSource(record.adapterKind),
      })),
    };
  }

  return nextData;
}

async function readLegacySeed(
  filePath: string,
  seed: JobFinderRepositorySeed,
): Promise<JobFinderRepositorySeed | null> {
  const legacyPath = getLegacyJsonPath(filePath);

  if (legacyPath === filePath) {
    return null;
  }

  try {
    const raw = await readFile(legacyPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const migratedData = migrateLegacySourceIdentifiers(
      migrateWorkModeToArray(parsed),
    );
    const profile = CandidateProfileSchema.safeParse(migratedData.profile);
    const searchPreferences = JobSearchPreferencesSchema.safeParse(
      migratedData.searchPreferences,
    );
    const settings = JobFinderSettingsSchema.safeParse(migratedData.settings);
    const discovery = (() => {
      try {
        return {
          success: true as const,
          data: normalizeLegacyDiscoveryState(migratedData.discovery),
        };
      } catch {
        return { success: false as const, data: null };
      }
    })();
    const savedJobs = SavedJobSchema.array().safeParse(migratedData.savedJobs);
    const tailoredAssets = TailoredAssetSchema.array().safeParse(
      migratedData.tailoredAssets,
    );
    const applicationRecords = ApplicationRecordSchema.array().safeParse(
      migratedData.applicationRecords,
    );
    const applicationAttempts = ApplicationAttemptSchema.array().safeParse(
      migratedData.applicationAttempts ?? [],
    );
    const sourceDebugAttempts = SourceDebugWorkerAttemptSchema.array().safeParse(
      migratedData.sourceDebugAttempts ?? [],
    );
    const sourceInstructionArtifacts =
      SourceInstructionArtifactSchema.array().safeParse(
        migratedData.sourceInstructionArtifacts ?? [],
      );
    const sourceDebugEvidenceRefs = SourceDebugEvidenceRefSchema.array().safeParse(
      migratedData.sourceDebugEvidenceRefs ?? [],
    );
    const sourceDebugRuns = Array.isArray(migratedData.sourceDebugRuns)
      ? migratedData.sourceDebugRuns.flatMap((run) => {
          try {
            return [normalizeLegacySourceDebugRunRecord(run)];
          } catch {
            return [];
          }
        })
      : cloneValue(seed.sourceDebugRuns);

    return JobFinderRepositoryStateSchema.parse({
      profile: profile.success ? profile.data : cloneValue(seed.profile),
      searchPreferences: searchPreferences.success
        ? searchPreferences.data
        : cloneValue(seed.searchPreferences),
      savedJobs: savedJobs.success
        ? savedJobs.data
        : cloneValue(seed.savedJobs),
      tailoredAssets: tailoredAssets.success
        ? tailoredAssets.data
        : cloneValue(seed.tailoredAssets),
      applicationRecords: applicationRecords.success
        ? applicationRecords.data
        : cloneValue(seed.applicationRecords),
      applicationAttempts: applicationAttempts.success
        ? applicationAttempts.data
        : cloneValue(seed.applicationAttempts),
      sourceDebugRuns,
      sourceDebugAttempts: sourceDebugAttempts.success
        ? sourceDebugAttempts.data
        : cloneValue(seed.sourceDebugAttempts),
      sourceInstructionArtifacts: sourceInstructionArtifacts.success
        ? sourceInstructionArtifacts.data
        : cloneValue(seed.sourceInstructionArtifacts),
      sourceDebugEvidenceRefs: sourceDebugEvidenceRefs.success
        ? sourceDebugEvidenceRefs.data
        : cloneValue(seed.sourceDebugEvidenceRefs),
      settings: settings.success ? settings.data : cloneValue(seed.settings),
      discovery: discovery.success
        ? discovery.data
        : cloneValue(seed.discovery),
    });
  } catch (error) {
    const errorCode =
      error instanceof Error && "code" in error ? error.code : null;

    if (errorCode === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function listValues<TValue>(
  database: DatabaseSync,
  tableName: keyof typeof stateTableNames,
  schema: { parse: (value: unknown) => TValue },
): TValue[] {
  return database
    .prepare(`SELECT value FROM ${stateTableNames[tableName]} ORDER BY id`)
    .all()
    .flatMap((row) => {
      const parsedValue = tryParseJsonValue(String(row.value), schema);
      return parsedValue ? [parsedValue] : [];
    });
}

function getSingletonValue<TValue>(
  database: DatabaseSync,
  key: StateTableKey,
  schema: { parse: (value: unknown) => TValue },
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

function saveSingletonValue(
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

function replaceCollection(
  database: DatabaseSync,
  tableName: keyof typeof stateTableNames,
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

function upsertCollectionValue(
  database: DatabaseSync,
  tableName: keyof typeof stateTableNames,
  value: { id: string },
): void {
  database
    .prepare(
      `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (id, value) VALUES (?, ?)`,
    )
    .run(value.id, JSON.stringify(value));
}

function writeState(
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
    replaceCollection(
      database,
      "application_records",
      state.applicationRecords,
    );
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

function bootstrapState(
  database: DatabaseSync,
  seed: JobFinderRepositorySeed,
): void {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(seed));
  writeState(database, normalizedSeed);
}

function hasPersistedState(database: DatabaseSync): boolean {
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

function readState(
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
    getSingletonValue(
      database,
      "discovery_state",
      { parse: normalizeLegacyDiscoveryState },
    ) ?? fallbackSeed.discovery;

  return JobFinderRepositoryStateSchema.parse({
    profile,
    searchPreferences,
    savedJobs: listValues(database, "saved_jobs", SavedJobSchema),
    tailoredAssets: listValues(
      database,
      "tailored_assets",
      TailoredAssetSchema,
    ),
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
    sourceDebugRuns: listValues(
      database,
      "source_debug_runs",
      { parse: normalizeLegacySourceDebugRunRecord },
    ),
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

export function createInMemoryJobFinderRepository(
  seed: JobFinderRepositorySeed,
): JobFinderRepository {
  const state: JobFinderRepositoryState = JobFinderRepositoryStateSchema.parse(
    cloneValue(seed),
  );

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
      state.sourceInstructionArtifacts =
        normalizedSeed.sourceInstructionArtifacts;
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
      state.savedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
      return Promise.resolve();
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets));
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(
        cloneValue(tailoredAsset),
      );
      const nextAssets = [...state.tailoredAssets];
      const existingIndex = nextAssets.findIndex(
        (asset) => asset.id === normalizedAsset.id,
      );

      if (existingIndex >= 0) {
        nextAssets[existingIndex] = normalizedAsset;
      } else {
        nextAssets.push(normalizedAsset);
      }

      state.tailoredAssets = nextAssets;
      return Promise.resolve();
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(state.applicationRecords));
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(
        cloneValue(applicationRecord),
      );
      const nextRecords = [...state.applicationRecords];
      const existingIndex = nextRecords.findIndex(
        (record) => record.id === normalizedRecord.id,
      );

      if (existingIndex >= 0) {
        nextRecords[existingIndex] = normalizedRecord;
      } else {
        nextRecords.push(normalizedRecord);
      }

      state.applicationRecords = nextRecords;
      return Promise.resolve();
    },
    listApplicationAttempts() {
      return Promise.resolve(cloneValue(state.applicationAttempts));
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(
        cloneValue(applicationAttempt),
      );
      const nextAttempts = [...state.applicationAttempts];
      const existingIndex = nextAttempts.findIndex(
        (attempt) => attempt.id === normalizedAttempt.id,
      );

      if (existingIndex >= 0) {
        nextAttempts[existingIndex] = normalizedAttempt;
      } else {
        nextAttempts.push(normalizedAttempt);
      }

      state.applicationAttempts = nextAttempts;
      return Promise.resolve();
    },
    listSourceDebugRuns() {
      return Promise.resolve(cloneValue(state.sourceDebugRuns));
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run));
      const nextRuns = [...state.sourceDebugRuns];
      const existingIndex = nextRuns.findIndex(
        (entry) => entry.id === normalizedRun.id,
      );

      if (existingIndex >= 0) {
        nextRuns[existingIndex] = normalizedRun;
      } else {
        nextRuns.push(normalizedRun);
      }

      state.sourceDebugRuns = nextRuns;
      return Promise.resolve();
    },
    listSourceDebugAttempts() {
      return Promise.resolve(cloneValue(state.sourceDebugAttempts));
    },
    upsertSourceDebugAttempt(attempt) {
      const normalizedAttempt = SourceDebugWorkerAttemptSchema.parse(
        cloneValue(attempt),
      );
      const nextAttempts = [...state.sourceDebugAttempts];
      const existingIndex = nextAttempts.findIndex(
        (entry) => entry.id === normalizedAttempt.id,
      );

      if (existingIndex >= 0) {
        nextAttempts[existingIndex] = normalizedAttempt;
      } else {
        nextAttempts.push(normalizedAttempt);
      }

      state.sourceDebugAttempts = nextAttempts;
      return Promise.resolve();
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(cloneValue(state.sourceInstructionArtifacts));
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(
        cloneValue(artifact),
      );
      const nextArtifacts = [...state.sourceInstructionArtifacts];
      const existingIndex = nextArtifacts.findIndex(
        (entry) => entry.id === normalizedArtifact.id,
      );

      if (existingIndex >= 0) {
        nextArtifacts[existingIndex] = normalizedArtifact;
      } else {
        nextArtifacts.push(normalizedArtifact);
      }

      state.sourceInstructionArtifacts = nextArtifacts;
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
      const nextEvidenceRefs = [...state.sourceDebugEvidenceRefs];
      const existingIndex = nextEvidenceRefs.findIndex(
        (entry) => entry.id === normalizedEvidenceRef.id,
      );

      if (existingIndex >= 0) {
        nextEvidenceRefs[existingIndex] = normalizedEvidenceRef;
      } else {
        nextEvidenceRefs.push(normalizedEvidenceRef);
      }

      state.sourceDebugEvidenceRefs = nextEvidenceRefs;
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
    database.exec("BEGIN IMMEDIATE");

    try {
      const state = readState(database, normalizedSeed);
      mutator(state);
      saveSingletonValue(database, "profile", state.profile);
      saveSingletonValue(
        database,
        "search_preferences",
        state.searchPreferences,
      );
      saveSingletonValue(database, "settings", state.settings);
      saveSingletonValue(database, "discovery_state", state.discovery);
      replaceCollection(database, "saved_jobs", state.savedJobs);
      replaceCollection(database, "tailored_assets", state.tailoredAssets);
      replaceCollection(
        database,
        "application_records",
        state.applicationRecords,
      );
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

    return secureDatabaseFile(options.filePath);
  }

  return {
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
        cloneValue(readState(database, normalizedSeed).profile),
      );
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
      const normalizedProfile = CandidateProfileSchema.parse(
        cloneValue(profile),
      );
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(
        cloneValue(searchPreferences),
      );

      return persist((state) => {
        state.profile = normalizedProfile;
        state.searchPreferences = normalizedSearchPreferences;
      });
    },
    listSavedJobs() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).savedJobs),
      );
    },
    replaceSavedJobs(savedJobs) {
      const normalizedJobs = SavedJobSchema.array().parse(
        cloneValue([...savedJobs]),
      );
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
      const normalizedAsset = TailoredAssetSchema.parse(
        cloneValue(tailoredAsset),
      );
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(database, "tailored_assets", normalizedAsset);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

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
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(
          database,
          "application_records",
          normalizedRecord,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
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
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(
          database,
          "application_attempts",
          normalizedAttempt,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
    },
    listSourceDebugRuns() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).sourceDebugRuns),
      );
    },
    upsertSourceDebugRun(run) {
      const normalizedRun = SourceDebugRunRecordSchema.parse(cloneValue(run));
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(database, "source_debug_runs", normalizedRun);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
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
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(
          database,
          "source_debug_attempts",
          normalizedAttempt,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
    },
    listSourceInstructionArtifacts() {
      return Promise.resolve(
        cloneValue(
          readState(database, normalizedSeed).sourceInstructionArtifacts,
        ),
      );
    },
    upsertSourceInstructionArtifact(artifact) {
      const normalizedArtifact = SourceInstructionArtifactSchema.parse(
        cloneValue(artifact),
      );
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(
          database,
          "source_instruction_artifacts",
          normalizedArtifact,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
    },
    deleteSourceInstructionArtifactsForTarget(targetId) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const nextArtifacts = readState(
          database,
          normalizedSeed,
        ).sourceInstructionArtifacts.filter(
          (artifact) => artifact.targetId !== targetId,
        );
        replaceCollection(
          database,
          "source_instruction_artifacts",
          nextArtifacts,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

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
      database.exec("BEGIN IMMEDIATE");

      try {
        upsertCollectionValue(
          database,
          "source_debug_evidence_refs",
          normalizedEvidenceRef,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }

      return secureDatabaseFile(options.filePath);
    },
    getSettings() {
      return Promise.resolve(
        cloneValue(readState(database, normalizedSeed).settings),
      );
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
