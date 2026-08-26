import { Pencil } from "lucide-react";
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
import { PreferenceList } from "../../components/preference-list";
import { StatusBadge } from "../../components/status-badge";
import { MatchEvidenceMatrix } from "../../components/match-evidence-matrix";
import { ResumeStrategyJobPanel } from "./resume-strategy-job-panel";
import { jobDescriptionToText } from "../../lib/job-description-text";
import {
  buildMissionPanelState,
  getChecklistIcon,
  getChecklistStateLabel,
  getChecklistTone,
  summarizeSelectedQueueTitles,
} from "./review-queue-mission-panel-helpers";
import { APPLICATION_PREPARATION_BATCH_LIMIT } from "./review-queue-status";

const batchLimitDescriptionId = "employer-application-batch-limit";
const dailyCapacityLimitDescriptionId =
  "employer-application-daily-capacity-limit";

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null;
  applicationRecords: readonly ApplicationRecord[];
  browserSession: BrowserSessionState;
  campaignId: string;
  campaignDefaultResumeStrategyId?: string | null | undefined;
  displayedProgress: number;
  globalDailyApplicationPreparationCapacity?: GlobalDailyApplicationPreparationCapacity | null;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
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
}

export function ReviewQueueMissionPanel({
  actionMessage,
  applicationRecords,
  browserSession,
  campaignId,
  campaignDefaultResumeStrategyId,
  displayedProgress,
  globalDailyApplicationPreparationCapacity = null,
  isApplyPending,
  isJobPending,
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
}: ReviewQueueMissionPanelProps) {
  const [selectedApplicationChoice, setSelectedApplicationChoice] =
    useState<string>("");
  const {
    applyReadinessStatus,
    canStageSelectedQueue,
    checklist,
    isGenerating,
    isPrimaryApplyPending,
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
    queue,
    queueSelection,
    selectedAsset,
    selectedItem,
    selectedJob,
  });
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
    primaryApplicationAction.recovery?.kind === "open_resume_workspace";
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
  const dailyCapacityDescription = globalDailyApplicationPreparationCapacity
    ? `${globalDailyApplicationPreparationCapacity.used} exact begun${
        globalDailyApplicationPreparationCapacity.legacyUncertain > 0
          ? ` / ${globalDailyApplicationPreparationCapacity.legacyUncertain} older ${globalDailyApplicationPreparationCapacity.legacyUncertain === 1 ? "record may also have begun" : "records may also have begun"}`
          : ""
      } of ${globalDailyApplicationPreparationCapacity.limit} / ${globalDailyApplicationPreparationCapacity.remaining} remaining. ${
        dailyCapacityExhausted
          ? "More application preparation is available after local midnight."
          : selectedBatchExceedsDailyCapacity
            ? ""
          : `Resets at local midnight (${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(globalDailyApplicationPreparationCapacity.resetsAt))}).`
      }`
    : "Daily safeguard: up to 20 begun employer applications per local day.";
  const dailyCapacityBatchExceededDescription =
    selectedBatchExceedsDailyCapacity &&
    !dailyCapacityExhausted &&
    globalDailyApplicationPreparationCapacity
      ? `You selected ${queuedApplicationJobIds.length} jobs for this run, but only ${globalDailyApplicationPreparationCapacity.remaining} of ${globalDailyApplicationPreparationCapacity.limit} daily application slots remain. Resets at local midnight (${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(globalDailyApplicationPreparationCapacity.resetsAt))}).`
      : null;

  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden xl:h-full xl:min-h-0",
        embedded
          ? "h-full min-h-0"
          : "surface-panel-shell min-h-124 rounded-(--radius-field) border border-(--surface-panel-border)",
      )}
    >
      {!embedded ? (
        <div className="order-1 flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6 xl:order-none">
          <h3 className="font-display text-(length:--text-small) font-bold uppercase tracking-(--tracking-caps) text-primary">
            Preparation readiness
          </h3>
        </div>
      ) : null}
      <div
        className="order-3 grid min-h-0 min-w-0 flex-1 content-start gap-3 overflow-x-hidden overflow-y-auto px-6 pb-5 pt-3"
        data-locked-pane-scroll-region
      >
        {readinessDescription ? (
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
                Current state
              </span>
              <StatusBadge tone={applyReadinessStatus.tone}>
                {applyReadinessStatus.label}
              </StatusBadge>
            </div>
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {readinessDescription}
            </p>
            {selectedItem && isGenerating ? (
              <ProgressBar
                ariaLabel="Resume progress"
                percent={displayedProgress}
              />
            ) : null}
          </div>
        ) : null}
        {selectedItem && selectedJob ? (
          <>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="grid gap-1">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
                  CV for this job
                </span>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  This choice changes only this shortlisted job. Settings stay
                  the default for jobs you shortlist later.
                </p>
              </div>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">CV choice for this job</legend>
                {(
                  [
                    ["original_resume", "Original resume unchanged"],
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
                          onSetJobResumeApplicationMode(
                            selectedItem.jobId,
                            mode,
                          )
                        }
                        type="radio"
                        value={mode}
                      />
                      <span
                        className={`flex min-h-11 items-center rounded-(--radius-small) border px-3 py-2 text-left text-(length:--text-small) font-semibold transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${selected ? "border-primary/70 bg-primary/10 text-(--text-headline)" : "border-(--surface-panel-border) bg-background/30 text-foreground-soft hover:border-primary/35"}`}
                      >
                        {label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
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
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-primary/35 bg-primary/5 p-4">
              <div className="grid gap-1">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-primary">
                  Before the browser opens
                </span>
                <h4 className="text-(length:--text-body) font-semibold text-(--text-headline)">
                  Application readiness
                </h4>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Review the exact destination, file, possible handoffs, and
                  safety boundary for this run.
                </p>
              </div>
              <dl className="m-0 grid gap-2">
                {readinessFacts.map((fact) => (
                  <div
                    className="grid min-w-0 gap-1 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/35 px-3 py-2"
                    key={fact.label}
                  >
                    <dt className="text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-muted-foreground">
                      {fact.label}
                    </dt>
                    <dd className="m-0 min-w-0 break-words text-(length:--text-small) font-semibold text-(--text-headline)">
                      {fact.value}
                    </dd>
                    <dd className="m-0 min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft">
                      {fact.detail}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
                  Checklist
                </span>
                {nextBlockedChecklistItem ? (
                  <StatusBadge
                    tone={getChecklistTone(nextBlockedChecklistItem.state)}
                  >
                    Next: {nextBlockedChecklistItem.label}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="positive">Ready to prepare</StatusBadge>
                )}
              </div>
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
            </div>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="grid gap-1">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
                  Job summary
                </span>
                <strong className="text-(length:--text-body) text-(--text-headline)">
                  {selectedJob.title}
                </strong>
              </div>
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                {jobDescriptionToText(
                  selectedJob.summary ?? selectedJob.description,
                )}
              </p>
              {selectedJob.employerWebsiteUrl ? (
                <p className="min-w-0 break-words text-(length:--text-small) leading-6 text-foreground-soft">
                  Company site: {selectedJob.employerWebsiteUrl}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <PreferenceList
                label="Why it fits"
                values={selectedJob.matchAssessment.reasons}
              />
            </div>
            <MatchEvidenceMatrix assessment={selectedJob.matchAssessment} />
            {selectedQueueItems.length > 0 ? (
              <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="grid gap-1">
                    <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
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
                <summary className="cursor-pointer select-none rounded-(--radius-small) px-1 py-1 text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
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
          <p
            className="min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft"
            data-testid="daily-application-preparation-capacity"
            role="note"
          >
            {dailyCapacityDescription}
          </p>
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
            <p
              className="min-w-0 break-words rounded-(--radius-small) border border-destructive/35 bg-destructive/8 px-3 py-2 text-(length:--text-small) leading-5 text-foreground"
              role="alert"
            >
              {primaryApplicationAction.blocker}
            </p>
          ) : null}
          {selectedQueueReadyItems.length > 0 ? (
            <Button
              aria-describedby={
                dailyCapacityBatchExceededDescription
                  ? `${batchLimitDescriptionId} ${dailyCapacityLimitDescriptionId}`
                  : batchLimitDescriptionId
              }
              className="h-11 w-full justify-start px-4 text-sm font-semibold normal-case tracking-normal"
              pending={isApplyPending || isSelectedQueuePending}
              disabled={
                isApplyPending ||
                isSelectedQueuePending ||
                !canStageSelectedQueue ||
                selectedBatchExceedsDailyCapacity
              }
              onClick={() => onStartAutoApplyQueue(queuedApplicationJobIds)}
              type="button"
              variant="secondary"
            >
              Queue selected applications ({queuedApplicationJobIds.length})
            </Button>
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
            className="h-11 w-full justify-start px-4 text-sm font-semibold normal-case tracking-normal"
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
          {showSecondaryActions ? (
            <div className="flex flex-wrap gap-2">
              {primaryApplicationAction.recovery !== null ? (
                <Button
                  className="h-10 min-w-0 flex-1 basis-52 justify-start px-4 text-sm font-medium normal-case tracking-normal"
                  onClick={runPrimaryRecovery}
                  type="button"
                  variant="secondary"
                >
                  {primaryApplicationAction.recovery.label}
                </Button>
              ) : null}
              {wantsResumeWorkspace && !workspaceRecoveryActive ? (
                <Button
                  className="h-10 min-w-0 flex-1 basis-52 justify-start px-4 text-sm font-medium normal-case tracking-normal"
                  onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                  type="button"
                  variant="secondary"
                >
                  <Pencil
                    aria-hidden="true"
                    className="size-4"
                    focusable="false"
                  />
                  Open resume workspace
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
