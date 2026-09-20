import { describe, expect, test } from "vitest";

import { detectApplyBlocker } from "./blockers";

describe("detectApplyBlocker", () => {
  test("a site checking the browser by itself is a wait, not a stop", () => {
    const blocker = detectApplyBlocker({
      bodyText:
        "Just a moment... weworkremotely.com Performing security verification. Verification successful. Waiting for weworkremotely.com to respond...",
      controls: [],
      actions: [],
    });
    expect(blocker?.code).toBe("security_challenge");
    expect(blocker?.detail).toMatch(/finishes on its own/i);
    expect(blocker?.detail).toMatch(/wait/i);
    expect(blocker?.nextActionLabel).toMatch(/let the check finish/i);
  });

  test("a captcha the person has to solve is theirs", () => {
    const blocker = detectApplyBlocker({
      bodyText: "Just a moment. Please complete the challenge: verify you are human.",
      controls: [],
      actions: [],
    });
    expect(blocker?.code).toBe("security_challenge");
    expect(blocker?.detail).toMatch(/never answers those/i);
  });
});
