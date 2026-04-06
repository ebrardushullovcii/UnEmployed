import type {
  AgentDebugFindings,
  JobPosting,
  CandidateProfile,
  AgentDiscoveryProgress,
  JobSource,
  SourceDebugCompactionState,
  SourceDebugPhaseCompletionMode,
  SourceDebugPhaseEvidence,
  Tool,
  ToolCall,
} from "@unemployed/contracts";
import type { Page } from "playwright";
import type {
  SearchResultCardCandidate,
  StructuredDataJobCandidate,
} from "./agent/job-extraction";

// Re-export shared types from contracts
export type { Tool, ToolCall };

// Narrow interface for search preferences used by the agent
export interface AgentSearchPreferences {
  targetRoles: string[];
  locations: string[];
}

export interface AgentNavigationPolicy {
  allowedHostnames: string[];
  allowSubdomains?: boolean;
}

export interface AgentPromptContext {
  siteLabel: string;
  siteInstructions?: string[];
  toolUsageNotes?: string[];
  experimental?: boolean;
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
}

export interface AgentExtractionContext {
  relevantUrlSubstrings?: string[];
}

export interface DeferredSearchExtraction {
  key: string;
  pageUrl: string;
  pageText: string;
  capturedAt: string;
  structuredDataCandidates?: StructuredDataJobCandidate[];
  cardCandidates?: SearchResultCardCandidate[];
}

export interface AgentCompactionConfig {
  maxTranscriptMessages: number;
  preserveRecentMessages: number;
  maxToolPayloadChars: number;
}

export interface AgentConfig {
  source: JobSource;
  maxSteps: number;
  targetJobCount: number;
  userProfile: CandidateProfile;
  searchPreferences: AgentSearchPreferences;
  startingUrls: string[];
  navigationPolicy: AgentNavigationPolicy;
  promptContext: AgentPromptContext;
  extractionContext?: AgentExtractionContext;
  compaction?: Partial<AgentCompactionConfig>;
}

export interface AgentState {
  conversation: AgentMessage[];
  reviewTranscript: string[];
  collectedJobs: JobPosting[];
  deferredSearchExtractions: Map<string, DeferredSearchExtraction>;
  failedInteractionAttempts?: Map<string, { count: number; lastError: string }>;
  visitedUrls: Set<string>;
  stepCount: number;
  currentUrl: string;
  lastStableUrl: string;
  isRunning: boolean;
  phaseEvidence: SourceDebugPhaseEvidence;
  compactionState: SourceDebugCompactionState | null;
}

export interface AgentResult {
  jobs: JobPosting[];
  steps: number;
  incomplete?: boolean;
  error?: string;
  transcriptMessageCount: number;
  reviewTranscript?: string[];
  compactionState?: SourceDebugCompactionState | null;
  phaseCompletionMode?: SourceDebugPhaseCompletionMode | null;
  phaseCompletionReason?: string | null;
  phaseEvidence?: SourceDebugPhaseEvidence | null;
  debugFindings?: AgentDebugFindings | null;
}

// Re-export AgentDiscoveryProgress from contracts for consistency
export type AgentProgress = AgentDiscoveryProgress;

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolContext {
  page: Page;
  state: AgentState;
  config: AgentConfig;
}

export type ToolExecutor = (
  args: unknown,
  context: ToolContext,
) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  retryable?: boolean;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: ToolExecutor;
}

export type OnProgressCallback = (progress: AgentProgress) => void;
