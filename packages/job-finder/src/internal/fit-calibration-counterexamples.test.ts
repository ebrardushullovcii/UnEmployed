import { describe, expect, test } from "vitest";

import { FIT_CALIBRATION_CORPUS } from "./fit-calibration-corpus";
import {
  hardConflictRecommendationFailure,
  runFitCalibrationCounterexamples,
} from "./fit-calibration-counterexamples";

const EXPECTED_COUNTEREXAMPLE_IDS = [
  "easy_apply_fit_neutral",
  "consent_interrupt_fit_neutral",
  "unknown_pay_neutral",
  "foreign_pay_neutral",
  "below_pay_ranks_lower",
  "required_evidence_monotonic",
  "exact_role_beats_wrong_family",
  "hard_conflict_never_unqualified",
  "card_only_requires_review",
  "misleading_sales_title_below_real_role",
  "remote_geography_truth",
  "clearance_unknown_requires_review",
  "keyword_stuffing_cannot_rescue_wrong_family",
  "preferred_company_bounded",
  "negative_evidence_is_supportable",
  "session_semantic_equivalence",
  "reversed_input_stability",
  "talent_pool_not_actionable",
] as const;

describe("fit calibration counterexamples", () => {
  test("keeps every named invariant unique and self-explaining", () => {
    const counterexamples = runFitCalibrationCounterexamples(
      FIT_CALIBRATION_CORPUS,
    );

    expect(counterexamples.map((entry) => entry.id)).toEqual(
      EXPECTED_COUNTEREXAMPLE_IDS,
    );
    expect(counterexamples).toHaveLength(EXPECTED_COUNTEREXAMPLE_IDS.length);
    expect(new Set(counterexamples.map((entry) => entry.id)).size).toBe(
      counterexamples.length,
    );
    expect(
      counterexamples.every(
        (entry) =>
          entry.description.trim().length >= 24 &&
          entry.passed === (entry.failures.length === 0),
      ),
    ).toBe(true);
  });

  test("requires skip for every labeled hard-conflict recommendation", () => {
    expect(hardConflictRecommendationFailure("case", "skip")).toBeNull();
    const nonSkipRecommendations = [
      "strong_fit",
      "apply_with_original",
      "review_before_applying",
    ] as const;

    expect(
      nonSkipRecommendations.map((recommendation) =>
        hardConflictRecommendationFailure("case", recommendation),
      ),
    ).toEqual(["not_skipped:case", "not_skipped:case", "not_skipped:case"]);
  });

  test("reports every quality miss with a concrete failure instead of rewriting labels", () => {
    const counterexamples = runFitCalibrationCounterexamples(
      FIT_CALIBRATION_CORPUS,
    );
    const failed = counterexamples.filter((entry) => !entry.passed);

    expect(failed.every((entry) => entry.failures.length > 0)).toBe(true);
    expect(
      FIT_CALIBRATION_CORPUS.cohorts.flatMap((cohort) => cohort.cases),
    ).toHaveLength(52);
  });
});
