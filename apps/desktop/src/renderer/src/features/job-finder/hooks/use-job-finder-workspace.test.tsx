// @vitest-environment jsdom

import type {
  JobFinderWorkspaceDelta,
  JobFinderWorkspaceEntityMutationInput,
  JobFinderWorkspaceSnapshot,
  JobFinderWorkspaceSyncResult,
} from "@unemployed/contracts";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useJobFinderWorkspace } from "./use-job-finder-workspace";

function identified<T>(id: string): T {
  return { id } as T;
}

function createWorkspace(
  jobId: string,
  generatedAt = "2026-08-09T10:00:00.000Z",
): JobFinderWorkspaceSnapshot {
  return {
    generatedAt,
    discoveryRunState: "idle",
    activeDiscoveryRun: null,
    discoverySessions: [],
    sourceAccessPrompts: [],
    latestResumeImportRun: null,
    discoveryJobs: [identified(jobId)],
    dismissedDiscoveryJobs: [],
    recentDiscoveryRuns: [],
    reviewQueue: [],
    applyRuns: [],
    applyJobResults: [],
    applicationRecords: [],
    applicationAttempts: [],
    userActionRequests: [],
    userActionEvents: [],
    selectedDiscoveryJobId: jobId,
    selectedReviewJobId: null,
    selectedApplyRunId: null,
    selectedApplicationRecordId: null,
  } as unknown as JobFinderWorkspaceSnapshot;
}

function createJobReplacementDelta(input: {
  baseRevision: number;
  currentRevision: number;
  previousJobId: string;
  currentJobId: string;
}): JobFinderWorkspaceDelta {
  return {
    baseRevision: input.baseRevision,
    currentRevision: input.currentRevision,
    generatedAt: "2026-08-09T10:01:00.000Z",
    discoveryRunState: "idle",
    activeDiscoveryRun: null,
    discoverySessions: [],
    sourceAccessPrompts: [],
    latestResumeImportRun: null,
    selectedDiscoveryJobId: input.currentJobId,
    selectedReviewJobId: null,
    selectedApplyRunId: null,
    selectedApplicationRecordId: null,
    discoveryJobs: {
      upserts: [identified(input.currentJobId)],
      removedIds: [input.previousJobId],
    },
    dismissedDiscoveryJobs: { upserts: [], removedIds: [] },
    recentDiscoveryRuns: { upserts: [], removedIds: [] },
    reviewQueue: { upserts: [], removedIds: [] },
    applyRuns: { upserts: [], removedIds: [] },
    applyJobResults: { upserts: [], removedIds: [] },
    applicationRecords: { upserts: [], removedIds: [] },
    applicationAttempts: { upserts: [], removedIds: [] },
    userActionRequests: { upserts: [], removedIds: [] },
    userActionEvents: { upserts: [], removedIds: [] },
  } as unknown as JobFinderWorkspaceDelta;
}

describe("useJobFinderWorkspace entity mutations", () => {
  const syncWorkspace = vi.fn<
    (baseRevision: number | null) => Promise<JobFinderWorkspaceSyncResult>
  >();
  const mutateWorkspaceEntities = vi.fn<
    (
      input: JobFinderWorkspaceEntityMutationInput,
    ) => Promise<JobFinderWorkspaceSyncResult>
  >();
  const getWorkspace = vi.fn<() => Promise<JobFinderWorkspaceSnapshot>>();
  const legacyQueueJobForReview = vi.fn<
    (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
  >();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        ping: vi.fn(() => Promise.resolve({ platform: "win32" as const })),
        jobFinder: {
          syncWorkspace,
          mutateWorkspaceEntities,
          getWorkspace,
          queueJobForReview: legacyQueueJobForReview,
        },
      } as unknown as Window["unemployed"],
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "unemployed");
  });

  it("commits a typed entity delta without calling the legacy snapshot route", async () => {
    const initialWorkspace = createWorkspace("job-old");
    syncWorkspace.mockResolvedValueOnce({
      kind: "snapshot",
      currentRevision: 1,
      reason: "initial",
      snapshot: initialWorkspace,
    });
    mutateWorkspaceEntities.mockResolvedValueOnce({
      kind: "delta",
      delta: createJobReplacementDelta({
        baseRevision: 1,
        currentRevision: 2,
        previousJobId: "job-old",
        currentJobId: "job-new",
      }),
    });

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      if (result.current.status !== "ready") {
        throw new Error("Expected a ready Job Finder workspace.");
      }
      await result.current.actions.queueJobForReview("job-new");
    });

    expect(mutateWorkspaceEntities).toHaveBeenCalledWith({
      baseRevision: 1,
      mutation: {
        type: "queue_job_for_review",
        jobId: "job-new",
      },
    });
    expect(legacyQueueJobForReview).not.toHaveBeenCalled();
    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") {
      expect(result.current.workspace.discoveryJobs.map(({ id }) => id)).toEqual([
        "job-new",
      ]);
      expect(result.current.workspace.selectedDiscoveryJobId).toBe("job-new");
    }
  });

  it("recovers a revision mismatch with one fresh snapshot", async () => {
    const initialWorkspace = createWorkspace("job-old");
    const recoveredWorkspace = createWorkspace(
      "job-recovered",
      "2026-08-09T10:02:00.000Z",
    );
    syncWorkspace
      .mockResolvedValueOnce({
        kind: "snapshot",
        currentRevision: 4,
        reason: "initial",
        snapshot: initialWorkspace,
      })
      .mockResolvedValueOnce({
        kind: "snapshot",
        currentRevision: 6,
        reason: "initial",
        snapshot: recoveredWorkspace,
      });
    mutateWorkspaceEntities.mockResolvedValueOnce({
      kind: "delta",
      delta: createJobReplacementDelta({
        baseRevision: 2,
        currentRevision: 3,
        previousJobId: "job-old",
        currentJobId: "job-stale",
      }),
    });

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      if (result.current.status !== "ready") {
        throw new Error("Expected a ready Job Finder workspace.");
      }
      await result.current.actions.removeJobFromReview("job-old");
    });

    expect(syncWorkspace).toHaveBeenNthCalledWith(2, null);
    expect(getWorkspace).not.toHaveBeenCalled();
    if (result.current.status === "ready") {
      expect(result.current.workspace.selectedDiscoveryJobId).toBe(
        "job-recovered",
      );
    }
  });

  it("retries the initial workspace load after a recoverable failure", async () => {
    const recoveredWorkspace = createWorkspace("job-recovered");
    syncWorkspace
      .mockRejectedValueOnce(new Error("database temporarily unavailable"))
      .mockResolvedValueOnce({
        kind: "snapshot",
        currentRevision: 1,
        reason: "initial",
        snapshot: recoveredWorkspace,
      });
    getWorkspace.mockRejectedValueOnce(
      new Error("database temporarily unavailable"),
    );

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => {
      if (result.current.status !== "error") {
        throw new Error("Expected a failed initial workspace load.");
      }
      result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status === "ready") {
      expect(result.current.workspace.selectedDiscoveryJobId).toBe(
        "job-recovered",
      );
    }
  });
});
