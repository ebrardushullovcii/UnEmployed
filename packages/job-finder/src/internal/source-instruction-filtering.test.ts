import { describe, expect, test } from "vitest";

import {
  filterDiscoveryInstructionLines,
  filterSourceInstructionLines,
  normalizeInstructionLine,
} from "./source-instruction-filtering";

describe("source instruction filtering", () => {
  test("scrubs broken route examples from reusable instruction text", () => {
    expect(
      normalizeInstructionLine(
        "Direct path guesses like https://example.com/404 are broken and should be ignored.",
      ),
    ).toBe("Direct path guesses like that route are broken and should be ignored.");
    expect(
      normalizeInstructionLine(
        "Broken templated routes like /jobs/{slug} should not be reused.",
      ),
    ).toBe("Broken templated routes like that route should not be reused.");
  });

  test("preserves reusable stable routes in instruction text", () => {
    expect(
      filterSourceInstructionLines([
        "Best repeatable entry path is https://example.com/jobs/search?selectedJobId=456.",
        "Fallback listing surface is /vacancies.",
      ]),
    ).toEqual([
      "Best repeatable entry path is https://example.com/jobs/search",
      "Fallback listing surface is /vacancies.",
    ]);
  });

  test("drops broad query templates from discovery guidance", () => {
    expect(
      filterDiscoveryInstructionLines({
        values: [
          "URL-based search: /jobs/search/?keywords=...&location=... reliably returns filtered results",
          "Use URL parameters for direct search: keywords and location",
          "Jobs hub shows recommendation rows with Show all available jobs links.",
          "Job listings are clickable and open detail panels inline",
          "Apply button appears on job detail side panels",
        ],
      }),
    ).toEqual([
      "Job listings are clickable and open detail panels inline",
      "Apply button appears on job detail side panels",
    ]);
  });

  test("keeps stable query guidance for reusable source instructions", () => {
    expect(
      filterSourceInstructionLines([
        "Best repeatable entry path is /jobs/search.",
        "Filter controls appear in an inline panel.",
        "Job listings open detail panels.",
      ]),
    ).toEqual([
      "Best repeatable entry path is /jobs/search.",
      "Filter controls appear in an inline panel.",
      "Job listings open detail panels.",
    ]);
  });
});
