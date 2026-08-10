import { describe, expect, it } from "vitest";

import {
  JobFinderWorkspaceDeltaSchema,
  JobFinderWorkspaceEntityMutationInputSchema,
} from "./workspace";

function emptySlice() {
  return { upserts: [], removedIds: [] };
}

describe("workspace delta contracts", () => {
  it("parses the bounded entity mutation commands with their base revision", () => {
    expect(
      JobFinderWorkspaceEntityMutationInputSchema.parse({
        baseRevision: 4,
        mutation: {
          type: "set_job_resume_application_mode",
          jobId: "job-1",
          resumeApplicationMode: "original_resume",
        },
      }),
    ).toEqual({
      baseRevision: 4,
      mutation: {
        type: "set_job_resume_application_mode",
        jobId: "job-1",
        resumeApplicationMode: "original_resume",
      },
    });

    expect(
      JobFinderWorkspaceEntityMutationInputSchema.safeParse({
        baseRevision: 4,
        mutation: {
          type: "dismiss_discovery_job",
          jobId: "job-1",
          reasons: [],
        },
      }).success,
    ).toBe(false);
  });

  it("carries current selection IDs in every schema-validated delta", () => {
    const result = JobFinderWorkspaceDeltaSchema.parse({
      baseRevision: 4,
      currentRevision: 5,
      generatedAt: "2026-08-09T10:00:00.000Z",
      discoveryRunState: "idle",
      activeDiscoveryRun: null,
      discoverySessions: [],
      sourceAccessPrompts: [],
      latestResumeImportRun: null,
      selectedDiscoveryJobId: "job-2",
      selectedReviewJobId: null,
      selectedApplyRunId: null,
      selectedApplicationRecordId: null,
      discoveryJobs: emptySlice(),
      dismissedDiscoveryJobs: emptySlice(),
      recentDiscoveryRuns: emptySlice(),
      reviewQueue: emptySlice(),
      applyRuns: emptySlice(),
      applyJobResults: emptySlice(),
      applicationRecords: emptySlice(),
      applicationAttempts: emptySlice(),
      userActionRequests: emptySlice(),
      userActionEvents: emptySlice(),
    });

    expect(result.selectedDiscoveryJobId).toBe("job-2");
    expect(result.currentRevision).toBe(result.baseRevision + 1);
  });
});
