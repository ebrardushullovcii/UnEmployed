import { describe, expect, test } from "vitest";
import { vi } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import { createConfig, createPage, createToolCall } from "./agent.test-fixtures";
import type { AgentMessage } from "./types";

describe("runAgentDiscovery closeout behavior", () => {
  test("task-packet runs keep exploring after hitting the sampling budget until finish is called", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "extract one sample job first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "probe one more route before finishing",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/search/", timeout: 5000 },
              "tool_nav",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish with structured findings",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary:
                  "Recommendation routes and filters were proven before ending the phase.",
                reliableControls: [
                  "Show all collections open reusable job lists",
                ],
                trickyFilters: [
                  "Some chips are decorative and should be verified before reuse",
                ],
                navigationTips: [
                  "Start from /jobs, then open a reusable recommendation collection",
                ],
                applyTips: ["Apply behavior needs detail-page confirmation"],
                warnings: [],
              },
              "tool_finish_after_budget",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [
          {
            source: "target_site",
            sourceJobId: "job_1",
            discoveryMethod: "catalog_seed",
            canonicalUrl: "https://www.linkedin.com/jobs/view/job_1",
            title: "Workflow Engineer",
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote"],
            applyPath: "unknown",
            postedAt: "2026-03-20T09:00:00.000Z",
            discoveredAt: "2026-03-20T10:00:00.000Z",
            salaryText: null,
            summary: "Structured extraction sample.",
            description: "Structured extraction sample.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          },
        ];
      },
    };

    const result = await runAgentDiscovery(
      page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(3);
    expect(result.error).toBeUndefined();
    expect(result.jobs).toHaveLength(1);
    expect(result.debugFindings?.summary).toContain("Recommendation routes");
  });

  test("forces a final summarize turn and synthesizes partial findings when no finish call is returned", async () => {
    const page = createPage() as Page;
    let secondCallMessages: AgentMessage[] | null = null;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "extract one sample job first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_partial",
            ),
          ],
        })
        .mockImplementationOnce(async (messages) => {
          secondCallMessages = structuredClone(messages);
          return {
            content: "I observed enough evidence but did not issue finish",
            toolCalls: [],
          };
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [
          {
            source: "target_site",
            sourceJobId: "job_partial_1",
            discoveryMethod: "catalog_seed",
            canonicalUrl: "https://www.linkedin.com/jobs/view/job_partial_1",
            title: "Workflow Engineer",
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote"],
            applyPath: "unknown",
            postedAt: "2026-03-20T09:00:00.000Z",
            discoveredAt: "2026-03-20T10:00:00.000Z",
            salaryText: null,
            summary: "Structured extraction sample.",
            description: "Structured extraction sample.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          },
        ];
      },
    };

    const result = await runAgentDiscovery(
      page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(2);
    expect(
      (secondCallMessages ?? []).some(
        (message: AgentMessage) =>
          message.role === "user" &&
          message.content.includes("Final phase-closeout turn."),
      ),
    ).toBe(true);
    expect(result.phaseCompletionMode).toBe("timed_out_with_partial_evidence");
    expect(result.phaseCompletionReason).toContain(
      "timed out before the worker returned a structured finish call",
    );
    expect(
      result.phaseEvidence?.routeSignals.some((entry) =>
        entry.includes("Job extraction found"),
      ),
    ).toBe(true);
    expect(result.debugFindings?.summary).toContain(
      "https://www.linkedin.com/jobs/search/",
    );
  });

  test("delays the forced closeout prompt until after one exploratory turn", async () => {
    const page = createPage() as Page;
    let firstCallMessages: AgentMessage[] | null = null;
    let secondCallMessages: AgentMessage[] | null = null;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockImplementationOnce(async (messages) => {
          firstCallMessages = structuredClone(messages);
          return {
            content: "inspect the current route first",
            toolCalls: [],
          };
        })
        .mockImplementationOnce(async (messages) => {
          secondCallMessages = structuredClone(messages);
          return {
            content: "still no finish call",
            toolCalls: [],
          };
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const config = createConfig();
    config.maxSteps = 2;

    await runAgentDiscovery(page, config, llmClient, jobExtractor);

    const countForcedCloseoutPrompts = (messages: AgentMessage[] | null): number =>
      (messages ?? []).filter(
        (message: AgentMessage) =>
          message.role === "user" &&
          message.content.includes("Final phase-closeout turn."),
      ).length;

    expect(
      countForcedCloseoutPrompts(secondCallMessages),
    ).toBeGreaterThan(countForcedCloseoutPrompts(firstCallMessages));
  });
});
