import type { ResumeValidationIssue } from "@unemployed/contracts";
import {
  getResumeEntryBulletTargetId,
  getResumeEntryFieldTargetId,
  getResumeSectionBulletTargetId,
  getResumeSectionTextTargetId,
  isBlockingResumeValidationIssue,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";

const severityRank = {
  error: 0,
  warning: 1,
  info: 2,
} as const;

export function orderResumeValidationIssues(
  issues: readonly ResumeValidationIssue[],
): ResumeValidationIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort(
      (left, right) =>
        severityRank[left.issue.severity] -
          severityRank[right.issue.severity] || left.index - right.index,
    )
    .map(({ issue }) => issue);
}

export function countBlockingResumeValidationIssues(
  issues: readonly ResumeValidationIssue[],
): number {
  return issues.filter(isBlockingResumeValidationIssue).length;
}

export function getResumeValidationIssueTargetId(
  issue: Pick<ResumeValidationIssue, "sectionId" | "entryId" | "bulletId">,
): string | null {
  const { sectionId, entryId, bulletId } = issue;

  if (!sectionId) {
    return null;
  }

  if (bulletId && entryId) {
    return getResumeEntryBulletTargetId(sectionId, entryId, bulletId);
  }

  if (bulletId) {
    return getResumeSectionBulletTargetId(sectionId, bulletId);
  }

  if (entryId) {
    return getResumeEntryFieldTargetId(sectionId, entryId, "summary");
  }

  return getResumeSectionTextTargetId(sectionId);
}

function getIssueSeverityLabel(severity: ResumeValidationIssue["severity"]) {
  switch (severity) {
    case "error":
      return "Blocks approval";
    case "warning":
      return "Warning";
    case "info":
      return "Note";
  }
}

function getIssueSeverityTone(severity: ResumeValidationIssue["severity"]) {
  switch (severity) {
    case "error":
      return "critical" as const;
    case "warning":
      return "neutral" as const;
    case "info":
      return "muted" as const;
  }
}

interface ResumeValidationIssueListProps {
  issues: readonly ResumeValidationIssue[];
  onFixIssue: (issue: ResumeValidationIssue) => void;
}

export function ResumeValidationIssueList(
  props: ResumeValidationIssueListProps,
) {
  if (props.issues.length === 0) {
    return null;
  }

  const orderedIssues = orderResumeValidationIssues(props.issues);
  const blockingCount = countBlockingResumeValidationIssues(props.issues);
  const headingId = "resume-validation-issues-heading";

  return (
    <section
      aria-labelledby={headingId}
      className="shrink-0 border-b border-(--surface-panel-border) bg-background/45 px-4 py-2.5"
      data-resume-validation-issues
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary"
          id={headingId}
        >
          Validation issues
        </h2>
        <StatusBadge tone={blockingCount > 0 ? "critical" : "neutral"}>
          {blockingCount > 0
            ? `${blockingCount} approval blocker${blockingCount === 1 ? "" : "s"}`
            : "No approval blockers"}
        </StatusBadge>
      </div>
      <ul className="mt-2 grid min-w-0 gap-1.5">
        {orderedIssues.map((issue) => {
          const targetId = getResumeValidationIssueTargetId(issue);

          return (
            <li
              className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-2.5 py-1.5"
              data-resume-validation-issue={issue.id}
              key={issue.id}
              tabIndex={-1}
            >
              <span className="grid min-w-0 gap-0.5 text-left">
                <StatusBadge tone={getIssueSeverityTone(issue.severity)}>
                  {getIssueSeverityLabel(issue.severity)}
                </StatusBadge>
                <span className="min-w-0 text-(length:--text-small) leading-5 text-(--text-headline)">
                  {issue.message}
                </span>
              </span>
              {targetId ? (
                <Button
                  onClick={() => props.onFixIssue(issue)}
                  size="compact"
                  type="button"
                  variant="secondary"
                >
                  Fix in editor
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
