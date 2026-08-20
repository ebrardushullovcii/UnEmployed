import type {
  DiscoveryFeedbackReason,
  JobDiscoveryTarget,
  MatchAssessmentChangeAudit,
  SavedJob,
} from "@unemployed/contracts";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { PreferenceList } from "../../components/preference-list";
import { StatusBadge } from "../../components/status-badge";
import { MatchEvidenceMatrix } from "../../components/match-evidence-matrix";
import { jobDescriptionToText } from "../../lib/job-description-text";
import { buildIntelligenceSummaries } from "../../lib/source-intelligence-utils";
import type { LearnedInstructionIntelligenceSummary } from "../../lib/source-intelligence-utils";
import {
  formatOptionalDateOnly,
  formatStatusLabel,
  getApplicationTone,
} from "../../lib/job-finder-utils";
import { fitRecommendationCopy } from "../../lib/match-assessment-presentation";
import { formatNormalizedCompensation } from "../../lib/normalized-compensation";
import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";

const discoveryFeedbackOptions: ReadonlyArray<{
  value: DiscoveryFeedbackReason;
  label: string;
}> = [
  { value: "role", label: "Role" },
  { value: "seniority", label: "Seniority" },
  { value: "location", label: "Location" },
  { value: "work_mode", label: "Work mode" },
  { value: "compensation", label: "Compensation" },
  { value: "company", label: "Company" },
  { value: "missing_requirement", label: "Missing requirement" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
];
interface DiscoveryDetailPanelProps {
  discoveryTargets: readonly JobDiscoveryTarget[];
  isJobPending: (jobId: string) => boolean;
  onDismissJob: (
    jobId: string,
    reasons: readonly DiscoveryFeedbackReason[],
  ) => void;
  onOpenCompany?: (companyId: string) => void;
  onQueueJob: (jobId: string) => void;
  selectedJob: SavedJob | null;
  selectedJobCompanyId?: string | null;
}

export function SourceDiagnostics(props: {
  summaries: readonly LearnedInstructionIntelligenceSummary[];
}) {
  if (props.summaries.length === 0) {
    return null;
  }

  return (
    <details className="rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground-soft">
        Source diagnostics
      </summary>
      <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-muted">
        Technical collection details for troubleshooting this saved source.
      </p>
      <div className="mt-3 grid gap-3">
        {props.summaries.map((summary, summaryIndex) => (
          <div
            key={`${summary.title}_${summaryIndex}`}
            className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4"
          >
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              {summary.title}
            </p>
            <dl className="grid gap-2 text-(length:--text-small) leading-6 text-foreground-soft">
              {summary.items.map((item, itemIndex) => (
                <div
                  className="grid gap-0.5"
                  key={`${summary.title}_${item.label}_${itemIndex}`}
                >
                  <dt className="font-medium text-foreground">{item.label}</dt>
                  <dd className="break-words">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

export function MatchAssessmentChangeDisclosure(props: {
  audit: MatchAssessmentChangeAudit | null | undefined;
}) {
  const { audit } = props;
  if (!audit) {
    return null;
  }

  const rankChanged = audit.outputChanges.some(
    (change) => change.code === "rank_position_changed",
  );
  const onlyRankChanged =
    rankChanged &&
    audit.outputChanges.every(
      (change) => change.code === "rank_position_changed",
    ) &&
    audit.inputChanges.every((change) => change.certainty === "unknown");
  const explanation = onlyRankChanged
    ? "This job moved because other visible results entered, left, or changed around it. Its own fit assessment stayed the same."
    : audit.summary;
  const reasons = [
    ...audit.outputChanges.map((change) => change.detail),
    ...audit.inputChanges
      .filter((change) => change.certainty === "known")
      .map((change) => change.detail),
  ].slice(0, 3);

  return (
    <details
      className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-subtle) p-4"
      data-testid="match-assessment-change-audit"
    >
      <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground">
        Why this result changed
        {audit.previousRank !== null && audit.currentRank !== null ? (
          <span className="ml-2 text-foreground-muted">
            #{audit.previousRank} → #{audit.currentRank}
          </span>
        ) : null}
      </summary>
      <div className="mt-3 grid gap-3 text-(length:--text-small) leading-6 text-foreground-soft">
        <p>{explanation}</p>
        {reasons.length > 0 ? (
          <ul className="grid list-disc gap-1 pl-5">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
        {audit.recordedAt ? (
          <p className="text-(length:--text-tiny) text-foreground-muted">
            Last recalculated {formatOptionalDateOnly(audit.recordedAt)}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function DiscoveryDetailPanel({
  discoveryTargets,
  isJobPending,
  onDismissJob,
  onOpenCompany,
  onQueueJob,
  selectedJob,
  selectedJobCompanyId,
}: DiscoveryDetailPanelProps) {
  const detailScrollAreaRef = useRef<HTMLDivElement>(null);
  const previousSelectedJobIdRef = useRef<string | null>(null);
  const [copiedListingJobId, setCopiedListingJobId] = useState<string | null>(
    null,
  );
  const [listingCopyFailedJobId, setListingCopyFailedJobId] = useState<
    string | null
  >(null);
  const [feedbackJobId, setFeedbackJobId] = useState<string | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<
    DiscoveryFeedbackReason[]
  >([]);
  const discoveryTargetLabels = new Map(
    discoveryTargets.map((target) => [target.id, target.label]),
  );
  const normalizedCompensation = formatNormalizedCompensation(
    selectedJob?.normalizedCompensation,
  );
  const intelligenceSummaries = buildIntelligenceSummaries(
    selectedJob?.sourceIntelligence ?? null,
  );
  const isSelectedJobPending = selectedJob
    ? isJobPending(selectedJob.id)
    : false;
  const isAlreadyShortlisted = selectedJob?.status !== "discovered";
  const recommendation = selectedJob
    ? fitRecommendationCopy[
        selectedJob.matchAssessment.recommendation ?? "review_before_applying"
      ]
    : null;

  useLayoutEffect(() => {
    const selectedJobId = selectedJob?.id ?? null;
    if (
      previousSelectedJobIdRef.current !== selectedJobId &&
      detailScrollAreaRef.current
    ) {
      detailScrollAreaRef.current.scrollTop = 0;
    }
    previousSelectedJobIdRef.current = selectedJobId;
  }, [selectedJob?.id]);

  return (
    <section
      aria-label="Job details"
      className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0"
      id={DISCOVERY_DETAIL_REGION_ID}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
          Job details
        </p>
        {selectedJob ? (
          <StatusBadge tone={getApplicationTone(selectedJob.status)}>
            {formatStatusLabel(selectedJob.status)}
          </StatusBadge>
        ) : null}
      </div>

      {selectedJob ? (
        <>
          <div
            aria-label="Selected job action"
            className="grid shrink-0 gap-3 border-b border-(--surface-panel-border) px-6 pb-4 pt-2"
            data-testid="discovery-detail-primary-action"
            role="group"
          >
            <div className="grid min-w-0 gap-2">
              <h2
                className="min-w-0 break-words rounded-sm text-(length:--text-section-title) font-semibold tracking-[-0.03em] text-(--text-headline) outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                id={DISCOVERY_DETAIL_HEADING_ID}
                tabIndex={-1}
              >
                {selectedJob.title}
              </h2>
              <p className="text-(length:--text-description) text-foreground-muted">
                {selectedJob.company} • {selectedJob.location}
              </p>
              {selectedJobCompanyId && onOpenCompany ? (
                <Button
                  className="justify-self-start"
                  onClick={() => onOpenCompany(selectedJobCompanyId)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  View {selectedJob.company} in Companies
                </Button>
              ) : null}
            </div>
            <Button
              aria-describedby={DISCOVERY_DETAIL_HEADING_ID}
              aria-label={
                isAlreadyShortlisted
                  ? `${selectedJob.title} is already shortlisted`
                  : `Shortlist ${selectedJob.title}`
              }
              className="w-full"
              disabled={isSelectedJobPending || isAlreadyShortlisted}
              onClick={() => onQueueJob(selectedJob.id)}
              size="compact"
              type="button"
              variant="primary"
            >
              {isAlreadyShortlisted ? "Already shortlisted" : "Shortlist job"}
            </Button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5 pt-5"
            data-locked-pane-scroll-region
            data-testid="discovery-detail-scroll-area"
            ref={detailScrollAreaRef}
          >
            <div className="grid min-h-full content-start gap-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Overall assessment
                  </span>
                  <strong
                    aria-label={`Overall fit: ${selectedJob.matchAssessment.score} percent`}
                    className="mt-2 block text-(length:--text-section-title) text-(--text-headline)"
                  >
                    {selectedJob.matchAssessment.score}%
                  </strong>
                  {recommendation ? (
                    <StatusBadge className="mt-2" tone={recommendation.tone}>
                      {recommendation.label}
                    </StatusBadge>
                  ) : null}
                  <p className="mt-2 text-(length:--text-small) leading-5 text-foreground-soft">
                    Estimated from the listing requirements and evidence in your
                    approved profile. Unknown details do not count as evidence.
                  </p>
                </div>
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Posted
                  </span>
                  <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">
                    {formatOptionalDateOnly(
                      selectedJob.postedAt,
                      selectedJob.postedAtText,
                    )}
                  </strong>
                </div>
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Work mode
                  </span>
                  <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                    {selectedJob.workMode.length > 0
                      ? selectedJob.workMode.join(", ")
                      : "Not specified"}
                  </strong>
                </div>
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Apply
                  </span>
                  <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                    {selectedJob.applyPath === "easy_apply"
                      ? "Easy Apply"
                      : selectedJob.applyPath === "external_redirect"
                        ? "Apply on company site"
                        : "Manual application"}
                  </strong>
                </div>
                {selectedJob.salaryText || normalizedCompensation ? (
                  <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      Salary
                    </span>
                    <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                      {selectedJob.salaryText ??
                        "Provided through structured compensation metadata"}
                    </strong>
                    {normalizedCompensation ? (
                      <p className="mt-2 text-(length:--text-small) text-foreground-soft">
                        Normalized: {normalizedCompensation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {selectedJob.atsProvider ? (
                  <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      ATS or provider
                    </span>
                    <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                      {selectedJob.atsProvider}
                    </strong>
                  </div>
                ) : null}
                {selectedJob.applicationUrl ? (
                  <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      Application route
                    </span>
                    <strong className="mt-2 block break-all text-(length:--text-small) text-(--text-headline)">
                      {selectedJob.applicationUrl}
                    </strong>
                  </div>
                ) : null}
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Original listing
                  </span>
                  <strong className="mt-2 block break-all text-(length:--text-small) text-(--text-headline)">
                    {selectedJob.canonicalUrl}
                  </strong>
                  {listingCopyFailedJobId === selectedJob.id ? (
                    <p className="mt-2 text-(length:--text-small) leading-5 text-destructive">
                      The link could not be copied. Select the URL above and
                      copy it manually.
                    </p>
                  ) : null}
                </div>
              </div>

              <MatchAssessmentChangeDisclosure
                audit={selectedJob.latestMatchAssessmentAudit}
              />

              <MatchEvidenceMatrix
                assessment={selectedJob.matchAssessment}
                showRecommendation={false}
              />

              <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                {jobDescriptionToText(
                  selectedJob.summary ?? selectedJob.description,
                )}
              </p>

              <PreferenceList
                compact
                label="Found on"
                values={selectedJob.provenance.map(
                  (entry) =>
                    discoveryTargetLabels.get(entry.targetId) ?? "Saved source",
                )}
              />
              <SourceDiagnostics summaries={intelligenceSummaries} />
              {selectedJob.keySkills.length > 0 ? (
                <PreferenceList
                  compact
                  label="Skills mentioned"
                  values={selectedJob.keySkills}
                />
              ) : null}
              {selectedJob.keywordSignals.length > 0 ? (
                <PreferenceList
                  compact
                  label="Targeting cues"
                  values={selectedJob.keywordSignals.map(
                    (signal) => signal.label,
                  )}
                />
              ) : null}

              {selectedJob.screeningHints.remoteGeographies.length > 0 ? (
                <PreferenceList
                  compact
                  label="Remote geography hints"
                  values={selectedJob.screeningHints.remoteGeographies}
                />
              ) : null}
              {selectedJob.screeningHints.sponsorshipText ? (
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Screening hint
                  </p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    {selectedJob.screeningHints.sponsorshipText}
                  </p>
                </div>
              ) : null}
              {selectedJob.screeningHints.relocationText ? (
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Relocation
                  </p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    {selectedJob.screeningHints.relocationText}
                  </p>
                </div>
              ) : null}
              {selectedJob.screeningHints.travelText ? (
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Travel
                  </p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    {selectedJob.screeningHints.travelText}
                  </p>
                </div>
              ) : null}
              {selectedJob.screeningHints.requiresSecurityClearance === true ? (
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Security clearance
                  </p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    This listing mentions an active or required security
                    clearance.
                  </p>
                </div>
              ) : null}
              {selectedJob.firstSeenAt ||
              selectedJob.lastSeenAt ||
              selectedJob.lastVerifiedActiveAt ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      First seen
                    </p>
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {formatOptionalDateOnly(
                        selectedJob.firstSeenAt,
                        "Unknown",
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      Last seen
                    </p>
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {formatOptionalDateOnly(
                        selectedJob.lastSeenAt,
                        "Unknown",
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                      Last verified active
                    </p>
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {formatOptionalDateOnly(
                        selectedJob.lastVerifiedActiveAt,
                        "Unknown",
                      )}
                    </p>
                  </div>
                </div>
              ) : null}
              {selectedJob.employerWebsiteUrl ? (
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Company site
                  </p>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    This job points to a company site that opens during the
                    application flow.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className="grid min-w-0 shrink-0 gap-2 border-t border-(--surface-panel-border) bg-(--surface-panel) px-6 py-3"
            data-testid="discovery-detail-actions"
          >
            <Button
              className="h-10 w-full"
              disabled={isSelectedJobPending || isAlreadyShortlisted}
              onClick={() => onQueueJob(selectedJob.id)}
              type="button"
              variant="primary"
            >
              {isAlreadyShortlisted ? "Already shortlisted" : "Shortlist job"}
            </Button>
            {feedbackJobId === selectedJob.id ? (
              <fieldset className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-3">
                <legend className="px-1 text-(length:--text-small) font-medium text-foreground">
                  Not interested because…
                </legend>
                <p className="text-(length:--text-tiny) leading-5 text-foreground-muted">
                  Optional feedback stays local. It hides this result but never
                  changes job facts or fit scoring.
                </p>
                <div className="flex flex-wrap gap-2">
                  {discoveryFeedbackOptions.map((option) => {
                    const selected = feedbackReasons.includes(option.value);
                    return (
                      <Button
                        aria-pressed={selected}
                        key={option.value}
                        onClick={() =>
                          setFeedbackReasons((current) =>
                            selected
                              ? current.filter(
                                  (reason) => reason !== option.value,
                                )
                              : [...current, option.value],
                          )
                        }
                        size="sm"
                        type="button"
                        variant={selected ? "secondary" : "ghost"}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={
                      isSelectedJobPending || feedbackReasons.length === 0
                    }
                    onClick={() => {
                      onDismissJob(selectedJob.id, feedbackReasons);
                      setFeedbackJobId(null);
                      setFeedbackReasons([]);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Hide with feedback
                  </Button>
                  <Button
                    onClick={() => {
                      setFeedbackJobId(null);
                      setFeedbackReasons([]);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            ) : (
              <Button
                className="h-10 w-full"
                disabled={isSelectedJobPending}
                onClick={() => {
                  setFeedbackJobId(selectedJob.id);
                  setFeedbackReasons([]);
                }}
                type="button"
                variant="secondary"
              >
                Not interested
              </Button>
            )}
            <Button
              className="h-10 w-full"
              onClick={() => {
                void navigator.clipboard
                  .writeText(selectedJob.canonicalUrl)
                  .then(() => {
                    setCopiedListingJobId(selectedJob.id);
                    setListingCopyFailedJobId(null);
                  })
                  .catch(() => {
                    setCopiedListingJobId(null);
                    setListingCopyFailedJobId(selectedJob.id);
                  });
              }}
              type="button"
              variant="ghost"
            >
              {copiedListingJobId === selectedJob.id
                ? "Listing link copied"
                : "Copy original listing link"}
            </Button>
            <p aria-live="polite" className="sr-only" role="status">
              {copiedListingJobId === selectedJob.id
                ? "Original listing link copied."
                : listingCopyFailedJobId === selectedJob.id
                  ? "The original listing link could not be copied. Copy the visible URL manually."
                  : ""}
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          className="min-h-80"
          description="Choose a job to review its fit, source, and next step."
          title="Choose a job to review"
        />
      )}
    </section>
  );
}
