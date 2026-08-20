import type {
  BrowserSessionRuntime,
  OpenBrowserSessionOptions,
} from "@unemployed/browser-runtime";
import {
  JobFinderDiscoveryStateSchema,
  JobFinderActivityControlSchema,
  SetJobFinderActivityControlInputSchema,
  JobSourceSchema,
  SavedJobSchema,
  type JobFinderDiscoveryState,
  type JobFinderWorkspaceSnapshot,
  type JobDiscoveryTarget,
  type JobSearchPreferences,
  type JobSource,
  type SavedJob,
  type SetJobFinderActivityControlInput,
  type SourceDebugRunRecord,
} from "@unemployed/contracts";
import { mergeSessionStates } from "./internal/workspace-service-helpers";
import {
  getActiveDiscoveryTargets,
  resolveAdapterKind,
  updateDiscoveryTarget,
} from "./internal/workspace-helpers";
import { SOURCE_DEBUG_RECENT_HISTORY_LIMIT } from "./internal/workspace-defaults";
import type { WorkspaceServiceContext } from "./internal/workspace-service-context";
import {
  buildStaleResumeDraft,
  hasResumeAffectingJobChange,
} from "./internal/resume-workspace-staleness";
import {
  type CreateJobFinderWorkspaceServiceOptions,
  type JobFinderWorkspaceService,
  type JobFinderWorkspaceResetOptions,
} from "./internal/workspace-service-contracts";
import { createWorkspaceSnapshotProfileMethods } from "./internal/workspace-snapshot-profile-methods";
import { createWorkspaceDiscoveryMethods } from "./internal/workspace-discovery-methods";
import { createWorkspaceSourceDebugMethods } from "./internal/workspace-source-debug-methods";
import { createWorkspaceApplicationMethods } from "./internal/workspace-application-methods";
import { createWorkspaceApplyRunStoreMethods } from "./internal/workspace-apply-run-store-methods";
import { recoverInterruptedApplyRun } from "./internal/workspace-apply-run-recovery";
import { createWorkspaceApplicationAnswerMethods } from "./internal/workspace-application-answer-methods";
import { createWorkspaceGroupedAnswerMethods } from "./internal/workspace-grouped-answer-methods";
import { createWorkspaceCrmMethods } from "./internal/workspace-crm-methods";
import { createWorkspaceIntelligenceMethods } from "./internal/workspace-intelligence-methods";
import { createWorkspaceSafeguardMethods } from "./internal/workspace-safeguard-methods";
import { createWorkspaceUserActionMethods } from "./internal/workspace-user-action-methods";
import { toDiscoverySessionState } from "./internal/discovery-state";
import { uniqueStrings } from "./internal/shared";
import { persistDiscoveryLoginUserAction } from "./internal/workspace-source-user-action";
import {
  createWorkspaceCampaignMethods,
  recordCampaignDiscoveryResult,
} from "./internal/workspace-campaign-methods";
import { assertCampaignCanRun } from "./internal/campaign-dashboard";
import { ensureCampaignState } from "./internal/campaign-dashboard";

export {
  DEFAULT_DISCOVERY_HISTORY_LIMIT,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TARGET_ROLES,
  DEFAULT_ROLE,
  DEFAULT_TARGET_JOB_COUNT,
  PROFILE_PLACEHOLDER_HEADLINE,
  PROFILE_PLACEHOLDER_LOCATION,
  SOURCE_DEBUG_APP_SCHEMA_VERSION,
  SOURCE_DEBUG_PHASES,
  SOURCE_DEBUG_PROMPT_PROFILE_VERSION,
  SOURCE_DEBUG_RECENT_HISTORY_LIMIT,
  SOURCE_DEBUG_TOOLSET_VERSION,
} from "./internal/workspace-defaults";

export type {
  CreateJobFinderWorkspaceServiceOptions,
  CandidateAssetResolver,
  JobFinderDocumentManager,
  JobFinderWorkspaceResetOptions,
  JobFinderWorkspaceService,
  RenderedResumeArtifact,
  ResolvedApplicationCandidateAsset,
  ResumeResearchAdapter,
  ResumeResearchAdapterInput,
} from "./internal/workspace-service-contracts";

export type {
  ResumeRenderDocument,
  ResumeRenderSection,
  ResumeRenderSectionEntry,
} from "./internal/resume-workspace-structure";

export function createJobFinderWorkspaceService(
  options: CreateJobFinderWorkspaceServiceOptions,
): JobFinderWorkspaceService {
  const {
    aiClient,
    visionProvider,
    browserRuntime,
    candidateAssetResolver,
    documentManager,
    exportFileVerifier,
    repository,
    researchAdapter,
  } = options;
  const activeDiscoveryAbortControllerRef = {
    current: null as AbortController | null,
  };
  const activeDiscoveryPromiseRef = {
    current: null as Promise<unknown> | null,
  };
  const activeSourceDebugExecutionIdRef = { current: null as string | null };
  const activeSourceDebugAbortControllerRef = {
    current: null as AbortController | null,
  };
  const activeSourceDebugPromiseRef = {
    current: null as Promise<unknown> | null,
  };
  const activeApplyRunAbortControllers = new Map<string, AbortController>();
  const activeApplyRunPromises = new Map<string, Promise<void>>();
  const applyRunTransitionTails = new Map<string, Promise<void>>();
  let applicationCrmTransitionTail: Promise<void> = Promise.resolve();
  let intelligenceTransitionTail: Promise<void> = Promise.resolve();
  let campaignTransitionTail: Promise<void> = Promise.resolve();
  const activeResumeVisionRunIds = new Set<string>();
  const shutdownPromiseRef = {
    current: null as Promise<void> | null,
  };
  const activeWorkspaceOperations = new Map<string, number>();
  let workspaceResetInProgress = false;

  const WORKSPACE_RESET_IN_PROGRESS_MESSAGE =
    "Job Finder workspace reset is already in progress. Wait for it to finish before starting another operation.";

  function activeWorkspaceOperationLabels(): string[] {
    const labels = new Set(activeWorkspaceOperations.keys());

    if (
      activeDiscoveryAbortControllerRef.current ||
      activeDiscoveryPromiseRef.current
    ) {
      labels.add("discovery");
    }
    if (
      activeSourceDebugAbortControllerRef.current ||
      activeSourceDebugPromiseRef.current
    ) {
      labels.add("source debug");
    }
    if (
      activeApplyRunAbortControllers.size > 0 ||
      activeApplyRunPromises.size > 0
    ) {
      labels.add("application preparation");
    }
    if (activeResumeVisionRunIds.size > 0) {
      labels.add("resume analysis");
    }

    return [...labels];
  }

  function trackWorkspaceOperation<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (workspaceResetInProgress) {
      return Promise.reject(new Error(WORKSPACE_RESET_IN_PROGRESS_MESSAGE));
    }

    activeWorkspaceOperations.set(
      label,
      (activeWorkspaceOperations.get(label) ?? 0) + 1,
    );

    let result: Promise<T>;
    try {
      result = operation();
    } catch (error) {
      const count = activeWorkspaceOperations.get(label) ?? 0;
      if (count <= 1) {
        activeWorkspaceOperations.delete(label);
      } else {
        activeWorkspaceOperations.set(label, count - 1);
      }
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return result.finally(() => {
      const count = activeWorkspaceOperations.get(label) ?? 0;
      if (count <= 1) {
        activeWorkspaceOperations.delete(label);
      } else {
        activeWorkspaceOperations.set(label, count - 1);
      }
    });
  }

  async function resetWorkspace(
    seed: Parameters<JobFinderWorkspaceService["resetWorkspace"]>[0],
    options?: JobFinderWorkspaceResetOptions,
  ): Promise<JobFinderWorkspaceSnapshot> {
    if (workspaceResetInProgress) {
      throw new Error(WORKSPACE_RESET_IN_PROGRESS_MESSAGE);
    }

    const activeLabels = activeWorkspaceOperationLabels();
    if (activeLabels.length > 0) {
      throw new Error(
        `Job Finder workspace reset is unavailable while ${activeLabels.join(", ")} ${activeLabels.length === 1 ? "is" : "are"} still running. Wait for the operation${activeLabels.length === 1 ? "" : "s"} to finish or cancel it, then try reset again. No workspace data was removed.`,
      );
    }

    workspaceResetInProgress = true;
    try {
      await options?.beforeStateReset?.();
      return await snapshotProfileMethods.resetWorkspace(seed);
    } finally {
      workspaceResetInProgress = false;
    }
  }

  const context: WorkspaceServiceContext = {
    aiClient,
    ...(visionProvider ? { visionProvider } : {}),
    browserRuntime,
    ...(candidateAssetResolver ? { candidateAssetResolver } : {}),
    documentManager,
    ...(exportFileVerifier ? { exportFileVerifier } : {}),
    repository,
    activeDiscoveryAbortControllerRef,
    activeDiscoveryPromiseRef,
    activeSourceDebugExecutionIdRef,
    activeSourceDebugAbortControllerRef,
    activeSourceDebugPromiseRef,
    activeApplyRunAbortControllers,
    activeApplyRunPromises,
    applyRunTransitionTails,
    withApplicationCrmTransition<T>(operation: () => Promise<T>): Promise<T> {
      const result = applicationCrmTransitionTail.then(operation, operation);
      applicationCrmTransitionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    withIntelligenceTransition<T>(operation: () => Promise<T>): Promise<T> {
      const result = intelligenceTransitionTail.then(operation, operation);
      intelligenceTransitionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    withCampaignTransition<T>(operation: () => Promise<T>): Promise<T> {
      const result = campaignTransitionTail.then(operation, operation);
      campaignTransitionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    activeResumeVisionRunIds,
    getWorkspaceSnapshot: () =>
      Promise.reject(new Error("Workspace snapshot method not initialized.")),
    getActiveCampaignId: async () =>
      (await repository.getCampaignState())?.activeCampaignId ?? null,
    resumeApplicationUserAction: () =>
      Promise.reject(
        new Error("Application user action resumer not initialized."),
      ),
    runSourceDebugWorkflow: () =>
      Promise.reject(new Error("Source debug workflow not initialized.")),
    async persistDiscoveryState(
      updater: (current: JobFinderDiscoveryState) => JobFinderDiscoveryState,
    ): Promise<JobFinderDiscoveryState> {
      const current = await repository.getDiscoveryState();
      const next = JobFinderDiscoveryStateSchema.parse(updater(current));
      await repository.saveDiscoveryState(next);
      return next;
    },
    async persistSavedJobsAndDiscoveryState({
      savedJobs,
      discoveryState,
    }): Promise<void> {
      await repository.replaceSavedJobsAndDiscoveryState({
        savedJobs: SavedJobSchema.array().parse(savedJobs),
        discoveryState: JobFinderDiscoveryStateSchema.parse(discoveryState),
      });
    },
    async refreshDiscoverySessions(
      searchPreferences: JobSearchPreferences,
    ): Promise<JobFinderDiscoveryState["sessions"]> {
      const targets = getActiveDiscoveryTargets(searchPreferences);
      const adapterKinds = uniqueStrings(
        targets.map((target) => resolveAdapterKind(target)),
      ) as JobSource[];
      const currentDiscovery = await repository.getDiscoveryState();
      let nextSessions = currentDiscovery.sessions;

      if (adapterKinds.length === 0) {
        return [];
      }

      for (const adapterKind of adapterKinds) {
        try {
          const session = await browserRuntime.getSessionState(adapterKind);
          nextSessions = mergeSessionStates(
            nextSessions,
            toDiscoverySessionState(session),
          );
        } catch {
          // Keep persisted state when runtime refresh fails.
        }
      }

      if (
        JSON.stringify(nextSessions) !==
        JSON.stringify(currentDiscovery.sessions)
      ) {
        const latestDiscovery = await repository.getDiscoveryState();

        if (
          JSON.stringify(nextSessions) !==
          JSON.stringify(latestDiscovery.sessions)
        ) {
          await repository.saveDiscoveryState(
            JobFinderDiscoveryStateSchema.parse({
              ...latestDiscovery,
              sessions: nextSessions,
            }),
          );
        }
      }

      return nextSessions;
    },
    async saveDiscoveryTargetUpdate(
      targetId: string,
      updater: (target: JobDiscoveryTarget) => JobDiscoveryTarget,
    ): Promise<JobSearchPreferences> {
      const searchPreferences = await repository.getSearchPreferences();
      const nextSearchPreferences = updateDiscoveryTarget(
        searchPreferences,
        targetId,
        updater,
      );
      await repository.saveSearchPreferences(nextSearchPreferences);
      return nextSearchPreferences;
    },
    async persistSourceDebugRun(run: SourceDebugRunRecord): Promise<void> {
      await repository.upsertSourceDebugRun(run);
      await context.persistDiscoveryState((current) => ({
        ...current,
        activeSourceDebugRun:
          run.state === "running" || run.state === "paused_manual"
            ? run
            : current.activeSourceDebugRun?.id === run.id
              ? null
              : current.activeSourceDebugRun,
        recentSourceDebugRuns: [
          run,
          ...current.recentSourceDebugRuns.filter(
            (entry) => entry.id !== run.id,
          ),
        ].slice(0, SOURCE_DEBUG_RECENT_HISTORY_LIMIT),
      }));
      await persistDiscoveryLoginUserAction({ repository, run });
    },
    async persistBrowserSessionState(
      session: Awaited<ReturnType<BrowserSessionRuntime["openSession"]>>,
    ): Promise<void> {
      await context.persistDiscoveryState((current) => ({
        ...current,
        sessions: mergeSessionStates(
          current.sessions,
          toDiscoverySessionState(session),
        ),
      }));
    },
    async staleApprovedResumeDrafts(
      staleReason: string,
      jobIds?: readonly string[],
    ): Promise<void> {
      const [drafts, tailoredAssets] = await Promise.all([
        repository.listResumeDrafts(),
        repository.listTailoredAssets(),
      ]);

      const targetJobIds = jobIds ? new Set(jobIds) : null;

      for (const draft of drafts) {
        if (
          !draft.approvedAt &&
          !draft.approvedExportId &&
          draft.status !== "approved"
        ) {
          continue;
        }

        if (targetJobIds && !targetJobIds.has(draft.jobId)) {
          continue;
        }

        const existingAsset =
          tailoredAssets.find((asset) => asset.jobId === draft.jobId) ?? null;
        const staleDraft = buildStaleResumeDraft(draft, staleReason);

        await repository.clearResumeApproval({
          draft: staleDraft,
          staleReason,
          tailoredAsset: existingAsset
            ? {
                ...existingAsset,
                storagePath: null,
                updatedAt: staleDraft.updatedAt,
              }
            : null,
        });
      }
    },
    async openRunBrowserSession(
      source: JobSource,
      options?: OpenBrowserSessionOptions,
    ): Promise<void> {
      const session = await browserRuntime.openSession(source, options);
      await context.persistBrowserSessionState(session);
    },
    async closeRunBrowserSession(source: JobSource): Promise<void> {
      const session = await browserRuntime.closeSession(source);
      await context.persistBrowserSessionState(session);
    },
    async updateJob(
      jobId: string,
      updater: (job: SavedJob) => SavedJob,
    ): Promise<void> {
      const savedJobs = await repository.listSavedJobs();
      let found = false;
      const nextJobs = savedJobs.map((job) => {
        if (job.id !== jobId) {
          return job;
        }

        found = true;
        return SavedJobSchema.parse(updater(job));
      });

      if (!found) {
        throw new Error(`Unknown Job Finder job '${jobId}'.`);
      }

      const previousJob = savedJobs.find((job) => job.id === jobId) ?? null;
      const nextJob = nextJobs.find((job) => job.id === jobId) ?? null;

      if (
        previousJob &&
        nextJob &&
        hasResumeAffectingJobChange(previousJob, nextJob)
      ) {
        const staleReason =
          "Saved job details changed after approval and the resume needs a fresh review.";
        const [draft, tailoredAssets] = await Promise.all([
          repository.getResumeDraftByJobId(jobId),
          repository.listTailoredAssets(),
        ]);

        if (
          draft &&
          (draft.approvedAt ||
            draft.approvedExportId ||
            draft.status === "approved")
        ) {
          const existingAsset =
            tailoredAssets.find((asset) => asset.jobId === draft.jobId) ?? null;
          const staleDraft = buildStaleResumeDraft(draft, staleReason);

          await repository.replaceSavedJobsAndClearResumeApproval({
            savedJobs: nextJobs,
            draft: staleDraft,
            staleReason,
            tailoredAsset: existingAsset
              ? {
                  ...existingAsset,
                  storagePath: null,
                  updatedAt: staleDraft.updatedAt,
                }
              : null,
          });
          return;
        }
      }

      await repository.replaceSavedJobs(nextJobs);
    },
    ...(researchAdapter ? { researchAdapter } : {}),
  };

  const snapshotProfileMethods = createWorkspaceSnapshotProfileMethods(context);
  const applicationMethods = createWorkspaceApplicationMethods(context);
  context.resumeApplicationUserAction = (request) =>
    applicationMethods.resumeApplicationUserAction(request);
  const userActionMethods = createWorkspaceUserActionMethods(context);
  let userActionRecoveryPromise: Promise<void> | null = null;

  async function resumeVerifyingUserActions(): Promise<void> {
    if (!userActionRecoveryPromise) {
      userActionRecoveryPromise =
        userActionMethods.resumeVerifyingUserActions();
    }

    try {
      await userActionRecoveryPromise;
    } catch (error) {
      userActionRecoveryPromise = null;
      throw error;
    }
  }

  async function resumeVerifyingUserActionsAfterCommit(): Promise<void> {
    // A grouped apply commits verifying request transitions after an earlier
    // snapshot may already have completed a recovery run, so the cached
    // recovery promise must not suppress this fresh resume. Concurrent
    // callers share this single in-flight recovery run, and a crash between
    // the grouped commit and this resume still recovers on the next restart
    // because the recovery promise is only ever held in memory.
    userActionRecoveryPromise = userActionMethods.resumeVerifyingUserActions();

    try {
      await userActionRecoveryPromise;
    } catch (error) {
      userActionRecoveryPromise = null;
      throw error;
    }
  }

  async function getWorkspaceSnapshot() {
    await resumeVerifyingUserActions();
    return snapshotProfileMethods.getWorkspaceSnapshot();
  }

  async function getWorkspaceBootstrap() {
    return snapshotProfileMethods.getWorkspaceBootstrap();
  }

  context.getWorkspaceSnapshot = getWorkspaceSnapshot;
  const crmMethods = createWorkspaceCrmMethods({
    ctx: context,
    getWorkspaceSnapshot,
  });
  const intelligenceMethods = createWorkspaceIntelligenceMethods({
    ctx: context,
    getWorkspaceSnapshot,
    callbacks: {
      shortlist: applicationMethods.queueJobForReview,
      reject: (jobId) =>
        applicationMethods.dismissDiscoveryJob({
          jobId,
          reasons: ["other"],
        }),
      restore: async (jobId) => {
        const job = (await repository.listSavedJobs()).find(
          (candidate) => candidate.id === jobId,
        );
        if (job?.status === "archived") {
          await applicationMethods.restoreDismissedDiscoveryJob(jobId);
        } else if (job && job.status !== "discovered") {
          await applicationMethods.removeJobFromReview(jobId);
        }
      },
    },
  });
  const safeguardMethods = createWorkspaceSafeguardMethods({
    ctx: context,
    getWorkspaceSnapshot,
  });

  const sourceDebugMethods = createWorkspaceSourceDebugMethods(context);
  context.runSourceDebugWorkflow = sourceDebugMethods.runSourceDebugWorkflow;
  const discoveryMethods = createWorkspaceDiscoveryMethods(context);
  const campaignMethods = createWorkspaceCampaignMethods({
    ctx: context,
    getWorkspaceSnapshot,
    runCampaignDiscovery: async (campaignContext) => {
      await requireDiscoverySafeguardClearance();
      return discoveryMethods.runCampaignDiscovery(campaignContext);
    },
    afterCampaignRun: () => intelligenceMethods.refreshCompanyIntelligence(),
  });

  async function runCampaignScopedDiscovery(
    executor: () => Promise<JobFinderWorkspaceSnapshot>,
  ) {
    await requireDiscoverySafeguardClearance();
    let [campaignState, savedJobs] = await Promise.all([
      repository.getCampaignState(),
      repository.listSavedJobs(),
    ]);
    if (!campaignState) {
      campaignState = await ensureCampaignState({
        repository,
        searchPreferences: await repository.getSearchPreferences(),
      });
      savedJobs = await repository.listSavedJobs();
    }
    const campaignId = campaignState.activeCampaignId;
    const campaign = campaignState.campaigns.find(
      (candidate) => candidate.id === campaignId,
    );
    if (!campaign) {
      throw new Error("The active job search campaign is unavailable.");
    }
    assertCampaignCanRun(campaign);
    await executor();
    await recordCampaignDiscoveryResult({
      ctx: context,
      campaignId,
      beforeJobProvenanceFingerprints: new Map(
        savedJobs.map((job) => [job.id, JSON.stringify(job.provenance)]),
      ),
    });
    return intelligenceMethods.refreshCompanyIntelligence();
  }

  const ACTIVITY_PAUSED_MESSAGE =
    "Browser and application activity is paused. Resume it from the Job Finder command center before starting new work.";

  async function requireActivityEnabled(): Promise<void> {
    if ((await repository.getActivityControl()).paused) {
      throw new Error(ACTIVITY_PAUSED_MESSAGE);
    }
  }

  async function requireCampaignPreparationCapacity(
    jobIds: readonly string[],
  ): Promise<void> {
    const state = await repository.getCampaignState();
    const campaign = state?.campaigns.find(
      (candidate) => candidate.id === state.activeCampaignId,
    );
    if (!campaign) return;
    const unscopedJobId = jobIds.find(
      (jobId) => !campaign.jobIds.includes(jobId),
    );
    if (unscopedJobId) {
      throw new Error(
        "That job is not retained in the active campaign. Select its campaign before preparing an application.",
      );
    }
    if (jobIds.length > campaign.limits.preparationBatchSize) {
      throw new Error(
        `This campaign allows ${campaign.limits.preparationBatchSize} jobs per preparation batch.`,
      );
    }
    if (campaign.limits.dailyPreparationLimit !== null) {
      const today = new Date().toISOString().slice(0, 10);
      const preparedToday = (await repository.listApplyRuns())
        .filter((run) => run.createdAt.slice(0, 10) === today)
        .reduce((total, run) => total + run.totalJobs, 0);
      if (
        preparedToday + jobIds.length >
        campaign.limits.dailyPreparationLimit
      ) {
        throw new Error(
          `This campaign has reached its daily preparation limit of ${campaign.limits.dailyPreparationLimit} jobs.`,
        );
      }
    }
  }

  async function requireApplicationSafeguardClearance(
    jobIds: readonly string[],
  ): Promise<void> {
    const blockers =
      await safeguardMethods.evaluateApplicationPreparationBlockers(jobIds);
    safeguardMethods.requireNoBlockers(blockers);
  }

  async function requireDiscoverySafeguardClearance(): Promise<void> {
    const blockers = await safeguardMethods.evaluateGlobalDiscoveryBlockers();
    safeguardMethods.requireNoBlockers(blockers);
  }

  async function setActivityControl(
    rawInput: SetJobFinderActivityControlInput,
  ) {
    const input = SetJobFinderActivityControlInputSchema.parse(rawInput);
    const now = new Date().toISOString();
    await repository.saveActivityControl(
      JobFinderActivityControlSchema.parse({
        paused: input.paused,
        pausedAt: input.paused ? now : null,
        reason: input.paused ? (input.reason ?? null) : null,
      }),
    );
    if (input.paused) {
      const activeRunIds = [...activeApplyRunAbortControllers.keys()];
      activeDiscoveryAbortControllerRef.current?.abort();
      activeSourceDebugAbortControllerRef.current?.abort();
      for (const controller of activeApplyRunAbortControllers.values()) {
        controller.abort();
      }
      await Promise.allSettled(
        [
          activeDiscoveryPromiseRef.current,
          activeSourceDebugPromiseRef.current,
          ...activeApplyRunPromises.values(),
        ].filter((value): value is Promise<unknown> => value != null),
      );
      await Promise.allSettled(
        activeRunIds.map((runId) => applicationMethods.cancelApplyRun(runId)),
      );
    }
    return getWorkspaceSnapshot();
  }
  const applyRunStoreMethods = createWorkspaceApplyRunStoreMethods(context);
  const applicationAnswerMethods = createWorkspaceApplicationAnswerMethods(
    context,
    applyRunStoreMethods.getApplyRunDetails,
  );
  const groupedAnswerMethods = createWorkspaceGroupedAnswerMethods({
    ctx: context,
    getWorkspaceSnapshot,
    resumeVerifyingUserActions: resumeVerifyingUserActionsAfterCommit,
  });

  function isJobSource(value: unknown): value is JobSource {
    return JobSourceSchema.safeParse(value).success;
  }

  function describeShutdownFailure(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
  }

  async function shutdown(): Promise<void> {
    if (shutdownPromiseRef.current) {
      return shutdownPromiseRef.current;
    }

    shutdownPromiseRef.current = (async () => {
      const activeApplyRunIds = [...activeApplyRunAbortControllers.keys()];
      activeDiscoveryAbortControllerRef.current?.abort();
      activeSourceDebugAbortControllerRef.current?.abort();
      for (const controller of activeApplyRunAbortControllers.values()) {
        controller.abort();
      }

      await Promise.allSettled(
        [
          activeDiscoveryPromiseRef.current,
          activeSourceDebugPromiseRef.current,
          ...activeApplyRunPromises.values(),
        ].filter((value): value is Promise<unknown> => value != null),
      );

      if (activeApplyRunIds.length > 0) {
        const activeApplyRunIdSet = new Set(activeApplyRunIds);
        const applyRuns = await repository.listApplyRuns().catch(() => []);
        const completedAt = new Date().toISOString();
        await Promise.allSettled(
          applyRuns
            .filter(
              (run) =>
                activeApplyRunIdSet.has(run.id) && run.state === "running",
            )
            .map((run) =>
              repository.upsertApplyRun(
                recoverInterruptedApplyRun(run, completedAt),
              ),
            ),
        );
      }

      const discoveryState = await repository
        .getDiscoveryState()
        .catch(() => null);
      const sessionSources = uniqueStrings(
        (discoveryState?.sessions ?? []).map((session) => session.adapterKind),
      ).filter(isJobSource);
      const shutdownResults = await Promise.allSettled([
        ...sessionSources.map((source) => browserRuntime.closeSession(source)),
        repository.close(),
      ]);
      const rejectedResults = shutdownResults.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (rejectedResults.length > 0) {
        console.warn(
          "[JobFinderWorkspace] Shutdown completed with failures",
          rejectedResults.map((result) =>
            describeShutdownFailure(result.reason),
          ),
        );
      }
    })();

    return shutdownPromiseRef.current;
  }

  return {
    shutdown,
    ...snapshotProfileMethods,
    resetWorkspace,
    runResumeImport: (input) =>
      trackWorkspaceOperation("resume import", () =>
        snapshotProfileMethods.runResumeImport(input),
      ),
    analyzeProfileFromResume: () =>
      trackWorkspaceOperation("resume analysis", () =>
        snapshotProfileMethods.analyzeProfileFromResume(),
      ),
    sendProfileCopilotMessage: (content, context) =>
      trackWorkspaceOperation("profile proposal", () =>
        snapshotProfileMethods.sendProfileCopilotMessage(content, context),
      ),
    proposeProfileCopilotChange: (content, context) =>
      trackWorkspaceOperation("profile proposal", () =>
        snapshotProfileMethods.proposeProfileCopilotChange(content, context),
      ),
    applyProfileCopilotPatchGroup: (patchGroupId) =>
      trackWorkspaceOperation("profile proposal", () =>
        snapshotProfileMethods.applyProfileCopilotPatchGroup(patchGroupId),
      ),
    rejectProfileCopilotPatchGroup: (patchGroupId) =>
      trackWorkspaceOperation("profile proposal", () =>
        snapshotProfileMethods.rejectProfileCopilotPatchGroup(patchGroupId),
      ),
    undoProfileRevision: (revisionId) =>
      trackWorkspaceOperation("profile proposal", () =>
        snapshotProfileMethods.undoProfileRevision(revisionId),
      ),
    openBrowserSession: async (input) => {
      await requireActivityEnabled();
      return snapshotProfileMethods.openBrowserSession(input);
    },
    ...campaignMethods,
    runCampaignNow: (input) =>
      trackWorkspaceOperation("discovery", () =>
        campaignMethods.runCampaignNow(input),
      ),
    runDueScheduledCampaigns: (now) =>
      trackWorkspaceOperation("discovery", () =>
        campaignMethods.runDueScheduledCampaigns(now),
      ),
    ...intelligenceMethods,
    setActivityControl,
    getWorkspaceSnapshot: () =>
      trackWorkspaceOperation("workspace read", () => getWorkspaceSnapshot()),
    getWorkspaceBootstrap,
    mutateSafeguards: safeguardMethods.mutateSafeguards,
    getSafeguardsOverview: safeguardMethods.getSafeguardsOverview,
    evaluateApplicationSafeguardBlockers:
      safeguardMethods.evaluateApplicationPreparationBlockers,
    evaluateDiscoverySafeguardBlockers:
      safeguardMethods.evaluateGlobalDiscoveryBlockers,
    ...discoveryMethods,
    runDiscovery: (targetId) =>
      trackWorkspaceOperation("discovery", async () => {
        await requireActivityEnabled();
        return runCampaignScopedDiscovery(() =>
          discoveryMethods.runDiscovery(targetId),
        );
      }),
    runAgentDiscovery: (onActivity, signal, targetId) =>
      trackWorkspaceOperation("discovery", async () => {
        await requireActivityEnabled();
        return runCampaignScopedDiscovery(() =>
          discoveryMethods.runAgentDiscovery(onActivity, signal, targetId),
        );
      }),
    runDiscoveryForTarget: (targetId, onActivity, signal) =>
      trackWorkspaceOperation("discovery", async () => {
        await requireActivityEnabled();
        return runCampaignScopedDiscovery(() =>
          discoveryMethods.runDiscoveryForTarget(targetId, onActivity, signal),
        );
      }),
    ...sourceDebugMethods,
    runSourceDebug: (targetId, signal, onProgress) =>
      trackWorkspaceOperation("source debug", async () => {
        await requireActivityEnabled();
        return sourceDebugMethods.runSourceDebug(targetId, signal, onProgress);
      }),
    verifySourceInstructions: (targetId, instructionId, signal, onProgress) =>
      trackWorkspaceOperation("source debug", async () => {
        await requireActivityEnabled();
        return sourceDebugMethods.verifySourceInstructions(
          targetId,
          instructionId,
          signal,
          onProgress,
        );
      }),
    ...applyRunStoreMethods,
    ...applicationAnswerMethods,
    ...groupedAnswerMethods,
    performUserAction: (command) =>
      trackWorkspaceOperation("application user action", () =>
        userActionMethods.performUserAction(command),
      ),
    ...applicationMethods,
    generateResume: (jobId) =>
      trackWorkspaceOperation("resume generation", () =>
        applicationMethods.generateResume(jobId),
      ),
    regenerateResumeDraft: (jobId) =>
      trackWorkspaceOperation("resume generation", () =>
        applicationMethods.regenerateResumeDraft(jobId),
      ),
    regenerateResumeSection: (jobId, sectionId) =>
      trackWorkspaceOperation("resume generation", () =>
        applicationMethods.regenerateResumeSection(jobId, sectionId),
      ),
    sendResumeAssistantMessage: (jobId, content) =>
      trackWorkspaceOperation("resume proposal", () =>
        applicationMethods.sendResumeAssistantMessage(jobId, content),
      ),
    resolveResumeAssistantProposal: (jobId, proposalId, action, patchIds) =>
      trackWorkspaceOperation("resume proposal", () =>
        applicationMethods.resolveResumeAssistantProposal(
          jobId,
          proposalId,
          action,
          patchIds,
        ),
      ),
    startApplyCopilotRun: (jobId, options) =>
      trackWorkspaceOperation("application preparation", async () => {
        await requireActivityEnabled();
        await requireCampaignPreparationCapacity([jobId]);
        await requireApplicationSafeguardClearance([jobId]);
        return applicationMethods.startApplyCopilotRun(jobId, options);
      }),
    startAutoApplyRun: (jobId) =>
      trackWorkspaceOperation("application preparation", async () => {
        await requireActivityEnabled();
        await requireCampaignPreparationCapacity([jobId]);
        await requireApplicationSafeguardClearance([jobId]);
        return applicationMethods.startAutoApplyRun(jobId);
      }),
    startAutoApplyQueueRun: (jobIds) =>
      trackWorkspaceOperation("application preparation", async () => {
        await requireActivityEnabled();
        await requireCampaignPreparationCapacity(jobIds);
        await requireApplicationSafeguardClearance(jobIds);
        return applicationMethods.startAutoApplyQueueRun(jobIds);
      }),
    approveApplyRun: (runId) =>
      trackWorkspaceOperation("application preparation", () =>
        applicationMethods.approveApplyRun(runId),
      ),
    cancelApplyRun: (runId) =>
      trackWorkspaceOperation("application preparation", () =>
        applicationMethods.cancelApplyRun(runId),
      ),
    resolveApplyConsentRequest: (requestId, action) =>
      trackWorkspaceOperation("application preparation", async () => {
        await requireActivityEnabled();
        return applicationMethods.resolveApplyConsentRequest(requestId, action);
      }),
    revokeApplyRunApproval: (runId) =>
      trackWorkspaceOperation("application preparation", () =>
        applicationMethods.revokeApplyRunApproval(runId),
      ),
    approveApply: (jobId) =>
      trackWorkspaceOperation("application preparation", async () => {
        await requireActivityEnabled();
        return applicationMethods.approveApply(jobId);
      }),
    ...crmMethods,
  };
}
