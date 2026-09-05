import {
  DiscoveryRunRecordSchema,
  DiscoveryTimingSummarySchema,
  DISCOVERY_RUN_JOB_BUDGET_MAX,
  browserRunWaitReasonValues,
  discoveryActivityStageValues,
  type DiscoveryActivityEvent,
  type DiscoveryRunRecord,
  type DiscoveryTargetExecution,
} from "@unemployed/contracts";

import {
  appendDiscoveryEvent,
  countCompletedTargetExecutions,
  createDiscoveryEvent,
  updateTargetExecution,
} from "./discovery-state";
import {
  calculateDurationMs,
  computeTimelineSummary,
  serializeOrderedDurationEntries,
} from "./performance-timing";
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_TARGET_JOB_COUNT,
  SCALED_DISCOVERY_MAX_STEPS,
} from "./workspace-defaults";

function calculateFirstMilestoneMs(
  events: readonly DiscoveryActivityEvent[],
  startedAt: string,
  completedAt: string,
  predicate: (event: DiscoveryActivityEvent) => boolean,
): number | null {
  return computeTimelineSummary({
    startedAt,
    completedAt,
    events: events.filter(predicate).map((event) => ({
      timestamp: event.timestamp,
      key: "milestone" as const,
    })),
  }).firstEventMs;
}

function isCandidateMilestone(event: DiscoveryActivityEvent): boolean {
  return event.targetId !== null && (event.jobsFound ?? 0) > 0;
}

function isDistinctUsefulJobMilestone(event: DiscoveryActivityEvent): boolean {
  return (
    event.targetId !== null &&
    event.stage === "persistence" &&
    (event.jobsPersisted ?? 0) + (event.jobsStaged ?? 0) > 0
  );
}

function buildDiscoveryTimingSummary(
  events: readonly DiscoveryActivityEvent[],
  startedAt: string,
  completedAt: string,
) {
  const stageTimeline = computeTimelineSummary({
    startedAt,
    completedAt,
    events: events.map((event) => ({
      timestamp: event.timestamp,
      key: event.stage,
    })),
  });
  const waitReasonTimeline = computeTimelineSummary({
    startedAt,
    completedAt,
    events: events
      .filter(
        (
          event,
        ): event is DiscoveryActivityEvent & {
          waitReason: NonNullable<DiscoveryActivityEvent["waitReason"]>;
        } => event.waitReason !== null,
      )
      .map((event) => ({
        timestamp: event.timestamp,
        key: event.waitReason,
      })),
  });

  return DiscoveryTimingSummarySchema.parse({
    totalDurationMs: stageTimeline.totalDurationMs,
    firstActivityMs: stageTimeline.firstEventMs,
    firstCandidateMs: calculateFirstMilestoneMs(
      events,
      startedAt,
      completedAt,
      isCandidateMilestone,
    ),
    firstDistinctUsefulJobMs: calculateFirstMilestoneMs(
      events,
      startedAt,
      completedAt,
      isDistinctUsefulJobMilestone,
    ),
    longestGapMs: stageTimeline.longestGapMs,
    eventCount: events.length,
    stageDurations: serializeOrderedDurationEntries(
      stageTimeline.durationsMsByKey,
      discoveryActivityStageValues,
      (stage, durationMs) => ({
        stage,
        durationMs,
      }),
    ),
    waitReasonDurations: serializeOrderedDurationEntries(
      waitReasonTimeline.durationsMsByKey,
      browserRunWaitReasonValues,
      (waitReason, durationMs) => ({
        waitReason,
        durationMs,
      }),
    ),
  });
}

function summarizeTargetExecutions(
  targetExecutions: readonly DiscoveryTargetExecution[],
) {
  const changeDigest = targetExecutions.reduce(
    (total, execution) => ({
      new: total.new + execution.changeDigest.new,
      unchanged: total.unchanged + execution.changeDigest.unchanged,
      changed: total.changed + execution.changeDigest.changed,
      reactivated: total.reactivated + execution.changeDigest.reactivated,
      inactive: total.inactive + execution.changeDigest.inactive,
      known: total.known + execution.changeDigest.known,
      skipped: total.skipped + execution.changeDigest.skipped,
    }),
    {
      new: 0,
      unchanged: 0,
      changed: 0,
      reactivated: 0,
      inactive: 0,
      known: 0,
      skipped: 0,
    },
  );
  const sourceHealth = targetExecutions.map((execution) => {
    const health =
      execution.state === "completed"
        ? execution.warning
          ? "warning"
          : "healthy"
        : execution.state === "failed"
          ? "failed"
          : execution.state === "cancelled"
            ? "cancelled"
            : execution.state === "skipped"
              ? "skipped"
              : "pending";

    return {
      targetId: execution.targetId,
      health,
      durationMs: execution.timing?.totalDurationMs ?? 0,
      warnings: execution.warning ? [execution.warning] : [],
    };
  });
  const warnings = sourceHealth.flatMap((source) => source.warnings);

  return { changeDigest, sourceHealth, warnings };
}

export function completeTargetExecution(
  run: DiscoveryRunRecord,
  targetId: string,
  completedAt: string,
  patch: Partial<DiscoveryTargetExecution>,
): DiscoveryRunRecord {
  const nextRun = updateTargetExecution(run, targetId, (entry) => ({
    ...entry,
    ...patch,
    completedAt,
    timing:
      entry.startedAt === null
        ? null
        : buildDiscoveryTimingSummary(
            run.activity.filter((event) => event.targetId === entry.targetId),
            entry.startedAt,
            completedAt,
          ),
  }));

  const executionSummary = summarizeTargetExecutions(nextRun.targetExecutions);

  return DiscoveryRunRecordSchema.parse({
    ...nextRun,
    summary: {
      ...nextRun.summary,
      ...executionSummary,
      targetsCompleted: countCompletedTargetExecutions(nextRun),
    },
  });
}

export function finalizeRunningTargetExecutions(
  run: DiscoveryRunRecord,
  state: "cancelled" | "failed",
  completedAt: string,
): DiscoveryRunRecord {
  let nextRun = run;

  for (const targetExecution of run.targetExecutions) {
    if (targetExecution.state !== "running") {
      continue;
    }

    nextRun = completeTargetExecution(
      nextRun,
      targetExecution.targetId,
      completedAt,
      {
        state,
        warning:
          state === "cancelled"
            ? "Discovery was cancelled before this target finished."
            : targetExecution.warning,
      },
    );
  }

  return nextRun;
}

export function finalizeDiscoveryRun(
  run: DiscoveryRunRecord,
  state: "completed" | "cancelled" | "failed",
  completedAt: string,
): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    ...run,
    state,
    completedAt,
    summary: {
      ...run.summary,
      durationMs: calculateDurationMs(run.startedAt, completedAt),
      outcome: state,
      timing: buildDiscoveryTimingSummary(
        run.activity,
        run.startedAt,
        completedAt,
      ),
    },
  });
}

export function recoverInterruptedDiscoveryRun(
  run: DiscoveryRunRecord,
  completedAt: string,
): DiscoveryRunRecord {
  let recoveredRun = run;

  for (const targetExecution of run.targetExecutions) {
    if (targetExecution.state !== "running") {
      continue;
    }

    recoveredRun = completeTargetExecution(
      recoveredRun,
      targetExecution.targetId,
      completedAt,
      {
        state: "failed",
        warning:
          "Discovery was interrupted because the app closed before this source finished.",
      },
    );
  }

  recoveredRun = appendDiscoveryEvent(
    recoveredRun,
    createDiscoveryEvent({
      runId: recoveredRun.id,
      timestamp: completedAt,
      kind: "error",
      stage: "run",
      targetId: null,
      adapterKind: null,
      terminalState: "failed",
      message:
        "The previous discovery run was interrupted when the app closed. Jobs saved before the interruption remain available; start a new search to continue.",
      url: null,
      jobsFound: recoveredRun.summary.validJobsFound,
      jobsPersisted: recoveredRun.summary.jobsPersisted,
      jobsStaged: recoveredRun.summary.jobsStaged,
      duplicatesMerged: recoveredRun.summary.duplicatesMerged,
      invalidSkipped: recoveredRun.summary.invalidSkipped,
    }),
  );

  return finalizeDiscoveryRun(recoveredRun, "failed", completedAt);
}

/**
 * Resolves the per-target discovery budgets for a whole run up front.
 *
 * Allocation is positional over the stable, configuration-derived target
 * order: every non-final target takes the floor fair share of the remaining
 * total and the final target absorbs the exact non-negative remainder, so the
 * plan sums to exactly the configured budget whenever the budget can fund
 * every target. When the remaining budget cannot fund every remaining target,
 * scarce single-job shares are granted to the leading (highest-priority)
 * positions forward; trailing lowest-priority positions receive zero and are
 * skipped by the runner. Because the plan is fixed
 * before any network work, the per-target budgets are identical regardless of
 * readiness or completion order. Duplicate or empty target ids fail fast here,
 * before any discovery work starts; every unique id receives exactly one plan
 * entry. `resolveDiscoveryTargetBudget` supplies every per-position invariant
 * (caps, floors, step ceilings).
 */
export function resolveDiscoveryBudgetPlan(input: {
  targetIds: readonly string[];
  runJobBudget?: number | null;
}): ReadonlyMap<string, { targetJobCount: number; maxSteps: number }> {
  const plan = new Map<string, { targetJobCount: number; maxSteps: number }>();
  let plannedJobsFoundSoFar = 0;

  for (let index = 0; index < input.targetIds.length; index += 1) {
    const targetId = input.targetIds[index];
    if (!targetId) {
      throw new Error(
        `Discovery budget plan requires a non-empty target id at position ${index}.`,
      );
    }
    if (plan.has(targetId)) {
      throw new Error(
        `Duplicate discovery target id "${targetId}" at position ${index}; each enabled source must have a unique id.`,
      );
    }

    const budget = resolveDiscoveryTargetBudget({
      targetsRemaining: input.targetIds.length - index,
      validJobsFoundSoFar: plannedJobsFoundSoFar,
      ...(input.runJobBudget != null
        ? { runJobBudget: input.runJobBudget }
        : {}),
    });
    plan.set(targetId, budget);
    plannedJobsFoundSoFar += budget.targetJobCount;
  }

  return plan;
}

const MIN_DISCOVERY_TARGET_MAX_STEPS = 20;
const SINGLE_TARGET_DISCOVERY_JOB_COUNT = 50;
const SINGLE_TARGET_DISCOVERY_MAX_STEPS = 36;

/**
 * Resolves the per-target discovery budget for one position in a run.
 *
 * The total run budget is the explicit `runJobBudget` when configured
 * (campaign limit or discovery preference, schema-capped at
 * `DISCOVERY_RUN_JOB_BUDGET_MAX`), otherwise the interactive precision default
 * of `DEFAULT_TARGET_JOB_COUNT`. The budget is split deterministically across
 * the remaining targets: every non-final target takes the floor fair share of
 * the remaining total and the final target absorbs the exact remainder, so a
 * fully yielding run requests exactly the configured total. Shares are
 * non-negative integers; when the remaining budget cannot fund every
 * remaining target, one-job units are granted from the highest-priority
 * position forward and later positions receive zero, so scarce budgets land
 * on the leading sources instead of the trailing one. Explicit budgets also
 * raise the crawl step ceilings proportionally;
 * interactive runs keep the existing 36/60-step ceilings and the 50-job
 * single-target cap unchanged.
 */
export function resolveDiscoveryTargetBudget(input: {
  targetsRemaining: number;
  validJobsFoundSoFar: number;
  runJobBudget?: number | null;
}) {
  if (input.targetsRemaining <= 0) {
    throw new Error(
      "resolveDiscoveryTargetBudget requires at least one remaining target.",
    );
  }

  const rawRunJobBudget = input.runJobBudget;
  const scaled = typeof rawRunJobBudget === "number" && rawRunJobBudget > 0;
  const totalJobBudget = scaled
    ? Math.min(
        DISCOVERY_RUN_JOB_BUDGET_MAX,
        Math.max(1, Math.trunc(rawRunJobBudget)),
      )
    : DEFAULT_TARGET_JOB_COUNT;
  const remainingJobs = Math.max(0, totalJobBudget - input.validJobsFoundSoFar);
  const maxStepsCeiling = scaled
    ? SCALED_DISCOVERY_MAX_STEPS
    : DEFAULT_MAX_STEPS;

  if (input.targetsRemaining <= 1) {
    const targetJobCount = Math.min(
      scaled ? totalJobBudget : SINGLE_TARGET_DISCOVERY_JOB_COUNT,
      remainingJobs,
    );

    return {
      targetJobCount,
      maxSteps: Math.min(
        scaled ? SCALED_DISCOVERY_MAX_STEPS : SINGLE_TARGET_DISCOVERY_MAX_STEPS,
        Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 3),
      ),
    };
  }

  // Scarce-budget guard: when the remaining total cannot fund every remaining
  // target with at least one job each, grant one-job units from this
  // (highest-priority remaining) position forward instead of letting the
  // proportional/fair-share math below push the whole budget onto the
  // trailing lowest-priority target.
  if (remainingJobs < input.targetsRemaining) {
    const targetJobCount = Math.min(1, remainingJobs);

    return {
      targetJobCount,
      maxSteps: Math.min(
        maxStepsCeiling,
        Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 6),
      ),
    };
  }

  const targetJobCount = scaled
    ? Math.floor(remainingJobs / input.targetsRemaining)
    : Math.min(
        DEFAULT_TARGET_JOB_COUNT,
        Math.ceil(remainingJobs / Math.max(1, input.targetsRemaining)),
      );

  return {
    targetJobCount,
    maxSteps: Math.min(
      maxStepsCeiling,
      Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 6),
    ),
  };
}
