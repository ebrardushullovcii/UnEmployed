import type {
  ApplyRunSummary,
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  JobFinderWorkspaceSnapshot,
  ResumeImportRun,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";
import { buildJobFinderTaskCenterModel } from "./job-finder-task-center-model";
import type { TailoredDraftPreparationViewState } from "../../screens/review-queue/review-queue-status";

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
  kind: "discovery" | "resume_import" | "apply" | "tailored_drafts",
) {
  const task = model.items.find((item) => item.kind === kind);
  expect(task).toBeDefined();
  return task!;
}

function createTailoredDraftPreparation(
  overrides: Partial<TailoredDraftPreparationViewState> = {},
): TailoredDraftPreparationViewState {
  return {
    attemptedCount: 2,
    completedCount: 1,
    currentIndex: 2,
    eligibleRemainingCount: 0,
    failedCount: 0,
    status: "running",
    totalCount: 3,
    ...overrides,
  };
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
    // Scoring-stage candidates are not merged yet, so they never drive the
    // count; the label keeps reporting persisted run evidence.
    expect(task.countLabel).toBe("1 of 2 sources finished · 3 new jobs kept");
    expect(task.canCancel).toBe(true);
    expect(task.historyEstimateLabel).toBe(
      "about 10s from 1 similar completed search",
    );
    expect(task.historyEstimateLabel).not.toContain("remaining");
  });

  test("keeps unmerged scoring-stage candidates out of the settled count", () => {
    // Prior source merged with every listing already known. The next source
    // just published its scoring-stage candidate total while its merge has
    // not run yet.
    const currentRun = createDiscoveryRun({
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 1,
        validJobsFound: 6,
        duplicatesMerged: 6,
        durationMs: 0,
      },
    });
    const liveEvent = {
      id: "event_scoring",
      runId: currentRun.id,
      timestamp: "2026-07-31T10:00:05.000Z",
      kind: "progress",
      stage: "scoring",
      targetId: "source_b",
      jobsFound: 50,
      duplicatesMerged: 6,
    } as DiscoveryActivityEvent;

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({ activeDiscoveryRun: currentRun }),
        isDiscoveryPending: true,
        isResumeImportPending: false,
        liveDiscoveryEvents: [liveEvent],
      }),
      "discovery",
    );

    // The unmerged candidate total (50) never reaches the label, and the
    // summary's distinct total is shown as-is instead of losing duplicates.
    expect(task.countLabel).toBe(
      "1 of 2 sources finished · 6 new jobs kept · 6 duplicates merged",
    );
    expect(task.countLabel).not.toContain("50");
    expect(task.countLabel).not.toMatch(/\bfound\b/i);
  });

  test("derives live counts from persistence-stage review volume before the summary catches up", () => {
    // First source just merged and published its per-target persistence
    // event while the workspace snapshot still reports an empty summary.
    const currentRun = createDiscoveryRun({
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 0,
        validJobsFound: 0,
        durationMs: 0,
      },
    });
    const liveEvent = {
      id: "event_persistence",
      runId: currentRun.id,
      timestamp: "2026-07-31T10:00:06.000Z",
      kind: "progress",
      stage: "persistence",
      targetId: "source_b",
      jobsFound: 100,
      duplicatesMerged: 33,
    } as DiscoveryActivityEvent;

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({ activeDiscoveryRun: currentRun }),
        isDiscoveryPending: true,
        isResumeImportPending: false,
        liveDiscoveryEvents: [liveEvent],
      }),
      "discovery",
    );

    // The event's jobsFound is review volume, so its own duplicate counter
    // turns 100 reviewed listings into 67 distinct retained.
    expect(task.countLabel).toBe(
      "0 of 2 sources finished · 67 new jobs kept · 33 duplicates merged",
    );
  });

  test("prefers settled summary volume over fresher events without mixing bases", () => {
    const currentRun = createDiscoveryRun({
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 1,
        validJobsFound: 6,
        duplicatesMerged: 6,
        durationMs: 0,
      },
    });
    const liveEvent = {
      id: "event_persistence",
      runId: currentRun.id,
      timestamp: "2026-07-31T10:00:06.000Z",
      kind: "progress",
      stage: "persistence",
      targetId: "source_b",
      jobsFound: 50,
      duplicatesMerged: 40,
    } as DiscoveryActivityEvent;

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({ activeDiscoveryRun: currentRun }),
        isDiscoveryPending: true,
        isResumeImportPending: false,
        liveDiscoveryEvents: [liveEvent],
      }),
      "discovery",
    );

    // The per-target event must never be maxed into the cumulative summary:
    // no "56 found", no "44 unique", only the settled distinct total.
    expect(task.countLabel).toBe(
      "1 of 2 sources finished · 6 new jobs kept · 6 duplicates merged",
    );
    expect(task.countLabel).not.toMatch(/\bfound\b/i);
    expect(task.countLabel).not.toContain("44");
  });

  test("shows a completed run's distinct total directly instead of re-subtracting duplicates", () => {
    const completedRun = createDiscoveryRun({
      id: "discovery_completed",
      state: "completed",
      startedAt: "2026-07-31T09:00:00.000Z",
      completedAt: "2026-07-31T09:01:00.000Z",
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 2,
        validJobsFound: 20,
        duplicatesMerged: 5,
        durationMs: 60_000,
      },
    });

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({
          recentDiscoveryRuns: [completedRun],
        }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "discovery",
    );

    expect(task.status).toBe("completed");
    // 67-style regression guard: the distinct total displays as-is; the old
    // label subtracted duplicates again and claimed a smaller unique count.
    expect(task.countLabel).toBe(
      "2 of 2 sources finished · 20 new jobs kept · 5 duplicates merged",
    );
    expect(task.countLabel).not.toContain("15");
    expect(task.countLabel).not.toMatch(/\bfound\b/i);
  });

  test("never claims duplicates without duplicate evidence and keeps plain kept counts", () => {
    const completedRun = createDiscoveryRun({
      id: "discovery_completed_no_duplicates",
      state: "completed",
      startedAt: "2026-07-31T09:00:00.000Z",
      completedAt: "2026-07-31T09:01:00.000Z",
      summary: {
        targetsPlanned: 1,
        targetsCompleted: 1,
        validJobsFound: 20,
        durationMs: 60_000,
      },
    });

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({
          activeDiscoveryRun: null,
          recentDiscoveryRuns: [completedRun],
        }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "discovery",
    );

    expect(task.countLabel).toBe("1 of 1 sources finished · 20 new jobs kept");
    expect(task.countLabel).not.toContain("duplicates");
    expect(task.countLabel).not.toContain("unique retained");
  });

  test("explains a fully repeated search where every reviewed listing was already known", () => {
    const repeatedRun = createDiscoveryRun({
      id: "discovery_completed_repeat",
      state: "completed",
      startedAt: "2026-07-31T11:00:00.000Z",
      completedAt: "2026-07-31T11:01:00.000Z",
      summary: {
        targetsPlanned: 2,
        targetsCompleted: 2,
        validJobsFound: 0,
        duplicatesMerged: 15,
        durationMs: 60_000,
      },
    });

    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({
          activeDiscoveryRun: null,
          recentDiscoveryRuns: [repeatedRun],
        }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "discovery",
    );

    expect(task.countLabel).toBe(
      "2 of 2 sources finished · 0 new jobs kept · 15 duplicates merged",
    );
    expect(task.countLabel).not.toMatch(/\bfound\b/i);
  });

  test("compares 511 configured targets without repeated sorting", () => {
    const targetIds = Array.from(
      { length: 511 },
      (_, index) => `source_${String(index).padStart(3, "0")}`,
    );
    const historicalTargetIds = [...targetIds].reverse();
    const incompatibleTargetIds = [...historicalTargetIds];
    incompatibleTargetIds[incompatibleTargetIds.length - 1] = targetIds[1]!;
    const historicalRuns = [
      createDiscoveryRun({
        id: "discovery_history_duplicate-target",
        state: "completed",
        targetIds: incompatibleTargetIds,
        summary: {
          targetsPlanned: targetIds.length,
          targetsCompleted: targetIds.length,
          validJobsFound: 5,
          durationMs: 12_000,
        },
      }),
      ...Array.from({ length: 32 }, (_, index) =>
        createDiscoveryRun({
          id: `discovery_history_${index}`,
          state: "completed",
          targetIds: historicalTargetIds,
          summary: {
            targetsPlanned: targetIds.length,
            targetsCompleted: targetIds.length,
            validJobsFound: 5,
            durationMs: 12_000,
          },
        }),
      ),
    ];
    const currentRun = createDiscoveryRun({
      targetIds,
      summary: {
        targetsPlanned: targetIds.length,
        targetsCompleted: 0,
        validJobsFound: 0,
        durationMs: 0,
      },
    });

    const startedAt = performance.now();
    const model = buildJobFinderTaskCenterModel({
      workspace: createWorkspace({
        activeDiscoveryRun: currentRun,
        recentDiscoveryRuns: historicalRuns,
        searchPreferences: {
          discovery: {
            targets: targetIds.map((id, index) => ({
              id,
              label: `Source ${index}`,
              startingUrl: `https://example.com/${id}`,
              enabled: true,
              adapterKind: "auto",
              customInstructions: null,
              instructionStatus: "missing",
              validatedInstructionId: null,
              draftInstructionId: null,
              lastDebugRunId: null,
              lastVerifiedAt: null,
              staleReason: null,
            })),
            historyLimit: 5,
          },
        } as unknown as JobFinderWorkspaceSnapshot["searchPreferences"],
      }),
      isDiscoveryPending: true,
      isResumeImportPending: false,
    });
    const durationMs = performance.now() - startedAt;
    const task = findTask(model, "discovery");

    console.info("task-center-target-comparison-benchmark", {
      durationMs: Math.round(durationMs),
      historicalRuns: historicalRuns.length,
      targetCount: targetIds.length,
    });

    expect(task.countLabel).toBe("0 of 511 sources finished · 0 new jobs kept");
    expect(task.sourceLabel).toBe("Source 0 and 510 more sources");
    expect(task.historyEstimateLabel).toBe(
      "about 12s from 32 similar completed searches",
    );
    expect(durationMs).toBeLessThan(500);
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
    expect(task.stageLabel).toBe("Waiting for your consent");
    expect(task.countLabel).toBe(
      "1 of 3 application tasks finished · 1 blocked · 0 need attention",
    );
    expect(task.canCancel).toBe(true);
    expect(task.resumeRoute).toBe("/job-finder/applications");
    expect(task.resumeActionLabel).toBe("Continue application");
    expect(task.historyEstimateLabel).toBeNull();
  });

  test.each([
    ["draft", "active", "Ready to start"],
    ["awaiting_submit_approval", "active", "Waiting for your approval"],
    ["running", "active", "Opening application"],
    ["paused_for_user_review", "paused", "Waiting for your review"],
    ["paused_for_consent", "paused", "Waiting for your consent"],
    ["completed", "completed", "Ready for final review"],
    ["cancelled", "cancelled", "Application stopped"],
    ["failed", "failed", "Application needs attention"],
  ] as const)(
    "presents apply state %s as a user goal without changing its technical status",
    (state, status, stageLabel) => {
      const task = findTask(
        buildJobFinderTaskCenterModel({
          workspace: createWorkspace({
            applyRuns: [createApplyRun({ state })],
          }),
          isDiscoveryPending: false,
          isResumeImportPending: false,
        }),
        "apply",
      );

      expect(task).toMatchObject({
        id: "apply_current",
        title: "Applications",
        status,
        stageLabel,
      });
    },
  );

  test("uses Applications as the queue-mode goal and fallback source without submission claims", () => {
    const task = findTask(
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace({
          applyRuns: [
            createApplyRun({
              mode: "queue_auto",
              currentJobId: null,
              jobIds: [],
            }),
          ],
        }),
        isDiscoveryPending: false,
        isResumeImportPending: false,
      }),
      "apply",
    );
    const presentation = [
      task.title,
      task.stageLabel,
      task.sourceLabel,
      task.countLabel,
      task.historyEstimateLabel,
      task.resumeActionLabel,
    ]
      .filter((label): label is string => label !== null)
      .join(" ");

    expect(task.title).toBe("Applications");
    expect(task.sourceLabel).toBe("Applications");
    expect(presentation).not.toMatch(
      /application queue|application preparation|preparing employer form|preparation completed|\brun\b|submit|submitted|verified/i,
    );
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

  test("shows the tailored-drafts task only while a batch run is active", () => {
    const buildModel = (
      preparation: TailoredDraftPreparationViewState | null,
    ) =>
      buildJobFinderTaskCenterModel({
        workspace: createWorkspace(),
        isDiscoveryPending: false,
        isResumeImportPending: false,
        tailoredDraftPreparation: preparation,
      });

    expect(
      buildModel(null).items.some((item) => item.kind === "tailored_drafts"),
    ).toBe(false);
    for (const status of ["idle", "completed", "stopped", "failed"] as const) {
      expect(
        buildModel(createTailoredDraftPreparation({ status })).items.some(
          (item) => item.kind === "tailored_drafts",
        ),
      ).toBe(false);
    }

    const model = buildModel(createTailoredDraftPreparation());
    const task = findTask(model, "tailored_drafts");
    expect(task.status).toBe("active");
    expect(task.title).toBe("Tailored drafts");
    expect(task.countLabel).toBe("1 of 3 prepared");
    expect(task.canCancel).toBe(true);
    expect(task.cancelKind).toBe("tailored_drafts");
    expect(model.activeCount).toBe(1);
  });

  test("reports tailored-draft failures in progress without claiming durability", () => {
    const model = buildJobFinderTaskCenterModel({
      workspace: createWorkspace(),
      isDiscoveryPending: false,
      isResumeImportPending: false,
      tailoredDraftPreparation: createTailoredDraftPreparation({
        completedCount: 2,
        failedCount: 1,
        totalCount: 5,
      }),
    });
    const task = findTask(model, "tailored_drafts");

    expect(task.countLabel).toBe("2 of 5 prepared · 1 failed");
    expect(task.stageLabel).not.toMatch(/complete|finished/i);
    expect(task.resumeRoute).toBe("/job-finder/review-queue");
  });
});
