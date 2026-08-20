import type {
  ApplyJobResult,
  ApplyJobResultInput,
  ApplyRun,
  ApplySubmitApproval,
  ApplicationAttempt,
  ApplicationAttemptInput,
  ApplicationAnswerRecord,
  ApplicationArtifactRef,
  ApplicationArtifactRefInput,
  ApplicationConsentRequest,
  ApplicationRecord,
  ApplicationQuestionRecord,
  ApplicationQuestionRecordInput,
  ApplicationReplayCheckpoint,
  ApplicationReplayCheckpointInput,
  CandidateProfile,
  JobFinderDiscoveryState,
  JobFinderActivityControl,
  JobFinderRepositoryState,
  JobFinderIntelligenceState,
  JobFinderSettings,
  JobSearchCampaignCollection,
  JobSearchPreferences,
  ProfileCopilotMessage,
  ProfileRevision,
  ProfileSetupState,
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
  SourceDebugWorkerAttemptInput,
  SourceInstructionArtifact,
  TailoredAsset,
  UserActionEvent,
  UserActionRequest,
} from "@unemployed/contracts";
import type {
  CreateUserActionRequestResult,
  UserActionEventQuery,
  UserActionRequestQuery,
  UserActionTransitionCommitResult,
  UserActionTransitionInput,
} from "./user-action-repository-types";
import type {
  CommitGroupedManualAnswerInput,
  CommitGroupedManualAnswerResult,
} from "./grouped-manual-answer-types";

export type JobFinderRepositorySeed = JobFinderRepositoryState;

export type ApplicationAnswerMutationResult = "applied" | "duplicate" | "stale";

export type ApplicationRecordBatchCommitResult =
  | {
      status: "applied";
      committedRecordIds: readonly string[];
    }
  | {
      status: "missing" | "stale";
      recordIds: readonly string[];
    };

export interface JobFinderRepository {
  close(): Promise<void>;
  reset(seed: JobFinderRepositorySeed): Promise<void>;
  getProfile(): Promise<CandidateProfile>;
  saveProfile(profile: CandidateProfile): Promise<void>;
  getSearchPreferences(): Promise<JobSearchPreferences>;
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<void>;
  getProfileSetupState(): Promise<ProfileSetupState>;
  saveProfileSetupState(profileSetupState: ProfileSetupState): Promise<void>;
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ): Promise<void>;
  commitProfileCopilotState(input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    profileSetupState: ProfileSetupState;
    messages?: readonly ProfileCopilotMessage[];
    revisions?: readonly ProfileRevision[];
  }): Promise<void>;
  listSavedJobs(options?: {
    limit?: number;
    offset?: number;
  }): Promise<readonly SavedJob[]>;
  /**
   * Atomically applies row-local saved-job updates and/or inserts without
   * replacing rows that the caller did not intend to change.
   */
  commitSavedJobDelta(input: {
    upserts?: readonly SavedJob[];
    update?: (job: SavedJob) => SavedJob;
    clearResumeApproval?: {
      jobId: string;
      staleReason: string;
      shouldClear: (previousJob: SavedJob, nextJob: SavedJob) => boolean;
    };
    discoveryState?: JobFinderDiscoveryState;
  }): Promise<void>;
  /**
   * Destructively replaces the complete saved-job collection. The caller must
   * provide an authoritative full snapshot; paged or stale reads are invalid.
   * Prefer commitSavedJobDelta for ordinary product mutations.
   */
  replaceSavedJobs(savedJobs: readonly SavedJob[]): Promise<void>;
  /**
   * Destructively replaces the complete saved-job collection together with
   * discovery state. Reserved for authoritative reset/import boundaries.
   */
  replaceSavedJobsAndDiscoveryState(input: {
    savedJobs: readonly SavedJob[];
    discoveryState: JobFinderDiscoveryState;
  }): Promise<void>;
  /**
   * Destructively replaces the complete saved-job collection while clearing
   * resume approval. Prefer commitSavedJobDelta for row-local product updates.
   */
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
  getLatestResumeImportRun(
    sourceResumeId?: string,
  ): Promise<ResumeImportRun | null>;
  upsertResumeImportRun(run: ResumeImportRun): Promise<void>;
  listResumeImportDocumentBundles(options?: {
    runId?: string;
    sourceResumeId?: string;
  }): Promise<readonly ResumeDocumentBundle[]>;
  listResumeImportFieldCandidates(options?: {
    runId?: string;
    resolution?: ResumeImportCandidateResolution;
    resolutions?: readonly ResumeImportCandidateResolution[];
  }): Promise<readonly ResumeImportFieldCandidate[]>;
  replaceResumeImportRunArtifacts(input: {
    run: ResumeImportRun;
    documentBundles: readonly ResumeDocumentBundle[];
    fieldCandidates: readonly ResumeImportFieldCandidate[];
  }): Promise<void>;
  finalizeResumeImportRun(input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
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
  upsertResumeAssistantMessage(message: ResumeAssistantMessage): Promise<void>;
  listProfileCopilotMessages(): Promise<readonly ProfileCopilotMessage[]>;
  upsertProfileCopilotMessage(message: ProfileCopilotMessage): Promise<void>;
  listProfileRevisions(): Promise<readonly ProfileRevision[]>;
  upsertProfileRevision(revision: ProfileRevision): Promise<void>;
  listApplyRuns(options?: { id?: string }): Promise<readonly ApplyRun[]>;
  upsertApplyRun(run: ApplyRun): Promise<void>;
  listApplyJobResults(options?: {
    runId?: string;
    jobId?: string;
  }): Promise<readonly ApplyJobResult[]>;
  upsertApplyJobResult(result: ApplyJobResultInput): Promise<void>;
  compareAndSwapApplyJobResult(input: {
    expected: ApplyJobResult;
    result: ApplyJobResultInput;
  }): Promise<boolean>;
  listApplySubmitApprovals(options?: {
    id?: string;
    runId?: string;
  }): Promise<readonly ApplySubmitApproval[]>;
  upsertApplySubmitApproval(approval: ApplySubmitApproval): Promise<void>;
  listApplicationQuestionRecords(options?: {
    runId?: string;
    jobId?: string;
    resultId?: string;
  }): Promise<readonly ApplicationQuestionRecord[]>;
  upsertApplicationQuestionRecord(
    record: ApplicationQuestionRecordInput,
  ): Promise<void>;
  listApplicationAnswerRecords(options?: {
    runId?: string;
    jobId?: string;
    resultId?: string;
    questionId?: string;
  }): Promise<readonly ApplicationAnswerRecord[]>;
  upsertApplicationAnswerRecord(record: ApplicationAnswerRecord): Promise<void>;
  /**
   * Compare the latest answer and question with the caller's captured values,
   * then append the answer and update its question in one atomic operation.
   * A duplicate command is reported separately so retries remain idempotent.
   */
  commitApplicationAnswerMutation(input: {
    expectedAnswer: ApplicationAnswerRecord | null;
    expectedQuestion: ApplicationQuestionRecord;
    answer: ApplicationAnswerRecord;
    question: ApplicationQuestionRecord;
  }): Promise<ApplicationAnswerMutationResult>;
  listApplicationArtifactRefs(options?: {
    runId?: string;
    jobId?: string;
    resultId?: string;
  }): Promise<readonly ApplicationArtifactRef[]>;
  upsertApplicationArtifactRef(ref: ApplicationArtifactRefInput): Promise<void>;
  listApplicationReplayCheckpoints(options?: {
    runId?: string;
    jobId?: string;
    resultId?: string;
  }): Promise<readonly ApplicationReplayCheckpoint[]>;
  upsertApplicationReplayCheckpoint(
    checkpoint: ApplicationReplayCheckpointInput,
  ): Promise<void>;
  listApplicationConsentRequests(options?: {
    runId?: string;
    jobId?: string;
    resultId?: string;
  }): Promise<readonly ApplicationConsentRequest[]>;
  upsertApplicationConsentRequest(
    request: ApplicationConsentRequest,
  ): Promise<void>;
  listUserActionRequests(
    query?: UserActionRequestQuery,
  ): Promise<readonly UserActionRequest[]>;
  getUserActionRequest(id: string): Promise<UserActionRequest | null>;
  createUserActionRequest(
    request: UserActionRequest,
  ): Promise<CreateUserActionRequestResult>;
  listUserActionEvents(
    query?: UserActionEventQuery,
  ): Promise<readonly UserActionEvent[]>;
  commitUserActionTransition(
    input: UserActionTransitionInput,
  ): Promise<UserActionTransitionCommitResult>;
  commitGroupedManualAnswer(
    input: CommitGroupedManualAnswerInput,
  ): Promise<CommitGroupedManualAnswerResult>;
  saveResumeDraftWithValidation(input: {
    draft: ResumeDraft;
    validation: ResumeValidationResult;
    tailoredAsset?: TailoredAsset | null;
  }): Promise<void>;
  applyResumePatchWithRevision(input: {
    expectedDraftUpdatedAt: string;
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
  /**
   * Atomically commits a set of application records after checking every
   * expected revision. Missing or stale records return a failure result and
   * leave the persisted collection untouched.
   */
  commitApplicationRecordBatch(input: {
    expectedRevisions: readonly {
      applicationRecordId: string;
      expectedRevision: number;
    }[];
    records: readonly ApplicationRecord[];
  }): Promise<ApplicationRecordBatchCommitResult>;
  listApplicationAttempts(): Promise<readonly ApplicationAttempt[]>;
  upsertApplicationAttempt(
    applicationAttempt: ApplicationAttemptInput,
  ): Promise<void>;
  claimApplicationAttempt(
    applicationAttempt: ApplicationAttemptInput,
  ): Promise<boolean>;
  listSourceDebugRuns(): Promise<readonly SourceDebugRunRecord[]>;
  upsertSourceDebugRun(run: SourceDebugRunRecord): Promise<void>;
  listSourceDebugAttempts(): Promise<readonly SourceDebugWorkerAttempt[]>;
  upsertSourceDebugAttempt(
    attempt: SourceDebugWorkerAttemptInput,
  ): Promise<void>;
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
  upsertSourceDebugEvidenceRefs(
    evidenceRefs: readonly SourceDebugEvidenceRef[],
  ): Promise<void>;
  getSettings(): Promise<JobFinderSettings>;
  saveSettings(settings: JobFinderSettings): Promise<void>;
  getDiscoveryState(): Promise<JobFinderDiscoveryState>;
  saveDiscoveryState(discoveryState: JobFinderDiscoveryState): Promise<void>;
  getCampaignState(): Promise<JobSearchCampaignCollection | null>;
  saveCampaignState(campaignState: JobSearchCampaignCollection): Promise<void>;
  getIntelligenceState(): Promise<JobFinderIntelligenceState>;
  saveIntelligenceState(state: JobFinderIntelligenceState): Promise<void>;
  getActivityControl(): Promise<JobFinderActivityControl>;
  saveActivityControl(activityControl: JobFinderActivityControl): Promise<void>;
}

export interface FileJobFinderRepositoryOptions {
  filePath: string;
  seed: JobFinderRepositorySeed;
}

export type StateTableKey =
  | "profile"
  | "search_preferences"
  | "profile_setup_state"
  | "settings"
  | "discovery_state"
  | "campaign_state"
  | "intelligence_state"
  | "activity_control";

export interface SchemaParser<TValue> {
  parse: (value: unknown) => TValue;
}
