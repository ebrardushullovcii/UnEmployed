import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  JobPostingSchema,
  type DiscoveryActivityEvent,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createAiClient,
  createSeed,
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
      runAgentDiscovery(source, options) {
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
      { targetJobCount: 6, maxSteps: 36 },
    ]);
    expect(snapshot.recentDiscoveryRuns[0]?.summary.validJobsFound).toBe(20);
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
