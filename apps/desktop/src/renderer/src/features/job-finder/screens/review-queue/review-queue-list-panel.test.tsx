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

function openBatchActions(): void {
  fireEvent.click(screen.getByText("Batch actions"));
}

describe("ReviewQueueListPanel", () => {
  it("keeps the empty shortlist focused on finding jobs with one recovery action", () => {
    render(
      <MemoryRouter>
        <ReviewQueueListPanel
          isJobPending={() => false}
          onSelectItem={vi.fn()}
          onToggleQueueSelection={vi.fn()}
          queue={[]}
          queueSelection={[]}
          selectedItem={null}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("tailored-draft-preparation")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    const goToFindJobs = screen.getByRole("link", { name: "Go to Find jobs" });
    expect(goToFindJobs.getAttribute("href")).toBe("/job-finder/discovery");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exposes select-all for ready jobs before any manual selection", () => {
    const onToggleQueueSelection = vi.fn();

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={onToggleQueueSelection}
        queue={[
          createReadyItem("job_ready_a"),
          createEligibleItem("job_draft"),
          createReadyItem("job_ready_b"),
        ]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    expect(
      screen.getAllByRole("button", { name: "Select all ready jobs" }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Select all ready jobs" }),
    );
    expect(onToggleQueueSelection).toHaveBeenCalledTimes(2);
    expect(onToggleQueueSelection).toHaveBeenCalledWith("job_ready_a", true);
    expect(onToggleQueueSelection).toHaveBeenCalledWith("job_ready_b", true);
    expect(onToggleQueueSelection).not.toHaveBeenCalledWith("job_draft", true);
  });

  it("keeps a single unambiguous select-all once a selection exists", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createReadyItem("job_a"), createReadyItem("job_b")]}
        queueSelection={["job_a"]}
        selectedItem={null}
      />,
    );

    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Select all ready jobs" }),
    ).toHaveLength(1);
  });

  it("omits select-all when no visible job is ready to prepare", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_draft")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    expect(
      screen.queryByRole("button", { name: "Select all ready jobs" }),
    ).toBeNull();
  });

  it("keeps batch controls closed until the accessible disclosure is opened", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_draft"), createReadyItem("job_ready")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    const disclosure = screen.getByTestId("batch-actions");
    const toggle = screen.getByText("Batch actions");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure).toHaveProperty("open", false);
    expect(screen.queryByTestId("tailored-draft-preparation")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Select all ready jobs" }),
    ).toBeNull();

    openBatchActions();

    expect(disclosure).toHaveProperty("open", true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("tailored-draft-preparation")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure).toHaveProperty("open", false);
    expect(screen.queryByTestId("tailored-draft-preparation")).toBeNull();
  });

  it("offers a bounded draft action without implying approval or submission", () => {
    const item = {
      jobId: "job_draft",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: { status: "not_started" },
      assetStatus: "not_started",
      progressPercent: 0,
    } as unknown as ReviewQueueItem;
    const onPrepareTailoredDrafts = vi.fn();

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 1,
          completedCount: 0,
          currentIndex: null,
          eligibleRemainingCount: 0,
          failedCount: 1,
          status: "failed",
          totalCount: 1,
        }}
        isJobPending={() => false}
        onPrepareTailoredDrafts={onPrepareTailoredDrafts}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    openBatchActions();
    expect(screen.getByText("1 eligible · 0 ready to prepare")).toBeTruthy();
    expect(
      screen.getByText(/nothing was approved, queued, submitted, or sent/i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    );
    expect(onPrepareTailoredDrafts).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }).className,
    ).toContain("normal-case");
  });

  it("keeps the toolbar light with an untruncated placeholder", () => {
    const item = createReadyItem("job_toolbar");

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    expect(screen.getByPlaceholderText("Search role or company")).toBeTruthy();

    const toolbar = screen
      .getByRole("searchbox", { name: "Find a shortlisted job" })
      .closest("[data-collection-toolbar-compact]");
    expect(toolbar?.textContent).not.toContain("Prepare up to 10 drafts");
  });

  it("hosts the draft action beside its readiness counts, not in the toolbar", () => {
    const item = {
      jobId: "job_draft_action",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: { status: "not_started" },
      assetStatus: "not_started",
      progressPercent: 0,
    } as unknown as ReviewQueueItem;
    const onPrepareTailoredDrafts = vi.fn();

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onPrepareTailoredDrafts={onPrepareTailoredDrafts}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    expect(screen.queryByTestId("tailored-draft-preparation")).toBeNull();
    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const action = within(strip).getByRole("button", {
      name: "Prepare up to 10 drafts (review required)",
    });
    expect(
      within(strip).getByText("1 eligible · 0 ready to prepare"),
    ).toBeTruthy();

    fireEvent.click(action);
    expect(onPrepareTailoredDrafts).toHaveBeenCalledTimes(1);
  });

  it("swaps the draft action for live progress while preparation runs", () => {
    const item = {
      jobId: "job_running",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: { status: "draft" },
      assetStatus: "generating",
      progressPercent: 40,
    } as unknown as ReviewQueueItem;

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 1,
          completedCount: 1,
          currentIndex: 2,
          eligibleRemainingCount: 0,
          failedCount: 0,
          status: "running",
          totalCount: 3,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onStopTailoredDraftPreparation={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(within(strip).getByText("Preparing 2 of 3")).toBeTruthy();
    expect(
      within(strip).getByRole("button", { name: "Stop after current draft" }),
    ).toBeTruthy();
    expect(
      within(strip).queryByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeNull();
  });

  it("associates a disabled queue checkbox with its readiness explanation", () => {
    const item = {
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: { status: "draft" },
      assetStatus: "failed",
      progressPercent: 0,
    } as unknown as ReviewQueueItem;

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[item]}
        queueSelection={[]}
        selectedItem={item}
      />,
    );

    openBatchActions();
    const checkbox = screen.getByRole("checkbox", {
      name: "Select for batch",
    });
    const descriptionId = checkbox.getAttribute("aria-describedby");
    expect(checkbox).toHaveProperty("disabled", true);
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toMatch(
      /approved tailored PDF or unchanged original resume/i,
    );
  });

  it("caps batch selection at ten unique ready jobs and allows replacement", () => {
    const queue = Array.from({ length: 11 }, (_, index) =>
      createReadyItem(`job_${index}`),
    );
    const onToggleQueueSelection = vi.fn();
    const { rerender } = render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={onToggleQueueSelection}
        queue={queue}
        queueSelection={[
          ...queue.slice(0, 9).map((item) => item.jobId),
          "job_0",
        ]}
        selectedItem={null}
      />,
    );

    expect(screen.getByText("9 selected for batch preparation")).toBeTruthy();
    const tenthCheckbox = screen.getAllByRole("checkbox", {
      name: "Select for batch",
    })[9];
    expect(tenthCheckbox).toHaveProperty("disabled", false);
    fireEvent.click(tenthCheckbox as HTMLElement);
    expect(onToggleQueueSelection).toHaveBeenLastCalledWith("job_9", true);

    rerender(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={onToggleQueueSelection}
        queue={queue}
        queueSelection={[
          ...queue.slice(0, 10).map((item) => item.jobId),
          "job_0",
        ]}
        selectedItem={null}
      />,
    );

    expect(screen.getByText("10 selected for batch preparation")).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox", {
      name: "Select for batch",
    });
    expect(
      checkboxes
        .slice(0, 10)
        .every((checkbox) => !(checkbox as HTMLInputElement).disabled),
    ).toBe(true);
    const blockedCheckbox = checkboxes[10];
    expect(blockedCheckbox).toHaveProperty("disabled", true);
    const descriptionId = blockedCheckbox?.getAttribute("aria-describedby");
    expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
      "Each employer-application batch can include up to 10 jobs. Deselect a job before choosing another.",
    );
    const callCountAtLimit = onToggleQueueSelection.mock.calls.length;
    fireEvent.click(blockedCheckbox as HTMLElement);
    expect(onToggleQueueSelection).toHaveBeenCalledTimes(callCountAtLimit);

    fireEvent.click(checkboxes[0] as HTMLElement);
    expect(onToggleQueueSelection).toHaveBeenLastCalledWith("job_0", false);

    rerender(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={onToggleQueueSelection}
        queue={queue}
        queueSelection={queue.slice(1, 10).map((item) => item.jobId)}
        selectedItem={null}
      />,
    );

    const replacementCheckbox = screen.getAllByRole("checkbox", {
      name: "Select for batch",
    })[10];
    expect(replacementCheckbox).toHaveProperty("disabled", false);
    fireEvent.click(replacementCheckbox as HTMLElement);
    expect(onToggleQueueSelection).toHaveBeenLastCalledWith("job_10", true);
  });

  it("keeps application-batch help distinct from draft-generation help", () => {
    const queue = [
      ...Array.from({ length: 10 }, (_, index) =>
        createReadyItem(`ready_${index}`),
      ),
      createReadyItem("ready_blocked"),
      ...Array.from({ length: 11 }, (_, index) =>
        createEligibleItem(`draft_${index}`),
      ),
    ];

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={queue.slice(0, 10).map((item) => item.jobId)}
        selectedItem={null}
      />,
    );

    expect(
      screen.getByText(
        "Each employer-application batch can include up to 10 jobs. Deselect a job before choosing another.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Only the next 10 eligible jobs run now, in list order; 1 more remains.",
      ),
    ).toBeTruthy();
  });

  it("selects only the first ten unique ready jobs from select-all", () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      createReadyItem(`job_${index}`),
    );
    const onToggleQueueSelection = vi.fn();

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={onToggleQueueSelection}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    fireEvent.click(
      screen.getByRole("button", { name: "Select all ready jobs" }),
    );
    expect(onToggleQueueSelection).toHaveBeenCalledTimes(10);
    expect(onToggleQueueSelection.mock.calls).toEqual(
      queue.slice(0, 10).map((item) => [item.jobId, true]),
    );
  });

  it("keeps queue selection while searching and exposes a sticky batch summary", () => {
    const selected: ReviewQueueItem = {
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      matchScore: 82,
      applicationStatus: "shortlisted",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "asset_job_1",
      resumeApplicationMode: "tailored_per_job",
      resumeReview: {
        status: "approved",
        approvedAt: "2026-08-20T00:00:00.000Z",
        approvedExportId: "export_job_1",
        approvedFormat: "pdf",
        approvedFilePath: "C:/job_1.pdf",
      },
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    const other: ReviewQueueItem = {
      ...selected,
      jobId: "job_2",
      title: "Backend Engineer",
      company: "Northstar",
    };

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[selected, other]}
        queueSelection={[selected.jobId]}
        selectedItem={selected}
      />,
    );

    expect(screen.getByText("1 selected for batch preparation")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Find a shortlisted job" }),
      { target: { value: "Northstar" } },
    );
    expect(screen.getByText("1 of 2 results")).toBeTruthy();
    expect(screen.getByText("Backend Engineer")).toBeTruthy();
    expect(screen.queryByText("Product Engineer")).toBeNull();
  });

  it("keeps a large shortlist bounded to one page and preserves keyboard-sized pages", () => {
    const queue: ReviewQueueItem[] = Array.from(
      { length: 226 },
      (_, index) => ({
        jobId: `job_${index}`,
        title: `Product Engineer ${index}`,
        company: "Acme",
        location: "Remote",
        matchScore: 82,
        applicationStatus: "shortlisted",
        assetStatus: "ready",
        progressPercent: 100,
        resumeAssetId: `asset_job_${index}`,
        resumeApplicationMode: "tailored_per_job",
        resumeReview: {
          status: "approved",
          approvedAt: "2026-08-20T00:00:00.000Z",
          approvedExportId: `export_job_${index}`,
          approvedFormat: "pdf",
          approvedFilePath: `C:/job_${index}.pdf`,
        },
        updatedAt: "2026-08-20T00:00:00.000Z",
      }),
    );

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={queue[0] ?? null}
      />,
    );

    expect(document.querySelectorAll("[data-collection-item-id]")).toHaveLength(
      40,
    );
    expect(
      screen.getByRole("navigation", { name: "shortlisted jobs pagination" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Showing 1–40 of 226 shortlisted jobs"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.queryByText("Product Engineer 0")).toBeNull();
    expect(screen.getByText("Product Engineer 40")).toBeTruthy();
  });

  it("discloses the ten-job batch cap and the list-order remainder before running", () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(
      within(strip).getByText("12 eligible · 0 ready to prepare"),
    ).toBeTruthy();
    expect(
      within(strip).getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
    expect(
      within(strip).getByText(/only the next 10 eligible jobs/i),
    ).toBeTruthy();
    expect(within(strip).getByText(/2 more remain/)).toBeTruthy();
  });

  it("states the remaining eligible count after a capped successful run", () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 10,
          completedCount: 10,
          currentIndex: null,
          eligibleRemainingCount: 2,
          failedCount: 0,
          status: "completed",
          totalCount: 10,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const resultMessage = within(strip).getByRole("status");
    expect(resultMessage.textContent).toMatch(/prepared 10 tailored drafts/i);
    expect(resultMessage.textContent).toMatch(/2 eligible jobs remain/i);
    expect(resultMessage.textContent).toMatch(
      /nothing was approved, queued, submitted, or sent/i,
    );
  });

  it("omits the remaining-count sentence when every eligible job ran", () => {
    const queue = Array.from({ length: 3 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 3,
          completedCount: 3,
          currentIndex: null,
          eligibleRemainingCount: 0,
          failedCount: 0,
          status: "completed",
          totalCount: 3,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const resultMessage = within(strip).getByRole("status");
    expect(resultMessage.textContent).toMatch(/prepared 3 tailored drafts\./i);
    expect(resultMessage.textContent).not.toMatch(/eligible job/i);
    expect(
      within(strip).getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
  });

  it("disables preparation and skips result copy at zero eligible jobs", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createReadyItem("job_ready")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(
      within(strip).getByText("0 eligible · 1 ready to prepare"),
    ).toBeTruthy();
    const prepareButton = within(strip).getByRole("button", {
      name: "Prepare up to 10 drafts (review required)",
    });
    expect(prepareButton).toHaveProperty("disabled", true);
    expect(within(strip).queryByRole("status")).toBeNull();
  });

  it("shows no cap disclosure at exactly ten eligible jobs", () => {
    const queue = Array.from({ length: 10 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(
      within(strip).getByText("10 eligible · 0 ready to prepare"),
    ).toBeTruthy();
    expect(
      within(strip).getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
    expect(within(strip).queryByText(/only the next/i)).toBeNull();
  });

  it("singularizes the cap remainder at eleven eligible jobs", () => {
    const queue = Array.from({ length: 11 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(
      within(strip).getByText(
        "Only the next 10 eligible jobs run now, in list order; 1 more remains.",
      ),
    ).toBeTruthy();
    expect(
      within(strip).getByRole("button", {
        name: "Prepare up to 10 drafts (review required)",
      }),
    ).toBeTruthy();
  });

  it("pluralizes the cap remainder at twenty eligible jobs", () => {
    const queue = Array.from({ length: 20 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    expect(
      within(strip).getByText(
        "Only the next 10 eligible jobs run now, in list order; 10 more remain.",
      ),
    ).toBeTruthy();
  });

  it("reports a finished continue-on-failure batch without claiming it stopped", () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 10,
          completedCount: 7,
          currentIndex: null,
          eligibleRemainingCount: 5,
          failedCount: 3,
          status: "failed",
          totalCount: 10,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const resultMessage = within(strip).getByRole("status");
    expect(resultMessage.textContent).toMatch(
      /prepared 7 tailored drafts; 3 failed\./i,
    );
    expect(resultMessage.textContent).toMatch(
      /5 eligible jobs remain for another run\./i,
    );
    expect(resultMessage.textContent).toMatch(/fix the failed jobs and rerun/i);
    expect(resultMessage.textContent).not.toMatch(/stopped/i);
    expect(resultMessage.textContent).toMatch(
      /nothing was approved, queued, submitted, or sent/i,
    );
  });

  it("keeps a user-stopped batch with failures distinct from a finished run", () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      createEligibleItem(`job_${index}`),
    );

    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 3,
          completedCount: 2,
          currentIndex: null,
          eligibleRemainingCount: 10,
          failedCount: 1,
          status: "failed",
          totalCount: 10,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={queue}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const resultMessage = within(strip).getByRole("status");
    expect(resultMessage.textContent).toMatch(
      /stopped after 2 completed drafts; 1 failed\./i,
    );
    expect(resultMessage.textContent).toMatch(
      /10 eligible jobs remain for another run\./i,
    );
  });

  it("singularizes the failure remainder after a single-job continue-on-failure run", () => {
    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 1,
          completedCount: 0,
          currentIndex: null,
          eligibleRemainingCount: 1,
          failedCount: 1,
          status: "failed",
          totalCount: 1,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onPrepareTailoredDrafts={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_single")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    openBatchActions();
    const strip = screen.getByTestId("tailored-draft-preparation");
    const resultMessage = within(strip).getByRole("status");
    expect(resultMessage.textContent).toMatch(
      /prepared 0 tailored drafts; 1 failed\./i,
    );
    expect(resultMessage.textContent).toMatch(
      /1 eligible job remains for another run\./i,
    );
    expect(resultMessage.textContent).toMatch(/fix the failed job and rerun/i);
  });

  it("shows the same policy-intent line for not-started and approved tailored jobs", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[
          createEligibleItem("job_not_started"),
          createReadyItem("job_approved"),
        ]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    expect(
      screen.getAllByText("A tailored resume will be created for this job"),
    ).toHaveLength(2);
    expect(screen.queryByText("Job-specific tailored resume")).toBeNull();
  });

  it("surfaces the single-job backlog cue outside the closed batch disclosure", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_draft")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    expect(screen.getByTestId("batch-actions")).toHaveProperty("open", false);
    expect(
      screen.getByText("1 job still needs its first tailored draft"),
    ).toBeTruthy();
    expect(screen.queryByTestId("tailored-draft-preparation")).toBeNull();
  });

  it("pluralizes the backlog cue for multiple eligible jobs", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_a"), createEligibleItem("job_b")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    expect(
      screen.getByText("2 jobs still need their first tailored draft"),
    ).toBeTruthy();
  });

  it("hides the backlog cue while draft preparation runs", () => {
    render(
      <ReviewQueueListPanel
        draftPreparation={{
          attemptedCount: 1,
          completedCount: 0,
          currentIndex: 1,
          eligibleRemainingCount: 1,
          failedCount: 0,
          status: "running",
          totalCount: 1,
        }}
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onStopTailoredDraftPreparation={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createEligibleItem("job_draft"), createReadyItem("job_ready")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    expect(screen.queryByText(/first tailored draft/)).toBeNull();
  });

  it("omits the backlog cue when no job needs its first tailored draft", () => {
    render(
      <ReviewQueueListPanel
        isJobPending={() => false}
        onSelectItem={vi.fn()}
        onToggleQueueSelection={vi.fn()}
        queue={[createReadyItem("job_ready")]}
        queueSelection={[]}
        selectedItem={null}
      />,
    );

    expect(screen.queryByText(/first tailored draft/)).toBeNull();
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

    render(
      <MemoryRouter>
        <ReviewQueueListPanel
          isJobPending={() => false}
          onSelectItem={vi.fn()}
          onToggleQueueSelection={vi.fn()}
          queue={[restoredItem, failedItem]}
          queueSelection={[]}
          selectedItem={null}
          tailoredAssets={[restoredAsset, failedAsset]}
        />
      </MemoryRouter>,
    );

    // Each card wraps its row button (data-collection-item-id); the status
    // badge is a sibling inside the same card.
    const restoredRow = screen
      .getByText("Role job_restored")
      .closest("[data-collection-item-id]")!.parentElement!;
    const failedRow = screen
      .getByText("Role job_failed")
      .closest("[data-collection-item-id]")!.parentElement!;

    expect(within(restoredRow).getByText("Needs approval")).toBeTruthy();
    expect(within(restoredRow).queryByText("Resume issue")).toBeNull();
    expect(within(failedRow).getByText("Resume issue")).toBeTruthy();
    expect(within(failedRow).queryByText("Needs approval")).toBeNull();

    // The selected-detail status helper agrees with each rendered row badge.
    expect(
      getReviewQueueWorkflowStatus(restoredItem, restoredAsset),
    ).toMatchObject({ label: "Needs approval" });
    expect(getReviewQueueWorkflowStatus(failedItem, failedAsset)).toMatchObject({
      label: "Resume issue",
    });
  });
});
