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
    // Home reads enabled targets' stale reasons to decide whether source
    // attention is actually a failure; the default fixture has none.
    searchPreferences: {
      discovery: { targets: [], historyLimit: 5 },
    } as unknown as JobFinderWorkspaceSnapshot["searchPreferences"],
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

/**
 * Home reports the shared discovery count helper's answer, so the fixture
 * carries a real persisted run rather than a hand-written number.
 */
function withLastSearch(
  base: JobFinderWorkspaceSnapshot,
  counts: { retained: number; duplicates: number; keptInPlan?: number },
): JobFinderWorkspaceSnapshot {
  const keptInPlan = counts.keptInPlan ?? counts.retained;
  return {
    ...base,
    campaigns: base.campaigns.map((campaign) => ({
      ...campaign,
      jobIds: Array.from(
        { length: keptInPlan },
        (_unused, index) => `plan_job_${index}`,
      ),
    })),
    recentDiscoveryRuns: [
      {
        id: "run-1",
        state: "completed",
        startedAt: "2026-08-15T09:30:00.000Z",
        targetIds: ["target-1"],
        summary: {
          validJobsFound: counts.retained,
          duplicatesMerged: counts.duplicates,
          targetsPlanned: 1,
          targetsCompleted: 1,
        },
      },
    ],
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
  it("labels catalog rows as review-only when no live source is enabled", () => {
    const catalogWorkspace = {
      ...zeroMetricsWorkspace({
        profileSetupStatus: "completed",
        sources: 0,
      }),
      discoveryJobs: [{ discoveryMethod: "catalog_seed" }],
    } as unknown as JobFinderWorkspaceSnapshot;

    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={catalogWorkspace}
      />,
    );

    expect(
      screen.getByTestId("home-offline-catalog-notice").textContent,
    ).toContain("Offline catalog · review-only.");
    expect(
      screen.getByTestId("home-offline-catalog-notice").textContent,
    ).toContain("do not confirm a live source search");
  });

  it.each([
    ["not_started", "import", "Start setup", null],
    ["in_progress", "targeting", "Continue setup", "your job targets"],
  ] as const)(
    "prioritizes %s profile setup before source guidance",
    (profileSetupStatus, profileSetupStep, actionLabel, stepLabel) => {
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

      expect(screen.getAllByRole("button", { name: actionLabel })).toHaveLength(
        1,
      );
      if (stepLabel) {
        // Only a genuinely resumed setup narrates the step it stopped at.
        expect(
          screen.getAllByText(new RegExp(stepLabel)).length,
        ).toBeGreaterThan(0);
      } else {
        // The heading already says "Set up your profile"; a caption repeating
        // it a third time was removed.
        expect(screen.queryByText("Opens guided setup.")).toBeNull();
        expect(screen.queryByText(/resumes at/)).toBeNull();
      }
      expect(
        screen.queryByText("Set up your job sources to get started"),
      ).toBeNull();
      expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
      fireEvent.click(screen.getAllByRole("button", { name: actionLabel })[0]!);
      expect(onNavigate).toHaveBeenCalledWith("/job-finder/profile/setup");
    },
  );

  it("keeps first-run Home on Set up your profile and restores support modules for returning users", () => {
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

    expect(screen.getAllByRole("button", { name: "Start setup" })).toHaveLength(
      1,
    );
    expect(screen.getByText("Set up your profile")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search now" })).toBeNull();
    // No badge and no orphan line: the user has not met the word "source" yet.
    const sourceStatus = screen.getByTestId("source-health-badge-top");
    expect(sourceStatus.textContent).not.toContain(
      "Sources are chosen during setup.",
    );
    expect(sourceStatus.textContent).not.toContain("No job sources configured");
    expect(sourceStatus.textContent).not.toContain("Finish your profile first");
    // An empty workspace has nothing to search yet.
    expect(
      screen.queryByRole("combobox", {
        name: "Search current plan and workspace",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("combobox", { name: "Active search plan" }),
    ).toBeNull();
    expect(screen.queryByText("Active search plan")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Quick review of new matches" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage search plans" }),
    ).toBeNull();
    expect(screen.queryByText(/in this search plan/)).toBeNull();
    expect(screen.queryByText("Results so far")).toBeNull();
    expect(screen.queryAllByText(/Not enough data yet/)).toHaveLength(0);
    expect(screen.queryByText("Source health")).toBeNull();
    expect(screen.queryByText("Background work")).toBeNull();
    expect(screen.queryByText("Nothing is running right now.")).toBeNull();
    expect(screen.queryByText(/Nothing here yet/)).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Start setup" })[0]!);
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

    // The campaign layer stays hidden until it is earned: one plan is nothing
    // to switch between, and plan management is not a landing-page job.
    expect(
      screen.queryByRole("combobox", { name: "Active search plan" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage search plans" }),
    ).toBeNull();
    // What a returning user actually needs is the way back into the loop.
    expect(screen.getByRole("button", { name: "Search again" })).toBeTruthy();
    // Empty analytics rows and an idle background pane are furniture, not
    // status: Home only shows them when they have something to say.
    expect(screen.queryByText("Results so far")).toBeNull();
    expect(screen.queryAllByText(/Not enough data yet/)).toHaveLength(0);
    expect(screen.queryByText("Background work")).toBeNull();
    // Source health has one owner: the badge beside the title.
    expect(screen.queryByText("Source health")).toBeNull();
    expect(screen.getByTestId("source-health-badge-top").textContent).toContain(
      "healthy",
    );
  });

  it("keeps first-run Home to one action instead of previewing the next screen", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
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

    // A fresh workspace opens guided setup directly, so Home no longer pays a
    // screen to describe what the next screen will describe.
    expect(screen.queryByTestId("home-first-run-outline")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Start setup" })).toHaveLength(
      1,
    );
  });

  it("does not restate the sidebar badges as stat tiles", () => {
    const workspace = zeroMetricsWorkspace({ sources: 2 });
    const withStages = {
      ...workspace,
      dashboard: {
        ...workspace.dashboard,
        jobsFoundToday: 1,
        jobsAwaitingReview: 1,
        applicationsReadyForApproval: 1,
      },
      userActionRequests: [],
    } as unknown as JobFinderWorkspaceSnapshot;

    render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={withStages}
      />,
    );

    // Four columns all reading "1" looked like four outstanding items when one
    // job was moving through stages; the tiles and their apology are gone.
    expect(screen.queryByTestId("home-activity-overlap-note")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Current activity" }),
    ).toBeNull();
    expect(screen.queryByText("Awaiting review")).toBeNull();
    expect(screen.queryByText("Found today")).toBeNull();
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

    expect(
      screen.queryByRole("button", { name: "Pause background work" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Resume background work" }),
    ).toBeNull();
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

    expect(
      screen.getByRole("button", { name: "Pause background work" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Pause background work" }),
    );
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
      screen.getByRole("button", { name: "Resume background work" }),
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
    // An idle returning dashboard no longer spends Home's strongest slot on a
    // rare maintenance control while nothing is running.
    expect(
      screen.queryByRole("button", { name: "Pause background work" }),
    ).toBeNull();
    expect(
      screen.queryByText(/No browser or application work is running/),
    ).toBeNull();
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
    // The heading names the action; the button says where it goes.
    expect(
      screen.getAllByRole("button", { name: "Open job sources" }),
    ).toHaveLength(1);
    expect(screen.queryByText(/#profile-job-sources/)).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Open job sources" })[0]!,
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

    // One owner: the recommended card. The dashed "getting started" panel
    // repeated the same sentence a second time further down the page.
    expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
    expect(document.querySelectorAll(".border-dashed")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "Run your first search" }),
    ).toBeTruthy();
    expect(screen.queryByText(/#profile-job-sources/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Find jobs" }));
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
    // A finished search is a status fact, not a green banner with a second
    // next action above the recommended card.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "See results in Find jobs" }),
    ).toBeNull();
  });

  it("reports a finished search as one status line, not a second next action", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunSucceededFeedback()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={withLastSearch(workspace(), {
          retained: 15,
          duplicates: 35,
        })}
      />,
    );

    expect(screen.getByTestId("home-status-line").textContent).toContain(
      "Search finished",
    );
    expect(screen.getByTestId("home-status-line").textContent).toContain(
      "all on this device",
    );
    // The number comes from the shared discovery count helper, in its
    // vocabulary, so Home cannot claim a volume Find jobs does not report.
    expect(screen.getByTestId("home-status-line").textContent).toContain(
      "15 new jobs saved · 35 duplicates merged",
    );
    expect(
      screen.queryByRole("button", { name: "See results in Find jobs" }),
    ).toBeNull();
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
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
      screen.queryByRole("region", { name: "Current activity" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Find jobs" })).toBeTruthy();
  });

  it("keeps one recommended action and follows it", () => {
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

    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    // Exactly one visual primary: the recommended next action owns it.
    const primaryButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-variant="primary"]'),
    );
    expect(primaryButtons).toHaveLength(1);
    // The returning user's next move is the search loop, not the app's own
    // blocked item — which stays reachable from Notifications and the badges.
    expect(
      screen.getByRole("heading", {
        name: "Review 4 jobs from your last search",
      }),
    ).toBeTruthy();
    expect(primaryButtons[0]?.textContent).toContain("Review jobs");
    fireEvent.click(
      screen.getByRole("button", { name: "Review source health" }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources",
    );
    fireEvent.click(screen.getByRole("button", { name: "Review jobs" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/review-queue");
    // And the loop can always be continued from Home.
    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
  });

  it("runs a repeat search in place when discovery is available", () => {
    const onRunDiscovery = vi.fn();
    const onNavigate = vi.fn();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={onRunDiscovery}
        workspace={workspace()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search again" }));
    expect(onRunDiscovery).toHaveBeenCalledOnce();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("routes back to the results the last search already kept", () => {
    const onNavigate = vi.fn();
    const base = withLastSearch(workspace(), { retained: 15, duplicates: 35 });
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={onNavigate}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        workspace={base}
      />,
    );

    // One sentence, one vocabulary, and no duplicated verb: the shared count
    // label already reads "15 new jobs saved · 35 duplicates merged".
    expect(
      screen.getByText(
        /Your last search: 15 new jobs saved · 35 duplicates merged\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/saved 15 new jobs saved/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Review search results" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/discovery");
  });

  it("never prints a search volume Find jobs does not list", () => {
    // A run can save more listings to the device than the active plan's rules
    // retain. Home printed the larger number beside a link to a screen that
    // shows the smaller one, so the two screens read as a contradiction.
    const base = withLastSearch(workspace(), {
      retained: 50,
      duplicates: 0,
      keptInPlan: 15,
    });
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        workspace={base}
      />,
    );

    expect(
      screen.getByText(
        /Your last search saved 50 new jobs on this device · 15 in your current search plan\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/50 new jobs kept/)).toBeNull();
    // The two numbers are two populations, so they never share one verb.
    expect(screen.queryByText(/kept/)).toBeNull();
  });

  it("shows only non-zero source status states", () => {
    const base = workspace();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        workspace={
          {
            ...base,
            dashboard: {
              ...base.dashboard,
              sourceHealth: {
                healthy: 1,
                needsAttention: 0,
                running: 0,
                total: 1,
              },
            },
          } as unknown as JobFinderWorkspaceSnapshot
        }
      />,
    );

    const badgeRow = screen.getByTestId("source-health-badge-top");
    expect(badgeRow.textContent).toContain("1 healthy");
    expect(badgeRow.textContent).not.toContain("0 need attention");
    expect(badgeRow.textContent).not.toContain("0 running");
  });

  it("gives the workspace search box a panel of its own", () => {
    const base = workspace();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        workspace={
          {
            ...base,
            discoveryJobs: [
              { id: "job-1", title: "Engineer", company: "Acme" },
            ],
          } as unknown as JobFinderWorkspaceSnapshot
        }
      />,
    );

    // The search field used to be the only bordered thing between two cards,
    // so it read as belonging to nothing.
    const panel = screen.getByTestId("home-workspace-search");
    expect(panel.className).toContain("surface-panel-shell");
    expect(panel.className).toContain("border");
  });

  it("uses the persisted activity callback instead of local-only pause state", () => {
    const onPauseActivity = vi.fn();
    const base = workspace();
    render(
      <JobSearchHomeScreen
        activityPending={false}
        onSelectCampaign={vi.fn()}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={onPauseActivity}
        onResumeActivity={vi.fn()}
        workspace={
          {
            ...base,
            dashboard: { ...base.dashboard, backgroundOperationCount: 1 },
          } as unknown as JobFinderWorkspaceSnapshot
        }
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Pause background work" }),
    );
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
    expect(select.classList).toContain("max-w-56");
    expect(select.classList).toContain("min-w-0");
    expect(
      within(select).getByRole("option", { name: longCampaignName })
        .textContent,
    ).toBe(longCampaignName);
  });

  it("styles the active search plan select with canonical field tokens and focus hierarchy", () => {
    const current = workspace();
    const secondCampaign = {
      ...current.campaigns[0],
      id: "campaign-2",
      name: "High-volume search",
    } as JobSearchCampaign;
    const { container } = render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={{
          ...current,
          campaigns: [...current.campaigns, secondCampaign],
        }}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "Active search plan",
    });
    for (const className of [
      "h-9",
      "max-w-56",
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

    expect(screen.getByRole("region", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByText(/1 unread/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(onMarkRead).toHaveBeenCalledWith("n-1");
  });

  it("shows an empty notification center only when nothing is outstanding", () => {
    const { rerender } = render(
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
        workspace={zeroMetricsWorkspace({ historical: true })}
      />,
    );

    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();

    // With work waiting, "Nothing here yet" would contradict the sidebar
    // badges, so the card lists the same outstanding work instead.
    rerender(
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

    expect(screen.queryByText(/Nothing here yet/)).toBeNull();
    const outstanding = screen.getByTestId("notifications-outstanding-work");
    expect(outstanding.textContent).toContain("1 item needs you");
    expect(outstanding.textContent).toContain(
      "3 applications are ready for your approval",
    );
    // Recommended next already owns the shortlisted-review work, so one item
    // no longer advertises itself twice on the same screen.
    expect(outstanding.textContent).not.toContain(
      "4 jobs are waiting for your review",
    );
    // Every Open button says what it opens.
    expect(screen.getByRole("button", { name: "Open Needs you" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Applications" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
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
        campaignNotifications={[]}
        onMarkAllCampaignNotificationsRead={vi.fn()}
        onMarkCampaignNotificationRead={vi.fn()}
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

    // Notifications derive from the same state as the sidebar badges: one
    // grouped decision plus its two represented requests is one item.
    expect(
      screen.getByTestId("notifications-outstanding-work").textContent,
    ).toContain("1 item needs you");
    expect(screen.queryByTestId("home-zero-guidance")).toBeNull();
  });

  it("hides the campaign layer until more than one plan exists", () => {
    const base = workspace();
    const secondCampaign = {
      ...base.campaigns[0],
      id: "campaign-2",
      name: "High-volume search",
    } as JobSearchCampaign;
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={base}
      />,
    );

    // One plan is nothing to switch between, and plan configuration is not a
    // landing-surface job.
    expect(
      screen.queryByRole("combobox", { name: "Active search plan" }),
    ).toBeNull();
    expect(screen.queryByText(/Keeps up to 15 jobs per search/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage search plans" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Quick review of new matches" }),
    ).toBeNull();

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
          campaigns: [...base.campaigns, secondCampaign],
        }}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Active search plan" }),
    ).toBeTruthy();
  });

  it("keeps source attention neutral unless an enabled source is actually failing", () => {
    const base = workspace();
    const attention = {
      ...base,
      dashboard: {
        ...base.dashboard,
        sourceHealth: { healthy: 0, needsAttention: 1, running: 0, total: 1 },
      },
    } as JobFinderWorkspaceSnapshot;
    const { rerender } = render(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={attention}
      />,
    );

    // Never-verified / guidance-only attention: neutral, not red.
    const neutralBadge = within(
      screen.getByTestId("source-health-badge-top"),
    ).getByText(/1 need attention/);
    expect(neutralBadge.className).not.toContain("text-critical");
    expect(neutralBadge.className).toContain("text-foreground-soft");
    expect(
      screen.getByRole("button", { name: "Review source health" }),
    ).toBeTruthy();

    rerender(
      <JobSearchHomeScreen
        activityPending={false}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={
          {
            ...attention,
            searchPreferences: {
              discovery: {
                historyLimit: 5,
                targets: [
                  {
                    id: "target_failing",
                    enabled: true,
                    staleReason: "Starting page URL changed.",
                  },
                  {
                    id: "target_disabled_failing",
                    enabled: false,
                    staleReason: "Verification failed.",
                  },
                ],
              },
            },
          } as unknown as JobFinderWorkspaceSnapshot
        }
      />,
    );

    // A recorded failure on an enabled source is the only red state.
    const failingBadge = within(
      screen.getByTestId("source-health-badge-top"),
    ).getByText(/1 need attention/);
    expect(failingBadge.className).toContain("text-critical");
  });

  it("keeps an unresolved search outcome outside the Recommended-next card", () => {
    render(
      <JobSearchHomeScreen
        activityPending={false}
        discoveryRunFeedback={createDiscoveryRunFailedFeedback({
          detail: "The dedicated browser profile could not start.",
        })}
        onNavigate={vi.fn()}
        onNavigateGlobalEntry={vi.fn()}
        onPauseActivity={vi.fn()}
        onResumeActivity={vi.fn()}
        onRunDiscovery={vi.fn()}
        onSelectCampaign={vi.fn()}
        workspace={workspace()}
      />,
    );

    const feedback = screen.getByTestId("home-discovery-run-feedback");
    const recommendedCard = screen.getByText("Recommended next").closest("div");
    expect(recommendedCard).toBeTruthy();
    expect(recommendedCard?.contains(feedback)).toBe(false);
    // Only an outcome the user must act on earns a callout at all.
    expect(feedback.textContent).toContain("could not start");
  });
});
