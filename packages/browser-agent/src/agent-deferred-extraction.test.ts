import { describe, expect, test, vi } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import {
  createConfig,
  createPage,
  createToolCall,
} from "./agent.test-fixtures";
import {
  createEmptyExtractionPassSummary,
  summarizeExtractionPassResult,
} from "./agent/discovery-helpers";

describe("runAgentDiscovery deferred extraction behavior", () => {
  test("treats zero-job deferred extraction as an empty pass summary", () => {
    expect(
      summarizeExtractionPassResult({
        success: true,
        data: {
          deferredExtraction: true,
          jobsExtracted: 0,
        },
      }),
    ).toEqual(createEmptyExtractionPassSummary());
  });

  test("discovery defers repeated search-result extraction until the end of the run", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the first results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_deferred_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "capture the same results page again after more browsing",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_deferred_2",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: "job_deferred_1",
          canonicalUrl: "https://www.linkedin.com/jobs/view/job_deferred_1",
          title: "Workflow Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: "2026-03-20T09:00:00.000Z",
          salaryText: null,
          summary: "Deferred extraction sample.",
          description: "Deferred extraction sample.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        },
      ]),
    };

    const config = createConfig();
    config.maxSteps = 2;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
  });

  test("discovery flushes deferred search-result extraction before max steps so it can stop early", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the first results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_batch_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "capture a second results page",
          toolCalls: [
            createToolCall(
              "navigate",
              {
                url: "https://www.linkedin.com/jobs/collections/recommended/",
                timeout: 5000,
              },
              "tool_nav_batch_2",
            ),
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_batch_2",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "capture a third results page",
          toolCalls: [
            createToolCall(
              "navigate",
              {
                url: "https://www.linkedin.com/jobs/collections/recommended/?collection=engineering",
                timeout: 5000,
              },
              "tool_nav_batch_3",
            ),
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_batch_3",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: "job_batch_1",
          canonicalUrl: "https://www.linkedin.com/jobs/view/job_batch_1",
          title: "Workflow Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: "2026-03-20T09:00:00.000Z",
          salaryText: null,
          summary: "Deferred batch extraction sample.",
          description: "Deferred batch extraction sample.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        },
      ]),
    };

    const config = createConfig();
    config.maxSteps = 5;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(3);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(3);
  });

  test("discovery flushes queued search-result extraction after a no-op planning turn", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the visible results page first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_idle_flush_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: "job_idle_flush_1",
          canonicalUrl: "https://www.linkedin.com/jobs/view/job_idle_flush_1",
          title: "Workflow Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: "2026-03-20T09:00:00.000Z",
          salaryText: null,
          summary: "Deferred extraction after an idle planning turn.",
          description: "Deferred extraction after an idle planning turn.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        },
      ]),
    };

    const config = createConfig();
    config.maxSteps = 6;
    config.targetJobCount = 1;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(2);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(2);
  });

  test("discovery stops near the step limit after deferred extraction already produced a useful candidate set", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the visible results page first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 4 },
              "tool_extract_late_stop_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () =>
        Array.from({ length: 3 }, (_, index) => ({
          sourceJobId: `job_late_stop_${index}`,
          canonicalUrl: `https://www.linkedin.com/jobs/view/job_late_stop_${index}`,
          title: `Workflow Engineer ${index}`,
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: "2026-03-20T09:00:00.000Z",
          salaryText: null,
          summary: "Useful deferred candidate set near the step limit.",
          description: "Useful deferred candidate set near the step limit.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        })),
      ),
    };

    const config = createConfig();
    config.maxSteps = 6;
    config.targetJobCount = 4;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(2);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(3);
    expect(result.incomplete).toBe(true);
    expect(result.steps).toBe(2);
  });

  test("keeps the full seeded-search review budget through deterministic batch passes", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the wide seeded search results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_budget_cap_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const config = createConfig();
    config.maxSteps = 3;
    config.targetJobCount = 50;
    config.promptContext = {
      siteLabel: "Primary target",
    };
    config.startingUrls = [
      "https://jobs.example.com/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo",
    ];
    config.navigationPolicy = {
      allowedHostnames: ["jobs.example.com"],
    };

    await runAgentDiscovery(page, config, llmClient, jobExtractor);

    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(2);
    for (const [input] of vi.mocked(jobExtractor.extractJobsFromPage).mock
      .calls) {
      expect(input).toEqual(
        expect.objectContaining({
          maxJobs: 50,
          pageType: "search_results",
        }),
      );
    }
  });

  test("advances bounded result pages after the active results pane reaches its end", async () => {
    let currentUrl = "about:blank";
    let pageNumber = 1;
    const nextPageClick = vi.fn(async () => {
      pageNumber += 1;
      currentUrl = `https://jobs.example.com/search/?page=${pageNumber}`;
    });
    const matchingNextLocator = {
      count: vi.fn(async () => 1),
      nth: vi.fn(),
      isVisible: vi.fn(async () => true),
      click: nextPageClick,
      textContent: vi.fn(async () => "Next"),
      scrollIntoViewIfNeeded: vi.fn(async () => undefined),
    };
    matchingNextLocator.nth.mockReturnValue(matchingNextLocator);
    const missingLocator = {
      count: vi.fn(async () => 0),
      nth: vi.fn(),
      isVisible: vi.fn(async () => false),
      click: vi.fn(async () => undefined),
      textContent: vi.fn(async () => null),
      scrollIntoViewIfNeeded: vi.fn(async () => undefined),
    };
    missingLocator.nth.mockReturnValue(missingLocator);
    const basePage = createPage();
    const page = {
      ...basePage,
      goto: vi.fn(async (url: string) => {
        currentUrl = url;
        return null as never;
      }),
      url: vi.fn(() => currentUrl),
      getByRole: vi.fn(
        (
          role: string,
          options?: { name?: string | RegExp; exact?: boolean },
        ) => {
          const name = options?.name;
          const matchesNext =
            role === "button" &&
            (typeof name === "string"
              ? name === "View next page"
              : name instanceof RegExp && name.test("View next page"));
          return (matchesNext ? matchingNextLocator : missingLocator) as never;
        },
      ),
      evaluate: vi.fn(async (callback: unknown, argument?: unknown) => {
        const source = String(callback);
        if (
          argument &&
          typeof argument === "object" &&
          "scrollAmount" in argument
        ) {
          return {
            previousScrollY: 400,
            newScrollY: 400,
            previousHeight: 900,
            totalHeight: 900,
            clientHeight: 500,
            scrollContainer: "div[role=list]",
          };
        }
        if (source.includes("previousScrollY")) {
          return {
            previousScrollY: 400,
            newScrollY: 0,
            totalHeight: 900,
            scrollContainer: "div[role=list]",
          };
        }
        return [];
      }),
    } as unknown as Page;
    let extractionIndex = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionIndex += 1;
        return [
          {
            sourceJobId: `paged_job_${extractionIndex}`,
            canonicalUrl: `https://jobs.example.com/jobs/paged_job_${extractionIndex}`,
            title: `Workflow Engineer ${extractionIndex}`,
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote" as const],
            applyPath: "unknown" as const,
            postedAt: null,
            salaryText: null,
            summary: "Paged search result.",
            description: "Paged search result.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          },
        ];
      }),
    };
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => ({
        content: "No additional action needed.",
        toolCalls: [],
      })),
    };
    const config = createConfig();
    config.maxSteps = 1;
    config.targetJobCount = 50;
    config.promptContext = { siteLabel: "Primary target" };
    config.startingUrls = ["https://jobs.example.com/search/"];
    config.navigationPolicy = { allowedHostnames: ["jobs.example.com"] };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(nextPageClick).toHaveBeenCalledTimes(2);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
  });
});
