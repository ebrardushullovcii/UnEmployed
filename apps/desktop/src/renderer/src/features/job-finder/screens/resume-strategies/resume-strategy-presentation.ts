import type {
  ResumeStrategy,
  ResumeStrategyCoveragePolicy,
  ResumeStrategyEvidenceBoundaries,
  ResumeStrategyHeadlinePolicy,
  ResumeStrategySkillsPolicy,
  ResumeTemplateId,
} from "@unemployed/contracts";
import type { TailoringMode } from "@unemployed/contracts";

export const resumeTemplateLabels: Record<ResumeTemplateId, string> = {
  classic_ats: "Chronology Classic (ATS)",
  modern_split: "Modern Split",
  compact_exec: "Compact Executive",
  technical_matrix: "Technical Matrix",
  project_showcase: "Project Showcase",
  credentials_focus: "Credentials Focus",
  timeline_longform: "Timeline Longform",
  career_pivot: "Career Pivot",
};

export const resumeHeadlinePolicyLabels: Record<
  ResumeStrategyHeadlinePolicy,
  string
> = {
  fixed: "Fixed headline (unchanged)",
  role_family_template: "Role-family template headline",
  per_job_tailored: "Tailored per job",
};

export const resumeSkillsPolicyLabels: Record<
  ResumeStrategySkillsPolicy,
  string
> = {
  base_only: "Base resume skills only",
  role_family_expanded: "Role-family expanded skills",
  per_job_tailored: "Tailored per job",
};

export const resumeCoveragePolicyLabels: Record<
  ResumeStrategyCoveragePolicy,
  string
> = {
  base_omissions: "Cover base-resume omissions",
  role_family_recommended: "Role-family recommended coverage",
  full_tailoring: "Full per-job tailoring",
};

export const resumeTailoringStrengthLabels: Record<TailoringMode, string> = {
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export function describeEvidenceBoundaries(
  boundaries: ResumeStrategyEvidenceBoundaries,
): string {
  const parts: string[] = [];
  parts.push(
    boundaries.allowExactClaims
      ? "Exact claims allowed"
      : "Exact claims blocked",
  );
  parts.push(
    boundaries.allowParaphrasedClaims
      ? "Paraphrased claims allowed"
      : "Paraphrased claims blocked",
  );
  parts.push(
    `Up to ${boundaries.maxEvidenceRefsPerBullet} evidence refs per bullet`,
  );
  parts.push(
    boundaries.requireVerifierPass
      ? "Verifier pass required"
      : "Verifier pass not required",
  );
  return parts.join(" · ");
}

export function strategySearchTokens(strategy: ResumeStrategy): string[] {
  return [
    strategy.name,
    strategy.roleFamily,
    strategy.templateId,
    strategy.headlinePolicy,
    strategy.skillsPolicy,
    strategy.coveragePolicy,
    strategy.tailoringStrength,
    strategy.enabled ? "enabled" : "disabled",
    strategy.baseResumeDocumentId,
  ];
}

/**
 * Display-only normalization for persisted selection/recommendation reasons.
 * Older records were stored with the word "strategy"; the product now calls
 * the same object a "resume approach". Stored history is never rewritten —
 * this only rewords provenance text at render time.
 */
export function formatPersistedStrategyReason(reason: string): string {
  return reason
    .replace(/\bstrategies\b/gi, (match) =>
      match.startsWith("S") ? "Approaches" : "approaches",
    )
    .replace(/\bstrategy\b/gi, (match) =>
      match.startsWith("S") ? "Approach" : "approach",
    );
}
