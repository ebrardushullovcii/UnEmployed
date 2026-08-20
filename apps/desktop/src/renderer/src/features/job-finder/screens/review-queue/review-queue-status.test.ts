import type { ReviewQueueItem } from "@unemployed/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  getTailoredDraftPreparationCandidates,
  isTailoredDraftPreparationEligible,
  prepareTailoredDraftsSequentially,
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
      stopped: true,
      totalCount: 2,
    });
    expect(onGenerateResume).toHaveBeenCalledTimes(1);
  });

  it("fails fast and preserves completed drafts when one generation fails", async () => {
    const onGenerateResume = vi.fn((jobId: string) =>
      Promise.resolve(jobId !== "job-2"),
    );
    const result = await prepareTailoredDraftsSequentially(
      [createItem("job-1"), createItem("job-2"), createItem("job-3")],
      onGenerateResume,
    );

    expect(result).toEqual({
      attemptedCount: 2,
      completedCount: 1,
      failedCount: 1,
      failedJobId: "job-2",
      stopped: false,
      totalCount: 3,
    });
    expect(onGenerateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job-1",
      "job-2",
    ]);
  });
});
