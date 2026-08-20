// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReviewQueueItem } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueListPanel } from "./review-queue-list-panel";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ReviewQueueListPanel", () => {
  it("associates a disabled queue checkbox with its readiness explanation", () => {
    const item = {
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_resume",
      resumeReview: { status: "draft" },
      assetStatus: "missing",
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

    const checkbox = screen.getByRole("checkbox", { name: "Queue" });
    const descriptionId = checkbox.getAttribute("aria-describedby");
    expect(checkbox).toHaveProperty("disabled", true);
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toMatch(
      /approved tailored PDF or unchanged original CV/i,
    );
  });

  it("keeps queue selection while searching and exposes a sticky batch summary", () => {
    const selected = {
      jobId: "job_1",
      title: "Product Engineer",
      company: "Acme",
      location: "Remote",
      resumeApplicationMode: "tailored_resume",
      resumeReview: { status: "approved" },
      assetStatus: "ready",
      progressPercent: 100,
    } as unknown as ReviewQueueItem;
    const other = {
      ...selected,
      jobId: "job_2",
      title: "Backend Engineer",
      company: "Northstar",
    } as ReviewQueueItem;

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
    const queue = Array.from(
      { length: 226 },
      (_, index) =>
        ({
          jobId: `job_${index}`,
          title: `Product Engineer ${index}`,
          company: "Acme",
          location: "Remote",
          resumeApplicationMode: "tailored_resume",
          resumeReview: { status: "approved" },
          assetStatus: "ready",
          progressPercent: 100,
        }) as unknown as ReviewQueueItem,
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
});
