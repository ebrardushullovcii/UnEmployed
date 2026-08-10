import { describe, expect, it } from "vitest";
import { ApplicationPacketSchema } from "./apply";

const basePacket = {
  generatedAt: "2026-07-30T12:00:00.000Z",
  job: {
    id: "job-1",
    source: "target_site",
    title: "Senior Engineer",
    company: "Example",
    location: "Remote",
    listingDestination: {
      origin: "https://jobs.example.com",
      safePath: "/jobs/123",
    },
    applicationDestination: {
      origin: "https://apply.example.com",
      safePath: "/applications/123",
    },
    summary: "Build reliable systems.",
  },
  run: {
    id: "run-1",
    mode: "copilot",
    state: "paused_for_user_review",
  },
  result: {
    id: "result-1",
    state: "awaiting_review",
    summary: "Prepared",
    detail: "Stopped before final submit.",
    blockerReason: null,
    blockerSummary: null,
    updatedAt: "2026-07-30T12:00:00.000Z",
  },
  resume: {
    source: "original_upload",
    sourceDocumentId: "document-1",
    exportArtifactId: null,
    fileName: "Original CV.pdf",
    sha256: null,
    filePath: "C:/private/Original CV.pdf",
  },
  questions: [],
  consent: [],
  checkpoints: [],
  privacyReceipt: null,
  submissionOccurred: false,
} as const;

describe("ApplicationPacketSchema", () => {
  it("keeps only redacted destinations and portable resume identity", () => {
    const packet = ApplicationPacketSchema.parse(basePacket);
    const serialized = JSON.stringify(packet);

    expect(packet.schemaVersion).toBe(1);
    expect(packet.resume?.fileName).toBe("Original CV.pdf");
    expect(serialized).not.toContain("C:/private");
    expect(serialized).not.toContain("filePath");
  });

  it("rejects destination query and fragment secrets", () => {
    expect(() =>
      ApplicationPacketSchema.parse({
        ...basePacket,
        job: {
          ...basePacket.job,
          applicationDestination: {
            origin: "https://apply.example.com",
            safePath: "/applications/123?token=secret#apply",
          },
        },
      }),
    ).toThrow();
  });

  it("cannot claim submission without matching result and receipt proof", () => {
    expect(() =>
      ApplicationPacketSchema.parse({
        ...basePacket,
        submissionOccurred: true,
      }),
    ).toThrow(/exactly match both result and receipt proof/i);
  });
  it("cannot hide a submission proven by the result and receipt", () => {
    expect(() =>
      ApplicationPacketSchema.parse({
        ...basePacket,
        run: { ...basePacket.run, state: "completed" },
        result: { ...basePacket.result, state: "submitted" },
        privacyReceipt: {
          generatedAt: basePacket.generatedAt,
          lineage: { runId: "run-1", jobId: "job-1", resultId: "result-1" },
          destination: basePacket.job.applicationDestination,
          resume: {
            source: "original_upload",
            sourceDocumentId: "document-1",
            exportArtifactId: null,
            fileName: "Original CV.pdf",
            sha256: null,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: true,
        },
        submissionOccurred: false,
      }),
    ).toThrow(/exactly match both result and receipt proof/i);
  });

  it("requires receipt lineage to match the packet", () => {
    expect(() =>
      ApplicationPacketSchema.parse({
        ...basePacket,
        privacyReceipt: {
          generatedAt: basePacket.generatedAt,
          lineage: { runId: "other-run", jobId: "job-1", resultId: "result-1" },
          destination: basePacket.job.applicationDestination,
          resume: {
            source: "original_upload",
            sourceDocumentId: "document-1",
            exportArtifactId: null,
            fileName: "Original CV.pdf",
            sha256: null,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: false,
        },
      }),
    ).toThrow(/receipt lineage must match/i);
  });
});
