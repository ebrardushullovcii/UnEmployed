import type { Page } from 'playwright'
import type { AgentConfig, AgentState, DeferredSearchExtraction, OnProgressCallback, ToolCall } from '../types'
import { getToolExecutor } from '../tools'
import type { JobExtractor } from '../agent'
import { addExtractedJobsToState } from './evidence'
import { buildStructuredCandidateJobs } from './job-extraction'

const MAX_SEARCH_RESULTS_EXTRACTION_JOBS = 4

function isExtractJobsPayload(value: unknown): value is {
  pageText: string
  pageUrl: string
  pageType: string
  readyForExtraction: boolean
  structuredDataCandidates?: unknown
  cardCandidates?: unknown
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
  structuredDataCandidates?: Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates']
  cardCandidates?: Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates']
}): DeferredSearchExtraction {
  return {
    key: buildDeferredSearchExtractionKey(input.pageUrl),
    pageUrl: input.pageUrl,
    pageText: input.pageText,
    capturedAt: new Date().toISOString(),
    structuredDataCandidates: input.structuredDataCandidates ? [...input.structuredDataCandidates] : [],
    cardCandidates: input.cardCandidates ? [...input.cardCandidates] : []
  }
}

function getStructuredCandidateKey(candidate: Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates'] extends readonly (infer T)[] | undefined ? T : never): string {
  const canonicalUrl = typeof candidate?.canonicalUrl === 'string' ? candidate.canonicalUrl.trim() : ''
  if (canonicalUrl) {
    return `url:${canonicalUrl}`
  }

  const sourceJobId = typeof candidate?.sourceJobId === 'string' ? candidate.sourceJobId.trim() : ''
  if (sourceJobId) {
    return `job:${sourceJobId}`
  }

  return `raw:${JSON.stringify(candidate)}`
}

function getCardCandidateKey(candidate: Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates'] extends readonly (infer T)[] | undefined ? T : never): string {
  return `url:${candidate.canonicalUrl}`
}

function mergeCandidateList<T>(
  existing: readonly T[] | undefined,
  incoming: readonly T[] | undefined,
  getKey: (candidate: T) => string
): T[] {
  const merged = new Map<string, T>()

  for (const candidate of existing ?? []) {
    merged.set(getKey(candidate), candidate)
  }

  for (const candidate of incoming ?? []) {
    merged.set(getKey(candidate), candidate)
  }

  return [...merged.values()]
}

function mergeDeferredSearchExtraction(
  existing: DeferredSearchExtraction | undefined,
  incoming: DeferredSearchExtraction
): DeferredSearchExtraction {
  if (!existing) {
    return incoming
  }

  const mergedStructuredCandidates = mergeCandidateList(
    existing.structuredDataCandidates,
    incoming.structuredDataCandidates,
    getStructuredCandidateKey
  )
  const mergedCardCandidates = mergeCandidateList(
    existing.cardCandidates,
    incoming.cardCandidates,
    getCardCandidateKey
  )
  const shouldPreferIncomingPageText =
    incoming.pageText.length >= existing.pageText.length ||
    mergedStructuredCandidates.length > (existing.structuredDataCandidates?.length ?? 0) ||
    mergedCardCandidates.length > (existing.cardCandidates?.length ?? 0)

  return {
    ...existing,
    ...(shouldPreferIncomingPageText ? {
      pageText: incoming.pageText,
      capturedAt: incoming.capturedAt
    } : {}),
    structuredDataCandidates: mergedStructuredCandidates,
    cardCandidates: mergedCardCandidates
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
          pageText: extractData.pageText,
          structuredDataCandidates: Array.isArray(extractData.structuredDataCandidates)
            ? extractData.structuredDataCandidates as Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates']
            : [],
          cardCandidates: Array.isArray(extractData.cardCandidates)
            ? extractData.cardCandidates as Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates']
            : []
        })
        const existingSnapshot = state.deferredSearchExtractions.get(deferredSnapshot.key)

        state.deferredSearchExtractions.set(
          deferredSnapshot.key,
          mergeDeferredSearchExtraction(existingSnapshot, deferredSnapshot)
        )

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

      const remainingJobs = Math.max(0, config.targetJobCount - state.collectedJobs.length)
      const maxJobs = normalizedPageType === 'search_results'
        ? Math.min(remainingJobs, MAX_SEARCH_RESULTS_EXTRACTION_JOBS)
        : remainingJobs
      const structuredDataCandidates = Array.isArray(extractData.structuredDataCandidates)
        ? extractData.structuredDataCandidates as NonNullable<Parameters<typeof buildStructuredCandidateJobs>[0]['structuredDataCandidates']>
        : []
      const cardCandidates = Array.isArray(extractData.cardCandidates)
        ? extractData.cardCandidates as NonNullable<Parameters<typeof buildStructuredCandidateJobs>[0]['cardCandidates']>
        : []
      const fastPathJobs = normalizedPageType === 'search_results'
        ? buildStructuredCandidateJobs({
            pageUrl: extractData.pageUrl,
            maxJobs,
            structuredDataCandidates,
            cardCandidates
          })
        : []
      const fastPathAddedCount = addExtractedJobsToState(fastPathJobs, state, config.source)
      const remainingJobsAfterFastPath = Math.max(0, config.targetJobCount - state.collectedJobs.length)
      const remainingSearchResultsBudget = normalizedPageType === 'search_results'
        ? Math.min(remainingJobsAfterFastPath, Math.max(0, maxJobs - fastPathAddedCount))
        : remainingJobsAfterFastPath
      const shouldSkipSlowSearchResultsExtraction =
        normalizedPageType === 'search_results' &&
        Boolean(config.promptContext.taskPacket) &&
        fastPathAddedCount > 0 &&
        remainingSearchResultsBudget === 0

      if (fastPathAddedCount > 0) {
        console.log(`[Agent] +${fastPathAddedCount} jobs (${state.collectedJobs.length} total) from structured extraction ${extractData.pageUrl.slice(0, 60)}...`)
      }

      if (shouldSkipSlowSearchResultsExtraction) {
        console.log(
          `[Agent] Skipping slower model extraction for phase-driven search results after fast path added ${fastPathAddedCount} job${fastPathAddedCount === 1 ? '' : 's'} from ${extractData.pageUrl.slice(0, 60)}...`,
        )
      }

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
      const extractedJobs = remainingSearchResultsBudget === 0 || shouldSkipSlowSearchResultsExtraction
        ? []
        : await jobExtractor.extractJobsFromPage({
            pageText: extractData.pageText,
            pageUrl: extractData.pageUrl,
            pageType: normalizedPageType,
            maxJobs: remainingSearchResultsBudget
          })
      const addedCount = addExtractedJobsToState(extractedJobs, state, config.source)
      const totalAddedCount = fastPathAddedCount + addedCount

      if (addedCount > 0) {
        console.log(`[Agent] +${addedCount} jobs (${state.collectedJobs.length} total) from ${extractData.pageUrl.slice(0, 60)}...`)
      }

      onProgress?.({
        currentUrl: extractData.pageUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: `extract_result:${totalAddedCount}:${state.collectedJobs.length}:${fastPathJobs.length + extractedJobs.length}`,
        message: totalAddedCount > 0
          ? `Kept ${totalAddedCount} new job${totalAddedCount === 1 ? '' : 's'} from this extraction pass.`
          : 'Reviewed the extraction pass and kept no new jobs.',
        waitReason: 'extracting_jobs',
        targetId: null,
        adapterKind: config.source
      })

      return {
        ...result,
        data: {
          ...result.data,
          jobsExtracted: totalAddedCount,
          fastPathJobsExtracted: fastPathAddedCount,
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
