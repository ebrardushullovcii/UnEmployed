import type {
  FitRecommendation,
  MatchAssessment,
  SavedJob,
} from "@unemployed/contracts";
import type { BadgeTone } from "./job-finder-types";
import { isProvisionalMatchAssessment } from "@unemployed/job-finder/discovery-ordering";

export const fitRecommendationCopy: Record<
  FitRecommendation,
  { label: string; tone: BadgeTone }
> = {
  strong_fit: { label: "Strong fit", tone: "positive" },
  apply_with_original: { label: "Original resume is credible", tone: "active" },
  review_before_applying: {
    label: "Review before applying",
    tone: "neutral",
  },
  skip: { label: "Skip — hard conflict", tone: "critical" },
};

/**
 * How much of the score was actually verified against evidence.
 *
 * A headline "54% fit" printed above "The listing text was not captured",
 * "Salary not stated" and "Location not stated" is a number the app cannot
 * stand behind. This is the single place that decides whether a percentage
 * has been earned, so the row, the inspector and the breakdown cannot
 * disagree.
 */
export interface FitEvidenceDepth {
  /** Nothing beyond the listing title/card was checkable. */
  isTitleOnly: boolean;
  /** One-line explanation for a title-only score. */
  reason: string;
  verifiedDimensionCount: number;
}

export const FIT_TITLE_ONLY_REASON =
  "Only the listing title could be checked — no pay, location, or requirements were captured. Copy the listing link to check the rest.";

export function getFitEvidenceDepth(
  assessment: MatchAssessment,
): FitEvidenceDepth {
  // Every field is read defensively: this runs for every row on the screen,
  // including legacy and partial payloads that were cast past the schema
  // boundary. A missing dimension counts as "not verified", never as a crash.
  const dimensions = assessment.dimensions;
  const roleSuitability = dimensions?.roleSuitability?.state;
  const preferenceAlignment = dimensions?.preferenceAlignment?.state;
  const evidenceConfidence = dimensions?.evidenceConfidence?.level;
  const compensationFit = assessment.compensationFit?.state;
  // A requirement only counts once it was actually decided against captured
  // listing evidence. The existence of a row proves nothing: the scorer emits
  // a location requirement purely because the user saved a place, and its
  // status stays "unknown" when the listing never stated one. Saved
  // location/work-mode comparisons are preference checks rather than proof
  // that the listing exposed anything, exactly as the evidence-confidence
  // dimension already treats them.
  const decidedRequirementCount = (assessment.requirements ?? []).filter(
    (requirement) =>
      (requirement?.status === "supported" ||
        requirement?.status === "partial" ||
        requirement?.status === "missing" ||
        requirement?.status === "conflict") &&
      requirement?.category !== "location" &&
      requirement?.category !== "work_mode",
  ).length;
  const verifiedChecks = [
    decidedRequirementCount > 0,
    roleSuitability === "exact" || roleSuitability === "conflict",
    // "mixed" is not evidence on its own: it is also the state produced when
    // one saved preference aligned and the rest of the listing was blank.
    preferenceAlignment === "aligned" || preferenceAlignment === "conflict",
    compensationFit === "meets_minimum" || compensationFit === "below_minimum",
    evidenceConfidence === "moderate" || evidenceConfidence === "high",
  ];
  const verifiedDimensionCount = verifiedChecks.filter(Boolean).length;

  return {
    isTitleOnly: verifiedDimensionCount === 0,
    reason: FIT_TITLE_ONLY_REASON,
    verifiedDimensionCount,
  };
}

export interface MatchAssessmentPresentation {
  /**
   * The assessment is not bound to the current profile and posting (a legacy
   * row or an offline catalog seed), so it describes some other state of the
   * world.
   */
  isProvisional: boolean;
  /** Nothing beyond the listing title was checkable. */
  isTitleOnly: boolean;
  /**
   * No percentage may be printed as a headline. True for both of the states
   * above; every surface reads this one flag rather than re-deriving it.
   */
  isScoreWithheld: boolean;
  /**
   * The headline verdict. Never a percentage unless the number was earned:
   * a withheld score reads "Title match only" or "Fit not assessed" instead.
   */
  headlineScoreAriaLabel: string;
  headlineScoreLabel: string;
  /**
   * What is missing and what would change it. Null when the score stands on
   * its own evidence.
   */
  withheldReason: string | null;
  /**
   * The raw number with its own qualifier, for use *inside* the scoring
   * breakdown only — never as the row or inspector headline. Null when there
   * is no defensible number to show at all.
   */
  breakdownScoreLabel: string | null;
}

export const FIT_UNASSESSED_REASON =
  "This listing has not been checked against your current profile and the current listing text yet.";

/**
 * Keeps the confidence qualifier next to every renderer score. A missing
 * binding, an offline catalog row, or a listing whose only readable evidence
 * was its own title can still be reviewed, but none of them earns a
 * percentage in the headline position.
 */
export function getMatchAssessmentPresentation(
  job: Pick<SavedJob, "discoveryMethod" | "matchAssessment">,
): MatchAssessmentPresentation {
  const hasAssessmentBinding = [
    job.matchAssessment.contextFingerprint,
    job.matchAssessment.postingFingerprint,
  ].every(
    (fingerprint) =>
      typeof fingerprint === "string" && fingerprint.trim().length > 0,
  );
  // Renderer presentation fails closed for legacy or malformed payloads that
  // may have been cast past the schema boundary. A score without both binding
  // fingerprints is never presented as an authoritative current assessment.
  const isProvisional =
    isProvisionalMatchAssessment(job) || !hasAssessmentBinding;
  const isTitleOnly = getFitEvidenceDepth(job.matchAssessment).isTitleOnly;
  const isScoreWithheld = isProvisional || isTitleOnly;

  if (isProvisional) {
    return {
      isProvisional,
      isTitleOnly,
      isScoreWithheld,
      headlineScoreAriaLabel: "Overall fit: not assessed",
      headlineScoreLabel: "Fit not assessed",
      withheldReason: FIT_UNASSESSED_REASON,
      // An unbound assessment describes some other profile or listing text,
      // so even a qualified number would be misleading.
      breakdownScoreLabel: null,
    };
  }

  if (isTitleOnly) {
    return {
      isProvisional,
      isTitleOnly,
      isScoreWithheld,
      headlineScoreAriaLabel: "Overall fit: title match only, not scored",
      headlineScoreLabel: "Title match only",
      withheldReason: FIT_TITLE_ONLY_REASON,
      breakdownScoreLabel: `Title-only estimate: ${job.matchAssessment.score}%`,
    };
  }

  return {
    isProvisional,
    isTitleOnly,
    isScoreWithheld,
    headlineScoreAriaLabel: `Overall fit: ${job.matchAssessment.score} percent`,
    headlineScoreLabel: `${job.matchAssessment.score}% fit`,
    withheldReason: null,
    breakdownScoreLabel: `${job.matchAssessment.score}% fit`,
  };
}
