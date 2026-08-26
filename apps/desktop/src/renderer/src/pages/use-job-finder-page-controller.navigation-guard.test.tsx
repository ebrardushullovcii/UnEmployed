// @vitest-environment jsdom

import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  composeLeaveConfirmation,
  useJobFinderPageController,
} from "./use-job-finder-page-controller";
import { JobFinderUnsavedChangesDialog } from "./job-finder-unsaved-changes-dialog";
import type { JobFinderSaveState } from "./job-finder-save-state";

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

function createReadyWorkspace(): JobFinderWorkspaceSnapshot {
  return {
    hydration: { phase: "complete", deferredCollections: [] },
    activeCampaignId: "campaign_1",
    campaigns: [],
    discoveryJobs: [],
    dismissedDiscoveryJobs: [],
    recentDiscoveryRuns: [],
    discoverySessions: [],
    sourceAccessPrompts: [],
    activeDiscoveryRun: null,
    reviewQueue: [],
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

function configureWindowUnemployed(workspace: JobFinderWorkspaceSnapshot) {
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: {
      ping: vi.fn(() =>
        Promise.resolve({ ok: true, platform: "darwin" as const }),
      ),
      jobFinder: {
        getWorkspaceBootstrap: vi.fn(() => Promise.resolve(workspace)),
      },
    } as unknown as Window["unemployed"],
  });
}

type MountedController = ReturnType<typeof useJobFinderPageController>;

// The probe owns the controller plus the unsaved-changes dialog exactly like
// the real shell: both live above the Outlet, so they stay mounted while the
// guarded routes swap underneath them.
function mountGuardedController(options: {
  initialEntries?: string[];
  strictMode?: boolean;
} = {}) {
  const mounted: { current: MountedController | null } = { current: null };

  function ControllerProbe() {
    mounted.current = useJobFinderPageController();
    const controller = mounted.current;
    return (
      <div>
        <Link data-testid="link-to-other" to="/other">
          Go to other screen
        </Link>
        <Outlet />
        <JobFinderUnsavedChangesDialog
          confirmation={controller?.unsavedChangesConfirmation ?? null}
          onLeaveWithoutSaving={() => {
            controller?.resolveUnsavedChangesLeave();
          }}
          onStay={() => {
            controller?.resolveUnsavedChangesStay();
          }}
        />
      </div>
    );
  }

  const router = createMemoryRouter(
    [
      {
        element: <ControllerProbe />,
        children: [
          { path: "/guard", element: <div>Guard screen</div> },
          { path: "/other", element: <div>Other screen</div> },
        ],
      },
    ],
    { initialEntries: options.initialEntries ?? ["/guard"] },
  );

  const tree = (
    <RouterProvider router={router} />
  );

  render(
    options.strictMode ? <StrictMode>{tree}</StrictMode> : tree,
  );

  return {
    router,
    get current() {
      return mounted.current;
    },
  };
}

async function waitForReady(controller: { current: MountedController | null }) {
  await waitFor(() => {
    expect(controller.current?.workspaceState.status).toBe("ready");
    expect(controller.current?.context).not.toBeNull();
  });
}

function markDirty(controller: { current: MountedController | null }) {
  act(() => {
    controller.current?.context?.onProfileSurfaceDirtyChange(true);
  });
}

async function openUnsavedChangesDialog() {
  const dialog = await screen.findByRole("dialog", {
    name: /leave this page\?/i,
  });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  return dialog;
}

async function stayOnPage() {
  fireEvent.click(
    screen.getByRole("button", { name: "Stay on this page" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
}

async function leaveWithoutSaving() {
  fireEvent.click(
    screen.getByRole("button", { name: "Leave without saving" }),
  );
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "unemployed");
});

describe("composeLeaveConfirmation", () => {
  const idleSaveState: JobFinderSaveState = { state: "idle", version: 0 };

  it("returns null when nothing needs protecting", () => {
    expect(
      composeLeaveConfirmation({
        profileSurfaceDirty: false,
        resumeWorkspaceDirty: false,
        saveState: idleSaveState,
      }),
    ).toBeNull();
  });

  it("composes one confirmation naming every unsaved scope together", () => {
    const confirmation = composeLeaveConfirmation({
      profileSurfaceDirty: true,
      resumeWorkspaceDirty: true,
      saveState: {
        state: "saving",
        version: 1,
        attempt: 1,
        surface: "profile",
        label: "Profile",
        message: "Saving profile…",
        canRetry: false,
      },
    });

    expect(confirmation?.title).toContain("Leave this page?");
    expect(confirmation?.description).toContain(
      "Your unsaved changes will be lost.",
    );
    expect(confirmation?.reasons).toContain("Unsaved resume edits");
    expect(confirmation?.reasons).toContain("Unsaved profile or setup changes");
    expect(confirmation?.reasons).toContain("Profile is still saving");
  });

  it("names a failed save so the user can decide to retry first", () => {
    const confirmation = composeLeaveConfirmation({
      profileSurfaceDirty: false,
      resumeWorkspaceDirty: false,
      saveState: {
        state: "failed",
        version: 2,
        attempt: 1,
        surface: "resume",
        label: "Resume",
        message: "Saving resume…",
        canRetry: true,
      },
    });

    expect(confirmation?.reasons[0]).toContain("The last save failed");
  });
});

describe("useJobFinderPageController navigation guard", () => {
  it("lets clean navigations through without any dialog or native prompt", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController();
    await waitForReady(harness);

    act(() => {
      void harness.router.navigate("/other");
    });

    await waitFor(() => {
      expect(harness.router.state.location.pathname).toBe("/other");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks a programmatic push with the branded dialog and Stay keeps the draft and its protection", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController();
    await waitForReady(harness);
    markDirty(harness);

    act(() => {
      void harness.router.navigate("/other");
    });

    const dialog = await openUnsavedChangesDialog();
    expect(dialog.textContent).toContain("Unsaved profile or setup changes");
    expect(dialog.textContent).toContain("Your unsaved changes will be lost.");

    await stayOnPage();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(harness.router.state.location.pathname).toBe("/guard");

    // Staying preserved the draft, so the guard must still protect it on the
    // very next attempt instead of silently letting work be lost later.
    act(() => {
      void harness.router.navigate("/other");
    });
    const dialogAgain = await openUnsavedChangesDialog();
    expect(dialogAgain.textContent).toContain(
      "Unsaved profile or setup changes",
    );
    await stayOnPage();
    expect(harness.router.state.location.pathname).toBe("/guard");
  });

  it("reaches the requested route exactly once on Leave without saving and stops prompting once the draft is discarded", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController();
    await waitForReady(harness);
    markDirty(harness);

    act(() => {
      void harness.router.navigate("/other");
    });
    await openUnsavedChangesDialog();

    let commitsToOther = 0;
    const unsubscribe = harness.router.subscribe(() => {
      if (harness.router.state.location.pathname === "/other") {
        commitsToOther += 1;
      }
    });

    await leaveWithoutSaving();

    await waitFor(() => {
      expect(harness.router.state.location.pathname).toBe("/other");
    });
    unsubscribe();
    expect(commitsToOther).toBe(1);

    // Leaving was an explicit discard: the stale draft must not keep blocking
    // truthful navigation afterwards.
    act(() => {
      void harness.router.navigate("/guard");
    });
    await waitFor(() => {
      expect(harness.router.state.location.pathname).toBe("/guard");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("blocks a router-owned link click with the dialog instead of window.confirm", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController();
    await waitForReady(harness);
    markDirty(harness);

    fireEvent.click(screen.getByTestId("link-to-other"));

    await openUnsavedChangesDialog();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(harness.router.state.location.pathname).toBe("/guard");

    await stayOnPage();
    expect(harness.router.state.location.pathname).toBe("/guard");
  });

  it("guards back-button history moves truthfully: Escape restores, Leave commits", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController({
      initialEntries: ["/other", "/guard"],
    });
    await waitForReady(harness);
    markDirty(harness);

    await act(async () => {
      await Promise.resolve();
      void harness.router.navigate(-1);
    });

    await openUnsavedChangesDialog();

    // Escape resolves to staying, so closing the dialog can never discard a
    // draft by accident and the history entry stays put.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(harness.router.state.location.pathname).toBe("/guard");

    await act(async () => {
      await Promise.resolve();
      void harness.router.navigate(-1);
    });
    await openUnsavedChangesDialog();
    await leaveWithoutSaving();

    await waitFor(() => {
      expect(harness.router.state.location.pathname).toBe("/other");
    });
  });

  it("exempts hash-only fragment changes so in-page anchors never lose drafts", async () => {
    configureWindowUnemployed(createReadyWorkspace());
    const confirmSpy = vi.spyOn(window, "confirm");
    const harness = mountGuardedController();
    await waitForReady(harness);
    markDirty(harness);

    act(() => {
      void harness.router.navigate("/guard#section-anchor");
    });
    await waitFor(() => {
      expect(harness.router.state.location.hash).toBe("#section-anchor");
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(harness.router.state.location.pathname).toBe("/guard");
    expect(harness.router.state.location.hash).toBe("#section-anchor");
  });
});
