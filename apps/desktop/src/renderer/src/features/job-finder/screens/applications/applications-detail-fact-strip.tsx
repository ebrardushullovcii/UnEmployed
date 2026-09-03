import { ApplicationsDisclosureSummary } from "./applications-disclosure-summary";
import type {
  ApplicationAttempt,
  ApplicationRecord,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import type { ReactNode } from "react";
import {
  formatStatusLabel,
  formatTimestamp,
  getAttemptLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  applyResultIsFieldSavePause,
  FIELD_SAVE_PAUSE_ACTIVITY,
  FIELD_SAVE_PAUSE_CAUSE,
  formatVisibleRunId,
  getCustomerFacingApplyText,
  applyResultIsServiceWorkerBlocked,
} from "./applications-detail-panel-helpers";

// The eyebrow token, not a literal `text-xs`: at 12px these labels sat between
// the 11px eyebrow floor and the neighbouring `.label-mono-xs` labels in the
// same panel, so the detail pane had two label sizes with no rule behind them.
export const APPLICATION_DETAIL_FACT_LABEL_CLASS =
  "text-(length:--text-eyebrow) font-semibold uppercase leading-4 tracking-(--tracking-badge) text-muted-foreground";

/**
 * `formatStatusLabel` title-cases every word, which reads like a system state
 * ("Requires Manual Review") rather than a plain sentence. The blocker cell is
 * customer-facing copy, so only the first word stays capitalized.
 */
function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
}

/** Compares customer-facing copy ignoring case and trailing punctuation. */
function isSameSentence(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/[.\s]+$/, "")
      .toLowerCase();

  return normalize(left) === normalize(right);
}

interface DetailFact {
  content: ReactNode;
  label: string;
  muted?: boolean;
  note?: string;
  title?: string;
}

function DetailFactCell({ fact }: { fact: DetailFact }) {
  const { content, label, muted = false, note, title } = fact;
  const valueTitle =
    title ??
    (note && typeof content === "string"
      ? `${content} • ${note}`
      : (note ?? undefined));

  return (
    <div className="min-w-0">
      <dt className={APPLICATION_DETAIL_FACT_LABEL_CLASS}>{label}</dt>
      <dd
        className={`mt-1 block min-w-0 break-words text-(length:--text-field) leading-6 ${muted ? "font-normal text-foreground-muted" : "font-semibold text-foreground"}`}
        {...(valueTitle ? { title: valueTitle } : {})}
      >
        {content}
      </dd>
      {note ? (
        <p
          className="mt-1 block min-w-0 break-words text-(length:--text-small) leading-5 text-foreground-soft"
          title={note}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function ApplicationsDetailFactStrip(props: {
  selectedAttempt: ApplicationAttempt | null;
  selectedRecord: ApplicationRecord;
  visibleApplyResult:
    | JobFinderWorkspaceSnapshot["applyJobResults"][number]
    | null;
  visibleApplyRunId: string | null;
}) {
  const {
    selectedAttempt,
    selectedRecord,
    visibleApplyResult,
    visibleApplyRunId,
  } = props;
  const { consentSummary, latestBlocker, questionSummary, replaySummary } =
    selectedRecord;
  const resolvedRunId = visibleApplyRunId ?? visibleApplyResult?.runId ?? null;
  const attemptStateLabel = selectedAttempt
    ? getAttemptLabel(selectedAttempt.state)
    : selectedRecord.lastAttemptState
      ? getAttemptLabel(selectedRecord.lastAttemptState)
      : null;

  const replayNoteSegments = [
    replaySummary.evidenceCount > 0
      ? `${replaySummary.evidenceCount} retained evidence item${replaySummary.evidenceCount === 1 ? "" : "s"}`
      : null,
    replaySummary.lastUrl,
  ].filter((segment): segment is string => segment !== null);

  const blockerNote = latestBlocker
    ? getCustomerFacingApplyText(latestBlocker.summary)
    : null;

  const isSiteBlockedPause =
    applyResultIsServiceWorkerBlocked(visibleApplyResult) ||
    (Boolean(blockerNote) &&
      /service worker|job site blocked|safeguards/i.test(
        `${latestBlocker?.summary ?? ""} ${blockerNote ?? ""} ${selectedRecord.lastActionLabel ?? ""}`,
      ));
  // Next step already tells the user the site acted and Job Finder stopped it.
  // The runtime's own sentence describes the same event as a site failure, so
  // the strip reuses the exact shared labels instead of a rival account.
  const isFieldSavePause = applyResultIsFieldSavePause(visibleApplyResult);
  const latestActivityContent = isFieldSavePause
    ? FIELD_SAVE_PAUSE_ACTIVITY
    : selectedRecord.lastActionLabel
      ? isSiteBlockedPause
        ? "Automatic prep paused"
        : selectedRecord.lastActionLabel
      : null;
  // The runtime writes the same pause sentence into the record's latest action
  // and into the blocker summary. Printing both put one sentence in two of the
  // three strip columns, so the blocker note is dropped when it repeats.
  const showsBlockerNote =
    Boolean(blockerNote) &&
    !isSiteBlockedPause &&
    !isFieldSavePause &&
    !(
      latestActivityContent !== null &&
      isSameSentence(blockerNote ?? "", latestActivityContent)
    );
  // On a finish-yourself pause the Next step callout directly above already
  // prints the whole sentence — the site acted, Job Finder stopped, finish in
  // the browser. "Latest activity" and "What stopped progress" were its two
  // halves relabelled, so one event arrived as three labelled facts.
  const nextStepOwnsPauseCause = isFieldSavePause || isSiteBlockedPause;
  const preparationStatusFact: DetailFact = attemptStateLabel
    ? {
        content: attemptStateLabel,
        label: "Preparation status",
      }
    : {
        content: "Not started",
        label: "Preparation status",
        muted: true,
      };
  const primaryFacts: DetailFact[] = nextStepOwnsPauseCause
    ? [preparationStatusFact]
    : [
        latestActivityContent
          ? {
              content: latestActivityContent,
              label: "Latest activity",
            }
          : {
              content: "No recent activity",
              label: "Latest activity",
              muted: true,
            },
        preparationStatusFact,
        latestBlocker
          ? {
              content: isFieldSavePause
                ? FIELD_SAVE_PAUSE_CAUSE
                : isSiteBlockedPause
                  ? "Needs you on the job site"
                  : toSentenceCase(formatStatusLabel(latestBlocker.code)),
              label: "What stopped progress",
              ...(showsBlockerNote && blockerNote ? { note: blockerNote } : {}),
            }
          : {
              content: "Nothing blocking",
              label: "What stopped progress",
              muted: true,
            },
      ];

  const detailFacts: DetailFact[] = [
    {
      content: formatTimestamp(selectedRecord.lastUpdatedAt),
      label: "Last updated",
    },
    {
      content: questionSummary.total,
      label: "Form questions",
      note: `${questionSummary.answered} answered • ${questionSummary.unansweredRequired} required left`,
    },
    {
      content: formatStatusLabel(consentSummary.status),
      label: "Consent decisions",
      muted: consentSummary.status === "none",
      ...(consentSummary.pendingCount > 0
        ? { note: `${consentSummary.pendingCount} waiting` }
        : {}),
    },
    replaySummary.checkpointCount > 0
      ? {
          content: `${replaySummary.checkpointCount} saved`,
          label: "Saved progress",
          ...(replayNoteSegments.length
            ? { note: replayNoteSegments.join(" • ") }
            : {}),
        }
      : {
          content: "None yet",
          label: "Saved progress",
          muted: true,
        },
  ];

  if (visibleApplyResult) {
    const submissionOutcome =
      visibleApplyResult.privacyReceipt?.submissionOutcome?.outcome ?? null;
    const runNote = [
      resolvedRunId ? `Run ${formatVisibleRunId(resolvedRunId)}` : null,
      `${visibleApplyResult.latestQuestionCount} questions found`,
      `${visibleApplyResult.latestAnswerCount} answers filled`,
      // The autosave pause already has its cause stated once above; repeating
      // the runtime sentence here made the same event read four ways.
      visibleApplyResult.blockerSummary && !isFieldSavePause
        ? (getCustomerFacingApplyText(visibleApplyResult.blockerSummary) ?? "")
        : null,
    ]
      .filter((segment) => segment !== null && segment.length > 0)
      .join(" • ");

    detailFacts.push({
      content:
        submissionOutcome === "outcome_uncertain"
          ? "Outcome needs verification"
          : submissionOutcome === "not_submitted"
            ? "Final action not submitted"
            : submissionOutcome === "submitted"
              ? "Submitted (verified)"
              : formatStatusLabel(visibleApplyResult.state),
      label: "Latest preparation run",
      ...(runNote.length > 0 ? { note: runNote } : {}),
      ...(resolvedRunId ? { title: resolvedRunId } : {}),
    });
  }

  return (
    <section
      aria-label="Application status"
      className="surface-card-tint grid gap-4 rounded-(--radius-field) border border-(--border-strong) bg-(--surface-overlay-soft) px-5 py-4"
    >
      <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 @[32rem]/detail:grid-cols-3">
        {primaryFacts.map((fact) => (
          <DetailFactCell fact={fact} key={fact.label} />
        ))}
      </dl>
      <details className="group min-w-0">
        <ApplicationsDisclosureSummary count={detailFacts.length}>
          More about this application
        </ApplicationsDisclosureSummary>
        <dl className="mt-2 grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 border-t border-(--border-strong)/70 pt-2 @[32rem]/detail:grid-cols-3">
          {detailFacts.map((fact) => (
            <DetailFactCell fact={fact} key={fact.label} />
          ))}
        </dl>
      </details>
    </section>
  );
}
