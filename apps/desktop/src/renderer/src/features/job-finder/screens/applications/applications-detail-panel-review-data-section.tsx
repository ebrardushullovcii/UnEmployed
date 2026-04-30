import type {
  ApplyRunDetails,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui";
import { formatTimestamp, formatStatusLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import {
  getAnswerTone,
  getApplyDetailsStatusBadge,
  getConsentTone,
} from "./applications-detail-panel-helpers";

export function ApplicationsDetailPanelReviewDataSection(props: {
  applyRunDetailsError: string | null;
  applyRunDetailsStatus: "idle" | "loading" | "ready" | "error";
  isApplyRequestPending: (requestId: string) => boolean;
  onResolveApplyConsentRequest: (
    requestId: string,
    action: "approve" | "decline",
  ) => void;
  selectedApplyRunDetails: ApplyRunDetails | null;
  visibleApplyResult: JobFinderWorkspaceSnapshot["applyJobResults"][number] | null;
}) {
  const {
    applyRunDetailsError,
    applyRunDetailsStatus,
    isApplyRequestPending,
    onResolveApplyConsentRequest,
    selectedApplyRunDetails,
    visibleApplyResult,
  } = props;
  const applyDetailsStatusBadge = getApplyDetailsStatusBadge(applyRunDetailsStatus);

  if (!visibleApplyResult) {
    return null;
  }

  return (
    <section className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="label-mono-xs text-primary">Apply run review data</h3>
        <StatusBadge tone={applyDetailsStatusBadge.tone}>
          {applyDetailsStatusBadge.label}
        </StatusBadge>
      </div>
      {applyRunDetailsStatus === "loading" ? (
        <p className="text-(length:--text-body) leading-7 text-foreground-soft">
          Loading persisted questions, grounded answers, artifacts, and checkpoints
          for this apply run.
        </p>
      ) : null}
      {applyRunDetailsStatus === "error" ? (
        <p className="text-(length:--text-body) leading-7 text-destructive">
          {applyRunDetailsError ?? "Apply run details could not be loaded."}
        </p>
      ) : null}
      {selectedApplyRunDetails ? (
        <>
          <div className="grid gap-3 2xl:grid-cols-2">
            <MetricCard label="Questions" value={selectedApplyRunDetails.questionRecords.length} />
            <MetricCard
              label="Grounded answers"
              value={selectedApplyRunDetails.answerRecords.length}
            />
            <MetricCard label="Artifacts" value={selectedApplyRunDetails.artifactRefs.length} />
            <MetricCard label="Checkpoints" value={selectedApplyRunDetails.checkpoints.length} />
          </div>
          {selectedApplyRunDetails.questionRecords.length ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Detected questions</p>
              {selectedApplyRunDetails.questionRecords.map((question) => (
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
                    {question.isRequired ? " • Required" : " • Optional"}
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
          {selectedApplyRunDetails.answerRecords.length ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Grounded answers</p>
              {selectedApplyRunDetails.answerRecords.map((answer) => (
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
                    {answer.confidenceLabel ? ` • ${answer.confidenceLabel}` : ""}
                  </p>
                  {answer.provenance.length ? (
                    <div className="mt-2 grid gap-1 text-(length:--text-small) leading-6 text-foreground-soft">
                      {answer.provenance.map((provenance) => (
                        <p key={provenance.id}>
                          {provenance.label}
                          {provenance.snippet ? `: ${provenance.snippet}` : ""}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {selectedApplyRunDetails.artifactRefs.length ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Retained artifacts</p>
              {selectedApplyRunDetails.artifactRefs.map((artifact) => (
                <div
                  key={artifact.id}
                  className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                >
                  <strong className="text-foreground">{artifact.label}</strong>
                  <p>{formatStatusLabel(artifact.kind)}</p>
                  {artifact.textSnippet ? <p>{artifact.textSnippet}</p> : null}
                  {artifact.storagePath ? (
                    <p className="break-all">Saved: {artifact.storagePath}</p>
                  ) : null}
                  {artifact.url ? <p className="break-all">URL: {artifact.url}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {selectedApplyRunDetails.checkpoints.length ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Replay checkpoints</p>
              {selectedApplyRunDetails.checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-foreground">{checkpoint.label}</strong>
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
                  {checkpoint.detail ? <p className="mt-2">{checkpoint.detail}</p> : null}
                  <p className="mt-2">{formatTimestamp(checkpoint.createdAt)}</p>
                  {checkpoint.url ? <p className="mt-2 break-all">{checkpoint.url}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
          {selectedApplyRunDetails.consentRequests.length ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Consent requests</p>
              {selectedApplyRunDetails.consentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3 text-(length:--text-small) leading-6 text-foreground-soft"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-foreground">{request.label}</strong>
                    <StatusBadge tone={getConsentTone(request.status)}>
                      {formatStatusLabel(request.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2">{formatStatusLabel(request.kind)}</p>
                  {request.detail ? <p className="mt-2">{request.detail}</p> : null}
                  {request.status === "pending" &&
                  selectedApplyRunDetails.run.state === "paused_for_consent" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => onResolveApplyConsentRequest(request.id, "approve")}
                        pending={isApplyRequestPending(request.id)}
                        type="button"
                        variant="secondary"
                        disabled={isApplyRequestPending(request.id)}
                      >
                        Continue safely
                      </Button>
                      <Button
                        onClick={() => onResolveApplyConsentRequest(request.id, "decline")}
                        pending={isApplyRequestPending(request.id)}
                        type="button"
                        variant="ghost"
                        disabled={isApplyRequestPending(request.id)}
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
  );
}

function MetricCard(props: { label: string; value: number }) {
  const { label, value } = props;

  return (
    <div className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-3">
      <p className="label-mono-xs">{label}</p>
      <strong className="mt-2 block text-(length:--text-field) font-semibold text-foreground">
        {value}
      </strong>
    </div>
  );
}
