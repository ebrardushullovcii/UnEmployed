import { afterEach, describe, expect, it } from "vitest";
import {
  getDisplayedResumeProgress,
  getNextDisplayedResumeProgress,
  rememberDisplayedResumeProgress,
  resetRememberedResumeProgressForTests,
} from "./review-queue-progress";

const pendingItem = {
  jobId: "job_progress",
  progressPercent: null,
} as never;

describe("review queue progress helpers", () => {
  afterEach(() => {
    resetRememberedResumeProgressForTests();
  });

  it("shows a minimum optimistic progress value while a job is pending", () => {
    expect(getDisplayedResumeProgress(null, true)).toBe(8);
  });

  it("preserves stored progress when it is already ahead of the optimistic floor", () => {
    expect(
      getDisplayedResumeProgress({ progressPercent: 42 } as never, true),
    ).toBe(42);
  });

  it("keeps the same visible progress when the user leaves and revisits Shortlisted", () => {
    rememberDisplayedResumeProgress(pendingItem, 69);

    expect(getDisplayedResumeProgress(pendingItem, true)).toBe(69);
  });

  it("clears remembered animation state after the operation settles", () => {
    rememberDisplayedResumeProgress(pendingItem, 69);

    expect(getDisplayedResumeProgress(pendingItem, false)).toBe(0);
    expect(getDisplayedResumeProgress(pendingItem, true)).toBe(8);
  });

  it("eases progress upward without reaching completion early", () => {
    expect(getNextDisplayedResumeProgress(8)).toBeGreaterThan(8);
    expect(getNextDisplayedResumeProgress(94)).toBe(94);
    expect(getNextDisplayedResumeProgress(99)).toBe(94);
  });
});
