// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SavedJobSchema, type SavedJob } from "@unemployed/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiscoveryResultsPanel } from "./discovery-results-panel";
import {
  buildDiscoveryResultGroupHeadings,
  getDiscoveryResultGroup,
} from "./discovery-result-groups";

const browserSession = {
  source: "target_site" as const,
  status: "ready" as const,
  driver: "chrome_profile_agent" as const,
  label: "Browser ready",
  detail: "Browser session is ready.",
  lastCheckedAt: "2026-08-23T10:00:00.000Z",
};

function job(input: {
  id: string;
  score: number;
  provisional?: boolean;
  recommendation?: string;
}): SavedJob {
  return SavedJobSchema.parse({
    id: input.id,
    source: "target_site",
    sourceJobId: `source_${input.id}`,
    canonicalUrl: `https://jobs.example.test/${input.id}`,
    applicationUrl: `https://jobs.example.test/${input.id}/apply`,
    title: `Role ${input.id}`,
    company: "Mega Corp",
    location: "Remote",
    workMode: ["remote"],
    applyPath: "external_redirect",
    easyApplyEligible: false,
    discoveredAt: "2026-08-23T10:00:00.000Z",
    postedAt: null,
    salaryText: null,
    description: `Own systems for ${input.id}.`,
    status: "discovered",
    discoveryMethod: input.provisional ? "catalog_seed" : "browser_agent",
    matchAssessment: {
      score: input.score,
      reasons: ["Relevant experience"],
      gaps: [],
      recommendation: input.recommendation ?? "review_before_applying",
      ...(input.provisional
        ? {}
        : {
            contextFingerprint: "context_v1",
            postingFingerprint: `posting_${input.id}`,
          }),
    },
  });
}

beforeEach(() => {
  window.localStorage?.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

describe("discovery result bands", () => {
  it("bands rows by verified score and never demotes a provisional row", () => {
    expect(getDiscoveryResultGroup(job({ id: "strong", score: 64 }))).toBe(
      "matches",
    );
    expect(getDiscoveryResultGroup(job({ id: "weak", score: 36 }))).toBe(
      "weaker",
    );
    expect(getDiscoveryResultGroup(job({ id: "off", score: 18 }))).toBe(
      "mismatches",
    );
    expect(
      getDiscoveryResultGroup(
        job({ id: "provisional", score: 36, provisional: true }),
      ),
    ).toBe("matches");
  });

  it("only heads a band that follows another band, and only in ranked order", () => {
    const jobs = [
      job({ id: "a", score: 72 }),
      job({ id: "b", score: 64 }),
      job({ id: "c", score: 36 }),
      job({ id: "d", score: 36 }),
    ];

    const ranked = buildDiscoveryResultGroupHeadings(jobs, true);
    expect(ranked.get("c")).toEqual({
      count: 2,
      description:
        "These scored well below your saved targets. Open one before trusting its score.",
      id: "weaker",
      label: "Weaker matches",
    });
    expect(ranked.has("a")).toBe(false);
    expect(ranked.has("d")).toBe(false);

    // A list that opens with the weaker band has nothing to be divided from.
    expect(
      buildDiscoveryResultGroupHeadings([jobs[2]!, jobs[3]!], true).size,
    ).toBe(0);
    // Any other sort re-interleaves the bands, so dividers are withheld.
    expect(buildDiscoveryResultGroupHeadings(jobs, false).size).toBe(0);
  });

  it("divides weaker results in the list instead of presenting one flat ranking", () => {
    render(
      <DiscoveryResultsPanel
        browserSession={browserSession}
        hasCompletedSearch
        jobs={[
          job({ id: "strong_a", score: 72 }),
          job({ id: "strong_b", score: 64 }),
          job({ id: "weak_a", score: 36 }),
        ]}
        onSelectJob={vi.fn()}
        selectedJob={null}
      />,
    );

    const heading = screen.getByTestId("discovery-results-group-weaker");
    expect(heading.textContent).toContain("Weaker matches (1)");
    expect(screen.queryByTestId("discovery-results-group-mismatches")).toBe(
      null,
    );
  });

  it("makes revealing the also-found pool change the count, the label, and the list", () => {
    const shown = [job({ id: "strong_a", score: 72 })];
    const mismatch = job({ id: "off_a", score: 18 });
    const onToggleAlsoFound = vi.fn();

    const { rerender } = render(
      <DiscoveryResultsPanel
        areAlsoFoundShown={false}
        browserSession={browserSession}
        hasCompletedSearch
        hiddenAlsoFoundCount={1}
        jobs={shown}
        alsoFoundCount={1}
        onSelectJob={vi.fn()}
        onToggleAlsoFound={onToggleAlsoFound}
        selectedJob={null}
      />,
    );

    expect(screen.getByText("1 worth opening · 1 also found")).toBeTruthy();
    // The accessible name is exactly the visible label, so the reveal is
    // reachable by the name a user actually reads.
    fireEvent.click(
      screen.getByRole("button", { name: "Show also found (1)" }),
    );
    expect(onToggleAlsoFound).toHaveBeenCalledTimes(1);

    rerender(
      <DiscoveryResultsPanel
        areAlsoFoundShown
        browserSession={browserSession}
        hasCompletedSearch
        hiddenAlsoFoundCount={0}
        jobs={[...shown, mismatch]}
        alsoFoundCount={1}
        onSelectJob={vi.fn()}
        onToggleAlsoFound={onToggleAlsoFound}
        selectedJob={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Hide also found (1)" }),
    ).toBeTruthy();
    expect(screen.getByText("1 worth opening · 1 also found")).toBeTruthy();
    expect(
      screen.getByTestId("discovery-results-group-mismatches").textContent,
    ).toContain("Clear mismatches (1)");
  });
});
