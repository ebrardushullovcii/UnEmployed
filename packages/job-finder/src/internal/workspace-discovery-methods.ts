import {
  DiscoveryRunRecordSchema,
  JobPostingSchema,
  type DiscoveryActivityEvent,
  type DiscoveryLedgerEntry,
  type DiscoveryRunRecord,
  type DiscoveryRunResult,
  type DiscoveryRunScope,
  type JobDiscoveryTarget,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
} from "@unemployed/contracts";
import {
  appendDiscoveryEvent,
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
  DEFAULT_ROLE,
  DEFAULT_TARGET_JOB_COUNT,
  discoveryAdapters,
} from "./workspace-defaults";
import {
  applyInactiveLedgerMarks,
  createDiscoveryProvenance,
  findDiscoveryLedgerEntry,
  mergePendingJobs,
  mergeSavedJobs,
  overlayTouchedPendingJobs,
  overlayTouchedSavedJobs,
  recordDiscoveredPostingInLedger,
  shouldSkipPostingFromLedger,
} from "./workspace-service-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type {
  DiscoveryTargetPipelineOptions,
  JobFinderWorkspaceService,
} from "./workspace-service-contracts";
import {
  completeTargetExecution,
  finalizeDiscoveryRun,
  finalizeRunningTargetExecutions,
  resolveDiscoveryTargetBudget,
} from "./workspace-discovery-run-helpers";
import {
  applyDiscoveryTitleTriage,
  buildDiscoveryStartingUrls,
  collectPublicProviderJobs,
  inferSourceIntelligenceFromTarget,
  selectDiscoveryCollectionMethod,
  selectDiscoveryMethod,
} from "./workspace-source-intelligence";

function describeCloseoutMode(keptAlive: boolean) {
  return keptAlive
    ? {
        mode: "kept_alive" as const,
        label: "Browser kept open",
        detail:
          "The browser profile stayed attached so the next run can reuse the current signed-in session.",
      }
    : {
        mode: "closed" as const,
        label: "Browser closed",
        detail:
          "The discovery browser session was closed after the run finished. It will reopen automatically next time.",
      };
}

function createInitialRunRecord(input: {
  id: string;
  targets: readonly JobDiscoveryTarget[];
  scope: DiscoveryRunScope;
}): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    id: input.id,
    state: "running",
    scope: input.scope,
    startedAt: new Date().toISOString(),
    completedAt: null,
    targetIds: input.targets.map((target) => target.id),
    targetExecutions: input.targets.map((target) => ({
      targetId: target.id,
      adapterKind: target.adapterKind,
      resolvedAdapterKind: resolveAdapterKind(target),
      collectionMethod: null,
      sourceIntelligenceProvider: null,
      state: "planned",
      startedAt: null,
      completedAt: null,
      jobsFound: 0,
      jobsPersisted: 0,
      jobsStaged: 0,
      warning: null,
      timing: null,
    })),
    activity: [],
    summary: {
      targetsPlanned: input.targets.length,
      targetsCompleted: 0,
      validJobsFound: 0,
      jobsPersisted: 0,
      jobsStaged: 0,
      jobsSkippedByLedger: 0,
      jobsSkippedByTitleTriage: 0,
      duplicatesMerged: 0,
      invalidSkipped: 0,
      durationMs: 0,
      outcome: "running",
      browserCloseout: null,
      timing: null,
    },
  });
}

function updateRunSummary(
  run: DiscoveryRunRecord,
  patch: Partial<DiscoveryRunRecord["summary"]>,
): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    ...run,
    summary: {
      ...run.summary,
      ...patch,
    },
  });
}

function selectTargets(
  searchPreferences: JobSearchPreferences,
  targetId?: string,
): JobDiscoveryTarget[] {
  const activeTargets = getActiveDiscoveryTargets(searchPreferences);

  if (!targetId) {
    return activeTargets;
  }

  return activeTargets.filter((target) => target.id === targetId);
}

function createPostingWithTriage(
  posting: JobPosting,
  searchPreferences: JobSearchPreferences,
): {
  posting: JobPosting;
  triageReason: string | null;
} {
  const triage = applyDiscoveryTitleTriage({ posting, searchPreferences });

  return {
    posting: JobPostingSchema.parse({
      ...posting,
      titleTriageOutcome: triage.outcome,
    }),
    triageReason: triage.reason,
  };
}

function toProviderAwarePosting(input: {
  posting: JobPosting;
  target: JobDiscoveryTarget;
  collectionMethod: JobPosting["collectionMethod"];
  discoveryMethod: JobPosting["discoveryMethod"];
  intelligence: NonNullable<JobPosting["sourceIntelligence"]>;
  adapterKind: JobSource;
}): JobPosting {
  const provider = input.intelligence.provider;

  return JobPostingSchema.parse({
    ...input.posting,
    source: input.posting.source ?? input.adapterKind,
    discoveryMethod: input.discoveryMethod,
    collectionMethod: input.collectionMethod,
    company: input.posting.company || input.target.label,
    providerKey: input.posting.providerKey ?? provider?.key ?? null,
    providerBoardToken: input.posting.providerBoardToken ?? provider?.boardToken ?? null,
    providerIdentifier:
      input.posting.providerIdentifier ?? provider?.providerIdentifier ?? null,
    atsProvider: input.posting.atsProvider ?? provider?.label ?? null,
    sourceIntelligence: input.intelligence,
  });
}

async function collectTargetJobs(input: {
  ctx: WorkspaceServiceContext;
  target: JobDiscoveryTarget;
  sourceInstructionArtifacts: Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["listSourceInstructionArtifacts"]>
  >;
  profile: Awaited<ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>>;
  searchPreferences: JobSearchPreferences;
  targetJobCount: number;
  maxSteps: number;
  activeRun: DiscoveryRunRecord;
  emitActivity: (event: DiscoveryActivityEvent) => void;
  signal?: AbortSignal;
  openedSessionSources: Set<JobSource>;
}): Promise<{
  result: DiscoveryRunResult;
  collectionMethod: JobPosting["collectionMethod"];
  adapterKind: JobSource;
  intelligence: NonNullable<JobPosting["sourceIntelligence"]>;
}> {
  const { ctx, target } = input;
  const adapterKind = resolveAdapterKind(target);
  const activeInstruction = resolveActiveSourceInstructionArtifact(
    target,
    input.sourceInstructionArtifacts,
  );
  const intelligence = inferSourceIntelligenceFromTarget({
    target,
    currentArtifact: activeInstruction,
  });
  const collectionMethod =
    activeInstruction?.intelligence.collection.preferredMethod ??
    intelligence.collection.preferredMethod ??
    selectDiscoveryCollectionMethod(target, activeInstruction);
  const discoveryMethod = selectDiscoveryMethod(collectionMethod);
  const startingUrls = buildDiscoveryStartingUrls(target, activeInstruction);
  const providerLabel = intelligence.provider?.label ?? "Unknown provider";

  if (discoveryMethod === "public_api") {
    input.emitActivity(
      createDiscoveryEvent({
        runId: input.activeRun.id,
        timestamp: new Date().toISOString(),
        kind: "progress",
        stage: "navigation",
        waitReason: "executing_tool",
        targetId: target.id,
        adapterKind: target.adapterKind,
        resolvedAdapterKind: adapterKind,
        message: `Using ${providerLabel} public API for ${target.label}`,
        url: startingUrls[0] ?? target.startingUrl,
        jobsFound: 0,
        jobsPersisted: input.activeRun.summary.jobsPersisted,
        jobsStaged: input.activeRun.summary.jobsStaged,
        duplicatesMerged: input.activeRun.summary.duplicatesMerged,
        invalidSkipped: input.activeRun.summary.invalidSkipped,
      }),
    );

    const apiResult = await collectPublicProviderJobs({
      target,
      artifact: { intelligence },
      source: adapterKind,
    });

    return {
      result: {
        source: adapterKind,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        querySummary: `${target.label} via ${providerLabel} API`,
        warning: apiResult.warning,
        jobs: apiResult.jobs.map((posting) =>
          toProviderAwarePosting({
            posting,
            target,
            collectionMethod,
            discoveryMethod,
            intelligence,
            adapterKind,
          }),
        ),
        agentMetadata: null,
      },
      collectionMethod,
      adapterKind,
      intelligence,
    };
  }

  if (!input.openedSessionSources.has(adapterKind)) {
    input.emitActivity(
      createDiscoveryEvent({
        runId: input.activeRun.id,
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
        jobsPersisted: input.activeRun.summary.jobsPersisted,
        jobsStaged: input.activeRun.summary.jobsStaged,
        duplicatesMerged: input.activeRun.summary.duplicatesMerged,
        invalidSkipped: input.activeRun.summary.invalidSkipped,
      }),
    );
    await ctx.openRunBrowserSession(adapterKind);
    input.openedSessionSources.add(adapterKind);
  }

  const targetUrl = (() => {
    try {
      return new URL(target.startingUrl);
    } catch {
      return null;
    }
  })();
  const adapter = discoveryAdapters[adapterKind];
  const instructionLines = buildInstructionGuidance(activeInstruction);

  if (ctx.browserRuntime.runAgentDiscovery) {
    const result = await ctx.browserRuntime.runAgentDiscovery(adapterKind, {
      userProfile: input.profile,
      searchPreferences: {
        targetRoles:
          input.searchPreferences.targetRoles.length > 0
            ? input.searchPreferences.targetRoles
            : [DEFAULT_ROLE],
        locations: input.searchPreferences.locations,
      },
      targetJobCount: input.targetJobCount,
      maxSteps: input.maxSteps,
      startingUrls,
      siteLabel: target.label,
      navigationHostnames: targetUrl ? [targetUrl.hostname] : [],
      siteInstructions: [...adapter.siteInstructions, ...instructionLines],
      toolUsageNotes: adapter.toolUsageNotes,
      relevantUrlSubstrings: adapter.relevantUrlSubstrings,
      experimental: adapter.experimental,
      aiClient: ctx.aiClient,
      ...(input.signal ? { signal: input.signal } : {}),
      onProgress: (progress) => {
        const summary = summarizeProgressAction(
          progress,
          target.label,
          progress.jobsFound,
        );
        input.emitActivity(
          createDiscoveryEvent({
            runId: input.activeRun.id,
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
            jobsPersisted: input.activeRun.summary.jobsPersisted,
            jobsStaged: input.activeRun.summary.jobsStaged,
            duplicatesMerged: input.activeRun.summary.duplicatesMerged,
            invalidSkipped: input.activeRun.summary.invalidSkipped,
          }),
        );
      },
    });

    return {
      result: {
        ...result,
        jobs: result.jobs.map((posting) =>
          toProviderAwarePosting({
            posting,
            target,
            collectionMethod,
            discoveryMethod,
            intelligence,
            adapterKind,
          }),
        ),
      },
      collectionMethod,
      adapterKind,
      intelligence,
    };
  }

  const result = await ctx.browserRuntime.runDiscovery(adapterKind, input.searchPreferences);
  return {
    result: {
      ...result,
      jobs: result.jobs.map((posting) =>
        toProviderAwarePosting({
          posting,
          target,
          collectionMethod,
          discoveryMethod,
          intelligence,
          adapterKind,
        }),
      ),
    },
    collectionMethod,
    adapterKind,
    intelligence,
  };
}

export function createWorkspaceDiscoveryMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  "runDiscovery" | "runAgentDiscovery" | "runDiscoveryForTarget"
> {
  async function executeDiscoveryPipeline(
    options: DiscoveryTargetPipelineOptions,
  ) {
    const [profile, searchPreferences, settings, startingSavedJobs, startingDiscovery] =
      await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.getDiscoveryState(),
      ]);
    const enrichedPreferences = enrichSearchPreferencesFromProfile(
      searchPreferences,
      profile,
    );
    const targets = selectTargets(enrichedPreferences, options.targetId);

    if (targets.length === 0) {
      return ctx.getWorkspaceSnapshot();
    }

    let workingSavedJobs = [...startingSavedJobs];
    let workingPendingJobs = [...startingDiscovery.pendingDiscoveryJobs];
    let workingLedger: DiscoveryLedgerEntry[] = [...startingDiscovery.discoveryLedger];
    const touchedSavedJobIds = new Set<string>();
    const touchedPendingJobIds = new Set<string>();
    const openedSessionSources = new Set<JobSource>();
    const sourceInstructionArtifacts = await ctx.repository.listSourceInstructionArtifacts();
    const runId = `discovery_run_${Date.now()}`;
    const keepSessionAlive = settings.keepSessionAlive;
    let activeRun = createInitialRunRecord({
      id: runId,
      targets,
      scope: options.scope,
    });

    const emitActivity = (event: DiscoveryActivityEvent) => {
      activeRun = appendDiscoveryEvent(activeRun, event);
      options.onActivity?.(event);
    };

    emitActivity(
      createDiscoveryEvent({
        runId,
        timestamp: new Date().toISOString(),
        kind: "info",
        stage: "planning",
        waitReason: "waiting_on_ai",
        targetId: null,
        adapterKind: null,
        resolvedAdapterKind: null,
        message:
          options.scope === "single_target"
            ? `Planning discovery for ${targets[0]?.label ?? "selected source"}`
            : `Planning ${targets.length} discovery target${targets.length === 1 ? "" : "s"}`,
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
      discoveryLedger: workingLedger,
    }));

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
              runId,
              timestamp: skippedAt,
              kind: "success",
              stage: "target",
              waitReason: "finalizing",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: resolveAdapterKind(target),
              terminalState: "skipped",
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

        if (options.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        const targetStartedAt = new Date().toISOString();
        activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
          ...entry,
          state: "running",
          startedAt: targetStartedAt,
        }));
        emitActivity(
          createDiscoveryEvent({
            runId,
            timestamp: targetStartedAt,
            kind: "info",
            stage: "target",
            waitReason: "executing_tool",
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: resolveAdapterKind(target),
            message: `Starting target ${target.label}`,
            url: target.startingUrl,
            jobsFound: 0,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          }),
        );

        const discoveryBudget = resolveDiscoveryTargetBudget({
          targetsRemaining: targets.length - index,
          validJobsFoundSoFar: activeRun.summary.validJobsFound,
        });
        const collected = await collectTargetJobs({
          ctx,
          target,
          sourceInstructionArtifacts,
          profile,
          searchPreferences,
          targetJobCount: discoveryBudget.targetJobCount,
          maxSteps: discoveryBudget.maxSteps,
          activeRun,
          emitActivity,
          ...(options.signal ? { signal: options.signal } : {}),
          openedSessionSources,
        });

        activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
          ...entry,
          collectionMethod: collected.collectionMethod,
          sourceIntelligenceProvider: collected.intelligence.provider?.key ?? null,
        }));

        emitActivity(
          createDiscoveryEvent({
            runId,
            timestamp: new Date().toISOString(),
            kind: collected.result.warning ? "warning" : "progress",
            stage: "extraction",
            waitReason: "extracting_jobs",
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: collected.adapterKind,
            message: collected.result.warning
              ? `Collected ${collected.result.jobs.length} candidate jobs from ${target.label}. ${collected.result.warning}`
              : `Collected ${collected.result.jobs.length} candidate jobs from ${target.label}`,
            url: target.startingUrl,
            jobsFound: collected.result.jobs.length,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          }),
        );

        const targetSeenUrls: string[] = [];
        const triagedPostings: JobPosting[] = [];
        let skippedByTitleTriage = 0;
        let skippedByLedger = 0;

        for (const rawPosting of collected.result.jobs) {
          const posting = JobPostingSchema.parse(rawPosting);
          targetSeenUrls.push(posting.canonicalUrl);
          const { posting: triagedPosting, triageReason } = createPostingWithTriage(
            posting,
            enrichedPreferences,
          );

          if (triagedPosting.titleTriageOutcome !== "pass") {
            skippedByTitleTriage += 1;
            workingLedger = recordDiscoveredPostingInLedger({
              ledger: workingLedger,
              posting: triagedPosting,
              targetId: target.id,
              seenAt: triagedPosting.discoveredAt,
              status: "skipped",
              skipReason: triageReason,
            });
            continue;
          }

          const ledgerEntry = findDiscoveryLedgerEntry(workingLedger, triagedPosting);
          const ledgerDecision = shouldSkipPostingFromLedger({
            ledgerEntry,
            posting: triagedPosting,
            triageOutcome: triagedPosting.titleTriageOutcome,
          });

          if (ledgerDecision.skip) {
            skippedByLedger += 1;
            workingLedger = recordDiscoveredPostingInLedger({
              ledger: workingLedger,
              posting: JobPostingSchema.parse({
                ...triagedPosting,
                titleTriageOutcome: ledgerDecision.outcome,
              }),
              targetId: target.id,
              seenAt: triagedPosting.discoveredAt,
              status: ledgerEntry?.latestStatus ?? "skipped",
              skipReason: ledgerDecision.reason,
            });
            continue;
          }

          workingLedger = recordDiscoveredPostingInLedger({
            ledger: workingLedger,
            posting: triagedPosting,
            targetId: target.id,
            seenAt: triagedPosting.discoveredAt,
            status: "seen",
          });
          triagedPostings.push(triagedPosting);
        }

        emitActivity(
          createDiscoveryEvent({
            runId,
            timestamp: new Date().toISOString(),
            kind: "progress",
            stage: "scoring",
            waitReason: "merging_results",
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: collected.adapterKind,
            message: `Reviewing ${triagedPostings.length} promising jobs from ${target.label}`,
            url: target.startingUrl,
            jobsFound: triagedPostings.length,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          }),
        );

        const mergeSeedJobs = settings.discoveryOnly
          ? mergeSavedJobs(workingSavedJobs, workingPendingJobs)
          : workingSavedJobs;
        const mergeResult = mergeDiscoveredPostings(
          profile,
          enrichedPreferences,
          mergeSeedJobs,
          triagedPostings,
          (posting) =>
            createDiscoveryProvenance({
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: collected.adapterKind,
              startingUrl: target.startingUrl,
              discoveredAt: new Date().toISOString(),
              collectionMethod: collected.collectionMethod,
              providerKey: posting.providerKey,
              providerBoardToken: posting.providerBoardToken,
              titleTriageOutcome: posting.titleTriageOutcome,
            }),
          options.signal,
        );
        const changedJobIds = collectResumeAffectingChangedJobIds(
          workingSavedJobs,
          mergeResult.mergedJobs,
        );

        const persistedSavedJobIds = new Set(workingSavedJobs.map((job) => job.id));
        let jobsPersisted = 0;
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
          jobsPersisted = mergeResult.newJobs.length;
        }

        for (const posting of triagedPostings) {
          workingLedger = recordDiscoveredPostingInLedger({
            ledger: workingLedger,
            posting,
            targetId: target.id,
            seenAt: new Date().toISOString(),
            status: "enriched",
          });
        }

        workingLedger = applyInactiveLedgerMarks({
          ledger: workingLedger,
          targetId: target.id,
          seenCanonicalUrls: targetSeenUrls,
          occurredAt: new Date().toISOString(),
          allowInactiveMarking: options.allowInactiveMarking ?? options.scope === "run_all",
        });

        emitActivity(
          createDiscoveryEvent({
            runId,
            timestamp: new Date().toISOString(),
            kind: "progress",
            stage: "persistence",
            waitReason: "persisting_results",
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: collected.adapterKind,
            message: `Saving the kept jobs and updated discovery ledger for ${target.label}`,
            url: target.startingUrl,
            jobsFound: mergeResult.validatedCount,
            jobsPersisted,
            jobsStaged,
            duplicatesMerged: mergeResult.duplicatesMerged,
            invalidSkipped: mergeResult.invalidSkipped,
          }),
        );

        activeRun = updateRunSummary(activeRun, {
          validJobsFound: activeRun.summary.validJobsFound + mergeResult.validatedCount,
          jobsPersisted: activeRun.summary.jobsPersisted + jobsPersisted,
          jobsStaged: activeRun.summary.jobsStaged + jobsStaged,
          jobsSkippedByLedger:
            activeRun.summary.jobsSkippedByLedger + skippedByLedger,
          jobsSkippedByTitleTriage:
            activeRun.summary.jobsSkippedByTitleTriage + skippedByTitleTriage,
          duplicatesMerged:
            activeRun.summary.duplicatesMerged + mergeResult.duplicatesMerged,
          invalidSkipped: activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
        });

        const targetCompletedAt = new Date().toISOString();
        activeRun = completeTargetExecution(activeRun, target.id, targetCompletedAt, {
          state: "completed",
          jobsFound: mergeResult.validatedCount,
          jobsPersisted,
          jobsStaged,
          warning: collected.result.warning,
        });
        emitActivity(
          createDiscoveryEvent({
            runId,
            timestamp: targetCompletedAt,
            kind: "success",
            stage: "target",
            waitReason: "persisting_results",
            targetId: target.id,
            adapterKind: target.adapterKind,
            resolvedAdapterKind: collected.adapterKind,
            terminalState: "completed",
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
              discoveryLedger: workingLedger,
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
            discoveryLedger: workingLedger,
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
      const browserCloseoutOccurredAt = new Date().toISOString();
      if (!keepSessionAlive) {
        for (const source of openedSessionSources) {
          await ctx.closeRunBrowserSession(source).catch(() => {});
        }
      }

      if (openedSessionSources.size > 0) {
        const representativeSource = [...openedSessionSources][0] ?? "target_site";
        const session = await ctx.browserRuntime.getSessionState(representativeSource).catch(
          () => null,
        );
        if (session) {
          activeRun = updateRunSummary(activeRun, {
            browserCloseout: {
              ...describeCloseoutMode(keepSessionAlive),
              status: session.status,
              driver: session.driver,
              occurredAt: browserCloseoutOccurredAt,
            },
          });
        }
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
          discoveryLedger: workingLedger,
        },
        activeRun,
        enrichedPreferences,
      ),
    );

    return ctx.getWorkspaceSnapshot();
  }

  return {
    async runDiscovery(targetId) {
      return executeDiscoveryPipeline({
        scope: targetId ? "single_target" : "run_all",
        ...(targetId ? { targetId } : {}),
        allowInactiveMarking: !targetId,
      });
    },
    async runAgentDiscovery(onActivity, signal, targetId) {
      return executeDiscoveryPipeline({
        scope: targetId ? "single_target" : "run_all",
        ...(targetId ? { targetId } : {}),
        ...(onActivity ? { onActivity } : {}),
        ...(signal ? { signal } : {}),
        allowInactiveMarking: !targetId,
      });
    },
    async runDiscoveryForTarget(targetId, onActivity, signal) {
      return executeDiscoveryPipeline({
        scope: "single_target",
        targetId,
        ...(onActivity ? { onActivity } : {}),
        ...(signal ? { signal } : {}),
        allowInactiveMarking: false,
      });
    },
  };
}
