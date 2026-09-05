import { describe, expect, test, vi } from "vitest";
import type { Page } from "playwright";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import {
  createConfig,
  createPage,
  createToolCall,
} from "./agent.test-fixtures";

describe("runAgentDiscovery stagnation behavior", () => {
  test("discovery stops early after repeated zero-yield extraction passes on a cold source", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract one strong sample job first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 1 },
                "tool_extract_stagnation_seed",
              ),
            ],
          };
        }

        if (llmCallCount <= 4) {
          return {
            content: "check another likely detail page",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 1 },
                `tool_extract_stagnation_${llmCallCount}`,
              ),
            ],
          };
        }

        return {
          content: "No action taken",
          toolCalls: [],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_stagnation_seed",
              canonicalUrl:
                "https://www.linkedin.com/jobs/view/job_stagnation_seed",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: "2026-03-20T09:00:00.000Z",
              salaryText: null,
              summary: "Initial seeded job before the source goes cold.",
              description: "Initial seeded job before the source goes cold.",
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
    config.maxSteps = 20;
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

    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(9);
    expect(result.incomplete).toBe(true);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(4);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(9);
  });

  test("discovery stops after holding a useful candidate set without new gains", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract a strong candidate set first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 4 },
                "tool_extract_candidate_hold_seed",
              ),
            ],
          };
        }

        return {
          content: "keep probing even though nothing new is appearing",
          toolCalls: [
            createToolCall(
              "get_interactive_elements",
              {},
              `tool_probe_candidate_hold_${llmCallCount}`,
            ),
          ],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return Array.from({ length: 4 }, (_, index) => ({
            sourceJobId: `job_candidate_hold_${index}`,
            canonicalUrl: `https://www.linkedin.com/jobs/view/job_candidate_hold_${index}`,
            title: `Workflow Engineer ${index}`,
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote" as const],
            applyPath: "unknown" as const,
            postedAt: "2026-03-20T09:00:00.000Z",
            salaryText: null,
            summary: "Useful candidate set before the source goes stale.",
            description: "Useful candidate set before the source goes stale.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          }));
        }

        return [];
      }),
    };

    const config = createConfig();
    config.maxSteps = 20;
    config.targetJobCount = 8;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(4);
    expect(result.steps).toBe(5);
    expect(result.incomplete).toBe(true);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(4);
  });

  test("discovery does not stop after holding only one candidate without new gains", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract one candidate first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 1 },
                "tool_extract_single_candidate_seed",
              ),
            ],
          };
        }

        return {
          content: "keep probing even though nothing new is appearing",
          toolCalls: [
            createToolCall(
              "get_interactive_elements",
              {},
              `tool_probe_single_candidate_${llmCallCount}`,
            ),
          ],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_single_candidate_hold",
              canonicalUrl:
                "https://www.linkedin.com/jobs/view/job_single_candidate_hold",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: "2026-03-20T09:00:00.000Z",
              salaryText: null,
              summary:
                "Only one candidate survived extraction so discovery should keep probing.",
              description:
                "Only one candidate survived extraction so discovery should keep probing.",
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

    expect(result.jobs).toHaveLength(1);
    expect(result.incomplete).toBe(true);
    expect(result.steps).toBe(6);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(6);
  });

  test("discovery does not stop early when the held candidate set is misaligned with saved preferences", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract an initial but weak candidate set",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 4 },
                "tool_extract_misaligned_hold_seed",
              ),
            ],
          };
        }

        return {
          content: "keep probing because the current candidates are weak fits",
          toolCalls: [
            createToolCall(
              "get_interactive_elements",
              {},
              `tool_probe_misaligned_hold_${llmCallCount}`,
            ),
          ],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return Array.from({ length: 4 }, (_, index) => ({
            sourceJobId: `job_misaligned_hold_${index}`,
            canonicalUrl: `https://www.linkedin.com/jobs/view/job_misaligned_hold_${index}`,
            title: `Retail Category Manager ${index}`,
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote" as const],
            applyPath: "unknown" as const,
            postedAt: "2026-03-20T09:00:00.000Z",
            salaryText: null,
            summary:
              "Misaligned retail candidate set should not trigger early hold.",
            description:
              "Retail planning, merchandising, and category ownership.",
            easyApplyEligible: false,
            keySkills: ["Merchandising"],
            responsibilities: [],
          }));
        }

        return [];
      }),
    };

    const config = createConfig();
    config.maxSteps = 6;
    config.targetJobCount = 8;
    config.promptContext = {
      siteLabel: "Primary target",
    };
    config.searchPreferences = {
      targetRoles: ["Workflow engineer"],
      locations: ["Remote"],
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(4);
    expect(result.incomplete).toBe(true);
    expect(result.steps).toBe(6);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(6);
  });

  test("repeated navigation to an already visited URL does not reset the no-progress window", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract one strong sample job first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 1 },
                "tool_extract_revisit_seed",
              ),
            ],
          };
        }

        return {
          content: "retry the same results page even though nothing changes",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/search/", timeout: 5000 },
              `tool_navigate_revisit_${llmCallCount}`,
            ),
          ],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_revisit_seed",
              canonicalUrl:
                "https://www.linkedin.com/jobs/view/job_revisit_seed",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: "2026-03-20T09:00:00.000Z",
              salaryText: null,
              summary:
                "Seeded job before repeat navigation attempts stall the run.",
              description:
                "Seeded job before repeat navigation attempts stall the run.",
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
    config.maxSteps = 20;
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

    // Revisiting an already landed URL is not progress, so the no-progress
    // window still expires after eight stale steps instead of being reset by
    // every repeated navigation attempt.
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(9);
    expect(result.incomplete).toBe(true);
    expect(result.error).toContain("no new jobs");
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(9);
  });

  test("a genuinely new landing still buys bounded progress room before stopping", async () => {
    const page = createPage() as Page;
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract a strong candidate pair first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 2 },
                "tool_extract_new_url_seed",
              ),
            ],
          };
        }

        if (llmCallCount % 2 === 0) {
          return {
            content: "follow a fresh pagination route",
            toolCalls: [
              createToolCall(
                "navigate",
                {
                  url: `https://www.linkedin.com/jobs/collections/recommended/?start=${llmCallCount}`,
                  timeout: 5000,
                },
                `tool_navigate_new_url_${llmCallCount}`,
              ),
            ],
          };
        }

        return {
          content: "extract from each newly landed surface",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "job_detail", maxJobs: 1 },
              `tool_extract_new_url_${llmCallCount}`,
            ),
          ],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return Array.from({ length: 2 }, (_, index) => ({
            sourceJobId: `job_new_url_seed_${index}`,
            canonicalUrl: `https://www.linkedin.com/jobs/view/job_new_url_seed_${index}`,
            title: `Workflow Engineer ${index}`,
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote" as const],
            applyPath: "unknown" as const,
            postedAt: "2026-03-20T09:00:00.000Z",
            salaryText: null,
            summary:
              "Useful candidates while pagination is still opening new routes.",
            description:
              "Useful candidates while pagination is still opening new routes.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          }));
        }

        return [];
      }),
    };

    const config = createConfig();
    config.maxSteps = 20;
    config.targetJobCount = 8;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const progressActions: string[] = [];
    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
      (progress) => progressActions.push(progress.currentAction ?? ""),
    );

    // New landings do protect pagination between the click and the next
    // extraction turn, but only two consecutive resets are honored since the
    // last job gain. The first two navigations reset the window (last gain
    // moves to step 4); the third and fourth do not, so the yield-aware
    // exhaustion arm finally sees four stale steps and stops the run. With
    // unbounded resets this run would never stop before max steps.
    expect(result.jobs).toHaveLength(2);
    expect(result.steps).toBe(8);
    expect(result.incomplete).toBe(true);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(4);
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(8);
    expect(progressActions).toContain("stop_yield_exhausted_source");
  });

  test("aborting mid-run still interrupts discovery without invoking the stagnation arms", async () => {
    const page = createPage() as Page;
    const abortController = new AbortController();
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        llmCallCount += 1;

        if (llmCallCount === 1) {
          return {
            content: "extract one strong sample job first",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 1 },
                "tool_extract_abort_seed",
              ),
            ],
          };
        }

        abortController.abort();
        return {
          content: "No action taken",
          toolCalls: [],
        };
      }),
    };
    let extractionCallCount = 0;
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        extractionCallCount += 1;

        if (extractionCallCount === 1) {
          return [
            {
              sourceJobId: "job_abort_seed",
              canonicalUrl: "https://www.linkedin.com/jobs/view/job_abort_seed",
              title: "Workflow Engineer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote" as const],
              applyPath: "unknown" as const,
              postedAt: "2026-03-20T09:00:00.000Z",
              salaryText: null,
              summary: "Seeded job before the user cancels the run.",
              description: "Seeded job before the user cancels the run.",
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
    config.maxSteps = 20;
    config.targetJobCount = 4;
    config.promptContext = {
      siteLabel: "Primary target",
    };

    const result = await runAgentDiscovery(
      page,
      config,
      llmClient,
      jobExtractor,
      undefined,
      abortController.signal,
    );

    // Cancellation keeps its existing behavior: an interrupted incomplete
    // result that preserves the jobs collected so far.
    expect(result.jobs).toHaveLength(1);
    expect(result.steps).toBe(2);
    expect(result.incomplete).toBe(true);
    expect(result.error).toBeUndefined();
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(2);
  });
});
