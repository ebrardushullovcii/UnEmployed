import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import {
  DiscoveryActivityEventSchema,
  type DiscoveryActivityEvent,
  type JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import {
  createActionRunners,
  createDiscoveryWorkspaceRefreshCoordinator,
  createPrimaryPageActions,
} from "./use-job-finder-page-controller-actions";
import { createJobFinderSaveCoordinator } from "./job-finder-save-state";
import {
  type PendingActionState,
  jobFinderPendingActions,
} from "./job-finder-pending-actions";

describe("createActionRunners", () => {
  it("keeps scoped pending state active until async success work finishes", async () => {
    let actionState: ActionState = { message: null };
    let pendingActionState: PendingActionState = {};
    const observedPendingStates: PendingActionState[] = [];
    const scope = jobFinderPendingActions.profileMutation();
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const applyPendingActionState = (
      next: SetStateAction<PendingActionState>,
    ) => {
      pendingActionState =
        typeof next === "function" ? next(pendingActionState) : next;
      observedPendingStates.push({ ...pendingActionState });
    };

    const { runAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });

    const succeeded = await runAction(
      async () => {
        await Promise.resolve();
        return "result";
      },
      async () => {
        await Promise.resolve();
        observedPendingStates.push({ ...pendingActionState });
      },
      "Saved",
      { scope },
    );

    expect(observedPendingStates).toEqual([{ [scope]: 1 }, { [scope]: 1 }, {}]);
    expect(actionState.message).toBe("Saved");
    expect(succeeded).toBe(true);
  });
  it("shows a start message while a long action is pending", async () => {
    let actionState: ActionState = { message: "Previous result" };
    let pendingActionState: PendingActionState = {};
    let resolveAction: (value: string) => void = () => undefined;
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const applyPendingActionState = (
      next: SetStateAction<PendingActionState>,
    ) => {
      pendingActionState =
        typeof next === "function" ? next(pendingActionState) : next;
    };
    const pendingResult = new Promise<string>((resolve) => {
      resolveAction = resolve;
    });
    const { runAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });

    const actionPromise = runAction(
      () => pendingResult,
      () => undefined,
      "Complete",
      {
        scope: jobFinderPendingActions.apply(),
        startMessage: "Preparing safely",
      },
    );

    expect(actionState.message).toBe("Preparing safely");
    expect(pendingActionState).toEqual({
      [jobFinderPendingActions.apply()]: 1,
    });

    resolveAction("done");
    await actionPromise;
    expect(actionState.message).toBe("Complete");
    expect(pendingActionState).toEqual({});
  });

  it("shows the actionable message from Electron IPC failures", async () => {
    let actionState: ActionState = { message: null };
    let pendingActionState: PendingActionState = {};
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const applyPendingActionState = (
      next: SetStateAction<PendingActionState>,
    ) => {
      pendingActionState =
        typeof next === "function" ? next(pendingActionState) : next;
    };
    const { runAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });

    const succeeded = await runAction(
      () =>
        Promise.reject(
          new Error(
            "Error invoking remote method 'job-finder:start-apply-copilot-run': Error: The approved tailored CV changed after it was saved.",
          ),
        ),
      () => undefined,
      "Complete",
      { scope: jobFinderPendingActions.apply() },
    );

    expect(actionState.message).toBe(
      "The approved tailored CV changed after it was saved.",
    );
    expect(pendingActionState).toEqual({});
    expect(succeeded).toBe(false);
  });
  it("keeps a failed save retryable and updates the action message after retry", async () => {
    let actionState: ActionState = { message: null };
    let pendingActionState: PendingActionState = {};
    const saveStates: string[] = [];
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const applyPendingActionState = (
      next: SetStateAction<PendingActionState>,
    ) => {
      pendingActionState =
        typeof next === "function" ? next(pendingActionState) : next;
    };
    const coordinator = createJobFinderSaveCoordinator({
      onStateChange: (state) => saveStates.push(state.state),
    });
    const action = (() => {
      let attempt = 0;
      return () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve("saved");
      };
    })();
    const { runSaveAction } = createActionRunners({
      saveCoordinator: coordinator,
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });

    await runSaveAction({
      action,
      dedupeKey: "profile:retry-test",
      failedFallback: "Profile was not saved.",
      label: "Profile",
      onSuccess: () => undefined,
      savedMessage: "Profile saved.",
      scope: jobFinderPendingActions.profileMutation(),
      surface: "profile",
    });

    expect(actionState.message).toBe("offline");
    await coordinator.retry();
    expect(actionState.message).toBe("Profile saved.");
    expect(saveStates).toEqual(["saving", "failed", "saving", "saved"]);
    expect(pendingActionState).toEqual({});
  });
});

describe("createDiscoveryWorkspaceRefreshCoordinator", () => {
  it("coalesces a 511-source burst and still performs one final refresh", async () => {
    vi.useFakeTimers();

    try {
      const refreshWorkspace = vi.fn().mockResolvedValue({});
      const coordinator = createDiscoveryWorkspaceRefreshCoordinator(
        refreshWorkspace,
        { intervalMs: 250 },
      );

      for (let index = 0; index < 511; index += 1) {
        coordinator.notifySourceCompleted();
      }

      expect(refreshWorkspace).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(250);
      expect(refreshWorkspace).toHaveBeenCalledTimes(1);

      await coordinator.flushFinal();
      expect(refreshWorkspace).toHaveBeenCalledTimes(2);
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps refreshes single-flight when another source completes during a slow read", async () => {
    vi.useFakeTimers();

    try {
      let resolveRefresh: () => void = () => undefined;
      let refreshCallCount = 0;
      const refreshWorkspace = vi.fn(() => {
        refreshCallCount += 1;
        if (refreshCallCount === 1) {
          return new Promise<void>((resolve) => {
            resolveRefresh = resolve;
          });
        }

        return Promise.resolve();
      });
      const coordinator = createDiscoveryWorkspaceRefreshCoordinator(
        refreshWorkspace,
        { intervalMs: 1 },
      );

      coordinator.notifySourceCompleted();
      await vi.advanceTimersByTimeAsync(1);
      expect(refreshWorkspace).toHaveBeenCalledTimes(1);

      coordinator.notifySourceCompleted();
      const finalRefresh = coordinator.flushFinal();
      resolveRefresh();
      await finalRefresh;

      expect(refreshWorkspace).toHaveBeenCalledTimes(2);
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createPrimaryPageActions", () => {
  it("keeps a 511-source discovery run to one final snapshot read", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const refreshWorkspace = vi
      .fn<JobFinderShellActions["refreshWorkspace"]>()
      .mockResolvedValue(snapshot);
    const runAgentDiscovery = vi.fn(
      (onActivity?: (event: DiscoveryActivityEvent) => void) => {
        for (let index = 0; index < 511; index += 1) {
          onActivity?.(
            DiscoveryActivityEventSchema.parse({
              id: `source_${index}_completed`,
              runId: "run_511_sources",
              timestamp: "2026-08-19T10:00:00.000Z",
              kind: "success",
              stage: "target",
              targetId: `source_${index}`,
              terminalState: "completed",
              message: `Finished source ${index}`,
            }),
          );
        }

        return Promise.resolve(snapshot);
      },
    );
    let liveEvents: DiscoveryActivityEvent[] = [];
    let maxRetainedEvents = 0;
    const setLiveDiscoveryEvents = (
      next: SetStateAction<DiscoveryActivityEvent[]>,
    ) => {
      liveEvents = typeof next === "function" ? next(liveEvents) : next;
      maxRetainedEvents = Math.max(maxRetainedEvents, liveEvents.length);
    };
    const runAction = vi.fn(async (action: () => Promise<unknown>) => {
      await action();
      return true;
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        refreshWorkspace,
        runAgentDiscovery,
      } as unknown as JobFinderShellActions,
      runAction,
      setLiveDiscoveryEvents,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onRunAgentDiscovery();

    await vi.waitFor(() => {
      expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(runAgentDiscovery).toHaveBeenCalledTimes(1);
    expect(maxRetainedEvents).toBe(511);
    expect(liveEvents).toEqual([]);
  });

  it("preserves application tracker settings when saving other defaults", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const saveSettings = vi
      .fn<JobFinderShellActions["saveSettings"]>()
      .mockResolvedValue(snapshot);
    const runSaveAction = vi.fn(
      async (input: { action: () => Promise<unknown> }) => {
        await input.action();
        return true;
      },
    );
    const existingSettings = {
      resumeFormat: "pdf",
      resumeTemplateId: "classic_ats",
      fontPreset: "inter_requisite",
      appearanceTheme: "system",
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: false,
      discoveryOnly: false,
      applicationCrm: {
        noResponseAutomation: { enabled: false, afterDays: 30 },
        customStages: [],
      },
    } as JobFinderWorkspaceSnapshot["settings"];
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { saveSettings } as unknown as JobFinderShellActions,
      runSaveAction,
      workspace: { settings: existingSettings } as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    const { applicationCrm: _applicationCrm, ...editableDefaults } =
      existingSettings;
    void _applicationCrm;
    await pageActions.onSaveSettings({
      ...editableDefaults,
      resumeTemplateId: "modern_split",
    } as JobFinderWorkspaceSnapshot["settings"]);

    expect(saveSettings).toHaveBeenCalledWith({
      ...existingSettings,
      resumeTemplateId: "modern_split",
    });
  });

  it("describes a staged automatic run as fill-only preparation without granting submit authority", () => {
    const startAutoApplyRun = vi
      .fn<JobFinderShellActions["startAutoApplyRun"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const runAction = vi.fn().mockResolvedValue(true);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { startAutoApplyRun } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace: () => true,
      navigate: vi.fn(),
      runAction,
      setResumeWorkspaceDirty: vi.fn(),
    } as unknown as PrimaryPageActionArgs);

    pageActions.onStartAutoApply("job_safe_preparation");

    expect(runAction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.stringMatching(
        /fill-only run.*final submission and account creation remain disabled/i,
      ),
      { scope: jobFinderPendingActions.apply() },
    );
    expect(runAction.mock.calls[0]?.[2] as string).not.toMatch(
      /automatic submit/i,
    );
  });

  it("starts the Review Queue Apply Copilot without visual checkpoints or the legacy approval path", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const startApplyCopilotRun = vi
      .fn<JobFinderShellActions["startApplyCopilotRun"]>()
      .mockResolvedValue(snapshot);
    const approveApply = vi
      .fn<JobFinderShellActions["approveApply"]>()
      .mockResolvedValue(snapshot);
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const navigate = vi.fn();
    const setResumeWorkspaceDirty = vi.fn();
    const { runAction } = createActionRunners({
      setActionState,
      setPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    type ApproveApplyArgs = Pick<
      PrimaryPageActionArgs,
      | "actions"
      | "confirmLeaveDirtyResumeWorkspace"
      | "navigate"
      | "runAction"
      | "setResumeWorkspaceDirty"
    >;
    const approveApplyArgs = {
      actions: {
        startApplyCopilotRun,
        approveApply,
      } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace: () => true,
      navigate,
      runAction,
      setResumeWorkspaceDirty,
    } satisfies ApproveApplyArgs;
    const pageActions = createPrimaryPageActions(
      approveApplyArgs as unknown as PrimaryPageActionArgs,
    );

    pageActions.onApproveApply("job_review_queue");

    await vi.waitFor(() => {
      expect(startApplyCopilotRun).toHaveBeenCalledWith("job_review_queue", {
        visualCheckpointsEnabled: false,
      });
      expect(navigate).toHaveBeenCalledWith("/job-finder/applications");
    });
    expect(approveApply).not.toHaveBeenCalled();
  });

  it("recommends a resume strategy with a pending scope and returns the reason", async () => {
    const recommendation = {
      jobId: "job_1",
      campaignId: "campaign_1",
      roleFamily: "Backend Engineering",
      strategyId: "strategy_1",
      strategyName: "Backend",
      source: "role_family",
      reason: "Exact role family match.",
    };
    const recommendResumeStrategy = vi
      .fn<JobFinderShellActions["recommendResumeStrategy"]>()
      .mockResolvedValue(recommendation as never);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const {
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      withPendingScope,
    } = createActionRunners({ setActionState, setPendingActionState });
    const pageActions = createPrimaryPageActions({
      actions: { recommendResumeStrategy } as unknown as JobFinderShellActions,
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      setActionState,
      setPendingActionState,
      withPendingScope,
    } as unknown as PrimaryPageActionArgs);

    const result = await pageActions.onRecommendResumeStrategy({
      jobId: "job_1",
    });

    expect(recommendResumeStrategy).toHaveBeenCalledWith({ jobId: "job_1" });
    expect(result).toMatchObject({ strategyId: "strategy_1" });
    expect(result?.reason).toBe("Exact role family match.");
  });

  it("reports a failed recommendation honestly without throwing", async () => {
    const recommendResumeStrategy = vi
      .fn<JobFinderShellActions["recommendResumeStrategy"]>()
      .mockRejectedValue(new Error("That job is no longer available."));
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const {
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      withPendingScope,
    } = createActionRunners({ setActionState, setPendingActionState });
    const pageActions = createPrimaryPageActions({
      actions: { recommendResumeStrategy } as unknown as JobFinderShellActions,
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      setActionState,
      setPendingActionState,
      withPendingScope,
    } as unknown as PrimaryPageActionArgs);

    const result = await pageActions.onRecommendResumeStrategy({
      jobId: "job_1",
    });

    expect(result).toBeNull();
    expect(setActionState).toHaveBeenCalledWith({
      message: "That job is no longer available.",
    });
  });

  it("selects a resume strategy and explains that reuse never approves the résumé", async () => {
    const selectResumeStrategy = vi
      .fn<JobFinderShellActions["selectResumeStrategy"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const {
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      withPendingScope,
    } = createActionRunners({ setActionState, setPendingActionState });
    const pageActions = createPrimaryPageActions({
      actions: { selectResumeStrategy } as unknown as JobFinderShellActions,
      runAction,
      runResumeWorkspaceAction,
      runSaveAction,
      setActionState,
      setPendingActionState,
      withPendingScope,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onSelectResumeStrategy({
      jobId: "job_1",
      campaignId: "campaign_1",
      strategyId: "strategy_1",
      source: "manual",
      reason: "Picked by the user.",
    });

    await vi.waitFor(() => {
      expect(selectResumeStrategy).toHaveBeenCalledWith({
        jobId: "job_1",
        campaignId: "campaign_1",
        strategyId: "strategy_1",
        source: "manual",
        reason: "Picked by the user.",
      });
      expect(setActionState).toHaveBeenLastCalledWith({
        message:
          "Strategy chosen for this job. The job's resume still needs its own review and approval before it can be used.",
      });
    });
  });
});
