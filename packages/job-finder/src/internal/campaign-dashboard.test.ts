import { describe, expect, test } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";

import { assertCampaignCanRun, createCampaign } from "./campaign-dashboard";
import {
  createWorkspaceCampaignMethods,
  recordCampaignDiscoveryResult,
} from "./workspace-campaign-methods";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import { createSavedJob, createSeed } from "../workspace-service.test-fixtures";

function savedJob(id: string, score: number) {
  return createSavedJob({
    id,
    source: "target_site",
    sourceJobId: id,
    discoveryMethod: "catalog_seed",
    canonicalUrl: `https://jobs.example.com/${id}`,
    applicationUrl: `https://jobs.example.com/${id}/apply`,
    title: `Engineer ${id}`,
    company: "Example",
    location: "Remote",
    workMode: ["remote"],
    applyPath: "external_redirect",
    easyApplyEligible: false,
    postedAt: null,
    postedAtText: null,
    discoveredAt: "2026-08-15T10:00:00.000Z",
    firstSeenAt: "2026-08-15T10:00:00.000Z",
    lastSeenAt: "2026-08-15T10:00:00.000Z",
    lastVerifiedActiveAt: "2026-08-15T10:00:00.000Z",
    salaryText: null,
    summary: "Engineering role.",
    description: "Engineering role.",
    keySkills: [],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    status: "discovered",
    matchAssessment: { score },
  });
}

describe("campaign workspace core", () => {
  test("rejects discovery while the active campaign is not active", () => {
    const seed = createSeed();
    const paused = {
      ...createCampaign({
        id: "paused",
        name: "Paused campaign",
        mode: "precision",
        searchPreferences: seed.searchPreferences,
        now: "2026-08-15T09:00:00.000Z",
      }),
      status: "paused" as const,
    };

    expect(() => assertCampaignCanRun(paused)).toThrow(
      "Set it to active before starting discovery",
    );
  });

  test("honors a paused campaign and normalizes its enabled source scope", async () => {
    const seed = createSeed();
    const repository = createInMemoryJobFinderRepository(seed);
    const methods = createWorkspaceCampaignMethods({
      ctx: { repository } as WorkspaceServiceContext,
      getWorkspaceSnapshot: () =>
        Promise.resolve(null as unknown as JobFinderWorkspaceSnapshot),
      runCampaignDiscovery: () =>
        Promise.resolve(null as unknown as JobFinderWorkspaceSnapshot),
      afterCampaignRun: () =>
        Promise.resolve(null as unknown as JobFinderWorkspaceSnapshot),
    });

    await methods.saveCampaign({
      id: null,
      name: "Quiet scale search",
      description: "Created paused.",
      mode: "scale",
      status: "paused",
      searchPreferences: seed.searchPreferences,
      sourceTargetIds: ["stale_target_id"],
      minimumFitScore: 70,
      limits: {
        retainedJobTarget: 100,
        analysisConcurrency: 4,
        preparationBatchSize: 20,
        dailyPreparationLimit: 50,
      },
      stopRules: {
        pauseOnLoginRequired: true,
        pauseOnChangedForm: true,
        pauseOnUncertainEligibility: true,
        pauseOnFailureRatePercent: 20,
        failureRateMinimumSample: 10,
      },
      applicationPolicy: {
        resumeStrategy: "job_family_variants",
        requireReviewBeforePreparation: false,
        requireReviewBeforeExternalWrite: true,
        finalSubmitAuthorized: false,
        qualityReviewSampleRatio: 0.2,
        simultaneousApplicationWindowDays: 1,
      },
      schedule: {
        mode: "manual",
        enabled: false,
        daysOfWeek: [],
        localStartTime: null,
        timeZone: null,
        pauseWindows: [],
        runFacts: {
          nextRunAt: null,
          lastRunAt: null,
          lastRunOutcome: null,
          lastRunSummary: null,
          consecutiveFailures: 0,
        },
      },
      rules: [],
      latestDigest: null,
    });

    const state = await repository.getCampaignState();
    const campaign = state?.campaigns.find(
      (candidate) => candidate.id === state.activeCampaignId,
    );
    expect(campaign?.status).toBe("paused");
    expect(campaign?.sourceTargetIds).toEqual(
      seed.searchPreferences.discovery.targets
        .filter((target) => target.enabled)
        .map((target) => target.id),
    );
    expect(campaign?.limits.preparationBatchSize).toBe(20);
  });

  test("binds a completed run to its captured campaign and retains only its strongest eligible jobs", async () => {
    const seed = createSeed();
    const jobs = [
      savedJob("low", 40),
      savedJob("mid", 75),
      savedJob("high", 95),
    ];
    const repository = createInMemoryJobFinderRepository({
      ...seed,
      savedJobs: jobs,
      discovery: {
        ...seed.discovery,
        recentRuns: [
          {
            id: "run_1",
            campaignId: "campaign_precision",
            state: "completed",
            startedAt: "2026-08-15T10:00:00.000Z",
            completedAt: "2026-08-15T10:01:00.000Z",
            scope: "run_all",
            targetIds: [],
            targetExecutions: [],
            activity: [],
            summary: {
              targetsPlanned: 0,
              targetsCompleted: 0,
              validJobsFound: 3,
              jobsPersisted: 3,
              jobsStaged: 0,
              jobsSkippedByLedger: 0,
              jobsSkippedByTitleTriage: 0,
              duplicatesMerged: 0,
              invalidSkipped: 0,
              changeDigest: {
                new: 0,
                unchanged: 0,
                changed: 0,
                reactivated: 0,
                inactive: 0,
                known: 0,
                skipped: 0,
              },
              sourceHealth: [],
              warnings: [],
              durationMs: 60_000,
              outcome: "completed",
              browserCloseout: null,
              timing: null,
            },
          },
        ],
      },
    });
    const campaign = {
      ...createCampaign({
        id: "campaign_precision",
        name: "Precision",
        mode: "precision",
        searchPreferences: seed.searchPreferences,
        now: "2026-08-15T09:00:00.000Z",
      }),
      minimumFitScore: 70,
      limits: {
        ...createCampaign({
          id: "template",
          name: "Template",
          mode: "precision",
          searchPreferences: seed.searchPreferences,
          now: "2026-08-15T09:00:00.000Z",
        }).limits,
        retainedJobTarget: 2,
      },
    };
    await repository.saveCampaignState({
      notifications: [],
      activeCampaignId: campaign.id,
      campaigns: [campaign],
    });

    await recordCampaignDiscoveryResult({
      ctx: {
        repository,
        withCampaignTransition: async (operation) => operation(),
      } as WorkspaceServiceContext,
      campaignId: campaign.id,
      beforeJobProvenanceFingerprints: new Map(),
    });

    const state = await repository.getCampaignState();
    expect(state?.campaigns[0]?.jobIds).toEqual(["high", "mid"]);
    expect(state?.campaigns[0]?.history[0]?.discoveryRunId).toBe("run_1");
  });

  test("adds an existing global job when another campaign rediscovers it", async () => {
    const seed = createSeed();
    const job = savedJob("shared", 90);
    const repository = createInMemoryJobFinderRepository({
      ...seed,
      savedJobs: [job],
      discovery: {
        ...seed.discovery,
        recentRuns: [
          {
            id: "run_campaign_b",
            campaignId: "campaign_b",
            state: "completed",
            scope: "run_all",
            startedAt: "2026-08-15T11:00:00.000Z",
            completedAt: "2026-08-15T11:01:00.000Z",
            targetIds: [],
            targetExecutions: [],
            activity: [],
            summary: {
              targetsPlanned: 0,
              targetsCompleted: 0,
              validJobsFound: 3,
              jobsPersisted: 3,
              jobsStaged: 0,
              jobsSkippedByLedger: 0,
              jobsSkippedByTitleTriage: 0,
              duplicatesMerged: 0,
              invalidSkipped: 0,
              changeDigest: {
                new: 0,
                unchanged: 0,
                changed: 0,
                reactivated: 0,
                inactive: 0,
                known: 0,
                skipped: 0,
              },
              sourceHealth: [],
              warnings: [],
              durationMs: 60_000,
              outcome: "completed",
              browserCloseout: null,
              timing: null,
            },
          },
        ],
      },
    });
    const campaign = createCampaign({
      id: "campaign_b",
      name: "Campaign B",
      mode: "precision",
      searchPreferences: seed.searchPreferences,
      now: "2026-08-15T10:00:00.000Z",
    });
    await repository.saveCampaignState({
      notifications: [],
      activeCampaignId: campaign.id,
      campaigns: [campaign],
    });

    await recordCampaignDiscoveryResult({
      ctx: {
        repository,
        withCampaignTransition: async (operation) => operation(),
      } as WorkspaceServiceContext,
      campaignId: campaign.id,
      beforeJobProvenanceFingerprints: new Map([[job.id, "old-provenance"]]),
    });

    expect((await repository.getCampaignState())?.campaigns[0]?.jobIds).toEqual(
      ["shared"],
    );
  });
});
