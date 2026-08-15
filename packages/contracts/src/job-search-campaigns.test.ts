import { describe, expect, test } from "vitest";

import {
  JobSearchCampaignSchema,
  getDefaultCampaignConfiguration,
} from "./job-search-campaigns";

const searchPreferences = {
  targetRoles: ["Software engineer"],
  jobFamilies: [],
  locations: ["Remote"],
  excludedLocations: [],
  workModes: ["remote" as const],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: "USD",
  compensation: {},
  approvalMode: "review_before_submit" as const,
  tailoringMode: "balanced" as const,
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: {},
};

describe("JobSearchCampaignSchema", () => {
  test.each(["precision", "scale"] as const)(
    "keeps %s defaults within safe prepare-only limits",
    (mode) => {
      const now = "2026-08-15T10:00:00.000Z";
      const configuration = getDefaultCampaignConfiguration(mode);
      const campaign = JobSearchCampaignSchema.parse({
        id: `campaign_${mode}`,
        name: `${mode} search`,
        mode,
        status: "active",
        createdAt: now,
        updatedAt: now,
        searchPreferences,
        sourceTargetIds: [],
        ...configuration,
        schedule: {},
        progress: { lastUpdatedAt: now },
      });

      expect(campaign.applicationPolicy.finalSubmitAuthorized).toBe(false);
      expect(campaign.applicationPolicy.requireReviewBeforeExternalWrite).toBe(
        true,
      );
      expect(campaign.limits.retainedJobTarget).toBe(
        mode === "precision" ? 15 : 1_000,
      );
    },
  );

  test("rejects an unsafe final-submit campaign policy", () => {
    const now = "2026-08-15T10:00:00.000Z";
    expect(() =>
      JobSearchCampaignSchema.parse({
        id: "campaign_unsafe",
        name: "Unsafe",
        mode: "scale",
        status: "active",
        createdAt: now,
        updatedAt: now,
        searchPreferences,
        sourceTargetIds: [],
        ...getDefaultCampaignConfiguration("scale"),
        applicationPolicy: {
          ...getDefaultCampaignConfiguration("scale").applicationPolicy,
          finalSubmitAuthorized: true,
        },
        schedule: {},
        progress: { lastUpdatedAt: now },
      }),
    ).toThrow();
  });
});
