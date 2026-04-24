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

  test("drops LinkedIn broad query templates from discovery guidance only", () => {
    expect(
      filterDiscoveryInstructionLines({
        values: [
          "URL-based search: /jobs/search/?keywords=...&location=... reliably returns filtered results",
          "Use URL parameters for direct search: keywords and location",
          "LinkedIn jobs surface is fully accessible. Best entry path is /jobs/search/?keywords=...&location=... URL parameters. Jobs hub at /jobs/ shows recommendation rows with \"Show all available jobs\" and \"Show all top job picks for you\" links.",
          "Job listings are clickable and open detail panels inline",
          "Apply button appears on job detail side panels",
        ],
      }),
    ).toEqual([
      "Job listings are clickable and open detail panels inline",
      "Apply button appears on job detail side panels",
    ]);
  });

  test("keeps the same LinkedIn lines for non-discovery reusable guidance", () => {
    expect(
      filterSourceInstructionLines([
        "URL-based search: /jobs/search/?keywords=...&location=... reliably returns filtered results",
        "Use URL parameters for direct search: keywords and location",
        "LinkedIn jobs surface is fully accessible. Best entry path is /jobs/search/?keywords=...&location=... URL parameters. Jobs hub at /jobs/ shows recommendation rows with \"Show all available jobs\" and \"Show all top job picks for you\" links.",
      ]),
    ).toEqual([
      "URL-based search: /jobs/search/?keywords=...&location=... reliably returns filtered results",
      "Use URL parameters for direct search: keywords and location",
      "LinkedIn jobs surface is fully accessible. Best entry path is /jobs/search/?keywords=...&location=... URL parameters. Jobs hub at /jobs/ shows recommendation rows with \"Show all available jobs\" and \"Show all top job picks for you\" links.",
    ]);
  });
});
