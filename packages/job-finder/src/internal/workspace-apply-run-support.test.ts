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
      applicationRecordId: "application-record-1",
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
    {
      state: "paused" as const,
      submittedAt: null,
      outcome: "submitted" as const,
    },
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
      applicationRecordId: "application-record-fallback",
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

/**
 * The questions from a real form, all the way into the records that are kept.
 *
 * Every shape the live Greenhouse form had is here: a placeholder choice, a
 * country list far longer than the cap, a label carrying the site's required
 * star, a duplicate label on two controls, and a note about an answer that did
 * not fit. If any of them is refused, the run ends with nothing recorded and
 * the person is left with a button that does nothing.
 */
describe("questions from a real form become records", () => {
  it("keeps every question, its choices, and the note beside it", () => {
    const job = createSeed().savedJobs[0]!;
    const detectedAt = "2026-07-30T10:00:00.000Z";
    const question = (
      index: number,
      overrides: Record<string, unknown>,
    ): Record<string, unknown> => ({
      id: `question_${job.id}_${index}`,
      prompt: `Question ${index}`,
      kind: "other",
      answerControlType: "text",
      isRequired: true,
      detectedAt,
      answerOptions: [],
      suggestedAnswers: [],
      submittedAnswer: null,
      status: "detected",
      ...overrides,
    });

    const artifacts = buildApplyCopilotArtifacts({
      applicationRecordId: "application-record-real-form",
      job,
      detectedAt,
      runId: "run-real-form",
      resultId: "result-real-form",
      resumeArtifact: ApplicationResumeArtifactSchema.parse({
        id: "resume-real-form",
        jobId: job.id,
        source: "original_upload",
        sourceDocumentId: "document-real-form",
        exportArtifactId: null,
        fileName: "Original CV.pdf",
        filePath: "C:/private/Original CV.pdf",
        sha256: "c".repeat(64),
        approvedAt: detectedAt,
      }),
      executionResult: ApplyExecutionResultSchema.parse({
        state: "paused",
        summary: "This application needs you",
        detail: "Job Finder needs your answers to 4 questions.",
        submittedAt: null,
        outcome: null,
        checkpoints: [],
        questions: [
          question(0, {
            prompt: "Have you previously worked at or consulted for us?*",
            answerControlType: "single_choice",
            answerOptions: ["Yes", "No"],
            note: 'Your answer "Maybe" did not match one of the choices: Yes, No',
          }),
          question(1, {
            prompt: "Phone",
            description: "Phone country",
            answerControlType: "single_choice",
            answerOptions: Array.from(
              { length: 40 },
              (_, index) => `Country ${index + 1}`,
            ),
          }),
          question(2, {
            prompt: "Gender",
            description: "U.S. Equal Employment Opportunity information",
            answerControlType: "single_choice",
            answerOptions: ["Male", "Female", "Decline To Self Identify"],
          }),
          question(3, {
            prompt: "Why do you want to work here?",
            isRequired: false,
          }),
        ],
        blocker: {
          code: "missing_candidate_answer",
          summary: "This application needs an answer from you.",
          detail: "Four questions are waiting.",
          questionIds: [
            `question_${job.id}_0`,
            `question_${job.id}_1`,
            `question_${job.id}_2`,
            `question_${job.id}_3`,
          ],
        },
        consentDecisions: [],
        replay: {},
        visualEvidence: [],
        visualObservationSets: [],
        visualCheckpoints: [],
        nextActionLabel: "Answer the question in Needs you",
        executionTimings: [],
      }),
      visualCheckpointsEnabled: false,
    });

    expect(artifacts.questionRecords).toHaveLength(4);
    expect(
      new Set(artifacts.questionRecords.map((record) => record.id)).size,
    ).toBe(4);
    expect(artifacts.questionRecords[0]?.note).toContain(
      "did not match one of the choices",
    );
    expect(artifacts.questionRecords[1]?.description).toBe("Phone country");
    expect(artifacts.questionRecords[1]?.answerOptions).toHaveLength(40);
    for (const record of artifacts.questionRecords) {
      expect(record.prompt.trim().length).toBeGreaterThan(0);
      for (const option of record.answerOptions) {
        expect(option.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
