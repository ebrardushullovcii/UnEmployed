import type { Page } from 'playwright'
import type { AgentConfig, AgentState, DeferredSearchExtraction, OnProgressCallback, ToolCall } from '../types'
import { getToolExecutor } from '../tools'
import type { JobExtractor } from '../agent'
import { addExtractedJobsToState } from './evidence'

function isExtractJobsPayload(value: unknown): value is {
  pageText: string
  pageUrl: string
  pageType: string
  readyForExtraction: boolean
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.pageText === 'string' &&
    typeof candidate.pageUrl === 'string' &&
    typeof candidate.pageType === 'string' &&
    typeof candidate.readyForExtraction === 'boolean'
  )
}

function redactToolArgs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(() => '[REDACTED]')
  }

  if (!value || typeof value !== 'object') {
    return '[REDACTED]'
  }

  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>).map((key) => [key, '[REDACTED]'])
  )
}

function describeToolAction(toolName: string): string {
  switch (toolName) {
    case 'navigate':
      return 'Opening the next page.'
    case 'click':
      return 'Opening a result, detail page, or in-page control.'
    case 'fill':
      return 'Filling a form or filter control.'
    case 'select_option':
      return 'Choosing a value from the current page.'
    case 'scroll_down':
      return 'Scrolling to reveal more results.'
    case 'go_back':
      return 'Returning to the previous page.'
    case 'extract_jobs':
      return 'Preparing the current page for job extraction.'
    case 'finish':
      return 'Wrapping up this browser pass.'
    default:
      return `Executing ${toolName.replace(/_/g, ' ')}.`
  }
}

function buildDeferredSearchExtractionKey(pageUrl: string): string {
  try {
    const parsedUrl = new URL(pageUrl)
    const removableParams = ['currentJobId', 'selectedJobId', 'jobId', 'trk', 'trackingId']

    for (const key of removableParams) {
      parsedUrl.searchParams.delete(key)
    }

    parsedUrl.hash = ''
    const normalizedSearch = parsedUrl.searchParams.toString()

    return `${parsedUrl.origin}${parsedUrl.pathname}${normalizedSearch ? `?${normalizedSearch}` : ''}`
  } catch {
    return pageUrl
  }
}

function createDeferredSearchExtraction(input: {
  pageUrl: string
  pageText: string
}): DeferredSearchExtraction {
  return {
    key: buildDeferredSearchExtractionKey(input.pageUrl),
    pageUrl: input.pageUrl,
    pageText: input.pageText,
    capturedAt: new Date().toISOString()
  }
}

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
    const parsedArgs = JSON.parse(toolCall.function.arguments || '{}')
    if (!parsedArgs || typeof parsedArgs !== 'object' || Array.isArray(parsedArgs)) {
      throw new Error('Tool arguments must be a JSON object')
    }
    args = parsedArgs
  } catch (parseError) {
    console.error(`[Agent] Failed to parse tool arguments for ${toolName}:`, parseError)
    return {
      success: false,
      error: `Invalid tool arguments for ${toolName}`
    }
  }

  const redactedArgs = redactToolArgs(args)

  onProgress?.({
    currentUrl: state.currentUrl,
    jobsFound: state.collectedJobs.length,
    stepCount: state.stepCount,
    currentAction: `${toolName}: ${JSON.stringify(redactedArgs)}`,
    message: describeToolAction(toolName),
    waitReason: 'executing_tool',
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
  const shouldRetry = tool.retryable === true
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const result = await tool.execute(args, { page, state, config })

      if (toolName !== 'extract_jobs' || !result.success || !result.data) {
        return result
      }

      if (!isExtractJobsPayload(result.data)) {
        return {
          success: false,
          error: 'extract_jobs returned malformed data'
        }
      }

      const extractData = result.data

      if (!extractData.readyForExtraction) {
        return result
      }

      const normalizedPageType = extractData.pageType === 'job_detail'
        ? 'job_detail'
        : 'search_results'
      const shouldDeferSearchExtraction =
        normalizedPageType === 'search_results' &&
        !config.promptContext.taskPacket

      if (shouldDeferSearchExtraction) {
        const deferredSnapshot = createDeferredSearchExtraction({
          pageUrl: extractData.pageUrl,
          pageText: extractData.pageText
        })
        const existingSnapshot = state.deferredSearchExtractions.get(deferredSnapshot.key)

        if (!existingSnapshot || deferredSnapshot.pageText.length >= existingSnapshot.pageText.length) {
          state.deferredSearchExtractions.set(deferredSnapshot.key, deferredSnapshot)
        }

        onProgress?.({
          currentUrl: extractData.pageUrl,
          jobsFound: state.collectedJobs.length,
          stepCount: state.stepCount,
          currentAction: 'defer_extract_jobs',
          message:
            state.deferredSearchExtractions.size === 1
              ? 'Captured this results page for end-of-run extraction.'
              : `Captured this results page for end-of-run extraction (${state.deferredSearchExtractions.size} queued).`,
          waitReason: 'extracting_jobs',
          targetId: null,
          adapterKind: config.source
        })

        return {
          ...result,
          data: {
            ...result.data,
            jobsExtracted: 0,
            jobsDeferred: state.deferredSearchExtractions.size,
            totalJobs: state.collectedJobs.length,
            deferredExtraction: true
          }
        }
      }

      const maxJobs = Math.max(0, config.targetJobCount - state.collectedJobs.length)
      onProgress?.({
        currentUrl: extractData.pageUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'extract_jobs',
        message: 'Extracting jobs from the current page.',
        waitReason: 'extracting_jobs',
        targetId: null,
        adapterKind: config.source
      })
      const extractedJobs = maxJobs === 0
        ? []
        : await jobExtractor.extractJobsFromPage({
            pageText: extractData.pageText,
            pageUrl: extractData.pageUrl,
            pageType: normalizedPageType,
            maxJobs
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
        message: addedCount > 0
          ? `Kept ${addedCount} new job${addedCount === 1 ? '' : 's'} from this extraction pass.`
          : 'Reviewed the extraction pass and kept no new jobs.',
        waitReason: 'extracting_jobs',
        targetId: null,
        adapterKind: config.source
      })

      return {
        ...result,
        data: {
          ...result.data,
          jobsExtracted: addedCount,
          totalJobs: state.collectedJobs.length
        }
      }
    } catch (error) {
      if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
        throw error
      }

      if (!shouldRetry || attempt === maxRetries) {
        return {
          success: false,
          error: shouldRetry
            ? `Failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown'}`
            : (error instanceof Error ? error.message : 'Unknown')
        }
      }

      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      onProgress?.({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: `retry:${toolName}`,
        message: `Retrying ${toolName.replace(/_/g, ' ')} after a temporary browser error (${attempt + 1}/${maxRetries}).`,
        waitReason: 'retrying_tool',
        targetId: null,
        adapterKind: config.source
      })
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }

  throw new Error(`Unreachable: executeToolCall exhausted retries without returning for ${toolName}`)
}
