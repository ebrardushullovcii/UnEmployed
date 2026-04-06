import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import {
  DiscoveryRunRecordSchema,
  DiscoveryTimingSummarySchema,
  browserRunWaitReasonValues,
  discoveryActivityStageValues,
  type DiscoveryActivityEvent,
  type DiscoveryRunRecord,
  type DiscoveryTargetExecution,
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
import { collectResumeAffectingChangedJobIds } from "./resume-workspace-staleness";
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
import {
  calculateDurationMs,
  computeTimelineSummary,
  serializeOrderedDurationEntries,
} from "./performance-timing";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

function buildDiscoveryTimingSummary(
  events: readonly DiscoveryActivityEvent[],
  startedAt: string,
  completedAt: string,
) {
  const stageTimeline = computeTimelineSummary({
    startedAt,
    completedAt,
    events: events.map((event) => ({
      timestamp: event.timestamp,
      key: event.stage,
    })),
  });
  const waitReasonTimeline = computeTimelineSummary({
    startedAt,
    completedAt,
    events: events
      .filter(
        (
          event,
        ): event is DiscoveryActivityEvent & {
          waitReason: NonNullable<DiscoveryActivityEvent["waitReason"]>;
        } => event.waitReason !== null,
      )
      .map((event) => ({
        timestamp: event.timestamp,
        key: event.waitReason,
      })),
  });

  return DiscoveryTimingSummarySchema.parse({
    totalDurationMs: stageTimeline.totalDurationMs,
    firstActivityMs: stageTimeline.firstEventMs,
    longestGapMs: Math.max(stageTimeline.longestGapMs, waitReasonTimeline.longestGapMs),
    eventCount: events.length,
    stageDurations: serializeOrderedDurationEntries(
      stageTimeline.durationsMsByKey,
      discoveryActivityStageValues,
      (stage, durationMs) => ({
        stage,
        durationMs,
      }),
    ),
    waitReasonDurations: serializeOrderedDurationEntries(
      waitReasonTimeline.durationsMsByKey,
      browserRunWaitReasonValues,
      (waitReason, durationMs) => ({
        waitReason,
        durationMs,
      }),
    ),
  });
}

function completeTargetExecution(
  run: DiscoveryRunRecord,
  targetId: string,
  completedAt: string,
  patch: Partial<DiscoveryTargetExecution>,
): DiscoveryRunRecord {
  const nextRun = updateTargetExecution(run, targetId, (entry) => ({
    ...entry,
    ...patch,
    completedAt,
    timing:
      entry.startedAt === null
        ? null
        : buildDiscoveryTimingSummary(
            run.activity.filter((event) => event.targetId === entry.targetId),
            entry.startedAt,
            completedAt,
          ),
  }));

  return DiscoveryRunRecordSchema.parse({
    ...nextRun,
    summary: {
      ...nextRun.summary,
      targetsCompleted: countCompletedTargetExecutions(nextRun),
    },
  });
}

function finalizeRunningTargetExecutions(
  run: DiscoveryRunRecord,
  state: "cancelled" | "failed",
  completedAt: string,
): DiscoveryRunRecord {
  let nextRun = run;

  for (const targetExecution of run.targetExecutions) {
    if (targetExecution.state !== "running") {
      continue;
    }

    nextRun = completeTargetExecution(nextRun, targetExecution.targetId, completedAt, {
      state,
      warning:
        state === "cancelled"
          ? "Discovery was cancelled before this target finished."
          : targetExecution.warning,
    });
  }

  return nextRun;
}

function finalizeDiscoveryRun(
  run: DiscoveryRunRecord,
  state: "completed" | "cancelled" | "failed",
  completedAt: string,
): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    ...run,
    state,
    completedAt,
    summary: {
      ...run.summary,
      durationMs: calculateDurationMs(run.startedAt, completedAt),
      outcome: state,
      timing: buildDiscoveryTimingSummary(run.activity, run.startedAt, completedAt),
    },
  });
}

const MIN_DISCOVERY_TARGET_MAX_STEPS = 20;

function resolveDiscoveryTargetBudget(input: {
  targetsRemaining: number;
  validJobsFoundSoFar: number;
}) {
  const remainingJobs = Math.max(
    1,
    DEFAULT_TARGET_JOB_COUNT - input.validJobsFoundSoFar,
  );
  const targetJobCount = Math.min(
    DEFAULT_TARGET_JOB_COUNT,
    Math.ceil(remainingJobs / Math.max(1, input.targetsRemaining)),
  );

  return {
    targetJobCount,
    maxSteps: Math.min(
      DEFAULT_MAX_STEPS,
      Math.max(MIN_DISCOVERY_TARGET_MAX_STEPS, targetJobCount * 6),
    ),
  };
}

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
      const changedJobIds = collectResumeAffectingChangedJobIds(savedJobs, mergeResult.mergedJobs);

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
        if (changedJobIds.length > 0) {
          await ctx.staleApprovedResumeDrafts(
            "Saved job details changed after approval and the resume needs a fresh review.",
            changedJobIds,
          );
        }
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
          waitReason: "waiting_on_ai",
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
          if (activeRun.summary.validJobsFound >= DEFAULT_TARGET_JOB_COUNT) {
            const skippedAt = new Date().toISOString();

            activeRun = completeTargetExecution(activeRun, target.id, skippedAt, {
              state: "skipped",
              jobsFound: 0,
              jobsPersisted: 0,
              jobsStaged: 0,
              warning: `Skipped because the discovery run already reached ${DEFAULT_TARGET_JOB_COUNT} jobs.`,
            });

            emitActivity(
              createDiscoveryEvent({
                runId: activeRun.id,
                timestamp: skippedAt,
                kind: "success",
                stage: "planning",
                waitReason: "finalizing",
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: resolveAdapterKind(target),
                message: `Skipping ${target.label} because the run already has enough jobs.`,
                url: target.startingUrl,
                jobsFound: activeRun.summary.validJobsFound,
                jobsPersisted: activeRun.summary.jobsPersisted,
                jobsStaged: activeRun.summary.jobsStaged,
                duplicatesMerged: activeRun.summary.duplicatesMerged,
                invalidSkipped: activeRun.summary.invalidSkipped,
              }),
            );
            continue;
          }

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
              waitReason: "executing_tool",
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
            emitActivity(
              createDiscoveryEvent({
                runId: activeRun.id,
                timestamp: new Date().toISOString(),
                kind: "progress",
                stage: "navigation",
                waitReason: "starting_browser",
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: adapterKind,
                message: `Starting or attaching the browser profile for ${target.label}`,
                url: target.startingUrl,
                jobsFound: 0,
                jobsPersisted: activeRun.summary.jobsPersisted,
                jobsStaged: activeRun.summary.jobsStaged,
                duplicatesMerged: activeRun.summary.duplicatesMerged,
                invalidSkipped: activeRun.summary.invalidSkipped,
              }),
            );
            await ctx.openRunBrowserSession(adapterKind);
            openedSessionSources.add(adapterKind);
            emitActivity(
              createDiscoveryEvent({
                runId: activeRun.id,
                timestamp: new Date().toISOString(),
                kind: "progress",
                stage: "navigation",
                waitReason: "attaching_browser",
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: adapterKind,
                message: `Browser ready for ${target.label}. Opening the target pages next.`,
                url: target.startingUrl,
                jobsFound: 0,
                jobsPersisted: activeRun.summary.jobsPersisted,
                jobsStaged: activeRun.summary.jobsStaged,
                duplicatesMerged: activeRun.summary.duplicatesMerged,
                invalidSkipped: activeRun.summary.invalidSkipped,
              }),
            );
          }

          const activeInstruction = resolveActiveSourceInstructionArtifact(
            target,
            sourceInstructionArtifacts,
          );
          const instructionLines = buildInstructionGuidance(activeInstruction);
          const discoveryBudget = resolveDiscoveryTargetBudget({
            targetsRemaining: targets.length - index,
            validJobsFoundSoFar: activeRun.summary.validJobsFound,
          });
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
              targetJobCount: discoveryBudget.targetJobCount,
              maxSteps: discoveryBudget.maxSteps,
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
                  progress,
                  target.label,
                  progress.jobsFound,
                );
                emitActivity(
                  createDiscoveryEvent({
                    runId: activeRun.id,
                    timestamp: new Date().toISOString(),
                    kind: "progress",
                    stage: summary.stage,
                    waitReason: summary.waitReason,
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

          emitActivity(
            createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: "progress",
              stage: "scoring",
              waitReason: "merging_results",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: `Merging and reviewing the results from ${target.label}`,
              url: target.startingUrl,
              jobsFound: discoveryResult.jobs.length,
              jobsPersisted: activeRun.summary.jobsPersisted,
              jobsStaged: activeRun.summary.jobsStaged,
              duplicatesMerged: activeRun.summary.duplicatesMerged,
              invalidSkipped: activeRun.summary.invalidSkipped,
            }),
          );
          const mergeSeedJobs = settings.discoveryOnly
            ? mergeSavedJobs(workingSavedJobs, workingPendingJobs)
            : workingSavedJobs;
          const mergeResult = await mergeDiscoveredPostings(
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
          const changedJobIds = collectResumeAffectingChangedJobIds(
            workingSavedJobs,
            mergeResult.mergedJobs,
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

          emitActivity(
            createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: new Date().toISOString(),
              kind: "progress",
              stage: "persistence",
              waitReason: "persisting_results",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: adapterKind,
              message: `Saving the kept jobs and updated run state for ${target.label}`,
              url: target.startingUrl,
              jobsFound: mergeResult.validatedCount,
              jobsPersisted,
              jobsStaged,
              duplicatesMerged: mergeResult.duplicatesMerged,
              invalidSkipped: mergeResult.invalidSkipped,
            }),
          );
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
          const targetCompletedAt = new Date().toISOString();

          emitActivity(
            createDiscoveryEvent({
              runId: activeRun.id,
              timestamp: targetCompletedAt,
              kind: "success",
              stage: "persistence",
              waitReason: "persisting_results",
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
          activeRun = completeTargetExecution(activeRun, target.id, targetCompletedAt, {
            state: "completed",
            jobsFound: mergeResult.validatedCount,
            jobsPersisted,
            jobsStaged,
            warning: discoveryResult.warning,
          });

          const latestDiscoveryState = await ctx.repository.getDiscoveryState();
          await ctx.repository.replaceSavedJobs(
            overlayTouchedSavedJobs(
              await ctx.repository.listSavedJobs(),
              workingSavedJobs,
              touchedSavedJobIds,
            ),
          );
          if (!settings.discoveryOnly && changedJobIds.length > 0) {
            await ctx.staleApprovedResumeDrafts(
              "Saved job details changed after approval and the resume needs a fresh review.",
              changedJobIds,
            );
          }
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
        const completedAt = new Date().toISOString();
        activeRun = finalizeRunningTargetExecutions(
          activeRun,
          interrupted ? "cancelled" : "failed",
          completedAt,
        );
        activeRun = finalizeDiscoveryRun(
          activeRun,
          interrupted ? "cancelled" : "failed",
          completedAt,
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

        if (!interrupted) {
          throw error;
        }

        return ctx.getWorkspaceSnapshot();
      } finally {
        for (const source of openedSessionSources) {
          await ctx.closeRunBrowserSession(source).catch(() => {});
        }
      }

      activeRun = finalizeDiscoveryRun(activeRun, "completed", new Date().toISOString());

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
