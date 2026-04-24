import { afterEach, describe, expect, test, vi } from "vitest";

import {
  JobPostingSchema,
  type JobDiscoveryTarget,
  type JobSearchPreferences,
  type JobSource,
} from "@unemployed/contracts";

import {
  applyDiscoveryTitleTriage,
  buildDiscoveryStartingUrls,
  collectPublicProviderJobs,
  inferSourceIntelligenceFromTarget,
  resolveRouteKindForReuse,
  selectLowYieldTechnicalFallbackPostings,
} from "./workspace-source-intelligence";
import {
  createSeed,
  createSourceInstructionArtifact,
} from "../workspace-service.test-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
});

function createGreenhouseTarget(): JobDiscoveryTarget {
  return {
    id: "greenhouse_remote",
    label: "Remote Greenhouse",
    startingUrl: "https://job-boards.greenhouse.io/remote",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createLeverTarget(): JobDiscoveryTarget {
  return {
    id: "lever_aircall",
    label: "Aircall Lever",
    startingUrl: "https://jobs.lever.co/aircall",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createUnknownCareersTarget(): JobDiscoveryTarget {
  return {
    id: "unknown_careers",
    label: "Unknown Careers",
    startingUrl: "https://example.com/careers",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createSearchSurfaceTarget(): JobDiscoveryTarget {
  return {
    id: "linkedin_default",
    label: "LinkedIn Jobs",
    startingUrl: "https://www.linkedin.com/jobs/",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function createSearchPreferences(overrides: Partial<JobSearchPreferences> = {}): JobSearchPreferences {
  return {
    targetRoles: [],
    jobFamilies: [],
    locations: [],
    excludedLocations: [],
    workModes: [],
    seniorityLevels: [],
    targetIndustries: [],
    targetCompanyStages: [],
    employmentTypes: [],
    minimumSalaryUsd: null,
    targetSalaryUsd: null,
    salaryCurrency: "USD",
    approvalMode: "draft_only",
    tailoringMode: "conservative",
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      targets: [],
      historyLimit: 5,
    },
    ...overrides,
  };
}

function createPosting(
  overrides: Partial<ReturnType<typeof JobPostingSchema.parse>> = {},
) {
  return JobPostingSchema.parse({
    source: "target_site",
    sourceJobId: "job_1",
    discoveryMethod: "browser_agent",
    collectionMethod: "fallback_search",
    canonicalUrl: "https://example.com/jobs/job_1",
    applicationUrl: null,
    title: "Software Engineer",
    company: "Example Co",
    location: "Remote",
    workMode: ["remote"],
    applyPath: "unknown",
    easyApplyEligible: false,
    postedAt: null,
    postedAtText: null,
    discoveredAt: "2026-03-20T10:00:00.000Z",
    firstSeenAt: null,
    lastSeenAt: null,
    lastVerifiedActiveAt: null,
    salaryText: null,
    summary: "Build product features.",
    description: "Build product features with TypeScript and React.",
    keySkills: ["TypeScript", "React"],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: "pass",
    sourceIntelligence: null,
    screeningHints: {},
    keywordSignals: [],
    benefits: [],
    ...overrides,
  });
}

async function collectGreenhouseJobs(updatedAt: string | null) {
  const target = createGreenhouseTarget();
  const intelligence = inferSourceIntelligenceFromTarget({
    target,
    currentArtifact: null,
  });
  const source: JobSource = "target_site";

  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      jobs: [
        {
          id: 4622190,
          title: "SEI Instructor Lead",
          absolute_url: "https://job-boards.greenhouse.io/remote/jobs/4622190",
          location: { name: "New York, NY" },
          updated_at: updatedAt,
          content: "<p>Teach software engineering.</p>",
        },
      ],
      }),
    } as Response);

  return collectPublicProviderJobs({
    target,
    artifact: { intelligence },
    source,
  });
}

describe("collectPublicProviderJobs", () => {
  test("normalizes Greenhouse offset timestamps before job parsing", async () => {
    const result = await collectGreenhouseJobs("2024-07-24T16:08:01-04:00");

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("keeps Greenhouse jobs when provider timestamps are invalid", async () => {
    const result = await collectGreenhouseJobs("not-a-date");

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBeNull();
  });

  test("normalizes stringified numeric provider timestamps", async () => {
    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: "lever_job_1",
          text: "Senior Engineer",
          createdAt: "1721851681000",
          hostedUrl: "https://jobs.lever.co/aircall/lever_job_1",
          applyUrl: null,
          descriptionPlain: "Build platform features.",
          categories: {
            location: "Remote",
          },
        },
      ]),
    } as Response);

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("returns a clear timeout warning when the Greenhouse API hangs", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timed out", "AbortError"));

    const target = createGreenhouseTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.jobs).toEqual([]);
    expect(result.warning).toBe(
      "Public provider API collection failed: Greenhouse API request timed out.",
    );
  });

  test("returns a clear timeout warning when the Lever API hangs", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(new AbortController().signal);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timed out", "AbortError"));

    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.jobs).toEqual([]);
    expect(result.warning).toBe(
      "Public provider API collection failed: Lever API request timed out.",
    );
  });

  test("normalizes Lever createdAt timestamps when present", async () => {
    const target = createLeverTarget();
    const intelligence = inferSourceIntelligenceFromTarget({
      target,
      currentArtifact: null,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          id: "lever_job_1",
          text: "Senior Engineer",
          createdAt: "2024-07-24T16:08:01-04:00",
          hostedUrl: "https://jobs.lever.co/aircall/lever_job_1",
          applyUrl: null,
          descriptionPlain: "Build platform features.",
          categories: {
            location: "Remote",
          },
        },
      ]),
    } as Response);

    const result = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: "target_site",
    });

    expect(result.warning).toBeNull();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.postedAt).toBe("2024-07-24T20:08:01.000Z");
  });

  test("infers a route-backed no-artifact collection method from the target URL", () => {
    const intelligence = inferSourceIntelligenceFromTarget({
      target: createUnknownCareersTarget(),
      currentArtifact: null,
    });

    expect(intelligence.collection.preferredMethod).toBe("careers_page");
  });

  test("prefers learned discovery routes before the raw target starting URL", () => {
    const target = createUnknownCareersTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_unknown_careers_learned_routes",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-03-20T10:04:00.000Z",
      updatedAt: "2026-03-20T10:05:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_unknown_careers",
      basedOnAttemptIds: ["debug_attempt_unknown_careers"],
      notes: "Prefer learned jobs routes before the generic careers landing page.",
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
      verification: null,
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [
            {
              url: target.startingUrl,
              label: "Starting URL",
              kind: "listing",
              confidence: 0.6,
            },
            {
              url: "https://example.com/jobs/recommended",
              label: "Learned jobs collection",
              kind: "collection",
              confidence: 0.88,
            },
          ],
          searchRouteTemplates: [
            {
              url: "https://example.com/jobs/search",
              label: "Learned search route",
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
          extraStartingRoutes: ["https://example.com/jobs/curated"],
        },
      },
    });

    expect(buildDiscoveryStartingUrls(target, artifact)).toEqual([
      "https://example.com/jobs/curated",
      "https://example.com/jobs/search",
      "https://example.com/jobs/recommended",
      "https://example.com/careers",
    ]);
  });

  test("filters broken and templated learned routes before reusing discovery starting urls", () => {
    const target = createUnknownCareersTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_unknown_careers_filtered_routes",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-03-20T10:04:00.000Z",
      updatedAt: "2026-03-20T10:05:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_unknown_careers_filtered_routes",
      basedOnAttemptIds: ["debug_attempt_unknown_careers_filtered_routes"],
      notes: "Broken and templated routes should not be reused.",
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
      verification: null,
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [
            {
              url: target.startingUrl,
              label: "Starting URL",
              kind: "listing",
              confidence: 0.6,
            },
            {
              url: "https://example.com/jobs/search?currentJobId=123",
              label: "Search route with unstable query",
              kind: "search",
              confidence: 0.9,
            },
            {
              url: "https://example.com/{slug}",
              label: "Templated route",
              kind: "listing",
              confidence: 0.4,
            },
            {
              url: "https://example.com/404",
              label: "Broken route",
              kind: "listing",
              confidence: 0.2,
            },
            {
              url: "https://example.com/jobs/view/123",
              label: "Detail route",
              kind: "detail",
              confidence: 0.5,
            },
          ],
          searchRouteTemplates: [
            {
              url: "https://example.com/jobs/search?selectedJobId=456",
              label: "Search template with unstable query",
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
    });

    expect(buildDiscoveryStartingUrls(target, artifact)).toEqual([
      "https://example.com/jobs/search",
      "https://example.com/careers",
    ]);
  });

  test("prefers a concrete guided query url over generic learned routes when search preferences are available", () => {
    const target = createSearchSurfaceTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_guided_query_first",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-03-20T10:04:00.000Z",
      updatedAt: "2026-03-20T10:05:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_guided_query_first",
      basedOnAttemptIds: ["debug_attempt_guided_query_first"],
      notes: "Prefer concrete query entry over generic collections.",
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
      verification: null,
      intelligence: {
        provider: {
          key: "linkedin",
          label: "LinkedIn Jobs",
          confidence: 0.98,
          apiAvailability: "not_supported",
          publicApiUrlTemplate: null,
          boardToken: null,
          boardSlug: null,
          providerIdentifier: "linkedin_jobs",
        },
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [
            {
              url: "https://www.linkedin.com/jobs/collections/recommended/",
              label: "Recommended collection",
              kind: "collection",
              confidence: 0.92,
            },
            {
              url: "https://www.linkedin.com/jobs/search/",
              label: "Generic search route",
              kind: "search",
              confidence: 0.9,
            },
          ],
          searchRouteTemplates: [
            {
              url: "https://www.linkedin.com/jobs/search/",
              label: "Generic search template",
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
    });

    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });

    expect(buildDiscoveryStartingUrls(target, artifact, searchPreferences)).toEqual([
      "https://www.linkedin.com/jobs/search/",
      "https://www.linkedin.com/jobs/collections/recommended/",
      "https://www.linkedin.com/jobs/",
    ]);
  });

  test("prefers a guided homepage query url when source-debug proves a generic q filter", () => {
    const target = {
      id: "kosovajob",
      label: "KosovaJob",
      startingUrl: "https://kosovajob.com/",
      enabled: true,
      adapterKind: "auto",
      customInstructions: null,
      instructionStatus: "draft",
      validatedInstructionId: null,
      draftInstructionId: null,
      lastDebugRunId: null,
      lastVerifiedAt: null,
      staleReason: null,
    } satisfies JobDiscoveryTarget;
    const artifact = createSourceInstructionArtifact({
      id: "instruction_kosovajob_query_first",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-04-23T18:00:00.000Z",
      updatedAt: "2026-04-23T18:01:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_kosovajob_query_first",
      basedOnAttemptIds: ["debug_attempt_kosovajob_query_first"],
      notes: "Prefer homepage query parameters over generic route guesses.",
      navigationGuidance: [],
      searchGuidance: [
        "Homepage query parameters like ?q=software change results while /jobs returns 404.",
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
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [
            {
              url: "https://kosovajob.com/jobs",
              label: "Observed route",
              kind: "listing",
              confidence: 0.84,
            },
          ],
          searchRouteTemplates: [],
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
    });

    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });

    expect(buildDiscoveryStartingUrls(target, artifact, searchPreferences)).toEqual([
      "https://kosovajob.com/?q=software",
      "https://kosovajob.com/",
    ]);
  });

  test("does not reuse search routes that the instruction guidance explicitly disproved", () => {
    const target = {
      id: "kosovajob",
      label: "KosovaJob",
      startingUrl: "https://kosovajob.com/",
      enabled: true,
      adapterKind: "auto",
      customInstructions: null,
      instructionStatus: "draft",
      validatedInstructionId: null,
      draftInstructionId: null,
      lastDebugRunId: null,
      lastVerifiedAt: null,
      staleReason: null,
    } satisfies JobDiscoveryTarget;
    const artifact = createSourceInstructionArtifact({
      id: "instruction_kosovajob_disproved_search_route",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-04-23T03:00:00.000Z",
      updatedAt: "2026-04-23T03:01:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_kosovajob_disproved_search_route",
      basedOnAttemptIds: ["debug_attempt_kosovajob_disproved_search_route"],
      notes: null,
      navigationGuidance: [],
      searchGuidance: [
        "Filter note: /search route returns 404 - not a working search endpoint",
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
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [
            {
              url: target.startingUrl,
              label: "Starting URL",
              kind: "anchor",
              confidence: 0.6,
            },
            {
              url: "https://kosovajob.com/search",
              label: "Observed route",
              kind: "search",
              confidence: 0.84,
            },
            {
              url: "https://kosovajob.com/jobs",
              label: "Observed route",
              kind: "listing",
              confidence: 0.84,
            },
          ],
          searchRouteTemplates: [
            {
              url: "https://kosovajob.com/search",
              label: "Observed route",
              kind: "search",
              confidence: 0.84,
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
    });

    expect(buildDiscoveryStartingUrls(target, artifact)).toEqual([
      "https://kosovajob.com/jobs",
      "https://kosovajob.com/",
    ]);
  });

  test("does not re-add the starting url when it is denied by learned guidance", () => {
    const target = createUnknownCareersTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_unknown_careers_denied_starting_url",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:01:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_unknown_careers_denied_starting_url",
      basedOnAttemptIds: ["debug_attempt_unknown_careers_denied_starting_url"],
      notes: null,
      navigationGuidance: [],
      searchGuidance: ["https://example.com/careers returns 404 and should not be reused."],
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
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [],
          searchRouteTemplates: [
            {
              url: "https://example.com/jobs/search",
              label: "Search route",
              kind: "search",
              confidence: 0.9,
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
    });

    expect(buildDiscoveryStartingUrls(target, artifact)).toEqual([
      "https://example.com/jobs/search",
    ]);
  });

  test("returns no discovery starting urls when every learned route and the target starting url are denied", () => {
    const target = createUnknownCareersTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_unknown_careers_all_routes_denied",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:01:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_unknown_careers_all_routes_denied",
      basedOnAttemptIds: ["debug_attempt_unknown_careers_all_routes_denied"],
      notes: null,
      navigationGuidance: [],
      searchGuidance: [
        "https://example.com/careers returns 404 and should not be reused.",
        "https://example.com/jobs/search returns 404 and should not be reused.",
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
      intelligence: {
        provider: null,
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [],
          searchRouteTemplates: [
            {
              url: "https://example.com/jobs/search",
              label: "Search route",
              kind: "search",
              confidence: 0.9,
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
    });

    expect(buildDiscoveryStartingUrls(target, artifact)).toEqual([]);
  });

  test("clears stale query params from guided search templates before building the final url", () => {
    const target = createSearchSurfaceTarget();
    const artifact = createSourceInstructionArtifact({
      id: "instruction_guided_query_clears_stale_params",
      targetId: target.id,
      status: "draft",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:01:00.000Z",
      acceptedAt: null,
      basedOnRunId: "debug_run_guided_query_clears_stale_params",
      basedOnAttemptIds: ["debug_attempt_guided_query_clears_stale_params"],
      notes: "Use a clean search template before setting query params.",
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
      verification: null,
      intelligence: {
        provider: {
          key: "linkedin",
          label: "LinkedIn Jobs",
          confidence: 0.98,
          apiAvailability: "not_supported",
          publicApiUrlTemplate: null,
          boardToken: null,
          boardSlug: null,
          providerIdentifier: "linkedin_jobs",
        },
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [],
          searchRouteTemplates: [
            {
              url: "https://www.linkedin.com/jobs/search/?keywords=placeholder&location=old",
              label: "Templated search route",
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
    });

    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });

    expect(buildDiscoveryStartingUrls(target, artifact, searchPreferences)[0]).toBe(
      "https://www.linkedin.com/jobs/search/?keywords=software&location=Prishtina%2C+Kosovo",
    );
  });

  test("does not classify kosovajob-style same-host slug detail routes as reusable listing routes", () => {
    expect(
      resolveRouteKindForReuse(
        "https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce",
      ),
    ).toBe("anchor");
  });
});

describe("applyDiscoveryTitleTriage", () => {
  test("keeps adjacent software roles when technical skills overlap the candidate profile", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      headline: "Senior Full-Stack Software Engineer",
      targetRoles: ["Senior Full-Stack Software Engineer"],
      skills: ["TypeScript", "React", "Node.js"],
      skillGroups: {
        ...seed.profile.skillGroups,
        coreSkills: ["APIs"],
        tools: ["Node.js"],
        languagesAndFrameworks: ["TypeScript", "React"],
        highlightedSkills: ["PostgreSQL"],
      },
    };
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
    });
    const posting = createPosting({
      title: "Back-End Engineer",
      keySkills: ["TypeScript", "Node.js"],
      description: "Build backend services with Node.js, TypeScript, and PostgreSQL.",
    });

    expect(
      applyDiscoveryTitleTriage({ posting, profile, searchPreferences }).outcome,
    ).toBe("pass");
  });

  test("does not widen non-technical target roles just because skills overlap", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Principal Designer"],
    });
    const posting = createPosting({
      title: "Frontend Engineer",
      keySkills: ["React"],
      description: "Build frontend workflows with React.",
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("skip_title");
  });

  test("does not keep non-technical roles for technical targets without technical signals", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      headline: "Senior Full-Stack Software Engineer",
      targetRoles: ["Senior Full-Stack Software Engineer"],
      skills: ["TypeScript", "React", "Node.js"],
    };
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
    });
    const posting = createPosting({
      title: "Category Manager, Fashion, Sports & Outdoor (E-Commerce)",
      keySkills: ["Merchandising", "Retail Operations"],
      description: "Own category planning, retail assortment, and commercial performance.",
    });

    expect(
      applyDiscoveryTitleTriage({ posting, profile, searchPreferences }).outcome,
    ).toBe("skip_title");
  });

  test("keeps adjacent technical roles when profile skill evidence is missing but the posting is clearly technical", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      headline: "Senior Full-Stack Software Engineer",
      targetRoles: ["Senior Full-Stack Software Engineer"],
      skills: [],
      skillGroups: {
        ...seed.profile.skillGroups,
        coreSkills: [],
        tools: [],
        languagesAndFrameworks: [],
        highlightedSkills: [],
      },
      experiences: [],
      projects: [],
    };
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
    });
    const posting = createPosting({
      title: "Platform Engineer",
      keySkills: [],
      description: "Build cloud platform services and backend infrastructure for product teams.",
    });

    expect(
      applyDiscoveryTitleTriage({ posting, profile, searchPreferences }).outcome,
    ).toBe("pass");
  });

  test("keeps remote-friendly adjacent technical roles when strict location matching misses", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
      workModes: ["remote"],
    });
    const posting = createPosting({
      title: "Fullstack Developer",
      location: "EMEA Remote",
      workMode: ["remote"],
      description: "Build full-stack product features with React and Node.js.",
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("pass");
  });

  test("keeps lower-match technical roles in nearby remote locations instead of dropping to zero", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const posting = createPosting({
      title: "Frontend Engineer",
      company: "Odiin",
      location: "Kosovo (Remote)",
      workMode: ["remote"],
      description: "Build frontend product experiences with React and TypeScript.",
      keySkills: ["React", "TypeScript"],
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("pass");
  });

  test("keeps technical roles when the clean role only survives in polluted evidence text", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const posting = createPosting({
      title: "Full at Confidential Careers",
      company: "Pristina, District of",
      location: "Pristina, Kosovo (Hybrid)",
      workMode: ["hybrid"],
      summary: "Dismiss Full Stack Developer job",
      description:
        "Dismiss Full Stack Developer job Full Stack Developer Confidential Careers Pristina, Kosovo (Hybrid) Viewed Promoted React TypeScript Node.js.",
      keySkills: [],
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("pass");
  });

  test("keeps broad technical families like platform or devops for technical target roles", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const posting = createPosting({
      title: "Senior Platform Engineer (Infrastructure)",
      location: "Pristina (Hybrid)",
      workMode: ["hybrid"],
      description: "Build cloud infrastructure, delivery pipelines, and platform services.",
      keySkills: ["AWS", "Docker"],
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("pass");
  });

  test("does not keep remote-friendly non-technical roles when strict location matching misses", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
      workModes: ["remote"],
    });
    const posting = createPosting({
      title: "Operations Manager",
      location: "EMEA Remote",
      workMode: ["remote"],
      description: "Own operations planning and team coordination across regions.",
      keySkills: ["Operations", "Planning"],
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("skip_title");
  });

  test("does not widen location matching when remote or hybrid work is not preferred", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
      workModes: ["onsite"],
    });
    const posting = createPosting({
      title: "Frontend Engineer",
      location: "Europe Remote",
      workMode: ["remote"],
      description: "Build frontend product experiences with React and TypeScript.",
    });

    const triage = applyDiscoveryTitleTriage({
      posting,
      profile: seed.profile,
      searchPreferences,
    });

    expect(triage.outcome).toBe("skip_location");
    expect(triage.reason).toBe("Location is outside the preferred search areas.");
  });

  test("keeps technical hybrid roles in nearby locations even when exact location matching is weak", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const posting = createPosting({
      title: "Frontend Engineer",
      location: "Kosovo (Hybrid)",
      workMode: ["hybrid"],
      description: "Build frontend product experiences with React and TypeScript.",
    });

    expect(
      applyDiscoveryTitleTriage({
        posting,
        profile: seed.profile,
        searchPreferences,
      }).outcome,
    ).toBe("pass");
  });

  test("still skips clearly onsite-only technical roles outside preferred locations", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const posting = createPosting({
      title: "Senior Frontend Engineer",
      location: "Berlin, Germany",
      workMode: ["onsite"],
      description: "Build frontend product experiences with React and TypeScript.",
    });

    const triage = applyDiscoveryTitleTriage({
      posting,
      profile: seed.profile,
      searchPreferences,
    });

    expect(triage.outcome).toBe("skip_location");
  });
});

describe("selectLowYieldTechnicalFallbackPostings", () => {
  test("rescues clearly technical jobs when strict triage would otherwise return zero", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const rescued = selectLowYieldTechnicalFallbackPostings({
      skippedPostings: [
        createPosting({
          title: "Frontend Engineer",
          company: "Odiin",
          canonicalUrl: "https://example.com/jobs/frontend-engineer",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo (Remote)",
          workMode: ["remote"],
          keySkills: ["React", "TypeScript"],
          description: "Build frontend product experiences with React and TypeScript.",
          titleTriageOutcome: "skip_title",
        }),
        createPosting({
          title: "Operations Manager",
          company: "Example Ops",
          canonicalUrl: "https://example.com/jobs/operations-manager",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo (Remote)",
          workMode: ["remote"],
          keySkills: ["Planning"],
          description: "Lead cross-functional operations planning.",
          titleTriageOutcome: "skip_title",
        }),
      ],
      searchPreferences,
      profile: seed.profile,
    });

    expect(rescued).toHaveLength(1);
    expect(rescued[0]?.title).toBe("Frontend Engineer");
    expect(rescued[0]?.titleTriageOutcome).toBe("pass");
  });

  test("rescues technical URL jobs even when provider metadata is missing", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const rescued = selectLowYieldTechnicalFallbackPostings({
      skippedPostings: [
        createPosting({
          title: ".NET Software Developer .NET Software Developer Quipu GmbH Pristina,",
          company: "District of",
          canonicalUrl: "https://example.com/jobs/dotnet-software-developer",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo",
          workMode: [],
          keySkills: [],
          description: "Build software systems with ASP.NET Core, SQL, and backend APIs.",
          titleTriageOutcome: "skip_title",
        }),
        createPosting({
          title: "Senior Fullstack (MERN) Developer",
          company: "Proxify",
          canonicalUrl: "https://example.com/jobs/senior-fullstack-mern-developer",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo",
          workMode: [],
          keySkills: [],
          description: "Remote fullstack developer role building React and Node.js products.",
          titleTriageOutcome: "skip_location",
        }),
      ],
      searchPreferences,
      profile: seed.profile,
    });

    expect(rescued).toHaveLength(2);
    expect(rescued.map((posting) => posting.titleTriageOutcome)).toEqual(["pass", "pass"]);
  });

  test("rescues technical jobs from skipped collection cards", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const rescued = selectLowYieldTechnicalFallbackPostings({
      skippedPostings: [
        createPosting({
          title: "Frontend Developer",
          company: "Confidential Careers",
          canonicalUrl: "https://example.com/jobs/frontend-developer",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo (Remote)",
          workMode: ["remote"],
          keySkills: ["React", "TypeScript"],
          description: "Build frontend product experiences with React and TypeScript.",
          titleTriageOutcome: "skip_title",
        }),
      ],
      searchPreferences,
      profile: seed.profile,
    });

    expect(rescued).toHaveLength(1);
    expect(rescued[0]?.titleTriageOutcome).toBe("pass");
  });

  test("keeps skipped collection cards when parser pollution hides the technical signal", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const rescued = selectLowYieldTechnicalFallbackPostings({
      skippedPostings: [
        createPosting({
          title: "Upload &",
          company: "Stream Team Senior Software Engineer",
          canonicalUrl: "https://example.com/jobs/stream-team",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo",
          workMode: [],
          keySkills: [],
          description: "Dismiss job card with polluted search result text.",
          titleTriageOutcome: "skip_title",
        }),
      ],
      searchPreferences,
      profile: seed.profile,
    });

    expect(rescued).toHaveLength(1);
    expect(rescued[0]?.titleTriageOutcome).toBe("pass");
  });

  test("rescues clearly technical jobs through the low-yield safety floor even without provider metadata", () => {
    const seed = createSeed();
    const searchPreferences = createSearchPreferences({
      targetRoles: ["Senior Full-Stack Software Engineer"],
      locations: ["Prishtina, Kosovo"],
    });
    const rescued = selectLowYieldTechnicalFallbackPostings({
      skippedPostings: [
        createPosting({
          title: "Frontend Engineer",
          canonicalUrl: "https://example.com/jobs/frontend-engineer",
          providerKey: null,
          sourceIntelligence: null,
          location: "Kosovo (Remote)",
          workMode: ["remote"],
          keySkills: ["React", "TypeScript"],
          description: "Build frontend product experiences with React and TypeScript.",
          titleTriageOutcome: "skip_title",
        }),
      ],
      searchPreferences,
      profile: seed.profile,
    });

    expect(rescued).toHaveLength(1);
    expect(rescued[0]?.titleTriageOutcome).toBe("pass");
  });
});
