import type {
  BrowserSessionRuntime,
  OpenBrowserSessionOptions,
} from "@unemployed/browser-runtime";
import { randomUUID } from "node:crypto";
import {
  ApplicationRecordSchema,
  JobFinderActivityControlSchema,
  JobSearchCampaignCollectionSchema,
  SetJobFinderActivityControlInputSchema,
  JobSourceSchema,
  SavedJobSchema,
  type ApplyJobResult,
  type ApplyRun,
  type JobFinderDiscoveryState,
  type JobFinderWorkspaceSnapshot,
  type JobDiscoveryTarget,
  type JobSearchCampaign,
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
import type {
  ApplicationPreparationCapacityToken,
  WorkspaceServiceContext,
} from "./internal/workspace-service-context";
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
import {
  recoverInterruptedApplyJobResult,
  recoverInterruptedApplyRun,
  recoverInterruptedExactLineageProjections,
} from "./internal/workspace-apply-run-recovery";
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
import {
  deriveGlobalDailyApplicationPreparationCapacity,
  localDateKey,
  MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY,
  MAX_EMPLOYER_APPLICATION_JOBS_PER_RUN,
} from "./internal/application-preparation-capacity";

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

export {
  MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY,
  MAX_EMPLOYER_APPLICATION_JOBS_PER_RUN,
} from "./internal/application-preparation-capacity";

type PreparationCapacityState = {
  tokens: Set<ApplicationPreparationCapacityToken>;
  transitionTail: Promise<void>;
};

const preparationCapacityStates = new WeakMap<
  object,
  PreparationCapacityState
>();

function getPreparationCapacityState(
  repository: object,
): PreparationCapacityState {
  const existing = preparationCapacityStates.get(repository);
  if (existing) return existing;

  const created = {
    tokens: new Set<ApplicationPreparationCapacityToken>(),
    transitionTail: Promise.resolve(),
  };
  preparationCapacityStates.set(repository, created);
  return created;
}

async function withPreparationCapacityTransition<T>(
  repository: object,
  operation: (state: PreparationCapacityState) => T | Promise<T>,
): Promise<T> {
  const state = getPreparationCapacityState(repository);
  const previous = state.transitionTail;
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  state.transitionTail = previous.catch(() => undefined).then(() => current);

  await previous.catch(() => undefined);
  try {
    return await operation(state);
  } finally {
    releaseCurrent();
  }
}

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
    markApplicationPreparationStarted,
    requireApplicationSafeguardClearance: () =>
      Promise.reject(new Error("Application safeguard gate not initialized.")),
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
    persistDiscoveryState: (updater) =>
      repository.commitDiscoveryStateUpdate(updater),
    async refreshDiscoverySessions(
      searchPreferences: JobSearchPreferences,
    ): Promise<JobFinderDiscoveryState["sessions"]> {
      const targets = getActiveDiscoveryTargets(searchPreferences);
      const adapterKinds = uniqueStrings(
        targets.map((target) => resolveAdapterKind(target)),
      ) as JobSource[];
      if (adapterKinds.length === 0) {
        return [];
      }

      const observedSessions: JobFinderDiscoveryState["sessions"] = [];
      for (const adapterKind of adapterKinds) {
        try {
          observedSessions.push(
            toDiscoverySessionState(
              await browserRuntime.getSessionState(adapterKind),
            ),
          );
        } catch {
          // Keep persisted state when runtime refresh fails.
        }
      }

      if (observedSessions.length === 0) {
        const unchanged = await repository.getDiscoveryState();
        return unchanged.sessions;
      }

      const next = await context.persistDiscoveryState((current) => ({
        ...current,
        sessions: observedSessions.reduce(
          (sessions, observation) => mergeSessionStates(sessions, observation),
          current.sessions,
        ),
      }));
      return next.sessions;
    },
    async saveDiscoveryTargetUpdate(
      targetId: string,
      updater: (target: JobDiscoveryTarget) => JobDiscoveryTarget,
    ): Promise<JobSearchPreferences> {
      // Source-debug target metadata (validated-guidance pointers and run/verify
      // stamps) must stay visible to the active campaign's runs and survive
      // plan switches, so the update is applied inside one serialized atomic
      // commit that mirrors the changed target into both the global search
      // preferences and the active campaign's stored preferences. Plan
      // selects/saves serialize on the same campaign transition, so neither
      // side can clobber the other or leave the active pointer paired with
      // preferences that miss this update.
      return context.withCampaignTransition(async () => {
        const campaignState = await repository.getCampaignState();
        if (!campaignState) {
          // No collection exists yet, so there is nothing to mirror; every
          // collection creator holds this same transition and therefore none
          // can appear between this read and the write below.
          const searchPreferences = await repository.getSearchPreferences();
          const nextSearchPreferences = updateDiscoveryTarget(
            searchPreferences,
            targetId,
            updater,
          );
          await repository.saveSearchPreferences(nextSearchPreferences);
          return nextSearchPreferences;
        }
        return repository.commitCampaignPreferencesUpdate((current) => {
          const state = current.campaignState;
          if (!state) {
            throw new Error("Campaign state is unavailable.");
          }
          const nextSearchPreferences = updateDiscoveryTarget(
            current.searchPreferences,
            targetId,
            updater,
          );
          const now = new Date().toISOString();
          const nextState = JobSearchCampaignCollectionSchema.parse({
            ...state,
            campaigns: state.campaigns.map((campaign) =>
              campaign.id === state.activeCampaignId &&
              campaign.searchPreferences.discovery.targets.some(
                (candidate) => candidate.id === targetId,
              )
                ? {
                    ...campaign,
                    searchPreferences: nextSearchPreferences,
                    sourceTargetIds: nextSearchPreferences.discovery.targets
                      .filter((target) => target.enabled)
                      .map((target) => target.id),
                    updatedAt: now,
                  }
                : campaign,
            ),
          });
          return {
            result: nextSearchPreferences,
            campaignState: nextState,
            searchPreferences: nextSearchPreferences,
          };
        });
      });
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
      let found = false;

      await repository.commitSavedJobDelta({
        update: (job) => {
          if (job.id !== jobId) {
            return job;
          }

          found = true;
          const updatedJob = SavedJobSchema.parse(updater(job));
          if (updatedJob.id !== jobId) {
            throw new Error("Saved job updates must preserve the job id.");
          }
          return updatedJob;
        },
        clearResumeApproval: {
          jobId,
          staleReason:
            "Saved job details changed after approval and the resume needs a fresh review.",
          shouldClear: (previousJob, nextJob) =>
            hasResumeAffectingJobChange(previousJob, nextJob),
        },
      });

      if (!found) {
        throw new Error(`Unknown Job Finder job '${jobId}'.`);
      }
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
          action: "hide_job",
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
  context.requireApplicationSafeguardClearance = async (jobIds, savedJobs) => {
    const blockers =
      await safeguardMethods.evaluateApplicationPreparationBlockers(
        jobIds,
        savedJobs,
      );
    safeguardMethods.requireNoBlockers(blockers);
  };

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
    let [campaignState, savedJobs, discoveryState] = await Promise.all([
      repository.getCampaignState(),
      repository.listSavedJobs(),
      repository.getDiscoveryState(),
    ]);
    if (!campaignState) {
      // The stale missing-read only nominates this path: state is re-read
      // inside one campaign transition and the default is created only if it
      // is still absent, so a concurrently created or mutated collection can
      // never be overwritten by an unlocked bootstrap.
      campaignState = await context.withCampaignTransition(async () => {
        const latestState = await repository.getCampaignState();
        if (latestState) return latestState;
        return ensureCampaignState({
          repository,
          searchPreferences: await repository.getSearchPreferences(),
        });
      });
      [savedJobs, discoveryState] = await Promise.all([
        repository.listSavedJobs(),
        repository.getDiscoveryState(),
      ]);
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
        [...savedJobs, ...discoveryState.pendingDiscoveryJobs].map((job) => [
          job.id,
          JSON.stringify(job.provenance),
        ]),
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

  async function resolvePreparationCampaign(
    run: ApplyRun | null,
  ): Promise<JobSearchCampaign | null> {
    let state = await repository.getCampaignState();
    if (!state) {
      // Same serialized missing-state bootstrap as scoped discovery: re-read
      // under one campaign transition and create only if still absent.
      state = await context.withCampaignTransition(async () => {
        const latestState = await repository.getCampaignState();
        if (latestState) return latestState;
        return ensureCampaignState({
          repository,
          searchPreferences: await repository.getSearchPreferences(),
        });
      });
    }
    if (run?.campaignId) {
      const capturedCampaign = state.campaigns.find(
        (candidate) => candidate.id === run.campaignId,
      );
      if (!capturedCampaign) {
        throw new Error(
          "The campaign captured by this apply run is no longer available. Restage the run from a current campaign before continuing.",
        );
      }
      return capturedCampaign;
    }
    return (
      state.campaigns.find(
        (candidate) => candidate.id === state.activeCampaignId,
      ) ?? null
    );
  }

  function assertCampaignPreparationScope(
    campaign: JobSearchCampaign,
    jobIds: readonly string[],
  ): void {
    const uniqueJobIds = uniqueStrings(jobIds);
    const unscopedJobId = uniqueJobIds.find(
      (jobId) => !campaign.jobIds.includes(jobId),
    );
    if (unscopedJobId) {
      throw new Error(
        "That job is not retained in the active campaign. Select its campaign before preparing an application.",
      );
    }
  }

  /**
   * Global daily preparation capacity counts every campaign-attributed and
   * legacy run, but only jobs that left `planned`. Each exact run/job lineage
   * is counted once. Run creation is the durable timestamp shared by current
   * and legacy lineages, and its local calendar day defines the safety window.
   */
  async function requireGlobalDailyPreparationCapacity(
    prospectiveJobIds: readonly string[],
    reservedJobs: number,
  ): Promise<void> {
    const uniqueProspectiveJobIds = uniqueStrings(prospectiveJobIds);
    if (uniqueProspectiveJobIds.length === 0) {
      return;
    }
    const [applyRuns, applyJobResults] = await Promise.all([
      repository.listApplyRuns(),
      repository.listApplyJobResults(),
    ]);
    const capacity = deriveGlobalDailyApplicationPreparationCapacity({
      applyRuns,
      applyJobResults,
    });
    if (
      capacity.used +
        capacity.legacyUncertain +
        reservedJobs +
        uniqueProspectiveJobIds.length >
      MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY
    ) {
      throw new Error(
        `The global daily preparation safeguard allows at most ${MAX_BEGUN_EMPLOYER_APPLICATIONS_PER_LOCAL_DAY} begun employer applications per local day.`,
      );
    }
  }

  async function requireEmployerApplicationCapacity(
    jobIds: readonly string[],
    run: ApplyRun | null = null,
    reservedJobs = 0,
  ): Promise<void> {
    const scopedJobIds = run?.jobIds ?? jobIds;
    if (
      uniqueStrings(scopedJobIds).length > MAX_EMPLOYER_APPLICATION_JOBS_PER_RUN
    ) {
      throw new Error(
        `Employer-application runs are limited to ${MAX_EMPLOYER_APPLICATION_JOBS_PER_RUN} unique jobs.`,
      );
    }
    const campaign = await resolvePreparationCampaign(run);
    if (campaign) {
      assertCampaignPreparationScope(campaign, scopedJobIds);
    }
    await requireGlobalDailyPreparationCapacity(jobIds, reservedJobs);
  }

  async function requireApplicationSafeguardClearance(
    jobIds: readonly string[],
  ): Promise<void> {
    if (!context.requireApplicationSafeguardClearance) {
      throw new Error("Application safeguard gate not initialized.");
    }
    await context.requireApplicationSafeguardClearance(jobIds);
  }

  /**
   * The one gate sequence every application preparation entry point shares:
   * global activity, campaign lineage scope, fixed global capacity, and
   * safeguard blockers. Entry points must delegate here instead of assembling
   * their own subset so no route can skip a gate the others enforce.
   */
  async function requireApplicationPreparationGuards(
    jobIds: readonly string[],
    run: ApplyRun | null = null,
    reservedJobs = 0,
  ): Promise<void> {
    await requireActivityEnabled();
    await requireEmployerApplicationCapacity(jobIds, run, reservedJobs);
    await requireApplicationSafeguardClearance(jobIds);
  }

  async function withApplicationPreparationReservation<T>(
    resolveScope: () =>
      | {
          jobIds: readonly string[];
          run: ApplyRun | null;
        }
      | Promise<{
          jobIds: readonly string[];
          run: ApplyRun | null;
        }>,
    operation: (token: ApplicationPreparationCapacityToken) => Promise<T>,
  ): Promise<T> {
    const token = await withPreparationCapacityTransition(
      repository,
      async (capacityState) => {
        const scope = await resolveScope();
        const localDate = localDateKey(new Date());
        const reservedJobs = [...capacityState.tokens]
          .filter((candidate) => candidate.localDate === localDate)
          .reduce((total, candidate) => total + candidate.remainingJobs, 0);
        await requireApplicationPreparationGuards(
          scope.jobIds,
          scope.run,
          reservedJobs,
        );
        const created = {
          localDate,
          remainingJobs: uniqueStrings(scope.jobIds).length,
        } satisfies ApplicationPreparationCapacityToken;
        capacityState.tokens.add(created);
        return created;
      },
    );

    try {
      return await operation(token);
    } finally {
      await withPreparationCapacityTransition(repository, (state) => {
        state.tokens.delete(token);
      });
    }
  }

  async function markApplicationPreparationStarted(
    input: { resultId: string; runId: string; jobId: string },
    token?: ApplicationPreparationCapacityToken,
  ): Promise<ApplyJobResult> {
    return withPreparationCapacityTransition(repository, async (state) => {
      const current = (
        await repository.listApplyJobResults({
          runId: input.runId,
          jobId: input.jobId,
        })
      ).find((result) => result.id === input.resultId);
      if (!current) {
        throw new Error(`Unknown apply result '${input.resultId}'.`);
      }
      if (current.applicationPreparationStartedAt) {
        return current;
      }

      const now = new Date();
      const startedAt = now.toISOString();
      const startedLocalDate = localDateKey(now);
      const reservedToday = [...state.tokens]
        .filter((candidate) => candidate.localDate === startedLocalDate)
        .reduce((total, candidate) => total + candidate.remainingJobs, 0);
      if (!token || token.localDate !== startedLocalDate) {
        await requireGlobalDailyPreparationCapacity(
          [input.jobId],
          reservedToday,
        );
      }
      if (token) {
        if (token.remainingJobs <= 0) {
          throw new Error(
            "Application preparation capacity token is exhausted.",
          );
        }
        token.remainingJobs -= 1;
      }
      const marked = await repository.markApplicationPreparationStarted({
        ...input,
        startedAt,
        startedLocalDate,
      });
      return marked.result;
    });
  }

  async function resolveApplicationStartRecordId(
    jobId: string,
    applicationRecordId?: string | null,
  ): Promise<string | undefined> {
    if (applicationRecordId !== null) {
      return applicationRecordId;
    }

    const job = (await repository.listSavedJobs()).find(
      (entry) => entry.id === jobId,
    );
    if (!job) {
      throw new Error(
        `Unable to create an application record for unknown job '${jobId}'.`,
      );
    }

    const now = new Date().toISOString();
    const record = ApplicationRecordSchema.parse({
      id: `application_${randomUUID()}`,
      jobId,
      title: job.title,
      company: job.company,
      status: job.status,
      lastActionLabel: "New application record created for safe preparation.",
      nextActionLabel: "Prepare the application when you are ready.",
      lastUpdatedAt: now,
    });
    await repository.upsertApplicationRecord(record);
    return record.id;
  }

  /**
   * Guards approving (and therefore executing) an existing staged or paused
   * run with exactly the gates a fresh preparation start faces. Only jobs
   * that have not begun yet count as new consumption; jobs already prepared
   * inside this run lineage are already reflected in today's quota through
   * their result rows.
   */
  async function listPendingApplyRunJobIds(run: ApplyRun): Promise<string[]> {
    const results = await repository.listApplyJobResults({ runId: run.id });
    return uniqueStrings(run.jobIds).filter((jobId) => {
      const result = results.find((candidate) => candidate.jobId === jobId);
      return (
        result?.state === "planned" && !result.applicationPreparationStartedAt
      );
    });
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
        const [applyRuns, applyResults] = await Promise.all([
          repository.listApplyRuns().catch(() => []),
          repository.listApplyJobResults().catch(() => []),
        ]);
        const completedAt = new Date().toISOString();
        const activeRunningRuns = applyRuns.filter(
          (run) => activeApplyRunIdSet.has(run.id) && run.state === "running",
        );
        const activeResults = applyResults.filter((result) =>
          activeApplyRunIdSet.has(result.runId),
        );
        const recoveredRuns = activeRunningRuns.map((run) =>
          recoverInterruptedApplyRun(
            run,
            completedAt,
            activeResults.filter((result) => result.runId === run.id),
          ),
        );
        const recoveredResults: ApplyJobResult[] = [];
        const terminalizedRecordIds = new Set<string>();
        for (const result of activeResults) {
          const recoveredResult = recoverInterruptedApplyJobResult(
            result,
            completedAt,
          );
          if (!recoveredResult) {
            continue;
          }
          // Exact applicationRecordId lineage only: legacy null-lineage
          // rows are terminalized without being attributed to a record.
          if (result.applicationRecordId) {
            terminalizedRecordIds.add(result.applicationRecordId);
          }
          recoveredResults.push(recoveredResult);
        }
        // Crash-resumable persist order: exact-lineage projections land
        // before the run/result commits, so a crash mid-shutdown leaves the
        // parent runs durably non-terminal and the next startup replay
        // finishes the job idempotently instead of stranding in-progress
        // attempt/record rows under already-terminal runs.
        await Promise.allSettled([
          recoverInterruptedExactLineageProjections({
            repository,
            interruptedRecordIds: terminalizedRecordIds,
            completedAt,
            eventIdFor: (recordId) =>
              `event_shutdown_app_closed_recovery_${recordId}`,
          }),
        ]);
        await Promise.allSettled([
          ...recoveredRuns.map((run) => repository.upsertApplyRun(run)),
          ...recoveredResults.map((result) =>
            repository.upsertApplyJobResult(result),
          ),
        ]);
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
    startApplyCopilotRun: (jobId, options, applicationRecordId) =>
      trackWorkspaceOperation("application preparation", async () => {
        return withApplicationPreparationReservation(
          () => ({ jobIds: [jobId], run: null }),
          async (token) => {
            const exactApplicationRecordId =
              await resolveApplicationStartRecordId(jobId, applicationRecordId);
            return applicationMethods.startApplyCopilotRun(
              jobId,
              options,
              exactApplicationRecordId,
              token,
            );
          },
        );
      }),
    startAutoApplyRun: (jobId, applicationRecordId) =>
      trackWorkspaceOperation("application preparation", async () => {
        return withApplicationPreparationReservation(
          () => ({ jobIds: [jobId], run: null }),
          async () => {
            const exactApplicationRecordId =
              await resolveApplicationStartRecordId(jobId, applicationRecordId);
            return applicationMethods.startAutoApplyRun(
              jobId,
              exactApplicationRecordId,
            );
          },
        );
      }),
    startAutoApplyQueueRun: (jobIds) =>
      trackWorkspaceOperation("application preparation", async () => {
        return withApplicationPreparationReservation(
          () => ({ jobIds, run: null }),
          () => applicationMethods.startAutoApplyQueueRun(jobIds),
        );
      }),
    approveApplyRun: (runId) =>
      trackWorkspaceOperation("application preparation", async () => {
        return withApplicationPreparationReservation(
          async () => {
            const run =
              (await repository.listApplyRuns()).find(
                (entry) => entry.id === runId,
              ) ?? null;
            if (!run) {
              throw new Error(`Unknown apply run '${runId}'.`);
            }
            return {
              jobIds: await listPendingApplyRunJobIds(run),
              run,
            };
          },
          (token) => applicationMethods.approveApplyRun(runId, token),
        );
      }),
    cancelApplyRun: (runId) =>
      trackWorkspaceOperation("application preparation", () =>
        applicationMethods.cancelApplyRun(runId),
      ),
    resolveApplyConsentRequest: (requestId, action) =>
      trackWorkspaceOperation("application preparation", async () => {
        return withApplicationPreparationReservation(
          async () => {
            const [requests, runs, results] = await Promise.all([
              repository.listApplicationConsentRequests(),
              repository.listApplyRuns(),
              repository.listApplyJobResults(),
            ]);
            const request = requests.find((entry) => entry.id === requestId);
            if (!request)
              throw new Error(`Unknown consent request '${requestId}'.`);
            const run = runs.find((entry) => entry.id === request.runId);
            if (!run) throw new Error(`Unknown apply run '${request.runId}'.`);
            const jobIds = uniqueStrings(run.jobIds).filter((jobId) => {
              const result = results.find(
                (entry) => entry.runId === run.id && entry.jobId === jobId,
              );
              return (
                result?.state === "planned" &&
                !result.applicationPreparationStartedAt
              );
            });
            return { jobIds, run };
          },
          (token) =>
            applicationMethods.resolveApplyConsentRequest(
              requestId,
              action,
              token,
            ),
        );
      }),
    revokeApplyRunApproval: (runId) =>
      trackWorkspaceOperation("application preparation", () =>
        applicationMethods.revokeApplyRunApproval(runId),
      ),
    approveApply: (jobId) =>
      trackWorkspaceOperation("application preparation", async () => {
        // Legacy direct-apply entry point. It delegates to the same guarded
        // path as every other preparation start so it cannot bypass campaign
        // scope, capacity, or safeguards; the submit authority of the wrapped
        // method itself (prepare-only, no final submit) is unchanged.
        return withApplicationPreparationReservation(
          () => ({ jobIds: [jobId], run: null }),
          (token) => applicationMethods.approveApply(jobId, undefined, token),
        );
      }),
    ...crmMethods,
  };
}
