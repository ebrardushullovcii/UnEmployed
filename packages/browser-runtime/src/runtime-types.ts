import type {
  AgentDiscoveryProgress,
  ApplyExecutionResult,
  BrowserSessionState,
  CandidateProfile,
  DiscoveryRunResult,
  JobFinderSettings,
  JobPosting,
  JobSearchPreferences,
  JobSource,
  SavedJob,
  TailoredAsset,
} from '@unemployed/contracts'
import type { JobFinderAiClient } from '@unemployed/ai-providers'

export interface ExecuteEasyApplyInput {
  job: SavedJob;
  asset: TailoredAsset;
  profile: CandidateProfile;
  settings: JobFinderSettings;
  instructions?: readonly string[];
}

export interface BrowserSessionRuntime {
  getSessionState(source: JobSource): Promise<BrowserSessionState>;
  openSession(source: JobSource): Promise<BrowserSessionState>;
  closeSession(source: JobSource): Promise<BrowserSessionState>;
  runDiscovery(
    source: JobSource,
    searchPreferences: JobSearchPreferences,
  ): Promise<DiscoveryRunResult>;
  executeEasyApply(
    source: JobSource,
    input: ExecuteEasyApplyInput,
  ): Promise<ApplyExecutionResult>;
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
  siteLabel: string;
  navigationHostnames: string[];
  siteInstructions?: string[];
  toolUsageNotes?: string[];
  taskPacket?: {
    phaseGoal: string;
    knownFacts: string[];
    priorPhaseSummary?: string | null;
    avoidStrategyFingerprints: string[];
    successCriteria: string[];
    stopConditions: string[];
    manualPrerequisiteState?: string | null;
    strategyLabel?: string | null;
  };
  compaction?: {
    maxTranscriptMessages?: number;
    preserveRecentMessages?: number;
    maxToolPayloadChars?: number;
  };
  relevantUrlSubstrings?: string[];
  experimental?: boolean;
  skipSessionValidation?: boolean;
  aiClient?: JobFinderAiClient;
  onProgress?: (progress: AgentDiscoveryProgress) => void;
  signal?: AbortSignal;
}

export interface CatalogBrowserSessionRuntimeSeed {
  sessions: BrowserSessionState[];
  catalog: JobPosting[];
}

export type StubBrowserSessionRuntimeSeed = CatalogBrowserSessionRuntimeSeed;
