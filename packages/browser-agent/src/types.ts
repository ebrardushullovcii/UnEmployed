import type { JobPosting, CandidateProfile, JobSearchPreferences, AgentDiscoveryProgress } from '@unemployed/contracts'
import type { Page } from 'playwright'

export interface AgentConfig {
  maxSteps: number
  targetJobCount: number
  userProfile: CandidateProfile
  searchPreferences: JobSearchPreferences
  startingUrls: string[]
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

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

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
