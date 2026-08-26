// @vitest-environment jsdom

import type {
  CampaignNotification,
  JobFinderWorkspaceSnapshot,
  JobSearchCampaign,
} from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobSearchHomeScreen } from "./job-search-home-screen";
import {
  createDiscoveryRunFailedFeedback,
  createDiscoveryRunStartedFeedback,
  createDiscoveryRunSucceededFeedback,
} from "../discovery/discovery-run-feedback";

function notification(id: string, unread = true): CampaignNotification {
  return {
    id,
    campaignId: "campaign-1",
    kind: "strong_match",
    title: `Strong match: ${id}`,
    body: null,
    createdAt: "2026-08-15T10:00:00.000Z",
    readAt: unread ? null : "2026-08-15T11:00:00.000Z",
    unread,
    jobId: null,
    sourceTargetId: null,
  };
}

afterEach(cleanup);

function workspace(): JobFinderWorkspaceSnapshot {
  return {
    activeCampaignId: "campaign-1",
    activityControl: { paused: false, pausedAt: null, reason: null },
    activeDiscoveryRun: null,
    activeSourceDebugRun: null,
    applicationRecords: [],
    applyRuns: [],
    campaigns: [
      {
        id: "campaign-1",
        name: "Remote TypeScript",
        mode: "precision",
        status: "active",
        jobIds: [],
        limits: {
          retainedJobTarget: 15,
          analysisConcurrency: 2,
          preparationBatchSize: 5,
          dailyPreparationLimit: 20,
          discoveryRunJobBudget: null,
        },
        searchPreferences: {
          targetRoles: [],
          jobFamilies: [],
          locations: [],
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
            currency: null,
            currencyStatus: "needs_clarification",
          },
          approvalMode: "review_before_submit",
          tailoringMode: "balanced",
          companyBlacklist: [],
          companyWhitelist: [],
          discovery: { targets: [], historyLimit: 5 },
        },
        sourceTargetIds: [],
        minimumFitScore: null,
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
          qualityReviewSampleRatio: 0.2,
          simultaneousApplicationWindowDays: 1,
        },
        rules: [],
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
          jobsFound: 0,
          jobsRetained: 0,
          applicationsPrepared: 0,
          applicationsApplied: 0,
          currentBatchCompleted: 0,
          currentBatchTotal: 0,
          blockedCount: 0,
          remainingQueueSize: 0,
          lastRunAt: null,
          lastUpdatedAt: "2026-08-15T09:00:00.000Z",
        },
        history: [],
        description: "",
        createdAt: "2026-08-15T09:00:00.000Z",
        updatedAt: "2026-08-15T09:00:00.000Z",
        latestDigest: null,
      },
    ],
    dashboard: {
      activeCampaignCount: 1,
      activeCampaignId: "campaign-1",
      applicationsAppliedThisWeek: 2,
      applicationsAppliedToday: 1,
      applicationsReadyForApproval: 3,
      backgroundOperationCount: 0,
      generatedAt: "2026-08-15T09:00:00.000Z",
      interviewRate: null,
      jobsAwaitingReview: 4,
      jobsFoundToday: 8,
      needsYouCount: 1,
      recommendedNextAction: {
        detail: "One application is ready.",
        label: "Review prepared applications",
        route: "/job-finder/applications",
      },
      responseRate: null,
      sourceHealth: { healthy: 5, needsAttention: 1, running: 0, total: 6 },
      upcomingFollowUps: 2,
      upcomingInterviews: 1,
    },
    discoveryJobs: [],
    profileSetupState: {
      status: "completed",
      currentStep: "ready_check",
      completedAt: "2026-08-15T08:00:00.000Z",
      reviewItems: [],
      lastResumedAt: "2026-08-15T08:00:00.000Z",
    },
    resumeExportArtifacts: [],
    tailoredAssets: [],
    userActionRequests: [
      {
        id: "action-1",
        state: "pending",
        kind: "login",
        dedupeKey: "login:action-1",
        revision: 1,
        scope: {
          type: "application",
          runId: "run-1",
          jobId: "job-1",
          applicationRecordId: "record-1",
          resultId: "result-1",
          replayCheckpointId: null,
          source: "target_site",
        },
        verification: {
          type: "page_blocker_absent",
          blockerFingerprint: "blocker_action-1",
          expectedPageFingerprint: null,
        },
        title: "Sign in required",
        summary: "Sign in to continue.",
        createdAt: "2026-08-15T10:00:00.000Z",
        updatedAt: "2026-08-15T10:00:00.000Z",
      } as unknown as JobFinderWorkspaceSnapshot["userActionRequests"][number],
    ],
    intelligence: {
      groupedDecisions: [],
      safeguards: {
        companyApplicationCaps: [],
        simultaneousApplicationConflicts: [],
        listingSignals: [],
        abnormalFailurePauses: [],
        preparedBatchSampleReviews: [],
        contradictoryAnswerDetections: [],
        safeguardDismissals: [],
        updatedAt: null,
      },
      companies: [],
      outcomeEvents: [],
      resumeStrategies: [],
      resumeStrategySelections: [],
      rapidReviewLogs: [],
      outcomeAnalytics: null,
    } as unknown as JobFinderWorkspaceSnapshot["intelligence"],
  } as unknown as JobFinderWorkspaceSnapshot;
}

function zeroMetricsWorkspace(
  options: {
    historical?: boolean;
    sources?: number;
    profileSetupStatus?: "not_started" | "in_progress" | "completed";
    profileSetupStep?:
      | "import"
      | "essentials"
      | "background"
      | "targeting"
      | "narrative"
      | "answers"
      | "ready_check";
  } = {},
): JobFinderWorkspaceSnapshot {
  const current = workspace();
  const sourceCount = options.sources ?? 1;
  return {
    ...current,
    campaigns: current.campaigns.map((campaign) => ({
      ...campaign,
      history: options.historical
        ? [
            {
              id: "history-1",
              campaignId: campaign.id,
              kind: "discovery_run" as const,
              occurredAt: "2026-08-15T09:00:00.000Z",
              summary: "Completed search",
              discoveryRunId: "run-1",
            },
          ]
        : [],
    })),
    dashboard: {
      ...current.dashboard,
      applicationsAppliedThisWeek: 0,
      applicationsAppliedToday: 0,
      applicationsReadyForApproval: 0,
      jobsAwaitingReview: 0,
      jobsFoundToday: 0,
      needsYouCount: 0,
      recommendedNextAction: {
        detail: "Run the active search plan to collect relevant openings.",
        label: "Find jobs",
        route: "/job-finder/discovery",
      },
      sourceHealth: {
        healthy: sourceCount,
        needsAttention: 0,
        running: 0,
        total: sourceCount,
      },
      upcomingFollowUps: 0,
      upcomingInterviews: 0,
    },
    userActionRequests: [],
    intelligence: {
      ...(current.intelligence as unknown as Record<string, unknown>),
      groupedDecisions: [],
    } as unknown as JobFinderWorkspaceSnapshot["intelligence"],
    profileSetupState: {
      ...current.profileSetupState,
      status: options.profileSetupStatus ?? current.profileSetupState.status,
      currentStep:
        options.profileSetupStep ?? current.profileSetupState.currentStep,
      completedAt:
        options.profileSetupStatus && options.profileSetupStatus !== "completed"
          ? null
          : current.profileSetupState.completedAt,
    },
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("JobSearchHomeScreen", () => {
  it.each([
    ["not_started", "import", "resume import"],
    ["in_progress", "targeting", "your job targets"],
  ] as const)(
    "prioritizes %s profile setup before source guidance",
    (profileSetupStatus, profileSetupStep, stepLabel) => {
      const onNavigate = vi.fn();
      render(
        <JobSearchHomeScreen
          activityPending={false}
          onNavigate={onNavigate}
          onNavigateGlobalEntry={vi.fn()}
          onPauseActivity={vi.fn()}
          onResumeActivity={vi.fn()}
          onSelectCampaign={vi.fn()}
          workspace={zeroMetricsWorkspace({
            profileSetupStatus,
            profileSetupStep,
            sources: 0,
          })}
        />,
      );

      expect(
        screen.getAllByRole("button", { name: "Finish your profile" }),
      ).toHaveLength(1);
      expect(screen.getAllByText(new RegExp(stepLabel)).length).toBeGreaterThan(
        0,
      );
      expect(
        screen.queryByText("Set up your job sources to get started"),
      ).toBeNull();
      expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
      fireEvent.click(
        screen.getAllByRole("button", { name: "Finish your profile" })[0]!,
      );
      expect(onNavigate).toHaveBeenCalledWith("/job-finder/profile/setup");
    },
  );

  it("keeps first-run Home on Finish your profile and restores support modules for returning users", () => {
    const onNavigate = vi.fn();
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace({
          profileSetupStatus: "not_started",
          profileSetupStep: "import",
          sources: 0,
        })}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Finish your profile" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Search now" })).toBeNull();
    const sourceStatus = screen.getByTestId("source-health-badge-top");
    expect(sourceStatus.textContent).toContain("No job sources configured");
    expect(sourceStatus.textContent).toContain("Finish your profile first");

    expect(
      screen.queryByRole("combobox", { name: "Active search plan" }),
    ).toBeNull();
    expect(screen.queryByText("Active search plan")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rapid review" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage search plans" }),
    ).toBeNull();
    expect(screen.queryByText(/in this search plan/)).toBeNull();
    expect(screen.queryByText("Results so far")).toBeNull();
    expect(screen.queryAllByText(/Not enough data yet/)).toHaveLength(0);
    expect(screen.queryByText("Source health")).toBeNull();
    expect(screen.queryByText("Background work")).toBeNull();
    expect(screen.queryByText("Nothing is running right now.")).toBeNull();
    expect(screen.queryByText(/No campaign notifications yet/)).toBeNull();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Finish your profile" })[0]!,
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/profile/setup");

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Active search plan" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rapid review" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Manage search plans" }),
    ).toBeTruthy();
    expect(screen.getByText("Results so far")).toBeTruthy();
    expect(screen.getAllByText(/Not enough data yet/)).toHaveLength(2);
    expect(screen.getByText("Source health")).toBeTruthy();
    expect(screen.getByText("Background work")).toBeTruthy();
    expect(screen.getByText(/No campaign notifications yet/)).toBeTruthy();
  });

  it("hides the idle pause control only for idle first runs and keeps operationally relevant surfaces", () => {
    const onPauseActivity = vi.fn();
    const firstRunBase = zeroMetricsWorkspace({
      profileSetupStatus: "not_started",
      profileSetupStep: "import",
      sources: 0,
    });
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={firstRunBase}
      />,
    );

    expect(screen.queryByRole("button", { name: "Pause activity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume activity" })).toBeNull();
    expect(
      screen.queryByText(/No browser or application work is running/),
    ).toBeNull();

    const busyFirstRun = {
      ...firstRunBase,
      dashboard: {
        ...firstRunBase.dashboard,
        backgroundOperationCount: 1,
        responseRate: { percent: 20, numerator: 1, denominator: 5 },
      },
    } as unknown as JobFinderWorkspaceSnapshot;
    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[notification("n-9")]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={busyFirstRun}
      />,
    );

    expect(screen.getByRole("button", { name: "Pause activity" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause activity" }));
    expect(onPauseActivity).toHaveBeenCalledOnce();
    expect(screen.getByText(/1 unread/)).toBeTruthy();
    expect(screen.getByText("Results so far")).toBeTruthy();
    expect(screen.getByText(/20% \(1 of 5\)/)).toBeTruthy();
    expect(screen.getByText("1 operation is running.")).toBeTruthy();

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={{
          ...firstRunBase,
          activityControl: {
            ...firstRunBase.activityControl,
            paused: true,
          },
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Resume activity" }),
    ).toBeTruthy();

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause activity" })).toBeTruthy();
  });

  it("guides a campaign without sources to Profile's job sources", () => {
    const onNavigate = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace({ sources: 0 })}
      />,
    );

    // Recommended next owns the single set-up action; the zero state and the
    // source badge row must not repeat it a third time.
    expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
    expect(document.querySelectorAll(".border-dashed")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "Set up job sources" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Set up job sources" }),
    ).toHaveLength(1);
    expect(screen.queryByText(/#profile-job-sources/)).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Set up job sources" })[0]!,
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources",
    );
  });

  it("guides configured sources to the first search", () => {
    const onNavigate = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace()}
      />,
    );

    expect(
      within(screen.getByTestId("home-zero-guidance")).getByRole("heading", {
        name: "Run your first search",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/#profile-job-sources/)).toBeNull();
    expect(document.querySelectorAll(".border-dashed")).toHaveLength(1);
    expect(
      within(screen.getByTestId("home-zero-guidance")).queryByRole("button"),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Run your first search" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
  });

  it("runs the first search in place and shows pending feedback", () => {
    const onNavigate = vi.fn();
    const onRunDiscovery = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunStartedFeedback()}
        discoveryRunPending
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={onRunDiscovery}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search now" }));
    expect(onRunDiscovery).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Search started");
  });

  it("keeps success visible and gives browser failures a corrective action", () => {
    const onOpenBrowserSession = vi.fn();
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunFailedFeedback({
          detail: "The dedicated browser profile could not start.",
        })}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onOpenBrowserSession={onOpenBrowserSession}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open browser" }));
    expect(onOpenBrowserSession).toHaveBeenCalledOnce();

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunSucceededFeedback()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace({ historical: true })}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("Search finished");
    // The recommended next action already owns Find jobs, so the success
    // follow-up yields instead of duplicating it.
    expect(
      screen.queryByRole("button", { name: "See results in Find jobs" }),
    ).toBeNull();
  });

  it("offers See results in Find jobs after a successful in-place search", () => {
    const onNavigate = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunSucceededFeedback()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "See results in Find jobs" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
  });

  it("keeps zero metrics truthful after a prior search", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace({ historical: true })}
      />,
    );

    expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Current activity" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Find jobs" })).toBeTruthy();
  });

  it("shows truthful metrics and follows the derived next action", () => {
    const onNavigate = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        workspace={workspace()}
      />,
    );

    expect(screen.getByText("Remote TypeScript")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getByText("Applications awaiting approval")).toBeTruthy();
    expect(screen.getByText("Marked applied today")).toBeTruthy();
    expect(screen.getByText("Marked applied this week")).toBeTruthy();
    expect(screen.getAllByText(/Not enough data yet/)).toHaveLength(2);
    // Exactly one visual primary: the recommended next action owns it.
    const primaryButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-variant="primary"]'),
    );
    expect(primaryButtons).toHaveLength(1);
    expect(primaryButtons[0]?.textContent).toContain(
      "Review prepared applications",
    );
    expect(
      screen
        .getByRole("button", { name: "Rapid review" })
        .getAttribute("data-variant"),
    ).toBe("secondary");
    fireEvent.click(
      screen.getByRole("button", { name: "Review source health" }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review prepared applications" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/applications");
  });

  it("hides the secondary activity row when every value is zero", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={zeroMetricsWorkspace({ historical: true })}
      />,
    );

    expect(screen.getByText("Found today")).toBeTruthy();
    expect(screen.queryByText("Marked applied today")).toBeNull();
    expect(screen.queryByText("Upcoming interviews")).toBeNull();
  });

  it("uses the persisted activity callback instead of local-only pause state", () => {
    const onPauseActivity = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        workspace={workspace()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause activity" }));
    expect(onPauseActivity).toHaveBeenCalledOnce();
  });

  it("switches the active search plan from the dashboard", () => {
    const onSelectCampaign = vi.fn();
    const current = workspace();
    const secondCampaign = {
      ...current.campaigns[0],
      id: "campaign-2",
      name: "High-volume search",
    } as JobSearchCampaign;
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={onSelectCampaign}
        workspace={{
          ...current,
          campaigns: [...current.campaigns, secondCampaign],
        }}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "Active search plan" }),
      {
        target: { value: "campaign-2" },
      },
    );
    expect(onSelectCampaign).toHaveBeenCalledWith("campaign-2");
  });

  it("allows the active search plan select to shrink with long option labels", () => {
    const current = workspace();
    const longCampaignName =
      "Staff and principal TypeScript platform roles across remote-first European product organizations";
    const longCampaign = {
      ...current.campaigns[0],
      id: "campaign-long",
      name: longCampaignName,
    } as JobSearchCampaign;
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={{
          ...current,
          campaigns: [...current.campaigns, longCampaign],
        }}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Active search plan",
    });
    expect(select.classList).toContain("w-full");
    expect(select.classList).toContain("min-w-0");
    expect(
      within(select).getByRole("option", { name: longCampaignName })
        .textContent,
    ).toBe(longCampaignName);
  });

  it("styles the active search plan select with canonical field tokens and focus hierarchy", () => {
    const { container } = render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Active search plan",
    });
    for (const className of [
      "h-10",
      "w-full",
      "min-w-0",
      "rounded-(--radius-field)",
      "border-(--field-border)",
      "bg-(--field)",
      "outline-none",
      "focus-visible:border-(--field-focus-border)",
      "focus-visible:bg-(--field-strong)",
      "focus-visible:shadow-[var(--field-focus-shadow)]",
    ]) {
      expect(select.classList.contains(className)).toBe(true);
    }
    expect(select.className).not.toContain("border-input");
    expect(select.className).not.toContain("bg-background");
    expect(container.innerHTML).not.toContain("border-input");
  });

  it("surfaces the in-app notification center with the unread count", () => {
    const onMarkRead = vi.fn();
    const onMarkAllRead = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[
          notification("n-1"),
          notification("n-2", false),
        ]}
        onMarkAllCampaignNotificationsRead={onMarkAllRead}
        onMarkCampaignNotificationRead={onMarkRead}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Campaign notifications" }),
    ).toBeTruthy();
    expect(screen.getByText(/1 unread/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(onMarkRead).toHaveBeenCalledWith("n-1");
  });

  it("shows an empty notification center without inventing counts", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    expect(screen.getByText(/No campaign notifications yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
  });

  it("counts Needs you with grouped-decision parity, not raw dashboard", () => {
    const base = workspace();
    const requestA = {
      id: "action-a",
      state: "pending",
      kind: "manual_answer",
      dedupeKey: "manual:action-a",
      revision: 1,
      scope: {
        type: "application",
        runId: "run-1",
        jobId: "job-a",
        applicationRecordId: "record-a",
        resultId: "result-a",
        replayCheckpointId: null,
        source: "target_site",
      },
      verification: {
        type: "page_blocker_absent",
        blockerFingerprint: "blocker_action-a",
        expectedPageFingerprint: null,
      },
      title: "Answer required",
      summary: "Provide answer.",
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T10:00:00.000Z",
    } as unknown as JobFinderWorkspaceSnapshot["userActionRequests"][number];
    const requestB = {
      ...requestA,
      id: "action-b",
      dedupeKey: "manual:action-b",
      scope: {
        ...requestA.scope,
        jobId: "job-b",
        applicationRecordId: "record-b",
        resultId: "result-b",
      },
      verification: {
        ...requestA.verification,
        blockerFingerprint: "blocker_action-b",
      },
    } as unknown as JobFinderWorkspaceSnapshot["userActionRequests"][number];
    const groupedDecision = {
      id: "decision-1",
      groupKey: "group-1",
      approval: "pending",
      lineage: [{ requestId: "action-a" }, { requestId: "action-b" }],
    } as unknown as JobFinderWorkspaceSnapshot["intelligence"]["groupedDecisions"][number];
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={
          {
            ...base,
            dashboard: { ...base.dashboard, needsYouCount: 2 },
            userActionRequests: [requestA, requestB],
            intelligence: {
              ...(base.intelligence as unknown as Record<string, unknown>),
              groupedDecisions: [groupedDecision],
            },
          } as unknown as JobFinderWorkspaceSnapshot
        }
      />,
    );

    const needsYouValue =
      screen.getByText("Needs you").nextElementSibling?.textContent ?? "";
    expect(needsYouValue.trim()).toBe("1");
    expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Current activity" }),
    ).toBeTruthy();
  });

  it("shows truthful search plan volume and switch disclosure", () => {
    const base = workspace();
    const primaryCampaign = base.campaigns[0];
    if (!primaryCampaign) {
      throw new Error(
        "Expected the Home fixture to include its primary campaign.",
      );
    }
    const scaleCampaign = {
      ...primaryCampaign,
      id: "campaign-scale",
      name: "High-volume scale",
      mode: "scale" as const,
      limits: {
        ...primaryCampaign.limits,
        retainedJobTarget: 1000,
      },
    } as JobSearchCampaign;
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={{
          ...base,
          activeCampaignId: "campaign-1",
          campaigns: [base.campaigns[0] as JobSearchCampaign, scaleCampaign],
        }}
      />,
    );

    expect(
      screen.getByText("Precision — a smaller discovery pool · 15 retained"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Search plans are optional — the default plan is enough to start. Switching updates Home, Find jobs, Shortlisted, and Applications to that plan's jobs and progress.",
      ),
    ).toBeTruthy();

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={{
          ...base,
          activeCampaignId: "campaign-scale",
          campaigns: [base.campaigns[0] as JobSearchCampaign, scaleCampaign],
        }}
      />,
    );

    expect(
      screen.getByText("Scale — a larger discovery pool · 1000 retained"),
    ).toBeTruthy();
  });
});
