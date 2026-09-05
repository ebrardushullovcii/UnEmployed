import { describe, expect, test } from "vitest";

import {
  AgentTaskExecutionReceiptSchema,
  AgentTaskProgressSchema,
} from "./agent-task";

describe("agent task contracts", () => {
  test("keeps progress semantic instead of exposing a fixed step budget", () => {
    const progress = AgentTaskProgressSchema.parse({
      phase: "source_check",
      message: "12 of 40 sources checked",
      completedUnits: 12,
      totalUnits: 40,
      distinctResults: 18,
      validationIssuesRemaining: 0,
      elapsedMs: 1_200,
      updatedAt: "2026-08-12T12:00:00.000Z",
    });

    expect(progress).not.toHaveProperty("stepCount");
    expect(progress.completedUnits).toBe(12);
  });

  test("records fallback and stop reason independently", () => {
    const receipt = AgentTaskExecutionReceiptSchema.parse({
      taskId: "task_profile_1",
      capability: "profile_copilot",
      startedAt: "2026-08-12T12:00:00.000Z",
      completedAt: "2026-08-12T12:00:01.000Z",
      durationMs: 1_000,
      providerCalls: 2,
      repairAttempts: 1,
      fallbackUsed: true,
      stopReason: "completed",
    });

    expect(receipt.fallbackUsed).toBe(true);
    expect(receipt.stopReason).toBe("completed");
  });
});
