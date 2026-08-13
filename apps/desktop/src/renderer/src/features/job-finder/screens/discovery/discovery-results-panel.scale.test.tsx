// @vitest-environment jsdom

import { performance } from "node:perf_hooks";

import { SavedJobSchema, type SavedJob } from "@unemployed/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DISCOVERY_RESULTS_PAGE_SIZE,
  DiscoveryResultsPanel,
} from "./discovery-results-panel";

const JOB_COUNT = 1_000;
const DOM_COMMIT_BUDGET_MS = 2_000;

const browserSession = {
  source: "target_site" as const,
  status: "ready" as const,
  driver: "chrome_profile_agent" as const,
  label: "Browser ready",
  detail: "Browser session is ready.",
  lastCheckedAt: "2026-07-30T10:00:00.000Z",
};

function createJobs(): SavedJob[] {
  return Array.from({ length: JOB_COUNT }, (_, index) => {
    const ordinal = index.toString().padStart(4, "0");

    return SavedJobSchema.parse({
      id: `dom_scale_job_${ordinal}`,
      source: "target_site",
      sourceJobId: `dom_scale_source_${ordinal}`,
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

function getRenderedJobButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>("button[data-job-result-id]"),
  );
}

function renderResults(
  jobs: readonly SavedJob[],
  selectedJob: SavedJob | null,
) {
  return render(
    <DiscoveryResultsPanel
      browserSession={browserSession}
      hasCompletedSearch
      jobs={jobs}
      onSelectJob={vi.fn()}
      selectedJob={selectedJob}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("DiscoveryResultsPanel workspace scale", () => {
  it("bounds a 1,000-job React DOM commit to exactly one 50-row page", () => {
    const jobs = createJobs();
    const startedAt = performance.now();
    const { container } = renderResults(jobs, null);
    const durationMs = performance.now() - startedAt;
    const resultButtons = getRenderedJobButtons(container);

    console.info("job-finder-discovery-dom-scale", {
      durationMs: Math.round(durationMs),
      inputJobs: jobs.length,
      renderedJobButtons: resultButtons.length,
      renderedNodes: container.querySelectorAll("*").length,
    });

    expect(resultButtons).toHaveLength(DISCOVERY_RESULTS_PAGE_SIZE);
    expect(resultButtons[0]?.dataset.jobResultId).toBe("dom_scale_job_0000");
    expect(resultButtons.at(-1)?.dataset.jobResultId).toBe(
      "dom_scale_job_0049",
    );
    expect(screen.getByText("1–50 of 1000")).toBeTruthy();
    expect(screen.getAllByText("Review before applying")).toHaveLength(
      DISCOVERY_RESULTS_PAGE_SIZE,
    );
    expect(
      screen.getAllByLabelText("Overall fit: 70 percent").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Role and requirements")).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Previous" })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled,
    ).toBe(false);
    expect(durationMs).toBeLessThan(DOM_COMMIT_BUDGET_MS);
  });

  it("keeps accessible next and previous paging bounded to 50 result buttons", () => {
    const jobs = createJobs();
    const { container } = renderResults(jobs, null);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    let resultButtons = getRenderedJobButtons(container);
    expect(resultButtons).toHaveLength(DISCOVERY_RESULTS_PAGE_SIZE);
    expect(resultButtons[0]?.dataset.jobResultId).toBe("dom_scale_job_0050");
    expect(resultButtons.at(-1)?.dataset.jobResultId).toBe(
      "dom_scale_job_0099",
    );
    expect(screen.getByText("51–100 of 1000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    resultButtons = getRenderedJobButtons(container);
    expect(resultButtons[0]?.dataset.jobResultId).toBe("dom_scale_job_0000");
    expect(screen.getByText("1–50 of 1000")).toBeTruthy();
  });

  it("resets only the result scroller while keeping pagination keyboard focus", () => {
    const jobs = createJobs();
    const { container } = renderResults(jobs, null);
    const scrollRegion = container.querySelector<HTMLElement>(
      "[data-job-results-scroll-region]",
    );
    const nextButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Next",
    });
    expect(scrollRegion).not.toBeNull();
    container.scrollTop = 120;
    if (scrollRegion) {
      scrollRegion.scrollTop = 640;
    }
    nextButton.focus();

    fireEvent.click(nextButton);

    expect(scrollRegion?.scrollTop).toBe(0);
    expect(container.scrollTop).toBe(120);
    expect(document.activeElement).toBe(nextButton);
    expect(screen.getByText("51–100 of 1000")).toBeTruthy();
  });

  it("keeps pagination outside the scrolling result region", () => {
    const jobs = createJobs();
    const { container } = renderResults(jobs, null);
    const scrollRegion = container.querySelector(
      "[data-job-results-scroll-region]",
    );
    const resultStack = container.querySelector("[data-job-results-stack]");
    const pagination = container.querySelector("[data-job-results-pagination]");

    expect(resultStack).toBeTruthy();
    expect(resultStack?.className).toContain("overflow-hidden");
    expect(scrollRegion).toBeTruthy();
    expect(pagination).toBeTruthy();
    expect(scrollRegion?.contains(pagination)).toBe(false);
    expect(pagination?.className).not.toContain("sticky");
    expect(pagination?.className).toContain("shrink-0");
    expect(pagination?.className).toContain("bg-(--surface-panel)");
  });

  it("opens directly on page 20 when the selected job is the final result", () => {
    const jobs = createJobs();
    const { container } = renderResults(jobs, jobs[999] ?? null);
    const resultButtons = getRenderedJobButtons(container);

    expect(resultButtons).toHaveLength(DISCOVERY_RESULTS_PAGE_SIZE);
    expect(resultButtons[0]?.dataset.jobResultId).toBe("dom_scale_job_0950");
    expect(resultButtons.at(-1)?.dataset.jobResultId).toBe(
      "dom_scale_job_0999",
    );
    expect(screen.getByText("951–1000 of 1000")).toBeTruthy();
    expect(
      container
        .querySelector('[data-job-result-id="dom_scale_job_0999"]')
        ?.getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled,
    ).toBe(true);
  });

  it("does not snap away from the current page when a refreshed job array keeps the same selection", () => {
    const jobs = createJobs();
    const { container, rerender } = renderResults(jobs, jobs[0] ?? null);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("51–100 of 1000")).toBeTruthy();
    const scrollRegion = container.querySelector<HTMLElement>(
      "[data-job-results-scroll-region]",
    );
    expect(scrollRegion).not.toBeNull();
    if (scrollRegion) {
      scrollRegion.scrollTop = 640;
    }

    const refreshedJobs = jobs.map((job) => ({ ...job }));
    rerender(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={refreshedJobs}
        onSelectJob={vi.fn()}
        selectedJob={refreshedJobs[0] ?? null}
      />,
    );

    const resultButtons = getRenderedJobButtons(container);
    expect(resultButtons[0]?.dataset.jobResultId).toBe("dom_scale_job_0050");
    expect(screen.getByText("51–100 of 1000")).toBeTruthy();
    expect(scrollRegion?.scrollTop).toBe(640);
  });

  it("resets the result scroller when an external selection opens another page", () => {
    const jobs = createJobs();
    const { container, rerender } = renderResults(jobs, jobs[0] ?? null);
    const scrollRegion = container.querySelector<HTMLElement>(
      "[data-job-results-scroll-region]",
    );
    expect(scrollRegion).not.toBeNull();
    if (scrollRegion) {
      scrollRegion.scrollTop = 640;
    }

    rerender(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={jobs}
        onSelectJob={vi.fn()}
        selectedJob={jobs[999] ?? null}
      />,
    );

    expect(screen.getByText("951–1000 of 1000")).toBeTruthy();
    expect(scrollRegion?.scrollTop).toBe(0);
  });

  it("keeps the result scroll position when selection changes within the same page", () => {
    const jobs = createJobs();
    const { container, rerender } = renderResults(jobs, jobs[50] ?? null);
    const scrollRegion = container.querySelector<HTMLElement>(
      "[data-job-results-scroll-region]",
    );
    expect(scrollRegion).not.toBeNull();
    if (scrollRegion) {
      scrollRegion.scrollTop = 640;
    }

    rerender(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={jobs}
        onSelectJob={vi.fn()}
        selectedJob={jobs[51] ?? null}
      />,
    );

    expect(screen.getByText("51–100 of 1000")).toBeTruthy();
    expect(scrollRegion?.scrollTop).toBe(640);
  });

  it("explains an all-hidden result set and offers a working reveal action", () => {
    const onShowHiddenJobs = vi.fn();

    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        hiddenJobCount={3}
        jobs={[]}
        onSelectJob={vi.fn()}
        onShowHiddenJobs={onShowHiddenJobs}
        selectedJob={null}
      />,
    );

    expect(screen.getByText("0 shown · 3 hidden")).toBeTruthy();
    expect(screen.getByText("All results are hidden")).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show mismatches" }));

    expect(onShowHiddenJobs).toHaveBeenCalledTimes(1);
  });
});
