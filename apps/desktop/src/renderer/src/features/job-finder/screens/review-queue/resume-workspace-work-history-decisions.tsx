import type {
  JobFinderSetWorkHistoryReviewAcknowledgmentInput,
  ResumeDraft,
  WorkHistoryReviewAcknowledgment,
  WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";

type DraftAcknowledgments = ResumeDraft["workHistoryReviewAcknowledgments"];

export type ResumeWorkHistoryDecisionRequest =
  | {
      intent: "acknowledge";
      suggestion: Pick<
        WorkHistoryReviewSuggestion,
        "id" | "profileRecordId" | "kind" | "action" | "messageContentHash"
      >;
    }
  | {
      intent: "remove";
      acknowledgmentId: string;
    };

const omissionKindLabels = {
  weak_fit: "Weak fit",
  gap_coverage: "Gap coverage",
} as const;

export function isWorkHistoryOmissionDecisionSuggestion<
  T extends Pick<WorkHistoryReviewSuggestion, "kind" | "action">,
>(
  suggestion: T,
): suggestion is T & {
  kind: "weak_fit" | "gap_coverage";
  action: "consider_showing";
} {
  return (
    (suggestion.kind === "weak_fit" || suggestion.kind === "gap_coverage") &&
    suggestion.action === "consider_showing"
  );
}

export function matchWorkHistoryOmissionDecisionAcknowledgment(input: {
  draftId: string;
  suggestion: WorkHistoryReviewSuggestion;
  acknowledgments: DraftAcknowledgments;
}): WorkHistoryReviewAcknowledgment | null {
  return (
    input.acknowledgments.find(
      (acknowledgment) =>
        acknowledgment.draftId === input.draftId &&
        acknowledgment.profileRecordId === input.suggestion.profileRecordId &&
        acknowledgment.kind === input.suggestion.kind &&
        acknowledgment.action === input.suggestion.action &&
        acknowledgment.messageContentHash ===
          input.suggestion.messageContentHash,
    ) ?? null
  );
}

export function listUnresolvedWorkHistoryOmissionSuggestions(input: {
  draftId: string;
  suggestions: readonly WorkHistoryReviewSuggestion[];
  acknowledgments: DraftAcknowledgments;
}): WorkHistoryReviewSuggestion[] {
  return input.suggestions.filter(
    (suggestion) =>
      isWorkHistoryOmissionDecisionSuggestion(suggestion) &&
      !matchWorkHistoryOmissionDecisionAcknowledgment({
        draftId: input.draftId,
        suggestion,
        acknowledgments: input.acknowledgments,
      }),
  );
}

export function buildWorkHistoryReviewAcknowledgmentCommandInput(input: {
  jobId: string;
  draft: Pick<ResumeDraft, "id" | "updatedAt"> & {
    workHistoryReviewAcknowledgments: DraftAcknowledgments;
  };
  suggestions: readonly WorkHistoryReviewSuggestion[];
  decision: ResumeWorkHistoryDecisionRequest;
}): JobFinderSetWorkHistoryReviewAcknowledgmentInput | null {
  const { decision } = input;

  if (decision.intent === "remove") {
    const acknowledgmentId = decision.acknowledgmentId;
    const acknowledgment = input.draft.workHistoryReviewAcknowledgments.find(
      (candidate) => candidate.id === acknowledgmentId,
    );

    if (!acknowledgment || acknowledgment.draftId !== input.draft.id) {
      return null;
    }

    return {
      intent: "remove",
      jobId: input.jobId,
      draftId: input.draft.id,
      expectedDraftUpdatedAt: input.draft.updatedAt,
      acknowledgmentId: acknowledgment.id,
    };
  }

  const captured = decision.suggestion;
  const suggestion = input.suggestions.find(
    (candidate) => candidate.id === captured.id,
  );

  if (!suggestion || !isWorkHistoryOmissionDecisionSuggestion(suggestion)) {
    return null;
  }

  const stillProjected =
    suggestion.profileRecordId === captured.profileRecordId &&
    suggestion.kind === captured.kind &&
    suggestion.action === captured.action &&
    suggestion.messageContentHash === captured.messageContentHash;

  if (!stillProjected) {
    return null;
  }

  return {
    intent: "acknowledge",
    jobId: input.jobId,
    draftId: input.draft.id,
    expectedDraftUpdatedAt: input.draft.updatedAt,
    suggestionId: suggestion.id,
    profileRecordId: suggestion.profileRecordId,
    kind: suggestion.kind,
    action: suggestion.action,
    messageContentHash: suggestion.messageContentHash,
    reason: "intentional_omission",
  };
}

interface ResumeWorkHistoryDecisionsProps {
  acknowledgments: DraftAcknowledgments;
  disabled: boolean;
  draftId: string;
  suggestions: readonly WorkHistoryReviewSuggestion[];
  onAcknowledge: (suggestion: WorkHistoryReviewSuggestion) => void;
  onRemoveAcknowledgment: (acknowledgmentId: string) => void;
}

export function ResumeWorkHistoryDecisions(
  props: ResumeWorkHistoryDecisionsProps,
) {
  const decisions = props.suggestions.filter(
    isWorkHistoryOmissionDecisionSuggestion,
  );

  if (decisions.length === 0) {
    return null;
  }

  const resolved = decisions.map((suggestion) => ({
    suggestion,
    acknowledgment: matchWorkHistoryOmissionDecisionAcknowledgment({
      draftId: props.draftId,
      suggestion,
      acknowledgments: props.acknowledgments,
    }),
  }));
  const unresolvedCount = resolved.filter(
    (decision) => !decision.acknowledgment,
  ).length;

  return (
    <section
      aria-labelledby="resume-work-history-decisions-heading"
      className="grid min-w-0 grid-cols-1 gap-2 rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) p-2.5 text-(length:--text-small) leading-5 text-(--warning-text)"
      data-resume-work-history-decisions
      tabIndex={-1}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          className="font-display text-sm font-semibold text-(--text-headline)"
          id="resume-work-history-decisions-heading"
        >
          Work-history decisions
        </h3>
        <StatusBadge tone={unresolvedCount > 0 ? "critical" : "positive"}>
          {unresolvedCount > 0
            ? `${unresolvedCount} need${unresolvedCount === 1 ? "s" : ""} decision`
            : "All kept omitted"}
        </StatusBadge>
      </div>
      <p aria-live="polite" role="status">
        {unresolvedCount > 0
          ? `${unresolvedCount} of ${decisions.length} hidden roles still need an explicit kept-omitted decision before this resume can be approved.`
          : "Every listed hidden role is kept omitted by your explicit decision."}
      </p>
      <ul className="grid min-w-0 grid-cols-1 gap-2">
        {resolved.map(({ suggestion, acknowledgment }) => (
          <li
            className="grid min-w-0 grid-cols-1 gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/60 px-2.5 py-2"
            key={suggestion.id}
          >
            <StatusBadge tone={acknowledgment ? "positive" : "critical"}>
              {acknowledgment ? "Kept omitted" : "Needs decision"}
            </StatusBadge>
            <p className="min-w-0 [overflow-wrap:anywhere]">
              {suggestion.message}
            </p>
            <div>
              <Button
                aria-label={`${acknowledgment ? "Undo keep omitted" : "Keep omitted"} · ${omissionKindLabels[suggestion.kind]}: ${suggestion.message}`}
                aria-pressed={Boolean(acknowledgment)}
                disabled={props.disabled}
                onClick={() =>
                  acknowledgment
                    ? props.onRemoveAcknowledgment(acknowledgment.id)
                    : props.onAcknowledge(suggestion)
                }
                pending={props.disabled}
                size="compact"
                type="button"
                variant={acknowledgment ? "secondary" : "primary"}
              >
                {acknowledgment ? "Undo keep omitted" : "Keep omitted"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
