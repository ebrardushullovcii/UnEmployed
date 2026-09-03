import { afterEach, describe, expect, it } from "vitest";
import {
  markGuidedSetupAutoOpenSpent,
  resetGuidedSetupAutoOpenForTests,
  shouldAutoOpenGuidedSetup,
} from "./guided-setup-auto-open";

describe("guided setup auto-open", () => {
  afterEach(resetGuidedSetupAutoOpenForTests);

  it("opens guided setup directly on a workspace that has not started setup", () => {
    expect(shouldAutoOpenGuidedSetup({ status: "not_started" })).toBe(true);
    expect(shouldAutoOpenGuidedSetup(null)).toBe(true);
  });

  it("leaves an in-progress or completed setup on Home", () => {
    expect(shouldAutoOpenGuidedSetup({ status: "in_progress" })).toBe(false);
    expect(shouldAutoOpenGuidedSetup({ status: "completed" })).toBe(false);
  });

  it("redirects at most once so Home stays reachable", () => {
    expect(shouldAutoOpenGuidedSetup({ status: "not_started" })).toBe(true);
    markGuidedSetupAutoOpenSpent();
    // Otherwise the sidebar's Home destination (and setup's own Back to Home
    // control) would bounce straight back into setup.
    expect(shouldAutoOpenGuidedSetup({ status: "not_started" })).toBe(false);
  });
});
