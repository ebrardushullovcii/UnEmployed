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
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobFinderShell } from "./job-finder-shell";

const windowControlsState = {
  isClosable: true,
  isFullScreen: false,
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

const SIDEBAR_SECONDARY_DESTINATIONS = [
  "Documents",
  "Companies",
  "Outcomes",
  "Search plans",
  "Resume approaches",
  "Safeguards",
  "Settings",
] as const;

/**
 * Only the compact top navigation renders a More trigger; the expanded sidebar
 * lists the same destinations inline. jsdom applies no media queries, so the
 * helper still names the surface it means.
 */
function getCompactMoreButton(): HTMLElement {
  const compactNavigation = document.querySelector(
    "[data-job-finder-compact-navigation]",
  );
  if (!compactNavigation) {
    throw new Error("Expected the compact navigation.");
  }
  return within(compactNavigation as HTMLElement).getByRole("button", {
    name: /^More/u,
  });
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
    expect(navigation.firstElementChild?.className).toContain("w-fit");
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
    // Both header pills keep a readable word from the compact breakpoint up,
    // so 1024px never shows two interchangeable glyph+count chips.
    expect(
      Array.from(needsYouButton.querySelectorAll("span")).find(
        (span) => span.textContent?.trim() === "Needs you",
      )?.className,
    ).toContain("min-[900px]:inline");
    const taskCenterLauncher =
      within(notificationGroup).getByLabelText("Tasks: 0 active");
    const taskCenterLabels = Array.from(
      taskCenterLauncher.querySelectorAll("span"),
    );
    // One name at every width: the header used to read "Tasks" compact and
    // "Task center" at 1440, so the same destination had two names.
    const taskLabels = taskCenterLabels.filter(
      (span) => span.textContent?.trim() === "Tasks",
    );
    expect(taskLabels).toHaveLength(1);
    expect(taskLabels[0]?.className).toContain("min-[900px]:inline");
    expect(
      taskCenterLabels.some(
        (span) => span.textContent?.trim() === "Task center",
      ),
    ).toBe(false);
    // The absolutely positioned group sits over the compact navigation row,
    // which must reserve enough width for both labelled pills. Off macOS that
    // group stays in this row until 1440px, so the reserve is one-sided: a
    // mirrored reserve would squeeze the destination card into a scroller at
    // the 1024px minimum instead of letting it stay on one line.
    expect(navigation.className).toContain("min-[900px]:pr-80");
    expect(navigation.className).not.toContain("min-[900px]:pl-80");
    expect(navigation.contains(notificationGroup)).toBe(false);

    const windowControls = screen.getByRole("group", {
      name: "Window controls",
    });
    expect(windowControls.parentElement?.className).toContain(
      "absolute right-0 top-0",
    );
    expect(
      document.querySelector("[data-desktop-module-navigation]")?.className,
    ).toContain("justify-self-center");
    // The destination card is centred in whatever width the reserve leaves.
    expect(navigation.className).toContain("justify-center");
    expect(navigation.className).not.toContain("justify-start");
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
    const compactNavigation = document.querySelector(
      "[data-job-finder-compact-navigation]",
    ) as HTMLElement;
    const moreButton = within(compactNavigation).getByRole("button", {
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

  it("keeps the module switcher on one line beside the wordmark at the wide layout", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="darwin" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");
    const moduleNavigation = document.querySelector<HTMLElement>(
      "[data-desktop-module-navigation]",
    );
    if (!brand || !moduleNavigation) {
      throw new Error("Shell brand row is missing");
    }

    // At >=1440px grid column 1 is the 17rem sidebar column. The wordmark plus
    // the switcher does not fit there: it wrapped onto a second flex line that
    // spilled out of the 3.5rem header and painted under the page title. The
    // brand row spans the sidebar column and the content column instead, and
    // cannot wrap, so the switcher stays on the header line.
    // col-end-3, not the col-span shorthand: `grid-column: span 2 / span 2`
    // would reset the row's grid-column-start off column 1.
    expect(brand.className).toContain("min-[1440px]:col-end-3");
    expect(brand.className).not.toContain("col-span-2");
    expect(brand.className).toContain("col-start-1");
    // The row is a single-row three-region grid, so there is no flex line to
    // wrap onto: the switcher cannot leave the 3.5rem header row.
    expect(brand.className).toContain(
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );
    expect(brand.className).not.toContain("flex-wrap");
    expect(moduleNavigation.className).toContain("justify-self-center");

    // Neither module label may break across lines inside the switcher.
    const currentModule = within(moduleNavigation).getByText("Job Finder");
    const otherModule = within(moduleNavigation).getByRole("button", {
      name: "Open Interview Helper",
    });
    expect(currentModule.getAttribute("aria-current")).toBe("page");
    expect(currentModule.className).toContain("whitespace-nowrap");
    expect(otherModule.className).toContain("whitespace-nowrap");

    // The switcher stays inside the header, not in the sidebar.
    const header = document.querySelector("[data-job-finder-shell-header]");
    const sidebar = document.querySelector("[data-job-finder-sidebar]");
    expect(header?.contains(moduleNavigation)).toBe(true);
    expect(sidebar?.contains(moduleNavigation)).toBe(false);
    expect(header?.className).toContain("min-[1440px]:h-14");
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
    // The traffic-light reserve is mirrored on the trailing edge, so
    // reserving it cannot push the centred switcher off the window centre.
    expect(brand?.style.paddingInlineEnd).toBe("5.5rem");
    expect(brandName?.className).toContain("xl:text-[2rem]");
    expect(brandName?.className).not.toContain("xl:text-[2.7rem]");
    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
    expect(moduleNavigation?.className).toContain("justify-self-center");
    expect(moduleNavigation?.className).not.toContain("absolute");
    // macOS has no in-header caption buttons, so nothing is reserved on the
    // trailing side beyond the mirrored traffic-light padding.
    expect(
      document.querySelector<HTMLElement>(
        "[data-desktop-header-window-control-inset]",
      )?.style.inlineSize,
    ).toBe("");
    expect(sectionNavigation.className).toContain("min-[1440px]:hidden");
    // The compact destination card is centred on the same axis: at >=900px
    // the notification group has moved up to the header row, so this row
    // reserves nothing and the card lands on the true window centre.
    expect(sectionNavigation.className).toContain("justify-center");
    expect(sectionNavigation.className).toContain("min-[900px]:pr-0");
    expect(sectionNavigation.className).not.toContain("min-[900px]:pr-80");
    // On macOS the notification group shares the compact row instead of
    // overlaying the right-aligned module navigation at <900px CSS width.
    expect(notificationGroup.className).toContain("sm:top-14");
    expect(notificationGroup.className).toContain("sm:h-[3.75rem]");
    expect(notificationGroup.className).toContain("min-[900px]:!top-0");
    expect(notificationGroup.className).toContain("min-[900px]:!h-14");
    expect(notificationGroup.className).toContain("sm:right-0");
    expect(notificationGroup.className).not.toContain("sm:top-0");
  });

  it("reserves the Windows caption buttons on the trailing edge without moving the centred switcher", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/profile"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");
    const windowControlInset = document.querySelector<HTMLElement>(
      "[data-desktop-header-window-control-inset]",
    );
    const windowControls = screen.getByRole("group", {
      name: "Window controls",
    });

    // The Windows main window is frameless and this header paints its own
    // caption buttons, so there is no Window Controls Overlay to measure:
    // the reserve is the exact rendered width of minimize + maximize + close
    // (w-11 + w-11 + w-12 = 8.5rem).
    expect(windowControlInset?.style.inlineSize).toBe("8.5rem");
    expect(windowControlInset?.className).toContain("col-start-3");
    expect(windowControls.parentElement?.className).toContain(
      "absolute right-0 top-0",
    );

    // The reserve lives inside the trailing region, never as row padding, so
    // the two side tracks stay equal and the switcher stays on the centre.
    expect(brand?.style.paddingInlineEnd).toBe("");
    expect(brand?.style.paddingInlineStart).toBe("");
    expect(brand?.className).toContain(
      "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    );

    // Neither module label may wrap out of the centre track.
    const moduleNavigation = document.querySelector<HTMLElement>(
      "[data-desktop-module-navigation]",
    );
    if (!moduleNavigation) {
      throw new Error("Desktop module navigation is missing");
    }
    expect(
      moduleNavigation.querySelector('[role="list"]')?.className,
    ).toContain("flex-nowrap");
    expect(
      within(moduleNavigation).getByText("Job Finder").className,
    ).toContain("whitespace-nowrap");
    expect(
      within(moduleNavigation).getByRole("button", {
        name: "Open Interview Helper",
      }).className,
    ).toContain("whitespace-nowrap");
  });

  it.each([
    { height: 920, label: "1440x920", width: 1440, zoomFactor: 1 },
    { height: 720, label: "1280x720", width: 1280, zoomFactor: 1 },
    { height: 920, label: "native125", width: 1440, zoomFactor: 1.25 },
  ])(
    "keeps painted wordmark ink clear of the shell row edges at $label",
    ({ height, width, zoomFactor }) => {
      // The viewport matrix is intentionally named here even though jsdom
      // cannot paint fonts. The CSS box budget below is the source-level
      // assertion: padding plus explicit line boxes leave real breathing room
      // in the 56px row at every desktop scale, including native 125%.
      const headerRowHeightPx = 56;
      const wordmarkLineBoxHeightPx = 32 * 1.05;
      const subtitleLineBoxHeightPx = 10.88 * 1.1;
      const verticalPaddingPx = 4 * 2;
      const remainingInkBudgetPx =
        headerRowHeightPx -
        wordmarkLineBoxHeightPx -
        subtitleLineBoxHeightPx -
        verticalPaddingPx;

      const cssViewportWidth = width / zoomFactor;
      const cssViewportHeight = height / zoomFactor;
      expect(cssViewportWidth).toBeGreaterThanOrEqual(1024);
      expect(cssViewportHeight).toBeGreaterThanOrEqual(576);
      expect(remainingInkBudgetPx * zoomFactor).toBeGreaterThan(1);

      render(
        <MemoryRouter initialEntries={["/job-finder/profile"]}>
          <JobFinderShell platform="darwin" workspace={createWorkspace()}>
            <div>Current screen</div>
          </JobFinderShell>
        </MemoryRouter>,
      );

      const header = document.querySelector<HTMLElement>(
        "[data-job-finder-shell-header]",
      );
      const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");
      const lockup = document.querySelector<HTMLElement>(
        "[data-desktop-brand-lockup]",
      );
      const wordmark = document.querySelector<HTMLElement>(
        "[data-desktop-brand-wordmark]",
      );
      const moduleNavigation = document.querySelector<HTMLElement>(
        "[data-desktop-module-navigation]",
      );

      expect(header?.className).toContain("overflow-visible");
      expect(lockup?.className).toContain("py-1");
      expect(wordmark?.className).toContain("leading-[1.05]");
      expect(wordmark?.className).not.toContain("leading-none");
      expect(brand?.style.paddingInlineStart).toBe("5.5rem");
      expect(brand?.style.paddingInlineEnd).toBe("5.5rem");
      expect(moduleNavigation?.className).toContain("justify-self-center");
      expect(moduleNavigation?.className).toContain("justify-center");
      expect(moduleNavigation?.className).not.toContain("justify-start");
    },
  );

  it("keeps the macOS traffic-light inset when the window is maximized", async () => {
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
      expect(brand?.style.paddingInlineStart).toBe("5.5rem");
    });
  });

  it("moves the macOS wordmark fully left in native fullscreen", async () => {
    vi.mocked(window.unemployed.window.getControlsState).mockResolvedValueOnce({
      ...windowControlsState,
      isFullScreen: true,
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

    expect(workflow?.className).toContain("w-fit");

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
    // The 17rem rail has the room, so nothing hides behind a dropdown inside a
    // navigation column that is already on screen: the journey leads, and the
    // reference and configuration surfaces follow it inline.
    expect(sidebarNavigation.textContent).toContain("Your job search");
    expect(sidebarNavigation.textContent).toContain("Everything else");
    expect(sidebarNavigation.textContent).toContain("Your data");
    expect(sidebarNavigation.textContent).toContain("Setup and safety");

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
    // Needs you lives only in the header attention control, never twice.
    expect(
      within(sidebar).queryByRole("button", { name: "Needs you" }),
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Needs you/ })).toHaveLength(
      1,
    );

    // The selected row's count used to flip to a pale chip whose digit sat
    // below 4.5:1 on the active fill; it now inherits the row's own foreground,
    // so the active row reads at the same contrast as its label.
    const activeSidebarRow = within(sidebar)
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-current") === "page");
    const activeCountBadge =
      activeSidebarRow?.querySelector("span.tabular-nums");
    expect(activeSidebarRow?.className).toContain(
      "text-(--nav-active-foreground)",
    );
    expect(activeCountBadge?.className).toContain("text-current");
    expect(activeCountBadge?.className).toContain("bg-transparent");
    expect(activeCountBadge?.className).not.toContain("bg-(--nav-active-bar)");
  });

  it("gives every sidebar count one identical plain treatment", () => {
    const workspace = createWorkspace();
    workspace.campaigns = [
      { id: "campaign_default", jobIds: [], name: "My job search" },
      { id: "campaign_second", jobIds: [], name: "Backend roles" },
    ] as unknown as JobFinderWorkspaceSnapshot["campaigns"];
    workspace.intelligence = {
      companies: [
        {
          id: "company_1",
          mergeReviewCandidates: [{ decision: "pending" }],
        },
        {
          id: "company_2",
          mergeReviewCandidates: [{ decision: "pending" }],
        },
      ],
      outcomeEvents: [{ id: "outcome_1" }],
      resumeStrategies: [{ id: "strategy_1" }],
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

    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={workspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const countClassNames = Array.from(
      sidebar.querySelectorAll<HTMLElement>("span.tabular-nums"),
    ).map((element) => element.className);

    // Primary rows, attention rows (Companies, Safeguards) and inventory rows
    // (Outcomes, Search plans, Resume approaches) all reach this list.
    expect(countClassNames.length).toBeGreaterThanOrEqual(6);
    expect(new Set(countClassNames).size).toBe(1);
    // A count is a number, not a chip: no fill, no pill, right-aligned.
    const [countClassName] = countClassNames;
    expect(countClassName).toContain("bg-transparent");
    expect(countClassName).toContain("tabular-nums");
    expect(countClassName).toContain("justify-end");
    expect(countClassName).not.toContain("bg-primary");
    expect(countClassName).not.toContain("bg-(--input)");
    expect(countClassName).not.toContain("rounded-full");

    // Collapsing the rail moves every count to the same corner marker; it is
    // still exactly one treatment, never a per-destination variant.
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const collapsedCountClassNames = Array.from(
      screen
        .getByRole("complementary", { name: "Job Finder sidebar" })
        .querySelectorAll<HTMLElement>("span.tabular-nums"),
    ).map((element) => element.className);
    expect(collapsedCountClassNames.length).toBe(countClassNames.length);
    expect(new Set(collapsedCountClassNames).size).toBe(1);
  });

  it("lists every secondary destination inline in the expanded sidebar instead of behind a popover", () => {
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

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const secondary = within(sidebar).getByRole("group", {
      name: "Everything else",
    });

    // Two labelled groups, in the same order and with the same names the
    // compact More menu uses, so the two widths teach one map.
    expect(
      within(secondary).getByRole("group", { name: "Your data" }),
    ).toBeTruthy();
    expect(
      within(secondary).getByRole("group", { name: "Setup and safety" }),
    ).toBeTruthy();

    for (const label of SIDEBAR_SECONDARY_DESTINATIONS) {
      const row = within(secondary).getByRole("button", {
        name: new RegExp(`^${label}`, "u"),
      });
      // Same treatment as a primary row: leading icon, then the label.
      expect(row.firstElementChild?.tagName.toLowerCase()).toBe("svg");
      expect(row.className).toContain("border-l-2");
    }

    // The shortcuts reference is the trailing entry and opens the same dialog.
    const shortcutsEntry = within(secondary).getByRole("button", {
      name: "Keyboard shortcuts",
    });
    expect(
      sidebar.querySelector("[data-job-finder-sidebar-shortcuts-entry]"),
    ).toBe(shortcutsEntry);
    const sidebarButtons = within(sidebar).getAllByRole("button");
    expect(sidebarButtons.at(-1)).toBe(shortcutsEntry);

    // No dropdown inside a navigation column that is already on screen.
    expect(
      within(sidebar).queryByRole("button", { name: /^More/u }),
    ).toBeNull();
    expect(sidebar.querySelector("[data-job-finder-sidebar-more]")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();

    fireEvent.click(
      within(secondary).getByRole("button", { name: /^Safeguards/u }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/safeguards");
    // Opening the shortcuts dialog stays a dialog, not a second popover.
    fireEvent.click(shortcutsEntry);
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
  });

  it("keeps the collapsed rail icon-only with tooltips for the same secondary destinations", async () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const secondary = within(sidebar).getByRole("group", {
      name: "Everything else",
    });
    for (const label of SIDEBAR_SECONDARY_DESTINATIONS) {
      const row = within(secondary).getByRole("button", {
        name: new RegExp(`^${label}`, "u"),
      });
      // The label survives for assistive technology while the rail is glyphs.
      expect(row.querySelector("span")?.className).toContain("sr-only");
    }
    // Group eyebrows collapse to screen-reader text rather than wrapping.
    const eyebrow = Array.from(secondary.querySelectorAll("span")).find(
      (element) => element.textContent === "Setup and safety",
    );
    expect(eyebrow?.className).toContain("sr-only");

    const companies = within(secondary).getByRole("button", {
      name: /^Companies/u,
    });
    fireEvent.pointerEnter(companies, { pointerType: "mouse" });
    fireEvent.pointerMove(companies, { pointerType: "mouse" });
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toContain("Companies");
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
  });

  it("gives the sidebar its own scroll owner so a short window cannot clip destinations", () => {
    // 1440x640: the journey, both secondary groups, and the shortcuts entry
    // are taller than the rail. jsdom has no layout engine, so the contract is
    // asserted through the structure that decides it — a bounded, non-scrolling
    // aside, a pinned toggle row, and one scrollable navigation region.
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        height: 640,
        removeEventListener: vi.fn(),
        width: 1440,
      },
    });
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
    expect(sidebar.className).toContain("overflow-hidden");
    expect(sidebar.className).not.toContain("overflow-y-auto");
    expect(sidebar.className).toContain("top-14");
    expect(sidebar.className).toContain("bottom-0");

    const column = sidebar.firstElementChild;
    expect(column?.className).toContain("flex");
    expect(column?.className).toContain("h-full");
    expect(column?.className).toContain("min-h-0");
    expect(column?.className).toContain("flex-col");

    const toggleRow = sidebar.querySelector<HTMLElement>(
      "[data-job-finder-sidebar-toggle]",
    );
    const navigation = within(sidebar).getByRole("navigation", {
      name: "Job Finder sidebar destinations",
    });
    // The toggle stays pinned above the scroller; only destinations scroll.
    expect(toggleRow?.className).toContain("shrink-0");
    expect(toggleRow?.parentElement).toBe(column);
    expect(navigation.parentElement).toBe(column);
    expect(navigation.previousElementSibling).toBe(toggleRow);
    expect(
      navigation.hasAttribute("data-job-finder-sidebar-scroll-region"),
    ).toBe(true);
    expect(navigation.className).toContain("overflow-y-auto");
    expect(navigation.className).toContain("min-h-0");
    expect(navigation.className).toContain("flex-1");
    expect(navigation.className).toContain("content-start");
    expect(navigation.className).toContain("overscroll-contain");
    expect(navigation.className).toContain("overflow-x-hidden");

    // Every destination and the shortcuts entry stay inside that one scroller.
    for (const label of [
      "Home",
      ...SIDEBAR_SECONDARY_DESTINATIONS,
      "Keyboard shortcuts",
    ]) {
      const row = within(sidebar).getByRole("button", {
        name: new RegExp(`^${label}`, "u"),
      });
      expect(navigation.contains(row)).toBe(true);
      expect(row.hasAttribute("disabled")).toBe(false);
    }
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
    const collapsedWordmark = screen.getByText("UNEMPLOYED");
    const collapsedLockup = collapsedWordmark.closest<HTMLElement>(
      "[data-desktop-brand-lockup]",
    );
    const collapsedSubtitle = collapsedLockup?.querySelector<HTMLElement>(
      "[data-desktop-brand-subtitle]",
    );
    expect(collapsedWordmark.className).not.toContain("min-[1440px]:hidden");
    expect(collapsedWordmark.className).toContain("leading-[1.05]");
    expect(collapsedLockup?.className).toContain("py-1");
    expect(collapsedLockup?.className).toContain("w-max");
    expect(collapsedLockup?.className).toContain("shrink-0");
    expect(collapsedLockup?.className).toContain("whitespace-nowrap");
    expect(collapsedSubtitle?.className).toContain("whitespace-nowrap");
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

    // Outcomes now lives behind More; the collapsed rail's own tooltip
    // contract is proved on a destination the rail still shows.
    const shortlistedTrigger = within(sidebar).getByRole("button", {
      name: "Shortlisted",
    });
    expect(shortlistedTrigger.getAttribute("title")).toBeNull();
    await hover(shortlistedTrigger, "Shortlisted");

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
      within(screen.getByRole("navigation", { name: "More" })).getByRole(
        "button",
        { name: /^Settings/ },
      ),
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
      within(menu).getByRole("group", { name: "Setup and safety" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      within(menu).getByRole("button", { name: /^Documents/ }),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(moreButton);

    fireEvent.click(moreButton);
    expect(screen.getByRole("navigation", { name: "More" })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();

    fireEvent.click(moreButton);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "More" })).getByRole(
        "button",
        { name: /Resume approaches/ },
      ),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/resume-strategies");
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
  });

  it("supports complete keyboard navigation in the More menu", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const moreButton = getCompactMoreButton();
    const getDestinationButton = (name: RegExp) =>
      within(screen.getByRole("navigation", { name: "More" })).getByRole(
        "button",
        { name },
      );

    // The shortcuts entry is the trailing roving participant, so opening
    // upward lands on it and Home returns to the first destination.
    fireEvent.keyDown(moreButton, { key: "ArrowUp" });
    expect(document.activeElement).toBe(
      getDestinationButton(/^Keyboard shortcuts/),
    );
    expect(
      getDestinationButton(/^Keyboard shortcuts/).getAttribute("tabindex"),
    ).toBe("0");
    expect(getDestinationButton(/^Documents/).getAttribute("tabindex")).toBe(
      "-1",
    );

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Settings/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(
      getDestinationButton(/^Keyboard shortcuts/),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    expect(document.activeElement).toBe(getDestinationButton(/^Documents/));
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowUp",
    });
    expect(document.activeElement).toBe(
      getDestinationButton(/^Keyboard shortcuts/),
    );

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(getDestinationButton(/^Documents/));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(
      getDestinationButton(/^Keyboard shortcuts/),
    );

    // The compact cross-module affordance follows the Planning trigger in DOM
    // order, so closing with Tab lands on it first.
    const interviewHelperControl = getCompactInterviewHelperAffordance();
    const nextControlFocus = vi.spyOn(interviewHelperControl, "focus");
    const tabWasPrevented = fireEvent.keyDown(
      document.activeElement as HTMLElement,
      { key: "Tab" },
    );
    expect(tabWasPrevented).toBe(false);
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
    // Tab closes the menu and continues to the next control after the planning trigger in DOM order.
    expect(document.activeElement).toBe(interviewHelperControl);
    expect(nextControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.click(moreButton);
    expect(document.activeElement).toBe(getDestinationButton(/^Documents/));
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
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
    expect(document.activeElement).toBe(previousControl);
    expect(previousControlFocus).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(moreButton, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "Escape",
    });
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
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

  it("labels the More trigger without letting it slice at any top-strip width", () => {
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

    // The label is visible at every compact width: it can no longer be cut
    // mid-glyph because the destinations own the flexible scroll viewport
    // while the trigger keeps reserved, non-shrinking sibling space and never
    // wraps or truncates its own text.
    expect(visibleLabel).toBeTruthy();
    expect(visibleLabel?.className).not.toContain("sr-only");
    expect(visibleLabel?.className).toContain("whitespace-nowrap");
    expect(visibleLabel?.className).not.toContain("truncate");
    expect(moreButton.className).toContain("shrink-0");
    expect(moreButton.className).not.toContain("max-[899px]");
    expect(moreButton.className).toContain("bg-(--surface-panel-raised)");
    // Interactive chrome carries the >=3:1 control boundary, not the inert
    // panel-chrome border.
    expect(moreButton.className).toContain("border-(--control-border)");
    expect(moreButton.querySelector("svg")).toBeTruthy();
    // The icon stays as a shape cue beside the label, and the tooltip plus
    // accessible name remain exactly "More".
    expect(moreButton.getAttribute("title")).toBe("More");
    expect(moreButton.getAttribute("aria-label")).toBe("More");

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
        within(screen.getByRole("navigation", { name: "More" })).getByRole(
          "button",
          {
            name: new RegExp(`^${destination}`),
          },
        ),
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

  it("counts extra search plans in the More menu without treating plans as attention", () => {
    const workspace = createWorkspace();
    workspace.campaigns = [
      { id: "campaign_default", name: "My job search" },
      { id: "campaign_second", name: "Backend roles" },
    ] as unknown as JobFinderWorkspaceSnapshot["campaigns"];

    render(
      <MemoryRouter initialEntries={["/job-finder/campaigns"]}>
        <JobFinderShell platform="win32" workspace={workspace}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    fireEvent.click(getCompactMoreButton());
    const menu = screen.getByRole("navigation", { name: "More" });
    const campaignsButton = within(menu).getByRole("button", {
      name: /^Search plans/u,
    });
    expect(campaignsButton.textContent).toContain("2");
  });

  it("shows no plan badge while only the default plan exists", () => {
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

    fireEvent.click(getCompactMoreButton());
    const menu = screen.getByRole("navigation", { name: "More" });
    expect(
      within(menu).getByRole("button", { name: "Search plans" }).textContent,
    ).not.toMatch(/\d/);
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
    const summary = within(actionGroup).getByLabelText("Tasks: 0 active");
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

    const moreButton = getCompactMoreButton();
    expect(moreButton.className).toContain("bg-(--nav-active-surface)");
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
    // Safeguards is an ordinary inline sidebar row now, so its attention count
    // is announced on the destination itself instead of rolled up onto a
    // dropdown trigger that hid which surface was waiting.
    expect(
      within(sidebarWithAttention).getByRole("button", {
        name: "Safeguards: 1 need attention",
      }),
    ).toBeTruthy();
    expect(
      within(sidebarWithAttention).queryByRole("button", { name: /^More/u }),
    ).toBeNull();
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
    const safeguardsButton = within(
      screen.getByRole("navigation", { name: "More" }),
    ).getByRole("button", { name: "Safeguards: 1 need attention" });
    const attentionBadge = Array.from(
      safeguardsButton.querySelectorAll("span"),
    ).at(-1);
    expect(attentionBadge?.textContent).toBe("1");
    // Attention work waiting on the user stays announced.
    expect(attentionBadge?.getAttribute("aria-hidden")).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "More" })).getByRole(
        "button",
        { name: "Safeguards: 1 need attention" },
      ),
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

  it("keeps the shortcut reference out of the More menu and behind one entry", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/discovery"]}>
        <JobFinderShell platform="darwin" workspace={createWorkspace()}>
          <div>Current screen</div>
        </JobFinderShell>
      </MemoryRouter>,
    );

    fireEvent.click(getCompactMoreButton());
    const menu = screen.getByRole("navigation", { name: "More" });
    // The menu carries destinations only: no shortcut table, and no
    // four-line tutorial paragraph above them.
    expect(menu.textContent).not.toContain("Show or hide the sidebar");
    expect(menu.textContent).not.toContain(
      "Set up search plans and resume approaches",
    );

    fireEvent.click(
      within(menu).getByRole("button", { name: /Keyboard shortcuts/ }),
    );
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const shortcutText = dialog.textContent ?? "";
    expect(shortcutText).toContain("Search current plan and workspace");
    expect(shortcutText).toContain("Show or hide the sidebar");
    // Aliases are separate keycaps, each on the row whose scope it fires in,
    // never merged into one broken token beside a two-scope paragraph. A
    // modifier and its key are two physical keys, so they are two caps: "⌘K"
    // as one cap read as a single unfamiliar glyph-token.
    expect(within(dialog).queryByText("⌘K")).toBeNull();
    expect(within(dialog).queryByText("⌘B")).toBeNull();
    const keycaps = [...dialog.querySelectorAll("kbd")].map(
      (cap) => cap.textContent,
    );
    expect(keycaps).toEqual(["⌘", "K", "/", "⌘", "B", "?"]);
    expect(within(dialog).getAllByText("/")).toHaveLength(1);
    expect(shortcutText).not.toContain(
      "Anywhere in Job Finder; Outside text fields",
    );
    expect(shortcutText).not.toMatch(/approve|delete|submit/i);

    const rows = dialog.querySelectorAll("[data-job-finder-shortcut-row]");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      // Two columns, one scope line, no operable control inside a help row.
      expect(row.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
      expect(row.querySelectorAll("button, a")).toHaveLength(0);
    }
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
        fireEvent.click(getCompactMoreButton());
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

  it("states the real Cmd+B scope in the shortcuts reference", async () => {
    renderShellWithShortcuts({ darwin: true, wide: true });

    // "?" opens the reference from anywhere outside an editable field.
    fireEvent.keyDown(document, { key: "?" });
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

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

    fireEvent.click(getCompactMoreButton());
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
      const moreWrapper = getCompactMoreButton().parentElement;
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
      expect(screen.getAllByLabelText("Tasks: 0 active")).toHaveLength(1);
      expect(
        screen.getAllByRole("button", { name: /^Needs you/ }),
      ).toHaveLength(1);
    },
  );

  it.each([900, 1160, 1439])(
    "centres the desktop module switcher between the wordmark and the window-control inset at %spx CSS",
    (width) => {
      expect(width).toBeGreaterThanOrEqual(900);
      renderShell();

      const moduleNavigation = document.querySelector<HTMLElement>(
        "[data-desktop-module-navigation]",
      );
      // One alignment rule for the header row at every width: the wordmark
      // owns the leading region, the switcher owns the centre track of a
      // three-region grid whose side tracks are equal, and the native
      // window-control inset owns the trailing region. Nothing is absolutely
      // centred, which is what previously fought the traffic-light inset.
      expect(moduleNavigation?.className).not.toContain("absolute");
      expect(moduleNavigation?.className).toContain("col-start-2");
      expect(moduleNavigation?.className).toContain("justify-self-center");
      expect(moduleNavigation?.className).toContain("min-[900px]:flex");
      expect(moduleNavigation?.className).not.toContain("justify-start");
      expect(
        document.querySelector<HTMLElement>("[data-desktop-brand]")?.className,
      ).toContain("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");

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

  it("updates the sidebar owner when an Applications empty-state link opens Shortlisted", () => {
    render(
      <MemoryRouter initialEntries={["/job-finder/applications"]}>
        <JobFinderShell platform="win32" workspace={createWorkspace()}>
          <Link to="/job-finder/review-queue">Open Shortlisted</Link>
        </JobFinderShell>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole("complementary", {
      name: "Job Finder sidebar",
    });
    const applicationsButton = within(sidebar).getByRole("button", {
      name: /^Applications/,
    });
    const shortlistedButton = within(sidebar).getByRole("button", {
      name: /^Shortlisted/,
    });

    expect(applicationsButton.getAttribute("aria-current")).toBe("page");
    expect(shortlistedButton.getAttribute("aria-current")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Open Shortlisted" }));

    expect(shortlistedButton.getAttribute("aria-current")).toBe("page");
    expect(applicationsButton.getAttribute("aria-current")).toBeNull();
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

  it("does not engage an internal scroll region at 1440x920", () => {
    stubVisualViewportSize({ height: 920, width: 1440 });
    renderShell();

    const moreButton = getCompactMoreButton();
    stubPlanningTriggerGeometry(moreButton);
    fireEvent.click(moreButton);

    const menu = screen.getByRole("navigation", { name: "More" });
    // Every destination is present, and none of the ~270px of non-navigation
    // content that used to stop the menu from showing itself.
    for (const label of [
      "Documents",
      "Companies",
      "Outcomes",
      "Search plans",
      "Resume approaches",
      "Safeguards",
      "Settings",
    ]) {
      expect(
        within(menu).getByRole("button", { name: new RegExp(`^${label}`) }),
      ).toBeTruthy();
    }
    expect(menu.textContent).not.toContain("Show or hide the sidebar");
    expect(menu.textContent).not.toContain(
      "Set up search plans and resume approaches",
    );

    // Trigger bottom 400 in a 920px window: it stays below and takes the whole
    // 508px that is actually there, which comfortably clears the seven rows.
    expect(menu.getAttribute("data-side")).toBe("bottom");
    expect(Number.parseInt(menu.style.maxHeight, 10)).toBe(508);
    expect(Number.parseInt(menu.style.top, 10)).toBe(404);

    const scrollRegion = menu.querySelector<HTMLElement>(
      "[data-job-finder-more-menu-scroll-region]",
    );
    if (!scrollRegion) {
      throw new Error("More menu scroll region is missing");
    }
    Object.defineProperties(scrollRegion, {
      clientHeight: { configurable: true, value: 460 },
      scrollHeight: { configurable: true, value: 430 },
    });
    fireEvent.scroll(scrollRegion);
    expect(
      menu.querySelector("[data-bounded-floating-surface-scroll-hint]"),
    ).toBeNull();
  });

  it("keeps every More-menu item hittable at 1440x640", () => {
    // The reported defect: at wide + short viewports the surface was capped at
    // its available height, but its destination list was an unbounded block, so
    // the list grew past the row, the surface clipped it, and the footer entry
    // ("Keyboard shortcuts") painted across Safeguards and Settings. Neither
    // was hittable. jsdom has no layout engine, so the geometry is asserted
    // through the two things that actually decide it: the bounded placement the
    // surface is given, and the bounded row the list is rendered into.
    stubVisualViewportSize({ height: 640, width: 1440 });
    renderShell();

    const moreButton = getCompactMoreButton();
    stubPlanningTriggerGeometry(moreButton);
    fireEvent.click(moreButton);

    const menu = screen.getByRole("navigation", { name: "More" });
    const top = Number.parseInt(menu.style.top, 10);
    const maxHeight = Number.parseInt(menu.style.maxHeight, 10);

    // Trigger 360-400 in a 640px window: 228px below, 348px above. The surface
    // flips above and takes exactly the room that is there, no more.
    expect(menu.getAttribute("data-side")).toBe("top");
    expect(maxHeight).toBe(348);
    expect(top).toBe(8);
    expect(top + maxHeight).toBeLessThanOrEqual(640 - 8);
    // It must not grow over its own trigger either.
    expect(top + maxHeight).toBeLessThanOrEqual(360 - 4);

    // The surface is two rows: a bounded scroll row and an auto footer row.
    // Both bounds are required — without either one the list overflows its row
    // and the two rows paint on top of each other.
    expect(menu.className).toContain("grid-rows-[minmax(0,1fr)_auto]");
    expect(menu.className).toContain("overflow-hidden");

    const scrollRegion = menu.querySelector<HTMLElement>(
      "[data-job-finder-more-menu-scroll-region]",
    );
    if (!scrollRegion) {
      throw new Error("More menu scroll region is missing");
    }
    const scrollRow = scrollRegion.parentElement;
    expect(scrollRow?.className).toContain("grid-rows-[minmax(0,1fr)]");
    expect(scrollRow?.className).toContain("overflow-hidden");
    expect(scrollRegion.className).toContain("overflow-y-auto");
    expect(scrollRegion.className).toContain("min-h-0");

    // The footer is its own row outside that scroller, so it can never be
    // overlapped by, or overlap, a destination.
    const shortcutsEntry = menu.querySelector<HTMLElement>(
      "[data-job-finder-more-menu-shortcuts-entry]",
    );
    expect(shortcutsEntry).toBeTruthy();
    expect(scrollRegion.contains(shortcutsEntry)).toBe(false);
    expect(shortcutsEntry?.className).toContain("shrink-0");

    // Every destination plus the footer entry is present and enabled, reachable
    // through the scroll region rather than by resizing the window.
    for (const label of [
      "Documents",
      "Companies",
      "Outcomes",
      "Search plans",
      "Resume approaches",
      "Safeguards",
      "Settings",
    ]) {
      const item = within(menu).getByRole("button", {
        name: new RegExp(`^${label}`),
      });
      expect(scrollRegion.contains(item)).toBe(true);
      expect(item.hasAttribute("disabled")).toBe(false);
      expect(item.getAttribute("aria-hidden")).toBeNull();
    }
    expect(
      within(menu)
        .getByRole("button", { name: /Keyboard shortcuts/ })
        .hasAttribute("disabled"),
    ).toBe(false);

    // Arrow keys still walk the whole list, footer entry included, so the
    // scrolled-out rows stay reachable from the keyboard.
    const items = within(menu).getAllByRole("button");
    expect(items).toHaveLength(8);
  });

  it("flips the More menu above its trigger and stays inside a short window", () => {
    // 1440x560: 148px below the trigger, 348px above it. The menu used to
    // hard-anchor below and show one of seven destinations.
    stubVisualViewportSize({ height: 560, width: 1440 });
    renderShell();

    const moreButton = getCompactMoreButton();
    stubPlanningTriggerGeometry(moreButton);
    fireEvent.click(moreButton);

    const menu = screen.getByRole("navigation", { name: "More" });
    expect(menu.getAttribute("data-side")).toBe("top");

    const top = Number.parseInt(menu.style.top, 10);
    const maxHeight = Number.parseInt(menu.style.maxHeight, 10);
    expect(maxHeight).toBe(348);
    expect(top).toBe(8);
    // Bounded on both edges: nothing paints past the window in either
    // direction, and the surface never covers its own trigger.
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + maxHeight).toBeLessThanOrEqual(560 - 8);

    // Every destination is still reachable, through the internal scroll
    // region rather than by resizing the window.
    const scrollRegion = menu.querySelector<HTMLElement>(
      "[data-job-finder-more-menu-scroll-region]",
    );
    expect(scrollRegion?.className).toContain("overflow-y-auto");
    for (const label of [
      "Documents",
      "Companies",
      "Outcomes",
      "Search plans",
      "Resume approaches",
      "Safeguards",
      "Settings",
    ]) {
      expect(
        within(menu).getByRole("button", { name: new RegExp(`^${label}`) }),
      ).toBeTruthy();
    }
    expect(
      within(menu).getByRole("button", { name: /Keyboard shortcuts/ }),
    ).toBeTruthy();
  });

  it("shifts the More menu back inside a narrow viewport instead of clipping it", () => {
    stubVisualViewportSize({ height: 768, width: 1024 });
    renderShell();

    const moreButton = getCompactMoreButton();
    vi.spyOn(moreButton, "getBoundingClientRect").mockReturnValue({
      bottom: 120,
      height: 40,
      left: 1000,
      right: 1016,
      toJSON: () => ({}),
      top: 80,
      width: 16,
      x: 1000,
      y: 80,
    } as DOMRect);
    fireEvent.click(moreButton);

    const menu = screen.getByRole("navigation", { name: "More" });
    const left = Number.parseInt(menu.style.left, 10);
    const width = Number.parseInt(menu.style.width, 10);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(1024 - 8);
  });

  it("prints the scroll hint at the edge it describes", () => {
    stubVisualViewportSize({ height: 560, width: 1024 });
    renderShell();

    const moreButton = getCompactMoreButton();
    stubPlanningTriggerGeometry(moreButton);
    fireEvent.click(moreButton);

    const menu = screen.getByRole("navigation", { name: "More" });
    const scrollRegion = menu.querySelector<HTMLElement>(
      "[data-job-finder-more-menu-scroll-region]",
    );
    if (!scrollRegion) {
      throw new Error("More menu scroll region is missing");
    }
    Object.defineProperties(scrollRegion, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 600 },
    });

    fireEvent.scroll(scrollRegion);
    expect(
      menu.querySelector('[data-bounded-floating-surface-scroll-hint="end"]'),
    ).toBeTruthy();
    expect(
      menu.querySelector('[data-bounded-floating-surface-scroll-hint="start"]'),
    ).toBeNull();

    scrollRegion.scrollTop = 300;
    fireEvent.scroll(scrollRegion);
    // The "there is more above" hint prints at the top, not in the footer.
    expect(
      menu.querySelector('[data-bounded-floating-surface-scroll-hint="start"]'),
    ).toBeTruthy();
    expect(
      menu.querySelector('[data-bounded-floating-surface-scroll-hint="end"]'),
    ).toBeNull();
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
