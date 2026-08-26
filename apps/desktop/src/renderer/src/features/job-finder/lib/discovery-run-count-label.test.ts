import type {
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import {
  formatDiscoveryRunCountLabel,
  getDiscoveryRunCountEvidence,
} from "./discovery-run-count-label";

function createRun(
  summary: Partial<DiscoveryRunRecord["summary"]> = {},
): DiscoveryRunRecord {
  return {
    id: "run_1",
    state: "completed",
    startedAt: "2026-08-25T10:00:00.000Z",
    completedAt: "2026-08-25T10:01:00.000Z",
    targetIds: ["source_a"],
    targetExecutions: [],
    activity: [],
    summary: {
      targetsPlanned: 1,
      targetsCompleted: 1,
      validJobsFound: 0,
      durationMs: 60_000,
      ...summary,
    },
  } as unknown as DiscoveryRunRecord;
}

function createEvent(
  overrides: Partial<DiscoveryActivityEvent> = {},
): DiscoveryActivityEvent {
  return {
    id: "event_1",
    runId: "run_1",
    timestamp: "2026-08-25T10:00:30.000Z",
    kind: "progress",
    stage: "scoring",
    message: "Scoring matches",
    ...overrides,
  } as unknown as DiscoveryActivityEvent;
}

function formatLabel(distinctJobsRetained: number, duplicatesMerged: number) {
  return formatDiscoveryRunCountLabel({
    distinctJobsRetained,
    duplicatesMerged,
  });
}

describe("formatDiscoveryRunCountLabel", () => {
  it("shows zero retained without inventing volume", () => {
    expect(formatLabel(0, 0)).toBe("0 new jobs kept");
  });

  it("uses singular phrasing for exactly one kept job", () => {
    expect(formatLabel(1, 0)).toBe("1 new job kept");
  });

  it("uses plural phrasing for several kept jobs", () => {
    expect(formatLabel(4, 0)).toBe("4 new jobs kept");
  });

  it("displays the distinct count directly instead of subtracting duplicates", () => {
    // Regression: the summary's distinct total must never lose the duplicate
    // counter again (the old label claimed "34 unique retained").
    const label = formatLabel(67, 33);

    expect(label).toBe("67 new jobs kept · 33 duplicates merged");
    expect(label).not.toContain("34");
    expect(label).not.toMatch(/\bfound\b/i);
  });

  it("uses singular duplicate phrasing for one merged listing", () => {
    expect(formatLabel(2, 1)).toBe("2 new jobs kept · 1 duplicate merged");
  });

  it("keeps duplicate context on a run that kept nothing new", () => {
    const label = formatLabel(0, 15);

    expect(label).toBe("0 new jobs kept · 15 duplicates merged");
    expect(label).not.toMatch(/\bfound\b/i);
  });

  it("normalizes nonsensical counts to zero without going negative", () => {
    expect(formatLabel(-5, -3)).toBe("0 new jobs kept");
    expect(formatLabel(Number.NaN, 2.9)).toBe(
      "0 new jobs kept · 2 duplicates merged",
    );
  });
});

describe("getDiscoveryRunCountEvidence", () => {
  it("passes the settled summary through unchanged because it already excludes duplicates", () => {
    const evidence = getDiscoveryRunCountEvidence(
      createRun({ validJobsFound: 67, duplicatesMerged: 33 }),
      null,
    );

    expect(evidence).toEqual({
      distinctJobsRetained: 67,
      duplicatesMerged: 33,
    });
  });

  it("derives distinct additions from live persistence-stage review volume while the summary has not caught up", () => {
    // The event's jobsFound is review volume (duplicates included), so its
    // own duplicate counter is what turns 100 reviewed into 67 retained.
    const evidence = getDiscoveryRunCountEvidence(
      createRun(),
      createEvent({
        stage: "persistence",
        jobsFound: 100,
        duplicatesMerged: 33,
      }),
    );

    expect(evidence).toEqual({
      distinctJobsRetained: 67,
      duplicatesMerged: 33,
    });
  });

  it("treats terminal events as merged-result evidence too", () => {
    const evidence = getDiscoveryRunCountEvidence(
      null,
      createEvent({
        kind: "success",
        stage: "target",
        terminalState: "completed",
        jobsFound: 100,
        duplicatesMerged: 33,
      }),
    );

    expect(evidence).toEqual({
      distinctJobsRetained: 67,
      duplicatesMerged: 33,
    });
  });

  it("ignores pre-merge stages whose candidate totals share no base with duplicates", () => {
    const evidence = getDiscoveryRunCountEvidence(
      null,
      createEvent({ stage: "scoring", jobsFound: 50, duplicatesMerged: 6 }),
    );

    expect(evidence).toEqual({ distinctJobsRetained: 0, duplicatesMerged: 0 });
  });

  it("never mixes bases once the summary holds settled volume", () => {
    // A fresher per-target persistence event must not be maxed into (or
    // subtracted from) the cumulative summary; the settled numbers win.
    const evidence = getDiscoveryRunCountEvidence(
      createRun({ validJobsFound: 6, duplicatesMerged: 6 }),
      createEvent({
        stage: "persistence",
        jobsFound: 50,
        duplicatesMerged: 40,
      }),
    );

    expect(evidence).toEqual({
      distinctJobsRetained: 6,
      duplicatesMerged: 6,
    });
  });

  it("falls back to zero evidence when neither source reports anything", () => {
    expect(getDiscoveryRunCountEvidence(null, null)).toEqual({
      distinctJobsRetained: 0,
      duplicatesMerged: 0,
    });
    expect(getDiscoveryRunCountEvidence(createRun(), createEvent())).toEqual({
      distinctJobsRetained: 0,
      duplicatesMerged: 0,
    });
  });

  it("reads nullable event fields as absent rather than breaking the derivation", () => {
    const evidence = getDiscoveryRunCountEvidence(
      null,
      createEvent({
        stage: "persistence",
        jobsFound: null,
        duplicatesMerged: null,
      }),
    );

    expect(evidence).toEqual({ distinctJobsRetained: 0, duplicatesMerged: 0 });
  });
});
