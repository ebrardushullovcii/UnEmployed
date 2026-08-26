import { describe, expect, it, vi } from "vitest";
import type { MutableRefObject, SetStateAction } from "react";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import type { PendingActionState } from "./job-finder-pending-actions";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { buildJobFinderPageContext } from "./use-job-finder-page-controller-context";
import type {
  JobFinderSetResumeClaimConfirmationInput,
  JobFinderWorkspaceSnapshot,
  ReviewQueueItem,
} from "@unemployed/contracts";
import type { TailoredDraftPreparationViewState } from "@renderer/features/job-finder/screens/review-queue/review-queue-status";
import { buildJobFinderTaskCenterModel } from "@renderer/features/job-finder/components/task-center/job-finder-task-center-model";
import { createJobFinderSaveCoordinator } from "./job-finder-save-state";

function createIdleTailoredDraftPreparation(): TailoredDraftPreparationViewState {
  return {
    attemptedCount: 0,
    completedCount: 0,
    currentIndex: null,
    eligibleRemainingCount: 0,
    failedCount: 0,
    status: "idle",
    totalCount: 0,
  };
}

function buildContext(overrides: {
  actions: Partial<JobFinderShellActions>;
  workspace?: JobFinderWorkspaceSnapshot;
  tailoredDraftPreparationRunRef?: MutableRefObject<boolean>;
  tailoredDraftPreparationStopRequestedRef?: MutableRefObject<boolean>;
  tailoredDraftPreparationDisposedRef?: MutableRefObject<boolean>;
  latestWorkspaceRef?: MutableRefObject<JobFinderWorkspaceSnapshot | null>;
}) {
  let actionState: ActionState = { message: null };
  const actionMessages: (string | null)[] = [];
  let pendingActionState: PendingActionState = {};
  let tailoredDraftPreparation = createIdleTailoredDraftPreparation();
  let tailoredDraftPreparationWriteCount = 0;
  const workspace =
    overrides.workspace ??
    ({ activeCampaignId: "campaign_active" } as JobFinderWorkspaceSnapshot);
  const setActionState = (next: SetStateAction<ActionState>) => {
    actionState = typeof next === "function" ? next(actionState) : next;
    actionMessages.push(actionState.message);
  };
  const setTailoredDraftPreparation = (
    next: SetStateAction<TailoredDraftPreparationViewState>,
  ) => {
    tailoredDraftPreparationWriteCount += 1;
    tailoredDraftPreparation =
      typeof next === "function" ? next(tailoredDraftPreparation) : next;
  };
  const setPendingActionState = (next: SetStateAction<PendingActionState>) => {
    pendingActionState =
      typeof next === "function" ? next(pendingActionState) : next;
  };
  const saveCoordinator = createJobFinderSaveCoordinator({
    onStateChange: vi.fn(),
  });
  const context = buildJobFinderPageContext({
    actionState,
    actions: overrides.actions as JobFinderShellActions,
    activeRouteResumeAssistantMessages: [],
    activeRouteResumeAssistantPending: false,
    activeRouteResumeWorkspace: null,
    canImportResume: true,
    confirmLeaveDirtyResumeWorkspace: () => Promise.resolve(true),
    importResumeGuardMessage: null,
    isAnyPendingAction: () => false,
    isPendingAction: () => false,
    isCurrentResumeAssistantRequest: () => false,
    isCurrentResumeWorkspaceJob: () => false,
    liveDiscoveryEvents: [],
    latestWorkspaceRef: overrides.latestWorkspaceRef ?? { current: workspace },
    locationPathname: "/job-finder/home",
    navigate: vi.fn(),
    navigateSafely: vi.fn(),
    profileCopilotBusy: false,
    resumeImportProgress: null,
    profileCopilotPendingContextKey: null,
    profileCopilotRequestTokenRef: { current: 0 },
    requestApplyCopilotVisualCheckpoints: vi.fn(),
    profileSetupState: null,
    saveCoordinator,
    saveState: { state: "idle", version: 0 },
    refreshResumeWorkspace: () => Promise.resolve(false),
    resumeAssistantRequestTokenRef: { current: 0 },
    selectedApplicationAttempt: null,
    selectedApplicationRecord: null,
    selectedDiscoveryJob: null,
    selectedReviewItem: null,
    selectedReviewJob: null,
    selectedTailoredAsset: null,
    setPendingActionState,
    setActionState,
    setLiveDiscoveryEvents: vi.fn(),
    setOptimisticProfileCopilotMessages: vi.fn(),
    setProfileCopilotBusy: vi.fn(),
    setProfileCopilotPendingContextKey: vi.fn(),
    setProfileSurfaceDirty: vi.fn(),
    setResumeAssistantMessages: vi.fn(),
    setResumeAssistantPending: vi.fn(),
    setResumeWorkspace: vi.fn(),
    clearResumeWorkspaceState: vi.fn(),
    setResumeWorkspaceDirty: vi.fn(),
    setSelectedApplicationRecordId: vi.fn(),
    setSelectedDiscoveryJobId: vi.fn(),
    setSelectedReviewJobId: vi.fn(),
    setTailoredDraftPreparation,
    sourceDebugRunIdRef: { current: 0 },
    tailoredDraftPreparation,
    tailoredDraftPreparationRunRef:
      overrides.tailoredDraftPreparationRunRef ?? { current: false },
    tailoredDraftPreparationStopRequestedRef:
      overrides.tailoredDraftPreparationStopRequestedRef ?? { current: false },
    tailoredDraftPreparationDisposedRef:
      overrides.tailoredDraftPreparationDisposedRef ?? { current: false },
    workspace,
  } as unknown as Parameters<typeof buildJobFinderPageContext>[0]);

  return {
    context,
    getActionState: () => actionState,
    getActionMessages: () => actionMessages,
    getPendingActionState: () => pendingActionState,
    getTailoredDraftPreparation: () => tailoredDraftPreparation,
    getTailoredDraftPreparationWriteCount: () =>
      tailoredDraftPreparationWriteCount,
  };
}

describe("buildJobFinderPageContext campaign schedule and notifications", () => {
  it("exposes onRunCampaignNow through the page controller with a pending scope", async () => {
    const runCampaignNow = vi
      .fn<JobFinderShellActions["runCampaignNow"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getPendingActionState, getActionState } = buildContext({
      actions: { runCampaignNow },
    });

    const completed = await context.onRunCampaignNow("campaign_b");

    expect(runCampaignNow).toHaveBeenCalledWith("campaign_b");
    expect(completed).toBe(true);
    expect(getPendingActionState()).toEqual({});
    expect(getActionState().message).toMatch(/searches and reads listings/i);
    expect(getActionState().message).toMatch(
      /does not fill application forms/i,
    );
  });

  it("defaults run-now to the active campaign when no id is supplied", async () => {
    const runCampaignNow = vi
      .fn<JobFinderShellActions["runCampaignNow"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context } = buildContext({
      actions: { runCampaignNow },
      workspace: {
        activeCampaignId: "campaign_active",
      } as JobFinderWorkspaceSnapshot,
    });

    await context.onRunCampaignNow();

    expect(runCampaignNow).toHaveBeenCalledWith(undefined);
  });

  it("keeps the campaign-run scope pending while the action runs", async () => {
    let resolveRun: () => void = () => undefined;
    const runCampaignNow = vi
      .fn<JobFinderShellActions["runCampaignNow"]>()
      .mockImplementation(
        () =>
          new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveRun = () => resolve({} as JobFinderWorkspaceSnapshot);
          }),
      );
    const { context, getPendingActionState } = buildContext({
      actions: { runCampaignNow },
    });

    const actionPromise = context.onRunCampaignNow("campaign_b");
    expect(getPendingActionState()).toEqual({
      [jobFinderPendingActions.campaignRun("campaign_b")]: 1,
    });

    resolveRun();
    await actionPromise;
    expect(getPendingActionState()).toEqual({});
  });

  it("exposes mark-read and mark-all-read through the page controller", async () => {
    const markCampaignNotificationRead = vi
      .fn<JobFinderShellActions["markCampaignNotificationRead"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const markAllCampaignNotificationsRead = vi
      .fn<JobFinderShellActions["markAllCampaignNotificationsRead"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getActionState } = buildContext({
      actions: {
        markCampaignNotificationRead,
        markAllCampaignNotificationsRead,
      },
    });
    const pageContext = context;

    pageContext.onMarkCampaignNotificationRead("n_1");
    await vi.waitFor(() => {
      expect(markCampaignNotificationRead).toHaveBeenCalledWith("n_1");
    });

    pageContext.onMarkAllCampaignNotificationsRead();
    await vi.waitFor(() => {
      expect(markAllCampaignNotificationsRead).toHaveBeenCalledTimes(1);
      expect(getActionState().message).toMatch(/marked as read/i);
    });
  });
});

describe("buildJobFinderPageContext outcome recording and suggestions", () => {
  it("records a manual outcome through the shell action with a pending scope", async () => {
    const recordOutcome = vi
      .fn<JobFinderShellActions["recordOutcome"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getPendingActionState, getActionState } = buildContext({
      actions: { recordOutcome },
    });
    const pageContext = context;

    const completed = await pageContext.onRecordOutcome({
      jobId: "job_1",
      outcome: "interview",
      resumeStrategyId: null,
      note: "Recruiter call went well",
    });

    expect(recordOutcome).toHaveBeenCalledWith({
      jobId: "job_1",
      outcome: "interview",
      resumeStrategyId: null,
      note: "Recruiter call went well",
    });
    expect(completed).toBe(true);
    expect(getPendingActionState()).toEqual({});
    expect(getActionState().message).toMatch(/local tracking/i);
    expect(getActionState().message).not.toMatch(/nothing was submitted/i);
  });

  it("keeps the record-outcome scope pending while the action runs", async () => {
    let resolveRecord: () => void = () => undefined;
    const recordOutcome = vi
      .fn<JobFinderShellActions["recordOutcome"]>()
      .mockImplementation(
        () =>
          new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveRecord = () => resolve({} as JobFinderWorkspaceSnapshot);
          }),
      );
    const { context, getPendingActionState } = buildContext({
      actions: { recordOutcome },
    });
    const actionPromise = context.onRecordOutcome({
      jobId: "job_1",
      outcome: "applied",
      resumeStrategyId: null,
      note: null,
    });

    expect(getPendingActionState()).toEqual({
      [jobFinderPendingActions.recordOutcome("job_1")]: 1,
    });

    resolveRecord();
    await actionPromise;
    expect(getPendingActionState()).toEqual({});
  });

  it("surfaces a failed outcome record as a thrown error for the form", async () => {
    const recordOutcome = vi
      .fn<JobFinderShellActions["recordOutcome"]>()
      .mockRejectedValue(new Error("That job is no longer available."));
    const { context } = buildContext({ actions: { recordOutcome } });
    const pageContext = context;

    await expect(
      pageContext.onRecordOutcome({
        jobId: "job_1",
        outcome: "offer",
        resumeStrategyId: null,
        note: null,
      }),
    ).rejects.toThrow("That job is no longer available.");
  });

  it("disables a suggestion through the shell action with a pending scope", async () => {
    const setOutcomeSuggestionEnabled = vi
      .fn<JobFinderShellActions["setOutcomeSuggestionEnabled"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getPendingActionState, getActionState } = buildContext({
      actions: { setOutcomeSuggestionEnabled },
    });
    const pageContext = context;

    const completed = await pageContext.onSetOutcomeSuggestionEnabled({
      dimension: "source",
      key: "example",
      enabled: false,
      reset: false,
    });

    expect(setOutcomeSuggestionEnabled).toHaveBeenCalledWith({
      dimension: "source",
      key: "example",
      enabled: false,
      reset: false,
    });
    expect(completed).toBe(true);
    expect(getPendingActionState()).toEqual({});
    expect(getActionState().message).toMatch(/stays off until you reset it/i);
  });

  it("resets a suggestion with the reset flag and re-evaluation message", async () => {
    const setOutcomeSuggestionEnabled = vi
      .fn<JobFinderShellActions["setOutcomeSuggestionEnabled"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getActionState } = buildContext({
      actions: { setOutcomeSuggestionEnabled },
    });
    const pageContext = context;

    const completed = await pageContext.onSetOutcomeSuggestionEnabled({
      dimension: "campaign",
      key: "campaign_1",
      enabled: true,
      reset: true,
    });

    expect(setOutcomeSuggestionEnabled).toHaveBeenCalledWith({
      dimension: "campaign",
      key: "campaign_1",
      enabled: true,
      reset: true,
    });
    expect(completed).toBe(true);
    expect(getActionState().message).toMatch(/re-evaluate it/i);
  });
});

function createReviewQueueItem(
  jobId: string,
  overrides: Partial<ReviewQueueItem> = {},
): ReviewQueueItem {
  return {
    jobId,
    title: `Role ${jobId}`,
    company: "Acme",
    location: "Remote",
    matchScore: 80,
    applicationStatus: "shortlisted",
    assetStatus: "not_started",
    progressPercent: null,
    resumeAssetId: null,
    resumeApplicationMode: "tailored_per_job",
    resumeReview: { status: "not_started" },
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  } as ReviewQueueItem;
}

function createBatchWorkspace(
  reviewQueue: readonly ReviewQueueItem[],
): JobFinderWorkspaceSnapshot {
  return {
    activeCampaignId: "campaign_1",
    campaigns: [
      { id: "campaign_1", jobIds: reviewQueue.map((item) => item.jobId) },
    ],
    reviewQueue,
  } as unknown as JobFinderWorkspaceSnapshot;
}

describe("buildJobFinderPageContext tailored draft batch", () => {
  it("runs eligible jobs sequentially with quiet pending scopes and one final aggregate message", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const {
      context,
      getActionMessages,
      getPendingActionState,
      getTailoredDraftPreparation,
    } = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
        createReviewQueueItem("job_3"),
      ]),
    });

    context.onPrepareTailoredDrafts();

    await vi.waitFor(() =>
      expect(getTailoredDraftPreparation().status).toBe("completed"),
    );

    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
      "job_2",
      "job_3",
    ]);
    const batchMessages = getActionMessages().filter(
      (message) => message !== null && /tailored draft/i.test(message),
    );
    expect(batchMessages).toHaveLength(1);
    expect(getTailoredDraftPreparation()).toMatchObject({
      attemptedCount: 3,
      completedCount: 3,
      failedCount: 0,
      status: "completed",
      totalCount: 3,
    });
    expect(getPendingActionState()).toEqual({});
    expect(batchMessages[0]).toMatch(/nothing was approved/i);
  });

  it("keeps per-job pending scopes active without touching review selection", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation((jobId: string) => {
        if (jobId === "job_1") {
          return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveFirst = () => resolve({} as JobFinderWorkspaceSnapshot);
          });
        }
        return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
          resolveSecond = () => resolve({} as JobFinderWorkspaceSnapshot);
        });
      });
    const {
      context,
      getActionState,
      getPendingActionState,
      getTailoredDraftPreparation,
    } = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
      ]),
    });

    context.onPrepareTailoredDrafts();

    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(getPendingActionState()).toEqual({
      [jobFinderPendingActions.resumeJob("job_1")]: 1,
    });
    expect(getActionState().message).toBeNull();

    resolveFirst?.();
    await vi.waitFor(() => expect(generateResume).toHaveBeenCalledTimes(2));
    expect(getPendingActionState()).toEqual({
      [jobFinderPendingActions.resumeJob("job_2")]: 1,
    });
    expect(getActionState().message).toBeNull();

    resolveSecond?.();
    await vi.waitFor(() => expect(getPendingActionState()).toEqual({}));
    expect(getTailoredDraftPreparation().status).toBe("completed");
  });

  it("ignores a duplicate start while running, including after a context rebuild with the same controller refs", async () => {
    let resolveFirst: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation((jobId: string) => {
        if (jobId === "job_1") {
          return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveFirst = () => resolve({} as JobFinderWorkspaceSnapshot);
          });
        }
        return Promise.resolve({} as JobFinderWorkspaceSnapshot);
      });
    // The page controller owns these refs once and passes the same objects to
    // every context rebuild; a route change reuses them instead of resetting.
    const sharedRunRef = { current: false };
    const sharedStopRef = { current: false };
    const workspace = createBatchWorkspace([
      createReviewQueueItem("job_1"),
      createReviewQueueItem("job_2"),
    ]);
    const first = buildContext({
      actions: { generateResume },
      workspace,
      tailoredDraftPreparationRunRef: sharedRunRef,
      tailoredDraftPreparationStopRequestedRef: sharedStopRef,
    });
    const rebuilt = buildContext({
      actions: { generateResume },
      workspace,
      tailoredDraftPreparationRunRef: sharedRunRef,
      tailoredDraftPreparationStopRequestedRef: sharedStopRef,
    });

    first.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);

    first.context.onPrepareTailoredDrafts();
    rebuilt.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await vi.waitFor(() => expect(sharedRunRef.current).toBe(false));

    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
      "job_2",
    ]);
  });

  it("continues past a failed job and reports it in one aggregate message", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation((jobId: string) =>
        jobId === "job_2"
          ? Promise.reject(new Error("generation failed"))
          : Promise.resolve({} as JobFinderWorkspaceSnapshot),
      );
    const { context, getActionMessages, getTailoredDraftPreparation } =
      buildContext({
        actions: { generateResume },
        workspace: createBatchWorkspace([
          createReviewQueueItem("job_1"),
          createReviewQueueItem("job_2"),
          createReviewQueueItem("job_3"),
        ]),
      });

    context.onPrepareTailoredDrafts();

    await vi.waitFor(() =>
      expect(getTailoredDraftPreparation().status).toBe("failed"),
    );

    expect(generateResume).toHaveBeenCalledTimes(3);
    expect(getTailoredDraftPreparation()).toMatchObject({
      attemptedCount: 3,
      completedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const batchMessage = getActionMessages().find(
      (message) => message !== null && /tailored draft/i.test(message),
    );
    expect(batchMessage).toMatch(/2 tailored drafts/);
    expect(batchMessage).toMatch(/1 failed/);
    expect(batchMessage).toMatch(/rerun to target only remaining eligible/i);
  });

  it("stops after the current item finishes and schedules no next item", async () => {
    let resolveFirst: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation(() => {
        return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
          resolveFirst = () => resolve({} as JobFinderWorkspaceSnapshot);
        });
      });
    const { context, getActionMessages, getTailoredDraftPreparation } =
      buildContext({
        actions: { generateResume },
        workspace: createBatchWorkspace([
          createReviewQueueItem("job_1"),
          createReviewQueueItem("job_2"),
        ]),
      });

    context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);

    context.onStopTailoredDraftPreparation();
    resolveFirst?.();

    await vi.waitFor(() =>
      expect(getTailoredDraftPreparation().status).toBe("stopped"),
    );

    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(getTailoredDraftPreparation()).toMatchObject({
      attemptedCount: 1,
      completedCount: 1,
      failedCount: 0,
      status: "stopped",
      totalCount: 2,
    });
    const batchMessage = getActionMessages().find(
      (message) => message !== null && /stopped after/i.test(message),
    );
    expect(batchMessage).toMatch(/Stopped after 1 completed draft/);
  });

  it("keeps the batch alive across route changes: the task center tracks it away from Shortlisted and Stop from any route finishes only the current job", async () => {
    let resolveFirst: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation(() => {
        return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
          resolveFirst = () => resolve({} as JobFinderWorkspaceSnapshot);
        });
      });
    // Route changes rebuild the page context but reuse the controller's refs,
    // so the run, its progress state, and cooperative stop survive navigation.
    const sharedRunRef = { current: false };
    const sharedStopRef = { current: false };
    const sharedDisposedRef = { current: false };
    const workspace = createBatchWorkspace([
      createReviewQueueItem("job_1"),
      createReviewQueueItem("job_2"),
    ]);
    const reviewQueueRoute = buildContext({
      actions: { generateResume },
      workspace,
      tailoredDraftPreparationRunRef: sharedRunRef,
      tailoredDraftPreparationStopRequestedRef: sharedStopRef,
      tailoredDraftPreparationDisposedRef: sharedDisposedRef,
    });
    const discoveryRoute = buildContext({
      actions: { generateResume },
      workspace,
      tailoredDraftPreparationRunRef: sharedRunRef,
      tailoredDraftPreparationStopRequestedRef: sharedStopRef,
      tailoredDraftPreparationDisposedRef: sharedDisposedRef,
    });

    reviewQueueRoute.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);

    // Away from Shortlisted, the task center still reports the active batch
    // and routes its Stop control through the same controller refs.
    const taskModel = buildJobFinderTaskCenterModel({
      isDiscoveryPending: false,
      isResumeImportPending: false,
      tailoredDraftPreparation: reviewQueueRoute.getTailoredDraftPreparation(),
      workspace,
    });
    expect(taskModel.items.map((item) => item.kind)).toEqual([
      "tailored_drafts",
    ]);
    expect(taskModel.items[0]).toMatchObject({
      status: "active",
      countLabel: "0 of 2 prepared",
      canCancel: true,
      cancelKind: "tailored_drafts",
      resumeRoute: "/job-finder/review-queue",
    });

    discoveryRoute.context.onStopTailoredDraftPreparation();
    resolveFirst?.();

    await vi.waitFor(() =>
      expect(reviewQueueRoute.getTailoredDraftPreparation().status).toBe(
        "stopped",
      ),
    );

    // Returning to Shortlisted shows accurate final state; no next item ran.
    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(sharedRunRef.current).toBe(false);
    expect(sharedDisposedRef.current).toBe(false);
    expect(reviewQueueRoute.getTailoredDraftPreparation()).toMatchObject({
      attemptedCount: 1,
      completedCount: 1,
      currentIndex: null,
      status: "stopped",
      totalCount: 2,
    });
    const batchMessage = reviewQueueRoute
      .getActionMessages()
      .find((message) => message !== null && /stopped after/i.test(message));
    expect(batchMessage).toMatch(/Stopped after 1 completed draft/);
    const settledTaskModel = buildJobFinderTaskCenterModel({
      isDiscoveryPending: false,
      isResumeImportPending: false,
      tailoredDraftPreparation: reviewQueueRoute.getTailoredDraftPreparation(),
      workspace,
    });
    expect(
      settledTaskModel.items.some((item) => item.kind === "tailored_drafts"),
    ).toBe(false);
  });

  it("reruns only still-eligible jobs from durable workspace state, keeping failed jobs retryable under the cap", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const firstRun = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
        createReviewQueueItem("job_3"),
      ]),
    });

    firstRun.context.onPrepareTailoredDrafts();
    await vi.waitFor(() =>
      expect(firstRun.getTailoredDraftPreparation().status).toBe("completed"),
    );
    expect(generateResume).toHaveBeenCalledTimes(3);

    // Durable post-batch state: job_1/job_3 have ready artifacts, job_2's
    // generation failed and stays eligible, job_4 was shortlisted afterwards.
    const rerun = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1", { assetStatus: "ready" }),
        createReviewQueueItem("job_2", { assetStatus: "failed" }),
        createReviewQueueItem("job_3", { assetStatus: "ready" }),
        createReviewQueueItem("job_4"),
      ]),
    });

    rerun.context.onPrepareTailoredDrafts();
    await vi.waitFor(() =>
      expect(rerun.getTailoredDraftPreparation().status).toBe("completed"),
    );

    expect(generateResume).toHaveBeenCalledTimes(5);
    expect(generateResume.mock.calls.slice(3).map(([jobId]) => jobId)).toEqual([
      "job_2",
      "job_4",
    ]);
    expect(rerun.getTailoredDraftPreparation()).toMatchObject({
      completedCount: 2,
      failedCount: 0,
      status: "completed",
      totalCount: 2,
    });
  });

  it("caps a run at ten candidates from the existing helpers and reports the remainder", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getActionMessages, getTailoredDraftPreparation } =
      buildContext({
        actions: { generateResume },
        workspace: createBatchWorkspace(
          Array.from({ length: 12 }, (_, index) =>
            createReviewQueueItem(`job_${index}`),
          ),
        ),
      });

    context.onPrepareTailoredDrafts();

    await vi.waitFor(() =>
      expect(getTailoredDraftPreparation().status).toBe("completed"),
    );

    expect(generateResume).toHaveBeenCalledTimes(10);
    expect(getTailoredDraftPreparation()).toMatchObject({
      completedCount: 10,
      eligibleRemainingCount: 2,
      totalCount: 10,
    });
    const batchMessage = getActionMessages().find(
      (message) => message !== null && /tailored draft/i.test(message),
    );
    expect(batchMessage).toMatch(/10 tailored drafts/);
    expect(batchMessage).toMatch(/2 eligible jobs remain/);
  });

  it("treats a start with no eligible jobs as a deterministic no-op", () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const { context, getActionMessages, getTailoredDraftPreparation } =
      buildContext({
        actions: { generateResume },
        workspace: createBatchWorkspace([
          createReviewQueueItem("job_ready", { assetStatus: "ready" }),
        ]),
      });

    context.onPrepareTailoredDrafts();
    context.onStopTailoredDraftPreparation();

    expect(generateResume).not.toHaveBeenCalled();
    expect(getTailoredDraftPreparation().status).toBe("idle");
    expect(getActionMessages().filter((message) => message !== null)).toEqual(
      [],
    );
  });

  it("stops a disposed controller's batch tail after the current item settles without any further writes", async () => {
    let resolveParked: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation(
        () =>
          new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveParked = () => resolve({} as JobFinderWorkspaceSnapshot);
          }),
      );

    // The controller starts the batch and parks on job_1; React teardown of
    // the owning controller then marks it disposed mid-flight.
    const runRef = { current: false };
    const disposedRef = { current: false };
    const mounted = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
        createReviewQueueItem("job_3"),
      ]),
      tailoredDraftPreparationRunRef: runRef,
      tailoredDraftPreparationDisposedRef: disposedRef,
    });
    mounted.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);

    disposedRef.current = true;
    const messagesAtDisposal = mounted.getActionMessages().length;
    const writesAtDisposal = mounted.getTailoredDraftPreparationWriteCount();

    // Job_1 settles, then the loop must not schedule job_2 or job_3, and the
    // orphaned run must stay silent instead of writing into dead state.
    resolveParked?.();
    await vi.waitFor(() => expect(runRef.current).toBe(false));

    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
    ]);
    expect(mounted.getActionMessages()).toHaveLength(messagesAtDisposal);
    expect(mounted.getTailoredDraftPreparationWriteCount()).toBe(
      writesAtDisposal,
    );
  });

  it("blocks a replacement-controller start while a disposed run is parked and releases the global guard once it stops", async () => {
    let resolveParked: (() => void) | undefined;
    let hasParkedFirstCall = false;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation((jobId: string) => {
        if (jobId === "job_1" && !hasParkedFirstCall) {
          return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveParked = () => {
              hasParkedFirstCall = true;
              resolve({} as JobFinderWorkspaceSnapshot);
            };
          });
        }
        return Promise.resolve({} as JobFinderWorkspaceSnapshot);
      });

    // First controller mount owns these refs; starting parks on job_1.
    const firstRunRef = { current: false };
    const firstStopRef = { current: false };
    const firstDisposedRef = { current: false };
    const mounted = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
        createReviewQueueItem("job_3"),
      ]),
      tailoredDraftPreparationRunRef: firstRunRef,
      tailoredDraftPreparationStopRequestedRef: firstStopRef,
      tailoredDraftPreparationDisposedRef: firstDisposedRef,
    });
    mounted.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(firstRunRef.current).toBe(true);

    // True teardown disposes the owning controller; a later remount builds a
    // brand-new controller whose refs are fresh and cannot see the parked
    // run, so only the module-scope guard can prevent a second batch here.
    firstDisposedRef.current = true;
    const remountedRunRef = { current: false };
    const remountedStopRef = { current: false };
    const remountedDisposedRef = { current: false };
    const remounted = buildContext({
      actions: { generateResume },
      workspace: createBatchWorkspace([
        createReviewQueueItem("job_1"),
        createReviewQueueItem("job_2"),
        createReviewQueueItem("job_3"),
      ]),
      tailoredDraftPreparationRunRef: remountedRunRef,
      tailoredDraftPreparationStopRequestedRef: remountedStopRef,
      tailoredDraftPreparationDisposedRef: remountedDisposedRef,
    });

    remounted.context.onPrepareTailoredDrafts();
    expect(generateResume).toHaveBeenCalledTimes(1);
    expect(remountedRunRef.current).toBe(false);
    expect(remounted.getTailoredDraftPreparation().status).toBe("idle");
    expect(
      remounted.getActionMessages().filter((message) => message !== null),
    ).toEqual([]);

    // Settling job_1 ends the disposed run without starting job_2/job_3.
    resolveParked?.();
    await vi.waitFor(() => expect(firstRunRef.current).toBe(false));
    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
    ]);

    // Guard released by the stopped orphan: the fresh controller runs again.
    remounted.context.onPrepareTailoredDrafts();
    expect(remountedRunRef.current).toBe(true);
    await vi.waitFor(() =>
      expect(remounted.getTailoredDraftPreparation().status).toBe("completed"),
    );
    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
      "job_1",
      "job_2",
      "job_3",
    ]);
    expect(remountedRunRef.current).toBe(false);
  });

  it("recomputes the final eligible remainder from the latest workspace after jobs change while the run is parked", async () => {
    let resolveParked: (() => void) | undefined;
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockImplementation((jobId: string) => {
        if (jobId === "job_1") {
          return new Promise<JobFinderWorkspaceSnapshot>((resolve) => {
            resolveParked = () => resolve({} as JobFinderWorkspaceSnapshot);
          });
        }
        return Promise.resolve({} as JobFinderWorkspaceSnapshot);
      });

    const latestWorkspaceRef: MutableRefObject<JobFinderWorkspaceSnapshot | null> =
      { current: null };
    const startWorkspace = createBatchWorkspace([
      createReviewQueueItem("job_1"),
      createReviewQueueItem("job_2"),
      createReviewQueueItem("job_3"),
    ]);
    latestWorkspaceRef.current = startWorkspace;

    const run = buildContext({
      actions: { generateResume },
      workspace: startWorkspace,
      latestWorkspaceRef,
    });

    run.context.onPrepareTailoredDrafts();
    expect(run.getTailoredDraftPreparation()).toMatchObject({
      status: "running",
      eligibleRemainingCount: 0,
      totalCount: 3,
    });

    // Operator edits land while the run is parked: job_3 leaves the queue,
    // job_2 is switched to original resume, job_4 is shortlisted. A rerender
    // publishes the newer snapshot through the ref instead of mutating the
    // captured array.
    latestWorkspaceRef.current = createBatchWorkspace([
      createReviewQueueItem("job_1"),
      createReviewQueueItem("job_2", {
        resumeApplicationMode: "original_resume",
      }),
      createReviewQueueItem("job_4"),
    ]);

    resolveParked?.();
    await vi.waitFor(() =>
      expect(run.getTailoredDraftPreparation().status).toBe("completed"),
    );

    expect(generateResume.mock.calls.map(([jobId]) => jobId)).toEqual([
      "job_1",
      "job_2",
      "job_3",
    ]);
    expect(run.getTailoredDraftPreparation()).toMatchObject({
      completedCount: 3,
      eligibleRemainingCount: 1,
      failedCount: 0,
      status: "completed",
      totalCount: 3,
    });
    const batchMessage = run
      .getActionMessages()
      .find((message) => message !== null && /tailored draft/i.test(message));
    expect(batchMessage).toMatch(/3 tailored drafts/);
    expect(batchMessage).toMatch(/1 eligible job remains/);
  });
});

describe("buildJobFinderPageContext scoped settings saves", () => {
  it("saves application tracker settings through updateTrackerCrm without a whole-settings merge", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const saveSettings = vi.fn<JobFinderShellActions["saveSettings"]>();
    const updateTrackerCrm = vi
      .fn<JobFinderShellActions["updateTrackerCrm"]>()
      .mockResolvedValue(snapshot);
    const { context } = buildContext({
      actions: { saveSettings, updateTrackerCrm },
    });

    const completed = await context.onUpdateTrackerCrm({
      noResponseAutomation: { enabled: true, afterDays: 7 },
      customStages: [],
    });

    expect(completed).toBe(true);
    expect(updateTrackerCrm).toHaveBeenCalledOnce();
    expect(updateTrackerCrm).toHaveBeenCalledWith({
      noResponseAutomation: { enabled: true, afterDays: 7 },
      customStages: [],
    });
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("marks tracker settings saves as failed when the scoped method fails", async () => {
    const failingUpdate = vi
      .fn<JobFinderShellActions["updateTrackerCrm"]>()
      .mockRejectedValue(new Error("commit refused"));
    const { context, getActionState } = buildContext({
      actions: { updateTrackerCrm: failingUpdate },
    });

    const completed = await context.onUpdateTrackerCrm({
      noResponseAutomation: { enabled: false, afterDays: 30 },
      customStages: [],
    });

    expect(completed).toBe(false);
    expect(getActionState().message).toBe("commit refused");
  });
});

describe("buildJobFinderPageContext resume claim confirmation passthrough", () => {
  it("exposes the fenced shell command unchanged for the Resume workspace", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const setResumeClaimConfirmation = vi
      .fn<JobFinderShellActions["setResumeClaimConfirmation"]>()
      .mockResolvedValue(snapshot);
    const { context } = buildContext({
      actions: { setResumeClaimConfirmation },
    });

    const input: JobFinderSetResumeClaimConfirmationInput = {
      intent: "remove",
      jobId: "job_1",
      draftId: "resume_draft_job_1",
      expectedDraftUpdatedAt: "2026-08-26T10:00:00.000Z",
      confirmationId: "claim_confirmation_section_experience_abc",
    };
    const returned = await context.onSetResumeClaimConfirmation(input);

    expect(returned).toBe(snapshot);
    expect(setResumeClaimConfirmation).toHaveBeenCalledOnce();
    expect(setResumeClaimConfirmation).toHaveBeenCalledWith(input);
  });
});
