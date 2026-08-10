import { describe, expect, test } from "vitest";

import { FIT_CALIBRATION_CORPUS } from "./fit-calibration-corpus";
import {
  calculateNdcgAt,
  calculatePrecisionAt,
  calculateQuadraticWeightedKappa,
  calculateRecallAt,
  decideFitCalibrationExitCode,
  normalizedFitCalibrationRequirementLabelsMatch,
  resolveFitCalibrationThresholds,
  runFitCalibrationBenchmark,
  validateFitCalibrationCorpus,
  validateFitCalibrationThresholdOverrides,
} from "./fit-calibration-benchmark";
import type { FitCalibrationCorpus } from "./fit-calibration-types";

const FIXED_REPORT_TIME = "2026-07-30T00:00:00.000Z";

describe("fit calibration corpus and benchmark", () => {
  test("keeps the versioned four-persona corpus independently labeled and valid", () => {
    const cases = FIT_CALIBRATION_CORPUS.cohorts.flatMap(
      (cohort) => cohort.cases,
    );

    expect(validateFitCalibrationCorpus(FIT_CALIBRATION_CORPUS)).toEqual([]);
    expect(FIT_CALIBRATION_CORPUS.cohorts).toHaveLength(4);
    expect(cases).toHaveLength(52);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(52);
    expect(
      cases.every(
        (entry) =>
          entry.label.rationale.trim() !== entry.posting.description.trim(),
      ),
    ).toBe(true);
  });

  test("calculates ranking and agreement metrics with standard bounded math", () => {
    expect(calculateNdcgAt([3, 2, 1, 0], 10)).toBe(1);
    expect(calculateNdcgAt([0, 1, 2, 3], 10)).toBeLessThan(1);
    expect(calculatePrecisionAt([3, 2, 1, 0, 0], 5)).toBe(0.4);
    expect(calculateRecallAt([3, 1, 2, 0, 2], 3)).toBeCloseTo(2 / 3);
    expect(
      calculateQuadraticWeightedKappa(
        ["reject", "review", "consider", "promote"],
        ["reject", "review", "consider", "promote"],
      ),
    ).toBe(1);
    expect(
      calculateQuadraticWeightedKappa(
        ["reject", "reject", "promote", "promote"],
        ["promote", "promote", "reject", "reject"],
      ),
    ).toBeLessThan(0);
  });

  test("matches requirement expectations by exact normalized labels", () => {
    expect(normalizedFitCalibrationRequirementLabelsMatch("Go", " go ")).toBe(
      true,
    );
    expect(
      normalizedFitCalibrationRequirementLabelsMatch("Node.js", "NODE JS"),
    ).toBe(true);
    expect(
      normalizedFitCalibrationRequirementLabelsMatch("Go", "MongoDB"),
    ).toBe(false);
    expect(normalizedFitCalibrationRequirementLabelsMatch("SQL", "NoSQL")).toBe(
      false,
    );
    expect(normalizedFitCalibrationRequirementLabelsMatch("...", "...")).toBe(
      false,
    );
  });

  test("rejects malformed or unknown threshold overrides before evaluation", () => {
    expect(validateFitCalibrationThresholdOverrides(undefined)).toEqual([]);
    expect(
      validateFitCalibrationThresholdOverrides({
        maxHardConflictsInTopFive: -1,
        minMacroNdcgAtTen: 1.01,
        requireDeterministicReplay: "yes",
        surpriseGate: 1,
      }),
    ).toEqual([
      "unknown_threshold:surpriseGate",
      "invalid_ratio_threshold:minMacroNdcgAtTen",
      "invalid_count_threshold:maxHardConflictsInTopFive",
      "invalid_boolean_threshold:requireDeterministicReplay",
    ]);
    expect(() =>
      resolveFitCalibrationThresholds({ minDispositionAgreement: Number.NaN }),
    ).toThrow(/invalid_ratio_threshold:minDispositionAgreement/u);
  });

  test("produces a deterministic bounded report without mutating labels", () => {
    const first = runFitCalibrationBenchmark({
      corpus: FIT_CALIBRATION_CORPUS,
      generatedAt: FIXED_REPORT_TIME,
    });
    const second = runFitCalibrationBenchmark({
      corpus: FIT_CALIBRATION_CORPUS,
      generatedAt: FIXED_REPORT_TIME,
    });

    expect(first.aggregate.caseCount).toBe(52);
    expect(first.aggregate.cohortCount).toBe(4);
    expect(first.aggregate.deterministicReplay).toBe(true);
    expect(
      first.cohorts.map((cohort) => cohort.cases.map((entry) => entry.id)),
    ).toEqual(
      second.cohorts.map((cohort) => cohort.cases.map((entry) => entry.id)),
    );
    expect(first.gateFailures).toEqual(second.gateFailures);
    expect(first.passed).toBe(first.gateFailures.length === 0);
  });

  test("gates every explicit dimension, requirement, or hard-conflict expectation at zero tolerance", () => {
    const firstCohort = FIT_CALIBRATION_CORPUS.cohorts[0]!;
    const firstCase = firstCohort.cases[0]!;
    const corpusWithImpossibleExpectation: FitCalibrationCorpus = {
      ...FIT_CALIBRATION_CORPUS,
      cohorts: [
        {
          ...firstCohort,
          cases: [
            {
              ...firstCase,
              label: {
                ...firstCase.label,
                expectedRequirements: [
                  {
                    label: "Definitely absent requirement",
                    allowedStatuses: ["supported"],
                  },
                ],
              },
            },
            ...firstCohort.cases.slice(1),
          ],
        },
        ...FIT_CALIBRATION_CORPUS.cohorts.slice(1),
      ],
    };

    const report = runFitCalibrationBenchmark({
      corpus: corpusWithImpossibleExpectation,
      generatedAt: FIXED_REPORT_TIME,
    });
    const affectedCase = report.cohorts
      .flatMap((cohort) => cohort.cases)
      .find((entry) => entry.id === firstCase.id);

    expect(report.aggregate.explicitCaseExpectationFailures).toBeGreaterThan(0);
    expect(report.gateFailures).toContain("explicit_case_expectations");
    expect(affectedCase?.explicitExpectationFailureCodes).toContain(
      "missing_expected_requirement:Definitely absent requirement",
    );
  });

  test("keeps CLI exit behavior explicit for report-only diagnostics", () => {
    expect(decideFitCalibrationExitCode({ passed: true }, false)).toBe(0);
    expect(decideFitCalibrationExitCode({ passed: false }, true)).toBe(0);
    expect(decideFitCalibrationExitCode({ passed: false }, false)).toBe(1);
  });
});
