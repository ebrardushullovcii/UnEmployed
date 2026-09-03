import type { DiscoveryRunRecord } from "@unemployed/contracts";

export type DiscoveryRunFeedbackStatus =
  | "started"
  | "succeeded"
  | "cancelled"
  | "failed";

/**
 * Terminal truth about the most recent discovery attempt, derived from run
 * history so empty results never claim a verdict the newest run cannot back.
 * `interrupted` covers failed and cancelled runs plus completed runs whose
 * source executions failed without producing any results; `hasEarlierCompleted`
 * keeps the partial-completed distinction so copy can acknowledge that an older
 * completed search exists behind the newer stopped one.
 */
export type DiscoveryLatestRunVerdict =
  | { kind: "none" }
  | { kind: "running" }
  | { kind: "completed" }
  | {
      hasEarlierCompleted: boolean;
      /**
       * Why the newest attempt cannot back a "no matches" claim:
       * `cancelled`/`failed` mean the run itself stopped early;
       * `sources_failed` means the run finished but at least one enabled
       * source execution failed and the whole run still returned zero results.
       */
      interruptState: "cancelled" | "failed" | "sources_failed";
      kind: "interrupted";
    };

/**
 * Run history evidence for verdict resolution. `summary` stays optional so
 * minimal `{ state, startedAt }` rows keep working; absent summary evidence can
 * only preserve (never weaken) a completed verdict.
 */
export type DiscoveryRunVerdictInput = Pick<
  DiscoveryRunRecord,
  "state" | "startedAt"
> & {
  summary?: Pick<
    DiscoveryRunRecord["summary"],
    "validJobsFound" | "sourceHealth"
  > & {
    duplicatesMerged?: number;
  };
};

function hasFailedSourceExecution(run: DiscoveryRunVerdictInput): boolean {
  return (
    run.summary?.sourceHealth.some((source) => source.health === "failed") ??
    false
  );
}

function hasZeroValidResults(run: DiscoveryRunVerdictInput): boolean {
  // Only an explicit zero count is proof the run produced nothing; an absent
  // count keeps the conservative completed verdict.
  return run.summary?.validJobsFound === 0;
}

/**
 * Resolves the newest settled run by `startedAt` — never by array order — and
 * classifies it. Runs sharing an identical start time keep their first-listed
 * position as the authority (stable sort), and `idle` placeholder rows are
 * ignored entirely.
 */
export function getDiscoveryLatestRunVerdict(
  runs: readonly DiscoveryRunVerdictInput[],
): DiscoveryLatestRunVerdict {
  // `idle` rows are placeholders, not attempts; every other state is a
  // settled or live verdict candidate.
  const settledRuns = runs.filter(
    (
      run,
    ): run is DiscoveryRunVerdictInput & {
      state: Exclude<DiscoveryRunRecord["state"], "idle">;
    } => run.state !== "idle",
  );
  const orderedRuns = [...settledRuns].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
  );
  const newestRun = orderedRuns[0];
  if (!newestRun) {
    return { kind: "none" };
  }

  const newestStartedMs = Date.parse(newestRun.startedAt);
  const hasEarlierCompleted = settledRuns.some(
    (run) =>
      run.state === "completed" && Date.parse(run.startedAt) < newestStartedMs,
  );

  if (newestRun.state === "running") {
    return { kind: "running" };
  }
  if (newestRun.state === "completed") {
    // A finished run still cannot claim "no matches" when a source execution
    // failed and the whole run produced zero results; results or fully
    // successful executions keep the completed verdict. Zero new additions
    // with duplicate merges are a completed repeat search — not an interrupt.
    const duplicatesMerged = newestRun.summary?.duplicatesMerged ?? 0;
    if (
      hasFailedSourceExecution(newestRun) &&
      hasZeroValidResults(newestRun) &&
      duplicatesMerged === 0
    ) {
      return {
        hasEarlierCompleted,
        interruptState: "sources_failed",
        kind: "interrupted",
      };
    }
    return { kind: "completed" };
  }

  return {
    hasEarlierCompleted,
    interruptState: newestRun.state,
    kind: "interrupted",
  };
}

export type DiscoveryRunRecoveryKind =
  | "browser_session"
  | "source_setup"
  | "connection"
  | "retry";

export interface DiscoveryRunRecovery {
  kind: DiscoveryRunRecoveryKind;
  headline: string;
  actionLabel: string | null;
  nextStep: string;
}

export interface DiscoveryRunFeedback {
  status: DiscoveryRunFeedbackStatus;
  /** Classified service detail kept verbatim so failures stay truthful. */
  detail: string | null;
  headline: string;
  recovery: DiscoveryRunRecovery | null;
  targetLabel: string | null;
}

const BROWSER_RUNTIME_FAILURE_RE =
  /\bbrowser\b|\bchrome\b|\bchromium\b|browser profile|dedicated browser|agent runtime|launch/i;
const SOURCE_SETUP_FAILURE_RE =
  /single_target|not found or unavailable|missing, disabled|no runnable|no enabled|enable at least one|add at least one|add or enable/i;
const CONNECTION_FAILURE_RE =
  /fetch failed|network|offline|\bdns\b|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timed?\s?out|unreachable|socket|provider (is )?(unavailable|unreachable)/i;
const AI_TOOL_CALLING_FAILURE_RE =
  /does not support tool calling|chatWithTools|tool calling|Cannot run agent discovery/i;

/**
 * Maps a classified discovery failure to the exact corrective action using
 * source-generic wording only. The service message itself stays verbatim in
 * `detail`; this mapping never invents a different failure cause.
 */
export function getDiscoveryRunFailureRecovery(
  detail: string,
): DiscoveryRunRecovery {
  if (SOURCE_SETUP_FAILURE_RE.test(detail)) {
    return {
      kind: "source_setup",
      headline: "No searchable source was ready for this run.",
      actionLabel: "Review job sources",
      nextStep: "Enable a valid public job-source URL, then search again.",
    };
  }

  if (BROWSER_RUNTIME_FAILURE_RE.test(detail)) {
    return {
      kind: "browser_session",
      headline: "The dedicated browser could not start or stay reachable.",
      actionLabel: "Open browser",
      nextStep:
        "Open the dedicated browser, sign in if the source asks, then search again.",
    };
  }

  if (CONNECTION_FAILURE_RE.test(detail)) {
    return {
      kind: "connection",
      headline: "A public provider or network request did not respond.",
      actionLabel: null,
      nextStep:
        "Check your internet connection, then search again. Nothing was submitted anywhere.",
    };
  }

  if (AI_TOOL_CALLING_FAILURE_RE.test(detail)) {
    return {
      kind: "retry",
      headline: "This search needs an AI provider that can use tools.",
      actionLabel: null,
      nextStep:
        "Use a tool-capable provider (or enable live AI in test mode), then search again from the same button.",
    };
  }

  return {
    kind: "retry",
    // Keep this distinct from interrupted feedback.headline so the callout
    // never prints the same "stopped before it could finish" line twice.
    headline: "Something unexpected stopped this search.",
    actionLabel: null,
    nextStep: "Wait a moment, then search again from the same button.",
  };
}

export function createDiscoveryRunStartedFeedback(
  targetLabel: string | null = null,
): DiscoveryRunFeedback {
  return {
    status: "started",
    detail: null,
    headline: targetLabel
      ? `Checking ${targetLabel}. Progress appears here and in Search history.`
      : "Search started. Results appear here as each enabled source finishes.",
    recovery: null,
    targetLabel,
  };
}

export function createDiscoveryRunSucceededFeedback(
  targetLabel: string | null = null,
): DiscoveryRunFeedback {
  return {
    status: "succeeded",
    detail: null,
    headline: targetLabel
      ? `Search finished for ${targetLabel} and results were saved on this device.`
      : "Search finished and results were saved on this device.",
    recovery: null,
    targetLabel,
  };
}

/**
 * Success feedback when a run completed but every reviewed listing merged
 * into jobs already on this device. Keeps the visible results list truthful:
 * zero new additions does not mean the search failed.
 */
export function shouldPresentRepeatedDiscoveryFeedback(input: {
  duplicatesMerged: number;
  validJobsFound: number;
}): boolean {
  return input.duplicatesMerged > 0 && input.validJobsFound === 0;
}

export function createDiscoveryRunRepeatedFeedback(input: {
  duplicatesMerged: number;
  targetLabel?: string | null;
}): DiscoveryRunFeedback {
  const targetLabel = input.targetLabel ?? null;
  const duplicateLabel =
    input.duplicatesMerged === 1
      ? "1 listing was already saved"
      : `${input.duplicatesMerged} listings were already saved`;

  return {
    status: "succeeded",
    detail: null,
    headline: targetLabel
      ? `Search finished for ${targetLabel}. ${duplicateLabel}; your existing results are unchanged.`
      : `Search finished. ${duplicateLabel}; your existing results are unchanged.`,
    recovery: null,
    targetLabel,
  };
}

/**
 * Terminal feedback for a run the user (or the runtime) deliberately stopped.
 * Never carries failure recovery — nothing went wrong that a corrective
 * action could fix — and never claims unconditional success: when the run had
 * already committed jobs, the copy says exactly what was kept; otherwise it
 * matches the interrupted verdict wording so an empty cancellation cannot
 * imply results exist.
 */
export function createDiscoveryRunCancelledFeedback(input: {
  savedJobCount: number | null;
  targetLabel?: string | null;
}): DiscoveryRunFeedback {
  const targetLabel = input.targetLabel ?? null;

  if ((input.savedJobCount ?? 0) > 0) {
    return {
      status: "cancelled",
      detail: null,
      headline: targetLabel
        ? `Search stopped for ${targetLabel}. Jobs found so far were kept on this device.`
        : "Search stopped. Jobs found so far were kept on this device.",
      recovery: null,
      targetLabel,
    };
  }

  return {
    status: "cancelled",
    detail: null,
    headline: targetLabel
      ? `The search for ${targetLabel} stopped before it could finish.`
      : "The search stopped before it could finish.",
    recovery: null,
    targetLabel,
  };
}

/**
 * Minimal run-history evidence for cancelled-run classification. Like
 * `DiscoveryRunVerdictInput`, rows only need the fields this decision reads,
 * so lightweight history entries keep working.
 */
export type DiscoveryCancelledSavedJobCountInput = readonly {
  state: DiscoveryRunRecord["state"];
  summary: Pick<DiscoveryRunRecord["summary"], "validJobsFound">;
}[];

/**
 * Truthful "what survived the cancel" evidence from the post-run workspace:
 * the newest discovery run record only counts when it is itself the
 * cancelled run, so a stale or superseded history entry can never fabricate
 * kept-jobs copy.
 */
export function getDiscoveryCancelledSavedJobCount(
  recentDiscoveryRuns: DiscoveryCancelledSavedJobCountInput,
): number | null {
  const newestRun = recentDiscoveryRuns[0];
  return newestRun?.state === "cancelled"
    ? newestRun.summary.validJobsFound
    : null;
}

export function createDiscoveryRunInterruptedFeedback(input: {
  detail: string | null;
  targetLabel?: string | null;
}): DiscoveryRunFeedback {
  const detail = input.detail?.trim() || null;

  return {
    status: "failed",
    detail,
    headline: input.targetLabel
      ? `The search for ${input.targetLabel} stopped before it could finish.`
      : "The search stopped before it could finish.",
    recovery: detail ? getDiscoveryRunFailureRecovery(detail) : null,
    targetLabel: input.targetLabel ?? null,
  };
}

export function createDiscoveryRunRefreshIncompleteFeedback(
  targetLabel: string | null = null,
): DiscoveryRunFeedback {
  return {
    status: "succeeded",
    detail: null,
    headline: targetLabel
      ? `Search finished for ${targetLabel}, but this view could not refresh automatically.`
      : "Search finished, but this view could not refresh automatically.",
    recovery: null,
    targetLabel,
  };
}

export function createDiscoveryRunFailedFeedback(input: {
  detail: string | null;
  targetLabel?: string | null;
}): DiscoveryRunFeedback {
  const detail = input.detail?.trim() || null;

  return {
    status: "failed",
    detail,
    headline: input.targetLabel
      ? `Search could not start for ${input.targetLabel}.`
      : "Search could not start.",
    recovery: detail ? getDiscoveryRunFailureRecovery(detail) : null,
    targetLabel: input.targetLabel ?? null,
  };
}
