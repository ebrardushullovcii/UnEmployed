import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
  type ApplicationAttempt,
  type ApplicationAttemptInput,
  type ApplicationRecord,
  type ApplyJobResult,
  type ApplyRun,
} from "@unemployed/contracts";

// Result states that claim a live browser flow. A row in one of these states
// whose parent run was already terminalized by a prior partial recovery pass
// is an orphan: no process owns it and nothing else will ever advance it.
export function isInterruptedApplyJobState(
  state: ApplyJobResult["state"],
): boolean {
  return (
    state === "planned" ||
    state === "question_capture" ||
    state === "filling" ||
    state === "submitting"
  );
}

export function isRecoveryTerminalizedApplyRun(run: ApplyRun): boolean {
  return (
    run.state === "failed" && run.summary === INTERRUPTED_APPLY_RUN_SUMMARY
  );
}

export function groupApplyJobResultsByRunId(
  results: readonly ApplyJobResult[],
): Map<string, ApplyJobResult[]> {
  const resultsByRunId = new Map<string, ApplyJobResult[]>();
  for (const result of results) {
    const bucket = resultsByRunId.get(result.runId);
    if (bucket) {
      bucket.push(result);
    } else {
      resultsByRunId.set(result.runId, [result]);
    }
  }
  return resultsByRunId;
}

// Summary stamped onto runs terminalized by interruption recovery. It doubles
// as the deterministic provenance marker for the startup orphan sweep: only
// runs this recovery itself terminalized (or a prior partial pass terminalized
// before crashing) may have their stranded rows swept. User-cancelled and
// completed runs own their parked results and counters by design and stay
// untouched.
export const INTERRUPTED_APPLY_RUN_SUMMARY =
  "Automatic apply stopped because the app closed.";

export function recoverInterruptedApplyRun(
  run: ApplyRun,
  completedAt: string,
  // Results scoped to this run. They let the terminalized run recompute its
  // queue counters from truthful post-recovery result states instead of
  // retaining stale in-flight counts forever.
  runResults: readonly ApplyJobResult[] = [],
): ApplyRun {
  if (run.state !== "running") {
    return run;
  }

  return ApplyRunSchema.parse({
    ...run,
    state: "failed",
    updatedAt: completedAt,
    completedAt,
    summary: INTERRUPTED_APPLY_RUN_SUMMARY,
    detail:
      "The app closed before safe application preparation finished. No final submit action was taken, and any preparation saved before the interruption remains available for review.",
    ...deriveRecoveredApplyRunCounters(runResults, completedAt),
  });
}

/**
 * Recomputes queue counters on a run a prior partial recovery pass already
 * terminalized, without touching its state, copy, or completion timestamp.
 * Old recovery versions committed the failed run before its results could be
 * swept, so surviving damaged runs can retain stale running-time counters
 * forever; this restores counter truth while every other field stays exactly
 * as the prior pass wrote it. Returns null when the run does not qualify or
 * the counters are already truthful (steady-state no-op).
 */
export function refreshTerminalizedApplyRunCounters(
  run: ApplyRun,
  runResults: readonly ApplyJobResult[],
  completedAt: string,
): ApplyRun | null {
  if (
    run.state !== "failed" ||
    run.summary !== INTERRUPTED_APPLY_RUN_SUMMARY
  ) {
    return null;
  }

  const counters = deriveRecoveredApplyRunCounters(runResults, completedAt);
  if (
    run.pendingJobs === counters.pendingJobs &&
    run.submittedJobs === counters.submittedJobs &&
    run.skippedJobs === counters.skippedJobs &&
    run.blockedJobs === counters.blockedJobs &&
    run.failedJobs === counters.failedJobs
  ) {
    return null;
  }

  return ApplyRunSchema.parse({
    ...run,
    updatedAt: completedAt,
    ...counters,
  });
}

/**
 * Truthful queue counters for a terminalized interrupted run. Every result is
 * projected through the same recovery the rows themselves receive, so the
 * counters describe the run's durable end state exactly: interrupted
 * in-flight rows count as failed, preserved awaiting_review checkpoints stay
 * the only outstanding (user-owned) work, and total/submitted/skipped/
 * blocked/failed semantics are unchanged. Without this, a terminalized run
 * would keep its stale running-time `pendingJobs` forever and every derived
 * dashboard queue size (campaign progress `remainingQueueSize`) would stay
 * inflated long after the process died.
 */
export function deriveRecoveredApplyRunCounters(
  runResults: readonly ApplyJobResult[],
  completedAt: string,
): Pick<
  ApplyRun,
  "pendingJobs" | "submittedJobs" | "skippedJobs" | "blockedJobs" | "failedJobs"
> {
  let pendingJobs = 0;
  let submittedJobs = 0;
  let skippedJobs = 0;
  let blockedJobs = 0;
  let failedJobs = 0;
  for (const result of runResults) {
    const state =
      recoverInterruptedApplyJobResult(result, completedAt)?.state ??
      result.state;
    if (state === "awaiting_review") {
      pendingJobs += 1;
    } else if (state === "submitted") {
      submittedJobs += 1;
    } else if (state === "skipped") {
      skippedJobs += 1;
    } else if (state === "blocked") {
      blockedJobs += 1;
    } else if (state === "failed") {
      failedJobs += 1;
    }
  }
  return { pendingJobs, submittedJobs, skippedJobs, blockedJobs, failedJobs };
}

export function recoverInterruptedApplyJobResult(
  result: ApplyJobResult,
  completedAt: string,
): ApplyJobResult | null {
  // An interrupted planned result must never linger as phantom in-flight work
  // forever. The durable begun mark commits before the browser flow starts and
  // the next durable transition only lands after that flow reaches its review
  // checkpoint, so a crash or close in between durably leaves a begun row in
  // planned. Recovery therefore terminalizes every interrupted planned row;
  // rows whose preparation began keep their mark so the daily-capacity slot
  // they consumed still counts, while never-begun rows normalize to nulls.
  //
  // Absent marks count as never-begun: legacy rows predate these fields and
  // the migration intentionally leaves them out of the persisted document, so
  // only paired string values prove preparation began. Recovery rewrites
  // absent marks as explicit nulls so downstream begun-capacity accounting
  // never mistakes a terminalized orphan for uncertain legacy evidence.
  const hasPairedBegunPreparationMark =
    typeof result.applicationPreparationStartedAt === "string" &&
    typeof result.applicationPreparationStartedLocalDate === "string";
  // `awaiting_review` is a truthful user-owned checkpoint: the run may have
  // been interrupted, but this job finished preparation and is waiting for
  // human review, so it keeps its state. Terminal rows (submitted, skipped,
  // blocked, failed) already tell the truth and stay untouched. Everything
  // else (planned, question_capture, filling, submitting) is in-flight work
  // that no longer owns a running process and would otherwise linger as a
  // phantom "Filling"/"In progress"/"Submitting" claim after reopen.
  if (!isInterruptedApplyJobState(result.state)) {
    return null;
  }

  if (result.state !== "planned") {
    return ApplyJobResultSchema.parse({
      ...result,
      state: "failed",
      updatedAt: completedAt,
      completedAt,
      summary: "Application preparation stopped when the app closed.",
      detail:
        "The app closed while this job's application preparation was underway, so it never reached its review checkpoint. No final submit action occurred.",
    });
  }

  return ApplyJobResultSchema.parse({
    ...result,
    applicationPreparationStartedAt: hasPairedBegunPreparationMark
      ? result.applicationPreparationStartedAt
      : null,
    applicationPreparationStartedLocalDate: hasPairedBegunPreparationMark
      ? result.applicationPreparationStartedLocalDate
      : null,
    state: "failed",
    updatedAt: completedAt,
    completedAt,
    summary: hasPairedBegunPreparationMark
      ? "Application preparation stopped before review."
      : "Application preparation stopped before it began.",
    detail: hasPairedBegunPreparationMark
      ? "The app closed while this job's application preparation was underway, so it never reached its review checkpoint. No final submit action occurred."
      : "The app closed before this queued job's preparation began, so no browser action was taken for this job. No final submit action occurred.",
  });
}

const INTERRUPTED_ATTEMPT_SUMMARY = "Preparation stopped when the app closed.";
const INTERRUPTED_ATTEMPT_DETAIL =
  "The app closed while this application's preparation was underway. No final submit action occurred.";

export function recoverInterruptedApplyAttempt(
  attempt: ApplicationAttempt,
  completedAt: string,
): ApplicationAttempt | null {
  // Only an attempt that claims live execution can be stale after an
  // interrupted run. Paused attempts sit at truthful user-owned checkpoints
  // and are preserved exactly as recorded.
  if (attempt.state !== "in_progress") {
    return null;
  }

  return ApplicationAttemptSchema.parse({
    ...attempt,
    state: "failed",
    summary: INTERRUPTED_ATTEMPT_SUMMARY,
    detail: INTERRUPTED_ATTEMPT_DETAIL,
    updatedAt: completedAt,
    completedAt,
    nextActionLabel: "Retry preparation when you are ready.",
  });
}

export function recoverInterruptedApplicationRecord(input: {
  record: ApplicationRecord;
  completedAt: string;
  eventId: string;
}): ApplicationRecord | null {
  const { record } = input;
  if (record.lastAttemptState !== "in_progress") {
    return null;
  }

  return ApplicationRecordSchema.parse({
    ...record,
    lastActionLabel: INTERRUPTED_ATTEMPT_SUMMARY,
    nextActionLabel: "Retry preparation when you are ready.",
    lastUpdatedAt: input.completedAt,
    lastAttemptState: "failed",
    events: [
      ...record.events,
      {
        id: input.eventId,
        at: input.completedAt,
        title: "Preparation stopped because the app closed",
        detail:
          "The app closed before safe application preparation finished for this job. No final submit action occurred.",
        emphasis: "warning",
      },
    ],
  });
}

interface InterruptedProjectionRepository {
  listApplicationAttempts(options?: {
    jobId?: string;
    applicationRecordId?: string;
  }): Promise<readonly ApplicationAttempt[]>;
  upsertApplicationAttempt(
    applicationAttempt: ApplicationAttemptInput,
  ): Promise<void>;
  listApplicationRecords(): Promise<readonly ApplicationRecord[]>;
  upsertApplicationRecord(applicationRecord: ApplicationRecord): Promise<void>;
}

// Central interrupted-run projection for attempt and record surfaces. Only
// records reached through exact applicationRecordId lineage from a
// terminalized result are touched; legacy null-lineage rows stay fail-closed
// and are never attributed here. Paused rows at user-owned checkpoints and
// every already-terminal row are preserved exactly as persisted.
export async function recoverInterruptedExactLineageProjections(input: {
  repository: InterruptedProjectionRepository;
  interruptedRecordIds: ReadonlySet<string>;
  completedAt: string;
  eventIdFor: (applicationRecordId: string) => string;
}): Promise<void> {
  if (input.interruptedRecordIds.size === 0) {
    return;
  }

  const [attempts, records] = await Promise.all([
    input.repository.listApplicationAttempts(),
    input.repository.listApplicationRecords(),
  ]);

  await Promise.all([
    ...attempts
      .filter(
        (attempt) =>
          attempt.applicationRecordId !== null &&
          input.interruptedRecordIds.has(attempt.applicationRecordId),
      )
      .map((attempt) => {
        const recoveredAttempt = recoverInterruptedApplyAttempt(
          attempt,
          input.completedAt,
        );
        return recoveredAttempt
          ? input.repository.upsertApplicationAttempt(recoveredAttempt)
          : Promise.resolve();
      }),
    ...records.map((record) => {
      if (!input.interruptedRecordIds.has(record.id)) {
        return Promise.resolve();
      }
      const recoveredRecord = recoverInterruptedApplicationRecord({
        record,
        completedAt: input.completedAt,
        eventId: input.eventIdFor(record.id),
      });
      return recoveredRecord
        ? input.repository.upsertApplicationRecord(recoveredRecord)
        : Promise.resolve();
    }),
  ]);
}
