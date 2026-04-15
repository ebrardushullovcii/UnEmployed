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
      routeKind: "native_first",
      parserManifestVersion: "parser-manifest-v1",
      qualityScore: 0.92,
      analysisProviderKind: "openai_compatible",
      analysisProviderLabel: "AI resume agent",
      warnings: [],
      errorMessage: null,
      candidateCounts: {
        total: 4,
        autoApplied: 2,
        needsReview: 2,
        rejected: 0,
        abstained: 0,
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
      parserManifest: {
        workerKind: "python_sidecar",
        workerVersion: "0.1.0",
        manifestVersion: "parser-manifest-v1",
        runtimeLabel: "local-python",
        availableCapabilities: ["pdf_layout"],
        executorVersions: {
          macos_pdfkit_text: "system",
        },
      },
      route: {
        routeKind: "native_first",
        triageReasons: ["healthy_native_text"],
        preferredExecutors: ["macos_pdfkit_text"],
        usedExecutors: ["macos_pdfkit_text"],
      },
      quality: {
        score: 0.94,
        textDensity: 0.82,
        tokenCount: 12,
        lineCount: 2,
        blockCount: 1,
        columnLikelihood: 0.08,
        readingOrderConfidence: 0.97,
        nativeTextCoverage: 1,
        ocrConfidence: null,
        imageCoverageRatio: 0,
        invalidUnicodeRatio: 0,
      },
      qualityWarnings: [],
      pages: [
        {
          pageNumber: 1,
          text: "Alex Vanguard\nFrontend Engineer",
          charCount: 31,
          parserKinds: ["macos_pdfkit_text"],
          usedOcr: false,
          width: 612,
          height: 792,
          rotationDegrees: 0,
          routeKind: "native_first",
          quality: {
            score: 0.94,
            textDensity: 0.82,
            tokenCount: 12,
            lineCount: 2,
            blockCount: 1,
            columnLikelihood: 0.08,
            readingOrderConfidence: 0.97,
            nativeTextCoverage: 1,
            ocrConfidence: null,
            imageCoverageRatio: 0,
            invalidUnicodeRatio: 0,
          },
          qualityWarnings: [],
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
          lineIds: ["line_1"],
          parserLineage: ["macos_pdfkit_text"],
          readingOrderConfidence: 0.99,
          textSpan: { start: 0, end: 13 },
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
      confidenceBreakdown: {
        overall: 0.98,
        parserQuality: 1,
        evidenceQuality: 0.99,
        agreementScore: 0.96,
        normalizationRisk: 0.02,
        conflictRisk: 0.01,
        fieldSensitivity: "low",
        recommendation: "auto_apply",
      },
      notes: [],
      alternatives: [],
      resolution: "auto_applied",
      resolutionReason: "high_confidence_literal_with_direct_evidence",
      createdAt: "2026-04-10T10:00:02.000Z",
      resolvedAt: "2026-04-10T10:00:03.000Z",
    });

    expect(bundle.route?.routeKind).toBe("native_first");
    expect(bundle.quality?.score ?? 0).toBeGreaterThan(0.9);
    expect(candidate.confidenceBreakdown?.recommendation).toBe("auto_apply");
    expect(bundle.blocks[0]?.sectionHint).toBe("identity");
    expect(candidate.target.key).toBe("fullName");
    expect(run.candidateCounts.autoApplied).toBe(2);
  });

  test("parses benchmark case and report contracts", async () => {
    const { ResumeImportBenchmarkCaseSchema, ResumeImportBenchmarkReportSchema } = await import("./index");

    const benchmarkCase = ResumeImportBenchmarkCaseSchema.parse({
      id: "ebrar_pdf",
      label: "Ebrar PDF",
      resumePath: "docs/resume-tests/Ebrar.pdf",
      canary: true,
      tags: ["pdf", "multi-page"],
      expected: {
        literalFields: {
          fullName: "Ebrar Dushullovci",
          currentLocation: "Prishtina, Kosovo",
        },
        summaryContains: ["6+ years of full-stack experience"],
        experienceRecords: [
          {
            title: "Senior Full-Stack Software Engineer",
            companyName: "AUTOMATEDPROS",
          },
          {
            title: ".NET Consultant",
            companyName: "INFOTECH L.L.C",
          },
        ],
        educationRecords: [
          {
            schoolName: "Kolegji Riinvest (Riinvest College)",
            degree: "BACHELOR'S DEGREE",
          },
        ],
      },
    });

    const report = ResumeImportBenchmarkReportSchema.parse({
      benchmarkVersion: "019-baseline-v1",
      generatedAt: "2026-04-11T10:00:00.000Z",
      parserManifestVersion: "parser-manifest-v1",
      parserManifestVersions: ["parser-manifest-v1"],
      analysisProviderKind: "deterministic",
      analysisProviderLabel: "Test provider",
      cases: [
        {
          caseId: benchmarkCase.id,
          label: benchmarkCase.label,
          parserStrategy: "local_sidecar+heuristic_baseline",
          passed: true,
          metrics: {
            literalFieldPrecision: 1,
            literalFieldRecall: 1,
            experienceRecordF1: 0.8,
            educationRecordF1: 1,
            evidenceCoverage: 1,
            autoApplyPrecision: 1,
            unresolvedRate: 0.2,
          },
          taxonomy: [],
          notes: [],
        },
      ],
      aggregate: {
        literalFieldPrecision: 1,
        literalFieldRecall: 1,
        experienceRecordF1: 0.8,
        educationRecordF1: 1,
        evidenceCoverage: 1,
        autoApplyPrecision: 1,
        unresolvedRate: 0.2,
      },
      notes: [],
    });

    expect(benchmarkCase.canary).toBe(true);
    expect(report.cases[0]?.passed).toBe(true);
    expect(report.parserManifestVersions).toEqual(["parser-manifest-v1"]);
  });
});
