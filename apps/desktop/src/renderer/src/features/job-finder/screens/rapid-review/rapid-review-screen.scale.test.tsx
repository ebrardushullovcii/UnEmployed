// @vitest-environment jsdom

import {
  RapidReviewDecisionLogSchema,
  SavedJobSchema,
  type RapidReviewDecisionLog,
  type SavedJob,
} from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildLatestDecisionIndex,
  RapidReviewScreen,
} from "./rapid-review-screen";

const JOB_COUNT = 550;
const PAGE_SIZE = 40;

function createJobs(): SavedJob[] {
  return Array.from({ length: JOB_COUNT }, (_, index) => {
    const ordinal = index.toString().padStart(4, "0");

    return SavedJobSchema.parse({
      id: `rapid_review_job_${ordinal}`,
      source: "target_site",
      sourceJobId: `rapid_review_source_${ordinal}`,
      canonicalUrl: `https://jobs.example.test/roles/${ordinal}`,
      applicationUrl: `https://jobs.example.test/roles/${ordinal}/apply`,
      title: `Senior Product Designer ${ordinal}`,
      company: `Scale Company ${index % 50}`,
      location: index % 2 === 0 ? "Remote" : "Budapest, Hungary",
      workMode: index % 2 === 0 ? ["remote"] : ["hybrid"],
      applyPath: "external_redirect",
      easyApplyEligible: false,
      discoveredAt: "2026-07-30T10:00:00.000Z",
      salaryText: null,
      description: `Own product systems for role ${ordinal}.`,
      status: "discovered",
      matchAssessment: {
        score: 70 + (index % 30),
        reasons: ["Relevant product design experience"],
        gaps: [],
      },
    });
  });
}

function createDecisionLog(jobCount: number) {
  return RapidReviewDecisionLogSchema.parse({
    campaignId: "campaign_scale",
    entries: Array.from({ length: jobCount }, (_, index) => {
      const ordinal = index.toString().padStart(4, "0");
      return {
        id: `rapid_review_decision_${ordinal}`,
        campaignId: "campaign_scale",
        jobId: `rapid_review_job_${ordinal}`,
        kind: index % 2 === 0 ? "shortlist" : "reject",
        revision: index,
        reason: null,
        createdAt: `2026-07-30T10:${Math.floor(index / 60)
          .toString()
          .padStart(2, "0")}:${(index % 60).toString().padStart(2, "0")}.000Z`,
        updatedAt: `2026-07-30T10:${Math.floor(index / 60)
          .toString()
          .padStart(2, "0")}:${(index % 60).toString().padStart(2, "0")}.000Z`,
        undo: null,
      };
    }),
  });
}

function renderRapidReview(
  jobs: readonly SavedJob[],
  log: RapidReviewDecisionLog | null = null,
) {
  return render(
    <RapidReviewScreen
      campaignId="campaign_scale"
      campaignName="Scale campaign"
      jobs={jobs}
      log={log}
      onInspectJob={vi.fn()}
      onMutate={vi.fn(() => Promise.resolve())}
      pending={false}
    />,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("RapidReviewScreen workspace scale", () => {
  it("precomputes the latest active decision for each job in one log pass", () => {
    const log = RapidReviewDecisionLogSchema.parse({
      campaignId: "campaign_scale",
      entries: [
        {
          id: "decision_1",
          campaignId: "campaign_scale",
          jobId: "job_1",
          kind: "shortlist",
          revision: 1,
          reason: null,
          createdAt: "2026-07-30T10:00:00.000Z",
          updatedAt: "2026-07-30T10:00:00.000Z",
          undo: null,
        },
        {
          id: "decision_2",
          campaignId: "campaign_scale",
          jobId: "job_1",
          kind: "reject",
          revision: 2,
          reason: null,
          createdAt: "2026-07-30T10:01:00.000Z",
          updatedAt: "2026-07-30T10:01:00.000Z",
          undo: {
            undoneAt: "2026-07-30T10:02:00.000Z",
            reason: null,
            restoringDecisionId: null,
          },
        },
        {
          id: "decision_3",
          campaignId: "campaign_scale",
          jobId: "job_1",
          kind: "inspect",
          revision: 3,
          reason: null,
          createdAt: "2026-07-30T10:03:00.000Z",
          updatedAt: "2026-07-30T10:03:00.000Z",
          undo: null,
        },
      ],
    });

    const index = buildLatestDecisionIndex(log);

    expect(index.size).toBe(1);
    expect(index.get("job_1")).toMatchObject({
      id: "decision_3",
      kind: "inspect",
    });
  });

  it("mounts one page for a 550-job campaign and keeps paging accessible", () => {
    const jobs = createJobs();
    const log = createDecisionLog(550);
    const { container } = renderRapidReview(jobs, log);
    const list = screen.getByRole("list", { name: "Jobs to review" });

    expect(within(list).getAllByRole("button")).toHaveLength(PAGE_SIZE);
    expect(within(list).getAllByRole("checkbox")).toHaveLength(PAGE_SIZE);
    expect(screen.getByText("Showing 1–40 of 550 jobs")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "jobs pagination" }),
    ).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(PAGE_SIZE);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(within(list).getAllByRole("button")).toHaveLength(PAGE_SIZE);
    expect(within(list).getByRole("button", { name: /0040/ })).toBeTruthy();
    expect(within(list).queryByRole("button", { name: /0000/ })).toBeNull();
    expect(screen.getByText("Showing 41–80 of 550 jobs")).toBeTruthy();
  });

  it("moves the active keyboard review across page boundaries", () => {
    const jobs = createJobs();
    const { container } = renderRapidReview(jobs, createDecisionLog(550));
    const list = screen.getByRole("list", { name: "Jobs to review" });

    for (let index = 0; index < PAGE_SIZE; index += 1) {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    }

    expect(screen.getByText("Showing 41–80 of 550 jobs")).toBeTruthy();
    expect(container.querySelector('[aria-current="true"]')).toBe(
      within(list).getByRole("button", { name: /0040/ }),
    );
  });

  it("lets the intended row own arrow navigation without a second window move", () => {
    const jobs = createJobs().slice(0, 3);
    const { container } = renderRapidReview(jobs);
    const list = screen.getByRole("list", { name: "Jobs to review" });
    const rowButtons = within(list).getAllByRole("button");

    // Focus/dispatch on the second row while the first row is still active.
    // A bubbling window shortcut would otherwise overwrite the row's move.
    fireEvent.keyDown(rowButtons[1]!, { key: "ArrowDown" });

    expect(container.querySelector('[aria-current="true"]')).toBe(
      rowButtons[2],
    );
  });

  it("leaves keyboard activation to the Compare checkbox and ignores nested controls", () => {
    const jobs = createJobs().slice(0, 3);
    const { container } = renderRapidReview(jobs);
    const list = screen.getByRole("list", { name: "Jobs to review" });
    const rowButtons = within(list).getAllByRole("button");
    const checkbox = within(list).getAllByRole(
      "checkbox",
    )[0]! as HTMLInputElement;

    for (const key of [" ", "Enter"]) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
      });
      checkbox.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(container.querySelector('[aria-current="true"]')).toBe(
      rowButtons[0],
    );

    const nestedControl = document.createElement("button");
    nestedControl.type = "button";
    nestedControl.textContent = "Nested control";
    rowButtons[0]!.append(nestedControl);

    fireEvent.keyDown(nestedControl, { key: "ArrowDown" });

    expect(container.querySelector('[aria-current="true"]')).toBe(
      rowButtons[0],
    );
  });

  it("does not prevent ordinary Tab navigation", () => {
    const jobs = createJobs().slice(0, 3);
    const { container } = renderRapidReview(jobs);
    const list = screen.getByRole("list", { name: "Jobs to review" });
    const firstRow = within(list).getAllByRole("button")[0]!;
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });

    firstRow.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelector('[aria-current="true"]')).toBe(firstRow);
  });
});
