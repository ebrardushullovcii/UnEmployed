import { ResumeDocumentBundleSchema } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import { extractLiteralCandidates } from "./resume-import-literal-extraction";

const createdAt = "2026-09-15T09:00:00.000Z";

function bundle(fullText: string) {
  return ResumeDocumentBundleSchema.parse({
    id: "bundle_test",
    runId: "run_test",
    sourceResumeId: "resume_test",
    sourceFileKind: "pdf",
    primaryParserKind: "pdfjs_text",
    createdAt,
    fullText,
    blocks: fullText.split("\n").map((text, index) => ({
      id: `block_${index}`,
      pageNumber: 1,
      kind: text.includes("2016") ? "experience_header" : "contact",
      sectionHint: text.includes("2016") ? "experience" : "contact",
      text,
      readingOrder: index,
    })),
  });
}

describe("literal resume phone extraction", () => {
  test("does not turn an employment date range into a phone number", () => {
    const candidates = extractLiteralCandidates(
      "run_test",
      bundle(
        "Alex Vanguard\nProduct Designer | Northstar Studio | 2016 - 2020",
      ),
      createdAt,
    );

    expect(
      candidates.find((candidate) => candidate.target.key === "phone"),
    ).toBeUndefined();
  });

  test("keeps a short local phone number and its extension", () => {
    const candidates = extractLiteralCandidates(
      "run_test",
      bundle("Alex Vanguard\n5555 0198 ext. 42"),
      createdAt,
    );

    expect(
      candidates.find((candidate) => candidate.target.key === "phone")?.value,
    ).toBe("5555 0198 ext. 42");
  });
});
