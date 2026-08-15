// @vitest-environment jsdom

import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobFinderShell } from "./job-finder-shell";

const windowControlsState = {
  isClosable: true,
  isMaximized: false,
  isMinimizable: true,
} as const;
const scrollToMock = vi.fn();
const scrollIntoViewMock = vi.fn();

function createWorkspace(): JobFinderWorkspaceSnapshot {
  return {
    applicationRecords: [],
    discoveryJobs: Array.from({ length: 24 }, () => ({})),
    profileSetupState: {
      completedAt: null,
      currentStep: "import",
      lastResumedAt: null,
      reviewItems: [],
      status: "not_started",
    },
    reviewQueue: [],
    userActionRequests: [],
  } as unknown as JobFinderWorkspaceSnapshot;
}

function createWorkspaceWithActiveApplyRun(): JobFinderWorkspaceSnapshot {
  const workspace = createWorkspace();
  workspace.applyRuns = [
    {
      id: "apply_running",
      mode: "copilot",
      state: "running",
      jobIds: ["job_1"],
      currentJobId: "job_1",
      createdAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:00:04.000Z",
      completedAt: null,
      totalJobs: 1,
      pendingJobs: 1,
      blockedJobs: 0,
      failedJobs: 0,
    } as unknown as JobFinderWorkspaceSnapshot["applyRuns"][number],
  ];
  workspace.discoveryJobs = [
    {
      id: "job_1",
      company: "Mercury",
      title: "Software Engineer",
    },
  ] as JobFinderWorkspaceSnapshot["discoveryJobs"];
  return workspace;
}

describe("JobFinderShell section navigation", () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    scrollIntoViewMock.mockClear();
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        window: {
          close: vi.fn().mockResolvedValue(undefined),
          getControlsState: vi.fn().mockResolvedValue(windowControlsState),
          minimize: vi.fn().mockResolvedValue(windowControlsState),
          onControlsStateChange: vi.fn(() => vi.fn()),
          toggleMaximize: vi.fn().mockResolvedValue(windowControlsState),
        },
      },
    });

    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("separates the sequential workflow from the Needs you notification control", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
    const destinations = within(navigation)
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\d+/g, "").trim());

    expect(destinations).toEqual([
      "Home",
      "Profile",
      "Find jobs",
      "Shortlisted",
      "Applications",
      "Campaigns",
      "Analytics",
      "Strategies",
      "Companies",
      "Safeguards",
      "Settings",
    ]);
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(navigation.firstElementChild?.className).toContain(
      "grid w-full min-w-0 grid-cols-2",
    );
    expect(navigation.firstElementChild?.className).toContain("sm:grid-cols-3");
    expect(navigation.firstElementChild?.className).toContain("lg:grid-cols-4");
    expect(navigation.firstElementChild?.className).toContain("xl:inline-flex");
    expect(navigation.firstElementChild?.className).toContain("xl:flex-nowrap");
    expect(navigation.firstElementChild?.className).toContain("lg:rounded-3xl");

    const notificationGroup = screen.getByRole("group", {
      name: "Notifications and actions",
    });
    const needsYouButton = within(notificationGroup).getByRole("button", {
      name: "Needs you: 0 unresolved",
    });
    expect(needsYouButton).toBeTruthy();
    expect(
      Array.from(needsYouButton.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Needs you",
      )?.className,
    ).toContain("lg:hidden 2xl:inline");
    const taskCenterLauncher = within(notificationGroup).getByLabelText(
      "Task center: 0 active",
    );
    expect(
      Array.from(taskCenterLauncher.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Task center",
      )?.className,
    ).toContain("lg:hidden 2xl:inline");
    expect(navigation.contains(notificationGroup)).toBe(false);

    const windowControls = screen.getByRole("group", {
      name: "Window controls",
    });
    expect(windowControls.parentElement?.className).toContain(
      "absolute right-0 top-0",
    );
    expect(
      document.querySelector("[data-desktop-module-navigation]")?.className,
    ).toContain("lg:inset-x-0");
    expect(navigation.className).toContain("lg:inset-x-0");
    expect(navigation.className).toContain("lg:px-64");
    expect(navigation.className).toContain("xl:px-52");
  });

  it("reserves the native macOS traffic-light area without shifting centered navigation", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/profile"]}>
        <JobFinderShell platform="darwin" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");
    const brandName = brand?.querySelector("span");
    const moduleNavigation = document.querySelector(
      "[data-desktop-module-navigation]",
    );
    const sectionNavigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });

    expect(brand?.style.paddingInlineStart).toBe("5.5rem");
    expect(brandName?.className).toContain("xl:text-[2rem]");
    expect(brandName?.className).not.toContain("xl:text-[2.7rem]");
    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
    expect(moduleNavigation?.className).toContain("lg:inset-x-0");
    expect(sectionNavigation.className).toContain("lg:inset-x-0");
  });

  it("keeps the complete workflow in one compact row at desktop widths", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/profile"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
    const workflow = navigation.firstElementChild;

    expect(workflow?.className).toContain("grid-cols-2");
    expect(workflow?.className).toContain("sm:grid-cols-3");
    expect(workflow?.className).toContain("lg:grid-cols-4");
    expect(workflow?.className).toContain("xl:inline-flex");
    expect(workflow?.className).toContain("xl:flex-nowrap");
    expect(workflow?.className).toContain("xl:w-auto");

    const labels = within(navigation)
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\d+/g, "").trim());

    expect(labels).toEqual([
      "Home",
      "Profile",
      "Find jobs",
      "Shortlisted",
      "Applications",
      "Campaigns",
      "Analytics",
      "Strategies",
      "Companies",
      "Safeguards",
      "Settings",
    ]);

    expect(
      screen.getByRole("group", { name: "Notifications and actions" }),
    ).not.toBeNull();
  });

  it("updates route context without a scroll jump when navigation completes", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const initialMain = screen.getByRole("main", { name: "Find jobs" });
    expect(document.title).toBe("Find jobs | Job Finder | UnEmployed");
    expect(document.activeElement).toBe(initialMain);
    expect(screen.getByRole("status").textContent).toBe("Find jobs opened.");

    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Job Finder sections" }),
      ).getByRole("button", { name: "Settings" }),
    );

    const settingsMain = screen.getByRole("main", { name: "Settings" });
    expect(document.title).toBe("Settings | Job Finder | UnEmployed");
    expect(document.activeElement).toBe(settingsMain);
    expect(settingsMain.className).toContain("outline-none");
    expect(screen.getByRole("status").textContent).toBe("Settings opened.");
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0 });
  });

  it("keeps the narrow shell controls in reachable reflow rows", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);

    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const header = document.querySelector("[data-job-finder-shell-header]");
    const shell = document.querySelector("[data-job-finder-shell]");
    const shellContent = document.querySelector(
      "[data-job-finder-shell-content]",
    );
    const shellGrid = header?.firstElementChild;
    const navigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
    const actions = screen.getByRole("group", {
      name: "Notifications and actions",
    });

    expect(shellGrid?.className).toContain(
      "grid-rows-[3.5rem_2.5rem_9rem_3.75rem]",
    );
    expect(shellGrid?.className).toContain("sm:grid-rows-[3.5rem_2.5rem_7rem]");
    expect(shell?.className).toContain("overflow-y-auto");
    expect(shell?.className).toContain("sm:overflow-hidden");
    expect(header?.className).toContain("relative");
    expect(header?.className).toContain("sm:fixed");
    expect(shellContent?.className).toContain("h-screen");
    expect(shellContent?.className).toContain("min-h-screen");
    expect(shellContent?.className).not.toContain("pt-[18.75rem]");
    expect(shellContent?.className).toContain("sm:pt-[13rem]");
    expect(navigation.className).toContain("col-span-2");
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(actions.className).toContain("col-span-2");
    expect(actions.className).toContain("row-start-4");
    expect(actions.className).toContain("sm:col-start-3");
    expect(actions.className).toContain("sm:row-start-3");
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "start" });
  });

  it("keeps every responsive destination interactive", () => {
    const onNavigate = vi.fn();

    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell
          onNavigate={onNavigate}
          platform="win32"
          workspace={createWorkspace()}
        >
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });

    for (const destination of [
      "Home",
      "Profile",
      "Find jobs",
      "Shortlisted",
      "Applications",
      "Campaigns",
      "Analytics",
      "Strategies",
      "Companies",
      "Safeguards",
      "Settings",
    ]) {
      fireEvent.click(
        within(navigation).getByRole("button", {
          name: new RegExp(`^${destination}`),
        }),
      );
    }
    fireEvent.click(
      screen.getByRole("button", {
        name: "Needs you: 0 unresolved",
      }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(12);
    expect(onNavigate).toHaveBeenNthCalledWith(1, "/job-finder/home");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "/job-finder/profile/setup");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "/job-finder/discovery");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "/job-finder/review-queue");
    expect(onNavigate).toHaveBeenNthCalledWith(5, "/job-finder/applications");
    expect(onNavigate).toHaveBeenNthCalledWith(6, "/job-finder/campaigns");
    expect(onNavigate).toHaveBeenNthCalledWith(7, "/job-finder/analytics");
    expect(onNavigate).toHaveBeenNthCalledWith(
      8,
      "/job-finder/resume-strategies",
    );
    expect(onNavigate).toHaveBeenNthCalledWith(9, "/job-finder/companies");
    expect(onNavigate).toHaveBeenNthCalledWith(10, "/job-finder/safeguards");
    expect(onNavigate).toHaveBeenNthCalledWith(11, "/job-finder/settings");
    expect(onNavigate).toHaveBeenNthCalledWith(12, "/job-finder/actions");
  });

  it("keeps the Task center launcher in header flow instead of over page content", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const actionGroup = screen.getByRole("group", {
      name: "Notifications and actions",
    });
    const summary = within(actionGroup).getByLabelText("Task center: 0 active");
    const taskCenter = summary?.closest("details");

    expect(taskCenter).toBeInstanceOf(HTMLDetailsElement);
    expect(taskCenter?.className).toContain("relative");
    expect(taskCenter?.className).not.toContain("fixed");
    expect(summary?.className).toContain("h-[3.125rem]");
    expect(summary?.className).toContain("bg-(--surface-panel)");
  });

  it("forwards a failed real-shell cancellation so Task center offers a retry", async () => {
    const onCancelApplyRun = vi.fn(() => Promise.resolve(false));
    render(
      <MemoryRouter initialEntries={["/job-finder/applications"]}>
        <JobFinderShell
          onCancelApplyRun={onCancelApplyRun}
          platform="win32"
          workspace={createWorkspaceWithActiveApplyRun()}
        >
          <div>Applications</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const applyTask = document.querySelector<HTMLElement>(
      '[data-task-kind="apply"]',
    );
    expect(applyTask).not.toBeNull();
    const cancelButton = within(
      applyTask as HTMLElement,
    ).getByRole<HTMLButtonElement>("button", { name: "Cancel task" });

    fireEvent.click(cancelButton);

    await waitFor(() => expect(cancelButton.disabled).toBe(false));
    expect(onCancelApplyRun).toHaveBeenCalledWith("apply_running");
    expect(
      within(applyTask as HTMLElement).getByRole("status").textContent,
    ).toContain("Cancellation did not complete");
  });
});
