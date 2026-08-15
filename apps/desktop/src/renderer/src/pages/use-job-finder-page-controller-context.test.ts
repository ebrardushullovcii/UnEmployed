import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import type {
  PendingActionState,
} from "./job-finder-pending-actions";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { buildJobFinderPageContext } from "./use-job-finder-page-controller-context";
import type { JobFinderPageContext } from "./job-finder-page-context";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { createJobFinderSaveCoordinator } from "./job-finder-save-state";

function buildContext(overrides: {
  actions: Partial<JobFinderShellActions>;
  workspace?: JobFinderWorkspaceSnapshot;
}) {
  let actionState: ActionState = { message: null };
  let pendingActionState: PendingActionState = {};
  const setActionState = (next: SetStateAction<ActionState>) => {
    actionState = typeof next === "function" ? next(actionState) : next;
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
    confirmLeaveDirtyResumeWorkspace: () => true,
    importResumeGuardMessage: null,
    isAnyPendingAction: () => false,
    isPendingAction: () => false,
    isCurrentResumeAssistantRequest: () => false,
    isCurrentResumeWorkspaceJob: () => false,
    liveDiscoveryEvents: [],
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
    refreshResumeWorkspace: async () => false,
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
    sourceDebugRunIdRef: { current: 0 },
    workspace:
      overrides.workspace ??
      ({ activeCampaignId: "campaign_active" } as JobFinderWorkspaceSnapshot),
  } as unknown as Parameters<typeof buildJobFinderPageContext>[0]);

  return {
    context,
    getActionState: () => actionState,
    getPendingActionState: () => pendingActionState,
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

    const completed = await (context as JobFinderPageContext).onRunCampaignNow(
      "campaign_b",
    );

    expect(runCampaignNow).toHaveBeenCalledWith("campaign_b");
    expect(completed).toBe(true);
    expect(getPendingActionState()).toEqual({});
    expect(getActionState().message).toMatch(/never submits an application/i);
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

    await (context as JobFinderPageContext).onRunCampaignNow();

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

    const actionPromise = (
      context as JobFinderPageContext
    ).onRunCampaignNow("campaign_b");
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
    const pageContext = context as JobFinderPageContext;

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
    const pageContext = context as JobFinderPageContext;

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
    expect(getActionState().message).toMatch(/nothing was submitted/i);
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
    const actionPromise = (context as JobFinderPageContext).onRecordOutcome({
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
    const pageContext = context as JobFinderPageContext;

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
    const pageContext = context as JobFinderPageContext;

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
    const pageContext = context as JobFinderPageContext;

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
