// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobFinderOpeningShell } from "./job-finder-page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  Reflect.deleteProperty(window, "unemployed");
});

function renderOpeningShell(
  platform: "darwin" | "linux" | "win32",
  initialEntry = "/job-finder/home",
  isMaximized = false,
  isFullScreen = false,
) {
  const controlsState = {
    isClosable: true,
    isFullScreen,
    isMaximized,
    isMinimizable: true,
  };
  const windowBridge = {
    close: vi.fn().mockResolvedValue({ ok: true }),
    getControlsState: vi.fn().mockResolvedValue(controlsState),
    minimize: vi.fn().mockResolvedValue(controlsState),
    onControlsStateChange: vi.fn(() => vi.fn()),
    toggleMaximize: vi.fn().mockResolvedValue(controlsState),
  };
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: {
      ping: vi.fn().mockResolvedValue({ ok: true, platform }),
      window: windowBridge,
    },
  });
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <JobFinderOpeningShell />
    </MemoryRouter>,
  );
  return windowBridge;
}

describe("JobFinderOpeningShell platform geometry", () => {
  it("reserves the loaded shell frame instead of swapping from a centered loading card", () => {
    renderOpeningShell("darwin", "/job-finder");

    const header = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-header]",
    );
    const sidebar = document.querySelector<HTMLElement>(
      "[data-job-finder-sidebar]",
    );
    const content = document.querySelector<HTMLElement>(
      "[data-job-finder-shell-content]",
    );

    expect(header?.className).toContain("fixed");
    expect(header?.className).toContain("min-[1440px]:h-14");
    expect(sidebar?.className).toContain("w-(--job-finder-side-width)");
    expect(sidebar?.className).toContain("min-[1440px]:block");
    expect(content?.className).toContain("min-[1440px]:pt-14");
    expect(content?.className).toContain(
      "min-[1440px]:pl-(--job-finder-side-width)",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "HomeSee progress, open tasks, and the best next step.",
    );
    expect(screen.queryByText("Loading Job Finder")).toBeNull();
    expect(
      document.querySelector("[data-job-finder-opening-placeholder]"),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-job-finder-sidebar] [aria-current="page"]')
        ?.textContent,
    ).toContain("Home");
  });

  it("reserves the native traffic-light area on macOS", async () => {
    renderOpeningShell("darwin");
    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-opening-shell]",
    );
    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");

    await waitFor(() => {
      expect(shell?.className).toContain("platform-darwin");
      expect(brand?.style.paddingInlineStart).toBe("5.5rem");
      // Mirrored on the trailing edge so the reserve cannot shift the centred
      // module switcher off the window centre.
      expect(brand?.style.paddingInlineEnd).toBe("5.5rem");
    });
    expect(screen.queryByRole("group", { name: "Window controls" })).toBeNull();
  });

  it("keeps the native traffic-light area reserved while macOS is maximized", async () => {
    renderOpeningShell("darwin", "/job-finder/home", true);
    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");

    await waitFor(() => {
      expect(brand?.style.paddingInlineStart).toBe("5.5rem");
    });
  });

  it("moves the opening wordmark fully left in native macOS fullscreen", async () => {
    renderOpeningShell("darwin", "/job-finder/home", true, true);
    const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");

    await waitFor(() => {
      expect(brand?.style.paddingInlineStart).toBe("");
    });
  });

  it.each(["win32", "linux"] as const)(
    "does not reserve macOS traffic-light space on %s",
    async (platform) => {
      renderOpeningShell(platform);
      const shell = document.querySelector<HTMLElement>(
        "[data-job-finder-opening-shell]",
      );
      const brand = document.querySelector<HTMLElement>("[data-desktop-brand]");

      await waitFor(() => {
        expect(shell?.className).toContain(`platform-${platform}`);
        expect(brand?.style.paddingInlineStart).toBe("");
        expect(brand?.style.paddingInlineEnd).toBe("");
      });
      const controls = screen.queryByRole("group", {
        name: "Window controls",
      });
      const windowControlInset = document.querySelector<HTMLElement>(
        "[data-desktop-header-window-control-inset]",
      );
      if (platform === "win32") {
        expect(controls).not.toBeNull();
        // The frameless Windows window has this header paint its own caption
        // buttons, so the trailing region reserves their exact width.
        expect(windowControlInset?.style.inlineSize).toBe("8.5rem");
      } else {
        expect(controls).toBeNull();
        expect(windowControlInset?.style.inlineSize).toBe("");
      }
    },
  );

  it("keeps native Windows controls available throughout workspace opening", async () => {
    const windowBridge = renderOpeningShell("win32");

    await screen.findByRole("group", { name: "Window controls" });
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Close window" }));

    expect(windowBridge.minimize).toHaveBeenCalledTimes(1);
    expect(windowBridge.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(windowBridge.close).toHaveBeenCalledTimes(1);
  });

  it("preserves the persisted collapsed rail width while opening", () => {
    window.localStorage.setItem(
      "unemployed.job-finder.sidebar-collapsed.v1",
      "true",
    );
    renderOpeningShell("darwin");

    const shell = document.querySelector<HTMLElement>(
      "[data-job-finder-opening-shell]",
    );
    expect(shell?.style.getPropertyValue("--job-finder-side-width")).toBe(
      "4rem",
    );
  });
});
