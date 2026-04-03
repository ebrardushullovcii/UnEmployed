import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  DiscoveryRunRecordSchema,
  type DiscoveryActivityEvent,
  type JobSource,
} from "@unemployed/contracts";
import {
  appendDiscoveryEvent,
  countCompletedTargetExecutions,
  createDiscoveryEvent,
  finalizeDiscoveryState,
  summarizeProgressAction,
  updateTargetExecution,
} from "./discovery-state";
import { mergeDiscoveredPostings } from "./matching";
import {
  buildInstructionGuidance,
  enrichSearchPreferencesFromProfile,
  getActiveDiscoveryTargets,
  resolveActiveSourceInstructionArtifact,
  resolveAdapterKind,
} from "./workspace-helpers";
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_ROLE,
  DEFAULT_TARGET_JOB_COUNT,
  discoveryAdapters,
} from "./workspace-defaults";
import {
  mergePendingJobs,
  mergeSavedJobs,
  overlayTouchedPendingJobs,
  overlayTouchedSavedJobs,
} from "./workspace-service-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

export function createWorkspaceDiscoveryMethods(
  ctx: WorkspaceServiceContext,
): Pick<JobFinderWorkspaceService, "runDiscovery" | "runAgentDiscovery"> {
  return {
    async runDiscovery() {
      const [profile, searchPreferences, settings, discoveryState] =
        await Promise.all([
          ctx.repository.getProfile(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.getDiscoveryState(),
        ]);
      const enrichedPreferences = enrichSearchPreferencesFromProfile(
        searchPreferences,
        profile,
      );
      const primaryTarget = getActiveDiscoveryTargets(enrichedPreferences)[0];

      if (!primaryTarget) {
        return ctx.getWorkspaceSnapshot();
      }

      const adapterKind = resolveAdapterKind(primaryTarget);

      let discoveryResult: Awaited<
        ReturnType<BrowserSessionRuntime["runDiscovery"]>
      >;
      let browserSessionOpened = false;
      try {
        await ctx.openRunBrowserSession(adapterKind);
        browserSessionOpened = true;
        discoveryResult = await ctx.browserRuntime.runDiscovery(
          adapterKind,
          enrichedPreferences,
        );
      } finally {
        if (browserSessionOpened) {
          await ctx.closeRunBrowserSession(adapterKind).catch(() => {});
        }
      }
      const savedJobs = await ctx.repository.listSavedJobs();
      const persistedSavedJobIds = new Set(savedJobs.map((job) => job.id));
      const mergeSeedJobs = settings.discoveryOnly
        ? mergeSavedJobs(savedJobs, discoveryState.pendingDiscoveryJobs)
        : savedJobs;
      const mergeResult = await mergeDiscoveredPostings(
        ctx.aiClient,
        profile,
        enrichedPreferences,
        mergeSeedJobs,
        discoveryResult.jobs,
        () => ({
          targetId: primaryTarget.id,
          adapterKind: primaryTarget.adapterKind,
          resolvedAdapterKind: adapterKind,
          startingUrl: primaryTarget.startingUrl,
          discoveredAt: new Date().toISOString(),
        }),
      );

      if (settings.discoveryOnly) {
        const nextPendingJobs = mergeResult.mergedJobs.filter(
          (job) => !persistedSavedJobIds.has(job.id),
        );
        await ctx.repository.replaceSavedJobs(
          mergeResult.mergedJobs.filter(
            (job) =>
              persistedSavedJobIds.has(job.id) &&
              !mergeResult.newJobs.some((newJob) => newJob.id === job.id),
          ),
        );
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: mergePendingJobs(
            current.pendingDiscoveryJobs,
            nextPendingJobs,
          ),
        }));
      } else {
        await ctx.repository.replaceSavedJobs(mergeResult.mergedJobs);
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs,
        }));
      }

      return ctx.getWorkspaceSnapshot();
    },
    async runAgentDiscovery(onActivity, signal) {
      const [
        profile,
        searchPreferences,
        settings,
        startingSavedJobs,
        startingDiscovery,
        sourceInstructionArtifacts,
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.getDiscoveryState(),
        ctx.repository.listSourceInstructionArtifacts(),
      ]);

      if (!ctx.browserRuntime.runAgentDiscovery) {
        throw new Error("Browser runtime does not support agent discovery");
      }

      if (!ctx.aiClient.chatWithTools) {
        throw new Error(
          "Configured AI client does not support chatWithTools / tool calling",
        );
      }

      const enrichedPreferences = enrichSearchPreferencesFromProfile(
        searchPreferences,
        profile,
      );
      const targets = getActiveDiscoveryTargets(enrichedPreferences);

      if (targets.length === 0) {
        return ctx.getWorkspaceSnapshot();
      }

      let workingSavedJobs = [...startingSavedJobs];
      let workingPendingJobs = [...startingDiscovery.pendingDiscoveryJobs];
      const touchedSavedJobIds = new Set<string>();
      const touchedPendingJobIds = new Set<string>();

      let activeRun = DiscoveryRunRecordSchema.parse({
        id: `discovery_run_${Date.now()}`,
        state: "running",
        startedAt: new Date().toISOString(),
        completedAt: null,
        targetIds: targets.map((target) => target.id),
        targetExecutions: targets.map((target) => ({
          targetId: target.id,
          adapterKind: target.adapterKind,
          resolvedAdapterKind: resolveAdapterKind(target),
          state: "planned",
          startedAt: null,
          completedAt: null,
          jobsFound: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          warning: null,
        })),
        activity: [],
        summary: {
          targetsPlanned: targets.length,
          targetsCompleted: 0,
          validJobsFound: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          duplicatesMerged: 0,
          invalidSkipped: 0,
          durationMs: 0,
          outcome: "running",
        },
      });

      const emitActivity = (event: DiscoveryActivityEvent) => {
        activeRun = appendDiscoveryEvent(activeRun, event);
        onActivity?.(event);
      };

      emitActivity(
        createDiscoveryEvent({
          runId: activeRun.id,
          timestamp: new Date().toISOString(),
          kind: "info",
          stage: "planning",
          targetId: null,
          adapterKind: null,
          resolvedAdapterKind: null,
          message: `Planning ${targets.length} discovery target${targets.length === 1 ? "" : "s"}`,
          url: null,
          jobsFound: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          duplicatesMerged: 0,
          invalidSkipped: 0,
        }),
      );

      await ctx.persistDiscoveryState((current) => ({
        ...current,
        runState: "running",
        activeRun,
        recentRuns: current.recentRuns,
        pendingDiscoveryJobs: workingPendingJobs,
      }));
      const openedSessionSources = new Set<JobSource>();

      try {
        for (const [index, target] of targets.entries()) {
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }

          const targetStartedAt = new Date().toISOString();
          const adapterKind = resolveAdapterKind(target);
          const adapter = discoveryAdapters[adapterKind];
          const targetUrl = (() => {
            try {
              return new URL(target.startingUrl);
            } catch {
              return null;
            }
          })();

          activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
            ...entry,
            state: "running",
            startedAt: targetStartedAt,
          }));

          emitActivity(
            createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: targetStartedAt,
              kind: "info",
              stage: "navigation",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: `Opening ${target.label}`,
              url: target.startingUrl,
              jobsFound: 0,
              jobsPersisted: 0,
              jobsStaged: 0,
              duplicatesMerged: 0,
              invalidSkipped: 0,
            }),
          );

          if (!openedSessionSources.has(adapterKind)) {
            await ctx.openRunBrowserSession(adapterKind);
            openedSessionSources.add(adapterKind);
          }

          const activeInstruction = resolveActiveSourceInstructionArtifact(
            target,
            sourceInstructionArtifacts,
          );
          const instructionLines = buildInstructionGuidance(activeInstruction);
          const discoveryResult = await ctx.browserRuntime.runAgentDiscovery(
            adapterKind,
            {
              userProfile: profile,
              searchPreferences: {
                targetRoles:
                  searchPreferences.targetRoles.length > 0
                    ? searchPreferences.targetRoles
                    : [DEFAULT_ROLE],
                locations: searchPreferences.locations,
              },
              targetJobCount: DEFAULT_TARGET_JOB_COUNT,
              maxSteps: DEFAULT_MAX_STEPS,
              startingUrls: [target.startingUrl],
              siteLabel: target.label,
              navigationHostnames: targetUrl ? [targetUrl.hostname] : [],
              siteInstructions: [
                ...adapter.siteInstructions,
                ...instructionLines,
              ],
              toolUsageNotes: adapter.toolUsageNotes,
              relevantUrlSubstrings: adapter.relevantUrlSubstrings,
              experimental: adapter.experimental,
              aiClient: ctx.aiClient,
              ...(signal ? { signal } : {}),
              onProgress: (progress) => {
                const summary = summarizeProgressAction(
                  progress.currentAction,
                  target.label,
                  progress.jobsFound,
                  progress.stepCount,
                );
                emitActivity(
                  createDiscoveryEvent({
                    runId: activeRun.id,
                    timestamp: new Date().toISOString(),
                    kind: "progress",
                    stage: summary.stage,
                    targetId: target.id,
                    adapterKind: target.adapterKind,
                    resolvedAdapterKind: adapterKind,
                    message: summary.message,
                    url: progress.currentUrl,
                    jobsFound: progress.jobsFound,
                    jobsPersisted: activeRun.summary.jobsPersisted,
                    jobsStaged: activeRun.summary.jobsStaged,
                    duplicatesMerged: activeRun.summary.duplicatesMerged,
                    invalidSkipped: activeRun.summary.invalidSkipped,
                  }),
                );
              },
            },
          );

          const mergeSeedJobs = settings.discoveryOnly
            ? mergeSavedJobs(workingSavedJobs, workingPendingJobs)
            : workingSavedJobs;
          const mergeResult = await mergeDiscoveredPostings(
            ctx.aiClient,
            profile,
            enrichedPreferences,
            mergeSeedJobs,
            discoveryResult.jobs,
            () => ({
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              startingUrl: target.startingUrl,
              discoveredAt: new Date().toISOString(),
            }),
            signal,
          );

          const persistedSavedJobIds = new Set(workingSavedJobs.map((job) => job.id));
          let jobsPersisted = mergeResult.mergedJobs.length - mergeResult.newJobs.length;
          let jobsStaged = 0;

          if (settings.discoveryOnly) {
            const nextPendingJobs = mergeResult.mergedJobs.filter(
              (job) => !persistedSavedJobIds.has(job.id),
            );
            workingSavedJobs = mergeResult.mergedJobs.filter(
              (job) =>
                persistedSavedJobIds.has(job.id) &&
                !mergeResult.newJobs.some((newJob) => newJob.id === job.id),
            );
            workingPendingJobs = mergePendingJobs(workingPendingJobs, nextPendingJobs);
            jobsStaged = nextPendingJobs.length;
            nextPendingJobs.forEach((job) => touchedPendingJobIds.add(job.id));
            workingSavedJobs.forEach((job) => touchedSavedJobIds.add(job.id));
          } else {
            workingSavedJobs = mergeResult.mergedJobs;
            mergeResult.mergedJobs.forEach((job) => touchedSavedJobIds.add(job.id));
            jobsPersisted = mergeResult.mergedJobs.length;
          }

          activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
            ...entry,
            state: "completed",
            completedAt: new Date().toISOString(),
            jobsFound: mergeResult.validatedCount,
            jobsPersisted,
            jobsStaged,
            warning: discoveryResult.warning,
          }));
          activeRun = DiscoveryRunRecordSchema.parse({
            ...activeRun,
            summary: {
              ...activeRun.summary,
              targetsCompleted: countCompletedTargetExecutions(activeRun),
              validJobsFound: activeRun.summary.validJobsFound + mergeResult.validatedCount,
              jobsPersisted: activeRun.summary.jobsPersisted + jobsPersisted,
              jobsStaged: activeRun.summary.jobsStaged + jobsStaged,
              duplicatesMerged:
                activeRun.summary.duplicatesMerged + mergeResult.duplicatesMerged,
              invalidSkipped: activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
            },
          });

          emitActivity(
            createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: "success",
              stage: "persistence",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: `Finished ${target.label} (${index + 1}/${targets.length})`,
              url: target.startingUrl,
              jobsFound: mergeResult.validatedCount,
              jobsPersisted,
              jobsStaged,
              duplicatesMerged: mergeResult.duplicatesMerged,
              invalidSkipped: mergeResult.invalidSkipped,
            }),
          );

          const latestDiscoveryState = await ctx.repository.getDiscoveryState();
          await ctx.repository.replaceSavedJobs(
            overlayTouchedSavedJobs(
              await ctx.repository.listSavedJobs(),
              workingSavedJobs,
              touchedSavedJobIds,
            ),
          );
          await ctx.repository.saveDiscoveryState(
            finalizeDiscoveryState(
              {
                ...latestDiscoveryState,
                pendingDiscoveryJobs: overlayTouchedPendingJobs(
                  latestDiscoveryState.pendingDiscoveryJobs,
                  workingPendingJobs,
                  touchedPendingJobIds,
                ),
              },
              activeRun,
              enrichedPreferences,
            ),
          );
        }
      } catch (error) {
        const interrupted = error instanceof DOMException && error.name === "AbortError";
        activeRun = DiscoveryRunRecordSchema.parse({
          ...activeRun,
          state: interrupted ? "cancelled" : "failed",
          completedAt: new Date().toISOString(),
          summary: {
            ...activeRun.summary,
            durationMs:
              new Date().getTime() - new Date(activeRun.startedAt).getTime(),
            outcome: interrupted ? "cancelled" : "failed",
          },
        });

        const latestDiscoveryState = await ctx.repository.getDiscoveryState();
        await ctx.repository.replaceSavedJobs(
          overlayTouchedSavedJobs(
            await ctx.repository.listSavedJobs(),
            workingSavedJobs,
            touchedSavedJobIds,
          ),
        );
        await ctx.repository.saveDiscoveryState(
          finalizeDiscoveryState(
            {
              ...latestDiscoveryState,
              pendingDiscoveryJobs: overlayTouchedPendingJobs(
                latestDiscoveryState.pendingDiscoveryJobs,
                workingPendingJobs,
                touchedPendingJobIds,
              ),
            },
            activeRun,
            enrichedPreferences,
          ),
        );

        if (!interrupted) {
          throw error;
        }

        return ctx.getWorkspaceSnapshot();
      } finally {
        for (const source of openedSessionSources) {
          await ctx.closeRunBrowserSession(source).catch(() => {});
        }
      }

      activeRun = DiscoveryRunRecordSchema.parse({
        ...activeRun,
        state: "completed",
        completedAt: new Date().toISOString(),
        summary: {
          ...activeRun.summary,
          durationMs: new Date().getTime() - new Date(activeRun.startedAt).getTime(),
          outcome: "completed",
        },
      });

      const latestDiscoveryState = await ctx.repository.getDiscoveryState();
      await ctx.repository.replaceSavedJobs(
        overlayTouchedSavedJobs(
          await ctx.repository.listSavedJobs(),
          workingSavedJobs,
          touchedSavedJobIds,
        ),
      );
      await ctx.repository.saveDiscoveryState(
        finalizeDiscoveryState(
          {
            ...latestDiscoveryState,
            pendingDiscoveryJobs: overlayTouchedPendingJobs(
              latestDiscoveryState.pendingDiscoveryJobs,
              workingPendingJobs,
              touchedPendingJobIds,
            ),
          },
          activeRun,
          enrichedPreferences,
        ),
      );

      return ctx.getWorkspaceSnapshot();
    },
  };
}
