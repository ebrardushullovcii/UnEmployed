import type {
  ApplicationEffortLevel,
  CompensationFitState,
  EvidenceConfidenceLevel,
  JobRequirementAssessment,
  JobRequirementEvidenceStatus,
  MatchAssessment,
  MatchDimensionEvidence,
  PreferenceAlignmentState,
  RoleSuitabilityState,
} from "@unemployed/contracts";
import type { BadgeTone } from "../lib/job-finder-types";
import { fitRecommendationCopy } from "../lib/match-assessment-presentation";
import { StatusBadge } from "./status-badge";

const roleSuitabilityCopy: Record<
  RoleSuitabilityState,
  { label: string; tone: BadgeTone }
> = {
  unknown: { label: "Unknown", tone: "neutral" },
  exact: { label: "Strong match", tone: "positive" },
  adjacent: { label: "Partial match", tone: "active" },
  conflict: { label: "Role conflict", tone: "critical" },
};

const preferenceAlignmentCopy: Record<
  PreferenceAlignmentState,
  { label: string; tone: BadgeTone }
> = {
  unknown: { label: "Unknown", tone: "neutral" },
  not_configured: { label: "Not set", tone: "muted" },
  aligned: { label: "Aligned", tone: "positive" },
  mixed: { label: "Mixed", tone: "active" },
  conflict: { label: "Outside preferences", tone: "critical" },
};

const compensationCopy: Record<
  CompensationFitState,
  { label: string; tone: BadgeTone }
> = {
  not_requested: { label: "Not requested", tone: "muted" },
  unknown: { label: "Pay unknown", tone: "neutral" },
  meets_minimum: { label: "Meets minimum", tone: "positive" },
  below_minimum: { label: "Below minimum", tone: "critical" },
  currency_incomparable: { label: "Currency not compared", tone: "neutral" },
};

const applicationEffortCopy: Record<
  ApplicationEffortLevel,
  { label: string; tone: BadgeTone }
> = {
  unknown: { label: "Unknown", tone: "muted" },
  low: { label: "Lower effort", tone: "neutral" },
  moderate: { label: "Typical effort", tone: "neutral" },
  high: { label: "Higher effort", tone: "critical" },
};

const evidenceConfidenceCopy: Record<
  EvidenceConfidenceLevel,
  { label: string; tone: BadgeTone }
> = {
  unavailable: { label: "Unavailable", tone: "muted" },
  low: { label: "Low coverage", tone: "critical" },
  moderate: { label: "Medium coverage", tone: "neutral" },
  high: { label: "High coverage", tone: "active" },
};

const statusCopy: Record<
  JobRequirementEvidenceStatus,
  { label: string; tone: BadgeTone }
> = {
  supported: { label: "Supported", tone: "positive" },
  partial: { label: "Partial", tone: "active" },
  missing: { label: "Missing", tone: "critical" },
  unknown: { label: "Unknown", tone: "neutral" },
  conflict: { label: "Conflict", tone: "critical" },
};

interface DimensionRowProps {
  evidence: readonly MatchDimensionEvidence[];
  explanation: string;
  id: string;
  label: string;
  status: { label: string; tone: BadgeTone };
}

function DimensionRow({
  evidence,
  explanation,
  id,
  label,
  status,
}: DimensionRowProps) {
  const primaryEvidence = evidence[0];

  return (
    <div
      className="grid min-w-0 gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/25 px-3 py-3"
      data-testid={`fit-dimension-${id}`}
    >
      <dt className="min-w-0 text-(length:--text-small) font-medium text-(--text-headline)">
        {label}
      </dt>
      <dd className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <StatusBadge className="shrink-0" tone={status.tone}>
            {status.label}
          </StatusBadge>
          <p className="min-w-0 flex-1 break-words text-(length:--text-small) leading-6 text-foreground-soft">
            {explanation}
          </p>
        </div>
        {primaryEvidence ? (
          <p className="break-words text-(length:--text-tiny) leading-5 text-foreground-muted">
            <span className="font-medium text-foreground-soft">Evidence:</span>{" "}
            {primaryEvidence.label} — {primaryEvidence.detail}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

function RequirementRow({
  requirement,
}: {
  requirement: JobRequirementAssessment;
}) {
  const status = statusCopy[requirement.status];

  return (
    <li className="grid gap-3 border-t border-(--surface-panel-border) py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <strong className="text-(length:--text-small) text-(--text-headline)">
              {requirement.label}
            </strong>
            <span className="rounded-full border border-(--surface-panel-border) px-2 py-0.5 text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">
              {requirement.importance}
            </span>
          </div>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {requirement.explanation}
          </p>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>

      <div className="grid gap-1.5 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/25 px-3 py-2.5">
        <span className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">
          Listing says
        </span>
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          “{requirement.jobEvidence}”
        </p>
      </div>

      <div className="grid gap-2">
        <span className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-foreground-muted">
          Resume evidence
        </span>
        {requirement.resumeEvidence.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {requirement.resumeEvidence.slice(0, 2).map((evidence) => (
              <li
                className="grid gap-0.5 border-l-2 border-primary/35 pl-3"
                key={`${requirement.id}_${evidence.sourceKind}_${evidence.sourceId ?? evidence.label}`}
              >
                <strong className="text-(length:--text-small) font-medium text-foreground">
                  {evidence.label}
                </strong>
                <span className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {evidence.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-(length:--text-small) leading-6 text-foreground-muted">
            No explicit evidence was located in the imported resume.
          </p>
        )}
      </div>
    </li>
  );
}

interface MatchEvidenceMatrixProps {
  assessment: MatchAssessment;
  showRecommendation?: boolean;
}

export function MatchEvidenceMatrix({
  assessment,
  showRecommendation = true,
}: MatchEvidenceMatrixProps) {
  const requirements = assessment.requirements ?? [];
  const recommendation =
    fitRecommendationCopy[
      assessment.recommendation ?? "review_before_applying"
    ];
  const supportedCount = requirements.filter(
    (requirement) => requirement.status === "supported",
  ).length;
  const requiredGapCount = requirements.filter(
    (requirement) =>
      requirement.importance === "required" &&
      requirement.status !== "supported",
  ).length;
  const hasDetailedFitEvidence =
    assessment.scorerVersion >= 3 || requirements.length > 0;
  const legacyReasons = assessment.reasons.filter(
    (reason) => reason.trim().length > 0,
  );
  const legacyGaps = assessment.gaps.filter((gap) => gap.trim().length > 0);
  const showLegacySummary =
    !hasDetailedFitEvidence &&
    (legacyReasons.length > 0 || legacyGaps.length > 0);
  const roleSuitability = assessment.dimensions?.roleSuitability ?? {
    state: "unknown" as const,
    explanation:
      "Role suitability has not been assessed from saved target roles.",
    evidence: [],
  };
  const preferenceAlignment = assessment.dimensions?.preferenceAlignment ?? {
    state: "unknown" as const,
    explanation:
      "Preference alignment has not been assessed from saved search preferences.",
    evidence: [],
  };
  const applicationEffort = assessment.dimensions?.applicationEffort ?? {
    level: "unknown" as const,
    explanation:
      "The listing does not provide enough application-path evidence to estimate effort.",
    evidence: [],
  };
  const evidenceConfidence = assessment.dimensions?.evidenceConfidence ?? {
    level: "unavailable" as const,
    explanation:
      "No supportability assessment is available for the extracted evidence.",
    evidence: [],
  };
  const compensationFit = assessment.compensationFit ?? {
    state: "unknown" as const,
    explanation:
      "The listing does not provide comparable compensation evidence.",
  };

  return (
    <section
      aria-labelledby="fit-breakdown-heading"
      className="surface-card-tint grid min-w-0 gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-4"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3
            className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground"
            id="fit-breakdown-heading"
          >
            Fit breakdown
          </h3>
          <strong className="break-words text-(length:--text-body) text-(--text-headline)">
            Five checks to review before you shortlist
          </strong>
        </div>
        {showRecommendation ? (
          <StatusBadge tone={recommendation.tone}>
            {recommendation.label}
          </StatusBadge>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          {assessment.recommendationRationale ??
            "Review the listing and resume evidence before applying."}
        </p>
        <p className="text-(length:--text-tiny) leading-5 text-foreground-muted">
          Application effort never raises fit. Evidence coverage describes how
          much explicit information backs the assessment, not your hiring odds.
        </p>
      </div>

      {showLegacySummary ? (
        <div
          className="grid min-w-0 gap-4 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/25 px-3 py-3"
          data-testid="legacy-fit-summary"
        >
          <p className="text-(length:--text-small) font-medium text-(--text-headline)">
            Evidence saved with this assessment
          </p>
          {legacyReasons.length > 0 ? (
            <div className="grid min-w-0 gap-2">
              <h4 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                Why it may fit
              </h4>
              <ul className="m-0 grid min-w-0 gap-2 pl-5 text-(length:--text-small) leading-6 text-foreground-soft">
                {legacyReasons.map((reason, index) => (
                  <li className="break-words" key={`${index}_${reason}`}>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {legacyGaps.length > 0 ? (
            <div className="grid min-w-0 gap-2">
              <h4 className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                Questions to review
              </h4>
              <ul className="m-0 grid min-w-0 gap-2 pl-5 text-(length:--text-small) leading-6 text-foreground-soft">
                {legacyGaps.map((gap, index) => (
                  <li className="break-words" key={`${index}_${gap}`}>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <dl className="grid min-w-0 gap-2" data-testid="fit-dimensions">
        <DimensionRow
          evidence={roleSuitability.evidence}
          explanation={roleSuitability.explanation}
          id="role-suitability"
          label="Role and requirements"
          status={roleSuitabilityCopy[roleSuitability.state]}
        />
        <DimensionRow
          evidence={preferenceAlignment.evidence}
          explanation={preferenceAlignment.explanation}
          id="preference-alignment"
          label="Your preferences"
          status={preferenceAlignmentCopy[preferenceAlignment.state]}
        />
        <DimensionRow
          evidence={[]}
          explanation={compensationFit.explanation}
          id="compensation"
          label="Compensation"
          status={compensationCopy[compensationFit.state]}
        />
        <DimensionRow
          evidence={applicationEffort.evidence}
          explanation={applicationEffort.explanation}
          id="application-effort"
          label="Application effort"
          status={applicationEffortCopy[applicationEffort.level]}
        />
        <DimensionRow
          evidence={evidenceConfidence.evidence}
          explanation={evidenceConfidence.explanation}
          id="evidence-confidence"
          label="Evidence coverage"
          status={evidenceConfidenceCopy[evidenceConfidence.level]}
        />
      </dl>

      {requiredGapCount > 0 ? (
        <div className="rounded-(--radius-small) border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-(length:--text-small) leading-6 text-destructive">
          {requiredGapCount} required item{requiredGapCount === 1 ? "" : "s"}{" "}
          still {requiredGapCount === 1 ? "needs" : "need"} evidence or conflict
          with the saved profile.
        </div>
      ) : null}

      {requirements.length > 0 ? (
        <details className="min-w-0 rounded-(--radius-small) border border-(--surface-panel-border) px-3 py-3">
          <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground-soft">
            Review requirement evidence — {supportedCount} of{" "}
            {requirements.length} supported
          </summary>
          <ul className="m-0 mt-4 grid list-none p-0">
            {requirements.map((requirement) => (
              <RequirementRow key={requirement.id} requirement={requirement} />
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-(length:--text-small) leading-6 text-foreground-muted">
          Requirement-by-requirement evidence is unavailable for this listing.
        </p>
      )}
    </section>
  );
}
