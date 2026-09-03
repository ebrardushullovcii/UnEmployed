// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSaveStatusTopOffset,
  JobFinderSaveStatus,
  SAVE_STATUS_DEFAULT_TOP_OFFSET_PX,
  SAVE_STATUS_SHELL_HEADER_GAP_PX,
  SAVE_SUCCESS_VISIBLE_MS,
} from "./job-finder-save-status";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("JobFinderSaveStatus", () => {
  it.each([
    ["wide", 56, 72],
    ["two-row", 116, 132],
  ] as const)(
    "places the %s shell status lane below the measured shell header",
    (_label, headerBottom, expectedTop) => {
      const shellHeader = document.createElement("header");
      shellHeader.dataset.jobFinderShellHeader = "";
      shellHeader.getBoundingClientRect = () =>
        ({ bottom: headerBottom, top: 0 }) as DOMRect;
      document.body.append(shellHeader);

      const originalInnerHeight = window.innerHeight;
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 800,
      });

      try {
        render(
          <JobFinderSaveStatus
            onRetry={vi.fn()}
            saveState={{
              state: "saved",
              version: 1,
              attempt: 1,
              surface: "profile",
              label: "Profile",
              message: "Profile saved.",
              canRetry: false,
            }}
          />,
        );

        const status = screen.getByRole("status");
        expect(status.style.top).toBe(`${expectedTop}px`);
        expect(status.style.maxHeight).toBe(
          `calc(100vh - ${expectedTop + 16}px)`,
        );
        expect(status.className).toContain("pointer-events-auto");
        expect(status.parentElement?.className).toContain(
          "pointer-events-none",
        );
        expect(status.dataset.saveStatus).toBe("saved");
        expect(status.dataset.saveState).toBe("saved");
        expect(
          getSaveStatusTopOffset({
            shellHeaderBottom: headerBottom,
            viewportHeight: 800,
          }),
        ).toBe(expectedTop);
      } finally {
        shellHeader.remove();
        Object.defineProperty(window, "innerHeight", {
          configurable: true,
          value: originalInnerHeight,
        });
      }
    },
  );

  it("uses the default top inset when the shell header is unavailable", () => {
    render(
      <JobFinderSaveStatus
        onRetry={vi.fn()}
        saveState={{
          state: "saving",
          version: 1,
          attempt: 1,
          surface: "settings",
          label: "Settings",
          message: "Saving settings…",
          canRetry: false,
        }}
      />,
    );

    expect(screen.getByRole("status").style.top).toBe(
      `${SAVE_STATUS_DEFAULT_TOP_OFFSET_PX}px`,
    );
  });

  it("clamps the measured top inset to the viewport safe area", () => {
    expect(
      getSaveStatusTopOffset({
        shellHeaderBottom: 400,
        viewportHeight: 320,
      }),
    ).toBe(304);
    expect(SAVE_STATUS_SHELL_HEADER_GAP_PX).toBe(16);
  });

  it("does not inspect Profile action footers when positioning the status", () => {
    const originalInnerHeight = window.innerHeight;
    const shellHeader = document.createElement("header");
    shellHeader.dataset.jobFinderShellHeader = "";
    shellHeader.getBoundingClientRect = () =>
      ({ bottom: 56, top: 0 }) as DOMRect;
    const footer = document.createElement("div");
    footer.dataset.profileWorkspaceActions = "";
    footer.getBoundingClientRect = () => {
      throw new Error("The save status must not measure Profile footers.");
    };
    document.body.append(shellHeader, footer);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    try {
      render(
        <JobFinderSaveStatus
          onRetry={vi.fn()}
          saveState={{
            state: "saved",
            version: 1,
            attempt: 1,
            surface: "profile",
            label: "Profile",
            message: "Profile saved.",
            canRetry: false,
          }}
        />,
      );

      const status = screen.getByRole("status");
      expect(status.style.top).toBe("72px");
    } finally {
      shellHeader.remove();
      footer.remove();
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    }
  });

  it("dismisses a successful confirmation when its route changes", () => {
    const onDismissSaved = vi.fn();
    const saveState = {
      state: "saved" as const,
      version: 4,
      attempt: 1,
      surface: "resume" as const,
      label: "Draft",
      message: "Draft saved.",
      canRetry: false,
    };
    const view = render(
      <JobFinderSaveStatus
        layoutKey="/job-finder/resume"
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={saveState}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("Draft saved.");

    view.rerender(
      <JobFinderSaveStatus
        layoutKey="/job-finder/applications"
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={saveState}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(onDismissSaved).toHaveBeenCalledOnce();
  });

  it.each([
    ["saving", "Saving draft…"],
    ["failed", "Draft was not saved."],
  ] as const)(
    "keeps a %s state visible when its route changes",
    (state, message) => {
      const view = render(
        <JobFinderSaveStatus
          layoutKey="/job-finder/resume"
          onRetry={vi.fn()}
          saveState={{
            state,
            version: 5,
            attempt: 1,
            surface: "resume",
            label: "Draft",
            message,
            canRetry: state === "failed",
          }}
        />,
      );

      view.rerender(
        <JobFinderSaveStatus
          layoutKey="/job-finder/applications"
          onRetry={vi.fn()}
          saveState={{
            state,
            version: 5,
            attempt: 1,
            surface: "resume",
            label: "Draft",
            message,
            canRetry: state === "failed",
          }}
        />,
      );

      expect(screen.getByRole("status").textContent).toContain(message);
    },
  );

  it.each([
    ["saving", "Saving profile…"],
    ["saved", "Profile saved."],
  ] as const)("announces %s state without a retry action", (state, message) => {
    render(
      <JobFinderSaveStatus
        onRetry={vi.fn()}
        saveState={{
          state,
          version: 1,
          attempt: 1,
          surface: "profile",
          label: "Profile",
          message,
          canRetry: false,
        }}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(message);
    expect(screen.queryByRole("button", { name: /Retry saving/iu })).toBeNull();
  });

  it("keeps failed state visible and exposes a named retry action", () => {
    const onRetry = vi.fn();
    render(
      <JobFinderSaveStatus
        onRetry={onRetry}
        saveState={{
          state: "failed",
          version: 2,
          attempt: 1,
          surface: "settings",
          label: "Settings",
          message: "Settings were not saved.",
          canRetry: true,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry saving Settings" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("replaces Retry with explicit guidance when edits made the captured request stale", () => {
    const onRetry = vi.fn();
    render(
      <JobFinderSaveStatus
        onRetry={onRetry}
        saveState={{
          state: "failed",
          version: 2,
          attempt: 1,
          surface: "profile",
          label: "Profile",
          message: "Profile was not saved.",
          canRetry: false,
          retryBlockedReason:
            "This form changed after the save failed, so Retry was removed to keep it from saving your older edits. Use Save on the form to submit your current changes.",
        }}
      />,
    );

    // The stale exact-request retry must be gone, and the guidance must name
    // the safe alternative instead of leaving an unexplained gap.
    expect(screen.queryByRole("button", { name: /Retry saving/iu })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Use Save on the form to submit your current changes.",
    );
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("dismisses a saved confirmation after its readable interval without hiding failures", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
    const onDismissSaved = vi.fn();
    const { rerender } = render(
      <JobFinderSaveStatus
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={{
          state: "saved",
          version: 3,
          attempt: 1,
          surface: "settings",
          label: "Settings",
          message: "Settings saved.",
          canRetry: false,
          savedAt: "2026-08-10T10:00:00.000Z",
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(SAVE_SUCCESS_VISIBLE_MS);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(onDismissSaved).toHaveBeenCalledOnce();

    rerender(
      <JobFinderSaveStatus
        onRetry={vi.fn()}
        saveState={{
          state: "failed",
          version: 4,
          attempt: 1,
          surface: "settings",
          label: "Settings",
          message: "Settings were not saved.",
          canRetry: true,
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Settings were not saved.",
    );
  });

  it("does not restart an existing confirmation across navigation remounts and replaces it with a newer save", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
    const onDismissSaved = vi.fn();
    const firstSave = {
      state: "saved" as const,
      version: 3,
      attempt: 1,
      surface: "settings" as const,
      label: "Settings",
      message: "Settings saved.",
      canRetry: false,
      savedAt: "2026-08-10T10:00:00.000Z",
    };
    const firstMount = render(
      <JobFinderSaveStatus
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={firstSave}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    firstMount.unmount();
    render(
      <JobFinderSaveStatus
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={firstSave}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(SAVE_SUCCESS_VISIBLE_MS - 5_000);
    });
    expect(screen.queryByRole("status")).toBeNull();

    cleanup();
    const secondSavedAt = new Date().toISOString();
    render(
      <JobFinderSaveStatus
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={{
          ...firstSave,
          version: 4,
          message: "Profile saved.",
          label: "Profile",
          surface: "profile",
          savedAt: secondSavedAt,
        }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(SAVE_SUCCESS_VISIBLE_MS - 1);
    });
    expect(screen.getByRole("status").textContent).toContain("Profile saved.");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pauses only while its dismiss control has keyboard focus and supports manual dismissal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00.000Z"));
    const onDismissSaved = vi.fn();
    render(
      <JobFinderSaveStatus
        onDismissSaved={onDismissSaved}
        onRetry={vi.fn()}
        saveState={{
          state: "saved",
          version: 5,
          attempt: 1,
          surface: "profile",
          label: "Profile",
          message: "Profile saved.",
          canRetry: false,
          savedAt: "2026-08-10T10:00:00.000Z",
        }}
      />,
    );

    const dismiss = screen.getByRole("button", {
      name: "Dismiss Profile saved message",
    });
    fireEvent.focus(dismiss);
    act(() => {
      vi.advanceTimersByTime(SAVE_SUCCESS_VISIBLE_MS + 10_000);
    });
    expect(screen.getByRole("status")).toBeTruthy();

    fireEvent.click(dismiss);
    expect(screen.queryByRole("status")).toBeNull();
    expect(onDismissSaved).toHaveBeenCalledOnce();
  });
});
