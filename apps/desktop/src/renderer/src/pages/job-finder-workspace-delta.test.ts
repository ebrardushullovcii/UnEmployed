import type {
  JobFinderWorkspaceDelta,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";

import { applyJobFinderWorkspaceDelta } from "./job-finder-workspace-delta";

function identified<T>(id: string): T {
  return { id } as T;
}

function queued<T>(jobId: string): T {
  return { jobId } as T;
}

function createWorkspace(): JobFinderWorkspaceSnapshot {
  return {
    generatedAt: "2026-07-31T10:00:00.000Z",
    discoveryRunState: { status: "idle" },
    activeDiscoveryRun: null,
    discoverySessions: [],
    sourceAccessPrompts: [],
    latestResumeImportRun: null,
    discoveryJobs: [identified("job-old"), identified("job-keep")],
    dismissedDiscoveryJobs: [identified("dismissed-old")],
    recentDiscoveryRuns: [identified("run-old")],
    reviewQueue: [queued("queue-old")],
    applyRuns: [identified("apply-old")],
    applyJobResults: [identified("result-old")],
    applicationRecords: [identified("record-old")],
    applicationAttempts: [identified("attempt-old")],
    userActionRequests: [identified("request-old")],
    userActionEvents: [identified("event-old")],
    selectedDiscoveryJobId: "job-old",
    selectedReviewJobId: "queue-old",
    selectedApplyRunId: "apply-old",
    selectedApplicationRecordId: "record-old",
  } as unknown as JobFinderWorkspaceSnapshot;
}

function createDelta(
  overrides: Partial<
    Pick<JobFinderWorkspaceDelta, "baseRevision" | "currentRevision">
  > = {},
): JobFinderWorkspaceDelta {
  return {
    baseRevision: 7,
    currentRevision: 8,
    generatedAt: "2026-07-31T10:01:00.000Z",
    discoveryRunState: { status: "running" },
    activeDiscoveryRun: null,
    discoverySessions: [],
    sourceAccessPrompts: [],
    latestResumeImportRun: null,
    selectedDiscoveryJobId: "job-new",
    selectedReviewJobId: "queue-new",
    selectedApplyRunId: "apply-new",
    selectedApplicationRecordId: "record-new",
    discoveryJobs: {
      upserts: [identified("job-new")],
      removedIds: ["job-old"],
    },
    dismissedDiscoveryJobs: {
      upserts: [],
      removedIds: ["dismissed-old"],
    },
    recentDiscoveryRuns: {
      upserts: [identified("run-new")],
      removedIds: ["run-old"],
    },
    reviewQueue: {
      upserts: [queued("queue-new")],
      removedIds: ["queue-old"],
    },
    applyRuns: {
      upserts: [identified("apply-new")],
      removedIds: ["apply-old"],
    },
    applyJobResults: {
      upserts: [identified("result-new")],
      removedIds: ["result-old"],
    },
    applicationRecords: {
      upserts: [identified("record-new")],
      removedIds: ["record-old"],
    },
    applicationAttempts: {
      upserts: [identified("attempt-new")],
      removedIds: ["attempt-old"],
    },
    userActionRequests: {
      upserts: [identified("request-new")],
      removedIds: ["request-old"],
    },
    userActionEvents: {
      upserts: [identified("event-new")],
      removedIds: ["event-old"],
    },
    ...overrides,
  } as unknown as JobFinderWorkspaceDelta;
}

describe("applyJobFinderWorkspaceDelta", () => {
  it("applies entity slices and moves selection to valid current entities", () => {
    const result = applyJobFinderWorkspaceDelta({
      revision: 7,
      workspace: createWorkspace(),
      delta: createDelta(),
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") {
      throw new Error("Expected the delta to apply.");
    }

    expect(result.revision).toBe(8);
    expect(result.workspace.generatedAt).toBe("2026-07-31T10:01:00.000Z");
    expect(result.workspace.discoveryJobs.map(({ id }) => id)).toEqual([
      "job-keep",
      "job-new",
    ]);
    expect(result.workspace.recentDiscoveryRuns.map(({ id }) => id)).toEqual([
      "run-new",
    ]);
    expect(result.workspace.reviewQueue.map(({ jobId }) => jobId)).toEqual([
      "queue-new",
    ]);
    expect(result.workspace.applyRuns.map(({ id }) => id)).toEqual([
      "apply-new",
    ]);
    expect(result.workspace.applicationRecords.map(({ id }) => id)).toEqual([
      "record-new",
    ]);
    expect(result.workspace.userActionRequests.map(({ id }) => id)).toEqual([
      "request-new",
    ]);
    expect(result.workspace.userActionEvents.map(({ id }) => id)).toEqual([
      "event-new",
    ]);
    expect(result.workspace.selectedDiscoveryJobId).toBe("job-new");
    expect(result.workspace.selectedReviewJobId).toBe("queue-new");
    expect(result.workspace.selectedApplyRunId).toBe("apply-new");
    expect(result.workspace.selectedApplicationRecordId).toBe("record-new");
  });

  it("rejects a stale delta without replacing the current workspace", () => {
    const workspace = createWorkspace();

    const result = applyJobFinderWorkspaceDelta({
      revision: 8,
      workspace,
      delta: createDelta({ baseRevision: 7, currentRevision: 8 }),
    });

    expect(result).toEqual({ status: "stale" });
    expect(workspace.discoveryJobs.map(({ id }) => id)).toEqual([
      "job-old",
      "job-keep",
    ]);
  });

  it("rejects a revision gap", () => {
    const result = applyJobFinderWorkspaceDelta({
      revision: 7,
      workspace: createWorkspace(),
      delta: createDelta({ baseRevision: 8, currentRevision: 9 }),
    });

    expect(result).toEqual({ status: "gap" });
  });
});
