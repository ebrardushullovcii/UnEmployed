import { describe, expect, it } from "vitest";
import { shouldApplyInterviewWorkspaceSnapshot } from "./interview-helper-page";

describe("Interview Helper workspace snapshot ordering", () => {
  it("rejects an older asynchronous workspace snapshot", () => {
    expect(
      shouldApplyInterviewWorkspaceSnapshot(
        "2026-07-14T12:00:01.000Z",
        "2026-07-14T12:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("accepts newer and equal workspace snapshots", () => {
    expect(
      shouldApplyInterviewWorkspaceSnapshot(
        "2026-07-14T12:00:00.000Z",
        "2026-07-14T12:00:01.000Z",
      ),
    ).toBe(true);
    expect(
      shouldApplyInterviewWorkspaceSnapshot(
        "2026-07-14T12:00:00.000Z",
        "2026-07-14T12:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("fails open when a snapshot timestamp cannot be parsed", () => {
    expect(
      shouldApplyInterviewWorkspaceSnapshot("invalid", "also-invalid"),
    ).toBe(true);
  });
});
