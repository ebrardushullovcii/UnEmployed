import { describe, expect, it } from "vitest";
import {
  formatRetainedCueCardCount,
  getInterviewDocumentTitle,
  getInterviewModeLabel,
  inferInterviewRendererPlatform,
  shouldApplyInterviewWorkspaceSnapshot,
} from "./interview-helper-page";

describe("Interview Helper navigation labels", () => {
  it("describes the current section when no interview is live", () => {
    expect(getInterviewModeLabel("setup", false)).toBe("Setup mode");
    expect(getInterviewModeLabel("assist", false)).toBe("Assist mode");
    expect(getInterviewModeLabel("review", false)).toBe("Review mode");
    expect(getInterviewModeLabel("settings", false)).toBe("Settings mode");
  });

  it("keeps live-session and current-section context in labels and titles", () => {
    expect(getInterviewModeLabel("assist", true)).toBe("Live session");
    expect(getInterviewModeLabel("review", true)).toBe("Live session · Review");
    expect(getInterviewDocumentTitle("review", false)).toBe(
      "Review mode | Interview Helper | UnEmployed",
    );
    expect(getInterviewDocumentTitle("settings", true)).toBe(
      "Live session · Settings | Interview Helper | UnEmployed",
    );
  });

  it("identifies the renderer platform before the async desktop bridge replies", () => {
    expect(inferInterviewRendererPlatform("MacIntel")).toBe("darwin");
    expect(inferInterviewRendererPlatform("Linux x86_64")).toBe("linux");
    expect(inferInterviewRendererPlatform("Win32")).toBe("win32");
    expect(inferInterviewRendererPlatform("")).toBe("win32");
  });

  it("uses grammatical retained cue-card counts", () => {
    expect(formatRetainedCueCardCount(0)).toBe("0 cue cards retained");
    expect(formatRetainedCueCardCount(1)).toBe("1 cue card retained");
    expect(formatRetainedCueCardCount(2)).toBe("2 cue cards retained");
  });
});

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
