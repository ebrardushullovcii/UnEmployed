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
  getAttemptTone,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import { StatusBadge } from "../../components/status-badge";
import {
  formatVisibleRunId,
  getCustomerFacingApplyText,
} from "./applications-detail-panel-helpers";

export const APPLICATION_DETAIL_FACT_LABEL_CLASS =
  "font-mono text-[11px] font-bold uppercase leading-4 tracking-(--tracking-badge) text-muted-foreground";

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
        className={`mt-0.5 block min-w-0 truncate text-(length:--text-field) leading-5 ${muted ? "font-normal text-foreground-muted" : "font-semibold text-foreground"}`}
        {...(valueTitle ? { title: valueTitle } : {})}
      >
        {content}
      </dd>
      {note ? (
        <p
          className="mt-0.5 block min-w-0 truncate text-(length:--text-small) leading-5 text-foreground-soft"
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

  const facts: DetailFact[] = [
    {
      content: formatTimestamp(selectedRecord.lastUpdatedAt),
      label: "Last updated",
    },
    selectedRecord.lastActionLabel
      ? {
          content: selectedRecord.lastActionLabel,
          label: "Latest activity",
        }
      : {
          content: "No recent activity",
          label: "Latest activity",
          muted: true,
        },
    attemptStateLabel
      ? {
          content: (
            <StatusBadge
              tone={getAttemptTone(
                selectedAttempt?.state ?? selectedRecord.lastAttemptState,
              )}
            >
              {attemptStateLabel}
            </StatusBadge>
          ),
          label: "Preparation",
        }
      : {
          content: "No preparation yet",
          label: "Preparation",
          muted: true,
        },
    {
      content: questionSummary.total,
      label: "Questions",
      note: `${questionSummary.answered} answered • ${questionSummary.unansweredRequired} required left`,
    },
    latestBlocker
      ? {
          content: formatStatusLabel(latestBlocker.code),
          label: "Blocker",
          ...(blockerNote ? { note: blockerNote } : {}),
        }
      : {
          content: "No blocker",
          label: "Blocker",
          muted: true,
        },
    {
      content: formatStatusLabel(consentSummary.status),
      label: "Consent",
      muted: consentSummary.status === "none",
      ...(consentSummary.pendingCount > 0
        ? { note: `${consentSummary.pendingCount} pending` }
        : {}),
    },
    replaySummary.checkpointCount > 0
      ? {
          content: `${replaySummary.checkpointCount} checkpoints`,
          label: "Replay memory",
          ...(replayNoteSegments.length
            ? { note: replayNoteSegments.join(" • ") }
            : {}),
        }
      : {
          content: "No checkpoints",
          label: "Replay memory",
          muted: true,
        },
  ];

  if (visibleApplyResult) {
    const runNote = [
      resolvedRunId ? `Preparation ${formatVisibleRunId(resolvedRunId)}` : null,
      `${visibleApplyResult.latestQuestionCount} questions`,
      `${visibleApplyResult.latestAnswerCount} grounded answers`,
      `${visibleApplyResult.artifactCount} retained artifacts`,
      ...(visibleApplyResult.visualCheckpoints.length
        ? [
            `${visibleApplyResult.visualCheckpoints.length} visual checkpoint${visibleApplyResult.visualCheckpoints.length === 1 ? "" : "s"} saved for review`,
          ]
        : []),
      visibleApplyResult.blockerSummary
        ? (getCustomerFacingApplyText(visibleApplyResult.blockerSummary) ?? "")
        : null,
    ]
      .filter((segment) => segment !== null && segment.length > 0)
      .join(" • ");

    facts.push({
      content: formatStatusLabel(visibleApplyResult.state),
      label: "Preparation run",
      ...(runNote.length > 0 ? { note: runNote } : {}),
      ...(resolvedRunId ? { title: resolvedRunId } : {}),
    });
  }

  return (
    <section
      aria-label="Application facts"
      className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3"
    >
      <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 @[32rem]/detail:grid-cols-3">
        {facts.map((fact) => (
          <DetailFactCell fact={fact} key={fact.label} />
        ))}
      </dl>
    </section>
  );
}
