import { describe, expect, it } from "vitest";
import {
  hasPendingAction,
  jobFinderPendingActions,
  listPendingActionScopes,
} from "./job-finder-pending-actions";

describe("jobFinderPendingActions grouped manual-answer scopes", () => {
  it("uses distinct scopes for project, apply, and snooze", () => {
    expect(jobFinderPendingActions.groupedManualAnswerProject("group_1")).toBe(
      "grouped-manual-answer:project:group_1",
    );
    expect(
      jobFinderPendingActions.groupedManualAnswerApply("group_1:abc123"),
    ).toBe("grouped-manual-answer:apply:group_1:abc123");
    expect(
      jobFinderPendingActions.groupedDecisionSnooze("group_1:abc123"),
    ).toBe("grouped-decision:snooze:group_1:abc123");
  });

  it("tracks each grouped scope independently in the pending state", () => {
    const projectScope =
      jobFinderPendingActions.groupedManualAnswerProject("group_1");
    const applyScope =
      jobFinderPendingActions.groupedManualAnswerApply("group_1:abc123");
    const snoozeScope =
      jobFinderPendingActions.groupedDecisionSnooze("group_1:abc123");
    const state = {
      [projectScope]: 1,
      [applyScope]: 2,
      [snoozeScope]: 0,
    };

    expect(hasPendingAction(state, projectScope)).toBe(true);
    expect(hasPendingAction(state, applyScope)).toBe(true);
    expect(hasPendingAction(state, snoozeScope)).toBe(false);
    expect(listPendingActionScopes(state)).toEqual([projectScope, applyScope]);
  });
});
