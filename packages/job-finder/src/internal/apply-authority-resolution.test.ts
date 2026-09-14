import {
  ApplicationAuthorityEnvelopeSchema,
  serializeApplicationAuthorityDecisionPolicyForDigest,
} from "@unemployed/contracts";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";

import {
  PREPARE_ONLY_AUTHORITY,
  resolveApplyAuthority,
} from "./apply-authority-resolution";

/**
 * What one application may do.
 *
 * Every case here is the same question asked differently: does the document
 * the person saved cover this exact application? Anything short of yes fills
 * the form in and stops, which is never a failure — it is the boundary they
 * set doing its job.
 */

const NOW = "2026-09-14T10:00:00.000Z";
const LATER = "2026-09-20T10:00:00.000Z";
const EARLIER = "2026-09-01T10:00:00.000Z";
const RESUME_DIGEST = "a".repeat(64);
const ORIGIN = "https://apply.example.test";

const answerPolicy = {
  approvedAnswerSnapshot: { revision: 1, digest: "b".repeat(64) },
  unknownRequiredQuestion: "pause_for_user" as const,
  unknownEligibility: "pause_for_user" as const,
  unknownLegalRequirement: "pause_for_user" as const,
  preApprovedAttestationKinds: ["truthfulness_certification" as const],
  salaryDisclosure: "answer_from_profile" as const,
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

function envelope(overrides: Record<string, unknown> = {}) {
  const content = { version: 1 as const, answerPolicy, stopConditions };
  return ApplicationAuthorityEnvelopeSchema.parse({
    id: "authority_test",
    mode: "autonomous_submit",
    status: "active",
    revision: 1,
    scope: { campaignId: null, jobIds: ["job_test"] },
    maxApplicationsPerRun: 10,
    maxApplicationsPerLocalDay: 20,
    intermediateMutationsAuthorized: false,
    accountCreationAuthorized: false,
    allowedResumeSha256: [RESUME_DIGEST],
    allowedOrigins: [`${ORIGIN}/`],
    createdAt: EARLIER,
    expiresAt: LATER,
    revokedAt: null,
    decisionPolicy: {
      ...content,
      revision: 1,
      digest: createHash("sha256")
        .update(serializeApplicationAuthorityDecisionPolicyForDigest(content))
        .digest("hex"),
    },
    ...overrides,
  });
}

function resolve(overrides: Parameters<typeof resolveApplyAuthority>[0] | null = null) {
  return resolveApplyAuthority(
    overrides ?? {
      envelope: envelope(),
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    },
  );
}

describe("what one application may do", () => {
  test("no saved permission means fill it in and stop", () => {
    const result = resolveApplyAuthority({
      envelope: null,
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.authority).toEqual(PREPARE_ONLY_AUTHORITY);
    expect(result.narrowedBecause).toBeNull();
  });

  test("a permission that covers this application carries its exact choices", () => {
    const result = resolve();
    expect(result.narrowedBecause).toBeNull();
    expect(result.authority).toEqual({
      mode: "autonomous_submit",
      submitAuthorized: true,
      preApprovedAttestationKinds: ["truthfulness_certification"],
      salaryDisclosure: "answer_from_profile",
      allowedOrigins: [ORIGIN],
    });
  });

  test("confirm-first never authorizes the run itself to send", () => {
    const result = resolve({
      envelope: envelope({ mode: "confirm_before_submit" }),
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.authority.mode).toBe("confirm_before_submit");
    expect(result.authority.submitAuthorized).toBe(false);
  });

  test("a permission that has run out stops sending, and says so", () => {
    const result = resolve({
      envelope: envelope({ status: "expired" }),
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: LATER,
    });
    expect(result.authority.submitAuthorized).toBe(false);
    expect(result.narrowedBecause).toContain("run out");
  });

  test("a permission the person turned off stops sending, and says so", () => {
    const result = resolve({
      envelope: envelope({ status: "revoked", revokedAt: NOW }),
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.narrowedBecause).toContain("turned off");
  });

  test("a job the permission does not name is filled in and left", () => {
    const result = resolve({
      envelope: envelope(),
      job: { id: "job_elsewhere" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.authority).toEqual(PREPARE_ONLY_AUTHORITY);
    expect(result.narrowedBecause).toContain("outside what you allowed");
  });

  test("a whole campaign can be covered instead of one job at a time", () => {
    const result = resolve({
      envelope: envelope({
        scope: { campaignId: "campaign_1", jobIds: [] },
      }),
      job: { id: "job_test", campaignId: "campaign_1" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.authority.submitAuthorized).toBe(true);
  });

  test("a resume the person did not approve for sending is filled in and left", () => {
    const result = resolve({
      envelope: envelope(),
      job: { id: "job_test" },
      resumeSha256: "c".repeat(64),
      applicationUrl: `${ORIGIN}/jobs/1/apply`,
      now: NOW,
    });
    expect(result.authority).toEqual(PREPARE_ONLY_AUTHORITY);
    expect(result.narrowedBecause).toContain("not one you approved");
  });

  test("an application on another site is filled in and left", () => {
    const result = resolve({
      envelope: envelope(),
      job: { id: "job_test" },
      resumeSha256: RESUME_DIGEST,
      applicationUrl: "https://somewhere-else.example.test/apply",
      now: NOW,
    });
    expect(result.authority).toEqual(PREPARE_ONLY_AUTHORITY);
    expect(result.narrowedBecause).toContain("outside what you allowed");
  });
});
