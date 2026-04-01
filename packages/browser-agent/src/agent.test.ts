import { describe, expect, test } from "vitest";
import { vi } from "vitest";
import type { Page } from "playwright";
import type { CandidateProfile, ToolCall } from "@unemployed/contracts";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import type { AgentConfig, AgentMessage } from "./types";

function createProfile(): CandidateProfile {
  return {
    id: "candidate_1",
    firstName: "Alex",
    lastName: "Vanguard",
    middleName: null,
    fullName: "Alex Vanguard",
    preferredDisplayName: null,
    headline: "Workflow engineer",
    summary: "Builds reliable automation.",
    currentLocation: "London, UK",
    currentCity: null,
    currentRegion: null,
    currentCountry: null,
    timeZone: null,
    yearsExperience: 8,
    email: null,
    secondaryEmail: null,
    phone: null,
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    baseResume: {
      id: "resume_1",
      fileName: "resume.txt",
      uploadedAt: "2026-03-20T10:00:00.000Z",
      storagePath: null,
      textContent: "Resume text",
      textUpdatedAt: "2026-03-20T10:00:00.000Z",
      extractionStatus: "ready",
      lastAnalyzedAt: "2026-03-20T10:01:00.000Z",
      analysisProviderKind: "deterministic",
      analysisProviderLabel: "Built-in deterministic agent fallback",
      analysisWarnings: [],
    },
    workEligibility: {
      authorizedWorkCountries: [],
      requiresVisaSponsorship: null,
      willingToRelocate: null,
      preferredRelocationRegions: [],
      willingToTravel: null,
      remoteEligible: null,
      noticePeriodDays: null,
      availableStartDate: null,
      securityClearance: null,
    },
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: [],
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: [],
    },
    targetRoles: ["Workflow engineer"],
    locations: ["Remote"],
    skills: ["React"],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
  };
}

function createConfig(): AgentConfig {
  return {
    source: "target_site",
    maxSteps: 4,
    targetJobCount: 1,
    userProfile: createProfile(),
    searchPreferences: {
      targetRoles: ["Workflow engineer"],
      locations: ["Remote"],
    },
    startingUrls: ["https://www.linkedin.com/jobs/search/"],
    navigationPolicy: {
      allowedHostnames: ["www.linkedin.com"],
    },
    promptContext: {
      siteLabel: "Primary target",
      taskPacket: {
        phaseGoal: "Verify job discovery routes.",
        knownFacts: ["Start from the search route."],
        priorPhaseSummary: null,
        avoidStrategyFingerprints: [
          "access_auth_probe:target_site:access auth probe",
        ],
        successCriteria: ["Reach the site", "Collect evidence"],
        stopConditions: ["Stop when enough evidence is collected."],
        manualPrerequisiteState: null,
        strategyLabel: "Search Filter Probe",
      },
    },
    compaction: {
      maxTranscriptMessages: 5,
      preserveRecentMessages: 2,
      maxToolPayloadChars: 48,
    },
  };
}

function createPage(): Pick<
  Page,
  "goto" | "waitForTimeout" | "url" | "title" | "locator" | "evaluate"
> {
  let currentUrl = "about:blank";
  const bodyLocator = {
    async innerText() {
      return [
        "Search by title, skill, or company",
        "Workflow Engineer",
        "Signal Systems",
        "Remote",
        "Apply",
        "Job description",
        "Build resilient automation workflows for distributed teams.",
        "Responsibilities include search, filters, routing, and job discovery.",
        "Qualifications include React, TypeScript, automation, browser tooling, and workflow design.",
        "Benefits include remote work, health coverage, learning budget, and flexible hours.",
        "Use the search filters and recommendation collections to find relevant jobs quickly.",
        "This listing is part of a reusable jobs flow with visible controls and detail pages.",
      ]
        .join("\n")
        .repeat(3);
    },
  };

  return {
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
    locator() {
      return bodyLocator as never;
    },
    async evaluate() {
      return [];
    },
  };
}

function createToolCall(
  name: string,
  args: Record<string, unknown>,
  id: string,
): ToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

describe("runAgentDiscovery", () => {
  test("compacts long worker transcripts into summarized state", async () => {
    const page = createPage() as Page;
    const llmCalls: ToolCall[][] = [
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

  test("compaction preserves tool-call context so later llm requests do not start with orphan tool messages", async () => {
    const page = createPage() as Page;
    const llmCalls: ToolCall[][] = [
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
          secondCallMessages = messages;
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
    expect(
      result.phaseEvidence?.warnings.some((entry) =>
        entry.includes("not-found route"),
      ),
    ).toBe(true);
    expect(
      result.phaseEvidence?.routeSignals.some((entry) =>
        entry.includes("Recovered to the last known jobs surface"),
      ),
    ).toBe(true);
    expect(result.debugFindings?.summary).toContain(
      "Recovered from a broken route",
    );
  });
});
