import type {
  FitRecommendation,
  JobRequirementEvidenceStatus,
  RoleSuitabilityState,
  SavedJob,
} from "@unemployed/contracts";
import type { BadgeTone } from "./job-finder-types";
import { isProvisionalMatchAssessment } from "@unemployed/job-finder/discovery-ordering";
import {
  FIT_TITLE_ONLY_REASON,
  getFitEvidenceDepth,
  type FitEvidenceDepth,
} from "@unemployed/job-finder/discovery-result-bands";

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
 * Evidence depth and the title-only reason now live in
 * `@unemployed/job-finder/discovery-result-bands`, so a finished run's frozen
 * counts and this screen apply one rule. Re-exported because the renderer
 * already imports both from here.
 */
export {
  FIT_TITLE_ONLY_REASON,
  getFitEvidenceDepth,
  type FitEvidenceDepth,
};

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
 * The one label a title-only row is allowed to use, everywhere it appears.
 *
 * The list line used to read "title match only, not scored" while the
 * inspector read "Title-only estimate: 64%" for the same job — one screen
 * saying the job was not scored above a screen printing its score. Both lines
 * are built from this label now, so they name the same estimate.
 */
export const FIT_TITLE_ONLY_LABEL = "Title-only estimate";

/**
 * Why several unrelated jobs can print the same number. The score stopped at
 * a ceiling an unresolved gap imposed, so it is the most this listing can
 * earn rather than a measurement that happens to tie.
 */
export const FIT_UPPER_BOUND_REASON =
  "This is the most this job can score while the gaps below are unresolved, so other jobs can show the same number.";

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
      headlineScoreAriaLabel: `Overall fit: ${FIT_TITLE_ONLY_LABEL.toLowerCase()}`,
      headlineScoreLabel: FIT_TITLE_ONLY_LABEL,
      withheldReason: FIT_TITLE_ONLY_REASON,
      breakdownScoreLabel: `${FIT_TITLE_ONLY_LABEL}: ${job.matchAssessment.score}%`,
    };
  }

  // A ceiling is not a measurement: the number is the most this listing can
  // earn while its gaps stand, which is why unrelated jobs kept printing the
  // same "71% fit".
  if (job.matchAssessment.scoreIsUpperBound) {
    return {
      isProvisional,
      isTitleOnly,
      isScoreWithheld,
      headlineScoreAriaLabel: `Overall fit: up to ${job.matchAssessment.score} percent`,
      headlineScoreLabel: `Up to ${job.matchAssessment.score}% fit`,
      withheldReason: FIT_UPPER_BOUND_REASON,
      breakdownScoreLabel: `Up to ${job.matchAssessment.score}% fit`,
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

export const roleSuitabilityCopy: Record<
  RoleSuitabilityState,
  { label: string; tone: BadgeTone }
> = {
  unknown: { label: "Unknown", tone: "neutral" },
  exact: { label: "Strong match", tone: "positive" },
  adjacent: { label: "Partial match", tone: "active" },
  conflict: { label: "Role conflict", tone: "critical" },
};

/**
 * The "Role and requirements" verdict, derived from the requirement evidence
 * that is printed directly beneath it.
 *
 * The title verdict alone used to write this line, so a listing whose title
 * matched exactly read "Strong match" above "1 of 3 supported" — two lines
 * about the same thing, disagreeing. The evidence count now decides: the
 * headline can only be as strong as the requirements that actually stand.
 */
export function getRoleAndRequirementsStatus(
  roleSuitability: RoleSuitabilityState,
  requirements: readonly { status: JobRequirementEvidenceStatus }[],
): { label: string; tone: BadgeTone } {
  const titleVerdict = roleSuitabilityCopy[roleSuitability];
  // A role-family conflict is already the worst verdict, and with no
  // requirements to read there is nothing that could contradict the title.
  if (roleSuitability === "conflict" || requirements.length === 0) {
    return titleVerdict;
  }

  const supportedCount = requirements.filter(
    (requirement) => requirement.status === "supported",
  ).length;
  if (supportedCount === requirements.length) {
    return titleVerdict;
  }
  if (supportedCount === 0) {
    return { label: "Needs evidence", tone: "critical" };
  }
  // Part of the evidence stands, so the line can never say "Strong match".
  return roleSuitability === "exact"
    ? roleSuitabilityCopy.adjacent
    : titleVerdict;
}
