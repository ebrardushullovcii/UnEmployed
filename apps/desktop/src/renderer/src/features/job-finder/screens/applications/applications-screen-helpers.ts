import type {
  ApplicationAttempt,
  ApplicationRecord,
  GlobalDailyApplicationPreparationCapacity,
} from "@unemployed/contracts";
import {
  formatDailyPreparationCapacityReachedText,
  isDailyPreparationCapacityExhausted,
} from "../../lib/job-finder-daily-capacity";
import type { ApplicationsViewFilter } from "./applications-filters";

/**
 * Resolves the one route-owned action status Applications presents. Retry,
 * queue, and copilot refusals and backend errors must stay visible here, but
 * a refusal that repeats the fixed daily-limit text is already owned by the
 * Recovery section's dedicated reached alert, so the route surface suppresses
 * exactly that duplicate instead of announcing the same sentence twice.
 */
export function resolveVisibleRouteActionMessage(input: {
  actionMessage: string | null | undefined;
  dailyPreparationCapacity: GlobalDailyApplicationPreparationCapacity | null;
}): string | null {
  const { actionMessage, dailyPreparationCapacity } = input;

  if (!actionMessage) {
    return null;
  }

  if (
    dailyPreparationCapacity &&
    isDailyPreparationCapacityExhausted(dailyPreparationCapacity) &&
    actionMessage ===
      formatDailyPreparationCapacityReachedText(dailyPreparationCapacity)
  ) {
    return null;
  }

  return actionMessage;
}

export function resolveUnambiguousApplicationRecordIdByJobId(
  records: readonly ApplicationRecord[],
): Map<string, string> {
  const recordIdsByJobId = new Map<string, string[]>();
  for (const record of records) {
    const ids = recordIdsByJobId.get(record.jobId);
    if (ids) {
      ids.push(record.id);
    } else {
      recordIdsByJobId.set(record.jobId, [record.id]);
    }
  }

  const unambiguousRecordIdByJobId = new Map<string, string>();
  for (const [jobId, ids] of recordIdsByJobId) {
    if (ids.length === 1) {
      unambiguousRecordIdByJobId.set(jobId, ids[0]!);
    }
  }
  return unambiguousRecordIdByJobId;
}

function attemptBelongsToRecord(
  attempt: ApplicationAttempt,
  record: ApplicationRecord,
  unambiguousRecordIdByJobId: Map<string, string> | null,
) {
  // Exact lineage is authoritative when the attempt declares it.
  if (attempt.applicationRecordId !== null) {
    return attempt.applicationRecordId === record.id;
  }

  // Legacy attempts predate application records and can only attach when a
  // single scoped record owns the job; otherwise ownership stays ambiguous.
  return unambiguousRecordIdByJobId?.get(attempt.jobId) === record.id;
}

export function getLatestApplicationAttemptForRecord(
  record: ApplicationRecord,
  applicationAttempts: readonly ApplicationAttempt[],
  applicationRecords?: readonly ApplicationRecord[],
) {
  let latestAttempt: ApplicationAttempt | null = null;
  let latestUpdatedAt = Number.NEGATIVE_INFINITY;
  const unambiguousRecordIdByJobId = applicationRecords
    ? resolveUnambiguousApplicationRecordIdByJobId(applicationRecords)
    : null;

  for (const attempt of applicationAttempts) {
    if (!attemptBelongsToRecord(attempt, record, unambiguousRecordIdByJobId)) {
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
