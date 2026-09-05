import { describe, expect, it } from "vitest";
import { DiscoveryRunRecordSchema } from "@unemployed/contracts";

import { completeTargetExecution } from "./workspace-discovery-run-helpers";

describe("discovery run change digest", () => {
  it("aggregates source changes, health, warnings, and duration into the persisted summary", () => {
    const run = DiscoveryRunRecordSchema.parse({
      id: "run-change-digest",
      state: "running",
      startedAt: "2026-07-31T10:00:00.000Z",
      targetIds: ["source-one", "source-two"],
      targetExecutions: [
        {
          targetId: "source-one",
          adapterKind: "auto",
          state: "running",
          startedAt: "2026-07-31T10:00:00.000Z",
        },
        {
          targetId: "source-two",
          adapterKind: "auto",
          state: "running",
          startedAt: "2026-07-31T10:00:01.000Z",
        },
      ],
    });

    const firstComplete = completeTargetExecution(
      run,
      "source-one",
      "2026-07-31T10:00:03.000Z",
      {
        state: "completed",
        changeDigest: {
          new: 3,
          unchanged: 4,
          changed: 1,
          reactivated: 1,
          inactive: 2,
          known: 6,
          skipped: 1,
        },
      },
    );
    const allComplete = completeTargetExecution(
      firstComplete,
      "source-two",
      "2026-07-31T10:00:05.000Z",
      {
        state: "failed",
        warning: "The source stopped responding.",
        changeDigest: {
          new: 0,
          unchanged: 1,
          changed: 0,
          reactivated: 0,
          inactive: 0,
          known: 1,
          skipped: 2,
        },
      },
    );

    expect(allComplete.summary.changeDigest).toEqual({
      new: 3,
      unchanged: 5,
      changed: 1,
      reactivated: 1,
      inactive: 2,
      known: 7,
      skipped: 3,
    });
    expect(allComplete.summary.sourceHealth).toEqual([
      {
        targetId: "source-one",
        health: "healthy",
        durationMs: 3_000,
        warnings: [],
      },
      {
        targetId: "source-two",
        health: "failed",
        durationMs: 4_000,
        warnings: ["The source stopped responding."],
      },
    ]);
    expect(allComplete.summary.warnings).toEqual([
      "The source stopped responding.",
    ]);
  });
});
