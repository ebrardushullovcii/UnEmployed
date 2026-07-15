import { describe, expect, test } from "vitest";

import {
  DiscoveryLedgerEntrySchema,
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
  test("defaults legacy postings to card-only detail quality", () => {
    expect(JobPostingSchema.parse(postingInput).detailQuality).toBe(
      "card_only",
    );
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
      firstSeenAt: posting.discoveredAt,
      lastSeenAt: posting.discoveredAt,
      latestStatus: "enriched",
      titleTriageOutcome: "pass",
    });

    expect(posting.detailQuality).toBe("detail_enriched");
    expect(ledgerEntry.detailQuality).toBe("detail_enriched");
  });

  test("defaults legacy match assessments to review-first evidence semantics", () => {
    const assessment = MatchAssessmentSchema.parse({
      score: 80,
      reasons: ["Relevant title"],
      gaps: [],
    });

    expect(assessment.recommendation).toBe("review_before_applying");
    expect(assessment.requirements).toEqual([]);
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
