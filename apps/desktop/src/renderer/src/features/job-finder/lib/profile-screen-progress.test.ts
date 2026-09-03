import { describe, expect, it } from "vitest";
import {
  formatSectionProgressLabel,
  isSectionRequiredComplete,
  getSectionProgressState,
  withRequiredProgress,
} from "./profile-screen-progress";

describe("profile section required-field progress", () => {
  it("reads complete only when every required value is filled", () => {
    const complete = withRequiredProgress(
      { filled: 3, percent: 30, total: 10 },
      ["Alex", "alex@example.com", ["remote"]],
    );
    const remaining = withRequiredProgress(
      { filled: 9, percent: 90, total: 10 },
      ["Alex", "", []],
    );

    expect(getSectionProgressState(complete)).toBe("complete");
    expect(formatSectionProgressLabel("basics", complete)).toBe(
      "Required done",
    );
    expect(getSectionProgressState(remaining)).toBe("remaining");
    expect(formatSectionProgressLabel("basics", remaining)).toBe("2 to fill");
  });

  it("states required completeness without an unlabelled bar", () => {
    const requiredDone = withRequiredProgress(
      { filled: 17, percent: 59, total: 29 },
      ["Alex", "alex@example.com"],
    );
    const requiredHalfDone = withRequiredProgress(
      { filled: 28, percent: 96, total: 29 },
      ["Alex", ""],
    );

    // The tab strip no longer charts a bar at all: the label is the whole
    // signal, so a "Required done" tab cannot sit over a 59% bar.
    expect(isSectionRequiredComplete(requiredDone)).toBe(true);
    expect(formatSectionProgressLabel("basics", requiredHalfDone)).toBe(
      "1 to fill",
    );
  });

  it("treats sections without a required model as optional until something is added", () => {
    expect(
      formatSectionProgressLabel("background", {
        filled: 0,
        percent: 0,
        total: 6,
      }),
    ).toBe("Optional");
    // A section with no required model has nothing to have finished, so it
    // must not claim "Complete" over a partly filled bar beside sibling tabs
    // that say "Required done".
    expect(
      formatSectionProgressLabel("background", {
        filled: 2,
        percent: 33,
        total: 6,
      }),
    ).toBe("Optional added");
    expect(
      isSectionRequiredComplete({ filled: 2, percent: 33, total: 6 }),
    ).toBe(false);
    expect(
      isSectionRequiredComplete({
        filled: 4,
        percent: 100,
        total: 4,
        required: { filled: 2, total: 2 },
      }),
    ).toBe(true);
    expect(
      formatSectionProgressLabel("background", {
        filled: 0,
        percent: 0,
        total: 0,
      }),
    ).toBe("Empty");
    expect(
      formatSectionProgressLabel("preferences", {
        filled: 0,
        percent: 0,
        total: 0,
      }),
    ).toBe("Not started");
  });
});
