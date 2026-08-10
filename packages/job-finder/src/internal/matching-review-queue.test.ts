import { describe, expect, test } from "vitest";

import { createSeed } from "../workspace-service.test-fixtures";
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
});

describe("original resume readiness", () => {
  test("prefers the saved per-job choice over the workspace default", () => {
    const seed = createSeed();
    const job = {
      ...seed.savedJobs[0]!,
      resumeApplicationMode: "tailored_per_job" as const,
    };
    const queue = buildReviewQueue(
      [job],
      [],
      [],
      [],
      seed.profile,
      { ...seed.settings, resumeApplicationMode: "original_resume" },
    );

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
