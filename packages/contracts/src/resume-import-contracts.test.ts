import { describe, expect, test } from "vitest";

import {
  ResumeDocumentBundleSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportRunSchema,
} from "./index";

describe("contracts resume import schemas", () => {
  test("parses a document bundle, import run, and field candidate", () => {
    const run = ResumeImportRunSchema.parse({
      id: "resume_import_run_1",
      sourceResumeId: "resume_1",
      sourceResumeFileName: "resume.pdf",
      trigger: "import",
      status: "review_ready",
      startedAt: "2026-04-10T10:00:00.000Z",
      completedAt: "2026-04-10T10:00:03.000Z",
      primaryParserKind: "macos_pdfkit_text",
      parserKinds: ["macos_pdfkit_text"],
      analysisProviderKind: "openai_compatible",
      analysisProviderLabel: "AI resume agent",
      warnings: [],
      errorMessage: null,
      candidateCounts: {
        total: 4,
        autoApplied: 2,
        needsReview: 2,
        rejected: 0,
      },
    });

    const bundle = ResumeDocumentBundleSchema.parse({
      id: "resume_bundle_1",
      runId: run.id,
      sourceResumeId: "resume_1",
      sourceFileKind: "pdf",
      primaryParserKind: "macos_pdfkit_text",
      parserKinds: ["macos_pdfkit_text"],
      createdAt: "2026-04-10T10:00:01.000Z",
      warnings: [],
      pages: [
        {
          pageNumber: 1,
          text: "Alex Vanguard\nFrontend Engineer",
          charCount: 31,
          parserKinds: ["macos_pdfkit_text"],
          usedOcr: false,
        },
      ],
      blocks: [
        {
          id: "block_1",
          pageNumber: 1,
          readingOrder: 0,
          text: "Alex Vanguard",
          kind: "heading",
          sectionHint: "identity",
          bbox: null,
          sourceParserKinds: ["macos_pdfkit_text"],
          sourceConfidence: 1,
        },
      ],
      fullText: "Alex Vanguard\nFrontend Engineer",
    });

    const candidate = ResumeImportFieldCandidateSchema.parse({
      id: "candidate_1",
      runId: run.id,
      target: {
        section: "identity",
        key: "fullName",
        recordId: null,
      },
      label: "Full name",
      sourceKind: "parser_literal",
      value: "Alex Vanguard",
      normalizedValue: "Alex Vanguard",
      valuePreview: "Alex Vanguard",
      evidenceText: "Alex Vanguard",
      sourceBlockIds: ["block_1"],
      confidence: 0.98,
      notes: [],
      alternatives: [],
      resolution: "auto_applied",
      createdAt: "2026-04-10T10:00:02.000Z",
      resolvedAt: "2026-04-10T10:00:03.000Z",
    });

    expect(bundle.blocks[0]?.sectionHint).toBe("identity");
    expect(candidate.target.key).toBe("fullName");
    expect(run.candidateCounts.autoApplied).toBe(2);
  });
});
