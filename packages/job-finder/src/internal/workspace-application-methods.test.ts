import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  createInMemoryJobFinderRepository,
  type JobFinderRepositorySeed,
} from "@unemployed/db";
import { describe, expect, test, vi } from "vitest";

import { createJobFinderWorkspaceService } from "../workspace-service";
import { createSeed } from "../workspace-service.test-fixtures";
import {
  createAiClient,
  createBrowserRuntime,
  createDocumentManager,
  createResearchAdapter,
} from "../workspace-service.test-runtimes";
import type { ResumeExportFileVerifier } from "./workspace-service-context";

type ExecuteFlow = BrowserSessionRuntime["executeApplicationFlow"];

const RETIRED_USER_DATA_ROOT = "/retired-user-data/documents/resumes/generated";
const CURRENT_USER_DATA_ROOT = "/current-user-data/documents/resumes/generated";

const STALE_EXPORT_PATH = `${RETIRED_USER_DATA_ROOT}/job-ready-resume.pdf`;
const RECOVERED_EXPORT_PATH = `${CURRENT_USER_DATA_ROOT}/job-ready-resume.pdf`;
const STALE_ORIGINAL_RESUME_PATH = `${RETIRED_USER_DATA_ROOT}/alex-vanguard.pdf`;
const RECOVERED_ORIGINAL_RESUME_PATH = `${CURRENT_USER_DATA_ROOT}/alex-vanguard.pdf`;

const EXPORT_SHA256 = "b".repeat(64);
const ORIGINAL_RESUME_SHA256 = "a".repeat(64);

/**
 * Stands in for the desktop local verifier: it recovers a path that was
 * recorded under a retired user-data directory by looking for the same file
 * name under the current one, and reports which candidate it actually read.
 */
function createRecoveringExportFileVerifier(disk: ReadonlyMap<string, string>) {
  const resolveOnDiskPath = (filePath: string): string | null => {
    const trimmedPath = filePath.trim();
    if (disk.has(trimmedPath)) {
      return trimmedPath;
    }

    if (!trimmedPath.startsWith(`${RETIRED_USER_DATA_ROOT}/`)) {
      return null;
    }

    const recoveredPath = `${CURRENT_USER_DATA_ROOT}/${trimmedPath.split("/").at(-1)}`;
    return disk.has(recoveredPath) ? recoveredPath : null;
  };

  const verifier: ResumeExportFileVerifier = {
    exists(filePath) {
      return Promise.resolve(resolveOnDiskPath(filePath) !== null);
    },
    sha256(filePath) {
      const resolvedPath = resolveOnDiskPath(filePath);
      if (!resolvedPath) {
        throw new Error(`Resume export file is missing on disk: ${filePath}`);
      }

      return Promise.resolve(disk.get(resolvedPath)!);
    },
    resolvePath(filePath) {
      return Promise.resolve(resolveOnDiskPath(filePath));
    },
  };

  return verifier;
}

/**
 * Mirrors the production runtime, which re-checks the artifact path it is
 * handed with its own `access()` and reports `missing_resume` when that exact
 * path is unreadable. Reusing the catalog runtime's own missing-resume result
 * keeps the shape identical to the real blocked outcome.
 */
function createDiskAwareBrowserRuntime(reachablePaths: ReadonlySet<string>) {
  const baseRuntime = createBrowserRuntime();
  if (!baseRuntime.executeApplicationFlow) {
    throw new Error("Expected catalog browser runtime to support apply flows.");
  }

  const runFlow = baseRuntime.executeApplicationFlow.bind(baseRuntime);
  const executeApplicationFlow = vi.fn<ExecuteFlow>(
    async (source, input, options) => {
      const artifactPath = input.resumeArtifact.filePath.trim();
      if (reachablePaths.has(artifactPath)) {
        return runFlow(source, input, options);
      }

      return runFlow(
        source,
        {
          ...input,
          resumeArtifact: { ...input.resumeArtifact, filePath: "" },
        },
        options,
      );
    },
  );

  return {
    browserRuntime: { ...baseRuntime, executeApplicationFlow },
    executeApplicationFlow,
  };
}

function stageApprovedTailoredExport(
  seed: JobFinderRepositorySeed,
  filePath: string,
  sha256: string,
): void {
  seed.tailoredAssets = seed.tailoredAssets.map((asset) =>
    asset.jobId === "job_ready" ? { ...asset, storagePath: filePath } : asset,
  );
  seed.resumeDrafts = [
    {
      id: "resume_draft_job_ready",
      jobId: "job_ready",
      status: "approved",
      templateId: "classic_ats",
      identity: null,
      sections: [],
      targetPageCount: 2,
      generationMethod: "deterministic",
      workHistoryReviewAcknowledgments: [],
      claimConfirmations: [],
      approvedAt: "2026-03-20T10:04:00.000Z",
      approvedExportId: "resume_export_job_ready",
      staleReason: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:04:00.000Z",
    },
  ];
  seed.resumeExportArtifacts = [
    {
      id: "resume_export_job_ready",
      draftId: "resume_draft_job_ready",
      jobId: "job_ready",
      format: "pdf",
      filePath,
      sha256,
      pageCount: 2,
      templateId: "classic_ats",
      exportedAt: "2026-03-20T10:04:00.000Z",
      isApproved: true,
    },
  ];
}

function createService(input: {
  seed: JobFinderRepositorySeed;
  exportFileVerifier: ResumeExportFileVerifier;
  browserRuntime: BrowserSessionRuntime;
}) {
  const repository = createInMemoryJobFinderRepository(input.seed);
  return createJobFinderWorkspaceService({
    repository,
    browserRuntime: input.browserRuntime,
    aiClient: createAiClient(),
    documentManager: createDocumentManager(),
    exportFileVerifier: input.exportFileVerifier,
    researchAdapter: createResearchAdapter(),
  });
}

describe("apply prerequisites resolve the resume path the verifier actually read", () => {
  test("hands the recovered tailored export path to the runtime instead of the stale recorded one", async () => {
    const seed = createSeed();
    stageApprovedTailoredExport(seed, STALE_EXPORT_PATH, EXPORT_SHA256);
    const disk = new Map([[RECOVERED_EXPORT_PATH, EXPORT_SHA256]]);
    const { browserRuntime, executeApplicationFlow } =
      createDiskAwareBrowserRuntime(new Set(disk.keys()));
    const workspaceService = createService({
      seed,
      exportFileVerifier: createRecoveringExportFileVerifier(disk),
      browserRuntime,
    });

    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");

    // The visible defect first: the readiness gate passes, then the runtime
    // re-checks the recorded path, reports missing_resume, and the stale
    // blocker sync offers the same failing retry again.
    const jobResult = snapshot.applyJobResults.find(
      (result) => result.jobId === "job_ready",
    );
    expect(jobResult?.blockerReason).not.toBe("resume_missing");
    expect(snapshot.applicationRecords[0]?.latestBlocker?.code).not.toBe(
      "missing_resume",
    );
    expect(snapshot.applicationRecords[0]?.nextActionLabel).not.toBe(
      "Retry preparation when you are ready.",
    );

    const executionInput = executeApplicationFlow.mock.calls[0]?.[1];
    expect(executionInput?.resumeArtifact).toMatchObject({
      jobId: "job_ready",
      source: "tailored_export",
      exportArtifactId: "resume_export_job_ready",
      fileName: "job-ready-resume.pdf",
      filePath: RECOVERED_EXPORT_PATH,
    });
    expect(executionInput?.resumeArtifact.sha256).toBe(EXPORT_SHA256);
    expect(executionInput).toMatchObject({
      mode: "prepare_only",
      accountCreationAuthorized: false,
      submitAuthorized: false,
    });
  });

  test("hands the recovered original CV path to the runtime instead of the stale recorded one", async () => {
    const seed = createSeed();
    seed.settings = {
      ...seed.settings,
      resumeApplicationMode: "original_resume",
    };
    seed.profile = {
      ...seed.profile,
      baseResume: {
        ...seed.profile.baseResume,
        storagePath: STALE_ORIGINAL_RESUME_PATH,
        sha256: ORIGINAL_RESUME_SHA256,
      },
    };
    const disk = new Map([
      [RECOVERED_ORIGINAL_RESUME_PATH, ORIGINAL_RESUME_SHA256],
    ]);
    const { browserRuntime, executeApplicationFlow } =
      createDiskAwareBrowserRuntime(new Set(disk.keys()));
    const workspaceService = createService({
      seed,
      exportFileVerifier: createRecoveringExportFileVerifier(disk),
      browserRuntime,
    });

    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");

    const jobResult = snapshot.applyJobResults.find(
      (result) => result.jobId === "job_ready",
    );
    expect(jobResult?.blockerReason).not.toBe("resume_missing");
    expect(snapshot.applicationRecords[0]?.latestBlocker?.code).not.toBe(
      "missing_resume",
    );

    const executionInput = executeApplicationFlow.mock.calls[0]?.[1];
    expect(executionInput?.resumeArtifact).toMatchObject({
      jobId: "job_ready",
      source: "original_upload",
      sourceDocumentId: "resume_1",
      exportArtifactId: null,
      fileName: "alex-vanguard.pdf",
      filePath: RECOVERED_ORIGINAL_RESUME_PATH,
    });
  });

  test("keeps the recorded path when the verifier cannot resolve one", async () => {
    const seed = createSeed();
    stageApprovedTailoredExport(seed, RECOVERED_EXPORT_PATH, EXPORT_SHA256);
    const { browserRuntime, executeApplicationFlow } =
      createDiskAwareBrowserRuntime(new Set([RECOVERED_EXPORT_PATH]));
    const workspaceService = createService({
      seed,
      // A verifier without resolvePath, exactly like every existing caller.
      exportFileVerifier: { exists: () => Promise.resolve(true) },
      browserRuntime,
    });

    await workspaceService.startApplyCopilotRun("job_ready");

    expect(
      executeApplicationFlow.mock.calls[0]?.[1]?.resumeArtifact.filePath,
    ).toBe(RECOVERED_EXPORT_PATH);
  });

  test("still fails closed when the recovered tailored export no longer matches its saved digest", async () => {
    const seed = createSeed();
    stageApprovedTailoredExport(seed, STALE_EXPORT_PATH, EXPORT_SHA256);
    const disk = new Map([[RECOVERED_EXPORT_PATH, "c".repeat(64)]]);
    const { browserRuntime, executeApplicationFlow } =
      createDiskAwareBrowserRuntime(new Set(disk.keys()));
    const workspaceService = createService({
      seed,
      exportFileVerifier: createRecoveringExportFileVerifier(disk),
      browserRuntime,
    });

    await expect(
      workspaceService.startApplyCopilotRun("job_ready"),
    ).rejects.toThrow(/changed after it was saved/);
    expect(executeApplicationFlow).not.toHaveBeenCalled();
  });

  test("still blocks when no candidate for the recorded export exists on disk", async () => {
    const seed = createSeed();
    stageApprovedTailoredExport(seed, STALE_EXPORT_PATH, EXPORT_SHA256);
    const { browserRuntime, executeApplicationFlow } =
      createDiskAwareBrowserRuntime(new Set<string>());
    const workspaceService = createService({
      seed,
      exportFileVerifier: createRecoveringExportFileVerifier(new Map()),
      browserRuntime,
    });

    const snapshot = await workspaceService.startApplyCopilotRun("job_ready");

    expect(executeApplicationFlow).not.toHaveBeenCalled();
    expect(
      snapshot.applyJobResults.find((result) => result.jobId === "job_ready"),
    ).toMatchObject({ state: "blocked", blockerReason: "resume_missing" });
  });
});
