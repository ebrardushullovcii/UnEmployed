import { describe, expect, it } from "vitest";

import { describeSourceDebugOpenFailure } from "./source-debug-progress";

describe("describeSourceDebugOpenFailure", () => {
  it("turns a navigation timeout into plain copy and keeps the raw line separate", () => {
    const result = describeSourceDebugOpenFailure(
      new Error(
        "ApplicationNavigationError: The dedicated browser could not open https://jobs.example.test: page.goto: Timeout 8000ms exceeded.",
      ),
      "Example careers",
    );

    expect(result?.summary).toBe(
      "Job Finder could not open Example careers (the page did not load in time).",
    );
    expect(result?.summary).not.toContain("ApplicationNavigationError");
    expect(result?.technicalDetails).toContain("page.goto");
  });

  it("does not relabel unrelated failures as page-open failures", () => {
    expect(
      describeSourceDebugOpenFailure(new Error("database write failed"), "A"),
    ).toBeNull();
  });
});
