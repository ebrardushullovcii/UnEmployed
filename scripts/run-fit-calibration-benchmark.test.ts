import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "run-fit-calibration-benchmark.cjs",
);

const { baselineGateFailures, decideExitCode, metadataDeltas } = require(
  scriptPath,
) as {
  baselineGateFailures: (comparison: unknown) => string[];
  decideExitCode: (
    report: { passed: boolean },
    reportOnly: boolean,
    comparison?: unknown,
  ) => number;
  metadataDeltas: (
    current: Record<string, unknown>,
    baseline: Record<string, unknown> | null,
  ) => { field: string; previous: unknown; current: unknown }[];
};

function comparisonFor(
  currentScorerVersion: number,
  baselineScorerVersion: number,
  caseDeltaCount = 0,
) {
  const current = {
    schemaVersion: 1,
    corpusVersion: "fit-calibration-v1-2026-07-30",
    scorerVersion: currentScorerVersion,
  };
  const baseline = {
    schemaVersion: 1,
    corpusVersion: "fit-calibration-v1-2026-07-30",
    scorerVersion: baselineScorerVersion,
  };

  return {
    sourcePath: "baseline.json",
    metadataDeltas: metadataDeltas(current, baseline),
    aggregateDeltas: {},
    caseDeltas: Array.from({ length: caseDeltaCount }, (_unused, index) => ({
      cohortId: "cohort",
      caseId: `case_${index}`,
      changes: ["score"],
    })),
  };
}

describe("fit calibration baseline gate", () => {
  test("fails the run when the baseline scorer version no longer matches the build", () => {
    // The exact state this branch shipped in: a scorer v5 baseline compared
    // against a v8 run, so all 52 cases read as changed and the diff could no
    // longer surface an unintended regression.
    const comparison = comparisonFor(8, 5, 52);

    expect(baselineGateFailures(comparison)).toEqual([
      "baseline scorerVersion is 5 but this run is 8",
    ]);
    expect(decideExitCode({ passed: true }, false, comparison)).toBe(1);
  });

  test("passes when the baseline matches the build, even with case deltas", () => {
    // Case-level deltas stay informational: an intentional scoring change is
    // expected to bump the scorer version, which is what is gated above.
    const comparison = comparisonFor(8, 8, 3);

    expect(baselineGateFailures(comparison)).toEqual([]);
    expect(decideExitCode({ passed: true }, false, comparison)).toBe(0);
  });

  test("keeps the quality gates and --report-only behaviour unchanged", () => {
    expect(decideExitCode({ passed: false }, false, comparisonFor(8, 8))).toBe(
      1,
    );
    expect(decideExitCode({ passed: true }, false, null)).toBe(0);
    expect(decideExitCode({ passed: false }, true, null)).toBe(0);
    expect(decideExitCode({ passed: true }, true, comparisonFor(8, 5))).toBe(0);
  });

  test("reports no baseline failures when no baseline was supplied", () => {
    expect(baselineGateFailures(null)).toEqual([]);
    expect(baselineGateFailures(undefined)).toEqual([]);
  });
});
