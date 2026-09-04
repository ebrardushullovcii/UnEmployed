import { describe, expect, it } from "vitest";
import {
  formatSectionProgressLabel,
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
    // signal, so a section whose required fields are done cannot sit over a
    // 59% bar claiming otherwise.
    expect(getSectionProgressState(requiredDone)).toBe("complete");
    expect(formatSectionProgressLabel("basics", requiredHalfDone)).toBe(
      "1 to fill",
    );
  });

  it("reads sections without a required model from their optional fill alone", () => {
    // None of these render a count or a label — only `remaining` does — so
    // the state is the whole signal the tab publishes for them. The wording
    // once asserted here ("Optional", "Optional added", "Empty", "Not
    // started") went with the per-tab completion chips.
    expect(getSectionProgressState({ filled: 0, percent: 0, total: 6 })).toBe(
      "optional",
    );
    expect(getSectionProgressState({ filled: 2, percent: 33, total: 6 })).toBe(
      "complete",
    );
    expect(getSectionProgressState({ filled: 0, percent: 0, total: 0 })).toBe(
      "empty",
    );
  });
});
