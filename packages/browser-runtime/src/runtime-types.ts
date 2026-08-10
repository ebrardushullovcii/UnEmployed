import type {
  AgentDiscoveryProgress,
  ApplyExecutionResult,
  ApplyRecoveryContext,
  BrowserVisualAnalysisContext,
  BrowserVisualObservationSet,
  BrowserVisualSnapshotRef,
  BrowserVisualSnapshotRequest,
  BrowserSessionState,
  BrowserSourceAccessProbeInput,
  BrowserSourceAccessProbeResult,
  CandidateProfile,
  DiscoveryRunResult,
  JobFinderSettings,
  JobPosting,
  JobSearchPreferences,
  JobSource,
  ApplicationResumeArtifact,
  ApplicationQuestionKind,
  SourceDebugPhase,
  SharedAgentCompactionPolicy,
  SavedJob,
} from "@unemployed/contracts";
import type { JobFinderAiClient } from "@unemployed/ai-providers";

export interface OpenBrowserSessionOptions {
  targetUrl?: string | null;
  targetId?: string | null;
}

export interface ExecuteEasyApplyInput {
  job: SavedJob;
  resumeArtifact: ApplicationResumeArtifact;
  profile: CandidateProfile;
  settings: JobFinderSettings;
  instructions?: readonly string[];
}

export type ApplicationExecutionMode = "prepare_only" | "submit_when_ready";

/**
 * Main-process-only attachment resolved from an exact user-approved asset.
 * The byte loader retains filesystem authority in the owning adapter and must
 * revalidate availability plus integrity every time browser-runtime invokes it.
 * Neither the loader nor a file path may cross preload/renderer or persistence.
 */
export interface ApplicationAttachmentArtifact {
  assetId: string;
  questionId: string;
  prompt: string;
  questionKind: ApplicationQuestionKind;
  fileName: string;
  mime: string;
  sha256: string;
  loadVerifiedBytes: () => Promise<Uint8Array>;
}

export interface ExecuteApplicationFlowInput extends ExecuteEasyApplyInput {
  applicationAttachments?: readonly ApplicationAttachmentArtifact[];
  mode: ApplicationExecutionMode;
  /**
   * Stable logical execution key for a retry that may be recovered after a
   * process restart. Runtimes may use it to deduplicate safe intermediate
   * work; it never grants submit permission.
   */
  idempotencyKey?: string;
  /**
   * Explicit account-creation authorization. Omitted values are false and
   * the current production flow never creates accounts automatically.
   */
  accountCreationAuthorized?: boolean;
  /**
   * Explicit customer permission for non-final ATS writes such as attaching
   * the selected resume, draft creation, autosave, or a verified non-final
   * continuation step. This does not authorize DOM form submission or
   * clicking a final apply control; those remain independently blocked.
   * Omitted values are false.
   */
  intermediateMutationsAuthorized?: boolean;
  /**
   * Explicit final-submit authorization. The production Playwright runtime
   * treats omitted values as false.
   *
   * The production Playwright runtime currently remains prepare-only even when
   * this value is true. Keeping authorization separate from `mode` prevents a
   * `submit_when_ready` request from becoming implicit permission to click a
   * final submit control.
   */
  submitAuthorized?: boolean;
  recoveryContext?: ApplyRecoveryContext;
  captureVisualSnapshot?: (
    request: BrowserVisualSnapshotRequest,
  ) => Promise<BrowserVisualSnapshotRef>;
  /**
   * Explicitly opt in to runtime-owned visual diagnostics for safe apply checkpoints.
   * The runtime must not infer this from an ambient AI client because application
   * pages can contain sensitive account, profile, and resume data.
   */
  analyzeVisualSnapshot?: (input: {
    snapshot: BrowserVisualSnapshotRef;
    context: BrowserVisualAnalysisContext;
  }) => Promise<BrowserVisualObservationSet>;
}

export interface BrowserSessionRuntime {
  getSessionState(source: JobSource): Promise<BrowserSessionState>;
  openSession(
    source: JobSource,
    options?: OpenBrowserSessionOptions,
  ): Promise<BrowserSessionState>;
  closeSession(source: JobSource): Promise<BrowserSessionState>;
  inspectSourceAccess?(
    source: JobSource,
    input: BrowserSourceAccessProbeInput,
  ): Promise<BrowserSourceAccessProbeResult>;
  runDiscovery(
    source: JobSource,
    searchPreferences: JobSearchPreferences,
  ): Promise<DiscoveryRunResult>;
  executeEasyApply(
    source: JobSource,
    input: ExecuteEasyApplyInput,
  ): Promise<ApplyExecutionResult>;
  executeApplicationFlow(
    source: JobSource,
    input: ExecuteApplicationFlowInput,
  ): Promise<ApplyExecutionResult>;
  captureVisualSnapshot?(
    source: JobSource,
    request: BrowserVisualSnapshotRequest,
  ): Promise<BrowserVisualSnapshotRef>;
  runAgentDiscovery?(
    source: JobSource,
    options: AgentDiscoveryOptions,
  ): Promise<DiscoveryRunResult>;
}

export interface AgentDiscoveryOptions {
  userProfile: CandidateProfile;
  searchPreferences: {
    targetRoles: string[];
    locations: string[];
  };
  targetJobCount: number;
  maxSteps: number;
  startingUrls: string[];
  agentHints?: {
    widenReviewBudget?: boolean;
  };
  siteLabel: string;
  navigationHostnames: string[];
  siteInstructions?: string[];
  toolUsageNotes?: string[];
  taskPacket?: {
    phase: SourceDebugPhase;
    phaseGoal: string;
    knownFacts: string[];
    priorPhaseSummary?: string | null;
    avoidStrategyFingerprints: string[];
    successCriteria: string[];
    stopConditions: string[];
    manualPrerequisiteState?: string | null;
    strategyLabel?: string | null;
  };
  compaction?: Partial<SharedAgentCompactionPolicy>;
  modelContextWindowTokens?: number | null;
  compactionHints?: {
    workflowKey?: string;
  };
  relevantUrlSubstrings?: string[];
  experimental?: boolean;
  skipSessionValidation?: boolean;
  captureVisualSnapshots?: boolean;
  aiClient?: JobFinderAiClient;
  onProgress?: (progress: AgentDiscoveryProgress) => void;
  signal?: AbortSignal;
}

export interface CatalogBrowserSessionRuntimeSeed {
  sessions: BrowserSessionState[];
  catalog: JobPosting[];
}

export type StubBrowserSessionRuntimeSeed = CatalogBrowserSessionRuntimeSeed;
