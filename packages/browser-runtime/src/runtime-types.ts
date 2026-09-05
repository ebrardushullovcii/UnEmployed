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
  BrowserAgentRunCheckpoint,
  SourceDebugPhase,
  SharedAgentCompactionPolicy,
  SavedJob,
} from "@unemployed/contracts";
import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type {
  ApplicationFinalActionResult,
  ApplicationFormObservation,
  ExecuteExactlyOneFinalActionInput,
  ObserveApplicationFormOptions,
} from "./application-submission-browser-hands";

export interface OpenBrowserSessionOptions {
  /** Automation setup must not steal focus from a user-minimized browser. */
  purpose?: "automation" | "manual";
  /** Open a clean manual page without replacing an existing automation page. */
  reuseExistingPage?: boolean;
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
   * Explicit customer permission for external, site-side persistence during
   * preparation, such as draft creation, autosave requests, or another
   * verified non-final transmission to the employer's server. Selecting a
   * file into a local DOM file input is a local page edit the runtime
   * performs without this flag; only the site's attempt to transmit or
   * persist that selection externally is gated here. This never authorizes
   * DOM form submission or clicking a final apply control; those remain
   * independently blocked. The runtime opens a short, same-origin window only
   * around one exact grounded field action, accepts bounded fetch/XHR
   * POST/PUT/PATCH traffic only when the URL or operation body has explicit
   * draft/autosave/update semantics, and denies final-action, ambiguous,
   * cross-origin, late, long-lived, beacon, and navigation traffic. Omitted
   * values are false.
   */
  intermediateMutationsAuthorized?: boolean;
  /**
   * Canonical origins covered by the exact authority envelope. This list is
   * inert unless `intermediateMutationsAuthorized` is true, and the runtime
   * refuses to open a field-save window when the current page origin is not
   * an exact member.
   */
  intermediateMutationAllowedOrigins?: string[];
  /**
   * Main-owned last-instant authority recheck. The runtime calls it before
   * every field-save window with the currently observed canonical origin;
   * omission or a false/error result keeps external persistence blocked.
   */
  recheckIntermediateMutationAuthority?: (
    observedOrigin: string,
  ) => Promise<boolean>;
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
    options?: BrowserApplicationExecutionOptions,
  ): Promise<ApplyExecutionResult>;
  /**
   * Main-process-only application hand. The runtime retains Page ownership
   * and returns a redacted, transient observation with no DOM handle.
   * Catalog/seed runtimes intentionally omit this capability.
   */
  observeApplicationForm?(
    source: JobSource,
    options?: ObserveApplicationFormOptions,
  ): Promise<ApplicationFormObservation>;
  /**
   * Main-process-only one-shot final-action hand. It never returns a
   * submission claim; external verification is a separate boundary.
   */
  executeExactlyOneFinalAction?(
    source: JobSource,
    input: ExecuteExactlyOneFinalActionInput,
  ): Promise<ApplicationFinalActionResult>;
  captureVisualSnapshot?(
    source: JobSource,
    request: BrowserVisualSnapshotRequest,
  ): Promise<BrowserVisualSnapshotRef>;
  runAgentDiscovery?(
    source: JobSource,
    options: AgentDiscoveryOptions,
  ): Promise<DiscoveryRunResult>;
}

export interface BrowserApplicationExecutionOptions {
  signal?: AbortSignal;
}

export interface AgentDiscoveryOptions {
  userProfile: CandidateProfile;
  searchPreferences: {
    targetRoles: string[];
    locations: string[];
    workModes?: string[];
  };
  targetJobCount: number;
  maxSteps: number;
  runControl?: {
    timeBudgetMs?: number;
    noProgressStepLimit?: number;
  };
  resumeCheckpoint?: BrowserAgentRunCheckpoint;
  onCheckpoint?: (
    checkpoint: BrowserAgentRunCheckpoint,
  ) => Promise<void> | void;
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
