import { describe, expect, test } from "vitest";
import {
  DiscoveryActivityEventSchema,
  DiscoveryRunRecordSchema,
} from "@unemployed/contracts";

import { appendDiscoveryEvent } from "./discovery-state";

function createRun() {
  return DiscoveryRunRecordSchema.parse({
    id: "run_incremental_activity",
    state: "running",
    startedAt: "2026-08-19T10:00:00.000Z",
    activity: [],
  });
}

function createEvent(index: number) {
  return DiscoveryActivityEventSchema.parse({
    id: `activity_${index}`,
    runId: "run_incremental_activity",
    timestamp: "2026-08-19T10:00:00.000Z",
    kind: "progress",
    stage: "target",
    targetId: `source_${index}`,
    message: `Source ${index} progress`,
    terminalState: null,
  });
}

describe("discovery state activity", () => {
  test("appends a large run history incrementally without replacing the accumulator", () => {
    const run = createRun();

    for (let index = 0; index < 511; index += 1) {
      expect(appendDiscoveryEvent(run, createEvent(index))).toBe(run);
    }

    expect(run.activity).toHaveLength(511);
    expect(run.activity[0]?.id).toBe("activity_0");
    expect(run.activity.at(-1)?.id).toBe("activity_510");
  });

  test("deduplicates an unchanged adjacent progress event", () => {
    const run = createRun();
    const first = createEvent(0);
    const duplicate = { ...first, id: "activity_duplicate" };

    appendDiscoveryEvent(run, first);
    const result = appendDiscoveryEvent(run, duplicate);

    expect(result).toBe(run);
    expect(run.activity).toEqual([first]);
  });
});
