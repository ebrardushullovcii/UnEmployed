import { describe, expect, test } from "vitest";

import { countUnresolvedUserActions } from "./job-finder-shell";

describe("JobFinderShell established workspace compatibility", () => {
  test("treats a pre-action-inbox snapshot without userActionRequests as empty", () => {
    expect(countUnresolvedUserActions(undefined)).toBe(0);
  });
});
