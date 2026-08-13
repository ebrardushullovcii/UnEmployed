import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  DiscoveryLedgerEntrySchema,
  JobPostingSchema,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import {
  createAgentBrowserRuntime,
  createAiClient,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

const CANDIDATE_COUNT = 100;
const REPEATED_SOURCE_BUDGET_MS = 2_000;

function createRepeatedSourceCatalog() {
  const sharedSkills = Array.from(
    { length: 80 },
    (_, index) => `Platform skill ${index}`,
  );

  return Array.from({ length: CANDIDATE_COUNT }, (_, index) =>
    JobPostingSchema.parse({
      source: "target_site",
      sourceJobId: `repeated_source_${index}`,
      discoveryMethod: "catalog_seed",
      collectionMethod: "fallback_search",
      canonicalUrl: `https://example.com/jobs/repeated-source-${index}`,
      applicationUrl: null,
      title: `Senior Product Designer ${index}`,
      company: `Source-generic employer ${index}`,
      location: "Remote",
      workMode: ["remote"],
      applyPath: "easy_apply",
      easyApplyEligible: true,
      postedAt: "2026-03-20T09:00:00.000Z",
      postedAtText: "Posted today",
      discoveredAt: "2026-03-20T10:04:00.000Z",
      providerUpdatedAt: null,
      salaryText: "$180k - $220k",
      summary: "Own a resilient workflow platform and design system.",
      description: Array.from(
        { length: 12 },
        () =>
          "Own a resilient workflow platform and design system with product and engineering.",
      ).join(" "),
      keySkills: sharedSkills,
      responsibilities: ["Lead workflow-platform product design."],
      minimumQualifications: ["Senior product design experience."],
      preferredQualifications: ["Design systems experience."],
      seniority: "Senior",
      employmentType: "Full-time",
      department: "Design",
      team: "Product Platform",
      employerWebsiteUrl: "https://example.com",
      employerDomain: "example.com",
      atsProvider: null,
      providerKey: null,
      providerBoardToken: null,
      providerIdentifier: null,
      titleTriageOutcome: "pass",
      sourceIntelligence: null,
      screeningHints: {},
      keywordSignals: [],
      benefits: ["Remote-first collaboration"],
      detailQuality: "detail_enriched",
    }),
  );
}

describe("known-job ledger repeated-source performance", () => {
  test("avoids every downstream review for an unchanged repeated source within budget", async () => {
    const seed = createSeed();
    seed.settings.discoveryOnly = true;
    seed.savedJobs = [];
    seed.discovery.discoveryLedger = [];
    seed.searchPreferences.companyWhitelist = [];
    seed.profile.skills = [
      ...seed.profile.skills,
      ...Array.from({ length: 80 }, (_, index) => `Platform skill ${index}`),
    ];

    const catalogRuntime = createAgentBrowserRuntime(
      createRepeatedSourceCatalog(),
    );
    let inventoryCalls = 0;
    const browserRuntime: BrowserSessionRuntime = {
      ...catalogRuntime,
      runDiscovery(source, searchPreferences) {
        inventoryCalls += 1;
        return catalogRuntime.runDiscovery(source, searchPreferences);
      },
    };
    const { repository, workspaceService } = createWorkspaceServiceHarness({
      seed,
      browserRuntime,
      aiClient: createAiClient(),
    });

    const initialStartedAt = performance.now();
    const initialSnapshot = await workspaceService.runDiscovery();
    const initialDurationMs = performance.now() - initialStartedAt;
    const initialTarget =
      initialSnapshot.recentDiscoveryRuns[0]?.targetExecutions[0];

    const knownDiscovery = await repository.getDiscoveryState();
    knownDiscovery.discoveryLedger = knownDiscovery.discoveryLedger.map(
      (entry) =>
        DiscoveryLedgerEntrySchema.parse({
          ...entry,
          latestStatus: "enriched",
          detailQuality: "detail_enriched",
          lastEnrichedAt: entry.lastEnrichedAt ?? entry.lastSeenAt,
        }),
    );
    await repository.saveDiscoveryState(knownDiscovery);

    const repeatedStartedAt = performance.now();
    const repeatedSnapshot = await workspaceService.runDiscovery();
    const repeatedDurationMs = performance.now() - repeatedStartedAt;
    const repeatedTarget =
      repeatedSnapshot.recentDiscoveryRuns[0]?.targetExecutions[0];

    const metrics = {
      candidatesReturnedPerInventory: CANDIDATE_COUNT,
      inventoryCalls,
      initialJobsReviewed: initialTarget?.jobsReviewed ?? null,
      repeatedJobsReviewed: repeatedTarget?.jobsReviewed ?? null,
      repeatedJobsSkippedByLedger: repeatedTarget?.jobsSkippedByLedger ?? null,
      initialJobsStaged: initialTarget?.jobsStaged ?? null,
      repeatedJobsStaged: repeatedTarget?.jobsStaged ?? null,
      initialDurationMs: Math.round(initialDurationMs),
      repeatedDurationMs: Math.round(repeatedDurationMs),
      repeatedSourceBudgetMs: REPEATED_SOURCE_BUDGET_MS,
    };
    console.info("repeated-source-ledger-benchmark", metrics);

    expect(inventoryCalls).toBe(2);
    expect(initialTarget).toMatchObject({
      jobsReviewed: 50,
      jobsSkippedByLedger: 0,
      jobsStaged: 50,
    });
    expect(repeatedTarget).toMatchObject({
      jobsReviewed: 0,
      jobsSkippedByLedger: CANDIDATE_COUNT,
      jobsStaged: 0,
      jobsPersisted: 0,
      duplicatesMerged: 0,
      invalidSkipped: 0,
    });
    expect(repeatedSnapshot.discoveryJobs).toHaveLength(50);
    expect(repeatedDurationMs).toBeLessThan(REPEATED_SOURCE_BUDGET_MS);
  }, 15_000);
});
