import type {
  BrowserSessionState,
  ReviewQueueItem,
  TailoredAsset,
} from "@unemployed/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  getApplyReadinessStatus,
  getReviewQueueWorkflowStatus,
  getTailoredDraftPreparationCandidates,
  getTailoredDraftPreparationResultMessage,
  hasResumeGenerationFailure,
  isTailoredDraftPreparationEligible,
  prepareTailoredDraftsSequentially,
  type TailoredDraftPreparationViewState,
} from "./review-queue-status";

function createItem(
  jobId: string,
  overrides: Partial<ReviewQueueItem> = {},
): ReviewQueueItem {
  return {
    jobId,
    title: `Role ${jobId}`,
    company: "Acme",
    location: "Remote",
    matchScore: 80,
    applicationStatus: "shortlisted",
    assetStatus: "not_started",
    progressPercent: null,
    resumeAssetId: null,
    resumeApplicationMode: "tailored_per_job",
    resumeReview: { status: "not_started" },
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("tailored draft preparation", () => {
  it("only includes tailored jobs with no existing review, including failed attempts", () => {
    expect(isTailoredDraftPreparationEligible(createItem("not-started"))).toBe(
      true,
    );
    expect(
      isTailoredDraftPreparationEligible(
        createItem("failed", { assetStatus: "failed" }),
      ),
    ).toBe(true);

    for (const item of [
      createItem("original", { resumeApplicationMode: "original_resume" }),
      createItem("queued", { assetStatus: "queued" }),
      createItem("generating", { assetStatus: "generating" }),
      createItem("ready", { assetStatus: "ready" }),
      createItem("draft", { resumeReview: { status: "draft" } }),
      createItem("needs-review", { resumeReview: { status: "needs_review" } }),
      createItem("stale", {
        resumeReview: { status: "stale", staleReason: null },
      }),
      createItem("approved", {
        assetStatus: "ready",
        resumeReview: {
          status: "approved",
          approvedAt: "2026-08-20T00:00:00.000Z",
          approvedExportId: "export-approved",
          approvedFormat: "pdf",
          approvedFilePath: "C:/resume.pdf",
        },
      }),
    ]) {
      expect(isTailoredDraftPreparationEligible(item)).toBe(false);
    }
  });

  it("deduplicates in stable order and never returns more than ten jobs", () => {
    const queue = [
      ...Array.from({ length: 12 }, (_, index) => createItem(`job-${index}`)),
      createItem("job-0"),
    ];

    expect(
      getTailoredDraftPreparationCandidates(queue).map((item) => item.jobId),
    ).toEqual(Array.from({ length: 10 }, (_, index) => `job-${index}`));
    expect(getTailoredDraftPreparationCandidates(queue, 50)).toHaveLength(10);
  });

  it("awaits each generation before scheduling the next job", async () => {
    const firstStarted = vi.fn();
    let resolveFirst: ((value: boolean) => void) | undefined;
    const onGenerateResume = vi.fn<(jobId: string) => Promise<boolean>>(
      (jobId) => {
        if (jobId === "job-1") {
          firstStarted();
          return new Promise<boolean>((resolve) => {
            resolveFirst = resolve;
          });
        }

        return Promise.resolve(true);
      },
    );
    const runPromise = prepareTailoredDraftsSequentially(
      [createItem("job-1"), createItem("job-2")],
      onGenerateResume,
    );

    await vi.waitFor(() => expect(firstStarted).toHaveBeenCalledOnce());
    expect(onGenerateResume).toHaveBeenCalledTimes(1);
    resolveFirst?.(true);

    await expect(runPromise).resolves.toMatchObject({
      attemptedCount: 2,
      completedCount: 2,
      failedCount: 0,
      failedJobIds: [],
      stopped: false,
      totalCount: 2,
    });
    expect(onGenerateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job-1",
      "job-2",
    ]);
  });

  it("stops scheduling after the current draft finishes", async () => {
    let stopRequested = false;
    const onGenerateResume = vi.fn((jobId: string) => {
      if (jobId === "job-1") {
        stopRequested = true;
      }
      return Promise.resolve(true);
    });

    await expect(
      prepareTailoredDraftsSequentially(
        [createItem("job-1"), createItem("job-2")],
        onGenerateResume,
        { shouldStop: () => stopRequested },
      ),
    ).resolves.toMatchObject({
      attemptedCount: 1,
      completedCount: 1,
      failedCount: 0,
      failedJobIds: [],
      stopped: true,
      totalCount: 2,
    });
    expect(onGenerateResume).toHaveBeenCalledTimes(1);
  });

  it("records a middle failure and continues with later eligible jobs", async () => {
    const onGenerateResume = vi.fn((jobId: string) =>
      Promise.resolve(jobId !== "job-2"),
    );
    const result = await prepareTailoredDraftsSequentially(
      [createItem("job-1"), createItem("job-2"), createItem("job-3")],
      onGenerateResume,
    );

    expect(result).toEqual({
      attemptedCount: 3,
      completedCount: 2,
      failedCount: 1,
      failedJobIds: ["job-2"],
      stopped: false,
      totalCount: 3,
    });
    expect(onGenerateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job-1",
      "job-2",
      "job-3",
    ]);
  });

  it("reports an all-failed run and records false returns and throws", async () => {
    const onGenerateResume = vi.fn((jobId: string) => {
      if (jobId === "job-2") {
        throw new Error("generation failed");
      }

      return Promise.resolve(false);
    });

    await expect(
      prepareTailoredDraftsSequentially(
        [createItem("job-1"), createItem("job-2"), createItem("job-3")],
        onGenerateResume,
      ),
    ).resolves.toEqual({
      attemptedCount: 3,
      completedCount: 0,
      failedCount: 3,
      failedJobIds: ["job-1", "job-2", "job-3"],
      stopped: false,
      totalCount: 3,
    });
    expect(onGenerateResume).toHaveBeenCalledTimes(3);
  });

  it("does not mark a fully attempted run stopped when the stop flag rises during the last candidate", async () => {
    let stopRequested = false;
    const onGenerateResume = vi.fn((jobId: string) => {
      if (jobId === "job-2") {
        stopRequested = true;
      }
      return Promise.resolve(true);
    });

    await expect(
      prepareTailoredDraftsSequentially(
        [createItem("job-1"), createItem("job-2")],
        onGenerateResume,
        { shouldStop: () => stopRequested },
      ),
    ).resolves.toEqual({
      attemptedCount: 2,
      completedCount: 2,
      failedCount: 0,
      failedJobIds: [],
      stopped: false,
      totalCount: 2,
    });
  });

  it("treats an empty candidate list as a finished, unstopped run", async () => {
    await expect(
      prepareTailoredDraftsSequentially([], vi.fn(), {
        shouldStop: () => true,
      }),
    ).resolves.toEqual({
      attemptedCount: 0,
      completedCount: 0,
      failedCount: 0,
      failedJobIds: [],
      stopped: false,
      totalCount: 0,
    });
  });
});

describe("restored resume states stay distinct from generation failures", () => {
  const restoredItem = createItem("restored", {
    assetStatus: "failed",
    resumeAssetId: "resume_restored",
    resumeReview: { status: "needs_review" },
  });
  const restoredAsset: TailoredAsset = {
    id: "resume_restored",
    jobId: "restored",
    kind: "resume",
    status: "failed",
    label: "Tailored Resume",
    version: "v1",
    templateName: "Chronology Classic",
    compatibilityScore: 80,
    progressPercent: 100,
    updatedAt: "2026-08-20T00:00:00.000Z",
    storagePath: null,
    contentText: "Restored tailored content",
    previewSections: [],
    generationMethod: "deterministic",
    notes: [],
    failureMessage: null,
    failedAt: null,
  };

  it("treats a failed marker without failure detail as review-pending, never a generation failure", () => {
    expect(hasResumeGenerationFailure(restoredItem, restoredAsset)).toBe(
      false,
    );
    expect(hasResumeGenerationFailure(restoredItem)).toBe(true);
  });

  it("keeps a real generation failure with sanitized detail reporting retry", () => {
    expect(
      hasResumeGenerationFailure(restoredItem, {
        ...restoredAsset,
        failureMessage: "Provider request timed out.",
        failedAt: "2026-08-21T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("routes restored assets to approval recovery copy instead of resume-issue copy", () => {
    // Without asset evidence the workflow status stays conservatively on
    // failure copy; surfaces holding the tailored asset resolve the restored
    // state precisely.
    expect(getReviewQueueWorkflowStatus(restoredItem)).toEqual({
      label: "Resume issue",
      tone: "critical",
    });
    expect(getReviewQueueWorkflowStatus(restoredItem, restoredAsset)).toEqual({
      label: "Needs approval",
      tone: "active",
    });
    expect(
      getReviewQueueWorkflowStatus(restoredItem, {
        ...restoredAsset,
        failureMessage: "Provider request timed out.",
        failedAt: "2026-08-21T00:00:00.000Z",
      }),
    ).toEqual({
      label: "Resume issue",
      tone: "critical",
    });
  });

  it("keeps readiness labels distinct once the failure boolean is resolved by the caller", () => {
    const readinessInput = {
      applySupportState: "supported" as const,
      browserSession: { status: "ready" } as BrowserSessionState,
      hasReadyApprovedAsset: false,
      isGenerating: false,
      needsGeneration: false,
      resumeReviewStatus: "needs_review" as const,
      selectedItem: restoredItem,
    };
    expect(
      getApplyReadinessStatus({
        ...readinessInput,
        hasGenerationFailure: false,
      }).label,
    ).toBe("Needs approval");
    expect(
      getApplyReadinessStatus({
        ...readinessInput,
        hasGenerationFailure: true,
      }).label,
    ).toBe("Resume issue");
  });
});

describe("safe application presentation labels", () => {
  const BANNED_OPERATION_COPY = /apply copilot|restage|submit approval/i;

  function createReadyApprovedItem(): ReviewQueueItem {
    return createItem("ready-approved", {
      assetStatus: "ready",
      resumeAssetId: "resume_approved",
      resumeReview: {
        status: "approved",
        approvedAt: "2026-08-20T00:00:00.000Z",
        approvedExportId: "export-approved",
        approvedFormat: "pdf",
        approvedFilePath: "/tmp/approved.pdf",
      },
    });
  }

  it("presents a fully prepared job as Ready to prepare, never Ready to apply", () => {
    const status = getReviewQueueWorkflowStatus(createReadyApprovedItem());

    expect(status).toEqual({ label: "Ready to prepare", tone: "positive" });
    expect(status.label).not.toMatch(/ready to apply/i);
  });

  it("presents an unchanged original resume job without submission claims", () => {
    const status = getReviewQueueWorkflowStatus(
      createItem("original", {
        resumeApplicationMode: "original_resume",
        assetStatus: "ready",
        resumeAssetId: "resume_original",
        resumeReview: {
          status: "original_resume",
          sourceDocumentId: "resume_original",
          fileName: "Ebrar.pdf",
          filePath: "/tmp/Ebrar.pdf",
        },
      }),
    );

    expect(status.label).toBe("Original resume ready");
    expect(status.label).not.toMatch(BANNED_OPERATION_COPY);
    expect(status.label).not.toMatch(/ready to (apply|submit)/i);
  });

  it("keeps every readiness badge free of legacy operation names and submission claims", () => {
    const items = [
      null,
      createItem("needs-resume"),
      createItem("generating", { assetStatus: "generating" }),
      createReadyApprovedItem(),
      createItem("failed", { assetStatus: "failed" }),
      createItem("stale", {
        assetStatus: "ready",
        resumeAssetId: "resume_stale",
        resumeReview: { status: "stale", staleReason: null },
      }),
    ] as const;

    for (const item of items) {
      const workflow = getReviewQueueWorkflowStatus(item);
      expect(workflow.label).not.toMatch(BANNED_OPERATION_COPY);
      expect(workflow.label).not.toMatch(/submitted|sends? your application/i);
    }
  });

  it("reports the all-clear mission state as Ready to prepare", () => {
    const status = getApplyReadinessStatus({
      applySupportState: "supported",
      browserSession: { status: "ready" } as BrowserSessionState,
      hasGenerationFailure: false,
      hasReadyApprovedAsset: true,
      isGenerating: false,
      needsGeneration: false,
      resumeReviewStatus: "approved",
      selectedItem: createReadyApprovedItem(),
    });

    expect(status).toEqual({ label: "Ready to prepare", tone: "positive" });
  });
});

describe("getTailoredDraftPreparationResultMessage", () => {
  function createState(
    overrides: Partial<TailoredDraftPreparationViewState> = {},
  ): TailoredDraftPreparationViewState {
    return {
      attemptedCount: 0,
      completedCount: 0,
      currentIndex: null,
      eligibleRemainingCount: 0,
      failedCount: 0,
      status: "idle",
      totalCount: 0,
      ...overrides,
    };
  }

  it("returns no message while idle or running", () => {
    expect(getTailoredDraftPreparationResultMessage(createState())).toBeNull();
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({ status: "running" }),
      ),
    ).toBeNull();
  });

  it("uses singular copy for one prepared draft with nothing remaining", () => {
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 1,
          completedCount: 1,
          status: "completed",
          totalCount: 1,
        }),
      ),
    ).toBe(
      "Prepared 1 tailored draft. Each draft still needs your review and approval. Nothing was approved, queued, submitted, or sent.",
    );
  });

  it("singularizes the remainder sentence for exactly one eligible job left over", () => {
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 10,
          completedCount: 10,
          eligibleRemainingCount: 1,
          status: "completed",
          totalCount: 10,
        }),
      ),
    ).toBe(
      "Prepared 10 tailored drafts. 1 eligible job remains for another run. Each draft still needs your review and approval. Nothing was approved, queued, submitted, or sent.",
    );
  });

  it("pluralizes the remainder sentence for twenty eligible jobs left over", () => {
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 10,
          completedCount: 10,
          eligibleRemainingCount: 20,
          status: "completed",
          totalCount: 10,
        }),
      ),
    ).toBe(
      "Prepared 10 tailored drafts. 20 eligible jobs remain for another run. Each draft still needs your review and approval. Nothing was approved, queued, submitted, or sent.",
    );
  });

  it("never says stopped when every candidate was attempted and some failed", () => {
    const message = getTailoredDraftPreparationResultMessage(
      createState({
        attemptedCount: 10,
        completedCount: 7,
        eligibleRemainingCount: 4,
        failedCount: 3,
        status: "failed",
        totalCount: 10,
      }),
    );

    expect(message).toBe(
      "Prepared 7 tailored drafts; 3 failed. 4 eligible jobs remain for another run. Fix the failed jobs and rerun to target only remaining eligible jobs. Nothing was approved, queued, submitted, or sent.",
    );
    expect(message).not.toMatch(/stopped/i);
  });

  it("reports exact singular counts for a fully attempted single-job failure", () => {
    const message = getTailoredDraftPreparationResultMessage(
      createState({
        attemptedCount: 1,
        completedCount: 0,
        eligibleRemainingCount: 1,
        failedCount: 1,
        status: "failed",
        totalCount: 1,
      }),
    );

    expect(message).toBe(
      "Prepared 0 tailored drafts; 1 failed. 1 eligible job remains for another run. Fix the failed job and rerun to target only remaining eligible jobs. Nothing was approved, queued, submitted, or sent.",
    );
  });

  it("keeps a genuinely user-stopped run with failures distinct and truthful", () => {
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 3,
          completedCount: 2,
          currentIndex: null,
          eligibleRemainingCount: 8,
          failedCount: 1,
          status: "failed",
          totalCount: 10,
        }),
      ),
    ).toBe(
      "Stopped after 2 completed drafts; 1 failed. 8 eligible jobs remain for another run. Fix the failed job and rerun to target only remaining eligible jobs. Nothing was approved, queued, submitted, or sent.",
    );
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 2,
          completedCount: 1,
          eligibleRemainingCount: 9,
          failedCount: 1,
          status: "failed",
          totalCount: 10,
        }),
      ),
    ).toMatch(/^Stopped after 1 completed draft; 1 failed\./);
  });

  it("keeps a user-stopped run without failures on its own truthful copy", () => {
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 1,
          completedCount: 1,
          status: "stopped",
          totalCount: 2,
        }),
      ),
    ).toBe(
      "Stopped after 1 completed draft. Nothing was approved, queued, submitted, or sent.",
    );
    expect(
      getTailoredDraftPreparationResultMessage(
        createState({
          attemptedCount: 3,
          completedCount: 3,
          status: "stopped",
          totalCount: 5,
        }),
      ),
    ).toBe(
      "Stopped after 3 completed drafts. Nothing was approved, queued, submitted, or sent.",
    );
  });
});
