import { describe, expect, it } from "vitest";
import type {
  JobDiscoveryTarget,
  JobSearchPreferences,
  SavedJob,
} from "@unemployed/contracts";
import {
  getDiscoveryConfiguredFilters,
  getDiscoveryInspectedJob,
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
function createDiscoveryTarget(
  overrides: Partial<JobDiscoveryTarget> = {},
): JobDiscoveryTarget {
  return {
    id: "target",
    label: "Careers",
    startingUrl: "https://example.com/jobs",
    enabled: true,
    adapterKind: "auto",
    customInstructions: null,
    instructionStatus: "draft",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
    ...overrides,
  };
}
function createSavedJob(
  id: string,
  recommendation: SavedJob["matchAssessment"]["recommendation"],
  score = 80,
  overrides: Partial<{
    company: string;
    detailQuality: "card_only" | "detail_enriched";
    firstSeenAt: string | null;
    postedAt: string | null;
    roleSuitabilityState: "exact" | "adjacent" | "unknown" | "conflict";
    title: string;
  }> = {},
): SavedJob {
  return {
    id,
    title: overrides.title ?? id,
    company: overrides.company ?? "acme",
    detailQuality: overrides.detailQuality ?? "card_only",
    postedAt: overrides.postedAt ?? null,
    firstSeenAt: overrides.firstSeenAt ?? null,
    discoveredAt: null,
    matchAssessment: {
      recommendation,
      score,
      dimensions: {
        roleSuitability: { state: overrides.roleSuitabilityState ?? "unknown" },
      },
    },
  } as unknown as SavedJob;
}

describe("getDiscoveryConfiguredFilters", () => {
  it("counts runnable sources instead of all configured sources in the header chip", () => {
    const filters = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [
            createDiscoveryTarget({ id: "enabled" }),
            createDiscoveryTarget({ id: "disabled", enabled: false }),
          ],
        },
      }),
    );

    expect(filters).toContain("1 enabled source");
    expect(filters).not.toContain("2 enabled sources");
  });

  it("pluralizes the enabled-source header chip for zero and many sources", () => {
    const none = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [createDiscoveryTarget({ id: "disabled", enabled: false })],
        },
      }),
    );
    const several = getDiscoveryConfiguredFilters(
      createSearchPreferences({
        discovery: {
          historyLimit: 5,
          targets: [
            createDiscoveryTarget({ id: "first" }),
            createDiscoveryTarget({ id: "second" }),
            createDiscoveryTarget({ id: "third" }),
            createDiscoveryTarget({ id: "disabled", enabled: false }),
          ],
        },
      }),
    );

    expect(none).toContain("0 enabled sources");
    expect(several).toContain("3 enabled sources");
    expect(several).not.toContain("4 enabled sources");
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

    expect(hidden.jobs.map((job) => job.id)).toEqual(["review", "strong"]);
    expect(hidden.hiddenMismatchCount).toBe(1);
    expect(hidden.mismatchCount).toBe(1);
    expect(hidden.selectedJob?.id).toBe("review");

    const revealed = getDiscoveryResultVisibility(
      [strong, mismatch, review],
      mismatch,
      true,
    );

    expect(revealed.jobs.map((job) => job.id)).toEqual([
      "review",
      "strong",
      "mismatch",
    ]);
    expect(revealed.hiddenMismatchCount).toBe(0);
    expect(revealed.mismatchCount).toBe(1);
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
    expect(hidden.mismatchCount).toBe(2);
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

  it("keeps a requested mismatch visible for contextual navigation", () => {
    const strong = createSavedJob("strong", "strong_fit");
    const mismatch = createSavedJob("mismatch", "skip");

    const visible = getDiscoveryResultVisibility(
      [strong, mismatch],
      mismatch,
      false,
      true,
    );

    expect(visible.jobs.map((job) => job.id)).toEqual(["strong", "mismatch"]);
    expect(visible.hiddenMismatchCount).toBe(0);
    expect(visible.mismatchCount).toBe(1);
    expect(visible.selectedJob?.id).toBe("mismatch");
  });

  it("keeps only the deep-linked mismatch visible while counting the rest hidden", () => {
    const strong = createSavedJob("strong", "strong_fit", 80);
    const review = createSavedJob("review", "review_before_applying", 90);
    const selectedMismatch = createSavedJob("selected-mismatch", "skip", 95);
    const otherMismatch = createSavedJob("other-mismatch", "skip", 99);

    const visible = getDiscoveryResultVisibility(
      [strong, otherMismatch, selectedMismatch, review],
      selectedMismatch,
      false,
      true,
    );

    // Canonical Best-match order, with only the deep-linked mismatch exposed.
    expect(visible.jobs.map((job) => job.id)).toEqual([
      "review",
      "strong",
      "selected-mismatch",
    ]);
    // Truthful visibility: the hidden mismatch is not on screen, the held
    // mismatch counts as shown, and the total count stays available for the
    // reveal control.
    expect(visible.hiddenMismatchCount).toBe(1);
    expect(visible.mismatchCount).toBe(2);
    expect(visible.selectedJob?.id).toBe("selected-mismatch");
  });

  it("keeps every mismatch hidden for a deep link into a reviewable job", () => {
    const strong = createSavedJob("strong", "strong_fit");
    const firstMismatch = createSavedJob("mismatch-one", "skip", 99);
    const secondMismatch = createSavedJob("mismatch-two", "skip", 55);

    const visible = getDiscoveryResultVisibility(
      [firstMismatch, strong, secondMismatch],
      strong,
      false,
      true,
    );

    expect(visible.jobs.map((job) => job.id)).toEqual(["strong"]);
    expect(visible.hiddenMismatchCount).toBe(2);
    expect(visible.mismatchCount).toBe(2);
    expect(visible.selectedJob?.id).toBe("strong");
  });

  it("toggles the preserved selection between revealed and deep-linked views", () => {
    const strong = createSavedJob("strong", "strong_fit", 80);
    const review = createSavedJob("review", "review_before_applying", 90);
    const selectedMismatch = createSavedJob("selected-mismatch", "skip", 95);
    const otherMismatch = createSavedJob("other-mismatch", "skip", 99);
    const jobs = [strong, otherMismatch, selectedMismatch, review];

    const revealed = getDiscoveryResultVisibility(
      jobs,
      selectedMismatch,
      true,
      true,
    );

    expect(revealed.jobs.map((job) => job.id)).toEqual([
      "review",
      "strong",
      "other-mismatch",
      "selected-mismatch",
    ]);
    expect(revealed.hiddenMismatchCount).toBe(0);
    expect(revealed.mismatchCount).toBe(2);
    expect(revealed.selectedJob?.id).toBe("selected-mismatch");

    const hiddenAgain = getDiscoveryResultVisibility(
      jobs,
      selectedMismatch,
      false,
      true,
    );

    expect(hiddenAgain.jobs.map((job) => job.id)).toEqual([
      "review",
      "strong",
      "selected-mismatch",
    ]);
    expect(hiddenAgain.hiddenMismatchCount).toBe(1);
    expect(hiddenAgain.mismatchCount).toBe(2);
    expect(hiddenAgain.selectedJob?.id).toBe("selected-mismatch");
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

  it("ranks a role-suitability conflict by score exactly like the rank audit", () => {
    const conflictHigh = createSavedJob(
      "conflict-high",
      "review_before_applying",
      90,
      { roleSuitabilityState: "conflict" },
    );
    const exactLow = createSavedJob("exact-low", "strong_fit", 80, {
      roleSuitabilityState: "exact",
    });

    const canonicalArrival = getDiscoveryResultVisibility(
      [conflictHigh, exactLow],
      null,
      false,
    );
    const reversedArrival = getDiscoveryResultVisibility(
      [exactLow, conflictHigh],
      null,
      false,
    );

    expect(canonicalArrival.jobs.map((job) => job.id)).toEqual([
      "conflict-high",
      "exact-low",
    ]);
    expect(reversedArrival.jobs.map((job) => job.id)).toEqual([
      "conflict-high",
      "exact-low",
    ]);
  });

  it("breaks equal-score ties deterministically regardless of arrival order", () => {
    const alphaTie = createSavedJob("tie-alpha", "strong_fit", 88, {
      title: "Alpha Role",
    });
    const betaTie = createSavedJob("tie-beta", "review_before_applying", 88, {
      title: "Beta Role",
    });

    const forward = getDiscoveryResultVisibility(
      [alphaTie, betaTie],
      null,
      false,
    );
    const reversed = getDiscoveryResultVisibility(
      [betaTie, alphaTie],
      null,
      false,
    );

    const expected = ["tie-alpha", "tie-beta"];
    expect(forward.jobs.map((job) => job.id)).toEqual(expected);
    expect(reversed.jobs.map((job) => job.id)).toEqual(expected);
  });

  it("orders revealed clear mismatches among themselves by descending fit", () => {
    const strong = createSavedJob("strong", "strong_fit", 70);
    const highSkip = createSavedJob("high-skip", "skip", 99);
    const lowSkip = createSavedJob("low-skip", "skip", 55);

    const revealed = getDiscoveryResultVisibility(
      [lowSkip, strong, highSkip],
      null,
      true,
    );

    expect(revealed.jobs.map((job) => job.id)).toEqual([
      "strong",
      "high-skip",
      "low-skip",
    ]);
  });

  it("keeps a campaign candidate subset in the audit's relative order", () => {
    const fullRanking = [
      createSavedJob("full-95", "strong_fit", 95),
      createSavedJob("campaign-88", "strong_fit", 88),
      createSavedJob("subset-only-91", "strong_fit", 91),
      createSavedJob("full-84", "strong_fit", 84),
      createSavedJob("campaign-skip-99", "skip", 99),
    ];
    const campaignIds = new Set(["campaign-88", "full-95", "campaign-skip-99"]);
    const campaignArrival = fullRanking.filter((job) =>
      campaignIds.has(job.id),
    );

    const visibleSubset = getDiscoveryResultVisibility(
      [...campaignArrival].reverse(),
      null,
      true,
    );
    const expectedSubset = getDiscoveryResultVisibility(fullRanking, null, true)
      .jobs.filter((job) => campaignIds.has(job.id))
      .map((job) => job.id);

    expect(visibleSubset.jobs.map((job) => job.id)).toEqual(expectedSubset);
  });
});

describe("getDiscoveryInspectedJob", () => {
  const ranked = [
    createSavedJob("top", "strong_fit", 94),
    createSavedJob("middle", "strong_fit", 71),
    createSavedJob("bottom", "strong_fit", 22),
  ];

  it("inspects the job the results panel actually displays", () => {
    expect(getDiscoveryInspectedJob(ranked, "top", "bottom")?.id).toBe(
      "bottom",
    );
  });

  it("falls back to the requested selection before the first panel report", () => {
    expect(getDiscoveryInspectedJob(ranked, "middle", undefined)?.id).toBe(
      "middle",
    );
    expect(getDiscoveryInspectedJob(ranked, null, undefined)?.id).toBe("top");
  });

  it("clears the inspector when the visible page is empty", () => {
    expect(getDiscoveryInspectedJob(ranked, "top", null)).toBeNull();
  });

  it("never inspects a job outside the ranked result set", () => {
    expect(getDiscoveryInspectedJob([], "top", undefined)).toBeNull();
    expect(getDiscoveryInspectedJob(ranked, "gone", "gone")).toBeNull();
  });
});
