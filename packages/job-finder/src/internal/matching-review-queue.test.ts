import { describe, expect, test } from "vitest";
import type { SavedJob } from "@unemployed/contracts";

import { createSeed } from "../workspace-service.test-fixtures";
import { compareDiscoveryJobs as compareDiscoveryJobsShared } from "../discovery-ordering";
import {
  buildDiscoveryJobs,
  buildReviewQueue,
  compareDiscoveryJobs,
} from "./matching-review-queue";

describe("discovery result fit ordering", () => {
  test("orders reviewable jobs by descending displayed fit before recommendation", () => {
    const base = createSeed().savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "strong_fit_90",
        sourceJobId: "strong_fit_90",
        matchAssessment: {
          ...base.matchAssessment,
          score: 90,
          recommendation: "strong_fit",
        },
      },
      {
        ...base,
        id: "review_92",
        sourceJobId: "review_92",
        matchAssessment: {
          ...base.matchAssessment,
          score: 92,
          recommendation: "review_before_applying",
        },
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual(["review_92", "strong_fit_90"]);
  });

  test("keeps a higher-scoring hard mismatch below reviewable jobs", () => {
    const base = createSeed().savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "hard_mismatch_99",
        sourceJobId: "hard_mismatch_99",
        matchAssessment: {
          ...base.matchAssessment,
          score: 99,
          recommendation: "skip",
        },
      },
      {
        ...base,
        id: "reviewable_70",
        sourceJobId: "reviewable_70",
        matchAssessment: {
          ...base.matchAssessment,
          score: 70,
          recommendation: "review_before_applying",
        },
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "reviewable_70",
      "hard_mismatch_99",
    ]);
  });

  test("ranks a role-suitability conflict below a lower-scoring exact fit", () => {
    const base = createSeed().savedJobs[0]!;
    const withSuitabilityState = (
      id: string,
      score: number,
      state: (typeof base.matchAssessment.dimensions.roleSuitability)["state"],
    ) => ({
      ...base,
      id,
      sourceJobId: id,
      title: `Role ${id}`,
      matchAssessment: {
        ...base.matchAssessment,
        score,
        recommendation: "strong_fit" as const,
        dimensions: {
          ...base.matchAssessment.dimensions,
          roleSuitability: {
            ...base.matchAssessment.dimensions.roleSuitability,
            state,
          },
        },
      },
    });

    const jobs = buildDiscoveryJobs([
      withSuitabilityState("exact_fit_80", 80, "exact"),
      withSuitabilityState("conflict_fit_90", 90, "conflict"),
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "conflict_fit_90",
      "exact_fit_80",
    ]);
  });

  test("breaks equal-score ties by listing evidence instead of recommendation label", () => {
    const base = createSeed().savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "review_enriched",
        sourceJobId: "review_enriched",
        detailQuality: "detail_enriched",
        postedAt: null,
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "review_before_applying",
        },
      },
      {
        ...base,
        id: "strong_card",
        sourceJobId: "strong_card",
        detailQuality: "card_only",
        postedAt: "2026-01-01T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 80,
          recommendation: "strong_fit",
        },
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "review_enriched",
      "strong_card",
    ]);
  });

  test("keeps the ordering identical regardless of input arrival order", () => {
    const base = createSeed().savedJobs[0]!;
    const job = (id: string, overrides: Partial<SavedJob> = {}): SavedJob => ({
      ...base,
      id,
      sourceJobId: id,
      title: `Role ${id}`,
      ...overrides,
    });
    const candidateSet = [
      job("mismatch_skip_99", {
        matchAssessment: {
          ...base.matchAssessment,
          score: 99,
          recommendation: "skip" as const,
        },
      }),
      job("card_85", {
        detailQuality: "card_only" as const,
        matchAssessment: {
          ...base.matchAssessment,
          score: 85,
          recommendation: "strong_fit" as const,
        },
      }),
      job("enriched_85_old", {
        detailQuality: "detail_enriched" as const,
        postedAt: "2026-01-05T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 85,
          recommendation: "strong_fit" as const,
        },
      }),
      job("enriched_85_new", {
        detailQuality: "detail_enriched" as const,
        postedAt: "2026-02-05T00:00:00.000Z",
        matchAssessment: {
          ...base.matchAssessment,
          score: 85,
          recommendation: "strong_fit" as const,
        },
      }),
      job("tie_aaa", {
        matchAssessment: {
          ...base.matchAssessment,
          score: 84,
          recommendation: "strong_fit" as const,
        },
      }),
      job("tie_zzz", {
        matchAssessment: {
          ...base.matchAssessment,
          score: 84,
          recommendation: "strong_fit" as const,
        },
      }),
    ];

    const forward = buildDiscoveryJobs(candidateSet).map((entry) => entry.id);
    const reversed = buildDiscoveryJobs([...candidateSet].reverse()).map(
      (entry) => entry.id,
    );

    expect(reversed).toEqual(forward);
    expect(forward).toEqual([
      "enriched_85_new",
      "enriched_85_old",
      "card_85",
      "tie_aaa",
      "tie_zzz",
      "mismatch_skip_99",
    ]);
  });
});

describe("discovery result campaign subsets", () => {
  test("keeps a candidate subset in the same relative order as the full ranking", () => {
    const base = createSeed().savedJobs[0]!;
    const job = (id: string, score: number): SavedJob => ({
      ...base,
      id,
      sourceJobId: id,
      title: `Role ${id}`,
      matchAssessment: {
        ...base.matchAssessment,
        score,
        recommendation: "strong_fit" as const,
      },
    });
    const campaignCandidateIds = new Set(["campaign_88", "full_95", "skip_99"]);
    const fullRanking = buildDiscoveryJobs([
      job("subset_only_91", 91),
      job("full_95", 95),
      job("campaign_88", 88),
      job("full_84", 84),
      {
        ...job("skip_99", 99),
        matchAssessment: {
          ...base.matchAssessment,
          score: 99,
          recommendation: "skip" as const,
        },
      },
    ]);
    const subsetRanking = buildDiscoveryJobs(
      fullRanking.filter((entry) => campaignCandidateIds.has(entry.id)),
    );

    expect(subsetRanking.map((entry) => entry.id)).toEqual(
      fullRanking
        .filter((entry) => campaignCandidateIds.has(entry.id))
        .map((entry) => entry.id),
    );
  });
});

describe("discovery result recency ordering", () => {
  test("ignores last verification time when all stable ranking inputs match", () => {
    const base = createSeed().savedJobs[0]!;
    const earlierVerification = {
      ...base,
      lastVerifiedActiveAt: "2026-01-01T00:00:00.000Z",
    };
    const laterVerification = {
      ...base,
      lastVerifiedActiveAt: "2026-07-01T00:00:00.000Z",
    };

    expect(compareDiscoveryJobs(earlierVerification, laterVerification)).toBe(
      0,
    );
    expect(compareDiscoveryJobs(laterVerification, earlierVerification)).toBe(
      0,
    );
  });

  test("uses first-seen time ahead of changing verification time", () => {
    const base = createSeed().savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "first_seen_earlier",
        sourceJobId: "first_seen_earlier",
        postedAt: null,
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastVerifiedActiveAt: "2026-07-01T00:00:00.000Z",
      },
      {
        ...base,
        id: "first_seen_later",
        sourceJobId: "first_seen_later",
        postedAt: null,
        firstSeenAt: "2026-02-01T00:00:00.000Z",
        lastVerifiedActiveAt: "2026-03-01T00:00:00.000Z",
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "first_seen_later",
      "first_seen_earlier",
    ]);
  });

  test("continues to prefer the newer explicit posting date", () => {
    const base = createSeed().savedJobs[0]!;
    const jobs = buildDiscoveryJobs([
      {
        ...base,
        id: "posted_earlier",
        sourceJobId: "posted_earlier",
        postedAt: "2026-01-01T00:00:00.000Z",
        firstSeenAt: "2026-04-01T00:00:00.000Z",
      },
      {
        ...base,
        id: "posted_later",
        sourceJobId: "posted_later",
        postedAt: "2026-02-01T00:00:00.000Z",
        firstSeenAt: "2026-03-01T00:00:00.000Z",
      },
    ]);

    expect(jobs.map((job) => job.id)).toEqual([
      "posted_later",
      "posted_earlier",
    ]);
  });
  test("falls through to identity tie-breaks when neither listing has a usable date", () => {
    const base = createSeed().savedJobs[0]!;
    const undated = (id: string): SavedJob =>
      ({
        ...base,
        id,
        sourceJobId: id,
        title: `Role ${id}`,
        postedAt: null,
        firstSeenAt: null,
        discoveredAt: "not-a-date",
      }) as unknown as SavedJob;

    expect(
      compareDiscoveryJobs(undated("b_role"), undated("a_role")),
    ).toBeGreaterThan(0);
    expect(
      compareDiscoveryJobs(undated("a_role"), undated("b_role")),
    ).toBeLessThan(0);
  });
});

describe("shared discovery-ordering subpath", () => {
  // mulberry32: tiny deterministic PRNG so permutation runs are reproducible.
  function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test("orders the internal matching path identically to the public subpath comparator", () => {
    const base = createSeed().savedJobs[0]!;
    const detailTiers = [
      "card_only",
      "partial_detail",
      "detail_enriched",
    ] as const;
    const recommendations = [
      "strong_fit",
      "review_before_applying",
      "skip",
    ] as const;
    const candidateSet = Array.from({ length: 24 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, "0");
      return {
        ...base,
        id: `job_${String(index).padStart(2, "0")}`,
        sourceJobId: `job_${String(index).padStart(2, "0")}`,
        title: index % 6 === 0 ? `Développeur ${index}` : `Role ${index}`,
        company: index % 5 === 0 ? `Café ${index}` : `Acme ${index}`,
        detailQuality: detailTiers[index % detailTiers.length]!,
        postedAt: index % 4 === 0 ? null : `2026-08-${day}T00:00:00.000Z`,
        firstSeenAt: index % 3 === 0 ? `2026-07-${day}T00:00:00.000Z` : null,
        matchAssessment: {
          ...base.matchAssessment,
          score: [95, 90, 85, 85, 80, 70][index % 6]!,
          recommendation: recommendations[index % recommendations.length]!,
        },
      } satisfies SavedJob;
    });

    const canonical = [...candidateSet]
      .sort(compareDiscoveryJobsShared)
      .map((job) => job.id);
    expect(buildDiscoveryJobs(candidateSet).map((job) => job.id)).toEqual(
      canonical,
    );

    const random = createRandom(20260823);
    for (let shuffle = 0; shuffle < 8; shuffle += 1) {
      const permuted = [...candidateSet];
      for (let i = permuted.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [permuted[i], permuted[j]] = [permuted[j]!, permuted[i]!];
      }
      expect(buildDiscoveryJobs(permuted).map((job) => job.id)).toEqual(
        canonical,
      );
    }
  });

  test("treats partial_detail like card_only with enriched listings still ahead", () => {
    const base = createSeed().savedJobs[0]!;
    const job = (
      id: string,
      detailQuality: SavedJob["detailQuality"],
    ): SavedJob => ({
      ...base,
      id,
      sourceJobId: id,
      title: `Role ${id}`,
      postedAt: null,
      firstSeenAt: null,
      detailQuality,
      matchAssessment: {
        ...base.matchAssessment,
        score: 80,
        recommendation: "strong_fit" as const,
      },
    });

    const jobs = buildDiscoveryJobs([
      job("card_tie", "card_only"),
      job("partial_tie", "partial_detail"),
      job("enriched_first", "detail_enriched"),
    ]);

    expect(jobs.map((entry) => entry.id)).toEqual([
      "enriched_first",
      "card_tie",
      "partial_tie",
    ]);
  });
});

describe("original resume readiness", () => {
  test("prefers the saved per-job choice over the workspace default", () => {
    const seed = createSeed();
    const job = {
      ...seed.savedJobs[0]!,
      resumeApplicationMode: "tailored_per_job" as const,
    };
    const queue = buildReviewQueue([job], [], [], [], seed.profile, {
      ...seed.settings,
      resumeApplicationMode: "original_resume",
    });

    expect(queue[0]?.resumeApplicationMode).toBe("tailored_per_job");
  });

  test("requires a saved digest before exposing an original resume as application-ready", () => {
    const seed = createSeed();
    const job = seed.savedJobs[0]!;
    const withoutDigest = buildReviewQueue(
      [job],
      [],
      [],
      [],
      {
        ...seed.profile,
        baseResume: {
          ...seed.profile.baseResume,
          storagePath: "/tmp/casey.pdf",
          sha256: null,
        },
      },
      { ...seed.settings, resumeApplicationMode: "original_resume" },
    );

    expect(withoutDigest[0]).toMatchObject({
      assetStatus: "not_started",
      resumeAssetId: null,
      resumeReview: { status: "not_started" },
    });

    const withDigest = buildReviewQueue(
      [job],
      [],
      [],
      [],
      {
        ...seed.profile,
        baseResume: {
          ...seed.profile.baseResume,
          storagePath: "/tmp/casey.pdf",
          sha256: "a".repeat(64),
        },
      },
      { ...seed.settings, resumeApplicationMode: "original_resume" },
    );

    expect(withDigest[0]).toMatchObject({
      assetStatus: "ready",
      resumeAssetId: seed.profile.baseResume.id,
      resumeReview: { status: "original_resume" },
    });
  });
});
