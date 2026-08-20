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
      "Planning & settings",
    ]);
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(navigation.firstElementChild?.className).toContain("max-w-5xl");
    expect(navigation.className).toContain("min-[1440px]:hidden");

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
    ).toContain("min-[900px]:inline");
    const taskCenterLauncher = within(notificationGroup).getByLabelText(
      "Task center: 0 active",
    );
    expect(
      Array.from(taskCenterLauncher.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Task center",
      )?.className,
    ).toContain("min-[900px]:inline");
    expect(navigation.contains(notificationGroup)).toBe(false);

    const windowControls = screen.getByRole("group", {
      name: "Window controls",
    });
    expect(windowControls.parentElement?.className).toContain(
      "absolute right-0 top-0",
    );
    expect(
      document.querySelector("[data-desktop-module-navigation]")?.className,
    ).toContain("absolute");
    expect(navigation.className).toContain("sm:pr-56");
    expect(navigation.className).toContain("max-[899px]:pr-28");
    expect(
      screen.getByRole("button", { name: "Planning and settings" }).className,
    ).toContain("max-[899px]:sticky");
    expect(
      document.querySelector("[data-job-finder-sidebar]")?.className,
    ).toContain("w-[15.5rem]");
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
    expect(moduleNavigation?.className).toContain("absolute");
    expect(sectionNavigation.className).toContain("min-[1440px]:hidden");
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

    expect(workflow?.className).toContain("max-w-5xl");

    const labels = within(navigation)
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\d+/g, "").trim());

    expect(labels).toEqual([
      "Home",
      "Profile",
      "Find jobs",
      "Shortlisted",
      "Applications",
      "Planning & settings",
    ]);

    expect(
      screen.getByRole("group", { name: "Notifications and actions" }),
    ).not.toBeNull();
  });

  it("provides a numbered, self-explanatory sidebar at the wide desktop breakpoint", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    expect(sidebar.className).toContain("min-[1440px]:block");
    expect(sidebar.className).toContain("w-[15.5rem]");

    const sidebarNavigation = within(sidebar).getByRole("navigation", {
      name: "Job Finder sidebar destinations",
    });
    expect(sidebarNavigation.textContent).toContain("Overview");
    expect(sidebarNavigation.textContent).toContain("Your job search");
    expect(sidebarNavigation.textContent).toContain("Plan and improve");
    expect(sidebarNavigation.textContent).toContain("Safety and setup");

    const workflowButtons = [
      within(sidebar).getByRole("button", { name: /^Profile$/ }),
      within(sidebar).getByRole("button", { name: /^Find jobs$/ }),
      within(sidebar).getByRole("button", { name: /^Shortlisted$/ }),
      within(sidebar).getByRole("button", { name: /^Applications$/ }),
    ];
    expect(
      workflowButtons.map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Profile", "Find jobs", "Shortlisted", "Applications"]);
    expect(
      workflowButtons.map((button) => button.firstElementChild?.textContent),
    ).toEqual(["1", "2", "3", "4"]);
    expect(
      within(sidebar).getByRole("button", { name: /^Search plans/ }),
    ).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", {
        name: /^Resume approaches/,
      }),
    ).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", { name: "Needs you" }),
    ).toBeTruthy();
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

    const navigation = screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
    fireEvent.click(
      within(navigation).getByRole("button", {
        name: "Planning and settings",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /^Settings/ }));

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

    expect(shellGrid?.className).toContain("grid-rows-[3.5rem_auto_auto]");
    expect(shellGrid?.className).toContain("sm:grid-rows-[3.5rem_3.75rem]");
    expect(shell?.className).toContain("overflow-y-auto");
    expect(shell?.className).toContain("sm:overflow-hidden");
    expect(header?.className).toContain("relative");
    expect(header?.className).toContain("sm:fixed");
    expect(shellContent?.className).toContain("h-screen");
    expect(shellContent?.className).toContain("min-h-screen");
    expect(shellContent?.className).not.toContain("pt-[18.75rem]");
    expect(shellContent?.className).toContain("sm:pt-[7.25rem]");
    expect(shellContent?.className).toContain("min-[1440px]:pt-14");
    expect(navigation.className).toContain("col-span-2");
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(actions.className).toContain("col-span-2");
    expect(actions.className).toContain("row-start-3");
    expect(actions.className).toContain("sm:top-14");
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "start" });
  });

  it("keeps overflow sections reachable and closes Planning and settings predictably on compact viewports", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);
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
    const moreButton = within(navigation).getByRole("button", {
      name: "Planning and settings",
    });
    expect(moreButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", {
      name: "Planning and settings",
    });
    expect(menu).toBeTruthy();
    expect(
      within(menu).getByRole("menuitem", { name: /Search plans/ }),
    ).toBeTruthy();
    expect(
      within(menu).getByRole("group", { name: "Plan and improve" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: /Search plans/ }),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(moreButton);

    fireEvent.click(moreButton);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(moreButton);
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Resume approaches/ }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/resume-strategies");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("supports complete keyboard navigation in the Planning and settings menu", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const moreButton = screen.getByRole("button", {
      name: "Planning and settings",
    });
    const getMenuItem = (name: RegExp) =>
      screen.getByRole("menuitem", { name });

    fireEvent.keyDown(moreButton, { key: "ArrowUp" });
    expect(document.activeElement).toBe(getMenuItem(/^Settings/));
    expect(getMenuItem(/^Settings/).getAttribute("tabindex")).toBe("0");
    expect(getMenuItem(/^Search plans/).getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(getMenuItem(/^Safeguards/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(getMenuItem(/^Settings/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(getMenuItem(/^Search plans/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(getMenuItem(/^Settings/));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(getMenuItem(/^Search plans/));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(getMenuItem(/^Settings/));

    const nextControl = screen.getByLabelText("Task center: 0 active");
    const nextControlFocus = vi.spyOn(nextControl, "focus");
    const tabWasPrevented = fireEvent.keyDown(
      document.activeElement as HTMLElement,
      { key: "Tab" },
    );
    expect(tabWasPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    // Tab closes the menu and continues to the next control after the planning trigger in DOM order.
    expect(document.activeElement).toBe(nextControl);
    expect(nextControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.click(moreButton);
    expect(document.activeElement).toBe(getMenuItem(/^Search plans/));
    const previousControl = within(
      screen.getByRole("navigation", { name: "Job Finder sections" }),
    ).getByRole("button", { name: /^Applications/ });
    const previousControlFocus = vi.spyOn(previousControl, "focus");
    const tabShiftWasPrevented = fireEvent.keyDown(
      document.activeElement as HTMLElement,
      {
        key: "Tab",
        shiftKey: true,
      },
    );
    expect(tabShiftWasPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(previousControl);
    expect(previousControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "Escape",
    });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });

  it("keeps primary destination labels visible while allowing predictable horizontal scrolling", () => {
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
    const strip = navigation.firstElementChild;

    expect(strip?.className).toContain("overflow-x-auto");
    expect(strip?.className).toContain("overscroll-x-contain");
    expect(strip?.className).not.toContain("sm:overflow-visible");

    for (const label of [
      "Home",
      "Profile",
      "Find jobs",
      "Shortlisted",
      "Applications",
    ]) {
      const button = within(navigation).getByRole("button", {
        name: new RegExp(`^${label}`),
      });
      expect(button.textContent).toContain(label);
      expect(button.querySelector("span")?.className).not.toContain("truncate");
    }
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
    ]) {
      fireEvent.click(
        within(navigation).getByRole("button", {
          name: new RegExp(`^${destination}`),
        }),
      );
    }
    for (const destination of [
      "Search plans",
      "Analytics",
      "Resume approaches",
      "Companies",
      "Safeguards",
      "Settings",
    ]) {
      fireEvent.click(
        within(navigation).getByRole("button", {
          name: "Planning and settings",
        }),
      );
      fireEvent.click(
        screen.getByRole("menuitem", {
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
