// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  BrowserSessionState,
  DiscoveryRunRecord,
  JobSearchPreferences,
  SavedJob,
} from "@unemployed/contracts";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@renderer/features/job-finder/components/locked-screen-layout",
  () => ({
    LockedScreenLayout: ({
      children,
      topContent,
    }: {
      children: ReactNode;
      topContent: ReactNode;
    }) => (
      <main>
        {topContent}
        {children}
      </main>
    ),
  }),
);
vi.mock("./discovery-activity-panel", () => ({
  DiscoveryHistoryModal: () => null,
}));
vi.mock("./discovery-detail-panel", () => ({
  DiscoveryDetailPanel: () => <section aria-label="Job details" />,
}));
vi.mock("./discovery-filters-panel", () => ({
  DiscoveryFiltersPanel: () => <section aria-label="Current search" />,
}));
vi.mock("./discovery-results-panel", () => ({
  DiscoveryResultsPanel: () => <section aria-label="Job results" />,
}));

import { DiscoveryScreen } from "./discovery-screen";

const browserSession = {
  source: "target_site",
  status: "ready",
  driver: "chrome_profile_agent",
  label: "Browser ready",
  detail: "The browser is ready for source search.",
  lastCheckedAt: "2026-08-23T10:00:00.000Z",
} as BrowserSessionState;

const searchPreferences = {
  targetRoles: ["Software Engineer"],
  jobFamilies: [],
  locations: ["Remote"],
  excludedLocations: [],
  workModes: ["remote"],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: "USD",
  compensation: {
    minimum: null,
    maximum: null,
    interval: "year",
    currency: "USD",
    currencyStatus: "inherited",
  },
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: {
    historyLimit: 5,
    targets: [
      {
        id: "source_1",
        label: "Example Board",
        startingUrl: "https://jobs.example.com",
        enabled: true,
      },
    ],
  },
} as unknown as JobSearchPreferences;

function createJob(id: string): SavedJob {
  return {
    id,
    matchAssessment: { recommendation: "strong_fit" },
  } as unknown as SavedJob;
}

const runningRun = {
  id: "run_1",
  state: "running",
} as unknown as DiscoveryRunRecord;

const completedRun = {
  id: "run_1",
  state: "completed",
} as unknown as DiscoveryRunRecord;

function buildScreen(overrides?: {
  activeRun?: DiscoveryRunRecord | null;
  onCancelDiscovery?: () => void;
}) {
  return (
    <MemoryRouter>
      <DiscoveryScreen
        actionState={{ message: null }}
        activeRun={overrides?.activeRun ?? null}
        browserSession={browserSession}
        discoverySessions={[]}
        isBrowserSessionPending={false}
        isBrowserSessionPendingForTarget={() => false}
        isDiscoveryAllPending={false}
        isJobPending={() => false}
        isTargetPending={() => false}
        jobs={[createJob("strong")]}
        dismissedJobs={[]}
        liveEvents={[]}
        {...(overrides?.onCancelDiscovery
          ? { onCancelDiscovery: overrides.onCancelDiscovery }
          : {})}
        onDismissJob={vi.fn()}
        onRestoreDismissedJob={vi.fn()}
        onOpenBrowserSession={vi.fn()}
        onOpenBrowserSessionForTarget={vi.fn()}
        onQueueJob={vi.fn()}
        onRunAgentDiscovery={vi.fn()}
        onSelectJob={vi.fn()}
        recentRuns={[]}
        searchPreferences={searchPreferences}
        selectedJob={createJob("strong")}
        sourceAccessPrompts={[]}
      />
    </MemoryRouter>
  );
}

function getStopSearchButton() {
  return screen.getByRole("button", { name: "Stop search" });
}

afterEach(() => {
  cleanup();
});

describe("DiscoveryScreen stop search action", () => {
  it("keeps the idle header unchanged without any stop control", () => {
    render(buildScreen({ onCancelDiscovery: vi.fn() }));

    const searchButton = screen.getByRole("button", { name: "Search now" });
    expect(searchButton.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Stop search" })).toBeNull();
  });

  it("exposes an operable Stop search beside the disabled Searching control while a run is active", () => {
    const onCancelDiscovery = vi.fn();
    render(buildScreen({ activeRun: runningRun, onCancelDiscovery }));

    const searching = screen.getByRole("button", { name: "Searching" });
    expect(searching.hasAttribute("disabled")).toBe(true);

    const stop = getStopSearchButton();
    expect(stop.hasAttribute("disabled")).toBe(false);
    expect(stop.getAttribute("data-pending")).toBeNull();
    expect(stop.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(stop);
    expect(onCancelDiscovery).toHaveBeenCalledTimes(1);
  });

  it("makes a requested stop inert and focus-stable, then re-arms after the run leaves running", () => {
    const onCancelDiscovery = vi.fn();
    const { rerender } = render(
      buildScreen({ activeRun: runningRun, onCancelDiscovery }),
    );

    const stop = getStopSearchButton();
    fireEvent.click(stop);
    // Pending convention: busy + aria-disabled while staying in the tab
    // order, so focus never drops to <body> mid-request.
    expect(stop.getAttribute("data-pending")).toBe("true");
    expect(stop.getAttribute("aria-disabled")).toBe("true");
    expect(stop.hasAttribute("disabled")).toBe(false);

    fireEvent.click(stop);
    fireEvent.keyDown(stop, { key: "Enter" });
    expect(onCancelDiscovery).toHaveBeenCalledTimes(1);

    // The settled run clears the request; the next run gets a live stop.
    rerender(buildScreen({ activeRun: completedRun, onCancelDiscovery }));
    expect(screen.queryByRole("button", { name: "Stop search" })).toBeNull();

    rerender(
      buildScreen({
        activeRun: { ...runningRun, id: "run_2" },
        onCancelDiscovery,
      }),
    );
    const nextStop = getStopSearchButton();
    expect(nextStop.hasAttribute("disabled")).toBe(false);
    expect(nextStop.getAttribute("data-pending")).toBeNull();
    fireEvent.click(nextStop);
    expect(onCancelDiscovery).toHaveBeenCalledTimes(2);
  });

  it("renders no stop control when no upstream cancellation handler exists", () => {
    render(buildScreen({ activeRun: runningRun }));

    expect(screen.queryByRole("button", { name: "Stop search" })).toBeNull();
    expect(screen.getByRole("button", { name: "Searching" })).toBeTruthy();
  });
});
