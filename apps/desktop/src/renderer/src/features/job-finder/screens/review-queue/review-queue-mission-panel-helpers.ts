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
  enabled: boolean;
  kind: "blocked" | "generate_resume" | "start_apply" | "waiting";
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
        "Original CV selected. Job Finder will attach this imported file unchanged.",
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
    detail: "Approve an exact resume file before Apply Copilot can start.",
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
        "Apply Copilot will pause for you and will not create an account or handle a security challenge.",
    };
  }
  return {
    value: "Not confirmed yet",
    detail:
      "The live application may still request sign-in, an account choice, or manual verification.",
  };
}
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
      label: "CV file",
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
        "Apply Copilot may enter confirmed fields, attach the selected CV, and trigger site autosaves while this run is active.",
    },
    {
      label: "Final submit",
      value: "Disabled for this run",
      detail:
        "Apply Copilot will stop at the final safe review checkpoint and will not submit the application.",
    },
  ];
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
      label: "Creating tailored CV…",
      recovery: null,
    };
  }

  if (hasGenerationFailure) {
    return {
      blocker: "The last tailored CV attempt did not finish.",
      enabled: !isSelectedJobPending,
      kind: "generate_resume",
      label: "Retry tailored CV",
      recovery: null,
    };
  }

  if (needsGeneration) {
    return {
      blocker: null,
      enabled: !isSelectedJobPending,
      kind: "generate_resume",
      label: "Create tailored CV",
      recovery: null,
    };
  }

  if (!hasReadyApprovedAsset) {
    if (usesOriginalResume) {
      return {
        blocker:
          "The original CV file is missing or could not be verified for this job.",
        enabled: false,
        kind: "blocked",
        label: "Prepare application",
        recovery: { kind: "open_profile", label: "Import original CV" },
      };
    }

    const blocker =
      resumeReviewStatus === "stale"
        ? "The approved tailored CV is out of date."
        : resumeReviewStatus === "approved"
          ? "The approved CV no longer matches the ready export."
          : "Approve the tailored CV you want to use for this job.";
    return {
      blocker,
      enabled: false,
      kind: "blocked",
      label: "Prepare application",
      recovery: {
        kind: "open_resume_workspace",
        label: "Review and approve CV",
      },
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
      return "Apply Copilot can open the destination and wait while you sign in.";
    case "blocked":
      return "Resolve the browser issue before you start Apply Copilot.";
    case "unknown":
      return "Apply Copilot will open and check the destination when you start.";
    default:
      return "Wait for the browser to finish starting before you start Apply Copilot.";
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
    return "Job Finder is still preparing the latest resume for this job.";
  }

  if (needsGeneration) {
    return "Create a tailored resume first.";
  }

  if (!hasReadyApprovedAsset) {
    return resumeReviewStatus === "stale"
      ? "The last approved tailored PDF is out of date and needs a fresh approval."
      : selectedItem.resumeApplicationMode === "original_resume"
        ? "The unchanged original CV is not ready for this job. Import or verify it in Profile before applying."
        : "Open the resume workspace to export a tailored PDF and approve it before applying.";
  }

  if (applySupportState === "incomplete") {
    return `${selectedItem.resumeReview.status === "original_resume" ? "The original CV" : "The approved tailored PDF"} is ready, but this selection is missing apply-path data. Refresh the job details before starting Apply Copilot.`;
  }

  if (browserActionMessage) {
    return browserActionMessage;
  }

  if (applySupportState === "manual_follow_up") {
    return `${selectedItem.resumeReview.status === "original_resume" ? "The original CV" : "The approved tailored PDF"} is ready. This job opens an employer form, so Apply Copilot will check it live, fill supported fields, and pause for anything that needs you.`;
  }

  return selectedItem.resumeReview.status === "original_resume"
    ? "Your original CV is ready to use unchanged. Apply Copilot can attach it and prepare the application, then pause before final submit."
    : "The approved tailored PDF is ready to use. Apply Copilot can prepare the application and pause before final submit if the live form asks for unsupported information.";
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
  } = input;
  const needsGeneration = needsResumeGeneration(selectedItem);
  const hasGenerationFailure = hasResumeGenerationFailure(selectedItem);
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
      label: usesOriginalResume ? "Original CV ready" : "Tailored resume ready",
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
              ? "The unchanged CV imported in Profile is available for this job."
              : "A tailored resume exists for this job.",
    },
    {
      label: usesOriginalResume
        ? "Original file selected"
        : "Approved tailored PDF ready",
      state: hasReadyApprovedAsset ? "complete" : "blocked",
      description: hasReadyApprovedAsset
        ? usesOriginalResume
          ? "Apply Copilot will attach the original file shown in Review Queue."
          : "The current approved tailored PDF will be used when you start Apply Copilot."
        : resumeReviewStatus === "approved"
          ? "The approved tailored PDF could not be matched to the latest ready export. Reopen the workspace and approve again."
          : resumeReviewStatus === "stale"
            ? "Your last approved tailored PDF is out of date. Export and approve a fresh version."
            : "Open the workspace to export a PDF and approve the version you want to use.",
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
          ? "This selection is missing saved apply-path data. Refresh the job details before you start Apply Copilot."
          : applySupportState === "manual_follow_up"
            ? "This job opens an employer form. Apply Copilot will verify it live, fill supported fields, and pause before any unsupported or final step."
            : "Saved job data still points to a supported Easy Apply path. Live questions can still pause copilot before final submission.",
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
          ? "The browser is ready for supported Apply Copilot steps."
          : (browserActionMessage ??
            "Open or refresh the browser before continuing."),
    },
  ];
  const nextBlockedChecklistItem = getNextChecklistItem(checklist);
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
        ? "No shortlisted jobs currently have a ready resume file (approved tailored PDF or unchanged original CV) for queue staging."
        : `Select up to ${queueReadyCount} shortlisted jobs with a ready resume file (approved tailored PDF or unchanged original CV) to stage one bounded queue run.`
      : selectedQueueBlockedCount > 0
        ? "Only jobs with a ready resume file (approved tailored PDF or unchanged original CV) can enter the queue. Remove the blocked selection to continue."
        : `${selectedQueueReadyItems.length} selected job${selectedQueueReadyItems.length === 1 ? "" : "s"} will be staged into one safe non-submitting queue run.`;

  return {
    applyReadinessStatus,
    canApproveApply,
    canStageSelectedQueue,
    checklist,
    hasGenerationFailure,
    isGenerating,
    isGenerationAction,
    isPrimaryApplyPending,
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
