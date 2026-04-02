import type {
  ApplicationAttempt,
  ApplicationRecord,
  CandidateProfile,
  JobFinderDiscoveryState,
  JobFinderRepositoryState,
  JobFinderSettings,
  JobSearchPreferences,
  SavedJob,
  SourceDebugEvidenceRef,
  SourceDebugRunRecord,
  SourceDebugWorkerAttempt,
  SourceInstructionArtifact,
  TailoredAsset,
} from "@unemployed/contracts";

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

export interface FileJobFinderRepositoryOptions {
  filePath: string;
  seed: JobFinderRepositorySeed;
}

export type StateTableKey =
  | "profile"
  | "search_preferences"
  | "settings"
  | "discovery_state";

export interface SchemaParser<TValue> {
  parse: (value: unknown) => TValue;
}
