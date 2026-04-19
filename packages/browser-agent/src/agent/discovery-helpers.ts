import type { Page } from 'playwright'
import type {
  AgentConfig,
  AgentProgress,
  AgentResult,
  AgentState,
  OnProgressCallback,
  ToolCall,
} from '../types'
import { getToolDefinitions } from '../tools'
import { addExtractedJobsToState } from './evidence'
import { buildStructuredCandidateJobs } from './job-extraction'
import type { JobExtractor, LLMClient } from './contracts'

const MAX_LLM_RETRY_ATTEMPTS = 3
const MAX_SEARCH_RESULTS_EXTRACTION_JOBS = 4

export interface ExtractionPassSummary {
  extractionPasses: number
  zeroYieldExtractionPasses: number
  trailingZeroYieldExtractionPasses: number
  newJobsAdded: number
}

export function buildAgentResult(
  state: AgentState,
  partial: Omit<
    AgentResult,
    | 'jobs'
    | 'steps'
    | 'transcriptMessageCount'
    | 'reviewTranscript'
    | 'compactionState'
    | 'compactionUsedFallbackTrigger'
  >,
): AgentResult {
  return {
    jobs: state.collectedJobs,
    steps: state.stepCount,
    transcriptMessageCount: state.conversation.length,
    reviewTranscript: state.reviewTranscript,
    compactionState: state.compactionState,
    compactionUsedFallbackTrigger: state.compactionStatus.usedMessageCountFallback,
    ...partial,
  }
}

export function createEmptyExtractionPassSummary(): ExtractionPassSummary {
  return {
    extractionPasses: 0,
    zeroYieldExtractionPasses: 0,
    trailingZeroYieldExtractionPasses: 0,
    newJobsAdded: 0,
  }
}

export function summarizeExtractionPassResult(result: unknown): ExtractionPassSummary {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return createEmptyExtractionPassSummary()
  }

  const candidate = result as {
    success?: unknown
    data?: unknown
  }

  if (
    candidate.success !== true ||
    !candidate.data ||
    typeof candidate.data !== 'object' ||
    Array.isArray(candidate.data)
  ) {
    return createEmptyExtractionPassSummary()
  }

  const data = candidate.data as Record<string, unknown>

  if (
    data.deferredExtraction === true ||
    typeof data.jobsExtracted !== 'number' ||
    !Number.isFinite(data.jobsExtracted)
  ) {
    return createEmptyExtractionPassSummary()
  }

  const newJobsAdded = Math.max(0, Math.floor(data.jobsExtracted))

  return {
    extractionPasses: 1,
    zeroYieldExtractionPasses: newJobsAdded > 0 ? 0 : 1,
    trailingZeroYieldExtractionPasses: newJobsAdded > 0 ? 0 : 1,
    newJobsAdded,
  }
}

export function getNonRouteEvidenceSignalCount(state: AgentState): number {
  return (
    state.phaseEvidence.visibleControls.length +
    state.phaseEvidence.successfulInteractions.length +
    state.phaseEvidence.attemptedControls.length +
    state.phaseEvidence.warnings.length +
    state.collectedJobs.length
  )
}

export function getEvidenceSignalCount(state: AgentState): number {
  return getNonRouteEvidenceSignalCount(state) + state.phaseEvidence.routeSignals.length
}

export function hasSufficientEarlyForcedFinishEvidence(
  state: AgentState,
  config: AgentConfig,
): boolean {
  const sampleBudgetSatisfied = state.collectedJobs.length >= config.targetJobCount

  if (!sampleBudgetSatisfied) {
    return false
  }

  return (
    state.phaseEvidence.routeSignals.length >= 3 ||
    state.phaseEvidence.successfulInteractions.length > 0 ||
    (state.phaseEvidence.visibleControls.length > 0 &&
      state.phaseEvidence.attemptedControls.length > 0)
  )
}

export async function flushDeferredSearchExtractions(input: {
  state: AgentState
  config: AgentConfig
  jobExtractor: JobExtractor
  emitProgress: ReturnType<typeof createProgressEmitter>
  mode?: 'batch' | 'final'
  signal?: AbortSignal
}): Promise<ExtractionPassSummary> {
  const deferredSearchPages = [...input.state.deferredSearchExtractions.values()]
  const summary = createEmptyExtractionPassSummary()

  if (deferredSearchPages.length === 0) {
    return summary
  }

  input.emitProgress({
    currentAction: 'finalize_deferred_extraction',
    waitReason: 'extracting_jobs',
    jobsFound: input.state.collectedJobs.length,
    message:
      input.mode === 'final'
        ? deferredSearchPages.length === 1
          ? 'Reviewing the captured results page before wrapping up.'
          : `Reviewing ${deferredSearchPages.length} captured results pages before wrapping up.`
        : deferredSearchPages.length === 1
          ? 'Reviewing the captured results page to see if we already have enough jobs.'
          : `Reviewing ${deferredSearchPages.length} captured results pages to see if we already have enough jobs.`,
  })

  for (let index = 0; index < deferredSearchPages.length; index += 1) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const deferredSearchPage = deferredSearchPages[index]!
    const maxJobs = Math.min(
      Math.max(0, input.config.targetJobCount - input.state.collectedJobs.length),
      MAX_SEARCH_RESULTS_EXTRACTION_JOBS,
    )

    if (maxJobs === 0) {
      break
    }

    input.emitProgress({
      currentAction: 'finalize_deferred_extraction',
      currentUrl: deferredSearchPage.pageUrl,
      waitReason: 'extracting_jobs',
      jobsFound: input.state.collectedJobs.length,
      message:
        input.mode === 'final'
          ? deferredSearchPages.length === 1
            ? 'Extracting jobs from the captured results page.'
            : `Extracting jobs from captured results page ${index + 1}/${deferredSearchPages.length}.`
          : deferredSearchPages.length === 1
            ? 'Extracting jobs from the captured results page before continuing.'
            : `Extracting jobs from captured results page ${index + 1}/${deferredSearchPages.length} before continuing.`,
    })

    const fastPathJobs = buildStructuredCandidateJobs({
      pageUrl: deferredSearchPage.pageUrl,
      maxJobs,
      structuredDataCandidates: deferredSearchPage.structuredDataCandidates ?? [],
      cardCandidates: deferredSearchPage.cardCandidates ?? [],
    })
    const fastPathAddedCount = addExtractedJobsToState(
      fastPathJobs,
      input.state,
      input.config.source,
    )
    const remainingJobsAfterFastPath = Math.max(
      0,
      input.config.targetJobCount - input.state.collectedJobs.length,
    )
    const remainingSearchResultsBudget = Math.min(
      remainingJobsAfterFastPath,
      Math.max(0, maxJobs - fastPathAddedCount),
    )
    const extractedJobs =
      remainingSearchResultsBudget === 0
        ? []
        : await input.jobExtractor.extractJobsFromPage({
            pageText: deferredSearchPage.pageText,
            pageUrl: deferredSearchPage.pageUrl,
            pageType: 'search_results',
            maxJobs: remainingSearchResultsBudget,
          })
    const addedCount = addExtractedJobsToState(
      extractedJobs,
      input.state,
      input.config.source,
    )
    const totalAddedCount = fastPathAddedCount + addedCount
    summary.extractionPasses += 1
    summary.newJobsAdded += totalAddedCount

    if (totalAddedCount === 0) {
      summary.zeroYieldExtractionPasses += 1
      summary.trailingZeroYieldExtractionPasses += 1
    } else {
      summary.trailingZeroYieldExtractionPasses = 0
    }

    if (fastPathAddedCount > 0) {
      console.log(
        `[Agent] +${fastPathAddedCount} jobs (${input.state.collectedJobs.length} total) from deferred structured extraction ${deferredSearchPage.pageUrl.slice(0, 60)}...`,
      )
    }

    if (addedCount > 0) {
      console.log(
        `[Agent] +${addedCount} jobs (${input.state.collectedJobs.length} total) from deferred extraction ${deferredSearchPage.pageUrl.slice(0, 60)}...`,
      )
    }

    input.emitProgress({
      currentAction: `deferred_extract_result:${totalAddedCount}:${input.state.collectedJobs.length}:${fastPathJobs.length + extractedJobs.length}`,
      currentUrl: deferredSearchPage.pageUrl,
      waitReason: 'extracting_jobs',
      jobsFound: input.state.collectedJobs.length,
      message:
        totalAddedCount > 0
          ? `Kept ${totalAddedCount} new job${totalAddedCount === 1 ? '' : 's'} from deferred extraction.`
          : 'Reviewed the deferred extraction pass and kept no new jobs.',
    })
  }

  input.state.deferredSearchExtractions.clear()
  return summary
}

export function createProgressEmitter(
  state: AgentState,
  config: AgentConfig,
  onProgress?: OnProgressCallback,
) {
  const startedAtMs = Date.now()

  return (input: {
    currentAction?: string
    currentUrl?: string
    jobsFound?: number
    stepCount?: number
    waitReason?: AgentProgress['waitReason']
    message?: AgentProgress['message']
  }) => {
    const lastActivityAt = new Date().toISOString()
    const currentUrl =
      input.currentUrl ||
      state.currentUrl ||
      state.lastStableUrl ||
      config.startingUrls[0] ||
      'about:blank'

    onProgress?.({
      currentUrl,
      jobsFound: input.jobsFound ?? state.collectedJobs.length,
      stepCount: input.stepCount ?? state.stepCount,
      currentAction: input.currentAction,
      message: input.message ?? null,
      waitReason: input.waitReason ?? null,
      elapsedMs: Date.now() - startedAtMs,
      lastActivityAt,
      targetId: null,
      adapterKind: config.source,
    })
  }
}

function canWaitForLoadState(
  page: Page,
): page is Page & { waitForLoadState: Page['waitForLoadState'] } {
  const pageWithOptionalWaitForLoadState: { waitForLoadState?: unknown } = page
  return typeof pageWithOptionalWaitForLoadState.waitForLoadState === 'function'
}

export async function waitForInitialPageReady(page: Page): Promise<void> {
  if (!canWaitForLoadState(page)) {
    return
  }

  await Promise.any([
    page.waitForLoadState('load', { timeout: 1_000 }),
    page.waitForLoadState('networkidle', { timeout: 1_000 }),
  ]).catch(() => undefined)
}

export async function getLlmResponse(
  page: Page,
  state: AgentState,
  tools: ReturnType<typeof getToolDefinitions>,
  llmClient: LLMClient,
  options?: {
    maxOutputTokens?: number
  },
  emitProgress?: (input: {
    currentAction?: string
    waitReason?: AgentProgress['waitReason']
    message?: AgentProgress['message']
  }) => void,
  signal?: AbortSignal,
): Promise<{ content?: string; toolCalls?: ToolCall[]; reasoning?: string }> {
  let llmResponse: { content?: string; toolCalls?: ToolCall[]; reasoning?: string } | null =
    null
  let lastLlmError: unknown = null

  for (let attempt = 0; attempt < MAX_LLM_RETRY_ATTEMPTS; attempt += 1) {
    const callStartMs = Date.now()
    let heartbeat: ReturnType<typeof setInterval> | null = null

    if (emitProgress) {
      heartbeat = setInterval(() => {
        const waitedSec = Math.round((Date.now() - callStartMs) / 1000)
        emitProgress?.({
          currentAction: 'thinking',
          waitReason: 'waiting_on_ai',
          message: `Waiting for AI response (${waitedSec}s)…`,
        })
      }, 10_000)
    }

    try {
      llmResponse = await llmClient.chatWithTools(state.conversation, tools, signal, options)
      break
    } catch (llmError) {
      if ((llmError instanceof DOMException && llmError.name === 'AbortError') || signal?.aborted) {
        throw llmError
      }

      lastLlmError = llmError

      if (attempt < MAX_LLM_RETRY_ATTEMPTS - 1) {
        emitProgress?.({
          currentAction: 'retrying_ai',
          waitReason: 'retrying_ai',
          message: `Retrying AI planning after a temporary model error (${attempt + 2}/${MAX_LLM_RETRY_ATTEMPTS}).`,
        })
        await page.waitForTimeout(500 * (attempt + 1))
      }
    } finally {
      if (heartbeat !== null) clearInterval(heartbeat)
    }
  }

  if (!llmResponse) {
    throw lastLlmError instanceof Error ? lastLlmError : new Error('LLM call failed')
  }

  return llmResponse
}
