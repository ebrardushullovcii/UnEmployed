import type {
  ApplicationAttempt,
  ApplicationRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import {
  formatTimestamp,
  formatStatusLabel,
  getAttemptLabel,
  getAttemptTone,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import { formatVisibleRunId } from "./applications-detail-panel-helpers";
import {
  getApplicationNextStepLabel,
  getApplicationReadableNextStepLabel,
  getApplicationStagePresentation,
} from "./applications-status";

export function ApplicationsDetailPanelOverviewSections(props: {
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
  visibleApplyRunId: string | null;
}) {
  const { selectedAttempt, selectedRecord, visibleApplyResult, visibleApplyRunId } = props;
  const highlightedNextStep =
    selectedAttempt?.nextActionLabel ?? selectedRecord.nextActionLabel ?? null;
  const readableHighlightedNextStep =
    getApplicationReadableNextStepLabel(highlightedNextStep) ?? highlightedNextStep;
  const attemptSummary = selectedAttempt?.summary?.trim() || null;
  const attemptDetail = selectedAttempt?.detail?.trim() || null;
  const savedNextStepLabel = getApplicationNextStepLabel(selectedRecord);
  const readableSavedNextStepLabel =
    getApplicationReadableNextStepLabel(savedNextStepLabel) ?? savedNextStepLabel;
  const selectedStage = getApplicationStagePresentation(selectedRecord);

  return (
    <>
      <div className="grid gap-2">
        <h2 className="text-(length:--text-section-title) font-semibold tracking-tight text-(--text-headline)">
          {selectedRecord.title}
        </h2>
        <p className="text-(length:--text-field) text-foreground-muted">
          {selectedRecord.company}
        </p>
      </div>
      {highlightedNextStep ? (
        <section className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <h3 className="label-mono-xs text-primary">Next step</h3>
          <strong className="block max-w-full whitespace-normal break-words text-(length:--text-body) leading-7 text-(--text-headline)">
            {readableHighlightedNextStep}
          </strong>
          {readableHighlightedNextStep !== highlightedNextStep && highlightedNextStep ? (
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              Saved follow-up: {highlightedNextStep}
            </p>
          ) : null}
          {attemptDetail ? (
            <p className="text-(length:--text-small) leading-6 text-foreground-soft">
              {attemptDetail}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
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
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <span className="card-heading-sm">Last updated</span>
          <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
            {formatTimestamp(selectedRecord.lastUpdatedAt)}
          </strong>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <span className="card-heading-sm">Stage</span>
          <div className="mt-2">
            <StatusBadge tone={selectedStage.tone}>{selectedStage.label}</StatusBadge>
          </div>
          {selectedRecord.lastActionLabel ? (
            <p className="mt-3 text-(length:--text-small) leading-6 text-foreground-soft">
              {selectedRecord.lastActionLabel}
            </p>
          ) : null}
        </div>
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <span className="card-heading-sm">Saved next step</span>
          <strong className="mt-2 block max-w-full whitespace-normal break-words text-(length:--text-field) font-semibold leading-6 text-foreground">
            {readableSavedNextStepLabel ?? "No saved next step"}
          </strong>
          {readableSavedNextStepLabel !== savedNextStepLabel && savedNextStepLabel ? (
            <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
              {savedNextStepLabel}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid min-w-0 gap-3 2xl:grid-cols-3">
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <span className="card-heading-sm">Detected questions</span>
          <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
            {selectedRecord.questionSummary.total}
          </strong>
          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
            {selectedRecord.questionSummary.answered} answered •{" "}
            {selectedRecord.questionSummary.unansweredRequired} required left
          </p>
        </div>
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
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
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
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
      <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <span className="card-heading-sm">Replay memory</span>
          <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
            {selectedRecord.replaySummary.checkpointCount} checkpoints
          </strong>
          <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
            {selectedRecord.replaySummary.lastUrl ?? "No replay URL saved"}
          </p>
        </div>
        {visibleApplyResult ? (
          <div
            className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4"
            title={visibleApplyRunId ?? undefined}
          >
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
              Run {formatVisibleRunId(visibleApplyRunId ?? visibleApplyResult.runId)}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
