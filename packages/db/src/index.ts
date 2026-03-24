import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplicationAttempt,
  type ApplicationRecord,
  type CandidateProfile,
  type JobFinderRepositoryState,
  type JobFinderSettings,
  type JobSearchPreferences,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import { chmod, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

type StateTableKey = 'profile' | 'search_preferences' | 'settings'

const stateTableNames = {
  application_attempts: 'application_attempts',
  application_records: 'application_records',
  saved_jobs: 'saved_jobs',
  singleton_state: 'singleton_state',
  tailored_assets: 'tailored_assets'
} as const

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

function parseJsonValue<TValue>(rawValue: string, schema: { parse: (value: unknown) => TValue }): TValue {
  return schema.parse(JSON.parse(rawValue) as unknown)
}

function tryParseJsonValue<TValue>(
  rawValue: string,
  schema: { parse: (value: unknown) => TValue }
): TValue | null {
  try {
    return parseJsonValue(rawValue, schema)
  } catch {
    return null
  }
}

function secureDatabaseFile(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return Promise.resolve()
  }

  const relatedFiles = [filePath, `${filePath}-wal`, `${filePath}-shm`]

  return Promise.all(
    relatedFiles.map(async (candidate) => {
      try {
        await chmod(candidate, 0o600)
      } catch {
        // Ignore permission updates for files that do not exist yet.
      }
    })
  ).then(() => undefined)
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
  `)

  const versionRow = database
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
    .get() as { version?: number } | undefined
  const currentVersion = Number(versionRow?.version ?? 0)

  if (currentVersion >= 1) {
    return
  }

  database.exec('BEGIN IMMEDIATE')

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
    `)

    database
      .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
      .run(1, 'job_finder_baseline')

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export type JobFinderRepositorySeed = JobFinderRepositoryState

export interface JobFinderRepository {
  close(): Promise<void>
  reset(seed: JobFinderRepositorySeed): Promise<void>
  getProfile(): Promise<CandidateProfile>
  saveProfile(profile: CandidateProfile): Promise<void>
  getSearchPreferences(): Promise<JobSearchPreferences>
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<void>
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences
  ): Promise<void>
  listSavedJobs(): Promise<readonly SavedJob[]>
  replaceSavedJobs(savedJobs: readonly SavedJob[]): Promise<void>
  listTailoredAssets(): Promise<readonly TailoredAsset[]>
  upsertTailoredAsset(tailoredAsset: TailoredAsset): Promise<void>
  listApplicationRecords(): Promise<readonly ApplicationRecord[]>
  upsertApplicationRecord(applicationRecord: ApplicationRecord): Promise<void>
  listApplicationAttempts(): Promise<readonly ApplicationAttempt[]>
  upsertApplicationAttempt(applicationAttempt: ApplicationAttempt): Promise<void>
  getSettings(): Promise<JobFinderSettings>
  saveSettings(settings: JobFinderSettings): Promise<void>
}

interface FileJobFinderRepositoryOptions {
  filePath: string
  seed: JobFinderRepositorySeed
}

function getLegacyJsonPath(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, '.json')
}

function migrateWorkModeToArray(data: Record<string, unknown>): Record<string, unknown> {
  const migrateValue = (value: unknown) => {
    if (typeof value === 'string') {
      return value ? [value] : []
    }

    if (value === null) {
      return []
    }

    return value
  }

  const migrateCollection = (entries: unknown, key: 'workMode') => {
    if (!Array.isArray(entries)) {
      return entries
    }

    return entries.map((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) {
        return entry
      }

      const record = entry as Record<string, unknown>
      return {
        ...record,
        [key]: migrateValue(record[key])
      }
    })
  }

  const nextData = { ...data }

  if (data.profile && typeof data.profile === 'object') {
    const profile = data.profile as Record<string, unknown>

    nextData.profile = {
      ...profile,
      experiences: migrateCollection(profile.experiences, 'workMode')
    }
  }

  if (Array.isArray(data.savedJobs)) {
    nextData.savedJobs = migrateCollection(data.savedJobs, 'workMode')
  }

  return nextData
}

async function readLegacySeed(
  filePath: string,
  seed: JobFinderRepositorySeed
): Promise<JobFinderRepositorySeed | null> {
  const legacyPath = getLegacyJsonPath(filePath)

  if (legacyPath === filePath) {
    return null
  }

  try {
    const raw = await readFile(legacyPath, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const migratedData = migrateWorkModeToArray(parsed)
    const profile = CandidateProfileSchema.safeParse(migratedData.profile)
    const searchPreferences = JobSearchPreferencesSchema.safeParse(migratedData.searchPreferences)
    const settings = JobFinderSettingsSchema.safeParse(migratedData.settings)
    const savedJobs = SavedJobSchema.array().safeParse(migratedData.savedJobs)
    const tailoredAssets = TailoredAssetSchema.array().safeParse(migratedData.tailoredAssets)
    const applicationRecords = ApplicationRecordSchema.array().safeParse(migratedData.applicationRecords)
    const applicationAttempts = ApplicationAttemptSchema.array().safeParse(migratedData.applicationAttempts ?? [])

    return JobFinderRepositoryStateSchema.parse({
      profile: profile.success ? profile.data : cloneValue(seed.profile),
      searchPreferences: searchPreferences.success
        ? searchPreferences.data
        : cloneValue(seed.searchPreferences),
      savedJobs: savedJobs.success ? savedJobs.data : cloneValue(seed.savedJobs),
      tailoredAssets: tailoredAssets.success ? tailoredAssets.data : cloneValue(seed.tailoredAssets),
      applicationRecords: applicationRecords.success
        ? applicationRecords.data
        : cloneValue(seed.applicationRecords),
      applicationAttempts: applicationAttempts.success
        ? applicationAttempts.data
        : cloneValue(seed.applicationAttempts),
      settings: settings.success ? settings.data : cloneValue(seed.settings)
    })
  } catch (error) {
    const errorCode = error instanceof Error && 'code' in error ? error.code : null

    if (errorCode === 'ENOENT') {
      return null
    }

    throw error
  }
}

function listValues<TValue>(
  database: DatabaseSync,
  tableName: keyof typeof stateTableNames,
  schema: { parse: (value: unknown) => TValue }
): TValue[] {
  return database
    .prepare(`SELECT value FROM ${stateTableNames[tableName]} ORDER BY id`)
    .all()
    .flatMap((row) => {
      const parsedValue = tryParseJsonValue(String(row.value), schema)
      return parsedValue ? [parsedValue] : []
    })
}

function getSingletonValue<TValue>(
  database: DatabaseSync,
  key: StateTableKey,
  schema: { parse: (value: unknown) => TValue }
): TValue | null {
  const row = database
    .prepare(`SELECT value FROM ${stateTableNames.singleton_state} WHERE key = ?`)
    .get(key)

  if (!row) {
    return null
  }

  return tryParseJsonValue(String(row.value), schema)
}

function saveSingletonValue(database: DatabaseSync, key: StateTableKey, value: unknown): void {
  database
    .prepare(`INSERT OR REPLACE INTO ${stateTableNames.singleton_state} (key, value) VALUES (?, ?)`)
    .run(key, JSON.stringify(value))
}

function replaceCollection(database: DatabaseSync, tableName: keyof typeof stateTableNames, values: readonly { id: string }[]): void {
  database.exec(`DELETE FROM ${stateTableNames[tableName]}`)
  const statement = database.prepare(
    `INSERT OR REPLACE INTO ${stateTableNames[tableName]} (id, value) VALUES (?, ?)`
  )

  for (const value of values) {
    statement.run(value.id, JSON.stringify(value))
  }
}

function upsertCollectionValue(database: DatabaseSync, tableName: keyof typeof stateTableNames, value: { id: string }): void {
  database
    .prepare(`INSERT OR REPLACE INTO ${stateTableNames[tableName]} (id, value) VALUES (?, ?)`)
    .run(value.id, JSON.stringify(value))
}

function writeState(database: DatabaseSync, state: JobFinderRepositoryState): void {
  database.exec('BEGIN IMMEDIATE')

  try {
    saveSingletonValue(database, 'profile', state.profile)
    saveSingletonValue(database, 'search_preferences', state.searchPreferences)
    saveSingletonValue(database, 'settings', state.settings)
    replaceCollection(database, 'saved_jobs', state.savedJobs)
    replaceCollection(database, 'tailored_assets', state.tailoredAssets)
    replaceCollection(database, 'application_records', state.applicationRecords)
    replaceCollection(database, 'application_attempts', state.applicationAttempts)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function bootstrapState(database: DatabaseSync, seed: JobFinderRepositorySeed): void {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(seed))
  writeState(database, normalizedSeed)
}

function hasPersistedState(database: DatabaseSync): boolean {
  const singletonCountRow = database.prepare(`SELECT COUNT(*) AS count FROM ${stateTableNames.singleton_state}`).get() as
    | { count?: number }
    | undefined
  const singletonCount = Number(singletonCountRow?.count ?? 0)
  const jobCountRow = database.prepare(`SELECT COUNT(*) AS count FROM ${stateTableNames.saved_jobs}`).get() as
    | { count?: number }
    | undefined
  const jobCount = Number(jobCountRow?.count ?? 0)

  return singletonCount > 0 || jobCount > 0
}

function readState(database: DatabaseSync, fallbackSeed: JobFinderRepositorySeed): JobFinderRepositoryState {
  const profile = getSingletonValue(database, 'profile', CandidateProfileSchema) ?? fallbackSeed.profile
  const searchPreferences =
    getSingletonValue(database, 'search_preferences', JobSearchPreferencesSchema) ??
    fallbackSeed.searchPreferences
  const settings = getSingletonValue(database, 'settings', JobFinderSettingsSchema) ?? fallbackSeed.settings

  return JobFinderRepositoryStateSchema.parse({
    profile,
    searchPreferences,
    savedJobs: listValues(database, 'saved_jobs', SavedJobSchema),
    tailoredAssets: listValues(database, 'tailored_assets', TailoredAssetSchema),
    applicationRecords: listValues(database, 'application_records', ApplicationRecordSchema),
    applicationAttempts: listValues(database, 'application_attempts', ApplicationAttemptSchema),
    settings
  })
}

export function createInMemoryJobFinderRepository(seed: JobFinderRepositorySeed): JobFinderRepository {
  const state: JobFinderRepositoryState = JobFinderRepositoryStateSchema.parse(cloneValue(seed))

  return {
    close() {
      return Promise.resolve()
    },
    reset(nextSeed) {
      const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed))

      state.profile = normalizedSeed.profile
      state.searchPreferences = normalizedSeed.searchPreferences
      state.savedJobs = normalizedSeed.savedJobs
      state.tailoredAssets = normalizedSeed.tailoredAssets
      state.applicationRecords = normalizedSeed.applicationRecords
      state.applicationAttempts = normalizedSeed.applicationAttempts
      state.settings = normalizedSeed.settings

      return Promise.resolve()
    },
    getProfile() {
      return Promise.resolve(cloneValue(state.profile))
    },
    saveProfile(profile) {
      state.profile = CandidateProfileSchema.parse(cloneValue(profile))
      return Promise.resolve()
    },
    getSearchPreferences() {
      return Promise.resolve(cloneValue(state.searchPreferences))
    },
    saveSearchPreferences(searchPreferences) {
      state.searchPreferences = JobSearchPreferencesSchema.parse(cloneValue(searchPreferences))
      return Promise.resolve()
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      state.profile = CandidateProfileSchema.parse(cloneValue(profile))
      state.searchPreferences = JobSearchPreferencesSchema.parse(cloneValue(searchPreferences))
      return Promise.resolve()
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(state.savedJobs))
    },
    replaceSavedJobs(savedJobs) {
      state.savedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]))
      return Promise.resolve()
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets))
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset))
      const nextAssets = [...state.tailoredAssets]
      const existingIndex = nextAssets.findIndex((asset) => asset.id === normalizedAsset.id)

      if (existingIndex >= 0) {
        nextAssets[existingIndex] = normalizedAsset
      } else {
        nextAssets.push(normalizedAsset)
      }

      state.tailoredAssets = nextAssets
      return Promise.resolve()
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(state.applicationRecords))
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(cloneValue(applicationRecord))
      const nextRecords = [...state.applicationRecords]
      const existingIndex = nextRecords.findIndex((record) => record.id === normalizedRecord.id)

      if (existingIndex >= 0) {
        nextRecords[existingIndex] = normalizedRecord
      } else {
        nextRecords.push(normalizedRecord)
      }

      state.applicationRecords = nextRecords
      return Promise.resolve()
    },
    listApplicationAttempts() {
      return Promise.resolve(cloneValue(state.applicationAttempts))
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(cloneValue(applicationAttempt))
      const nextAttempts = [...state.applicationAttempts]
      const existingIndex = nextAttempts.findIndex((attempt) => attempt.id === normalizedAttempt.id)

      if (existingIndex >= 0) {
        nextAttempts[existingIndex] = normalizedAttempt
      } else {
        nextAttempts.push(normalizedAttempt)
      }

      state.applicationAttempts = nextAttempts
      return Promise.resolve()
    },
    getSettings() {
      return Promise.resolve(cloneValue(state.settings))
    },
    saveSettings(settings) {
      state.settings = JobFinderSettingsSchema.parse(cloneValue(settings))
      return Promise.resolve()
    }
  }
}

export async function createFileJobFinderRepository(
  options: FileJobFinderRepositoryOptions
): Promise<JobFinderRepository> {
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(options.seed))
  const database = new DatabaseSync(options.filePath)

  runMigrations(database)

  if (!hasPersistedState(database)) {
    const legacySeed = await readLegacySeed(options.filePath, normalizedSeed)
    bootstrapState(database, legacySeed ?? normalizedSeed)
    await secureDatabaseFile(options.filePath)
  }

  function persist(mutator: (state: JobFinderRepositoryState) => void): Promise<void> {
    const state = readState(database, normalizedSeed)
    mutator(state)
    writeState(database, state)
    return secureDatabaseFile(options.filePath)
  }

  return {
    close() {
      database.close()
      return Promise.resolve()
    },
    reset(nextSeed) {
      const nextState = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed))
      writeState(database, nextState)
      return secureDatabaseFile(options.filePath)
    },
    getProfile() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).profile))
    },
    saveProfile(profile) {
      return persist((state) => {
        state.profile = CandidateProfileSchema.parse(cloneValue(profile))
      })
    },
    getSearchPreferences() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).searchPreferences))
    },
    saveSearchPreferences(searchPreferences) {
      return persist((state) => {
        state.searchPreferences = JobSearchPreferencesSchema.parse(cloneValue(searchPreferences))
      })
    },
    saveProfileAndSearchPreferences(profile, searchPreferences) {
      const normalizedProfile = CandidateProfileSchema.parse(cloneValue(profile))
      const normalizedSearchPreferences = JobSearchPreferencesSchema.parse(cloneValue(searchPreferences))

      return persist((state) => {
        state.profile = normalizedProfile
        state.searchPreferences = normalizedSearchPreferences
      })
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).savedJobs))
    },
    replaceSavedJobs(savedJobs) {
      const normalizedJobs = SavedJobSchema.array().parse(cloneValue([...savedJobs]))
      return persist((state) => {
        state.savedJobs = normalizedJobs
      })
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).tailoredAssets))
    },
    upsertTailoredAsset(tailoredAsset) {
      const normalizedAsset = TailoredAssetSchema.parse(cloneValue(tailoredAsset))
      database.exec('BEGIN IMMEDIATE')

      try {
        upsertCollectionValue(database, 'tailored_assets', normalizedAsset)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }

      return secureDatabaseFile(options.filePath)
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).applicationRecords))
    },
    upsertApplicationRecord(applicationRecord) {
      const normalizedRecord = ApplicationRecordSchema.parse(cloneValue(applicationRecord))
      database.exec('BEGIN IMMEDIATE')

      try {
        upsertCollectionValue(database, 'application_records', normalizedRecord)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }

      return secureDatabaseFile(options.filePath)
    },
    listApplicationAttempts() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).applicationAttempts))
    },
    upsertApplicationAttempt(applicationAttempt) {
      const normalizedAttempt = ApplicationAttemptSchema.parse(cloneValue(applicationAttempt))
      database.exec('BEGIN IMMEDIATE')

      try {
        upsertCollectionValue(database, 'application_attempts', normalizedAttempt)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }

      return secureDatabaseFile(options.filePath)
    },
    getSettings() {
      return Promise.resolve(cloneValue(readState(database, normalizedSeed).settings))
    },
    saveSettings(settings) {
      return persist((state) => {
        state.settings = JobFinderSettingsSchema.parse(cloneValue(settings))
      })
    }
  }
}
