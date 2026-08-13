import type {
  ApplyRunSummary,
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  JobFinderWorkspaceSnapshot,
  ResumeImportRun,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import { buildJobFinderTaskCenterModel } from "./job-finder-task-center-model";

function createWorkspace(
  overrides: Partial<JobFinderWorkspaceSnapshot> = {},
): JobFinderWorkspaceSnapshot {
  return {
    activeDiscoveryRun: null,
    applicationRecords: [],
    applyRuns: [],
    discoveryJobs: [],
    latestResumeImportRun: null,
    recentDiscoveryRuns: [],
    searchPreferences: {
      discovery: {
        targets: [
          { id: "source_a", label: "Mercury careers" },
          { id: "source_b", label: "Aircall careers" },
        ],
      },
    },
    ...overrides,
  } as unknown as JobFinderWorkspaceSnapshot;
}

function createDiscoveryRun(
  overrides: Record<string, unknown> = {},
): DiscoveryRunRecord {
  return {
    id: "discovery_current",
    state: "running",
    startedAt: "2026-07-31T10:00:00.000Z",
    completedAt: null,
    targetIds: ["source_a", "source_b"],
    targetExecutions: [],
    activity: [],
    summary: {
      targetsPlanned: 2,
      targetsCompleted: 1,
      validJobsFound: 3,
      durationMs: 0,
    },
    ...overrides,
  } as unknown as DiscoveryRunRecord;
}

function createApplyRun(
  overrides: Partial<ApplyRunSummary> = {},
): ApplyRunSummary {
  return {
    id: "apply_current",
    mode: "copilot",
    state: "running",
    jobIds: ["job_1"],
    currentJobId: "job_1",
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:05.000Z",
    completedAt: null,
    totalJobs: 1,
    pendingJobs: 1,
    blockedJobs: 0,
    failedJobs: 0,
    ...overrides,
  } as ApplyRunSummary;
}

function findTask(
  model: ReturnType<typeof buildJobFinderTaskCenterModel>,
  kind: "discovery" | "resume_import" | "apply",
) {
  const task = model.items.find((item) => item.kind === kind);
  expect(task).toBeDefined();
  return task!;
}

describe("buildJobFinderTaskCenterModel", () => {
  test("projects active discovery lifecycle, source counts, cancellation, and history-only ETA", () => {
    const currentRun = createDiscoveryRun();
    const historicalRun = createDiscoveryRun({
      id: "discovery_history",
      state: "completed",
      startedAt: "2026-07-30T10:00:00.000Z",
      completedAt: "2026-07-30T10:00:10.000Z",
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 2,
        validJobsFound: 9,
        durationMs: 10_000,
      },
    });
    const liveEvent = {
      id: "event_1",
      runId: currentRun.id,
      timestamp: "2026-07-31T10:00:05.000Z",
      kind: "progress",
      stage: "scoring",
      targetId: "source_b",
      jobsFound: 7,
    } as DiscoveryActivityEvent;

    const model = buildJobFinderTaskCenterModel({
      workspace: createWorkspace({
        activeDiscoveryRun: currentRun,
        recentDiscoveryRuns: [historicalRun],
      }),
      isDiscoveryPending: true,
      isResumeImportPending: false,
      liveDiscoveryEvents: [liveEvent],
    });
    const task = findTask(model, "discovery");

    expect(task.status).toBe("active");
    expect(task.stageLabel).toBe("Scoring matches");
    expect(task.sourceLabel).toBe("Mercury careers and Aircall careers");
    expect(task.countLabel).toBe("1 of 2 sources finished · 7 jobs found");
    expect(task.canCancel).toBe(true);
    expect(task.historyEstimateLabel).toBe(
      "about 10s from 1 similar completed search",
    );
    expect(task.historyEstimateLabel).not.toContain("remaining");
  });

  test("marks a persisted nonterminal resume run interrupted after restart instead of pretending it is active", () => {
    const run = {
      id: "resume_stale",
      sourceResumeId: "resume_1",
      sourceResumeFileName: "candidate.pdf",
      status: "extracting",
      startedAt: "2026-07-31T09:00:00.000Z",
      completedAt: null,
      candidateCounts: {
        total: 0,
        autoApplied: 0,
        needsReview: 0,
        rejected: 0,
      },
    } as unknown as ResumeImportRun;

    const model = buildJobFinderTaskCenterModel({
      workspace: createWorkspace({ latestResumeImportRun: run }),
      isDiscoveryPending: false,
      isResumeImportPending: false,
    });
    const task = findTask(model, "resume_import");

    expect(task.status).toBe("interrupted");
    expect(task.stageLabel).toBe("Import interrupted");
    expect(task.canCancel).toBe(false);
    expect(task.resumeRoute).toBe("/job-finder/profile");
    expect(task.historyEstimateLabel).toBeNull();
  });

  test("shows a resume estimate only from the previous completed import while a new import is active", () => {
    const priorRun = {
      id: "resume_prior",
      sourceResumeId: "resume_1",
      sourceResumeFileName: "prior.pdf",
      status: "review_ready",
      startedAt: "2026-07-30T09:00:00.000Z",
      completedAt: "2026-07-30T09:00:30.000Z",
      timing: { totalMs: 30_000 },
      candidateCounts: {
        total: 12,
        autoApplied: 8,
        needsReview: 4,
        rejected: 0,
      },
    } as unknown as ResumeImportRun;

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({ latestResumeImportRun: priorRun }),
        isDiscoveryPending: false,
        isResumeImportPending: true,
        resumeImportProgress: {
          stage: "building_profile",
          message: "Building suggestions",
          occurredAt: "2026-07-31T10:00:04.000Z",
        },
      }),
      "resume_import",
    );

    expect(task.status).toBe("active");
    expect(task.stageLabel).toBe("Building profile suggestions");
    expect(task.countLabel).toBe("Counts available after extraction");
    expect(task.historyEstimateLabel).toBe(
      "about 30s from 1 previous completed import",
    );
  });

  test("keeps a paused apply run cancellable but routes resumption through existing review", () => {
    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({
          applyRuns: [
            createApplyRun({
              state: "paused_for_consent",
              totalJobs: 3,
              pendingJobs: 2,
              blockedJobs: 1,
            }),
          ],
        }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "apply",
    );

    expect(task.status).toBe("paused");
    expect(task.stageLabel).toBe("Paused for consent");
    expect(task.countLabel).toBe("1 of 3 jobs finished · 1 blocked · 0 failed");
    expect(task.canCancel).toBe(true);
    expect(task.resumeRoute).toBe("/job-finder/applications");
    expect(task.historyEstimateLabel).toBeNull();
  });

  test("retains cancelled runs as history with no stale cancel action", () => {
    const cancelledDiscovery = createDiscoveryRun({
      state: "cancelled",
      completedAt: "2026-07-31T10:00:06.000Z",
    });
    const cancelledApply = createApplyRun({
      state: "cancelled",
      completedAt: "2026-07-31T10:00:07.000Z",
      pendingJobs: 0,
    });
    const model = buildJobFinderTaskCenterModel({
      workspace: createWorkspace({
        activeDiscoveryRun: null,
        recentDiscoveryRuns: [cancelledDiscovery],
        applyRuns: [cancelledApply],
      }),
      isDiscoveryPending: false,
      isResumeImportPending: false,
    });

    expect(findTask(model, "discovery")).toMatchObject({
      status: "cancelled",
      canCancel: false,
      resumeRoute: "/job-finder/discovery",
    });
    expect(findTask(model, "apply")).toMatchObject({
      status: "cancelled",
      canCancel: false,
      resumeRoute: "/job-finder/applications",
    });
    expect(model.activeCount).toBe(0);
  });

  test("omits ETA for an active task when no compatible completed history exists", () => {
    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({ applyRuns: [createApplyRun()] }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "apply",
    );

    expect(task.status).toBe("active");
    expect(task.historyEstimateLabel).toBeNull();
  });
});
