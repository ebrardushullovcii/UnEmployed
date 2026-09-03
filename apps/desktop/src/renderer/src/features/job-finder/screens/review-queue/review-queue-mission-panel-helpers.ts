import { CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import type {
  BrowserSessionState,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import {
  getApplyReadinessStatus,
  hasResumeGenerationFailure,
  isQueueStageReady,
  isResumeGenerationInProgress,
  needsResumeGeneration,
  type ApplySupportState,
} from "./review-queue-status";

export interface ApplyChecklistItem {
  description: string;
  label: string;
  state: "attention" | "complete" | "in_progress" | "blocked";
}
export interface ApplicationReadinessFact {
  detail: string;
  label: string;
  value: string;
}
export type PrimaryApplicationRecoveryKind =
  | "open_browser"
  | "open_job_details"
  | "open_profile"
  | "open_resume_workspace";
export interface PrimaryApplicationRecovery {
  kind: PrimaryApplicationRecoveryKind;
  label: string;
}
export interface PrimaryApplicationAction {
  blocker: string | null;
  /**
   * `info` marks a blocker that is an ordinary next step (approve the
   * resume) rather than a problem; the panel renders it as status, not as a
   * destructive alert. Absent means the blocker needs attention.
   */
  blockerTone?: "info";
  enabled: boolean;
  kind:
    | "approve_resume"
    | "blocked"
    | "generate_resume"
    | "start_apply"
    | "waiting";
  label: string;
  recovery: PrimaryApplicationRecovery | null;
}
function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}
function getDestinationLabel(selectedJob: SavedJob): string {
  const destinationUrl = selectedJob.applicationUrl ?? selectedJob.canonicalUrl;
  try {
    return new URL(destinationUrl).hostname.replace(/^www\./, "");
  } catch {
    return selectedJob.atsProvider ?? selectedJob.company;
  }
}
function getSafeDestinationUrl(selectedJob: SavedJob): string {
  const destinationUrl = selectedJob.applicationUrl ?? selectedJob.canonicalUrl;
  try {
    const parsedUrl = new URL(destinationUrl);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return getDestinationLabel(selectedJob);
  }
}
function getResumeFact(
  selectedItem: ReviewQueueItem,
  selectedAsset: TailoredAsset | null,
): Pick<ApplicationReadinessFact, "detail" | "value"> {
  if (selectedItem.resumeReview.status === "original_resume") {
    return {
      value: selectedItem.resumeReview.fileName,
      detail:
        "Original resume selected. Job Finder will attach this imported file unchanged.",
    };
  }
  if (selectedItem.resumeReview.status === "approved") {
    return {
      value: getFileName(selectedItem.resumeReview.approvedFilePath),
      detail: "Approved tailored PDF selected for this job.",
    };
  }
  return {
    value: selectedAsset?.label ?? "No approved file",
    detail: "Approve an exact resume file before preparation can start.",
  };
}
function getAccountExpectation(
  selectedJob: SavedJob,
  browserSession: BrowserSessionState,
): Pick<ApplicationReadinessFact, "detail" | "value"> {
  if (browserSession.status === "login_required") {
    return {
      value: "Sign-in required now",
      detail:
        "Credentials stay in the dedicated browser. Job Finder waits for you to confirm when sign-in is complete.",
    };
  }
  if (selectedJob.screeningHints?.requiresConsentInterrupt === true) {
    const value =
      selectedJob.screeningHints?.requiresConsentInterruptKind === "signup"
        ? "Sign-up may be required"
        : selectedJob.screeningHints?.requiresConsentInterruptKind ===
            "existing_account_decision"
          ? "Account choice likely"
          : "Manual verification likely";
    return {
      value,
      detail:
        "Job Finder will pause for you and will not create an account or handle a security challenge.",
    };
  }
  return {
    value: "Not confirmed yet",
    detail:
      "The live application may still request sign-in, an account choice, or manual verification.",
  };
}
/** Labels kept visible when the job is already ready to prepare. */
export const READY_APPLICATION_READINESS_PRIMARY_LABELS = [
  "Resume file",
  "Destination",
  "Final submit",
] as const;

export function getApplicationReadinessFacts(input: {
  browserSession: BrowserSessionState;
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem;
  selectedJob: SavedJob;
}): ApplicationReadinessFact[] {
  const { browserSession, selectedAsset, selectedItem, selectedJob } = input;
  const resume = getResumeFact(selectedItem, selectedAsset);
  const account = getAccountExpectation(selectedJob, browserSession);
  const safeDestinationUrl = getSafeDestinationUrl(selectedJob);
  return [
    {
      label: "Resume file",
      ...resume,
    },
    {
      label: "Destination",
      value: getDestinationLabel(selectedJob),
      detail: `${safeDestinationUrl} | ${selectedJob.atsProvider ?? "ATS provider not identified"}`,
    },
    {
      label: "Sign-in or account",
      ...account,
    },
    {
      label: "Required answers",
      value: "Checked on the live form",
      detail:
        "Unsupported or missing answers pause the run for your review instead of being invented.",
    },
    {
      label: "Site writes",
      value: "Authorized for preparation",
      detail:
        "While authorized, Job Finder may enter confirmed fields, attach the selected resume, and trigger site autosaves. It never performs a final-submit action, and the site controls its own behavior.",
    },
    {
      label: "Final submit",
      value: "Disabled for this run",
      detail:
        "Job Finder will stop at the final safe review checkpoint without clicking submit. Verify the outcome on the site afterwards; treat an unexpected completed state as site behavior and report it.",
    },
  ];
}

/** Split readiness facts for the ready-to-prepare compact strip. */
export function partitionApplicationReadinessFacts(
  facts: ApplicationReadinessFact[],
): {
  primary: ApplicationReadinessFact[];
  secondary: ApplicationReadinessFact[];
} {
  const primaryLabels = new Set<string>(
    READY_APPLICATION_READINESS_PRIMARY_LABELS,
  );
  const primary: ApplicationReadinessFact[] = [];
  const secondary: ApplicationReadinessFact[] = [];

  for (const fact of facts) {
    if (primaryLabels.has(fact.label)) {
      primary.push(fact);
    } else {
      secondary.push(fact);
    }
  }

  return { primary, secondary };
}

function assertChecklistStateUnreachable(value: never): never {
  void value;
  throw new Error("Unhandled checklist state.");
}

export function getChecklistTone(state: ApplyChecklistItem["state"]) {
  switch (state) {
    case "complete":
      return "positive" as const;
    case "attention":
      return "active" as const;
    case "in_progress":
      return "active" as const;
    case "blocked":
      return "critical" as const;
  }

  return assertChecklistStateUnreachable(state);
}

export function getChecklistIcon(state: ApplyChecklistItem["state"]) {
  switch (state) {
    case "complete":
      return CheckCircle2;
    case "in_progress":
      return CircleDashed;
    case "attention":
      return TriangleAlert;
    case "blocked":
      return TriangleAlert;
  }

  return assertChecklistStateUnreachable(state);
}

export function getApplySupportState(
  selectedJob: SavedJob | null,
): ApplySupportState {
  if (
    !selectedJob ||
    (!selectedJob.applicationUrl?.trim() && !selectedJob.canonicalUrl?.trim())
  ) {
    return "incomplete";
  }

  return selectedJob.applyPath === "easy_apply" && selectedJob.easyApplyEligible
    ? "supported"
    : "manual_follow_up";
}

export function getChecklistStateLabel(state: ApplyChecklistItem["state"]) {
  switch (state) {
    case "complete":
      return "Ready";
    case "in_progress":
      return "In progress";
    case "attention":
      return "Heads-up";
    case "blocked":
      return "Blocked";
  }

  return assertChecklistStateUnreachable(state);
}

export function getPrimaryApplicationAction(input: {
  applySupportState: ApplySupportState;
  browserSession: BrowserSessionState;
  hasGenerationFailure: boolean;
  hasReadyApprovedAsset: boolean;
  isApplyPending: boolean;
  isGenerating: boolean;
  isSelectedJobPending: boolean;
  needsGeneration: boolean;
  resumeReviewStatus: ReviewQueueItem["resumeReview"]["status"] | "not_started";
  usesOriginalResume: boolean;
}): PrimaryApplicationAction {
  const {
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isApplyPending,
    isGenerating,
    isSelectedJobPending,
    needsGeneration,
    resumeReviewStatus,
    usesOriginalResume,
  } = input;

  if (isGenerating) {
    return {
      blocker: null,
      enabled: false,
      kind: "waiting",
      label: "Creating tailored resume…",
      recovery: null,
    };
  }

  if (hasGenerationFailure) {
    return {
      blocker: "The last tailored resume attempt did not finish.",
      enabled: !isSelectedJobPending,
      kind: "generate_resume",
      label: "Retry tailored resume",
      recovery: null,
    };
  }

  if (needsGeneration) {
    return {
      blocker: null,
      enabled: !isSelectedJobPending,
      kind: "generate_resume",
      label: "Create tailored resume",
      recovery: null,
    };
  }

  if (!hasReadyApprovedAsset) {
    if (usesOriginalResume) {
      return {
        blocker:
          "The original resume file is missing or could not be verified for this job.",
        enabled: false,
        kind: "blocked",
        label: "Prepare application",
        recovery: { kind: "open_profile", label: "Import original resume" },
      };
    }

    // One status sentence for one artifact: the ordinary "not approved yet"
    // case is already stated once by Current state and by this action's own
    // label, so it does not also get a blocker box that names the same file
    // a second time with a different noun.
    const blocker =
      resumeReviewStatus === "stale"
        ? "The approved resume is out of date."
        : resumeReviewStatus === "approved"
          ? "The approved resume no longer matches the current version."
          : null;
    return {
      blocker,
      enabled: !isSelectedJobPending,
      kind: "approve_resume",
      label: "Review and approve resume",
      recovery: null,
    };
  }

  if (applySupportState === "incomplete") {
    return {
      blocker: "This job does not have a usable application link.",
      enabled: false,
      kind: "blocked",
      label: "Prepare application",
      recovery: { kind: "open_job_details", label: "Review job details" },
    };
  }

  if (browserSession.status === "blocked") {
    return {
      blocker:
        browserSession.detail?.trim() ||
        "The application browser is blocked and needs attention.",
      enabled: false,
      kind: "blocked",
      label: "Prepare application",
      recovery: { kind: "open_browser", label: "Fix browser connection" },
    };
  }

  return {
    blocker: null,
    enabled: !isApplyPending && !isSelectedJobPending,
    kind: "start_apply",
    label: "Prepare application",
    recovery: null,
  };
}

function getBrowserActionMessage(browserSession: BrowserSessionState) {
  switch (browserSession.status) {
    case "ready":
      return null;
    case "login_required":
      return "Job Finder can open the destination and wait while you sign in.";
    case "blocked":
      return "Resolve the browser issue before you start.";
    case "unknown":
      return "Job Finder will open and check the destination when you start.";
    default:
      return "Wait for the browser to finish starting before you start.";
  }
}

export function getNextChecklistItem(checklist: readonly ApplyChecklistItem[]) {
  return checklist.find((item) => item.state !== "complete") ?? null;
}

export function summarizeSelectedQueueTitles(
  items: readonly ReviewQueueItem[],
): string {
  const visibleTitles = items.slice(0, 3).map((item) => item.title);
  const remainingCount = items.length - visibleTitles.length;

  return remainingCount > 0
    ? `${visibleTitles.join(" • ")} +${remainingCount} more`
    : visibleTitles.join(" • ");
}

export function getReadinessDescription(input: {
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
  hasGenerationFailure: boolean;
  needsGeneration: boolean;
  isGenerating: boolean;
  hasReadyApprovedAsset: boolean;
  resumeReviewStatus: ReviewQueueItem["resumeReview"]["status"] | "not_started";
  applySupportState: ApplySupportState;
  browserActionMessage: string | null;
  isSelectedJobPendingTooLong?: boolean;
}) {
  const {
    selectedItem,
    selectedJob,
    hasGenerationFailure,
    needsGeneration,
    isGenerating,
    hasReadyApprovedAsset,
    resumeReviewStatus,
    applySupportState,
    browserActionMessage,
    isSelectedJobPendingTooLong = false,
  } = input;

  if (!selectedItem) {
    return "Select a shortlisted job to see what needs attention before you apply.";
  }

  if (!selectedJob) {
    return "";
  }

  if (hasGenerationFailure) {
    return "The last tailored resume run failed. Try again or open the resume workspace before you continue.";
  }

  if (isGenerating) {
    return isSelectedJobPendingTooLong
      ? "This resume is taking longer than expected. The request is still running. Open Resume Studio and use Reload workspace to check for a saved result; do not start another request yet."
      : "Job Finder is still preparing the latest resume for this job.";
  }

  if (needsGeneration) {
    return "Create a tailored resume first.";
  }

  if (!hasReadyApprovedAsset) {
    return resumeReviewStatus === "stale"
      ? "The approved resume is out of date and needs a fresh approval."
      : selectedItem.resumeApplicationMode === "original_resume"
        ? "The unchanged original resume is not ready for this job. Import or verify it in Profile before applying."
        : resumeReviewStatus === "not_started"
          ? "Open the resume workspace to review this resume and approve it. Approving unlocks Prepare application."
          : "This resume is ready for your review. Approving it unlocks Prepare application.";
  }

  if (applySupportState === "incomplete") {
    return `${selectedItem.resumeReview.status === "original_resume" ? "The original resume" : "The approved tailored PDF"} is ready, but this selection is missing apply-path data. Refresh the job details before starting.`;
  }

  if (browserActionMessage) {
    return browserActionMessage;
  }

  if (applySupportState === "manual_follow_up") {
    return `${selectedItem.resumeReview.status === "original_resume" ? "The original resume" : "The approved tailored PDF"} is ready. This job opens an employer form, so Job Finder will check it live, fill supported fields, and pause for anything that needs you.`;
  }

  return selectedItem.resumeReview.status === "original_resume"
    ? "Your original resume is ready to use unchanged. Job Finder can attach it and prepare the application, then pause before final submit."
    : "The approved tailored PDF is ready to use. Job Finder can prepare the application and pause before final submit if the live form asks for unsupported information.";
}

export function buildMissionPanelState(input: {
  browserSession: BrowserSessionState;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
  isSelectedJobPendingTooLong?: boolean;
}) {
  const {
    browserSession,
    isApplyPending,
    isJobPending,
    queue,
    queueSelection,
    selectedAsset,
    selectedItem,
    selectedJob,
    isSelectedJobPendingTooLong = false,
  } = input;
  const needsGeneration = needsResumeGeneration(selectedItem);
  const hasGenerationFailure = hasResumeGenerationFailure(
    selectedItem,
    selectedAsset,
  );
  const isSelectedJobPending = selectedItem
    ? isJobPending(selectedItem.jobId)
    : false;
  const isGenerating =
    isResumeGenerationInProgress(selectedItem) || isSelectedJobPending;
  const applySupportState = getApplySupportState(selectedJob);
  const resumeReviewStatus = selectedItem?.resumeReview.status ?? "not_started";
  const usesOriginalResume =
    selectedItem?.resumeApplicationMode === "original_resume";
  const approvedResumeReview =
    selectedItem?.resumeReview.status === "approved"
      ? selectedItem.resumeReview
      : null;
  const hasReadyApprovedAsset = usesOriginalResume
    ? selectedItem?.assetStatus === "ready" &&
      Boolean(selectedItem.resumeAssetId)
    : selectedAsset !== null &&
      selectedAsset.status === "ready" &&
      selectedItem?.resumeAssetId === selectedAsset.id &&
      approvedResumeReview !== null &&
      selectedAsset.storagePath === approvedResumeReview.approvedFilePath;
  const primaryApplicationAction = getPrimaryApplicationAction({
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isApplyPending,
    isGenerating,
    isSelectedJobPending,
    needsGeneration,
    resumeReviewStatus,
    usesOriginalResume,
  });
  const canApproveApply =
    primaryApplicationAction.kind === "start_apply" &&
    primaryApplicationAction.enabled;
  const browserActionMessage = getBrowserActionMessage(browserSession);
  const applyReadinessStatus = getApplyReadinessStatus({
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isGenerating,
    needsGeneration,
    resumeReviewStatus,
    selectedItem,
  });
  const readinessFacts =
    selectedItem && selectedJob
      ? getApplicationReadinessFacts({
          browserSession,
          selectedAsset,
          selectedItem,
          selectedJob,
        })
      : [];
  const checklist: ApplyChecklistItem[] = [
    {
      label: usesOriginalResume
        ? "Original resume ready"
        : "Tailored resume ready",
      state: hasGenerationFailure
        ? "blocked"
        : isGenerating
          ? "in_progress"
          : needsGeneration
            ? "blocked"
            : "complete",
      description: hasGenerationFailure
        ? "The last resume run failed. Try again or open the workspace to fix it."
        : needsGeneration
          ? "Create the first tailored resume for this job."
          : isGenerating
            ? "Job Finder is still preparing the latest draft."
            : usesOriginalResume
              ? "The unchanged resume imported in Profile is available for this job."
              : "A tailored resume exists for this job.",
    },
    {
      label: usesOriginalResume
        ? "Original file selected"
        : "Approved tailored PDF ready",
      state: hasReadyApprovedAsset ? "complete" : "blocked",
      description: (() => {
        if (hasReadyApprovedAsset) {
          return usesOriginalResume
            ? "Job Finder will attach the original file shown in Review Queue."
            : "The current approved tailored PDF will be used when you start.";
        }
        if (resumeReviewStatus === "approved") {
          return "The approved resume no longer matches the current version. Reopen the workspace and approve again.";
        }
        if (resumeReviewStatus === "stale") {
          return "Your approved resume is out of date. Reopen it and approve the current version.";
        }
        if (
          resumeReviewStatus === "needs_review" ||
          resumeReviewStatus === "draft"
        ) {
          return "Approve this resume to unlock Prepare application.";
        }
        return "Open the workspace, review the resume, and approve it.";
      })(),
    },
    {
      label: "Apply path",
      state:
        applySupportState === "incomplete"
          ? "blocked"
          : applySupportState === "manual_follow_up"
            ? "attention"
            : "complete",
      description:
        applySupportState === "incomplete"
          ? "This selection is missing saved apply-path data. Refresh the job details before you start."
          : applySupportState === "manual_follow_up"
            ? "This job opens an employer form. Job Finder will verify it live, fill supported fields, and pause before any unsupported or final step."
            : "Saved job data still points to a supported Easy Apply path. Live questions can still pause Job Finder before final submit.",
    },
    {
      label: "Browser handoff",
      state:
        browserSession.status === "ready"
          ? "complete"
          : browserSession.status === "blocked"
            ? "blocked"
            : "attention",
      description:
        browserSession.status === "ready"
          ? "The browser is ready for supported preparation steps."
          : (browserActionMessage ??
            "Open or refresh the browser before continuing."),
    },
  ];
  const nextBlockedChecklistItem = getNextChecklistItem(checklist);
  // Fully ready: resume approved, no checklist blockers, Prepare is enabled.
  // Mission UI collapses Current state / checklist noise in this state.
  const isReadyToPrepare = canApproveApply && nextBlockedChecklistItem === null;
  const readinessDescription = getReadinessDescription({
    selectedItem,
    selectedJob,
    hasGenerationFailure,
    needsGeneration,
    isGenerating,
    hasReadyApprovedAsset,
    resumeReviewStatus,
    applySupportState,
    browserActionMessage,
    isSelectedJobPendingTooLong,
  });
  const selectionSet = new Set(queueSelection);
  const selectedQueueItems: ReviewQueueItem[] = [];
  const selectedQueueReadyItems: ReviewQueueItem[] = [];
  let selectedQueueBlockedCount = 0;
  let queueReadyCount = 0;

  for (const item of queue) {
    const queueItemReady = isQueueStageReady(item);

    if (queueItemReady) {
      queueReadyCount += 1;
    }

    if (!selectionSet.has(item.jobId)) {
      continue;
    }

    selectedQueueItems.push(item);
    if (queueItemReady) {
      selectedQueueReadyItems.push(item);
    } else {
      selectedQueueBlockedCount += 1;
    }
  }

  const canStageSelectedQueue =
    selectedQueueReadyItems.length > 0 && selectedQueueBlockedCount === 0;
  const isSelectedQueuePending = selectedQueueReadyItems.some((item) =>
    isJobPending(item.jobId),
  );
  const isGenerationAction = needsGeneration || hasGenerationFailure;
  const isPrimaryApplyPending = isApplyPending && !isGenerationAction;
  const queueSummary =
    selectedQueueItems.length === 0
      ? queueReadyCount === 0
        ? "No shortlisted jobs currently have a ready resume file (approved tailored PDF or unchanged original resume) for a preparation run."
        : `Select up to ${queueReadyCount} shortlisted jobs with a ready resume file (approved tailored PDF or unchanged original resume) to prepare them in one bounded run.`
      : selectedQueueBlockedCount > 0
        ? "Only jobs with a ready resume file (approved tailored PDF or unchanged original resume) can be prepared. Remove the blocked selection to continue."
        : `${selectedQueueReadyItems.length} selected job${selectedQueueReadyItems.length === 1 ? "" : "s"} will join one safe non-submitting preparation run.`;

  return {
    applyReadinessStatus,
    canApproveApply,
    canStageSelectedQueue,
    checklist,
    hasGenerationFailure,
    isGenerating,
    isGenerationAction,
    isPrimaryApplyPending,
    isReadyToPrepare,
    isSelectedJobPending,
    isSelectedQueuePending,
    needsGeneration,
    nextBlockedChecklistItem,
    primaryApplicationAction,
    queueReadyCount,
    queueSummary,
    readinessFacts,
    readinessDescription,
    selectedQueueItems,
    selectedQueueReadyItems,
  };
}
