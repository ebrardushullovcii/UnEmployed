import type {
  JobFinderWorkspaceSnapshot,
  ReviewQueueItem,
} from "@unemployed/contracts";
import {
  AbnormalFailurePauseSchema,
  createFreshStartCandidateProfile,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import { buildJobFinderTaskCenterModel } from "../../components/task-center/job-finder-task-center-model";
import { countNeedsYou } from "../../lib/destination-counts";
import {
  buildInterruptedSearchRetryRequest,
  buildJobSearchHomeModel,
  type BuildJobSearchHomeModelInput,
} from "./job-search-home-model";

const NOW = Date.parse("2026-08-15T12:00:00.000Z");

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
            url: "http://127.0.0.1:47950/board/",
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

function completedRun(counts: { found: number; new: number }) {
  return {
    id: "run-1",
    state: "completed",
    runPhase: null,
    startedAt: "2026-08-15T09:30:00.000Z",
    completedAt: "2026-08-15T09:40:00.000Z",
    targetIds: ["target-1"],
    activity: [],
    targetExecutions: [],
    summary: {
      validJobsFound: counts.new,
      duplicatesMerged: 0,
      targetsPlanned: 1,
      targetsCompleted: 1,
      durationMs: 600_000,
      report: {
        found: counts.found,
        new: counts.new,
        kept: counts.new,
        alreadyHere: 0,
      },
    },
  };
}

function withJobs(
  base: JobFinderWorkspaceSnapshot,
  count: number,
  options: { weaker?: number } = {},
): JobFinderWorkspaceSnapshot {
  const weaker = options.weaker ?? 0;
  const ids = Array.from({ length: count + weaker }, (_u, i) => `job_${i}`);
  return {
    ...base,
    campaigns: base.campaigns.map((campaign) => ({ ...campaign, jobIds: ids })),
    discoveryJobs: ids.map((id, index) => ({
      id,
      title: `Job ${index}`,
      company: "Employer",
      discoveryMethod: "browser_agent",
      matchAssessment: {
        score: index < count ? 70 : 10,
        recommendation: index < count ? "apply" : "consider",
        dimensions: {
          roleSuitability: { state: "exact" },
          evidenceConfidence: { level: "high" },
        },
        contextFingerprint: "ctx",
        postingFingerprint: "post",
      },
    })),
    recentDiscoveryRuns: [
      completedRun({ found: count + weaker, new: count + weaker }),
    ],
  } as unknown as JobFinderWorkspaceSnapshot;
}

function queueItem(
  jobId: string,
  overrides: Partial<ReviewQueueItem> = {},
): ReviewQueueItem {
  return {
    jobId,
    title: `Job ${jobId}`,
    company: "Employer",
    location: "Remote",
    matchScore: 70,
    applicationStatus: "drafting",
    assetStatus: "not_started",
    progressPercent: null,
    resumeAssetId: null,
    resumeApplicationMode: "tailored_per_job",
    resumeTailoringMode: null,
    resumeReview: { status: "not_started" },
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  } as ReviewQueueItem;
}

function withShortlist(
  base: JobFinderWorkspaceSnapshot,
  items: readonly ReviewQueueItem[],
): JobFinderWorkspaceSnapshot {
  const ids = new Set([
    ...base.campaigns.flatMap((campaign) => campaign.jobIds),
    ...items.map((item) => item.jobId),
  ]);
  return {
    ...base,
    campaigns: base.campaigns.map((campaign) => ({
      ...campaign,
      jobIds: [...ids],
    })),
    reviewQueue: items,
  } as JobFinderWorkspaceSnapshot;
}

function withDailyPreparationRemaining(
  base: JobFinderWorkspaceSnapshot,
  remaining: number,
): JobFinderWorkspaceSnapshot {
  return {
    ...base,
    dashboard: {
      ...base.dashboard,
      globalDailyApplicationPreparationCapacity: {
        limit: 20,
        used: 20 - remaining,
        legacyUncertain: 0,
        remaining,
        localDate: "2026-08-15",
        resetsAt: "2026-08-16T00:00:00.000Z",
      },
    },
  } as JobFinderWorkspaceSnapshot;
}

function build(
  ws: JobFinderWorkspaceSnapshot,
  overrides: Partial<BuildJobSearchHomeModelInput> = {},
) {
  return buildJobSearchHomeModel({
    workspace: ws,
    tasks: buildJobFinderTaskCenterModel({
      workspace: ws,
      isDiscoveryPending: false,
      isResumeImportPending: false,
      now: NOW,
      ...(overrides.tasks ? {} : {}),
    }),
    discoveryRunPending: false,
    canRunDiscovery: true,
    applicationAutomationMode: "prepare_only",
    now: NOW,
    ...overrides,
  });
}

describe("buildJobSearchHomeModel · before the first search", () => {
  it("sends a brand-new workspace to setup and shows no pipeline", () => {
    const ws = workspace();
    ws.profileSetupState = {
      ...ws.profileSetupState,
      status: "not_started",
      currentStep: "import",
      completedAt: null,
    };
    const model = build(ws);
    expect(model.next.id).toBe("setup");
    expect(model.next.primary).toEqual({
      label: "Start setup",
      action: { kind: "navigate", route: "/job-finder/profile/setup" },
    });
    expect(model.stages).toBeNull();
    expect(model.statusLine).toContain("Set up your profile");
  });

  it("names the step a half-finished setup resumes at", () => {
    const ws = workspace();
    ws.profileSetupState = {
      ...ws.profileSetupState,
      status: "in_progress",
      currentStep: "targeting",
      completedAt: null,
    };
    const model = build(ws);
    expect(model.next.id).toBe("setup");
    expect(model.next.title).toBe("Finish setting up");
    expect(model.next.detail).toContain("your job targets");
    expect(model.next.primary.label).toBe("Continue setup");
  });

  it("names the required job target gap when import leaves setup on optional Extras", () => {
    const ws = workspace();
    ws.profileSetupState = {
      ...ws.profileSetupState,
      status: "in_progress",
      currentStep: "extras",
      completedAt: null,
    };
    ws.profile = {
      ...createFreshStartCandidateProfile(),
      id: "synthetic-jamie",
      fullName: "Jamie Rivers",
      email: "jamie@example.test",
      baseResume: {
        ...createFreshStartCandidateProfile().baseResume,
        textContent: "Synthetic frontend engineering work",
      },
      targetRoles: ["Frontend Engineer"],
    };
    ws.searchPreferences.discovery.targets = [];
    const model = build(ws);
    expect(model.next.id).toBe("setup");
    expect(model.next.detail).toContain("Add a job source in your job targets");
    expect(model.next.detail).not.toContain("optional extras");
    expect(model.next.primary.action).toEqual({
      kind: "resume_setup",
      step: "targeting",
    });
  });

  it("asks for a job source when none is saved, and to turn one on when all are off", () => {
    const none = workspace();
    none.searchPreferences.discovery.targets = [];
    expect(build(none).next).toMatchObject({
      id: "sources",
      title: "Add a job source",
    });

    const off = workspace();
    off.searchPreferences.discovery.targets = [
      { ...off.searchPreferences.discovery.targets[0]!, enabled: false },
    ];
    const model = build(off);
    expect(model.next).toMatchObject({
      id: "sources",
      title: "Turn on a job source",
    });
    expect(model.next.primary.action).toEqual({
      kind: "navigate",
      route:
        "/job-finder/profile?section=sources&focus=job-sources#profile-job-sources",
    });
    expect(model.statusLine).toContain("No job source is turned on");
  });

  it("offers the first search in place once a source is on", () => {
    const model = build(workspace());
    expect(model.next.id).toBe("first_search");
    expect(model.next.primary).toEqual({
      label: "Search now",
      action: { kind: "run_search" },
    });
    expect(model.stages).toBeNull();
    expect(model.now).toEqual([]);
    expect(model.statusLine).toBe(
      "Ready to search 1 source. Nothing has been searched yet.",
    );
  });

  it("falls back to opening Find jobs when Home cannot run the search itself", () => {
    const model = build(workspace(), { canRunDiscovery: false });
    expect(model.next.primary).toEqual({
      label: "Open Find jobs",
      action: { kind: "navigate", route: "/job-finder/discovery" },
    });
  });
});

describe("buildJobSearchHomeModel · while something runs", () => {
  it("shows a running search under Happening now with Stop, and tells the person to wait", () => {
    const ws = workspace();
    ws.activeDiscoveryRun = {
      id: "run-live",
      state: "running",
      runPhase: null,
      startedAt: "2026-08-15T11:58:00.000Z",
      completedAt: null,
      targetIds: ["target-1"],
      activity: [
        {
          runId: "run-live",
          stage: "extraction",
          targetId: "target-1",
          message: "Reading listings",
          at: "2026-08-15T11:59:00.000Z",
        },
      ],
      targetExecutions: [],
      summary: { targetsPlanned: 1, targetsCompleted: 0 },
    } as unknown as JobFinderWorkspaceSnapshot["activeDiscoveryRun"];
    const model = build(ws);
    expect(model.now).toHaveLength(1);
    expect(model.now[0]).toMatchObject({
      title: "Searching Replica board",
      stop: {
        label: "Stop",
        action: { kind: "stop_search", runId: "run-live" },
      },
    });
    expect(model.next.id).toBe("wait_search");
    expect(model.statusLine.startsWith("Searching Replica board · ")).toBe(
      true,
    );
  });

  it("shows a search that was just requested before the run is recorded", () => {
    const model = build(workspace(), { discoveryRunPending: true });
    expect(model.now[0]?.title).toBe("Starting the search");
    expect(model.next.id).toBe("wait_search");
  });

  it("shows resume writing with a stop, and never recommends creating the same resumes again", () => {
    const ws = withShortlist(withJobs(workspace(), 3), [
      queueItem("job_0", { assetStatus: "generating" }),
      queueItem("job_1"),
      queueItem("job_2"),
    ]);
    const tasks = buildJobFinderTaskCenterModel({
      workspace: ws,
      isDiscoveryPending: false,
      isResumeImportPending: false,
      tailoredDraftPreparation: {
        attemptedCount: 1,
        completedCount: 0,
        currentIndex: 1,
        eligibleRemainingCount: 0,
        failedCount: 0,
        status: "running",
        totalCount: 3,
      },
      now: NOW,
    });
    const model = build(ws, { tasks });
    expect(model.now[0]).toMatchObject({
      title: "Writing resumes",
      stop: { action: { kind: "stop_resumes" } },
    });
    expect(model.next.id).toBe("wait_resumes");
    expect(model.stages?.[1]).toMatchObject({
      label: "Shortlisted",
      count: 3,
      detail: "2 need a resume · 1 being written",
    });
  });

  it("shows an application run with Stop and says nothing is needed", () => {
    const ws = withShortlist(withJobs(workspace(), 1), [
      queueItem("job_0", {
        assetStatus: "ready",
        resumeAssetId: "asset-0",
        resumeReview: {
          status: "needs_review",
        } as ReviewQueueItem["resumeReview"],
      }),
    ]);
    ws.applicationRecords = [
      {
        id: "record-0",
        jobId: "job_0",
        title: "Job job_0",
        company: "Employer",
        status: "drafting",
        lastAttemptState: "in_progress",
        questionSummary: { total: 0, answered: 0 },
        lastActionLabel: "Filling in",
        lastUpdatedAt: "2026-08-15T11:59:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationRecords"];
    ws.applyRuns = [
      {
        id: "apply-1",
        mode: "queue_auto",
        state: "running",
        jobIds: ["job_0"],
        currentJobId: "job_0",
        createdAt: "2026-08-15T11:58:00.000Z",
        updatedAt: "2026-08-15T11:59:00.000Z",
        completedAt: null,
        summary: "Applying",
        detail: "Applying",
        totalJobs: 1,
        pendingJobs: 1,
        submittedJobs: 0,
        skippedJobs: 0,
        blockedJobs: 0,
        failedJobs: 0,
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applyRuns"];
    const model = build(ws);
    expect(model.now[0]).toMatchObject({
      title: "Applying: Employer · Job 0",
      stop: { action: { kind: "stop_apply", runId: "apply-1" } },
    });
    expect(model.next.id).toBe("wait_apply");
    expect(model.stages?.[2]).toMatchObject({
      label: "Applications",
      count: 1,
      detail: "1 filling in",
    });
    // The job is in Applications now, so Shortlisted does not offer it again.
    expect(model.stages?.[1]?.detail).toBe("1 in Applications");
  });

  it("reports a paused workspace before anything else", () => {
    const ws = workspace();
    ws.activityControl = {
      paused: true,
      pausedAt: "2026-08-15T11:00:00.000Z",
      reason: "Paused by you.",
    };
    const model = build(ws);
    expect(model.paused).toBe(true);
    expect(model.statusLine.startsWith("Paused.")).toBe(true);
    expect(model.next).toMatchObject({
      id: "paused",
      primary: { label: "Resume", action: { kind: "resume_activity" } },
    });
  });
});

describe("buildJobSearchHomeModel · after a search", () => {
  it("asks the person to look through what the search found", () => {
    const ws = withJobs(workspace(), 10);
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "look_through",
      title: "Look through 10 jobs",
      primary: {
        label: "Open Find jobs",
        action: { kind: "navigate", route: "/job-finder/discovery" },
      },
    });
    expect(model.next.secondary[0]?.label).toBe("Search again");
    expect(model.statusLine).toBe(
      "Last search finished 2 hours ago · 10 found · 10 new.",
    );
    expect(model.stages?.map((stage) => stage.count)).toEqual([10, 0, 0]);
  });

  it("counts exactly the rows Find jobs lists and names the hidden weaker matches", () => {
    const ws = withJobs(workspace(), 9, { weaker: 1 });
    const model = build(ws);
    expect(model.stages?.[0]).toMatchObject({
      label: "Find jobs",
      count: 9,
      detail: "1 weaker match hidden",
    });
    expect(model.next.title).toBe("Look through 9 jobs");
  });

  it("says when a search found nothing and offers the two ways out", () => {
    const ws = workspace();
    ws.recentDiscoveryRuns = [
      completedRun({ found: 0, new: 0 }),
    ] as unknown as JobFinderWorkspaceSnapshot["recentDiscoveryRuns"];
    const model = build(ws);
    expect(model.next.id).toBe("nothing_found");
    expect(model.next.primary).toEqual({
      label: "Search again",
      action: { kind: "run_search" },
    });
    expect(model.next.secondary[0]?.label).toBe("Open job sources");
    expect(model.statusLine).toBe("Last search finished 2 hours ago.");
  });

  it("retries an interrupted search on the sources still enabled", () => {
    const ws = workspace();
    ws.recentDiscoveryRuns = [
      {
        ...completedRun({ found: 0, new: 0 }),
        state: "cancelled",
        runPhase: "interrupted",
        searchIntent: "frontend",
        searchFreshness: "recent",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["recentDiscoveryRuns"];
    expect(buildInterruptedSearchRetryRequest(ws)).toEqual({
      intent: "frontend",
      freshness: "recent",
      sourceIds: ["target-1"],
    });
    const model = build(ws);
    expect(model.next.id).toBe("search_failed");
    expect(model.next.title).toBe("Your last search stopped early");
    expect(model.next.primary).toEqual({
      label: "Search again",
      action: {
        kind: "run_search",
        request: {
          intent: "frontend",
          freshness: "recent",
          sourceIds: ["target-1"],
        },
      },
    });
    expect(model.statusLine).toContain("stopped early");

    ws.searchPreferences.discovery.targets = [
      { ...ws.searchPreferences.discovery.targets[0]!, id: "target-2" },
    ];
    expect(buildInterruptedSearchRetryRequest(ws)).toBeNull();
    expect(build(ws).next.primary).toEqual({
      label: "Choose sources",
      action: { kind: "navigate", route: "/job-finder/discovery" },
    });
  });

  it("offers to run a failed search again", () => {
    const ws = workspace();
    ws.recentDiscoveryRuns = [
      { ...completedRun({ found: 0, new: 0 }), state: "failed" },
    ] as unknown as JobFinderWorkspaceSnapshot["recentDiscoveryRuns"];
    const model = build(ws);
    expect(model.next.id).toBe("search_failed");
    expect(model.next.title).toBe("Your last search failed");
    expect(model.statusLine).toBe("Last search failed 2 hours ago.");
  });

  it("flags a failing enabled source with the one place to fix it", () => {
    const ws = withJobs(workspace(), 2);
    ws.searchPreferences.discovery.targets = [
      {
        ...ws.searchPreferences.discovery.targets[0]!,
        staleReason: "connection_failed",
        lastVerifiedAt: "2026-08-15T09:00:00.000Z",
      } as unknown as JobFinderWorkspaceSnapshot["searchPreferences"]["discovery"]["targets"][number],
    ];
    const model = build(ws);
    expect(model.problems).toHaveLength(1);
    expect(model.problems[0]).toMatchObject({
      id: "failing-sources",
      tone: "critical",
      button: { label: "Fix in Job sources" },
    });
    expect(model.problems[0]?.text).toContain("Replica board");
    // A broken source is a warning, not the next step, while work remains.
    expect(model.next.id).toBe("look_through");
  });
});

describe("buildJobSearchHomeModel · shortlist and applications", () => {
  it("offers to create the missing resumes in place", () => {
    const ws = withShortlist(withJobs(workspace(), 5), [
      queueItem("job_0"),
      queueItem("job_1"),
      queueItem("job_2"),
    ]);
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "create_resumes",
      title: "Create 3 resumes",
      primary: {
        label: "Create 3 resumes",
        action: { kind: "create_resumes" },
      },
    });
    expect(model.stages?.[1]).toMatchObject({
      count: 3,
      detail: "3 need a resume",
    });
  });

  it("offers Apply to all once the resumes are ready, in the mode from Settings", () => {
    const ready = (id: string) =>
      queueItem(id, {
        assetStatus: "ready",
        resumeAssetId: `asset-${id}`,
        resumeReview: {
          status: "needs_review",
        } as ReviewQueueItem["resumeReview"],
      });
    const ws = withShortlist(withJobs(workspace(), 5), [
      ready("job_0"),
      ready("job_1"),
      queueItem("job_2"),
    ]);
    const model = build(ws, { applicationAutomationMode: "autonomous_submit" });
    expect(model.next).toMatchObject({
      id: "apply",
      title: "Apply to 2 ready jobs",
      primary: {
        label: "Apply to all 2",
        action: { kind: "apply_all", jobIds: ["job_0", "job_1"] },
      },
    });
    expect(model.next.detail).toContain("sends each application");
    expect(model.next.detail).toContain("Settings");
    expect(model.stages?.[1]?.detail).toBe(
      "1 need a resume · 2 ready to apply",
    );
  });

  it("asks for a review before applying with an Aggressive resume", () => {
    const ws = withShortlist(withJobs(workspace(), 2), [
      queueItem("job_0", {
        assetStatus: "ready",
        resumeAssetId: "asset-0",
        resumeTailoringMode: "aggressive",
        resumeReview: {
          status: "needs_review",
        } as ReviewQueueItem["resumeReview"],
      }),
    ]);
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "review_resumes",
      title: "Review 1 resume",
    });
    expect(model.stages?.[1]?.detail).toBe("1 to review");
  });

  it("sends the person to Applications when forms are filled in and ready to send", () => {
    const ws = withShortlist(withJobs(workspace(), 2), [
      queueItem("job_0", {
        assetStatus: "ready",
        resumeAssetId: "asset-0",
        resumeReview: {
          status: "needs_review",
        } as ReviewQueueItem["resumeReview"],
      }),
    ]);
    ws.applicationRecords = [
      {
        id: "record-0",
        jobId: "job_0",
        title: "Job 0",
        company: "Employer",
        status: "ready_for_review",
        lastAttemptState: "ready",
        automationMode: "prepare_only",
        questionSummary: { total: 0, answered: 0 },
        lastActionLabel: "Filled in",
        lastUpdatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationRecords"];
    ws.applyJobResults = [
      {
        id: "result-0",
        runId: "apply-1",
        jobId: "job_0",
        applicationRecordId: "record-0",
        state: "awaiting_review",
        blockerReason: null,
        updatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applyJobResults"];
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "send",
      title: "Send 1 application",
      primary: {
        label: "Open Applications",
        action: { kind: "navigate", route: "/job-finder/applications" },
      },
    });
    expect(model.stages?.[2]).toMatchObject({
      count: 1,
      detail: "1 ready to send",
    });
    expect(model.stages?.[1]?.detail).toBe("1 in Applications");
    // Searching again stays one press for a returning person.
    expect(model.next.secondary.map((button) => button.label)).toEqual([
      "Search again",
    ]);
  });

  it("offers to try failed applications again with the jobs Applications would retry", () => {
    const ws = withShortlist(withJobs(workspace(), 2), [
      queueItem("job_0", {
        assetStatus: "ready",
        resumeAssetId: "asset-0",
        resumeReview: { status: "approved" } as ReviewQueueItem["resumeReview"],
      }),
    ]);
    ws.applicationRecords = [
      {
        id: "record-0",
        jobId: "job_0",
        title: "Job 0",
        company: "Employer",
        status: "ready_for_review",
        lastAttemptState: "failed",
        automationMode: "prepare_only",
        questionSummary: { total: 0, answered: 0 },
        lastActionLabel: "The prepared application page is no longer open.",
        lastUpdatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationRecords"];
    ws.applyJobResults = [
      {
        id: "result-0",
        runId: "apply-1",
        jobId: "job_0",
        applicationRecordId: "record-0",
        state: "failed",
        blockerReason: "unexpected_navigation",
        updatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applyJobResults"];
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "retry",
      title: "Try again for 1 application",
      primary: {
        label: "Try again",
        action: { kind: "apply_all", jobIds: ["job_0"] },
      },
    });
    expect(model.stages?.[2]).toMatchObject({
      count: 1,
      detail: "1 could not apply",
    });
  });

  it("starts only the ready applications that fit today's remaining capacity", () => {
    const ready = (id: string) =>
      queueItem(id, {
        assetStatus: "ready",
        resumeAssetId: `asset-${id}`,
        resumeReview: {
          status: "needs_review",
        } as ReviewQueueItem["resumeReview"],
      });
    const ws = withDailyPreparationRemaining(
      withShortlist(withJobs(workspace(), 3), [
        ready("job_0"),
        ready("job_1"),
        ready("job_2"),
      ]),
      2,
    );
    expect(build(ws).next).toMatchObject({
      id: "apply",
      title: "Apply to 2 of 3 ready jobs",
      primary: {
        label: "Apply to 2",
        action: { kind: "apply_all", jobIds: ["job_0", "job_1"] },
      },
    });
    expect(build(withDailyPreparationRemaining(ws, 0)).next).toMatchObject({
      id: "daily_limit",
      primary: {
        label: "Open Applying settings",
        action: {
          kind: "navigate",
          route: "/job-finder/settings#settings-application-authority",
        },
      },
    });
  });

  it("offers a partial retry batch and a Settings step when the daily limit is reached", () => {
    const ws = withJobs(workspace(), 4);
    ws.applicationRecords = Array.from({ length: 4 }, (_unused, index) => ({
      id: `record-${index}`,
      jobId: `job_${index}`,
      title: `Job ${index}`,
      company: "Employer",
      status: "ready_for_review",
      lastAttemptState: "failed",
      automationMode: "prepare_only",
      questionSummary: { total: 0, answered: 0 },
      lastActionLabel: "Application preparation stopped.",
      lastUpdatedAt: "2026-08-15T11:00:00.000Z",
    })) as JobFinderWorkspaceSnapshot["applicationRecords"];
    ws.applyJobResults = Array.from({ length: 4 }, (_unused, index) => ({
      id: `result-${index}`,
      runId: `apply-${index}`,
      jobId: `job_${index}`,
      applicationRecordId: `record-${index}`,
      state: "failed",
      blockerReason: "unexpected_navigation",
      updatedAt: "2026-08-15T11:00:00.000Z",
    })) as JobFinderWorkspaceSnapshot["applyJobResults"];

    const partial = build(withDailyPreparationRemaining(ws, 2));
    expect(partial.next).toMatchObject({
      id: "retry",
      title: "Try again for 2 of 4 applications",
      primary: {
        label: "Try again for 2",
        action: { kind: "apply_all", jobIds: ["job_0", "job_1"] },
      },
    });
    expect(partial.stages?.[2]).toMatchObject({
      count: 4,
      detail: "4 could not apply",
    });
    expect(build(withDailyPreparationRemaining(ws, 0)).next).toMatchObject({
      id: "daily_limit",
      title: "Today's application limit is reached",
      primary: {
        label: "Open Applying settings",
        action: {
          kind: "navigate",
          route: "/job-finder/settings#settings-application-authority",
        },
      },
    });
  });

  it("puts Needs you ahead of everything else and counts it like the badge", () => {
    const ws = withShortlist(withJobs(workspace(), 2), [queueItem("job_0")]);
    ws.userActionRequests = [
      {
        id: "action-1",
        state: "pending",
        kind: "login",
        scope: {
          type: "application",
          runId: "run-1",
          jobId: "job_0",
          applicationRecordId: "record-1",
        },
        title: "Sign in required",
        summary: "Sign in to continue.",
        createdAt: "2026-08-15T10:00:00.000Z",
        updatedAt: "2026-08-15T10:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["userActionRequests"];
    const model = build(ws);
    expect(countNeedsYou(ws)).toBe(1);
    expect(model.next).toMatchObject({
      id: "needs_you",
      title: "1 thing needs you",
      primary: {
        label: "Open Needs you",
        action: { kind: "navigate", route: "/job-finder/actions" },
      },
    });
  });

  it("puts a safeguard pause ahead of Needs you", () => {
    const ws = workspace();
    ws.intelligence.safeguards.abnormalFailurePauses = [
      AbnormalFailurePauseSchema.parse({
        id: "automatic_discovery_failures:campaign-1",
        windowStartedAt: "2026-08-15T00:00:00.000Z",
        failuresInWindow: 3,
        sampleSize: 8,
        failureRatePercent: 37.5,
        failureRateThresholdPercent: 30,
        paused: true,
        explanation: "Review failed searches.",
        recoveryGuidance: "Open Safeguards",
      }),
    ];
    const model = build(ws);
    expect(model.next.id).toBe("safeguards");
    expect(model.next.detail).toBe("Review failed searches.");
    expect(model.next.primary.label).toBe("Open Safeguards");
  });

  it("names an open application review without claiming it blocks searching", () => {
    const ws = withJobs(workspace(), 2);
    ws.intelligence.safeguards.preparedBatchSampleReviews = [
      {
        id: "sample-1",
        batchId: "apply-1",
        campaignId: "campaign-1",
        sampleJobIds: ["job_0"],
        reviewCompleted: false,
        createdAt: "2026-08-15T11:00:00.000Z",
        updatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as typeof ws.intelligence.safeguards.preparedBatchSampleReviews;
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "safeguards",
      title: "A safeguard is waiting on you",
      primary: {
        label: "Open Safeguards",
        action: {
          kind: "navigate",
          route: "/job-finder/safeguards?tab=reviews",
        },
      },
    });
  });

  it("is all caught up when every shortlisted job has been applied to", () => {
    const ws = withShortlist(withJobs(workspace(), 3), [
      queueItem("job_0", {
        assetStatus: "ready",
        resumeAssetId: "asset-0",
        resumeReview: { status: "approved" } as ReviewQueueItem["resumeReview"],
      }),
    ]);
    ws.applicationRecords = [
      {
        id: "record-0",
        jobId: "job_0",
        title: "Job 0",
        company: "Employer",
        status: "submitted",
        lastAttemptState: "submitted",
        questionSummary: { total: 0, answered: 0 },
        lastActionLabel: "Sent",
        lastUpdatedAt: "2026-08-15T11:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationRecords"];
    const model = build(ws);
    expect(model.next).toMatchObject({
      id: "caught_up",
      title: "All caught up",
      primary: { label: "Search again", action: { kind: "run_search" } },
    });
    expect(model.stages?.[2]).toMatchObject({ count: 1, detail: "1 applied" });
  });

  it("shows the plan selector only with two or more plans", () => {
    const one = build(workspace());
    expect(one.showPlanSelector).toBe(false);
    const ws = workspace();
    ws.campaigns = [
      ...ws.campaigns,
      { ...ws.campaigns[0]!, id: "campaign-2", name: "Backend" },
    ];
    expect(build(ws).showPlanSelector).toBe(true);
  });
});
