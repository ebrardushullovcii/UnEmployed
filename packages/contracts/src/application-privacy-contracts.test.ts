import { describe, expect, test } from "vitest";

import {
  ApplicationPrivacyDestinationSchema,
  ApplicationPrivacyReceiptSchema,
  ApplyJobResultSchema,
} from "./index";

const baseApplyJobResult = {
  id: "apply_result_1",
  runId: "apply_run_1",
  jobId: "job_1",
  state: "awaiting_review" as const,
  summary: "Prepared for review.",
  detail: "Stopped before final submit.",
  startedAt: "2026-07-30T10:00:00.000Z",
  updatedAt: "2026-07-30T10:01:00.000Z",
};

describe("application privacy receipt contracts", () => {
  test("keeps older apply results backward compatible", () => {
    const legacyResult = ApplyJobResultSchema.parse(baseApplyJobResult);
    expect(legacyResult.privacyReceipt).toBe(null);
    expect(legacyResult.applicationRecordId).toBeNull();
    expect(
      ApplyJobResultSchema.parse({
        ...baseApplyJobResult,
        privacyReceipt: null,
      }).privacyReceipt,
    ).toBeNull();
  });

  test("parses a redacted receipt with safe authorization defaults", () => {
    const receipt = ApplicationPrivacyReceiptSchema.parse({
      generatedAt: "2026-07-30T10:01:00.000Z",
      lineage: {
        runId: "apply_run_1",
        jobId: "job_1",
        resultId: "apply_result_1",
        applicationRecordId: "application_record_1",
      },
      destination: {
        origin: "https://boards.example.com",
        safePath: "/company/jobs/apply",
      },
      resume: {
        source: "original_upload",
        sourceDocumentId: "resume_document_1",
        fileName: "candidate-resume.pdf",
        sha256: "a".repeat(64),
      },
      stayedLocal: ["profile_data", "browser_evidence"],
      modelUse: [
        {
          purpose: "application_answering",
          transport: "external_model",
          providerLabel: "Configured AI provider",
          modelLabel: "configured-model",
          dataCategories: ["profile_data", "application_answers"],
          occurredAt: "2026-07-30T10:00:30.000Z",
        },
      ],
      externalWrites: [
        {
          category: "resume_attachment",
          fieldLabel: "Resume upload",
          occurredAt: "2026-07-30T10:00:45.000Z",
          artifactRefId: "artifact_1",
          verified: true,
        },
      ],
    });

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      accountCreationAuthorized: false,
      finalSubmitAuthorized: false,
      finalSubmitOccurred: false,
    });
    expect(receipt.resume.exportArtifactId).toBeNull();
    expect(receipt.lineage.applicationRecordId).toBe("application_record_1");
  });

  test.each([
    {
      origin: "https://boards.example.com/apply",
      safePath: "/company/jobs/apply",
    },
    {
      origin: "https://boards.example.com?token=secret",
      safePath: "/company/jobs/apply",
    },
    {
      origin: "https://boards.example.com#candidate",
      safePath: "/company/jobs/apply",
    },
    {
      origin: "https://user:secret@boards.example.com",
      safePath: "/company/jobs/apply",
    },
    {
      origin: "https://boards.example.com",
      safePath: "/company/jobs/apply?token=secret",
    },
    {
      origin: "https://boards.example.com",
      safePath: "/company/jobs/apply#candidate",
    },
  ])("rejects unsafe destination data %#", (destination) => {
    expect(
      ApplicationPrivacyDestinationSchema.safeParse(destination).success,
    ).toBe(false);
  });

  test("rejects malformed resume hashes", () => {
    const result = ApplicationPrivacyReceiptSchema.safeParse({
      generatedAt: "2026-07-30T10:01:00.000Z",
      lineage: {
        runId: "apply_run_1",
        jobId: "job_1",
        resultId: "apply_result_1",
      },
      destination: {
        origin: "https://boards.example.com",
        safePath: "/company/jobs/apply",
      },
      resume: {
        source: "tailored_export",
        exportArtifactId: "resume_export_1",
        fileName: "candidate-resume.pdf",
        sha256: "not-a-sha256",
      },
    });

    expect(result.success).toBe(false);
  });
});
