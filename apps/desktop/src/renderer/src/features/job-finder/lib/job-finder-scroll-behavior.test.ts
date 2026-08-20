import { describe, expect, it } from "vitest";
import { getJobFinderScrollBehavior } from "./job-finder-scroll-behavior";

describe("getJobFinderScrollBehavior", () => {
  it.each([
    ["reduced motion", true, "auto"],
    ["standard motion", false, "smooth"],
  ])("uses %s behavior", (_label, matches, expected) => {
    expect(
      getJobFinderScrollBehavior({ matchMedia: () => ({ matches }) }),
    ).toBe(expected);
  });

  it("keeps navigation usable when matchMedia is unavailable", () => {
    expect(getJobFinderScrollBehavior({})).toBe("smooth");
    expect(getJobFinderScrollBehavior(null)).toBe("smooth");
  });
});
