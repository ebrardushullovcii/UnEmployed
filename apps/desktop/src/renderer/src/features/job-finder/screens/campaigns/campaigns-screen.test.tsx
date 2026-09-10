// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  JobSearchCampaign,
  SaveJobSearchCampaignInput,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetJobFinderOverlaysForTests } from "../../lib/job-finder-overlay-ownership";
import { CampaignsScreen } from "./campaigns-screen";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetJobFinderOverlaysForTests();
  // Every production campaigns flow must resolve destructive decisions
  // in-app; the native confirm stays uncalled for the whole suite.
  expect(confirmNeverSpy).not.toHaveBeenCalled();
});

const confirmNeverSpy = vi
  .spyOn(window, "confirm")
  .mockImplementation(() => false);

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
  it("shows onboarding when no search plans exist yet", () => {
    render(
      <CampaignsScreen
        activeCampaignId="missing"
        campaigns={[]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No search plans yet" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create your first search plan" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));

    expect(
      screen.getByRole("heading", { name: "Create search plan" }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("New search plan")).toBeTruthy();
  });

  it("keeps no-match copy for a real persisted query even with no plans", () => {
    window.localStorage.setItem(
      "unemployed.job-finder.collection.campaigns.v1",
      JSON.stringify({
        density: "comfortable",
        query: "backend",
        savedViews: [],
      }),
    );

    render(
      <CampaignsScreen
        activeCampaignId="missing"
        campaigns={[]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent === "No search plans match “backend”",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "No search plans yet" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });

  it("searches plans without changing the active plan", () => {
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
    fireEvent.change(screen.getByRole("searchbox", { name: "Search plans" }), {
      target: { value: "broad" },
    });
    expect(screen.queryByText("Remote TypeScript")).toBeNull();
    expect(screen.getByText("Broad engineering")).toBeTruthy();
    expect(onSelectCampaign).not.toHaveBeenCalled();
  });

  it("explains that plans are optional and discovery-only", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Search plans" })).toBeTruthy();
    expect(screen.getByText(/Search plans are optional\./)).toBeTruthy();
    // Plain language, not product vocabulary: a job seeker should not have
    // to learn "precision" and "scale" to pick one.
    expect(
      screen.getByText("fewer jobs each run, chosen for a closer match."),
    ).toBeTruthy();
    expect(
      screen.getByText("more jobs each run, keeping more of them for review."),
    ).toBeTruthy();
    expect(screen.queryByText(/Prepare only/)).toBeNull();
    expect(screen.queryByText(/application/)).toBeNull();
  });

  it("explains the selected discovery volume", () => {
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
    expect(
      screen.getByText(/Fewer jobs each run, chosen for a closer match/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How many jobs each search keeps"), {
      target: { value: "scale" },
    });
    expect(
      screen.getByText(/More jobs each run, keeping more of them for review/),
    ).toBeTruthy();
  });

  it("hides legacy application policy and preserves it when discovery volume changes", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    const existing = campaign("one", "Remote TypeScript", "precision");
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[existing]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText("Preparation batch")).toBeNull();
    expect(screen.queryByText("Daily preparation limit")).toBeNull();
    expect(screen.queryByText("Resume policy")).toBeNull();
    expect(
      screen.queryByText(
        "Require review before preparing application material",
      ),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("How many jobs each search keeps"), {
      target: { value: "scale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));

    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    expect(saved?.limits.retainedJobTarget).toBe(1_000);
    expect(saved?.limits.preparationBatchSize).toBe(5);
    expect(saved?.limits.dailyPreparationLimit).toBe(20);
    expect(saved?.stopRules).toEqual(existing.stopRules);
    expect(saved?.applicationPolicy).toEqual(existing.applicationPolicy);
  });

  it("creates a precision search plan from the current search scope", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "scale")]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Focused frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));
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

    const rulesButton = screen.getByRole("button", { name: "Rules" });
    rulesButton.focus();
    fireEvent.click(rulesButton);
    expect(onRefreshCampaignRuleFunnel).toHaveBeenCalledWith("one");
    // The campaign-scoped builder is reachable from Campaigns.
    expect(
      screen.getByRole("region", { name: "Rules for Remote TypeScript" }),
    ).toBeTruthy();
    // Closing the builder does not mutate rules.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onToggleCampaignRule).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rulesButton);
  });

  it("restores focus to the Rules trigger when Escape closes the builder", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onRefreshCampaignRuleFunnel={vi.fn()}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    const rulesButton = screen.getByRole("button", { name: "Rules" });
    rulesButton.focus();
    fireEvent.click(rulesButton);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(document.activeElement).toBe(rulesButton);
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

  it("marks only the active plan with a filled Current badge", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    const badges = screen.getAllByText("Current");
    expect(badges).toHaveLength(1);
    expect(badges[0]?.className).toContain("bg-primary");
    expect(badges[0]?.className).toContain("text-primary-foreground");
    expect(badges[0]?.className).not.toContain("text-accent");
  });

  it("wraps long campaign titles while exposing the complete name", () => {
    const longName = "CampaignNameWithoutAnyWordBreaksAtAll";
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", longName, "precision")]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    const title = screen.getByRole("heading", { name: longName });
    expect(title.className).toContain("min-w-0");
    expect(title.className).toContain("break-words");
    expect(title.getAttribute("title")).toBe(longName);
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
    // Minute precision, no seconds: the same instant is not printed twice
    // as a machine-shaped locale string.
    expect(
      screen.getAllByText(/\d{1,2}:\d{2}\s?(AM|PM|am|pm)?/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/:\d{2}:\d{2}/)).toBeNull();
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

    const digest = screen.getByText("What the last run found")
      .parentElement as HTMLElement;
    fireEvent.click(screen.getByText("What the last run found"));
    expect(within(digest).getByText("3")).toBeTruthy();
    expect(within(digest).getByText("9")).toBeTruthy();
    expect(within(digest).getByText("4")).toBeTruthy();
    expect(screen.getByText(/The source stopped responding/)).toBeTruthy();
  });

  it("edits daily schedules, selected-day schedules, and pause windows", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
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
    fireEvent.change(screen.getByLabelText("Run in this time zone"), {
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
    expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));
    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    expect(saved?.schedule.mode).toBe("selected_days");
    expect(saved?.schedule.enabled).toBe(true);
    expect(saved?.schedule.daysOfWeek).toEqual(expect.arrayContaining([1, 5]));
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

  it("says schedules and existing stop rules are enforced", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
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
    expect(screen.queryByText(/are not automatically enforced yet/)).toBeNull();
    // Truthful enforcement copy is present.
    expect(
      screen.getByText(/runs this search plan automatically when its next run/),
    ).toBeTruthy();
    expect(screen.getByText(/stop rules are enforced/)).toBeTruthy();
    expect(
      screen.queryByText(/cannot authorize an external submit/),
    ).toBeNull();
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
    expect(screen.getByRole("alert").textContent).toContain(
      "Pause window end must be later than its start.",
    );
    expect(starts.getAttribute("aria-invalid")).toBe("true");
    expect(ends.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(addButton);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("archives the current plan and reports success through the boolean save path", async () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(true);
    const onSelectCampaign = vi.fn();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={onSelectCampaign}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "archived" },
    });
    expect(
      screen.getByText(/one of them becomes your current plan automatically/),
    ).toBeTruthy();

    const saveButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Save search plan",
    });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    expect(saved?.id).toBe("one");
    expect(saved?.status).toBe("archived");
    // The backend performs the active-plan switch; the screen never selects.
    expect(onSelectCampaign).not.toHaveBeenCalled();
    expect(await screen.findByText("Search plan archived.")).toBeTruthy();
  });

  it("shows the inline archive error when saving the current plan fails", async () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(false);
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
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "archived" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Archiving failed");
    expect(onSaveCampaign).toHaveBeenCalledTimes(1);
  });

  it("archives a non-current plan through the editor status", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Broad engineering",
    );
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "archived" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    const saveButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Save search plan",
    });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    expect(saved?.id).toBe("two");
    expect(saved?.status).toBe("archived");
  });

  it("binds the editor to the selected plan when switching between plans", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Remote TypeScript",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Broad engineering",
    );
  });

  it("asks through the app-owned dialog before a dirty switch to New", () => {
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
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dirty draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Discard unsaved search-plan changes?",
    });
    expect(dialog.textContent).toContain("cannot be undone");
    expect(confirmNeverSpy).not.toHaveBeenCalled();
    // Focus moves into the dialog; staying owns the first (initially
    // focused) tab position as the safe default.
    expect(document.activeElement).toBe(dialog);
    expect(dialog.querySelector("button")?.textContent).toBe("Keep editing");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Dirty draft",
    );

    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Discard changes",
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Create search plan" }),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "New search plan",
    );
  });

  it("keeps the open editor when discarding unsaved changes is declined", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dirty draft" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);

    // The dialog names the plan the editor would switch to.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Broad engineering");
    expect(confirmNeverSpy).not.toHaveBeenCalled();

    // The backdrop resolves to staying, keeping the dirty draft intact.
    fireEvent.click(dialog.parentElement!);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Dirty draft",
    );
  });

  it("warns before discarding unsaved changes when cancelling the editor", () => {
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
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dirty draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Discard unsaved search-plan changes?",
    });
    expect(dialog.textContent).toContain("still has edits that were not saved");
    expect(confirmNeverSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Edit search plan" }),
    ).toBeTruthy();

    // Staying keeps the dirty editor open.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Edit search plan" }),
    ).toBeTruthy();

    // Explicit discard closes the editor exactly once.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Discard changes",
      }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Edit search plan" }),
    ).toBeNull();
  });

  it("confirms a created plan without switching the active plan until asked", async () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(true);
    const onSelectCampaign = vi.fn();
    const view = render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={onSelectCampaign}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Focused frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));

    expect(
      await screen.findByText(/Search plan "Focused frontend" created\./),
    ).toBeTruthy();
    expect(onSelectCampaign).not.toHaveBeenCalled();

    view.rerender(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Focused frontend", "precision"),
        ]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={onSelectCampaign}
        pending={false}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use it in Find jobs" }),
    );
    expect(onSelectCampaign).toHaveBeenCalledWith("two");
    expect(screen.queryByText(/created\./)).toBeNull();
  });

  it("keeps archived plans out of switch-active controls and tags them", () => {
    const archivedPlan = {
      ...campaign("three", "Old broad", "scale"),
      status: "archived",
    } as unknown as JobSearchCampaign;
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
          archivedPlan,
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Make current" }),
    ).toHaveLength(1);
    const archivedArticle = screen.getByText("Old broad").closest("article");
    expect(archivedArticle).toBeTruthy();
    expect(archivedArticle?.className).toContain("opacity-60");
    expect(
      within(archivedArticle!).queryByRole("button", {
        name: "Make current",
      }),
    ).toBeNull();
    expect(within(archivedArticle!).getByText("Archived")).toBeTruthy();
  });

  it("reports successful saves through a status message", async () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(true);
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
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Renamed plan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));

    expect(
      await screen.findByText("Search plan saved. Your next search uses it."),
    ).toBeTruthy();
  });

  it("guards Escape like cancel while the editor has unsaved changes", () => {
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
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Dirty draft" },
    });
    // The form-level Escape opens the app-owned confirmation.
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    expect(confirmNeverSpy).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", {
        name: "Discard unsaved search-plan changes?",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Edit search plan" }),
    ).toBeTruthy();

    // With the dialog open, Escape is addressed to it and resolves to
    // staying, keeping the dirty editor intact.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Edit search plan" }),
    ).toBeTruthy();

    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Discard changes",
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Edit search plan" }),
    ).toBeNull();
  });

  it("closes a clean editor on Escape without asking", () => {
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
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(confirmNeverSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Edit search plan" }),
    ).toBeNull();
  });

  it("offers no delete action until an onDeleteCampaign handler is provided", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Delete plan" })).toBeNull();
  });

  it("deletes a non-current plan only after confirmation", async () => {
    const onDeleteCampaign = vi.fn<(campaignId: string) => Promise<boolean>>();
    onDeleteCampaign.mockResolvedValue(true);
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onDeleteCampaign={onDeleteCampaign}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[1]!);
    const region = screen.getByRole("group", {
      name: "Confirm deleting Broad engineering",
    });
    expect(within(region).getByText(/Permanently delete/)).toBeTruthy();

    fireEvent.click(within(region).getByRole("button", { name: "Cancel" }));
    expect(onDeleteCampaign).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("group", {
        name: "Confirm deleting Broad engineering",
      }),
    ).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[1]!);
    fireEvent.click(
      within(
        screen.getByRole("group", {
          name: "Confirm deleting Broad engineering",
        }),
      ).getByRole("button", { name: "Delete plan" }),
    );
    await waitFor(() => expect(onDeleteCampaign).toHaveBeenCalledWith("two"));
    expect(
      screen.queryByRole("group", {
        name: "Confirm deleting Broad engineering",
      }),
    ).toBeNull();
  });

  it("explains automatic handoff when deleting the current plan with alternatives", () => {
    const onDeleteCampaign = vi.fn<(campaignId: string) => Promise<boolean>>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onDeleteCampaign={onDeleteCampaign}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[0]!);
    const region = screen.getByRole("group", {
      name: "Confirm deleting Remote TypeScript",
    });
    expect(
      within(region).getByText(
        /switches automatically to another non-archived plan/,
      ),
    ).toBeTruthy();
  });

  it("requires an informed confirmation when no other usable plan exists", () => {
    const onDeleteCampaign = vi.fn<(campaignId: string) => Promise<boolean>>();
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onDeleteCampaign={onDeleteCampaign}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[0]!);
    const region = screen.getByRole("group", {
      name: "Confirm deleting Remote TypeScript",
    });
    expect(
      within(region).getByText(/no other non-archived plan exists/),
    ).toBeTruthy();
  });

  it("reports failed deletion inline and keeps the confirmation open", async () => {
    const onDeleteCampaign = vi.fn<(campaignId: string) => Promise<boolean>>();
    onDeleteCampaign.mockResolvedValue(false);
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onDeleteCampaign={onDeleteCampaign}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete plan" })[1]!);
    fireEvent.click(
      within(
        screen.getByRole("group", {
          name: "Confirm deleting Broad engineering",
        }),
      ).getByRole("button", { name: "Delete plan" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("failed");
    expect(
      screen.getByRole("group", {
        name: "Confirm deleting Broad engineering",
      }),
    ).toBeTruthy();
  });

  it("keeps the volume guide collapsed by default on returning visits", () => {
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    const guide = screen
      .getByText(/Search plans are optional\./)
      .closest("details");
    expect(guide).toBeTruthy();
    expect(guide?.hasAttribute("open")).toBe(false);
    // The mode explanations stay reachable behind one toggle.
    expect(screen.getByText("How much a plan searches")).toBeTruthy();
    // Collapsed content remains available for assistive tech queries.
    expect(
      screen.getByText("fewer jobs each run, chosen for a closer match."),
    ).toBeTruthy();
  });

  it("offers no collection toolbar for a single plan", () => {
    const view = render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    // Search field, density switch, saved views and "1 result" is the full
    // collection toolbar for one card.
    expect(screen.queryByRole("group", { name: "List density" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Saved views/u })).toBeNull();
    expect(
      screen.queryByPlaceholderText(/Search a plan by name or status/u),
    ).toBeNull();

    view.rerender(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    // With something to search, the search field returns — the density
    // switch and named views do not.
    expect(
      screen.getByPlaceholderText("Search a plan by name or status"),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "List density" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Saved views/u })).toBeNull();
  });

  it("spans a lone plan across the full row instead of a dead half column", () => {
    const view = render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[campaign("one", "Remote TypeScript", "precision")]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    const grid = screen
      .getByText("Remote TypeScript")
      .closest("article")?.parentElement;
    expect(grid?.className).not.toContain("xl:grid-cols-2");

    view.rerender(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[
          campaign("one", "Remote TypeScript", "precision"),
          campaign("two", "Broad engineering", "scale"),
        ]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    expect(grid?.className).toContain("xl:grid-cols-2");
  });

  it("styles every editor field with canonical tokens, focus hierarchy, and preserved geometry", () => {
    const { container } = render(
      <CampaignsScreen
        activeCampaignId="missing"
        campaigns={[]}
        onSaveCampaign={vi.fn()}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New search plan" }));

    const selects = Array.from(container.querySelectorAll("select"));
    const textareas = Array.from(container.querySelectorAll("textarea"));
    // Volume, Status, Pay interval (inside the closed compensation section),
    // and Schedule mode.
    expect(selects).toHaveLength(4);
    // Plan purpose.
    expect(textareas).toHaveLength(1);

    for (const control of [...selects, ...textareas]) {
      for (const className of [
        "border-(--field-border)",
        "bg-(--field)",
        "outline-none",
        "focus-visible:border-(--field-focus-border)",
        "focus-visible:bg-(--field-strong)",
        "focus-visible:shadow-[var(--field-focus-shadow)]",
      ]) {
        expect(control.className).toContain(className);
      }
      expect(control.className).not.toContain("border-input");
      expect(control.className).not.toContain("--surface-panel-raised");
      expect(control.className).not.toContain("focus-visible:ring");
    }
    // Native selects share the Input's 44px height and padding so a select
    // beside a text field sits on the same baseline.
    for (const select of selects) {
      expect(select.className).toContain("h-11");
      expect(select.className).toContain("rounded-(--radius-field)");
      expect(select.className).toContain("px-3.5");
    }
    expect(textareas[0]?.className).toContain("min-h-20");

    // Protected selection controls stay bare native checkboxes without field
    // styling.
    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);
    for (const checkbox of checkboxes) {
      expect(checkbox.className).not.toContain("field-");
      expect(checkbox.className).not.toContain("focus-visible");
      expect(checkbox.getAttribute("type")).toBe("checkbox");
    }
  });

  function planWithTwoTargets(
    base: JobSearchCampaign,
    options: {
      firstEnabled: boolean;
      secondEnabled: boolean;
      sourceTargetIds?: string[];
    },
  ): JobSearchCampaign {
    const template = base.searchPreferences.discovery.targets[0];
    if (!template) throw new Error("Expected a seeded target.");
    return {
      ...base,
      sourceTargetIds: options.sourceTargetIds ?? [],
      searchPreferences: {
        ...base.searchPreferences,
        discovery: {
          ...base.searchPreferences.discovery,
          targets: [
            {
              ...template,
              id: "source-1",
              label: "Example jobs",
              enabled: options.firstEnabled,
            },
            {
              ...template,
              id: "source-2",
              label: "Second careers",
              enabled: options.secondEnabled,
            },
          ],
        },
      },
    } as unknown as JobSearchCampaign;
  }

  it("persists Included sources toggles into the plan's enabled targets and derives the saved source ids", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(true);
    const existing = planWithTwoTargets(
      campaign("one", "Remote TypeScript", "precision"),
      { firstEnabled: true, secondEnabled: false },
    );
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[existing]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const first = screen.getByLabelText<HTMLInputElement>("Example jobs");
    const second = screen.getByLabelText<HTMLInputElement>("Second careers");
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    fireEvent.click(first);
    fireEvent.click(second);

    expect(
      screen.getByText(
        (content, element) =>
          element?.tagName === "P" && /^Uses 1 sources/.test(content),
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));

    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    if (!saved) throw new Error("Expected a save.");
    expect(
      saved.searchPreferences.discovery.targets.map((target) => target.enabled),
    ).toEqual([false, true]);
    // The ids sent for save are derived from `target.enabled`.
    expect(saved.sourceTargetIds).toEqual(["source-2"]);
  });

  it("restores Included sources checkboxes from enabled targets after save and reopen", () => {
    const onSaveCampaign =
      vi.fn<(campaign: SaveJobSearchCampaignInput) => Promise<boolean>>();
    onSaveCampaign.mockResolvedValue(true);
    // The stored enabled flags are the truth even when the legacy
    // `sourceTargetIds` projection disagrees with them.
    const existing = planWithTwoTargets(
      campaign("one", "Remote TypeScript", "precision"),
      {
        firstEnabled: false,
        secondEnabled: true,
        sourceTargetIds: ["source-1"],
      },
    );
    const view = render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[existing]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByLabelText<HTMLInputElement>("Example jobs").checked,
    ).toBe(false);
    expect(
      screen.getByLabelText<HTMLInputElement>("Second careers").checked,
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("Second careers"));
    fireEvent.click(screen.getByRole("button", { name: "Save search plan" }));
    const saved = onSaveCampaign.mock.calls.at(-1)?.[0];
    if (!saved) throw new Error("Expected a save.");

    view.unmount();
    const persisted = {
      ...existing,
      sourceTargetIds: saved.sourceTargetIds,
      searchPreferences: saved.searchPreferences,
    } as unknown as JobSearchCampaign;
    render(
      <CampaignsScreen
        activeCampaignId="one"
        campaigns={[persisted]}
        onSaveCampaign={onSaveCampaign}
        onSelectCampaign={vi.fn()}
        pending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByLabelText<HTMLInputElement>("Example jobs").checked,
    ).toBe(false);
    expect(
      screen.getByLabelText<HTMLInputElement>("Second careers").checked,
    ).toBe(false);
  });
});
