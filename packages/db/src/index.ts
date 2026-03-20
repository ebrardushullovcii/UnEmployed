import type {
  ApplicationRecord,
  CandidateProfile,
  JobFinderRepositoryState,
  JobFinderSettings,
  JobSearchPreferences,
  SavedJob,
  TailoredAsset
} from '@unemployed/contracts'
import { JobFinderRepositoryStateSchema } from '@unemployed/contracts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

export type JobFinderRepositorySeed = JobFinderRepositoryState

export interface JobFinderRepository {
  reset(seed: JobFinderRepositorySeed): Promise<void>
  getProfile(): Promise<CandidateProfile>
  saveProfile(profile: CandidateProfile): Promise<void>
  getSearchPreferences(): Promise<JobSearchPreferences>
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<void>
  listSavedJobs(): Promise<readonly SavedJob[]>
  replaceSavedJobs(savedJobs: readonly SavedJob[]): Promise<void>
  listTailoredAssets(): Promise<readonly TailoredAsset[]>
  upsertTailoredAsset(tailoredAsset: TailoredAsset): Promise<void>
  listApplicationRecords(): Promise<readonly ApplicationRecord[]>
  upsertApplicationRecord(applicationRecord: ApplicationRecord): Promise<void>
  getSettings(): Promise<JobFinderSettings>
  saveSettings(settings: JobFinderSettings): Promise<void>
}

interface FileJobFinderRepositoryOptions {
  filePath: string
  seed: JobFinderRepositorySeed
}

async function writeRepositoryState(
  filePath: string,
  state: JobFinderRepositoryState
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

async function loadRepositoryState(
  options: FileJobFinderRepositoryOptions
): Promise<JobFinderRepositoryState> {
  const { filePath, seed } = options
  const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(seed))

  try {
    const raw = await readFile(filePath, 'utf8')
    return JobFinderRepositoryStateSchema.parse(JSON.parse(raw) as unknown)
  } catch (error) {
    const errorCode = error instanceof Error && 'code' in error ? error.code : null

    if (errorCode === 'ENOENT') {
      await writeRepositoryState(filePath, normalizedSeed)
      return normalizedSeed
    }

    throw error
  }
}

export function createInMemoryJobFinderRepository(
  seed: JobFinderRepositorySeed
): JobFinderRepository {
  const state: JobFinderRepositoryState = JobFinderRepositoryStateSchema.parse(cloneValue(seed))

  return {
    reset(nextSeed) {
      const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed))

      state.profile = normalizedSeed.profile
      state.searchPreferences = normalizedSeed.searchPreferences
      state.savedJobs = normalizedSeed.savedJobs
      state.tailoredAssets = normalizedSeed.tailoredAssets
      state.applicationRecords = normalizedSeed.applicationRecords
      state.settings = normalizedSeed.settings

      return Promise.resolve()
    },
    getProfile() {
      return Promise.resolve(cloneValue(state.profile))
    },
    saveProfile(profile) {
      state.profile = cloneValue(profile)
      return Promise.resolve()
    },
    getSearchPreferences() {
      return Promise.resolve(cloneValue(state.searchPreferences))
    },
    saveSearchPreferences(searchPreferences) {
      state.searchPreferences = cloneValue(searchPreferences)
      return Promise.resolve()
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(state.savedJobs))
    },
    replaceSavedJobs(savedJobs) {
      state.savedJobs = cloneValue([...savedJobs])
      return Promise.resolve()
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets))
    },
    upsertTailoredAsset(tailoredAsset) {
      const nextAssets = [...state.tailoredAssets]
      const existingIndex = nextAssets.findIndex((asset) => asset.id === tailoredAsset.id)

      if (existingIndex >= 0) {
        nextAssets[existingIndex] = cloneValue(tailoredAsset)
      } else {
        nextAssets.push(cloneValue(tailoredAsset))
      }

      state.tailoredAssets = nextAssets
      return Promise.resolve()
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(state.applicationRecords))
    },
    upsertApplicationRecord(applicationRecord) {
      const nextRecords = [...state.applicationRecords]
      const existingIndex = nextRecords.findIndex((record) => record.id === applicationRecord.id)

      if (existingIndex >= 0) {
        nextRecords[existingIndex] = cloneValue(applicationRecord)
      } else {
        nextRecords.push(cloneValue(applicationRecord))
      }

      state.applicationRecords = nextRecords
      return Promise.resolve()
    },
    getSettings() {
      return Promise.resolve(cloneValue(state.settings))
    },
    saveSettings(settings) {
      state.settings = cloneValue(settings)
      return Promise.resolve()
    }
  }
}

export async function createFileJobFinderRepository(
  options: FileJobFinderRepositoryOptions
): Promise<JobFinderRepository> {
  const state = await loadRepositoryState(options)
  let writeQueue = Promise.resolve()

  function enqueuePersist(): Promise<void> {
    writeQueue = writeQueue.then(() => writeRepositoryState(options.filePath, state))
    return writeQueue
  }

  return {
    reset(nextSeed) {
      const normalizedSeed = JobFinderRepositoryStateSchema.parse(cloneValue(nextSeed))

      state.profile = normalizedSeed.profile
      state.searchPreferences = normalizedSeed.searchPreferences
      state.savedJobs = normalizedSeed.savedJobs
      state.tailoredAssets = normalizedSeed.tailoredAssets
      state.applicationRecords = normalizedSeed.applicationRecords
      state.settings = normalizedSeed.settings

      return enqueuePersist()
    },
    getProfile() {
      return Promise.resolve(cloneValue(state.profile))
    },
    saveProfile(profile) {
      state.profile = cloneValue(profile)
      return enqueuePersist()
    },
    getSearchPreferences() {
      return Promise.resolve(cloneValue(state.searchPreferences))
    },
    saveSearchPreferences(searchPreferences) {
      state.searchPreferences = cloneValue(searchPreferences)
      return enqueuePersist()
    },
    listSavedJobs() {
      return Promise.resolve(cloneValue(state.savedJobs))
    },
    replaceSavedJobs(savedJobs) {
      state.savedJobs = cloneValue([...savedJobs])
      return enqueuePersist()
    },
    listTailoredAssets() {
      return Promise.resolve(cloneValue(state.tailoredAssets))
    },
    upsertTailoredAsset(tailoredAsset) {
      const nextAssets = [...state.tailoredAssets]
      const existingIndex = nextAssets.findIndex((asset) => asset.id === tailoredAsset.id)

      if (existingIndex >= 0) {
        nextAssets[existingIndex] = cloneValue(tailoredAsset)
      } else {
        nextAssets.push(cloneValue(tailoredAsset))
      }

      state.tailoredAssets = nextAssets
      return enqueuePersist()
    },
    listApplicationRecords() {
      return Promise.resolve(cloneValue(state.applicationRecords))
    },
    upsertApplicationRecord(applicationRecord) {
      const nextRecords = [...state.applicationRecords]
      const existingIndex = nextRecords.findIndex((record) => record.id === applicationRecord.id)

      if (existingIndex >= 0) {
        nextRecords[existingIndex] = cloneValue(applicationRecord)
      } else {
        nextRecords.push(cloneValue(applicationRecord))
      }

      state.applicationRecords = nextRecords
      return enqueuePersist()
    },
    getSettings() {
      return Promise.resolve(cloneValue(state.settings))
    },
    saveSettings(settings) {
      state.settings = cloneValue(settings)
      return enqueuePersist()
    }
  }
}
