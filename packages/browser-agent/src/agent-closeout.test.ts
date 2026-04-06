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

  test("phase-driven runs force closeout early once evidence stalls after enough proof is collected", async () => {
    const page = createPage() as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "extract a sample listing first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_early_force",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "open the broader jobs route next",
          toolCalls: [
            createToolCall(
              "navigate",
              { url: "https://www.linkedin.com/jobs/collections/recommended/", timeout: 5000 },
              "tool_nav_early_force",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "I already have enough evidence from this route.",
          toolCalls: [],
        })
        .mockResolvedValueOnce({
          content: "Still no new evidence beyond the sampled route.",
          toolCalls: [],
        })
        .mockImplementationOnce(async () => {
          return {
            content: "finish with the proven route guidance",
            toolCalls: [
              createToolCall(
                "finish",
                {
                  reason: "Enough evidence collected after the route stayed stable.",
                  summary:
                    "The sampled jobs route stayed stable and no new controls appeared after additional probing.",
                  reliableControls: [
                    "Recommendation collections stayed stable after the first successful sample.",
                  ],
                  trickyFilters: [],
                  navigationTips: [
                    "Start from the reusable jobs collection route when it already exposes matching listings.",
                  ],
                  applyTips: [],
                  warnings: [],
                },
                "tool_finish_early_force",
              ),
            ],
          };
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [
          {
            source: "target_site",
            sourceJobId: "job_early_force_1",
            discoveryMethod: "catalog_seed",
            canonicalUrl: "https://www.linkedin.com/jobs/view/job_early_force_1",
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

    const config = createConfig();
    config.maxSteps = 8;

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor);

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(5);
    expect(result.phaseCompletionMode).toBe("forced_finish");
    expect(result.steps).toBeLessThan(config.maxSteps);
  });

  test("phase-driven runs do not force closeout after only one stale turn with thin evidence", async () => {
    const page = createPage() as Page;
    let secondCallMessages: AgentMessage[] | null = null;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "extract a sample listing first",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_not_yet",
            ),
          ],
        })
        .mockImplementationOnce(async (messages) => {
          secondCallMessages = structuredClone(messages);
          return {
            content: "I have one sample but no stronger proof yet.",
            toolCalls: [],
          };
        })
        .mockResolvedValueOnce({
          content: "still no finish call",
          toolCalls: [],
        })
        .mockResolvedValueOnce({
          content: "finish after extra probing",
          toolCalls: [
            createToolCall(
              "finish",
              {
                reason: "Enough evidence collected after additional probing.",
                summary: "The phase needed more than one stale turn before closing.",
                reliableControls: [],
                trickyFilters: [],
                navigationTips: ["Keep probing until route evidence is stronger."],
                applyTips: [],
                warnings: [],
              },
              "tool_finish_after_extra_probe",
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      async extractJobsFromPage() {
        return [
          {
            source: "target_site",
            sourceJobId: "job_not_yet_force_1",
            discoveryMethod: "catalog_seed",
            canonicalUrl: "https://www.linkedin.com/jobs/view/job_not_yet_force_1",
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

    const config = createConfig();
    config.maxSteps = 6;

    await runAgentDiscovery(page, config, llmClient, jobExtractor);

    expect(
      (secondCallMessages ?? []).some(
        (message: AgentMessage) =>
          message.role === "user" &&
          message.content.includes("Final phase-closeout turn."),
      ),
    ).toBe(false);
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
              { url: "https://www.linkedin.com/jobs/collections/recommended/", timeout: 5000 },
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
              { url: "https://www.linkedin.com/jobs/collections/recommended/?collection=engineering", timeout: 5000 },
              "tool_nav_batch_3",
            ),
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 1 },
              "tool_extract_batch_3",
            ),
          ],
        })
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

  test("search-results extraction keeps fast-path jobs before the slower extractor runs", async () => {
    const page = {
      async goto() {
        return null as never;
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/'
      },
      async title() {
        return 'Primary target'
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
                'Use the jobs search filters and recommendations to find relevant roles quickly.',
              ]
                .join('\n')
                .repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_path_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_path_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                  'Easy Apply',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "extract the visible results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 2 },
              "tool_extract_fast_path",
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
    const progressEvents: Array<{ message?: string | null }> = [];

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 2,
        promptContext: {
          siteLabel: "Primary target",
        },
      },
      llmClient,
      jobExtractor,
      (progress) => {
        progressEvents.push({ message: progress.message });
      },
    );

    expect(result.jobs).toHaveLength(1);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(progressEvents.some((event) => event.message?.includes('Kept 1 new job'))).toBe(
      true,
    );
  });

  test("phase-driven search-results extraction skips the slower model extractor once fast path already produced jobs", async () => {
    const page = {
      async goto() {
        return null as never;
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/?currentJobId=438896875';
      },
      async title() {
        return 'Primary target';
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
              ].join('\n').repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_phase_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                  'Easy Apply',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'extract the visible results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_phase_fast_path',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'finish with structured findings',
          toolCalls: [
            createToolCall(
              'finish',
              {
                reason: 'Enough evidence collected.',
                summary: 'Fast path proved the route without waiting for slower extraction.',
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [],
                applyTips: [],
                warnings: [],
              },
              'tool_finish_phase_fast_path',
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const result = await runAgentDiscovery(
      page,
      createConfig(),
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(1);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0);
  });

  test("phase-driven search-results extraction still uses the slower extractor when fast path does not fill the requested evidence budget", async () => {
    const page = {
      async goto() {
        return null as never;
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return 'https://www.linkedin.com/jobs/search/?currentJobId=438896875';
      },
      async title() {
        return 'Primary target';
      },
      locator(selector: string) {
        if (selector === 'body') {
          return {
            async innerText() {
              return [
                'Search by title, skill, or company',
                'Frontend Engineer',
                'Acme',
                'Remote',
                'Apply',
                'Job description',
                'Build product interfaces for customer workflows.',
              ].join('\n').repeat(20)
            },
          } as never
        }

        return {
          async innerText() {
            return ''
          },
        } as never
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn)

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ['https://www.linkedin.com/jobs/view/job_fast_phase_partial_1']
        }

        if (serialized.includes('cardCandidates') || serialized.includes('application/ld+json')) {
          return {
            structuredDataCandidates: [],
            cardCandidates: [
              {
                canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_partial_1',
                anchorText: 'Frontend Engineer',
                headingText: 'Frontend Engineer',
                lines: [
                  'Frontend Engineer',
                  'Acme',
                  'Remote',
                  'Build product interfaces for customer workflows.',
                ],
              },
            ],
          }
        }

        return []
      },
    } as unknown as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'extract the visible results page',
          toolCalls: [
            createToolCall(
              'extract_jobs',
              { pageType: 'search_results', maxJobs: 2 },
              'tool_extract_phase_partial_fast_path',
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: 'finish with structured findings',
          toolCalls: [
            createToolCall(
              'finish',
              {
                reason: 'Enough evidence collected.',
                summary: 'Needed both fast and slower extraction paths to satisfy the budget.',
                reliableControls: [],
                trickyFilters: [],
                navigationTips: [],
                applyTips: [],
                warnings: [],
              },
              'tool_finish_phase_partial_fast_path',
            ),
          ],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: 'job_fast_phase_partial_2',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/job_fast_phase_partial_2',
          title: 'React Engineer',
          company: 'Beta',
          location: 'Remote',
          description: 'Second extracted job.',
          salaryText: null,
          summary: 'Second extracted job.',
          postedAt: '2026-03-20T09:00:00.000Z',
          workMode: ['remote' as const],
          applyPath: 'unknown' as const,
          easyApplyEligible: false,
          keySkills: ['React'],
        },
      ]),
    };

    const config = createConfig();
    config.targetJobCount = 2;

    const result = await runAgentDiscovery(page, config, llmClient, jobExtractor);

    expect(result.jobs).toHaveLength(2);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
  });

  test("discovery merges richer deferred fast-path candidates for the same results page key", async () => {
    let currentUrl = "https://www.linkedin.com/jobs/search/?currentJobId=111";
    let extractionCaptureCount = 0;
    const page = {
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
        return "Primary target";
      },
      locator(selector: string) {
        if (selector === "body") {
          return {
            async innerText() {
              return [
                "Search by title, skill, or company",
                "Frontend Engineer",
                "Acme",
                "Remote",
                "Apply",
                "Job description",
                "Build product interfaces for customer workflows.",
                "Use the jobs search filters and recommendations to find relevant roles quickly.",
              ]
                .join("\n")
                .repeat(20);
            },
          } as never;
        }

        return {
          async innerText() {
            return "";
          },
        } as never;
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn);

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return ["https://www.linkedin.com/jobs/view/job_merge_fast_path_1"];
        }

        if (serialized.includes("cardCandidates") || serialized.includes("application/ld+json")) {
          extractionCaptureCount += 1;
          return {
            structuredDataCandidates: [],
            cardCandidates:
              extractionCaptureCount === 1
                ? []
                : [
                    {
                      canonicalUrl: "https://www.linkedin.com/jobs/view/job_merge_fast_path_1",
                      anchorText: "Frontend Engineer",
                      headingText: "Frontend Engineer",
                      lines: [
                        "Frontend Engineer",
                        "Acme",
                        "Remote",
                        "Build product interfaces for customer workflows.",
                        "Easy Apply",
                      ],
                    },
                  ],
          };
        }

        return [];
      },
    } as unknown as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the first results page snapshot",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 2 },
              "tool_extract_merge_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "capture the same results page with richer candidates",
          toolCalls: [
            createToolCall(
              "navigate",
              {
                url: "https://www.linkedin.com/jobs/search/?currentJobId=222",
                timeout: 5000,
              },
              "tool_nav_merge_2",
            ),
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 2 },
              "tool_extract_merge_2",
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

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 1,
        promptContext: {
          siteLabel: "Primary target",
        },
        maxSteps: 5,
      },
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.canonicalUrl).toBe(
      "https://www.linkedin.com/jobs/view/job_merge_fast_path_1",
    );
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0);
  });

  test("deferred search-result flush does not call the slower extractor once fast path fills the capped budget", async () => {
    const page = {
      async goto() {
        return null as never;
      },
      async waitForTimeout() {
        return undefined;
      },
      url() {
        return "https://www.linkedin.com/jobs/search/?currentJobId=333";
      },
      async title() {
        return "Primary target";
      },
      locator(selector: string) {
        if (selector === "body") {
          return {
            async innerText() {
              return [
                "Search by title, skill, or company",
                "Frontend Engineer",
                "Acme",
                "Remote",
                "Apply",
                "Job description",
                "Build product interfaces for customer workflows.",
                "Use the jobs search filters and recommendations to find relevant roles quickly.",
              ]
                .join("\n")
                .repeat(20);
            },
          } as never;
        }

        return {
          async innerText() {
            return "";
          },
        } as never;
      },
      async evaluate(fn: unknown) {
        const serialized = String(fn);

        if (serialized.includes('querySelectorAll("a[href]")')) {
          return [
            "https://www.linkedin.com/jobs/view/job_budget_1",
            "https://www.linkedin.com/jobs/view/job_budget_2",
            "https://www.linkedin.com/jobs/view/job_budget_3",
            "https://www.linkedin.com/jobs/view/job_budget_4",
          ];
        }

        if (serialized.includes("cardCandidates") || serialized.includes("application/ld+json")) {
          return {
            structuredDataCandidates: [],
            cardCandidates: Array.from({ length: 4 }, (_, index) => ({
              canonicalUrl: `https://www.linkedin.com/jobs/view/job_budget_${index + 1}`,
              anchorText: `Frontend Engineer ${index + 1}`,
              headingText: `Frontend Engineer ${index + 1}`,
              lines: [
                `Frontend Engineer ${index + 1}`,
                "Acme",
                "Remote",
                "Build product interfaces for customer workflows.",
                "Easy Apply",
              ],
            })),
          };
        }

        return [];
      },
    } as unknown as Page;
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 10 },
              "tool_extract_budget_guard",
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

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 10,
        promptContext: {
          siteLabel: "Primary target",
        },
        maxSteps: 2,
      },
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(4);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0);
  });

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
              canonicalUrl: "https://www.linkedin.com/jobs/view/job_stagnation_seed",
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
});
