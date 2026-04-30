import type {
  JobFinderResumeWorkspace,
  ResumeDraft,
} from "@unemployed/contracts";
import { StatusBadge } from "../../components/status-badge";
import { formatNormalizedCompensation } from "../../lib/normalized-compensation";
import {
  formatDraftStatusLabel,
  formatOptionalDate,
  toDraftStatusTone,
} from "./resume-workspace-utils";

interface ResumeWorkspaceSidebarProps {
  draft: ResumeDraft;
  hasUnsavedChanges: boolean;
  workspace: JobFinderResumeWorkspace;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatHostLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return truncateText(value, 42);
  }
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function ResumeWorkspaceSidebar({
  draft,
  hasUnsavedChanges,
  workspace,
}: ResumeWorkspaceSidebarProps) {
  const { job, research, sharedProfile, validation } = workspace;
  const researchCount = research.length;
  const validationCount = validation?.issues.length ?? 0;
  const normalizedCompensation = formatNormalizedCompensation(
    job.normalizedCompensation,
  );
  const roleSnapshot = [
    job.salaryText ? `Compensation: ${job.salaryText}` : null,
    normalizedCompensation ? `Normalized: ${normalizedCompensation}` : null,
    job.team ? `Team: ${job.team}` : null,
    job.department ? `Department: ${job.department}` : null,
  ].filter(Boolean) as string[];
  const targetingCues = [
    ...job.keywordSignals.slice(0, 3).map((signal) => signal.label),
    ...job.responsibilities.slice(0, 2),
    ...job.minimumQualifications.slice(0, 2),
  ];
  const profileSummary = truncateText(
    firstNonEmpty(
      sharedProfile.narrativeSummary,
      sharedProfile.selfIntroduction,
      sharedProfile.nextChapterSummary,
    ),
    180,
  );
  const highlightedProof = sharedProfile.highlightedProofs[0] ?? null;
  const screeningSummary = truncateText(
    firstNonEmpty(
      job.screeningHints.sponsorshipText,
      job.screeningHints.relocationText,
      job.screeningHints.travelText,
      job.screeningHints.remoteGeographies[0]
        ? `Remote geography: ${job.screeningHints.remoteGeographies[0]}`
        : null,
    ),
    120,
  );
  const targetingSummary = truncateText(
    targetingCues.slice(0, 3).join(" • "),
    145,
  );
  const leadResearch = research[0] ?? null;
  const employerHost = formatHostLabel(job.employerWebsiteUrl);
  const applicationHost = formatHostLabel(job.applicationUrl);
  const titleId = "resume-workspace-job-context-title";

  return (
    <aside
      aria-labelledby={titleId}
      className="surface-panel-shell relative grid min-h-0 min-w-0 gap-3 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-(--resume-sidebar-padding)"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          id={titleId}
          className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary"
        >
          Job context
        </p>
        <StatusBadge tone={toDraftStatusTone(draft.status)}>
          {formatDraftStatusLabel(draft.status)}
        </StatusBadge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-soft">
        <p>
          {researchCount === 1 ? "Saved source" : "Saved sources"}:{" "}
          {researchCount}
        </p>
        <p>
          {validationCount === 1 ? "Validation check" : "Validation checks"}:{" "}
          {validationCount}
        </p>
        {hasUnsavedChanges ? (
          <p className="text-(--warning-text)">
            Unsaved edits stay local until you save or run another action.
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-(--resume-sidebar-columns)">
        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Role snapshot
          </p>
          <div className="grid gap-1.5 text-sm text-foreground-soft">
            <p>
              <strong className="text-foreground">Work mode:</strong>{" "}
              {job.workMode.join(", ") || "Not specified"}
            </p>
            <p>
              <strong className="text-foreground">Posted:</strong>{" "}
              {formatOptionalDate(job.postedAt, job.postedAtText)}
            </p>
            {job.seniority || job.employmentType ? (
              <p>
                <strong className="text-foreground">Role:</strong>{" "}
                {[job.seniority, job.employmentType]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            ) : null}
            {roleSnapshot.map((snapshot) => (
              <p key={snapshot} className="wrap-break-word">
                {snapshot}
              </p>
            ))}
            {targetingSummary ? (
              <p className="wrap-break-word">
                <strong className="text-foreground">Targeting:</strong>{" "}
                {targetingSummary}
              </p>
            ) : null}
            {screeningSummary ? (
              <p className="wrap-break-word">
                <strong className="text-foreground">Screening:</strong>{" "}
                {screeningSummary}
              </p>
            ) : null}
          </div>
        </div>

        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Shared profile inputs
          </p>
          {profileSummary ? (
            <p className="text-sm leading-6 text-foreground-soft">
              {profileSummary}
            </p>
          ) : null}
          {highlightedProof ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <strong className="text-foreground">
                {highlightedProof.title}
              </strong>
              <p>{truncateText(highlightedProof.claim, 110)}</p>
              {highlightedProof.heroMetric ? (
                <p>Metric: {highlightedProof.heroMetric}</p>
              ) : null}
            </div>
          ) : null}
          {!profileSummary && !highlightedProof ? (
            <p className="text-sm text-foreground-soft">
              No reusable profile context saved yet.
            </p>
          ) : null}
        </div>

        <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
            Saved research
          </p>
          <p className="text-sm text-foreground-soft">
            {research.length > 0
              ? `${research.length} saved source${research.length === 1 ? "" : "s"}.`
              : "No research saved yet."}
          </p>
          {leadResearch ? (
            <div className="grid gap-1 text-sm text-foreground-soft">
              <strong className="text-foreground">
                {truncateText(
                  leadResearch.pageTitle ?? leadResearch.sourceUrl,
                  72,
                )}
              </strong>
              <span>{formatHostLabel(leadResearch.sourceUrl)}</span>
            </div>
          ) : null}

          {job.applicationUrl || job.employerWebsiteUrl || job.atsProvider ? (
            <div className="grid gap-1 border-t border-(--surface-panel-border) pt-2 text-(length:--text-small) leading-5 text-foreground-muted">
              {job.atsProvider ? <p>Provider: {job.atsProvider}</p> : null}
              {employerHost ? <p>Employer site: {employerHost}</p> : null}
              {applicationHost ? <p>Apply route: {applicationHost}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
