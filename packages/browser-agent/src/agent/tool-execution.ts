import type { Page } from 'playwright'
import type { AgentConfig, AgentState, OnProgressCallback, ToolCall } from '../types'
import { getToolExecutor } from '../tools'
import type { JobExtractor } from '../agent'
import { addExtractedJobsToState } from './evidence'

export async function executeToolCall(
  toolCall: ToolCall,
  page: Page,
  state: AgentState,
  config: AgentConfig,
  jobExtractor: JobExtractor,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal
): Promise<unknown> {
  const toolName = toolCall.function.name
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(toolCall.function.arguments || '{}')
  } catch (parseError) {
    console.error(`[Agent] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments, parseError)
    return {
      success: false,
      error: `Invalid tool arguments for ${toolName}`
    }
  }

  onProgress?.({
    currentUrl: state.currentUrl,
    jobsFound: state.collectedJobs.length,
    stepCount: state.stepCount,
    currentAction: `${toolName}: ${JSON.stringify(args)}`,
    targetId: null,
    adapterKind: config.source
  })

  const tool = getToolExecutor(toolName)
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`
    }
  }

  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const result = await tool.execute(args, { page, state, config })

      if (toolName !== 'extract_jobs' || !result.success || !result.data) {
        return result
      }

      const extractData = result.data as {
        pageText: string
        pageUrl: string
        pageType: string
        readyForExtraction: boolean
      }

      if (!extractData.readyForExtraction) {
        return result
      }

      const normalizedPageType = extractData.pageType === 'job_detail'
        ? 'job_detail'
        : 'search_results'
      const extractedJobs = await jobExtractor.extractJobsFromPage({
        pageText: extractData.pageText,
        pageUrl: extractData.pageUrl,
        pageType: normalizedPageType,
        maxJobs: config.targetJobCount - state.collectedJobs.length
      })
      const addedCount = addExtractedJobsToState(extractedJobs, state, config.source)

      if (addedCount > 0) {
        console.log(`[Agent] +${addedCount} jobs (${state.collectedJobs.length} total) from ${extractData.pageUrl.slice(0, 60)}...`)
      }

      onProgress?.({
        currentUrl: extractData.pageUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: `extract_result:${addedCount}:${state.collectedJobs.length}:${extractedJobs.length}`,
        targetId: null,
        adapterKind: config.source
      })

      return {
        ...result,
        data: {
          ...result.data,
          jobsExtracted: extractedJobs.length,
          totalJobs: state.collectedJobs.length
        }
      }
    } catch (error) {
      if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
        throw error
      }
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown'}`
        }
      }
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }

  return {
    success: false,
    error: `Unknown tool: ${toolName}`
  }
}
