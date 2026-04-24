import type {
  BrowserSessionRuntime,
} from "@unemployed/browser-runtime";
import {
  JobPostingSchema,
  type DiscoveryActivityEvent,
} from "@unemployed/contracts";
import { describe, expect, test, vi } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createAiClient,
  createSeed,
  createSourceInstructionArtifact,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

function createDiscoveryOnlySeed() {
  return {
    ...createSeed(),
    settings: {
      resumeFormat: "pdf" as const,
      resumeTemplateId: "classic_ats" as const,
      fontPreset: "inter_requisite" as const,
      appearanceTheme: "system" as const,
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: true,
      discoveryOnly: true,
    },
    savedJobs: [],
    tailoredAssets: [],
    resumeDrafts: [],
    resumeDraftRevisions: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    resumeValidationResults: [],
    resumeAssistantMessages: [],
    applicationRecords: [],
    applicationAttempts: [],
  };
}

describe("createJobFinderWorkspaceService", () => {
  test("runs discovery and upserts saved jobs from the adapter", async () => {
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        savedJobs: [],
        tailoredAssets: [],
        resumeDrafts: [],
        resumeDraftRevisions: [],
        resumeExportArtifacts: [],
        resumeResearchArtifacts: [],
        resumeValidationResults: [],
        resumeAssistantMessages: [],
        applicationRecords: [],
        applicationAttempts: [],
      },
    });

    const snapshot = await workspaceService.runDiscovery();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs[0]?.canonicalUrl).toContain(
      "linkedin_signal_ready",
    );
    expect(snapshot.discoveryJobs[0]?.matchAssessment.reasons.length).toBeGreaterThan(0);
  });

  test("runDiscovery uses the non-agent browser runtime path even when agent discovery is available", async () => {
    let runDiscoveryCalls = 0;
    let runAgentDiscoveryCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runDiscovery(source) {
        runDiscoveryCalls += 1;
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Standard discovery run",
          warning: null,
          jobs: [
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: "standard_job_1",
              discoveryMethod: "catalog_seed",
              canonicalUrl: "https://example.com/jobs/standard-job-1",
              title: "Senior Product Designer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
              easyApplyEligible: true,
              postedAt: "2026-03-20T09:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:04:00.000Z",
              salaryText: "$180k - $220k",
              summary: "Own the design system.",
              description: "Own the design system and workflow platform.",
              keySkills: ["Figma", "Design Systems"],
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
            }),
          ],
          agentMetadata: null,
        });
      },
      runAgentDiscovery(source) {
        runAgentDiscoveryCalls += 1;
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Agent discovery run",
          warning: null,
          jobs: [],
          agentMetadata: {
            steps: 0,
            incomplete: false,
            transcriptMessageCount: 0,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.runDiscovery();

    expect(runDiscoveryCalls).toBe(1);
    expect(runAgentDiscoveryCalls).toBe(0);
    expect(snapshot.discoveryJobs).toHaveLength(1);
    expect(snapshot.discoveryJobs[0]?.sourceJobId).toBe("standard_job_1");
  });

  test("discovery-only mode treats jobs as pending and does not persist to saved jobs", async () => {
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
    });

    const snapshot = await workspaceService.runDiscovery();

    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs[0]?.status).toBe("discovered");
    expect(snapshot.discoveryJobs[0]?.provenance).toHaveLength(1);
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);

    const secondSnapshot = await workspaceService.runDiscovery();

    expect(secondSnapshot.discoveryJobs).toHaveLength(2);
    expect(
      secondSnapshot.discoveryJobs.filter(
        (job) => job.sourceJobId === "linkedin_signal_ready",
      ),
    ).toHaveLength(1);
    expect(secondSnapshot.discoveryJobs[0]?.provenance).toHaveLength(1);
    expect(secondSnapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
  });

  test("agent discovery streams activity and keeps discovery-only jobs pending", async () => {
    const seed = createDiscoveryOnlySeed();
    const catalog = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const baseAgentRuntime = createAgentBrowserRuntime(catalog.jobs);
    let openSessionCalls = 0;
    let closeSessionCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      openSession(source) {
        openSessionCalls += 1;
        return baseAgentRuntime.openSession(source);
      },
      closeSession(source) {
        closeSessionCalls += 1;
        return baseAgentRuntime.closeSession(source);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });
    const streamedEvents: DiscoveryActivityEvent[] = [];

    const snapshot = await workspaceService.runAgentDiscovery(
      (event) => {
        streamedEvents.push(event);
      },
      new AbortController().signal,
    );

    expect(streamedEvents.length).toBeGreaterThan(0);
    expect(streamedEvents.some((event) => event.kind === "progress")).toBe(true);
    expect(snapshot.discoveryJobs).toHaveLength(2);
    expect(snapshot.discoveryJobs.every((job) => job.status === "discovered")).toBe(
      true,
    );
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);
    expect(openSessionCalls).toBe(1);
    expect(closeSessionCalls).toBe(0);
    expect(snapshot.recentDiscoveryRuns[0]?.summary.browserCloseout?.mode).toBe(
      "kept_alive",
    );
    expect(snapshot.recentDiscoveryRuns[0]?.summary.timing?.eventCount).toBeGreaterThan(0);
    expect(snapshot.recentDiscoveryRuns[0]?.summary.timing?.firstActivityMs).not.toBeNull();
    expect(
      snapshot.recentDiscoveryRuns[0]?.targetExecutions[0]?.timing?.eventCount,
    ).toBeGreaterThan(0);
  });

  test("agent discovery keeps the remote adjacent technical candidate after generic technical triage widening", async () => {
    const seed = {
      ...createDiscoveryOnlySeed(),
      profile: {
        ...createDiscoveryOnlySeed().profile,
        headline: "Senior Full-Stack Software Engineer",
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
      searchPreferences: {
        ...createDiscoveryOnlySeed().searchPreferences,
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    };
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "LinkedIn discovery triage sample run",
          warning: null,
          jobs: [
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: "frontend_1",
              discoveryMethod: "browser_agent",
              collectionMethod: "listing_route",
              canonicalUrl: "https://www.linkedin.com/jobs/view/frontend_1",
              title: "Senior Frontend Engineer",
              company: "Fresha",
              location: "Prishtina, Kosovo",
              workMode: ["onsite"],
              applyPath: "unknown",
              easyApplyEligible: false,
              postedAt: "2026-03-20T09:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:04:00.000Z",
              salaryText: null,
              summary: "Frontend role",
              description: "Frontend role",
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
            }),
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: "ai_1",
              discoveryMethod: "browser_agent",
              collectionMethod: "listing_route",
              canonicalUrl: "https://www.linkedin.com/jobs/view/ai_1",
              title: "Software Engineer - AI products",
              company: "Quik Hire Staffing",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "unknown",
              easyApplyEligible: false,
              postedAt: "2026-03-20T09:00:00.000Z",
              postedAtText: null,
              discoveredAt: "2026-03-20T10:04:00.000Z",
              salaryText: null,
              summary: "AI role",
              description: "AI role",
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
            }),
          ],
          agentMetadata: {
            steps: 4,
            incomplete: false,
            transcriptMessageCount: 4,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });
    const streamedEvents: DiscoveryActivityEvent[] = [];

    await workspaceService.runAgentDiscovery(
      (event) => {
        streamedEvents.push(event);
      },
      new AbortController().signal,
    );

    const collectionEvent = streamedEvents.find(
      (event) => event.stage === "extraction" && event.message.includes("Collected 2 candidate jobs"),
    );
    const scoringEvent = streamedEvents.find(
      (event) =>
        event.stage === "scoring" &&
        event.message.includes('"Software Engineer - AI products at Quik Hire Staffing"'),
    );

    expect(scoringEvent).toBeDefined();
    expect(collectionEvent?.message).toContain('"Senior Frontend Engineer at Fresha"');
    expect(collectionEvent?.message).toContain('"Software Engineer - AI products at Quik Hire Staffing"');
    expect(scoringEvent!.message).toContain("Reviewing 1 promising jobs");
    expect(scoringEvent!.message).toContain(
      '"Software Engineer - AI products at Quik Hire Staffing"',
    );
    expect(scoringEvent!.message).not.toContain('"Senior Frontend Engineer at Fresha"');
  });

  test("agent discovery persists lightweight compaction metadata without persisting raw transcripts on target executions", async () => {
    const seed = createDiscoveryOnlySeed();
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Compaction metadata discovery run",
          warning: null,
          jobs: [],
          agentMetadata: {
            steps: 6,
            incomplete: false,
            transcriptMessageCount: 5,
            reviewTranscript: ["assistant: hidden raw transcript line"],
            compactionState: {
              compactedAt: "2026-03-20T10:00:03.000Z",
              compactionCount: 1,
              triggerKind: "token_budget",
              estimatedTokensBefore: 132000,
              estimatedTokensAfter: 76000,
              summary: "Compacted worker transcript before budget exhaustion.",
              confirmedFacts: ["Visited 4 pages."],
              blockerNotes: [],
              avoidStrategyFingerprints: [
                "search_filter_probe:target_site:search filter probe",
              ],
              preservedContext: ["Principal Designer at Acme"],
              stickyWorkflowState: ["Phase goal: Find jobs"],
            },
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
    );

    const targetExecution = snapshot.recentDiscoveryRuns[0]?.targetExecutions[0];
    expect(targetExecution?.compactionState?.compactionCount).toBe(1);
    expect(targetExecution?.compactionState?.triggerKind).toBe("token_budget");
    expect(targetExecution?.compactionUsedFallbackTrigger).toBe(false);
    expect(JSON.stringify(targetExecution)).not.toContain(
      "hidden raw transcript line",
    );
  });

  test("agent discovery abort keeps streamed activity and avoids persistence", async () => {
    const discoveryResult = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime: createAgentBrowserRuntime(discoveryResult.jobs),
      aiClient: createAgentAiClient(),
    });
    const streamedEvents: DiscoveryActivityEvent[] = [];
    const controller = new AbortController();

    const snapshot = await workspaceService.runAgentDiscovery(
      (event) => {
        streamedEvents.push(event);
        if (event.kind === "progress") {
          controller.abort();
        }
      },
      controller.signal,
    );

    expect(streamedEvents.some((event) => event.kind === "progress")).toBe(true);
    expect(snapshot.discoveryJobs).toHaveLength(0);
    expect(snapshot.reviewQueue).toHaveLength(0);
    await expect(repository.listSavedJobs()).resolves.toHaveLength(0);
    expect(snapshot.applicationRecords).toHaveLength(0);
    expect(snapshot.applicationAttempts).toHaveLength(0);
  });

  test("shutdown aborts an in-flight discovery run before closing persistence", async () => {
    let allowDiscoveryToFinish: (() => void) | null = null;
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      async runAgentDiscovery(source, options) {
        options.onProgress?.({
          currentUrl: options.startingUrls[0] ?? "https://example.com/jobs",
          jobsFound: 0,
          stepCount: 1,
          currentAction: "navigate",
          targetId: null,
          adapterKind: source,
        });

        await new Promise<void>((resolve, reject) => {
          allowDiscoveryToFinish = resolve;
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });

        return {
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Long-running discovery test run",
          warning: null,
          jobs: [],
          agentMetadata: null,
        };
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const discoveryPromise = workspaceService.runAgentDiscovery(() => {});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    await expect(workspaceService.shutdown()).resolves.toBeUndefined();

    const snapshot = await discoveryPromise;
    const discoveryState = await repository.getDiscoveryState();

    expect(snapshot.activeDiscoveryRun).toBeNull();
    expect(snapshot.recentDiscoveryRuns[0]?.state).toBe("cancelled");
    expect(discoveryState.activeRun).toBeNull();
    expect(discoveryState.recentRuns[0]?.state).toBe("cancelled");

  });

  test("agent discovery does not throw when the configured AI client lacks tool calling", async () => {
    const discoveryResult = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const baseAgentRuntime = createAgentBrowserRuntime(discoveryResult.jobs);
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      runAgentDiscovery(source, options) {
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Agent discovery test run",
          warning: options.aiClient?.chatWithTools
            ? null
            : "AI client does not support tool calling. Cannot run agent discovery.",
          jobs: [],
          agentMetadata: null,
        });
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient: createAiClient(),
    });

    const snapshot = await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
    );

    expect(snapshot.discoveryJobs).toHaveLength(0);
    expect(snapshot.recentDiscoveryRuns[0]?.targetExecutions[0]?.warning).toBe(
      "AI client does not support tool calling. Cannot run agent discovery.",
    );
  });

  test("agent discovery budgets remaining jobs across multiple targets", async () => {
    const seed = createDiscoveryOnlySeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_one",
        label: "Target One",
        startingUrl: "https://example.com/jobs/one",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_two",
        label: "Target Two",
        startingUrl: "https://example.com/jobs/two",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_three",
        label: "Target Three",
        startingUrl: "https://example.com/jobs/three",
      },
    ];

    const capturedBudgets: Array<{ targetJobCount: number; maxSteps: number }> = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source, options) {
        capturedBudgets.push({
          targetJobCount: options.targetJobCount,
          maxSteps: options.maxSteps,
        });

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Budgeted discovery test run",
          warning: null,
          jobs: Array.from({ length: options.targetJobCount }, (_, index) =>
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: `${options.startingUrls[0]}_${index}`,
              discoveryMethod: "browser_agent",
              canonicalUrl: `https://example.com/job/${capturedBudgets.length}-${index}`,
              title: `Principal Designer ${capturedBudgets.length}-${index}`,
              company: "Acme",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "unknown",
              easyApplyEligible: false,
              postedAt: null,
              postedAtText: null,
              discoveredAt: "2026-03-20T10:00:00.000Z",
              salaryText: null,
              summary: "Grounded summary",
              description: "Grounded description",
              keySkills: ["React"],
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
            }),
          ),
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 4,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAiClient(),
    });

    const snapshot = await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
    );

    expect(capturedBudgets).toEqual([
      { targetJobCount: 7, maxSteps: 42 },
      { targetJobCount: 7, maxSteps: 42 },
      { targetJobCount: 6, maxSteps: 20 },
    ]);
    expect(snapshot.recentDiscoveryRuns[0]?.summary.validJobsFound).toBe(20);
  });

  test("single-target agent discovery uses a tighter product budget", async () => {
    const capturedBudgets: Array<{ targetJobCount: number; maxSteps: number }> = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source, options) {
        capturedBudgets.push({
          targetJobCount: options.targetJobCount,
          maxSteps: options.maxSteps,
        });

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Single-target budgeted discovery test run",
          warning: null,
          jobs: [],
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 4,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient: createAiClient(),
    });

    await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
      "target_linkedin_default",
    );

    expect(capturedBudgets).toEqual([{ targetJobCount: 8, maxSteps: 24 }]);
  });

  test("single-target agent discovery passes the provider-aware LinkedIn query-first starting url", async () => {
    const capturedStartingUrls: string[][] = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source, options) {
        capturedStartingUrls.push([...options.startingUrls]);

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Query-first discovery test run",
          warning: null,
          jobs: [],
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 4,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient: createAiClient(),
    });

    await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
      "target_linkedin_default",
    );

    expect(capturedStartingUrls).toEqual([[
      "https://www.linkedin.com/jobs/search/",
    ]]);
  });

  test("agent discovery merge uses deterministic fit scoring without model fit calls", async () => {
    const browserRuntime = createAgentBrowserRuntime([
      {
        source: "target_site",
        sourceJobId: "job_alpha",
        discoveryMethod: "browser_agent",
        canonicalUrl: "https://example.com/jobs/alpha",
        title: "Senior Product Designer",
        company: "Signal Systems",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T09:00:00.000Z",
        discoveredAt: "2026-03-20T10:04:00.000Z",
        salaryText: "$180k - $220k",
        summary: "Own the design system.",
        description: "Own the design system and workflow platform.",
        keySkills: ["Figma", "Design Systems"],
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
    ]);
    let assessJobFitCalls = 0;
    const aiClient = {
      ...createAiClient(),
      assessJobFit() {
        assessJobFitCalls += 1;
        return Promise.resolve({
          score: 12,
          reasons: ["Should not be used"],
          gaps: [],
        });
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: createDiscoveryOnlySeed(),
      browserRuntime,
      aiClient,
    });

    const snapshot = await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
    );

    expect(assessJobFitCalls).toBe(0);
    expect(snapshot.discoveryJobs[0]?.matchAssessment.score).toBeGreaterThan(12);
  });

  test("agent discovery skips remaining targets once the run already has enough jobs", async () => {
    const seed = createDiscoveryOnlySeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_one",
        label: "Target One",
        startingUrl: "https://example.com/jobs/one",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_two",
        label: "Target Two",
        startingUrl: "https://example.com/jobs/two",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_three",
        label: "Target Three",
        startingUrl: "https://example.com/jobs/three",
      },
    ];

    let runAgentDiscoveryCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source) {
        runAgentDiscoveryCalls += 1;

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Early-stop discovery test run",
          warning: null,
          jobs: Array.from({ length: 20 }, (_, index) =>
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: `job_${index}`,
              discoveryMethod: "browser_agent",
              canonicalUrl: `https://example.com/job/${index}`,
              title: `Principal Designer ${index}`,
              company: "Acme",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "unknown",
              easyApplyEligible: false,
              postedAt: null,
              postedAtText: null,
              discoveredAt: "2026-03-20T10:00:00.000Z",
              salaryText: null,
              summary: "Grounded summary",
              description: "Grounded description",
              keySkills: ["React"],
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
            }),
          ),
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 4,
            reviewTranscript: [],
            compactionState: null,
            compactionUsedFallbackTrigger: false,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAiClient(),
    });

    const snapshot = await workspaceService.runAgentDiscovery(
      () => {},
      new AbortController().signal,
    );

    expect(runAgentDiscoveryCalls).toBe(1);
    expect(snapshot.recentDiscoveryRuns[0]?.targetExecutions.map((entry) => entry.state)).toEqual([
      "completed",
      "skipped",
      "skipped",
    ]);
  });

  test("agent discovery prioritizes API-backed and better-seeded targets before weaker browser targets", async () => {
    const seed = createDiscoveryOnlySeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_browser_missing",
        label: "Missing Browser Target",
        startingUrl: "https://example.com/careers",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_greenhouse_remote",
        label: "Greenhouse Target",
        startingUrl: "https://job-boards.greenhouse.io/remote",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_browser_validated",
        label: "Validated Browser Target",
        startingUrl: "https://example.com/jobs/",
        instructionStatus: "validated",
        validatedInstructionId: "instruction_browser_validated",
      },
    ];
    seed.sourceInstructionArtifacts = [
      createSourceInstructionArtifact({
        id: "instruction_browser_validated",
        targetId: "target_browser_validated",
        status: "validated",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: "2026-03-20T10:06:00.000Z",
        basedOnRunId: "debug_run_browser_validated",
        basedOnAttemptIds: ["debug_attempt_browser_validated"],
        notes: "Use the learned jobs search route before the generic landing page.",
        navigationGuidance: [],
        searchGuidance: [],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: {
          id: "verification_browser_validated",
          replayRunId: "debug_run_browser_validated_replay",
          verifiedAt: "2026-03-20T10:07:00.000Z",
          outcome: "passed",
          proofSummary: "Replay succeeded.",
          reason: null,
          versionInfo: {
            promptProfileVersion: "v1",
            toolsetVersion: "v1",
            adapterVersion: "v1",
            appSchemaVersion: "v1",
          },
        },
        intelligence: {
          provider: null,
          collection: {
            preferredMethod: "listing_route",
            rankedMethods: ["listing_route", "careers_page", "fallback_search"],
            startingRoutes: [
              {
                url: "https://example.com/jobs/",
                label: "Jobs landing route",
                kind: "listing",
                confidence: 0.86,
              },
            ],
            searchRouteTemplates: [
              {
                url: "https://example.com/jobs/search",
                label: "Learned jobs search route",
                kind: "search",
                confidence: 0.95,
              },
            ],
            detailRoutePatterns: [],
            listingMarkers: [],
          },
          apply: {
            applyPath: "unknown",
            authMarkers: [],
            consentMarkers: [],
            questionSurfaceHints: [],
            resumeUploadHints: [],
          },
          reliability: {
            selectorFingerprints: [],
            stableControlNames: [],
            failureFingerprints: [],
            verifiedAt: null,
            freshnessNotes: [],
          },
          overrides: {
            forceMethod: null,
            deniedRoutePatterns: [],
            extraStartingRoutes: [],
          },
        },
      }),
    ];

    const baseAgentRuntime = createAgentBrowserRuntime([]);
    const requestedLabels: string[] = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      runAgentDiscovery(source, options) {
        requestedLabels.push(options.siteLabel);
        return baseAgentRuntime.runAgentDiscovery!(source, options);
      },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 4622190,
              title: "API-first role",
              absolute_url: "https://job-boards.greenhouse.io/remote/jobs/4622190",
              location: { name: "Remote" },
              updated_at: "2026-03-20T10:00:00.000Z",
              content: "<p>Collect this through the provider API.</p>",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    try {
      const { workspaceService } = createWorkspaceServiceHarness({
        seed,
        browserRuntime,
        aiClient: createAgentAiClient(),
      });

      const snapshot = await workspaceService.runAgentDiscovery(
        () => {},
        new AbortController().signal,
      );

      expect(snapshot.recentDiscoveryRuns[0]?.targetIds).toEqual([
        "target_greenhouse_remote",
        "target_browser_validated",
        "target_browser_missing",
      ]);
      expect(requestedLabels).toEqual([
        "Validated Browser Target",
        "Missing Browser Target",
      ]);
      expect(fetchSpy).toHaveBeenCalledOnce();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("single-target discovery only runs the requested source", async () => {
    const seed = createDiscoveryOnlySeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_one",
        label: "Target One",
        startingUrl: "https://example.com/jobs/one",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_two",
        label: "Target Two",
        startingUrl: "https://example.com/jobs/two",
      },
    ];

    const requestedLabels: string[] = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...createAgentBrowserRuntime([]),
      runAgentDiscovery(source, options) {
        requestedLabels.push(options.siteLabel);

        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:00:05.000Z",
          querySummary: "Single-target discovery test run",
          warning: null,
          jobs: [
            JobPostingSchema.parse({
              source: "target_site",
              sourceJobId: `${options.siteLabel.toLowerCase().replace(/\s+/g, "_")}_job_1`,
              discoveryMethod: "browser_agent",
              canonicalUrl: `https://example.com/job/${options.siteLabel.toLowerCase().replace(/\s+/g, "-")}`,
              title: "Principal Designer",
              company: "Acme",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "unknown",
              easyApplyEligible: false,
              postedAt: null,
              postedAtText: null,
              discoveredAt: "2026-03-20T10:00:00.000Z",
              salaryText: null,
              summary: "Grounded summary",
              description: "Grounded description",
              keySkills: ["React"],
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
            }),
          ],
          agentMetadata: null,
        });
      },
    };

    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.runDiscoveryForTarget(
      "target_two",
      () => {},
      new AbortController().signal,
    );

    expect(requestedLabels).toEqual(["Target Two"]);
    expect(snapshot.recentDiscoveryRuns[0]?.scope).toBe("single_target");
    expect(snapshot.recentDiscoveryRuns[0]?.targetIds).toEqual(["target_two"]);
    expect(snapshot.discoveryJobs).toHaveLength(1);
    expect(snapshot.discoveryJobs[0]?.provenance[0]?.targetId).toBe("target_two");
  });

});
