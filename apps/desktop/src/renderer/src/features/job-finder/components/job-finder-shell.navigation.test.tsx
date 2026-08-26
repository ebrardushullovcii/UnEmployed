// @vitest-environment jsdom

import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import {
  act,
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

function getCompactInterviewHelperAffordance(): HTMLAnchorElement {
  const affordance = screen
    .getAllByRole("link", { name: "Open Interview Helper" })
    .find(
      (candidate) => !candidate.closest("[data-desktop-module-navigation]"),
    );
  if (!(affordance instanceof HTMLAnchorElement)) {
    throw new Error("Compact Open Interview Helper affordance is missing");
  }
  return affordance;
}

describe("JobFinderShell section navigation", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
      "More",
    ]);
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(navigation.firstElementChild?.className).toContain("max-w-5xl");
    expect(navigation.className).toContain("min-[1440px]:hidden");

    const notificationGroup = screen.getByRole("group", {
      name: "Notifications and actions",
    });
    expect(notificationGroup.className).toContain("min-[1440px]:!top-0");
    expect(notificationGroup.className).toContain("min-[1440px]:!right-36");
    const needsYouButton = within(notificationGroup).getByRole("button", {
      name: "Needs you: 0 unresolved",
    });
    expect(needsYouButton).toBeTruthy();
    expect(
      Array.from(needsYouButton.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Needs you",
      )?.className,
    ).toContain("min-[1440px]:inline");
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
    expect(navigation.className).toContain("sm:pr-64");
    expect(navigation.className).toContain("max-[899px]:pr-40");
    // The desktop module switcher only exists at >=900px CSS width, so the
    // 640-899 band relies on the compact cross-module affordance below.
    const moduleNavigation = document.querySelector(
      "[data-desktop-module-navigation]",
    );
    expect(moduleNavigation?.className).toContain("hidden");
    expect(moduleNavigation?.className).toContain("min-[900px]:flex");
    // Planning is a non-scrolling sibling, so it reserves its own width rather
    // than painting over destinations inside the horizontal scroll viewport.
    const moreButton = screen.getByRole("button", {
      name: "More",
    });
    const moreWrapper = moreButton.parentElement;
    const compactLayout = document.querySelector(
      "[data-job-finder-compact-navigation]",
    );
    const scrollViewport = document.querySelector(
      "[data-job-finder-compact-navigation-scroll]",
    );
    expect(moreWrapper?.className).toContain("shrink-0");
    expect(moreWrapper?.className).toContain("z-10");
    expect(moreWrapper?.className).not.toContain("sticky");
    const interviewHelperAffordance = getCompactInterviewHelperAffordance();
    expect(interviewHelperAffordance.className).toContain("min-[900px]:hidden");
    expect(scrollViewport?.contains(interviewHelperAffordance)).toBe(false);
    expect(Array.from(compactLayout?.children ?? [])).toEqual([
      scrollViewport?.parentElement,
      moreWrapper,
      interviewHelperAffordance,
    ]);
    expect(scrollViewport?.contains(moreButton)).toBe(false);
    expect(
      document.querySelector("[data-job-finder-sidebar]")?.className,
    ).toContain("w-(--job-finder-side-width)");
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
    const notificationGroup = screen.getByRole("group", {
      name: "Notifications and actions",
    });

    expect(brand?.style.paddingInlineStart).toBe("5.5rem");
    expect(brandName?.className).toContain("xl:text-[2rem]");
    expect(brandName?.className).not.toContain("xl:text-[2.7rem]");
    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
    expect(moduleNavigation?.className).toContain("absolute");
    expect(sectionNavigation.className).toContain("min-[1440px]:hidden");
    // On macOS the notification group shares the compact row instead of
    // overlaying the right-aligned module navigation at <900px CSS width.
    expect(notificationGroup.className).toContain("sm:top-14");
    expect(notificationGroup.className).toContain("sm:h-[3.75rem]");
    expect(notificationGroup.className).toContain("min-[900px]:!top-0");
    expect(notificationGroup.className).toContain("min-[900px]:!h-14");
    expect(notificationGroup.className).toContain("sm:right-0");
    expect(notificationGroup.className).not.toContain("sm:top-0");
  });

  it("removes the macOS brand inset when the native controls are hidden", async () => {
    vi.mocked(window.unemployed.window.getControlsState).mockResolvedValueOnce({
      ...windowControlsState,
      isMaximized: true,
    });

    render(
      <MemoryRouter initialEntries={["/job-finder/profile"]}>
        <JobFinderShell platform="darwin" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");

    await waitFor(() => {
      expect(brand?.style.paddingInlineStart).toBe("");
    });
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
      "More",
    ]);

    expect(
      screen.getByRole("group", { name: "Notifications and actions" }),
    ).not.toBeNull();
  });

  it("provides an icon-led, self-explanatory sidebar at the wide desktop breakpoint", () => {
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
    expect(sidebar.className).toContain("w-(--job-finder-side-width)");
    expect(sidebar.className).toContain("bottom-0");
    expect(sidebar.className).toContain("top-14");
    expect(sidebar.className).not.toContain("inset-y-14");

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
      workflowButtons.every(
        (button) => button.firstElementChild?.tagName.toLowerCase() === "svg",
      ),
    ).toBe(true);
    expect(
      within(sidebar).getByRole("button", { name: /^Search plans/ }),
    ).toBeTruthy();
    expect(
      within(sidebar).getByRole("button", {
        name: /^Resume approaches/,
      }),
    ).toBeTruthy();
    // Needs you lives only in the header attention control, never twice.
    expect(
      within(sidebar).queryByRole("button", { name: "Needs you" }),
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Needs you/ })).toHaveLength(
      1,
    );
  });

  it("collapses to one persisted rail without leaving a second content offset", () => {
    const view = render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );
    const content = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-content]",
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(shell?.dataset.sidebarCollapsed).toBe("true");
    expect(shell?.style.getPropertyValue("--job-finder-side-width")).toBe(
      "4rem",
    );
    expect(content?.className).toContain(
      "min-[1440px]:pl-(--job-finder-side-width)",
    );
    expect(
      window.localStorage.getItem("unemployed.job-finder.sidebar-collapsed.v1"),
    ).toBe("true");

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    expect(
      document
        .querySelector<HTMLElement>("[data-job-finder-shell]")
        ?.style.getPropertyValue("--job-finder-side-width"),
    ).toBe("4rem");
  });

  it("keeps the sidebar rail clear of the header paint layers so Collapse stays clickable", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const header = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-header]",
    );
    const shellGrid = header?.firstElementChild;
    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );

    expect(header?.className).toContain("min-[1440px]:h-14");
    expect(shellGrid?.className).toContain("min-[1440px]:!grid-rows-[3.5rem]");
    expect(shellGrid?.className).not.toContain("min-[1440px]:grid-rows");
    expect(header?.className).toContain("z-50");
    expect(sidebar.className).toContain("top-14");
    expect(sidebar.className).toContain("z-40");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(shell?.dataset.sidebarCollapsed).toBe("true");
  });

  it("mounts the collapse toggle YouTube-style at the top of the aside", () => {
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
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    const handle = toggle.closest<HTMLElement>(
      "[data-job-finder-sidebar-toggle]",
    );
    const nav = screen.getByRole("navigation", {
      name: "Job Finder sidebar destinations",
    });

    expect(handle).toBeTruthy();
    // Lives INSIDE the sidebar, before the nav — never jumps between states.
    expect(sidebar.contains(toggle)).toBe(true);
    expect(nav.previousElementSibling).toBe(handle);
    expect(handle?.className).not.toContain("fixed");
    // Electron drag region opt-out must stay inline or clicks die on the header.
    expect(
      (handle?.style as unknown as Record<string, string | undefined>)
        .WebkitAppRegion,
    ).toBe("no-drag");
  });

  it("keeps the collapse toggle clickable and stable across states", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    fireEvent.click(toggle);

    const expandedToggle = screen.getByRole("button", {
      name: "Expand sidebar",
    });
    expect(expandedToggle.closest("[data-job-finder-sidebar-toggle]")).toBe(
      toggle.closest("[data-job-finder-sidebar-toggle]"),
    );
    // YouTube-style: the hamburger icon itself never moves or rotates.
    expect(expandedToggle.querySelector("svg")).toBe(
      toggle.querySelector("svg"),
    );
  });

  it("pairs the sidebar toggle with an icon, accessible name, and hover tooltip", async () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(trigger.querySelector("svg")).toBeTruthy();

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.pointerMove(trigger, { pointerType: "mouse" });

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Collapse sidebar");
    expect(trigger.getAttribute("aria-describedby")).toBe(
      tooltip.getAttribute("id"),
    );

    fireEvent.click(trigger);
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    const expandTrigger = screen.getByRole("button", {
      name: "Expand sidebar",
    });
    fireEvent.pointerEnter(expandTrigger, { pointerType: "mouse" });
    fireEvent.pointerMove(expandTrigger, { pointerType: "mouse" });

    await waitFor(() => {
      const expandTooltip = screen.getByRole("tooltip");
      expect(expandTooltip.textContent).toContain("Expand sidebar");
      expect(expandTrigger.getAttribute("aria-describedby")).toBe(
        expandTooltip.getAttribute("id"),
      );
    });
  });

  it("names rail destinations after their visible labels and shares them through tooltips", async () => {
    window.localStorage.setItem(
      "unemployed.job-finder.sidebar-collapsed.v1",
      "true",
    );
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
    const tooltipLabels = () =>
      screen.queryAllByRole("tooltip").map((node) => node.textContent);

    const hover = async (trigger: HTMLElement, label: string) => {
      fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
      fireEvent.pointerMove(trigger, { pointerType: "mouse" });
      await waitFor(() => expect(tooltipLabels()).toContain(label));
      const tooltip = screen
        .getAllByRole("tooltip")
        .find((node) => node.textContent === label);
      expect(tooltip?.getAttribute("id")).toBe(
        trigger.getAttribute("aria-describedby"),
      );
    };

    const outcomesTrigger = within(sidebar).getByRole("button", {
      name: "Outcomes",
    });
    expect(outcomesTrigger.getAttribute("title")).toBeNull();
    await hover(outcomesTrigger, "Outcomes");

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    const profileTrigger = within(sidebar).getByRole("button", {
      name: "Profile",
    });
    await hover(profileTrigger, "Profile");
  });

  it("keeps Home on the shared page gutter ladder instead of a wider desktop gutter", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/home"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const homeMain = screen.getByRole("main", { name: "Home" });
    expect(homeMain.className).toContain("px-3");
    expect(homeMain.className).not.toContain("sm:px-4");
    expect(homeMain.className).toContain("min-[1440px]:px-4");
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
        name: "More",
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "More" }),
      ).getByRole("button", { name: /^Settings/ }),
    );

    const settingsMain = screen.getByRole("main", { name: "Settings" });
    expect(document.title).toBe("Settings | Job Finder | UnEmployed");
    expect(document.activeElement).toBe(settingsMain);
    expect(settingsMain.className).toContain("outline-none");
    expect(screen.getByRole("status").textContent).toBe("Settings opened.");
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0 });
  });

  it("labels the analytics route Outcomes across title, announcement, and main", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/analytics"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("main", { name: "Outcomes" })).toBeTruthy();
    expect(document.title).toBe("Outcomes | Job Finder | UnEmployed");
    expect(screen.getByRole("status").textContent).toBe("Outcomes opened.");
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
    expect(shellContent?.className).toContain("min-[1440px]:!pt-14");
    expect(navigation.className).toContain("col-span-2");
    expect(navigation.className).not.toContain("overflow-hidden");
    expect(actions.className).toContain("col-span-2");
    expect(actions.className).toContain("row-start-3");
    expect(actions.className).toContain("sm:top-14");
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 639px)");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "start" });
  });

  it("keeps overflow sections reachable and closes the More menu predictably on compact viewports", () => {
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
      name: "More",
    });
    expect(moreButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    const menu = screen.getByRole("navigation", {
      name: "More",
    });
    expect(menu).toBeTruthy();
    expect(
      within(menu).getByRole("button", { name: /Search plans/ }),
    ).toBeTruthy();
    expect(
      within(menu).getByRole("group", { name: "Plan and improve" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(menu).getByRole("button", { name: /Search plans/ }),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();
    expect(document.activeElement).toBe(moreButton);

    fireEvent.click(moreButton);
    expect(
      screen.getByRole("navigation", { name: "More" }),
    ).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();

    fireEvent.click(moreButton);
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "More" }),
      ).getByRole("button", { name: /Resume approaches/ }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/resume-strategies");
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();
  });

  it("supports complete keyboard navigation in the More menu", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const moreButton = screen.getByRole("button", {
      name: "More",
    });
    const getDestinationButton = (name: RegExp) =>
      within(
        screen.getByRole("navigation", { name: "More" }),
      ).getByRole("button", { name });

    fireEvent.keyDown(moreButton, { key: "ArrowUp" });
    expect(document.activeElement).toBe(getDestinationButton(/^Settings/));
    expect(getDestinationButton(/^Settings/).getAttribute("tabindex")).toBe("0");
    expect(getDestinationButton(/^Search plans/).getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Documents/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Settings/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Search plans/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Settings/));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(getDestinationButton(/^Search plans/));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(getDestinationButton(/^Settings/));

    // The compact cross-module affordance follows the Planning trigger in DOM
    // order, so closing with Tab lands on it first.
    const interviewHelperControl = getCompactInterviewHelperAffordance();
    const nextControlFocus = vi.spyOn(interviewHelperControl, "focus");
    const tabWasPrevented = fireEvent.keyDown(
      document.activeElement as HTMLElement,
      { key: "Tab" },
    );
    expect(tabWasPrevented).toBe(false);
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();
    // Tab closes the menu and continues to the next control after the planning trigger in DOM order.
    expect(document.activeElement).toBe(interviewHelperControl);
    expect(nextControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.click(moreButton);
    expect(document.activeElement).toBe(getDestinationButton(/^Search plans/));
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
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();
    expect(document.activeElement).toBe(previousControl);
    expect(previousControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "Escape",
    });
    expect(
      screen.queryByRole("navigation", { name: "More" }),
    ).toBeNull();
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
    const strip = navigation.querySelector(
      "[data-job-finder-compact-navigation-scroll]",
    );

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

  it("never renders the More trigger as sliced glyphs at any top-strip width", () => {
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
    const moreButton = within(navigation).getByRole("button", {
      name: "More",
    });
    const visibleLabel = Array.from(moreButton.querySelectorAll("span")).find(
      (span) => span.textContent === "More",
    );

    // The labeled trigger cannot fit between the 900px module-nav breakpoint
    // and the 1440px sidebar takeover, where it rendered cut mid-glyph. The
    // compact icon treatment therefore spans the strip's whole lifetime, so
    // no width renders a partial label.
    expect(visibleLabel?.className).toBe("sr-only");
    expect(moreButton.className).not.toContain("max-[899px]");
    expect(moreButton.className).toContain("bg-(--surface-panel-raised)");
    expect(moreButton.className).toContain("border-(--surface-panel-border)");
    expect(moreButton.querySelector("svg")).toBeTruthy();
    // Icon-only stays self-explanatory through tooltip and accessible name.
    expect(moreButton.getAttribute("title")).toBe("More");

    // Destinations have their own horizontal-scroll viewport while the intact
    // trigger remains visible in reserved sibling space.
    const strip = navigation.querySelector(
      "[data-job-finder-compact-navigation-scroll]",
    );
    expect(strip?.className).toContain("[scrollbar-width:none]");
    expect(strip?.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(strip?.className).not.toContain("[scrollbar-width:thin]");
    expect(strip?.contains(moreButton)).toBe(false);
    expect(moreButton.parentElement?.className).toContain("shrink-0");
    expect(moreButton.closest(".sticky")).toBeNull();

    // Overflow is contained by the shell; the document never scrolls sideways.
    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );
    expect(shell?.className).toContain("overflow-x-hidden");
    expect(navigation.className).not.toContain("overflow-x-hidden");
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
      "Outcomes",
      "Resume approaches",
      "Companies",
      "Safeguards",
      "Documents",
      "Settings",
    ]) {
      fireEvent.click(
        within(navigation).getByRole("button", {
          name: "More",
        }),
      );
      fireEvent.click(
        within(
          screen.getByRole("navigation", { name: "More" }),
        ).getByRole("button", {
          name: new RegExp(`^${destination}`),
        }),
      );
    }
    fireEvent.click(
      screen.getByRole("button", {
        name: "Needs you: 0 unresolved",
      }),
    );

    expect(onNavigate).toHaveBeenCalledTimes(13);
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
    expect(onNavigate).toHaveBeenNthCalledWith(11, "/job-finder/documents");
    expect(onNavigate).toHaveBeenNthCalledWith(12, "/job-finder/settings");
    expect(onNavigate).toHaveBeenNthCalledWith(13, "/job-finder/actions");
  });

  it("counts every search plan in the sidebar without treating plans as attention", () => {
    const workspace = createWorkspace();
    workspace.campaigns = [
      { id: "campaign_default", name: "My job search" },
    ] as unknown as JobFinderWorkspaceSnapshot["campaigns"];

    render(
      <MemoryRouter initialEntries={["/job-finder/campaigns"]}>
        <JobFinderShell platform="win32" workspace={workspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const campaignsButton = within(sidebar).getByRole("button", {
      name: /^Search plans/,
    });
    expect(campaignsButton.textContent).toContain("1");
    expect(
      within(sidebar).getByRole("button", { name: "Search plans" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "More" }),
    ).toBeTruthy();
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
    expect(summary?.className).toContain("h-10");
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

describe("JobFinderShell compact nav responsive contract", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
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
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function getSectionNavigation() {
    return screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
  }

  // jsdom cannot lay out pixels, so these are static DOM contracts per CSS
  // breakpoint bucket. Exact pixel geometry acceptance stays with
  // the Electron visual harness. 1152 is the native 125%-zoom CSS width
  // (physical 1440 / 1.25) that the stale [1120,1440) grid regime crushed.
  it.each([1119, 1152, 1279, 1280, 1439])(
    "keeps every core destination scrollable beside reserved Planning space at %spx",
    (width) => {
      expect(width).toBeLessThan(1440);
      render(
        <MemoryRouter initialEntries={["/job-finder/discovery"]}>
          <JobFinderShell platform="win32" workspace={createWorkspace()}>
            <div>Current screen</div>
          </JobFinderShell>
        </MemoryRouter>,
      );

      const navigation = getSectionNavigation();
      expect(navigation.className).toContain("min-[1440px]:hidden");

      const strip = navigation.querySelector(
        "[data-job-finder-compact-navigation-scroll]",
      );
      const contentRow = navigation.querySelector(
        "[data-job-finder-compact-navigation-content]",
      );
      expect(contentRow?.className).toContain("flex-nowrap");
      expect(strip?.className).toContain("overflow-x-auto");
      expect(strip?.className).toContain("overscroll-x-contain");

      const destinations = within(navigation)
        .getAllByRole("button")
        .map((button) => button.textContent?.replace(/\d+/g, "").trim());
      expect(destinations).toEqual([
        "Home",
        "Profile",
        "Find jobs",
        "Shortlisted",
        "Applications",
        "More",
      ]);

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
        const labelSpan = button.querySelector("span");
        expect(labelSpan?.className).toContain("whitespace-nowrap");
        expect(button.className).toContain("shrink-0");
        expect(strip?.contains(button)).toBe(true);
      }

      const moreWrapper = within(navigation).getByRole("button", {
        name: "More",
      }).parentElement;
      expect(moreWrapper?.className).toContain("shrink-0");
      expect(moreWrapper?.className).toContain("z-10");
      expect(moreWrapper?.className).not.toContain("sticky");
      expect(strip?.contains(moreWrapper)).toBe(false);

      const interviewHelperAffordance = getCompactInterviewHelperAffordance();
      expect(interviewHelperAffordance.className).toContain(
        "min-[900px]:hidden",
      );
      expect(strip?.contains(interviewHelperAffordance)).toBe(false);

      expect(
        screen.getAllByRole("button", { name: /^Needs you/ }),
      ).toHaveLength(1);
      expect(
        screen.getByRole("group", { name: "Window controls" }),
      ).toBeTruthy();
    },
  );

  it.each([1440])(
    "moves destinations to the sidebar and keeps one header attention control at %spx",
    (width) => {
      expect(width).toBeGreaterThanOrEqual(1440);
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
      expect(sidebar.className).not.toContain("min-[1120px]:block");
      expect(sidebar.className).toContain("w-(--job-finder-side-width)");
      expect(sidebar.textContent).not.toContain("Needs you");

      const navigation = getSectionNavigation();
      expect(navigation.className).toContain("min-[1440px]:hidden");

      expect(
        screen.getAllByRole("button", { name: /^Needs you/ }),
      ).toHaveLength(1);
      expect(
        screen.getByRole("group", { name: "Window controls" }),
      ).toBeTruthy();
      const shell = document.querySelector<HTMLElement>(
        "[data-job-finder-shell]",
      );
      const content = document.querySelector<HTMLElement>(
        "[data-job-finder-shell-content]",
      );
      expect(content?.className).toContain(
        "min-[1440px]:pl-(--job-finder-side-width)",
      );
      expect(content?.className).not.toContain(
        "min-[1120px]:pl-(--job-finder-side-width)",
      );
      expect(shell?.style.getPropertyValue("--job-finder-side-width")).toBe(
        "17rem",
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(shell?.dataset.sidebarCollapsed).toBe("true");
      expect(shell?.style.getPropertyValue("--job-finder-side-width")).toBe(
        "4rem",
      );
      expect(content?.className).toContain(
        "min-[1440px]:pl-(--job-finder-side-width)",
      );
    },
  );

  it("never hides the active advanced route behind the Planning trigger", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/analytics"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const moreButton = within(getSectionNavigation()).getByRole("button", {
      name: "More",
    });
    expect(moreButton.className).toContain("bg-accent");
    expect(moreButton.getAttribute("aria-expanded")).toBe("false");
  });

  it("hides zero count badges while distinguishing inventory from attention counts", () => {
    const workspace = createWorkspace() as unknown as Record<string, unknown> &
      JobFinderWorkspaceSnapshot;
    workspace.campaigns = [
      {
        id: "campaign_1",
        jobIds: ["job_1", "job_2"],
        name: "My plan",
      },
    ] as JobFinderWorkspaceSnapshot["campaigns"];
    workspace.discoveryJobs = [
      { id: "job_1", company: "Acme", title: "Engineer I" },
      { id: "job_2", company: "Globex", title: "Engineer II" },
    ] as JobFinderWorkspaceSnapshot["discoveryJobs"];
    workspace.userActionRequests = [
      { id: "request_1", state: "pending" },
    ] as unknown as JobFinderWorkspaceSnapshot["userActionRequests"];

    render(
      <MemoryRouter initialEntries={["/job-finder/home"]}>
        <JobFinderShell platform="win32" workspace={workspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const navigation = getSectionNavigation();
    const findJobsButton = within(navigation).getByRole("button", {
      name: /^Find jobs/,
    });
    const inventoryBadge = findJobsButton.querySelector("span:last-child");
    expect(inventoryBadge?.className).toContain("bg-(--input)");
    // Inventory volume is visual-only: hidden from assistive tech traversal
    // while the labeled destination stays the sole announced content.
    expect(inventoryBadge?.getAttribute("aria-hidden")).toBe("true");

    workspace.intelligence = {
      safeguards: {
        abnormalFailurePauses: [],
        companyApplicationCaps: [{ id: "cap_1", limitReached: true }],
        contradictoryAnswerDetections: [],
        listingSignals: [],
        preparedBatchSampleReviews: [],
        safeguardDismissals: [],
        simultaneousApplicationConflicts: [],
        updatedAt: null,
      },
    } as unknown as JobFinderWorkspaceSnapshot["intelligence"];

    cleanup();
    render(
      <MemoryRouter initialEntries={["/job-finder/home"]}>
        <JobFinderShell platform="win32" workspace={workspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const sidebarWithAttention = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const safeguardsButton = within(sidebarWithAttention).getByRole("button", {
      name: "Safeguards: 1 need attention",
    });
    const attentionBadge = Array.from(
      safeguardsButton.querySelectorAll("span"),
    ).at(-1);
    expect(attentionBadge?.textContent).toBe("1");
    // Attention work waiting on the user stays announced.
    expect(attentionBadge?.getAttribute("aria-hidden")).toBeNull();

    const needsYouButton = screen.getByRole("button", {
      name: "Needs you: 1 unresolved",
    });
    const needsYouBadge = Array.from(
      needsYouButton.querySelectorAll("span"),
    ).at(-1);
    expect(needsYouBadge?.className).toContain("bg-primary");
    expect(needsYouBadge?.getAttribute("aria-hidden")).toBeNull();
    expect(needsYouButton.textContent).toContain("1");

    const planningTrigger = within(getSectionNavigation()).getByRole("button", {
      name: "More: 1 need attention",
    });
    fireEvent.click(planningTrigger);
    expect(
      within(
        screen.getByRole("navigation", { name: "More" }),
      ).getByRole("button", { name: "Safeguards: 1 need attention" }),
    ).toBeTruthy();

    const emptyWorkspace = createWorkspace();
    cleanup();
    render(
      <MemoryRouter initialEntries={["/job-finder/home"]}>
        <JobFinderShell platform="win32" workspace={emptyWorkspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const compactNavigation = getSectionNavigation();
    for (const button of within(compactNavigation).getAllByRole("button")) {
      expect(button.textContent?.trim()).not.toContain("0");
    }
    const emptyNeedsYou = screen.getByRole("button", {
      name: "Needs you: 0 unresolved",
    });
    expect(emptyNeedsYou.textContent).not.toContain("0");
    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    expect(sidebar.textContent).not.toContain("0");
  });

  it("lists supported shortcuts once inside the More menu without destructive actions", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="darwin" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "More" }),
    );
    const shortcutsGroup = screen.getByRole("group", {
      name: "Keyboard shortcuts",
    });
    const shortcutText = shortcutsGroup.textContent ?? "";
    expect(shortcutText).toContain("Search current plan and workspace");
    expect(shortcutText).toContain("Show or hide the sidebar");
    expect(within(shortcutsGroup).getAllByText("⌘K")).toHaveLength(1);
    expect(within(shortcutsGroup).getAllByText("/")).toHaveLength(1);
    expect(within(shortcutsGroup).getAllByText("⌘B")).toHaveLength(1);
    expect(shortcutText).not.toMatch(/approve|delete|submit/i);

    // The help rows are informational: they must never become operable
    // controls or steal Enter activation from real destinations.
    expect(within(shortcutsGroup).queryAllByRole("button")).toEqual([]);
  });
});

describe("JobFinderShell keyboard shortcuts", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
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
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubWideLayout(wide: boolean) {
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches: wide && query === "(min-width: 1440px)",
        }) as MediaQueryList,
    );
  }

  function createSearchableWorkspace(): JobFinderWorkspaceSnapshot {
    const workspace = createWorkspace();
    workspace.activeCampaignId = "campaign-active";
    workspace.campaigns = [
      {
        description: "Active plan",
        id: "campaign-active",
        jobIds: ["job_1", "job_2"],
        mode: "precision",
        name: "Active plan",
        status: "active",
      },
    ] as JobFinderWorkspaceSnapshot["campaigns"];
    workspace.discoveryJobs = [
      {
        id: "job_1",
        company: "Acme",
        title: "Platform Engineer",
      },
      {
        id: "job_2",
        company: "Globex",
        title: "Field Engineer",
      },
    ] as JobFinderWorkspaceSnapshot["discoveryJobs"];
    return workspace;
  }

  function renderShellWithShortcuts(
    options: { darwin?: boolean; wide?: boolean } = {},
  ) {
    stubWideLayout(options.wide ?? false);
    const onNavigate = vi.fn();
    const view = render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell
          onNavigate={onNavigate}
          platform={options.darwin ? "darwin" : "win32"}
          workspace={createSearchableWorkspace()}
        >
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );
    return { onNavigate, view };
  }

  it("toggles and persists the sidebar with Cmd/Ctrl+B only at the wide layout", () => {
    const { view } = renderShellWithShortcuts({ wide: true });
    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );

    fireEvent.keyDown(document, { ctrlKey: true, key: "b" });
    expect(shell?.dataset.sidebarCollapsed).toBe("true");
    expect(
      window.localStorage.getItem("unemployed.job-finder.sidebar-collapsed.v1"),
    ).toBe("true");

    fireEvent.keyDown(document, { metaKey: true, key: "b" });
    expect(shell?.dataset.sidebarCollapsed).toBe("false");
    expect(
      window.localStorage.getItem("unemployed.job-finder.sidebar-collapsed.v1"),
    ).toBe("false");

    view.unmount();

    const narrowView = renderShellWithShortcuts({ wide: false });
    const narrowShell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );
    fireEvent.keyDown(document, { ctrlKey: true, key: "b" });
    expect(narrowShell?.dataset.sidebarCollapsed).toBe("false");
    narrowView.view.unmount();
  });

  it.each([
    { label: "an open Planning popover", setup: "more-menu" },
    { label: "the global search overlay", setup: "search-dialog" },
  ] as const)(
    "ignores Cmd+B while $label owns the surface",
    async ({ setup }) => {
      renderShellWithShortcuts({ wide: true });
      const shell = document.querySelector<HTMLElement>(
        "[data-job-finder-shell]",
      );

      if (setup === "more-menu") {
        fireEvent.click(
          screen.getByRole("button", { name: "More" }),
        );
      } else {
        fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
        await waitFor(() =>
          expect(
            screen.getByRole("dialog", {
              name: "Search current plan and workspace",
            }),
          ),
        );
      }

      fireEvent.keyDown(document, { ctrlKey: true, key: "b" });
      expect(shell?.dataset.sidebarCollapsed).toBe("false");
    },
  );

  it.each([
    { extra: { isComposing: true }, why: "IME composition" },
    { extra: {}, why: "defaultPrevented events" },
  ])("ignores Cmd+B during $why", ({ extra }) => {
    renderShellWithShortcuts({ wide: true });
    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-shell]",
    );

    if ("isComposing" in extra && extra.isComposing) {
      fireEvent.keyDown(document, {
        ctrlKey: true,
        isComposing: true,
        key: "b",
      });
    } else {
      const blocked = new KeyboardEvent("keydown", {
        cancelable: true,
        ctrlKey: true,
        key: "b",
      });
      blocked.preventDefault();
      document.dispatchEvent(blocked);
    }

    expect(shell?.dataset.sidebarCollapsed).toBe("false");
  });

  it("exposes the sidebar toggle shortcut through tooltip and aria-keyshortcuts", async () => {
    renderShellWithShortcuts({ darwin: true, wide: true });
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Meta+b");

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.pointerMove(trigger, { pointerType: "mouse" });

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("⌘B");
  });

  it("states the real Cmd+B scope in the Planning shortcuts help", async () => {
    renderShellWithShortcuts({ darwin: true, wide: true });

    fireEvent.click(
      screen.getByRole("button", { name: "More" }),
    );
    // The Planning menu portals to document.body; wait for it to mount.
    await screen.findByRole("navigation", {
      name: "More",
    });

    // The help must not overpromise: the combo only works at the wide layout,
    // outside overlays, search, and editable fields.
    expect(document.body.textContent).toContain(
      "Wide layout only, outside overlays, search, and editable fields",
    );
  });

  it("opens the grouped global search with Cmd/Ctrl+K, searches, and navigates", async () => {
    const { onNavigate } = renderShellWithShortcuts({});

    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
    const dialog = await screen.findByRole("dialog", {
      name: "Search current plan and workspace",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const input = screen.getByRole("combobox", {
      name: "Search current plan and workspace",
    });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "platform" } });
    expect(await screen.findByText("1 result")).toBeTruthy();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNavigate).toHaveBeenCalledWith(
      "/job-finder/discovery?jobId=job_1",
    );
    expect(
      screen.queryByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();
  });

  it("refocuses the search field instead of stacking overlays on repeated Cmd/Ctrl+K", async () => {
    renderShellWithShortcuts({});

    fireEvent.keyDown(document, { metaKey: true, key: "k" });
    await screen.findByRole("dialog", {
      name: "Search current plan and workspace",
    });

    fireEvent.keyDown(document, { metaKey: true, key: "k" });

    expect(
      screen.getAllByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toHaveLength(1);
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", {
        name: "Search current plan and workspace",
      }),
    );
  });

  it("closes the search overlay with Escape and restores focus to its opener", async () => {
    renderShellWithShortcuts({});

    const opener = screen.getByRole("button", {
      name: "Search current plan and workspace",
    });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog", {
      name: "Search current plan and workspace",
    });

    fireEvent.keyDown(
      screen.getByRole("combobox", {
        name: "Search current plan and workspace",
      }),
      { key: "Escape" },
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("accepts the slash alias only outside editable, interactive, and modal contexts", async () => {
    const { view } = renderShellWithShortcuts({});

    fireEvent.keyDown(document.body, { key: "/" });
    await screen.findByRole("dialog", {
      name: "Search current plan and workspace",
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();

    view.unmount();

    const guarded = renderShellWithShortcuts({});
    const editableField = document.createElement("input");
    document.body.appendChild(editableField);
    editableField.focus();
    fireEvent.keyDown(editableField, { key: "/" });
    expect(
      screen.queryByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "More" }),
    );
    expect(screen.getByRole("navigation", { name: "More" }));
    fireEvent.keyDown(document, { key: "/" });
    expect(
      screen.queryByRole("dialog", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();
    expect(screen.getByRole("navigation", { name: "More" }));

    editableField.remove();
    guarded.view.unmount();
  });
});

describe("JobFinderShell responsive shell contract", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
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
    window.localStorage.clear();
    Reflect.deleteProperty(window, "visualViewport");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function getSectionNavigation() {
    return screen.getByRole("navigation", {
      name: "Job Finder sections",
    });
  }

  function getRouteScroller() {
    const scroller = document.querySelector<HTMLDivElement>(
      "[data-job-finder-compact-navigation-scroll]",
    );
    if (!scroller) {
      throw new Error("Compact route scroller is missing");
    }
    return scroller;
  }

  function setScrollGeometry(
    element: HTMLElement,
    geometry: { clientWidth: number; scrollLeft: number; scrollWidth: number },
  ) {
    for (const [key, value] of Object.entries(geometry)) {
      Object.defineProperty(element, key, { configurable: true, value });
    }
  }

  function stubVisualViewportSize(size: { height: number; width: number }) {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        ...size,
      },
    });
  }

  function stubCapturingResizeObserver(): Array<{
    disconnected: boolean;
    target: Element;
    trigger: () => void;
  }> {
    const observations: Array<{
      disconnected: boolean;
      target: Element;
      trigger: () => void;
    }> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(target: Element) {
          const record = {
            disconnected: false,
            target,
            trigger: () => {
              this.callback([], this as unknown as ResizeObserver);
            },
          };
          observations.push(record);
        }

        unobserve() {}

        disconnect() {
          for (const record of observations) {
            record.disconnected = true;
          }
        }
      },
    );
    return observations;
  }

  function stubPlanningTriggerGeometry(button: HTMLElement) {
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      bottom: 400,
      height: 40,
      left: 800,
      right: 900,
      toJSON: () => ({}),
      top: 360,
      width: 100,
      x: 800,
      y: 360,
    } as DOMRect);
  }

  function renderShell(
    initialPath = "/job-finder/discovery",
    onNavigate?: (path: string) => void,
  ) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <JobFinderShell
          {...(onNavigate ? { onNavigate } : {})}
          platform="win32"
          workspace={createWorkspace()}
        >
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );
  }

  it.each([639, 640, 899])(
    "hides the desktop module switcher and keeps one compact cross-module affordance beside Planning at %spx CSS",
    (width) => {
      expect(width).toBeLessThan(900);
      renderShell();

      const moduleNavigation = document.querySelector(
        "[data-desktop-module-navigation]",
      );
      expect(moduleNavigation?.className).toContain("hidden");
      expect(moduleNavigation?.className).toContain("min-[900px]:flex");

      const affordanceCount = screen
        .getAllByRole("link", { name: "Open Interview Helper" })
        .filter(
          (candidate) => !candidate.closest("[data-desktop-module-navigation]"),
        ).length;
      expect(affordanceCount).toBe(1);

      const affordance = getCompactInterviewHelperAffordance();
      expect(affordance.className).toContain("min-[900px]:hidden");
      expect(affordance.tagName).toBe("A");
      expect(affordance.getAttribute("href")).toBe("#/interview-helper");
      expect(getRouteScroller().contains(affordance)).toBe(false);

      const compactLayout = document.querySelector(
        "[data-job-finder-compact-navigation]",
      );
      const moreWrapper = within(getSectionNavigation()).getByRole("button", {
        name: "More",
      }).parentElement;
      expect(Array.from(compactLayout?.children ?? [])).toEqual([
        getRouteScroller().parentElement,
        moreWrapper,
        affordance,
      ]);

      // Utilities stay unique and reachable in the 640-899 band.
      expect(
        screen.getAllByRole("button", {
          name: "Search current plan and workspace",
        }),
      ).toHaveLength(1);
      expect(screen.getAllByLabelText("Task center: 0 active")).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: /^Needs you/ }),
      ).toHaveLength(1);
    },
  );

  it.each([900, 1160, 1439])(
    "preserves the centered desktop module navigation at %spx CSS",
    (width) => {
      expect(width).toBeGreaterThanOrEqual(900);
      renderShell();

      const moduleNavigation = document.querySelector<HTMLElement>(
        "[data-desktop-module-navigation]",
      );
      expect(moduleNavigation?.className).toContain("min-[900px]:!absolute");
      expect(moduleNavigation?.className).toContain("min-[900px]:inset-x-0");
      expect(moduleNavigation?.className).toContain("min-[900px]:top-0");
      expect(moduleNavigation?.className).toContain("min-[900px]:flex");
      expect(moduleNavigation?.className).toContain("justify-center");

      const moduleTwin = within(moduleNavigation as HTMLElement).getByRole(
        "button",
        { name: "Open Interview Helper" },
      );
      expect(moduleTwin.getAttribute("aria-current")).toBeNull();

      expect(getCompactInterviewHelperAffordance().className).toContain(
        "min-[900px]:hidden",
      );
    },
  );

  it("renders the current module non-interactive with aria-current and keeps the other module a button", () => {
    renderShell();

    const moduleNavigation = document.querySelector<HTMLElement>(
      "[data-desktop-module-navigation]",
    );
    if (!moduleNavigation) {
      throw new Error("Desktop module navigation is missing");
    }

    // Job Finder is current: a plain marker with aria-current, not a
    // focusable button that announces an action it cannot perform.
    const currentModule = within(moduleNavigation).getByText("Job Finder");
    expect(currentModule.tagName).toBe("SPAN");
    expect(currentModule.getAttribute("aria-current")).toBe("page");
    expect(
      within(moduleNavigation).queryByRole("button", { name: "Job Finder" }),
    ).toBeNull();

    // The other module stays an actionable button without aria-current.
    const interviewHelperButton = within(moduleNavigation).getByRole("button", {
      name: "Open Interview Helper",
    });
    expect(interviewHelperButton.getAttribute("aria-current")).toBeNull();
  });

  it("reveals the active route button when mounting mid-strip", () => {
    renderShell("/job-finder/applications");

    const applicationsButton = within(getSectionNavigation()).getByRole(
      "button",
      { name: /^Applications/ },
    );
    const nearestRevealTargets = scrollIntoViewMock.mock.calls
      .map((call: unknown[], index: number) =>
        (call[0] as { block?: string } | undefined)?.block === "nearest"
          ? scrollIntoViewMock.mock.contexts[index]
          : null,
      )
      .filter((target): target is HTMLElement => target instanceof HTMLElement);

    expect(nearestRevealTargets).toContain(applicationsButton);
  });

  it("reveals the newly active route after strip navigation", () => {
    renderShell();
    scrollIntoViewMock.mockClear();

    fireEvent.click(
      within(getSectionNavigation()).getByRole("button", {
        name: /^Applications/,
      }),
    );

    const applicationsButton = within(getSectionNavigation()).getByRole(
      "button",
      { name: /^Applications/ },
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    const nearestRevealTargets = scrollIntoViewMock.mock.contexts.filter(
      (target) => target instanceof HTMLElement,
    );
    expect(nearestRevealTargets).toContain(applicationsButton);
  });

  it("reveals a route button when keyboard focus reaches it", () => {
    renderShell();

    const shortlistedButton = within(getSectionNavigation()).getByRole(
      "button",
      { name: /^Shortlisted/ },
    );
    scrollIntoViewMock.mockClear();

    fireEvent.focus(shortlistedButton);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoViewMock.mock.contexts[0]).toBe(shortlistedButton);
  });

  it("suppresses the classic scrollbar while reserving edge breathing room", () => {
    renderShell();

    const scroller = getRouteScroller();
    expect(scroller.className).toContain("[scrollbar-width:none]");
    expect(scroller.className).toContain("[-ms-overflow-style:none]");
    expect(scroller.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(scroller.className).not.toContain("[scrollbar-width:thin]");
    expect(scroller.className).toContain("px-1");

    const startFade = document.querySelector(
      "[data-job-finder-compact-navigation-fade-start]",
    );
    const endFade = document.querySelector(
      "[data-job-finder-compact-navigation-fade-end]",
    );
    expect(startFade?.getAttribute("aria-hidden")).toBe("true");
    expect(endFade?.getAttribute("aria-hidden")).toBe("true");
    expect(startFade?.className).toContain("opacity-0");
    expect(endFade?.className).toContain("opacity-0");
  });

  it("drives overflow fades from live geometry across start, middle, end, and no-overflow", () => {
    const observations = stubCapturingResizeObserver();
    const { unmount } = renderShell();

    const scroller = getRouteScroller();
    const content = document.querySelector<HTMLElement>(
      "[data-job-finder-compact-navigation-content]",
    );
    if (!content) {
      throw new Error("Compact route content wrapper is missing");
    }
    // Both the scrollport box and its content row are observed so badge or
    // label width changes refresh fades even when the box itself is stable.
    expect(observations.map((record) => record.target)).toEqual([
      scroller,
      content,
    ]);

    const startFade = document.querySelector<HTMLElement>(
      "[data-job-finder-compact-navigation-fade-start]",
    );
    const endFade = document.querySelector<HTMLElement>(
      "[data-job-finder-compact-navigation-fade-end]",
    );
    const runObservedResizes = () => {
      act(() => {
        for (const record of observations) {
          record.trigger();
        }
      });
    };

    setScrollGeometry(scroller, {
      clientWidth: 200,
      scrollLeft: 0,
      scrollWidth: 200,
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(startFade?.className).toContain("opacity-0");
    expect(endFade?.className).toContain("opacity-0");

    setScrollGeometry(scroller, {
      clientWidth: 200,
      scrollLeft: 0,
      scrollWidth: 320,
    });
    runObservedResizes();
    expect(startFade?.className).toContain("opacity-0");
    expect(endFade?.className).toContain("opacity-100");

    setScrollGeometry(scroller, {
      clientWidth: 200,
      scrollLeft: 60,
      scrollWidth: 320,
    });
    fireEvent.scroll(scroller);
    expect(startFade?.className).toContain("opacity-100");
    expect(endFade?.className).toContain("opacity-100");

    setScrollGeometry(scroller, {
      clientWidth: 200,
      scrollLeft: 120,
      scrollWidth: 320,
    });
    fireEvent.scroll(scroller);
    expect(startFade?.className).toContain("opacity-100");
    expect(endFade?.className).toContain("opacity-0");

    setScrollGeometry(scroller, {
      clientWidth: 200,
      scrollLeft: 0,
      scrollWidth: 200,
    });
    Object.defineProperty(content, "offsetWidth", {
      configurable: true,
      value: 200,
    });
    runObservedResizes();
    expect(startFade?.className).toContain("opacity-0");
    expect(endFade?.className).toContain("opacity-0");

    unmount();
    expect(observations.every((record) => record.disconnected)).toBe(true);
  });

  it("collapses Shortcuts into an operable disclosure when the planning menu is height-constrained", () => {
    stubVisualViewportSize({ height: 460, width: 1280 });
    renderShell();

    const moreButton = screen.getByRole("button", {
      name: "More",
    });
    stubPlanningTriggerGeometry(moreButton);

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    const menu = screen.getByRole("navigation", {
      name: "More",
    });

    const disclosure = menu.querySelector("details");
    expect(disclosure).toBeInstanceOf(HTMLDetailsElement);
    expect(disclosure?.open).toBe(false);
    // No orphaned bare header: every Shortcuts label lives in the summary.
    for (const label of within(menu).getAllByText("Shortcuts")) {
      expect(label.tagName).toBe("SUMMARY");
    }
    expect(menu.querySelector('[aria-label="Keyboard shortcuts"]')).toBeNull();

    const summary = disclosure?.querySelector("summary") as HTMLElement;
    expect(summary.textContent).toBe("Shortcuts");
    // Screen destinations stay real buttons inside a labelled navigation; the
    // disclosure joins the roving tabindex order as its last participant
    // without borrowing menu semantics anywhere in the popover.
    const rovingOrder = Array.from(
      menu.querySelectorAll<HTMLElement>("[tabindex]"),
    );
    expect(rovingOrder.at(-1)).toBe(summary);
    expect(
      menu.querySelectorAll('[role="menu"], [role="menuitem"]').length,
    ).toBe(0);

    // Roving focus behavior survives the collapsed section.
    expect(document.activeElement).toBe(
      within(menu).getByRole("button", { name: /Search plans/ }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(summary);
    expect(summary.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(summary, { key: "Home" });
    expect(document.activeElement).toBe(
      within(menu).getByRole("button", { name: /Search plans/ }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(summary);

    // Enter reaches the native summary activation; the menu never blocks it.
    const enterEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    summary.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(false);
    fireEvent.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(menu.className).toContain("overflow-y-auto");
    expect(
      within(disclosure as HTMLElement).getByText(
        "Search current plan and workspace",
      ),
    ).toBeTruthy();
  });

  it.each([
    { height: 891, maxHeight: 479 },
    { height: 460, maxHeight: 48 },
  ])(
    "collapses Shortcuts strictly below the 480px computed menu height (viewport $height -> maxHeight $maxHeight)",
    ({ height }) => {
      stubVisualViewportSize({ height, width: 1280 });
      renderShell();

      const moreButton = screen.getByRole("button", {
        name: "More",
      });
      stubPlanningTriggerGeometry(moreButton);
      fireEvent.keyDown(moreButton, { key: "ArrowDown" });
      const menu = screen.getByRole("navigation", {
        name: "More",
      });

      const disclosure = menu.querySelector("details");
      expect(disclosure).toBeInstanceOf(HTMLDetailsElement);
      expect(disclosure?.open).toBe(false);
      const summary = disclosure?.querySelector("summary");
      expect(summary?.textContent).toBe("Shortcuts");
    },
  );

  it("keeps Shortcuts expanded at the exact 480px computed menu height boundary", () => {
    // Trigger bottom 400 + 4 gap + 8 margin: viewport 892 computes maxHeight 480.
    stubVisualViewportSize({ height: 892, width: 1280 });
    renderShell();

    const moreButton = screen.getByRole("button", {
      name: "More",
    });
    stubPlanningTriggerGeometry(moreButton);
    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    const menu = screen.getByRole("navigation", {
      name: "More",
    });

    expect(menu.querySelector("details")).toBeNull();
    expect(
      menu.querySelector('button[tabindex="0"]')?.textContent,
    ).not.toBe("Shortcuts");
    expect(
      within(menu).getByRole("group", { name: "Keyboard shortcuts" }),
    ).toBeTruthy();
  });

  it("keeps Shortcuts expanded with its grouped header at normal menu heights", () => {
    renderShell();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "More" }),
      { key: "ArrowDown" },
    );
    const menu = screen.getByRole("navigation", {
      name: "More",
    });

    expect(menu.querySelector("details")).toBeNull();
    expect(
      within(menu).getByRole("group", { name: "Keyboard shortcuts" }),
    ).toBeTruthy();
    expect(within(menu).getAllByText("Shortcuts").length).toBeGreaterThan(0);
  });

  it("routes plain Interview Helper clicks through the shell while modifier clicks stay native", () => {
    const onNavigate = vi.fn();
    renderShell("/job-finder/discovery", onNavigate);

    const anchor = getCompactInterviewHelperAffordance();
    const preventedStates: boolean[] = [];
    const observer = (event: Event) => {
      preventedStates.push(event.defaultPrevented);
    };
    window.addEventListener("click", observer);

    fireEvent.click(anchor);
    expect(preventedStates).toEqual([true]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("/interview-helper");

    for (const modifiers of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      fireEvent.click(anchor, modifiers);
    }

    expect(preventedStates).toEqual([true, false, false, false, false]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    window.removeEventListener("click", observer);
  });
});
