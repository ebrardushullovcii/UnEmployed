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

  test("falls back to the next starting URL when the first candidate fails", async () => {
    let currentUrl = "about:blank";
    const pageWithFallback = {
      async goto(url: string) {
        if (url === "https://www.linkedin.com/jobs/search/") {
          throw new Error("navigation timeout");
        }

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
        return "Primary target";
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
      chatWithTools: vi.fn().mockResolvedValue({
        content: "finish after the fallback route loads",
        toolCalls: [
          createToolCall(
            "finish",
            {
              reason: "Enough evidence collected.",
              summary: "The fallback jobs route loaded and exposed reusable discovery evidence.",
              reliableControls: ["Fallback jobs route remained usable"],
              trickyFilters: [],
              navigationTips: ["Use the fallback jobs route when the primary search entrypoint fails"],
              applyTips: [],
              warnings: [],
            },
            "tool_finish_fallback_starting_url",
          ),
        ],
      }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };
    const config = createConfig();
    config.startingUrls = [
      "https://www.linkedin.com/jobs/search/",
      "https://www.linkedin.com/jobs/collections/recommended/",
    ];

    const result = await runAgentDiscovery(
      pageWithFallback as unknown as Page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.error).toBeUndefined();
    expect(result.phaseEvidence?.routeSignals.some((entry) =>
      entry.includes("Started on https://www.linkedin.com/jobs/collections/recommended/"),
    )).toBe(true);
    expect(result.phaseEvidence?.routeSignals).toContain(
      "Starting URL fallback skipped 1 earlier candidate.",
    );
    expect(result.debugFindings?.summary).toContain("fallback jobs route");
  });

  test("recovers to a replacement live page after the active page closes mid-run", async () => {
    const firstPage = createPage() as Page;
    const replacementPage = createPage() as Page;
    await replacementPage.goto("https://www.linkedin.com/jobs/collections/recommended/");
    const originalFirstPageGoto = firstPage.goto.bind(firstPage);

    let activePage = firstPage;
    let recoveryCalls = 0;
    let firstPageGotoCount = 0;

    vi.spyOn(firstPage, "goto").mockImplementation(async (url: string) => {
      firstPageGotoCount += 1;
      if (firstPageGotoCount >= 2) {
        throw new Error("page.goto: Target page, context or browser has been closed");
      }

      return originalFirstPageGoto(url);
    });

    const replacementGotoSpy = vi.spyOn(replacementPage, "goto");

    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "open a secondary jobs route",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/collections/recommended/" },
              "tool_navigate_after_page_close",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "extract from the recovered page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_after_recovery",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish after the recovered page proves the route",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary: "Recovered to a replacement jobs page after the original tab closed.",
                reliableControls: ["Recovered jobs page remained interactive"],
                trickyFilters: [],
                navigationTips: ["If the active tab closes, continue from another in-scope jobs page."],
                applyTips: [],
                warnings: [],
              },
              "tool_finish_after_recovery",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage(input) {
        return [
          {
            sourceJobId: "recovered-job-1",
            canonicalUrl: `${input.pageUrl.replace(/\/$/, "")}/recovered-job-1`,
            title: "Recovered Workflow Engineer",
            company: "Signal Systems",
            location: "Remote",
            description: "Recovered page stayed usable after the original tab closed.",
            summary: "Recovered result",
            postedAt: null,
            postedAtText: null,
            salaryText: null,
            workMode: ["remote"],
            applyPath: "unknown",
            easyApplyEligible: false,
            keySkills: [],
            responsibilities: [],
            minimumQualifications: [],
            preferredQualifications: [],
            seniority: null,
            employmentType: null,
            department: null,
            team: null,
            employerWebsiteUrl: null,
            employerDomain: null,
            benefits: [],
          },
        ];
      },
    };

    const config = createConfig();
    config.resolveLivePage = vi.fn(async () => {
      recoveryCalls += 1;
      activePage = replacementPage;
      return replacementPage;
    });

    const progressEvents: Array<{ currentAction?: string; message?: string | null }> = [];

    const result = await runAgentDiscovery(
      activePage,
      config,
      llmClient,
      jobExtractor,
      (progress) => {
        progressEvents.push({
          currentAction: progress.currentAction ?? undefined,
          message: progress.message,
        });
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.phaseCompletionMode).toBe("forced_finish");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.canonicalUrl).toContain("recovered-job-1");
    expect(result.debugFindings?.summary).toContain("replacement jobs page");
    expect(config.resolveLivePage).toHaveBeenCalledTimes(1);
    expect(recoveryCalls).toBe(1);
    expect(firstPageGotoCount).toBeGreaterThanOrEqual(2);
    expect(replacementGotoSpy).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/collections/recommended/",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(
      progressEvents.some(
        (event) =>
          event.currentAction === "recover_page:navigate" &&
          event.message?.includes("Recovered to a live browser page"),
      ),
    ).toBe(true);
  });

  test("recovers to a replacement live page when the starting page closes before fallback navigation completes", async () => {
    const firstPage = createPage() as Page;
    const replacementPage = createPage() as Page;
    const originalReplacementGoto = replacementPage.goto.bind(replacementPage);
    await originalReplacementGoto("https://www.linkedin.com/jobs/collections/recommended/");
    const recoveredPrimaryUrl = "https://www.linkedin.com/jobs/search/";
    const recoveredFallbackUrl = "https://www.linkedin.com/jobs/collections/recommended/";

    const firstPageGoto = vi
      .spyOn(firstPage, "goto")
      .mockRejectedValue(new Error("page.goto: Target page, context or browser has been closed"));
    const replacementPageGoto = vi.spyOn(replacementPage, "goto").mockImplementation(async (url: string) => {
      if (url === recoveredPrimaryUrl) {
        throw new Error("navigation timeout after recovery");
      }

      return originalReplacementGoto(url);
    });

    const config = createConfig();
    config.startingUrls = [
      "https://www.linkedin.com/jobs/search/",
      "https://www.linkedin.com/jobs/collections/recommended/",
    ];
    config.resolveLivePage = vi.fn(async () => replacementPage);

    const llmClient: LLMClient = {
      chatWithTools: vi.fn().mockResolvedValue({
        content: "finish after the recovered fallback page loads",
        toolCalls: [
          createToolCall(
            "finish",
            {
              reason: "Enough evidence collected.",
              summary: "Recovered to a replacement page before the fallback starting route loaded.",
              reliableControls: ["Fallback jobs route remained usable after page recovery"],
              trickyFilters: [],
              navigationTips: ["Recover to another live in-scope page before retrying fallback starting URLs."],
              applyTips: [],
              warnings: [],
            },
            "tool_finish_recovered_starting_url",
          ),
        ],
      }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const progressEvents: Array<{ currentAction?: string; message?: string | null }> = [];

    const result = await runAgentDiscovery(
      firstPage,
      config,
      llmClient,
      jobExtractor,
      (progress) => {
        progressEvents.push({
          currentAction: progress.currentAction ?? undefined,
          message: progress.message,
        });
      },
    );

    expect(result.error).toBeUndefined();
    expect(config.resolveLivePage).toHaveBeenCalledTimes(1);
    expect(firstPageGoto).toHaveBeenCalled();
    expect(replacementPageGoto).toHaveBeenCalledWith(
      recoveredPrimaryUrl,
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(replacementPageGoto).toHaveBeenCalledWith(
      recoveredFallbackUrl,
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(result.phaseEvidence?.routeSignals.some((entry) =>
      entry.includes("Started on https://www.linkedin.com/jobs/collections/recommended/"),
    )).toBe(true);
    expect(result.phaseEvidence?.routeSignals).toContain(
      "Starting URL fallback skipped 1 earlier candidate.",
    );
    expect(
      progressEvents.some(
        (event) =>
          event.currentAction === "recover_page:starting_url" &&
          event.message?.includes("Recovered to a live browser page"),
      ),
    ).toBe(true);
  });

  test("restores a blocked placeholder LinkedIn query before the next planning turn when the immediate guard restore fails", async () => {
    const seededUrl =
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";
    const placeholderUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE";
    let currentUrl = "about:blank";
    let seededRestoreAttempts = 0;

    const page = {
      async goto(url: string) {
        if (url === seededUrl) {
          seededRestoreAttempts += 1;
          if (seededRestoreAttempts === 2) {
            throw new Error("temporary restore failure");
          }

          currentUrl = url;
          return null as never;
        }

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
        return "Primary target";
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

    const config = createConfig();
    config.startingUrls = [seededUrl];
    config.searchPreferences = {
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    };

    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "navigate to a placeholder query route",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: placeholderUrl },
              "tool_nav_placeholder_query",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish after the seeded route is restored",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary: "The seeded LinkedIn search route was restored before planning continued.",
                reliableControls: ["Seeded LinkedIn search route remained usable after restore"],
                trickyFilters: [],
                navigationTips: ["Restore placeholder LinkedIn query routes back to the seeded search surface before continuing."],
                applyTips: [],
                warnings: [],
              },
              "tool_finish_seeded_restore",
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
      page as unknown as Page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.error).toBeUndefined();
    expect(currentUrl).toBe(seededUrl);
    expect(seededRestoreAttempts).toBe(3);
    expect(result.phaseEvidence?.routeSignals.some((entry) =>
      entry.includes("Restored the seeded LinkedIn search surface"),
    )).toBe(true);
    expect(result.reviewTranscript?.some((entry) =>
      entry.includes("automatically restored to the seeded LinkedIn search surface"),
    )).toBe(true);
  });

  test("does not treat a restore as successful when LinkedIn immediately rewrites it back to a placeholder query", async () => {
    const seededUrl =
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";
    const placeholderUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4400784689&geoId=GEO_ID&keywords=JOB_TITLE";
    let currentUrl = "about:blank";
    let seededGotoCount = 0;

    const page = {
      async goto(url: string) {
        if (url === seededUrl) {
          seededGotoCount += 1;
          currentUrl = seededGotoCount >= 2 ? placeholderUrl : seededUrl;
          return null as never;
        }

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
        return "Primary target";
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

    const config = createConfig();
    config.startingUrls = [seededUrl];
    config.searchPreferences = {
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    };

    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "navigate to a placeholder query route",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: placeholderUrl },
              "tool_nav_placeholder_query_rewrite",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "finish after the failed restore is recorded",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected.",
                summary: "Placeholder query restoration still needs another corrective action.",
                reliableControls: [],
                trickyFilters: [],
                navigationTips: ["If LinkedIn rewrites the seeded restore back to placeholders, keep trying a real seeded route before continuing."],
                applyTips: [],
                warnings: [],
              },
              "tool_finish_seeded_restore_rewrite",
            ),
          ],
        })
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [];
      },
    };

    const result = await runAgentDiscovery(
      page as unknown as Page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.error).toBeUndefined();
    expect(currentUrl).toBe(placeholderUrl);
    expect(result.phaseEvidence?.routeSignals.some((entry) =>
      entry.includes("automatic restore failed"),
    )).toBe(true);
    expect(result.reviewTranscript?.some((entry) =>
      entry.includes("Automatic restore did not succeed yet"),
    )).toBe(true);
  });
});
