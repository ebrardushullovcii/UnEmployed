import { describe, expect, test } from "vitest";
import type { ResumeDocumentBundle } from "@unemployed/contracts";
import {
  sanitizeStageCandidates,
  selectBlocksForResumeImportStage,
} from "./resume-import";
import { createPreferences, createProfile } from "./test-fixtures";

const bundle: ResumeDocumentBundle = {
  id: "bundle_1",
  runId: "run_1",
  sourceResumeId: "resume_1",
  sourceFileKind: "pdf",
  primaryParserKind: "pdfjs_text",
  parserKinds: ["pdfjs_text"],
  createdAt: "2026-04-10T00:00:00.000Z",
  warnings: [],
  languageHints: [],
  pages: [],
  fullText: null,
  blocks: [
    { id: "b1", pageNumber: 1, readingOrder: 0, text: "Ebrar Dushullovci", kind: "paragraph", sectionHint: "identity", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b2", pageNumber: 1, readingOrder: 1, text: "Address: Prishtina, Kosovo (Home)", kind: "paragraph", sectionHint: "contact", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b3", pageNumber: 1, readingOrder: 2, text: "SKILLS", kind: "heading", sectionHint: "skills", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b4", pageNumber: 1, readingOrder: 3, text: "React, Next.js, TypeScript", kind: "paragraph", sectionHint: "skills", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b5", pageNumber: 1, readingOrder: 4, text: "WORK EXPERIENCE", kind: "heading", sectionHint: "experience", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b6", pageNumber: 1, readingOrder: 5, text: "AUTOMATEDPROS – PRISHTINA, KOSOVO", kind: "heading", sectionHint: "identity", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b7", pageNumber: 1, readingOrder: 6, text: "SENIOR FULL-STACK SOFTWARE ENGINEER – 07/2023 – Current", kind: "paragraph", sectionHint: "summary", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b8", pageNumber: 2, readingOrder: 0, text: "INFOTECH L.L.C – PRISHTINA, KOSOVO", kind: "heading", sectionHint: "identity", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b9", pageNumber: 2, readingOrder: 1, text: ".NET CONSULTANT – 01/2022 – Current", kind: "paragraph", sectionHint: "identity", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b10", pageNumber: 2, readingOrder: 2, text: ".NET DEVELOPER – CREA-KO – 01/2019 – 07/2019 – PRISHTINA, KOSOVO", kind: "paragraph", sectionHint: "summary", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b11", pageNumber: 3, readingOrder: 0, text: "TECHNICAL SUPPORT AGENT – BIT BY BIT – 06/2017 – 12/2017 – PRISHTINA, KOSOVO", kind: "paragraph", sectionHint: "summary", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b12", pageNumber: 3, readingOrder: 1, text: "EDUCATION AND TRAINING", kind: "heading", sectionHint: "education", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b13", pageNumber: 3, readingOrder: 2, text: "BACHELOR'S DEGREE, COMPUTER SCIENCE Kolegji Riinvest (Riinvest College)", kind: "paragraph", sectionHint: "education", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b14", pageNumber: 3, readingOrder: 3, text: "LANGUAGE SKILLS", kind: "heading", sectionHint: "skills", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
    { id: "b15", pageNumber: 3, readingOrder: 4, text: "ENGLISH C2 C2 C2 C2 C2", kind: "heading", sectionHint: "languages", bbox: null, sourceParserKinds: ["pdfjs_text"], sourceConfidence: 0.72 },
  ],
};

describe("selectBlocksForResumeImportStage", () => {
  test("keeps full experience ranges even when company markers were misclassified", () => {
    const selected = selectBlocksForResumeImportStage(bundle, "experience");
    const texts = selected.map((block) => block.text);

    expect(texts).toContain("AUTOMATEDPROS – PRISHTINA, KOSOVO");
    expect(texts).toContain("INFOTECH L.L.C – PRISHTINA, KOSOVO");
    expect(texts).toContain(".NET CONSULTANT – 01/2022 – Current");
    expect(texts).toContain(".NET DEVELOPER – CREA-KO – 01/2019 – 07/2019 – PRISHTINA, KOSOVO");
    expect(texts).toContain("TECHNICAL SUPPORT AGENT – BIT BY BIT – 06/2017 – 12/2017 – PRISHTINA, KOSOVO");
    expect(texts).not.toContain("EDUCATION AND TRAINING");
  });

  test("keeps skills, education, and language ranges for background extraction", () => {
    const selected = selectBlocksForResumeImportStage(bundle, "background");
    const texts = selected.map((block) => block.text);

    expect(texts).toContain("SKILLS");
    expect(texts).toContain("React, Next.js, TypeScript");
    expect(texts).toContain("EDUCATION AND TRAINING");
    expect(texts).toContain("LANGUAGE SKILLS");
    expect(texts).toContain("ENGLISH C2 C2 C2 C2 C2");
    expect(texts).not.toContain("INFOTECH L.L.C – PRISHTINA, KOSOVO");
  });

  test("adds confidence breakdowns during candidate sanitation", () => {
    const result = sanitizeStageCandidates(
      {
        stage: "identity_summary",
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        documentBundle: bundle,
      },
      {
        stage: "identity_summary",
        analysisProviderKind: "deterministic",
        analysisProviderLabel: "Test",
        candidates: [
          {
            target: { section: "identity", key: "fullName", recordId: null },
            label: "Full name",
            value: "Ebrar Dushullovci",
            normalizedValue: "Ebrar Dushullovci",
            valuePreview: "Ebrar Dushullovci",
            evidenceText: "Ebrar Dushullovci",
            sourceBlockIds: ["b1"],
            confidence: 0.98,
            notes: [],
            alternatives: [],
          },
        ],
        notes: [],
      },
    );

    expect(result.candidates[0]?.confidenceBreakdown?.overall).toBeGreaterThan(0.8);
    expect(result.candidates[0]?.confidenceBreakdown?.recommendation).toBe("auto_apply");
  });
});
