import { describe, expect, test } from "vitest";

import {
  classifyEnabledSourceHealth,
  deriveEnabledSourceHealthCounts,
  isEnabledSourceNeedingAttention,
  listSourceAttentionReasons,
  type DiscoverySourceHealthFields,
  type SourceRuntimeSignals,
} from "./source-health";
import type { SourceInstructionStatus } from "@unemployed/contracts";

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
