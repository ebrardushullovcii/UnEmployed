// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  BrowserSessionState,
  ResumeSourceDocument,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { JobFinderAutoApplyQueueStartOutcome } from "@renderer/features/job-finder/lib/job-finder-types";
import { ReviewQueueScreen } from "./review-queue-screen";
import type { TailoredDraftPreparationViewState } from "./review-queue-status";

beforeEach(() => {
  window.localStorage?.clear();

  class ResizeObserverMock {
    observe() {}

    disconnect() {}

    unobserve() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createIdleDraftPreparation(): TailoredDraftPreparationViewState {
  return {
    attemptedCount: 0,
    completedCount: 0,
    currentIndex: null,
    eligibleRemainingCount: 0,
    failedCount: 0,
    status: "idle",
    totalCount: 0,
  };
}

function createEligibleItem(jobId: string): ReviewQueueItem {
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
  };
}

function createBrowserSession(): BrowserSessionState {
  return {
    source: "user",
    status: "unknown",
    driver: "catalog_seed",
    label: "Browser",
    detail: null,
    lastCheckedAt: "2026-08-20T00:00:00.000Z",
  } as unknown as BrowserSessionState;
}

function createOriginalResume(): ResumeSourceDocument {
  return {
    id: "resume_base",
    fileName: "base-resume.pdf",
    uploadedAt: "2026-08-20T00:00:00.000Z",
  } as unknown as ResumeSourceDocument;
}

function renderScreen(props: {
  browserSession?: BrowserSessionState;
  campaignId?: string;
  draftPreparation?: TailoredDraftPreparationViewState;
  onGenerateResume?: (
    jobId: string,
    options?: { selectAfter?: boolean },
  ) => Promise<boolean>;
  onPrepareTailoredDrafts?: () => void;
  onStartAutoApplyQueue?: (
    jobIds: string[],
  ) => Promise<JobFinderAutoApplyQueueStartOutcome>;
  onStopTailoredDraftPreparation?: () => void;
  onSelectItem?: (jobId: string) => void;
  queue: readonly ReviewQueueItem[];
  selectedItem?: ReviewQueueItem | null;
  selectedJob?: SavedJob | null;
  selectedAsset?: TailoredAsset | null;
}) {
  return render(
    <MemoryRouter>
        <ReviewQueueScreen
        applicationRecords={[]}
        actionState={{ message: null }}
        browserSession={props.browserSession ?? createBrowserSession()}
        campaignId={props.campaignId ?? "campaign_1"}
        draftPreparation={props.draftPreparation ?? createIdleDraftPreparation()}
        globalDailyApplicationPreparationCapacity={null}
        isApplyPending={false}
        isJobPending={() => false}
        isResumeStrategyPending={() => false}
        onPrepareTailoredDrafts={props.onPrepareTailoredDrafts ?? vi.fn()}
        onStopTailoredDraftPreparation={
        props.onStopTailoredDraftPreparation ?? vi.fn()
        }
        onStartAutoApplyQueue={
          props.onStartAutoApplyQueue ??
          vi.fn<
            NonNullable<
              Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]
            >
          >(() => Promise.resolve({ status: "confirmed" }))
        }
        onStartApplyCopilot={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={
        props.onGenerateResume ??
        vi.fn<
          (
            jobId: string,
            options?: { selectAfter?: boolean },
          ) => Promise<boolean>
        >(() => Promise.resolve(true))
        }
        onOpenBrowserSession={vi.fn()}
        onOpenJobDetails={vi.fn()}
        onOpenProfile={vi.fn()}
        onRecommendResumeStrategy={vi.fn()}
        onRemoveReviewJob={vi.fn()}
        onSelectResumeStrategy={vi.fn()}
        onSetJobResumeApplicationMode={vi.fn()}
        onSelectItem={props.onSelectItem ?? vi.fn()}
        originalResume={createOriginalResume()}
        queue={props.queue}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={props.selectedAsset ?? null}
        selectedItem={props.selectedItem ?? null}
        selectedJob={props.selectedJob ?? null}
        />
    </MemoryRouter>,
  );
}

function openBatchActions(): void {
  fireEvent.click(screen.getByText("Batch actions"));
}

describe("ReviewQueueScreen tailored draft preparation (controlled)", () => {
  it("uses canonical workflow status for a ready asset that still needs approval", () => {
    const selectedItem: ReviewQueueItem = {
      ...createEligibleItem("job_needs_approval"),
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "asset_needs_approval",
      resumeReview: { status: "draft" },
    };

    renderScreen({ queue: [selectedItem], selectedItem });

    expect(screen.getAllByText("Needs approval").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.queryByText("Ready to prepare")).toBeNull();
  });

  it("delegates batch start to the page controller without owning the run", () => {
    const onPrepareTailoredDrafts = vi.fn();
    const onGenerateResume = vi
      .fn<
        (jobId: string, options?: { selectAfter?: boolean }) => Promise<boolean>
      >()
      .mockResolvedValue(true);

    renderScreen({
      onGenerateResume,
      onPrepareTailoredDrafts,
      queue: [
        createEligibleItem("job_1"),
        createEligibleItem("job_2"),
        createEligibleItem("job_3"),
      ],
    });
    openBatchActions();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    );

    expect(onPrepareTailoredDrafts).toHaveBeenCalledTimes(1);
    expect(onGenerateResume).not.toHaveBeenCalled();
  });

  it("renders running progress from controller state and forwards cooperative stop", () => {
    const onStopTailoredDraftPreparation = vi.fn();

    renderScreen({
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
      queue: [
        createEligibleItem("job_1"),
        createEligibleItem("job_2"),
        createEligibleItem("job_3"),
      ],
    });
    openBatchActions();

    expect(screen.getByText(/Preparing 2 of 3/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Stop after current draft" }),
    );

    expect(onStopTailoredDraftPreparation).toHaveBeenCalledTimes(1);
  });

  it("renders the finished aggregate result from controller state", () => {
    renderScreen({
      draftPreparation: {
        attemptedCount: 3,
        completedCount: 3,
        currentIndex: null,
        eligibleRemainingCount: 0,
        failedCount: 0,
        status: "completed",
        totalCount: 3,
      },
      queue: [
        createEligibleItem("job_1"),
        createEligibleItem("job_2"),
        createEligibleItem("job_3"),
      ],
    });
    openBatchActions();

    expect(screen.getByText(/Prepared 3 tailored drafts/)).toBeTruthy();
  });

  it("keeps the ten-job cap affordance driven by the queue and defers the run", () => {
    const onPrepareTailoredDrafts = vi.fn();
    const queue = Array.from({ length: 12 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    renderScreen({ onPrepareTailoredDrafts, queue });
    openBatchActions();

    expect(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/only the next 10 eligible jobs run now/i),
    ).toBeTruthy();
    expect(screen.getByText(/2 more remain/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    );
    expect(onPrepareTailoredDrafts).toHaveBeenCalledTimes(1);
  });
});

describe("ReviewQueueScreen workspace tabs", () => {
  it("connects one tabbable active tab to the labelled panel", () => {
    renderScreen({ queue: [] });

    const tabs = screen.getAllByRole("tab");
    const readinessTab = screen.getByRole("tab", { name: "Readiness" });
    const panel = screen.getByRole("tabpanel");

    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([readinessTab]);
    expect(tabs.filter((tab) => tab.tabIndex === -1)).toHaveLength(2);
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      panel.id,
      panel.id,
      panel.id,
    ]);
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(tabs.length);
    expect(readinessTab.getAttribute("aria-selected")).toBe("true");
    expect(panel.getAttribute("aria-labelledby")).toBe(readinessTab.id);
  });

  it("keeps click activation and updates the panel label", () => {
    renderScreen({ queue: [] });

    const resumeTab = screen.getByRole("tab", { name: "Resume" });
    fireEvent.click(resumeTab);

    expect(resumeTab.getAttribute("aria-selected")).toBe("true");
    expect(resumeTab.getAttribute("tabindex")).toBe("0");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      resumeTab.id,
    );
  });

  it("automatically selects and focuses tabs with wrapping arrow keys", () => {
    renderScreen({ queue: [] });

    const readinessTab = screen.getByRole("tab", { name: "Readiness" });
    const resumeTab = screen.getByRole("tab", { name: "Resume" });
    const jobDetailsTab = screen.getByRole("tab", { name: "Job details" });

    readinessTab.focus();
    fireEvent.keyDown(readinessTab, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(jobDetailsTab);
    expect(jobDetailsTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(jobDetailsTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(readinessTab);
    expect(readinessTab.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(readinessTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(resumeTab);
    expect(resumeTab.getAttribute("aria-selected")).toBe("true");
  });

  it("moves to the first and last tabs with Home and End", () => {
    renderScreen({ queue: [] });

    const readinessTab = screen.getByRole("tab", { name: "Readiness" });
    const resumeTab = screen.getByRole("tab", { name: "Resume" });
    const jobDetailsTab = screen.getByRole("tab", { name: "Job details" });

    fireEvent.click(resumeTab);
    resumeTab.focus();
    fireEvent.keyDown(resumeTab, { key: "End" });
    expect(document.activeElement).toBe(jobDetailsTab);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      jobDetailsTab.id,
    );

    fireEvent.keyDown(jobDetailsTab, { key: "Home" });
    expect(document.activeElement).toBe(readinessTab);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      readinessTab.id,
    );
  });
});

describe("ReviewQueueScreen locked pane scroll regions", () => {
  function createSelectedJob(jobId: string): SavedJob {
    return {
      id: jobId,
      title: `Role ${jobId}`,
      company: "Acme",
      location: "Remote",
      summary: "Build dependable hiring tooling.",
      description: "Build dependable hiring tooling.",
      matchAssessment: {
        score: 82,
        reasons: ["Relevant experience"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: null,
        requirements: [],
      },
    } as unknown as SavedJob;
  }

  function expectMarkedScrollPane(scope: ParentNode): HTMLElement {
    const region = scope.querySelector<HTMLElement>(
      "[data-locked-pane-scroll-region]",
    );
    expect(region).not.toBeNull();
    expect(region?.className).toContain("overflow-y-auto");
    return region!;
  }

  it("marks the shortlist list scroller and each workspace pane as locked scroll regions", () => {
    const selectedItem = createEligibleItem("job_region");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    // The shortlist column and the default readiness pane are both bounded
    // primary scroll panes.
    expect(
      document.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(2);
    const readinessPanel = screen.getByRole("tabpanel");
    expectMarkedScrollPane(readinessPanel);

    fireEvent.click(screen.getByRole("tab", { name: "Job details" }));

    expect(
      document.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(2);
    const jobDetailsRegion = expectMarkedScrollPane(
      screen.getByRole("tabpanel"),
    );
    expect(jobDetailsRegion.textContent).toContain("Open full job details");

    fireEvent.click(screen.getByRole("tab", { name: "Resume" }));
    // The centered resume-generation state is a non-scrolling wrapper: the
    // shortlist list stays the only marked region on this tab.
    expect(
      screen
        .getByRole("tabpanel")
        .querySelector("[data-locked-pane-scroll-region]"),
    ).toBeNull();
    expect(
      document.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
  });

  it("marks the original resume preview scroller as the Resume tab's single locked region", () => {
    const selectedItem: ReviewQueueItem = {
      ...createEligibleItem("job_original_cv"),
      resumeApplicationMode: "original_resume",
      resumeReview: {
        status: "original_resume",
        sourceDocumentId: "resume_base",
        fileName: "base-resume.pdf",
        filePath: "/tmp/base-resume.pdf",
      },
    };

    renderScreen({ queue: [selectedItem], selectedItem });

    fireEvent.click(screen.getByRole("tab", { name: "Resume" }));

    // Shortlist list + the resume card scroller, and nothing nested inside either.
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-locked-pane-scroll-region]",
      ),
    );
    expect(regions).toHaveLength(2);
    const resumeRegion = screen
      .getByText("Original resume · unchanged")
      .closest<HTMLElement>("[data-locked-pane-scroll-region]");
    expect(resumeRegion).toBeTruthy();
    expect(resumeRegion?.className).toContain(
      "min-h-0 flex-1 overflow-y-auto px-5 pb-5",
    );
    for (const region of regions) {
      expect(
        region.querySelectorAll("[data-locked-pane-scroll-region]"),
      ).toHaveLength(0);
    }
  });

  it("marks the tailored resume preview scroller as the Resume tab's single locked region", () => {
    const selectedItem: ReviewQueueItem = {
      ...createEligibleItem("job_tailored_preview"),
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "asset_tailored_preview",
      resumeReview: { status: "needs_review" },
    };
    const selectedAsset: TailoredAsset = {
      id: "asset_tailored_preview",
      jobId: "job_tailored_preview",
      kind: "resume",
      status: "ready",
      label: "Tailored resume v1",
      version: "v1",
      templateName: "standard",
      compatibilityScore: 92,
      progressPercent: 100,
      updatedAt: "2026-08-20T00:00:00.000Z",
      storagePath: null,
      contentText: null,
      previewSections: [
        { heading: "Summary", lines: ["Dependable product engineer."] },
      ],
      generationMethod: "deterministic",
      notes: [],
      failureMessage: null,
      failedAt: null,
    };

    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedAsset,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    fireEvent.click(screen.getByRole("tab", { name: "Resume" }));

    // Shortlist list + the preview scroller; the raw section text stays inside
    // the one bounded region instead of nesting another marker.
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-locked-pane-scroll-region]",
      ),
    );
    expect(regions).toHaveLength(2);
    const previewRegion = screen
      .getByText("Tailored resume v1")
      .closest<HTMLElement>("[data-locked-pane-scroll-region]");
    expect(previewRegion).toBeTruthy();
    expect(previewRegion?.className).toContain(
      "min-h-0 flex-1 overflow-y-auto px-5 pb-5",
    );
    for (const region of regions) {
      expect(
        region.querySelectorAll("[data-locked-pane-scroll-region]"),
      ).toHaveLength(0);
    }
  });

  it("leaves empty shortlist states unmarked", () => {
    renderScreen({ queue: [] });

    expect(
      document.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
    expectMarkedScrollPane(screen.getByRole("tabpanel"));
  });
});

describe("ReviewQueueScreen batch selection persistence", () => {
  function batchSelectionKey(campaignId: string): string {
    return `unemployed.job-finder.review-queue.batch-selection.v1.${campaignId}`;
  }

  function seedStoredSelection(
    campaignId: string,
    jobIds: readonly string[],
  ): void {
    window.localStorage.setItem(
      batchSelectionKey(campaignId),
      JSON.stringify(jobIds),
    );
  }

  function readStoredSelection(campaignId: string): unknown {
    return JSON.parse(
      window.localStorage.getItem(batchSelectionKey(campaignId)) ?? "null",
    );
  }

  function createReadyItem(jobId: string): ReviewQueueItem {
    return {
      ...createEligibleItem(jobId),
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: `asset_${jobId}`,
      resumeReview: {
        status: "approved",
        approvedAt: "2026-08-20T12:00:00.000Z",
        approvedExportId: `export_${jobId}`,
        approvedFormat: "pdf",
        approvedFilePath: `/tmp/${jobId}.pdf`,
      },
    };
  }

  function getCheckedBatchBoxes(): HTMLElement[] {
    return screen
      .getAllByRole("checkbox", { name: "Select for batch" })
      .filter((box) => box.getAttribute("aria-checked") === "true");
  }

  it("restores the curated ready selection after a remount and reopens batch actions", () => {
    seedStoredSelection("campaign_1", ["job_a", "job_b"]);

    renderScreen({ queue: [createReadyItem("job_a"), createReadyItem("job_b")] });

    // The persisted curation reopens the batch panel without a manual click.
    expect(screen.getByText("2 selected for batch preparation")).toBeTruthy();
    expect(getCheckedBatchBoxes()).toHaveLength(2);
    expect(readStoredSelection("campaign_1")).toEqual(["job_a", "job_b"]);
  });

  it("drops persisted ids whose jobs disappeared or lost batch eligibility", () => {
    seedStoredSelection("campaign_1", ["job_ready", "job_stale", "job_gone"]);

    renderScreen({
      queue: [createReadyItem("job_ready"), createEligibleItem("job_stale")],
    });

    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    expect(getCheckedBatchBoxes()).toHaveLength(1);
    // The pruned curation is mirrored back to storage.
    expect(readStoredSelection("campaign_1")).toEqual(["job_ready"]);
  });

  it("caps a restored selection at the ten-job batch limit", () => {
    const storedIds = Array.from({ length: 12 }, (_, index) => `job_${index}`);
    seedStoredSelection("campaign_1", storedIds);

    renderScreen({ queue: storedIds.map(createReadyItem) });

    expect(screen.getByText("10 selected for batch preparation")).toBeTruthy();
    expect(getCheckedBatchBoxes()).toHaveLength(10);
    expect(readStoredSelection("campaign_1")).toEqual(storedIds.slice(0, 10));
  });

  it("keeps curated selections isolated per active campaign", () => {
    seedStoredSelection("campaign_2", ["job_shared"]);

    renderScreen({
      campaignId: "campaign_1",
      queue: [createReadyItem("job_shared")],
    });

    // Another campaign's curation never leaks into this one.
    expect(
      screen.queryByText(/selected for batch preparation/),
    ).toBeNull();

    cleanup();
    renderScreen({
      campaignId: "campaign_2",
      queue: [createReadyItem("job_shared")],
    });

    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    // Viewing the empty campaign did not clobber campaign_2's curation.
    expect(readStoredSelection("campaign_2")).toEqual(["job_shared"]);
  });

  it("clears the persisted curation when the user explicitly clears it", () => {
    const queue = [createReadyItem("job_a"), createReadyItem("job_b")];

    renderScreen({ queue });
    openBatchActions();
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Select for batch" })[0]!,
    );
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: "Select for batch" })[1]!,
    );
    expect(screen.getByText("2 selected for batch preparation")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(screen.getByText("0 selected for batch preparation")).toBeTruthy();
    expect(readStoredSelection("campaign_1")).toEqual([]);

    cleanup();
    // A remount does not resurrect an explicitly cleared selection.
    renderScreen({ queue });

    expect(
      screen.queryByText(/selected for batch preparation/),
    ).toBeNull();
  });

  it("removes staged jobs from the curation when queuing selected applications", async () => {
    const onStartAutoApplyQueue =
      vi.fn<
        NonNullable<
          Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]
        >
      >()
        .mockResolvedValue({ status: "confirmed" });
    seedStoredSelection("campaign_1", ["job_stage", "job_keep"]);
    const selectedItem = createReadyItem("job_stage");

    renderScreen({
      onStartAutoApplyQueue,
      queue: [createReadyItem("job_stage"), createReadyItem("job_keep")],
      selectedItem,
      selectedJob: {
        id: selectedItem.jobId,
        title: selectedItem.title,
        company: selectedItem.company,
        location: selectedItem.location,
        summary: "Build dependable hiring tooling.",
        description: "Build dependable hiring tooling.",
        matchAssessment: {
          score: 82,
          reasons: ["Relevant experience"],
          gaps: [],
          recommendation: "review_before_applying",
          recommendationRationale: null,
          requirements: [],
        },
      } as unknown as SavedJob,
    });
    // The restored curation keeps batch actions open; the workspace shows the
    // staged run affordance for the selected ready job.
    fireEvent.click(
      screen.getByRole("button", { name: "Queue selected applications (2)" }),
    );

    expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith([
      "job_stage",
      "job_keep",
    ]);
    // Staging consumes its curation; nothing implies the run resumes here.
    await vi.waitFor(() =>
      expect(
        screen.getByText("0 selected for batch preparation"),
      ).toBeTruthy(),
    );
    expect(readStoredSelection("campaign_1")).toEqual([]);
  });

  it("preserves the staged curation when the daily capacity refuses the queue start", async () => {
    const onStartAutoApplyQueue =
      vi.fn<
        NonNullable<
          Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]
        >
      >()
      .mockResolvedValue({
        status: "refused",
        reason: "daily_capacity_exhausted",
        message:
          "Today's application preparation limit is reached: 20 of 20 used today. New preparations reset at local midnight (4:00 AM).",
      });
    seedStoredSelection("campaign_1", ["job_stage", "job_keep"]);
    const selectedItem = createReadyItem("job_stage");

    renderScreen({
      onStartAutoApplyQueue,
      queue: [createReadyItem("job_stage"), createReadyItem("job_keep")],
      selectedItem,
      selectedJob: {
        id: selectedItem.jobId,
        title: selectedItem.title,
        company: selectedItem.company,
        location: selectedItem.location,
        summary: "Build dependable hiring tooling.",
        description: "Build dependable hiring tooling.",
        matchAssessment: {
          score: 82,
          reasons: ["Relevant experience"],
          gaps: [],
          recommendation: "review_before_applying",
          recommendationRationale: null,
          requirements: [],
        },
      } as unknown as SavedJob,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Queue selected applications (2)" }),
    );

    await vi.waitFor(() =>
      expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1),
    );
    // The refusal must not consume curation: exact staged ids stay selected.
    expect(screen.getByText("2 selected for batch preparation")).toBeTruthy();
    expect(readStoredSelection("campaign_1")).toEqual([
      "job_stage",
      "job_keep",
    ]);
  });

  it("preserves the staged curation when staging reports a handled failure", async () => {
    const onStartAutoApplyQueue =
      vi.fn<
        NonNullable<
          Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]
        >
      >()
      .mockResolvedValue({ status: "failed", message: null });
    seedStoredSelection("campaign_1", ["job_stage"]);
    const selectedItem = createReadyItem("job_stage");

    renderScreen({
      onStartAutoApplyQueue,
      queue: [createReadyItem("job_stage"), createReadyItem("job_keep")],
      selectedItem,
      selectedJob: {
        id: selectedItem.jobId,
        title: selectedItem.title,
        company: selectedItem.company,
        location: selectedItem.location,
        summary: "Build dependable hiring tooling.",
        description: "Build dependable hiring tooling.",
        matchAssessment: {
          score: 82,
          reasons: ["Relevant experience"],
          gaps: [],
          recommendation: "review_before_applying",
          recommendationRationale: null,
          requirements: [],
        },
      } as unknown as SavedJob,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Queue selected applications (1)" }),
    );

    await vi.waitFor(() =>
      expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    expect(readStoredSelection("campaign_1")).toEqual(["job_stage"]);
  });

  it("preserves the staged curation on an unknown ending instead of guessing", async () => {
    const onStartAutoApplyQueue =
      vi.fn<
        NonNullable<
          Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]
        >
      >()
      .mockResolvedValue({ status: "unknown" });
    seedStoredSelection("campaign_1", ["job_stage"]);
    const selectedItem = createReadyItem("job_stage");

    renderScreen({
      onStartAutoApplyQueue,
      queue: [createReadyItem("job_stage")],
      selectedItem,
      selectedJob: {
        id: selectedItem.jobId,
        title: selectedItem.title,
        company: selectedItem.company,
        location: selectedItem.location,
        summary: "Build dependable hiring tooling.",
        description: "Build dependable hiring tooling.",
        matchAssessment: {
          score: 82,
          reasons: ["Relevant experience"],
          gaps: [],
          recommendation: "review_before_applying",
          recommendationRationale: null,
          requirements: [],
        },
      } as unknown as SavedJob,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Queue selected applications (1)" }),
    );

    await vi.waitFor(() =>
      expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
  });
});
