// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryResultsPanel } from "./discovery-results-panel";
import type { DiscoveryLatestRunVerdict } from "./discovery-run-feedback";

const browserSession = {
  source: "target_site" as const,
  status: "ready" as const,
  driver: "chrome_profile_agent" as const,
  label: "Browser ready",
  detail: "Ready when needed.",
  lastCheckedAt: "2026-08-23T10:00:00.000Z",
};

function renderEmptyResults(options?: {
  hasCompletedSearch?: boolean;
  isSearchInProgress?: boolean;
  latestRunVerdict?: DiscoveryLatestRunVerdict | null;
}) {
  return render(
    <MemoryRouter>
      <DiscoveryResultsPanel
        browserSession={browserSession}
        jobs={[]}
        onSelectJob={vi.fn()}
        selectedJob={null}
        {...(options?.hasCompletedSearch ? { hasCompletedSearch: true } : {})}
        {...(options?.isSearchInProgress ? { isSearchInProgress: true } : {})}
        {...(options?.latestRunVerdict !== undefined
          ? { latestRunVerdict: options.latestRunVerdict }
          : {})}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("DiscoveryResultsPanel newest-run empty-state verdicts", () => {
  it("shows an explicit failed state instead of first-search or no-match copy", () => {
    renderEmptyResults({
      latestRunVerdict: {
        hasEarlierCompleted: false,
        interruptState: "failed",
        kind: "interrupted",
      },
    });

    expect(screen.getByText("The last search stopped before finishing")).toBeTruthy();
    expect(
      screen.getByText(/stopped before every enabled source was checked/),
    ).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();
    expect(screen.queryByText("Ready for your first search")).toBeNull();
  });

  it("names cancellation as its own outcome", () => {
    renderEmptyResults({
      latestRunVerdict: {
        hasEarlierCompleted: false,
        interruptState: "cancelled",
        kind: "interrupted",
      },
    });

    expect(screen.getByText("The last search was cancelled")).toBeTruthy();
    expect(
      screen.getByText(/was cancelled before every enabled source was checked/),
    ).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();
    expect(screen.queryByText("Ready for your first search")).toBeNull();
  });

  it("acknowledges an earlier completed search behind the stopped attempt", () => {
    renderEmptyResults({
      latestRunVerdict: {
        hasEarlierCompleted: true,
        interruptState: "cancelled",
        kind: "interrupted",
      },
    });

    expect(
      screen.getByText(/An earlier completed search exists/),
    ).toBeTruthy();
    expect(screen.getByText("The last search was cancelled")).toBeTruthy();
  });

  it("reports a zero-result completed run with failed sources as source failures", () => {
    renderEmptyResults({
      latestRunVerdict: {
        hasEarlierCompleted: false,
        interruptState: "sources_failed",
        kind: "interrupted",
      },
    });

    expect(
      screen.getByText("The last search finished, but sources failed"),
    ).toBeTruthy();
    expect(
      screen.getByText(/finished, but at least one enabled source failed/),
    ).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();
  });

  it("keeps the earlier-completed note behind a degraded newest run", () => {
    renderEmptyResults({
      latestRunVerdict: {
        hasEarlierCompleted: true,
        interruptState: "sources_failed",
        kind: "interrupted",
      },
    });

    expect(
      screen.getByText("The last search finished, but sources failed"),
    ).toBeTruthy();
    expect(
      screen.getByText(/An earlier completed search exists/),
    ).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();
  });

  it("keeps the no-match verdict only for a completed newest run", () => {
    renderEmptyResults({ latestRunVerdict: { kind: "completed" } });

    expect(screen.getByText("No matches from this search")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Broaden search" })).toBeTruthy();
    expect(screen.queryByText("The last search stopped before finishing")).toBeNull();
  });

  it("keeps the ready verdict only when no settled run exists", () => {
    renderEmptyResults({ latestRunVerdict: { kind: "none" } });

    expect(screen.getByText("Ready for your first search")).toBeTruthy();
    expect(screen.queryByText("No matches from this search")).toBeNull();
  });

  it("falls back to the legacy completed flag when no verdict is provided", () => {
    renderEmptyResults({ hasCompletedSearch: true });
    expect(screen.getByText("No matches from this search")).toBeTruthy();

    cleanup();

    renderEmptyResults();
    expect(screen.getByText("Ready for your first search")).toBeTruthy();
  });

  it("keeps live progress above any terminal verdict while a run is active", () => {
    renderEmptyResults({
      isSearchInProgress: true,
      latestRunVerdict: {
        hasEarlierCompleted: false,
        interruptState: "failed",
        kind: "interrupted",
      },
    });

    expect(screen.getByText("Searching your sources")).toBeTruthy();
    expect(screen.queryByText("The last search stopped before finishing")).toBeNull();
  });

  it("treats a running newest run as live progress rather than a final verdict", () => {
    renderEmptyResults({ latestRunVerdict: { kind: "running" } });

    expect(screen.getByText("Searching your sources")).toBeTruthy();
    expect(screen.queryByText("Ready for your first search")).toBeNull();
    expect(screen.queryByText("No matches from this search")).toBeNull();
  });
});
