import { afterEach, describe, expect, it, vi } from "vitest";
import type { SetStateAction } from "react";
import {
  CandidateProfileSchema,
  DiscoveryActivityEventSchema,
  JobSearchPreferencesSchema,
  type DiscoveryActivityEvent,
  type JobFinderAgentDiscoveryResult,
  type JobFinderWorkspaceSnapshot,
  type ResumeExtractionStatus,
} from "@unemployed/contracts";
import type {
  ActionState,
  JobFinderShellActions,
} from "@renderer/features/job-finder/lib/job-finder-types";
import {
  createActionRunners,
  createDiscoveryWorkspaceRefreshCoordinator,
  createPrimaryPageActions,
  clearJobFinderNavigationHint,
  noteJobFinderNavigation,
  setJobFinderStatusRoute,
  type ActionStateStatusWrite,
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

  it("keeps a newer save status when an older save fails after it settled", async () => {
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
    let rejectOlder: (error: unknown) => void = () => undefined;
    const coordinator = createJobFinderSaveCoordinator({
      onStateChange: () => undefined,
    });
    const { runSaveAction } = createActionRunners({
      saveCoordinator: coordinator,
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });

    const olderSave = runSaveAction({
      action: () =>
        new Promise<string>((_resolve, reject) => {
          rejectOlder = reject;
        }),
      dedupeKey: "profile:older",
      failedFallback: "Older was not saved.",
      label: "Older",
      onSuccess: () => undefined,
      savedMessage: "Older saved.",
      scope: jobFinderPendingActions.profileMutation(),
      surface: "profile",
    });
    const newerSucceeded = await runSaveAction({
      action: () => Promise.resolve("newer"),
      dedupeKey: "settings:newer",
      failedFallback: "Newer was not saved.",
      label: "Newer",
      onSuccess: () => undefined,
      savedMessage: "Newer saved.",
      scope: jobFinderPendingActions.settingsSave(),
      surface: "settings",
    });
    expect(newerSucceeded).toBe(true);
    expect(actionState.message).toBe("Newer saved.");

    // The older operation settles last with a failure. Its route status
    // writes are fenced by the coordinator's operation token, so the newer
    // success message must survive untouched.
    rejectOlder(new Error("offline"));
    const olderSucceeded = await olderSave;

    expect(olderSucceeded).toBe(false);
    expect(actionState.message).toBe("Newer saved.");
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
  const completeSetupProfile = CandidateProfileSchema.parse({
    id: "candidate_setup_ready",
    firstName: "Alex",
    lastName: "Vanguard",
    fullName: "Alex Vanguard",
    headline: "Senior systems designer",
    summary: "Builds resilient workflows.",
    currentLocation: "London, UK",
    yearsExperience: 10,
    email: "alex@example.com",
    baseResume: {
      id: "resume_setup_ready",
      fileName: "alex.pdf",
      uploadedAt: "2026-08-23T10:00:00.000Z",
      textContent: "Alex Vanguard",
      extractionStatus: "ready",
    },
    workEligibility: {
      authorizedWorkCountries: ["United Kingdom"],
      remoteEligible: true,
    },
    targetRoles: ["Principal Designer"],
    experiences: [
      {
        id: "experience_setup_ready",
        companyName: "Signal Systems",
        title: "Senior Product Designer",
        startDate: "2022-01",
        isCurrent: true,
        summary: "Owned workflow tooling.",
      },
    ],
  });
  const completeSetupPreferences = JobSearchPreferencesSchema.parse({
    targetRoles: ["Principal Designer"],
    locations: ["Remote"],
    workModes: ["remote"],
    minimumSalaryUsd: null,
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    discovery: {
      targets: [
        {
          id: "source_setup_ready",
          label: "Signal Systems careers",
          startingUrl: "https://signal.example/careers",
          enabled: true,
        },
      ],
    },
  });

  function createSetupActions(
    input: {
      profile?: typeof completeSetupProfile;
      preferences?: typeof completeSetupPreferences;
      reviewItems?: JobFinderWorkspaceSnapshot["profileSetupState"]["reviewItems"];
      locationPathname?: string;
    } = {},
  ) {
    const profile = input.profile ?? completeSetupProfile;
    const searchPreferences = input.preferences ?? completeSetupPreferences;
    const profileSetupState: JobFinderWorkspaceSnapshot["profileSetupState"] = {
      status: "in_progress",
      currentStep: "answers",
      completedAt: null,
      lastResumedAt: null,
      reviewItems: input.reviewItems ?? [],
    };
    const snapshot = {
      profile,
      profileSetupState,
      searchPreferences,
    } as unknown as JobFinderWorkspaceSnapshot;
    const saveProfileSetupState = vi.fn(
      (nextState: JobFinderWorkspaceSnapshot["profileSetupState"]) =>
        Promise.resolve({ ...snapshot, profileSetupState: nextState }),
    );
    const navigate = vi.fn();
    const runSaveAction = vi.fn(
      async (saveInput: {
        action: () => Promise<JobFinderWorkspaceSnapshot>;
        onSuccess: (result: JobFinderWorkspaceSnapshot) => void | Promise<void>;
      }) => {
        const result = await saveInput.action();
        await saveInput.onSuccess(result);
        return true;
      },
    );
    const runAction = vi.fn(
      async <TResult>(
        action: () => Promise<TResult>,
        onSuccess: (result: TResult) => void | Promise<void>,
      ) => {
        await onSuccess(await action());
        return true;
      },
    );
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        saveProfileSetupState,
        saveWorkspaceInputs: vi.fn().mockResolvedValue(snapshot),
      } as unknown as JobFinderShellActions,
      locationPathname:
        input.locationPathname ?? "/job-finder/profile/setup",
      navigate,
      runAction,
      runSaveAction,
      workspace: snapshot,
    } as unknown as PrimaryPageActionArgs);

    return { navigate, pageActions, saveProfileSetupState };
  }

  it("changes setup steps without re-navigating the mounted setup route", async () => {
    const setup = createSetupActions();

    setup.pageActions.onResumeProfileSetup("background");

    await vi.waitFor(() =>
      expect(setup.saveProfileSetupState).toHaveBeenCalledOnce(),
    );
    expect(setup.saveProfileSetupState.mock.calls[0]?.[0]).toMatchObject({
      currentStep: "background",
      status: "in_progress",
    });
    expect(setup.navigate).not.toHaveBeenCalled();
  });

  it("navigates into setup when resuming it from another route", async () => {
    const setup = createSetupActions({
      locationPathname: "/job-finder/home",
    });

    setup.pageActions.onResumeProfileSetup("essentials");

    await vi.waitFor(() =>
      expect(setup.saveProfileSetupState).toHaveBeenCalledOnce(),
    );
    expect(setup.navigate).toHaveBeenCalledOnce();
    expect(setup.navigate).toHaveBeenCalledWith("/job-finder/profile/setup");
  });

  it("keeps setup in progress when Answers advances to the readiness check", async () => {
    const { navigate, pageActions, saveProfileSetupState } =
      createSetupActions();

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "ready_check",
    );

    await vi.waitFor(() =>
      expect(saveProfileSetupState).toHaveBeenCalledOnce(),
    );
    expect(saveProfileSetupState.mock.calls[0]?.[0]).toMatchObject({
      completedAt: null,
      currentStep: "ready_check",
      status: "in_progress",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "source",
      completeSetupProfile,
      {
        ...completeSetupPreferences,
        discovery: { ...completeSetupPreferences.discovery, targets: [] },
      },
    ],
    [
      "enabled source",
      completeSetupProfile,
      {
        ...completeSetupPreferences,
        discovery: {
          ...completeSetupPreferences.discovery,
          targets: completeSetupPreferences.discovery.targets.map((target) => ({
            ...target,
            enabled: false,
          })),
        },
      },
    ],
    [
      "work mode",
      completeSetupProfile,
      { ...completeSetupPreferences, workModes: [] },
    ],
    [
      "contact",
      { ...completeSetupProfile, email: null, phone: null },
      completeSetupPreferences,
    ],
    [
      "background",
      { ...completeSetupProfile, experiences: [], projects: [] },
      completeSetupPreferences,
    ],
  ])(
    "blocks an explicit finish when canonical readiness is missing %s",
    async (_label, profile, preferences) => {
      const setup = createSetupActions({ profile, preferences });

      setup.pageActions.onSaveSetupStep(profile, preferences, "ready_check", {
        finishSetup: true,
        openProfile: true,
      });

      await vi.waitFor(() =>
        expect(setup.saveProfileSetupState).toHaveBeenCalledOnce(),
      );
      expect(setup.saveProfileSetupState.mock.calls[0]?.[0].status).toBe(
        "in_progress",
      );
      expect(setup.navigate).not.toHaveBeenCalled();
    },
  );

  it("completes only an explicit canonically ready finish with no blocking reviews", async () => {
    const setup = createSetupActions();

    setup.pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "ready_check",
      { finishSetup: true, openProfile: true },
    );

    await vi.waitFor(() =>
      expect(setup.saveProfileSetupState).toHaveBeenCalledOnce(),
    );
    expect(setup.saveProfileSetupState.mock.calls[0]?.[0]).toMatchObject({
      currentStep: "ready_check",
      status: "completed",
    });
    expect(setup.navigate).toHaveBeenCalledWith("/job-finder/profile");
  });

  it("blocks an explicit ready finish while a blocking review remains pending", async () => {
    const setup = createSetupActions({
      reviewItems: [
        {
          id: "review_setup_blocker",
          step: "essentials",
          target: {
            domain: "identity",
            key: "email",
            recordId: null,
          },
          label: "Email",
          reason: "Confirm the imported contact detail.",
          severity: "recommended",
          status: "pending",
          proposedValue: "alex@example.com",
          sourceSnippet: null,
          sourceCandidateId: null,
          sourceRunId: null,
          createdAt: "2026-08-23T10:00:00.000Z",
          resolvedAt: null,
        },
      ],
    });

    setup.pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "ready_check",
      { finishSetup: true, openProfile: true },
    );

    await vi.waitFor(() =>
      expect(setup.saveProfileSetupState).toHaveBeenCalledOnce(),
    );
    expect(setup.saveProfileSetupState.mock.calls[0]?.[0].status).toBe(
      "in_progress",
    );
    expect(setup.navigate).not.toHaveBeenCalled();
  });

  it("persists a fresh setup journey without bypassing source enablement or the explicit ready-check finish", async () => {
    const disabledPreferences = JobSearchPreferencesSchema.parse({
      ...completeSetupPreferences,
      discovery: {
        ...completeSetupPreferences.discovery,
        targets: completeSetupPreferences.discovery.targets.map((target) => ({
          ...target,
          enabled: false,
        })),
      },
    });
    let persistedSnapshot = {
      profile: completeSetupProfile,
      searchPreferences: disabledPreferences,
      profileSetupState: {
        status: "not_started",
        currentStep: "import",
        completedAt: null,
        lastResumedAt: null,
        reviewItems: [],
      },
    } as unknown as JobFinderWorkspaceSnapshot;
    let shouldCreateImportReview = true;
    const persistedSetupStates: JobFinderWorkspaceSnapshot["profileSetupState"][] =
      [];
    const saveWorkspaceInputs = vi.fn(
      (
        profile: typeof completeSetupProfile,
        searchPreferences: typeof completeSetupPreferences,
      ) => {
        persistedSnapshot = {
          ...persistedSnapshot,
          profile,
          searchPreferences,
          profileSetupState: shouldCreateImportReview
            ? {
                ...persistedSnapshot.profileSetupState,
                reviewItems: [
                  {
                    id: "review_imported_headline",
                    step: "essentials",
                    target: {
                      domain: "identity",
                      key: "headline",
                      recordId: null,
                    },
                    label: "Headline",
                    reason: "Confirm the imported headline.",
                    severity: "recommended",
                    status: "pending",
                    proposedValue: completeSetupProfile.headline,
                    sourceSnippet: completeSetupProfile.headline,
                    sourceCandidateId: "candidate_imported_headline",
                    sourceRunId: "resume_import_first_run",
                    createdAt: "2026-08-23T10:00:00.000Z",
                    resolvedAt: null,
                  },
                ],
              }
            : persistedSnapshot.profileSetupState,
        };
        shouldCreateImportReview = false;
        return Promise.resolve(persistedSnapshot);
      },
    );
    const saveProfileSetupState = vi.fn(
      (profileSetupState: JobFinderWorkspaceSnapshot["profileSetupState"]) => {
        persistedSnapshot = { ...persistedSnapshot, profileSetupState };
        persistedSetupStates.push(profileSetupState);
        return Promise.resolve(persistedSnapshot);
      },
    );
    const navigate = vi.fn();
    const runSaveAction = vi.fn(
      async (saveInput: {
        action: () => Promise<JobFinderWorkspaceSnapshot>;
        onSuccess: (result: JobFinderWorkspaceSnapshot) => void | Promise<void>;
      }) => {
        await saveInput.onSuccess(await saveInput.action());
        return true;
      },
    );
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        saveProfileSetupState,
        saveWorkspaceInputs,
      } as unknown as JobFinderShellActions,
      locationPathname: "/job-finder/profile/setup",
      navigate,
      runSaveAction,
      workspace: persistedSnapshot,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      disabledPreferences,
      "background",
    );
    await vi.waitFor(() => expect(persistedSetupStates).toHaveLength(1));
    expect(persistedSetupStates.at(-1)).toMatchObject({
      status: "in_progress",
      currentStep: "background",
      completedAt: null,
    });
    expect(persistedSetupStates.at(-1)?.reviewItems[0]).toMatchObject({
      id: "review_imported_headline",
      status: "pending",
    });

    persistedSnapshot = {
      ...persistedSnapshot,
      profileSetupState: {
        ...persistedSnapshot.profileSetupState,
        reviewItems: persistedSnapshot.profileSetupState.reviewItems.map(
          (item) => ({
            ...item,
            status: "confirmed" as const,
            resolvedAt: "2026-08-23T10:01:00.000Z",
          }),
        ),
      },
    };

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      disabledPreferences,
      "ready_check",
      { finishSetup: true, openProfile: true },
    );
    await vi.waitFor(() => expect(persistedSetupStates).toHaveLength(2));
    expect(persistedSetupStates.at(-1)).toMatchObject({
      status: "in_progress",
      currentStep: "ready_check",
      completedAt: null,
    });
    expect(navigate).not.toHaveBeenCalled();

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "targeting",
    );
    await vi.waitFor(() => expect(persistedSetupStates).toHaveLength(3));
    expect(
      persistedSnapshot.searchPreferences.discovery.targets[0],
    ).toMatchObject({ enabled: true });
    expect(persistedSetupStates.at(-1)).toMatchObject({
      status: "in_progress",
      currentStep: "targeting",
    });

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "ready_check",
    );
    await vi.waitFor(() => expect(persistedSetupStates).toHaveLength(4));
    expect(persistedSetupStates.at(-1)).toMatchObject({
      status: "in_progress",
      currentStep: "ready_check",
      completedAt: null,
    });
    expect(navigate).not.toHaveBeenCalled();

    pageActions.onSaveSetupStep(
      completeSetupProfile,
      completeSetupPreferences,
      "ready_check",
      { finishSetup: true, openProfile: true },
    );
    await vi.waitFor(() => expect(persistedSetupStates).toHaveLength(5));
    expect(persistedSetupStates.at(-1)).toMatchObject({
      status: "completed",
      currentStep: "ready_check",
    });
    expect(persistedSetupStates.at(-1)?.completedAt).toEqual(
      expect.any(String),
    );
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/job-finder/profile");
  });

  it("keeps a cancelled or failed resume import retryable without replacing the saved profile", async () => {
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
    const importResume = vi
      .fn<JobFinderShellActions["importResume"]>()
      .mockRejectedValueOnce(
        new Error("Resume import failed. Try another file."),
      )
      .mockResolvedValueOnce({
        profile: completeSetupProfile,
      } as JobFinderWorkspaceSnapshot);
    const { runAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { importResume } as unknown as JobFinderShellActions,
      canImportResume: true,
      importResumeGuardMessage: null,
      runAction,
      setActionState: applyActionState,
      workspace: {
        profile: completeSetupProfile,
      } as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onImportResume();
    await vi.waitFor(() =>
      expect(actionState.message).toBe(
        "Resume import failed. Try another file.",
      ),
    );
    expect(pendingActionState).toEqual({});
    expect(completeSetupProfile.fullName).toBe("Alex Vanguard");

    pageActions.onImportResume();
    await vi.waitFor(() =>
      expect(actionState.message).toBe(
        "No resume selected. Your profile was not changed.",
      ),
    );
    expect(importResume).toHaveBeenCalledTimes(2);
    expect(pendingActionState).toEqual({});
  });

  it("classifies resolved imports by extraction status instead of claiming extracted details", async () => {
    const extractionStatusExpectations = [
      {
        extractionStatus: "ready",
        expectedMessage:
          "alex.pdf was imported. Review the extracted details before approving them.",
      },
      {
        extractionStatus: "needs_text",
        expectedMessage:
          "alex.pdf was saved, but no text could be read from it, so no details were extracted. Try another file, or add your details manually in Profile.",
      },
      {
        extractionStatus: "failed",
        expectedMessage:
          "alex.pdf was saved, but extracting its details failed. Try importing it again, or add your details manually in Profile.",
      },
      {
        extractionStatus: "not_started",
        expectedMessage:
          "alex.pdf was saved, but its details have not been extracted yet. Open Profile and refresh from the saved resume.",
      },
    ] as const satisfies ReadonlyArray<{
      extractionStatus: ResumeExtractionStatus;
      expectedMessage: string;
    }>;

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
    const importResume = vi.fn<JobFinderShellActions["importResume"]>();
    for (const expectation of extractionStatusExpectations) {
      // Mirror the domain shape: only `ready`/`not_started` imply readable
      // saved text (`profile-merge.ts` derives both from textContent).
      const hasReadableText =
        expectation.extractionStatus === "ready" ||
        expectation.extractionStatus === "not_started";
      importResume.mockResolvedValueOnce({
        profile: CandidateProfileSchema.parse({
          ...completeSetupProfile,
          id: `candidate_import_${expectation.extractionStatus}`,
          baseResume: {
            ...completeSetupProfile.baseResume,
            id: `resume_import_${expectation.extractionStatus}`,
            extractionStatus: expectation.extractionStatus,
            textContent: hasReadableText
              ? completeSetupProfile.baseResume.textContent
              : null,
          },
        }),
      } as JobFinderWorkspaceSnapshot);
    }
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { importResume } as unknown as JobFinderShellActions,
      canImportResume: true,
      importResumeGuardMessage: null,
      runAction,
      setActionState: applyActionState,
      workspace: {
        profile: completeSetupProfile,
      } as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    for (const expectation of extractionStatusExpectations) {
      pageActions.onImportResume();
      await vi.waitFor(() =>
        expect(actionState.message).toBe(expectation.expectedMessage),
      );
    }

    expect(importResume).toHaveBeenCalledTimes(
      extractionStatusExpectations.length,
    );
    expect(pendingActionState).toEqual({});
  });

  it("propagates dismissal failures through the panel callback without duplicate mutations", async () => {
    const failure = new Error("Employer exclusion was rejected.");
    const dismissDiscoveryJob = vi
      .fn<JobFinderShellActions["dismissDiscoveryJob"]>()
      .mockRejectedValue(failure);
    const runAction = vi.fn(
      async <TResult>(
        action: () => Promise<TResult>,
        _onSuccess: (result: TResult) => void | Promise<void>,
        _successMessage: string | null | ((result: TResult) => string | null),
        options?: { rethrowError?: boolean },
      ) => {
        try {
          await action();
          return true;
        } catch (error) {
          if (options?.rethrowError) throw error;
          return false;
        }
      },
    );
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { dismissDiscoveryJob } as unknown as JobFinderShellActions,
      runAction,
    } as unknown as PrimaryPageActionArgs);

    const panelHandler = async () =>
      pageActions.onDismissJob(
        "job_exclusion",
        ["company"],
        "hide_and_exclude_employer",
        "signal systems",
      );

    await expect(panelHandler()).rejects.toBe(failure);
    expect(runAction).toHaveBeenCalledOnce();
    expect(dismissDiscoveryJob).toHaveBeenCalledOnce();
    expect(dismissDiscoveryJob).toHaveBeenCalledWith(
      "job_exclusion",
      ["company"],
      "hide_and_exclude_employer",
      "signal systems",
    );
    expect(runAction.mock.calls[0]?.[3]).toMatchObject({
      rethrowError: true,
      scope: jobFinderPendingActions.discoveryJob("job_exclusion"),
    });
  });

  it("resolves one ordinary hide mutation and propagates synchronous failures", async () => {
    const dismissDiscoveryJob = vi
      .fn<JobFinderShellActions["dismissDiscoveryJob"]>()
      .mockResolvedValueOnce({} as JobFinderWorkspaceSnapshot)
      .mockImplementationOnce(() => {
        throw new Error("Synchronous dismissal failure.");
      });
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const { runAction } = createActionRunners({
      setActionState,
      setPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { dismissDiscoveryJob } as unknown as JobFinderShellActions,
      runAction,
    } as unknown as PrimaryPageActionArgs);

    await expect(
      pageActions.onDismissJob("job_hide", ["role"]),
    ).resolves.toBeUndefined();
    expect(dismissDiscoveryJob).toHaveBeenNthCalledWith(
      1,
      "job_hide",
      ["role"],
      "hide_job",
      null,
    );

    await expect(
      pageActions.onDismissJob("job_sync_failure", ["other"]),
    ).rejects.toThrow("Synchronous dismissal failure.");
    expect(dismissDiscoveryJob).toHaveBeenCalledTimes(2);
  });

  const submitOutcomeClaimPattern =
    /nothing (?:was |is )?submitted|no application (?:was |is )?submitted|(?:was|were) not submitted|without final submit|non-submitting|(?:stops?|stopped|stopping|pauses?|paused|pausing)(?: before)?(?: the)? final submit/i;

  it("keeps a 511-source discovery run to one final snapshot read", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const workspace = {
      searchPreferences: JobSearchPreferencesSchema.parse({
        targetRoles: ["Engineer"],
        minimumSalaryUsd: null,
        approvalMode: "review_before_submit",
        tailoringMode: "balanced",
        discovery: {
          historyLimit: 5,
          targets: [
            {
              id: "source_enabled",
              label: "Enabled source",
              startingUrl: "https://jobs.example.com",
            },
          ],
        },
      }),
    } as JobFinderWorkspaceSnapshot;
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

        const result: JobFinderAgentDiscoveryResult = {
          outcome: "completed",
          snapshot,
        };
        return Promise.resolve(result);
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
      setDiscoveryRunFeedback: vi.fn(),
      setLiveDiscoveryEvents,
      workspace,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onRunAgentDiscovery();

    await vi.waitFor(() => {
      expect(refreshWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(runAgentDiscovery).toHaveBeenCalledTimes(1);
    expect(maxRetainedEvents).toBe(511);
    expect(liveEvents).toEqual([]);
  });

  it("routes application-default saves through the scoped action without touching tracker CRM or whole-object save", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const saveSettings = vi.fn<JobFinderShellActions["saveSettings"]>();
    const updateApplicationDefaults = vi
      .fn<JobFinderShellActions["updateApplicationDefaults"]>()
      .mockResolvedValue(snapshot);
    const updateTrackerCrm = vi
      .fn<JobFinderShellActions["updateTrackerCrm"]>()
      .mockResolvedValue(snapshot);
    const runSaveAction = vi.fn(
      async (input: { action: () => Promise<unknown> }) => {
        await input.action();
        return true;
      },
    );
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        saveSettings,
        updateApplicationDefaults,
        updateTrackerCrm,
      } as unknown as JobFinderShellActions,
      runSaveAction,
      workspace: {} as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    await pageActions.onUpdateApplicationDefaults({
      resumeApplicationMode: "original_resume",
      resumeTemplateId: "modern_split",
    });

    expect(updateApplicationDefaults).toHaveBeenCalledOnce();
    expect(updateApplicationDefaults).toHaveBeenCalledWith({
      resumeApplicationMode: "original_resume",
      resumeTemplateId: "modern_split",
    });
    expect(saveSettings).not.toHaveBeenCalled();
    expect(updateTrackerCrm).not.toHaveBeenCalled();
  });

  it("routes appearance and workspace-behavior saves through their scoped methods", async () => {
    const snapshot = {} as JobFinderWorkspaceSnapshot;
    const saveSettings = vi.fn<JobFinderShellActions["saveSettings"]>();
    const updateApplicationDefaults =
      vi.fn<JobFinderShellActions["updateApplicationDefaults"]>();
    const updateAppearanceTheme = vi
      .fn<JobFinderShellActions["updateAppearanceTheme"]>()
      .mockResolvedValue(snapshot);
    const updateWorkspaceBehavior = vi
      .fn<JobFinderShellActions["updateWorkspaceBehavior"]>()
      .mockResolvedValue(snapshot);
    const runSaveAction = vi.fn(
      async (input: { action: () => Promise<unknown> }) => {
        await input.action();
        return true;
      },
    );
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        saveSettings,
        updateApplicationDefaults,
        updateAppearanceTheme,
        updateWorkspaceBehavior,
      } as unknown as JobFinderShellActions,
      runSaveAction,
      workspace: {} as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    const behaviorCompleted = await pageActions.onUpdateWorkspaceBehavior({
      keepSessionAlive: true,
      discoveryOnly: true,
    });
    const themeCompleted = await pageActions.onUpdateAppearanceTheme("dark");

    expect(behaviorCompleted).toBe(true);
    expect(themeCompleted).toBe(true);
    expect(updateAppearanceTheme).toHaveBeenCalledWith("dark");
    expect(updateWorkspaceBehavior).toHaveBeenCalledWith({
      keepSessionAlive: true,
      discoveryOnly: true,
    });
    expect(updateApplicationDefaults).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("reports scoped settings failures through the action state and resolves as not saved", async () => {
    let actionState: ActionState = { message: null };
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const setPendingActionState = vi.fn();
    const { runSaveAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState,
    });
    const updateApplicationDefaults = vi
      .fn<JobFinderShellActions["updateApplicationDefaults"]>()
      .mockRejectedValue(new Error("CV defaults were not committed."));
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        updateApplicationDefaults,
      } as unknown as JobFinderShellActions,
      runSaveAction,
      workspace: {} as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    const completed = await pageActions.onUpdateApplicationDefaults({
      resumeTemplateId: "modern_split",
    });

    expect(completed).toBe(false);
    expect(actionState.message).toBe("CV defaults were not committed.");
  });

  it("resolves a no-coordinator scoped save with the real outcome after success", async () => {
    let actionState: ActionState = { message: null };
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === "function" ? next(actionState) : next;
    };
    const setPendingActionState = vi.fn();
    // No saveCoordinator: runSaveAction takes the fallback path.
    const { runSaveAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState,
    });
    const updateAppearanceTheme = vi
      .fn<JobFinderShellActions["updateAppearanceTheme"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);

    const completed = await runSaveAction({
      action: () => updateAppearanceTheme("dark"),
      dedupeKey: "settings:fallback-success",
      failedFallback: "Appearance was not saved.",
      label: "Appearance",
      onSuccess: () => undefined,
      savedMessage: "Appearance saved.",
      scope: jobFinderPendingActions.settingsSave(),
      surface: "settings",
    });

    expect(completed).toBe(true);
    expect(actionState.message).toBe("Appearance saved.");
  });

  it("describes a staged automatic run as fill-only preparation without granting submit authority", async () => {
    const startAutoApplyRun = vi
      .fn<JobFinderShellActions["startAutoApplyRun"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const runAction = vi.fn().mockResolvedValue(true);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { startAutoApplyRun } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace: () => Promise.resolve(true),
      navigate: vi.fn(),
      runAction,
      setResumeWorkspaceDirty: vi.fn(),
    } as unknown as PrimaryPageActionArgs);

    pageActions.onStartAutoApply({ jobId: "job_safe_preparation" });

    // The leave confirmation resolves asynchronously; wait for the flow to
    // start before reading the runner arguments.
    await vi.waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(1);
    });

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

  it("starts the guarded flow from stay-or-leave resolution without window.confirm", async () => {
    // The renderer must ask the app-owned async confirmation instead of a
    // native prompt; stub the native surface so any accidental call is
    // observable in this node environment.
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    vi.stubGlobal("window", { confirm: nativeConfirm });
    try {
      const startAutoApplyRun = vi
        .fn<JobFinderShellActions["startAutoApplyRun"]>()
        .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
      const runAction = vi.fn().mockResolvedValue(true);
      const setResumeWorkspaceDirty = vi.fn();
      type PrimaryPageActionArgs =
        Parameters<typeof createPrimaryPageActions>[0];
      const resolvers: Array<(mayLeave: boolean) => void> = [];
      const pageActions = createPrimaryPageActions({
        actions: { startAutoApplyRun } as unknown as JobFinderShellActions,
        confirmLeaveDirtyResumeWorkspace: () =>
          new Promise<boolean>((resolve) => {
            resolvers.push(resolve);
          }),
        navigate: vi.fn(),
        runAction,
        setResumeWorkspaceDirty,
      } as unknown as PrimaryPageActionArgs);

      // Stay resolves false: the flow never starts and draft state is kept.
      pageActions.onStartAutoApply({ jobId: "job_dirty_stay" });
      await Promise.resolve();
      expect(resolvers).toHaveLength(1);
      expect(runAction).not.toHaveBeenCalled();
      expect(setResumeWorkspaceDirty).not.toHaveBeenCalled();
      resolvers[0]?.(false);
      await Promise.resolve();
      expect(runAction).not.toHaveBeenCalled();

      // Leave resolves true: the staged flow starts exactly once — the
      // stayed flow above must contribute nothing.
      pageActions.onStartAutoApply({ jobId: "job_dirty_leave" });
      await Promise.resolve();
      expect(resolvers).toHaveLength(2);
      resolvers[1]?.(true);
      await vi.waitFor(() => {
        expect(runAction).toHaveBeenCalledTimes(1);
      });

      expect(nativeConfirm).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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
      confirmLeaveDirtyResumeWorkspace: () => Promise.resolve(true),
      navigate,
      runAction,
      setResumeWorkspaceDirty,
    } satisfies ApproveApplyArgs;
    const pageActions = createPrimaryPageActions(
      approveApplyArgs as unknown as PrimaryPageActionArgs,
    );

    pageActions.onApproveApply("job_review_queue");

    await vi.waitFor(() => {
      expect(startApplyCopilotRun).toHaveBeenCalledWith({
        jobId: "job_review_queue",
        visualCheckpointsEnabled: false,
      });
      expect(navigate).toHaveBeenCalledWith("/job-finder/applications");
    });
    expect(approveApply).not.toHaveBeenCalled();
  });

  it("states no-submit authority instead of a promised pre-submit stop when preparing an application", async () => {
    const startApplyCopilotRun = vi
      .fn<JobFinderShellActions["startApplyCopilotRun"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const runAction = vi.fn().mockResolvedValue(true);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { startApplyCopilotRun } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace: () => Promise.resolve(true),
      navigate: vi.fn(),
      runAction,
      setResumeWorkspaceDirty: vi.fn(),
    } as unknown as PrimaryPageActionArgs);

    pageActions.onApproveApply("job_authority");

    // The leave confirmation resolves asynchronously; wait for the flow to
    // start before reading the runner options.
    await vi.waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(1);
    });

    const options = runAction.mock.calls[0]?.[3] as
      | { startMessage?: string }
      | undefined;
    expect(options?.startMessage).toMatch(/no final-submit action/i);
    expect(options?.startMessage).toMatch(/never clicks submit/i);
    expect(options?.startMessage).toMatch(/verify the outcome on the site/i);
    expect(options?.startMessage).not.toMatch(submitOutcomeClaimPattern);
  });

  it("describes Apply Copilot results with submit-authority limits and site verification for both checkpoint modes", async () => {
    const runAction = vi.fn().mockResolvedValue(true);
    const resolveVisualCheckpoints: Array<
      (visualCheckpointsEnabled: boolean) => void
    > = [];
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {} as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace: () => Promise.resolve(true),
      navigate: vi.fn(),
      requestApplyCopilotVisualCheckpoints: ({
        onResolve,
      }: {
        onResolve: (visualCheckpointsEnabled: boolean) => void;
      }) => {
        resolveVisualCheckpoints.push(onResolve);
      },
      runAction,
      setResumeWorkspaceDirty: vi.fn(),
    } as unknown as PrimaryPageActionArgs);

    pageActions.onStartApplyCopilot({ jobId: "job_copilot_checkpoints" });
    resolveVisualCheckpoints[0]?.(true);
    pageActions.onStartApplyCopilot({ jobId: "job_copilot_plain" });
    resolveVisualCheckpoints[1]?.(false);

    // Each flow starts only after its async leave confirmation resolves;
    // wait for both before reading the runner messages.
    await vi.waitFor(() => {
      expect(runAction).toHaveBeenCalledTimes(2);
    });
    const withCheckpoints = runAction.mock.calls[0]?.[2] as string;
    const withoutCheckpoints = runAction.mock.calls[1]?.[2] as string;

    expect(withCheckpoints).toMatch(/with visual checkpoints\./i);
    expect(withoutCheckpoints).toMatch(
      /prepared the application\. Job Finder/i,
    );
    for (const message of [withCheckpoints, withoutCheckpoints]) {
      expect(message).toMatch(/no final-submit action/i);
      expect(message).toMatch(/never clicks submit/i);
      expect(message).toMatch(/verify the outcome on the site/i);
      expect(message).not.toMatch(submitOutcomeClaimPattern);
    }
  });

  it("reports consent decisions with submit-authority wording and no submission outcome claims", () => {
    const resolveApplyConsentRequest = vi
      .fn<JobFinderShellActions["resolveApplyConsentRequest"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const runAction = vi.fn().mockResolvedValue(true);
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: {
        resolveApplyConsentRequest,
      } as unknown as JobFinderShellActions,
      runAction,
    } as unknown as PrimaryPageActionArgs);

    pageActions.onResolveApplyConsentRequest({
      requestId: "consent_request_1",
      runId: "run_1",
      jobId: "job_1",
      applicationRecordId: "application_1",
      action: "approve",
    });
    pageActions.onResolveApplyConsentRequest({
      requestId: "consent_request_2",
      runId: "run_2",
      jobId: "job_2",
      applicationRecordId: "application_2",
      action: "decline",
    });

    expect(runAction).toHaveBeenCalledTimes(2);
    const approved = runAction.mock.calls[0]?.[2] as string;
    const declined = runAction.mock.calls[1]?.[2] as string;

    expect(approved).toMatch(/consent approved/i);
    expect(approved).toMatch(/resumes preparation only/i);
    expect(declined).toMatch(/consent declined/i);
    expect(declined).toMatch(/skips that job/i);
    for (const message of [approved, declined]) {
      expect(message).toMatch(/no final-submit action/i);
      expect(message).toMatch(/never clicks submit/i);
      expect(message).not.toMatch(submitOutcomeClaimPattern);
    }
    expect(approved).toMatch(/verify the outcome on the site/i);
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

  it("selects a resume strategy and explains that reuse never approves the resume", async () => {
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

  it("shortlists in place without navigating or resetting resume workspace state", async () => {
    const queueJobForReview = vi
      .fn<JobFinderShellActions["queueJobForReview"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const navigate = vi.fn();
    const setSelectedReviewJobId = vi.fn();
    const setResumeWorkspaceDirty = vi.fn();
    const confirmLeaveDirtyResumeWorkspace = vi.fn(() => Promise.resolve(true));
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const { runAction, withPendingScope } = createActionRunners({
      setActionState,
      setPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { queueJobForReview } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace,
      navigate,
      runAction,
      setActionState,
      setPendingActionState,
      withPendingScope,
      setSelectedReviewJobId,
      setResumeWorkspaceDirty,
    } as unknown as PrimaryPageActionArgs);

    // Fire-and-forget by design: this test polls the shared action state
    // below instead of consuming the request-local outcome.
    void pageActions.onQueueJob("job_find_results");

    await vi.waitFor(() => {
      expect(queueJobForReview).toHaveBeenCalledWith("job_find_results");
      expect(setActionState).toHaveBeenLastCalledWith({
        message: "Job added to Shortlisted.",
      });
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(setSelectedReviewJobId).not.toHaveBeenCalled();
    expect(setResumeWorkspaceDirty).not.toHaveBeenCalled();
    expect(confirmLeaveDirtyResumeWorkspace).not.toHaveBeenCalled();
  });

  it("keeps single-job resume generation selecting its target", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const setSelectedReviewJobId = vi.fn();
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const { runAction } = createActionRunners({
      setActionState,
      setPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { generateResume } as unknown as JobFinderShellActions,
      runAction,
      setSelectedReviewJobId,
    } as unknown as PrimaryPageActionArgs);

    await pageActions.onGenerateResume("job_single");

    expect(setSelectedReviewJobId).toHaveBeenCalledTimes(1);
    expect(setSelectedReviewJobId).toHaveBeenCalledWith("job_single");
  });

  it("skips selection changes when a batch generates drafts with selectAfter disabled", async () => {
    const generateResume = vi
      .fn<JobFinderShellActions["generateResume"]>()
      .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
    const setSelectedReviewJobId = vi.fn();
    const setActionState = vi.fn();
    const setPendingActionState = vi.fn();
    const { runAction } = createActionRunners({
      setActionState,
      setPendingActionState,
    });
    type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];
    const pageActions = createPrimaryPageActions({
      actions: { generateResume } as unknown as JobFinderShellActions,
      runAction,
      setSelectedReviewJobId,
    } as unknown as PrimaryPageActionArgs);

    await pageActions.onGenerateResume("job_batch_1", {
      selectAfter: false,
    });
    await pageActions.onGenerateResume("job_batch_2", {
      selectAfter: false,
    });

    expect(generateResume).toHaveBeenCalledTimes(2);
    expect(setSelectedReviewJobId).not.toHaveBeenCalled();
  });

  describe("onSetWorkHistoryReviewAcknowledgment", () => {
    const suggestion = {
      id: "work_history_review_experience_9",
      profileRecordId: "experience_9",
      sectionId: "section_experience",
      entryId: null,
      kind: "weak_fit" as const,
      action: "consider_showing" as const,
      severity: "info" as const,
      message: "Hidden for review.",
      messageContentHash: "fnv1a32:6b2bef24",
    };
    const workspace = {
      job: { id: "job_1" },
      draft: {
        id: "draft_1",
        updatedAt: "2026-08-20T09:00:00.000Z",
        workHistoryReviewAcknowledgments: [],
      },
      workHistoryReviewSuggestions: [suggestion],
    };

    function createHarness(options?: {
      getResumeWorkspaceError?: Error;
      staleSuggestionHash?: boolean;
    }) {
      const runnerErrors: unknown[] = [];
      const getResumeWorkspace = options?.getResumeWorkspaceError
        ? vi.fn().mockRejectedValue(options.getResumeWorkspaceError)
        : vi.fn().mockResolvedValue(
            options?.staleSuggestionHash
              ? {
                  ...workspace,
                  workHistoryReviewSuggestions: [
                    { ...suggestion, messageContentHash: "fnv1a32:00000000" },
                  ],
                }
              : workspace,
          );
      const setWorkHistoryReviewAcknowledgment = vi
        .fn<JobFinderShellActions["setWorkHistoryReviewAcknowledgment"]>()
        .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
      const runResumeWorkspaceAction = vi.fn(
        async (
          action: () => Promise<unknown>,
          onSuccess: (result: unknown) => void | Promise<void>,
        ) => {
          try {
            await onSuccess(await action());
          } catch (error) {
            runnerErrors.push(error);
          }
        },
      );
      type PrimaryPageActionArgs = Parameters<
        typeof createPrimaryPageActions
      >[0];
      const pageActions = createPrimaryPageActions({
        actions: {
          getResumeWorkspace,
          setWorkHistoryReviewAcknowledgment,
        } as unknown as JobFinderShellActions,
        refreshResumeWorkspace: vi.fn().mockResolvedValue(true),
        runResumeWorkspaceAction,
      } as unknown as PrimaryPageActionArgs);

      return {
        getResumeWorkspace,
        pageActions,
        runnerErrors,
        setWorkHistoryReviewAcknowledgment,
      };
    }

    it("re-reads the active resume workspace and sends the exact typed command", async () => {
      const harness = createHarness();

      harness.pageActions.onSetWorkHistoryReviewAcknowledgment("job_1", {
        intent: "acknowledge",
        suggestion: {
          id: suggestion.id,
          profileRecordId: suggestion.profileRecordId,
          kind: suggestion.kind,
          action: suggestion.action,
          messageContentHash: suggestion.messageContentHash,
        },
      });
      await vi.waitFor(() => {
        expect(
          harness.setWorkHistoryReviewAcknowledgment,
        ).toHaveBeenCalledOnce();
      });

      expect(harness.getResumeWorkspace).toHaveBeenCalledWith("job_1");
      expect(harness.setWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith({
        intent: "acknowledge",
        jobId: "job_1",
        draftId: "draft_1",
        expectedDraftUpdatedAt: "2026-08-20T09:00:00.000Z",
        suggestionId: "work_history_review_experience_9",
        profileRecordId: "experience_9",
        kind: "weak_fit",
        action: "consider_showing",
        messageContentHash: "fnv1a32:6b2bef24",
        reason: "intentional_omission",
      });
      expect(harness.runnerErrors).toEqual([]);
    });

    it("reports a truthful error and sends nothing when the decision no longer matches the projection", async () => {
      const harness = createHarness({ staleSuggestionHash: true });

      harness.pageActions.onSetWorkHistoryReviewAcknowledgment("job_1", {
        intent: "acknowledge",
        suggestion: {
          id: suggestion.id,
          profileRecordId: suggestion.profileRecordId,
          kind: suggestion.kind,
          action: suggestion.action,
          messageContentHash: suggestion.messageContentHash,
        },
      });
      await vi.waitFor(() => {
        expect(harness.runnerErrors.length).toBe(1);
      });

      expect(harness.setWorkHistoryReviewAcknowledgment).not.toHaveBeenCalled();
      expect(harness.runnerErrors[0]).toBeInstanceOf(Error);
      expect((harness.runnerErrors[0] as Error).message).toMatch(
        /no longer matches the saved draft/i,
      );
    });

    it("surfaces service errors for stale drafts instead of pretending the decision saved", async () => {
      const harness = createHarness({
        getResumeWorkspaceError: new Error(
          "Resume draft changed before this work-history decision could be saved.",
        ),
      });

      harness.pageActions.onSetWorkHistoryReviewAcknowledgment("job_1", {
        intent: "remove",
        acknowledgmentId: "work_history_ack_experience_9_1",
      });
      await vi.waitFor(() => {
        expect(harness.runnerErrors.length).toBe(1);
      });

      expect(harness.setWorkHistoryReviewAcknowledgment).not.toHaveBeenCalled();
      expect((harness.runnerErrors[0] as Error).message).toContain(
        "Resume draft changed before this work-history decision could be saved.",
      );
    });

    it("builds removal commands from the acknowledgment id and refreshes the workspace afterwards", async () => {
      const acknowledgedWorkspace = {
        ...workspace,
        draft: {
          ...workspace.draft,
          workHistoryReviewAcknowledgments: [
            {
              id: "work_history_ack_experience_9_1",
              draftId: "draft_1",
              profileRecordId: "experience_9",
              kind: "weak_fit",
              action: "consider_showing",
              messageContentHash: "fnv1a32:6b2bef24",
              reason: "intentional_omission",
              acknowledgedAt: "2026-08-20T09:30:00.000Z",
            },
          ],
        },
      };
      const runnerErrors: unknown[] = [];
      const refreshResumeWorkspace = vi.fn().mockResolvedValue(true);
      const setWorkHistoryReviewAcknowledgment = vi
        .fn<JobFinderShellActions["setWorkHistoryReviewAcknowledgment"]>()
        .mockResolvedValue({} as JobFinderWorkspaceSnapshot);
      type PrimaryPageActionArgs = Parameters<
        typeof createPrimaryPageActions
      >[0];
      const pageActions = createPrimaryPageActions({
        actions: {
          getResumeWorkspace: vi.fn().mockResolvedValue(acknowledgedWorkspace),
          setWorkHistoryReviewAcknowledgment,
        } as unknown as JobFinderShellActions,
        refreshResumeWorkspace,
        runResumeWorkspaceAction: vi.fn(
          async (
            action: () => Promise<unknown>,
            onSuccess: (result: unknown) => void | Promise<void>,
          ) => {
            try {
              await onSuccess(await action());
            } catch (error) {
              runnerErrors.push(error);
            }
          },
        ),
      } as unknown as PrimaryPageActionArgs);

      pageActions.onSetWorkHistoryReviewAcknowledgment("job_1", {
        intent: "remove",
        acknowledgmentId: "work_history_ack_experience_9_1",
      });
      await vi.waitFor(() => {
        expect(refreshResumeWorkspace).toHaveBeenCalledWith("job_1");
      });

      expect(setWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith({
        intent: "remove",
        jobId: "job_1",
        draftId: "draft_1",
        expectedDraftUpdatedAt: "2026-08-20T09:00:00.000Z",
        acknowledgmentId: "work_history_ack_experience_9_1",
      });
      expect(runnerErrors).toEqual([]);
    });
  });

  describe("action status route ownership", () => {
    afterEach(() => {
      setJobFinderStatusRoute(null);
      clearJobFinderNavigationHint();
    });

    function collectStatusWrites(
      setActionState: ReturnType<typeof vi.fn>,
    ): ActionStateStatusWrite[] {
      return setActionState.mock.calls
        .map((call) => call[0] as ActionStateStatusWrite)
        .filter((next) => next.message !== null);
    }

    it("owns every runner status write by the route where the action started", async () => {
      setJobFinderStatusRoute("/job-finder/discovery");
      const setActionState = vi.fn();
      const setPendingActionState = vi.fn();
      const { runAction } = createActionRunners({
        setActionState,
        setPendingActionState,
      });

      const completed = await runAction(
        () => Promise.resolve("ok"),
        () => undefined,
        "Job hidden.",
        { scope: jobFinderPendingActions.discoveryJob("job_1") },
      );

      expect(completed).toBe(true);
      const statusWrites = collectStatusWrites(setActionState);
      expect(statusWrites).toHaveLength(1);
      expect(statusWrites[0]).toMatchObject({
        message: "Job hidden.",
        ownerPath: "/job-finder/discovery",
      });
    });

    it("owns a save status by the navigation the save performs on completion", async () => {
      setJobFinderStatusRoute("/job-finder/profile/setup");
      // The save's own onSuccess navigates to the profile route; the status
      // written as part of that same completion belongs there.
      noteJobFinderNavigation("/job-finder/profile");
      const setActionState = vi.fn();
      const setPendingActionState = vi.fn();
      const coordinator = createJobFinderSaveCoordinator({
        onStateChange: () => undefined,
      });
      const { runSaveAction } = createActionRunners({
        saveCoordinator: coordinator,
        setActionState,
        setPendingActionState,
      });

      await runSaveAction({
        action: () => Promise.resolve("saved"),
        dedupeKey: "profile:owner-hint",
        failedFallback: "Profile setup was not saved.",
        label: "Profile setup",
        onSuccess: () => undefined,
        savedMessage: "Saved.",
        scope: jobFinderPendingActions.profileSetup(),
        surface: "profile",
      });

      const statusWrites = collectStatusWrites(setActionState);
      expect(statusWrites.at(-1)).toMatchObject({
        message: "Saved.",
        ownerPath: "/job-finder/profile",
      });
    });

    it("keeps a late completion owned by the start route after an unrelated navigation", async () => {
      setJobFinderStatusRoute("/job-finder/review-queue");
      let releaseAction: (value: string) => void = () => undefined;
      const pendingResult = new Promise<string>((resolve) => {
        releaseAction = resolve;
      });
      const setActionState = vi.fn();
      const setPendingActionState = vi.fn();
      const { runAction } = createActionRunners({
        setActionState,
        setPendingActionState,
      });
      const actionPromise = runAction(
        () => pendingResult,
        () => undefined,
        "Drafts prepared for the campaign.",
        { scope: jobFinderPendingActions.campaignRun("campaign_1") },
      );

      // The user navigates to a sibling route while the action is still
      // running; the committed navigation consumes no status write, so no
      // navigation hint remains for the late completion.
      setJobFinderStatusRoute("/job-finder/discovery");
      clearJobFinderNavigationHint();

      releaseAction("done");
      await actionPromise;

      const statusWrites = collectStatusWrites(setActionState);
      expect(statusWrites.at(-1)).toMatchObject({
        message: "Drafts prepared for the campaign.",
        ownerPath: "/job-finder/review-queue",
      });
    });
  });
});

describe("createPrimaryPageActions auto-apply queue outcomes", () => {
  type PrimaryPageActionArgs = Parameters<typeof createPrimaryPageActions>[0];

  const exhaustedCapacity = {
    limit: 20,
    used: 20,
    legacyUncertain: 0,
    remaining: 0,
    localDate: "2026-08-25",
    resetsAt: "2026-08-26T04:00:00.000Z",
  };

  function createQueueHarness(input?: {
    capacity?: Record<string, unknown> | null;
    confirmLeave?: boolean;
    queueRunBehavior?: () => Promise<JobFinderWorkspaceSnapshot>;
  }) {
    let latestMessage: string | null = null;
    const wrappedSetActionState = vi.fn(
      (write: SetStateAction<ActionState>) => {
        const next =
          typeof write === "function"
            ? (
                write as (current: ActionState) => ActionState
              )({ message: null })
            : write;
        latestMessage = next.message;
        return next;
      },
    );
    const readMessage = () => latestMessage;
    const setPendingActionState = vi.fn();
    const { runAction } = createActionRunners({
      setActionState: wrappedSetActionState,
      setPendingActionState,
    });
    const startAutoApplyQueueRun = vi.fn(
      input?.queueRunBehavior ??
        (() => Promise.resolve({} as JobFinderWorkspaceSnapshot)),
    );
    const confirmLeaveDirtyResumeWorkspace = vi
      .fn<(pendingAction: string) => Promise<boolean>>()
      .mockResolvedValue(input?.confirmLeave ?? true);
    const navigate = vi.fn();
    const setResumeWorkspaceDirty = vi.fn();

    const pageActions = createPrimaryPageActions({
      actions: { startAutoApplyQueueRun } as unknown as JobFinderShellActions,
      confirmLeaveDirtyResumeWorkspace,
      locationPathname: "/job-finder/review-queue",
      navigate,
      runAction,
      setActionState: wrappedSetActionState,
      setResumeWorkspaceDirty,
      workspace: {
        dashboard: input?.capacity === undefined ? {} : { globalDailyApplicationPreparationCapacity: input.capacity },
      } as unknown as JobFinderWorkspaceSnapshot,
    } as unknown as PrimaryPageActionArgs);

    return {
      confirmLeaveDirtyResumeWorkspace,
      navigate,
      readMessage,
      setResumeWorkspaceDirty,
      startAutoApplyQueueRun,
      startQueue: pageActions.onStartAutoApplyQueue,
      wrappedSetActionState,
    };
  }

  it("refuses a batch start with a visible status when the daily limit is reached", async () => {
    const harness = createQueueHarness({ capacity: exhaustedCapacity });

    const refusalMessage = expect.stringContaining(
      "20 of 20 used today",
    ) as unknown as string;

    await expect(harness.startQueue(["job_a", "job_b"])).resolves.toMatchObject({
      status: "refused",
      reason: "daily_capacity_exhausted",
      message: refusalMessage,
    });
    expect(harness.startAutoApplyQueueRun).not.toHaveBeenCalled();
    expect(harness.confirmLeaveDirtyResumeWorkspace).not.toHaveBeenCalled();
    expect(harness.navigate).not.toHaveBeenCalled();
    expect(harness.readMessage()).toContain("20 of 20 used today");
  });

  it("reports confirmed only after the run stages, then hands off to Applications", async () => {
    const harness = createQueueHarness({ capacity: null });

    await expect(
      harness.startQueue(["job_a"]),
    ).resolves.toMatchObject({ status: "confirmed" });
    expect(harness.startAutoApplyQueueRun).toHaveBeenCalledWith(["job_a"]);
    expect(harness.setResumeWorkspaceDirty).toHaveBeenCalledWith(false);
    expect(harness.navigate).toHaveBeenCalledWith("/job-finder/applications");
  });

  it("returns failed and keeps visible feedback when staging rejects", async () => {
    const harness = createQueueHarness({
      capacity: null,
      queueRunBehavior: () =>
        Promise.reject(new Error("Batch staging was rejected.")),
    });

    await expect(harness.startQueue(["job_a"])).resolves.toMatchObject({
      status: "failed",
    });
    expect(harness.readMessage()).toMatch(/Batch staging was rejected\./);
    expect(harness.navigate).not.toHaveBeenCalled();
  });

  it("treats staying in the dirty-resume dialog as a refusal without touching runs", async () => {
    const harness = createQueueHarness({
      capacity: null,
      confirmLeave: false,
    });

    await expect(harness.startQueue(["job_a"])).resolves.toMatchObject({
      status: "refused",
      reason: "cancelled_stayed_in_workspace",
    });
    expect(harness.startAutoApplyQueueRun).not.toHaveBeenCalled();
    expect(harness.navigate).not.toHaveBeenCalled();
  });
});
