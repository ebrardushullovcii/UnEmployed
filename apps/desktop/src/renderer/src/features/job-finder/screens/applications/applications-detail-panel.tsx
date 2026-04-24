import { useMemo } from "react";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  ApplyRunDetails,
  ApplySubmitApproval,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import { cn } from "@renderer/lib/utils";
import {
  formatTimestamp,
  formatStatusLabel,
  getApplicationTone,
  getAttemptLabel,
  getAttemptTone,
  getEventTone,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import {
  APPLICATION_FILTER_LABELS,
  type ApplicationsViewFilter,
} from "./applications-filters";

interface ApplicationsDetailPanelProps {
  activeFilter: ApplicationsViewFilter;
  applyRunDetails: ApplyRunDetails | null;
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  applicationRecords: readonly ApplicationRecord[];
  applyJobResults: JobFinderWorkspaceSnapshot["applyJobResults"];
  busy: boolean;
  discoveryJobs: JobFinderWorkspaceSnapshot["discoveryJobs"];
  applyRunHistory: Array<{
    result: JobFinderWorkspaceSnapshot["applyJobResults"][number];
    run: JobFinderWorkspaceSnapshot["applyRuns"][number] | null;
  }>;
  effectiveSelectedApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
  hasAnyApplications: boolean;
  hasVisibleApplications: boolean;
  onApproveApplyRun: (runId: string) => void;
  onCancelApplyRun: (runId: string) => void;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  onRevokeApplyRunApproval: (runId: string) => void;
  onStartAutoApplyQueue: (jobIds: string[]) => void;
  onSelectApplyRun: (runId: string) => void;
  onStartApplyCopilot: (jobId: string) => void;
  onStartAutoApply: (jobId: string) => void;
  selectedApplyRunId: string | null;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
}

type QueueEntry = {
  jobId: string;
  label: string;
  runResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
  includeInRecovery: boolean;
};

function getApplyDetailsStatusBadge(
  status: ApplicationsDetailPanelProps["applyRunDetailsStatus"],
) {
  switch (status) {
    case "loading":
      return { tone: "active" as const, label: "Loading details" };
    case "error":
      return { tone: "critical" as const, label: "Details unavailable" };
    case "ready":
      return { tone: "positive" as const, label: "Details ready" };
    default:
      return { tone: "muted" as const, label: "Details idle" };
  }
}

function getQueueRecoveryTone(
  state: JobFinderWorkspaceSnapshot["applyJobResults"][number]["state"] | null,
) {
  if (state === "awaiting_review" || state === "submitted") {
    return "positive" as const;
  }

  if (state === "blocked" || state === "failed" || state === "skipped") {
    return "critical" as const;
  }

  if (state === "planned") {
    return "muted" as const;
  }

  return "active" as const;
}

function getQueueStateExplanation(
  input: {
    runState: JobFinderWorkspaceSnapshot["applyRuns"][number]["state"];
    selectedJobCount: number;
    blockedJobCount: number;
    skippedJobCount: number;
    failedJobCount: number;
    completedJobCount: number;
  } | null,
) {
  if (!input) {
    return null;
  }

  if (input.runState === "paused_for_consent") {
    return "This queue is paused on a live consent decision. Resolve the consent request to continue, or restage only the blocked jobs into a fresh safe queue.";
  }

  if (input.runState === "awaiting_submit_approval") {
    return "This queue is staged but has not started yet. Record submit approval to let the safe fill-only queue begin, or restage a narrower queue if the job list changed.";
  }

  if (input.runState === "cancelled") {
    return "This historical queue was cancelled before it finished. Remaining planned, blocked, failed, or skipped jobs can be restaged into a fresh safe queue.";
  }

  if (input.failedJobCount > 0) {
    return "Some jobs in this queue failed before the flow could reach a stable review-safe state. Review the per-job outcomes below before restaging only the unfinished jobs.";
  }

  if (input.blockedJobCount > 0 || input.skippedJobCount > 0) {
    return "This historical queue hit blocked or skipped jobs. Applications keeps those outcomes and can restage only the unfinished jobs without re-adding completed work.";
  }

  if (input.completedJobCount === input.selectedJobCount) {
    return "Every job in this historical queue already reached a review-ready or terminal outcome. Recovery is available only if you want to start a completely fresh run another way.";
  }

  return "This queue still has unfinished jobs. Review the per-job outcomes below before deciding whether to restage the remaining work.";
}

function getAnswerTone(
  status: ApplyRunDetails["answerRecords"][number]["status"],
) {
  switch (status) {
    case "filled":
    case "submitted":
      return "positive" as const;
    case "rejected":
    case "skipped":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

function getConsentTone(
  status: ApplyRunDetails["consentRequests"][number]["status"],
) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

function getApprovalTone(status: ApplySubmitApproval["status"]) {
  switch (status) {
    case "approved":
      return "positive" as const;
    case "declined":
    case "revoked":
    case "expired":
      return "critical" as const;
    default:
      return "active" as const;
  }
}

export function ApplicationsDetailPanel({
  activeFilter,
  applyRunDetails,
  applyRunDetailsError,
  applyRunDetailsStatus,
  applicationRecords,
  applyJobResults,
  busy,
  discoveryJobs,
  applyRunHistory,
  effectiveSelectedApplyResult,
  hasAnyApplications,
  hasVisibleApplications,
  onApproveApplyRun,
  onCancelApplyRun,
  onResolveApplyConsentRequest,
  onRevokeApplyRunApproval,
  onStartAutoApplyQueue,
  onSelectApplyRun,
  onStartApplyCopilot,
  onStartAutoApply,
  selectedApplyRunId,
  selectedAttempt,
  selectedRecord,
}: ApplicationsDetailPanelProps) {
  const highlightedNextStep =
    selectedAttempt?.nextActionLabel ?? selectedRecord?.nextActionLabel ?? null;
  const attemptSummary = selectedAttempt?.summary?.trim() || null;
  const attemptDetail = selectedAttempt?.detail?.trim() || null;
  const visibleApplyResult = effectiveSelectedApplyResult;
  const canRestageAutoRun =
    selectedRecord?.status === "approved" ||
    selectedRecord?.status === "ready_for_review";
  const selectedRunHistoryEntry =
    applyRunHistory.find(({ result }) => result.runId === selectedApplyRunId) ??
    null;
  const selectedRun =
    applyRunDetailsStatus === "ready" &&
    applyRunDetails?.run?.id === selectedApplyRunId
      ? applyRunDetails.run
      : (selectedRunHistoryEntry?.run ?? null);
  const applyDetailsStatusBadge = getApplyDetailsStatusBadge(
    applyRunDetailsStatus,
  );
  const selectedQueueEntries = useMemo<QueueEntry[]>(() => {
    if (!selectedRun) {
      return [];
    }

    return selectedRun.jobIds.map((jobId) => {
      const runResult =
        applyJobResults.find(
          (result) => result.runId === selectedRun.id && result.jobId === jobId,
        ) ?? null;
      const relatedRecord =
        applicationRecords.find((record) => record.jobId === jobId) ?? null;
      const relatedSavedJob =
        discoveryJobs.find((job) => job.id === jobId) ?? null;
      const includeInRecovery =
        !runResult ||
        runResult.state === "planned" ||
        runResult.state === "blocked" ||
        runResult.state === "failed" ||
        runResult.state === "skipped";

      return {
        jobId,
        label: relatedRecord
          ? `${relatedRecord.title} at ${relatedRecord.company}`
          : relatedSavedJob
            ? `${relatedSavedJob.title} at ${relatedSavedJob.company}`
            : jobId,
        runResult,
        includeInRecovery,
      };
    });
  }, [selectedRun, applyJobResults, applicationRecords, discoveryJobs]);
  const selectedQueueRecoveryEntries = selectedQueueEntries.filter(
    (entry: QueueEntry) => entry.includeInRecovery,
  );
  const selectedQueueRecoveryJobIds = selectedQueueRecoveryEntries.map(
    (entry: QueueEntry) => entry.jobId,
  );
  const excludedQueueRecoveryEntries = selectedQueueEntries.filter(
    (entry: QueueEntry) => !entry.includeInRecovery,
  );
  const canRestageQueueRun =
    selectedRun?.mode === "queue_auto" &&
    selectedQueueRecoveryJobIds.length > 0;
  const selectedQueueOutcomeEntries = selectedQueueEntries;

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-6 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) px-8 py-5 xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="label-mono-xs">Details</p>
          {selectedRecord ? (
            <strong className="text-(length:--text-body) text-(--text-headline)">
              {selectedRecord.company}
            </strong>
          ) : (
            <strong className="text-(length:--text-body) text-muted-foreground">
              Nothing selected
            </strong>
          )}
        </div>
        <StatusBadge
          tone={
            selectedRecord ? getApplicationTone(selectedRecord.status) : "muted"
          }
        >
          {selectedRecord
            ? formatStatusLabel(selectedRecord.status)
            : "Nothing selected"}
        </StatusBadge>
      </div>
      {selectedRecord ? (
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto pr-1">
          <div className="grid gap-2">
            <h2 className="text-(length:--text-section-title) font-semibold tracking-tight text-(--text-headline)">
              {selectedRecord.title}
            </h2>
            <p className="text-(length:--text-field) text-foreground-muted">
              {selectedRecord.company}
            </p>
          </div>
          {highlightedNextStep ? (
            <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <h3 className="label-mono-xs text-primary">Next step</h3>
              <strong className="text-(length:--text-body) text-(--text-headline)">
                {highlightedNextStep}
              </strong>
              {attemptDetail ? (
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  {attemptDetail}
                </p>
              ) : null}
            </section>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Latest apply attempt</span>
              <div className="mt-2">
                <StatusBadge
                  tone={getAttemptTone(
                    selectedAttempt?.state ?? selectedRecord.lastAttemptState,
                  )}
                >
                  {selectedAttempt
                    ? getAttemptLabel(selectedAttempt.state)
                    : selectedRecord.lastAttemptState
                      ? getAttemptLabel(selectedRecord.lastAttemptState)
                      : "No apply attempt"}
                </StatusBadge>
              </div>
              {attemptSummary ? (
                <p className="mt-3 text-(length:--text-small) leading-6 text-foreground-soft">
                  {attemptSummary}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Last updated</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {formatTimestamp(selectedRecord.lastUpdatedAt)}
              </strong>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Stage</span>
              <div className="mt-2">
                <StatusBadge tone={getApplicationTone(selectedRecord.status)}>
                  {formatStatusLabel(selectedRecord.status)}
                </StatusBadge>
              </div>
              {selectedRecord.lastActionLabel ? (
                <p className="mt-3 text-(length:--text-small) leading-6 text-foreground-soft">
                  {selectedRecord.lastActionLabel}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Saved next step</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {selectedRecord.nextActionLabel ?? "No next step saved"}
              </strong>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Detected questions</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {selectedRecord.questionSummary.total}
              </strong>
              <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                {selectedRecord.questionSummary.answered} answered •{" "}
                {selectedRecord.questionSummary.unansweredRequired} required
                left
              </p>
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Latest blocker</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {selectedRecord.latestBlocker
                  ? formatStatusLabel(selectedRecord.latestBlocker.code)
                  : "No blocker"}
              </strong>
              {selectedRecord.latestBlocker ? (
                <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                  {selectedRecord.latestBlocker.summary}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Consent</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {formatStatusLabel(selectedRecord.consentSummary.status)}
              </strong>
              {selectedRecord.consentSummary.pendingCount > 0 ? (
                <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                  {selectedRecord.consentSummary.pendingCount} pending
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Replay memory</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {selectedRecord.replaySummary.checkpointCount} checkpoints
              </strong>
              <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                {selectedRecord.replaySummary.lastUrl ?? "No replay URL saved"}
              </p>
            </div>
            {visibleApplyResult ? (
              <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
                <span className="card-heading-sm">Apply run</span>
                <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                  {formatStatusLabel(visibleApplyResult.state)}
                </strong>
                <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                  {visibleApplyResult.latestQuestionCount} questions •{" "}
                  {visibleApplyResult.latestAnswerCount} grounded answers •{" "}
                  {visibleApplyResult.artifactCount} retained artifacts
                </p>
                {visibleApplyResult.blockerSummary ? (
                  <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                    {visibleApplyResult.blockerSummary}
                  </p>
                ) : null}
                <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                  Run {applyRunDetails?.run.id ?? visibleApplyResult.runId}
                </p>
              </div>
            ) : null}
          </div>
          <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <h3 className="label-mono-xs text-primary">Recovery</h3>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Start a fresh safe run for this job without leaving
                  Applications. Each recovery action creates a new run and still
                  stops before any final submit click.
                </p>
              </div>
              <StatusBadge tone={visibleApplyResult ? "active" : "muted"}>
                {applyRunHistory.length} run
                {applyRunHistory.length === 1 ? "" : "s"} saved
              </StatusBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (selectedRecord) {
                    onStartApplyCopilot(selectedRecord.jobId);
                  }
                }}
                type="button"
                variant="secondary"
                disabled={busy}
              >
                Rerun apply copilot
              </Button>
              <Button
                onClick={() => {
                  if (selectedRecord) {
                    onStartAutoApply(selectedRecord.jobId);
                  }
                }}
                type="button"
                variant="ghost"
                disabled={busy || !canRestageAutoRun}
              >
                Restage auto run
              </Button>
              <Button
                onClick={() =>
                  onStartAutoApplyQueue(selectedQueueRecoveryJobIds)
                }
                type="button"
                variant="ghost"
                disabled={busy || !canRestageQueueRun}
              >
                Restage remaining queue
              </Button>
            </div>
            <div className="grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
              {!canRestageAutoRun ? (
                <p>
                  Auto-run restaging stays available only when this job is still
                  in a review-ready stage.
                </p>
              ) : null}
              {selectedRun?.mode === "queue_auto" ? (
                <div className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                  <p>
                    Queue recovery will restage{" "}
                    {selectedQueueRecoveryJobIds.length} remaining or blocked
                    job
                    {selectedQueueRecoveryJobIds.length === 1 ? "" : "s"} from
                    the selected queue run.
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Will restage</p>
                      {selectedQueueRecoveryEntries.length ? (
                        selectedQueueRecoveryEntries.map((entry) => (
                          <div
                            key={`restage-${entry.jobId}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/50 px-3 py-2"
                          >
                            <span className="text-foreground">
                              {entry.label}
                            </span>
                            <StatusBadge
                              tone={getQueueRecoveryTone(
                                entry.runResult?.state ?? null,
                              )}
                            >
                              {formatStatusLabel(
                                entry.runResult?.state ?? "planned",
                              )}
                            </StatusBadge>
                          </div>
                        ))
                      ) : (
                        <p>No jobs from this queue still need restaging.</p>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <p className="label-mono-xs">
                        Already completed or review-ready
                      </p>
                      {excludedQueueRecoveryEntries.length ? (
                        excludedQueueRecoveryEntries.map((entry) => (
                          <div
                            key={`exclude-${entry.jobId}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/50 px-3 py-2"
                          >
                            <span className="text-foreground">
                              {entry.label}
                            </span>
                            <StatusBadge
                              tone={getQueueRecoveryTone(
                                entry.runResult?.state ?? null,
                              )}
                            >
                              {formatStatusLabel(
                                entry.runResult?.state ?? "awaiting_review",
                              )}
                            </StatusBadge>
                          </div>
                        ))
                      ) : (
                        <p>
                          No jobs are excluded from this historical queue yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
          {selectedRun?.mode === "queue_auto" ? (
            <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <h3 className="label-mono-xs text-primary">
                    Queue outcome summary
                  </h3>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    Review how each job in the selected historical queue
                    finished before you restage anything.
                  </p>
                </div>
                <StatusBadge tone={canRestageQueueRun ? "active" : "muted"}>
                  {selectedQueueOutcomeEntries.length} job
                  {selectedQueueOutcomeEntries.length === 1 ? "" : "s"} in run
                </StatusBadge>
              </div>
              <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                {getQueueStateExplanation(
                  selectedRun
                    ? {
                        runState: selectedRun.state,
                        selectedJobCount: selectedQueueOutcomeEntries.length,
                        blockedJobCount: selectedQueueOutcomeEntries.filter(
                          (entry) => entry.runResult?.state === "blocked",
                        ).length,
                        skippedJobCount: selectedQueueOutcomeEntries.filter(
                          (entry) => entry.runResult?.state === "skipped",
                        ).length,
                        failedJobCount: selectedQueueOutcomeEntries.filter(
                          (entry) => entry.runResult?.state === "failed",
                        ).length,
                        completedJobCount: selectedQueueOutcomeEntries.filter(
                          (entry) =>
                            entry.runResult?.state === "awaiting_review" ||
                            entry.runResult?.state === "submitted",
                        ).length,
                      }
                    : null,
                )}
              </p>
              <div className="grid gap-2">
                {selectedQueueOutcomeEntries.map((entry) => (
                  <div
                    key={`queue-outcome-${entry.jobId}`}
                    className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-foreground">{entry.label}</strong>
                      <StatusBadge
                        tone={getQueueRecoveryTone(
                          entry.runResult?.state ?? null,
                        )}
                      >
                        {formatStatusLabel(entry.runResult?.state ?? "planned")}
                      </StatusBadge>
                    </div>
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {entry.runResult?.summary ??
                        "This job never started before the queue paused or was cancelled."}
                    </p>
                    {entry.runResult?.blockerSummary ? (
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                        {entry.runResult.blockerSummary}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {applyRunHistory.length ? (
            <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <div className="grid gap-1">
                <h3 className="label-mono-xs text-primary">Run history</h3>
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Review older safe runs, blockers, consent pauses, and queue
                  outcomes for this job.
                </p>
              </div>
              <ul className="grid gap-2">
                {applyRunHistory.map(({ result, run }) => {
                  const isSelected = selectedApplyRunId === result.runId;

                  return (
                    <li
                      key={result.id}
                      aria-current={isSelected ? "true" : undefined}
                    >
                      <button
                        className={cn(
                          "grid w-full gap-2 rounded-(--radius-field) border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                          isSelected
                            ? "border-primary bg-primary/8"
                            : "border-(--surface-panel-border) bg-background/40 hover:bg-background/60",
                        )}
                        onClick={() => onSelectApplyRun(result.runId)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-foreground">
                            {run ? formatStatusLabel(run.mode) : "Apply run"}
                          </strong>
                          <StatusBadge
                            tone={
                              result.state === "submitted"
                                ? "positive"
                                : result.state === "blocked" ||
                                    result.state === "failed" ||
                                    result.state === "skipped"
                                  ? "critical"
                                  : "active"
                            }
                          >
                            {formatStatusLabel(result.state)}
                          </StatusBadge>
                        </div>
                        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                          {result.summary}
                        </p>
                        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                          {formatTimestamp(result.updatedAt)}
                          {run ? ` • ${formatStatusLabel(run.state)}` : ""}
                          {result.blockerSummary
                            ? ` • ${result.blockerSummary}`
                            : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {applyRunDetails?.submitApproval
            ? (() => {
                const submitApproval = applyRunDetails.submitApproval;

                return (
                  <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="grid gap-1">
                        <h3 className="label-mono-xs text-primary">
                          Submit approval
                        </h3>
                        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                          This run records explicit approval for later
                          submit-enabled execution, but the current safe build
                          still stops before any final submit click.
                        </p>
                      </div>
                      <StatusBadge
                        tone={getApprovalTone(submitApproval.status)}
                      >
                        {formatStatusLabel(submitApproval.status)}
                      </StatusBadge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                        <p className="label-mono-xs">Scope</p>
                        <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                          {submitApproval.jobIds.length} job
                          {submitApproval.jobIds.length === 1 ? "" : "s"}
                        </strong>
                        <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                          Run mode: {formatStatusLabel(submitApproval.mode)}
                        </p>
                      </div>
                      <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                        <p className="label-mono-xs">Recorded</p>
                        <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                          {formatTimestamp(submitApproval.createdAt)}
                        </strong>
                        {submitApproval.approvedAt ? (
                          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                            Approved:{" "}
                            {formatTimestamp(submitApproval.approvedAt)}
                          </p>
                        ) : null}
                        {submitApproval.revokedAt ? (
                          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                            Revoked: {formatTimestamp(submitApproval.revokedAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {submitApproval.detail ? (
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                        {submitApproval.detail}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {submitApproval.status === "pending" &&
                      applyRunDetails.run.state ===
                        "awaiting_submit_approval" ? (
                        <Button
                          onClick={() =>
                            onApproveApplyRun(submitApproval.runId)
                          }
                          type="button"
                          variant="secondary"
                          disabled={busy}
                        >
                          Record submit approval
                        </Button>
                      ) : null}
                      {submitApproval.status === "approved" &&
                      applyRunDetails.run.state !== "completed" &&
                      applyRunDetails.run.state !== "cancelled" &&
                      applyRunDetails.run.state !== "failed" ? (
                        <Button
                          onClick={() =>
                            onRevokeApplyRunApproval(submitApproval.runId)
                          }
                          type="button"
                          variant="ghost"
                          disabled={busy}
                        >
                          Revoke approval
                        </Button>
                      ) : null}
                      {applyRunDetails.run.state !== "completed" &&
                      applyRunDetails.run.state !== "cancelled" ? (
                        <Button
                          onClick={() =>
                            onCancelApplyRun(applyRunDetails.run.id)
                          }
                          type="button"
                          variant="ghost"
                          disabled={busy}
                        >
                          Cancel run
                        </Button>
                      ) : null}
                    </div>
                  </section>
                );
              })()
            : null}
          {visibleApplyResult ? (
            <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="label-mono-xs text-primary">
                  Apply run review data
                </h3>
                <StatusBadge tone={applyDetailsStatusBadge.tone}>
                  {applyDetailsStatusBadge.label}
                </StatusBadge>
              </div>
              {applyRunDetailsStatus === "loading" ? (
                <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                  Loading persisted questions, grounded answers, artifacts, and
                  checkpoints for this apply run.
                </p>
              ) : null}
              {applyRunDetailsStatus === "error" ? (
                <p className="text-(length:--text-body) leading-7 text-destructive">
                  {applyRunDetailsError ??
                    "Apply run details could not be loaded."}
                </p>
              ) : null}
              {applyRunDetails ? (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                      <p className="label-mono-xs">Questions</p>
                      <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                        {applyRunDetails.questionRecords.length}
                      </strong>
                    </div>
                    <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                      <p className="label-mono-xs">Grounded answers</p>
                      <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                        {applyRunDetails.answerRecords.length}
                      </strong>
                    </div>
                    <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                      <p className="label-mono-xs">Artifacts</p>
                      <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                        {applyRunDetails.artifactRefs.length}
                      </strong>
                    </div>
                    <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                      <p className="label-mono-xs">Checkpoints</p>
                      <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                        {applyRunDetails.checkpoints.length}
                      </strong>
                    </div>
                  </div>
                  {applyRunDetails.questionRecords.length ? (
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Detected questions</p>
                      {applyRunDetails.questionRecords.map((question) => (
                        <div
                          key={question.id}
                          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>{question.prompt}</strong>
                            <StatusBadge
                              tone={
                                question.status === "submitted" ||
                                question.status === "answered"
                                  ? "positive"
                                  : question.status === "skipped"
                                    ? "critical"
                                    : "active"
                              }
                            >
                              {formatStatusLabel(question.status)}
                            </StatusBadge>
                          </div>
                          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                            {formatStatusLabel(question.kind)}
                            {question.isRequired
                              ? " • Required"
                              : " • Optional"}
                          </p>
                          {question.answerOptions.length ? (
                            <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                              Options: {question.answerOptions.join(", ")}
                            </p>
                          ) : null}
                          {question.submittedAnswer ? (
                            <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                              Submitted: {question.submittedAnswer}
                            </p>
                          ) : null}
                          {question.pageUrl ? (
                            <p className="mt-2 break-all text-(length:--text-small) leading-6 text-foreground-soft">
                              Page: {question.pageUrl}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {applyRunDetails.answerRecords.length ? (
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Grounded answers</p>
                      {applyRunDetails.answerRecords.map((answer) => (
                        <div
                          key={answer.id}
                          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>{answer.text}</strong>
                            <StatusBadge tone={getAnswerTone(answer.status)}>
                              {formatStatusLabel(answer.status)}
                            </StatusBadge>
                          </div>
                          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                            {formatStatusLabel(answer.sourceKind)} source
                            {answer.confidenceLabel
                              ? ` • ${answer.confidenceLabel}`
                              : ""}
                          </p>
                          {answer.provenance.length ? (
                            <div className="mt-2 grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
                              {answer.provenance.map((provenance) => (
                                <p key={provenance.id}>
                                  {provenance.label}
                                  {provenance.snippet
                                    ? `: ${provenance.snippet}`
                                    : ""}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {applyRunDetails.artifactRefs.length ? (
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Retained artifacts</p>
                      {applyRunDetails.artifactRefs.map((artifact) => (
                        <div
                          key={artifact.id}
                          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                        >
                          <strong className="text-foreground">
                            {artifact.label}
                          </strong>
                          <p>{formatStatusLabel(artifact.kind)}</p>
                          {artifact.textSnippet ? (
                            <p>{artifact.textSnippet}</p>
                          ) : null}
                          {artifact.storagePath ? (
                            <p className="break-all">
                              Saved: {artifact.storagePath}
                            </p>
                          ) : null}
                          {artifact.url ? (
                            <p className="break-all">URL: {artifact.url}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {applyRunDetails.checkpoints.length ? (
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Replay checkpoints</p>
                      {applyRunDetails.checkpoints.map((checkpoint) => (
                        <div
                          key={checkpoint.id}
                          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-foreground">
                              {checkpoint.label}
                            </strong>
                            <StatusBadge
                              tone={
                                checkpoint.jobState === "submitted"
                                  ? "positive"
                                  : checkpoint.jobState === "blocked" ||
                                      checkpoint.jobState === "failed"
                                    ? "critical"
                                    : "active"
                              }
                            >
                              {formatStatusLabel(checkpoint.jobState)}
                            </StatusBadge>
                          </div>
                          {checkpoint.detail ? (
                            <p className="mt-2">{checkpoint.detail}</p>
                          ) : null}
                          <p className="mt-2">
                            {formatTimestamp(checkpoint.createdAt)}
                          </p>
                          {checkpoint.url ? (
                            <p className="mt-2 break-all">{checkpoint.url}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {applyRunDetails.consentRequests.length ? (
                    <div className="grid gap-2">
                      <p className="label-mono-xs">Consent requests</p>
                      {applyRunDetails.consentRequests.map((request) => (
                        <div
                          key={request.id}
                          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-foreground">
                              {request.label}
                            </strong>
                            <StatusBadge tone={getConsentTone(request.status)}>
                              {formatStatusLabel(request.status)}
                            </StatusBadge>
                          </div>
                          <p className="mt-2">
                            {formatStatusLabel(request.kind)}
                          </p>
                          {request.detail ? (
                            <p className="mt-2">{request.detail}</p>
                          ) : null}
                          {request.status === "pending" &&
                          applyRunDetails.run.state === "paused_for_consent" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                onClick={() =>
                                  onResolveApplyConsentRequest(
                                    request.id,
                                    "approve",
                                  )
                                }
                                type="button"
                                variant="secondary"
                                disabled={busy}
                              >
                                Continue safely
                              </Button>
                              <Button
                                onClick={() =>
                                  onResolveApplyConsentRequest(
                                    request.id,
                                    "decline",
                                  )
                                }
                                type="button"
                                variant="ghost"
                                disabled={busy}
                              >
                                Skip this job
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}
          {selectedAttempt ? (
            <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <h3 className="label-mono-xs text-primary">Attempt details</h3>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {attemptSummary ? (
                  <strong>{attemptSummary}</strong>
                ) : (
                  <strong>No summary available</strong>
                )}
                <StatusBadge tone={getAttemptTone(selectedAttempt.state)}>
                  {getAttemptLabel(selectedAttempt.state)}
                </StatusBadge>
              </div>
              {attemptDetail ? (
                <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                  {attemptDetail}
                </p>
              ) : null}
              {selectedAttempt.nextActionLabel ? (
                <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                  Next step: {selectedAttempt.nextActionLabel}
                </p>
              ) : null}
              {selectedAttempt.blocker ? (
                <div className="grid gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                  <strong>
                    {formatStatusLabel(selectedAttempt.blocker.code)}
                  </strong>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                    {selectedAttempt.blocker.summary}
                  </p>
                  {selectedAttempt.blocker.detail ? (
                    <p className="text-(length:--text-small) leading-6 text-foreground-soft">
                      {selectedAttempt.blocker.detail}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {selectedAttempt.questions.length ? (
                <div className="grid gap-2">
                  <p className="label-mono-xs">Question memory</p>
                  {selectedAttempt.questions.map((question) => (
                    <div
                      key={question.id}
                      className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{question.prompt}</strong>
                        <StatusBadge
                          tone={
                            question.status === "submitted" ||
                            question.status === "answered"
                              ? "positive"
                              : "active"
                          }
                        >
                          {formatStatusLabel(question.status)}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                        {formatStatusLabel(question.kind)}
                        {question.isRequired ? " • Required" : " • Optional"}
                      </p>
                      {question.submittedAnswer ? (
                        <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                          Submitted: {question.submittedAnswer}
                        </p>
                      ) : null}
                      {question.suggestedAnswers[0] ? (
                        <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                          Suggested: {question.suggestedAnswers[0].text}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedAttempt.consentDecisions.length ? (
                <div className="grid gap-2">
                  <p className="label-mono-xs">Consent history</p>
                  {selectedAttempt.consentDecisions.map((decision) => (
                    <div
                      key={decision.id}
                      className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                    >
                      <strong className="text-foreground">
                        {decision.label}
                      </strong>
                      <p>{formatStatusLabel(decision.status)}</p>
                      {decision.detail ? <p>{decision.detail}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <h3 className="label-mono-xs text-primary">Attempt details</h3>
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">
                No apply attempt details were saved for this application yet.
              </p>
            </section>
          )}
          <div className="grid gap-2">
            <p className="label-mono-xs">Timeline</p>
            <div className="grid gap-0">
              {selectedRecord.events.map((event) => {
                const tone = getEventTone(event);

                return (
                  <article
                    key={event.id}
                    className="relative grid gap-3 border-l border-border/20 pl-8 pb-8 sm:grid-cols-[1fr]"
                  >
                    <div
                      className={cn(
                        "absolute -left-1.25 top-1 h-2.5 w-2.5",
                        tone === "positive"
                          ? "bg-positive"
                          : tone === "active"
                            ? "bg-primary"
                            : tone === "critical"
                              ? "bg-destructive"
                              : "border border-border bg-background",
                      )}
                    />
                    <div>
                      <div className="label-mono-xs">
                        {formatTimestamp(event.at)}
                      </div>
                      <strong
                        className={cn(
                          "mt-1 block text-sm font-medium",
                          tone === "positive"
                            ? "text-positive"
                            : tone === "active"
                              ? "text-primary"
                              : tone === "critical"
                                ? "text-destructive"
                                : "text-foreground",
                        )}
                      >
                        {event.title}
                      </strong>
                      <p className="mt-2 text-(length:--text-description) leading-relaxed text-foreground-soft">
                        {event.detail}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title={
              !hasAnyApplications
                ? "No applications yet"
                : hasVisibleApplications
                  ? "Choose an application"
                  : "No applications in this view"
            }
            description={
              !hasAnyApplications
                ? "Applications appear here after you start one from Shortlisted."
                : hasVisibleApplications
                  ? "Select an application to review its stage, latest apply attempt, and timeline."
                  : `Try another filter if you want to review applications outside the ${APPLICATION_FILTER_LABELS[activeFilter]} view.`
            }
          />
        </div>
      )}
    </section>
  );
}
