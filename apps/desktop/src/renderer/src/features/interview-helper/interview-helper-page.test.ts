import { describe, expect, it } from "vitest";
import {
  formatRetainedCueCardCount,
  getInterviewDocumentTitle,
  getInterviewModeLabel,
  getLastJobFinderRoute,
  inferInterviewRendererPlatform,
  installJobFinderRouteRecorder,
  recordLastJobFinderRoute,
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

function createMemoryStorage(
  initialValues: Record<string, string> = {},
): Storage {
  const values = new Map<string, string>(Object.entries(initialValues));
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

type RouteRecordingHistoryStub = {
  pushState: (
    data: Parameters<History["pushState"]>[0],
    unused: string,
    url?: string | URL | null,
  ) => void;
  replaceState: (
    data: Parameters<History["replaceState"]>[0],
    unused: string,
    url?: string | URL | null,
  ) => void;
};

function createHistoryStub() {
  const forwardedUrls: Array<string | URL | null | undefined> = [];
  const history: RouteRecordingHistoryStub = {
    pushState: (_data, _unused, url) => {
      forwardedUrls.push(url);
    },
    replaceState: (_data, _unused, url) => {
      forwardedUrls.push(url);
    },
  };
  return { forwardedUrls, history };
}

describe("Job Finder return-route resolution", () => {
  it("falls back to the Job Finder root when nothing was recorded yet", () => {
    expect(getLastJobFinderRoute(createMemoryStorage())).toBe("/job-finder");
  });

  it("falls back to the Job Finder root for stored non-Job-Finder routes", () => {
    const storage = createMemoryStorage({
      "unemployed.interview-helper.last-job-finder-route":
        "/interview-helper/overlay/answer",
    });

    expect(getLastJobFinderRoute(storage)).toBe("/job-finder");
  });

  it("returns the last recorded Job Finder route including nested paths", () => {
    const storage = createMemoryStorage();
    recordLastJobFinderRoute(
      storage,
      "#/job-finder/applications?view=pipeline",
    );

    expect(getLastJobFinderRoute(storage)).toBe(
      "/job-finder/applications?view=pipeline",
    );
  });

  it("ignores empty and non-Job-Finder navigation targets", () => {
    const storage = createMemoryStorage();
    recordLastJobFinderRoute(storage, "#/job-finder/review-queue");
    recordLastJobFinderRoute(storage, null);
    recordLastJobFinderRoute(storage, undefined);
    recordLastJobFinderRoute(storage, "#/interview-helper/overlay/answer");
    recordLastJobFinderRoute(storage, "#/");
    recordLastJobFinderRoute(storage, "#/job-finderish/not-a-route");

    expect(getLastJobFinderRoute(storage)).toBe("/job-finder/review-queue");
  });
});

describe("Job Finder route recorder installation", () => {
  it("records Job Finder hash navigations from history writes and forwards them", () => {
    const { forwardedUrls, history } = createHistoryStub();
    const storage = createMemoryStorage();
    installJobFinderRouteRecorder(history, storage);

    history.pushState({}, "", "#/interview-helper");
    history.pushState({}, "", "#/job-finder/profile");
    history.replaceState({}, "", "#/job-finder/settings?section=audio");

    expect(forwardedUrls).toEqual([
      "#/interview-helper",
      "#/job-finder/profile",
      "#/job-finder/settings?section=audio",
    ]);
    expect(getLastJobFinderRoute(storage)).toBe(
      "/job-finder/settings?section=audio",
    );
  });

  it("installs at most one recorder per history instance", () => {
    const { forwardedUrls, history } = createHistoryStub();
    const firstStorage = createMemoryStorage();
    const secondStorage = createMemoryStorage();

    installJobFinderRouteRecorder(history, firstStorage);
    installJobFinderRouteRecorder(history, secondStorage);

    history.pushState({}, "", "#/job-finder/companies/acme");

    expect(getLastJobFinderRoute(firstStorage)).toBe(
      "/job-finder/companies/acme",
    );
    expect(
      secondStorage.getItem(
        "unemployed.interview-helper.last-job-finder-route",
      ),
    ).toBeNull();
    expect(forwardedUrls).toEqual(["#/job-finder/companies/acme"]);
  });
});
