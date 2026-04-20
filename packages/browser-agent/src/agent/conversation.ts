import {
  SharedAgentCompactionPolicySchema,
  SharedAgentCompactionSnapshotSchema,
  type SharedAgentCompactionPolicy,
  type SharedAgentCompactionSnapshot,
  type SharedAgentCompactionTriggerKind,
} from '@unemployed/contracts'
import type {
  AgentCompactionStatus,
  AgentConfig,
  AgentMessage,
  AgentState,
  AgentTokenEstimatorContext,
  AgentTokenEstimatorResult,
} from '../types'
import { createSystemPrompt } from '../prompts'
import { uniqueStrings } from '../utils/string'

const DEFAULT_COMPACTION_CONFIG = SharedAgentCompactionPolicySchema.parse({})

const FORCED_CLOSEOUT_MARKER = 'Final phase-closeout turn.'
const NORMALIZED_CONTEXT_EXHAUSTED_REASON = 'Context budget exhausted after compaction.'

export interface ConversationTokenEstimate {
  estimatedInputTokens: number
  estimatedTotalTokens: number
}

export interface ConversationBudgetWindow {
  warningTokenBudget: number
  targetTokenBudget: number
}

export interface ConversationBudgetSnapshot {
  triggerKind: SharedAgentCompactionTriggerKind
  estimate: ConversationTokenEstimate | null
  effectiveBudget: ConversationBudgetWindow
}

function estimateTokensFromText(value: string): number {
  if (!value.trim()) {
    return 0
  }

  return Math.ceil(value.length / 4)
}

function estimateMessageTokens(message: AgentMessage): number {
  const baseTokens = estimateTokensFromText(message.content)

  if (message.role === 'assistant' && message.toolCalls) {
    return baseTokens + estimateTokensFromText(JSON.stringify(message.toolCalls))
  }

  if (message.role === 'tool') {
    return baseTokens + estimateTokensFromText(message.toolCallId)
  }

  return baseTokens
}

function estimateConversationTokensFallback(messages: readonly AgentMessage[]): ConversationTokenEstimate {
  const estimatedInputTokens = messages.reduce(
    (sum, message) => sum + estimateMessageTokens(message),
    0,
  )

  return {
    estimatedInputTokens,
    estimatedTotalTokens: estimatedInputTokens,
  }
}

function estimateConversationTokens(
  messages: readonly AgentMessage[],
  config: AgentConfig,
): ConversationTokenEstimate | null {
  const estimator = config.compactionCapability?.tokenEstimator
  const maxOutputTokens = getEffectiveCompactionConfig(config).minimumResponseHeadroomTokens

  if (!estimator) {
    return null
  }

  const result = estimator({ messages, maxOutputTokens } satisfies AgentTokenEstimatorContext)

  if (!result) {
    return null
  }

  return normalizeTokenEstimate(result)
}

function normalizeTokenEstimate(result: AgentTokenEstimatorResult): ConversationTokenEstimate | null {
  if (
    !Number.isFinite(result.estimatedInputTokens) ||
    result.estimatedInputTokens < 0 ||
    !Number.isFinite(result.estimatedTotalTokens) ||
    result.estimatedTotalTokens < 0
  ) {
    return null
  }

  return {
    estimatedInputTokens: Math.floor(result.estimatedInputTokens),
    estimatedTotalTokens: Math.max(
      Math.floor(result.estimatedTotalTokens),
      Math.floor(result.estimatedInputTokens),
    ),
  }
}

function getModelContextWindowTokens(config: AgentConfig): number | null {
  const value = config.compactionCapability?.modelContextWindowTokens ?? null
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null
}

export function getEffectiveCompactionConfig(config: AgentConfig): SharedAgentCompactionPolicy {
  const configCompaction = config.compaction ?? {}
  const workflowKey = config.compactionCapability?.compactionWorkflowKey ?? null
  const workflowOverrides = {
    ...DEFAULT_COMPACTION_CONFIG.workflowOverrides,
    ...(configCompaction.workflowOverrides ?? {}),
  }
  const workflowOverride = workflowKey
    ? workflowOverrides[workflowKey] ?? null
    : null
  const configCompactionRest = { ...configCompaction }
  delete configCompactionRest.workflowOverrides

  return SharedAgentCompactionPolicySchema.parse({
    ...DEFAULT_COMPACTION_CONFIG,
    workflowOverrides,
    ...configCompactionRest,
    ...(workflowOverride ?? {}),
  })
}

export function getCompactionBudgetWindow(config: AgentConfig): ConversationBudgetWindow {
  const compaction = getEffectiveCompactionConfig(config)
  const modelContextWindowTokens = getModelContextWindowTokens(config)
  const effectiveTarget = modelContextWindowTokens
    ? Math.min(
        compaction.targetTokenBudget,
        Math.max(1, modelContextWindowTokens - compaction.minimumResponseHeadroomTokens),
      )
    : compaction.targetTokenBudget
  const effectiveWarning = Math.min(compaction.warningTokenBudget, effectiveTarget)

  return {
    warningTokenBudget: effectiveWarning,
    targetTokenBudget: effectiveTarget,
  }
}

export function compactToolContent(content: string, maxLength: number): string {
  return content.length <= maxLength ? content : `${content.slice(0, Math.max(0, maxLength - 12))}...[trimmed]`
}

function isForcedCloseoutUserMessage(message: AgentMessage): boolean {
  return message.role === 'user' && message.content.includes(FORCED_CLOSEOUT_MARKER)
}

function extractStickyUserMessages(conversation: readonly AgentMessage[]): AgentMessage[] {
  const forcedCloseoutMessage = [...conversation].reverse().find(isForcedCloseoutUserMessage)

  return forcedCloseoutMessage ? [forcedCloseoutMessage] : []
}

function extractStickyWorkflowState(config: AgentConfig): string[] {
  const taskPacket = config.promptContext.taskPacket

  return uniqueStrings([
    taskPacket?.phaseGoal ? `Phase goal: ${taskPacket.phaseGoal}` : null,
    taskPacket?.priorPhaseSummary ? `Prior summary: ${taskPacket.priorPhaseSummary}` : null,
    taskPacket?.manualPrerequisiteState
      ? `Manual prerequisite: ${taskPacket.manualPrerequisiteState}`
      : null,
    taskPacket?.strategyLabel ? `Strategy label: ${taskPacket.strategyLabel}` : null,
    ...(taskPacket?.successCriteria ?? []).map((item) => `Success criterion: ${item}`),
    ...(taskPacket?.stopConditions ?? []).map((item) => `Stop condition: ${item}`),
  ])
}

function findMatchingAssistantIndex(conversation: readonly AgentMessage[], startIndex: number): number {
  const toolMessage = conversation[startIndex]
  if (toolMessage?.role !== 'tool') {
    return -1
  }

  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const message = conversation[index]
    if (message?.role !== 'assistant' || !message.toolCalls) {
      continue
    }

    if (message.toolCalls.some((toolCall) => toolCall.id === toolMessage.toolCallId)) {
      return index
    }
  }

  return -1
}

function preserveCoherentRecentMessages(
  conversation: AgentMessage[],
  preserveRecentMessages: number,
): AgentMessage[] {
  if (conversation.length === 0 || preserveRecentMessages <= 0) {
    return []
  }

  let startIndex = Math.max(0, conversation.length - preserveRecentMessages)

  while (startIndex > 0 && conversation[startIndex]?.role === 'tool') {
    const matchingAssistantIndex = findMatchingAssistantIndex(conversation, startIndex)

    if (matchingAssistantIndex === -1) {
      startIndex += 1
      continue
    }

    startIndex = matchingAssistantIndex
    break
  }

  return conversation.slice(startIndex)
}

function buildCompactionSummary(
  state: AgentState,
  config: AgentConfig,
  triggerKind: SharedAgentCompactionTriggerKind,
  estimatedTokensBefore: number | null,
  estimatedTokensAfter: number | null,
  compactionCountOverride?: number,
): SharedAgentCompactionSnapshot {
  const taskPacket = config.promptContext.taskPacket
  const knownFacts = [
    ...(taskPacket?.knownFacts ?? []),
    `Visited ${state.visitedUrls.size} page${state.visitedUrls.size === 1 ? '' : 's'}.`,
    `Collected ${state.collectedJobs.length} job${state.collectedJobs.length === 1 ? '' : 's'}.`,
    state.currentUrl ? `Current URL: ${state.currentUrl}` : null,
  ].filter((value): value is string => Boolean(value))

  return SharedAgentCompactionSnapshotSchema.parse({
    compactedAt: new Date().toISOString(),
    compactionCount:
      compactionCountOverride ?? (state.compactionState?.compactionCount ?? 0) + 1,
    triggerKind,
    estimatedTokensBefore,
    estimatedTokensAfter,
    summary: [
      taskPacket?.phaseGoal ? `Phase goal: ${taskPacket.phaseGoal}.` : null,
      taskPacket?.priorPhaseSummary ? `Prior summary: ${taskPacket.priorPhaseSummary}.` : null,
      `Agent reached step ${state.stepCount}.`,
      `Current URL is ${state.currentUrl ?? 'unknown'}.`,
    ]
      .filter(Boolean)
      .join(' '),
    confirmedFacts: uniqueStrings([
      ...knownFacts,
      ...state.phaseEvidence.routeSignals.slice(0, 4),
      ...state.phaseEvidence.visibleControls.slice(0, 4),
    ]),
    blockerNotes: [],
    avoidStrategyFingerprints: taskPacket?.avoidStrategyFingerprints ?? [],
    preservedContext: state.collectedJobs.slice(0, 5).map((job) => `${job.title} at ${job.company}`),
    stickyWorkflowState: extractStickyWorkflowState(config),
  })
}

export function renderReviewTranscriptMessage(message: AgentMessage): string {
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

export function appendConversationMessage(state: AgentState, message: AgentMessage): void {
  state.conversation.push(message)
  state.reviewTranscript.push(renderReviewTranscriptMessage(message))
}

function rebuildConversationFromSummary(input: {
  state: AgentState
  config: AgentConfig
  createUserPrompt: (config: AgentConfig) => string
  preserveRecentMessages: number
  triggerKind: SharedAgentCompactionTriggerKind
  estimatedTokensBefore: number | null
  baseSnapshot: SharedAgentCompactionSnapshot
}): ConversationTokenEstimate {
  const preservedMessages = preserveCoherentRecentMessages(
    input.state.conversation,
    input.preserveRecentMessages,
  )
  const stickyMessages = extractStickyUserMessages(input.state.conversation).filter(
    (stickyMessage) => !preservedMessages.some(
      (message) => message.role === stickyMessage.role && message.content === stickyMessage.content,
    ),
  )

  input.state.conversation = [
    { role: 'system', content: createSystemPrompt(input.config) },
    { role: 'user', content: input.createUserPrompt(input.config) },
    {
      role: 'assistant',
      content: [
        'Compacted execution summary:',
        input.baseSnapshot.summary,
        ...input.baseSnapshot.confirmedFacts.map((fact) => `- ${fact}`),
        ...(input.baseSnapshot.stickyWorkflowState.map((fact) => `- ${fact}`)),
      ].join('\n'),
    },
    ...stickyMessages,
    ...preservedMessages,
  ]

  const estimateAfter = estimateConversationTokensWithFallback(
    input.state.conversation,
    input.config,
  )
  input.state.compactionState = buildCompactionSummary(
    input.state,
    input.config,
    input.triggerKind,
    input.estimatedTokensBefore,
    estimateAfter.estimatedTotalTokens,
    input.baseSnapshot.compactionCount,
  )

  return estimateAfter
}

export function createAgentCompactionStatus(): AgentCompactionStatus {
  return {
    lastTriggerKind: null,
    usedMessageCountFallback: false,
    lastEstimatedTokensBefore: null,
    lastEstimatedTokensAfter: null,
  }
}

function shouldCompactConversation(
  state: AgentState,
  config: AgentConfig,
): ConversationBudgetSnapshot | null {
  const compaction = getEffectiveCompactionConfig(config)

  if (!compaction.enabled) {
    return null
  }

  const effectiveBudget = getCompactionBudgetWindow(config)
  const estimate = estimateConversationTokens(state.conversation, config)

  if (estimate) {
    if (estimate.estimatedTotalTokens >= effectiveBudget.warningTokenBudget) {
      return {
        triggerKind: 'token_budget',
        estimate,
        effectiveBudget,
      }
    }

    return null
  }

  if (state.conversation.length > compaction.messageCountFallbackThreshold) {
    return {
      triggerKind: 'message_count_fallback',
      estimate: null,
      effectiveBudget,
    }
  }

  return null
}

export function maybeCompactConversation(
  state: AgentState,
  config: AgentConfig,
  createUserPrompt: (config: AgentConfig) => string,
): boolean {
  const compaction = getEffectiveCompactionConfig(config)
  const budgetSnapshot = shouldCompactConversation(state, config)

  if (!budgetSnapshot) {
    return true
  }

  const estimatedTokensBefore = budgetSnapshot.estimate?.estimatedTotalTokens
    ? budgetSnapshot.estimate.estimatedTotalTokens
    : estimateConversationTokensWithFallback(state.conversation, config).estimatedTotalTokens
  const baseSnapshot = buildCompactionSummary(
    state,
    config,
    budgetSnapshot.triggerKind,
    estimatedTokensBefore,
    null,
    (state.compactionState?.compactionCount ?? 0) + 1,
  )

  const firstPassEstimate = rebuildConversationFromSummary({
    state,
    config,
    createUserPrompt,
    preserveRecentMessages: compaction.preserveRecentMessages,
    triggerKind: budgetSnapshot.triggerKind,
    estimatedTokensBefore,
    baseSnapshot,
  })

  const finalEstimate = (() => {
    if (firstPassEstimate.estimatedTotalTokens <= budgetSnapshot.effectiveBudget.warningTokenBudget) {
      return firstPassEstimate
    }

    if (compaction.minimumPreserveRecentMessages >= compaction.preserveRecentMessages) {
      return firstPassEstimate
    }

    return rebuildConversationFromSummary({
      state,
      config,
      createUserPrompt,
      preserveRecentMessages: compaction.minimumPreserveRecentMessages,
      triggerKind: budgetSnapshot.triggerKind,
      estimatedTokensBefore,
      baseSnapshot,
    })
  })()

  state.compactionStatus.lastTriggerKind = budgetSnapshot.triggerKind
  state.compactionStatus.usedMessageCountFallback =
    budgetSnapshot.triggerKind === 'message_count_fallback'
  state.compactionStatus.lastEstimatedTokensBefore = estimatedTokensBefore
  state.compactionStatus.lastEstimatedTokensAfter = finalEstimate.estimatedTotalTokens

  if (finalEstimate.estimatedTotalTokens > budgetSnapshot.effectiveBudget.targetTokenBudget) {
    return false
  }

  return true
}

export function shouldFailForContextBudget(
  state: AgentState,
  config: AgentConfig,
): boolean {
  const estimate = getModelContextWindowTokens(config)
    ? estimateConversationTokensWithFallback(state.conversation, config)
    : estimateConversationTokens(state.conversation, config)

  if (!estimate) {
    return false
  }

  return estimate.estimatedTotalTokens > getCompactionBudgetWindow(config).targetTokenBudget
}

export function createContextBudgetFailureReason(): string {
  return NORMALIZED_CONTEXT_EXHAUSTED_REASON
}

export function estimatePromptTokensForText(value: string): number {
  return estimateTokensFromText(value)
}

export function estimateConversationTokensWithFallback(
  messages: readonly AgentMessage[],
  config: AgentConfig,
): ConversationTokenEstimate {
  const estimate = estimateConversationTokens(messages, config)

  if (estimate) {
    return estimate
  }

  return estimateConversationTokensFallback(messages)
}
