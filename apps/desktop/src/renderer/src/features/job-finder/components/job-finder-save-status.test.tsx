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
  JobFinderSaveStatus,
  SAVE_SUCCESS_VISIBLE_MS,
} from "./job-finder-save-status";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("JobFinderSaveStatus", () => {
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
    expect(
      screen.queryByRole("button", { name: /Retry saving/iu }),
    ).toBeNull();
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
