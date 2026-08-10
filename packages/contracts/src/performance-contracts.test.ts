import { describe, expect, it } from "vitest";

import {
  JobFinderPerformanceEvidenceSchema,
  JobFinderPerformanceSnapshotSchema,
} from "./performance";

const recordedAt = "2026-08-09T10:00:00.000Z";

describe("Job Finder performance evidence contracts", () => {
  it("preserves a measured zero as available evidence", () => {
    const evidence = JobFinderPerformanceEvidenceSchema.parse({
      area: "resume_import",
      measurementStatus: "available",
      durationMs: 0,
      recordedAt,
      method: "resume_import_run",
      sampleCount: 1,
      budgetStatus: "not_evaluated",
      stageDurations: [
        { id: "resume_import.literal_extraction", durationMs: 0 },
      ],
    });

    expect(evidence.durationMs).toBe(0);
    expect(evidence.measurementStatus).toBe("available");
  });

  it("requires unavailable evidence to use null instead of a fabricated zero", () => {
    const result = JobFinderPerformanceEvidenceSchema.safeParse({
      area: "renderer_commit",
      measurementStatus: "unavailable",
      durationMs: 0,
      recordedAt: null,
      method: "none",
      sampleCount: 0,
      budgetStatus: "unavailable",
      unavailableReason: "no_recorded_measurement",
    });

    expect(result.success).toBe(false);
  });

  it("requires stage evidence before accepting a partial measurement", () => {
    const result = JobFinderPerformanceEvidenceSchema.safeParse({
      area: "application_preparation",
      measurementStatus: "partial",
      durationMs: null,
      recordedAt,
      method: "application_attempt",
      sampleCount: 1,
      budgetStatus: "not_evaluated",
      stageDurations: [],
      unavailableReason: "total_not_recorded",
    });

    expect(result.success).toBe(false);
  });

  it("keeps older performance snapshots readable with an empty evidence list", () => {
    const snapshot = JobFinderPerformanceSnapshotSchema.parse({
      generatedAt: recordedAt,
      latestDiscoveryRun: null,
      latestSourceDebugRun: null,
    });

    expect(snapshot.evidence).toEqual([]);
    expect(snapshot.budgetEvaluations).toEqual([]);
  });
});
