import type {
  ApplicationAttempt,
  ApplicationRecord,
} from "@unemployed/contracts";
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
import { APPLICATION_FILTER_LABELS, type ApplicationsViewFilter } from "./applications-filters";

interface ApplicationsDetailPanelProps {
  activeFilter: ApplicationsViewFilter;
  hasAnyApplications: boolean;
  hasVisibleApplications: boolean;
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord | null;
}

export function ApplicationsDetailPanel({
  activeFilter,
  hasAnyApplications,
  hasVisibleApplications,
  selectedAttempt,
  selectedRecord,
}: ApplicationsDetailPanelProps) {
  const highlightedNextStep =
    selectedAttempt?.nextActionLabel ?? selectedRecord?.nextActionLabel ?? null;
  const attemptSummary = selectedAttempt?.summary?.trim() || null;
  const attemptDetail = selectedAttempt?.detail?.trim() || null;

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
                {selectedRecord.questionSummary.answered} answered • {selectedRecord.questionSummary.unansweredRequired} required left
              </p>
            </div>
            <div className="surface-card-tint rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
              <span className="card-heading-sm">Latest blocker</span>
              <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
                {selectedRecord.latestBlocker ? formatStatusLabel(selectedRecord.latestBlocker.code) : 'No blocker'}
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
                {selectedRecord.replaySummary.lastUrl ?? 'No replay URL saved'}
              </p>
            </div>
          </div>
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
                  <strong>{formatStatusLabel(selectedAttempt.blocker.code)}</strong>
                  <p className="text-(length:--text-small) leading-6 text-foreground-soft">{selectedAttempt.blocker.summary}</p>
                  {selectedAttempt.blocker.detail ? <p className="text-(length:--text-small) leading-6 text-foreground-soft">{selectedAttempt.blocker.detail}</p> : null}
                </div>
              ) : null}
              {selectedAttempt.questions.length ? (
                <div className="grid gap-2">
                  <p className="label-mono-xs">Question memory</p>
                  {selectedAttempt.questions.map((question) => (
                    <div key={question.id} className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{question.prompt}</strong>
                        <StatusBadge tone={question.status === 'submitted' || question.status === 'answered' ? 'positive' : 'active'}>
                          {formatStatusLabel(question.status)}
                        </StatusBadge>
                      </div>
                      <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">
                        {formatStatusLabel(question.kind)}{question.isRequired ? ' • Required' : ' • Optional'}
                      </p>
                      {question.submittedAnswer ? (
                        <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">Submitted: {question.submittedAnswer}</p>
                      ) : null}
                      {question.suggestedAnswers[0] ? (
                        <p className="mt-2 text-(length:--text-small) leading-6 text-foreground-soft">Suggested: {question.suggestedAnswers[0].text}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedAttempt.consentDecisions.length ? (
                <div className="grid gap-2">
                  <p className="label-mono-xs">Consent history</p>
                  {selectedAttempt.consentDecisions.map((decision) => (
                    <div key={decision.id} className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft">
                      <strong className="text-foreground">{decision.label}</strong>
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
