import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  DiscoveryRunScope,
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  ResumeDocumentBundle,
  ResumeSourceDocument,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ProfileSetupReviewAction,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeResearchArtifact,
  ResumeTemplateDefinition,
  SavedJob,
  SourceDebugProgressEvent,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
} from "@unemployed/contracts";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "@unemployed/db";
import type { ResumeExportFileVerifier } from "./workspace-service-context";

export interface JobFinderWorkspaceService {
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>;
  openBrowserSession(): Promise<JobFinderWorkspaceSnapshot>;
  checkBrowserSession(): Promise<JobFinderWorkspaceSnapshot>;
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
  ): Promise<JobFinderWorkspaceSnapshot>;
  sendProfileCopilotMessage(
    content: string,
    context?: ProfileCopilotContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
  applyProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  rejectProfileCopilotPatchGroup(
    patchGroupId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
  undoProfileRevision(
    revisionId: string,
  ): Promise<JobFinderWorkspaceSnapshot>;
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
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  getResumeWorkspace(jobId: string): Promise<JobFinderResumeWorkspace>;
  saveResumeDraft(draft: ResumeDraft): Promise<JobFinderWorkspaceSnapshot>;
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
  getResumeAssistantMessages(jobId: string): Promise<readonly ResumeAssistantMessage[]>;
  sendResumeAssistantMessage(
    jobId: string,
    content: string,
  ): Promise<readonly ResumeAssistantMessage[]>;
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
}

export interface DiscoveryTargetPipelineOptions {
  targetId?: string;
  onActivity?: (event: DiscoveryActivityEvent) => void;
  signal?: AbortSignal;
  scope: DiscoveryRunScope;
  allowInactiveMarking?: boolean;
}

export interface RenderedResumeArtifact {
  fileName: string | null;
  storagePath: string | null;
  format: "html" | "pdf";
  intermediateFileName?: string | null;
  intermediateStoragePath?: string | null;
  pageCount?: number | null;
  warnings?: readonly string[];
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[];
  renderResumeArtifact(input: {
    job: SavedJob;
    profile: CandidateProfile;
    previewSections: Array<{ heading: string; lines: string[] }>;
    settings: JobFinderSettings;
    textContent: string;
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

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient;
  documentManager: JobFinderDocumentManager;
  exportFileVerifier?: ResumeExportFileVerifier;
  repository: JobFinderRepository;
  browserRuntime: BrowserSessionRuntime;
  researchAdapter?: ResumeResearchAdapter;
}
