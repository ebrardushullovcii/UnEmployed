import type { SourceInstructionStatus } from "@unemployed/contracts";

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
};

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
  if (!target.lastVerifiedAt) {
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
