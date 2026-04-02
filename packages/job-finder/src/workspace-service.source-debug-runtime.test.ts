import {
  createCatalogBrowserSessionRuntime,
  type BrowserSessionRuntime,
} from "@unemployed/browser-runtime";
import { describe, expect, test } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createSeed,
  createStrongSourceDebugFindingsByPhase,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("pauses source debug when the phase worker reports a login blocker", async () => {
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [],
      catalog: [],
    });
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:01:00.000Z",
          querySummary: "Agent discovery test run",
          warning:
            "Login required: Sign in before source debugging can continue.",
          jobs: [],
          agentMetadata: {
            steps: 1,
            incomplete: false,
            transcriptMessageCount: 3,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: "blocked_auth",
            phaseCompletionReason:
              "Login required: Sign in before source debugging can continue.",
            phaseEvidence: null,
            debugFindings: {
              summary:
                "Login wall blocks further source debugging until the user signs in.",
              reliableControls: [],
              trickyFilters: [],
              navigationTips: [],
              applyTips: [],
              warnings: ["Sign in before continuing the source-debug run."],
            },
          },
        });
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: createSeed(),
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.runSourceDebug("target_linkedin_default");
    const attempts = await repository.listSourceDebugAttempts();

    expect(snapshot.activeSourceDebugRun?.state).toBe("paused_manual");
    expect(snapshot.activeSourceDebugRun?.manualPrerequisiteSummary).toContain(
      "Sign in",
    );
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe("paused_manual");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("blocked_auth");
    expect(snapshot.searchPreferences.discovery.targets[0]?.instructionStatus).toBe(
      "missing",
    );
  });

  test("source debug skips session preflight, passes skipSessionValidation to the runtime, and keeps internal agent failures out of learned guidance", async () => {
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [
        {
          source: "target_site",
          status: "login_required",
          driver: "catalog_seed",
          label: "Browser session needs login",
          detail: "Sign in first.",
          lastCheckedAt: "2026-03-20T10:04:00.000Z",
        },
      ],
      catalog: [],
    });
    let openSessionCalls = 0;
    let closeSessionCalls = 0;
    const skipSessionValidationFlags: boolean[] = [];
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      openSession(source) {
        openSessionCalls += 1;
        return Promise.resolve({
          source,
          status: "ready",
          driver: "catalog_seed",
          label: "Browser session ready",
          detail: "Opened for source debug.",
          lastCheckedAt: "2026-03-20T10:05:00.000Z",
        });
      },
      closeSession(source) {
        closeSessionCalls += 1;
        return Promise.resolve({
          source,
          status: "unknown",
          driver: "catalog_seed",
          label: "Browser session closed",
          detail: "Closed after source debug.",
          lastCheckedAt: "2026-03-20T10:06:00.000Z",
        });
      },
      runAgentDiscovery(source, options) {
        skipSessionValidationFlags.push(options.skipSessionValidation === true);
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:01:00.000Z",
          querySummary: "Agent discovery test run",
          warning:
            "Discovery encountered an error: LLM call failed after 3 attempts: temporary upstream failure",
          jobs: [],
          agentMetadata: {
            steps: 2,
            incomplete: false,
            transcriptMessageCount: 5,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: "runtime_failed",
            phaseCompletionReason:
              "Discovery encountered an error: LLM call failed after 3 attempts: temporary upstream failure",
            phaseEvidence: null,
            debugFindings: null,
          },
        });
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.runSourceDebug("target_linkedin_default");
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1);
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? []),
      ...(latestArtifact?.warnings ?? []),
    ].join("\n");

    expect(openSessionCalls).toBe(1);
    expect(closeSessionCalls).toBe(1);
    expect(skipSessionValidationFlags.length).toBeGreaterThan(0);
    expect(skipSessionValidationFlags.every(Boolean)).toBe(true);
    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe("failed");
    expect(learnedLines.toLowerCase()).not.toContain("agent runtime failed");
    expect(learnedLines.toLowerCase()).not.toContain("llm call failed");
    expect(learnedLines.toLowerCase()).not.toContain(
      "discovery encountered an error",
    );
  });

  test("rejects starting a second source-debug run while one is already active", async () => {
    let releaseFirstRun!: () => void;
    const firstRunBlocked = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_source_debug_concurrent",
          discoveryMethod: "catalog_seed",
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/linkedin_source_debug_concurrent",
          title: "Staff Product Designer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: "$180k - $220k",
          summary: "Validate stable job detail routes.",
          description: "Validate stable job detail routes.",
          keySkills: ["Figma", "React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    let runCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      async runAgentDiscovery(source, options) {
        runCalls += 1;
        if (runCalls === 1) {
          await firstRunBlocked;
        }
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const firstRunPromise = workspaceService.runSourceDebug("target_linkedin_default");
    await Promise.resolve();

    await expect(
      workspaceService.runSourceDebug("target_linkedin_default"),
    ).rejects.toThrow(/already in progress/i);

    releaseFirstRun();
    const snapshot = await firstRunPromise;

    expect(snapshot.recentSourceDebugRuns[0]?.state).toBe("completed");
  });

  test("filters noisy step-budget and direct-url hack lines out of learned source guidance", async () => {
    const baseRuntime = createCatalogBrowserSessionRuntime({
      sessions: [
        {
          source: "target_site",
          status: "ready",
          driver: "catalog_seed",
          label: "Browser session ready",
          detail: "Validated recently.",
          lastCheckedAt: "2026-03-20T10:04:00.000Z",
        },
      ],
      catalog: [
        {
          source: "target_site",
          sourceJobId: "linkedin_noise_case",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_noise_case",
          title: "Frontend Developer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Noise filter case.",
          description: "Noise filter case.",
          keySkills: ["React"],
        },
      ],
    });
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source) {
        return Promise.resolve({
          source,
          startedAt: "2026-03-20T10:00:00.000Z",
          completedAt: "2026-03-20T10:01:00.000Z",
          querySummary: "Agent discovery test run",
          warning: "Agent discovery stopped after 12 steps. Found 0 jobs.",
          jobs: [
            {
              source: "target_site",
              sourceJobId: "linkedin_noise_case",
              discoveryMethod: "catalog_seed",
              canonicalUrl:
                "https://www.linkedin.com/jobs/view/linkedin_noise_case",
              title: "Frontend Developer",
              company: "Signal Systems",
              location: "Remote",
              workMode: ["remote"],
              applyPath: "easy_apply",
              easyApplyEligible: true,
              postedAt: "2026-03-20T09:00:00.000Z",
              discoveredAt: "2026-03-20T10:04:00.000Z",
              salaryText: null,
              summary: "Noise filter case.",
              description: "Noise filter case.",
              keySkills: ["React"],
            },
          ],
          agentMetadata: {
            steps: 12,
            incomplete: true,
            transcriptMessageCount: 7,
            reviewTranscript: [],
            compactionState: null,
            phaseCompletionMode: "timed_out_with_partial_evidence",
            phaseCompletionReason:
              "The phase timed out before the worker returned a structured finish call.",
            phaseEvidence: null,
            debugFindings: {
              summary: "Use the jobs route and reusable show-all collection path.",
              reliableControls: [
                "Recommendation rows expose show-all links that open reusable prefiltered job lists.",
                "Location encoding: Use %2C for comma and %20 for spaces.",
                "Jobs landing URL: https://www.linkedin.com/jobs/search/?location=Prishtina%2C%20Kosovo&geoId=103175575",
              ],
              trickyFilters: [
                "Job availability may change frequently - verify current postings before applying.",
                "Direct URL navigation with query parameters bypasses the need to use the search box manually.",
                "CurrentJobId appears in the URL after viewing a listing.",
              ],
              navigationTips: [
                "Start from the jobs hub and recommendation collections rather than the homepage.",
              ],
              applyTips: [
                "Use the on-site apply entry when the detail page exposes it.",
              ],
              warnings: ["Agent discovery stopped after 12 steps. Found 0 jobs."],
            },
          },
        });
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...createSeed(),
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");
    const latestArtifact = (await repository.listSourceInstructionArtifacts()).at(-1);
    const learnedLines = [
      ...(latestArtifact?.navigationGuidance ?? []),
      ...(latestArtifact?.searchGuidance ?? []),
      ...(latestArtifact?.detailGuidance ?? []),
      ...(latestArtifact?.applyGuidance ?? []),
      ...(latestArtifact?.warnings ?? []),
    ]
      .join("\n")
      .toLowerCase();

    expect(learnedLines).not.toContain("agent discovery stopped after");
    expect(learnedLines).not.toContain("location encoding");
    expect(learnedLines).not.toContain("%2c");
    expect(learnedLines).not.toContain("query parameters");
    expect(learnedLines).not.toContain("geoid");
    expect(learnedLines).not.toContain("currentjobid");
    expect(learnedLines).not.toContain("job availability may change frequently");
  });
});
