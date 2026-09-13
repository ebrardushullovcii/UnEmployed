import { describe, expect, it } from "vitest";

import {
  NO_PROGRESS_MESSAGE,
  plainRecordedJobFinderText,
  splitBlockedAttemptNote,
} from "./describe-failure";

describe("recorded Job Finder copy", () => {
  const internal =
    "The page did not expose a new form state after the previous safe advance. The runtime stopped instead of repeating a control or guessing at page behavior.";

  it("never exposes internal no-progress language", () => {
    expect(plainRecordedJobFinderText(internal)).toBe(NO_PROGRESS_MESSAGE);
    expect(splitBlockedAttemptNote(`${internal} Blocked: xhr POST /apply`)).toEqual({
      message: NO_PROGRESS_MESSAGE,
      technicalDetails: "Blocked: xhr POST /apply",
    });
    expect(plainRecordedJobFinderText(internal)).not.toMatch(
      /safe advance|form state|runtime/iu,
    );
  });
});
