import { describe, expect, it } from "vitest";
import type { JobSearchPreferences, SavedJob } from "@unemployed/contracts";
import {
  getDiscoveryConfiguredFilters,
  getDiscoveryResultVisibility,
} from "./discovery-screen";
import { getDiscoverySearchReadiness } from "./discovery-search-readiness";

function createSearchPreferences(
  overrides: Partial<JobSearchPreferences> = {},
): JobSearchPreferences {
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
    compensation: {
      minimum: null,
      maximum: null,
      interval: "year",
      currency: "USD",
      currencyStatus: "inherited",
    },
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      historyLimit: 5,
      targets: [],
    },
    ...overrides,
  };
}
function createSavedJob(
  id: string,
  recommendation: SavedJob["matchAssessment"]["recommendation"],
  score = 80,
): SavedJob {
  return {
    id,
    matchAssessment: {
      recommendation,
      score,
    },
  } as unknown as SavedJob;
}

describe("getDiscoveryConfiguredFilters", () => {
  it("counts enabled sources instead of all configured sources", () => {
    const filters = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [
            {
              id: "enabled",
              label: "Enabled",
              startingUrl: "https://enabled.example/jobs",
              enabled: true,
              adapterKind: "auto",
              customInstructions: null,
              instructionStatus: "draft",
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            },
            {
              id: "disabled",
              label: "Disabled",
              startingUrl: "https://disabled.example/jobs",
              enabled: false,
              adapterKind: "auto",
              customInstructions: null,
              instructionStatus: "draft",
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            },
          ],
        },
      }),
    );

    expect(filters).toContain("1 source");
    expect(filters).not.toContain("2 sources");
  });

  it("treats job families as valid search targets for filter badges", () => {
    const filters = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        jobFamilies: ["Frontend Engineering"],
      }),
    );

    expect(filters).toContain("1 search target");
    expect(filters).not.toContain("0 search targets");
  });
});

describe("getDiscoverySearchReadiness", () => {
  it("can infer search intent from the profile but still requires an enabled source", () => {
    const noRole = getDiscoverySearchReadiness(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [
            {
              id: "source",
              label: "Careers",
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
            },
          ],
        },
      }),
    );
    const noSource = getDiscoverySearchReadiness(
      createSearchPreferences({ targetRoles: ["Engineer"] }),
    );

    expect(noRole.ready).toBe(true);
    expect(noRole.hasSearchRoles).toBe(false);
    expect(noRole.reason).toBeNull();
    expect(noSource.ready).toBe(false);
    expect(noSource.reason).toContain("job-source URL");
  });
});

describe("getDiscoveryResultVisibility", () => {
  it("hides hard conflicts by default and keeps a transparent reveal path", () => {
    const strong = createSavedJob("strong", "strong_fit");
    const mismatch = createSavedJob("mismatch", "skip");
    const review = createSavedJob("review", "review_before_applying");

    const hidden = getDiscoveryResultVisibility(
      [strong, mismatch, review],
      mismatch,
      false,
    );

    expect(hidden.jobs.map((job) => job.id)).toEqual(["strong", "review"]);
    expect(hidden.hiddenMismatchCount).toBe(1);
    expect(hidden.selectedJob?.id).toBe("strong");

    const revealed = getDiscoveryResultVisibility(
      [strong, mismatch, review],
      mismatch,
      true,
    );

    expect(revealed.jobs.map((job) => job.id)).toEqual([
      "strong",
      "review",
      "mismatch",
    ]);
    expect(revealed.selectedJob?.id).toBe("mismatch");
  });

  it("returns an explicit all-hidden state without losing mismatch count", () => {
    const firstMismatch = createSavedJob("mismatch-one", "skip");
    const secondMismatch = createSavedJob("mismatch-two", "skip");

    const hidden = getDiscoveryResultVisibility(
      [firstMismatch, secondMismatch],
      firstMismatch,
      false,
    );

    expect(hidden.jobs).toEqual([]);
    expect(hidden.hiddenMismatchCount).toBe(2);
    expect(hidden.selectedJob).toBeNull();
  });

  it("preserves a visible selection instead of always selecting the first job", () => {
    const strong = createSavedJob("strong", "strong_fit");
    const review = createSavedJob("review", "review_before_applying");

    const visible = getDiscoveryResultVisibility(
      [strong, review],
      review,
      false,
    );

    expect(visible.selectedJob?.id).toBe("review");
  });

  it("orders reviewable results by descending displayed fit without mutating source order", () => {
    const ninety = createSavedJob("ninety", "strong_fit", 90);
    const ninetyTwo = createSavedJob(
      "ninety-two",
      "review_before_applying",
      92,
    );
    const eightyEight = createSavedJob("eighty-eight", "strong_fit", 88);
    const sourceJobs = [ninety, ninetyTwo, eightyEight];

    const visible = getDiscoveryResultVisibility(sourceJobs, ninety, false);

    expect(visible.jobs.map((job) => job.id)).toEqual([
      "ninety-two",
      "ninety",
      "eighty-eight",
    ]);
    expect(sourceJobs.map((job) => job.id)).toEqual([
      "ninety",
      "ninety-two",
      "eighty-eight",
    ]);
    expect(visible.selectedJob?.id).toBe("ninety");
  });

  it("keeps equal-score ties stable and revealed clear mismatches after reviewable jobs", () => {
    const firstTie = createSavedJob("first-tie", "review_before_applying", 90);
    const highMismatch = createSavedJob("high-mismatch", "skip", 99);
    const secondTie = createSavedJob("second-tie", "strong_fit", 90);

    const revealed = getDiscoveryResultVisibility(
      [firstTie, highMismatch, secondTie],
      null,
      true,
    );

    expect(revealed.jobs.map((job) => job.id)).toEqual([
      "first-tie",
      "second-tie",
      "high-mismatch",
    ]);
    expect(revealed.selectedJob?.id).toBe("first-tie");
  });
});
