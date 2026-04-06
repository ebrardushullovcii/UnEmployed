import { describe, expect, test } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import { maybeCompactConversation } from "./agent/conversation";
import { createUserPrompt } from "./agent/user-prompts";
import type { AgentState } from "./types";
import {
  createConfig,
  createPage,
  createToolCall,
} from "./agent.test-fixtures";

describe("runAgentDiscovery compaction", () => {
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

    const result = await runAgentDiscovery(
      page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(result.compactionState).not.toBeNull();
    expect(result.compactionState?.compactionCount).toBeGreaterThan(0);
    expect(result.compactionState?.confirmedFacts).toContain(
      "Start from the search route.",
    );
    expect(result.compactionState?.avoidStrategyFingerprints).toContain(
      "access_auth_probe:target_site:access auth probe",
    );
    expect(result.transcriptMessageCount).toBeLessThanOrEqual(6);
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
      maxTranscriptMessages: 4,
      preserveRecentMessages: 1,
      maxToolPayloadChars: 48,
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
      maxTranscriptMessages: 4,
      preserveRecentMessages: 1,
      maxToolPayloadChars: 48,
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
});
