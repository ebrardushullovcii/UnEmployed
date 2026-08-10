import {
  ApplicationAnswerRecordSchema,
  ApplicationPrivacyReceiptSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
} from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";
import { describe, expect, it } from "vitest";
import { createSeed } from "../workspace-service.test-fixtures";
import { createWorkspaceApplyRunStoreMethods } from "./workspace-apply-run-store-methods";
import type { WorkspaceServiceContext } from "./workspace-service-context";

describe("workspace application packet", () => {
  it("exports exact prepared evidence without paths, URL secrets, or false submission", async () => {
    const now = "2026-07-30T12:00:00.000Z";
    const seed = createSeed();
    const job = seed.savedJobs[0]!;
    seed.savedJobs[0] = {
      ...job,
      canonicalUrl: "https://jobs.example.com/jobs/123?tracking=secret#top",
      applicationUrl:
        "https://apply.example.com/applications/123?candidate_token=secret#apply",
    };
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "run-1",
        mode: "copilot",
        state: "paused_for_user_review",
        jobIds: [job.id],
        currentJobId: job.id,
        summary: "Safe preparation paused for review.",
        detail: "Final submit remains disabled.",
        createdAt: now,
        updatedAt: now,
      }),
    ];
    const privacyReceipt = ApplicationPrivacyReceiptSchema.parse({
      generatedAt: now,
      lineage: { runId: "run-1", jobId: job.id, resultId: "result-1" },
      destination: {
        origin: "https://apply.example.com",
        safePath: "/applications/123",
      },
      resume: {
        source: "original_upload",
        sourceDocumentId: "document-1",
        exportArtifactId: null,
        fileName: "Original CV.pdf",
        sha256: null,
      },
      stayedLocal: ["job_listing_data"],
      externalWrites: [
        {
          category: "profile_field",
          fieldLabel: "Full name",
          occurredAt: now,
          verified: true,
        },
      ],
      accountCreationAuthorized: false,
      finalSubmitAuthorized: false,
      finalSubmitOccurred: false,
    });
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "result-1",
        runId: "run-1",
        jobId: job.id,
        state: "awaiting_review",
        summary: "Prepared",
        detail: "Stopped before final submit.",
        startedAt: now,
        updatedAt: now,
        privacyReceipt,
      }),
    ];
    seed.applicationQuestionRecords = [
      ApplicationQuestionRecordSchema.parse({
        id: "question-1",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        prompt: "Full name",
        kind: "personal_info",
        isRequired: true,
        detectedAt: now,
        selectedAnswerId: "answer-1",
        submittedAnswer: "Alex Vanguard",
        status: "answered",
        pageUrl:
          "https://apply.example.com/applications/123?candidate_token=secret",
      }),
      ApplicationQuestionRecordSchema.parse({
        id: "question-2",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        prompt: "Resume",
        kind: "resume",
        isRequired: true,
        detectedAt: now,
        selectedAnswerId: "answer-resume-selected",
        submittedAnswer: "C:/Users/private/Original CV.pdf",
        status: "answered",
        pageUrl: "https://apply.example.com/applications/123",
      }),
      ApplicationQuestionRecordSchema.parse({
        id: "question-3",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        prompt: "Resume fallback",
        kind: "resume",
        isRequired: true,
        detectedAt: now,
        selectedAnswerId: null,
        submittedAnswer: "/tmp/private/original-cv.pdf",
        status: "answered",
        pageUrl: "https://apply.example.com/applications/123",
      }),
    ];
    seed.applicationAnswerRecords = [
      ApplicationAnswerRecordSchema.parse({
        id: "answer-1",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        questionId: "question-1",
        status: "filled",
        text: "Alex Vanguard",
        sourceKind: "profile",
        createdAt: now,
      }),
      ApplicationAnswerRecordSchema.parse({
        id: "answer-unused-model",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        questionId: "question-1",
        status: "suggested",
        text: "A different generated name",
        sourceKind: "proof_bank",
        createdAt: now,
      }),
      ApplicationAnswerRecordSchema.parse({
        id: "answer-resume-selected",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        questionId: "question-2",
        status: "filled",
        text: "C:/Users/private/Original CV.pdf",
        sourceKind: "resume",
        createdAt: now,
      }),
      ApplicationAnswerRecordSchema.parse({
        id: "answer-resume-fallback",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        questionId: "question-3",
        status: "filled",
        text: "/tmp/private/original-cv.pdf",
        sourceKind: "resume",
        createdAt: now,
      }),
    ];
    seed.applicationReplayCheckpoints = [
      ApplicationReplayCheckpointSchema.parse({
        id: "checkpoint-1",
        runId: "run-1",
        jobId: job.id,
        resultId: "result-1",
        createdAt: now,
        label: "Paused before final submit",
        detail: "Final control remained untouched.",
        url: "https://apply.example.com/applications/123?candidate_token=secret#apply",
        jobState: "awaiting_review",
      }),
    ];

    const repository = createInMemoryJobFinderRepository(seed);
    const methods = createWorkspaceApplyRunStoreMethods({
      repository,
    } as WorkspaceServiceContext);
    const packet = await methods.buildApplicationPacket("run-1", job.id);
    const serialized = JSON.stringify(packet);

    expect(packet.job.listingDestination).toEqual({
      origin: "https://jobs.example.com",
      safePath: "/jobs/123",
    });
    expect(packet.job.applicationDestination).toEqual({
      origin: "https://apply.example.com",
      safePath: "/applications/123",
    });
    expect(packet.resume?.fileName).toBe("Original CV.pdf");
    expect(packet.questions[0]).toEqual(
      expect.objectContaining({
        prompt: "Full name",
        preparedAnswer: "Alex Vanguard",
        sourceKinds: ["profile"],
      }),
    );
    expect(packet.questions[1]).toEqual(
      expect.objectContaining({
        preparedAnswer: "Original CV.pdf",
        sourceKinds: ["resume"],
      }),
    );
    expect(packet.questions[2]).toEqual(
      expect.objectContaining({
        preparedAnswer: "Original CV.pdf",
        sourceKinds: ["resume"],
      }),
    );
    expect(packet.submissionOccurred).toBe(false);
    expect(serialized).not.toContain("candidate_token");
    expect(serialized).not.toContain("tracking=secret");
    expect(serialized).not.toContain("filePath");
    expect(serialized).not.toContain("C:/Users/private");
    expect(serialized).not.toContain("/tmp/private");
    expect(serialized).not.toContain("A different generated name");
  });
});
