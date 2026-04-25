import { describe, expect, test } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import {
  getCompactionBudgetWindow,
  maybeCompactConversation,
  normalizeConversationContent,
  type ConversationTokenEstimate,
} from "./agent/conversation";
import { createUserPrompt } from "./agent/user-prompts";
import type { AgentState, AgentTokenEstimatorContext } from "./types";
import {
  createConfig,
  createPage,
  createToolCall,
} from "./agent.test-fixtures";

function createTokenEstimator(scale = 1) {
  return ({
    messages,
    maxOutputTokens,
  }: AgentTokenEstimatorContext): ConversationTokenEstimate => {
    const estimatedInputTokens = messages.reduce(
      (sum, message) => sum + Math.ceil((message.content.length * scale) / 4),
      0,
    );

    return {
      estimatedInputTokens,
      estimatedTotalTokens: estimatedInputTokens + maxOutputTokens,
    };
  };
}

describe("runAgentDiscovery compaction", () => {
  test("default compaction budgets stay near the 196k model limit", () => {
    const config = createConfig();
    config.compactionCapability = {
      modelContextWindowTokens: 196_000,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    expect(getCompactionBudgetWindow(config)).toEqual({
      warningTokenBudget: 176_000,
      targetTokenBudget: 184_000,
    });
  });

  test("compacts long worker transcripts into summarized state", async () => {
    const page = createPage() as Page;
    const llmCalls = [
      [
        createToolCall(
          "navigate",
          { url: "https://www.linkedin.com/jobs/search/" },
          "tool_1",
        ),
      ],
      [
        createToolCall(
          "navigate",
          { url: "https://www.linkedin.com/jobs/search/" },
          "tool_2",
        ),
      ],
      [
        createToolCall(
          "finish",
          {
            reason: "Enough evidence collected.",
            summary:
              "Keyword search on the jobs route returned stable detail pages.",
            reliableControls: ["Keyword search box on the jobs route"],
            trickyFilters: [
              "Homepage category chips did not reliably change the result set",
            ],
            navigationTips: [
              "Open the job card detail page to recover the canonical listing URL",
            ],
            applyTips: ["Apply action was not validated in this phase"],
            warnings: [
              "Search filters need replay verification before trusting them",
            ],
          },
          "tool_3",
        ),
      ],
    ];
    let callIndex = 0;
    const llmClient: LLMClient = {
      async chatWithTools() {
        const toolCalls =
          llmCalls[Math.min(callIndex, llmCalls.length - 1)] ?? [];
        callIndex += 1;
        return {
          content: `step ${callIndex}`,
          toolCalls,
        };
      },
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const config = createConfig();
    config.compaction = {
      ...config.compaction,
      warningTokenBudget: 6800,
      targetTokenBudget: 7600,
      minimumResponseHeadroomTokens: 20,
    };
    config.compactionCapability = {
      tokenEstimator: createTokenEstimator(3),
      modelContextWindowTokens: 8000,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.error).toBeUndefined();
    expect(result.compactionState).not.toBeNull();
    expect(result.compactionState?.compactionCount).toBeGreaterThan(0);
    expect(result.compactionState?.triggerKind).toBe("token_budget");
    expect(result.compactionState?.confirmedFacts).toContain(
      "Start from the search route.",
    );
    expect(result.compactionState?.avoidStrategyFingerprints).toContain(
      "access_auth_probe:target_site:access auth probe",
    );
    expect(result.transcriptMessageCount).toBeLessThanOrEqual(6);
    expect(result.compactionUsedFallbackTrigger).toBe(false);
    expect(result.debugFindings?.summary).toContain("Keyword search");
    expect(result.debugFindings?.trickyFilters[0]).toContain("category chips");
  });

  test("compaction preserves tool-call context so later llm requests do not start with orphan tool messages", async () => {
    const page = createPage() as Page;
    const llmCalls = [
      [
        createToolCall(
          "navigate",
          { url: "https://www.linkedin.com/jobs/search/" },
          "tool_nav_1",
        ),
      ],
      [
        createToolCall(
          "navigate",
          { url: "https://www.linkedin.com/jobs/search/" },
          "tool_nav_2",
        ),
      ],
      [
        createToolCall(
          "finish",
          {
            reason: "Enough evidence collected.",
            summary: "Recommendation route stayed reachable after compaction.",
            reliableControls: [
              "Show all top job picks route stayed available after compaction",
            ],
            trickyFilters: [],
            navigationTips: ["Preserved tool-call context across compaction"],
            applyTips: [],
            warnings: [],
          },
          "tool_finish",
        ),
      ],
    ];
    let callIndex = 0;
    const llmClient: LLMClient = {
      async chatWithTools(messages) {
        const firstToolIndex = messages.findIndex(
          (message) => message.role === "tool",
        );
        if (firstToolIndex !== -1) {
          const firstToolMessage = messages[firstToolIndex];
          expect(firstToolMessage?.role).toBe("tool");
          if (firstToolMessage?.role !== "tool") {
            throw new Error("Expected a tool message at firstToolIndex");
          }

          const hasMatchingAssistant = messages
            .slice(0, firstToolIndex)
            .some(
              (message) =>
                message.role === "assistant" &&
                Array.isArray(message.toolCalls) &&
                message.toolCalls.some(
                  (toolCall) => toolCall.id === firstToolMessage.toolCallId,
                ),
            );

          expect(hasMatchingAssistant).toBe(true);
        }

        const toolCalls =
          llmCalls[Math.min(callIndex, llmCalls.length - 1)] ?? [];
        callIndex += 1;
        return {
          content: `step ${callIndex}`,
          toolCalls,
        };
      },
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const config = createConfig();
    config.compaction = {
      messageCountFallbackThreshold: 4,
      preserveRecentMessages: 1,
      minimumPreserveRecentMessages: 1,
      maxToolPayloadChars: 48,
      warningTokenBudget: 5000,
      targetTokenBudget: 6000,
      minimumResponseHeadroomTokens: 100,
      workflowOverrides: {
        browser_agent_live_discovery: {
          warningTokenBudget: 5000,
          targetTokenBudget: 6000,
          minimumResponseHeadroomTokens: 100,
        },
      },
    };
    config.compactionCapability = {
      modelContextWindowTokens: null,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.error).toBeUndefined();
    expect(result.debugFindings?.summary).toContain("Recommendation route");
  });

  test("compaction keeps the forced closeout prompt sticky across repeated rebuilds", () => {
    const config = createConfig();
    config.compaction = {
      messageCountFallbackThreshold: 4,
      preserveRecentMessages: 1,
      minimumPreserveRecentMessages: 1,
      maxToolPayloadChars: 48,
      warningTokenBudget: 500,
      targetTokenBudget: 700,
      minimumResponseHeadroomTokens: 100,
    };
    config.compactionCapability = {
      modelContextWindowTokens: null,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    const state: AgentState = {
      conversation: [
        { role: "system", content: "system prompt" },
        { role: "user", content: createUserPrompt(config) },
        { role: "assistant", content: "step 1" },
        {
          role: "user",
          content:
            "Final phase-closeout turn.\n\nYour next response must call finish.",
        },
        { role: "assistant", content: "still probing" },
      ],
      reviewTranscript: [],
      collectedJobs: [],
      deferredSearchExtractions: new Map(),
      visitedUrls: new Set(["https://www.linkedin.com/jobs/search/"]),
      stepCount: 3,
      currentUrl: "https://www.linkedin.com/jobs/search/",
      lastStableUrl: "https://www.linkedin.com/jobs/search/",
      isRunning: true,
      phaseEvidence: {
        visibleControls: [],
        successfulInteractions: [],
        routeSignals: [],
        attemptedControls: [],
        warnings: [],
      },
      compactionState: null,
      compactionStatus: {
        lastTriggerKind: null,
        usedMessageCountFallback: false,
        lastEstimatedTokensBefore: null,
        lastEstimatedTokensAfter: null,
      },
    };

    maybeCompactConversation(state, config, createUserPrompt);
    maybeCompactConversation(state, config, createUserPrompt);

    expect(
      state.conversation.filter(
        (message) =>
          message.role === "user" &&
          message.content.includes("Final phase-closeout turn."),
      ),
    ).toHaveLength(1);
  });

  test("compaction keeps one bootstrap pair and one summary after repeated rebuilds", () => {
    const config = createConfig();
    config.compaction = {
      messageCountFallbackThreshold: 4,
      preserveRecentMessages: 6,
      minimumPreserveRecentMessages: 1,
      maxToolPayloadChars: 48,
      warningTokenBudget: 500,
      targetTokenBudget: 700,
      minimumResponseHeadroomTokens: 100,
    };
    config.compactionCapability = {
      modelContextWindowTokens: null,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };
    const bootstrapUserPrompt = createUserPrompt(config);
    const state: AgentState = {
      conversation: [
        { role: "system", content: "system prompt" },
        { role: "user", content: bootstrapUserPrompt },
        { role: "assistant", content: "step 1" },
        {
          role: "user",
          content: bootstrapUserPrompt.replace(/\n/g, "  \n"),
        },
        { role: "assistant", content: "step 2" },
      ],
      reviewTranscript: [],
      collectedJobs: [],
      deferredSearchExtractions: new Map(),
      visitedUrls: new Set(["https://www.linkedin.com/jobs/search/"]),
      stepCount: 3,
      currentUrl: "https://www.linkedin.com/jobs/search/",
      lastStableUrl: "https://www.linkedin.com/jobs/search/",
      isRunning: true,
      phaseEvidence: {
        visibleControls: [],
        successfulInteractions: [],
        routeSignals: [],
        attemptedControls: [],
        warnings: [],
      },
      compactionState: null,
      compactionStatus: {
        lastTriggerKind: null,
        usedMessageCountFallback: false,
        lastEstimatedTokensBefore: null,
        lastEstimatedTokensAfter: null,
      },
    };

    maybeCompactConversation(state, config, createUserPrompt);
    maybeCompactConversation(state, config, createUserPrompt);

    expect(
      state.conversation.filter((message) => message.role === "system"),
    ).toHaveLength(1);
    expect(
      state.conversation.filter(
        (message) =>
          message.role === "user" &&
          normalizeConversationContent(message.content) ===
            normalizeConversationContent(bootstrapUserPrompt),
      ),
    ).toHaveLength(1);
    expect(
      state.conversation.filter(
        (message) =>
          message.role === "assistant" &&
          message.content.startsWith("Compacted execution summary:"),
      ),
    ).toHaveLength(1);
  });

  test("normalizes user prompt whitespace for bootstrap dedupe", () => {
    const config = createConfig();
    const prompt = createUserPrompt(config);
    const whitespaceShiftedPrompt = `  ${prompt.replace(/\s+/g, "   ")}  `;

    expect(normalizeConversationContent(prompt)).toBe(
      normalizeConversationContent(whitespaceShiftedPrompt),
    );
  });

  test("message-count fallback still works when token estimation is unavailable", async () => {
    const page = createPage() as Page;
    const config = createConfig();
    config.compaction = {
      messageCountFallbackThreshold: 4,
      preserveRecentMessages: 1,
      minimumPreserveRecentMessages: 1,
      maxToolPayloadChars: 48,
      warningTokenBudget: 500,
      targetTokenBudget: 700,
      minimumResponseHeadroomTokens: 100,
    };
    config.compactionCapability = {
      modelContextWindowTokens: null,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    let callIndex = 0;
    const llmClient: LLMClient = {
      async chatWithTools() {
        callIndex += 1;
        return {
          content: `step ${callIndex}`,
          toolCalls:
            callIndex >= 3
              ? [
                  createToolCall(
                    "finish",
                    {
                      reason: "enough evidence",
                      summary: "Fallback compaction still preserved progress.",
                      reliableControls: ["Keyword search box"],
                      trickyFilters: [],
                      navigationTips: [],
                      applyTips: [],
                      warnings: [],
                    },
                    `finish_${callIndex}`,
                  ),
                ]
              : [
                  createToolCall(
                    "navigate",
                    { url: "https://www.linkedin.com/jobs/search/" },
                    `nav_${callIndex}`,
                  ),
                ],
        };
      },
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.compactionState?.triggerKind).toBe("message_count_fallback");
    expect(result.compactionUsedFallbackTrigger).toBe(true);
  });

  test("over-budget failure uses normalized reason instead of calling provider with an oversized prompt", async () => {
    const page = createPage() as Page;
    const config = createConfig();
    config.maxSteps = 1;
    config.compaction = {
      warningTokenBudget: 4,
      targetTokenBudget: 4,
      minimumResponseHeadroomTokens: 1,
      preserveRecentMessages: 1,
      minimumPreserveRecentMessages: 1,
      maxToolPayloadChars: 48,
      messageCountFallbackThreshold: 100,
    };
    config.compactionCapability = {
      tokenEstimator() {
        return {
          estimatedInputTokens: 20,
          estimatedTotalTokens: 20,
        };
      },
      modelContextWindowTokens: 6,
      compactionWorkflowKey: "browser_agent_live_discovery",
    };

    let llmCallCount = 0;
    const llmClient: LLMClient = {
      async chatWithTools() {
        llmCallCount += 1;
        return { content: "should not be called", toolCalls: [] };
      },
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(llmCallCount).toBe(0);
    expect(result.error).toBe("Context budget exhausted after compaction.");
  });
});
