import { ApplyRunSchema } from "@unemployed/contracts";
import { createInMemoryJobFinderRepository } from "@unemployed/db";
import { describe, expect, test } from "vitest";

import { createJobFinderWorkspaceService } from "./index";
import {
  createAiClient,
  createBrowserRuntime,
  createDocumentManager,
  createSeed,
} from "./workspace-service.test-support";

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
});
