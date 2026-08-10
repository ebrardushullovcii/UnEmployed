import { Pencil } from "lucide-react";
import type {
  BrowserSessionState,
  ResumeApplicationMode,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { Button, ProgressBar } from "@renderer/components/ui";
import { EmptyState } from "../../components/empty-state";
import { PreferenceList } from "../../components/preference-list";
import { StatusBadge } from "../../components/status-badge";
import { MatchEvidenceMatrix } from "../../components/match-evidence-matrix";
import { jobDescriptionToText } from "../../lib/job-description-text";
import {
  buildMissionPanelState,
  getChecklistIcon,
  getChecklistStateLabel,
  getChecklistTone,
  summarizeSelectedQueueTitles,
} from "./review-queue-mission-panel-helpers";

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null;
  browserSession: BrowserSessionState;
  displayedProgress: number;
  isApplyPending: boolean;
  isJobPending: (jobId: string) => boolean;
  onClearQueueSelection: () => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (jobId: string) => void;
  onOpenBrowserSession: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenProfile: () => void;
  onRemoveReviewJob: (jobId: string) => void;
  onSetJobResumeApplicationMode: (
    jobId: string,
    resumeApplicationMode: ResumeApplicationMode,
  ) => void;
  queue: readonly ReviewQueueItem[];
  queueSelection: readonly string[];
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
}

export function ReviewQueueMissionPanel({
  actionMessage,
  browserSession,
  displayedProgress,
  isApplyPending,
  isJobPending,
  onClearQueueSelection,
  onStartAutoApplyQueue,
  onStartApplyCopilot,
  onEditResumeWorkspace,
  onGenerateResume,
  onOpenBrowserSession,
  onOpenJobDetails,
  onOpenProfile,
  onRemoveReviewJob,
  onSetJobResumeApplicationMode,
  queue,
  queueSelection,
  selectedAsset,
  selectedItem,
  selectedJob,
}: ReviewQueueMissionPanelProps) {
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
    queueReadyCount,
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

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="order-1 flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6 xl:order-none">
        <h3 className="font-display text-(length:--text-small) font-bold uppercase tracking-(--tracking-caps) text-primary">
          Apply copilot readiness
        </h3>
      </div>
      <div className="order-3 grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-6 pb-6 pt-4">
        {readinessDescription ? (
          <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
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
                    ["original_resume", "Original CV unchanged"],
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
                        className={`flex min-h-11 items-center rounded-(--radius-small) border px-3 py-2 text-left text-(length:--text-small) font-semibold transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${selected ? "border-primary/70 bg-primary/10 text-(--text-headline)" : "border-(--surface-panel-border) bg-background/30 text-foreground-soft hover:border-primary/35"}`}
                      >
                        {label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            </div>
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
                    className="grid min-w-0 gap-1 rounded-(--radius-small) border border-(--surface-panel-border) bg-background/35 px-3 py-2.5"
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
                  <StatusBadge tone="positive">Ready to start</StatusBadge>
                )}
              </div>
              <ul className="m-0 grid gap-3 list-none p-0" role="list">
                {checklist.map((item) => {
                  const Icon = getChecklistIcon(item.state);

                  return (
                    <li
                      key={item.label}
                      className="grid gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) px-3 py-3"
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
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="grid gap-1">
                  <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">
                    Queue staging
                  </span>
                  <strong className="text-(length:--text-body) text-(--text-headline)">
                    {selectedQueueItems.length > 0
                      ? `${selectedQueueItems.length} selected`
                      : `${queueReadyCount} ready for queue`}
                  </strong>
                </div>
                {selectedQueueItems.length > 0 ? (
                  <Button
                    onClick={onClearQueueSelection}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    Clear selection
                  </Button>
                ) : null}
              </div>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                {queueSummary}
              </p>
              {selectedQueueReadyItems.length > 0 ? (
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {summarizeSelectedQueueTitles(selectedQueueReadyItems)}
                </p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-2.5 scroll-mb-6">
              <details className="group grid gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/20 p-2.5">
                <summary className="cursor-pointer select-none rounded-(--radius-small) px-1 py-1 text-(length:--text-label-mono-xs) uppercase tracking-(--tracking-badge) text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  More actions
                </summary>
                <div className="grid gap-2">
                  {selectedQueueReadyItems.length === 0 ? (
                    <Button
                      className="h-auto min-h-10 w-full min-w-0 justify-start whitespace-normal break-words px-3.5 py-2.5 text-left text-sm font-medium leading-5 normal-case tracking-normal disabled:bg-transparent disabled:text-foreground-soft"
                      disabled
                      size="compact"
                      type="button"
                      variant="outline"
                    >
                      Stage selected queue
                    </Button>
                  ) : null}
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
            description="Select a shortlisted job to see what its resume needs next and when it is ready to apply."
          />
        )}
      </div>
      {selectedItem && selectedJob ? (
        <div
          className="relative order-2 z-10 grid shrink-0 gap-2 border-y border-(--surface-panel-border) bg-(--surface-panel)/95 px-6 py-4 backdrop-blur-sm xl:border-b-0"
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
              className="h-11 w-full justify-start px-4 text-sm font-semibold normal-case tracking-normal"
              pending={isApplyPending || isSelectedQueuePending}
              disabled={
                isApplyPending ||
                isSelectedQueuePending ||
                !canStageSelectedQueue
              }
              onClick={() =>
                onStartAutoApplyQueue(
                  selectedQueueReadyItems.map((item) => item.jobId),
                )
              }
              type="button"
              variant="secondary"
            >
              Stage queue for {selectedQueueReadyItems.length} job
              {selectedQueueReadyItems.length === 1 ? "" : "s"}
            </Button>
          ) : null}
          <Button
            className="h-11 w-full justify-start px-4 text-sm font-semibold normal-case tracking-normal"
            pending={
              primaryApplicationAction.kind === "waiting" ||
              (primaryApplicationAction.kind === "start_apply" &&
                isPrimaryApplyPending)
            }
            variant="primary"
            disabled={!primaryApplicationAction.enabled}
            onClick={() => {
              if (primaryApplicationAction.kind === "generate_resume") {
                onGenerateResume(selectedItem.jobId);
                return;
              }

              if (primaryApplicationAction.kind === "start_apply") {
                onStartApplyCopilot(selectedItem.jobId);
              }
            }}
            type="button"
          >
            {primaryApplicationAction.label}
          </Button>
          {primaryApplicationAction.recovery ? (
            <Button
              className="h-10 w-full justify-start px-4 text-sm font-medium normal-case tracking-normal"
              onClick={runPrimaryRecovery}
              type="button"
              variant="secondary"
            >
              {primaryApplicationAction.recovery.label}
            </Button>
          ) : null}
          {selectedItem.resumeApplicationMode !== "original_resume" &&
          primaryApplicationAction.recovery?.kind !==
            "open_resume_workspace" ? (
            <Button
              className="h-10 w-full justify-start px-4 text-sm font-medium normal-case tracking-normal"
              onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
              type="button"
              variant="secondary"
            >
              <Pencil aria-hidden="true" className="size-4" focusable="false" />
              Open resume workspace
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
