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

    expect(
      screen.getByText("Set up your job sources to get started"),
    ).toBeTruthy();
    expect(screen.queryByText(/#profile-job-sources/)).toBeNull();
    expect(document.querySelectorAll(".border-dashed")).toHaveLength(1);
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
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
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
    expect(screen.getByText("Find jobs")).toBeTruthy();
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
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.getAllByText(/Not enough data yet/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/applications");
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
});
