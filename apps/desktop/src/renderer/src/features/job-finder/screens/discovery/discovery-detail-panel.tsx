import type {
  DiscoveryFeedbackReason,
  DiscoveryJobView,
  EmployerExclusionPreview,
  JobDiscoveryTarget,
  MatchAssessmentChangeAudit,
  SavedJob,
} from "@unemployed/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
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
import {
  fitRecommendationCopy,
  getMatchAssessmentPresentation,
} from "../../lib/match-assessment-presentation";
import { presentListingActivity } from "../../lib/listing-activity-presentation";
import { formatNormalizedCompensation } from "../../lib/normalized-compensation";
import {
  formatJobEmployerLocationLine,
  resolveJobEmployerDisplay,
  scrubJobAbsencePlaceholders,
} from "../../lib/job-employer-location-display";
import type { JobFinderQueuedJobOutcome } from "../../lib/job-finder-types";
import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";
import { getDiscoverySourceLabels } from "./discovery-source-attribution";

/**
 * The bare workflow value reads as a verdict on the job itself ("APPROVED"),
 * not on the artifact the state is actually about.
 */
export function presentDiscoveryJobStatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Resume approved";
    case "ready_for_review":
      return "Resume needs review";
    case "drafting":
      return "Resume in progress";
    default:
      return formatStatusLabel(status);
  }
}

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

/**
 * The inspector's two decision blocks — the Shortlist summary above and the
 * Not-interested footer below — are flex siblings of the scroller, never its
 * ancestors, so detail content can never render underneath either bar. What
 * the live walkthrough exposed is the other half of that contract: the
 * scroller needs its own breathing room and a visible boundary, or a
 * half-height fact card butted straight against the Shortlist block reads as
 * a collision instead of as "there is more above".
 *
 * `pt-6`/`pb-6` keep the first and last rows clear of both bars, and the
 * matching `scroll-pt-6`/`scroll-pb-6` keep programmatic reveals (focus moves,
 * `scrollIntoView` from the results list) from parking a row flush against an
 * edge.
 */
export const DISCOVERY_DETAIL_SCROLL_AREA_CLASS_NAME =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-6 scroll-pt-6 px-6 pb-6 pt-6";

/** Height of one edge treatment; matches the scroller's own edge padding. */
const DISCOVERY_DETAIL_SCROLL_EDGE_CLASS_NAME =
  "pointer-events-none absolute inset-x-0 h-6 z-10";

type DiscoveryDetailScrollEdges = { top: boolean; bottom: boolean };

/**
 * Reports which edges of a scroller currently clip content. Measured from the
 * element itself (not from a scroll delta) so it is correct on first paint,
 * after a resize, after a disclosure such as "How this was scored" opens, and
 * after the selected job resets the scroll position.
 */
function useDiscoveryDetailScrollEdges(
  scrollAreaRef: RefObject<HTMLDivElement | null>,
  measurementKey: string,
): DiscoveryDetailScrollEdges {
  const [edges, setEdges] = useState<DiscoveryDetailScrollEdges>({
    top: false,
    bottom: false,
  });

  const measure = useCallback(() => {
    const element = scrollAreaRef.current;
    if (!element) {
      setEdges({ top: false, bottom: false });
      return;
    }

    // Sub-pixel layout rounding must not flicker an edge on and off.
    const next = {
      top: element.scrollTop > 1,
      bottom:
        element.scrollHeight - element.clientHeight - element.scrollTop > 1,
    };
    setEdges((current) =>
      current.top === next.top && current.bottom === next.bottom
        ? current
        : next,
    );
  }, [scrollAreaRef]);

  useEffect(() => {
    const element = scrollAreaRef.current;
    measure();
    if (!element) {
      return;
    }

    element.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => measure());
    observer?.observe(element);
    const firstChild = element.firstElementChild;
    if (firstChild) {
      observer?.observe(firstChild);
    }

    return () => {
      element.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, measurementKey, scrollAreaRef]);

  return edges;
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
  const detailScrollEdges = useDiscoveryDetailScrollEdges(
    detailScrollAreaRef,
    selectedJob?.id ?? "",
  );
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
  const assessmentPresentation = selectedJob
    ? getMatchAssessmentPresentation(selectedJob)
    : null;
  const listingDate = selectedJob ? getPostedDateLabel(selectedJob) : null;
  // A listing with no posted or provider-updated date must not render a bare
  // "Updated — Unknown" fact; the absent date is not useful information.
  const hasListingDate = Boolean(
    selectedJob &&
    (selectedJob.postedAtText ??
      selectedJob.postedAt ??
      selectedJob.providerUpdatedAt),
  );
  const applicationMethodLabel =
    selectedJob?.applyPath === "easy_apply"
      ? "Easy Apply"
      : selectedJob?.applyPath === "external_redirect"
        ? "Apply on company site"
        : "Manual application";
  const listingActivity = presentListingActivity(
    selectedJob?.listingActivity ?? { status: "unknown" },
  );
  const needsSourceVerification =
    selectedJob?.listingActivity?.status === "inactive" ||
    selectedJob?.listingActivity?.status === "stale";
  const isReportedClosed = selectedJob?.listingActivity?.status === "closed";
  const employerLocationLine = selectedJob
    ? formatJobEmployerLocationLine({
        company: selectedJob.company,
        location: selectedJob.location,
        canonicalUrl: selectedJob.canonicalUrl,
        separator: " • ",
      })
    : "";
  const employerDisplay = selectedJob
    ? resolveJobEmployerDisplay({
        company: selectedJob.company,
        canonicalUrl: selectedJob.canonicalUrl,
      })
    : null;
  // An echoed job title is not listing text; it reads as a bug under an
  // "About this job" heading.
  const listingText = (() => {
    if (!selectedJob) {
      return "";
    }
    const text = jobDescriptionToText(
      selectedJob.summary ?? selectedJob.description,
    ).trim();
    return text.toLowerCase() === selectedJob.title.trim().toLowerCase()
      ? ""
      : text;
  })();
  // One honest sentence instead of a wall of cards: the hedge when nothing was
  // verified, otherwise the first saved reason.
  const whyItFitsLine = selectedJob
    ? (assessmentPresentation?.withheldReason ??
      (selectedJob.matchAssessment.recommendation === "skip"
        ? scrubJobAbsencePlaceholders(
            selectedJob.matchAssessment.recommendationRationale ?? "",
          ) || "This listing conflicts with your saved profile."
        : scrubJobAbsencePlaceholders(
            selectedJob.matchAssessment.reasons.find(
              (reason) => reason.trim().length > 0,
            ) ?? "",
          ) ||
          "Estimated from the listing requirements and evidence in your approved profile."))
    : "";

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
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-(--surface-panel-border) px-4 py-3">
        <p className="text-(length:--text-heading-3) font-semibold text-(--text-headline)">
          Job inspector
        </p>
        {selectedJob ? (
          <StatusBadge tone={getApplicationTone(selectedJob.status)}>
            {presentDiscoveryJobStatusLabel(selectedJob.status)}
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
              {employerLocationLine ? (
                <p className="text-(length:--text-description) text-foreground-soft">
                  {employerLocationLine}
                </p>
              ) : null}
            </div>
            {isAlreadyShortlisted ? (
              <Button asChild className="h-11 w-full" variant="primary">
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
                className="h-11 w-full"
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
                closed. The original listing link remains available below.
              </p>
            ) : null}
          </div>

          <div
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
            data-testid="discovery-detail-scroll-frame"
          >
            <div
              aria-hidden="true"
              className={`${DISCOVERY_DETAIL_SCROLL_EDGE_CLASS_NAME} top-0 border-t border-(--surface-panel-border) bg-gradient-to-b from-(--surface-panel) to-transparent`}
              data-testid="discovery-detail-scroll-edge-top"
              hidden={!detailScrollEdges.top}
            />
            <div
              aria-hidden="true"
              className={`${DISCOVERY_DETAIL_SCROLL_EDGE_CLASS_NAME} bottom-0 border-b border-(--surface-panel-border) bg-gradient-to-t from-(--surface-panel) to-transparent`}
              data-testid="discovery-detail-scroll-edge-bottom"
              hidden={!detailScrollEdges.bottom}
            />
            <div
              aria-label="Job detail content"
              className={DISCOVERY_DETAIL_SCROLL_AREA_CLASS_NAME}
              data-locked-pane-scroll-region
              data-testid="discovery-detail-scroll-area"
              ref={detailScrollAreaRef}
              role="region"
              tabIndex={0}
            >
              <div className="grid min-h-full content-start gap-5">
                {/* The job first, the app's reasoning after it. A job seeker
                  asks what the job is, what it pays, and why them — in that
                  order — so the listing text, pay and place lead, the score
                  is one line, and the full breakdown waits behind a
                  disclosure. */}
                <div
                  className="grid min-w-0 gap-2"
                  data-testid="discovery-detail-listing-text"
                >
                  <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                    About this job
                  </span>
                  <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                    {listingText ||
                      "The listing text was not captured, so this job was only matched on its title. Copy the original listing link below and open it in your browser to read it."}
                  </p>
                </div>

                <div
                  className="grid min-w-0 gap-3 sm:grid-cols-2"
                  data-job-fact-grid
                >
                  <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                      Salary
                    </span>
                    <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                      {selectedJob.salaryText ??
                        (normalizedCompensation
                          ? normalizedCompensation
                          : "Not stated")}
                    </strong>
                    {selectedJob.salaryText && normalizedCompensation ? (
                      <p className="mt-2 text-(length:--text-small) text-foreground-soft">
                        Normalized: {normalizedCompensation}
                      </p>
                    ) : null}
                  </div>
                  <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                      Location and work mode
                    </span>
                    <strong className="mt-2 block text-(length:--text-body) text-(--text-headline)">
                      {[
                        selectedJob.location?.trim()
                          ? selectedJob.location
                          : null,
                        selectedJob.workMode.length > 0
                          ? selectedJob.workMode.join(", ")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not stated"}
                    </strong>
                  </div>
                </div>

                <div
                  className="grid min-w-0 gap-2"
                  data-testid="discovery-detail-why-it-fits"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong
                      aria-label={
                        assessmentPresentation?.headlineScoreAriaLabel
                      }
                      className={
                        assessmentPresentation?.isScoreWithheld
                          ? "text-(length:--text-body) text-foreground-soft"
                          : "text-(length:--text-body) text-(--text-headline)"
                      }
                      data-testid="discovery-detail-fit-score"
                    >
                      {/* A percentage is only printed when the evidence behind
                        it was actually checkable. Otherwise the number stays
                        inside "How this was scored" beside its evidence. */}
                      {assessmentPresentation?.headlineScoreLabel}
                    </strong>
                    {recommendation ? (
                      <StatusBadge
                        tone={
                          assessmentPresentation?.isProvisional
                            ? "neutral"
                            : recommendation.tone
                        }
                      >
                        {recommendation.label}
                      </StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                    {whyItFitsLine}
                  </p>
                </div>

                <details className="min-w-0 rounded-(--radius-field) border border-(--surface-panel-border)">
                  <summary className="cursor-pointer px-4 py-3 text-(length:--text-small) font-medium text-foreground-soft">
                    How this was scored
                  </summary>
                  <div className="grid gap-4 px-4 pb-4">
                    <MatchAssessmentChangeDisclosure
                      audit={selectedJob.latestMatchAssessmentAudit}
                    />
                    <MatchEvidenceMatrix
                      assessment={selectedJob.matchAssessment}
                      scoreLabel={
                        assessmentPresentation?.breakdownScoreLabel ?? null
                      }
                      showRecommendation={false}
                    />
                  </div>
                </details>

                <div className="grid sm:grid-cols-2" data-job-detail-fact-grid>
                  <div
                    className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2"
                    data-testid="discovery-detail-listing-activity"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                        Listing activity
                      </span>
                      <StatusBadge
                        className="shrink-0 px-2.5 py-1 text-(length:--text-tiny) font-semibold tracking-[0.04em]"
                        tone={listingActivity.tone}
                      >
                        {listingActivity.label}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                      {listingActivity.description}
                    </p>
                  </div>
                  {hasListingDate && listingDate ? (
                    <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                      <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                        {listingDate.label}
                      </span>
                      <strong className="mt-2 block text-(length:--text-section-title) text-(--text-headline)">
                        {listingDate.value}
                      </strong>
                    </div>
                  ) : null}
                  {selectedJob.atsProvider ? (
                    <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                      <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
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
                      <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                        Application route
                      </span>
                      <strong className="mt-2 block break-all text-(length:--text-small) text-(--text-headline)">
                        {selectedJob.applicationUrl}
                      </strong>
                    </div>
                  ) : null}
                  <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) p-4 sm:col-span-2">
                    <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-soft">
                      Original listing
                    </span>
                    <strong className="mt-2 block break-all text-(length:--text-small) text-(--text-headline)">
                      {selectedJob.canonicalUrl}
                    </strong>
                    <p
                      className="mt-2 text-(length:--text-small) leading-5 text-foreground-soft"
                      data-testid="discovery-detail-application-method"
                    >
                      Application method: {applicationMethodLabel}
                    </p>
                    {listingCopyFailedJobId === selectedJob.id ? (
                      <p className="mt-2 text-(length:--text-small) leading-5 text-destructive">
                        The link could not be copied. Select the URL above and
                        copy it manually.
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Company context is a detour, not the decision on this
                    screen, so it sits below the listing rather than above it. */}
                {selectedJobCompanyId && onOpenCompany && employerDisplay ? (
                  <Button
                    className="justify-self-start"
                    onClick={() => onOpenCompany(selectedJobCompanyId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    View {employerDisplay} in Companies
                  </Button>
                ) : null}

                <PreferenceList
                  compact
                  label="Found on"
                  values={sourceLabels}
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
                {selectedJob.screeningHints.requiresSecurityClearance ===
                true ? (
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
          </div>

          <div
            className="grid min-w-0 shrink-0 gap-2 border-t border-(--surface-panel-border) bg-(--surface-panel) px-6 py-3"
            data-testid="discovery-detail-actions"
          >
            {queueFeedback ? (
              <>
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
                {queueFeedback.status === "success" ? (
                  <p
                    className="break-words text-(length:--text-small) leading-5 text-foreground-muted"
                    data-testid="discovery-detail-queue-identity"
                  >
                    Selected for Shortlisted: {selectedJob.title} at{" "}
                    {employerDisplay ?? selectedJob.company}.
                  </p>
                ) : null}
              </>
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
            ) : null}
            {/* A dismissal and a link copy are secondary work: they keep their
                natural width on one left-aligned row instead of two stacked
                full-width filled bars under the primary decision. The copy
                action stays available while the feedback form is open. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {feedbackJobId === selectedJob.id ? null : (
                <Button
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
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Not interested
                </Button>
              )}
              <Button
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
                size="sm"
                type="button"
                variant="outline"
              >
                {copiedListingJobId === selectedJob.id
                  ? "Listing link copied"
                  : "Copy listing link"}
              </Button>
            </div>
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
