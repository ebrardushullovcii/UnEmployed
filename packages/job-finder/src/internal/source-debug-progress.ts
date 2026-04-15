import {
  SourceDebugProgressEventSchema,
  type AgentDiscoveryProgress,
  type SourceDebugPhase,
  type SourceDebugProgressEvent,
} from "@unemployed/contracts";

import { formatStatusLabel } from "./source-instructions";

function normalizeProgressUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export function buildSourceDebugProgressEmitter(input: {
  runId: string;
  targetId: string;
  onProgress?: (event: SourceDebugProgressEvent) => void;
}) {
  const startedAtMs = Date.now();
  let lastActivityAt = new Date().toISOString();

  return (eventInput: {
    phase?: SourceDebugPhase | null;
    waitReason: SourceDebugProgressEvent["waitReason"];
    message: string;
    currentUrl?: string | null;
    stepCount?: number;
    jobsFound?: number;
  }) => {
    lastActivityAt = new Date().toISOString();
    const event = SourceDebugProgressEventSchema.parse({
      runId: input.runId,
      targetId: input.targetId,
      phase: eventInput.phase ?? null,
      waitReason: eventInput.waitReason,
      timestamp: lastActivityAt,
      elapsedMs: Date.now() - startedAtMs,
      lastActivityAt,
      message: eventInput.message,
      currentUrl: normalizeProgressUrl(eventInput.currentUrl),
      stepCount: eventInput.stepCount ?? 0,
      jobsFound: eventInput.jobsFound ?? 0,
    });

    input.onProgress?.(event);
    return event;
  };
}

function inferProgressWaitReason(
  progress: Pick<AgentDiscoveryProgress, "currentAction" | "waitReason">,
): SourceDebugProgressEvent["waitReason"] {
  if (progress.waitReason) {
    return progress.waitReason;
  }

  const normalizedAction = (progress.currentAction ?? "").toLowerCase();

  if (!normalizedAction || normalizedAction === "thinking...") {
    return "waiting_on_ai";
  }

  if (normalizedAction === "thinking" || normalizedAction.includes("retrying_ai")) {
    return normalizedAction.includes("retrying_ai")
      ? "retrying_ai"
      : "waiting_on_ai";
  }

  if (
    normalizedAction.startsWith("retry:") ||
    normalizedAction.includes("retrying_tool")
  ) {
    return "retrying_tool";
  }

  if (
    normalizedAction.startsWith("extract_result:") ||
    normalizedAction.includes("extract_jobs")
  ) {
    return "extracting_jobs";
  }

  return "executing_tool";
}

function buildFallbackProgressMessage(
  waitReason: SourceDebugProgressEvent["waitReason"],
  phaseLabel: string,
  jobsFound: number,
  stepCount: number,
): string {
  switch (waitReason) {
    case "waiting_on_ai":
      return `${phaseLabel}: planning the next browser action (step ${stepCount}).`;
    case "retrying_ai":
      return `${phaseLabel}: retrying AI planning after a temporary model error.`;
    case "waiting_on_page":
      return `${phaseLabel}: waiting for the page to settle before continuing.`;
    case "executing_tool":
      return `${phaseLabel}: executing the next browser action.`;
    case "retrying_tool":
      return `${phaseLabel}: retrying the last browser action after a temporary page error.`;
    case "extracting_jobs":
      return `${phaseLabel}: extracting jobs from the current page (${jobsFound} found so far).`;
    case "persisting_results":
      return `${phaseLabel}: saving the findings from this phase.`;
    case "manual_prerequisite":
      return `${phaseLabel}: waiting on a manual browser prerequisite.`;
    case "finalizing":
      return "Finalizing the source-debug run.";
    case "starting_browser":
      return "Starting or attaching the browser profile for source debug.";
    case "attaching_browser":
      return "Preparing the browser tab for the next phase.";
    case "merging_results":
      return `${phaseLabel}: organizing the collected findings.`;
    default:
      return `${phaseLabel}: continuing source debug.`;
  }
}

export function summarizeAgentProgressForSourceDebug(
  progress: AgentDiscoveryProgress,
  phase: SourceDebugPhase,
): {
  waitReason: SourceDebugProgressEvent["waitReason"];
  message: string;
} {
  const phaseLabel = formatStatusLabel(phase);
  const waitReason = inferProgressWaitReason(progress);
  const message =
    progress.message?.trim() ||
    buildFallbackProgressMessage(
      waitReason,
      phaseLabel,
      progress.jobsFound,
      progress.stepCount,
    );

  return {
    waitReason,
    message:
      message.toLowerCase().startsWith(phaseLabel.toLowerCase()) ||
      waitReason === "starting_browser" ||
      waitReason === "attaching_browser" ||
      waitReason === "finalizing"
        ? message
        : `${phaseLabel}: ${message}`,
  };
}
