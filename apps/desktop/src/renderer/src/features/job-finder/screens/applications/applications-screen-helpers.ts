import type { ApplicationAttempt, ApplicationRecord } from "@unemployed/contracts";
import type { ApplicationsViewFilter } from "./applications-filters";

export function getLatestApplicationAttemptForRecord(
  record: ApplicationRecord,
  applicationAttempts: readonly ApplicationAttempt[],
) {
  let latestAttempt: ApplicationAttempt | null = null;
  let latestUpdatedAt = Number.NEGATIVE_INFINITY;

  for (const attempt of applicationAttempts) {
    if (attempt.jobId !== record.jobId) {
      continue;
    }

    const attemptUpdatedAt = new Date(attempt.updatedAt).getTime();
    if (attemptUpdatedAt > latestUpdatedAt) {
      latestAttempt = attempt;
      latestUpdatedAt = attemptUpdatedAt;
    }
  }

  return latestAttempt;
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
