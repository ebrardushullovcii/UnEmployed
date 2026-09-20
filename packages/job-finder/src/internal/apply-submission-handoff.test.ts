import type { ApplyAgentResult } from "@unemployed/browser-agent";

import type { ApplicationSubmissionRuntimeInput } from "./application-submission-runtime";
import {
  ApplicationAuthorityEnvelopeSchema,
  serializeApplicationAuthorityDecisionPolicyForDigest,
} from "@unemployed/contracts";
import { createHash } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import {
  decideApplySubmissionHandoff,
  deriveApplySubmissionCapacity,
  submitPreparedApplication,
  describeSubmissionOutcome,
  enforceResolvedApplyAuthorityResult,
  sendPreparedApplication,
} from "./apply-submission-handoff";

/**
 * What happens to a filled-in application, mode by mode.
 *
 * The one rule underneath all three: filling a form in and sending it are
 * separate acts. Preparation never sends; sending is one recorded, unrepeatable
 * attempt whose outcome only the employer's site can settle.
 */

const NOW = "2026-09-14T10:00:00.000Z";
const LATER = "2026-09-20T10:00:00.000Z";
const EARLIER = "2026-09-01T10:00:00.000Z";

const answerPolicy = {
  approvedAnswerSnapshot: { revision: 3, digest: "b".repeat(64) },
  unknownRequiredQuestion: "pause_for_user" as const,
  unknownEligibility: "pause_for_user" as const,
  unknownLegalRequirement: "pause_for_user" as const,
  preApprovedAttestationKinds: [],
  salaryDisclosure: "pause_for_user" as const,
};

const stopConditions = {
  unavailableCredentials: "pause_for_user" as const,
  loginRequired: "pause_for_user" as const,
  mfaRequired: "pause_for_user" as const,
  captcha: "pause_for_user" as const,
  antiBot: "pause_for_user" as const,
  accountCreation: "pause_for_user" as const,
  staleObservation: "pause_for_user" as const,
  ambiguousFinalControl: "pause_for_user" as const,
  originDrift: "pause_for_user" as const,
  outcomeUncertain: "stop_no_retry" as const,
};

function envelope(mode: "confirm_before_submit" | "autonomous_submit") {
  const content = { version: 1 as const, answerPolicy, stopConditions };
  return ApplicationAuthorityEnvelopeSchema.parse({
    id: "authority_test",
    mode,
    status: "active",
    revision: 4,
    scope: { campaignId: null, jobIds: ["job_test"] },
    maxApplicationsPerRun: 10,
    maxApplicationsPerLocalDay: 20,
    intermediateMutationsAuthorized: false,
    accountCreationAuthorized: false,
    allowedResumeSha256: ["a".repeat(64)],
    allowedOrigins: ["https://apply.example.test"],
    createdAt: EARLIER,
    expiresAt: LATER,
    revokedAt: null,
    decisionPolicy: {
      ...content,
      revision: 2,
      digest: createHash("sha256")
        .update(serializeApplicationAuthorityDecisionPolicyForDigest(content))
        .digest("hex"),
    },
  });
}

function result(overrides: Partial<ApplyAgentResult> = {}): ApplyAgentResult {
  return {
    outcome: "ready_to_send",
    reason: "Filled in and ready.",
    steps: 9,
    finalUrl: "https://apply.example.test/form",
    filled: [],
    attachments: [],
    pauses: [],
    notes: [],
    timeline: [],
    modelTurns: 0,
    readyToSend: { actionRef: "a3", actionLabel: "Submit application" },
    ...overrides,
  };
}

describe("what happens to a filled-in application", () => {
  test("fill-in-only stops with the form complete and nothing sent", () => {
    const handoff = decideApplySubmissionHandoff({
      result: result(),
      mode: "prepare_only",
      envelope: null,
      siteLabel: "the careers site",
    });
    expect(handoff.status).toBe("not_ready");
    if (handoff.status === "not_ready") {
      expect(handoff.reason).toContain("nothing was sent");
    }
  });

  test("confirm-first hands it to the person with the send button already found", () => {
    const handoff = decideApplySubmissionHandoff({
      result: result(),
      mode: "confirm_before_submit",
      envelope: envelope("confirm_before_submit"),
      siteLabel: "the careers site",
    });
    expect(handoff.status).toBe("awaiting_your_review");
    if (handoff.status === "awaiting_your_review") {
      expect(handoff.finalAction.actionLabel).toBe("Submit application");
      expect(handoff.reason).toContain("Look it over");
    }
  });

  test("sending on its own hands it straight to the submission path", () => {
    const handoff = decideApplySubmissionHandoff({
      result: result(),
      mode: "autonomous_submit",
      envelope: envelope("autonomous_submit"),
      siteLabel: "the careers site",
    });
    expect(handoff.status).toBe("send_now");
  });

  test("anything still waiting on the person is never sent, in any mode", () => {
    for (const mode of [
      "prepare_only",
      "confirm_before_submit",
      "autonomous_submit",
    ] as const) {
      const handoff = decideApplySubmissionHandoff({
        result: result({
          pauses: [
            {
              code: "question_needs_you",
              summary: 'Job Finder stopped on "Expected salary".',
              question: null,
              blocker: null,
            },
          ],
        }),
        mode,
        envelope: mode === "prepare_only" ? null : envelope(mode),
        siteLabel: "the careers site",
      });
      expect(handoff.status).toBe("not_ready");
      if (handoff.status === "not_ready") {
        expect(handoff.reason).toContain("Expected salary");
      }
    }
  });

  test("a form that never became complete is not sent even with full permission", () => {
    const handoff = decideApplySubmissionHandoff({
      result: result({ readyToSend: null, outcome: "prepared" }),
      mode: "autonomous_submit",
      envelope: envelope("autonomous_submit"),
      siteLabel: "the careers site",
    });
    expect(handoff.status).toBe("not_ready");
  });
});

describe("handing one application to the submission path", () => {
  test("carries the exact permission, its policy, and the approved answers", async () => {
    const runSubmission = vi.fn((input: ApplicationSubmissionRuntimeInput) =>
      Promise.resolve({
        input,
        status: "outcome_uncertain" as const,
        decision: null,
        preflight: null,
        idempotency: null,
        executionGrant: null,
        outcome: null,
      } as never),
    );

    const active = envelope("autonomous_submit");
    await sendPreparedApplication(
      {
        repository: {} as never,
        browserRuntime: {} as never,
        source: "target_site",
        envelope: active,
        lineage: {
          runId: "run_1",
          jobId: "job_test",
          resultId: "result_1",
          applicationRecordId: "application_1",
          campaignId: null,
        },
        capacity: { remainingRunCapacity: 3, remainingDailyCapacity: 9 },
        resumeBytes: new Uint8Array([1, 2, 3]),
        idempotencyKey: "idempotency_1",
        preflightId: "preflight_1",
        now: NOW,
      },
      runSubmission,
    );

    expect(runSubmission).toHaveBeenCalledTimes(1);
    expect(runSubmission.mock.calls[0]?.[0]).toMatchObject({
      savedMode: "autonomous_submit",
      authorityEnvelopeId: active.id,
      authorityRevision: 4,
      idempotencyKey: "idempotency_1",
      answers: { revision: 3, digest: "b".repeat(64) },
      currentPolicyFacts: {
        policy: { version: 1, revision: 2 },
        mandatoryStops: [],
      },
    });
  });
});

describe("what the person is told after an attempt", () => {
  test("an uncertain outcome is never offered a retry", () => {
    const told = describeSubmissionOutcome({
      result: { status: "outcome_uncertain" } as never,
      siteLabel: "Northwind careers",
    });
    expect(told.summary).toBe("Sent — check it arrived");
    expect(told.detail).toContain("will not send it again");
    expect(told.nextActionLabel).toBe("Check the site and confirm");
    expect(told.detail).not.toMatch(/try again|retry/iu);
  });

  test("nothing sent says so plainly", () => {
    const told = describeSubmissionOutcome({
      result: { status: "recorded_not_submitted" } as never,
      siteLabel: "Northwind careers",
    });
    expect(told.summary).toBe("Not sent");
    expect(told.detail).toContain("Nothing was sent");
  });
});

describe("the safety net on a preparation result", () => {
  test("a preparation that claims it sent something is refused, in every mode", () => {
    for (const mode of [
      "prepare_only",
      "confirm_before_submit",
      "autonomous_submit",
    ] as const) {
      expect(() =>
        enforceResolvedApplyAuthorityResult(
          { mode },
          {
            state: "submitted",
            summary: "Sent",
            detail: "Sent",
            submittedAt: NOW,
            outcome: "submitted",
            questions: [],
            blocker: null,
            consentDecisions: [],
            replay: {},
            visualEvidence: [],
            visualObservationSets: [],
            visualCheckpoints: [],
            nextActionLabel: null,
            checkpoints: [],
          } as never,
        ),
      ).toThrow(/Preparation never sends anything/iu);
    }
  });
});

describe("sending, gathered at the moment it is asked", () => {
  const lineage = {
    runId: "run_1",
    jobId: "job_test",
    resultId: "result_1",
    applicationRecordId: "application_1",
    campaignId: null,
  };

  function repositoryWith(
    outcomes: readonly { runId: string; attemptedAt: string }[],
  ) {
    return {
      listSubmissionOutcomeRecords: () => Promise.resolve(outcomes),
    } as unknown as Parameters<
      typeof submitPreparedApplication
    >[0]["repository"];
  }

  test("one application uses one key, so a second press cannot send a second", async () => {
    const runSubmission = vi.fn((input: ApplicationSubmissionRuntimeInput) =>
      Promise.resolve({ status: "outcome_uncertain", input } as never),
    );
    const send = () =>
      submitPreparedApplication({
        repository: repositoryWith([]),
        browserRuntime: {} as never,
        source: "target_site",
        envelope: envelope("autonomous_submit"),
        lineage,
        loadResumeBytes: () => Promise.resolve(new Uint8Array([1])),
        now: NOW,
        runSubmission,
      });

    await send();
    await send();

    const [first, second] = runSubmission.mock.calls.map((call) => call[0]);
    expect(first?.idempotencyKey).toBe("submission_run_1_job_test_result_1");
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
    expect(first?.preflightId).toBe("preflight_run_1_job_test_result_1");
  });

  test("the allowance counts attempts that happened, per run and per day", async () => {
    const runSubmission = vi.fn((input: ApplicationSubmissionRuntimeInput) =>
      Promise.resolve({ status: "outcome_uncertain", input } as never),
    );

    await submitPreparedApplication({
      repository: repositoryWith([
        { runId: "run_1", attemptedAt: NOW },
        { runId: "run_other", attemptedAt: NOW },
        // An earlier day still counts against this run's own allowance, which
        // is per run rather than per day.
        { runId: "run_1", attemptedAt: "2026-09-01T10:00:00.000Z" },
      ]),
      browserRuntime: {} as never,
      source: "target_site",
      envelope: envelope("autonomous_submit"),
      lineage,
      loadResumeBytes: () => Promise.resolve(new Uint8Array([1])),
      now: NOW,
      runSubmission,
    });

    expect(runSubmission.mock.calls[0]?.[0]?.capacity).toEqual({
      // 10 per run, two already attempted in this run whenever they happened.
      remainingRunCapacity: 8,
      // 20 per day, two attempted today; yesterday's does not count.
      remainingDailyCapacity: 18,
    });
  });

  test("a spent allowance is zero rather than a negative number", () => {
    const spent = deriveApplySubmissionCapacity({
      envelope: envelope("autonomous_submit"),
      outcomes: Array.from({ length: 25 }, () => ({
        runId: "run_1",
        attemptedAt: NOW,
      })),
      runId: "run_1",
      now: NOW,
    });
    expect(spent).toEqual({
      remainingRunCapacity: 0,
      remainingDailyCapacity: 0,
    });
  });
});

describe("what the person is told when the page showed a confirmation", () => {
  test("counts the employer's receipt confirmation as submitted", () => {
    const told = describeSubmissionOutcome({
      result: { status: "submitted" } as never,
      siteLabel: "Northwind careers",
    });
    expect(told.summary).toBe("Application submitted");
    expect(told.detail).toContain("confirmed that it received");
    expect(told.detail).toContain("will not send it again");
    expect(told.nextActionLabel).toBe("View application");
  });
});
