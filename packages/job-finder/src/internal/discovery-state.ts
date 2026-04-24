import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  DiscoveryActivityEventSchema,
  DiscoveryRunRecordSchema,
  DiscoveryTargetExecutionSchema,
  JobFinderDiscoveryStateSchema,
  type AgentDiscoveryProgress,
  type DiscoveryActivityEvent,
  type BrowserRunWaitReason,
  type DiscoveryRunRecord,
  type DiscoveryTargetExecution,
  type JobFinderDiscoveryState,
  type JobSearchPreferences,
} from "@unemployed/contracts";

const DEFAULT_DISCOVERY_HISTORY_LIMIT = 5;

export function toDiscoverySessionState(
  session: Awaited<ReturnType<BrowserSessionRuntime["getSessionState"]>>,
) {
  return {
    adapterKind: session.source,
    status: session.status,
    driver: session.driver,
    label: session.label,
    detail: session.detail,
    lastCheckedAt: session.lastCheckedAt,
  };
}

export function formatFoundSuffix(jobsFound: number): string {
  return jobsFound > 0 ? ` (${jobsFound} found so far)` : "";
}

export function summarizeProgressAction(
  progress: Pick<AgentDiscoveryProgress, "currentAction" | "message" | "waitReason">,
  siteLabel: string,
  jobsFound: number,
): {
  message: string;
  stage: DiscoveryActivityEvent["stage"];
  waitReason: BrowserRunWaitReason | null;
} {
  const message = progress.message?.trim();
  const waitReason = inferWaitReason(progress);
  const normalizedAction = (progress.currentAction ?? "").toLowerCase();

  if (message) {
    return {
      message,
      stage: mapWaitReasonToStage(waitReason),
      waitReason,
    };
  }

  if (!normalizedAction || normalizedAction === "thinking...") {
    return {
      message: `Reviewing the next step${formatFoundSuffix(jobsFound)}`,
      stage: "planning",
      waitReason,
    };
  }

  if (normalizedAction.startsWith("extract_result:")) {
    const [
      ,
      addedRaw = "0",
      totalRaw = String(jobsFound),
      attemptedRaw = totalRaw,
    ] = normalizedAction.split(":");
    const addedCount = Number.parseInt(addedRaw, 10);
    const totalCount = Number.parseInt(totalRaw, 10);
    const attemptedCount = Number.parseInt(attemptedRaw, 10);

    if (
      Number.isFinite(addedCount) &&
      Number.isFinite(totalCount) &&
      addedCount > 0
    ) {
      return {
        message: `Found ${addedCount} new job${addedCount === 1 ? "" : "s"} on this pass (${totalCount} total so far)`,
        stage: "extraction",
        waitReason,
      };
    }

    if (Number.isFinite(attemptedCount) && Number.isFinite(totalCount)) {
      return {
        message: `No new jobs were kept from this pass (${attemptedCount} reviewed, ${totalCount} total so far)`,
        stage: "extraction",
        waitReason,
      };
    }
  }

  if (normalizedAction.includes("navigate")) {
    return {
      message: `Opening ${siteLabel}${formatFoundSuffix(jobsFound)}`,
      stage: "navigation",
      waitReason,
    };
  }

  if (normalizedAction.includes("extract_jobs")) {
    return {
      message: `Gathering jobs from the current page${formatFoundSuffix(jobsFound)}`,
      stage: "extraction",
      waitReason,
    };
  }

  if (normalizedAction.includes("scroll_down")) {
    return {
      message: `Loading more results${formatFoundSuffix(jobsFound)}`,
      stage: "navigation",
      waitReason,
    };
  }

  if (normalizedAction.includes("go_back")) {
    return {
      message: `Returning to the previous results page${formatFoundSuffix(jobsFound)}`,
      stage: "navigation",
      waitReason,
    };
  }

  if (normalizedAction.includes("fill")) {
    return {
      message: `Refining the search controls${formatFoundSuffix(jobsFound)}`,
      stage: "navigation",
      waitReason,
    };
  }

  if (normalizedAction.includes("click")) {
    return {
      message: `Opening a job detail or result card${formatFoundSuffix(jobsFound)}`,
      stage: "navigation",
      waitReason,
    };
  }

  return {
    message: `Continuing discovery on the current page${formatFoundSuffix(jobsFound)}`,
    stage: "navigation",
    waitReason,
  };
}

function inferWaitReason(
  progress: Pick<AgentDiscoveryProgress, "currentAction" | "waitReason">,
): BrowserRunWaitReason | null {
  if (progress.waitReason) {
    return progress.waitReason;
  }

  const normalizedAction = (progress.currentAction ?? "").toLowerCase();

  if (!normalizedAction || normalizedAction === "thinking...") {
    return "waiting_on_ai";
  }

  if (normalizedAction.includes("retrying_ai")) {
    return "retrying_ai";
  }

  if (
    normalizedAction.startsWith("retry:") ||
    normalizedAction.includes("retrying_tool")
  ) {
    return "retrying_tool";
  }

  if (
    normalizedAction.includes("extract_result") ||
    normalizedAction.includes("extract_jobs")
  ) {
    return "extracting_jobs";
  }

  if (
    normalizedAction.includes("navigate") ||
    normalizedAction.includes("scroll_down") ||
    normalizedAction.includes("go_back") ||
    normalizedAction.includes("click") ||
    normalizedAction.includes("fill")
  ) {
    return "executing_tool";
  }

  return null;
}

function mapWaitReasonToStage(
  waitReason: BrowserRunWaitReason | null,
): DiscoveryActivityEvent["stage"] {
  switch (waitReason) {
    case "waiting_on_ai":
    case "retrying_ai":
      return "planning";
    case "extracting_jobs":
      return "extraction";
    case "merging_results":
      return "scoring";
    case "persisting_results":
    case "finalizing":
    case "manual_prerequisite":
      return "persistence";
    case "starting_browser":
    case "attaching_browser":
    case "waiting_on_page":
    case "executing_tool":
    case "retrying_tool":
    case null:
      return "navigation";
    default:
      return "navigation";
  }
}

export function createDiscoveryEvent(
  input: Omit<
    DiscoveryActivityEvent,
    | "id"
    | "resolvedAdapterKind"
    | "terminalState"
    | "waitReason"
    | "collectionMethod"
    | "sourceIntelligenceProvider"
  > &
    Pick<
      Partial<DiscoveryActivityEvent>,
      | "resolvedAdapterKind"
      | "terminalState"
      | "waitReason"
      | "collectionMethod"
      | "sourceIntelligenceProvider"
    >,
): DiscoveryActivityEvent {
  return DiscoveryActivityEventSchema.parse({
    ...input,
    id: `${input.runId}_${input.stage}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  });
}

export function appendDiscoveryEvent(
  run: DiscoveryRunRecord,
  event: DiscoveryActivityEvent,
): DiscoveryRunRecord {
  const previousEvent = run.activity[run.activity.length - 1];

  if (
    previousEvent &&
    previousEvent.message === event.message &&
    previousEvent.stage === event.stage &&
    previousEvent.waitReason === event.waitReason &&
    previousEvent.targetId === event.targetId &&
    previousEvent.url === event.url
  ) {
    return run;
  }

  return DiscoveryRunRecordSchema.parse({
    ...run,
    activity: [...run.activity, event],
  });
}

export function updateTargetExecution(
  run: DiscoveryRunRecord,
  targetId: string,
  updater: (target: DiscoveryTargetExecution) => DiscoveryTargetExecution,
): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    ...run,
    targetExecutions: run.targetExecutions.map((target) =>
      target.targetId === targetId
        ? DiscoveryTargetExecutionSchema.parse(updater(target))
        : target,
    ),
  });
}

export function countCompletedTargetExecutions(run: DiscoveryRunRecord): number {
  return run.targetExecutions.filter(
    (execution) =>
      execution.state !== "planned" && execution.state !== "running",
  ).length;
}

export function finalizeDiscoveryState(
  current: JobFinderDiscoveryState,
  run: DiscoveryRunRecord,
  searchPreferences: JobSearchPreferences,
): JobFinderDiscoveryState {
  const historyLimit =
    searchPreferences.discovery.historyLimit || DEFAULT_DISCOVERY_HISTORY_LIMIT;

  return JobFinderDiscoveryStateSchema.parse({
    ...current,
    runState: run.state,
    activeRun: run.state === "running" ? run : null,
    recentRuns: [
      run,
      ...current.recentRuns.filter((entry) => entry.id !== run.id),
    ].slice(0, historyLimit),
  });
}
