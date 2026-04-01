import type { Page } from 'playwright'
import {
  AgentDebugFindingsSchema,
  JobPostingSchema,
  SourceDebugPhaseEvidenceSchema,
  type JobPosting,
  type SourceDebugPhaseEvidence
} from '@unemployed/contracts'
import type {
  AgentConfig,
  AgentState,
  AgentResult,
  AgentMessage,
  ToolCall,
  OnProgressCallback
} from './types'
import { getToolDefinitions, getToolExecutor } from './tools'
import { createSystemPrompt } from './prompts'
import { isAllowedUrl } from './allowlist'

export type AgentExtractorPageType = 'search_results' | 'job_detail'
const DEFAULT_COMPACTION_CONFIG = {
  maxTranscriptMessages: 18,
  preserveRecentMessages: 8,
  maxToolPayloadChars: 240
} as const
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
  }): Promise<Array<Pick<
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
  >>>
}

function getCompactionConfig(config: AgentConfig) {
  return {
    ...DEFAULT_COMPACTION_CONFIG,
    ...config.compaction
  }
}

function compactToolContent(content: string, maxLength: number): string {
  return content.length <= maxLength ? content : `${content.slice(0, Math.max(0, maxLength - 12))}...[trimmed]`
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, ' ').trim()
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

function preserveCoherentRecentMessages(
  conversation: AgentMessage[],
  preserveRecentMessages: number
): AgentMessage[] {
  if (conversation.length === 0 || preserveRecentMessages <= 0) {
    return []
  }

  let startIndex = Math.max(0, conversation.length - preserveRecentMessages)

  while (startIndex > 0 && conversation[startIndex]?.role === 'tool') {
    const toolMessage = conversation[startIndex]
    if (toolMessage?.role !== 'tool') {
      break
    }

    let matchingAssistantIndex = -1

    for (let index = startIndex - 1; index >= 0; index -= 1) {
      const message = conversation[index]
      if (message?.role !== 'assistant' || !message.toolCalls) {
        continue
      }

      if (message.toolCalls.some((toolCall) => toolCall.id === toolMessage.toolCallId)) {
        matchingAssistantIndex = index
        break
      }
    }

    if (matchingAssistantIndex === -1) {
      startIndex += 1
      continue
    }

    startIndex = matchingAssistantIndex
    break
  }

  return conversation.slice(startIndex)
}

function buildCompactionSummary(state: AgentState, config: AgentConfig) {
  const taskPacket = config.promptContext.taskPacket
  const knownFacts = [
    ...(taskPacket?.knownFacts ?? []),
    `Visited ${state.visitedUrls.size} page${state.visitedUrls.size === 1 ? '' : 's'}.`,
    `Collected ${state.collectedJobs.length} job${state.collectedJobs.length === 1 ? '' : 's'}.`,
    state.currentUrl ? `Current URL: ${state.currentUrl}` : null
  ].filter((value): value is string => Boolean(value))

  return {
    compactedAt: new Date().toISOString(),
    compactionCount: (state.compactionState?.compactionCount ?? 0) + 1,
    summary: [
      taskPacket?.phaseGoal ? `Phase goal: ${taskPacket.phaseGoal}.` : null,
      taskPacket?.priorPhaseSummary ? `Prior summary: ${taskPacket.priorPhaseSummary}.` : null,
      `Agent reached step ${state.stepCount}.`,
      `Current URL is ${state.currentUrl || 'unknown'}.`
    ]
      .filter(Boolean)
      .join(' '),
    confirmedFacts: uniqueStrings([
      ...knownFacts,
      ...state.phaseEvidence.routeSignals.slice(0, 4),
      ...state.phaseEvidence.visibleControls.slice(0, 4)
    ]),
    blockerNotes: [],
    avoidStrategyFingerprints: taskPacket?.avoidStrategyFingerprints ?? [],
    preservedContext: state.collectedJobs.slice(0, 5).map((job) => `${job.title} at ${job.company}`)
  }
}

function createEmptyPhaseEvidence(): SourceDebugPhaseEvidence {
  return SourceDebugPhaseEvidenceSchema.parse({})
}

function appendPhaseEvidence(
  state: AgentState,
  key: keyof SourceDebugPhaseEvidence,
  values: readonly (string | null | undefined)[]
) {
  state.phaseEvidence[key] = uniqueStrings([...(state.phaseEvidence[key] ?? []), ...values])
}

function formatControlLabel(role: string | undefined, name: string | undefined, index?: number): string | null {
  const trimmedRole = role?.trim()
  const trimmedName = name?.trim()

  if (!trimmedRole || !trimmedName) {
    return null
  }

  return `${trimmedRole} "${trimmedName}"${typeof index === 'number' && index > 0 ? ` (#${index + 1})` : ''}`
}

function is404LikeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return /(^|\/)(404|not-found)(\/|$)/i.test(parsedUrl.pathname)
  } catch {
    return false
  }
}

function is404LikeTitle(title: string): boolean {
  return /\b(404|not found|page not found)\b/i.test(title)
}

async function recoverFrom404LikeSurface(page: Page, state: AgentState): Promise<void> {
  const currentUrl = page.url()
  const pageTitle = await page.title().catch(() => '')
  const is404Like = is404LikeUrl(currentUrl) || is404LikeTitle(pageTitle)

  if (!is404Like) {
    if (currentUrl) {
      state.lastStableUrl = currentUrl
    }
    return
  }

  appendPhaseEvidence(state, 'warnings', [
    `Reached a not-found route at ${currentUrl}; returned to the last known jobs surface.`
  ])

  if (!state.lastStableUrl || state.lastStableUrl === currentUrl) {
    return
  }

  try {
    await page.goto(state.lastStableUrl, { waitUntil: 'domcontentloaded', timeout: 5000 })
    await page.waitForTimeout(500)
    state.currentUrl = page.url()
    state.visitedUrls.add(state.currentUrl)
    appendPhaseEvidence(state, 'routeSignals', [
      `Recovered to the last known jobs surface after a not-found route: ${state.currentUrl}`
    ])
  } catch {
    // Keep the warning only when recovery fails.
  }
}

function buildForcedFinishPrompt(state: AgentState, config: AgentConfig): string {
  const taskPacket = config.promptContext.taskPacket
  const visibleControls = state.phaseEvidence.visibleControls.slice(0, 6)
  const routeSignals = state.phaseEvidence.routeSignals.slice(0, 6)
  const attemptedControls = state.phaseEvidence.attemptedControls.slice(0, 6)
  const warnings = state.phaseEvidence.warnings.slice(0, 4)

  return [
    'Final phase-closeout turn.',
    taskPacket?.phaseGoal ? `Phase goal: ${taskPacket.phaseGoal}` : null,
    'Your next response must call finish.',
    'Use the evidence you already observed. If no reusable control or route was proven, still call finish and say that explicitly.',
    state.currentUrl ? `Current URL: ${state.currentUrl}` : null,
    `Visited pages: ${state.visitedUrls.size}. Sampled jobs: ${state.collectedJobs.length}.`,
    visibleControls.length > 0 ? `Visible controls seen:\n${visibleControls.map((value) => `- ${value}`).join('\n')}` : null,
    routeSignals.length > 0 ? `Route signals seen:\n${routeSignals.map((value) => `- ${value}`).join('\n')}` : null,
    attemptedControls.length > 0 ? `Controls attempted:\n${attemptedControls.map((value) => `- ${value}`).join('\n')}` : null,
    warnings.length > 0 ? `Warnings:\n${warnings.map((value) => `- ${value}`).join('\n')}` : null
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
}

function synthesizeFallbackDebugFindings(state: AgentState): NonNullable<AgentResult['debugFindings']> | null {
  const reliableControls = state.phaseEvidence.visibleControls.slice(0, 4)
  const navigationTips = uniqueStrings([
    ...state.phaseEvidence.routeSignals.slice(0, 4),
    state.currentUrl ? `Last observed jobs surface: ${state.currentUrl}` : null
  ])
  const applyTips = uniqueStrings([
    state.collectedJobs.some((job) => job.applyPath === 'easy_apply' || job.easyApplyEligible)
      ? 'Use the on-site apply entry when the detail page exposes it.'
      : null,
    state.collectedJobs.some((job) => job.applyPath === 'external_redirect')
      ? 'Expect some listings to hand off apply to an external destination.'
      : null,
    state.collectedJobs.length > 0 &&
    !state.collectedJobs.some((job) => job.applyPath === 'easy_apply' || job.easyApplyEligible || job.applyPath === 'external_redirect')
      ? 'Treat applications as manual until a reliable on-site apply entry is proven.'
      : null
  ])
  const warnings = state.phaseEvidence.warnings.slice(0, 4)

  if (
    reliableControls.length === 0 &&
    navigationTips.length === 0 &&
    applyTips.length === 0 &&
    warnings.length === 0
  ) {
    return null
  }

  return AgentDebugFindingsSchema.parse({
    summary: uniqueStrings([
      navigationTips[0] ?? null,
      reliableControls[0] ? 'Observed reusable controls on the jobs surface, but the phase timed out before a structured finish.' : null,
      state.currentUrl ? `Observed a partial jobs surface at ${state.currentUrl}, but the phase timed out before structured completion.` : null
    ])[0] ?? 'The phase timed out before structured completion.',
    reliableControls,
    trickyFilters: [],
    navigationTips,
    applyTips,
    warnings
  })
}

function hasMeaningfulPhaseEvidence(state: AgentState): boolean {
  return (
    state.phaseEvidence.visibleControls.length > 0 ||
    state.phaseEvidence.successfulInteractions.length > 0 ||
    state.phaseEvidence.routeSignals.length > 0 ||
    state.phaseEvidence.attemptedControls.length > 0 ||
    state.phaseEvidence.warnings.length > 0 ||
    state.collectedJobs.length > 0
  )
}

function recordToolEvidence(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  state: AgentState
) {
  const normalizedResult = (result ?? {}) as {
    success?: boolean
    error?: string
    data?: Record<string, unknown>
  }
  const controlLabel = formatControlLabel(
    typeof args.role === 'string' ? args.role : undefined,
    typeof args.name === 'string' ? args.name : undefined,
    typeof args.index === 'number' ? args.index : undefined
  )

  if (toolName === 'get_interactive_elements' && normalizedResult.success && normalizedResult.data) {
    const elements = Array.isArray(normalizedResult.data.elements)
      ? normalizedResult.data.elements as Array<{ role?: string; name?: string; index?: number }>
      : []
    appendPhaseEvidence(
      state,
      'visibleControls',
      elements.slice(0, 8).map((element) => formatControlLabel(element.role, element.name, element.index))
    )
    return
  }

  if (toolName === 'navigate') {
    appendPhaseEvidence(state, 'routeSignals', [
      normalizedResult.success && typeof normalizedResult.data?.url === 'string'
        ? `Navigation reached ${normalizedResult.data.url}`
        : typeof normalizedResult.data?.requestedUrl === 'string'
          ? `Tried navigation to ${normalizedResult.data.requestedUrl}`
          : null
    ])
  }

  if (toolName === 'click' || toolName === 'fill' || toolName === 'select_option') {
    appendPhaseEvidence(state, 'attemptedControls', [
      controlLabel
        ? `${toolName === 'click' ? 'Clicked' : toolName === 'fill' ? 'Filled' : 'Selected'} ${controlLabel}`
        : null
    ])
  }

  if (toolName === 'click' && normalizedResult.success) {
    appendPhaseEvidence(state, 'successfulInteractions', [controlLabel ? `Clicked ${controlLabel}` : null])
  }

  if (toolName === 'fill' && normalizedResult.success) {
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    appendPhaseEvidence(state, 'successfulInteractions', [
      controlLabel ? `Filled ${controlLabel}${text ? ` with "${text.slice(0, 40)}"` : ''}` : null
    ])
  }

  if (toolName === 'select_option' && normalizedResult.success) {
    const optionText = typeof args.optionText === 'string' ? args.optionText.trim() : ''
    appendPhaseEvidence(state, 'successfulInteractions', [
      controlLabel ? `Selected "${optionText}" from ${controlLabel}` : null
    ])
  }

  if (toolName === 'scroll_down' && normalizedResult.success) {
    appendPhaseEvidence(state, 'successfulInteractions', ['Scrolled down on the current jobs surface'])
    appendPhaseEvidence(state, 'routeSignals', [
      normalizedResult.data?.newContentLoaded === true && state.currentUrl
        ? `Scrolling revealed additional content on ${state.currentUrl}`
        : null
    ])
  }

  if (toolName === 'scroll_to_top' && normalizedResult.success) {
    appendPhaseEvidence(state, 'successfulInteractions', ['Returned to the top of the current page to re-check header controls'])
    appendPhaseEvidence(state, 'routeSignals', [
      state.currentUrl ? `Returned to the top of ${state.currentUrl} to probe header controls again` : null
    ])
  }

  if ((toolName === 'click' || toolName === 'fill' || toolName === 'select_option') && normalizedResult.data) {
    const newUrl = typeof normalizedResult.data.newUrl === 'string' ? normalizedResult.data.newUrl : null
    if (newUrl) {
      appendPhaseEvidence(state, 'routeSignals', [
        `${toolName === 'click' ? 'Control click' : toolName === 'fill' ? 'Search submit' : 'Dropdown selection'} opened ${newUrl}`
      ])
    }
  }

  if (toolName === 'extract_jobs' && normalizedResult.success && normalizedResult.data) {
    const jobsExtracted = typeof normalizedResult.data.jobsExtracted === 'number' ? normalizedResult.data.jobsExtracted : 0
    const pageUrl = typeof normalizedResult.data.pageUrl === 'string' ? normalizedResult.data.pageUrl : state.currentUrl
    appendPhaseEvidence(state, 'routeSignals', [
      jobsExtracted > 0 ? `Job extraction found ${jobsExtracted} candidate jobs on ${pageUrl}` : null
    ])
  }

  if (normalizedResult.error) {
    appendPhaseEvidence(state, 'warnings', [`${toolName} failed: ${normalizedResult.error}`])
  }
}

function maybeCompactConversation(state: AgentState, config: AgentConfig) {
  const compaction = getCompactionConfig(config)

  if (state.conversation.length <= compaction.maxTranscriptMessages) {
    return
  }

  state.compactionState = buildCompactionSummary(state, config)
  const preservedMessages = preserveCoherentRecentMessages(state.conversation, compaction.preserveRecentMessages)
  state.conversation = [
    { role: 'system', content: createSystemPrompt(config) },
    { role: 'user', content: createUserPrompt(config) },
    {
      role: 'assistant',
      content: [
        'Compacted execution summary:',
        state.compactionState.summary,
        ...state.compactionState.confirmedFacts.map((fact) => `- ${fact}`)
      ].join('\n')
    },
    ...preservedMessages
  ]
}

function renderReviewTranscriptMessage(message: AgentMessage): string {
  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    const toolNames = message.toolCalls.map((toolCall) => toolCall.function.name).join(', ')
    const content = message.content.trim()
    return content
      ? `assistant: ${content} | tool_calls: ${toolNames}`
      : `assistant: tool_calls: ${toolNames}`
  }

  if (message.role === 'tool') {
    return `tool ${message.toolCallId}: ${message.content}`
  }

  return `${message.role}: ${message.content}`
}

function appendConversationMessage(state: AgentState, message: AgentMessage): void {
  state.conversation.push(message)
  state.reviewTranscript.push(renderReviewTranscriptMessage(message))
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
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: '',
    lastStableUrl: '',
    isRunning: true,
    phaseEvidence: createEmptyPhaseEvidence(),
    compactionState: null
  }

  const tools = getToolDefinitions()

  try {
    // Navigate to first starting URL
    const firstUrl = config.startingUrls[0]
    if (firstUrl) {
      if (!isAllowedUrl(firstUrl, config.navigationPolicy).valid) {
        console.error(`[Agent] Starting URL not allowed: ${firstUrl}`)
        return {
          jobs: [],
          steps: 0,
          error: `Starting URL not in allowlist: ${firstUrl}`,
          transcriptMessageCount: state.conversation.length,
          reviewTranscript: state.reviewTranscript,
          compactionState: state.compactionState,
          phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
          phaseCompletionReason: requiresExplicitFinish ? `Starting URL not in allowlist: ${firstUrl}` : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        }
      }
      await page.goto(firstUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const landedUrl = page.url()
      const landedUrlValidation = isAllowedUrl(landedUrl, config.navigationPolicy)
      if (!landedUrlValidation.valid) {
        console.error(`[Agent] Starting URL redirected off-allowlist: ${landedUrl}`)
        return {
          jobs: [],
          steps: 0,
          error: landedUrlValidation.error,
          transcriptMessageCount: state.conversation.length,
          reviewTranscript: state.reviewTranscript,
          compactionState: state.compactionState,
          phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
          phaseCompletionReason: requiresExplicitFinish ? landedUrlValidation.error ?? 'Starting URL redirected off-allowlist.' : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        }
      }
      state.currentUrl = landedUrl
      state.lastStableUrl = landedUrl
      state.visitedUrls.add(state.currentUrl)
      appendPhaseEvidence(state, 'routeSignals', [`Started on ${landedUrl}`])
      console.log(`[Agent] Started at: ${state.currentUrl}`)
    } else {
      return {
        jobs: [],
        steps: 0,
          error: 'No starting URLs provided',
          transcriptMessageCount: state.conversation.length,
          reviewTranscript: state.reviewTranscript,
          compactionState: state.compactionState,
        phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
        phaseCompletionReason: requiresExplicitFinish ? 'No starting URLs provided' : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings
      }
    }

    while (state.stepCount < config.maxSteps && state.isRunning) {
      if (signal?.aborted) {
        return {
          jobs: state.collectedJobs,
          steps: state.stepCount,
          incomplete: true,
          transcriptMessageCount: state.conversation.length,
          reviewTranscript: state.reviewTranscript,
          compactionState: state.compactionState,
          phaseCompletionMode: requiresExplicitFinish ? 'interrupted' : null,
          phaseCompletionReason: requiresExplicitFinish ? 'The source-debug phase was interrupted before completion.' : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        }
      }

      state.stepCount++

      // Report progress every 10 steps
      if (state.stepCount % 10 === 0) {
        console.log(`[Agent] Step ${state.stepCount}/${config.maxSteps} | Jobs: ${state.collectedJobs.length}`)
      }

      if (requiresExplicitFinish && !forcedFinishPromptSent && state.stepCount >= Math.max(1, config.maxSteps - 2)) {
        forcedFinishPromptSent = true
        appendConversationMessage(state, {
          role: 'user',
          content: buildForcedFinishPrompt(state, config)
        })
        maybeCompactConversation(state, config)
      }

      onProgress?.({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: 'Thinking...',
        targetId: null,
        adapterKind: config.source
      })

      // Get LLM decision
      let response: { content?: string; toolCalls?: ToolCall[]; reasoning?: string }
      try {
        let llmResponse: { content?: string; toolCalls?: ToolCall[]; reasoning?: string } | null = null
        let lastLlmError: unknown = null

        for (let attempt = 0; attempt < MAX_LLM_RETRY_ATTEMPTS; attempt += 1) {
          try {
            llmResponse = await llmClient.chatWithTools(state.conversation, tools, signal)
            break
          } catch (llmError) {
            if ((llmError instanceof DOMException && llmError.name === 'AbortError') || signal?.aborted) {
              throw llmError
            }

            lastLlmError = llmError

            if (attempt < MAX_LLM_RETRY_ATTEMPTS - 1) {
              await page.waitForTimeout(500 * (attempt + 1))
            }
          }
        }

        if (!llmResponse) {
          throw lastLlmError instanceof Error ? lastLlmError : new Error('LLM call failed')
        }

        response = llmResponse
      } catch (llmError) {
        if ((llmError instanceof DOMException && llmError.name === 'AbortError') || signal?.aborted) {
          throw llmError
        }
        const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown'
        console.error('[Agent] LLM call failed:', errorMessage)
        return {
          jobs: state.collectedJobs,
          steps: state.stepCount,
          error: `LLM call failed after ${MAX_LLM_RETRY_ATTEMPTS} attempts: ${errorMessage}`,
          transcriptMessageCount: state.conversation.length,
          reviewTranscript: state.reviewTranscript,
          compactionState: state.compactionState,
          phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
          phaseCompletionReason: requiresExplicitFinish ? `LLM call failed after ${MAX_LLM_RETRY_ATTEMPTS} attempts: ${errorMessage}` : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings
        }
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add single assistant message with all tool calls
        appendConversationMessage(state, {
          role: 'assistant',
          content: response.content || '',
          toolCalls: response.toolCalls
        })
        maybeCompactConversation(state, config)

        // Execute tool calls and add results
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
          maybeCompactConversation(state, config)

          // Check if we should finish
          if (toolCall.function.name === 'finish' && (result as { success?: boolean }).success === true) {
            pendingDebugFindings =
              (result as { data?: { debugFindings?: AgentResult['debugFindings'] } }).data?.debugFindings ?? pendingDebugFindings
            console.log(`[Agent] Finished: ${state.collectedJobs.length} jobs found`)
            return {
              jobs: state.collectedJobs,
              steps: state.stepCount,
              transcriptMessageCount: state.conversation.length,
              reviewTranscript: state.reviewTranscript,
              compactionState: state.compactionState,
              phaseCompletionMode: requiresExplicitFinish
                ? (forcedFinishPromptSent ? 'forced_finish' : 'structured_finish')
                : null,
              phaseCompletionReason: requiresExplicitFinish
                ? ((result as { data?: { reason?: string } }).data?.reason ?? null)
                : null,
              phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
              debugFindings: pendingDebugFindings
            }
          }
        }

        if (state.collectedJobs.length >= config.targetJobCount) {
          if (requiresExplicitFinish) {
            if (!awaitingStructuredFinish) {
              awaitingStructuredFinish = true
              appendConversationMessage(state, {
                role: 'user',
                content:
                  'The evidence sampling budget is already satisfied. Do not stop yet unless the phase goal is complete. Either keep probing the missing route/control/detail evidence or call finish with structured site findings, including any reliable controls, tricky filters, navigation rules, and apply caveats you proved.'
              })
              maybeCompactConversation(state, config)
            }
            continue
          }

          console.log(`[Agent] Target reached: ${state.collectedJobs.length} jobs`)
          return {
            jobs: state.collectedJobs,
            steps: state.stepCount,
            transcriptMessageCount: state.conversation.length,
            reviewTranscript: state.reviewTranscript,
            compactionState: state.compactionState,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings
          }
        }
      } else {
        // No tool calls, just text response
        appendConversationMessage(state, {
          role: 'assistant',
          content: response.content || 'No action taken'
        })
        maybeCompactConversation(state, config)

        // If no tool calls for multiple steps, we might be stuck
        if (!requiresExplicitFinish && state.stepCount >= config.maxSteps - 5) {
          return {
            jobs: state.collectedJobs,
            steps: state.stepCount,
            incomplete: true,
            transcriptMessageCount: state.conversation.length,
            reviewTranscript: state.reviewTranscript,
            compactionState: state.compactionState,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings
          }
        }

        if (requiresExplicitFinish && forcedFinishPromptSent) {
          break
        }
      }
    }

    console.log(`[Agent] Max steps reached: ${state.collectedJobs.length} jobs`)
    const fallbackDebugFindings = pendingDebugFindings ?? (requiresExplicitFinish ? synthesizeFallbackDebugFindings(state) : null)
    return {
      jobs: state.collectedJobs,
      steps: state.stepCount,
      incomplete: state.stepCount >= config.maxSteps,
      transcriptMessageCount: state.conversation.length,
      reviewTranscript: state.reviewTranscript,
      compactionState: state.compactionState,
      phaseCompletionMode: requiresExplicitFinish
        ? (hasMeaningfulPhaseEvidence(state) ? 'timed_out_with_partial_evidence' : 'timed_out_without_evidence')
        : null,
      phaseCompletionReason: requiresExplicitFinish
        ? (hasMeaningfulPhaseEvidence(state)
            ? 'The phase timed out before the worker returned a structured finish call.'
            : 'The phase timed out before the worker produced structured findings or reusable evidence.')
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: fallbackDebugFindings
    }
  } catch (error) {
    if ((error instanceof DOMException && error.name === 'AbortError') || signal?.aborted) {
      throw error
    }
    console.error('[Agent] Error:', error instanceof Error ? error.message : 'Unknown')
    return {
      jobs: state.collectedJobs,
      steps: state.stepCount,
      error: error instanceof Error ? error.message : 'Unknown error',
      transcriptMessageCount: state.conversation.length,
      reviewTranscript: state.reviewTranscript,
      compactionState: state.compactionState,
      phaseCompletionMode: requiresExplicitFinish ? 'runtime_failed' : null,
      phaseCompletionReason: requiresExplicitFinish ? (error instanceof Error ? error.message : 'Unknown error') : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: pendingDebugFindings
    }
  } finally {
    state.isRunning = false
  }
}

async function executeToolCall(
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

  // Handle browser tools
  const tool = getToolExecutor(toolName)
  if (tool) {
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        const result = await tool.execute(args, { page, state, config })
        
        // Special handling for extract_jobs
        if (toolName === 'extract_jobs' && result.success && result.data) {
          const extractData = result.data as {
            pageText: string
            pageUrl: string
            pageType: string
            readyForExtraction: boolean
          }
          
          if (extractData.readyForExtraction) {
            const normalizedPageType = extractData.pageType === 'job_detail'
              ? 'job_detail'
              : 'search_results'
            const extractedJobs = await jobExtractor.extractJobsFromPage({
              pageText: extractData.pageText,
              pageUrl: extractData.pageUrl,
              pageType: normalizedPageType,
              maxJobs: config.targetJobCount - state.collectedJobs.length
            })

            // Add unique jobs, preferring extractor-provided values over defaults
            let addedCount = 0
            for (const job of extractedJobs) {
              const exists = state.collectedJobs.some(j => j.sourceJobId === job.sourceJobId)
              if (!exists) {
                // Build job object and validate before adding
                const jobToAdd = {
                  source: config.source,
                  sourceJobId: job.sourceJobId,
                  discoveryMethod: 'browser_agent' as const,
                  canonicalUrl: job.canonicalUrl,
                  title: job.title,
                  company: job.company,
                  location: job.location,
                  workMode: (() => {
                    const allowedWorkModes = ['remote', 'hybrid', 'onsite', 'flexible'] as const
                    const validWorkModes = Array.isArray(job.workMode)
                      ? job.workMode.filter((m): m is typeof allowedWorkModes[number] =>
                          allowedWorkModes.includes(m)
                        )
                      : []
                    return validWorkModes.length > 0 ? validWorkModes : ['flexible']
                  })(),
                  applyPath: ['easy_apply', 'external_redirect', 'unknown'].includes(job.applyPath as string)
                    ? (job.applyPath)
                    : 'unknown',
                  easyApplyEligible: job.easyApplyEligible ?? false,
                  postedAt: job.postedAt || new Date().toISOString(),
                  discoveredAt: new Date().toISOString(),
                  salaryText: job.salaryText || null,
                  summary: job.summary || job.description.slice(0, 240),
                  description: job.description,
                  keySkills: job.keySkills ?? []
                }
                
                // Validate with schema before adding
                const validation = JobPostingSchema.safeParse(jobToAdd)
                if (validation.success) {
                  state.collectedJobs.push(validation.data)
                  addedCount++
                } else {
                  console.warn(`[Agent] Skipping invalid job ${job.sourceJobId}:`, validation.error)
                }
              }
            }

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
          }
        }

        return result
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
        // Wait before retry
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }
  }

  return {
    success: false,
    error: `Unknown tool: ${toolName}`
  }
}

function createUserPrompt(config: AgentConfig): string {
  const targetRoles = config.searchPreferences.targetRoles.length > 0
    ? config.searchPreferences.targetRoles.join(', ')
    : 'Not specified'
  const preferredLocations = config.searchPreferences.locations.length > 0
    ? config.searchPreferences.locations.join(', ')
    : 'Not specified'
  const taskPacket = config.promptContext.taskPacket
  const isPhaseDrivenDebugRun = Boolean(taskPacket)

  return `Please find job postings that match my profile and preferences.

Target Roles: ${targetRoles}
Preferred Locations: ${preferredLocations}
Experience Level: ${config.userProfile.yearsExperience != null ? `${config.userProfile.yearsExperience} years` : 'Not specified'}

Starting URLs to explore:
${config.startingUrls.map(url => `- ${url}`).join('\n')}

${isPhaseDrivenDebugRun
    ? `Phase Evidence Budget: sample up to ${config.targetJobCount} relevant job postings only when they help prove the phase goal. Reaching the sampling budget is not completion by itself.`
    : `Goal: Find ${config.targetJobCount} relevant job postings.`}

${taskPacket ? `Phase Goal: ${taskPacket.phaseGoal}
Known facts:
${taskPacket.knownFacts.length > 0 ? taskPacket.knownFacts.map((fact) => `- ${fact}`).join('\n') : '- None yet'}
Success criteria:
${taskPacket.successCriteria.length > 0 ? taskPacket.successCriteria.map((criterion) => `- ${criterion}`).join('\n') : '- Find credible evidence on the site'}
Stop conditions:
${taskPacket.stopConditions.length > 0 ? taskPacket.stopConditions.map((condition) => `- ${condition}`).join('\n') : '- Stop when progress stalls'}
` : ''}

The site may present listings in any language. Treat multilingual and non-English jobs as valid candidates when they match the target roles and locations.

Instructions:
${isPhaseDrivenDebugRun
    ? `1. Navigate to the starting URLs
2. On landing pages or jobs hubs, inspect visible controls and reusable entry paths before you start extracting jobs
3. Use search boxes, chips, dropdowns, filters, recommendation rows, and show-all routes when they are visible
4. Use select_option for visible dropdowns or combobox filters such as city, industry, category, or work mode
5. Extract structured job data only when it helps prove the current route, control, detail, or apply behavior
6. Click into job details to confirm stable identity or apply-entry behavior when needed
7. Call finish only after the phase goal is satisfied or you can clearly explain why progress is blocked`
    : `1. Navigate to the starting URLs
2. Use search functionality if available, or scroll through listings
3. Click into job details to get full descriptions when needed
4. Extract structured job data using the extract_jobs tool
5. Navigate back to continue searching
6. Continue until you've found ${config.targetJobCount} relevant jobs or exhausted options`}

Focus on recent postings that match the target roles and locations.`
}
