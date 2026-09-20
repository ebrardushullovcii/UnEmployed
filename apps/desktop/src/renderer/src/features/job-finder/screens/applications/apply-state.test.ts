import { describe, expect, it } from "vitest";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  applyActionLabel,
  applyAllActionLabel,
  OPEN_THE_BROWSER_ACTION,
  resolveApplyStatePresentation,
} from "./apply-state";

type ApplyResult = JobFinderWorkspaceSnapshot["applyJobResults"][number];

function buildResult(overrides: Partial<ApplyResult>): ApplyResult {
  return {
    id: "result_1",
    runId: "run_1",
    jobId: "job_1",
    applicationRecordId: "application_1",
    queuePosition: 0,
    state: "awaiting_review",
    summary: null,
    detail: null,
    startedAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:01:00.000Z",
    completedAt: "2026-09-14T10:01:00.000Z",
    blockerReason: null,
    blockerSummary: null,
    listingSignalEvidence: null,
    visualObservationSets: [],
    visualCheckpoints: [],
    latestQuestionCount: 0,
    latestAnswerCount: 0,
    pendingConsentRequestCount: 0,
    artifactCount: 0,
    latestCheckpointId: null,
    privacyReceipt: null,
    reviewCard: null,
    ...overrides,
  } as unknown as ApplyResult;
}

describe("the five apply states (ADR 0022)", () => {
  it("gives each state one title and at most one button", () => {
    const cases: Array<{
      expected: { kind: string; title: string; actionLabel: string | null };
      result: ApplyResult;
    }> = [
      {
        expected: {
          kind: "filling_in",
          title: "Filling in (3 min)",
          actionLabel: null,
        },
        result: buildResult({
          state: "filling",
          startedAt: "2026-09-14T10:00:00.000Z",
        }),
      },
      {
        expected: {
          kind: "ready_to_send",
          title: "Ready to send",
          actionLabel: OPEN_THE_BROWSER_ACTION,
        },
        result: buildResult({ state: "awaiting_review" }),
      },
      {
        expected: { kind: "applied", title: "Applied", actionLabel: null },
        result: buildResult({ state: "submitted" }),
      },
      {
        expected: {
          kind: "needs_you",
          title: "Needs you",
          actionLabel: OPEN_THE_BROWSER_ACTION,
        },
        result: buildResult({
          state: "blocked",
          blockerReason: "auth_required",
          blockerSummary: "The site wants you signed in first.",
        }),
      },
      {
        expected: {
          kind: "could_not_apply",
          title: "Could not apply",
          actionLabel: "Try again",
        },
        result: buildResult({
          state: "failed",
          summary: "The employer site timed out before the form loaded.",
        }),
      },
      {
        // A stop a fresh run cannot change never offers a retry.
        expected: {
          kind: "could_not_apply",
          title: "Could not apply",
          actionLabel: OPEN_THE_BROWSER_ACTION,
        },
        result: buildResult({
          state: "failed",
          summary: "This listing has no apply link Job Finder can use.",
        }),
      },
    ];

    for (const testCase of cases) {
      const presentation = resolveApplyStatePresentation({
        mode: "fill_only",
        now: Date.parse("2026-09-14T10:03:00.000Z"),
        result: testCase.result,
      });

      expect(presentation.kind, testCase.expected.kind).toBe(
        testCase.expected.kind,
      );
      expect(presentation.title).toBe(testCase.expected.title);
      expect(presentation.actionLabel).toBe(testCase.expected.actionLabel);
      if (testCase.expected.actionLabel === null) {
        expect(presentation.action).toBe("none");
      }
    }
  });

  it("never calls an unverified outcome Applied", () => {
    const presentation = resolveApplyStatePresentation({
      mode: "apply_for_me",
      result: buildResult({
        state: "blocked",
        blockerReason: "submission_outcome_uncertain",
        privacyReceipt: {
          submissionOutcome: { outcome: "outcome_uncertain" },
        } as unknown as ApplyResult["privacyReceipt"],
      }),
    });

    expect(presentation.kind).not.toBe("applied");
  });

  it("says how many questions are left for the person", () => {
    expect(
      resolveApplyStatePresentation({
        mode: "fill_only",
        pendingQuestionCount: 1,
        result: buildResult({ state: "awaiting_review" }),
      }).questionsLeftLabel,
    ).toBe("1 question left for you");
    expect(
      resolveApplyStatePresentation({
        mode: "fill_only",
        pendingQuestionCount: 3,
        result: buildResult({ state: "awaiting_review" }),
      }).questionsLeftLabel,
    ).toBe("3 questions left for you");
  });

  it("names the one control after the mode", () => {
    expect(applyActionLabel("fill_only")).toBe("Apply");
    expect(applyActionLabel("apply_for_me")).toBe("Apply");
    expect(applyAllActionLabel("fill_only")).toBe("Fill in all shortlisted");
    expect(applyAllActionLabel("apply_for_me")).toBe("Apply to all shortlisted");
  });

  it("keeps the banned jargon out of every state sentence", () => {
    const sentences = [
      buildResult({ state: "awaiting_review" }),
      buildResult({ state: "failed", summary: "The site timed out." }),
      buildResult({ state: "blocked", blockerReason: "auth_required" }),
    ].map(
      (result) =>
        resolveApplyStatePresentation({ mode: "apply_for_me", result })
          .sentence ?? "",
    );

    for (const sentence of sentences) {
      expect(sentence).not.toMatch(
        /form state|safe advance|authority envelope|configured model|prepare-only|verified writes|submit click/i,
      );
    }
  });
});
