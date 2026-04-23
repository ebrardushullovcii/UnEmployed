import {
  DiscoveryRunRecordSchema,
  DiscoveryTimingSummarySchema,
  browserRunWaitReasonValues,
  discoveryActivityStageValues,
  type DiscoveryActivityEvent,
  type DiscoveryRunRecord,
  type DiscoveryTargetExecution,
} from "@unemployed/contracts";

import {
  countCompletedTargetExecutions,
  updateTargetExecution,
} from "./discovery-state";
import {
  calculateDurationMs,
  computeTimelineSummary,
  serializeOrderedDurationEntries,
} from "./performance-timing";
import { DEFAULT_MAX_STEPS, DEFAULT_TARGET_JOB_COUNT } from "./workspace-defaults";

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

  return DiscoveryRunRecordSchema.parse({
    ...nextRun,
    summary: {
      ...nextRun.summary,
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

    nextRun = completeTargetExecution(nextRun, targetExecution.targetId, completedAt, {
      state,
      warning:
        state === "cancelled"
          ? "Discovery was cancelled before this target finished."
          : targetExecution.warning,
    });
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
      timing: buildDiscoveryTimingSummary(run.activity, run.startedAt, completedAt),
    },
  });
}

const MIN_DISCOVERY_TARGET_MAX_STEPS = 20;
const SINGLE_TARGET_DISCOVERY_JOB_COUNT = 8;
const SINGLE_TARGET_DISCOVERY_MAX_STEPS = 24;

export function resolveDiscoveryTargetBudget(input: {
  targetsRemaining: number;
  validJobsFoundSoFar: number;
}) {
  if (input.targetsRemaining <= 1) {
    const remainingJobs = Math.max(
      1,
      DEFAULT_TARGET_JOB_COUNT - input.validJobsFoundSoFar,
    );
    const targetJobCount = Math.min(
      SINGLE_TARGET_DISCOVERY_JOB_COUNT,
      remainingJobs,
    );

    return {
      targetJobCount,
      maxSteps: Math.min(
        SINGLE_TARGET_DISCOVERY_MAX_STEPS,
        Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 3),
      ),
    };
  }

  const remainingJobs = Math.max(
    1,
    DEFAULT_TARGET_JOB_COUNT - input.validJobsFoundSoFar,
  );
  const targetJobCount = Math.min(
    DEFAULT_TARGET_JOB_COUNT,
    Math.ceil(remainingJobs / Math.max(1, input.targetsRemaining)),
  );

  return {
    targetJobCount,
    maxSteps: Math.min(
      DEFAULT_MAX_STEPS,
      Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 6),
    ),
  };
}
