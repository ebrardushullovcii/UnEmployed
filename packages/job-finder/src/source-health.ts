import type {
  DiscoveryTargetExecutionState,
  SourceInstructionStatus,
} from "@unemployed/contracts";

/**
 * Canonical source-health interpretation shared by the Home dashboard
 * projection (`internal/campaign-dashboard.ts`) and the Profile Job sources
 * library. Keep this module dependency-free (types only) so the main process
 * and the renderer bundle classify sources identically.
 *
 * Health is reported for enabled sources only: disabled sources never inflate
 * active health counts. They stay visible through their own Enabled/Disabled
 * labels and guidance status lines instead.
 */

export type DiscoverySourceHealthFields = {
  id: string;
  enabled: boolean;
  instructionStatus: SourceInstructionStatus;
  lastVerifiedAt: string | null;
  staleReason: string | null;
};

/** Every concrete, truthful reason an enabled source needs attention. */
export type SourceAttentionReason =
  | "failing"
  | "never_verified"
  | "guidance_stale"
  | "guidance_unsupported"
  | "login_required";

export type SourceRuntimeSignals = {
  /** Targets with an in-flight execution in the active discovery run. */
  runningTargetIds?: ReadonlySet<string>;
  /** Targets with an open `prompt_login_required` access prompt. */
  loginRequiredTargetIds?: ReadonlySet<string>;
  /**
   * Targets whose latest discovery execution completed successfully. A
   * source that guidance verification never touched but that just returned
   * a completed run is proven working, so it is not "never verified".
   * Derive this with `deriveSucceededDiscoveryTargetIds`.
   */
  succeededTargetIds?: ReadonlySet<string>;
};

/** The minimal discovery-run shape needed to judge per-source success. */
export type DiscoveryRunHealthFields = {
  targetExecutions: readonly {
    targetId: string;
    state: DiscoveryTargetExecutionState;
    startedAt: string | null;
    completedAt: string | null;
  }[];
};

/**
 * Collect the targets whose most recent discovery execution across the given
 * runs finished in the `completed` state. Only the latest execution per
 * target counts, so a later failure or cancellation withdraws the proof. Pass
 * the active run first when one exists so its finished executions win over
 * older history.
 */
export function deriveSucceededDiscoveryTargetIds(
  runs: readonly DiscoveryRunHealthFields[],
): Set<string> {
  const latestByTarget = new Map<
    string,
    { at: string; state: DiscoveryTargetExecutionState }
  >();

  for (const run of runs) {
    for (const execution of run.targetExecutions) {
      if (execution.state === "planned" || execution.state === "running") {
        continue;
      }
      const at = execution.completedAt ?? execution.startedAt ?? "";
      const current = latestByTarget.get(execution.targetId);
      if (!current || at > current.at) {
        latestByTarget.set(execution.targetId, { at, state: execution.state });
      }
    }
  }

  const succeeded = new Set<string>();
  for (const [targetId, latest] of latestByTarget) {
    if (latest.state === "completed") {
      succeeded.add(targetId);
    }
  }
  return succeeded;
}

export type EnabledSourceHealthState =
  | "running"
  | "needs_attention"
  | "healthy";

export type EnabledSourceHealthCounts = {
  healthy: number;
  needsAttention: number;
  running: number;
  total: number;
};

export function listSourceAttentionReasons(
  target: DiscoverySourceHealthFields,
  signals: SourceRuntimeSignals = {},
): SourceAttentionReason[] {
  const reasons: SourceAttentionReason[] = [];

  if (target.staleReason) {
    reasons.push("failing");
  }
  // A completed discovery run is verification enough: the source returned
  // results, so it is no longer an unproven "never verified" entry even when
  // guidance verification never ran for it.
  if (!target.lastVerifiedAt && !signals.succeededTargetIds?.has(target.id)) {
    reasons.push("never_verified");
  }
  if (target.instructionStatus === "stale") {
    reasons.push("guidance_stale");
  }
  if (target.instructionStatus === "unsupported") {
    reasons.push("guidance_unsupported");
  }
  if (signals.loginRequiredTargetIds?.has(target.id)) {
    reasons.push("login_required");
  }

  return reasons;
}

/**
 * Classify an enabled source. Running wins over attention so an in-flight
 * execution is never double-reported as unhealthy.
 */
export function classifyEnabledSourceHealth(
  target: DiscoverySourceHealthFields,
  signals: SourceRuntimeSignals = {},
): EnabledSourceHealthState {
  if (target.enabled && signals.runningTargetIds?.has(target.id)) {
    return "running";
  }

  return listSourceAttentionReasons(target, signals).length > 0
    ? "needs_attention"
    : "healthy";
}

/** True only for enabled sources; disabled sources are never attention. */
export function isEnabledSourceNeedingAttention(
  target: DiscoverySourceHealthFields,
  signals: SourceRuntimeSignals = {},
): boolean {
  return (
    target.enabled &&
    classifyEnabledSourceHealth(target, signals) === "needs_attention"
  );
}

/**
 * Fold health counts across targets. Disabled sources are excluded, so
 * `total` is the honest denominator of enabled sources in the search plan.
 */
export function deriveEnabledSourceHealthCounts(
  targets: readonly DiscoverySourceHealthFields[],
  signals: SourceRuntimeSignals = {},
): EnabledSourceHealthCounts {
  const counts: EnabledSourceHealthCounts = {
    healthy: 0,
    needsAttention: 0,
    running: 0,
    total: 0,
  };

  for (const target of targets) {
    if (!target.enabled) {
      continue;
    }

    counts.total += 1;

    switch (classifyEnabledSourceHealth(target, signals)) {
      case "running":
        counts.running += 1;
        break;
      case "needs_attention":
        counts.needsAttention += 1;
        break;
      default:
        counts.healthy += 1;
        break;
    }
  }

  return counts;
}

/**
 * One classification with a plain-language reason so every surface (Home
 * dashboard, Profile job sources) can say the same thing about the same
 * source instead of showing a bare badge that contradicts another screen.
 */
export type EnabledSourceHealthDescription = {
  reason: string;
  reasons: readonly SourceAttentionReason[];
  state: EnabledSourceHealthState;
};

function describeAttentionReason(
  reason: SourceAttentionReason,
  target: DiscoverySourceHealthFields,
): string {
  switch (reason) {
    case "failing":
      return target.staleReason
        ? `The last check reported a problem: ${target.staleReason}`
        : "The last check reported a problem.";
    case "login_required":
      return "This source is waiting for you to sign in.";
    case "guidance_stale":
      return "Saved guidance for this source is out of date.";
    case "guidance_unsupported":
      return "Job Finder has no working guidance for this source yet.";
    default:
      return "No completed search has used this source yet.";
  }
}

export function describeEnabledSourceHealth(
  target: DiscoverySourceHealthFields,
  signals: SourceRuntimeSignals = {},
): EnabledSourceHealthDescription {
  if (target.enabled && signals.runningTargetIds?.has(target.id)) {
    return {
      reason: "A search is using this source right now.",
      reasons: [],
      state: "running",
    };
  }

  const reasons = listSourceAttentionReasons(target, signals);
  const firstReason = reasons[0];
  if (firstReason) {
    return {
      reason: describeAttentionReason(firstReason, target),
      reasons,
      state: "needs_attention",
    };
  }

  return {
    reason: signals.succeededTargetIds?.has(target.id)
      ? "The latest search used this source successfully."
      : "Checked and working.",
    reasons,
    state: "healthy",
  };
}

/** The workspace facts both surfaces need to classify sources identically. */
export type SourceHealthSignalInput = {
  activeRun?: DiscoveryRunHealthFields | null | undefined;
  recentRuns?: readonly DiscoveryRunHealthFields[] | undefined;
  sourceAccessPrompts?:
    | readonly { state: string; targetId: string }[]
    | undefined;
};

/**
 * Builds the exact signal set the dashboard uses. Home and Profile disagreed
 * because only one of them derived succeeded-run proof, so a source that had
 * just returned jobs still read as "never verified" on the other screen.
 * Both surfaces must build their signals here.
 */
export function deriveSourceHealthSignals(
  input: SourceHealthSignalInput,
): SourceRuntimeSignals {
  const activeRuns = input.activeRun ? [input.activeRun] : [];

  return {
    loginRequiredTargetIds: new Set(
      (input.sourceAccessPrompts ?? [])
        .filter((prompt) => prompt.state === "prompt_login_required")
        .map((prompt) => prompt.targetId),
    ),
    runningTargetIds: new Set(
      input.activeRun?.targetExecutions
        .filter((execution) => execution.state === "running")
        .map((execution) => execution.targetId) ?? [],
    ),
    // The active run is listed first so its already-finished executions win
    // over older history for the same target.
    succeededTargetIds: deriveSucceededDiscoveryTargetIds([
      ...activeRuns,
      ...(input.recentRuns ?? []),
    ]),
  };
}
