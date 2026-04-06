import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import { describe, expect, test } from "vitest";
import {
  createAgentAiClient,
  createAgentBrowserRuntime,
  createSeed,
  createStrongSourceDebugFindingsByPhase,
  createWorkspaceServiceHarness,
  toEditableSourceInstructionArtifactInput,
} from "./workspace-service.test-support";

describe("createJobFinderWorkspaceService", () => {
  test("agent discovery uses the active draft-or-validated instructions for the matching target", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_linkedin_accepted_draft",
        label: "Draft target",
        startingUrl: "https://www.linkedin.com/jobs/",
        instructionStatus: "draft",
        validatedInstructionId: null,
        draftInstructionId: "instruction_linkedin_draft_accepted",
      },
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        id: "target_linkedin_validated",
        label: "Validated target",
        startingUrl: "https://www.linkedin.com/jobs/search/",
        instructionStatus: "validated",
        validatedInstructionId: "instruction_linkedin_validated",
        draftInstructionId: null,
      },
    ];
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_draft_accepted",
        targetId: "target_linkedin_accepted_draft",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_draft",
        basedOnAttemptIds: ["debug_attempt_draft"],
        notes: "Accepted draft guidance.",
        navigationGuidance: ["Use the accepted draft recommendation route first."],
        searchGuidance: [
          "Open the accepted draft collection before trying broader search.",
        ],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
      {
        id: "instruction_linkedin_validated",
        targetId: "target_linkedin_validated",
        status: "validated",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: "2026-03-20T10:06:00.000Z",
        basedOnRunId: "debug_run_validated",
        basedOnAttemptIds: ["debug_attempt_validated"],
        notes: "Validated guidance.",
        navigationGuidance: ["Use the validated jobs search route directly."],
        searchGuidance: [
          "Use the validated location filter after opening the results page.",
        ],
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
          id: "verification_linkedin_validated",
          replayRunId: "debug_run_replay_validated",
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
      },
    ];

    const catalog = await createWorkspaceServiceHarness().browserRuntime.runDiscovery(
      "target_site",
      createSeed().searchPreferences,
    );
    const baseAgentRuntime = createAgentBrowserRuntime(catalog.jobs);
    const capturedInstructionsByLabel = new Map<string, readonly string[]>();
    const browserRuntime: BrowserSessionRuntime = {
      ...baseAgentRuntime,
      runAgentDiscovery(source, options) {
        capturedInstructionsByLabel.set(options.siteLabel, [
          ...(options.siteInstructions ?? []),
        ]);
        return baseAgentRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runAgentDiscovery(() => {}, new AbortController().signal);

    expect(capturedInstructionsByLabel.get("Draft target")).toEqual(
      expect.arrayContaining([
        "[Navigation] Use the accepted draft recommendation route first.",
        "[Search] Open the accepted draft collection before trying broader search.",
      ]),
    );
    expect(capturedInstructionsByLabel.get("Draft target")?.join("\n")).not.toContain(
      "validated jobs search route directly",
    );
    expect(capturedInstructionsByLabel.get("Validated target")).toEqual(
      expect.arrayContaining([
        "[Navigation] Use the validated jobs search route directly.",
        "[Search] Use the validated location filter after opening the results page.",
      ]),
    );
    expect(capturedInstructionsByLabel.get("Validated target")?.join("\n")).not.toContain(
      "accepted draft recommendation route first",
    );
  });

  test("source debug reuses learned route hints for later phases and uses tighter phase budgets", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      startingUrl: "https://www.linkedin.com/jobs/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_linkedin_debug_seeded",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_debug_seeded",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_seeded",
        basedOnAttemptIds: ["debug_attempt_seeded"],
        notes: "Seeded route hints.",
        navigationGuidance: [
          "Use https://www.linkedin.com/jobs/collections/recommended/ to access the recommended jobs collection.",
        ],
        searchGuidance: [
          "Use https://www.linkedin.com/jobs/search/ to reach job results directly.",
        ],
        detailGuidance: [
          "Click job card to view full details and apply options.",
        ],
        applyGuidance: [
          "Apply button appears on job detail page after clicking a job card.",
        ],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_source_debug_seeded",
          discoveryMethod: "catalog_seed",
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/linkedin_source_debug_seeded",
          title: "Senior Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate source-debug route seeding.",
          description: "Validate source-debug route seeding.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");

    expect(capturedPhaseInputs.get("Access Auth Probe")).toEqual({
      startingUrls: ["https://www.linkedin.com/jobs/"],
      maxSteps: 16,
    });
    expect(capturedPhaseInputs.get("Site Structure Mapping")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/collections/recommended/",
        "https://www.linkedin.com/jobs/search/",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 18,
    });
    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/search/",
        "https://www.linkedin.com/jobs/",
        "https://www.linkedin.com/jobs/collections/recommended/",
      ],
      maxSteps: 22,
    });
    expect(capturedPhaseInputs.get("Job Detail Validation")?.maxSteps).toBe(18);
    expect(capturedPhaseInputs.get("Apply Path Validation")?.maxSteps).toBe(18);
    expect(capturedPhaseInputs.get("Replay Verification")?.maxSteps).toBe(18);

    const latestRun = (await repository.listSourceDebugRuns())[0];
    const siteStructureAttempt = (await repository.listSourceDebugAttempts()).find(
      (attempt) => attempt.phase === "site_structure_mapping",
    );
    const startEvidence = (await repository.listSourceDebugEvidenceRefs()).find(
      (entry) => entry.attemptId === siteStructureAttempt?.id && entry.label === "Starting URL",
    );

    expect(latestRun?.instructionArtifactId).toBeTruthy();
    expect(siteStructureAttempt?.attemptedActions).toContain(
      "Started from https://www.linkedin.com/jobs/collections/recommended/.",
    );
    expect(startEvidence?.url).toBe(
      "https://www.linkedin.com/jobs/collections/recommended/",
    );
  });

  test("source debug reuses exact same-host hinted routes for generic targets without fabricating jobs paths", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      id: "target_example_default",
      label: "Example Careers",
      startingUrl: "https://example.com/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_example_seeded",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_example_seeded",
        targetId: "target_example_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_example_seeded",
        basedOnAttemptIds: ["debug_attempt_example_seeded"],
        notes: "Seeded generic route hints.",
        navigationGuidance: [
          "Use https://example.com/careers/open-roles/ to access the jobs collection.",
        ],
        searchGuidance: [
          "Use https://example.com/careers/open-roles/search?team=product to reach filtered results.",
        ],
        detailGuidance: ["Open the role detail page from the careers collection."],
        applyGuidance: ["Apply starts from the role detail page."],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "example_source_debug_seeded",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://example.com/careers/open-roles/frontend-engineer",
          title: "Frontend Engineer",
          company: "Example Co",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "external_redirect",
          easyApplyEligible: false,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate generic source-debug route seeding.",
          description: "Validate generic source-debug route seeding.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_example_default");

    expect(capturedPhaseInputs.get("Site Structure Mapping")).toEqual({
      startingUrls: [
        "https://example.com/careers/open-roles/",
        "https://example.com/careers/open-roles/search?team=product",
        "https://example.com/",
      ],
      maxSteps: 18,
    });
    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://example.com/careers/open-roles/search?team=product",
        "https://example.com/",
        "https://example.com/careers/open-roles/",
      ],
      maxSteps: 22,
    });
  });

  test("search filter probe prefers proven collection routes when no search route hint exists", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      startingUrl: "https://www.linkedin.com/jobs/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_linkedin_collection_only",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_collection_only",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_collection_only",
        basedOnAttemptIds: ["debug_attempt_collection_only"],
        notes: "Collection-first route hint.",
        navigationGuidance: [
          'Click "Show all top job picks for you" to open https://www.linkedin.com/jobs/collections/recommended/.',
        ],
        searchGuidance: [
          'Recommendation routes are the primary way to access different job collections.',
        ],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_collection_only",
          discoveryMethod: "catalog_seed",
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/linkedin_collection_only",
          title: "Senior Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate collection-first source-debug routing.",
          description: "Validate collection-first source-debug routing.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");

    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/collections/recommended/",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 22,
    });
  });

  test("route hints that mention both source and destination prioritize the proven destination route", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      startingUrl: "https://www.linkedin.com/jobs/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_linkedin_from_to_route",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_from_to_route",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_from_to_route",
        basedOnAttemptIds: ["debug_attempt_from_to_route"],
        notes: "From-to route hint.",
        navigationGuidance: [
          "Navigate from https://www.linkedin.com/jobs/ to https://www.linkedin.com/jobs/search/?keywords=frontend&location=kosovo.",
        ],
        searchGuidance: [
          "https://www.linkedin.com/jobs/search/?keywords=frontend&location=kosovo reliably returns job cards with filter controls.",
        ],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_from_to_route",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_from_to_route",
          title: "Senior Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate destination route priority.",
          description: "Validate destination route priority.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");

    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/search/?keywords=frontend&location=kosovo",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 22,
    });
  });

  test("ignores wildcard and templated route hints when deriving starting urls", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      startingUrl: "https://www.linkedin.com/jobs/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_linkedin_template_routes",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_template_routes",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_template_routes",
        basedOnAttemptIds: ["debug_attempt_template_routes"],
        notes: "Template route hints should be ignored.",
        navigationGuidance: [
          "Collection routes (/jobs/collections/*) trigger auth gates and return no interactive elements.",
          "Job details can appear under /jobs/:jobId after a card click.",
          "Clicking 'Show all top job picks for you' opens /jobs/collections/recommended/.",
        ],
        searchGuidance: [
          "/jobs/search/?keywords=...&location=... reliably returns job cards with filter controls.",
          "/jobs/search/?keywords=:keyword&location=:location should not be treated as a concrete replay URL.",
        ],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_template_routes",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_template_routes",
          title: "Senior Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate templated route filtering.",
          description: "Validate templated route filtering.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");

    expect(capturedPhaseInputs.get("Site Structure Mapping")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/collections/recommended/",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 18,
    });
    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/collections/recommended/",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 22,
    });
  });

  test("replay verification strips unstable current-job query params from learned starting urls", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      startingUrl: "https://www.linkedin.com/jobs/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_linkedin_unstable_job_route",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_unstable_job_route",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_unstable_job_route",
        basedOnAttemptIds: ["debug_attempt_unstable_job_route"],
        notes: "Route hints include unstable selected-job params.",
        navigationGuidance: [
          "Collection route at /jobs/collections/recommended/?currentJobId=3973153031.",
        ],
        searchGuidance: [
          "Use direct URL search: /jobs/search/?keywords=React%20Next.js%20Developer&location=Pristina%2C%20Kosovo&currentJobId=438896875.",
        ],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_unstable_job_route",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_unstable_job_route",
          title: "Senior Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate unstable query stripping.",
          description: "Validate unstable query stripping.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_linkedin_default");

    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/search/?keywords=React+Next.js+Developer&location=Pristina%2C+Kosovo",
        "https://www.linkedin.com/jobs/",
        "https://www.linkedin.com/jobs/collections/recommended/",
      ],
      maxSteps: 22,
    });
    expect(capturedPhaseInputs.get("Replay Verification")).toEqual({
      startingUrls: [
        "https://www.linkedin.com/jobs/collections/recommended/",
        "https://www.linkedin.com/jobs/search/?keywords=React+Next.js+Developer&location=Pristina%2C+Kosovo",
        "https://www.linkedin.com/jobs/",
      ],
      maxSteps: 18,
    });
  });

  test("non-search same-host query urls are not promoted into search-filter starting urls", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      id: "target_example_query_detail",
      label: "Example Careers",
      startingUrl: "https://example.com/careers/",
      instructionStatus: "draft",
      draftInstructionId: "instruction_example_query_detail",
      validatedInstructionId: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_example_query_detail",
        targetId: "target_example_query_detail",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_example_query_detail",
        basedOnAttemptIds: ["debug_attempt_example_query_detail"],
        notes: "Detail route includes query params but should not become the search starting point.",
        navigationGuidance: [
          "Start at https://example.com/careers/open-roles/.",
        ],
        searchGuidance: [
          "Use https://example.com/careers/search?team=product to reach the filtered results list.",
        ],
        detailGuidance: [
          "Role details can open at https://example.com/careers/role/frontend-engineer?gh_jid=12345.",
        ],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const capturedPhaseInputs = new Map<
      string,
      { startingUrls: readonly string[]; maxSteps: number }
    >();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "example_query_detail",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://example.com/careers/role/frontend-engineer",
          title: "Frontend Engineer",
          company: "Example Co",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "external_redirect",
          easyApplyEligible: false,
          postedAt: "2026-03-20T09:00:00.000Z",
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Validate query detail route handling.",
          description: "Validate query detail route handling.",
          keySkills: ["React"],
        },
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        capturedPhaseInputs.set(options.taskPacket?.strategyLabel ?? options.siteLabel, {
          startingUrls: [...options.startingUrls],
          maxSteps: options.maxSteps,
        });
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    await workspaceService.runSourceDebug("target_example_query_detail");

    expect(capturedPhaseInputs.get("Search Filter Probe")).toEqual({
      startingUrls: [
        "https://example.com/careers/search?team=product",
        "https://example.com/careers/open-roles/",
        "https://example.com/careers/",
      ],
      maxSteps: 22,
    });
  });

  test("saveSourceInstructionArtifact updates a bound target artifact and rejects unbound edits", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: "draft",
        validatedInstructionId: null,
        draftInstructionId: "instruction_linkedin_draft_editable",
      },
    ];
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_draft_editable",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_editable",
        basedOnAttemptIds: ["debug_attempt_editable"],
        notes: "Editable draft guidance.",
        navigationGuidance: ["Start from the jobs homepage."],
        searchGuidance: ["Use the visible search box first."],
        detailGuidance: [],
        applyGuidance: [],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    const { workspaceService } = createWorkspaceServiceHarness({ seed });
    const originalArtifact = seed.sourceInstructionArtifacts[0]!;

    const updatedSnapshot = await workspaceService.saveSourceInstructionArtifact(
      "target_linkedin_default",
      {
        ...toEditableSourceInstructionArtifactInput(originalArtifact),
        searchGuidance: ["Use the edited search guidance instead."],
      },
    );
    const updatedArtifact = updatedSnapshot.sourceInstructionArtifacts.find(
      (artifact) => artifact.id === originalArtifact.id,
    );

    expect(updatedArtifact?.searchGuidance).toEqual([
      "Use the edited search guidance instead.",
    ]);
    expect(updatedArtifact?.status).toBe("draft");
    expect(updatedArtifact?.basedOnRunId).toBe("debug_run_editable");

    await expect(
      workspaceService.saveSourceInstructionArtifact("target_linkedin_default", {
        ...toEditableSourceInstructionArtifactInput(originalArtifact),
        id: "instruction_not_bound_to_target",
      }),
    ).rejects.toThrow(/unknown source instruction/i);
  });

  test("forwards validated source guidance into apply execution", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: "validated",
        validatedInstructionId: "instruction_linkedin_validated",
      },
    ];
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        provenance: [
          {
            targetId: "target_linkedin_default",
            adapterKind: "auto",
            resolvedAdapterKind: "target_site",
            startingUrl: "https://www.linkedin.com/jobs/search/",
            discoveredAt: "2026-03-20T10:04:00.000Z",
          },
        ],
      },
      ...seed.savedJobs.slice(1),
    ];
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_validated",
        targetId: "target_linkedin_default",
        status: "validated",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
        acceptedAt: "2026-03-20T10:04:00.000Z",
        basedOnRunId: "debug_run_1",
        basedOnAttemptIds: ["debug_attempt_1"],
        notes: "Validated apply guidance for the target-site target.",
        navigationGuidance: [
          "Open the job detail page before acting on apply controls.",
        ],
        searchGuidance: [
          "Use the jobs search entrypoint rather than the site home feed.",
        ],
        detailGuidance: [
          "Prefer the dedicated jobs search entrypoint for this source.",
        ],
        applyGuidance: [
          "Use the Easy Apply branch when the listing exposes it; otherwise pause for review.",
        ],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: {
          id: "verification_linkedin_validated",
          replayRunId: "debug_run_replay_1",
          verifiedAt: "2026-03-20T10:04:00.000Z",
          outcome: "passed",
          proofSummary: "Replay reached the apply path successfully.",
          reason: null,
          versionInfo: {
            promptProfileVersion: "v1",
            toolsetVersion: "v1",
            adapterVersion: "v1",
            appSchemaVersion: "v1",
          },
        },
      },
    ];

    let capturedInstructions: readonly string[] = [];
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime: {
        ...createWorkspaceServiceHarness().browserRuntime,
        async executeEasyApply(source, input) {
          capturedInstructions = input.instructions ?? [];
          return createWorkspaceServiceHarness().browserRuntime.executeEasyApply(
            source,
            input,
          );
        },
      },
    });

    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    await workspaceService.approveApply("job_ready");

    expect(capturedInstructions).toEqual(
      expect.arrayContaining([
        "[Navigation] Open the job detail page before acting on apply controls.",
        "[Search] Use the jobs search entrypoint rather than the site home feed.",
        "[Detail] Prefer the dedicated jobs search entrypoint for this source.",
        "[Apply] Use the Easy Apply branch when the listing exposes it; otherwise pause for review.",
      ]),
    );
  });

  test("forwards a draft source guidance set into apply execution for its own target", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets = [
      {
        ...seed.searchPreferences.discovery.targets[0]!,
        instructionStatus: "draft",
        validatedInstructionId: null,
        draftInstructionId: "instruction_linkedin_draft_accepted",
      },
    ];
    seed.savedJobs = [
      {
        ...seed.savedJobs[0]!,
        provenance: [
          {
            targetId: "target_linkedin_default",
            adapterKind: "auto",
            resolvedAdapterKind: "target_site",
            startingUrl: "https://www.linkedin.com/jobs/",
            discoveredAt: "2026-03-20T10:04:00.000Z",
          },
        ],
      },
      ...seed.savedJobs.slice(1),
    ];
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_linkedin_draft_accepted",
        targetId: "target_linkedin_default",
        status: "draft",
        createdAt: "2026-03-20T10:04:00.000Z",
        updatedAt: "2026-03-20T10:04:00.000Z",
        acceptedAt: null,
        basedOnRunId: "debug_run_accepted_draft",
        basedOnAttemptIds: ["debug_attempt_accepted_draft"],
        notes: "Accepted draft apply guidance for the target-site target.",
        navigationGuidance: ["Open the accepted draft collection route first."],
        searchGuidance: [
          "Use the accepted draft jobs surface before refining filters.",
        ],
        detailGuidance: [
          "Open the job detail page after entering through the accepted draft route.",
        ],
        applyGuidance: [
          "Use the accepted draft Easy Apply entry when it is exposed on the detail page.",
        ],
        warnings: [],
        versionInfo: {
          promptProfileVersion: "v1",
          toolsetVersion: "v1",
          adapterVersion: "v1",
          appSchemaVersion: "v1",
        },
        verification: null,
      },
    ];

    let capturedInstructions: readonly string[] = [];
    const { workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime: {
        ...createWorkspaceServiceHarness().browserRuntime,
        async executeEasyApply(source, input) {
          capturedInstructions = input.instructions ?? [];
          return createWorkspaceServiceHarness().browserRuntime.executeEasyApply(
            source,
            input,
          );
        },
      },
    });

    const exportedSnapshot = await workspaceService.exportResumePdf("job_ready");
    const approvedExport = exportedSnapshot.resumeExportArtifacts.find(
      (artifact) => artifact.jobId === "job_ready",
    );

    expect(approvedExport).toBeTruthy();

    await workspaceService.approveResume("job_ready", approvedExport!.id);
    await workspaceService.approveApply("job_ready");

    expect(capturedInstructions).toEqual(
      expect.arrayContaining([
        "[Navigation] Open the accepted draft collection route first.",
        "[Search] Use the accepted draft jobs surface before refining filters.",
        "[Detail] Open the job detail page after entering through the accepted draft route.",
        "[Apply] Use the accepted draft Easy Apply entry when it is exposed on the detail page.",
      ]),
    );
  });

  test("verify source instructions replays the chosen artifact without overwriting it mid-run", async () => {
    const seed = createSeed();
    seed.searchPreferences.discovery.targets[0] = {
      ...seed.searchPreferences.discovery.targets[0]!,
      instructionStatus: "validated",
      validatedInstructionId: "instruction_existing_validated",
      draftInstructionId: null,
      lastVerifiedAt: "2026-03-20T10:05:00.000Z",
      staleReason: null,
    };
    seed.sourceInstructionArtifacts = [
      {
        id: "instruction_existing_validated",
        targetId: "target_linkedin_default",
        status: "validated",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:05:00.000Z",
        acceptedAt: "2026-03-20T10:05:00.000Z",
        basedOnRunId: "existing_run",
        basedOnAttemptIds: ["existing_attempt"],
        notes: "Existing validated instructions",
        navigationGuidance: ["Use the existing validated collection route first."],
        searchGuidance: [
          "Use the existing validated keyword search box to change the result set.",
        ],
        detailGuidance: [
          "Use same-host detail pages as the canonical source of job data.",
        ],
        applyGuidance: [
          "Use the on-site apply entry when the detail page exposes it.",
        ],
        warnings: ["Keep this source in draft if replay fails later."],
        versionInfo: {
          promptProfileVersion: "source-debug-v1",
          toolsetVersion: "browser-tools-v1",
          adapterVersion: "target-site-adapter-v1",
          appSchemaVersion: "job-finder-source-debug-v1",
        },
        verification: {
          id: "existing_verification",
          replayRunId: "existing_replay_run",
          verifiedAt: "2026-03-20T10:05:00.000Z",
          outcome: "passed",
          proofSummary: "Existing replay passed.",
          reason: null,
          versionInfo: {
            promptProfileVersion: "source-debug-v1",
            toolsetVersion: "browser-tools-v1",
            adapterVersion: "target-site-adapter-v1",
            appSchemaVersion: "job-finder-source-debug-v1",
          },
        },
      },
    ];

    const replayInstructionsByLabel = new Map<string, readonly string[]>();
    const baseRuntime = createAgentBrowserRuntime(
      [
        {
          source: "target_site",
          sourceJobId: "linkedin_verify_case",
          discoveryMethod: "catalog_seed",
          canonicalUrl: "https://www.linkedin.com/jobs/view/linkedin_verify_case",
          title: "Frontend Engineer",
          company: "Signal Systems",
          location: "Remote",
          workMode: ["remote"],
          applyPath: "easy_apply",
          easyApplyEligible: true,
          postedAt: "2026-03-20T09:00:00.000Z",
          postedAtText: null,
          discoveredAt: "2026-03-20T10:04:00.000Z",
          salaryText: null,
          summary: "Verify artifact coverage.",
          description: "Verify artifact coverage.",
          keySkills: ["React"],
          responsibilities: ["Verify artifact coverage."],
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
      ],
      {
        debugFindingsByPhase: createStrongSourceDebugFindingsByPhase(),
      },
    );
    const browserRuntime: BrowserSessionRuntime = {
      ...baseRuntime,
      runAgentDiscovery(source, options) {
        replayInstructionsByLabel.set(options.siteLabel, [
          ...(options.siteInstructions ?? []),
        ]);
        return baseRuntime.runAgentDiscovery!(source, options);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed: {
        ...seed,
        savedJobs: [],
        tailoredAssets: [],
      },
      browserRuntime,
      aiClient: createAgentAiClient(),
    });

    const snapshot = await workspaceService.verifySourceInstructions(
      "target_linkedin_default",
      "instruction_existing_validated",
    );
    const artifacts = await repository.listSourceInstructionArtifacts();
    const originalArtifact = artifacts.find(
      (artifact) => artifact.id === "instruction_existing_validated",
    );
    const successorArtifact = artifacts.find(
      (artifact) =>
        artifact.id !== "instruction_existing_validated" &&
        artifact.targetId === "target_linkedin_default",
    );

    expect(replayInstructionsByLabel.get("Primary target Replay Verification")).toEqual(
      expect.arrayContaining([
        "[Navigation] Use the existing validated collection route first.",
        "[Search] Use the existing validated keyword search box to change the result set.",
        "[Detail] Use same-host detail pages as the canonical source of job data.",
        "[Apply] Use the on-site apply entry when the detail page exposes it.",
      ]),
    );
    expect(
      replayInstructionsByLabel
        .get("Primary target Replay Verification")
        ?.join("\n"),
    ).not.toContain("Keep this source in draft if replay fails later.");
    expect(originalArtifact?.status).toBe("validated");
    expect(originalArtifact?.navigationGuidance).toEqual([
      "Use the existing validated collection route first.",
    ]);
    expect(successorArtifact?.status).toBe("validated");
    expect(successorArtifact?.verification?.outcome).toBe("passed");
    expect(snapshot.searchPreferences.discovery.targets[0]?.validatedInstructionId).toBe(
      successorArtifact?.id ?? null,
    );
  });
});
