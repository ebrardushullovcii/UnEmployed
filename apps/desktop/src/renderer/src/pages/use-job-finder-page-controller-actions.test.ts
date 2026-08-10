import { describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import {
  createActionRunners,
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

describe("createPrimaryPageActions", () => {
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
    expect(
      runAction.mock.calls[0]?.[2] as string,
    ).not.toMatch(/automatic submit/i);
  });

  it("starts the Review Queue apply copilot without visual checkpoints or the legacy approval path", async () => {
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
});
