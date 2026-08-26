import { describe, expect, test } from "vitest";
import {
  CandidateProfileSchema,
  getDefaultCampaignConfiguration,
  JobFinderRepositoryStateSchema,
  JobSearchCampaignSchema,
  JobSearchPreferencesSchema,
  JobFinderSettingsSchema,
} from "./index";

const searchPreferences = JobSearchPreferencesSchema.parse({
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  minimumSalaryUsd: null,
});

const settings = JobFinderSettingsSchema.parse({
  resumeFormat: "pdf",
  resumeTemplateId: "classic_ats",
  fontPreset: "inter_requisite",
  humanReviewRequired: true,
  allowAutoSubmitOverride: false,
  keepSessionAlive: false,
});

const profile = CandidateProfileSchema.parse({
  id: "candidate_1",
  firstName: "Alex",
  lastName: "Vanguard",
  middleName: null,
  fullName: "Alex Vanguard",
  headline: "Full-stack engineer",
  summary: "Builds reliable user-facing systems.",
  currentLocation: "London, UK",
  yearsExperience: 8,
  baseResume: {
    id: "resume_1",
    fileName: "alex-vanguard.pdf",
    uploadedAt: "2026-03-20T10:00:00.000Z",
    storagePath: "/tmp/alex-vanguard.pdf",
  },
  targetRoles: ["Frontend Engineer"],
  experiences: [],
  education: [],
  certifications: [],
  links: [],
  projects: [],
  spokenLanguages: [],
});

function createCampaign(id: string) {
  return JobSearchCampaignSchema.parse({
    id,
    name: `Plan ${id}`,
    mode: "precision",
    status: "active",
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    searchPreferences,
    ...getDefaultCampaignConfiguration("precision"),
    progress: { lastUpdatedAt: "2026-08-15T10:00:00.000Z" },
  });
}

describe("contracts repository state campaign invariant", () => {
  test("accepts a valid campaign-free fresh state with a null pointer", () => {
    const result = JobFinderRepositoryStateSchema.safeParse({
      profile,
      searchPreferences,
      settings,
      campaigns: [],
      activeCampaignId: null,
    });

    expect(result.success).toBe(true);
  });

  test("rejects a non-null active campaign pointer without campaigns", () => {
    const result = JobFinderRepositoryStateSchema.safeParse({
      profile,
      searchPreferences,
      settings,
      campaigns: [],
      activeCampaignId: "campaign_missing",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["activeCampaignId"]);
    }
  });

  test("rejects campaigns without an active campaign pointer", () => {
    const result = JobFinderRepositoryStateSchema.safeParse({
      profile,
      searchPreferences,
      settings,
      campaigns: [createCampaign("campaign_kept")],
      activeCampaignId: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["activeCampaignId"]);
    }
  });

  test("rejects an active campaign pointer outside the campaign collection", () => {
    const result = JobFinderRepositoryStateSchema.safeParse({
      profile,
      searchPreferences,
      settings,
      campaigns: [createCampaign("campaign_kept")],
      activeCampaignId: "campaign_missing",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["activeCampaignId"]);
    }
  });

  test("accepts campaigns with a pointer that references one of them", () => {
    const result = JobFinderRepositoryStateSchema.safeParse({
      profile,
      searchPreferences,
      settings,
      campaigns: [createCampaign("campaign_kept")],
      activeCampaignId: "campaign_kept",
    });

    expect(result.success).toBe(true);
  });
});
