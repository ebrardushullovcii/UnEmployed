import {
  DiscoveryRunRecordSchema,
  JobPostingSchema,
  type CandidateProfile,
  type DiscoveryActivityEvent,
  type DiscoveryLedgerEntry,
  type DiscoveryRunRecord,
  type DiscoveryRunResult,
  type DiscoveryRunScope,
  type JobDiscoveryTarget,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type SourceIntelligenceProviderKey,
} from "@unemployed/contracts";
import {
  appendDiscoveryEvent,
  createDiscoveryEvent,
  finalizeDiscoveryState,
  summarizeProgressAction,
  updateTargetExecution,
} from "./discovery-state";
import { createMatchAssessment, mergeDiscoveredPostings } from "./matching";
import { createMatchAssessmentSession } from "./match-assessment-session";
import {
  compareMatchRecommendationPriority,
  compareMatchRoleSuitabilityPriority,
  compareMatchScores,
} from "./match-assessment-ranking";
import {
  buildDiscoveryInstructionGuidance,
  enrichSearchPreferencesFromProfile,
  getActiveDiscoveryTargets,
  resolveActiveSourceInstructionArtifact,
  resolveAdapterKind,
} from "./workspace-helpers";
import { collectResumeAffectingChangedJobIds } from "./resume-workspace-staleness";
import { DEFAULT_ROLE, discoveryAdapters } from "./workspace-defaults";
import {
  applyInactiveLedgerMarks,
  createDiscoveryFreshnessDigest,
  createDiscoveryLedgerIndex,
  createDiscoveryProvenance,
  formatDiscoveryFreshnessDigest,
  mergePendingJobs,
  mergeSavedJobs,
  overlayTouchedPendingJobs,
  overlayTouchedSavedJobs,
  recordDiscoveredPostingInLedger,
  shouldSkipPostingFromLedger,
} from "./workspace-service-helpers";
import { createDiscoveryRefreshDecision } from "./workspace-discovery-refresh-schedule";
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
  selectLowYieldTechnicalFallbackPostings,
  selectDiscoveryCollectionMethod,
  selectDiscoveryMethod,
} from "./workspace-source-intelligence";
import { createUniqueId, normalizeText, uniqueStrings } from "./shared";
import { assessJobPostingDetailQuality } from "./job-posting-detail-quality";

const DISCOVERY_ACTIVITY_SAMPLE_LIMIT = 3;
const LOW_YIELD_TECHNICAL_DISCOVERY_FLOOR = 6;

type PublicProviderJobsResult = Awaited<
  ReturnType<typeof collectPublicProviderJobs>
>;
type SettledPublicProviderJobsResult =
  | { result: PublicProviderJobsResult; error: null }
  | { result: null; error: unknown };

async function* iterateDiscoveryTargetsByReadiness(input: {
  targets: readonly JobDiscoveryTarget[];
  prefetchedPublicApiResults: ReadonlyMap<
    string,
    Promise<SettledPublicProviderJobsResult>
  >;
  signal: AbortSignal;
}): AsyncGenerator<JobDiscoveryTarget> {
  const readyApiTargets: JobDiscoveryTarget[] = [];
  const pendingApiTargetIds = new Set<string>();
  const serialTargets: JobDiscoveryTarget[] = [];
  let notifyReady: (() => void) | null = null;

  for (const target of input.targets) {
    const request = input.prefetchedPublicApiResults.get(target.id);
    if (!request) {
      serialTargets.push(target);
      continue;
    }

    pendingApiTargetIds.add(target.id);
    void request.then(() => {
      if (!pendingApiTargetIds.has(target.id)) {
        return;
      }

      readyApiTargets.push(target);
      const notify = notifyReady;
      notifyReady = null;
      notify?.();
    });
  }

  let serialTargetIndex = 0;
  while (
    pendingApiTargetIds.size > 0 ||
    serialTargetIndex < serialTargets.length
  ) {
    if (input.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // Give already-settled inventory promises a microtask turn to enter the
    // ready queue before a serial browser target claims the shared session.
    await Promise.resolve();

    const readyApiTarget = readyApiTargets.shift();
    if (readyApiTarget) {
      pendingApiTargetIds.delete(readyApiTarget.id);
      yield readyApiTarget;
      continue;
    }

    const serialTarget = serialTargets[serialTargetIndex];
    if (serialTarget) {
      serialTargetIndex += 1;
      yield serialTarget;
      continue;
    }

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        input.signal.removeEventListener("abort", onAbort);
      };
      const finishReady = () => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        resolve();
      };
      const onAbort = () => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };

      notifyReady = finishReady;
      input.signal.addEventListener("abort", onAbort, { once: true });
      if (readyApiTargets.length > 0) {
        notifyReady = null;
        finishReady();
      }
    });
  }
}

export function selectDiscoveryBudgetPostings(input: {
  postings: readonly JobPosting[];
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  limit: number;
  preferredCanonicalUrls?: readonly string[];
  assessPosting?: (
    posting: JobPosting,
  ) => ReturnType<typeof createMatchAssessment>;
}): JobPosting[] {
  const normalizeCanonicalUrl = (value: string): string => {
    try {
      const parsed = new URL(value);
      parsed.hash = "";
      parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
      return parsed.toString();
    } catch {
      return value.trim();
    }
  };
  const preferredCanonicalUrls = new Set(
    (input.preferredCanonicalUrls ?? []).map(normalizeCanonicalUrl),
  );
  const ranked = input.postings
    .map((posting, index) => ({
      posting,
      index,
      preferred: preferredCanonicalUrls.has(
        normalizeCanonicalUrl(posting.canonicalUrl),
      ),
      assessment:
        input.assessPosting?.(posting) ??
        createMatchAssessment(input.profile, input.searchPreferences, posting),
      postedAt: posting.postedAt
        ? new Date(posting.postedAt).getTime()
        : Number.NEGATIVE_INFINITY,
    }))
    .sort(
      (left, right) =>
        compareMatchRecommendationPriority(left.assessment, right.assessment) ||
        Number(right.preferred) - Number(left.preferred) ||
        compareMatchRoleSuitabilityPriority(left.assessment, right.assessment) ||
        compareMatchScores(left.assessment, right.assessment) ||
        right.postedAt - left.postedAt ||
        left.index - right.index,
    );
  const selected: JobPosting[] = [];
  const seenRoleVariants = new Set<string>();
  const limit = Math.max(0, input.limit);

  for (const entry of ranked) {
    if (selected.length >= limit) {
      break;
    }

    const roleVariantKey = [
      normalizeText(entry.posting.company),
      normalizeText(entry.posting.title),
    ].join(":");
    if (seenRoleVariants.has(roleVariantKey)) {
      continue;
    }

    seenRoleVariants.add(roleVariantKey);
    selected.push(entry.posting);
  }

  return selected;
}

function describeUnknownThrowable(caughtError: unknown): string {
  if (typeof caughtError === "string") {
    return caughtError;
  }

  if (
    typeof caughtError === "number" ||
    typeof caughtError === "boolean" ||
    typeof caughtError === "bigint" ||
    typeof caughtError === "symbol"
  ) {
    return String(caughtError);
  }

  if (caughtError && typeof caughtError === "object") {
    if ("message" in caughtError && typeof caughtError.message === "string") {
      return caughtError.message;
    }

    try {
      const serialized = JSON.stringify(caughtError);
      if (serialized) {
        return serialized;
      }
    } catch {
      // Ignore serialization failures and fall back to a generic description.
    }

    return "non-serializable object throwable";
  }

  return "unknown throwable";
}

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

function formatDiscoveryPostingLabel(input: {
  title: string;
  company: string;
}): string {
  const title = input.title.trim();
  const company = input.company.trim();

  return company ? `${title} at ${company}` : title;
}

function formatDiscoveryPostingSamples(
  postings: readonly Pick<JobPosting, "title" | "company">[],
): string | null {
  const labels = uniqueStrings(
    postings
      .map((posting) => formatDiscoveryPostingLabel(posting))
      .filter(Boolean),
  ).slice(0, DISCOVERY_ACTIVITY_SAMPLE_LIMIT);

  return labels.length > 0
    ? labels.map((label) => `"${label}"`).join("; ")
    : null;
}

function formatDiscoverySkipSamples(
  samples: {
    title: string;
    company: string;
    reason: string | null;
  }[],
): string | null {
  const labels = uniqueStrings(
    samples.map((sample) => {
      const label = formatDiscoveryPostingLabel(sample);
      return sample.reason ? `${label} -> ${sample.reason}` : label;
    }),
  ).slice(0, DISCOVERY_ACTIVITY_SAMPLE_LIMIT);

  return labels.length > 0
    ? labels.map((label) => `"${label}"`).join("; ")
    : null;
}

function getSourceIntelligenceProviderKey(
  intelligence: NonNullable<JobPosting["sourceIntelligence"]>,
): SourceIntelligenceProviderKey | null {
  return intelligence.provider?.key ?? null;
}

function getDiscoveryProviderKey(input: {
  target: JobDiscoveryTarget;
  intelligence: NonNullable<JobPosting["sourceIntelligence"]>;
}): SourceIntelligenceProviderKey | null {
  return (
    getSourceIntelligenceProviderKey(input.intelligence) ??
    inferSourceIntelligenceFromTarget({
      target: input.target,
      currentArtifact: null,
    }).provider?.key ??
    null
  );
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
      requestedJobBudget: null,
      jobsReviewed: 0,
      jobsFound: 0,
      jobsPersisted: 0,
      jobsStaged: 0,
      jobsSkippedByLedger: 0,
      jobsSkippedByTitleTriage: 0,
      duplicatesMerged: 0,
      invalidSkipped: 0,
      warning: null,
      compactionState: null,
      compactionUsedFallbackTrigger: false,
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
  options: DiscoveryTargetPipelineOptions,
): JobDiscoveryTarget[] {
  const activeTargets = getActiveDiscoveryTargets(searchPreferences);

  if (options.scope !== "single_target") {
    return activeTargets;
  }

  return activeTargets.filter((target) => target.id === options.targetId);
}

function getDiscoveryCollectionMethodPriority(method: string): number {
  switch (method) {
    case "api":
      return 0;
    case "listing_route":
      return 1;
    case "careers_page":
      return 2;
    case "fallback_search":
      return 3;
    default:
      return 4;
  }
}

function getSourceInstructionPriority(
  status: JobDiscoveryTarget["instructionStatus"] | null,
): number {
  switch (status) {
    case "validated":
      return 0;
    case "draft":
      return 1;
    case "missing":
      return 2;
    default:
      return 3;
  }
}

function prioritizeDiscoveryTargets(
  targets: readonly JobDiscoveryTarget[],
  sourceInstructionArtifacts: Awaited<
    ReturnType<
      WorkspaceServiceContext["repository"]["listSourceInstructionArtifacts"]
    >
  >,
  searchPreferences: JobSearchPreferences,
): JobDiscoveryTarget[] {
  return [...targets]
    .map((target, index) => {
      const activeInstruction = resolveActiveSourceInstructionArtifact(
        target,
        sourceInstructionArtifacts,
      );
      const collectionMethod = selectDiscoveryCollectionMethod(
        target,
        activeInstruction,
      );
      const startingUrls = buildDiscoveryStartingUrls(
        target,
        activeInstruction,
        searchPreferences,
      );

      return {
        target,
        index,
        collectionMethodPriority:
          getDiscoveryCollectionMethodPriority(collectionMethod),
        instructionPriority: getSourceInstructionPriority(
          activeInstruction?.status ?? target.instructionStatus,
        ),
        learnedRoutePriority:
          startingUrls[0] != null && startingUrls[0] !== target.startingUrl
            ? 0
            : 1,
      };
    })
    .sort((left, right) => {
      if (left.collectionMethodPriority !== right.collectionMethodPriority) {
        return left.collectionMethodPriority - right.collectionMethodPriority;
      }

      if (left.instructionPriority !== right.instructionPriority) {
        return left.instructionPriority - right.instructionPriority;
      }

      if (left.learnedRoutePriority !== right.learnedRoutePriority) {
        return left.learnedRoutePriority - right.learnedRoutePriority;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.target);
}

function createPostingWithTriage(
  posting: JobPosting,
  searchPreferences: JobSearchPreferences,
  profile: CandidateProfile,
): {
  posting: JobPosting;
  triageReason: string | null;
} {
  const triage = applyDiscoveryTitleTriage({
    posting,
    searchPreferences,
    profile,
  });

  return {
    posting: JobPostingSchema.parse({
      ...posting,
      titleTriageOutcome: triage.outcome,
    }),
    triageReason: triage.outcome === "pass" ? null : triage.reason,
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
  const detailQuality = assessJobPostingDetailQuality(input.posting);

  return JobPostingSchema.parse({
    ...input.posting,
    source: input.posting.source ?? input.adapterKind,
    discoveryMethod: input.discoveryMethod,
    collectionMethod: input.collectionMethod,
    company: input.posting.company || input.target.label,
    providerKey: input.posting.providerKey ?? provider?.key ?? null,
    providerBoardToken:
      input.posting.providerBoardToken ?? provider?.boardToken ?? null,
    providerIdentifier:
      input.posting.providerIdentifier ?? provider?.providerIdentifier ?? null,
    atsProvider: input.posting.atsProvider ?? provider?.label ?? null,
    sourceIntelligence: input.intelligence,
    detailQuality,
  });
}

async function collectTargetJobs(input: {
  ctx: WorkspaceServiceContext;
  target: JobDiscoveryTarget;
  sourceInstructionArtifacts: Awaited<
    ReturnType<
      WorkspaceServiceContext["repository"]["listSourceInstructionArtifacts"]
    >
  >;
  profile: Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>
  >;
  searchPreferences: JobSearchPreferences;
  targetJobCount: number;
  maxSteps: number;
  activeRun: DiscoveryRunRecord;
  emitActivity: (event: DiscoveryActivityEvent) => void;
  signal?: AbortSignal;
  openedSessionSources: Set<JobSource>;
  useAgentRuntime: boolean;
  prefetchedPublicApiResult?: Promise<SettledPublicProviderJobsResult>;
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
  const collectionMethod = selectDiscoveryCollectionMethod(
    target,
    activeInstruction,
  );
  const discoveryMethod = selectDiscoveryMethod(collectionMethod);
  const startingUrls = buildDiscoveryStartingUrls(
    target,
    activeInstruction,
    input.searchPreferences,
  );
  const providerLabel = intelligence.provider?.label ?? "Unknown provider";
  const sourceIntelligenceProvider = getDiscoveryProviderKey({
    target,
    intelligence,
  });

  if (discoveryMethod === "public_api") {
    const startedAt = new Date().toISOString();
    input.emitActivity(
      createDiscoveryEvent({
        runId: input.activeRun.id,
        timestamp: startedAt,
        kind: "progress",
        stage: "navigation",
        waitReason: "executing_tool",
        targetId: target.id,
        adapterKind: target.adapterKind,
        resolvedAdapterKind: adapterKind,
        collectionMethod,
        sourceIntelligenceProvider,
        message: `Using ${providerLabel} public API for ${target.label}`,
        url: startingUrls[0] ?? target.startingUrl,
        jobsFound: 0,
        jobsPersisted: input.activeRun.summary.jobsPersisted,
        jobsStaged: input.activeRun.summary.jobsStaged,
        duplicatesMerged: input.activeRun.summary.duplicatesMerged,
        invalidSkipped: input.activeRun.summary.invalidSkipped,
      }),
    );

    const prefetched = input.prefetchedPublicApiResult
      ? await input.prefetchedPublicApiResult
      : null;
    if (prefetched?.error) {
      throw prefetched.error instanceof Error
        ? prefetched.error
        : new Error(describeUnknownThrowable(prefetched.error));
    }
    const apiResult =
      prefetched?.result ??
      (await collectPublicProviderJobs({
        target,
        artifact: { intelligence },
        source: adapterKind,
        ...(input.signal ? { signal: input.signal } : {}),
      }));
    const completedAt = new Date().toISOString();

    return {
      result: {
        source: adapterKind,
        startedAt,
        completedAt,
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
        collectionMethod,
        sourceIntelligenceProvider,
        message: `Starting or attaching the browser profile for ${target.label}`,
        url: target.startingUrl,
        jobsFound: 0,
        jobsPersisted: input.activeRun.summary.jobsPersisted,
        jobsStaged: input.activeRun.summary.jobsStaged,
        duplicatesMerged: input.activeRun.summary.duplicatesMerged,
        invalidSkipped: input.activeRun.summary.invalidSkipped,
      }),
    );
    await ctx.openRunBrowserSession(adapterKind, {
      targetUrl: target.startingUrl,
      targetId: target.id,
    });
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
  const instructionLines = buildDiscoveryInstructionGuidance(activeInstruction);

  if (input.useAgentRuntime && ctx.browserRuntime.runAgentDiscovery) {
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
      agentHints: {
        widenReviewBudget: adapter.kind === "target_site",
      },
      siteLabel: target.label,
      navigationHostnames: targetUrl ? [targetUrl.hostname] : [],
      siteInstructions: [...adapter.siteInstructions, ...instructionLines],
      toolUsageNotes: adapter.toolUsageNotes,
      compactionHints: {
        workflowKey: "browser_agent_live_discovery",
      },
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
            collectionMethod,
            sourceIntelligenceProvider,
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

  const result = await ctx.browserRuntime.runDiscovery(
    adapterKind,
    input.searchPreferences,
  );
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
  function trackDiscoveryPromise<T>(promise: Promise<T>): Promise<T> {
    ctx.activeDiscoveryPromiseRef.current = promise;
    void promise
      .finally(() => {
        if (ctx.activeDiscoveryPromiseRef.current === promise) {
          ctx.activeDiscoveryPromiseRef.current = null;
        }
      })
      .catch(() => {});
    return promise;
  }

  async function executeDiscoveryPipeline(
    options: DiscoveryTargetPipelineOptions,
  ) {
    if (ctx.activeDiscoveryAbortControllerRef.current) {
      throw new Error(
        "A discovery run is already in progress. Wait for it to finish or cancel it before starting another run.",
      );
    }

    const executionController = new AbortController();
    ctx.activeDiscoveryAbortControllerRef.current = executionController;
    const onExternalAbort = () => executionController.abort();
    if (options.signal?.aborted) {
      executionController.abort();
    } else {
      options.signal?.addEventListener("abort", onExternalAbort);
    }
    const executionSignal = executionController.signal;
    const clearActiveController = () => {
      options.signal?.removeEventListener("abort", onExternalAbort);
      if (
        ctx.activeDiscoveryAbortControllerRef.current === executionController
      ) {
        ctx.activeDiscoveryAbortControllerRef.current = null;
      }
    };

    let terminalStatus: "cancelled" | "failed" | "completed" = "completed";
    let caughtError: unknown = null;
    const [
      profile,
      searchPreferences,
      settings,
      startingSavedJobs,
      startingDiscovery,
    ] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.getSettings(),
      ctx.repository.listSavedJobs(),
      ctx.repository.getDiscoveryState(),
    ]).catch((error: unknown) => {
      clearActiveController();
      throw error;
    });
    const enrichedPreferences = enrichSearchPreferencesFromProfile(
      searchPreferences,
      profile,
    );
    const assessmentSession = createMatchAssessmentSession({
      profile,
      searchPreferences: enrichedPreferences,
      calculate: createMatchAssessment,
    });
    const selectedTargets = selectTargets(enrichedPreferences, options);

    if (selectedTargets.length === 0) {
      clearActiveController();

      if (options.scope === "single_target") {
        throw new Error("single_target: target not found or unavailable");
      }

      return ctx.getWorkspaceSnapshot();
    }

    // Revalidate the local inventory before consulting the discovery ledger.
    // Exact scorer, profile/preference, and posting fingerprints reuse a
    // persisted assessment; any relevant change misses safely and recomputes.
    let workingSavedJobs = startingSavedJobs.map((job) => ({
      ...job,
      matchAssessment: assessmentSession.assessPersisted(
        job,
        job.matchAssessment,
      ),
    }));
    let workingPendingJobs = startingDiscovery.pendingDiscoveryJobs.map(
      (job) => ({
        ...job,
        matchAssessment: assessmentSession.assessPersisted(
          job,
          job.matchAssessment,
        ),
      }),
    );
    let workingLedger: DiscoveryLedgerEntry[] = [
      ...startingDiscovery.discoveryLedger,
    ];
    const touchedSavedJobIds = new Set<string>();
    const touchedPendingJobIds = new Set<string>();
    workingSavedJobs.forEach((job) => touchedSavedJobIds.add(job.id));
    workingPendingJobs.forEach((job) => touchedPendingJobIds.add(job.id));
    const openedSessionSources = new Set<JobSource>();
    const sourceInstructionArtifacts = await ctx.repository
      .listSourceInstructionArtifacts()
      .catch((error: unknown) => {
        clearActiveController();
        throw error;
      });
    const targets =
      options.scope === "run_all"
        ? prioritizeDiscoveryTargets(
            selectedTargets,
            sourceInstructionArtifacts,
            enrichedPreferences,
          )
        : selectedTargets;
    const runId = createUniqueId("discovery_run");
    const keepSessionAlive = settings.keepSessionAlive;
    let activeRun = createInitialRunRecord({
      id: runId,
      targets,
      scope: options.scope,
    });

    const recordActivity = (event: DiscoveryActivityEvent) => {
      activeRun = appendDiscoveryEvent(activeRun, event);
    };
    const publishActivity = (event: DiscoveryActivityEvent) => {
      options.onActivity?.(event);
    };
    const emitActivity = (event: DiscoveryActivityEvent) => {
      recordActivity(event);
      publishActivity(event);
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

    await ctx
      .persistDiscoveryState((current) => ({
        ...current,
        runState: "running",
        activeRun,
        recentRuns: current.recentRuns,
        pendingDiscoveryJobs: workingPendingJobs,
        discoveryLedger: workingLedger,
      }))
      .catch((error: unknown) => {
        clearActiveController();
        throw error;
      });

    // Public inventories are independent network reads. Start them together;
    // the readiness iterator below then processes each API target in settlement
    // order. Every target remains a deterministic, durable publication batch,
    // while browser-backed targets retain exclusive serial session ownership.
    const prefetchedPublicApiResults = new Map<
      string,
      Promise<SettledPublicProviderJobsResult>
    >();
    for (const target of targets) {
      const artifact = resolveActiveSourceInstructionArtifact(
        target,
        sourceInstructionArtifacts,
      );
      if (selectDiscoveryCollectionMethod(target, artifact) !== "api") {
        continue;
      }

      const intelligence = inferSourceIntelligenceFromTarget({
        target,
        currentArtifact: artifact,
      });
      const request = collectPublicProviderJobs({
        target,
        artifact: { intelligence },
        source: resolveAdapterKind(target),
        signal: executionSignal,
      }).then(
        (result): SettledPublicProviderJobsResult => ({ result, error: null }),
        (error: unknown): SettledPublicProviderJobsResult => ({
          result: null,
          error,
        }),
      );
      prefetchedPublicApiResults.set(target.id, request);
    }

    try {
      let executionIndex = 0;
      for await (const target of iterateDiscoveryTargetsByReadiness({
        targets,
        prefetchedPublicApiResults,
        signal: executionSignal,
      })) {
        const index = executionIndex;
        executionIndex += 1;
        if (executionSignal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        const targetStartedAt = new Date().toISOString();
        const targetArtifact = resolveActiveSourceInstructionArtifact(
          target,
          sourceInstructionArtifacts,
        );
        const targetIntelligence = inferSourceIntelligenceFromTarget({
          target,
          currentArtifact: targetArtifact,
        });
        const targetCollectionMethod = selectDiscoveryCollectionMethod(
          target,
          targetArtifact,
        );
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
            collectionMethod: targetCollectionMethod,
            sourceIntelligenceProvider: getDiscoveryProviderKey({
              target,
              intelligence: targetIntelligence,
            }),
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
          validJobsFoundSoFar:
            activeRun.summary.jobsPersisted + activeRun.summary.jobsStaged,
        });
        activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
          ...entry,
          requestedJobBudget: discoveryBudget.targetJobCount,
        }));
        let collected: Awaited<ReturnType<typeof collectTargetJobs>>;
        try {
          collected = await collectTargetJobs({
            ctx,
            target,
            sourceInstructionArtifacts,
            profile,
            searchPreferences: enrichedPreferences,
            targetJobCount: discoveryBudget.targetJobCount,
            maxSteps: discoveryBudget.maxSteps,
            activeRun,
            emitActivity,
            signal: executionSignal,
            openedSessionSources,
            useAgentRuntime: options.useAgentRuntime ?? false,
            ...(prefetchedPublicApiResults.get(target.id)
              ? {
                  prefetchedPublicApiResult: prefetchedPublicApiResults.get(
                    target.id,
                  )!,
                }
              : {}),
          });
        } catch (error) {
          const interrupted =
            executionSignal.aborted ||
            (error instanceof DOMException && error.name === "AbortError");
          if (interrupted || options.scope === "single_target") {
            throw error;
          }

          const failedAt = new Date().toISOString();
          const warning = `Discovery failed for ${target.label}: ${describeUnknownThrowable(error)}`;
          activeRun = completeTargetExecution(activeRun, target.id, failedAt, {
            state: "failed",
            requestedJobBudget: discoveryBudget.targetJobCount,
            jobsReviewed: 0,
            jobsFound: 0,
            jobsPersisted: 0,
            jobsStaged: 0,
            jobsSkippedByLedger: 0,
            jobsSkippedByTitleTriage: 0,
            duplicatesMerged: 0,
            invalidSkipped: 0,
            warning,
          });
          emitActivity(
            createDiscoveryEvent({
              runId,
              timestamp: failedAt,
              kind: "error",
              stage: "target",
              waitReason: "finalizing",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: resolveAdapterKind(target),
              collectionMethod: targetCollectionMethod,
              sourceIntelligenceProvider: getDiscoveryProviderKey({
                target,
                intelligence: targetIntelligence,
              }),
              terminalState: "failed",
              message: warning,
              url: target.startingUrl,
              jobsFound: 0,
              jobsPersisted: activeRun.summary.jobsPersisted,
              jobsStaged: activeRun.summary.jobsStaged,
              duplicatesMerged: activeRun.summary.duplicatesMerged,
              invalidSkipped: activeRun.summary.invalidSkipped,
            }),
          );
          continue;
        }
        const collectedJobs = collected.result.jobs;
        const freshnessDigest = createDiscoveryFreshnessDigest({
          ledger: workingLedger,
          postings: collectedJobs,
        });
        const freshnessSummary =
          formatDiscoveryFreshnessDigest(freshnessDigest);
        const collectedProviderKey = getDiscoveryProviderKey({
          target,
          intelligence: collected.intelligence,
        });

        activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
          ...entry,
          collectionMethod: collected.collectionMethod,
          sourceIntelligenceProvider: collectedProviderKey,
          compactionState:
            collected.result.agentMetadata?.compactionState ?? null,
          compactionUsedFallbackTrigger:
            collected.result.agentMetadata?.compactionUsedFallbackTrigger ??
            false,
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
            collectionMethod: collected.collectionMethod,
            sourceIntelligenceProvider: collectedProviderKey,
            message: collected.result.warning
              ? `Collected ${collectedJobs.length} candidate jobs from ${target.label}. ${freshnessSummary} Sample: ${formatDiscoveryPostingSamples(collectedJobs) ?? "none"}. ${collected.result.warning}`
              : `Collected ${collectedJobs.length} candidate jobs from ${target.label}. ${freshnessSummary} Sample: ${formatDiscoveryPostingSamples(collectedJobs) ?? "none"}`,
            url: target.startingUrl,
            jobsFound: collectedJobs.length,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          }),
        );

        const targetSeenUrls = uniqueStrings(
          collected.result.jobs.map((posting) => posting.canonicalUrl),
        );
        const triagedPostings: JobPosting[] = [];
        const triageSkippedPostings: JobPosting[] = [];
        let skippedByTitleTriage = 0;
        let skippedByLedger = 0;
        const titleTriageSkipSamples: Array<{
          title: string;
          company: string;
          reason: string | null;
        }> = [];
        const collectionSucceeded = collected.result.warning == null;

        const knownJobIndex = createDiscoveryLedgerIndex(workingLedger);

        for (const rawPosting of collectedJobs) {
          const posting = JobPostingSchema.parse(rawPosting);
          const { posting: triagedPosting, triageReason } =
            createPostingWithTriage(posting, enrichedPreferences, profile);

          if (triagedPosting.titleTriageOutcome !== "pass") {
            skippedByTitleTriage += 1;
            triageSkippedPostings.push(triagedPosting);
            if (
              titleTriageSkipSamples.length < DISCOVERY_ACTIVITY_SAMPLE_LIMIT
            ) {
              titleTriageSkipSamples.push({
                title: triagedPosting.title,
                company: triagedPosting.company,
                reason: triageReason,
              });
            }
            workingLedger = recordDiscoveredPostingInLedger({
              ledger: workingLedger,
              index: knownJobIndex,
              posting: triagedPosting,
              targetId: target.id,
              seenAt: triagedPosting.discoveredAt,
              status: "seen",
              skipReason: triageReason,
            });
            continue;
          }

          const ledgerEntry = knownJobIndex.find(triagedPosting);
          const refreshDecision = createDiscoveryRefreshDecision({
            ledgerEntry,
            posting: triagedPosting,
            evaluatedAt: triagedPosting.discoveredAt,
          });
          const ledgerDecision = shouldSkipPostingFromLedger({
            ledgerEntry,
            posting: triagedPosting,
            triageOutcome: triagedPosting.titleTriageOutcome,
          });
          const canReuseKnownPosting =
            ledgerDecision.skip &&
            refreshDecision.disposition !== "refresh_now";

          if (canReuseKnownPosting) {
            skippedByLedger += 1;
            workingLedger = recordDiscoveredPostingInLedger({
              ledger: workingLedger,
              index: knownJobIndex,
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
            index: knownJobIndex,
            posting: triagedPosting,
            targetId: target.id,
            seenAt: triagedPosting.discoveredAt,
            status: "seen",
          });
          triagedPostings.push(triagedPosting);
        }

        const technicalFallbackLimit = Math.max(
          0,
          LOW_YIELD_TECHNICAL_DISCOVERY_FLOOR - triagedPostings.length,
        );
        const rescuedPostings =
          technicalFallbackLimit > 0
            ? selectLowYieldTechnicalFallbackPostings({
                skippedPostings: triageSkippedPostings,
                searchPreferences: enrichedPreferences,
                profile,
                limit: technicalFallbackLimit,
              })
            : [];

        if (rescuedPostings.length > 0) {
          for (const posting of rescuedPostings) {
            workingLedger = recordDiscoveredPostingInLedger({
              ledger: workingLedger,
              index: knownJobIndex,
              posting,
              targetId: target.id,
              seenAt: posting.discoveredAt,
              status: "seen",
            });
            triagedPostings.push(posting);
          }

          skippedByTitleTriage = Math.max(
            0,
            skippedByTitleTriage - rescuedPostings.length,
          );
          for (
            let index = titleTriageSkipSamples.length - 1;
            index >= 0;
            index -= 1
          ) {
            const sample = titleTriageSkipSamples[index];
            const rescuedPosting = sample
              ? rescuedPostings.find(
                  (posting) =>
                    posting.title === sample.title &&
                    posting.company === sample.company,
                )
              : null;
            if (rescuedPosting) {
              titleTriageSkipSamples.splice(index, 1);
            }
          }
        }

        const budgetedPostings = selectDiscoveryBudgetPostings({
          postings: triagedPostings,
          profile,
          searchPreferences: enrichedPreferences,
          limit: discoveryBudget.targetJobCount,
          preferredCanonicalUrls: [target.startingUrl],
          assessPosting: assessmentSession.assess,
        });
        const fairShareSuffix =
          triagedPostings.length > budgetedPostings.length
            ? ` Limited ${triagedPostings.length} qualifying jobs to the ${budgetedPostings.length} strongest matches for this source.`
            : "";

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
            collectionMethod: collected.collectionMethod,
            sourceIntelligenceProvider: collectedProviderKey,
            message:
              budgetedPostings.length > 0
                ? `Reviewing ${budgetedPostings.length} promising jobs from ${target.label}. Sample: ${formatDiscoveryPostingSamples(budgetedPostings) ?? "none"}${fairShareSuffix}${rescuedPostings.length > 0 ? ` Technical low-yield fallback kept ${rescuedPostings.length} additional job${rescuedPostings.length === 1 ? "" : "s"}.` : ""}`
                : `Reviewing 0 promising jobs from ${target.label}. Title triage skipped ${skippedByTitleTriage}. Sample skips: ${formatDiscoverySkipSamples(titleTriageSkipSamples) ?? "none"}`,
            url: target.startingUrl,
            jobsFound: budgetedPostings.length,
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
          budgetedPostings,
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
          executionSignal,
          assessmentSession.assess,
        );
        const changedJobIds = collectResumeAffectingChangedJobIds(
          workingSavedJobs,
          mergeResult.mergedJobs,
        );

        const persistedSavedJobIds = new Set(
          workingSavedJobs.map((job) => job.id),
        );
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
          workingPendingJobs = mergePendingJobs(
            workingPendingJobs,
            nextPendingJobs,
          );
          jobsStaged = mergeResult.newJobs.length;
          nextPendingJobs.forEach((job) => touchedPendingJobIds.add(job.id));
          workingSavedJobs.forEach((job) => touchedSavedJobIds.add(job.id));
        } else {
          workingSavedJobs = mergeResult.mergedJobs;
          mergeResult.mergedJobs.forEach((job) =>
            touchedSavedJobIds.add(job.id),
          );
          jobsPersisted = mergeResult.newJobs.length;
        }

        for (const posting of budgetedPostings) {
          workingLedger = recordDiscoveredPostingInLedger({
            ledger: workingLedger,
            index: knownJobIndex,
            posting,
            targetId: target.id,
            seenAt: new Date().toISOString(),
            status:
              posting.detailQuality === "detail_enriched" ? "enriched" : "seen",
          });
        }

        const inactiveLedgerEntryIdsBefore = new Set(
          workingLedger
            .filter(
              (entry) =>
                entry.targetId === target.id &&
                entry.latestStatus === "inactive",
            )
            .map((entry) => entry.id),
        );
        workingLedger = applyInactiveLedgerMarks({
          ledger: workingLedger,
          targetId: target.id,
          seenCanonicalUrls: targetSeenUrls,
          occurredAt: new Date().toISOString(),
          allowInactiveMarking:
            (options.allowInactiveMarking ?? options.scope === "run_all") &&
            collectionSucceeded,
        });

        const newlyInactiveCount = workingLedger.filter(
          (entry) =>
            entry.targetId === target.id &&
            entry.latestStatus === "inactive" &&
            !inactiveLedgerEntryIdsBefore.has(entry.id),
        ).length;

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
            collectionMethod: collected.collectionMethod,
            sourceIntelligenceProvider: collectedProviderKey,
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
          validJobsFound:
            activeRun.summary.validJobsFound + mergeResult.validatedCount,
          jobsPersisted: activeRun.summary.jobsPersisted + jobsPersisted,
          jobsStaged: activeRun.summary.jobsStaged + jobsStaged,
          jobsSkippedByLedger:
            activeRun.summary.jobsSkippedByLedger + skippedByLedger,
          jobsSkippedByTitleTriage:
            activeRun.summary.jobsSkippedByTitleTriage + skippedByTitleTriage,
          duplicatesMerged:
            activeRun.summary.duplicatesMerged + mergeResult.duplicatesMerged,
          invalidSkipped:
            activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
        });

        const targetCompletedAt = new Date().toISOString();
        activeRun = completeTargetExecution(
          activeRun,
          target.id,
          targetCompletedAt,
          {
            state: "completed",
            requestedJobBudget: discoveryBudget.targetJobCount,
            jobsReviewed: budgetedPostings.length,
            jobsFound: mergeResult.validatedCount,
            jobsPersisted,
            jobsStaged,
            jobsSkippedByLedger: skippedByLedger,
            jobsSkippedByTitleTriage: skippedByTitleTriage,
            duplicatesMerged: mergeResult.duplicatesMerged,
            invalidSkipped: mergeResult.invalidSkipped,
            changeDigest: {
              new: freshnessDigest.counts.new,
              unchanged: freshnessDigest.counts.unchanged,
              changed: freshnessDigest.counts.changed,
              reactivated: freshnessDigest.counts.reactivated,
              inactive: newlyInactiveCount,
              known:
                freshnessDigest.counts.unchanged +
                freshnessDigest.counts.changed +
                freshnessDigest.counts.reactivated,
              skipped:
                skippedByLedger +
                skippedByTitleTriage +
                mergeResult.invalidSkipped,
            },
            warning: collected.result.warning,
          },
        );
        const targetCompletedEvent = createDiscoveryEvent({
          runId,
          timestamp: targetCompletedAt,
          kind: "success",
          stage: "target",
          waitReason: "persisting_results",
          targetId: target.id,
          adapterKind: target.adapterKind,
          resolvedAdapterKind: collected.adapterKind,
          collectionMethod: collected.collectionMethod,
          sourceIntelligenceProvider: collectedProviderKey,
          terminalState: "completed",
          message: `Finished ${target.label} (${index + 1}/${targets.length})`,
          url: target.startingUrl,
          jobsFound: mergeResult.validatedCount,
          jobsPersisted,
          jobsStaged,
          duplicatesMerged: mergeResult.duplicatesMerged,
          invalidSkipped: mergeResult.invalidSkipped,
        });
        // Record the event before saving so run history stays complete, but do
        // not publish "Finished" until the jobs and ledger are durable. The
        // desktop uses this terminal event as its progressive-refresh signal.
        recordActivity(targetCompletedEvent);

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
        publishActivity(targetCompletedEvent);
      }
    } catch (error) {
      const interrupted =
        error instanceof DOMException && error.name === "AbortError";
      terminalStatus = interrupted ? "cancelled" : "failed";
      caughtError = error;
      activeRun = finalizeRunningTargetExecutions(
        activeRun,
        terminalStatus,
        new Date().toISOString(),
      );
    } finally {
      if (!keepSessionAlive) {
        for (const source of openedSessionSources) {
          await ctx.closeRunBrowserSession(source).catch(() => {});
        }
      }

      if (openedSessionSources.size > 0) {
        const representativeSource =
          [...openedSessionSources].pop() ?? "target_site";
        const browserCloseoutOccurredAt = new Date().toISOString();
        const session = await ctx.browserRuntime
          .getSessionState(representativeSource)
          .catch(() => null);
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

      clearActiveController();
    }

    activeRun = finalizeDiscoveryRun(
      activeRun,
      terminalStatus,
      new Date().toISOString(),
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

    if (terminalStatus === "failed") {
      throw caughtError instanceof Error
        ? caughtError
        : new Error(
            `Discovery pipeline failed with a non-Error throwable: ${describeUnknownThrowable(caughtError)}`,
          );
    }

    return ctx.getWorkspaceSnapshot();
  }

  return {
    async runDiscovery(targetId) {
      if (targetId) {
        return trackDiscoveryPromise(
          executeDiscoveryPipeline({
            scope: "single_target",
            targetId,
            allowInactiveMarking: false,
            useAgentRuntime: false,
          }),
        );
      }

      return trackDiscoveryPromise(
        executeDiscoveryPipeline({
          scope: "run_all",
          allowInactiveMarking: true,
          useAgentRuntime: false,
        }),
      );
    },
    async runAgentDiscovery(onActivity, signal, targetId) {
      if (targetId) {
        return trackDiscoveryPromise(
          executeDiscoveryPipeline({
            scope: "single_target",
            targetId,
            ...(onActivity ? { onActivity } : {}),
            ...(signal ? { signal } : {}),
            allowInactiveMarking: false,
            useAgentRuntime: true,
          }),
        );
      }

      return trackDiscoveryPromise(
        executeDiscoveryPipeline({
          scope: "run_all",
          ...(onActivity ? { onActivity } : {}),
          ...(signal ? { signal } : {}),
          allowInactiveMarking: true,
          useAgentRuntime: true,
        }),
      );
    },
    async runDiscoveryForTarget(targetId, onActivity, signal) {
      return trackDiscoveryPromise(
        executeDiscoveryPipeline({
          scope: "single_target",
          targetId,
          ...(onActivity ? { onActivity } : {}),
          ...(signal ? { signal } : {}),
          allowInactiveMarking: false,
          useAgentRuntime: true,
        }),
      );
    },
  };
}
