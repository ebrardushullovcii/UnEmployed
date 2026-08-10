import { describe, expect, it } from "vitest";

import { MatchAssessmentChangeAuditSchema } from "./discovery";

const metadata = {
  scorerVersion: 4,
  contextFingerprint: "match_context_v4_candidate",
  postingFingerprint: "match_posting_v4_listing",
};

describe("MatchAssessmentChangeAuditSchema", () => {
  it("validates a persisted rank and assessment change payload", () => {
    const audit = MatchAssessmentChangeAuditSchema.parse({
      recordedAt: "2026-08-09T10:05:00.000Z",
      status: "assessment_changed",
      causeConfidence: "known",
      rankingSignalChanged: true,
      summary: "The fit score and visible result rank changed.",
      reasons: ["The listing evidence changed."],
      previousMetadata: metadata,
      currentMetadata: {
        ...metadata,
        postingFingerprint: "match_posting_v4_updated",
      },
      inputChanges: [
        {
          code: "listing_evidence_changed",
          scope: "listing_evidence",
          certainty: "known",
          title: "Listing evidence changed",
          detail: "The listing evidence changed.",
          previousValue: metadata.postingFingerprint,
          currentValue: "match_posting_v4_updated",
        },
      ],
      previousRank: 5,
      currentRank: 2,
      outputChanges: [
        {
          code: "rank_position_changed",
          subject: "rank_position",
          title: "Result rank changed",
          detail: "The visible result rank changed from #5 to #2.",
          previousValue: "5",
          currentValue: "2",
        },
      ],
    });

    expect(audit.version).toBe(1);
    expect(audit.currentRank).toBe(2);
  });

  it("rejects unsupported change codes and invalid ranks", () => {
    const result = MatchAssessmentChangeAuditSchema.safeParse({
      status: "assessment_changed",
      causeConfidence: "known",
      rankingSignalChanged: true,
      summary: "The result changed.",
      previousMetadata: metadata,
      currentMetadata: metadata,
      previousRank: 0,
      currentRank: 1,
      outputChanges: [
        {
          code: "invented_change",
          subject: "score",
          title: "Changed",
          detail: "Changed.",
          previousValue: "1",
          currentValue: "2",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
