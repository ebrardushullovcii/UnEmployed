// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedJob } from "@unemployed/contracts";

import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";
import { DiscoveryResultsPanel } from "./discovery-results-panel";

const browserSession = {
  source: "target_site" as const,
  status: "ready" as const,
  driver: "chrome_profile_agent" as const,
  label: "Browser ready",
  detail: "Browser session is ready.",
  lastCheckedAt: "2026-07-31T10:00:00.000Z",
};

const resultJob = {
  id: "job_search_again",
  title: "Senior Product Designer",
  company: "Acme",
  location: "Remote",
  matchAssessment: {
    score: 88,
    recommendation: "strong_fit",
    reasons: ["Strong role and skill match."],
    gaps: [],
  },
  status: "discovered",
  applyPath: "external_redirect",
  salaryText: null,
  workMode: ["remote"],
  postedAt: "2026-07-31T00:00:00.000Z",
  postedAtText: null,
} as unknown as SavedJob;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("DiscoveryResultsPanel narrow search access", () => {
  it("keeps a compact search-again action beside existing results", () => {
    const onSearchAgain = vi.fn();

    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={[resultJob]}
        onSearchAgain={onSearchAgain}
        onSelectJob={vi.fn()}
        selectedJob={resultJob}
      />,
    );

    const searchAgain = screen.getByRole("button", { name: "Search again" });

    expect(searchAgain.className).toContain("xl:hidden");
    fireEvent.click(searchAgain);
    expect(onSearchAgain).toHaveBeenCalledTimes(1);
  });

  it("truthfully disables the compact action while a search is pending", () => {
    const onSearchAgain = vi.fn();

    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={[resultJob]}
        onSearchAgain={onSearchAgain}
        onSelectJob={vi.fn()}
        searchAgainPending
        selectedJob={resultJob}
      />,
    );

    const searching = screen.getByRole<HTMLButtonElement>("button", {
      name: "Searching",
    });

    expect(searching.disabled).toBe(true);
    expect(searching.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(searching);
    expect(onSearchAgain).not.toHaveBeenCalled();
  });

  it("does not duplicate the search action in empty results", () => {
    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        jobs={[]}
        onSearchAgain={vi.fn()}
        onSelectJob={vi.fn()}
        selectedJob={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "Search again" })).toBeNull();
  });

  it("hands keyboard result activation directly to the related job detail without moving mouse focus", async () => {
    const onSelectJob = vi.fn();

    render(
      <>
        <DiscoveryResultsPanel
          browserSession={browserSession}
          hasCompletedSearch
          jobs={[resultJob]}
          onSelectJob={onSelectJob}
          selectedJob={resultJob}
        />
        <section aria-label="Job details" id={DISCOVERY_DETAIL_REGION_ID}>
          <h2 id={DISCOVERY_DETAIL_HEADING_ID} tabIndex={-1}>
            Senior Product Designer
          </h2>
        </section>
      </>,
    );

    expect(screen.getByRole("region", { name: "Job results" })).toBeTruthy();
    const resultButton = screen.getByRole("button", {
      name: /Senior Product Designer/i,
    });
    const detailHeading = screen.getByRole("heading", {
      name: "Senior Product Designer",
    });

    expect(resultButton.getAttribute("aria-controls")).toBe(
      DISCOVERY_DETAIL_REGION_ID,
    );
    resultButton.focus();
    fireEvent.click(resultButton, { detail: 1 });
    expect(document.activeElement).toBe(resultButton);

    fireEvent.click(resultButton, { detail: 0 });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(detailHeading);
    });
    expect(onSelectJob).toHaveBeenCalledTimes(2);
  });

  it("searches the current result pool without changing the selected job", () => {
    const secondJob = {
      ...resultJob,
      id: "job_backend",
      title: "Backend Engineer",
      company: "Northstar",
    } as SavedJob;

    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={[resultJob, secondJob]}
        onSelectJob={vi.fn()}
        selectedJob={resultJob}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a job" }), {
      target: { value: "Northstar" },
    });

    expect(screen.getByText("1 of 2 results")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Backend Engineer/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Senior Product Designer/i }),
    ).toBeNull();
  });

  it("compares the strongest jobs side by side and opens the chosen job", () => {
    const onSelectJob = vi.fn();
    const secondJob = {
      ...resultJob,
      id: "job_backend_compare",
      title: "Backend Engineer",
      company: "Northstar",
      matchAssessment: {
        ...resultJob.matchAssessment,
        score: 81,
      },
    } as SavedJob;

    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={[resultJob, secondJob]}
        onSelectJob={onSelectJob}
        selectedJob={resultJob}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compare top jobs" }));
    const comparison = screen.getByRole("region", {
      name: "Top job comparison",
    });
    expect(comparison.textContent).toContain("88% fit");
    expect(comparison.textContent).toContain("81% fit");
    fireEvent.click(
      within(comparison).getByRole("button", { name: /Backend Engineer/i }),
    );
    expect(onSelectJob).toHaveBeenCalledWith("job_backend_compare");
  });
});
