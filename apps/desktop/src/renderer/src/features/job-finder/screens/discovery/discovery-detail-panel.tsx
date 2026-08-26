import type {
  DiscoveryFeedbackReason,
  DiscoveryJobView,
  EmployerExclusionPreview,
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
import { Link } from "react-router-dom";
import { buildJobFinderContextRoute } from "../../lib/job-finder-context-navigation";
import { buildIntelligenceSummaries } from "../../lib/source-intelligence-utils";
import type { LearnedInstructionIntelligenceSummary } from "../../lib/source-intelligence-utils";
import {
  formatOptionalDateOnly,
  formatStatusLabel,
  getApplicationTone,
  getPostedDateLabel,
} from "../../lib/job-finder-utils";
import { fitRecommendationCopy } from "../../lib/match-assessment-presentation";
import { presentListingActivity } from "../../lib/listing-activity-presentation";
import { formatNormalizedCompensation } from "../../lib/normalized-compensation";
import type { JobFinderQueuedJobOutcome } from "../../lib/job-finder-types";
import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";
import { getDiscoverySourceLabels } from "./discovery-source-attribution";

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
    action?: "hide_job" | "hide_and_exclude_employer",
    expectedNormalizedCompanyName?: string | null,
  ) => void | Promise<void>;
  onPreviewEmployerExclusion?: (
    jobId: string,
  ) => Promise<EmployerExclusionPreview>;
  onOpenCompany?: (companyId: string) => void;
  onQueueJob: (jobId: string) => void;
  /**
   * Request-local outcome of this job's own Shortlist decision, correlated by
   * DiscoveryScreen; null while pending or when the inspected row has no
   * resolved request. Rendered as one accessible line so success and failure
   * are never silent in Results mode and never duplicate Search-setup
   * feedback.
   */
  queueFeedback?: JobFinderQueuedJobOutcome | null;
  selectedJob:
    | (SavedJob & Partial<Pick<DiscoveryJobView, "listingActivity">>)
    | null;
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

export function SourceChronologyDisclosure(props: {
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastVerifiedActiveAt: string | null;
}) {
  if (!props.firstSeenAt && !props.lastSeenAt && !props.lastVerifiedActiveAt) {
    return null;
  }

  return (
    <details className="rounded-(--radius-field) border border-(--surface-panel-border) p-4">
      <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground-soft">
        Source timeline
      </summary>
      <dl className="mt-3 grid gap-2 text-(length:--text-small) leading-6 text-foreground-soft md:grid-cols-3">
        <div className="grid gap-0.5">
          <dt className="font-medium text-foreground">First seen</dt>
          <dd>{formatOptionalDateOnly(props.firstSeenAt, "Unknown")}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="font-medium text-foreground">Last seen</dt>
          <dd>{formatOptionalDateOnly(props.lastSeenAt, "Unknown")}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="font-medium text-foreground">Last verified active</dt>
          <dd>
            {formatOptionalDateOnly(props.lastVerifiedActiveAt, "Unknown")}
          </dd>
        </div>
      </dl>
    </details>
  );
}

export function DiscoveryDetailPanel({
  discoveryTargets,
  isJobPending,
  onDismissJob,
  onPreviewEmployerExclusion,
  onOpenCompany,
  onQueueJob,
  queueFeedback,
  selectedJob,
  selectedJobCompanyId,
}: DiscoveryDetailPanelProps) {
  const detailScrollAreaRef = useRef<HTMLDivElement>(null);
  const previousSelectedJobIdRef = useRef<string | null>(null);
  const selectedJobIdRef = useRef<string | null>(selectedJob?.id ?? null);
  const employerExclusionPreviewRequestRef = useRef(0);
  const dismissRequestRef = useRef(0);
  const isDismissPendingRef = useRef(false);
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
  const [feedbackAction, setFeedbackAction] = useState<
    "hide_job" | "hide_and_exclude_employer"
  >("hide_job");
  const [employerExclusionPreview, setEmployerExclusionPreview] =
    useState<EmployerExclusionPreview | null>(null);
  const [
    isEmployerExclusionPreviewPending,
    setEmployerExclusionPreviewPending,
  ] = useState(false);
  const [employerExclusionPreviewError, setEmployerExclusionPreviewError] =
    useState<string | null>(null);
  const [isDismissPending, setDismissPending] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  selectedJobIdRef.current = selectedJob?.id ?? null;
  const sourceLabels = getDiscoverySourceLabels(
    selectedJob?.provenance ?? [],
    discoveryTargets,
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
  const isFeedbackPending = isSelectedJobPending || isDismissPending;
  const selectedJobEmployerExclusionPreview =
    employerExclusionPreview?.jobId === selectedJob?.id
      ? employerExclusionPreview
      : null;
  const isAlreadyShortlisted = selectedJob?.status !== "discovered";
  const recommendation = selectedJob
    ? fitRecommendationCopy[
        selectedJob.matchAssessment.recommendation ?? "review_before_applying"
      ]
    : null;
  const listingDate = selectedJob ? getPostedDateLabel(selectedJob) : null;
  const listingActivity = presentListingActivity(
    selectedJob?.listingActivity ?? { status: "unknown" },
  );
  const needsSourceVerification =
    selectedJob?.listingActivity?.status === "inactive" ||
    selectedJob?.listingActivity?.status === "stale";
  const isReportedClosed = selectedJob?.listingActivity?.status === "closed";

  useLayoutEffect(() => {
    const selectedJobId = selectedJob?.id ?? null;
    if (previousSelectedJobIdRef.current !== selectedJobId) {
      employerExclusionPreviewRequestRef.current += 1;
      dismissRequestRef.current += 1;
      isDismissPendingRef.current = false;
      setFeedbackJobId(null);
      setFeedbackReasons([]);
      setFeedbackAction("hide_job");
      setEmployerExclusionPreview(null);
      setEmployerExclusionPreviewPending(false);
      setEmployerExclusionPreviewError(null);
      setDismissPending(false);
      setDismissError(null);
      if (detailScrollAreaRef.current) {
        detailScrollAreaRef.current.scrollTop = 0;
      }
    }
    previousSelectedJobIdRef.current = selectedJobId;

    return () => {
      employerExclusionPreviewRequestRef.current += 1;
      dismissRequestRef.current += 1;
      isDismissPendingRef.current = false;
    };
  }, [selectedJob?.id]);

  const closeFeedback = () => {
    employerExclusionPreviewRequestRef.current += 1;
    dismissRequestRef.current += 1;
    isDismissPendingRef.current = false;
    setFeedbackJobId(null);
    setFeedbackReasons([]);
    setFeedbackAction("hide_job");
    setEmployerExclusionPreview(null);
    setEmployerExclusionPreviewPending(false);
    setEmployerExclusionPreviewError(null);
    setDismissPending(false);
    setDismissError(null);
  };

  const previewEmployerExclusion = (jobId: string) => {
    const requestId = employerExclusionPreviewRequestRef.current + 1;
    employerExclusionPreviewRequestRef.current = requestId;
    setEmployerExclusionPreview(null);
    setEmployerExclusionPreviewPending(true);
    setEmployerExclusionPreviewError(null);
    if (!onPreviewEmployerExclusion) {
      setEmployerExclusionPreviewPending(false);
      setEmployerExclusionPreviewError(
        "Employer exclusion could not be checked. You can still hide only this job.",
      );
      return;
    }
    void onPreviewEmployerExclusion(jobId)
      .then((preview) => {
        if (
          employerExclusionPreviewRequestRef.current !== requestId ||
          selectedJobIdRef.current !== jobId
        ) {
          return;
        }
        if (preview.jobId !== jobId) {
          setEmployerExclusionPreviewError(
            "Employer exclusion could not be checked. You can still hide only this job.",
          );
          return;
        }
        setEmployerExclusionPreview(preview);
      })
      .catch(() => {
        if (
          employerExclusionPreviewRequestRef.current !== requestId ||
          selectedJobIdRef.current !== jobId
        ) {
          return;
        }
        setEmployerExclusionPreview(null);
        setEmployerExclusionPreviewError(
          "Employer exclusion could not be checked. You can still hide only this job.",
        );
      })
      .finally(() => {
        if (
          employerExclusionPreviewRequestRef.current === requestId &&
          selectedJobIdRef.current === jobId
        ) {
          setEmployerExclusionPreviewPending(false);
        }
      });
  };

  const dismissSelectedJob = async (jobId: string) => {
    if (isDismissPendingRef.current) {
      return;
    }
    const reasons = [...feedbackReasons];
    const action = feedbackAction;
    const expectedNormalizedCompanyName =
      action === "hide_and_exclude_employer" &&
      selectedJobEmployerExclusionPreview?.status === "available"
        ? selectedJobEmployerExclusionPreview.normalizedCompanyName
        : null;
    if (
      action === "hide_and_exclude_employer" &&
      expectedNormalizedCompanyName === null
    ) {
      setDismissError(
        "The employer identity is no longer current. Check it again before retrying.",
      );
      return;
    }
    const requestId = dismissRequestRef.current + 1;
    dismissRequestRef.current = requestId;
    isDismissPendingRef.current = true;
    setDismissPending(true);
    setDismissError(null);
    try {
      await onDismissJob(jobId, reasons, action, expectedNormalizedCompanyName);
      if (
        dismissRequestRef.current === requestId &&
        selectedJobIdRef.current === jobId
      ) {
        closeFeedback();
      }
    } catch {
      if (
        dismissRequestRef.current === requestId &&
        selectedJobIdRef.current === jobId
      ) {
        isDismissPendingRef.current = false;
        setDismissPending(false);
        setDismissError(
          "The job could not be hidden. Your choices were kept. Try again.",
        );
      }
    }
  };

  return (
    <section
      aria-label="Job details"
      className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-(--surface-panel-border) scroll-mt-4 sm:scroll-mt-[8.25rem] min-[1440px]:scroll-mt-[4.5rem] xl:h-full xl:min-h-0"
      id={DISCOVERY_DETAIL_REGION_ID}
    >
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-4 py-3">
        <p className="text-base font-semibold text-(--text-headline)">
          Job inspector
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
            aria-label="Selected job summary"
            className="grid shrink-0 gap-3 border-b border-(--surface-panel-border) px-6 pb-4 pt-2"
            data-testid="discovery-detail-primary-action"
            role="group"
          >
            <div className="grid min-w-0 gap-2">
              <h2
                className="min-w-0 break-words rounded-sm text-(length:--text-section-title) font-semibold tracking-[-0.03em] text-(--text-headline) outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 scroll-mt-4 sm:scroll-mt-[8.25rem] min-[1440px]:scroll-mt-[4.5rem]"
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
          </div>

          <div
            aria-label="Job detail content"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5 pt-5"
            data-locked-pane-scroll-region
            data-testid="discovery-detail-scroll-area"
            ref={detailScrollAreaRef}
            role="region"
            tabIndex={0}
          >
            <div className="grid min-h-full content-start gap-5">
              <div className="grid sm:grid-cols-2" data-job-fact-grid>
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
                <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    Listing activity
                  </span>
                  <StatusBadge className="mt-2" tone={listingActivity.tone}>
                    {listingActivity.label}
                  </StatusBadge>
                  <p className="mt-2 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                    {listingActivity.description}
                  </p>
                </div>
                <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                    {listingDate?.label}
                  </span>
                  <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">
                    {listingDate?.value}
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
                    Application method
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
                {selectedJob.applicationUrl &&
                selectedJob.applicationUrl !== selectedJob.canonicalUrl ? (
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

              <PreferenceList compact label="Found on" values={sourceLabels} />
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
              <SourceChronologyDisclosure
                firstSeenAt={selectedJob.firstSeenAt}
                lastSeenAt={selectedJob.lastSeenAt}
                lastVerifiedActiveAt={selectedJob.lastVerifiedActiveAt}
              />
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
            {isAlreadyShortlisted ? (
              <Button asChild className="h-10 w-full" variant="primary">
                <Link
                  aria-describedby={DISCOVERY_DETAIL_HEADING_ID}
                  data-testid="discovery-detail-open-shortlisted"
                  to={buildJobFinderContextRoute("/job-finder/review-queue", {
                    jobId: selectedJob.id,
                  })}
                >
                  Open in Shortlisted
                </Link>
              </Button>
            ) : (
              <Button
                aria-describedby={DISCOVERY_DETAIL_HEADING_ID}
                className="h-10 w-full"
                disabled={isSelectedJobPending || isReportedClosed}
                onClick={() => onQueueJob(selectedJob.id)}
                type="button"
                variant="primary"
              >
                {isReportedClosed
                  ? "Reported closed"
                  : needsSourceVerification
                    ? "Shortlist anyway"
                    : "Shortlist job"}
              </Button>
            )}
            {!isAlreadyShortlisted && needsSourceVerification ? (
              <p
                className="break-words text-(length:--text-tiny) leading-5 text-foreground-muted"
                role="note"
              >
                Verify availability on the original source before relying on
                this listing.
              </p>
            ) : null}
            {!isAlreadyShortlisted && isReportedClosed ? (
              <p
                className="break-words text-(length:--text-tiny) leading-5 text-foreground-muted"
                role="note"
              >
                Shortlisting is unavailable because this listing was reported
                closed. The original listing link remains available above.
              </p>
            ) : null}
            {queueFeedback ? (
              <p
                className={
                  queueFeedback.status === "failure"
                    ? "break-words text-(length:--text-small) leading-5 text-destructive"
                    : "break-words text-(length:--text-small) leading-5 text-foreground-muted"
                }
                data-testid="discovery-detail-queue-feedback"
                role={queueFeedback.status === "failure" ? "alert" : "status"}
              >
                {queueFeedback.message}
              </p>
            ) : null}
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
                        disabled={isFeedbackPending}
                        key={option.value}
                        onClick={() => {
                          setFeedbackReasons((current) =>
                            selected
                              ? current.filter(
                                  (reason) => reason !== option.value,
                                )
                              : [...current, option.value],
                          );
                          if (option.value !== "company" || selected) {
                            if (option.value === "company") {
                              employerExclusionPreviewRequestRef.current += 1;
                              setFeedbackAction("hide_job");
                              setEmployerExclusionPreview(null);
                              setEmployerExclusionPreviewPending(false);
                              setEmployerExclusionPreviewError(null);
                            }
                            return;
                          }
                          previewEmployerExclusion(selectedJob.id);
                        }}
                        size="sm"
                        type="button"
                        variant={selected ? "secondary" : "ghost"}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
                {feedbackReasons.includes("company") ? (
                  <fieldset className="grid gap-2 border-t border-(--surface-panel-border) pt-3">
                    <legend className="text-(length:--text-small) font-medium text-foreground">
                      Company feedback scope
                    </legend>
                    <label className="flex items-start gap-2 text-(length:--text-small) text-foreground-soft">
                      <input
                        checked={feedbackAction === "hide_job"}
                        disabled={isFeedbackPending}
                        name={`company-feedback-scope-${selectedJob.id}`}
                        onChange={() => setFeedbackAction("hide_job")}
                        type="radio"
                        value="hide_job"
                      />
                      <span>Hide this job only</span>
                    </label>
                    <label className="flex items-start gap-2 text-(length:--text-small) text-foreground-soft">
                      <input
                        checked={feedbackAction === "hide_and_exclude_employer"}
                        disabled={
                          isFeedbackPending ||
                          isEmployerExclusionPreviewPending ||
                          selectedJobEmployerExclusionPreview?.status !==
                            "available"
                        }
                        name={`company-feedback-scope-${selectedJob.id}`}
                        onChange={() =>
                          setFeedbackAction("hide_and_exclude_employer")
                        }
                        type="radio"
                        value="hide_and_exclude_employer"
                      />
                      <span>Hide and exclude employer</span>
                    </label>
                    {isEmployerExclusionPreviewPending ? (
                      <p
                        className="text-(length:--text-tiny) text-foreground-muted"
                        role="status"
                      >
                        Checking the exact employer identity…
                      </p>
                    ) : selectedJobEmployerExclusionPreview?.status ===
                      "available" ? (
                      <div className="grid gap-1 text-(length:--text-tiny) leading-5 text-foreground-muted">
                        <p>
                          Future searches will exclude the exact normalized
                          company name “
                          {
                            selectedJobEmployerExclusionPreview.normalizedCompanyName
                          }
                          ”. This does not widen to aliases, parents, suffix
                          variants, or domains.
                        </p>
                        {selectedJobEmployerExclusionPreview.employerDomain ? (
                          <p>
                            Domain evidence only:{" "}
                            {selectedJobEmployerExclusionPreview.employerDomain}
                            . It is not an exclusion key.
                          </p>
                        ) : null}
                        <p>Fit scoring is unchanged.</p>
                      </div>
                    ) : selectedJobEmployerExclusionPreview?.status ===
                      "unavailable" ? (
                      <p className="text-(length:--text-tiny) leading-5 text-foreground-muted">
                        Reusable employer exclusion is unavailable because this
                        identity is not safe and exact. You can still hide only
                        this job.
                      </p>
                    ) : employerExclusionPreviewError ? (
                      <p
                        className="text-(length:--text-tiny) leading-5 text-foreground-muted"
                        role="status"
                      >
                        {employerExclusionPreviewError}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={isFeedbackPending || feedbackReasons.length === 0}
                    onClick={() => {
                      void dismissSelectedJob(selectedJob.id);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {isDismissPending
                      ? "Hiding job…"
                      : feedbackAction === "hide_and_exclude_employer"
                        ? "Hide and exclude employer"
                        : "Hide this job only"}
                  </Button>
                  <Button
                    disabled={isFeedbackPending}
                    onClick={closeFeedback}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
                {dismissError ? (
                  <p
                    className="text-(length:--text-tiny) leading-5 text-destructive"
                    role="alert"
                  >
                    {dismissError}
                  </p>
                ) : null}
              </fieldset>
            ) : (
              <Button
                className="h-10 w-full"
                disabled={isSelectedJobPending}
                onClick={() => {
                  employerExclusionPreviewRequestRef.current += 1;
                  setFeedbackJobId(selectedJob.id);
                  setFeedbackReasons([]);
                  setFeedbackAction("hide_job");
                  setEmployerExclusionPreview(null);
                  setEmployerExclusionPreviewPending(false);
                  setEmployerExclusionPreviewError(null);
                  setDismissError(null);
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
