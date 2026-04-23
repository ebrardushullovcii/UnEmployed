import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import { JobFinderDiscoveryStateSchema, SavedJobSchema, type JobFinderDiscoveryState, type JobDiscoveryTarget, type JobSearchPreferences, type JobSource, type SavedJob, type SourceDebugRunRecord } from "@unemployed/contracts";
import {
  mergeSessionStates,
} from "./internal/workspace-service-helpers";
import { getActiveDiscoveryTargets, resolveAdapterKind, updateDiscoveryTarget } from "./internal/workspace-helpers";
import { SOURCE_DEBUG_RECENT_HISTORY_LIMIT } from "./internal/workspace-defaults";
import type { WorkspaceServiceContext } from "./internal/workspace-service-context";
import { buildStaleResumeDraft, hasResumeAffectingJobChange } from "./internal/resume-workspace-staleness";
import {
  type CreateJobFinderWorkspaceServiceOptions,
  type JobFinderWorkspaceService,
} from "./internal/workspace-service-contracts";
import { createWorkspaceSnapshotProfileMethods } from "./internal/workspace-snapshot-profile-methods";
import { createWorkspaceDiscoveryMethods } from "./internal/workspace-discovery-methods";
import { createWorkspaceSourceDebugMethods } from "./internal/workspace-source-debug-methods";
import { createWorkspaceApplicationMethods } from "./internal/workspace-application-methods";
import { createWorkspaceApplyRunStoreMethods } from "./internal/workspace-apply-run-store-methods";
import { toDiscoverySessionState } from "./internal/discovery-state";
import { uniqueStrings } from "./internal/shared";

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
  JobFinderDocumentManager,
  JobFinderWorkspaceService,
  RenderedResumeArtifact,
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
    browserRuntime,
    documentManager,
    exportFileVerifier,
    repository,
    researchAdapter,
  } = options;
  const activeSourceDebugExecutionIdRef = { current: null as string | null };
  const activeSourceDebugAbortControllerRef = {
    current: null as AbortController | null,
  };

  const context: WorkspaceServiceContext = {
    aiClient,
    browserRuntime,
    documentManager,
    ...(exportFileVerifier ? { exportFileVerifier } : {}),
    repository,
    activeSourceDebugExecutionIdRef,
    activeSourceDebugAbortControllerRef,
    getWorkspaceSnapshot: () =>
      Promise.reject(new Error("Workspace snapshot method not initialized.")),
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
        JSON.stringify(nextSessions) !== JSON.stringify(currentDiscovery.sessions)
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
          ...current.recentSourceDebugRuns.filter((entry) => entry.id !== run.id),
        ].slice(0, SOURCE_DEBUG_RECENT_HISTORY_LIMIT),
      }));
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
        if (!draft.approvedAt && !draft.approvedExportId && draft.status !== "approved") {
          continue;
        }

        if (targetJobIds && !targetJobIds.has(draft.jobId)) {
          continue;
        }

        const existingAsset = tailoredAssets.find((asset) => asset.jobId === draft.jobId) ?? null;
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
    async openRunBrowserSession(source: JobSource): Promise<void> {
      const session = await browserRuntime.openSession(source);
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

        if (draft && (draft.approvedAt || draft.approvedExportId || draft.status === "approved")) {
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
  context.getWorkspaceSnapshot = snapshotProfileMethods.getWorkspaceSnapshot;

  const sourceDebugMethods = createWorkspaceSourceDebugMethods(context);
  context.runSourceDebugWorkflow = sourceDebugMethods.runSourceDebugWorkflow;
  const applyRunStoreMethods = createWorkspaceApplyRunStoreMethods(context);

  async function shutdown() {
    await Promise.allSettled([
      browserRuntime.closeSession("target_site"),
      repository.close(),
    ]);
  }

  return {
    shutdown,
    ...snapshotProfileMethods,
    ...createWorkspaceDiscoveryMethods(context),
    ...sourceDebugMethods,
    ...applyRunStoreMethods,
    ...createWorkspaceApplicationMethods(context),
  };
}
