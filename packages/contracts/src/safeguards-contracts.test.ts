import { describe, expect, it } from "vitest";

import {
  JobFinderIntelligenceSafeguardsSchema,
  SafeguardBlockerViewSchema,
  SafeguardDismissalSchema,
  SafeguardMutationInputSchema,
  SafeguardsOverviewSchema,
  safeguardEntryKindValues,
  safeguardMutationForbiddenAuthorityValues,
} from "./job-finder-intelligence";

const now = "2026-08-15T10:00:00.000Z";

function validCapEvidence() {
  return {
    type: "apply_company_application_evidence" as const,
    evidence: [
      {
        applicationRecordId: "application_1",
        companyId: "company_acme",
        appliedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
    config: {
      companyId: "company_acme",
      maxApplicationsPerWindow: 3,
      windowDays: 7,
      windowStartedAt: "2026-08-01T00:00:00.000Z",
      explanation: "Per-company weekly application cap.",
      recoveryGuidance: "Wait for the window to roll over.",
    },
  };
}

describe("high-volume safeguard mutation inputs", () => {
  it("accepts every typed local mutation kind", () => {
    const mutations = [
      validCapEvidence(),
      {
        type: "record_simultaneous_application_conflict" as const,
        conflictId: "conflict_1",
        applicationRecordId: "application_a",
        conflictingApplicationRecordId: "application_b",
        explanation: "Overlapping applications.",
        recoveryGuidance: "Review and keep one.",
      },
      {
        type: "resolve_simultaneous_application_conflict" as const,
        conflictId: "conflict_1",
      },
      {
        type: "record_listing_signal" as const,
        signalId: "signal_1",
        jobId: "job_1",
        signal: "suspicious" as const,
        detail: null,
        detectedAt: now,
        confidence: 0.9,
        provenance: "provider" as const,
        explanation: "Provider reported the listing state.",
        recoveryGuidance: "Re-verify the listing.",
      },
      {
        type: "record_abnormal_failure_evidence" as const,
        pauseId: "pause_1",
        windowStartedAt: "2026-08-01T00:00:00.000Z",
        evidence: [{ attemptId: "attempt_1", failed: true, occurredAt: now }],
        config: {
          windowDays: 7,
          failureRateThresholdPercent: 40,
          minimumSample: 5,
          explanation: "Elevated failure rate.",
          recoveryGuidance: "Inspect evidence before resuming.",
        },
      },
      {
        type: "prepare_batch_sample_review" as const,
        reviewId: "review_1",
        batchId: "batch_1",
        prepared: [{ id: "item_1" }, { id: "item_2" }],
        requiredSampleRatio: 0.2,
        explanation: "Sample review before proceeding.",
        recoveryGuidance: "Review the sample.",
      },
      {
        type: "update_batch_sample_review" as const,
        reviewId: "review_1",
        reviewedCount: 1,
        reviewCompleted: false,
      },
      {
        type: "record_contradictory_answer_detection" as const,
        detectionId: "detection_1",
        questionA: "How many years?",
        questionB: "Experience years?",
        answerA: "5",
        answerB: "2",
        contradictionScore: 0.9,
        detectedAt: now,
        explanation: "Answers conflict.",
        recoveryGuidance: "Ask the user.",
      },
      {
        type: "resolve_contradictory_answer_detection" as const,
        detectionId: "detection_1",
      },
      {
        type: "dismiss_contradictory_answer_detection" as const,
        detectionId: "detection_1",
      },
      {
        type: "dismiss_safeguard_entry" as const,
        kind: "listing_signal",
        referenceId: "signal_1",
        reason: "rechecked",
        note: "Re-verified.",
      },
      {
        type: "restore_safeguard_entry" as const,
        dismissalId: "dismissal_1",
      },
    ];

    for (const mutation of mutations) {
      const parsed = SafeguardMutationInputSchema.safeParse(mutation);
      expect(parsed.success, JSON.stringify(mutation)).toBe(true);
    }
  });

  it("rejects unknown mutation kinds", () => {
    expect(
      SafeguardMutationInputSchema.safeParse({
        type: "grant_final_submit",
      }).success,
    ).toBe(false);
  });

  it.each([...safeguardMutationForbiddenAuthorityValues])(
    "rejects smuggled %s authority keys",
    (kind) => {
      expect(
        SafeguardMutationInputSchema.safeParse({
          ...validCapEvidence(),
          [kind]: true,
        }).success,
      ).toBe(false);
      expect(
        SafeguardMutationInputSchema.safeParse({
          ...validCapEvidence(),
          submitAuthorized: true,
        }).success,
      ).toBe(false);
    },
  );

  it("keeps submitAuthorized structurally false across every mutation kind", () => {
    for (const mutation of [
      validCapEvidence(),
      {
        type: "dismiss_safeguard_entry" as const,
        kind: "company_cap_limit",
        referenceId: "cap_1",
        reason: "user_resolved" as const,
      },
    ]) {
      const serialized = JSON.stringify(mutation);
      expect(serialized).not.toContain("submitAuthorized");
      expect(serialized).not.toContain("accountCreationAuthorized");
      expect(serialized).not.toContain("credentials");
    }
  });

  it("validates listing signal provenance and confidence bounds", () => {
    expect(
      SafeguardMutationInputSchema.safeParse({
        type: "record_listing_signal",
        signalId: "signal_1",
        jobId: "job_1",
        signal: "stale",
        detail: null,
        detectedAt: now,
        confidence: 1.5,
        provenance: "provider",
        explanation: "Provider reported the listing state.",
        recoveryGuidance: "Re-verify the listing.",
      }).success,
    ).toBe(false);

    expect(
      SafeguardMutationInputSchema.safeParse({
        type: "record_listing_signal",
        signalId: "signal_1",
        jobId: "job_1",
        signal: "stale",
        detail: null,
        detectedAt: now,
        confidence: 0.5,
        provenance: "unknown_source",
        explanation: "Provider reported the listing state.",
        recoveryGuidance: "Re-verify the listing.",
      }).success,
    ).toBe(false);
  });

  it("rejects evidence with malformed timestamps or empty ids", () => {
    expect(
      SafeguardMutationInputSchema.safeParse({
        ...validCapEvidence(),
        evidence: [{ applicationRecordId: "", companyId: "c", appliedAt: now }],
      }).success,
    ).toBe(false);
    expect(
      SafeguardMutationInputSchema.safeParse({
        ...validCapEvidence(),
        evidence: [
          { applicationRecordId: "a", companyId: "c", appliedAt: "yesterday" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("safeguard dismissal records", () => {
  it("records a reversible dismissal with an exact reference", () => {
    const dismissal = SafeguardDismissalSchema.parse({
      id: "dismissal_1",
      kind: "listing_signal",
      referenceId: "signal_1",
      reason: "rechecked",
      note: "Re-verified the listing.",
      dismissedAt: now,
    });

    expect(dismissal.kind).toBe("listing_signal");
    expect(dismissal.reason).toBe("rechecked");
    expect(dismissal.note).toBe("Re-verified the listing.");
  });

  it("rejects unknown kinds, reasons, and authority-carrying keys", () => {
    expect(
      SafeguardDismissalSchema.safeParse({
        id: "dismissal_1",
        kind: "final_submit",
        referenceId: "signal_1",
        reason: "rechecked",
        dismissedAt: now,
      }).success,
    ).toBe(false);

    expect(
      SafeguardDismissalSchema.safeParse({
        id: "dismissal_1",
        kind: "listing_signal",
        referenceId: "signal_1",
        reason: "because_i_say_so",
        dismissedAt: now,
      }).success,
    ).toBe(false);

    expect(
      SafeguardDismissalSchema.safeParse({
        id: "dismissal_1",
        kind: "listing_signal",
        referenceId: "signal_1",
        reason: "rechecked",
        dismissedAt: now,
        submitAuthorized: true,
      }).success,
    ).toBe(false);
  });

  it("defaults the dismissal collection to empty inside safeguards state", () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({});
    expect(safeguards.safeguardDismissals).toEqual([]);
    expect(safeguardEntryKindValues).toContain("company_cap_limit");
  });
});

describe("safeguards overview projection", () => {
  it("validates counts and blockers with advisory contradictions", () => {
    const overview = SafeguardsOverviewSchema.parse({
      generatedAt: now,
      highestPriorityBlocker: {
        priority: 3,
        kind: "listing_signal",
        id: "signal_1",
        severity: "blocker",
        explanation: "Listing closed.",
        recoveryGuidance: "Re-verify the listing.",
      },
      blockers: [
        {
          priority: 6,
          kind: "contradictory_answer",
          id: "detection_1",
          severity: "advisory",
          explanation: "Answers conflict.",
          recoveryGuidance: "Ask the user.",
        },
      ],
      counts: {
        caps: 1,
        activeCaps: 1,
        conflicts: 0,
        activeConflicts: 0,
        signals: 2,
        activeSignals: 1,
        pauses: 0,
        activePauses: 0,
        reviews: 0,
        pendingReviews: 0,
        contradictions: 1,
        activeContradictions: 1,
        dismissals: 0,
      },
    });

    expect(overview.counts.activeCaps).toBe(1);
    expect(overview.blockers[0]?.severity).toBe("advisory");
    expect(overview.highestPriorityBlocker?.kind).toBe("listing_signal");
  });

  it("rejects blocker views with impossible priorities or unknown kinds", () => {
    expect(
      SafeguardBlockerViewSchema.safeParse({
        priority: 9,
        kind: "listing_signal",
        id: "signal_1",
        severity: "blocker",
        explanation: "Listing closed.",
        recoveryGuidance: "Re-verify the listing.",
      }).success,
    ).toBe(false);

    expect(
      SafeguardBlockerViewSchema.safeParse({
        priority: 3,
        kind: "final_submit",
        id: "signal_1",
        severity: "blocker",
        explanation: "Listing closed.",
        recoveryGuidance: "Re-verify the listing.",
      }).success,
    ).toBe(false);
  });
});
