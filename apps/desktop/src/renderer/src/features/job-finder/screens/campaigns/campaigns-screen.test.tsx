// @vitest-environment jsdom

import type {
  JobSearchCampaign,
  SaveJobSearchCampaignInput,
} from "@unemployed/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignsScreen } from "./campaigns-screen";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function campaign(id: string, name: string, mode: "precision" | "scale") {
  return {
    id,
    name,
    description: `${name} purpose`,
    mode,
    status: "active",
    sourceTargetIds: ["source-1"],
    jobIds: [],
    minimumFitScore: 70,
    searchPreferences: {
      targetRoles: ["Software Engineer"],
      jobFamilies: [],
      locations: ["Worldwide remote"],
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
        minimum: 2_000,
        maximum: 4_000,
        interval: "month",
        currency: "EUR",
        currencyStatus: "explicit",
      },
      approvalMode: "manual",
      tailoringMode: "balanced",
      companyBlacklist: [],
      companyWhitelist: [],
      discovery: {
        historyLimit: 5,
        targets: [
          {
            id: "source-1",
            label: "Example jobs",
            startingUrl: "https://example.com/jobs",
            enabled: true,
            adapterKind: "auto",
            customInstructions: null,
            instructionStatus: "missing",
            validatedInstructionId: null,
            draftInstructionId: null,
            lastDebugRunId: null,
            lastVerifiedAt: null,
            staleReason: null,
          },
        ],
      },
    },
    limits: {
      retainedJobTarget: mode === "precision" ? 15 : 1_000,
      analysisConcurrency: 2,
      preparationBatchSize: 5,
      dailyPreparationLimit: 20,
    },
    stopRules: {
      pauseOnLoginRequired: false,
      pauseOnChangedForm: true,
      pauseOnUncertainEligibility: true,
      pauseOnFailureRatePercent: 30,
      failureRateMinimumSample: 5,
    },
    applicationPolicy: {
      resumeStrategy: "job_specific",
      requireReviewBeforePreparation: true,
      requireReviewBeforeExternalWrite: true,
      finalSubmitAuthorized: false,
    },
    schedule: {
      mode: "manual",
      enabled: false,
      daysOfWeek: [],
      localStartTime: null,
      timeZone: null,
      pauseWindows: [],
      runFacts: {
        nextRunAt: null,
        lastRunAt: null,
        lastRunOutcome: null,
        lastRunSummary: null,
        consecutiveFailures: 0,
      },
    },
    progress: {
      jobsFound: 10,
      jobsRetained: 3,
      applicationsPrepared: 1,
      applicationsApplied: 0,
      currentBatchCompleted: 0,
      currentBatchTotal: 0,
      blockedCount: 0,
      remainingQueueSize: 2,
      lastRunAt: null,
      lastUpdatedAt: "2026-08-15T09:00:00.000Z",
    },
    history: [],
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    rules: [],
  } as unknown as JobSearchCampaign;
}

describe("CampaignsScreen", () => {
  it("searches campaigns without changing the active campaign", () => {
    const onSelectCampaign = vi.fn();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={onSelectCampaign}
        pending={false}
      />,
    );
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search campaigns" }),
      {
        target: { value: "broad" },
      },
    );
    expect(screen.queryByText("Remote TypeScript")).toBeNull();
    expect(screen.getByText("Broad engineering")).toBeTruthy();
    expect(onSelectCampaign).not.toHaveBeenCalled();
  });

  it("creates a precision campaign from the current search scope", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => void>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "scale")]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New campaign" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Focused frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save campaign" }));
    const saved = onSaveCampaign.mock.calls[0]?.[0];
    expect(saved?.id).toBeNull();
    expect(saved?.mode).toBe("precision");
    expect(saved?.name).toBe("Focused frontend");
    expect(saved?.applicationPolicy.finalSubmitAuthorized).toBe(false);
  });

  it("opens the rule builder from a campaign card and requests a funnel refresh", () => {
    const onRefreshCampaignRuleFunnel = vi.fn();
    const onToggleCampaignRule = vi.fn();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onRefreshCampaignRuleFunnel={onRefreshCampaignRuleFunnel}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        onToggleCampaignRule={onToggleCampaignRule}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(onRefreshCampaignRuleFunnel).toHaveBeenCalledWith("one");
    // The campaign-scoped builder is reachable from Campaigns.
    expect(
      screen.getByRole("region", { name: "Rules for Remote TypeScript" }),
    ).toBeTruthy();
    // Closing the builder does not mutate rules.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onToggleCampaignRule).not.toHaveBeenCalled();
  });

  it("runs a campaign now from its card without changing the active campaign", () => {
    const onRunCampaignNow = vi.fn();
    const onSelectCampaign = vi.fn();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onRunCampaignNow={onRunCampaignNow}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={onSelectCampaign}
        pending={false}
      />,
    );

    const runNowButtons = screen.getAllByRole("button", { name: "Run now" });
    expect(runNowButtons).toHaveLength(2);
    fireEvent.click(runNowButtons[1]!);
    expect(onRunCampaignNow).toHaveBeenCalledWith("two");
    expect(onSelectCampaign).not.toHaveBeenCalled();
  });

  it("shows truthful next-run and last-run facts from persisted run facts", () => {
    const scheduled = {
      ...campaign("one", "Remote TypeScript", "precision"),
      schedule: {
        mode: "daily",
        enabled: true,
        daysOfWeek: [],
        localStartTime: "09:00",
        timeZone: "UTC",
        pauseWindows: [],
        runFacts: {
          nextRunAt: "2026-08-16T09:00:00.000Z",
          lastRunAt: "2026-08-15T09:00:00.000Z",
          lastRunOutcome: "partial",
          lastRunSummary: "Discovery partially completed: 2 jobs found.",
          consecutiveFailures: 2,
        },
      },
    } as unknown as JobSearchCampaign;
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[scheduled]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    // The card shows the persisted next run instant instead of an estimate.
    expect(screen.getByText(/Next run/)).toBeTruthy();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/partially completed/)).toBeTruthy();
    expect(screen.getByText(/2 consecutive failed runs recorded/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The editor shows the persisted run summary verbatim.
    expect(
      screen.getByText("Discovery partially completed: 2 jobs found."),
    ).toBeTruthy();
  });

  it("renders the latest persisted digest counts and failed sources", () => {
    const withDigest = {
      ...campaign("one", "Remote TypeScript", "precision"),
      latestDigest: {
        id: "digest_run_1",
        campaignId: "one",
        discoveryRunId: "run_1",
        generatedAt: "2026-08-15T09:00:00.000Z",
        counts: {
          new: 3,
          changed: 2,
          reactivated: 1,
          inactive: 4,
          known: 9,
          skipped: 2,
        },
        failedSources: [
          {
            sourceTargetId: "target_ashby",
            reason: "The source stopped responding.",
            failedAt: "2026-08-15T08:55:00.000Z",
            retryable: false,
          },
        ],
        jobIds: ["job_1", "job_2"],
      },
    } as unknown as JobSearchCampaign;
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[withDigest]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByText(/Latest digest/));
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText(/The source stopped responding/)).toBeTruthy();
  });

  it("edits daily schedules, selected-day schedules, and pause windows", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => void>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.click(screen.getByLabelText("Enable schedule"));
    fireEvent.change(screen.getByLabelText("Schedule mode"), {
      target: { value: "selected_days" },
    });
    fireEvent.click(screen.getByLabelText("Mon"));
    fireEvent.click(screen.getByLabelText("Fri"));
    fireEvent.change(screen.getByLabelText("Local start time"), {
      target: { value: "08:30" },
    });
    fireEvent.change(screen.getByLabelText("Time zone"), {
      target: { value: "Europe/Belgrade" },
    });

    // Add a pause window through the editor controls.
    fireEvent.change(screen.getByLabelText("Pause window starts"), {
      target: { value: "2026-08-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Pause window ends"), {
      target: { value: "2026-08-20T12:00" },
    });
    fireEvent.change(screen.getByLabelText("Pause window reason"), {
      target: { value: "Offline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add pause window" }));
    expect(screen.getByText(/Offline/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save campaign" }));
    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    expect(saved?.schedule.mode).toBe("selected_days");
    expect(saved?.schedule.enabled).toBe(true);
    expect(saved?.schedule.daysOfWeek).toEqual(
      expect.arrayContaining([1, 5]),
    );
    expect(saved?.schedule.localStartTime).toBe("08:30");
    expect(saved?.schedule.timeZone).toBe("Europe/Belgrade");
    expect(saved?.schedule.pauseWindows).toHaveLength(1);
    const window = saved?.schedule.pauseWindows[0];
    expect(Date.parse(window?.startsAt ?? "")).toBeLessThan(
      Date.parse(window?.endsAt ?? ""),
    );
    expect(window?.reason).toBe("Offline");
    expect(window?.enabled).toBe(true);
  });

  it("says schedules and stop rules are enforced and keeps final-submit locked", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => void>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Enable a daily schedule so the enforced-runner copy is visible.
    fireEvent.click(screen.getByLabelText("Enable schedule"));
    fireEvent.change(screen.getByLabelText("Schedule mode"), {
      target: { value: "daily" },
    });

    // The stale "saved for planning but not enforced" copy is gone.
    expect(
      screen.queryByText(/does not start work automatically yet/),
    ).toBeNull();
    expect(
      screen.queryByText(/are not automatically enforced yet/),
    ).toBeNull();
    // Truthful enforcement copy is present.
    expect(
      screen.getByText(/runs this campaign automatically when its next run/),
    ).toBeTruthy();
    expect(screen.getByText(/stop rules are enforced/)).toBeTruthy();
    expect(
      screen.getByText(/cannot authorize an external submit/),
    ).toBeTruthy();
  });

  it("keeps pause-window controls keyboard accessible", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const starts = screen.getByLabelText("Pause window starts");
    const ends = screen.getByLabelText("Pause window ends");
    const addButton = screen.getByRole("button", {
      name: "Add pause window",
    });
    // All controls are native form controls reachable by keyboard.
    expect(starts.tagName).toBe("INPUT");
    expect(ends.tagName).toBe("INPUT");
    expect(addButton).toBeTruthy();
    // The add button stays disabled until both window bounds are valid.
    expect((addButton as HTMLButtonElement).disabled).toBe(true);

    // Fill valid bounds, then focus the now-enabled control.
    fireEvent.change(starts, { target: { value: "2026-08-20T10:00" } });
    fireEvent.change(ends, { target: { value: "2026-08-20T12:00" } });
    expect((addButton as HTMLButtonElement).disabled).toBe(false);
    addButton.focus();
    expect(document.activeElement).toBe(addButton);

    // An invalid window (end before start) must not be added.
    fireEvent.change(starts, { target: { value: "2026-08-20T12:00" } });
    fireEvent.change(ends, { target: { value: "2026-08-20T10:00" } });
    fireEvent.click(addButton);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
