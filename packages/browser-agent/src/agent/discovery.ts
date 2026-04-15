import type { Page } from 'playwright'
import type { AgentConfig, AgentResult, AgentState } from '../types'
import { getToolDefinitions } from '../tools'
import { createSystemPrompt } from '../prompts'
import { isAllowedUrl } from '../allowlist'
import {
  appendConversationMessage,
  compactToolContent,
  getCompactionConfig,
  maybeCompactConversation,
  renderReviewTranscriptMessage,
} from './conversation'
import {
  appendPhaseEvidence,
  createEmptyPhaseEvidence,
  hasMeaningfulPhaseEvidence,
  recordToolEvidence,
  sanitizeUrl,
  synthesizeFallbackDebugFindings,
} from './evidence'
import { recoverFrom404LikeSurface } from './navigation-recovery'
import { executeToolCall } from './tool-execution'
import { buildForcedFinishPrompt, createUserPrompt } from './user-prompts'
import type { JobExtractor, LLMClient } from './contracts'
import {
  buildAgentResult,
  createProgressEmitter,
  flushDeferredSearchExtractions,
  getEvidenceSignalCount,
  getLlmResponse,
  getNonRouteEvidenceSignalCount,
  hasSufficientEarlyForcedFinishEvidence,
  summarizeExtractionPassResult,
  waitForInitialPageReady,
  type ExtractionPassSummary,
} from './discovery-helpers'

const DEFERRED_SEARCH_EXTRACTION_BATCH_SIZE = 3
const DEFERRED_SEARCH_EXTRACTION_FLUSH_STEP_INTERVAL = 10
const DISCOVERY_STAGNATION_ZERO_YIELD_LIMIT = 3
const DISCOVERY_STAGNATION_STEP_WINDOW = 8
const EARLY_FORCED_FINISH_MIN_STEP = 4
const EARLY_FORCED_FINISH_STALE_STEP_WINDOW = 2

export async function runAgentDiscovery(
  page: Page,
  config: AgentConfig,
  llmClient: LLMClient,
  jobExtractor: JobExtractor,
  onProgress?: (progress: import('../types').AgentProgress) => void,
  signal?: AbortSignal,
): Promise<AgentResult> {
  console.log(`[Agent] Starting discovery: ${config.targetJobCount} jobs target`)
  let pendingDebugFindings: NonNullable<AgentResult['debugFindings']> | null = null
  let awaitingStructuredFinish = false
  let forcedFinishPromptSent = false
  const requiresExplicitFinish = Boolean(config.promptContext.taskPacket)

  const state: AgentState = {
    conversation: [
      { role: 'system', content: createSystemPrompt(config) },
      { role: 'user', content: createUserPrompt(config) },
    ],
    reviewTranscript: [
      renderReviewTranscriptMessage({ role: 'system', content: createSystemPrompt(config) }),
      renderReviewTranscriptMessage({ role: 'user', content: createUserPrompt(config) }),
    ],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    failedInteractionAttempts: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: '',
    lastStableUrl: '',
    isRunning: true,
    phaseEvidence: createEmptyPhaseEvidence(),
    compactionState: null,
  }
  let consecutiveZeroYieldExtractionPasses = 0
  let lastJobGainStep = 0
  let lastEvidenceSignalCount = getEvidenceSignalCount(state)
  let lastEvidenceGrowthStep = 0

  const tools = getToolDefinitions()
  const emitProgress = createProgressEmitter(state, config, onProgress)
  const recordEvidenceProgress = () => {
    const nextEvidenceSignalCount = getEvidenceSignalCount(state)

    if (nextEvidenceSignalCount > lastEvidenceSignalCount) {
      lastEvidenceSignalCount = nextEvidenceSignalCount
      lastEvidenceGrowthStep = state.stepCount
    }
  }
  const maybeTriggerEarlyForcedFinish = () => {
    if (!requiresExplicitFinish || forcedFinishPromptSent) {
      return false
    }

    const nonRouteEvidenceSignals = getNonRouteEvidenceSignalCount(state)
    if (nonRouteEvidenceSignals === 0) {
      return false
    }

    const minStepBeforeForcedFinish = Math.min(
      Math.max(2, config.maxSteps - 2),
      EARLY_FORCED_FINISH_MIN_STEP,
    )
    if (state.stepCount < minStepBeforeForcedFinish) {
      return false
    }

    if (!hasSufficientEarlyForcedFinishEvidence(state, config)) {
      return false
    }

    const evidenceStalled =
      state.stepCount - lastEvidenceGrowthStep >= EARLY_FORCED_FINISH_STALE_STEP_WINDOW
    if (!evidenceStalled) {
      return false
    }

    forcedFinishPromptSent = true
    appendConversationMessage(state, {
      role: 'user',
      content: buildForcedFinishPrompt(state, config),
    })
    maybeCompactConversation(state, config, createUserPrompt)
    return true
  }
  const recordExtractionPassSummary = (summary: ExtractionPassSummary) => {
    if (summary.extractionPasses === 0) {
      return
    }

    if (summary.newJobsAdded > 0) {
      consecutiveZeroYieldExtractionPasses = summary.trailingZeroYieldExtractionPasses
      lastJobGainStep = state.stepCount
      return
    }

    consecutiveZeroYieldExtractionPasses += summary.zeroYieldExtractionPasses
  }
  const buildDiscoveryResult = async (
    partial: Omit<
      AgentResult,
      'jobs' | 'steps' | 'transcriptMessageCount' | 'reviewTranscript' | 'compactionState'
    >,
  ): Promise<AgentResult> => {
    if (!requiresExplicitFinish && state.deferredSearchExtractions.size > 0) {
      await flushDeferredSearchExtractions({
        state,
        config,
        jobExtractor,
        emitProgress,
        mode: 'final',
        ...(signal ? { signal } : {}),
      })
    }

    const resolvedPartial =
      !requiresExplicitFinish && partial.incomplete === true
        ? {
            ...partial,
            incomplete: state.collectedJobs.length < config.targetJobCount,
          }
        : partial

    return buildAgentResult(state, resolvedPartial)
  }
  const maybeStopForStagnation = async (): Promise<AgentResult | null> => {
    if (
      requiresExplicitFinish ||
      state.collectedJobs.length >= config.targetJobCount ||
      state.deferredSearchExtractions.size > 0 ||
      consecutiveZeroYieldExtractionPasses < DISCOVERY_STAGNATION_ZERO_YIELD_LIMIT ||
      state.stepCount - lastJobGainStep < DISCOVERY_STAGNATION_STEP_WINDOW
    ) {
      return null
    }

    emitProgress({
      currentAction: 'stop_stagnant_source',
      currentUrl: state.currentUrl,
      jobsFound: state.collectedJobs.length,
      stepCount: state.stepCount,
      waitReason: 'finalizing',
      message: 'Stopping this source early because recent extraction passes stopped producing new jobs.',
    })
    console.log(
      `[Agent] Stopping early after ${consecutiveZeroYieldExtractionPasses} zero-yield extraction passes and ${state.stepCount - lastJobGainStep} stale steps`,
    )

    return buildDiscoveryResult({
      incomplete: true,
      phaseCompletionMode: null,
      phaseCompletionReason: null,
      phaseEvidence: null,
      debugFindings: pendingDebugFindings,
    })
  }

  try {
    const firstUrl = config.startingUrls[0]
    if (!firstUrl) {
      return buildAgentResult(state, {
        error: 'No starting URLs provided',
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish ? 'No starting URLs provided' : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings,
      })
    }

    if (!isAllowedUrl(firstUrl, config.navigationPolicy).valid) {
      console.error(`[Agent] Starting URL not allowed: ${firstUrl}`)
      return buildAgentResult(state, {
        error: `Starting URL not in allowlist: ${firstUrl}`,
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish
          ? `Starting URL not in allowlist: ${firstUrl}`
          : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings,
      })
    }

    emitProgress({
      currentAction: 'navigate',
      waitReason: 'waiting_on_page',
      message: 'Opening the starting page for this run.',
      currentUrl: firstUrl,
      stepCount: 0,
      jobsFound: 0,
    })
    await page.goto(firstUrl, { waitUntil: 'domcontentloaded' })
    emitProgress({
      currentAction: 'page_settle',
      waitReason: 'waiting_on_page',
      message: 'Waiting for the starting page to settle before the first action.',
      currentUrl: page.url() || firstUrl,
      stepCount: 0,
      jobsFound: 0,
    })
    await waitForInitialPageReady(page)
    const landedUrl = page.url()
    const landedUrlValidation = isAllowedUrl(landedUrl, config.navigationPolicy)
    if (!landedUrlValidation.valid) {
      console.error(`[Agent] Starting URL redirected off-allowlist: ${landedUrl}`)
      return buildAgentResult(state, {
        error: landedUrlValidation.error,
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish
          ? landedUrlValidation.error ?? 'Starting URL redirected off-allowlist.'
          : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings,
      })
    }

    state.currentUrl = landedUrl
    state.lastStableUrl = landedUrl
    state.visitedUrls.add(state.currentUrl)
    appendPhaseEvidence(state, 'routeSignals', [
      sanitizeUrl(landedUrl) ? `Started on ${sanitizeUrl(landedUrl)}` : null,
    ])
    console.log(`[Agent] Started at: ${state.currentUrl}`)

    while (state.stepCount < config.maxSteps && state.isRunning) {
      if (signal?.aborted) {
        return buildAgentResult(state, {
          incomplete: true,
          phaseCompletionMode: requiresExplicitFinish ? 'interrupted' : null,
          phaseCompletionReason: requiresExplicitFinish
            ? 'The source-debug phase was interrupted before completion.'
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        })
      }

      state.stepCount += 1

      if (state.stepCount % 10 === 0) {
        console.log(`[Agent] Step ${state.stepCount}/${config.maxSteps} | Jobs: ${state.collectedJobs.length}`)
      }

      if (
        requiresExplicitFinish &&
        !forcedFinishPromptSent &&
        state.stepCount >= Math.max(2, config.maxSteps - 2)
      ) {
        forcedFinishPromptSent = true
        appendConversationMessage(state, {
          role: 'user',
          content: buildForcedFinishPrompt(state, config),
        })
        maybeCompactConversation(state, config, createUserPrompt)
      }

      emitProgress({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'thinking',
        message: `Planning the next browser action (step ${state.stepCount}/${config.maxSteps}).`,
        waitReason: 'waiting_on_ai',
      })

      let response: { content?: string; toolCalls?: import('../types').ToolCall[]; reasoning?: string }
      try {
        response = await getLlmResponse(page, state, tools, llmClient, emitProgress, signal)
      } catch (llmError) {
        if ((llmError instanceof DOMException && llmError.name === 'AbortError') || signal?.aborted) {
          throw llmError
        }
        const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown'
        console.error('[Agent] LLM call failed:', errorMessage)
        return buildAgentResult(state, {
          error: `LLM call failed after 3 attempts: ${errorMessage}`,
          phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
          phaseCompletionReason: requiresExplicitFinish
            ? `LLM call failed after 3 attempts: ${errorMessage}`
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        })
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        appendConversationMessage(state, {
          role: 'assistant',
          content: response.content || 'No action taken',
        })
        maybeCompactConversation(state, config, createUserPrompt)

        if (!requiresExplicitFinish && state.deferredSearchExtractions.size > 0) {
          const flushSummary = await flushDeferredSearchExtractions({
            state,
            config,
            jobExtractor,
            emitProgress,
            mode: 'batch',
            ...(signal ? { signal } : {}),
          })
          recordExtractionPassSummary(flushSummary)
          recordEvidenceProgress()

          if (state.collectedJobs.length >= config.targetJobCount) {
            console.log(`[Agent] Target reached: ${state.collectedJobs.length} jobs`)
            return await buildDiscoveryResult({
              phaseCompletionMode: null,
              phaseCompletionReason: null,
              phaseEvidence: null,
              debugFindings: pendingDebugFindings,
            })
          }

          const stagnantResult = await maybeStopForStagnation()
          if (stagnantResult) {
            return stagnantResult
          }
        }

        recordEvidenceProgress()
        const earlyForcedFinishTriggered = maybeTriggerEarlyForcedFinish()

        if (!requiresExplicitFinish) {
          const stagnantResult = await maybeStopForStagnation()
          if (stagnantResult) {
            return stagnantResult
          }
        }

        if (!requiresExplicitFinish && state.stepCount >= config.maxSteps - 5) {
          return await buildDiscoveryResult({
            incomplete: true,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings,
          })
        }

        if (requiresExplicitFinish && forcedFinishPromptSent && !earlyForcedFinishTriggered) {
          break
        }

        continue
      }

      appendConversationMessage(state, {
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      })
      maybeCompactConversation(state, config, createUserPrompt)

      for (const toolCall of response.toolCalls) {
        const result = await executeToolCall(
          toolCall,
          page,
          state,
          config,
          jobExtractor,
          onProgress,
          signal,
        )
        recordExtractionPassSummary(summarizeExtractionPassResult(result))

        let parsedArguments: Record<string, unknown> = {}
        try {
          parsedArguments = JSON.parse(toolCall.function.arguments || '{}') as Record<
            string,
            unknown
          >
        } catch {
          parsedArguments = {}
        }

        recordToolEvidence(toolCall.function.name, parsedArguments, result, state)
        recordEvidenceProgress()

        if (['navigate', 'click', 'fill', 'select_option', 'go_back'].includes(toolCall.function.name)) {
          await recoverFrom404LikeSurface(page, state)
        }

        const compactResult =
          toolCall.function.name === 'extract_jobs'
            ? {
                success: (result as { success?: boolean }).success,
                error: (result as { error?: string }).error,
                summary: (result as { data?: { jobsExtracted?: number } }).data
                  ? `jobs:${(result as { data?: { jobsExtracted?: number } }).data?.jobsExtracted ?? 0}`
                  : undefined,
              }
            : result
        appendConversationMessage(state, {
          role: 'tool',
          toolCallId: toolCall.id,
          content: compactToolContent(
            JSON.stringify(compactResult),
            getCompactionConfig(config).maxToolPayloadChars,
          ),
        })
        maybeCompactConversation(state, config, createUserPrompt)

        if (toolCall.function.name === 'finish' && (result as { success?: boolean }).success === true) {
          pendingDebugFindings =
            (result as { data?: { debugFindings?: AgentResult['debugFindings'] } }).data
              ?.debugFindings ?? pendingDebugFindings
          console.log(`[Agent] Finished: ${state.collectedJobs.length} jobs found`)
          return await buildDiscoveryResult({
            phaseCompletionMode: requiresExplicitFinish
              ? forcedFinishPromptSent
                ? 'forced_finish'
                : 'structured_finish'
              : null,
            phaseCompletionReason: requiresExplicitFinish
              ? ((result as { data?: { reason?: string } }).data?.reason ?? null)
              : null,
            phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
            debugFindings: pendingDebugFindings,
          })
        }
      }

      if (
        !requiresExplicitFinish &&
        state.deferredSearchExtractions.size > 0 &&
        (state.deferredSearchExtractions.size >= DEFERRED_SEARCH_EXTRACTION_BATCH_SIZE ||
          state.stepCount % DEFERRED_SEARCH_EXTRACTION_FLUSH_STEP_INTERVAL === 0 ||
          state.stepCount >= config.maxSteps - 2)
      ) {
        const flushSummary = await flushDeferredSearchExtractions({
          state,
          config,
          jobExtractor,
          emitProgress,
          mode: 'batch',
          ...(signal ? { signal } : {}),
        })
        recordExtractionPassSummary(flushSummary)
        recordEvidenceProgress()
      }

      if (!requiresExplicitFinish && state.collectedJobs.length >= config.targetJobCount) {
        console.log(`[Agent] Target reached: ${state.collectedJobs.length} jobs`)
        return await buildDiscoveryResult({
          phaseCompletionMode: null,
          phaseCompletionReason: null,
          phaseEvidence: null,
          debugFindings: pendingDebugFindings,
        })
      }

      if (!requiresExplicitFinish) {
        const stagnantResult = await maybeStopForStagnation()
        if (stagnantResult) {
          return stagnantResult
        }

        continue
      }

      maybeTriggerEarlyForcedFinish()

      if (forcedFinishPromptSent) {
        continue
      }

      if (!awaitingStructuredFinish) {
        awaitingStructuredFinish = true
        appendConversationMessage(state, {
          role: 'user',
          content:
            'The evidence sampling budget is already satisfied. Do not stop yet unless the phase goal is complete. Either keep probing the missing route/control/detail evidence or call finish with structured site findings, including any reliable controls, tricky filters, navigation rules, and apply caveats you proved.',
        })
        maybeCompactConversation(state, config, createUserPrompt)
      }
    }

    console.log(`[Agent] Max steps reached: ${state.collectedJobs.length} jobs`)
    const fallbackDebugFindings =
      pendingDebugFindings ??
      (requiresExplicitFinish ? synthesizeFallbackDebugFindings(state) : null)
    const hasEvidence = hasMeaningfulPhaseEvidence(state)
    return await buildDiscoveryResult({
      incomplete: state.stepCount >= config.maxSteps,
      phaseCompletionMode: requiresExplicitFinish
        ? hasEvidence
          ? 'timed_out_with_partial_evidence'
          : 'timed_out_without_evidence'
        : null,
      phaseCompletionReason: requiresExplicitFinish
        ? hasEvidence
          ? 'The phase timed out before the worker returned a structured finish call.'
          : 'The phase timed out before the worker produced structured findings or reusable evidence.'
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: fallbackDebugFindings,
    })
  } catch (error) {
    if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
      throw error
    }
    console.error('[Agent] Error:', error instanceof Error ? error.message : 'Unknown')
    return buildAgentResult(state, {
      error: error instanceof Error ? error.message : 'Unknown error',
      phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
      phaseCompletionReason: requiresExplicitFinish
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: pendingDebugFindings,
    })
  } finally {
    state.isRunning = false
  }
}
