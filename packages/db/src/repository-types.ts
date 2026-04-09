import type {
  ApplicationAttempt,
  ApplicationRecord,
  CandidateProfile,
  JobFinderDiscoveryState,
  JobFinderRepositoryState,
  JobFinderSettings,
  JobSearchPreferences,
  ResumeAssistantMessage,
  ResumeDocumentBundle,
  ResumeDraft,
  ResumeDraftRevision,
  ResumeExportArtifact,
  ResumeImportCandidateResolution,
  ResumeImportFieldCandidate,
  ResumeImportRun,
  ResumeImportRunStatus,
  ResumeResearchArtifact,
  ResumeValidationResult,
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
  replaceSavedJobsAndClearResumeApproval(input: {
    savedJobs: readonly SavedJob[];
    draft: ResumeDraft;
    staleReason: string;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
  listTailoredAssets(): Promise<readonly TailoredAsset[]>;
  upsertTailoredAsset(tailoredAsset: TailoredAsset): Promise<void>;
  listResumeDrafts(): Promise<readonly ResumeDraft[]>;
  getResumeDraftByJobId(jobId: string): Promise<ResumeDraft | null>;
  upsertResumeDraft(draft: ResumeDraft): Promise<void>;
  listResumeDraftRevisions(
    draftId?: string,
  ): Promise<readonly ResumeDraftRevision[]>;
  upsertResumeDraftRevision(revision: ResumeDraftRevision): Promise<void>;
  listResumeExportArtifacts(options?: {
    jobId?: string;
    draftId?: string;
  }): Promise<readonly ResumeExportArtifact[]>;
  upsertResumeExportArtifact(artifact: ResumeExportArtifact): Promise<void>;
  listResumeResearchArtifacts(
    jobId?: string,
  ): Promise<readonly ResumeResearchArtifact[]>;
  upsertResumeResearchArtifact(artifact: ResumeResearchArtifact): Promise<void>;
  listResumeImportRuns(options?: {
    sourceResumeId?: string;
    statuses?: readonly ResumeImportRunStatus[];
    limit?: number;
  }): Promise<readonly ResumeImportRun[]>;
  getLatestResumeImportRun(sourceResumeId?: string): Promise<ResumeImportRun | null>;
  listResumeImportDocumentBundles(options?: {
    runId?: string;
    sourceResumeId?: string;
  }): Promise<readonly ResumeDocumentBundle[]>;
  listResumeImportFieldCandidates(options?: {
    runId?: string;
    resolution?: ResumeImportCandidateResolution;
  }): Promise<readonly ResumeImportFieldCandidate[]>;
  replaceResumeImportRunArtifacts(input: {
    run: ResumeImportRun;
    documentBundles: readonly ResumeDocumentBundle[];
    fieldCandidates: readonly ResumeImportFieldCandidate[];
  }): Promise<void>;
  listResumeValidationResults(
    draftId?: string,
  ): Promise<readonly ResumeValidationResult[]>;
  upsertResumeValidationResult(
    validationResult: ResumeValidationResult,
  ): Promise<void>;
  listResumeAssistantMessages(
    jobId?: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  upsertResumeAssistantMessage(
    message: ResumeAssistantMessage,
  ): Promise<void>;
  saveResumeDraftWithValidation(input: {
    draft: ResumeDraft;
    validation: ResumeValidationResult;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
  applyResumePatchWithRevision(input: {
    draft: ResumeDraft;
    revision: ResumeDraftRevision;
    validation: ResumeValidationResult;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
  approveResumeExport(input: {
    draft: ResumeDraft;
    exportArtifact: ResumeExportArtifact;
    validation?: ResumeValidationResult | null;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
  clearResumeApproval(input: {
    draft: ResumeDraft;
    staleReason: string;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
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
