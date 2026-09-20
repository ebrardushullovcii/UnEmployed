import { Check, ChevronDown, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplicationRecord,
  ApplicationAutomationMode,
  CandidateProfile,
  JobFinderApplicationStartTarget,
  JobFinderWorkspaceSnapshot,
  BrowserSessionState,
  GlobalDailyApplicationPreparationCapacity,
  ResumeApplicationMode,
  TailoringMode,
  ResumeSourceDocument,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { Button, ProgressBar } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import { openUrlInJobFinderBrowser } from "../../components/open-outside-links";
import { formatDailyPreparationCapacitySummaryText } from "../../lib/job-finder-daily-capacity";
import {
  formatResumeOperationElapsed,
  RESUME_DRAFT_EXPECTED_WAIT_LABEL,
} from "./review-queue-progress";
import {
  buildMissionPanelState,
  describeApplyOutcome,
} from "./review-queue-mission-panel-helpers";
import { describeUntailorableListing } from "./resume-workspace-utils";
import { getApplicationStagePresentation } from "../applications/applications-status";
import { resolveResumeIdentity } from "@unemployed/job-finder/resume-identity";
import { ResumeIdentityChoiceNotice } from "../../components/profile/resume-identity-choice-notice";

const dailyCapacityLimitDescriptionId =
  "employer-application-daily-capacity-limit";

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null;
  applicationAutomationMode?: ApplicationAutomationMode;
  applicationRecords: readonly ApplicationRecord[];
  browserSession: BrowserSessionState;
  /** Seconds the current resume run has been going. */
  pendingElapsedSeconds: number;
  globalDailyApplicationPreparationCapacity?: GlobalDailyApplicationPreparationCapacity | null;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  isSelectedJobPendingTooLong?: boolean;
  onStartApplyCopilot: (input: JobFinderApplicationStartTarget) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  /** Approves a Light or Tailored draft and starts the application in one press. */
  onApproveResumeAndApply?: (jobId: string) => void;
  onGenerateResume: (jobId: string) => Promise<boolean>;
  onOpenBrowserSession: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenApplication?: (recordId: string) => void;
  onOpenProfile: () => void;
  /** Takes the person to Safeguards when one is holding preparation back. */
  onOpenSafeguards?: () => void;
  /** Live apply results, so the start control follows the run record. */
  applyJobResults?: JobFinderWorkspaceSnapshot["applyJobResults"];
  /** A safeguard holding preparation back, in plain words. */
  safeguardBlocker?: string | null;
  onClaimResumeIdentity?: () => void;
  onKeepResumeIdentity?: () => void;
  onRemoveReviewJob: (jobId: string) => void;
  onSetJobResumeApplicationMode: (
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
    resumeTailoringMode?: TailoringMode | null,
  ) => void;
  originalResume?: ResumeSourceDocument;
  profile?: CandidateProfile;
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
}

/** The four resume levels a job can be sent with, in order of how far they go. */
type ResumeLevelId = "original" | "light" | "tailored" | "aggressive";
const RESUME_LEVEL_OPTIONS: readonly {
  id: ResumeLevelId;
  label: string;
  detail: string;
  tailoringMode: TailoringMode | null;
}[] = [
  {
    id: "original",
    label: "Original",
    detail: "Your file, unchanged.",
    tailoringMode: null,
  },
  {
    id: "light",
    label: "Light",
    detail: "Reorders and trims; wording stays yours.",
    tailoringMode: "conservative",
  },
  {
    id: "tailored",
    label: "Tailored",
    detail: "Rewrites bullets to match the posting.",
    tailoringMode: "balanced",
  },
  {
    id: "aggressive",
    label: "Aggressive",
    detail: "Stretches toward the posting; you confirm the stretches.",
    tailoringMode: "aggressive",
  },
];

function getSelectedResumeLevel(
  item: Pick<ReviewQueueItem, "resumeApplicationMode" | "resumeTailoringMode">,
): ResumeLevelId {
  if (item.resumeApplicationMode === "original_resume") return "original";
  switch (item.resumeTailoringMode) {
    case "conservative":
      return "light";
    case "aggressive":
      return "aggressive";
    default:
      return "tailored";
  }
}

const quietActionClassName =
  "h-auto min-h-8 w-fit px-0 text-sm font-medium normal-case tracking-normal";

/**
 * One job's column on Shortlisted, in the order the work happens: pick the
 * resume level, get the resume ready, press Apply. Everything the button
 * needs the person to know is one state line above it and one outcome
 * sentence below it.
 */
export function ReviewQueueMissionPanel({
  actionMessage,
  applicationAutomationMode = "prepare_only",
  applicationRecords,
  browserSession,
  pendingElapsedSeconds,
  globalDailyApplicationPreparationCapacity = null,
  isApplyPending,
  isJobPending,
  isSelectedJobPendingTooLong = false,
  onStartApplyCopilot,
  onEditResumeWorkspace,
  onApproveResumeAndApply,
  onGenerateResume,
  onOpenBrowserSession,
  onOpenJobDetails,
  onOpenApplication = () => undefined,
  onOpenProfile,
  onOpenSafeguards,
  applyJobResults = [],
  safeguardBlocker = null,
  onClaimResumeIdentity,
  onKeepResumeIdentity,
  onRemoveReviewJob,
  onSetJobResumeApplicationMode,
  originalResume,
  profile,
  selectedAsset,
  selectedItem,
  selectedJob,
}: ReviewQueueMissionPanelProps) {
  const [selectedApplicationChoice, setSelectedApplicationChoice] =
    useState<string>("");
  const {
    isGenerating,
    isPrimaryApplyPending,
    isSelectedJobPending,
    primaryApplicationAction,
    readinessDescription,
    usesOriginalResume,
  } = buildMissionPanelState({
    browserSession,
    isApplyPending,
    isJobPending,
    isSelectedJobPendingTooLong,
    safeguardBlocker,
    selectedApplyResult:
      applyJobResults.find(
        (result) =>
          selectedItem !== null &&
          result.jobId === selectedItem.jobId &&
          (result.state === "planned" ||
            result.state === "filling" ||
            result.state === "question_capture" ||
            result.state === "submitting"),
      ) ?? null,
    selectedAsset,
    selectedItem,
    selectedJob,
  });
  const selectedJobApplicationRecords = selectedItem
    ? applicationRecords.filter((record) => record.jobId === selectedItem.jobId)
    : [];
  const requiresApplicationChoice = selectedJobApplicationRecords.length > 1;
  const existingNeedsYouApplication = selectedJobApplicationRecords.find(
    (record) => getApplicationStagePresentation(record).label === "Needs you",
  );

  useEffect(() => {
    setSelectedApplicationChoice("");
  }, [selectedItem?.jobId]);

  const runPrimaryRecovery = () => {
    if (!selectedItem || !primaryApplicationAction.recovery) {
      return;
    }

    switch (primaryApplicationAction.recovery.kind) {
      case "open_browser":
        onOpenBrowserSession();
        return;
      case "open_job_details":
        onOpenJobDetails(selectedItem.jobId);
        return;
      case "open_profile":
        onOpenProfile();
        return;
      case "open_resume_workspace":
        onEditResumeWorkspace(selectedItem.jobId);
        return;
      case "open_safeguards":
        onOpenSafeguards?.();
        return;
    }
  };

  // "Edit resume" is offered whenever a draft exists to edit. It is the one
  // door into Resume Studio from here; when review is the primary action the
  // primary already opens it, so it is not repeated.
  const hasDraftToEdit =
    selectedItem !== null &&
    !usesOriginalResume &&
    selectedItem.assetStatus !== "not_started" &&
    !isGenerating;
  const showEditResume =
    hasDraftToEdit &&
    primaryApplicationAction.kind !== "approve_resume" &&
    primaryApplicationAction.recovery?.kind !== "open_resume_workspace";
  const dailyCapacityExhausted =
    globalDailyApplicationPreparationCapacity?.remaining === 0;
  const dailyCapacityDescription = formatDailyPreparationCapacitySummaryText(
    globalDailyApplicationPreparationCapacity,
  );
  const resumeIdentityBlocked =
    profile !== undefined &&
    resolveResumeIdentity(profile).mismatchReasons.length > 0;
  const showsApplyOutcome =
    primaryApplicationAction.kind === "start_apply" ||
    primaryApplicationAction.kind === "approve_and_apply";

  // One radiogroup with roving focus: arrow keys move and choose, Tab enters
  // and leaves the group once.
  const resumeChoiceGroupRef = useRef<HTMLDivElement | null>(null);
  const handleResumeChoiceKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!forward && !backward) {
        return;
      }

      const options = [
        ...(resumeChoiceGroupRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[role='radio']:not([disabled])",
        ) ?? []),
      ];
      const activeIndex = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      if (options.length < 2 || activeIndex === -1) {
        return;
      }

      event.preventDefault();
      const next =
        options[(activeIndex + (forward ? 1 : -1) + options.length) %
          options.length];
      next?.focus();
      next?.click();
    },
    [],
  );
  // A draft that kept the original wording because the listing body was never
  // captured is presented as the original-resume path, whatever the job's
  // saved choice says.
  const untailorableListing = describeUntailorableListing(selectedAsset);
  const untailorableListingReasonId = "resume-choice-untailorable-listing";
  const resumeChoiceFieldset = selectedItem ? (
    <div className="grid gap-2">
      <div
        aria-describedby={
          untailorableListing ? untailorableListingReasonId : undefined
        }
        aria-label="Resume level for this job"
        className="grid gap-2 sm:auto-rows-fr sm:grid-cols-2"
        onKeyDown={handleResumeChoiceKeyDown}
        ref={resumeChoiceGroupRef}
        role="radiogroup"
      >
        {RESUME_LEVEL_OPTIONS.map((option) => {
          const selected = untailorableListing
            ? option.id === "original"
            : getSelectedResumeLevel(selectedItem) === option.id;
          const unavailable =
            Boolean(untailorableListing) && option.id !== "original";

          return (
            <button
              aria-checked={selected}
              className={cn(
                "flex h-full min-h-11 flex-col justify-center gap-0.5 rounded-(--radius-small) border px-3 py-2 text-left text-(length:--text-small) font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary bg-primary/10 text-(--text-headline) shadow-[inset_2px_0_0_var(--primary)]"
                  : "border-(--surface-panel-border) bg-background/30 text-foreground-soft hover:border-primary/35",
                isSelectedJobPending
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer",
              )}
              data-resume-level={option.id}
              disabled={isSelectedJobPending || unavailable}
              key={option.id}
              onClick={() =>
                option.id === "original"
                  ? onSetJobResumeApplicationMode(
                      selectedItem.jobId,
                      "original_resume",
                    )
                  : onSetJobResumeApplicationMode(
                      selectedItem.jobId,
                      "tailored_per_job",
                      option.tailoringMode,
                    )
              }
              role="radio"
              tabIndex={0}
              type="button"
            >
              <span className="flex items-center gap-2">
                {selected ? (
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                  />
                ) : null}
                {option.label}
                {unavailable ? (
                  <span className="ml-auto text-xs font-normal text-foreground-muted">
                    Not possible for this job
                  </span>
                ) : null}
              </span>
              <span className="text-xs font-normal leading-4 text-foreground-muted">
                {option.detail}
              </span>
            </button>
          );
        })}
      </div>
      {untailorableListing ? (
        <p
          className="text-(length:--text-small) leading-6 text-foreground-soft"
          id={untailorableListingReasonId}
        >
          {untailorableListing.reason} {untailorableListing.approvalMessage}
        </p>
      ) : null}
    </div>
  ) : null;

  if (!selectedItem || !selectedJob) {
    return null;
  }

  return (
    <section className="relative grid min-w-0 content-start gap-4 px-6 pb-5 pt-3">
      <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
        <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
          Resume level
        </span>
        {selectedItem.resumeReview.status === "approved" ? (
          // Approved work is destructive to change, so the control is parked
          // behind a deliberate reveal that states the cost first.
          <details
            className="group grid min-w-0 gap-3 rounded-(--radius-small) border border-(--control-border) bg-background/30 px-3 py-2"
            data-resume-choice-disclosure
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-(length:--text-small) font-semibold text-foreground outline-none marker:hidden focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
              {RESUME_LEVEL_OPTIONS.find(
                (option) => option.id === getSelectedResumeLevel(selectedItem),
              )?.label ?? "Tailored"}{" "}
              · change level
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p
              className="text-(length:--text-small) leading-5 text-foreground-muted"
              role="note"
            >
              This resume is approved. Changing the level writes a new one that
              you approve again.
            </p>
            {resumeChoiceFieldset}
          </details>
        ) : (
          resumeChoiceFieldset
        )}
        {usesOriginalResume && originalResume ? (
          <p
            className="text-(length:--text-small) leading-5 text-foreground-muted"
            role="note"
          >
            {originalResume.fileName} goes out exactly as imported. Check it for
            details you would not share with every employer, such as a home
            address or date of birth.
          </p>
        ) : null}
      </div>

      <div
        className="grid min-w-0 gap-3 rounded-(--radius-field) border border-primary/30 bg-primary/5 p-4"
        data-testid="apply-copilot-footer"
      >
        <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
          Next step
        </span>
        {existingNeedsYouApplication ? (
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            An application for this job is already in progress and needs you.
          </p>
        ) : readinessDescription ? (
          <p
            className="text-(length:--text-small) leading-6 text-foreground-soft"
            data-testid="shortlisted-state-line"
          >
            {readinessDescription}
          </p>
        ) : null}
        {isGenerating ? (
          <div className="grid gap-1.5">
            <ProgressBar
              ariaLabel="Resume preparation in progress"
              indeterminate
            />
            <p className="text-(length:--text-small) leading-5 text-foreground-muted">
              <span className="tabular-nums" data-resume-draft-elapsed>
                {formatResumeOperationElapsed(pendingElapsedSeconds)}
              </span>{" "}
              <span data-resume-draft-expected-wait>
                {RESUME_DRAFT_EXPECTED_WAIT_LABEL}
              </span>
            </p>
          </div>
        ) : null}
        {resumeIdentityBlocked &&
        profile &&
        onKeepResumeIdentity &&
        onClaimResumeIdentity ? (
          <ResumeIdentityChoiceNotice
            onKeepResumeName={onKeepResumeIdentity}
            onUseProfileName={onClaimResumeIdentity}
            profile={profile}
          />
        ) : null}
        {primaryApplicationAction.blocker ? (
          primaryApplicationAction.blockerTone === "info" ? (
            <p
              className="min-w-0 break-words rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--info-text)"
              role="status"
            >
              {primaryApplicationAction.blocker}
            </p>
          ) : (
            <p
              className="min-w-0 break-words rounded-(--radius-small) border border-destructive/35 bg-destructive/8 px-3 py-2 text-(length:--text-small) leading-5 text-foreground"
              role="alert"
            >
              {primaryApplicationAction.blocker}
            </p>
          )
        ) : null}
        {primaryApplicationAction.kind === "start_apply" &&
        requiresApplicationChoice &&
        !existingNeedsYouApplication ? (
          <fieldset className="grid gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/50 p-3">
            <legend className="px-1 text-sm font-semibold text-foreground">
              This job already has applications. Continue one, or start new?
            </legend>
            {selectedJobApplicationRecords.map((record) => (
              <label
                className="flex min-h-9 cursor-pointer items-center gap-3 rounded-(--radius-small) px-2 text-sm text-foreground focus-within:ring-[3px] focus-within:ring-ring/30"
                key={record.id}
              >
                <input
                  checked={selectedApplicationChoice === record.id}
                  name="shortlisted-application-record"
                  onChange={() => setSelectedApplicationChoice(record.id)}
                  type="radio"
                  value={record.id}
                />
                <span>
                  Continue · {getApplicationStagePresentation(record).label}
                </span>
              </label>
            ))}
            <label className="flex min-h-9 cursor-pointer items-center gap-3 rounded-(--radius-small) px-2 text-sm text-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
              <input
                checked={selectedApplicationChoice === "new"}
                name="shortlisted-application-record"
                onChange={() => setSelectedApplicationChoice("new")}
                type="radio"
                value="new"
              />
              <span>Start a new application</span>
            </label>
          </fieldset>
        ) : null}
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-testid="application-action-row"
        >
          {existingNeedsYouApplication ? (
            <Button
              className="h-11 w-fit max-w-full justify-start px-5 text-sm font-semibold normal-case tracking-normal"
              onClick={() => onOpenApplication(existingNeedsYouApplication.id)}
              type="button"
              variant="primary"
            >
              Open application
            </Button>
          ) : (
            <Button
              className="h-11 w-fit max-w-full justify-start px-5 text-sm font-semibold normal-case tracking-normal"
              pending={
                primaryApplicationAction.kind === "waiting" ||
                (primaryApplicationAction.kind === "start_apply" &&
                  isPrimaryApplyPending)
              }
              variant="primary"
              disabled={
                !primaryApplicationAction.enabled ||
                resumeIdentityBlocked ||
                (primaryApplicationAction.kind === "start_apply" &&
                  dailyCapacityExhausted) ||
                (requiresApplicationChoice && !selectedApplicationChoice)
              }
              onClick={() => {
                if (primaryApplicationAction.kind === "open_safeguards") {
                  onOpenSafeguards?.();
                  return;
                }

                if (primaryApplicationAction.kind === "generate_resume") {
                  void onGenerateResume(selectedItem.jobId);
                  return;
                }

                if (primaryApplicationAction.kind === "approve_resume") {
                  onEditResumeWorkspace(selectedItem.jobId);
                  return;
                }

                if (primaryApplicationAction.kind === "approve_and_apply") {
                  if (onApproveResumeAndApply) {
                    onApproveResumeAndApply(selectedItem.jobId);
                  } else {
                    onEditResumeWorkspace(selectedItem.jobId);
                  }
                  return;
                }

                if (primaryApplicationAction.kind === "start_apply") {
                  onStartApplyCopilot(
                    requiresApplicationChoice
                      ? selectedApplicationChoice === "new"
                        ? {
                            jobId: selectedItem.jobId,
                            startNewApplication: true,
                          }
                        : {
                            jobId: selectedItem.jobId,
                            applicationRecordId: selectedApplicationChoice,
                          }
                      : { jobId: selectedItem.jobId },
                  );
                }
              }}
              type="button"
            >
              {primaryApplicationAction.label}
            </Button>
          )}
          {primaryApplicationAction.recovery !== null ? (
            <Button
              className="h-10 min-w-0 justify-start px-4 text-sm font-medium normal-case tracking-normal"
              onClick={runPrimaryRecovery}
              type="button"
              variant="secondary"
            >
              {primaryApplicationAction.recovery.label}
            </Button>
          ) : null}
          {showEditResume ? (
            <Button
              className="h-10 min-w-0 justify-start px-4 text-sm font-medium normal-case tracking-normal"
              onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
              type="button"
              variant="secondary"
            >
              <Pencil aria-hidden="true" className="size-4" focusable="false" />
              Edit resume
            </Button>
          ) : null}
          {isGenerating && isSelectedJobPendingTooLong ? (
            <Button
              className="h-10 min-w-0 justify-start px-4 text-sm font-medium normal-case tracking-normal"
              onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
              type="button"
              variant="secondary"
            >
              Open the resume to reload
            </Button>
          ) : null}
        </div>
        {showsApplyOutcome && !existingNeedsYouApplication ? (
          <p
            className="min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-muted"
            data-testid="apply-outcome"
          >
            {describeApplyOutcome(
              applicationAutomationMode,
              usesOriginalResume,
            )}
          </p>
        ) : null}
        {/* Quiet capacity fact below the actions, and only where it can
            change a decision. */}
        {primaryApplicationAction.kind === "start_apply" ||
        dailyCapacityExhausted ? (
          <p
            className="min-w-0 break-words text-(length:--text-tiny) leading-5 text-foreground-muted"
            data-testid="daily-application-preparation-capacity"
            id={dailyCapacityLimitDescriptionId}
            role="note"
          >
            {dailyCapacityDescription}
          </p>
        ) : null}
        {actionMessage ? (
          <p
            aria-atomic="true"
            aria-live="polite"
            className="min-w-0 break-words text-(length:--text-small) leading-6 text-primary"
            role="status"
          >
            {actionMessage}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
        <Button
          className={quietActionClassName}
          onClick={() => openUrlInJobFinderBrowser(selectedJob.canonicalUrl)}
          size="compact"
          type="button"
          variant="link"
        >
          Open the listing
        </Button>
        <Button
          className={quietActionClassName}
          disabled={isSelectedJobPending}
          onClick={() => onRemoveReviewJob(selectedItem.jobId)}
          size="compact"
          type="button"
          variant="link"
        >
          Remove from shortlist
        </Button>
      </div>
    </section>
  );
}
