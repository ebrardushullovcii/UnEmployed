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
      onMutateSafeguards={props.onMutateSafeguards ?? (async () => true)}
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

    fireEvent.click(
      screen.getByRole("button", { name: "Resolve conflict" }),
    );

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

  it("navigates tabs with arrow keys (keyboard accessibility)", () => {
    renderScreen({});

    const tabs = screen.getAllByRole("tab");
    const signalsTab = tabs.find((tab) => tab.textContent?.includes("Signals"));
    expect(signalsTab).toBeTruthy();

    fireEvent.keyDown(signalsTab!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toMatch(
      /Pauses/,
    );

    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), {
      key: "ArrowLeft",
    });
    expect(screen.getByRole("tab", { selected: true }).textContent).toMatch(
      /Signals/,
    );
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
          recoveryGuidance: "Inspect the latest failure evidence before resuming.",
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
});
