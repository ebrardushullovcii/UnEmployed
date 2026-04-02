import type { AgentConfig, AgentMessage, AgentState } from '../types'
import { createSystemPrompt } from '../prompts'

const DEFAULT_COMPACTION_CONFIG = {
  maxTranscriptMessages: 18,
  preserveRecentMessages: 8,
  maxToolPayloadChars: 240
} as const

const FORCED_CLOSEOUT_MARKER = 'Final phase-closeout turn.'

export function getCompactionConfig(config: AgentConfig) {
  return {
    ...DEFAULT_COMPACTION_CONFIG,
    ...config.compaction
  }
}

export function compactToolContent(content: string, maxLength: number): string {
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

function isForcedCloseoutUserMessage(message: AgentMessage): boolean {
  return message.role === 'user' && message.content.includes(FORCED_CLOSEOUT_MARKER)
}

function extractStickyUserMessages(conversation: readonly AgentMessage[]): AgentMessage[] {
  const forcedCloseoutMessage = [...conversation].reverse().find(isForcedCloseoutUserMessage)

  return forcedCloseoutMessage ? [forcedCloseoutMessage] : []
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

export function maybeCompactConversation(
  state: AgentState,
  config: AgentConfig,
  createUserPrompt: (config: AgentConfig) => string
) {
  const compaction = getCompactionConfig(config)

  if (state.conversation.length <= compaction.maxTranscriptMessages) {
    return
  }

  state.compactionState = buildCompactionSummary(state, config)
  const preservedMessages = preserveCoherentRecentMessages(state.conversation, compaction.preserveRecentMessages)
  const stickyMessages = extractStickyUserMessages(state.conversation).filter(
    (stickyMessage) => !preservedMessages.some(
      (message) => message.role === stickyMessage.role && message.content === stickyMessage.content
    )
  )
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
    ...stickyMessages,
    ...preservedMessages
  ]
}
