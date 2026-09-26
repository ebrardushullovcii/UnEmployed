// @vitest-environment jsdom

import type {
  CampaignNotification,
  JobFinderWorkspaceSnapshot,
  ReviewQueueItem,
} from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JobSearchHomeScreen,
  listCurrentUnreadNotifications,
} from "./job-search-home-screen";

afterEach(cleanup);

function workspace(): JobFinderWorkspaceSnapshot {
  return {
    activeCampaignId: "campaign-1",
    activityControl: { paused: false, pausedAt: null, reason: null },
    activeDiscoveryRun: null,
    activeSourceDebugRun: null,
    applicationRecords: [],
    applyJobResults: [],
    applyRuns: [],
    campaignNotifications: [],
    campaigns: [
      {
        id: "campaign-1",
        name: "Remote TypeScript",
        status: "active",
        jobIds: [],
        history: [],
      },
    ],
    dashboard: {
      activeCampaignCount: 1,
      activeCampaignId: "campaign-1",
      applicationsAppliedThisWeek: 0,
      applicationsAppliedToday: 0,
      applicationsReadyForApproval: 0,
      backgroundOperationCount: 0,
      generatedAt: "2026-08-15T09:00:00.000Z",
      interviewRate: null,
      jobsAwaitingReview: 0,
      jobsFoundToday: 0,
      needsYouCount: 0,
      recommendedNextAction: {
        detail: "Run the active search plan to collect relevant openings.",
        label: "Find jobs",
        route: "/job-finder/discovery",
      },
      responseRate: null,
      sourceHealth: { healthy: 1, needsAttention: 0, running: 0, total: 1 },
      upcomingFollowUps: 0,
      upcomingInterviews: 0,
    },
    discoveryJobs: [],
    recentDiscoveryRuns: [],
    recentSourceDebugRuns: [],
    reviewQueue: [],
    searchPreferences: {
      discovery: {
        targets: [
          {
            id: "target-1",
            label: "Replica board",
            url: "http://127.0.0.1/",
            enabled: true,
          },
        ],
        historyLimit: 5,
      },
    },
    settings: {},
    profileSetupState: {
      status: "completed",
      currentStep: "ready_check",
      completedAt: "2026-08-15T08:00:00.000Z",
      reviewItems: [],
      lastResumedAt: "2026-08-15T08:00:00.000Z",
    },
    resumeExportArtifacts: [],
    tailoredAssets: [],
    userActionRequests: [],
    latestResumeImportRun: null,
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
    },
  } as unknown as JobFinderWorkspaceSnapshot;
}

function withReadyShortlist(ws: JobFinderWorkspaceSnapshot, ids: string[]) {
  return {
    ...ws,
    campaigns: ws.campaigns.map((campaign) => ({ ...campaign, jobIds: ids })),
    discoveryJobs: ids.map((id) => ({
      id,
      title: id,
      company: "Employer",
      discoveryMethod: "browser_agent",
      matchAssessment: {
        score: 70,
        dimensions: { roleSuitability: { state: "exact" } },
        contextFingerprint: "ctx",
        postingFingerprint: "post",
      },
    })),
    recentDiscoveryRuns: [
      {
        id: "run-1",
        state: "completed",
        startedAt: "2026-08-15T09:30:00.000Z",
        completedAt: "2026-08-15T09:40:00.000Z",
        targetIds: ["target-1"],
        activity: [],
        targetExecutions: [],
        summary: {
          validJobsFound: ids.length,
          duplicatesMerged: 0,
          targetsPlanned: 1,
          targetsCompleted: 1,
        },
      },
    ],
    reviewQueue: ids.map(
      (id) =>
        ({
          jobId: id,
          title: id,
          company: "Employer",
          location: "Remote",
          matchScore: 70,
          applicationStatus: "drafting",
          assetStatus: "ready",
          progressPercent: null,
          resumeAssetId: `asset-${id}`,
          resumeApplicationMode: "tailored_per_job",
          resumeTailoringMode: null,
          resumeReview: { status: "needs_review" },
          updatedAt: "2026-08-15T10:00:00.000Z",
        }) as unknown as ReviewQueueItem,
    ),
  } as unknown as JobFinderWorkspaceSnapshot;
}

function baseProps() {
  return {
    activityPending: false,
    onNavigate: vi.fn(),
    onPauseActivity: vi.fn(),
    onResumeActivity: vi.fn(),
    onSelectCampaign: vi.fn(),
  };
}

describe("JobSearchHomeScreen", () => {
  it("shows one source fix for a missing starting page without generic retry advice", () => {
    const ws = workspace();
    ws.searchPreferences.discovery.targets[0]!.staleReason =
      "Starting page returned HTTP 404";
    render(
      <JobSearchHomeScreen
        {...baseProps()}
        workspace={ws}
        discoveryRunFeedback={{
          status: "failed",
          detail: "Agent discovery failed: Starting page returned HTTP 404: http://127.0.0.1/gone/",
          headline: "Something unexpected stopped this search.",
          recovery: null,
          targetLabel: null,
        }}
      />,
    );
    expect(screen.getByText(/1 job source is failing/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fix in Job sources" })).toBeTruthy();
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
  });

  it("names a 404-only search failure once, on the next step", () => {
    const ws = workspace();
    ws.recentDiscoveryRuns = [
      {
        id: "run-404",
        campaignId: ws.activeCampaignId,
        state: "failed",
        runPhase: null,
        startedAt: "2026-08-15T09:30:00.000Z",
        completedAt: "2026-08-15T09:31:00.000Z",
        targetIds: ["target-1"],
        activity: [],
        targetExecutions: [
          {
            targetId: "target-1",
            state: "failed",
            jobsFound: 0,
            warning:
              "Agent discovery failed: Starting page returned HTTP 404: http://127.0.0.1/nope/",
          },
        ],
        summary: { targetsPlanned: 1, targetsCompleted: 0, validJobsFound: 0 },
      },
    ] as unknown as JobFinderWorkspaceSnapshot["recentDiscoveryRuns"];
    render(
      <JobSearchHomeScreen
        {...baseProps()}
        workspace={ws}
        discoveryRunFeedback={{
          status: "failed",
          detail: "Agent discovery failed: Starting page returned HTTP 404: http://127.0.0.1/nope/",
          headline: "The search stopped before it could finish.",
          recovery: null,
          targetLabel: null,
        }}
      />,
    );
    const card = screen.getByTestId("home-next-step");
    expect(card.getAttribute("data-home-next-step")).toBe("source_failed");
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
  });

  it("says a stopped search once, in the status line, without a callout", () => {
    const ws = workspace();
    ws.recentDiscoveryRuns = [
      {
        id: "run-stopped",
        campaignId: ws.activeCampaignId,
        state: "cancelled",
        runPhase: null,
        startedAt: "2026-08-15T09:30:00.000Z",
        completedAt: "2026-08-15T09:31:00.000Z",
        targetIds: ["target-1"],
        activity: [],
        targetExecutions: [],
        summary: { targetsPlanned: 1, targetsCompleted: 0, validJobsFound: 0 },
      },
    ] as unknown as JobFinderWorkspaceSnapshot["recentDiscoveryRuns"];
    render(
      <JobSearchHomeScreen
        {...baseProps()}
        workspace={ws}
        discoveryRunFeedback={{
          status: "cancelled",
          detail: null,
          headline: "The search stopped before it could finish.",
          recovery: null,
          targetLabel: null,
        }}
      />,
    );
    expect(screen.getByText(/Last search stopped early/)).toBeTruthy();
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
  });

  it("drops a search failure once a later search of the plan finished (sign-in carried on)", () => {
    const ws = workspace();
    const failedAt = Date.parse("2026-08-15T10:00:00.000Z");
    const feedback = {
      status: "failed" as const,
      recordedAtMs: failedAt,
      detail: "Stopped at a sign-in page.",
      headline: "The search stopped before it could finish.",
      recovery: null,
      targetLabel: null,
    };
    const { rerender } = render(
      <JobSearchHomeScreen
        {...baseProps()}
        workspace={ws}
        discoveryRunFeedback={feedback}
      />,
    );
    expect(screen.getByTestId("home-discovery-run-feedback")).toBeTruthy();
    const later = {
      ...ws,
      recentDiscoveryRuns: [
        {
          id: "run_after_sign_in",
          campaignId: ws.activeCampaignId,
          state: "completed",
          runPhase: null,
          startedAt: "2026-08-15T10:01:00.000Z",
          completedAt: "2026-08-15T10:02:00.000Z",
          targetIds: ["target-1"],
          activity: [],
          targetExecutions: [],
          summary: {
            validJobsFound: 10,
            duplicatesMerged: 0,
            targetsPlanned: 1,
            targetsCompleted: 1,
            durationMs: 60_000,
            warnings: [],
            report: { found: 10, new: 10, kept: 10, alreadyHere: 0 },
          },
        },
      ],
    } as unknown as JobFinderWorkspaceSnapshot;
    rerender(
      <JobSearchHomeScreen
        {...baseProps()}
        workspace={later}
        discoveryRunFeedback={feedback}
      />,
    );
    expect(screen.queryByTestId("home-discovery-run-feedback")).toBeNull();
  });

  it("puts the status under the title and runs the first search from the card", () => {
    const onRunDiscovery = vi.fn();
    render(
      <JobSearchHomeScreen
        {...baseProps()}
        onRunDiscovery={onRunDiscovery}
        workspace={workspace()}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Ready to search 1 source. Nothing has been searched yet.",
      ),
    ).toBeTruthy();
    const card = screen.getByTestId("home-next-step");
    expect(card.getAttribute("data-home-next-step")).toBe("first_search");
    fireEvent.click(within(card).getByRole("button", { name: "Search now" }));
    expect(onRunDiscovery).toHaveBeenCalledWith(undefined);
    // Nothing else is on the page yet: no tiles, no notifications, no pause.
    expect(screen.queryByTestId("home-pipeline")).toBeNull();
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pause/ })).toBeNull();
  });

  it("starts Apply to all from Home with the ready jobs and shows the pending state", () => {
    let resolveApply: () => void = () => undefined;
    const onApplyToJobs = vi.fn(
      () => new Promise<void>((resolve) => (resolveApply = resolve)),
    );
    render(
      <JobSearchHomeScreen
        {...baseProps()}
        applicationAutomationMode="confirm_before_submit"
        onApplyToJobs={onApplyToJobs}
        workspace={withReadyShortlist(workspace(), ["job_a", "job_b"])}
      />,
    );
    const card = screen.getByTestId("home-next-step");
    expect(
      within(card).getByRole("heading", { name: "Apply to 2 ready jobs" }),
    ).toBeTruthy();
    expect(card.textContent).toContain("waits for your go-ahead");
    const button = within(card).getByRole("button", { name: "Apply to all 2" });
    fireEvent.click(button);
    expect(onApplyToJobs).toHaveBeenCalledWith(["job_a", "job_b"]);
    expect(
      button.getAttribute("aria-busy") ?? button.getAttribute("data-pending"),
    ).not.toBeNull();
    resolveApply();
  });

  it("names the saved mode and changes it with one press on the Applying settings", () => {
    const props = baseProps();
    render(
      <JobSearchHomeScreen
        {...props}
        applicationAutomationMode="autonomous_submit"
        onApplyToJobs={vi.fn()}
        workspace={withReadyShortlist(workspace(), ["job_a"])}
      />,
    );
    const card = screen.getByTestId("home-next-step");
    expect(card.textContent).toContain(
      "Job Finder fills in and sends each application",
    );
    fireEvent.click(
      within(card).getByRole("button", { name: "Change how it applies" }),
    );
    expect(props.onNavigate).toHaveBeenCalledWith(
      "/job-finder/settings#settings-application-authority",
    );
  });

  it("renders the pipeline with the sidebar's numbers and navigates from a tile", () => {
    const props = baseProps();
    render(
      <JobSearchHomeScreen
        {...props}
        workspace={withReadyShortlist(workspace(), ["job_a"])}
      />,
    );
    const pipeline = screen.getByTestId("home-pipeline");
    const tiles = within(pipeline).getAllByRole("button");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "Find jobs1",
      "Shortlisted11 ready to apply",
      "Applications0",
    ]);
    fireEvent.click(tiles[1]!);
    expect(props.onNavigate).toHaveBeenCalledWith("/job-finder/review-queue");
  });

  it("lists running work with Stop and offers the pause there", () => {
    const props = baseProps();
    const onStopSearch = vi.fn();
    const ws = workspace();
    ws.activeDiscoveryRun = {
      id: "run-live",
      state: "running",
      runPhase: null,
      startedAt: "2026-08-15T11:58:00.000Z",
      completedAt: null,
      targetIds: ["target-1"],
      activity: [],
      targetExecutions: [],
      summary: { targetsPlanned: 1, targetsCompleted: 0 },
    } as unknown as JobFinderWorkspaceSnapshot["activeDiscoveryRun"];
    render(
      <JobSearchHomeScreen
        {...props}
        onStopSearch={onStopSearch}
        workspace={ws}
      />,
    );
    const now = screen.getByTestId("home-now");
    expect(within(now).getByText("Searching Replica board")).toBeTruthy();
    fireEvent.click(within(now).getByRole("button", { name: "Stop" }));
    expect(onStopSearch).toHaveBeenCalledWith("run-live");
    fireEvent.click(
      within(now).getByRole("button", { name: "Pause new work" }),
    );
    expect(props.onPauseActivity).toHaveBeenCalledTimes(1);
  });

  it("offers Resume in the header while paused", () => {
    const props = baseProps();
    const ws = workspace();
    ws.activityControl = {
      paused: true,
      pausedAt: "2026-08-15T11:00:00.000Z",
      reason: "Paused by you.",
    };
    render(<JobSearchHomeScreen {...props} workspace={ws} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Resume" })[0]!);
    expect(props.onResumeActivity).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Paused\./)).toBeTruthy();
  });

  it("keeps Try again for all in place beside a form waiting to be sent", () => {
    const props = baseProps();
    const onApplyToJobs = vi.fn(() => Promise.resolve());
    const ws = withReadyShortlist(workspace(), ["job_a", "job_b", "job_c"]);
    ws.applicationRecords = ["job_a", "job_b", "job_c"].map((jobId) => ({
      id: `record-${jobId}`,
      jobId,
      title: jobId,
      company: "Employer",
      status: "ready_for_review",
      lastAttemptState: jobId === "job_a" ? "ready" : "failed",
      automationMode: "prepare_only",
      questionSummary: { total: 0, answered: 0 },
      lastActionLabel: "Stopped",
      lastUpdatedAt: "2026-08-15T11:00:00.000Z",
    })) as unknown as JobFinderWorkspaceSnapshot["applicationRecords"];
    ws.applyJobResults = ["job_a", "job_b", "job_c"].map((jobId) => ({
      id: `result-${jobId}`,
      runId: "apply-1",
      jobId,
      applicationRecordId: `record-${jobId}`,
      state: jobId === "job_a" ? "awaiting_review" : "failed",
      blockerReason: null,
      updatedAt: "2026-08-15T11:00:00.000Z",
    })) as unknown as JobFinderWorkspaceSnapshot["applyJobResults"];
    render(
      <JobSearchHomeScreen
        {...props}
        onApplyToJobs={onApplyToJobs}
        workspace={ws}
      />,
    );
    const card = screen.getByTestId("home-next-step");
    expect(card.getAttribute("data-home-next-step")).toBe("send");
    fireEvent.click(
      within(card).getByRole("button", { name: "Try again for all 2" }),
    );
    expect(onApplyToJobs).toHaveBeenCalledWith(["job_b", "job_c"]);
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it("shows notifications only while one is unread", () => {
    const notification = (
      id: string,
      unread: boolean,
    ): CampaignNotification => ({
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
    });
    const props = {
      ...baseProps(),
      onMarkCampaignNotificationRead: vi.fn(),
      onMarkAllCampaignNotificationsRead: vi.fn(),
    };
    const { rerender } = render(
      <JobSearchHomeScreen
        {...props}
        campaignNotifications={[notification("a", false)]}
        workspace={workspace()}
      />,
    );
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    rerender(
      <JobSearchHomeScreen
        {...props}
        campaignNotifications={[
          notification("a", false),
          notification("b", true),
        ]}
        workspace={workspace()}
      />,
    );
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getByText("Strong match: b")).toBeTruthy();
    expect(within(region).queryByText("Strong match: a")).toBeNull();
  });
});

describe("listCurrentUnreadNotifications", () => {
  it("drops a failure note about a job that has since been sent", () => {
    const note = (id: string, jobId: string | null) =>
      ({
        id,
        campaignId: "c",
        kind: "blocked_work",
        title: "Failed: Cedar",
        body: "The application page could not be opened.",
        createdAt: "2026-09-25T00:00:00.000Z",
        unread: true,
        readAt: null,
        jobId,
        sourceTargetId: null,
      }) as unknown as CampaignNotification;
    const kept = listCurrentUnreadNotifications(
      [note("n_sent", "job_sent"), note("n_open", "job_open"), note("n_src", null)],
      {
        applicationRecords: [
          { jobId: "job_sent", status: "submitted", lastAttemptState: "submitted" },
          { jobId: "job_open", status: "ready_for_review", lastAttemptState: "failed" },
        ],
      } as unknown as JobFinderWorkspaceSnapshot,
    );
    expect(kept.map((entry) => entry.id)).toEqual(["n_open", "n_src"]);
  });
});
