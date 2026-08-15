// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  selectOutcomeAnalyticsScope,
  selectRapidReviewScope,
} from "./job-finder-page-routes";

function workspace(): JobFinderWorkspaceSnapshot {
  return {
    activeCampaignId: "campaign_1",
    campaigns: [
      {
        id: "campaign_1",
        name: "Campaign One",
        jobIds: ["job_a", "job_b"],
      },
      {
        id: "campaign_2",
        name: "Campaign Two",
        jobIds: ["job_c"],
      },
    ],
    discoveryJobs: [
      { id: "job_a", title: "Job A" },
      { id: "job_b", title: "Job B" },
      { id: "job_c", title: "Job C" },
      { id: "job_d", title: "Job D" },
    ],
    intelligence: {
      rapidReviewLogs: [
        {
          campaignId: "campaign_1",
          entries: [{ id: "decision_1", jobId: "job_a" }],
        },
        {
          campaignId: "campaign_2",
          entries: [{ id: "decision_2", jobId: "job_c" }],
        },
      ],
    },
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("selectRapidReviewScope", () => {
  it("scopes reviewed jobs and the decision log to the active campaign", () => {
    const scope = selectRapidReviewScope(workspace());

    expect(scope.campaign?.id).toBe("campaign_1");
    expect(scope.campaign?.name).toBe("Campaign One");
    expect(scope.jobs.map((job) => job.id)).toEqual(["job_a", "job_b"]);
    expect(scope.log?.campaignId).toBe("campaign_1");
    expect(scope.log?.entries.map((entry) => entry.jobId)).toEqual(["job_a"]);
  });

  it("returns no log when the active campaign has no decisions yet", () => {
    const current = workspace();
    current.intelligence.rapidReviewLogs = [];

    const scope = selectRapidReviewScope(current);

    expect(scope.log).toBeNull();
    expect(scope.jobs.map((job) => job.id)).toEqual(["job_a", "job_b"]);
  });

  it("returns an empty scope when the active campaign id matches nothing", () => {
    const current = workspace();
    current.activeCampaignId = "campaign_missing";

    const scope = selectRapidReviewScope(current);

    expect(scope.campaign).toBeNull();
    expect(scope.jobs).toEqual([]);
    expect(scope.log).toBeNull();
  });
});

describe("selectOutcomeAnalyticsScope", () => {
  it("exposes the active campaign and the outcome analytics inputs", () => {
    const current = workspace();
    current.intelligence.outcomeEvents = [
      {
        id: "outcome_1",
        jobId: "job_a",
        campaignId: "campaign_1",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["intelligence"]["outcomeEvents"];
    current.intelligence.outcomeAnalytics = {
      generatedAt: "2026-08-15T10:00:00.000Z",
      buckets: [],
    };
    current.intelligence.resumeStrategies = [
      { id: "strategy_1", name: "SWE generalist" },
    ] as unknown as JobFinderWorkspaceSnapshot["intelligence"]["resumeStrategies"];

    const scope = selectOutcomeAnalyticsScope(current);

    expect(scope.activeCampaignId).toBe("campaign_1");
    expect(scope.campaigns.map((campaign) => campaign.id)).toEqual([
      "campaign_1",
      "campaign_2",
    ]);
    expect(scope.events).toHaveLength(1);
    expect(scope.events[0]).toMatchObject({ jobId: "job_a" });
    expect(scope.overview?.buckets).toEqual([]);
    expect(scope.resumeStrategies).toHaveLength(1);
  });

  it("falls back to no events and no overview on a fresh workspace", () => {
    const scope = selectOutcomeAnalyticsScope(workspace());

    expect(scope.events).toEqual([]);
    expect(scope.overview).toBeNull();
    expect(scope.resumeStrategies).toEqual([]);
  });
});
