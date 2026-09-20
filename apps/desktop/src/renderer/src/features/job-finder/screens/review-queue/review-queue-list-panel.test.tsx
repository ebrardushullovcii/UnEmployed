// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReviewQueueItem, TailoredAsset } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueListPanel } from "./review-queue-list-panel";
import { getReviewQueueWorkflowStatus } from "./review-queue-status";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

function createEligibleItem(jobId: string): ReviewQueueItem {
  return {
    jobId,
    title: `Role ${jobId}`,
    company: "Acme",
    location: "Remote",
    resumeApplicationMode: "tailored_per_job",
    resumeReview: { status: "not_started" },
    assetStatus: "not_started",
    progressPercent: 0,
  } as unknown as ReviewQueueItem;
}

function createReadyItem(jobId: string): ReviewQueueItem {
  return {
    jobId,
    title: `Role ${jobId}`,
    company: "Acme",
    location: "Remote",
    resumeApplicationMode: "tailored_per_job",
    resumeReview: {
      status: "approved",
      approvedAt: "2026-08-20T00:00:00.000Z",
      approvedExportId: `export_${jobId}`,
      approvedFormat: "pdf",
      approvedFilePath: `C:/${jobId}.pdf`,
    },
    assetStatus: "ready",
    progressPercent: 100,
    resumeAssetId: `asset_${jobId}`,
  } as unknown as ReviewQueueItem;
}

function renderPanel(
  overrides: Partial<Parameters<typeof ReviewQueueListPanel>[0]> = {},
) {
  const props = {
    isJobPending: () => false,
    onSelectItem: vi.fn(),
    queue: [] as readonly ReviewQueueItem[],
    selectedItem: null,
    ...overrides,
  };
  const view = render(
    <MemoryRouter>
      <ReviewQueueListPanel {...props} />
    </MemoryRouter>,
  );
  return { ...view, props };
}

describe("ReviewQueueListPanel", () => {
  it("keeps shortlist status words intact beside long job titles", () => {
    renderPanel({
      queue: [
        {
          ...createEligibleItem("job_long_title"),
          title: "Senior Full Stack Developer (Remote)",
        },
      ],
    });

    // The caption below the title says the same words; the badge is the one
    // in the title line's badge slot.
    const status = screen
      .getAllByText("No resume yet")
      .find((element) => element.className.includes("shrink-0"))!;
    // One line, never wrapped mid-label: the badge keeps its width and the
    // title yields instead.
    expect(status.className).toContain("shrink-0");
    expect(status.className).toContain("whitespace-nowrap");
  });

  it("keeps the empty shortlist focused on finding jobs with one recovery action", () => {
    renderPanel({ queue: [] });

    expect(screen.queryByTestId("shortlisted-all-jobs")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const goToFindJobs = screen.getByRole("link", { name: "Go to Find jobs" });
    expect(goToFindJobs.getAttribute("href")).toBe("/job-finder/discovery");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers no list-management chrome or all-jobs row for a single shortlisted job", () => {
    renderPanel({ queue: [createEligibleItem("job_draft")] });

    expect(screen.queryByTestId("shortlisted-all-jobs")).toBeNull();
    expect(screen.queryByPlaceholderText("Search jobs")).toBeNull();
    expect(screen.queryByRole("button", { name: "Comfortable" })).toBeNull();
    expect(screen.queryByText("Batch actions")).toBeNull();
    expect(screen.queryByText("Select for batch")).toBeNull();
  });

  it("offers one press to create every missing resume and one to apply to every ready job", () => {
    const onPrepareTailoredDrafts = vi.fn();
    const onApplyToAllReady = vi.fn();
    renderPanel({
      onApplyToAllReady,
      onPrepareTailoredDrafts,
      queue: [
        createEligibleItem("job_a"),
        createEligibleItem("job_b"),
        createReadyItem("job_c"),
      ],
    });

    const row = screen.getByTestId("shortlisted-all-jobs");
    fireEvent.click(
      within(row).getByRole("button", { name: "Create 2 missing resumes" }),
    );
    expect(onPrepareTailoredDrafts).toHaveBeenCalledTimes(1);

    fireEvent.click(
      within(row).getByRole("button", { name: "Apply to the 1 ready job" }),
    );
    expect(onApplyToAllReady).toHaveBeenCalledWith(1);
    expect(within(row).getByText(/About a minute each/)).toBeTruthy();
    // No checkboxes, no selection copy, no per-batch mode choice.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/selected for/)).toBeNull();
    expect(screen.queryByText("Apply mode for this batch")).toBeNull();
  });

  it("leaves a job already in Applications out of the ready count", () => {
    renderPanel({
      onApplyToAllReady: vi.fn(),
      preparedJobIds: new Set(["job_done"]),
      queue: [createReadyItem("job_done"), createReadyItem("job_ready")],
    });

    expect(
      screen.getByRole("button", { name: "Apply to the 1 ready job" }),
    ).toBeTruthy();
    expect(screen.getByText("In Applications")).toBeTruthy();
  });

  it("caps one create-all run at ten and says how many are left", () => {
    renderPanel({
      onPrepareTailoredDrafts: vi.fn(),
      queue: Array.from({ length: 12 }, (_, index) =>
        createEligibleItem(`job_${index}`),
      ),
    });

    expect(
      screen.getByRole("button", { name: "Create 10 missing resumes" }),
    ).toBeTruthy();
    expect(screen.getByText(/10 at a time; 2 more after that/)).toBeTruthy();
  });

  it("swaps the create-all action for live progress and a stop while resumes are written", () => {
    const onStopTailoredDraftPreparation = vi.fn();
    renderPanel({
      draftPreparation: {
        attemptedCount: 2,
        completedCount: 1,
        currentIndex: 2,
        eligibleRemainingCount: 0,
        failedCount: 0,
        status: "running",
        totalCount: 3,
      },
      onStopTailoredDraftPreparation,
      queue: [createEligibleItem("job_a"), createEligibleItem("job_b")],
    });

    expect(screen.getByRole("status").textContent).toContain(
      "Writing resume 2 of 3",
    );
    expect(
      screen.queryByRole("button", { name: /Create .* missing/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stop after this one" }));
    expect(onStopTailoredDraftPreparation).toHaveBeenCalledTimes(1);
  });

  it("reports the finished run in plain words and never claims anything was sent", () => {
    renderPanel({
      draftPreparation: {
        attemptedCount: 3,
        completedCount: 2,
        currentIndex: null,
        eligibleRemainingCount: 1,
        failedCount: 1,
        status: "failed",
        totalCount: 3,
      },
      queue: [createEligibleItem("job_a"), createReadyItem("job_b")],
    });

    const message = screen.getByRole("status").textContent ?? "";
    expect(message).toContain("Wrote 2 resumes; 1 failed.");
    expect(message).toContain("Nothing was sent.");
    expect(message).not.toMatch(/approved|queued|submitted/i);
  });

  it("replaces Apply to all with Open Safeguards while a safeguard holds, without internal codes", () => {
    const onOpenSafeguards = vi.fn();
    renderPanel({
      onApplyToAllReady: vi.fn(),
      onOpenSafeguards,
      queue: [createReadyItem("job_a"), createReadyItem("job_b")],
      safeguardBlocker:
        "Automatic runs are paused (abnormal_failure_pause: automatic_discovery_failures:campaign_default).",
    });

    expect(screen.queryByRole("button", { name: /Apply to all/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Safeguards" }));
    expect(onOpenSafeguards).toHaveBeenCalledOnce();
    expect(screen.getByTestId("apply-all-blocker").textContent).toBe(
      "Automatic runs are paused.",
    );
  });

  it("shows state-aware resume captions instead of always promising a future draft", () => {
    renderPanel({
      queue: [createEligibleItem("job_not_started"), createReadyItem("job_ok")],
    });

    expect(screen.getAllByText("No resume yet").length).toBeGreaterThan(0);
    expect(screen.getByText("Resume approved")).toBeTruthy();
    expect(screen.queryByText("Job-specific tailored resume")).toBeNull();
  });

  it("reads legacy restored rows and real failures identically in row badges and status detail", () => {
    const restoredItem: ReviewQueueItem = {
      jobId: "job_restored",
      title: "Role job_restored",
      company: "Acme",
      location: "Remote",
      matchScore: 80,
      applicationStatus: "shortlisted",
      assetStatus: "failed",
      progressPercent: null,
      resumeAssetId: "asset_restored",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: { status: "needs_review" },
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    const failedItem: ReviewQueueItem = {
      ...restoredItem,
      jobId: "job_failed",
      title: "Role job_failed",
      resumeAssetId: "asset_failed",
      resumeReview: { status: "not_started" },
    };
    const restoredAsset: TailoredAsset = {
      id: "asset_restored",
      jobId: "job_restored",
      kind: "resume",
      status: "failed",
      label: "Tailored Resume",
      version: "v2",
      templateName: "Chronology Classic",
      compatibilityScore: 80,
      progressPercent: 100,
      updatedAt: "2026-08-20T00:00:00.000Z",
      storagePath: null,
      contentText: "Restored tailored content",
      previewSections: [],
      generationMethod: "deterministic",
      notes: [],
      // Legacy restore rows carry no failure detail: nothing failed.
      failureMessage: null,
      failedAt: null,
    };
    const failedAsset: TailoredAsset = {
      ...restoredAsset,
      id: "asset_failed",
      jobId: "job_failed",
      contentText: null,
      failureMessage: "Provider request timed out.",
      failedAt: "2026-08-21T00:00:00.000Z",
    };

    renderPanel({
      queue: [restoredItem, failedItem],
      tailoredAssets: [restoredAsset, failedAsset],
    });

    // Each card wraps its row button (data-collection-item-id); the status
    // badge is a sibling inside the same card.
    const restoredRow = screen
      .getByText("Role job_restored")
      .closest("[data-collection-item-id]")!.parentElement!;
    const failedRow = screen
      .getByText("Role job_failed")
      .closest("[data-collection-item-id]")!.parentElement!;

    expect(within(restoredRow).getByText("Review resume")).toBeTruthy();
    expect(within(restoredRow).queryByText("Resume failed")).toBeNull();
    expect(within(failedRow).getByText("Resume failed")).toBeTruthy();
    expect(within(failedRow).queryByText("Review resume")).toBeNull();

    // The selected-detail status helper agrees with each rendered row badge.
    expect(
      getReviewQueueWorkflowStatus(restoredItem, restoredAsset),
    ).toMatchObject({ label: "Review resume" });
    expect(getReviewQueueWorkflowStatus(failedItem, failedAsset)).toMatchObject(
      { label: "Resume failed" },
    );
  });

  it("keeps identical row box metrics and reserved lines when the selection moves", () => {
    const first = createReadyItem("job_first");
    const second = createReadyItem("job_second");
    const readBoxes = (container: HTMLElement) =>
      Array.from(
        container.querySelectorAll<HTMLElement>('[data-slot="selectable-row"]'),
      ).map((row) => ({
        className: row.className,
        lineCount: row.querySelectorAll('[data-slot="selectable-row-line"]')
          .length,
      }));

    const unselected = renderPanel({ queue: [first, second] });
    const unselectedBoxes = readBoxes(unselected.container);
    unselected.unmount();

    const selected = renderPanel({ queue: [first, second], selectedItem: first });
    const selectedBoxes = readBoxes(selected.container);

    // Selection may only change the tint and the inset accent bar, never the
    // row's own classes or how many content lines it reserves.
    expect(selectedBoxes.length).toBe(unselectedBoxes.length);
    selectedBoxes.forEach((box, index) => {
      expect(box.className).toBe(unselectedBoxes[index]!.className);
      expect(box.lineCount).toBe(unselectedBoxes[index]!.lineCount);
    });
    expect(
      selected.container
        .querySelector('[data-slot="selectable-row"]')
        ?.getAttribute("data-selected"),
    ).toBe("true");
  });
});
