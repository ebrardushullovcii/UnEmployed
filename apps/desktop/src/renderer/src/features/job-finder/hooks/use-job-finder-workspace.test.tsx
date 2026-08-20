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
    hydration: { phase: "complete", deferredCollections: [] },
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("useJobFinderWorkspace entity mutations", () => {
  const syncWorkspace =
    vi.fn<
      (baseRevision: number | null) => Promise<JobFinderWorkspaceSyncResult>
    >();
  const mutateWorkspaceEntities =
    vi.fn<
      (
        input: JobFinderWorkspaceEntityMutationInput,
      ) => Promise<JobFinderWorkspaceSyncResult>
    >();
  const getWorkspace = vi.fn<() => Promise<JobFinderWorkspaceSnapshot>>();
  const getWorkspaceBootstrap =
    vi.fn<() => Promise<JobFinderWorkspaceSnapshot>>();
  const checkBrowserSession =
    vi.fn<() => Promise<JobFinderWorkspaceSnapshot>>();
  const legacyQueueJobForReview =
    vi.fn<(jobId: string) => Promise<JobFinderWorkspaceSnapshot>>();

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
          checkBrowserSession,
          queueJobForReview: legacyQueueJobForReview,
        },
      } as unknown as Window["unemployed"],
    });
  });

  function enableBootstrapApi() {
    Object.assign(window.unemployed.jobFinder as object, {
      getWorkspaceBootstrap,
    });
  }

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
      expect(
        result.current.workspace.discoveryJobs.map(({ id }) => id),
      ).toEqual(["job-new"]);
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

  it("ignores a slower older action response after a newer response commits", async () => {
    const initialWorkspace = createWorkspace("job-initial");
    const olderWorkspace = createWorkspace(
      "job-older",
      "2026-08-09T10:03:00.000Z",
    );
    const newerWorkspace = createWorkspace(
      "job-newer",
      "2026-08-09T10:04:00.000Z",
    );
    syncWorkspace.mockResolvedValueOnce({
      kind: "snapshot",
      currentRevision: 1,
      reason: "initial",
      snapshot: initialWorkspace,
    });
    const older = deferred<JobFinderWorkspaceSnapshot>();
    const newer = deferred<JobFinderWorkspaceSnapshot>();
    checkBrowserSession
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let olderAction!: Promise<JobFinderWorkspaceSnapshot>;
    let newerAction!: Promise<JobFinderWorkspaceSnapshot>;
    act(() => {
      if (result.current.status !== "ready") {
        throw new Error("Expected a ready Job Finder workspace.");
      }

      olderAction = result.current.actions.checkBrowserSession();
      newerAction = result.current.actions.checkBrowserSession();
    });

    await act(async () => {
      newer.resolve(newerWorkspace);
      await newerAction;
    });
    await act(async () => {
      older.resolve(olderWorkspace);
      await olderAction;
    });

    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") {
      expect(result.current.workspace.selectedDiscoveryJobId).toBe("job-newer");
    }
  });

  it("shows the bootstrap before deferred collections arrive and then hydrates them", async () => {
    enableBootstrapApi();
    const bootstrap = {
      ...createWorkspace("job-bootstrap"),
      discoveryJobs: [],
      selectedDiscoveryJobId: null,
      hydration: {
        phase: "bootstrap" as const,
        deferredCollections: ["discovery_jobs", "applications"] as const,
      },
    } as unknown as JobFinderWorkspaceSnapshot;
    const hydrated = createWorkspace("job-hydrated");
    const hydration = deferred<JobFinderWorkspaceSyncResult>();
    getWorkspaceBootstrap.mockResolvedValueOnce(bootstrap);
    syncWorkspace.mockReturnValueOnce(hydration.promise);

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status === "ready") {
      expect(result.current.workspace.hydration.phase).toBe("bootstrap");
      expect(result.current.workspace.discoveryJobs).toEqual([]);
      expect(result.current.workspace.hydration.deferredCollections).toEqual(
        expect.arrayContaining(["discovery_jobs", "applications"]),
      );
    }

    await act(async () => {
      hydration.resolve({
        kind: "snapshot",
        currentRevision: 8,
        reason: "initial",
        snapshot: hydrated,
      });
      await hydration.promise;
    });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      if (result.current.status === "ready") {
        expect(result.current.workspace.hydration.phase).toBe("complete");
        expect(result.current.workspace.discoveryJobs[0]?.id).toBe(
          "job-hydrated",
        );
      }
    });
  });

  it("does not let late hydration overwrite a newer user action", async () => {
    enableBootstrapApi();
    const bootstrap = {
      ...createWorkspace("job-bootstrap"),
      discoveryJobs: [],
      selectedDiscoveryJobId: null,
      hydration: {
        phase: "bootstrap" as const,
        deferredCollections: ["discovery_jobs"] as const,
      },
    } as unknown as JobFinderWorkspaceSnapshot;
    const hydrated = createWorkspace("job-hydrated");
    const actionWorkspace = createWorkspace("job-action");
    const hydration = deferred<JobFinderWorkspaceSyncResult>();
    getWorkspaceBootstrap.mockResolvedValueOnce(bootstrap);
    syncWorkspace.mockReturnValueOnce(hydration.promise);
    checkBrowserSession.mockResolvedValueOnce(actionWorkspace);

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      if (result.current.status !== "ready") {
        throw new Error("Expected a ready Job Finder workspace.");
      }
      await result.current.actions.checkBrowserSession();
    });

    await act(async () => {
      hydration.resolve({
        kind: "snapshot",
        currentRevision: 9,
        reason: "initial",
        snapshot: hydrated,
      });
      await hydration.promise;
    });

    expect(result.current.status).toBe("ready");
    if (result.current.status === "ready") {
      expect(result.current.workspace.selectedDiscoveryJobId).toBe(
        "job-action",
      );
    }
  });

  it("reports bootstrap failures instead of showing a blank shell", async () => {
    enableBootstrapApi();
    getWorkspaceBootstrap.mockRejectedValueOnce(
      new Error("bootstrap database unavailable"),
    );

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status === "error") {
      expect(result.current.message).toBe("bootstrap database unavailable");
    }
  });

  it("reports a full hydration failure and keeps the bootstrap error actionable", async () => {
    enableBootstrapApi();
    const bootstrap = {
      ...createWorkspace("job-bootstrap"),
      discoveryJobs: [],
      selectedDiscoveryJobId: null,
      hydration: {
        phase: "bootstrap" as const,
        deferredCollections: ["discovery_jobs"] as const,
      },
    } as unknown as JobFinderWorkspaceSnapshot;
    getWorkspaceBootstrap.mockResolvedValueOnce(bootstrap);
    syncWorkspace.mockRejectedValueOnce(
      new Error("hydration sync unavailable"),
    );
    getWorkspace.mockRejectedValueOnce(new Error("full workspace unavailable"));

    const { result } = renderHook(() => useJobFinderWorkspace());
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status === "error") {
      expect(result.current.message).toBe("full workspace unavailable");
      expect(typeof result.current.retry).toBe("function");
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
