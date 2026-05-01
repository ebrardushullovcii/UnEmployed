import type { ApplicationAttempt } from "@unemployed/contracts";
import { formatStatusLabel, getAttemptLabel, getAttemptTone } from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";

export function ApplicationsDetailPanelAttemptSection(props: {
  selectedAttempt: ApplicationAttempt | null;
}) {
  const { selectedAttempt } = props;
  const attemptSummary = selectedAttempt?.summary?.trim() || null;
  const attemptDetail = selectedAttempt?.detail?.trim() || null;

  if (!selectedAttempt) {
    return (
      <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <h3 className="label-mono-xs text-primary">Attempt details</h3>
        <p className="text-(length:--text-body) leading-7 text-foreground-soft">
          No apply attempt details were saved for this application yet.
        </p>
      </section>
    );
  }

  return (
    <section className="surface-card-tint grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <h3 className="label-mono-xs text-primary">Attempt details</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {attemptSummary ? <strong>{attemptSummary}</strong> : <strong>No summary available</strong>}
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
                    question.status === "submitted" || question.status === "answered"
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
              <strong className="text-foreground">{decision.label}</strong>
              <p>{formatStatusLabel(decision.status)}</p>
              {decision.detail ? <p>{decision.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
