import type { Page } from 'playwright'
import type { JobPosting } from '@unemployed/contracts'
import type { AgentMessage, ToolCall } from '../types'
import type { getToolDefinitions } from '../tools'

export type AgentExtractorPageType = 'search_results' | 'job_detail'

export interface LLMClient {
  chatWithTools(
    messages: AgentMessage[],
    tools: ReturnType<typeof getToolDefinitions>,
    options?: {
      signal?: AbortSignal
      maxOutputTokens?: number
    }
  ): Promise<{
    content?: string
    toolCalls?: ToolCall[]
    reasoning?: string
  }>
}

export interface JobExtractor {
  extractJobsFromPage(input: {
    pageText: string
    pageUrl: string
    pageType: AgentExtractorPageType
    maxJobs: number
    signal?: AbortSignal
  }): Promise<Array<
    Pick<
      JobPosting,
      | 'sourceJobId'
      | 'canonicalUrl'
      | 'title'
      | 'company'
      | 'location'
      | 'description'
      | 'salaryText'
      | 'summary'
      | 'postedAt'
      | 'workMode'
      | 'applyPath'
      | 'easyApplyEligible'
      | 'keySkills'
    > & Partial<
      Pick<
        JobPosting,
        | 'postedAtText'
        | 'responsibilities'
        | 'minimumQualifications'
        | 'preferredQualifications'
        | 'seniority'
        | 'employmentType'
        | 'department'
        | 'team'
        | 'employerWebsiteUrl'
        | 'employerDomain'
        | 'benefits'
      >
    >
  >>
}
