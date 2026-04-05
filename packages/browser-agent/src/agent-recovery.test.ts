import { describe, expect, test } from "vitest";
import { vi } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import { createConfig, createPage, createToolCall } from "./agent.test-fixtures";

describe("runAgentDiscovery recovery behavior", () => {
  test("retries transient llm failures before giving up", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary upstream failure"))
        .mockRejectedValueOnce(new Error("temporary upstream failure"))
        .mockResolvedValue({
          content: "final step",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary:
                  "Keyword search on the jobs route returned stable detail pages.",
                reliableControls: ["Keyword search box on the jobs route"],
                trickyFilters: [],
                navigationTips: [],
                applyTips: [],
                warnings: [],
              },
              "tool_retry_finish",
            ),
          ],
        }),
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

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(3);
    expect(result.error).toBeUndefined();
    expect(result.debugFindings?.reliableControls[0]).toContain(
      "Keyword search box",
    );
  });

  test("records and recovers from 404-like routes during source-debug phases", async () => {
    let currentUrl = "about:blank";
    const page404 = {
      async goto(url: string) {
        currentUrl = url;
        return null as never;
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return currentUrl;
      },
      async title() {
        return currentUrl.includes("/404") ? "404 Not Found" : "Primary target";
      },
      locator() {
        return {
          async innerText() {
            return "Primary target";
          },
        } as never;
      },
      async evaluate() {
        return [];
      },
    } satisfies Pick<
      Page,
      "goto" | "waitForTimeout" | "url" | "title" | "locator" | "evaluate"
    >;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "probe a broken route first",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/404" },
              "tool_nav_404",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish with recovery notes",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary:
                  "Recovered from a broken route back to the jobs surface.",
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [
                  "Return to the last known jobs surface after a 404-like route",
                ],
                applyTips: [],
                warnings: [],
              },
              "tool_finish_404",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const result = await runAgentDiscovery(
      page404 as unknown as Page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(result.phaseCompletionMode).toBe("forced_finish");
    expect(result.phaseEvidence?.warnings).toEqual([]);
    expect(
      result.phaseEvidence?.routeSignals.some((entry) =>
        entry.includes("Recovered to the last known jobs surface"),
      ),
    ).toBe(true);
    expect(result.debugFindings?.summary).toContain(
      "Recovered from a broken route",
    );
  });

  test("does not emit recovered-route evidence when 404 recovery fails", async () => {
    let currentUrl = "about:blank";
    let initialNavigationCompleted = false;
    const page404 = {
      async goto(url: string) {
        if (url === "https://www.linkedin.com/jobs/search/") {
          if (initialNavigationCompleted) {
            throw new Error("Recovery navigation failed");
          }

          initialNavigationCompleted = true;
          currentUrl = url;
          return null as never;
        }

        if (url === "https://www.linkedin.com/jobs/404") {
          currentUrl = url;
          return null as never;
        }

        throw new Error("Recovery navigation failed");
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return currentUrl;
      },
      async title() {
        return currentUrl.includes("/404") ? "404 Not Found" : "Primary target";
      },
      locator() {
        return {
          async innerText() {
            return "Primary target";
          },
        } as never;
      },
      async evaluate() {
        return [];
      },
    } satisfies Pick<
      Page,
      "goto" | "waitForTimeout" | "url" | "title" | "locator" | "evaluate"
    >;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "probe a broken route first",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/404" },
              "tool_nav_404_fail",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish without claiming recovery",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary: "Broken route remained unresolved after the 404-like navigation.",
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [
                  "Treat 404-like routes as broken until a stable jobs surface is found again",
                ],
                applyTips: [],
                warnings: ["404-like route did not recover automatically."],
              },
              "tool_finish_404_fail",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const result = await runAgentDiscovery(
      page404 as unknown as Page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(result.phaseCompletionMode).toBe("forced_finish");
    expect(
      result.phaseEvidence?.routeSignals.some((entry) =>
        entry.includes("Recovered to the last known jobs surface"),
      ),
    ).toBe(false);
    expect(
      result.phaseEvidence?.routeSignals.some((entry) =>
        entry.includes("Navigation reached https://www.linkedin.com/jobs/404"),
      ),
    ).toBe(true);
    expect(result.debugFindings?.summary).not.toContain("Recovered from a broken route");
  });
});
