import type { ApplicationAttempt, ApplicationRecord } from "@unemployed/contracts";
import type { ApplicationsViewFilter } from "./applications-filters";

export function getLatestApplicationAttemptForRecord(
  record: ApplicationRecord,
  applicationAttempts: readonly ApplicationAttempt[],
) {
  return (
    [...applicationAttempts]
      .filter((attempt) => attempt.jobId === record.jobId)
      .sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
          new Date(left.updatedAt).getTime(),
      )[0] ?? null
  );
}

function isTerminalApplicationStatus(status: ApplicationRecord["status"]) {
  return (
    status === "submitted" ||
    status === "rejected" ||
    status === "offer" ||
    status === "withdrawn" ||
    status === "archived"
  );
}

export function matchesApplicationsFilter(
  record: ApplicationRecord,
  filter: ApplicationsViewFilter,
) {
  const needsAction =
    record.lastAttemptState === "paused" ||
    record.lastAttemptState === "failed" ||
    record.lastAttemptState === "unsupported" ||
    (Boolean(record.nextActionLabel) &&
      !isTerminalApplicationStatus(record.status) &&
      record.lastAttemptState !== "in_progress");
  const submitted = record.status === "submitted";
  const manualOnly = record.lastAttemptState === "unsupported";
  const inProgress =
    record.lastAttemptState === "in_progress" ||
    (!needsAction &&
      !submitted &&
      (record.status === "drafting" ||
        record.status === "ready_for_review" ||
        record.status === "approved" ||
        record.status === "assessment" ||
        record.status === "interview"));

  switch (filter) {
    case "needs_action":
      return needsAction;
    case "in_progress":
      return inProgress;
    case "submitted":
      return submitted;
    case "manual_only":
      return manualOnly;
    default:
      return true;
  }
}

export function pickLatestIsoTimestamp(
  ...values: Array<string | null | undefined>
) {
  let latestValue: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const parsedTimestamp = Date.parse(value);
    if (Number.isNaN(parsedTimestamp) || parsedTimestamp <= latestTimestamp) {
      continue;
    }

    latestTimestamp = parsedTimestamp;
    latestValue = value;
  }

  return latestValue;
}
