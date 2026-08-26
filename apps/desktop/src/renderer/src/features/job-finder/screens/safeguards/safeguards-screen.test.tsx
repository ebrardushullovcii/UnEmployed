// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  JobFinderWorkspaceSnapshot,
  SafeguardMutationInput,
} from "@unemployed/contracts";
import { JobFinderIntelligenceSafeguardsSchema } from "@unemployed/contracts";
import { SafeguardsScreen } from "./safeguards-screen";

const now = "2026-08-15T10:00:00.000Z";

function emptySafeguards() {
  return JobFinderIntelligenceSafeguardsSchema.parse({});
}

function signalSafeguards() {
  return JobFinderIntelligenceSafeguardsSchema.parse({
    listingSignals: [
      {
        id: "signal_1",
        jobId: "job_ready",
        signal: "suspicious",
        detail: null,
        detectedAt: now,
        confidence: 0.95,
        provenance: "browser",
        explanation: "Listing shows unusual signs.",
        recoveryGuidance: "Inspect the listing before applying.",
      },
    ],
  });
}

function contradictionSafeguards() {
  return JobFinderIntelligenceSafeguardsSchema.parse({
    contradictoryAnswerDetections: [
      {
        id: "detection_1",
        questionA: "How many years?",
        questionB: "Experience years?",
        answerA: "5",
        answerB: "2",
        contradictionScore: 0.9,
        status: "detected",
        detectedAt: now,
        resolvedAt: null,
        explanation: "Answers conflict.",
        recoveryGuidance: "Ask the user to confirm the correct answer.",
      },
    ],
  });
}

function workspaceWith(
  safeguards: ReturnType<typeof emptySafeguards> = emptySafeguards(),
): JobFinderWorkspaceSnapshot {
  return {
    module: "job-finder",
    generatedAt: now,
    discoveryJobs: [
      {
        id: "job_ready",
        title: "Senior Product Designer",
        company: "Signal Systems",
        location: "Remote",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["discoveryJobs"],
    applicationRecords: [],
    campaigns: [],
    activeCampaignId: null,
    intelligence: {
      safeguards,
    } as unknown as JobFinderWorkspaceSnapshot["intelligence"],
  } as unknown as JobFinderWorkspaceSnapshot;
}

function renderScreen(props: {
  onMutateSafeguards?: (input: SafeguardMutationInput) => Promise<boolean>;
  isPending?: (controlId: string) => boolean;
  actionMessage?: string | null;
  workspace?: JobFinderWorkspaceSnapshot | null;
}) {
  return render(
    <SafeguardsScreen
      actionMessage={props.actionMessage ?? null}
      isPending={props.isPending ?? (() => false)}
      onMutateSafeguards={
        props.onMutateSafeguards ?? (() => Promise.resolve(true))
      }
      workspace={
        props.workspace === undefined ? workspaceWith() : props.workspace
      }
    />,
  );
}

describe("SafeguardsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a loading state while the workspace is unavailable", () => {
    renderScreen({ workspace: null });
    expect(screen.getByText("Loading safeguards…")).toBeTruthy();
  });

  it("shows an empty state when no safeguards exist", () => {
    renderScreen({});
    expect(screen.getByText("No safeguards yet")).toBeTruthy();
    expect(
      screen.getByText(/appear here automatically when the pipeline detects/i),
    ).toBeTruthy();
    expect(screen.getByText(/No active safeguard blockers/i)).toBeTruthy();
  });

  it("hides the search and category filters when there is nothing to filter", () => {
    renderScreen({});

    expect(document.querySelector("[data-safeguard-toolbar]")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Safeguard categories" }),
    ).toBeNull();
  });

  it("keeps the zero-row empty panel compact instead of viewport-tall", () => {
    renderScreen({});

    const emptyPanel = document.querySelector<HTMLElement>(
      "[data-safeguard-empty]",
    );
    expect(emptyPanel).toBeTruthy();
    expect(emptyPanel?.firstElementChild?.className).toContain("min-h-40");
  });

  it("keeps the search field and category filters in a responsive non-clipping toolbar", () => {
    renderScreen({ workspace: workspaceWith(signalSafeguards()) });

    const toolbar = document.querySelector<HTMLElement>(
      "[data-safeguard-toolbar]",
    );
    const categories = document.querySelector<HTMLElement>(
      "[data-safeguard-categories]",
    );

    expect(toolbar?.className).toContain("min-w-0");
    expect(toolbar?.className).toContain(
      "lg:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)]",
    );
    expect(categories?.className).toContain("min-w-0");
    expect(categories?.className).toContain("w-full");
    expect(categories?.className).toContain("flex-wrap");
    expect(
      screen.getByRole("group", { name: "Safeguard categories" }),
    ).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows signals with a dismiss control that calls the typed mutation", async () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({
      listingSignals: [
        {
          id: "signal_1",
          jobId: "job_ready",
          signal: "suspicious",
          detail: null,
          detectedAt: now,
          confidence: 0.95,
          provenance: "browser",
          explanation: "Listing shows unusual signs.",
          recoveryGuidance: "Inspect the listing before applying.",
        },
      ],
    });
    const onMutateSafeguards = vi
      .fn<(input: SafeguardMutationInput) => Promise<boolean>>()
      .mockResolvedValue(true);
    renderScreen({ onMutateSafeguards, workspace: workspaceWith(safeguards) });

    expect(screen.getByText("Listing suspicious")).toBeTruthy();
    expect(screen.getByText(/1 active blocker/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));

    await vi.waitFor(() => {
      expect(onMutateSafeguards).toHaveBeenCalledWith({
        type: "dismiss_safeguard_entry",
        kind: "listing_signal",
        referenceId: "signal_1",
        reason: "rechecked",
        note: "Re-verified the listing.",
      });
    });
  });

  it("keeps contradictory answers visible as advisory with no blockers", () => {
    renderScreen({ workspace: workspaceWith(contradictionSafeguards()) });

    const advisory = document.querySelector(
      '[data-safeguard-kind="contradictions"]',
    );
    expect(advisory?.getAttribute("data-safeguard-blocked")).toBe("false");
    expect(screen.getByText("Advisory")).toBeTruthy();
    expect(screen.getByText(/No active safeguard blockers/i)).toBeTruthy();
  });

  it("shows a conflict row and resolves it through the typed mutation", async () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({
      simultaneousApplicationConflicts: [
        {
          id: "conflict_1",
          applicationRecordId: "application_a",
          conflictingApplicationRecordId: "application_b",
          status: "detected",
          explanation: "Two applications overlapped in time.",
          recoveryGuidance: "Review both applications and keep one.",
        },
      ],
    });
    const onMutateSafeguards = vi
      .fn<(input: SafeguardMutationInput) => Promise<boolean>>()
      .mockResolvedValue(true);
    renderScreen({ onMutateSafeguards, workspace: workspaceWith(safeguards) });

    fireEvent.click(screen.getByRole("button", { name: "Resolve conflict" }));

    await vi.waitFor(() => {
      expect(onMutateSafeguards).toHaveBeenCalledWith({
        type: "resolve_simultaneous_application_conflict",
        conflictId: "conflict_1",
      });
    });
  });

  it("shows a no-match state when the search finds nothing", () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({
      listingSignals: [
        {
          id: "signal_1",
          jobId: "job_ready",
          signal: "closed",
          detail: null,
          detectedAt: now,
          confidence: 0.9,
          provenance: "provider",
          explanation: "Provider reported the listing as closed.",
          recoveryGuidance: "Re-verify the listing before applying.",
        },
      ],
    });
    renderScreen({ workspace: workspaceWith(safeguards) });

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search safeguards" }),
      { target: { value: "zzz-no-match" } },
    );

    expect(screen.getByText("No matching safeguards")).toBeTruthy();
    expect(screen.getByText(/Try a different term/)).toBeTruthy();
  });

  it("announces the active filter and preserves filtering and counts", () => {
    renderScreen({ workspace: workspaceWith(signalSafeguards()) });

    const allFilter = screen.getByRole("button", { name: /^All 1$/ });
    const capsFilter = screen.getByRole("button", {
      name: /^Application limits 0$/,
    });
    const signalsFilter = screen.getByRole("button", {
      name: /^Listing signals 1$/,
    });

    expect(allFilter.getAttribute("aria-pressed")).toBe("true");
    expect(signalsFilter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Listing suspicious")).toBeTruthy();

    fireEvent.click(capsFilter);
    expect(capsFilter.getAttribute("aria-pressed")).toBe("true");
    expect(allFilter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("No matching safeguards")).toBeTruthy();

    fireEvent.click(signalsFilter);
    expect(signalsFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Listing suspicious")).toBeTruthy();
  });

  it("keeps every native filter button in the normal focus order", () => {
    renderScreen({ workspace: workspaceWith(signalSafeguards()) });

    const group = screen.getByRole("group", { name: "Safeguard categories" });
    const filters = Array.from(group.querySelectorAll("button"));

    expect(filters).toHaveLength(8);
    expect(filters.every((filter) => filter.tabIndex === 0)).toBe(true);

    filters[3]!.focus();
    expect(document.activeElement).toBe(filters[3]);
    expect(filters[3]!.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(filters[3]!);
    expect(document.activeElement).toBe(filters[3]);
    expect(filters[3]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("surfaces a mutation failure as an inline error on the row", async () => {
    const safeguards = JobFinderIntelligenceSafeguardsSchema.parse({
      abnormalFailurePauses: [
        {
          id: "pause_1",
          windowStartedAt: "2026-08-01T00:00:00.000Z",
          failuresInWindow: 4,
          sampleSize: 5,
          failureRatePercent: 80,
          failureRateThresholdPercent: 40,
          minimumSample: 5,
          paused: true,
          explanation: "Elevated application failure rate.",
          recoveryGuidance:
            "Inspect the latest failure evidence before resuming.",
        },
      ],
    });
    const onMutateSafeguards = vi
      .fn<(input: SafeguardMutationInput) => Promise<boolean>>()
      .mockResolvedValue(false);
    renderScreen({ onMutateSafeguards, workspace: workspaceWith(safeguards) });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss pause" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /could not be saved/,
      );
    });
  });

  it("does not claim preparation is clear while the daily preparation limit is reached", () => {
    const workspace = workspaceWith();
    (
      workspace as {
        dashboard?: {
          globalDailyApplicationPreparationCapacity: Record<string, unknown>;
        };
      }
    ).dashboard = {
      globalDailyApplicationPreparationCapacity: {
        limit: 20,
        used: 20,
        legacyUncertain: 0,
        remaining: 0,
        localDate: "2026-08-25",
        resetsAt: "2026-08-26T04:00:00.000Z",
      },
    };

    renderScreen({ workspace });

    const status = screen.getByTestId("safeguards-daily-capacity-status");
    expect(status.textContent).toMatch(/20 of 20 used today/i);
    expect(status.textContent).toMatch(/reset at local midnight \(/i);
    expect(status.textContent).not.toMatch(/preparation are clear/i);
    // The positive clear banner is replaced, never shown beside the limit.
    expect(
      screen.queryByText(/Discovery and preparation are clear\./i),
    ).toBeNull();
  });

  it("keeps the clear status when daily capacity remains", () => {
    const workspace = workspaceWith();
    (
      workspace as {
        dashboard?: {
          globalDailyApplicationPreparationCapacity: Record<string, unknown>;
        };
      }
    ).dashboard = {
      globalDailyApplicationPreparationCapacity: {
        limit: 20,
        used: 3,
        legacyUncertain: 0,
        remaining: 17,
        localDate: "2026-08-25",
        resetsAt: "2026-08-26T04:00:00.000Z",
      },
    };

    renderScreen({ workspace });

    expect(
      screen.getByText(/No active safeguard blockers\. Discovery and preparation are clear\./i),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("safeguards-daily-capacity-status"),
    ).toBeNull();
  });
});
