import type { Page } from 'playwright'
import type { JobPosting } from '@unemployed/contracts'
import type {
  AgentConfig,
  AgentProgress,
  AgentMessage,
  AgentResult,
  AgentState,
  OnProgressCallback,
  ToolCall
} from './types'
import { getToolDefinitions } from './tools'
import { createSystemPrompt } from './prompts'
import { isAllowedUrl } from './allowlist'
import {
  appendConversationMessage,
  compactToolContent,
  getCompactionConfig,
  maybeCompactConversation,
  renderReviewTranscriptMessage
} from './agent/conversation'
import {
  appendPhaseEvidence,
  addExtractedJobsToState,
  createEmptyPhaseEvidence,
  hasMeaningfulPhaseEvidence,
  recordToolEvidence,
  sanitizeUrl,
  synthesizeFallbackDebugFindings
} from './agent/evidence'
import { recoverFrom404LikeSurface } from './agent/navigation-recovery'
import { executeToolCall } from './agent/tool-execution'
import { buildForcedFinishPrompt, createUserPrompt } from './agent/user-prompts'

export type AgentExtractorPageType = 'search_results' | 'job_detail'
const MAX_LLM_RETRY_ATTEMPTS = 3

export interface LLMClient {
  chatWithTools(
    messages: AgentMessage[],
    tools: ReturnType<typeof getToolDefinitions>,
    signal?: AbortSignal
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

function buildResult(state: AgentState, partial: Omit<AgentResult, 'jobs' | 'steps' | 'transcriptMessageCount' | 'reviewTranscript' | 'compactionState'>): AgentResult {
  return {
    jobs: state.collectedJobs,
    steps: state.stepCount,
    transcriptMessageCount: state.conversation.length,
    reviewTranscript: state.reviewTranscript,
    compactionState: state.compactionState,
    ...partial
  }
}

async function flushDeferredSearchExtractions(input: {
  state: AgentState
  config: AgentConfig
  jobExtractor: JobExtractor
  emitProgress: ReturnType<typeof createProgressEmitter>
  signal?: AbortSignal
}): Promise<void> {
  const deferredSearchPages = [...input.state.deferredSearchExtractions.values()]

  if (deferredSearchPages.length === 0) {
    return
  }

  input.emitProgress({
    currentAction: 'finalize_deferred_extraction',
    waitReason: 'extracting_jobs',
    jobsFound: input.state.collectedJobs.length,
    message:
      deferredSearchPages.length === 1
        ? 'Reviewing the captured results page before wrapping up.'
        : `Reviewing ${deferredSearchPages.length} captured results pages before wrapping up.`
  })

  for (let index = 0; index < deferredSearchPages.length; index += 1) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const deferredSearchPage = deferredSearchPages[index]!
    const maxJobs = Math.max(0, input.config.targetJobCount - input.state.collectedJobs.length)

    if (maxJobs === 0) {
      break
    }

    input.emitProgress({
      currentAction: 'finalize_deferred_extraction',
      currentUrl: deferredSearchPage.pageUrl,
      waitReason: 'extracting_jobs',
      jobsFound: input.state.collectedJobs.length,
      message:
        deferredSearchPages.length === 1
          ? 'Extracting jobs from the captured results page.'
          : `Extracting jobs from captured results page ${index + 1}/${deferredSearchPages.length}.`
    })

    const extractedJobs = await input.jobExtractor.extractJobsFromPage({
      pageText: deferredSearchPage.pageText,
      pageUrl: deferredSearchPage.pageUrl,
      pageType: 'search_results',
      maxJobs
    })
    const addedCount = addExtractedJobsToState(extractedJobs, input.state, input.config.source)

    if (addedCount > 0) {
      console.log(`[Agent] +${addedCount} jobs (${input.state.collectedJobs.length} total) from deferred extraction ${deferredSearchPage.pageUrl.slice(0, 60)}...`)
    }

    input.emitProgress({
      currentAction: `deferred_extract_result:${addedCount}:${input.state.collectedJobs.length}:${extractedJobs.length}`,
      currentUrl: deferredSearchPage.pageUrl,
      waitReason: 'extracting_jobs',
      jobsFound: input.state.collectedJobs.length,
      message:
        addedCount > 0
          ? `Kept ${addedCount} new job${addedCount === 1 ? '' : 's'} from deferred extraction.`
          : 'Reviewed the deferred extraction pass and kept no new jobs.'
    })
  }

  input.state.deferredSearchExtractions.clear()
}

function createProgressEmitter(
  state: AgentState,
  config: AgentConfig,
  onProgress?: OnProgressCallback
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
      adapterKind: config.source
    })
  }
}

function canWaitForLoadState(
  page: Page
): page is Page & { waitForLoadState: Page['waitForLoadState'] } {
  const pageWithOptionalWaitForLoadState: { waitForLoadState?: unknown } = page
  return typeof pageWithOptionalWaitForLoadState.waitForLoadState === 'function'
}

async function waitForInitialPageReady(page: Page): Promise<void> {
  if (!canWaitForLoadState(page)) {
    return
  }

  await Promise.any([
    page.waitForLoadState('load', { timeout: 1_000 }),
    page.waitForLoadState('networkidle', { timeout: 1_000 })
  ]).catch(() => undefined)
}

async function getLlmResponse(
  page: Page,
  state: AgentState,
  tools: ReturnType<typeof getToolDefinitions>,
  llmClient: LLMClient,
  emitProgress?: (input: {
    currentAction?: string
    waitReason?: AgentProgress['waitReason']
    message?: AgentProgress['message']
  }) => void,
  signal?: AbortSignal
): Promise<{ content?: string; toolCalls?: ToolCall[]; reasoning?: string }> {
  let llmResponse: { content?: string; toolCalls?: ToolCall[]; reasoning?: string } | null = null
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
          message: `Waiting for AI response (${waitedSec}s)…`
        })
      }, 10_000)
    }

    try {
      llmResponse = await llmClient.chatWithTools(state.conversation, tools, signal)
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
          message: `Retrying AI planning after a temporary model error (${attempt + 2}/${MAX_LLM_RETRY_ATTEMPTS}).`
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

export async function runAgentDiscovery(
  page: Page,
  config: AgentConfig,
  llmClient: LLMClient,
  jobExtractor: JobExtractor,
  onProgress?: OnProgressCallback,
  signal?: AbortSignal
): Promise<AgentResult> {
  console.log(`[Agent] Starting discovery: ${config.targetJobCount} jobs target`)
  let pendingDebugFindings: NonNullable<AgentResult['debugFindings']> | null = null
  let awaitingStructuredFinish = false
  let forcedFinishPromptSent = false
  const requiresExplicitFinish = Boolean(config.promptContext.taskPacket)

  const state: AgentState = {
    conversation: [
      { role: 'system', content: createSystemPrompt(config) },
      { role: 'user', content: createUserPrompt(config) }
    ],
    reviewTranscript: [
      renderReviewTranscriptMessage({ role: 'system', content: createSystemPrompt(config) }),
      renderReviewTranscriptMessage({ role: 'user', content: createUserPrompt(config) })
    ],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: '',
    lastStableUrl: '',
    isRunning: true,
    phaseEvidence: createEmptyPhaseEvidence(),
    compactionState: null
  }

  const tools = getToolDefinitions()
  const emitProgress = createProgressEmitter(state, config, onProgress)
  const buildDiscoveryResult = async (
    partial: Omit<AgentResult, 'jobs' | 'steps' | 'transcriptMessageCount' | 'reviewTranscript' | 'compactionState'>
  ): Promise<AgentResult> => {
    if (!requiresExplicitFinish && state.deferredSearchExtractions.size > 0) {
      await flushDeferredSearchExtractions({
        state,
        config,
        jobExtractor,
        emitProgress,
        signal
      })
    }

    return buildResult(state, partial)
  }

  try {
    const firstUrl = config.startingUrls[0]
    if (!firstUrl) {
      return buildResult(state, {
        error: 'No starting URLs provided',
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish ? 'No starting URLs provided' : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings
      })
    }

    if (!isAllowedUrl(firstUrl, config.navigationPolicy).valid) {
      console.error(`[Agent] Starting URL not allowed: ${firstUrl}`)
      return buildResult(state, {
        error: `Starting URL not in allowlist: ${firstUrl}`,
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish ? `Starting URL not in allowlist: ${firstUrl}` : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings
      })
    }

    emitProgress({
      currentAction: 'navigate',
      waitReason: 'waiting_on_page',
      message: 'Opening the starting page for this run.',
      currentUrl: firstUrl,
      stepCount: 0,
      jobsFound: 0
    })
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' })
    emitProgress({
      currentAction: 'page_settle',
      waitReason: 'waiting_on_page',
      message: 'Waiting for the starting page to settle before the first action.',
      currentUrl: page.url() || firstUrl,
      stepCount: 0,
      jobsFound: 0
    })
    await waitForInitialPageReady(page)
    const landedUrl = page.url()
    const landedUrlValidation = isAllowedUrl(landedUrl, config.navigationPolicy)
    if (!landedUrlValidation.valid) {
      console.error(`[Agent] Starting URL redirected off-allowlist: ${landedUrl}`)
      return buildResult(state, {
        error: landedUrlValidation.error,
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish ? landedUrlValidation.error ?? 'Starting URL redirected off-allowlist.' : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings
      })
    }

    state.currentUrl = landedUrl
    state.lastStableUrl = landedUrl
    state.visitedUrls.add(state.currentUrl)
    appendPhaseEvidence(state, 'routeSignals', [sanitizeUrl(landedUrl) ? `Started on ${sanitizeUrl(landedUrl)}` : null])
    console.log(`[Agent] Started at: ${state.currentUrl}`)

    while (state.stepCount < config.maxSteps && state.isRunning) {
      if (signal?.aborted) {
        return buildResult(state, {
          incomplete: true,
          phaseCompletionMode: requiresExplicitFinish ? 'interrupted' : null,
          phaseCompletionReason: requiresExplicitFinish ? 'The source-debug phase was interrupted before completion.' : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        })
      }

      state.stepCount += 1

      if (state.stepCount % 10 === 0) {
        console.log(`[Agent] Step ${state.stepCount}/${config.maxSteps} | Jobs: ${state.collectedJobs.length}`)
      }

      if (requiresExplicitFinish && !forcedFinishPromptSent && state.stepCount >= Math.max(2, config.maxSteps - 2)) {
        forcedFinishPromptSent = true
        appendConversationMessage(state, {
          role: 'user',
          content: buildForcedFinishPrompt(state, config)
        })
        maybeCompactConversation(state, config, createUserPrompt)
      }

      emitProgress({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'thinking',
        message: `Planning the next browser action (step ${state.stepCount}/${config.maxSteps}).`,
        waitReason: 'waiting_on_ai'
      })

      let response: { content?: string; toolCalls?: ToolCall[]; reasoning?: string }
      try {
        response = await getLlmResponse(page, state, tools, llmClient, emitProgress, signal)
      } catch (llmError) {
        if ((llmError instanceof DOMException && llmError.name === 'AbortError') || signal?.aborted) {
          throw llmError
        }
        const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown'
        console.error('[Agent] LLM call failed:', errorMessage)
        return buildResult(state, {
          error: `LLM call failed after ${MAX_LLM_RETRY_ATTEMPTS} attempts: ${errorMessage}`,
          phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
          phaseCompletionReason: requiresExplicitFinish ? `LLM call failed after ${MAX_LLM_RETRY_ATTEMPTS} attempts: ${errorMessage}` : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        })
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        appendConversationMessage(state, {
          role: 'assistant',
          content: response.content || 'No action taken'
        })
        maybeCompactConversation(state, config, createUserPrompt)

        if (!requiresExplicitFinish && state.stepCount >= config.maxSteps - 5) {
          return await buildDiscoveryResult({
            incomplete: true,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings
          })
        }

        if (requiresExplicitFinish && forcedFinishPromptSent) {
          break
        }

        continue
      }

      appendConversationMessage(state, {
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls
      })
      maybeCompactConversation(state, config, createUserPrompt)

      for (const toolCall of response.toolCalls) {
        const result = await executeToolCall(toolCall, page, state, config, jobExtractor, onProgress, signal)
        let parsedArguments: Record<string, unknown> = {}
        try {
          parsedArguments = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>
        } catch {
          parsedArguments = {}
        }
        recordToolEvidence(toolCall.function.name, parsedArguments, result, state)
        if (['navigate', 'click', 'fill', 'select_option', 'go_back'].includes(toolCall.function.name)) {
          await recoverFrom404LikeSurface(page, state)
        }

        const compactResult = toolCall.function.name === 'extract_jobs'
          ? {
              success: (result as { success?: boolean }).success,
              error: (result as { error?: string }).error,
              summary: (result as { data?: { jobsExtracted?: number } }).data
                ? `jobs:${(result as { data?: { jobsExtracted?: number } }).data?.jobsExtracted ?? 0}`
                : undefined
            }
          : result
        appendConversationMessage(state, {
          role: 'tool',
          toolCallId: toolCall.id,
          content: compactToolContent(JSON.stringify(compactResult), getCompactionConfig(config).maxToolPayloadChars)
        })
        maybeCompactConversation(state, config, createUserPrompt)

        if (toolCall.function.name === 'finish' && (result as { success?: boolean }).success === true) {
          pendingDebugFindings =
            (result as { data?: { debugFindings?: AgentResult['debugFindings'] } }).data?.debugFindings ?? pendingDebugFindings
          console.log(`[Agent] Finished: ${state.collectedJobs.length} jobs found`)
          return await buildDiscoveryResult({
            phaseCompletionMode: requiresExplicitFinish
              ? (forcedFinishPromptSent ? 'forced_finish' : 'structured_finish')
              : null,
            phaseCompletionReason: requiresExplicitFinish
              ? ((result as { data?: { reason?: string } }).data?.reason ?? null)
              : null,
            phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
            debugFindings: pendingDebugFindings
          })
        }
      }

      if (state.collectedJobs.length < config.targetJobCount) {
        continue
      }

      if (requiresExplicitFinish) {
        if (!awaitingStructuredFinish) {
          awaitingStructuredFinish = true
          appendConversationMessage(state, {
            role: 'user',
            content:
              'The evidence sampling budget is already satisfied. Do not stop yet unless the phase goal is complete. Either keep probing the missing route/control/detail evidence or call finish with structured site findings, including any reliable controls, tricky filters, navigation rules, and apply caveats you proved.'
          })
          maybeCompactConversation(state, config, createUserPrompt)
        }
        continue
      }

      console.log(`[Agent] Target reached: ${state.collectedJobs.length} jobs`)
      return await buildDiscoveryResult({
        phaseCompletionMode: null,
        phaseCompletionReason: null,
        phaseEvidence: null,
        debugFindings: pendingDebugFindings
      })
    }

    console.log(`[Agent] Max steps reached: ${state.collectedJobs.length} jobs`)
    const fallbackDebugFindings = pendingDebugFindings ?? (requiresExplicitFinish ? synthesizeFallbackDebugFindings(state) : null)
    const hasEvidence = hasMeaningfulPhaseEvidence(state)
    return await buildDiscoveryResult({
      incomplete: state.stepCount >= config.maxSteps,
      phaseCompletionMode: requiresExplicitFinish
        ? (hasEvidence ? 'timed_out_with_partial_evidence' : 'timed_out_without_evidence')
        : null,
      phaseCompletionReason: requiresExplicitFinish
        ? (hasEvidence
            ? 'The phase timed out before the worker returned a structured finish call.'
            : 'The phase timed out before the worker produced structured findings or reusable evidence.')
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: fallbackDebugFindings
    })
  } catch (error) {
    if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
      throw error
    }
    console.error('[Agent] Error:', error instanceof Error ? error.message : 'Unknown')
    return buildResult(state, {
      error: error instanceof Error ? error.message : 'Unknown error',
      phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
      phaseCompletionReason: requiresExplicitFinish ? (error instanceof Error ? error.message : 'Unknown error') : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: pendingDebugFindings
    })
  } finally {
    state.isRunning = false
  }
}
