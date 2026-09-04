import { Check, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ApplicationRecord,
  JobFinderApplicationStartTarget,
  BrowserSessionState,
  GlobalDailyApplicationPreparationCapacity,
  ResumeApplicationMode,
  ResumeSourceDocument,
  ResumeStrategy,
  ResumeStrategyRecommendation,
  ResumeStrategySelection,
  ReviewQueueItem,
  SavedJob,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  TailoredAsset,
} from "@unemployed/contracts";
import { Button, ProgressBar } from "@renderer/components/ui";
import { cn } from "@renderer/lib/cn";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { ResumeStrategyJobPanel } from "./resume-strategy-job-panel";
import { formatDailyPreparationCapacitySummaryText } from "../../lib/job-finder-daily-capacity";
import {
  formatResumeOperationElapsed,
  RESUME_DRAFT_EXPECTED_WAIT_LABEL,
} from "./review-queue-progress";
import {
  type ApplicationReadinessFact,
  type ApplyChecklistItem,
  buildMissionPanelState,
  getChecklistIcon,
  getChecklistStateLabel,
  getChecklistTone,
  partitionApplicationReadinessFacts,
  summarizeSelectedQueueTitles,
} from "./review-queue-mission-panel-helpers";
import { APPLICATION_PREPARATION_BATCH_LIMIT } from "./review-queue-status";

const batchLimitDescriptionId = "employer-application-batch-limit";
const dailyCapacityLimitDescriptionId =
  "employer-application-daily-capacity-limit";
const readinessFactLabelClass =
  "text-xs font-medium tracking-(--tracking-badge) text-muted-foreground";
const readinessFactLabelDenseClass =
  "text-xs font-semibold uppercase tracking-(--tracking-badge) text-foreground-soft";

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null;
  applicationRecords: readonly ApplicationRecord[];
  browserSession: BrowserSessionState;
  campaignId: string;
  campaignDefaultResumeStrategyId?: string | null | undefined;
  /** Seconds the current preparation has been running. */
  pendingElapsedSeconds: number;
  globalDailyApplicationPreparationCapacity?: GlobalDailyApplicationPreparationCapacity | null;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  isSelectedJobPendingTooLong?: boolean;
  isResumeStrategyPending: (jobId: string) => boolean;
  onClearQueueSelection: () => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (input: JobFinderApplicationStartTarget) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (jobId: string) => Promise<boolean>;
  onOpenBrowserSession: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenProfile: () => void;
  onRecommendResumeStrategy: (input: {
    jobId: string;
  }) => Promise<ResumeStrategyRecommendation | null>;
  onRemoveReviewJob: (jobId: string) => void;
  onSelectResumeStrategy: (input: SelectResumeStrategyInput) => void;
  onSetCampaignResumeStrategyDefault?:
    | ((input: SetCampaignResumeStrategyDefaultInput) => void)
    | undefined;
  onSetJobResumeApplicationMode: (
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ) => void;
  originalResume?: ResumeSourceDocument;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  resumeStrategies: readonly ResumeStrategy[];
  resumeStrategySelections: readonly ResumeStrategySelection[];
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
  embedded?: boolean;
  /**
   * Stacked into one page column rather than owning a pane. Drops the
   * panel's own height cap and scroller so the surrounding column is the
   * single scroll owner: three thin tabs became one linear page.
   */
  stacked?: boolean;
}

export function ReviewQueueMissionPanel({
  actionMessage,
  applicationRecords,
  browserSession,
  campaignId,
  campaignDefaultResumeStrategyId,
  pendingElapsedSeconds,
  globalDailyApplicationPreparationCapacity = null,
  isApplyPending,
  isJobPending,
  isSelectedJobPendingTooLong = false,
  isResumeStrategyPending,
  onClearQueueSelection,
  onStartAutoApplyQueue,
  onStartApplyCopilot,
  onEditResumeWorkspace,
  onGenerateResume,
  onOpenBrowserSession,
  onOpenJobDetails,
  onOpenProfile,
  onRecommendResumeStrategy,
  onRemoveReviewJob,
  onSelectResumeStrategy,
  onSetCampaignResumeStrategyDefault,
  onSetJobResumeApplicationMode,
  originalResume,
  queue,
  queueSelection,
  resumeStrategies,
  resumeStrategySelections,
  selectedAsset,
  selectedItem,
  selectedJob,
  embedded = false,
  stacked = false,
}: ReviewQueueMissionPanelProps) {
  const [selectedApplicationChoice, setSelectedApplicationChoice] =
    useState<string>("");
  const {
    canStageSelectedQueue,
    checklist,
    isGenerating,
    isPrimaryApplyPending,
    isReadyToPrepare,
    isSelectedJobPending,
    isSelectedQueuePending,
    nextBlockedChecklistItem,
    primaryApplicationAction,
    queueSummary,
    readinessFacts,
    readinessDescription,
    selectedQueueItems,
    selectedQueueReadyItems,
  } = buildMissionPanelState({
    browserSession,
    isApplyPending,
    isJobPending,
    isSelectedJobPendingTooLong,
    queue,
    queueSelection,
    selectedAsset,
    selectedItem,
    selectedJob,
  });
  const { primary: readyPrimaryFacts, secondary: readySecondaryFacts } =
    partitionApplicationReadinessFacts(readinessFacts);
  const selectedJobApplicationRecords = selectedItem
    ? applicationRecords.filter((record) => record.jobId === selectedItem.jobId)
    : [];
  const requiresApplicationChoice = selectedJobApplicationRecords.length > 1;

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
    }
  };

  const wantsResumeWorkspace =
    selectedItem !== null &&
    selectedItem.resumeApplicationMode !== "original_resume";
  const workspaceRecoveryActive =
    wantsResumeWorkspace &&
    (primaryApplicationAction.kind === "approve_resume" ||
      primaryApplicationAction.recovery?.kind === "open_resume_workspace");
  const showSecondaryActions =
    primaryApplicationAction.recovery !== null ||
    (wantsResumeWorkspace && !workspaceRecoveryActive);
  const queuedApplicationJobIds = Array.from(
    new Set(selectedQueueReadyItems.map((item) => item.jobId)),
  ).slice(0, APPLICATION_PREPARATION_BATCH_LIMIT);
  const isBatchLimitReached =
    selectedQueueReadyItems.length >= APPLICATION_PREPARATION_BATCH_LIMIT;
  const dailyCapacityExhausted =
    globalDailyApplicationPreparationCapacity?.remaining === 0;
  const selectedBatchExceedsDailyCapacity =
    globalDailyApplicationPreparationCapacity !== null &&
    queuedApplicationJobIds.length >
      globalDailyApplicationPreparationCapacity.remaining;
  const dailyCapacityDescription = formatDailyPreparationCapacitySummaryText(
    globalDailyApplicationPreparationCapacity,
  );
  const dailyCapacityBatchExceededDescription =
    selectedBatchExceedsDailyCapacity &&
    !dailyCapacityExhausted &&
    globalDailyApplicationPreparationCapacity
      ? `You selected ${queuedApplicationJobIds.length} jobs for this run, but only ${globalDailyApplicationPreparationCapacity.remaining} of ${globalDailyApplicationPreparationCapacity.limit} daily application slots remain. Resets at local midnight (${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(globalDailyApplicationPreparationCapacity.resetsAt))}).`
      : null;

  const resumeChoiceFieldset = selectedItem ? (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Resume choice for this job</legend>
      {(
        [
          ["original_resume", "Use my original resume"],
          ["tailored_per_job", "Tailor for this job"],
        ] as const
      ).map(([mode, label]) => {
        const selected = selectedItem.resumeApplicationMode === mode;

        return (
          <label
            className={
              isSelectedJobPending
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer"
            }
            key={mode}
          >
            <input
              checked={selected}
              className="peer sr-only"
              disabled={isSelectedJobPending}
              name={`resume-application-mode-${selectedItem.jobId}`}
              onChange={() =>
                onSetJobResumeApplicationMode(selectedItem.jobId, mode)
              }
              type="radio"
              value={mode}
            />
            {/* Two equal cards with a faint tint did not read as a
                            choice; the selected one gets a real marker. */}
            <span
              className={`flex min-h-11 items-center gap-2 rounded-(--radius-small) border px-3 py-2 text-left text-(length:--text-small) font-semibold transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${selected ? "border-primary bg-primary/10 text-(--text-headline) shadow-[inset_2px_0_0_var(--primary)]" : "border-(--surface-panel-border) bg-background/30 text-foreground-soft hover:border-primary/35"}`}
            >
              {selected ? (
                <Check
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
              ) : null}
              {label}
            </span>
          </label>
        );
      })}
    </fieldset>
  ) : null;

  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col",
        stacked ? null : "overflow-hidden xl:h-full xl:min-h-0",
        stacked
          ? null
          : embedded
            ? "h-full min-h-0"
            : "surface-panel-shell min-h-124 rounded-(--radius-field) border border-(--surface-panel-border)",
      )}
    >
      {!embedded ? (
        <div className="order-1 flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6 xl:order-none">
          {/* An eyebrow is a label, not a heading. */}
          <p className="font-display text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-caps) text-primary">
            Preparation readiness
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "order-3 grid min-w-0 content-start gap-5 px-6 pb-5 pt-3",
          stacked ? null : "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
        )}
        {...(stacked ? {} : { "data-locked-pane-scroll-region": true })}
      >
        {readinessDescription && !isReadyToPrepare ? (
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
                Current state
              </span>
            </div>
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {readinessDescription}
            </p>
            {selectedItem && isGenerating ? (
              <div className="mt-2 grid gap-1.5">
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
          </div>
        ) : null}
        {selectedItem && selectedJob ? (
          <>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
                  Resume for this job
                </span>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Applies to this job only.
                </p>
              </div>
              {selectedItem.resumeReview.status === "approved" ? (
                // Approved work is destructive to change, so the control is
                // parked behind a deliberate reveal that states the cost
                // first instead of sitting live under the pointer.
                // A full-width muted box with a left-aligned label and no
                // chevron read as a disabled text input, and its 1.64:1
                // boundary was below the non-text contrast floor. It now
                // carries the interactive boundary token and a disclosure
                // chevron so it reads as the control it is.
                <details
                  className="group grid min-w-0 gap-3 rounded-(--radius-small) border border-(--control-border) bg-background/30 px-3 py-2"
                  data-resume-choice-disclosure
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-(length:--text-small) font-semibold text-foreground outline-none marker:hidden focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                    Change resume choice
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <p
                    className="text-(length:--text-small) leading-5 text-foreground-muted"
                    role="note"
                  >
                    This job already has an approved resume. Switching here
                    replaces it, and the new choice has to be approved before
                    you can prepare the application.
                  </p>
                  {resumeChoiceFieldset}
                </details>
              ) : (
                resumeChoiceFieldset
              )}
              {selectedItem.resumeApplicationMode === "original_resume" &&
              originalResume ? (
                <p
                  className="rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--warning-text)"
                  role="note"
                >
                  Original file: {originalResume.fileName}. It is used unchanged
                  and may include sensitive contact or personal details. Review
                  the file before preparing an application.
                </p>
              ) : null}
            </div>
            {/* A resume approach only shapes tailored resumes, so it stays
                out of the way while the original file is the choice — and an
                optional reusable-config feature does not belong in the main
                journey before the user has saved a single approach. It is
                created and managed from More > Resume approaches. */}
            {selectedItem.resumeApplicationMode === "tailored_per_job" &&
            resumeStrategies.some((strategy) => strategy.enabled) ? (
              <ResumeStrategyJobPanel
                campaignId={campaignId}
                campaignDefaultResumeStrategyId={
                  campaignDefaultResumeStrategyId
                }
                isPending={isResumeStrategyPending(selectedItem.jobId)}
                jobId={selectedItem.jobId}
                onRecommend={onRecommendResumeStrategy}
                onSelect={onSelectResumeStrategy}
                onSetCampaignDefault={onSetCampaignResumeStrategyDefault}
                selections={resumeStrategySelections}
                strategies={resumeStrategies}
              />
            ) : null}
            {/* Before a resume is ready, the preparation contract is reference
                material, not the next step: it collapses behind one summary
                so the primary action and current state lead the panel. */}
            {isReadyToPrepare ? null : (
              <details
                className="group min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/20 p-3"
                data-testid="shortlisted-preparation-details"
              >
                {/* The disclosure has to look operable: a chevron plus a
                    link-coloured label, not a plain heading. */}
                <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 rounded-(--radius-small) px-1 py-1 text-(length:--text-small) font-semibold text-primary underline-offset-4 outline-none [&::-webkit-details-marker]:hidden hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open:rotate-90"
                  />
                  What happens when you prepare
                </summary>
                <div className="mt-3 grid min-w-0 gap-3">
                  <PreparationReadinessCard
                    isReadyToPrepare={false}
                    readinessFacts={readinessFacts}
                    readyPrimaryFacts={readyPrimaryFacts}
                    readySecondaryFacts={readySecondaryFacts}
                  />
                  <PreparationChecklistCard
                    checklist={checklist}
                    isReadyToPrepare={false}
                    nextBlockedChecklistItem={nextBlockedChecklistItem}
                  />
                </div>
              </details>
            )}
            {isReadyToPrepare ? (
              <>
                <PreparationReadinessCard
                  isReadyToPrepare
                  readinessFacts={readinessFacts}
                  readyPrimaryFacts={readyPrimaryFacts}
                  readySecondaryFacts={readySecondaryFacts}
                />
                <PreparationChecklistCard
                  checklist={checklist}
                  isReadyToPrepare
                  nextBlockedChecklistItem={nextBlockedChecklistItem}
                />
              </>
            ) : null}
            {selectedQueueItems.length > 0 ? (
              <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="grid gap-1">
                    <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
                      Batch actions
                    </span>
                    <strong className="text-(length:--text-body) text-(--text-headline)">
                      {queuedApplicationJobIds.length} of{" "}
                      {APPLICATION_PREPARATION_BATCH_LIMIT} selected for this
                      run
                    </strong>
                  </div>
                  <Button
                    onClick={onClearQueueSelection}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    Clear selection
                  </Button>
                </div>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {queueSummary}
                </p>
                <p
                  className="text-(length:--text-small) leading-6 text-foreground-soft"
                  id={batchLimitDescriptionId}
                  role="note"
                >
                  {`Each employer-application run can include up to ${APPLICATION_PREPARATION_BATCH_LIMIT} jobs.${
                    isBatchLimitReached
                      ? " The selection limit is reached; deselect a job before choosing another."
                      : ""
                  }`}
                </p>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {summarizeSelectedQueueTitles(selectedQueueReadyItems)}
                </p>
              </div>
            ) : null}
            <div className="grid min-w-0 gap-2.5 scroll-mb-6">
              <details className="group grid gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/20 p-2.5">
                {/* One disclosure grammar on this panel: chevron plus a
                    sentence-case label, never a shouted caps heading. */}
                <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 rounded-(--radius-small) px-1 py-1 text-(length:--text-small) font-semibold text-primary underline-offset-4 outline-none [&::-webkit-details-marker]:hidden hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open:rotate-90"
                  />
                  More actions
                </summary>
                <div className="grid gap-2">
                  <Button
                    className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal break-words px-3.5 py-2.5 text-left text-sm font-medium leading-5 normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                    disabled={isSelectedJobPending}
                    onClick={() => onRemoveReviewJob(selectedItem.jobId)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    Remove from shortlisted
                  </Button>
                </div>
              </details>
            </div>
          </>
        ) : selectedItem ? (
          <EmptyState
            title="Job not loaded"
            description="The selected job could not be loaded. Try selecting another job or refreshing the page."
          />
        ) : (
          <EmptyState
            title="Choose a job"
            description="Select a shortlisted job to see what its resume needs next and when it is ready to prepare."
          />
        )}
      </div>
      {selectedItem && selectedJob ? (
        <div
          className="relative order-2 z-10 grid shrink-0 gap-2 border-y border-(--surface-panel-border) bg-(--surface-panel)/95 px-6 py-3 backdrop-blur-sm xl:border-b-0"
          data-testid="apply-copilot-footer"
        >
          {dailyCapacityBatchExceededDescription ? (
            <p
              className="min-w-0 break-words rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-(--warning-text)"
              data-testid="daily-capacity-batch-exceeded-note"
              id={dailyCapacityLimitDescriptionId}
              role="note"
            >
              {dailyCapacityBatchExceededDescription}
            </p>
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
          requiresApplicationChoice ? (
            <fieldset className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/50 p-3">
              <legend className="px-1 text-sm font-semibold text-foreground">
                Choose application record
              </legend>
              {selectedJobApplicationRecords.map((record) => (
                <label
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-(--radius-small) px-2 text-sm text-foreground focus-within:ring-[3px] focus-within:ring-ring/30"
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
                    {record.title} at {record.company} ·{" "}
                    {record.status.replaceAll("_", " ")}
                  </span>
                </label>
              ))}
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-(--radius-small) px-2 text-sm text-foreground focus-within:ring-[3px] focus-within:ring-ring/30">
                <input
                  checked={selectedApplicationChoice === "new"}
                  name="shortlisted-application-record"
                  onChange={() => setSelectedApplicationChoice("new")}
                  type="radio"
                  value="new"
                />
                <span>Start new application</span>
              </label>
            </fieldset>
          ) : null}
          <Button
            // A page-wide bar is not a button: the one primary keeps its
            // natural width beside its secondary.
            className="h-11 w-fit max-w-full justify-start px-5 text-sm font-semibold normal-case tracking-normal"
            pending={
              primaryApplicationAction.kind === "waiting" ||
              (primaryApplicationAction.kind === "start_apply" &&
                isPrimaryApplyPending)
            }
            variant="primary"
            disabled={
              !primaryApplicationAction.enabled ||
              (primaryApplicationAction.kind === "start_apply" &&
                dailyCapacityExhausted) ||
              (requiresApplicationChoice && !selectedApplicationChoice)
            }
            onClick={() => {
              if (primaryApplicationAction.kind === "generate_resume") {
                void onGenerateResume(selectedItem.jobId);
                return;
              }

              if (primaryApplicationAction.kind === "approve_resume") {
                onEditResumeWorkspace(selectedItem.jobId);
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
          {selectedQueueReadyItems.length > 0 ? (
            <Button
              aria-describedby={
                dailyCapacityBatchExceededDescription
                  ? `${batchLimitDescriptionId} ${dailyCapacityLimitDescriptionId}`
                  : batchLimitDescriptionId
              }
              className="h-10 w-fit max-w-full justify-start border-(--border-strong) px-4 text-sm font-medium normal-case tracking-normal"
              pending={isApplyPending || isSelectedQueuePending}
              disabled={
                isApplyPending ||
                isSelectedQueuePending ||
                !canStageSelectedQueue ||
                selectedBatchExceedsDailyCapacity
              }
              onClick={() => onStartAutoApplyQueue(queuedApplicationJobIds)}
              type="button"
              variant="ghost"
            >
              Prepare selected jobs ({queuedApplicationJobIds.length})
            </Button>
          ) : null}
          {showSecondaryActions ? (
            <div className="flex flex-wrap gap-2">
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
              {wantsResumeWorkspace && !workspaceRecoveryActive ? (
                <Button
                  className="h-10 min-w-0 justify-start px-4 text-sm font-medium normal-case tracking-normal"
                  onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                  type="button"
                  variant="secondary"
                >
                  <Pencil
                    aria-hidden="true"
                    className="size-4"
                    focusable="false"
                  />
                  {isSelectedJobPendingTooLong
                    ? "Open workspace to reload"
                    : "Open resume workspace"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {/* Quiet capacity fact below the actions, and only where it can
              change a decision: while the resume is still being written or
              approved, the daily application limit is not the user's
              problem yet. */}
          {primaryApplicationAction.kind === "start_apply" ||
          dailyCapacityExhausted ? (
            <p
              className="min-w-0 break-words text-(length:--text-tiny) leading-5 text-foreground-muted"
              data-testid="daily-application-preparation-capacity"
              role="note"
            >
              {dailyCapacityDescription}
            </p>
          ) : null}
          {/* Below the actions, never above them: a muted sentence sitting
              directly over the primary read as its caption while the durable
              state row already said the same thing properly. */}
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
      ) : null}
    </section>
  );
}

function PreparationReadinessCard({
  isReadyToPrepare,
  readinessFacts,
  readyPrimaryFacts,
  readySecondaryFacts,
}: {
  isReadyToPrepare: boolean;
  readinessFacts: readonly ApplicationReadinessFact[];
  readyPrimaryFacts: readonly ApplicationReadinessFact[];
  readySecondaryFacts: readonly ApplicationReadinessFact[];
}) {
  return (
    <div
      className={cn(
        "surface-card-tint grid min-w-0 rounded-(--radius-field) border border-primary/35 bg-primary/5 p-4",
        isReadyToPrepare ? "gap-4" : "gap-3",
      )}
      data-compact={isReadyToPrepare ? "true" : "false"}
      data-testid="shortlisted-application-readiness"
    >
      <div className="grid gap-1">
        <span
          className={
            isReadyToPrepare
              ? "text-(length:--text-label) font-medium tracking-(--tracking-heading) text-muted-foreground"
              : "text-(length:--text-label) uppercase tracking-(--tracking-heading) text-primary"
          }
        >
          Before the browser opens
        </span>
        <h4 className="text-(--text-headline)">Application readiness</h4>
        {isReadyToPrepare ? (
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            File and destination confirmed. Use{" "}
            <strong className="font-semibold text-(--text-headline)">
              Prepare application
            </strong>{" "}
            below — final submit stays disabled for this run.
          </p>
        ) : (
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            Review the exact destination, file, possible handoffs, and safety
            boundary for this run.
          </p>
        )}
      </div>
      {isReadyToPrepare ? (
        <>
          <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-3">
            {readyPrimaryFacts.map((fact) => (
              <div className="grid min-w-0 gap-1" key={fact.label}>
                <dt className={readinessFactLabelClass}>{fact.label}</dt>
                <dd className="m-0 min-w-0 break-words text-(length:--text-small) font-medium text-(--text-headline)">
                  {fact.value}
                </dd>
                {fact.label === "Destination" ? (
                  <dd
                    className="m-0 min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft"
                    title={fact.detail}
                  >
                    {fact.detail.split(" | ")[0]}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
          {readySecondaryFacts.length > 0 ? (
            <details className="group min-w-0">
              <summary className="cursor-pointer list-none text-(length:--text-small) font-medium text-muted-foreground outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring">
                More preparation boundaries
              </summary>
              <dl className="mt-3 grid gap-3 border-t border-(--surface-panel-border)/70 pt-3">
                {readySecondaryFacts.map((fact) => (
                  <div className="grid min-w-0 gap-1" key={fact.label}>
                    <dt className={readinessFactLabelClass}>{fact.label}</dt>
                    <dd className="m-0 min-w-0 break-words text-(length:--text-small) font-medium text-(--text-headline)">
                      {fact.value}
                    </dd>
                    <dd className="m-0 min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                      {fact.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </>
      ) : (
        <dl className="m-0 grid gap-2">
          {readinessFacts.map((fact) => (
            <div
              className="grid min-w-0 gap-1 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/35 px-3 py-2"
              key={fact.label}
            >
              <dt className={readinessFactLabelDenseClass}>{fact.label}</dt>
              <dd className="m-0 min-w-0 break-words text-(length:--text-small) font-medium text-(--text-headline)">
                {fact.value}
              </dd>
              <dd className="m-0 min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                {fact.detail}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function PreparationChecklistCard({
  checklist,
  isReadyToPrepare,
  nextBlockedChecklistItem,
}: {
  checklist: readonly ApplyChecklistItem[];
  isReadyToPrepare: boolean;
  nextBlockedChecklistItem: ApplyChecklistItem | null;
}) {
  return (
    <div
      className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4"
      data-testid="shortlisted-readiness-checklist"
      data-ready-to-prepare={isReadyToPrepare ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-(--tracking-heading) text-foreground-soft">
          {isReadyToPrepare ? "Ready" : "Checklist"}
        </span>
        {/* The workspace header and the list row already carry this state;
            a third identical chip inside the same 200px does not add
            information. Only the outstanding step earns a line here. */}
        {nextBlockedChecklistItem ? (
          <span className="text-(length:--text-small) font-medium text-foreground-soft">
            Next: {nextBlockedChecklistItem.label}
          </span>
        ) : null}
      </div>
      {isReadyToPrepare ? (
        <p className="m-0 text-(length:--text-small) leading-6 text-foreground-soft">
          Resume and apply path are ready. Use{" "}
          <strong className="font-semibold text-(--text-headline)">
            Prepare application
          </strong>{" "}
          below as the next step.
        </p>
      ) : (
        <ul className="m-0 grid gap-2 list-none p-0" role="list">
          {checklist.map((item) => {
            const Icon = getChecklistIcon(item.state);

            return (
              <li
                key={item.label}
                className="grid gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-current" />
                    <strong className="text-(length:--text-small) text-(--text-headline)">
                      {item.label}
                    </strong>
                  </div>
                  <StatusBadge tone={getChecklistTone(item.state)}>
                    {getChecklistStateLabel(item.state)}
                  </StatusBadge>
                </div>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {item.description}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
