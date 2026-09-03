import { describe, expect, test } from "vitest";

import {
  classifyEnabledSourceHealth,
  deriveEnabledSourceHealthCounts,
  deriveSourceHealthSignals,
  deriveSucceededDiscoveryTargetIds,
  describeEnabledSourceHealth,
  isEnabledSourceNeedingAttention,
  listSourceAttentionReasons,
  type DiscoveryRunHealthFields,
  type DiscoverySourceHealthFields,
  type SourceRuntimeSignals,
} from "./source-health";
import type {
  DiscoveryTargetExecutionState,
  SourceInstructionStatus,
} from "@unemployed/contracts";

function run(
  executions: readonly {
    targetId: string;
    state: DiscoveryTargetExecutionState;
    completedAt?: string | null;
    startedAt?: string | null;
  }[],
): DiscoveryRunHealthFields {
  return {
    targetExecutions: executions.map((execution) => ({
      targetId: execution.targetId,
      state: execution.state,
      startedAt: execution.startedAt ?? null,
      completedAt: execution.completedAt ?? null,
    })),
  };
}

const VERIFIED_AT = "2026-08-20T09:00:00.000Z";

function source(
  overrides: Partial<DiscoverySourceHealthFields> & {
    id?: string;
  } = {},
): DiscoverySourceHealthFields {
  return {
    id: overrides.id ?? "target_001",
    enabled: true,
    instructionStatus: "missing" as SourceInstructionStatus,
    lastVerifiedAt: null,
    staleReason: null,
    ...overrides,
  };
}

function signals(
  overrides: Partial<{
    running: readonly string[];
    loginRequired: readonly string[];
  }> = {},
): SourceRuntimeSignals {
  return {
    runningTargetIds: new Set(overrides.running ?? []),
    loginRequiredTargetIds: new Set(overrides.loginRequired ?? []),
  };
}

describe("source health classification", () => {
  test("a healthy verified source needs no attention", () => {
    const target = source({
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
    });

    expect(listSourceAttentionReasons(target)).toEqual([]);
    expect(classifyEnabledSourceHealth(target)).toBe("healthy");
    expect(isEnabledSourceNeedingAttention(target)).toBe(false);
  });

  test("an enabled never-run source needs attention", () => {
    const target = source();

    expect(listSourceAttentionReasons(target)).toEqual(["never_verified"]);
    expect(classifyEnabledSourceHealth(target)).toBe("needs_attention");
  });

  test("draft guidance is unverified and therefore needs attention", () => {
    const target = source({ instructionStatus: "draft" });

    expect(listSourceAttentionReasons(target)).toEqual(["never_verified"]);
    expect(classifyEnabledSourceHealth(target)).toBe("needs_attention");
  });

  test("failing verification marks the source for attention", () => {
    const target = source({
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
      staleReason: "Starting page URL changed.",
    });

    expect(listSourceAttentionReasons(target)).toEqual(["failing"]);
    expect(classifyEnabledSourceHealth(target)).toBe("needs_attention");
  });

  test("stale guidance marks the source for attention", () => {
    const target = source({
      instructionStatus: "stale",
      lastVerifiedAt: VERIFIED_AT,
    });

    expect(listSourceAttentionReasons(target)).toEqual(["guidance_stale"]);
    expect(classifyEnabledSourceHealth(target)).toBe("needs_attention");
  });

  test("unsupported guidance marks the source for attention", () => {
    const target = source({
      instructionStatus: "unsupported",
      lastVerifiedAt: VERIFIED_AT,
    });

    expect(listSourceAttentionReasons(target)).toEqual([
      "guidance_unsupported",
    ]);
    expect(classifyEnabledSourceHealth(target)).toBe("needs_attention");
  });

  test("a required sign-in prompt marks the source for attention", () => {
    const target = source({
      id: "target_login",
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
    });

    expect(
      listSourceAttentionReasons(
        target,
        signals({ loginRequired: ["target_login"] }),
      ),
    ).toEqual(["login_required"]);
    expect(
      classifyEnabledSourceHealth(
        target,
        signals({ loginRequired: ["target_login"] }),
      ),
    ).toBe("needs_attention");
  });

  test("an optional sign-in recommendation is not attention", () => {
    const target = source({
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
    });

    // Only `prompt_login_required` ids are ever passed in; recommended
    // prompts must stay informational.
    expect(listSourceAttentionReasons(target, signals())).toEqual([]);
    expect(classifyEnabledSourceHealth(target, signals())).toBe("healthy");
  });

  test("running wins over attention so active work is not double-reported", () => {
    const unverifiedRunning = source({ id: "target_run" });
    const healthyRunning = source({
      id: "target_run_healthy",
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
    });
    const runSignals = signals({
      running: ["target_run", "target_run_healthy"],
    });

    expect(classifyEnabledSourceHealth(unverifiedRunning, runSignals)).toBe(
      "running",
    );
    expect(isEnabledSourceNeedingAttention(unverifiedRunning, runSignals)).toBe(
      false,
    );
    expect(classifyEnabledSourceHealth(healthyRunning, runSignals)).toBe(
      "running",
    );
  });

  test("disabled sources never need attention regardless of their problems", () => {
    const disabledNeverRun = source({ enabled: false });
    const disabledFailing = source({
      enabled: false,
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
      staleReason: "Starting page URL changed.",
    });
    const disabledLogin = source({
      id: "target_disabled_login",
      enabled: false,
      instructionStatus: "validated",
      lastVerifiedAt: VERIFIED_AT,
    });

    for (const target of [disabledNeverRun, disabledFailing]) {
      expect(isEnabledSourceNeedingAttention(target)).toBe(false);
    }
    expect(
      isEnabledSourceNeedingAttention(
        disabledLogin,
        signals({ loginRequired: ["target_disabled_login"] }),
      ),
    ).toBe(false);
  });

  test("counts fold over enabled sources with honest denominators", () => {
    const targets = [
      // Enabled: one healthy, four needing attention.
      source({
        id: "target_healthy",
        instructionStatus: "validated",
        lastVerifiedAt: VERIFIED_AT,
      }),
      source({ id: "target_never_run" }),
      source({
        id: "target_failing",
        instructionStatus: "validated",
        lastVerifiedAt: VERIFIED_AT,
        staleReason: "Verification failed.",
      }),
      source({
        id: "target_unsupported",
        instructionStatus: "unsupported",
        lastVerifiedAt: VERIFIED_AT,
      }),
      source({
        id: "target_login",
        instructionStatus: "validated",
        lastVerifiedAt: VERIFIED_AT,
      }),
      // Disabled: excluded from every bucket.
      source({ id: "target_disabled_never_run", enabled: false }),
      source({
        id: "target_disabled_failing",
        enabled: false,
        instructionStatus: "validated",
        lastVerifiedAt: VERIFIED_AT,
        staleReason: "Verification failed.",
      }),
    ];

    const counts = deriveEnabledSourceHealthCounts(
      targets,
      signals({ loginRequired: ["target_login"] }),
    );

    expect(counts).toEqual({
      healthy: 1,
      needsAttention: 4,
      running: 0,
      total: 5,
    });
  });

  test("first-run workspace with a single never-run source reports it as attention", () => {
    const counts = deriveEnabledSourceHealthCounts([source()]);

    expect(counts).toEqual({
      healthy: 0,
      needsAttention: 1,
      running: 0,
      total: 1,
    });
  });

  test("a never-verified source whose latest discovery run succeeded is healthy", () => {
    const target = source({ id: "target_fresh" });
    const succeeded = signals();
    const withSuccess: SourceRuntimeSignals = {
      ...succeeded,
      succeededTargetIds: new Set(["target_fresh"]),
    };

    // Guidance verification never ran, but the source just returned a
    // completed run: that is proof enough for the Home badge.
    expect(listSourceAttentionReasons(target, withSuccess)).toEqual([]);
    expect(classifyEnabledSourceHealth(target, withSuccess)).toBe("healthy");
    expect(deriveEnabledSourceHealthCounts([target], withSuccess)).toEqual({
      healthy: 1,
      needsAttention: 0,
      running: 0,
      total: 1,
    });
    // Without the success signal the same source still needs attention.
    expect(classifyEnabledSourceHealth(target, succeeded)).toBe(
      "needs_attention",
    );
  });

  test("a successful run does not hide failing, stale, or login-blocked sources", () => {
    const withSuccess: SourceRuntimeSignals = {
      ...signals({ loginRequired: ["target_login"] }),
      succeededTargetIds: new Set([
        "target_failing",
        "target_stale",
        "target_login",
      ]),
    };

    expect(
      listSourceAttentionReasons(
        source({ id: "target_failing", staleReason: "Verification failed." }),
        withSuccess,
      ),
    ).toEqual(["failing"]);
    expect(
      listSourceAttentionReasons(
        source({ id: "target_stale", instructionStatus: "stale" }),
        withSuccess,
      ),
    ).toEqual(["guidance_stale"]);
    expect(
      listSourceAttentionReasons(source({ id: "target_login" }), withSuccess),
    ).toEqual(["login_required"]);
  });

  test("derives succeeded targets from each target's latest finished execution", () => {
    const succeeded = deriveSucceededDiscoveryTargetIds([
      // Newest run first, as the dashboard passes it.
      run([
        {
          targetId: "target_ok",
          state: "completed",
          completedAt: "2026-08-20T10:05:00.000Z",
        },
        {
          targetId: "target_regressed",
          state: "failed",
          completedAt: "2026-08-20T10:05:00.000Z",
        },
        { targetId: "target_pending", state: "planned" },
        {
          targetId: "target_active",
          state: "running",
          startedAt: "2026-08-20T10:04:00.000Z",
        },
      ]),
      run([
        {
          targetId: "target_regressed",
          state: "completed",
          completedAt: "2026-08-19T10:05:00.000Z",
        },
        {
          targetId: "target_recovered",
          state: "failed",
          completedAt: "2026-08-19T10:05:00.000Z",
        },
        {
          targetId: "target_cancelled",
          state: "cancelled",
          completedAt: "2026-08-19T10:05:00.000Z",
        },
      ]),
      run([
        {
          targetId: "target_recovered",
          state: "completed",
          completedAt: "2026-08-21T10:05:00.000Z",
        },
      ]),
    ]);

    // Order independence: the newest execution wins regardless of run order.
    expect([...succeeded].sort()).toEqual(["target_ok", "target_recovered"]);
    expect(deriveSucceededDiscoveryTargetIds([])).toEqual(new Set());
  });

  test("running sources are reported in the running bucket", () => {
    const counts = deriveEnabledSourceHealthCounts(
      [
        source({
          id: "target_a",
          instructionStatus: "validated",
          lastVerifiedAt: VERIFIED_AT,
        }),
        source({ id: "target_b" }),
      ],
      signals({ running: ["target_b"] }),
    );

    expect(counts).toEqual({
      healthy: 1,
      needsAttention: 0,
      running: 1,
      total: 2,
    });
  });
});

describe("describeEnabledSourceHealth", () => {
  test("a source proven by a completed run is healthy with a reason", () => {
    const target = source({ id: "target_run" });

    // The exact disagreement reported in dogfooding: Home derived succeeded
    // runs and said healthy, Profile did not and said needs attention.
    expect(
      describeEnabledSourceHealth(
        target,
        deriveSourceHealthSignals({
          recentRuns: [
            run([
              {
                targetId: "target_run",
                state: "completed",
                completedAt: "2026-08-21T10:05:00.000Z",
              },
            ]),
          ],
        }),
      ),
    ).toEqual({
      reason: "The latest search used this source successfully.",
      reasons: [],
      state: "healthy",
    });

    expect(describeEnabledSourceHealth(target).state).toBe("needs_attention");
  });

  test("attention states name their first concrete reason", () => {
    expect(
      describeEnabledSourceHealth(
        source({ lastVerifiedAt: VERIFIED_AT, staleReason: "HTTP 403" }),
      ),
    ).toEqual({
      reason: "The last check reported a problem: HTTP 403",
      reasons: ["failing"],
      state: "needs_attention",
    });

    expect(
      describeEnabledSourceHealth(
        source({ id: "target_login", lastVerifiedAt: VERIFIED_AT }),
        deriveSourceHealthSignals({
          sourceAccessPrompts: [
            { state: "prompt_login_required", targetId: "target_login" },
          ],
        }),
      ),
    ).toEqual({
      reason: "This source is waiting for you to sign in.",
      reasons: ["login_required"],
      state: "needs_attention",
    });
  });

  test("a running source reports running instead of attention", () => {
    const description = describeEnabledSourceHealth(
      source({ id: "target_running" }),
      deriveSourceHealthSignals({
        activeRun: run([{ targetId: "target_running", state: "running" }]),
      }),
    );

    expect(description.state).toBe("running");
    expect(description.reason).toBe("A search is using this source right now.");
  });

  test("classification and description agree on every state", () => {
    for (const target of [
      source({ id: "a", lastVerifiedAt: VERIFIED_AT }),
      source({ id: "b" }),
      source({ id: "c", instructionStatus: "unsupported" }),
    ]) {
      expect(describeEnabledSourceHealth(target).state).toBe(
        classifyEnabledSourceHealth(target),
      );
    }
  });
});
