import type {
  JobFinderAiClient,
  ResumeVisionProvider,
} from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  ApplicationPacket,
  CandidateAsset,
  ClearApplicationAnswerCommandInput,
  ApplyRunDetails,
  DiscoveryRunScope,
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderApplyCopilotActionInput,
  JobFinderDismissDiscoveryJobInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderResumePreview,
  ResumeDocumentBundle,
  JobFinderInterviewFollowUpInput,
  ResumeImportFieldCandidate,
  ResumeImportRun,
  ResumeTimelineRepairAction,
  ResumeImportVisionArtifact,
  ResumeApplicationMode,
  ResumeSourceDocument,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ProfileSetupReviewAction,
  ProfileSetupReviewActionOptions,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeResearchArtifact,
  ResumeTemplateId,
  ResumeTemplateDefinition,
  SavedJob,
  SaveApplicationAnswerCommandInput,
  SourceDebugProgressEvent,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  UserActionCommandInput,
} from "@unemployed/contracts";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "@unemployed/db";
import type { ResumeExportFileVerifier } from "./workspace-service-context";
import type { ResumeRenderDocument } from "./resume-workspace-structure";

export interface JobFinderWorkspaceService {
  shutdown(): Promise<void>;
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>;
  getResumeImportState(): Promise<{
    resumeImportRuns: readonly ResumeImportRun[];
    resumeImportDocumentBundles: readonly ResumeDocumentBundle[];
    resumeImportFieldCandidates: readonly ResumeImportFieldCandidate[];
  }>;
  openBrowserSession(
    input?: JobFinderOpenBrowserSessionInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  checkBrowserSession(): Promise<JobFinderWorkspaceSnapshot>;
  performUserAction(
    command: UserActionCommandInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveApplicationAnswer(
    command: SaveApplicationAnswerCommandInput,
  ): Promise<ApplyRunDetails>;
  clearApplicationAnswer(
    command: ClearApplicationAnswerCommandInput,
  ): Promise<ApplyRunDetails>;
  resetWorkspace(
    seed: JobFinderRepositorySeed,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveProfile(profile: CandidateProfile): Promise<JobFinderWorkspaceSnapshot>;
  saveProfileAndSearchPreferences(
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runResumeImport(input: {
    baseResume: ResumeSourceDocument;
    documentBundle: ResumeDocumentBundle;
    importWarnings?: readonly string[];
    visionArtifact?: ResumeImportVisionArtifact | null;
  }): Promise<JobFinderWorkspaceSnapshot>;
  analyzeProfileFromResume(): Promise<JobFinderWorkspaceSnapshot>;
  saveSearchPreferences(
    searchPreferences: JobSearchPreferences,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveProfileSetupState(
    profileSetupState: ProfileSetupState,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyProfileSetupReviewAction(
    reviewItemId: string,
    action: ProfileSetupReviewAction,
    options?: ProfileSetupReviewActionOptions,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyResumeTimelineRepairAction(
    runId: string,
    proposalId: string,
    action: ResumeTimelineRepairAction,
  ): Promise<JobFinderWorkspaceSnapshot>;
  sendProfileCopilotMessage(
    content: string,
    context?: ProfileCopilotContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
  proposeProfileCopilotChange(
    content: string,
    context?: ProfileCopilotContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  rejectProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  undoProfileRevision(revisionId: string): Promise<JobFinderWorkspaceSnapshot>;
  saveSettings(
    settings: JobFinderSettings,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runDiscovery(targetId?: string): Promise<JobFinderWorkspaceSnapshot>;
  runAgentDiscovery(
    onActivity?: (event: DiscoveryActivityEvent) => void,
    signal?: AbortSignal,
    targetId?: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runDiscoveryForTarget(
    targetId: string,
    onActivity?: (event: DiscoveryActivityEvent) => void,
    signal?: AbortSignal,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runSourceDebug(
    targetId: string,
    signal?: AbortSignal,
    onProgress?: (event: SourceDebugProgressEvent) => void,
  ): Promise<JobFinderWorkspaceSnapshot>;
  cancelSourceDebug(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  getSourceDebugRun(runId: string): Promise<SourceDebugRunRecord>;
  getSourceDebugRunDetails(runId: string): Promise<SourceDebugRunDetails>;
  listSourceDebugRuns(
    targetId: string,
  ): Promise<readonly SourceDebugRunRecord[]>;
  saveSourceInstructionArtifact(
    targetId: string,
    artifact: EditableSourceInstructionArtifact,
  ): Promise<JobFinderWorkspaceSnapshot>;
  acceptSourceInstructionDraft(
    targetId: string,
    instructionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  verifySourceInstructions(
    targetId: string,
    instructionId: string,
    signal?: AbortSignal,
    onProgress?: (event: SourceDebugProgressEvent) => void,
  ): Promise<JobFinderWorkspaceSnapshot>;
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  setJobResumeApplicationMode(
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ): Promise<JobFinderWorkspaceSnapshot>;
  removeJobFromReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  dismissDiscoveryJob(
    input: JobFinderDismissDiscoveryJobInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
  restoreDismissedDiscoveryJob(
    jobId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  getResumeWorkspace(jobId: string): Promise<JobFinderResumeWorkspace>;
  previewResumeDraft(draft: ResumeDraft): Promise<JobFinderResumePreview>;
  saveResumeDraft(draft: ResumeDraft): Promise<JobFinderWorkspaceSnapshot>;
  restoreResumeDraftRevision(
    jobId: string,
    revisionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  regenerateResumeDraft(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  regenerateResumeSection(
    jobId: string,
    sectionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  exportResumePdf(
    jobId: string,
    outputPath?: string | null,
  ): Promise<JobFinderWorkspaceSnapshot>;
  approveResume(
    jobId: string,
    exportId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  clearResumeApproval(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  applyResumePatch(
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ): Promise<JobFinderWorkspaceSnapshot>;
  getResumeAssistantMessages(
    jobId: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  sendResumeAssistantMessage(
    jobId: string,
    content: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  resolveResumeAssistantProposal(
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ): Promise<readonly ResumeAssistantMessage[]>;
  getApplyRunDetails(runId: string, jobId: string): Promise<ApplyRunDetails>;
  buildApplicationPacket(
    runId: string,
    jobId: string,
  ): Promise<ApplicationPacket>;
  startApplyCopilotRun(
    jobId: string,
    options?: Pick<
      JobFinderApplyCopilotActionInput,
      "visualCheckpointsEnabled"
    >,
  ): Promise<JobFinderWorkspaceSnapshot>;
  startAutoApplyRun(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  startAutoApplyQueueRun(
    jobIds: readonly string[],
  ): Promise<JobFinderWorkspaceSnapshot>;
  approveApplyRun(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  cancelApplyRun(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  resolveApplyConsentRequest(
    requestId: string,
    action: "approve" | "decline",
  ): Promise<JobFinderWorkspaceSnapshot>;
  revokeApplyRunApproval(runId: string): Promise<JobFinderWorkspaceSnapshot>;
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  recordInterviewHelperApplicationAction(
    input: JobFinderInterviewFollowUpInput,
  ): Promise<JobFinderWorkspaceSnapshot>;
}

type DiscoveryTargetPipelineSharedOptions = {
  onActivity?: (event: DiscoveryActivityEvent) => void;
  signal?: AbortSignal;
  allowInactiveMarking?: boolean;
  useAgentRuntime?: boolean;
};

export type DiscoveryTargetPipelineOptions =
  | (DiscoveryTargetPipelineSharedOptions & {
      scope: "single_target";
      targetId: string;
    })
  | (DiscoveryTargetPipelineSharedOptions & {
      scope: Exclude<DiscoveryRunScope, "single_target">;
      targetId?: never;
    });

export interface RenderedResumeArtifact {
  fileName: string | null;
  storagePath: string | null;
  sha256?: string | null;
  format: "html" | "pdf";
  intermediateFileName?: string | null;
  intermediateStoragePath?: string | null;
  pageCount?: number | null;
  warnings?: readonly string[];
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[];
  renderResumePreview(input: {
    job: SavedJob;
    profile: CandidateProfile;
    renderDocument: ResumeRenderDocument;
    templateId: ResumeTemplateId;
    settings: JobFinderSettings;
  }): Promise<{
    html: string;
    warnings?: readonly string[];
  }>;
  renderResumeArtifact(input: {
    job: SavedJob;
    profile: CandidateProfile;
    renderDocument: ResumeRenderDocument;
    templateId: ResumeTemplateId;
    settings: JobFinderSettings;
    targetPath?: string | null;
  }): Promise<RenderedResumeArtifact>;
}

export interface ResumeResearchAdapterInput {
  job: SavedJob;
  profile: CandidateProfile;
}

export interface ResumeResearchAdapter {
  fetchResearchPages(
    input: ResumeResearchAdapterInput,
  ): Promise<readonly ResumeResearchArtifact[]>;
}

export interface ResolvedApplicationCandidateAsset {
  asset: CandidateAsset;
  loadVerifiedBytes: () => Promise<Uint8Array>;
}

export interface CandidateAssetResolver {
  resolveForApplication(
    assetId: string,
  ): Promise<ResolvedApplicationCandidateAsset>;
}

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient;
  visionProvider?: ResumeVisionProvider;
  documentManager: JobFinderDocumentManager;
  exportFileVerifier?: ResumeExportFileVerifier;
  repository: JobFinderRepository;
  browserRuntime: BrowserSessionRuntime;
  candidateAssetResolver?: CandidateAssetResolver;
  researchAdapter?: ResumeResearchAdapter;
}
