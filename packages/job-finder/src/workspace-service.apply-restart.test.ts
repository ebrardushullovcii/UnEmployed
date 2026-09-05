import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
} from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createJobFinderWorkspaceService } from "./index";
import {
  createAiClient,
  createBrowserRuntime,
  createDocumentManager,
  createSeed,
} from "./workspace-service.test-support";
afterEach(() => {
  vi.useRealTimers();
});

function createService(
  repository: ReturnType<typeof createInMemoryJobFinderRepository>,
) {
  return createJobFinderWorkspaceService({
    repository,
    browserRuntime: createBrowserRuntime(),
    aiClient: createAiClient(),
    documentManager: createDocumentManager(),
  });
}

describe("apply restart recovery", () => {
  test("marks a hard-interrupted running apply as failed when the workspace reopens", async () => {
    const seed = createSeed();
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_before_restart",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_ready"],
        currentJobId: "job_ready",
        submitApprovalId: "apply_approval_before_restart",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:01:00.000Z",
        completedAt: null,
        summary: "Automatic apply queue is running in safe review mode.",
        detail:
          "This safe execution can prepare applications but stops before final submit.",
        totalJobs: 1,
        pendingJobs: 1,
        submittedJobs: 0,
        skippedJobs: 0,
        blockedJobs: 0,
        failedJobs: 0,
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const reopenedService = createService(repository);
    const snapshot = await reopenedService.getWorkspaceSnapshot();
    const recoveredRun = snapshot.applyRuns.find(
      (run) => run.id === "apply_run_before_restart",
    );

    expect(recoveredRun).toMatchObject({
      state: "failed",
      summary: "Automatic apply stopped because the app closed.",
      detail:
        "The app closed before safe application preparation finished. No final submit action was taken, and any preparation saved before the interruption remains available for review.",
    });
    expect(recoveredRun?.completedAt).not.toBeNull();
    expect(snapshot.applyRuns.some((run) => run.state === "running")).toBe(
      false,
    );
    expect((await repository.listApplyRuns())[0]).toEqual(recoveredRun);

    const secondSnapshot = await reopenedService.getWorkspaceSnapshot();
    expect(
      secondSnapshot.applyRuns.find(
        (run) => run.id === "apply_run_before_restart",
      ),
    ).toEqual(recoveredRun);
  });

  test("terminalizes a begun planned result during restart recovery while preserving its capacity mark", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_marked_before_restart",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_ready"],
        currentJobId: "job_ready",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Automatic apply queue is running in safe review mode.",
        detail: "Preparation started before the process stopped.",
        totalJobs: 1,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_marked_before_restart",
        runId: "apply_run_marked_before_restart",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "planned",
        summary: "Application preparation is planned.",
        detail: "The durable start mark committed before browser completion.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();
    const recoveredRun = snapshot.applyRuns.find(
      (run) => run.id === "apply_run_marked_before_restart",
    );
    const recoveredResult = snapshot.applyJobResults.find(
      (result) => result.id === "apply_result_marked_before_restart",
    );

    expect(recoveredRun).toMatchObject({
      state: "failed",
      summary: "Automatic apply stopped because the app closed.",
    });
    expect(recoveredResult).toMatchObject({
      state: "failed",
      completedAt: expect.any(String) as string,
      summary: "Application preparation stopped before review.",
      applicationPreparationStartedAt: startedAt,
      applicationPreparationStartedLocalDate: "2026-03-20",
    });
    // The interrupted-but-begun slot keeps consuming today's daily capacity.
    expect(
      snapshot.dashboard.globalDailyApplicationPreparationCapacity,
    ).toMatchObject({ used: 1, remaining: 19 });
    expect((await repository.listApplyJobResults())[0]).toEqual(
      recoveredResult,
    );

    const secondSnapshot =
      await createService(repository).getWorkspaceSnapshot();
    expect(
      secondSnapshot.applyRuns.find(
        (run) => run.id === "apply_run_marked_before_restart",
      ),
    ).toEqual(recoveredRun);
    expect(
      secondSnapshot.applyJobResults.find(
        (result) => result.id === "apply_result_marked_before_restart",
      ),
    ).toEqual(recoveredResult);
  });

  test("terminalizes interrupted planned results during restart recovery while keeping begun capacity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_mixed_queue",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_ready", "job_generating"],
        currentJobId: "job_generating",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Automatic apply queue is running in safe review mode.",
        detail: "The second queued job was staged when the process stopped.",
        totalJobs: 2,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_never_began",
        runId: "apply_run_mixed_queue",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "planned",
        summary: "Application preparation is starting.",
        detail:
          "The browser application flow has not reached a review checkpoint yet.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
      }),
      ApplyJobResultSchema.parse({
        id: "apply_result_began_before_restart",
        runId: "apply_run_mixed_queue",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        queuePosition: 1,
        state: "planned",
        summary: "Application preparation is starting.",
        detail: "The durable start mark committed before browser completion.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const service = createService(repository);
    const snapshot = await service.getWorkspaceSnapshot();
    const recoveredRun = snapshot.applyRuns.find(
      (run) => run.id === "apply_run_mixed_queue",
    );
    const recoveredNeverBeganResult = snapshot.applyJobResults.find(
      (result) => result.id === "apply_result_never_began",
    );
    const recoveredBegunResult = snapshot.applyJobResults.find(
      (result) => result.id === "apply_result_began_before_restart",
    );

    expect(recoveredRun).toMatchObject({
      state: "failed",
      completedAt: expect.any(String) as string,
    });
    expect(recoveredNeverBeganResult).toMatchObject({
      state: "failed",
      completedAt: expect.any(String) as string,
      summary: "Application preparation stopped before it began.",
      detail: expect.stringContaining(
        "No final submit action occurred",
      ) as string,
    });
    // Legacy rows persist without preparation marks at all; recovery must
    // treat them as never-begun and rewrite explicit nulls so downstream
    // begun-capacity accounting never reads them as uncertain evidence.
    expect(
      recoveredNeverBeganResult?.applicationPreparationStartedAt,
    ).toBeNull();
    expect(
      recoveredNeverBeganResult?.applicationPreparationStartedLocalDate,
    ).toBeNull();
    expect(recoveredBegunResult).toMatchObject({
      state: "failed",
      completedAt: expect.any(String) as string,
      summary: "Application preparation stopped before review.",
      applicationPreparationStartedAt: startedAt,
      applicationPreparationStartedLocalDate: "2026-03-20",
    });
    expect(
      snapshot.dashboard.globalDailyApplicationPreparationCapacity,
    ).toMatchObject({ used: 1, legacyUncertain: 0, remaining: 19 });

    const persistedResults = await repository.listApplyJobResults();
    expect(
      persistedResults.find((r) => r.id === "apply_result_never_began"),
    ).toEqual(recoveredNeverBeganResult);
    expect(
      persistedResults.find(
        (r) => r.id === "apply_result_began_before_restart",
      ),
    ).toEqual(recoveredBegunResult);

    const secondSnapshot = await service.getWorkspaceSnapshot();
    expect(
      secondSnapshot.applyRuns.find(
        (run) => run.id === "apply_run_mixed_queue",
      ),
    ).toEqual(recoveredRun);
    expect(
      secondSnapshot.applyJobResults.find(
        (result) => result.id === "apply_result_never_began",
      ),
    ).toEqual(recoveredNeverBeganResult);
    expect(
      secondSnapshot.applyJobResults.find(
        (result) => result.id === "apply_result_began_before_restart",
      ),
    ).toEqual(recoveredBegunResult);
  });

  test("projects an interrupted in-flight result, attempt, and record onto truthful failed states on reopen", async () => {
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_inflight_before_restart",
        mode: "copilot",
        state: "running",
        jobIds: ["job_ready"],
        currentJobId: "job_ready",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Apply copilot is preparing safely.",
        detail: "Stops before final submit.",
        totalJobs: 1,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_filling_before_restart",
        runId: "apply_run_inflight_before_restart",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "filling",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
    ];
    seed.applicationAttempts = [
      ApplicationAttemptSchema.parse({
        id: "attempt_inflight_before_restart",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        state: "in_progress",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
        nextActionLabel: null,
        outcome: null,
      }),
    ];
    seed.applicationRecords = [
      ApplicationRecordSchema.parse({
        id: "application_job_ready",
        jobId: "job_ready",
        title: "Senior Product Designer",
        company: "Signal Systems",
        status: "approved",
        lastActionLabel: "Filling prepared answers safely.",
        nextActionLabel: null,
        lastUpdatedAt: startedAt,
        lastAttemptState: "in_progress",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();
    const recoveredRun = snapshot.applyRuns.find(
      (run) => run.id === "apply_run_inflight_before_restart",
    );
    const recoveredResult = snapshot.applyJobResults.find(
      (result) => result.id === "apply_result_filling_before_restart",
    );
    const recoveredAttempt = snapshot.applicationAttempts.find(
      (attempt) => attempt.id === "attempt_inflight_before_restart",
    );
    const recoveredRecord = snapshot.applicationRecords.find(
      (record) => record.id === "application_job_ready",
    );

    expect(recoveredRun).toMatchObject({ state: "failed" });
    expect(recoveredResult).toMatchObject({
      state: "failed",
      summary: "Application preparation stopped when the app closed.",
      detail: expect.stringContaining(
        "No final submit action occurred",
      ) as string,
      // Exact lineage survives recovery untouched.
      applicationRecordId: "application_job_ready",
      applicationPreparationStartedAt: startedAt,
      applicationPreparationStartedLocalDate: "2026-03-20",
    });
    expect(recoveredAttempt).toMatchObject({
      state: "failed",
      summary: "Preparation stopped when the app closed.",
      nextActionLabel: "Retry preparation when you are ready.",
      applicationRecordId: "application_job_ready",
    });
    expect(recoveredRecord).toMatchObject({
      status: "approved",
      lastAttemptState: "failed",
      lastActionLabel: "Preparation stopped when the app closed.",
      nextActionLabel: "Retry preparation when you are ready.",
    });
    expect(recoveredRecord?.events).toHaveLength(1);
    expect(recoveredRecord?.events[0]).toMatchObject({
      title: "Preparation stopped because the app closed",
      emphasis: "warning",
    });

    const persistedAttempts = await repository.listApplicationAttempts();
    expect(persistedAttempts[0]).toEqual(recoveredAttempt);
    const persistedRecords = await repository.listApplicationRecords();
    expect(persistedRecords[0]).toEqual(recoveredRecord);

    const secondSnapshot =
      await createService(repository).getWorkspaceSnapshot();
    expect(
      secondSnapshot.applicationAttempts.find(
        (attempt) => attempt.id === "attempt_inflight_before_restart",
      ),
    ).toEqual(recoveredAttempt);
    expect(
      secondSnapshot.applicationRecords.find(
        (record) => record.id === "application_job_ready",
      ),
    ).toEqual(recoveredRecord);
  });

  test("preserves awaiting-review checkpoints and paused attempts during restart recovery", async () => {
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_mixed_checkpoints",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_ready", "job_generating"],
        currentJobId: "job_generating",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Automatic apply queue is running in safe review mode.",
        detail: "The first job reached its review checkpoint before the close.",
        totalJobs: 2,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_awaiting_review",
        runId: "apply_run_mixed_checkpoints",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "awaiting_review",
        summary: "Application preparation is ready for review.",
        detail: "Stopped at the user-owned review checkpoint.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:01:00.000Z",
        completedAt: "2026-03-20T10:01:00.000Z",
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
      ApplyJobResultSchema.parse({
        id: "apply_result_still_filling",
        runId: "apply_run_mixed_checkpoints",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        queuePosition: 1,
        state: "filling",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt: "2026-03-20T10:02:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
      }),
    ];
    seed.applicationAttempts = [
      ApplicationAttemptSchema.parse({
        id: "attempt_paused_checkpoint",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        state: "paused",
        summary: "Paused for user review.",
        detail: "The user owns this checkpoint.",
        startedAt,
        updatedAt: "2026-03-20T10:01:00.000Z",
        completedAt: null,
        nextActionLabel: null,
        outcome: null,
      }),
      ApplicationAttemptSchema.parse({
        id: "attempt_in_progress_interrupted",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        state: "in_progress",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt: "2026-03-20T10:02:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        nextActionLabel: null,
        outcome: null,
      }),
    ];
    seed.applicationRecords = [
      ApplicationRecordSchema.parse({
        id: "application_job_ready",
        jobId: "job_ready",
        title: "Senior Product Designer",
        company: "Signal Systems",
        status: "approved",
        lastActionLabel: "Paused for user review.",
        nextActionLabel: "Review the prepared application.",
        lastUpdatedAt: "2026-03-20T10:01:00.000Z",
        lastAttemptState: "paused",
      }),
      ApplicationRecordSchema.parse({
        id: "application_job_generating",
        jobId: "job_generating",
        title: "Product Design Lead",
        company: "Northwind Labs",
        status: "approved",
        lastActionLabel: "Filling prepared answers safely.",
        nextActionLabel: null,
        lastUpdatedAt: startedAt,
        lastAttemptState: "in_progress",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();

    // The awaiting-review row sits at a truthful user-owned checkpoint and
    // must survive restart recovery byte-for-byte.
    expect(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_awaiting_review",
      ),
    ).toMatchObject({
      state: "awaiting_review",
      summary: "Application preparation is ready for review.",
    });
    expect(
      snapshot.applicationAttempts.find(
        (a) => a.id === "attempt_paused_checkpoint",
      ),
    ).toMatchObject({
      state: "paused",
      summary: "Paused for user review.",
    });
    expect(
      snapshot.applicationRecords.find((r) => r.id === "application_job_ready"),
    ).toMatchObject({
      lastAttemptState: "paused",
      lastActionLabel: "Paused for user review.",
      events: [],
    });

    // The interrupted in-flight row terminalizes everywhere.
    expect(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_still_filling",
      ),
    ).toMatchObject({
      state: "failed",
      summary: "Application preparation stopped when the app closed.",
    });
    expect(
      snapshot.applicationAttempts.find(
        (a) => a.id === "attempt_in_progress_interrupted",
      ),
    ).toMatchObject({
      state: "failed",
    });
    expect(
      snapshot.applicationRecords.find(
        (r) => r.id === "application_job_generating",
      ),
    ).toMatchObject({
      lastAttemptState: "failed",
      lastActionLabel: "Preparation stopped when the app closed.",
    });
  });

  test("keeps legacy null-lineage results fail-closed without attributing them to a record", async () => {
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_legacy_lineage",
        mode: "copilot",
        state: "running",
        jobIds: ["job_generating"],
        currentJobId: "job_generating",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Apply copilot is preparing safely.",
        detail: "Stops before final submit.",
        totalJobs: 1,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_legacy_null_record",
        runId: "apply_run_legacy_lineage",
        jobId: "job_generating",
        applicationRecordId: null,
        queuePosition: 0,
        state: "question_capture",
        summary: "Capturing application questions safely.",
        detail: "The browser application flow was underway.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
      }),
    ];
    seed.applicationRecords = [
      ApplicationRecordSchema.parse({
        id: "application_unlinked_same_job",
        jobId: "job_generating",
        title: "Product Design Lead",
        company: "Northwind Labs",
        status: "approved",
        lastActionLabel: "Filling prepared answers safely.",
        nextActionLabel: null,
        lastUpdatedAt: startedAt,
        lastAttemptState: "in_progress",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();

    // The legacy null-lineage result itself terminalizes truthfully...
    expect(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_legacy_null_record",
      ),
    ).toMatchObject({
      state: "failed",
      applicationRecordId: null,
      summary: "Application preparation stopped when the app closed.",
    });
    // ...but the same-job record without exact lineage stays untouched:
    // recovery must not infer attribution from jobId alone.
    expect(
      snapshot.applicationRecords.find(
        (r) => r.id === "application_unlinked_same_job",
      ),
    ).toMatchObject({
      lastAttemptState: "in_progress",
      lastActionLabel: "Filling prepared answers safely.",
      events: [],
    });
  });

  test("sweeps non-terminal results stranded under an already-terminal run by a prior partial recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    // The partial pass ran the previous local day, so its already-swept row
    // carries no same-day capacity evidence of its own.
    const priorRecoveryAt = "2026-03-19T10:05:00.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_partially_recovered",
        mode: "queue_auto",
        // Already terminal because an earlier recovery pass crashed after
        // committing this run but before sweeping its results and counters.
        state: "failed",
        jobIds: ["job_ready", "job_generating"],
        currentJobId: "job_generating",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: priorRecoveryAt,
        completedAt: priorRecoveryAt,
        summary: "Automatic apply stopped because the app closed.",
        detail:
          "The app closed before safe application preparation finished. No final submit action was taken, and any preparation saved before the interruption remains available for review.",
        totalJobs: 2,
        pendingJobs: 2,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_orphan_filling",
        runId: "apply_run_partially_recovered",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "filling",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
      // Already terminalized by the partial pass, but its attempt/record
      // projections never landed because the pass died in between.
      ApplyJobResultSchema.parse({
        id: "apply_result_sweep_failed_unprojected",
        runId: "apply_run_partially_recovered",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        queuePosition: 1,
        state: "failed",
        summary: "Application preparation stopped when the app closed.",
        detail:
          "The app closed while this job's application preparation was underway, so it never reached its review checkpoint. No final submit action occurred.",
        startedAt: priorRecoveryAt,
        updatedAt: priorRecoveryAt,
        completedAt: priorRecoveryAt,
      }),
    ];
    seed.applicationAttempts = [
      ApplicationAttemptSchema.parse({
        id: "attempt_orphan_inflight",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        state: "in_progress",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
        nextActionLabel: null,
        outcome: null,
      }),
      ApplicationAttemptSchema.parse({
        id: "attempt_stranded_projection",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        state: "in_progress",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
        nextActionLabel: null,
        outcome: null,
      }),
    ];
    seed.applicationRecords = [
      ApplicationRecordSchema.parse({
        id: "application_job_ready",
        jobId: "job_ready",
        title: "Senior Product Designer",
        company: "Signal Systems",
        status: "approved",
        lastActionLabel: "Filling prepared answers safely.",
        nextActionLabel: null,
        lastUpdatedAt: startedAt,
        lastAttemptState: "in_progress",
      }),
      ApplicationRecordSchema.parse({
        id: "application_job_generating",
        jobId: "job_generating",
        title: "Principal UX Engineer",
        company: "Northwind Labs",
        status: "approved",
        lastActionLabel: "Filling prepared answers safely.",
        nextActionLabel: null,
        lastUpdatedAt: startedAt,
        lastAttemptState: "in_progress",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();

    // The orphaned filling row terminalizes even though its parent run is no
    // longer running, and keeps its capacity mark.
    expect(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_orphan_filling",
      ),
    ).toMatchObject({
      state: "failed",
      summary: "Application preparation stopped when the app closed.",
      applicationPreparationStartedAt: startedAt,
      applicationPreparationStartedLocalDate: "2026-03-20",
      applicationRecordId: "application_job_ready",
    });
    // The already-terminal row is not rewritten...
    expect(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_sweep_failed_unprojected",
      ),
    ).toMatchObject({ updatedAt: priorRecoveryAt });
    // ...but its stranded exact-lineage attempt and record still heal.
    expect(
      snapshot.applicationAttempts.find(
        (a) => a.id === "attempt_orphan_inflight",
      ),
    ).toMatchObject({
      state: "failed",
      summary: "Preparation stopped when the app closed.",
      applicationRecordId: "application_job_ready",
    });
    expect(
      snapshot.applicationAttempts.find(
        (a) => a.id === "attempt_stranded_projection",
      ),
    ).toMatchObject({ state: "failed" });
    expect(
      snapshot.applicationRecords.find((r) => r.id === "application_job_ready"),
    ).toMatchObject({
      lastAttemptState: "failed",
      lastActionLabel: "Preparation stopped when the app closed.",
      events: [
        {
          id: "event_apply_run_partially_recovered_app_closed_recovery_application_job_ready",
          title: "Preparation stopped because the app closed",
          emphasis: "warning",
        },
      ],
    });
    expect(
      snapshot.applicationRecords.find(
        (r) => r.id === "application_job_generating",
      ),
    ).toMatchObject({
      lastAttemptState: "failed",
      events: [
        {
          id: "event_apply_run_partially_recovered_app_closed_recovery_application_job_generating",
        },
      ],
    });

    const persistedRun = (await repository.listApplyRuns()).find(
      (r) => r.id === "apply_run_partially_recovered",
    );
    if (!persistedRun) throw new Error("Expected the partially recovered run.");
    // The stale running-time counters the partial pass left behind are
    // recomputed truthfully without touching state, copy, or completion.
    expect(persistedRun).toMatchObject({
      state: "failed",
      summary: "Automatic apply stopped because the app closed.",
      completedAt: priorRecoveryAt,
      totalJobs: 2,
      pendingJobs: 0,
      failedJobs: 2,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
    });
    // The begun slot keeps consuming today's daily capacity.
    expect(
      snapshot.dashboard.globalDailyApplicationPreparationCapacity,
    ).toMatchObject({ used: 1, remaining: 19 });

    // Reopening again is a no-op: every sweep write is idempotent.
    const secondSnapshot =
      await createService(repository).getWorkspaceSnapshot();
    expect(secondSnapshot.applyRuns.find((r) => r.id === persistedRun.id)).toEqual(
      persistedRun,
    );
    expect(
      secondSnapshot.applyJobResults.find(
        (r) => r.id === "apply_result_orphan_filling",
      ),
    ).toEqual(
      snapshot.applyJobResults.find(
        (r) => r.id === "apply_result_orphan_filling",
      ),
    );
    expect(
      secondSnapshot.applicationRecords.find(
        (r) => r.id === "application_job_generating",
      ),
    ).toEqual(
      snapshot.applicationRecords.find(
        (r) => r.id === "application_job_generating",
      ),
    );
  });

  test("terminalizes an interrupted submitting result without claiming submission and recomputes run counters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_submitting_before_restart",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_ready"],
        currentJobId: "job_ready",
        submitApprovalId: "approval_submitting_before_restart",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Automatic apply queue is running.",
        detail: "The flow reached its submit step before the process stopped.",
        totalJobs: 1,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_submitting_before_restart",
        runId: "apply_run_submitting_before_restart",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "submitting",
        summary: "Reviewing final submit step.",
        detail: "The browser application flow was at the submit checkpoint.",
        startedAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();
    const recoveredRun = snapshot.applyRuns.find(
      (run) => run.id === "apply_run_submitting_before_restart",
    );
    const recoveredResult = snapshot.applyJobResults.find(
      (result) => result.id === "apply_result_submitting_before_restart",
    );

    // A submitting row is in-flight work, not a submission claim: recovery
    // terminalizes it as failed with explicit no-submit copy.
    expect(recoveredResult).toMatchObject({
      state: "failed",
      summary: "Application preparation stopped when the app closed.",
      detail: expect.stringContaining(
        "No final submit action occurred",
      ) as string,
      applicationPreparationStartedAt: startedAt,
      applicationPreparationStartedLocalDate: "2026-03-20",
      applicationRecordId: "application_job_ready",
    });
    // The interrupted run's counters describe its durable end state instead
    // of retaining the stale running-time queue count.
    expect(recoveredRun).toMatchObject({
      state: "failed",
      completedAt: expect.any(String) as string,
      totalJobs: 1,
      pendingJobs: 0,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 1,
    });
    expect(JSON.stringify(snapshot)).not.toContain('"submitted"');
    expect((await repository.listApplyRuns())[0]).toEqual(recoveredRun);
    expect((await repository.listApplyJobResults())[0]).toEqual(
      recoveredResult,
    );
  });

  test("derives dashboard queue truth from recomputed interrupted-run counters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 12));
    const seed = createSeed();
    const startedAt = "2026-03-20T10:00:30.000Z";
    seed.applyRuns = [
      ApplyRunSchema.parse({
        id: "apply_run_queue_truth_running",
        mode: "queue_auto",
        campaignId: "campaign_default",
        state: "running",
        jobIds: ["job_ready", "job_generating"],
        currentJobId: "job_generating",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: startedAt,
        completedAt: null,
        summary: "Automatic apply queue is running.",
        detail: "Interrupted mid-queue.",
        totalJobs: 2,
        // Stale running-time count that must not survive recovery.
        pendingJobs: 2,
      }),
      ApplyRunSchema.parse({
        id: "apply_run_queue_truth_partial",
        mode: "queue_auto",
        campaignId: "campaign_default",
        state: "failed",
        jobIds: ["job_ready"],
        currentJobId: "job_ready",
        visualCheckpointsEnabled: false,
        createdAt: "2026-03-20T09:00:00.000Z",
        updatedAt: "2026-03-20T09:05:00.000Z",
        completedAt: "2026-03-20T09:05:00.000Z",
        summary: "Automatic apply stopped because the app closed.",
        detail: "Left behind by a prior partial recovery.",
        totalJobs: 1,
        pendingJobs: 1,
      }),
    ];
    seed.applyJobResults = [
      ApplyJobResultSchema.parse({
        id: "apply_result_queue_truth_awaiting",
        runId: "apply_run_queue_truth_running",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "awaiting_review",
        summary: "Application preparation is ready for review.",
        detail: "Stopped at the user-owned review checkpoint.",
        startedAt,
        updatedAt: startedAt,
        completedAt: startedAt,
        applicationPreparationStartedAt: startedAt,
        applicationPreparationStartedLocalDate: "2026-03-20",
      }),
      ApplyJobResultSchema.parse({
        id: "apply_result_queue_truth_filling",
        runId: "apply_run_queue_truth_running",
        jobId: "job_generating",
        applicationRecordId: "application_job_generating",
        queuePosition: 1,
        state: "filling",
        summary: "Filling prepared answers safely.",
        detail: "The browser application flow was underway.",
        startedAt,
        updatedAt: startedAt,
        completedAt: null,
      }),
      ApplyJobResultSchema.parse({
        id: "apply_result_queue_truth_orphan",
        runId: "apply_run_queue_truth_partial",
        jobId: "job_ready",
        applicationRecordId: "application_job_ready",
        queuePosition: 0,
        state: "planned",
        summary: "Application preparation is planned.",
        detail: "Stranded by the prior partial pass.",
        startedAt: "2026-03-20T09:00:00.000Z",
        updatedAt: "2026-03-20T09:00:00.000Z",
        completedAt: null,
      }),
    ];
    const repository = createInMemoryJobFinderRepository(seed);

    const snapshot = await createService(repository).getWorkspaceSnapshot();
    const activeCampaign = snapshot.campaigns.find(
      (campaign) => campaign.id === "campaign_default",
    );
    if (!activeCampaign) throw new Error("Expected the default campaign.");

    // Queue truth after recovery: only the preserved awaiting_review
    // checkpoint remains outstanding. The stale counts (2 + 1) are gone.
    expect(activeCampaign.progress).toMatchObject({
      remainingQueueSize: 1,
      currentBatchCompleted: 0,
      currentBatchTotal: 0,
    });
    const persistedRuns = await repository.listApplyRuns();
    expect(
      persistedRuns.find((r) => r.id === "apply_run_queue_truth_running"),
    ).toMatchObject({
      state: "failed",
      pendingJobs: 1,
      failedJobs: 1,
    });
    expect(
      persistedRuns.find((r) => r.id === "apply_run_queue_truth_partial"),
    ).toMatchObject({
      state: "failed",
      summary: "Automatic apply stopped because the app closed.",
      pendingJobs: 0,
      failedJobs: 1,
    });
  });
});
