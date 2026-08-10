import {
  ApplyExecutionResultSchema,
  ApplicationResumeArtifactSchema,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import { createSeed } from "../workspace-service.test-fixtures";
import {
  buildApplicationPrivacyReceipt,
  buildApplyCopilotArtifacts,
  enforcePrepareOnlyExecutionResult,
} from "./workspace-apply-run-support";

describe("buildApplicationPrivacyReceipt", () => {
  it("redacts destination secrets and records verified preparation writes", () => {
    const job = {
      ...createSeed().savedJobs[0]!,
      applicationUrl:
        "https://boards.greenhouse.io/example/jobs/123?candidate_token=secret#apply",
    };
    const generatedAt = "2026-07-30T10:00:00.000Z";
    const receipt = buildApplicationPrivacyReceipt({
      job,
      generatedAt,
      runId: "run-1",
      resultId: "result-1",
      resumeArtifact: ApplicationResumeArtifactSchema.parse({
        id: "resume-1",
        jobId: job.id,
        source: "original_upload",
        sourceDocumentId: "document-1",
        exportArtifactId: null,
        fileName: "Original CV.pdf",
        filePath: "C:/private/Original CV.pdf",
        sha256: "a".repeat(64),
        approvedAt: generatedAt,
      }),
      executionResult: ApplyExecutionResultSchema.parse({
        state: "paused",
        summary: "Prepared",
        detail: "Stopped before final submit.",
        submittedAt: null,
        outcome: null,
        nextActionLabel: "Review the prepared application",
        questions: [
          {
            id: "resume-question",
            prompt: "Resume",
            kind: "resume",
            detectedAt: generatedAt,
            submittedAnswer: "C:/private/Original CV.pdf",
            status: "answered",
          },
          {
            id: "name-question",
            prompt: "Full name",
            kind: "personal_info",
            detectedAt: generatedAt,
            submittedAnswer: "Alex Vanguard",
            status: "answered",
          },
        ],
        checkpoints: [],
        externalWrites: [
          {
            category: "resume_attachment",
            fieldLabel: "Resume",
            occurredAt: generatedAt,
            verified: true,
          },
          {
            category: "profile_field",
            fieldLabel: "Full name",
            occurredAt: generatedAt,
            verified: true,
          },
        ],
      }),
    });

    expect(receipt.resume.sha256).toBe("a".repeat(64));
    expect(receipt.destination).toEqual({
      origin: "https://boards.greenhouse.io",
      safePath: "/example/jobs/123",
    });
    expect(JSON.stringify(receipt)).not.toContain("candidate_token");
    expect(JSON.stringify(receipt)).not.toContain("C:/private");
    expect(receipt.resume.fileName).toBe("Original CV.pdf");
    expect(receipt.externalWrites).toEqual([
      expect.objectContaining({
        category: "resume_attachment",
        fieldLabel: "Resume",
        verified: true,
      }),
      expect.objectContaining({
        category: "profile_field",
        fieldLabel: "Full name",
        verified: true,
      }),
    ]);
    expect(receipt.modelUse).toEqual([]);
    expect(receipt.accountCreationAuthorized).toBe(false);
    expect(receipt.finalSubmitAuthorized).toBe(false);
    expect(receipt.finalSubmitOccurred).toBe(false);
  });

  it.each([
    { state: "submitted" as const, submittedAt: null, outcome: null },
    {
      state: "paused" as const,
      submittedAt: "2026-07-30T10:01:00.000Z",
      outcome: null,
    },
    { state: "paused" as const, submittedAt: null, outcome: "submitted" as const },
  ])(
    "rejects an impossible prepare-only submission signal %#",
    (unsafeSignal) => {
      expect(() =>
        enforcePrepareOnlyExecutionResult(
          ApplyExecutionResultSchema.parse({
            ...unsafeSignal,
            summary: "Unsafe runtime response",
            detail: "A prepare-only adapter reported submission.",
            checkpoints: [],
            questions: [],
            blocker: null,
            consentDecisions: [],
            replay: {},
            visualEvidence: [],
            visualObservationSets: [],
            visualCheckpoints: [],
            nextActionLabel: null,
            executionTimings: [],
          }),
        ),
      ).toThrow(/without final-submit authorization/iu);
    },
  );

  it("creates a scoped fallback checkpoint when a blocker has no runtime checkpoint", () => {
    const job = createSeed().savedJobs[0]!;
    const detectedAt = "2026-07-30T10:00:00.000Z";
    const artifacts = buildApplyCopilotArtifacts({
      job,
      detectedAt,
      runId: "run-fallback-checkpoint",
      resultId: "result-fallback-checkpoint",
      resumeArtifact: ApplicationResumeArtifactSchema.parse({
        id: "resume-fallback-checkpoint",
        jobId: job.id,
        source: "original_upload",
        sourceDocumentId: "document-fallback-checkpoint",
        exportArtifactId: null,
        fileName: "Original CV.pdf",
        filePath: "C:/private/Original CV.pdf",
        sha256: "b".repeat(64),
        approvedAt: detectedAt,
      }),
      executionResult: ApplyExecutionResultSchema.parse({
        state: "paused",
        summary: "A browser step needs you",
        detail: "Stopped without submitting.",
        submittedAt: null,
        outcome: null,
        checkpoints: [],
        questions: [],
        blocker: {
          code: "requires_manual_review",
          userActionKind: "captcha",
          summary: "Complete the CAPTCHA yourself.",
          url: job.applicationUrl,
        },
        consentDecisions: [],
        replay: {},
        visualEvidence: [],
        visualObservationSets: [],
        visualCheckpoints: [],
        nextActionLabel: "Complete the browser step",
        executionTimings: [],
      }),
    });

    expect(artifacts.checkpoints).toEqual([
      expect.objectContaining({
        runId: "run-fallback-checkpoint",
        jobId: job.id,
        resultId: "result-fallback-checkpoint",
        label: "Browser action required",
        jobState: "awaiting_review",
      }),
    ]);
    expect(artifacts.result.latestCheckpointId).toBe(
      artifacts.checkpoints[0]?.id,
    );
    expect(artifacts.result.privacyReceipt).toMatchObject({
      accountCreationAuthorized: false,
      finalSubmitAuthorized: false,
      finalSubmitOccurred: false,
    });
  });
});
