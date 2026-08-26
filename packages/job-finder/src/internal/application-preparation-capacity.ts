import type {
  ApplyJobResult,
  ApplyRun,
  JobFinderDashboardSummary,
} from "@unemployed/contracts";

export const MAX_EMPLOYER_APPLICATION_JOBS_PER_RUN = 10;
export const MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY = 20;

type DailyCapacity = NonNullable<
  JobFinderDashboardSummary["globalDailyApplicationPreparationCapacity"]
>;

export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function deriveGlobalDailyApplicationPreparationCapacity(input: {
  applyRuns: readonly ApplyRun[];
  applyJobResults: readonly ApplyJobResult[];
  now?: Date;
}): DailyCapacity {
  const now = input.now ?? new Date();
  const localDate = localDateKey(now);
  const localDayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const localDayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  const exactLineages = new Set<string>();
  const uncertainLegacyLineages = new Set<string>();
  for (const result of input.applyJobResults) {
    // A technical navigation failure never opened the employer page, so the
    // application never truly began and must not consume a begun slot.
    if (
      result.state === "failed" &&
      result.blockerReason === "application_page_unreachable"
    ) {
      continue;
    }
    const lineage = `${result.runId}\0${result.jobId}`;
    if (result.applicationPreparationStartedLocalDate === localDate) {
      exactLineages.add(lineage);
      continue;
    }
    if (
      result.applicationPreparationStartedAt !== undefined ||
      result.applicationPreparationStartedLocalDate !== undefined ||
      result.state === "planned"
    ) {
      continue;
    }
    const startedAt = Date.parse(result.startedAt);
    const updatedAt = Date.parse(result.updatedAt);
    if (startedAt < localDayEnd && updatedAt >= localDayStart) {
      uncertainLegacyLineages.add(lineage);
    }
  }
  for (const lineage of exactLineages) {
    uncertainLegacyLineages.delete(lineage);
  }
  const used = exactLineages.size;
  const legacyUncertain = uncertainLegacyLineages.size;
  const resetsAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).toISOString();

  return {
    limit: MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY,
    used,
    legacyUncertain,
    remaining: Math.max(
      0,
      MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY - used - legacyUncertain,
    ),
    localDate,
    resetsAt,
  };
}
