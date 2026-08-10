import { describe, expect, test } from "vitest";

import {
  DiscoveryLedgerEntrySchema,
  DiscoveryRunSummarySchema,
  DiscoveryTargetExecutionSchema,
  DiscoveryTimingSummarySchema,
  JobPostingSchema,
  MatchAssessmentSchema,
} from "./discovery";

const postingInput = {
  source: "target_site" as const,
  sourceJobId: "job_1",
  canonicalUrl: "https://example.com/jobs/job-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Remote",
  workMode: ["remote"] as const,
  applyPath: "unknown" as const,
  easyApplyEligible: false,
  discoveredAt: "2026-07-12T10:00:00.000Z",
  salaryText: null,
  description: "Software Engineer role at Acme",
};

describe("discovery contracts", () => {
  test("defaults legacy target executions to empty fairness evidence", () => {
    const execution = DiscoveryTargetExecutionSchema.parse({
      targetId: "target_1",
      adapterKind: "auto",
      state: "completed",
    });

    expect(execution).toMatchObject({
      requestedJobBudget: null,
      jobsReviewed: 0,
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
    });
  });

  test("defaults legacy run summaries and validates persisted change and source health", () => {
    const legacy = DiscoveryRunSummarySchema.parse({});

    expect(legacy.changeDigest).toEqual({
      new: 0,
      unchanged: 0,
      changed: 0,
      reactivated: 0,
      inactive: 0,
      known: 0,
      skipped: 0,
    });
    expect(legacy.sourceHealth).toEqual([]);
    expect(legacy.warnings).toEqual([]);

    const summary = DiscoveryRunSummarySchema.parse({
      changeDigest: {
        new: 3,
        unchanged: 4,
        changed: 2,
        reactivated: 1,
        inactive: 5,
        known: 7,
        skipped: 2,
      },
      sourceHealth: [
        {
          targetId: "source_1",
          health: "warning",
          durationMs: 1_200,
          warnings: ["One listing could not be opened."],
        },
      ],
      warnings: ["One listing could not be opened."],
    });

    expect(summary.sourceHealth[0]).toMatchObject({
      targetId: "source_1",
      health: "warning",
      durationMs: 1_200,
    });
  });

  test("defaults legacy discovery timing milestones to unknown", () => {
    const timing = DiscoveryTimingSummarySchema.parse({
      totalDurationMs: 4_200,
      firstActivityMs: 0,
      longestGapMs: 2_000,
      eventCount: 3,
    });

    expect(timing.firstActivityMs).toBe(0);
    expect(timing.firstCandidateMs).toBeNull();
    expect(timing.firstDistinctUsefulJobMs).toBeNull();
  });

  test("defaults legacy postings to card-only detail quality", () => {
    expect(JobPostingSchema.parse(postingInput).detailQuality).toBe(
      "card_only",
    );
  });

  test("defaults legacy postings and ledger entries to unknown provider freshness", () => {
    expect(JobPostingSchema.parse(postingInput).providerUpdatedAt).toBeNull();
    expect(
      DiscoveryLedgerEntrySchema.parse({
        id: "ledger_legacy_freshness",
        canonicalUrl: postingInput.canonicalUrl,
        source: postingInput.source,
        sourceJobId: postingInput.sourceJobId,
        title: postingInput.title,
        company: postingInput.company,
        targetId: "target_1",
        firstSeenAt: postingInput.discoveredAt,
        lastSeenAt: postingInput.discoveredAt,
      }).providerUpdatedAt,
    ).toBeNull();
  });

  test("validates an explicit provider freshness timestamp", () => {
    const timestamp = "2026-07-12T11:00:00.000Z";
    expect(
      JobPostingSchema.parse({ ...postingInput, providerUpdatedAt: timestamp })
        .providerUpdatedAt,
    ).toBe(timestamp);
    expect(() =>
      JobPostingSchema.parse({
        ...postingInput,
        providerUpdatedAt: "yesterday",
      }),
    ).toThrow();
  });

  test("defaults legacy ledger entries to a safe missing fingerprint", () => {
    const ledgerEntry = DiscoveryLedgerEntrySchema.parse({
      id: "ledger_legacy",
      canonicalUrl: postingInput.canonicalUrl,
      source: postingInput.source,
      sourceJobId: postingInput.sourceJobId,
      title: postingInput.title,
      company: postingInput.company,
      targetId: "target_1",
      firstSeenAt: postingInput.discoveredAt,
      lastSeenAt: postingInput.discoveredAt,
    });

    expect(ledgerEntry.fingerprints).toBeNull();
  });

  test("preserves explicit detail-enriched quality on postings and ledger entries", () => {
    const posting = JobPostingSchema.parse({
      ...postingInput,
      detailQuality: "detail_enriched",
    });
    const ledgerEntry = DiscoveryLedgerEntrySchema.parse({
      id: "ledger_1",
      canonicalUrl: posting.canonicalUrl,
      source: posting.source,
      sourceJobId: posting.sourceJobId,
      title: posting.title,
      company: posting.company,
      targetId: "target_1",
      collectionMethod: "careers_page",
      detailQuality: posting.detailQuality,
      fingerprints: {
        version: 1,
        card: "v1_card",
        detail: "v1_detail",
        material: "v1_material",
      },
      firstSeenAt: posting.discoveredAt,
      lastSeenAt: posting.discoveredAt,
      latestStatus: "enriched",
      titleTriageOutcome: "pass",
    });

    expect(posting.detailQuality).toBe("detail_enriched");
    expect(ledgerEntry.detailQuality).toBe("detail_enriched");
    expect(ledgerEntry.fingerprints?.version).toBe(1);
  });

  test("defaults legacy match assessments to review-first evidence semantics", () => {
    const assessment = MatchAssessmentSchema.parse({
      score: 80,
      reasons: ["Relevant title"],
      gaps: [],
    });

    expect(assessment.recommendation).toBe("review_before_applying");
    expect(assessment.requirements).toEqual([]);
    expect(assessment.scorerVersion).toBe(1);
    expect(assessment.contextFingerprint).toBeNull();
    expect(assessment.postingFingerprint).toBeNull();
    expect(assessment.compensationFit).toMatchObject({
      state: "unknown",
      confidence: "unavailable",
      minimumSalaryUsd: null,
      listingMinimumAnnualUsd: null,
    });
    expect(assessment.dimensions).toMatchObject({
      roleSuitability: { state: "unknown", evidence: [] },
      preferenceAlignment: { state: "unknown", evidence: [] },
      applicationEffort: { level: "unknown", evidence: [] },
      evidenceConfidence: {
        level: "unavailable",
        evidence: [],
        supportedCount: 0,
        partialCount: 0,
        missingCount: 0,
        unknownCount: 0,
        conflictCount: 0,
      },
    });
  });

  test("validates versioned explicit compensation fit evidence", () => {
    const assessment = MatchAssessmentSchema.parse({
      scorerVersion: 2,
      score: 68,
      reasons: [],
      gaps: ["Compensation is below the saved salary minimum."],
      compensationFit: {
        state: "below_minimum",
        confidence: "high",
        minimumSalaryUsd: 120_000,
        listingMinimumAnnualUsd: 95_000,
        listingCurrency: "USD",
        explanation: "The listing minimum is below the saved USD minimum.",
      },
    });

    expect(assessment.scorerVersion).toBe(2);
    expect(assessment.compensationFit.state).toBe("below_minimum");
    expect(assessment.compensationFit.listingMinimumAnnualUsd).toBe(95_000);
  });

  test("validates bounded explainable match dimensions", () => {
    const dimensions = {
      roleSuitability: {
        state: "exact" as const,
        explanation: "The listing title directly matches a target role.",
        evidence: [
          {
            source: "listing" as const,
            label: "Listing title",
            detail: "Senior Product Designer",
          },
        ],
      },
      preferenceAlignment: {
        state: "mixed" as const,
        explanation: "Location aligns while work mode conflicts.",
        evidence: [],
      },
      applicationEffort: {
        level: "low" as const,
        explanation: "An in-platform application path is available.",
        evidence: [],
      },
      evidenceConfidence: {
        level: "high" as const,
        explanation: "Most extracted requirements have explicit evidence.",
        evidence: [],
        supportedCount: 3,
        partialCount: 0,
        missingCount: 1,
        unknownCount: 0,
        conflictCount: 0,
      },
    };
    const assessment = MatchAssessmentSchema.parse({
      scorerVersion: 3,
      score: 82,
      dimensions,
    });

    expect(assessment.dimensions).toEqual(dimensions);
    expect(
      MatchAssessmentSchema.safeParse({
        scorerVersion: 3,
        score: 82,
        dimensions: {
          ...dimensions,
          roleSuitability: {
            ...dimensions.roleSuitability,
            evidence: Array.from({ length: 5 }, (_, index) => ({
              source: "derived" as const,
              label: `Evidence ${index}`,
              detail: "Bounded diagnostic evidence.",
            })),
          },
        },
      }).success,
    ).toBe(false);
  });

  test("validates requirement evidence and its resume source", () => {
    const assessment = MatchAssessmentSchema.parse({
      score: 74,
      reasons: [],
      gaps: ["FastAPI is not present in the resume."],
      recommendation: "review_before_applying",
      recommendationRationale: "FastAPI needs explicit evidence.",
      requirements: [
        {
          id: "requirement_skill_fastapi",
          category: "skill",
          label: "FastAPI",
          importance: "required",
          status: "missing",
          jobEvidence: "You must have production experience with FastAPI.",
          resumeEvidence: [],
          explanation: "No explicit FastAPI evidence was found.",
        },
      ],
    });

    expect(assessment.requirements[0]).toMatchObject({
      label: "FastAPI",
      importance: "required",
      status: "missing",
    });
  });
});
