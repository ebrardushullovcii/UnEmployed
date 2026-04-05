import type { JobFinderAiClient } from "@unemployed/ai-providers";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import type {
  JobFinderDiscoveryState,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  JobDiscoveryTarget,
  JobSource,
  SavedJob,
  SourceDebugRunRecord,
} from "@unemployed/contracts";
import type { JobFinderRepository } from "@unemployed/db";
import type {
  JobFinderDocumentManager,
  ResumeResearchAdapter,
} from "./workspace-service-contracts";

export interface ResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
}

export interface MutableRef<T> {
  current: T;
}

export interface WorkspaceServiceContext {
  aiClient: JobFinderAiClient;
  browserRuntime: BrowserSessionRuntime;
  documentManager: JobFinderDocumentManager;
  exportFileVerifier?: ResumeExportFileVerifier;
  researchAdapter?: ResumeResearchAdapter;
  repository: JobFinderRepository;
  activeSourceDebugExecutionIdRef: MutableRef<string | null>;
  activeSourceDebugAbortControllerRef: MutableRef<AbortController | null>;
  getWorkspaceSnapshot: () => Promise<JobFinderWorkspaceSnapshot>;
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
  openRunBrowserSession: (source: JobSource) => Promise<void>;
  closeRunBrowserSession: (source: JobSource) => Promise<void>;
  updateJob: (jobId: string, updater: (job: SavedJob) => SavedJob) => Promise<void>;
}
