import type {
  JobPosting,
  CandidateProfile,
  AgentDiscoveryProgress,
  JobSource,
  Tool,
  ToolCall
} from '@unemployed/contracts'
import type { Page } from 'playwright'

// Re-export shared types from contracts
export type { Tool, ToolCall }

// Narrow interface for search preferences used by the agent
export interface AgentSearchPreferences {
  targetRoles: string[]
  locations: string[]
}

export interface AgentNavigationPolicy {
  allowedHostnames: string[]
  allowSubdomains?: boolean
}

export interface AgentPromptContext {
  siteLabel: string
  siteInstructions?: string[]
  toolUsageNotes?: string[]
  experimental?: boolean
}

export interface AgentExtractionContext {
  relevantUrlSubstrings?: string[]
}

export interface AgentConfig {
  source: JobSource
  maxSteps: number
  targetJobCount: number
  userProfile: CandidateProfile
  searchPreferences: AgentSearchPreferences
  startingUrls: string[]
  navigationPolicy: AgentNavigationPolicy
  promptContext: AgentPromptContext
  extractionContext?: AgentExtractionContext
}

export interface AgentState {
  conversation: AgentMessage[]
  collectedJobs: JobPosting[]
  visitedUrls: Set<string>
  stepCount: number
  currentUrl: string
  isRunning: boolean
}

export interface AgentResult {
  jobs: JobPosting[]
  steps: number
  incomplete?: boolean
  error?: string
}

// Re-export AgentDiscoveryProgress from contracts for consistency
export type AgentProgress = AgentDiscoveryProgress

export type AgentMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

export interface ToolContext {
  page: Page
  state: AgentState
  config: AgentConfig
}

export type ToolExecutor = (args: unknown, context: ToolContext) => Promise<ToolResult>

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: ToolExecutor
}

export type OnProgressCallback = (progress: AgentProgress) => void
