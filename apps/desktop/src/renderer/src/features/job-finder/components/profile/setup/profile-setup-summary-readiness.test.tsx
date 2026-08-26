// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  createFreshStartCandidateProfile,
  type JobSearchPreferences,
} from "@unemployed/contracts";
import { buildProfileSetupSummaryCards } from "./profile-setup-screen-helpers";

type SearchPreferencesInput = (typeof JobSearchPreferencesSchema)["_input"];

function buildSearchPreferences(
  overrides: Partial<SearchPreferencesInput> = {},
): JobSearchPreferences {
  return JobSearchPreferencesSchema.parse({
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
    compensation: {
      minimum: null,
      maximum: null,
      interval: "year",
      currency: null,
      currencyStatus: "needs_clarification",
    },
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: { historyLimit: 5, targets: [] },
    ...overrides,
  });
}

describe("profile setup summary readiness cards", () => {
  it("reports a canonical fresh-start workspace as not provided yet", () => {
    const cards = buildProfileSetupSummaryCards({
      draftProfile: createFreshStartCandidateProfile(),
      draftSearchPreferences: buildSearchPreferences(),
      hasImportedResume: false,
      profileSetupStateStatus: "not_started",
    });

    expect(cards.map((card) => card.value)).toEqual([
      "Not provided yet",
      "Not analyzed yet",
      "Not provided yet",
    ]);
  });

  it("never claims ready to search while the work mode is missing", () => {
    // Regression for first-run QA: target role + runnable source used to read
    // "Ready to search" while the ready check still required a work mode.
    const profile = CandidateProfileSchema.parse({
      id: "candidate_qa_regression",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      email: "alex@example.com",
      phone: "+44 7700 900123",
      baseResume: {
        id: "resume_1",
        fileName: "alex.pdf",
        uploadedAt: "2026-08-01T10:00:00.000Z",
        textContent: "Alex Vanguard Senior systems designer",
        extractionStatus: "ready",
      },
      targetRoles: ["Principal Designer"],
      experiences: [
        {
          id: "experience_1",
          companyName: "Signal Systems",
          title: "Senior Product Designer",
          startDate: "2022-01",
          isCurrent: true,
        },
      ],
    });
    const searchPreferencesWithoutWorkMode = buildSearchPreferences({
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: "source_1",
            label: "Signal Systems careers",
            startingUrl: "https://signal.example/careers",
            enabled: true,
            adapterKind: "auto",
            customInstructions: null,
            instructionStatus: "missing",
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    });

    const blockedCards = buildProfileSetupSummaryCards({
      draftProfile: profile,
      draftSearchPreferences: searchPreferencesWithoutWorkMode,
      hasImportedResume: true,
      profileSetupStateStatus: "in_progress",
    });
    expect(blockedCards[0]).toEqual({
      label: "Discovery",
      value: "Needs a work mode",
    });

    const readyCards = buildProfileSetupSummaryCards({
      draftProfile: profile,
      draftSearchPreferences: {
        ...searchPreferencesWithoutWorkMode,
        workModes: ["remote"],
      },
      hasImportedResume: true,
      profileSetupStateStatus: "completed",
    });
    expect(readyCards[0]).toEqual({
      label: "Discovery",
      value: "Ready to search",
    });
  });
});
