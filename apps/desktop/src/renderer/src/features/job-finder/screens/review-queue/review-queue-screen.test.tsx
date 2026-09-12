// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  resumeOperationStarts?: Readonly<Record<string, number>>;
  browserSession?: BrowserSessionState;
  isJobPending?: (jobId: string) => boolean;
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
        resumeOperationStarts={props.resumeOperationStarts}
        applicationRecords={[]}
        actionState={{ message: null }}
        browserSession={props.browserSession ?? createBrowserSession()}
        campaignId={props.campaignId ?? "campaign_1"}
        draftPreparation={
          props.draftPreparation ?? createIdleDraftPreparation()
        }
        globalDailyApplicationPreparationCapacity={null}
        isApplyPending={false}
        isJobPending={props.isJobPending ?? (() => false)}
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
  it("shows a moving elapsed clock and a stated expectation instead of a fabricated percentage", () => {
    vi.useFakeTimers();

    try {
      const selectedItem: ReviewQueueItem = {
        ...createEligibleItem("job_generating"),
        assetStatus: "generating",
      };

      const operationStartedAt = Date.now();
      const props = {
        resumeOperationStarts: { job_generating: operationStartedAt },
        isJobPending: (jobId: string) => jobId === "job_generating",
        queue: [selectedItem],
        selectedItem,
        selectedJob: {
          id: selectedItem.jobId,
          title: "Senior Frontend Engineer",
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
        } as unknown as SavedJob,
      };
      const view = renderScreen(props);

      const elapsed = document.querySelector("[data-resume-draft-elapsed]");
      expect(elapsed).not.toBeNull();
      expect(elapsed?.textContent).toBe("0:00");

      // The old bar climbed a made-up percentage to a 94% ceiling and froze
      // there; nothing in the pipeline can substantiate a completion fraction.
      expect(document.body.textContent).not.toContain("% estimated");
      for (const bar of document.querySelectorAll('[role="progressbar"]')) {
        expect(bar.getAttribute("aria-valuenow")).toBeNull();
      }

      expect(
        document.querySelector("[data-resume-draft-expected-wait]")
          ?.textContent,
      ).toBe("Usually 40-70 seconds for a tailored draft.");

      act(() => {
        vi.advanceTimersByTime(3_000);
      });

      expect(
        document.querySelector("[data-resume-draft-elapsed]")?.textContent,
      ).toBe("0:03");
      view.unmount();
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      renderScreen(props);
      expect(
        document.querySelector("[data-resume-draft-elapsed]")?.textContent,
      ).toBe("0:15");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses canonical workflow status for a ready asset that still needs approval", () => {
    const selectedItem: ReviewQueueItem = {
      ...createEligibleItem("job_needs_approval"),
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "asset_needs_approval",
      resumeReview: { status: "draft" },
    };

    renderScreen({ queue: [selectedItem], selectedItem });

    // The detail header owns the selected job's state; the selected list row
    // no longer prints the same chip beside it, so exactly one appears.
    // Once on the selected row (rows keep their badge when selected) and once
    // in the detail header.
    expect(screen.getAllByText("Needs approval").length).toBe(2);
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

    expect(screen.getByText(/Writing resume 2 of 3/)).toBeTruthy();

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

describe("ReviewQueueScreen single-column workspace", () => {
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

  it("has no tab strip: the shortlisted job is one linear column", () => {
    const selectedItem = createEligibleItem("job_column");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    // Readiness / Resume / Job details split one strictly ordered job across
    // three destinations, two of which were nearly empty.
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();

    const column = screen.getByTestId("review-queue-workspace-column");
    // State and next action first, the job facts under them, one job title in
    // the detail header.
    expect(column.textContent).toContain("Open full job details");
    expect(column.textContent).toContain("About this job");
    expect(
      screen.getAllByRole("heading", { name: `Role ${selectedItem.jobId}` }),
    ).toHaveLength(1);
  });

  it("holds the scoring breakdown behind one disclosure", () => {
    const selectedItem = createEligibleItem("job_scored");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    const disclosure = screen
      .getByText("How this was scored")
      .closest("details");
    expect(disclosure).toBeInstanceOf(HTMLDetailsElement);
    expect((disclosure as HTMLDetailsElement).open).toBe(false);
  });

  it("shows no resume section until a resume exists", () => {
    const selectedItem = createEligibleItem("job_no_resume");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    // The Resume tab was a ~600px empty box duplicating the primary above it.
    expect(
      screen.queryByRole("heading", { level: 2, name: "Resume" }),
    ).toBeNull();
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

  it("owns exactly one scroller per column", () => {
    const selectedItem = createEligibleItem("job_region");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: createSelectedJob(selectedItem.jobId),
    });

    // The shortlist column and the workspace column: the stacked panels
    // inside the workspace never add a second nested scroll owner.
    const regions = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-locked-pane-scroll-region]",
      ),
    );
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.className).toContain("overflow-y-auto");
      expect(
        region.querySelectorAll("[data-locked-pane-scroll-region]"),
      ).toHaveLength(0);
    }
    expect(
      screen
        .getByTestId("review-queue-workspace-column")
        .getAttribute("data-locked-pane-scroll-region"),
    ).not.toBeNull();
  });

  it("keeps the resume preview inside the one workspace scroller", () => {
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

    const column = screen.getByTestId("review-queue-workspace-column");
    expect(
      within(column).getAllByText("Tailored resume v1").length,
    ).toBeGreaterThan(0);
    expect(
      column.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(0);
  });

  it("leaves empty shortlist states unmarked", () => {
    renderScreen({ queue: [] });

    // No selected job: only the workspace column is a scroll owner.
    expect(
      document.querySelectorAll("[data-locked-pane-scroll-region]"),
    ).toHaveLength(1);
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

    renderScreen({
      queue: [createReadyItem("job_a"), createReadyItem("job_b")],
    });

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
      queue: [createReadyItem("job_shared"), createReadyItem("job_other")],
    });

    // Another campaign's curation never leaks into this one.
    expect(screen.queryByText(/selected for batch preparation/)).toBeNull();

    cleanup();
    renderScreen({
      campaignId: "campaign_2",
      queue: [createReadyItem("job_shared"), createReadyItem("job_other")],
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

    expect(screen.queryByText(/selected for batch preparation/)).toBeNull();
  });

  it("removes staged jobs from the curation when queuing selected applications", async () => {
    const onStartAutoApplyQueue = vi
      .fn<
        NonNullable<Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]>
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
      screen.getByRole("button", { name: "Prepare selected jobs (2)" }),
    );

    expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith([
      "job_stage",
      "job_keep",
    ]);
    // Staging consumes its curation; nothing implies the run resumes here.
    await vi.waitFor(() =>
      expect(screen.getByText("0 selected for batch preparation")).toBeTruthy(),
    );
    expect(readStoredSelection("campaign_1")).toEqual([]);
  });

  it("preserves the staged curation when the daily capacity refuses the queue start", async () => {
    const onStartAutoApplyQueue = vi
      .fn<
        NonNullable<Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]>
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
      screen.getByRole("button", { name: "Prepare selected jobs (2)" }),
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
    const onStartAutoApplyQueue = vi
      .fn<
        NonNullable<Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]>
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
      screen.getByRole("button", { name: "Prepare selected jobs (1)" }),
    );

    await vi.waitFor(() =>
      expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    expect(readStoredSelection("campaign_1")).toEqual(["job_stage"]);
  });

  it("preserves the staged curation on an unknown ending instead of guessing", async () => {
    const onStartAutoApplyQueue = vi
      .fn<
        NonNullable<Parameters<typeof renderScreen>[0]["onStartAutoApplyQueue"]>
      >()
      .mockResolvedValue({ status: "unknown" });
    seedStoredSelection("campaign_1", ["job_stage"]);
    const selectedItem = createReadyItem("job_stage");

    renderScreen({
      onStartAutoApplyQueue,
      queue: [createReadyItem("job_stage"), createReadyItem("job_stage_two")],
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
      screen.getByRole("button", { name: "Prepare selected jobs (1)" }),
    );

    await vi.waitFor(() =>
      expect(onStartAutoApplyQueue).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
  });
});

describe("ReviewQueueScreen job details honesty", () => {
  function buildJob(input: {
    jobId: string;
    summary: string;
    title: string;
  }): SavedJob {
    return {
      id: input.jobId,
      title: input.title,
      company: "Acme",
      location: "Remote",
      summary: input.summary,
      description: input.summary,
      discoveryMethod: "browser_agent",
      matchAssessment: {
        score: 64,
        reasons: ["Role title aligns with the current target roles."],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: null,
        requirements: [],
        contextFingerprint: "context_v1",
        postingFingerprint: "posting_v1",
      },
    } as unknown as SavedJob;
  }

  it("presents an unverified score provisionally and drops an echoed summary", () => {
    const selectedItem = createEligibleItem("job_title_only");
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: buildJob({
        jobId: selectedItem.jobId,
        // The only "summary" the listing carried is its own title.
        summary: selectedItem.title,
        title: selectedItem.title,
      }),
    });

    // The withheld rule now names what was actually checked instead of
    // printing a percentage the app has not earned.
    expect(screen.getByTestId("review-queue-fit-score").textContent).toBe(
      "Title match only",
    );
    // Once beside the score, once inside the breakdown that would otherwise
    // read as five contradictions of it.
    expect(
      screen.getAllByText(
        "Fit is based on the title alone. Review the listing details before applying.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "The listing text was not captured. Open the full job details to read it.",
      ),
    ).toBeTruthy();

    // The route to the real posting sits with the job, not below the
    // evidence cards.
    const openListing = screen.getByRole("button", {
      name: "Open full job details",
    });
    const breakdown = screen.getByRole("region", {
      name: /score and evidence/iu,
    });
    expect(
      openListing.compareDocumentPosition(breakdown) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("withholds the score for the shape the real scorer emits for a card-only listing", () => {
    // Regression guard: the bare fixture above passed while the shape the
    // matching engine actually produces — an "adjacent" role verdict plus a
    // saved-preference location requirement that stayed unknown — printed a
    // bare percentage on this screen and on Find jobs.
    const selectedItem = createEligibleItem("job_real_title_only");
    const job = buildJob({
      jobId: selectedItem.jobId,
      summary: selectedItem.title,
      title: selectedItem.title,
    });
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: {
        ...job,
        matchAssessment: {
          ...job.matchAssessment,
          score: 54,
          compensationFit: { state: "unknown" },
          dimensions: {
            roleSuitability: {
              state: "adjacent",
              explanation:
                "The title matches, but the listing text was not captured, so nothing beyond the title could be checked.",
              evidence: [],
            },
            preferenceAlignment: { state: "unknown", evidence: [] },
            applicationEffort: { level: "unknown", evidence: [] },
            evidenceConfidence: { level: "unavailable", evidence: [] },
          },
          requirements: [
            {
              id: "location_not_stated",
              category: "location",
              label: "Location (not stated in listing)",
              importance: "required",
              status: "unknown",
              jobEvidence: "The listing does not state a location.",
              resumeEvidence: [],
              explanation:
                "The listing does not state a location, so it could not be compared with the saved search areas.",
            },
          ],
        },
      } as unknown as SavedJob,
    });

    expect(screen.getByTestId("review-queue-fit-score").textContent).toBe(
      "Title match only",
    );
    expect(screen.queryByText(/54% fit/)).toBeNull();
    // The number is not destroyed: it stays inside the breakdown, qualified.
    expect(screen.getByText("Title-only estimate: 54%")).toBeTruthy();
  });

  it("keeps real listing text and a plain score when evidence was checked", () => {
    const selectedItem = createEligibleItem("job_verified");
    const job = buildJob({
      jobId: selectedItem.jobId,
      summary: "Own the deployment pipeline for the payments platform.",
      title: selectedItem.title,
    });
    renderScreen({
      queue: [selectedItem],
      selectedItem,
      selectedJob: {
        ...job,
        matchAssessment: {
          ...job.matchAssessment,
          requirements: [
            {
              id: "req_1",
              label: "Backend services",
              importance: "required",
              status: "supported",
              explanation: "Matches saved backend experience.",
              jobEvidence: "Own backend services.",
              resumeEvidence: [],
            },
          ],
        },
      } as unknown as SavedJob,
    });

    expect(screen.getByTestId("review-queue-fit-score").textContent).toBe(
      "64% fit",
    );
    expect(
      screen.getByText(
        "Own the deployment pipeline for the payments platform.",
      ),
    ).toBeTruthy();
  });
});
