import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { describe, expect, it } from "vitest";

import { createJobFinderWorkspaceDeltaTracker } from "./workspace-delta";

function createWorkspace(input: {
  generatedAt: string;
  jobIds: readonly string[];
  selectedJobId: string | null;
  profileSummary?: string;
  discoveryJobs?: readonly Record<string, unknown>[];
}): JobFinderWorkspaceSnapshot {
  return {
    generatedAt: input.generatedAt,
    profile: { summary: input.profileSummary ?? "Original summary" },
    discoveryRunState: "idle",
    activeDiscoveryRun: null,
    discoverySessions: [],
    sourceAccessPrompts: [],
    latestResumeImportRun: null,
    discoveryJobs: input.discoveryJobs ?? input.jobIds.map((id) => ({ id })),
    dismissedDiscoveryJobs: [],
    recentDiscoveryRuns: [],
    reviewQueue: [],
    applyRuns: [],
    applyJobResults: [],
    applicationRecords: [],
    applicationAttempts: [],
    userActionRequests: [],
    userActionEvents: [],
    selectedDiscoveryJobId: input.selectedJobId,
    selectedReviewJobId: null,
    selectedApplyRunId: null,
    selectedApplicationRecordId: null,
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("Job Finder workspace delta tracker", () => {
  it("returns a bounded entity delta with the current selection", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: ["job-1"],
      selectedJobId: "job-1",
    });
    const current = createWorkspace({
      generatedAt: "2026-08-09T10:01:00.000Z",
      jobIds: ["job-2"],
      selectedJobId: "job-2",
    });

    expect(tracker.synchronize(null, initial)).toMatchObject({
      kind: "snapshot",
      currentRevision: 1,
      reason: "initial",
    });
    const result = tracker.synchronize(1, current);

    expect(result).toMatchObject({
      kind: "delta",
      delta: {
        baseRevision: 1,
        currentRevision: 2,
        selectedDiscoveryJobId: "job-2",
        discoveryJobs: {
          upserts: [{ id: "job-2" }],
          removedIds: ["job-1"],
        },
      },
    });
  });

  it("falls back to a revisioned snapshot for untracked scalar changes", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: ["job-1"],
      selectedJobId: "job-1",
    });
    const changed = createWorkspace({
      generatedAt: "2026-08-09T10:01:00.000Z",
      jobIds: ["job-1"],
      selectedJobId: "job-1",
      profileSummary: "Changed summary",
    });

    tracker.synchronize(null, initial);

    expect(tracker.synchronize(1, changed)).toMatchObject({
      kind: "snapshot",
      currentRevision: 2,
      reason: "unsupported_change",
      snapshot: changed,
    });
  });

  it("recovers stale mutation revisions with one full snapshot", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const workspace = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: [],
      selectedJobId: null,
    });

    tracker.synchronize(null, workspace);

    expect(tracker.synchronize(0, workspace)).toMatchObject({
      kind: "snapshot",
      currentRevision: 2,
      reason: "stale_base",
    });
  });

  it("ignores nested object key order when comparing entities", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [
        {
          id: "job-1",
          metadata: {
            title: "Engineer",
            location: { country: "Kosovo", city: "Pristina" },
          },
        },
      ],
    });
    const sameValuesWithDifferentKeyOrder = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [
        {
          id: "job-1",
          metadata: {
            location: { city: "Pristina", country: "Kosovo" },
            title: "Engineer",
          },
        },
      ],
    });

    tracker.synchronize(null, initial);

    expect(
      tracker.synchronize(1, sameValuesWithDifferentKeyOrder),
    ).toMatchObject({
      kind: "delta",
      delta: {
        discoveryJobs: { upserts: [], removedIds: [] },
      },
    });
  });

  it("detects a removed nested object key", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initialJob = {
      id: "job-1",
      metadata: { title: "Engineer", location: "Pristina" },
    };
    const currentJob = {
      id: "job-1",
      metadata: { title: "Engineer" },
    };
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [initialJob],
    });
    const current = createWorkspace({
      generatedAt: "2026-08-09T10:01:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [currentJob],
    });

    tracker.synchronize(null, initial);

    expect(tracker.synchronize(1, current)).toMatchObject({
      kind: "delta",
      delta: {
        discoveryJobs: { upserts: [currentJob], removedIds: [] },
      },
    });
  });

  it.each([
    {
      label: "order",
      currentTags: ["backend", "typescript"],
    },
    {
      label: "value",
      currentTags: ["backend", "rust"],
    },
  ])("detects nested array $label changes", ({ currentTags }) => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [
        { id: "job-1", metadata: { tags: ["typescript", "backend"] } },
      ],
    });
    const currentJob = {
      id: "job-1",
      metadata: { tags: currentTags },
    };
    const current = createWorkspace({
      generatedAt: "2026-08-09T10:01:00.000Z",
      jobIds: [],
      selectedJobId: null,
      discoveryJobs: [currentJob],
    });

    tracker.synchronize(null, initial);

    expect(tracker.synchronize(1, current)).toMatchObject({
      kind: "delta",
      delta: {
        discoveryJobs: { upserts: [currentJob], removedIds: [] },
      },
    });
  });

  it("keeps generatedAt-only changes as a delta", () => {
    const tracker = createJobFinderWorkspaceDeltaTracker();
    const initial = createWorkspace({
      generatedAt: "2026-08-09T10:00:00.000Z",
      jobIds: ["job-1"],
      selectedJobId: "job-1",
    });
    const current = createWorkspace({
      generatedAt: "2026-08-09T10:01:00.000Z",
      jobIds: ["job-1"],
      selectedJobId: "job-1",
    });

    tracker.synchronize(null, initial);

    expect(tracker.synchronize(1, current)).toMatchObject({
      kind: "delta",
      delta: {
        generatedAt: current.generatedAt,
        discoveryJobs: { upserts: [], removedIds: [] },
      },
    });
  });
});
