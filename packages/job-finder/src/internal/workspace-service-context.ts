import type {
  JobFinderAiClient,
  ResumeVisionProvider,
} from "@unemployed/ai-providers";
import type {
  BrowserSessionRuntime,
  OpenBrowserSessionOptions,
} from "@unemployed/browser-runtime";
import type {
  ApplyJobResult,
  JobFinderDiscoveryState,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  JobDiscoveryTarget,
  JobSource,
  SavedJob,
  SourceDebugRunRecord,
  UserActionRequest,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";
import type {
  CandidateAssetResolver,
  JobFinderDocumentManager,
  ResumeResearchAdapter,
} from "./workspace-service-contracts";
import type { ListingHtmlFetcher } from "./listing-detail-enrichment";

export interface ResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
  sha256?(filePath: string): Promise<string>;
  /**
   * The on-disk path `exists`/`sha256` actually resolved to, or null when no
   * candidate exists. A verifier that can recover a path recorded under a
   * since-moved user-data directory must expose it here: the application
   * resume artifact carries the path onward to the browser runtime, which
   * re-checks it with its own `access()` and reports `missing_resume` when the
   * recorded path no longer exists.
   */
  resolvePath?(filePath: string): Promise<string | null>;
}

export interface MutableRef<T> {
  current: T;
}

export interface ApplicationPreparationCapacityToken {
  localDate: string;
  remainingJobs: number;
}

export interface WorkspaceServiceContext {
  aiClient: JobFinderAiClient;
  visionProvider?: ResumeVisionProvider;
  browserRuntime: BrowserSessionRuntime;
  documentManager: JobFinderDocumentManager;
  candidateAssetResolver?: CandidateAssetResolver;
  exportFileVerifier?: ResumeExportFileVerifier;
  researchAdapter?: ResumeResearchAdapter;
  repository: JobFinderRepository;
  activeDiscoveryAbortControllerRef: MutableRef<AbortController | null>;
  activeDiscoveryPromiseRef: MutableRef<Promise<unknown> | null>;
  activeSourceDebugExecutionIdRef: MutableRef<string | null>;
  activeSourceDebugAbortControllerRef: MutableRef<AbortController | null>;
  activeSourceDebugPromiseRef: MutableRef<Promise<unknown> | null>;
  activeApplyRunAbortControllers: Map<string, AbortController>;
  activeApplyRunPromises: Map<string, Promise<void>>;
  applyRunTransitionTails: Map<string, Promise<void>>;
  markApplicationPreparationStarted(
    input: { resultId: string; runId: string; jobId: string },
    token?: ApplicationPreparationCapacityToken,
  ): Promise<ApplyJobResult>;
  requireApplicationSafeguardClearance?(
    jobIds: readonly string[],
    savedJobs?: readonly SavedJob[],
  ): Promise<void>;
  withApplicationCrmTransition<T>(operation: () => Promise<T>): Promise<T>;
  withIntelligenceTransition<T>(operation: () => Promise<T>): Promise<T>;
  withCampaignTransition<T>(operation: () => Promise<T>): Promise<T>;
  activeResumeVisionRunIds: Set<string>;
  getWorkspaceSnapshot: () => Promise<JobFinderWorkspaceSnapshot>;
  getActiveCampaignId: () => Promise<string | null>;
  resumeApplicationUserAction: (request: UserActionRequest) => Promise<void>;
  runSourceDebugWorkflow: (
    targetId: string,
    signal?: AbortSignal,
    options?: {
      clearExistingInstructions?: boolean;
      reviewInstructionId?: string | null;
    },
  ) => Promise<JobFinderWorkspaceSnapshot>;
  persistDiscoveryState: (
    updater: (current: JobFinderDiscoveryState) => JobFinderDiscoveryState,
  ) => Promise<JobFinderDiscoveryState>;
  refreshDiscoverySessions: (
    searchPreferences: JobSearchPreferences,
  ) => Promise<JobFinderDiscoveryState["sessions"]>;
  saveDiscoveryTargetUpdate: (
    targetId: string,
    updater: (target: JobDiscoveryTarget) => JobDiscoveryTarget,
  ) => Promise<JobSearchPreferences>;
  persistSourceDebugRun: (run: SourceDebugRunRecord) => Promise<void>;
  persistBrowserSessionState: (
    session: Awaited<ReturnType<BrowserSessionRuntime["openSession"]>>,
  ) => Promise<void>;
  staleApprovedResumeDrafts: (
    staleReason: string,
    jobIds?: readonly string[],
  ) => Promise<void>;
  openRunBrowserSession: (
    source: JobSource,
    options?: OpenBrowserSessionOptions,
  ) => Promise<void>;
  closeRunBrowserSession: (source: JobSource) => Promise<void>;
  /**
   * Plain-HTTP page reader for listing bodies (see
   * `listing-detail-enrichment.ts`). Optional so tests inject a fake and the
   * desktop supplies the default fetcher.
   */
  fetchListingHtml?: ListingHtmlFetcher;
  updateJob: (
    jobId: string,
    updater: (job: SavedJob) => SavedJob,
  ) => Promise<void>;
}
