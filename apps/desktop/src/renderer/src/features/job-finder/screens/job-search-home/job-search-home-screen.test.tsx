// @vitest-environment jsdom

import type {
  CampaignNotification,
  JobFinderWorkspaceSnapshot,
  JobSearchCampaign,
} from "@unemployed/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobSearchHomeScreen } from "./job-search-home-screen";

function notification(
  id: string,
  unread = true,
): CampaignNotification {
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
    resumeExportArtifacts: [],
    tailoredAssets: [],
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("JobSearchHomeScreen", () => {
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

  it("switches the active campaign from the dashboard", () => {
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
      screen.getByRole("combobox", { name: "Active campaign" }),
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

    expect(
      screen.getByText(/No campaign notifications yet/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
  });
});
