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

    // Batch-size-one flushing reviews the first captured results page in the
    // same step as its capture, so the target is reached without the two
    // additional planning turns the older interval cadence required.
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(1);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(1);
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

    // The captured page is reviewed immediately after its capture turn, so
    // the queued extraction completes without waiting for an idle turn.
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(1);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(1);
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

  test("stops a weak target-50 source after two zero-yield slow passes while useful candidates are held", async () => {
    const page = createPage() as Page;
    const progressActions: string[] = [];
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "check what planning can add",
          toolCalls: [],
        })
        .mockResolvedValueOnce({
          content: "probe one detail page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "job_detail", maxJobs: 1 },
              "tool_extract_weak_50_2",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "probe another detail page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "job_detail", maxJobs: 1 },
              "tool_extract_weak_50_3",
            ),
          ],
        })
        .mockResolvedValue({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_weak_50_kept_1",
              canonicalUrl: "https://jobs.example.com/jobs/job_weak_50_kept_1",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: null,
              salaryText: null,
              summary: "Kept candidate from the only productive results page.",
              description:
                "Kept candidate from the only productive results page.",
              easyApplyEligible: false,
              keySkills: ["React"],
              responsibilities: [],
            },
            {
              sourceJobId: "job_weak_50_kept_2",
              canonicalUrl: "https://jobs.example.com/jobs/job_weak_50_kept_2",
              title: "Senior Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: null,
              salaryText: null,
              summary: "Second kept candidate from the same thin source.",
              description: "Second kept candidate from the same thin source.",
              easyApplyEligible: false,
              keySkills: ["TypeScript"],
              responsibilities: [],
            },
          ];
        }

        return [];
      }),
    };

    const config = createConfig();
    config.maxSteps = 20;
    config.targetJobCount = 50;
    config.promptContext = { siteLabel: "Primary target" };
    config.startingUrls = [
      "https://jobs.example.com/search/?keywords=Workflow+Engineer&location=Remote",
    ];
    config.navigationPolicy = { allowedHostnames: ["jobs.example.com"] };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
      (progress) => progressActions.push(progress.currentAction ?? ""),
    );

    // The run is far below the requested target, but it holds two aligned
    // candidates and slow extraction has returned nothing new twice in a row
    // with four stale steps, so the yield-aware exhaustion arm stops it.
    expect(result.jobs).toHaveLength(2);
    expect(result.incomplete).toBe(true);
    expect(result.steps).toBe(4);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(3);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(4);
    expect(progressActions).toContain("stop_yield_exhausted_source");
  });

  test("a fresh yield blocks the exhaustion arm and discovery keeps going", async () => {
    const page = createPage() as Page;
    const progressActions: string[] = [];
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "check what planning can add",
          toolCalls: [],
        })
        .mockResolvedValueOnce({
          content: "probe one detail page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "job_detail", maxJobs: 1 },
              "tool_extract_yield_block_2",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "probe another detail page that still has a real job",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "job_detail", maxJobs: 1 },
              "tool_extract_yield_block_3",
            ),
          ],
        })
        .mockResolvedValue({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_yield_block_kept_1",
              canonicalUrl:
                "https://jobs.example.com/jobs/job_yield_block_kept_1",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: null,
              salaryText: null,
              summary: "Kept candidate from the first productive results page.",
              description:
                "Kept candidate from the first productive results page.",
              easyApplyEligible: false,
              keySkills: ["React"],
              responsibilities: [],
            },
            {
              sourceJobId: "job_yield_block_kept_2",
              canonicalUrl:
                "https://jobs.example.com/jobs/job_yield_block_kept_2",
              title: "Senior Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: null,
              salaryText: null,
              summary: "Second kept candidate from the same source.",
              description: "Second kept candidate from the same source.",
              easyApplyEligible: false,
              keySkills: ["TypeScript"],
              responsibilities: [],
            },
          ];
        }

        if (extractionCallCount === 3) {
          return [
            {
              sourceJobId: "job_yield_block_recovery",
              canonicalUrl:
                "https://jobs.example.com/jobs/job_yield_block_recovery",
              title: "Platform Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: null,
              salaryText: null,
              summary: "A late real find that resets the zero-yield streak.",
              description:
                "A late real find that resets the zero-yield streak.",
              easyApplyEligible: false,
              keySkills: ["React"],
              responsibilities: [],
            },
          ];
        }

        return [];
      }),
    };

    const config = createConfig();
    config.maxSteps = 12;
    config.targetJobCount = 50;
    config.promptContext = { siteLabel: "Primary target" };
    config.startingUrls = [
      "https://jobs.example.com/search/?keywords=Workflow+Engineer&location=Remote",
    ];
    config.navigationPolicy = { allowedHostnames: ["jobs.example.com"] };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
      (progress) => progressActions.push(progress.currentAction ?? ""),
    );

    // The identical script stopped at step 4 when the second detail probe
    // yielded nothing. Because that probe instead produced a new job, the
    // exhaustion arm stays blocked and the run continues well past step 4.
    expect(result.jobs).toHaveLength(3);
    expect(result.incomplete).toBe(true);
    expect(result.steps).toBe(7);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(3);
    expect(progressActions).not.toContain("stop_yield_exhausted_source");
  });

  test("reports batch scroll and pagination exhaustion instead of instructing more pagination", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => ({
        content: "No action taken",
        toolCalls: [],
      })),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () =>
        Array.from({ length: 2 }, (_, index) => ({
          sourceJobId: `job_paging_wording_${index}`,
          canonicalUrl: `https://jobs.example.com/jobs/job_paging_wording_${index}`,
          title: `Workflow Engineer ${index}`,
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: null,
          salaryText: null,
          summary: "Collected before the results pane reached its end.",
          description: "Collected before the results pane reached its end.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        })),
      ),
    };

    const config = createConfig();
    config.maxSteps = 6;
    config.targetJobCount = 50;
    config.promptContext = { siteLabel: "Primary target" };
    config.startingUrls = [
      "https://jobs.example.com/search/?keywords=Workflow+Engineer&location=Remote",
    ];
    config.navigationPolicy = { allowedHostnames: ["jobs.example.com"] };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    const handoffMessage = result.reviewTranscript?.find((entry) =>
      entry.includes("Automatic results-surface collection gathered"),
    );

    expect(handoffMessage).toBeDefined();
    expect(handoffMessage).toContain("no further result pages were reachable");
    expect(handoffMessage).not.toContain("Continue with pagination");
  });

  test("rich source still reaches the requested target without the exhaustion arm", async () => {
    let scrollPosition = 0;
    const basePage = createPage();
    const page = {
      ...basePage,
      url: vi.fn(
        () =>
          "https://jobs.example.com/search/?keywords=Workflow+Engineer&location=Remote",
      ),
      evaluate: vi.fn(async (_callback: unknown, argument?: unknown) => {
        if (
          argument &&
          typeof argument === "object" &&
          "scrollAmount" in argument
        ) {
          const previousScrollY = scrollPosition;
          scrollPosition += Number(
            (argument as { scrollAmount?: number }).scrollAmount ?? 0,
          );
          return {
            previousScrollY,
            newScrollY: scrollPosition,
            previousHeight: 20000,
            totalHeight: 200000,
            clientHeight: 800,
            scrollContainer: "div[role=list]",
          };
        }
        return [];
      }),
    } as unknown as Page;
    const progressActions: string[] = [];
    const llmClient: LLMClient = {
      chatWithTools: vi.fn().mockResolvedValueOnce({
        content: "Target satisfied, finishing.",
        toolCalls: [
          createToolCall(
            "finish",
            { reason: "Found 20 relevant jobs" },
            "tool_finish_rich_source",
          ),
        ],
      }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () =>
        Array.from({ length: 20 }, (_, index) => ({
          sourceJobId: `job_rich_source_${index}`,
          canonicalUrl: `https://jobs.example.com/jobs/job_rich_source_${index}`,
          title: `Workflow Engineer ${index}`,
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: null,
          salaryText: null,
          summary: "Rich source candidate collected in batch mode.",
          description: "Rich source candidate collected in batch mode.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        })),
      ),
    };

    const config = createConfig();
    config.maxSteps = 4;
    config.targetJobCount = 20;
    config.promptContext = { siteLabel: "Primary target" };
    config.startingUrls = [
      "https://jobs.example.com/search/?keywords=Workflow+Engineer&location=Remote",
    ];
    config.navigationPolicy = { allowedHostnames: ["jobs.example.com"] };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
      (progress) => progressActions.push(progress.currentAction ?? ""),
    );

    expect(result.jobs).toHaveLength(20);
    expect(result.incomplete).toBeFalsy();
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(jobExtractor.extractJobsFromPage).mock.calls[0]?.[0],
    ).toMatchObject({
      maxJobs: 20,
      pageType: "search_results",
    });
    // Scrolling kept making progress, so the handoff keeps the pagination
    // guidance and no early-stop arm fired.
    expect(
      result.reviewTranscript?.some((entry) =>
        entry.includes("Continue with pagination"),
      ),
    ).toBe(true);
    expect(progressActions).not.toContain("stop_yield_exhausted_source");
    expect(progressActions).not.toContain("stop_stagnant_source");
  });
});
