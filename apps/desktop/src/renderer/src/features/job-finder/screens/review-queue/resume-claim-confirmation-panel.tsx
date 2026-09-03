import { useState } from "react";
import type {
  JobFinderSetResumeClaimConfirmationInput,
  ResumeClaimAssessment,
  ResumeClaimConfirmation,
  ResumeDraft,
} from "@unemployed/contracts";
import { resumeClaimOwnershipStatement } from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";
import { formatResumeClaimLocatorLabel } from "./resume-assistant-proposal-provenance";

/**
 * The exact wording a user must attest. Rendered visibly and submitted
 * verbatim: the domain rejects any other statement, so the UI never paraphrases
 * it and never sends an id in its place.
 */
const OWNERSHIP_STATEMENT_PROMPT = `Required confirmation: “${resumeClaimOwnershipStatement}”`;

const NEEDS_CONFIRMATION_EXPLANATION =
  "Saved candidate evidence only partly supports this wording. Export stays blocked until you read it and confirm it is accurate and your own.";

const CONFIRMED_EXPLANATION =
  "Your confirmation is recorded for this exact saved wording. Editing the text removes it until you confirm again.";

const STALE_PROJECTION_ERROR =
  "This wording no longer matches the saved draft. Reload the workspace and try again.";

const UNKNOWN_FAILURE_ERROR =
  "Saving the confirmation failed. Reload the workspace and try again.";

/**
 * Mirrors the export gate's matcher exactly: only the same draft, locator
 * (field, section, entry, bullet), and confirmed normalized-content hash count.
 * Origin alone never satisfies a row.
 */
export function matchResumeClaimConfirmation(input: {
  assessment: ResumeClaimAssessment;
  confirmations: readonly ResumeClaimConfirmation[];
  draftId: string;
}): ResumeClaimConfirmation | null {
  return (
    input.confirmations.find(
      (confirmation) =>
        confirmation.draftId === input.draftId &&
        confirmation.field === input.assessment.field &&
        confirmation.sectionId === input.assessment.sectionId &&
        confirmation.entryId === input.assessment.entryId &&
        confirmation.bulletId === input.assessment.bulletId &&
        confirmation.confirmedClaimContentHash === input.assessment.contentHash,
    ) ?? null
  );
}

/**
 * Rows the panel can honestly resolve: the current v2 verifier's
 * `confirm_needed` verdicts only. Unsupported claims can never be confirmed,
 * and stale-verifier rows must revalidate first, so neither gets controls.
 */
export function listConfirmNeededClaimAssessments(
  claimAssessments: readonly ResumeClaimAssessment[],
): ResumeClaimAssessment[] {
  return claimAssessments.filter(
    (assessment) =>
      assessment.status === "confirm_needed" &&
      assessment.verifier === "deterministic_candidate_evidence_v2",
  );
}

export type ResumeClaimConfirmationRequest =
  | {
      intent: "add";
      target: Pick<
        ResumeClaimAssessment,
        "field" | "sectionId" | "entryId" | "bulletId" | "contentHash"
      >;
    }
  | { intent: "remove"; confirmationId: string };

function findProjectedConfirmNeededAssessment(input: {
  captured: Pick<
    ResumeClaimAssessment,
    "field" | "sectionId" | "entryId" | "bulletId" | "contentHash"
  >;
  claimAssessments: readonly ResumeClaimAssessment[];
}): ResumeClaimAssessment | null {
  const captured = input.captured;

  return (
    input.claimAssessments.find(
      (candidate) =>
        candidate.field === captured.field &&
        candidate.sectionId === captured.sectionId &&
        (candidate.entryId ?? null) === (captured.entryId ?? null) &&
        (candidate.bulletId ?? null) === (captured.bulletId ?? null) &&
        candidate.contentHash === captured.contentHash,
    ) ?? null
  );
}

/**
 * Builds the typed command from the current saved snapshot. The request only
 * carries identity (locator plus hash, or confirmation id); if that identity no
 * longer matches the projection the builder returns null so the caller shows a
 * truthful stale error instead of submitting a doomed command.
 */
export function buildResumeClaimConfirmationCommandInput(input: {
  claimAssessments: readonly ResumeClaimAssessment[];
  draft: Pick<ResumeDraft, "id" | "updatedAt" | "claimConfirmations">;
  jobId: string;
  request: ResumeClaimConfirmationRequest;
}): JobFinderSetResumeClaimConfirmationInput | null {
  const request = input.request;
  if (request.intent === "remove") {
    const confirmation = input.draft.claimConfirmations.find(
      (candidate) =>
        candidate.id === request.confirmationId &&
        candidate.draftId === input.draft.id,
    );

    if (!confirmation) {
      return null;
    }

    return {
      intent: "remove",
      jobId: input.jobId,
      draftId: input.draft.id,
      expectedDraftUpdatedAt: input.draft.updatedAt,
      confirmationId: confirmation.id,
    };
  }

  const assessment = findProjectedConfirmNeededAssessment({
    captured: request.target,
    claimAssessments: input.claimAssessments,
  });

  if (
    !assessment ||
    assessment.status !== "confirm_needed" ||
    assessment.verifier !== "deterministic_candidate_evidence_v2"
  ) {
    return null;
  }

  return {
    intent: "add",
    jobId: input.jobId,
    draftId: input.draft.id,
    expectedDraftUpdatedAt: input.draft.updatedAt,
    field: assessment.field,
    sectionId: assessment.sectionId,
    entryId: assessment.entryId,
    bulletId: assessment.bulletId,
    confirmedClaimContentHash: assessment.contentHash,
    ownershipStatement: resumeClaimOwnershipStatement,
  };
}

interface ResumeClaimConfirmationPanelProps {
  claimAssessments: readonly ResumeClaimAssessment[];
  /** The saved workspace draft; confirmations and revisions describe it. */
  draft: ResumeDraft;
  hasUnsavedChanges: boolean;
  isWorkspacePending: boolean;
  jobId: string;
  onSetResumeClaimConfirmation: (
    input: JobFinderSetResumeClaimConfirmationInput,
  ) => Promise<unknown>;
}

function buildAddRequestKey(
  target: Pick<
    ResumeClaimAssessment,
    "field" | "sectionId" | "entryId" | "bulletId" | "contentHash"
  >,
): string {
  return [
    "add",
    target.field,
    target.sectionId,
    target.entryId ?? "",
    target.bulletId ?? "",
    target.contentHash,
  ].join(":");
}

export function ResumeClaimConfirmationPanel(
  props: ResumeClaimConfirmationPanelProps,
) {
  const [pendingRequestKey, setPendingRequestKey] = useState<string | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const assessments = listConfirmNeededClaimAssessments(props.claimAssessments);

  if (assessments.length === 0) {
    return null;
  }

  const rows = assessments.map((assessment) => ({
    assessment,
    confirmation: matchResumeClaimConfirmation({
      assessment,
      confirmations: props.draft.claimConfirmations,
      draftId: props.draft.id,
    }),
    requestKey: buildAddRequestKey(assessment),
    targetLabel: formatResumeClaimLocatorLabel({
      draft: props.draft,
      locator: assessment,
    }),
  }));
  const unconfirmedCount = rows.filter((row) => !row.confirmation).length;
  const requestInFlight =
    pendingRequestKey !== null || props.isWorkspacePending;

  const runRequest = async (
    request: ResumeClaimConfirmationRequest,
    requestKey: string,
    successMessage: string,
  ) => {
    if (pendingRequestKey !== null || props.isWorkspacePending) {
      return;
    }

    const commandInput = buildResumeClaimConfirmationCommandInput({
      claimAssessments: props.claimAssessments,
      draft: props.draft,
      jobId: props.jobId,
      request,
    });

    if (!commandInput) {
      setFeedback({ kind: "error", message: STALE_PROJECTION_ERROR });
      return;
    }

    setFeedback(null);
    setPendingRequestKey(requestKey);

    try {
      await props.onSetResumeClaimConfirmation(commandInput);
      setFeedback({ kind: "success", message: successMessage });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : UNKNOWN_FAILURE_ERROR,
      });
    } finally {
      setPendingRequestKey(null);
    }
  };

  return (
    <section
      aria-labelledby="resume-claim-confirmation-heading"
      className="grid min-w-0 gap-2 border-b border-(--surface-panel-border) bg-background/45 px-4 py-2.5"
      data-resume-claim-confirmations
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="font-display text-primary"
          id="resume-claim-confirmation-heading"
        >
          Claim confirmations
        </h3>
        <StatusBadge tone={unconfirmedCount > 0 ? "critical" : "positive"}>
          {unconfirmedCount > 0
            ? `${unconfirmedCount} need${unconfirmedCount === 1 ? "s" : ""} your confirmation`
            : "All confirmed"}
        </StatusBadge>
      </div>
      <p aria-live="polite" role="status">
        {unconfirmedCount > 0
          ? `${unconfirmedCount} of ${rows.length} claims still need your explicit confirmation before this resume can be exported.`
          : "Every listed claim is confirmed by you."}
      </p>
      {props.hasUnsavedChanges ? (
        <p
          className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-3 text-(length:--text-small) leading-5 text-(--warning-text)"
          role="status"
        >
          These checks describe the last saved draft. Save your edits to refresh
          claim evidence.
        </p>
      ) : null}
      {feedback ? (
        <p
          className={
            feedback.kind === "error"
              ? "rounded-(--radius-field) border border-destructive/30 bg-destructive/10 p-3 text-(length:--text-small) leading-5 text-destructive"
              : "rounded-(--radius-field) border border-positive/30 bg-positive/10 p-3 text-(length:--text-small) leading-5 text-positive"
          }
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
      <ul className="grid min-w-0 gap-1.5">
        {rows.map((row) => (
          <li
            className="grid min-w-0 gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-2.5 py-2 text-(length:--text-small) leading-5"
            data-resume-claim-confirmation-row={row.requestKey}
            key={row.assessment.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 grid gap-0.5">
                <span className="text-foreground-muted">{row.targetLabel}</span>
                <span className="min-w-0 break-words text-(length:--text-body) leading-6 text-(--text-headline)">
                  {row.assessment.claimText}
                </span>
              </span>
              <StatusBadge tone={row.confirmation ? "positive" : "critical"}>
                {row.confirmation ? "Confirmed by you" : "Evidence incomplete"}
              </StatusBadge>
            </div>
            <p className="text-foreground-soft">
              {row.confirmation
                ? CONFIRMED_EXPLANATION
                : NEEDS_CONFIRMATION_EXPLANATION}
            </p>
            <p className="font-medium text-(--text-headline)">
              {OWNERSHIP_STATEMENT_PROMPT}
            </p>
            <div>
              {/* Pending keeps the control exposed but inert instead of
                  natively disabled, so focus survives the in-flight request. */}
              <Button
                aria-label={`${row.confirmation ? "Undo confirmation" : "Confirm this wording"} · ${row.targetLabel}`}
                aria-pressed={Boolean(row.confirmation)}
                disabled={requestInFlight}
                onClick={() => {
                  void (row.confirmation
                    ? runRequest(
                        {
                          intent: "remove",
                          confirmationId: row.confirmation.id,
                        },
                        `remove:${row.confirmation.id}`,
                        `Removed your confirmation · ${row.targetLabel}. Export blocks again until you confirm this wording.`,
                      )
                    : runRequest(
                        {
                          intent: "add",
                          target: row.assessment,
                        },
                        row.requestKey,
                        `Recorded your confirmation · ${row.targetLabel}.`,
                      ));
                }}
                pending={requestInFlight}
                size="compact"
                type="button"
                variant={row.confirmation ? "secondary" : "primary"}
              >
                {row.confirmation
                  ? "Undo confirmation"
                  : "Confirm this wording"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
