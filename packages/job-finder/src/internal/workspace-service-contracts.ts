import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ResumeTemplateDefinition,
  SavedJob,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
} from "@unemployed/contracts";
import type {
  JobFinderRepository,
  JobFinderRepositorySeed,
} from "@unemployed/db";

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
  analyzeProfileFromResume(): Promise<JobFinderWorkspaceSnapshot>;
  saveSearchPreferences(
    searchPreferences: JobSearchPreferences,
  ): Promise<JobFinderWorkspaceSnapshot>;
  saveSettings(
    settings: JobFinderSettings,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runDiscovery(): Promise<JobFinderWorkspaceSnapshot>;
  runAgentDiscovery(
    onActivity?: (event: DiscoveryActivityEvent) => void,
    signal?: AbortSignal,
  ): Promise<JobFinderWorkspaceSnapshot>;
  runSourceDebug(
    targetId: string,
    signal?: AbortSignal,
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
  ): Promise<JobFinderWorkspaceSnapshot>;
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>;
}

export interface RenderedResumeArtifact {
  fileName: string | null;
  storagePath: string | null;
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[];
  renderResumeArtifact(input: {
    job: SavedJob;
    profile: CandidateProfile;
    previewSections: Array<{ heading: string; lines: string[] }>;
    settings: JobFinderSettings;
    textContent: string;
  }): Promise<RenderedResumeArtifact>;
}

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient;
  documentManager: JobFinderDocumentManager;
  repository: JobFinderRepository;
  browserRuntime: BrowserSessionRuntime;
}
