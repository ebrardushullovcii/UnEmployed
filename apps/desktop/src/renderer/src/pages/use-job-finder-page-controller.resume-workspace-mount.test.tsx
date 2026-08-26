// @vitest-environment jsdom

import type {
  JobFinderResumeWorkspace,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useJobFinderPageController } from "./use-job-finder-page-controller";

type ResumeWorkspaceRequest = {
  jobId: string;
  resolve: (workspace: JobFinderResumeWorkspace) => void;
};

function createReviewQueueItem(jobId: string) {
  return {
    jobId,
    title: `Role ${jobId}`,
    company: "Acme",
    location: "Remote",
    matchScore: 80,
    applicationStatus: "shortlisted",
    assetStatus: "not_started",
    progressPercent: null,
    resumeAssetId: null,
    resumeApplicationMode: "tailored_per_job",
    resumeReview: { status: "not_started" },
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

function createWorkspace(): JobFinderWorkspaceSnapshot {
  return {
    hydration: { phase: "complete", deferredCollections: [] },
    activeCampaignId: "campaign_1",
    campaigns: [{ id: "campaign_1", jobIds: ["job_1", "job_2", "job_3"] }],
    discoveryJobs: [],
    dismissedDiscoveryJobs: [],
    recentDiscoveryRuns: [],
    discoverySessions: [],
    sourceAccessPrompts: [],
    activeDiscoveryRun: null,
    reviewQueue: [
      createReviewQueueItem("job_1"),
      createReviewQueueItem("job_2"),
      createReviewQueueItem("job_3"),
    ],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: [],
    applyRuns: [],
    applyJobResults: [],
    selectedDiscoveryJobId: null,
    selectedReviewJobId: null,
    selectedApplicationRecordId: null,
    selectedApplyRunId: null,
    settings: { appearanceTheme: "system" },
    profileSetupState: { status: "completed", reviewItems: [] },
    profileCopilotMessages: [],
  } as unknown as JobFinderWorkspaceSnapshot;
}

function createResumeWorkspace(
  jobId: string,
  marker: string,
): JobFinderResumeWorkspace {
  // Only `job.id` drives controller routing decisions; the marker makes the
  // applied version observable in assertions.
  return { job: { id: jobId }, marker } as unknown as JobFinderResumeWorkspace;
}

function activeResumeWorkspaceMarker(
  controller: ReturnType<typeof useJobFinderPageController>,
): string | null {
  const context = controller.context;
  if (!context) {
    throw new Error("Expected an assembled Job Finder page context.");
  }
  const workspace = context.resumeWorkspace as unknown as {
    job: { id: string };
    marker: string;
  } | null;
  return workspace?.marker ?? null;
}

async function flushTurns(turns = 6) {
  for (let index = 0; index < turns; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
}

// The data router constructs a real fetch Request for every navigation.
// jsdom's AbortSignal fails Node's brand check inside the Request constructor,
// so hand React Router a stub with the tiny request surface it reads (url,
// method, signal).
class NavigationRequestStub {
  method: string;
  signal: unknown;
  url: string;

  constructor(
    input: string | URL,
    init?: { method?: string; signal?: unknown },
  ) {
    this.url = String(input);
    this.method = (init?.method ?? "GET").toUpperCase();
    this.signal = init?.signal ?? null;
  }
}

beforeAll(() => {
  vi.stubGlobal("Request", NavigationRequestStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function requireController(
  harness: { current: ReturnType<typeof useJobFinderPageController> | null },
): ReturnType<typeof useJobFinderPageController> {
  const controller = harness.current;
  if (!controller) {
    throw new Error("Expected mounted Job Finder page controller.");
  }
  return controller;
}

function requireControllerContext(
  harness: { current: ReturnType<typeof useJobFinderPageController> | null },
): NonNullable<ReturnType<typeof useJobFinderPageController>["context"]> {
  const controller = requireController(harness);
  const context = controller.context;
  if (!context) {
    throw new Error("Expected an assembled Job Finder page context.");
  }
  return context;
}

describe("useJobFinderPageController resume-workspace mount loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "unemployed");
  });

  function createMountHarness() {
    const workspace = createWorkspace();
    const pendingRequests: ResumeWorkspaceRequest[] = [];

    const getResumeWorkspace = vi.fn(
      (jobId: string) =>
        new Promise<JobFinderResumeWorkspace>((resolve) => {
          pendingRequests.push({ jobId, resolve });
        }),
    );

    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        ping: vi.fn(() => Promise.resolve({ platform: "darwin" as const })),
        jobFinder: {
          getWorkspaceBootstrap: vi.fn(() => Promise.resolve(workspace)),
          getResumeWorkspace,
        },
      } as unknown as Window["unemployed"],
    });

    type Controller = ReturnType<typeof useJobFinderPageController>;
    const mounted: { current: Controller | null } = { current: null };

    function ControllerProbe() {
      mounted.current = useJobFinderPageController();
      return null;
    }

    const router = createMemoryRouter(
      [{ path: "*", element: <ControllerProbe /> }],
      { initialEntries: ["/job-finder/review-queue/job_1/resume"] },
    );

    const view = render(<RouterProvider router={router} />);

    return {
      router,
      getResumeWorkspace,
      get current() {
        return mounted.current;
      },
      unmount: view.unmount,
      // Answers the OLDEST parked request.
      respondOldest(jobId: string, marker: string) {
        const request = pendingRequests.shift();
        if (!request) {
          throw new Error("No parked resume-workspace request to answer.");
        }
        const answeredJobId = request.jobId;
        request.resolve(createResumeWorkspace(jobId, marker));
        return answeredJobId;
      },
      // Answers the NEWEST parked request (the latest fetch the controller
      // dispatched).
      respondLatest(jobId: string, marker: string) {
        const request = pendingRequests.pop();
        if (!request) {
          throw new Error("No parked resume-workspace request to answer.");
        }
        const answeredJobId = request.jobId;
        request.resolve(createResumeWorkspace(jobId, marker));
        return answeredJobId;
      },
    };
  }

  it("issues exactly one authoritative fetch per resume-workspace navigation", async () => {
    const harness = createMountHarness();

    await waitFor(() =>
      expect(requireController(harness).workspaceState.status).toBe("ready"),
    );
    expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(1);
    expect(harness.getResumeWorkspace.mock.calls[0]?.[0]).toBe("job_1");

    act(() => {
      harness.respondOldest("job_1", "mount-v1");
    });

    await waitFor(() =>
      expect(activeResumeWorkspaceMarker(requireController(harness))).toBe(
        "mount-v1",
      ),
    );
    // The removed duplicate effect used to fire a second identical load.
    expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it("never lets an older parked mount response overwrite a newer refresh", async () => {
    const harness = createMountHarness();

    await waitFor(() =>
      expect(requireController(harness).workspaceState.status).toBe("ready"),
    );

    // The job_1 mount load stays parked while an explicit reload runs and
    // commits newer state through the same shared token fence.
    act(() => {
      void requireControllerContext(harness).onRefreshResumeWorkspace("job_1");
    });
    await waitFor(() =>
      expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(2),
    );

    expect(harness.respondLatest("job_1", "reload-v2")).toBe("job_1");
    await waitFor(() =>
      expect(activeResumeWorkspaceMarker(requireController(harness))).toBe(
        "reload-v2",
      ),
    );

    // The original stale mount response settles last; the request token must
    // discard it instead of rolling the editor back.
    expect(harness.respondOldest("job_1", "stale-mount-v0")).toBe("job_1");
    await flushTurns();

    expect(activeResumeWorkspaceMarker(requireController(harness))).toBe(
      "reload-v2",
    );

    harness.unmount();
  });

  it("keeps a late mount response from crossing an out-and-back navigation", async () => {
    const harness = createMountHarness();

    await waitFor(() =>
      expect(requireController(harness).workspaceState.status).toBe("ready"),
    );

    await act(async () => {
      await harness.router.navigate("/job-finder/review-queue/job_2/resume");
    });
    await waitFor(() =>
      expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(2),
    );
    expect(harness.respondLatest("job_2", "v-job_2")).toBe("job_2");
    await waitFor(() => {
      const context = requireControllerContext(harness);
      expect(context.resumeWorkspace?.job.id).toBe("job_2");
    });

    await act(async () => {
      await harness.router.navigate("/job-finder/review-queue/job_1/resume");
    });
    await waitFor(() =>
      expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(3),
    );
    expect(harness.respondLatest("job_1", "v-job_1-late")).toBe("job_1");
    await waitFor(() =>
      expect(activeResumeWorkspaceMarker(requireController(harness))).toBe(
        "v-job_1-late",
      ),
    );

    // The very first parked job_1 mount response settles after the fresh
    // navigation fetch and must not win.
    expect(harness.respondOldest("job_1", "stale-first-load")).toBe("job_1");
    await flushTurns();

    expect(activeResumeWorkspaceMarker(requireController(harness))).toBe(
      "v-job_1-late",
    );

    harness.unmount();
  });

  it("discards a mount response that settles after unmount without crashing", async () => {
    const harness = createMountHarness();

    await waitFor(() =>
      expect(requireController(harness).workspaceState.status).toBe("ready"),
    );
    expect(harness.getResumeWorkspace).toHaveBeenCalledTimes(1);

    harness.unmount();

    expect(() => {
      harness.respondOldest("job_1", "post-unmount-v1");
    }).not.toThrow();
    await flushTurns();
  });
});
