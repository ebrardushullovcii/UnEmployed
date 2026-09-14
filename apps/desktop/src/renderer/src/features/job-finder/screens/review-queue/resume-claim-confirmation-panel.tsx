import { useState } from "react";
import type {
  JobFinderSetResumeClaimConfirmationInput,
  ResumeClaimAssessment,
  ResumeClaimConfirmation,
  ResumeDraft,
} from "@unemployed/contracts";
import {
  isResumeClaimAssessmentApprovable,
  isResumeSkillClaimAssessment,
  resumeClaimOwnershipStatement,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";
import { formatResumeClaimLocatorLabel } from "./resume-assistant-proposal-provenance";

/**
 * The exact wording a user must attest. Rendered visibly and submitted
 * verbatim: the domain rejects any other statement, so the UI never paraphrases
 * it and never sends an id in its place.
 */
const OWNERSHIP_STATEMENT_PROMPT = `Required confirmation: “${resumeClaimOwnershipStatement}”`;

const PANEL_PURPOSE =
  "These lines go a little past your saved evidence so the resume can clear screening for the first interview. Export stays blocked until you confirm you can stand behind each one. Proof happens in the interview — that call is yours.";

const WORDING_NEEDS_CONFIRMATION_EXPLANATION =
  "This line goes a little past your saved evidence so the resume can clear screening. Confirm you can stand behind it.";

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
  | {
      intent: "add_many";
      targets: readonly Pick<
        ResumeClaimAssessment,
        "field" | "sectionId" | "entryId" | "bulletId" | "contentHash"
      >[];
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

  if (request.intent === "add_many") {
    const assessments = request.targets.map((target) =>
      findProjectedConfirmNeededAssessment({
        captured: target,
        claimAssessments: input.claimAssessments,
      }),
    );
    if (
      assessments.some(
        (assessment) =>
          !assessment || !isResumeClaimAssessmentApprovable(assessment),
      )
    ) {
      return null;
    }

    return {
      intent: "add_many",
      jobId: input.jobId,
      draftId: input.draft.id,
      expectedDraftUpdatedAt: input.draft.updatedAt,
      ownershipStatement: resumeClaimOwnershipStatement,
      targets: assessments.map((assessment) => ({
        field: assessment!.field,
        sectionId: assessment!.sectionId,
        entryId: assessment!.entryId,
        bulletId: assessment!.bulletId,
        confirmedClaimContentHash: assessment!.contentHash,
      })),
    };
  }

  const assessment = findProjectedConfirmNeededAssessment({
    captured: request.target,
    claimAssessments: input.claimAssessments,
  });

  if (!assessment || !isResumeClaimAssessmentApprovable(assessment)) {
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
  /**
   * The other half of the decision. Listing-asked skills can be confirmed
   * together; each skill still gets its own confirmation record. Present only
   * for a line the draft patch schema can remove — a bullet, including every
   * added core skill.
   */
  onRejectClaim?: (assessment: ResumeClaimAssessment) => void;
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
    isSkill: isResumeSkillClaimAssessment(props.draft, assessment),
  }));
  const skillRows = rows.filter((row) => row.isSkill);
  const wordingRows = rows.filter((row) => !row.isSkill);
  const unconfirmedCount = rows.filter((row) => !row.confirmation).length;
  const unconfirmedSkillTargets = skillRows
    .filter((row) => !row.confirmation)
    .map((row) => row.assessment);
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

  const renderConfirmControls = (row: (typeof rows)[number]) => (
    <div className="flex flex-wrap gap-2">
      {/* Pending keeps the control exposed but inert instead of
          natively disabled, so focus survives the in-flight request. */}
      <Button
        aria-label={`${row.confirmation ? (row.isSkill ? "Undo skill confirmation" : "Undo confirmation") : row.isSkill ? "Confirm this skill" : "Confirm this wording"} · ${row.targetLabel}`}
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
          ? row.isSkill
            ? "Undo skill confirmation"
            : "Undo confirmation"
          : row.isSkill
            ? "Confirm this skill"
            : "Confirm this wording"}
      </Button>
      {!row.confirmation && props.onRejectClaim && row.assessment.bulletId ? (
        <Button
          aria-label={`Remove this line · ${row.targetLabel}`}
          data-resume-claim-reject={row.requestKey}
          disabled={requestInFlight}
          onClick={() => props.onRejectClaim?.(row.assessment)}
          size="compact"
          type="button"
          variant="secondary"
        >
          Remove this line
        </Button>
      ) : null}
    </div>
  );

  const renderSkillRow = (row: (typeof rows)[number]) => (
    <li
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-2.5 py-1.5 text-(length:--text-small) leading-5"
      data-resume-claim-confirmation-row={row.requestKey}
      key={row.assessment.id}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 break-words font-medium text-(length:--text-body) leading-6 text-(--text-headline)">
          {row.assessment.claimText}
        </span>
        <StatusBadge tone={row.confirmation ? "positive" : "critical"}>
          {row.confirmation ? "Confirmed by you" : "Needs your confirmation"}
        </StatusBadge>
      </div>
      {renderConfirmControls(row)}
    </li>
  );

  const renderWordingRow = (row: (typeof rows)[number]) => (
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
          {row.confirmation ? "Confirmed by you" : "Needs your confirmation"}
        </StatusBadge>
      </div>
      <p className="text-foreground-soft">
        {row.confirmation
          ? CONFIRMED_EXPLANATION
          : WORDING_NEEDS_CONFIRMATION_EXPLANATION}
      </p>
      <p className="min-w-0 font-medium text-(--text-headline) [overflow-wrap:anywhere]">
        {OWNERSHIP_STATEMENT_PROMPT}
      </p>
      {renderConfirmControls(row)}
    </li>
  );

  return (
    <section
      aria-labelledby="resume-claim-confirmation-heading"
      className="grid min-w-0 gap-3 px-4 py-3"
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
          ? PANEL_PURPOSE
          : "Every listed claim is confirmed by you."}
      </p>
      {unconfirmedCount > 0 ? (
        <p className="text-(length:--text-small) leading-5 text-foreground-muted">
          {unconfirmedCount} of {rows.length} still need your confirmation
          before this resume can be exported.
        </p>
      ) : null}
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
      {skillRows.length > 0 ? (
        <div className="grid min-w-0 gap-2" data-resume-claim-confirm-skills>
          <div className="grid min-w-0 gap-1">
            <h4 className="font-medium text-(--text-headline)">
              Skills the job asked for
              {skillRows.length > 0 ? ` · ${skillRows.length}` : ""}
            </h4>
            <p className="text-(length:--text-small) leading-5 text-foreground-soft">
              Confirm you can back these in the interview, or remove any you do
              not want on this resume.
            </p>
            <p className="min-w-0 font-medium text-(--text-headline) [overflow-wrap:anywhere]">
              {OWNERSHIP_STATEMENT_PROMPT}
            </p>
            {unconfirmedSkillTargets.length >= 2 ? (
              <div>
                <Button
                  aria-label={`Confirm all ${unconfirmedSkillTargets.length} skills`}
                  data-resume-claim-confirm-all-skills
                  disabled={requestInFlight}
                  onClick={() => {
                    void runRequest(
                      {
                        intent: "add_many",
                        targets: unconfirmedSkillTargets,
                      },
                      "add_many:skills",
                      `Recorded your confirmation for ${unconfirmedSkillTargets.length} skills.`,
                    );
                  }}
                  pending={requestInFlight}
                  size="compact"
                  type="button"
                  variant="primary"
                  className="w-full sm:w-auto"
                >
                  Confirm all {unconfirmedSkillTargets.length} skills
                </Button>
              </div>
            ) : null}
          </div>
          <ul className="grid min-w-0 gap-1.5">
            {skillRows.map(renderSkillRow)}
          </ul>
        </div>
      ) : null}
      {wordingRows.length > 0 ? (
        <div className="grid min-w-0 gap-2" data-resume-claim-confirm-wording>
          <div className="grid min-w-0 gap-1">
            <h4 className="font-medium text-(--text-headline)">
              Wording that stretches saved evidence
            </h4>
            <p className="text-(length:--text-small) leading-5 text-foreground-soft">
              Confirm each line you can stand behind in the interview.
            </p>
          </div>
          <ul className="grid min-w-0 gap-1.5">
            {wordingRows.map(renderWordingRow)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
