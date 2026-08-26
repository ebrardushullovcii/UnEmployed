// @vitest-environment jsdom

import type {
  BrowserSessionState,
  JobFinderSettings,
} from "@unemployed/contracts";
import { ApplicationCrmSettingsSchema } from "@unemployed/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { HashRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JOB_FINDER_ROUTE_PATHS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import {
  SETTINGS_SUBNAV_BOTTOM_GAP_PX,
  SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX,
  SETTINGS_SUBNAV_OFFSET_VARIABLE,
  SettingsScreen,
} from "./settings-screen";

vi.mock("./settings-app-device-section", () => ({
  SettingsAppDeviceSection: () => (
    <section data-testid="panel-app-device">App and device panel</section>
  ),
}));
vi.mock("./settings-application-defaults-section", () => ({
  SettingsApplicationDefaultsSection: () => (
    <section data-testid="panel-application-defaults">
      Application defaults panel
    </section>
  ),
}));
vi.mock("./settings-workspace-behavior-section", () => ({
  SettingsWorkspaceBehaviorSection: () => (
    <section data-testid="panel-workspace-behavior">
      Workspace behavior panel
    </section>
  ),
}));
vi.mock("./settings-runtime-summary", () => ({
  SettingsRuntimeSummary: () => (
    <section data-testid="panel-diagnostics-runtime">
      Runtime summary panel
    </section>
  ),
}));
vi.mock("./settings-support-controls", () => ({
  SettingsSupportControls: () => (
    <section data-testid="panel-diagnostics-support">
      Support controls panel
    </section>
  ),
}));
vi.mock("./settings-workspace-controls", () => ({
  SettingsWorkspaceControls: (props: {
    isWorkspaceResetPending: boolean;
    onResetWorkspace: () => void;
  }) => (
    <section data-testid="panel-danger-zone">
      Danger zone panel
      <button
        disabled={props.isWorkspaceResetPending}
        onClick={props.onResetWorkspace}
        type="button"
      >
        Reset everything
      </button>
    </section>
  ),
}));
vi.mock("../applications/applications-crm-settings", () => ({
  ApplicationsCrmSettingsEditor: () => (
    <section data-testid="panel-tracker">Tracker editor panel</section>
  ),
}));

const sectionLabels = [
  "App & device",
  "Application defaults",
  "Workspace behavior",
  "Tracker",
  "Diagnostics",
  "Danger zone",
] as const;

const baseSettings = {
  applicationCrm: ApplicationCrmSettingsSchema.parse({}),
} as JobFinderSettings;

const baseProps = {
  availableResumeTemplates: [],
  browserSession: {
    source: "target_site",
    status: "idle",
    driver: "catalog_seed",
    label: "Idle",
    detail: null,
    lastCheckedAt: "2026-08-01T00:00:00.000Z",
  } as unknown as BrowserSessionState,
  isWorkspaceResetPending: false,
  onResetWorkspace: vi.fn(),
  onSettingsDraftEdited: vi.fn(),
  onUpdateAppearanceTheme: vi.fn(),
  onUpdateApplicationDefaults: vi.fn(),
  onUpdateTrackerCrm: vi.fn(() => Promise.resolve()),
  onUpdateWorkspaceBehavior: vi.fn(),
  settings: baseSettings,
};

describe("SettingsScreen information architecture", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes exactly six sticky section anchors whose labels match named landmarks", () => {
    render(
      <MemoryRouter>
        <SettingsScreen {...baseProps} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([...sectionLabels]);

    for (const link of links) {
      const targetId = (link.getAttribute("href") ?? "").replace(/^#/, "");
      expect(targetId.length).toBeGreaterThan(0);
      const anchor = document.getElementById(targetId);
      expect(anchor).not.toBeNull();
      // Each anchor is a named region titled by a heading that matches the nav label.
      expect(screen.getByRole("region", { name: link.textContent ?? "" })).toBe(
        anchor,
      );
    }

    expect(within(nav).queryAllByRole("link")).toHaveLength(6);
  });

  it("keeps keyboard-reachable nav targets with visible focus and scroll offset", () => {
    render(
      <MemoryRouter>
        <SettingsScreen {...baseProps} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", {
      name: "Settings sections",
    });

    for (const link of within(nav).getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^#settings-/);
      // Comfortable pointer and touch targets at native zoom levels.
      expect(link.className).toContain("min-h-10");
      expect(link.className).toContain("min-w-10");
      // Focus is always visible for keyboard users.
      expect(link.className).toContain("focus-visible:ring-[3px]");
      expect(link.className).toContain("outline-none");
    }

    for (const label of sectionLabels) {
      const region = screen.getByRole("region", { name: label });
      // The subnav wraps at native zoom levels; the scroll margin is derived
      // from the measured nav height (or the raised wrap-aware fallback).
      expect(region.className).toContain(
        "scroll-mt-(--settings-subnav-offset)",
      );
      const heading = document.getElementById(
        region.getAttribute("aria-labelledby") ?? "",
      );
      expect(heading?.textContent).toBe(label);
    }

    const appDeviceRegion = screen.getByRole("region", {
      name: "App & device",
    });
    const settingsRoot = appDeviceRegion.parentElement;
    expect(settingsRoot).not.toBeNull();
    expect(
      (settingsRoot as HTMLElement).style.getPropertyValue(
        SETTINGS_SUBNAV_OFFSET_VARIABLE,
      ),
    ).toBe(`${SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX}px`);
  });

  it("keeps the subnav sticky and wrap-capable, and raises the fallback clearance above the old fixed offset", () => {
    render(
      <MemoryRouter>
        <SettingsScreen {...baseProps} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    for (const token of ["sticky", "top-0", "flex-wrap", "z-30"]) {
      expect(nav.className).toContain(token);
    }

    // Two wrapped min-h-10 rows (40px each) + 4px row gap + 8px nav padding
    // + the 12px breathing gap. The old fixed scroll-mt-16 (64px) only ever
    // cleared a single-wrapped-row subnav and let a wrapped subnav cover
    // headings at native zoom levels.
    expect(SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX).toBeGreaterThan(64);
    expect(SETTINGS_SUBNAV_SCROLL_OFFSET_FALLBACK_PX).toBe(
      40 * 2 + 4 + 8 + SETTINGS_SUBNAV_BOTTOM_GAP_PX,
    );
  });

  it("derives the section scroll clearance from the measured sticky subnav height", () => {
    const capturedCallbacks: ResizeObserverCallback[] = [];
    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        capturedCallbacks.push(callback);
      }
      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 96,
    } as DOMRect);

    try {
      render(
        <MemoryRouter>
          <SettingsScreen {...baseProps} />
        </MemoryRouter>,
      );

      const appDeviceRegion = screen.getByRole("region", {
        name: "App & device",
      });
      const settingsRoot = appDeviceRegion.parentElement as HTMLElement;
      expect(
        settingsRoot.style.getPropertyValue(SETTINGS_SUBNAV_OFFSET_VARIABLE),
      ).toBe(`${96 + SETTINGS_SUBNAV_BOTTOM_GAP_PX}px`);
      expect(capturedCallbacks).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("anchors wrap the real settings panels in the six-label order", () => {
    render(
      <MemoryRouter>
        <SettingsScreen {...baseProps} />
      </MemoryRouter>,
    );

    expect(
      document
        .getElementById("settings-app-device")
        ?.contains(screen.getByTestId("panel-app-device")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-application-defaults")
        ?.contains(screen.getByTestId("panel-application-defaults")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-workspace-behavior")
        ?.contains(screen.getByTestId("panel-workspace-behavior")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-tracker")
        ?.contains(screen.getByTestId("panel-tracker")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-diagnostics")
        ?.contains(screen.getByTestId("panel-diagnostics-runtime")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-diagnostics")
        ?.contains(screen.getByTestId("panel-diagnostics-support")),
    ).toBe(true);
    expect(
      document
        .getElementById("settings-danger-zone")
        ?.contains(screen.getByTestId("panel-danger-zone")),
    ).toBe(true);

    const panels = [
      "panel-app-device",
      "panel-application-defaults",
      "panel-workspace-behavior",
      "panel-tracker",
      "panel-diagnostics-runtime",
      "panel-diagnostics-support",
      "panel-danger-zone",
    ].map((testId) => screen.getByTestId(testId));
    for (let index = 1; index < panels.length; index += 1) {
      const previous = panels[index - 1]!;
      const current = panels[index]!;
      expect(
        previous.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("links to Documents instead of embedding candidate assets", () => {
    render(
      <MemoryRouter>
        <SettingsScreen {...baseProps} />
      </MemoryRouter>,
    );

    const documentsLink = screen.getByRole("link", { name: "Open Documents" });
    // The link must come from the canonical route-path contract, not a local
    // duplicate of the Documents path.
    expect(documentsLink.getAttribute("href")).toBe(
      JOB_FINDER_ROUTE_PATHS.documents,
    );

    expect(
      screen.queryByText("Keep reusable application material on this device"),
    ).toBeNull();
    expect(
      screen.queryByText("Documents & assets", { exact: false }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Choose file to import" }),
    ).toBeNull();
    for (const label of ["Candidate assets", "Defaults", "Runtime"]) {
      expect(
        screen
          .getByRole("navigation", { name: "Settings sections" })
          .textContent.includes(label),
      ).toBe(false);
    }
  });

  it("wires the danger zone reset control without destructive controls elsewhere", () => {
    const onResetWorkspace = vi.fn();
    render(
      <MemoryRouter>
        <SettingsScreen
          {...baseProps}
          isWorkspaceResetPending
          onResetWorkspace={onResetWorkspace}
        />
      </MemoryRouter>,
    );

    const dangerZone = screen.getByRole("region", { name: "Danger zone" });
    const resetButton = within(dangerZone).getByRole<HTMLButtonElement>(
      "button",
      {
        name: "Reset everything",
      },
    );

    expect(resetButton.disabled).toBe(true);
    fireEvent.click(resetButton);
    expect(onResetWorkspace).not.toHaveBeenCalled();
  });
});

const settingsRouteMarker = "settings-route-content";
const jobFinderHomeRouteMarker = "job-finder-home-route";
const ejectedRouteMarker = "unknown-route-fallback";

describe("SettingsScreen section anchor navigation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const renderSettingsHashRoute = () => {
    window.location.hash = "#/job-finder/settings";
    return render(
      <HashRouter>
        <Routes>
          <Route
            element={
              <div>
                <p>{settingsRouteMarker}</p>
                <SettingsScreen {...baseProps} />
              </div>
            }
            path="/job-finder/settings"
          />
          <Route
            element={<p>{jobFinderHomeRouteMarker}</p>}
            path="/job-finder"
          />
          <Route element={<p>{ejectedRouteMarker}</p>} path="*" />
        </Routes>
      </HashRouter>,
    );
  };

  const flushJsdomNavigationTimers = async () => {
    await act(async () => {
      for (let index = 0; index < 3; index += 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    });
  };

  const stubSectionScrollAndFocus = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) {
      throw new Error(`Missing settings section target: ${sectionId}`);
    }
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    target.scrollIntoView = scrollIntoView;
    target.focus = focus;
    return { focus, scrollIntoView };
  };

  const expectRouteStaysOnSettings = () => {
    expect(window.location.hash).toBe("#/job-finder/settings");
    expect(screen.getByText(settingsRouteMarker)).not.toBeNull();
    expect(screen.queryByText(jobFinderHomeRouteMarker)).toBeNull();
    expect(screen.queryByText(ejectedRouteMarker)).toBeNull();
  };

  it("keeps the router on settings and scrolls and focuses each target section on plain clicks", async () => {
    renderSettingsHashRoute();

    const nav = screen.getByRole("navigation", {
      name: "Settings sections",
    });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(6);

    for (const label of sectionLabels) {
      const link = within(nav).getByRole("link", { name: label });
      const sectionId = (link.getAttribute("href") ?? "").replace(/^#/, "");
      const { focus, scrollIntoView } = stubSectionScrollAndFocus(sectionId);

      const nativeActivationWasAllowed = fireEvent.click(link);
      await flushJsdomNavigationTimers();

      expect(nativeActivationWasAllowed).toBe(false);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expectRouteStaysOnSettings();
    }
  });

  it.each([
    { description: "alt-click", init: { altKey: true } },
    { description: "ctrl-click", init: { ctrlKey: true } },
    { description: "meta-click", init: { metaKey: true } },
    { description: "shift-click", init: { shiftKey: true } },
    {
      description: "ctrl-shift-click",
      init: { ctrlKey: true, shiftKey: true },
    },
    { description: "middle-click", init: { button: 1 } },
  ] as const)(
    "leaves $description native without scrolling or focusing",
    async ({ init }) => {
      renderSettingsHashRoute();

      const nav = screen.getByRole("navigation", {
        name: "Settings sections",
      });
      const link = within(nav).getByRole("link", { name: "Tracker" });
      const { focus, scrollIntoView } =
        stubSectionScrollAndFocus("settings-tracker");

      const nativeActivationWasAllowed = fireEvent.click(link, init);
      await flushJsdomNavigationTimers();

      expect(nativeActivationWasAllowed).toBe(true);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
    },
  );

  it("still prevents default when the target section is missing so the route never changes", async () => {
    renderSettingsHashRoute();

    document.getElementById("settings-diagnostics")?.remove();
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(() => {});
    const scrollIntoViewSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewSpy,
    });

    try {
      const nav = screen.getByRole("navigation", {
        name: "Settings sections",
      });
      const link = within(nav).getByRole("link", { name: "Diagnostics" });

      const nativeActivationWasAllowed = fireEvent.click(link);
      await flushJsdomNavigationTimers();

      expect(nativeActivationWasAllowed).toBe(false);
      expect(scrollIntoViewSpy).not.toHaveBeenCalled();
      expect(focusSpy).not.toHaveBeenCalled();
      expectRouteStaysOnSettings();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });
});
