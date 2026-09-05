import {
  DiscoveryRunRecordSchema,
  JobPostingSchema,
  SavedJobSchema,
  type CandidateProfile,
  type DiscoveryActivityEvent,
  type DiscoveryLedgerEntry,
  type DiscoveryRunRecord,
  type DiscoveryRunResult,
  type DiscoveryRunScope,
  type DiscoveryTargetExecution,
  type JobDiscoveryTarget,
  type JobFinderDiscoveryState,
  type JobFinderWorkspaceSnapshot,
  type JobPosting,
  type JobSearchPreferences,
  type JobSource,
  type SavedJob,
  type SourceIntelligenceProviderKey,
  stripDiscoveryCardOnlyEvidenceWarning,
} from "@unemployed/contracts";
import {
  getDiscoveryListingRecencyKey,
  toSortableListingTime,
} from "../discovery-ordering";
import {
  appendDiscoveryEvent,
  createDiscoveryEvent,
  finalizeDiscoveryState,
  summarizeProgressAction,
  updateTargetExecution,
} from "./discovery-state";
import {
  createMatchAssessment,
  enrichDiscoveredPosting,
  mergeDiscoveredPostings,
  toSavedJobId,
} from "./matching";
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
import {
  DEFAULT_ROLE,
  MAX_DISCOVERY_AGENT_NO_PROGRESS_STEPS,
  MAX_DISCOVERY_TARGET_TIME_BUDGET_MS,
  discoveryAdapters,
} from "./workspace-defaults";
import {
  applyInactiveLedgerMarks,
  createDiscoveryFreshnessDigest,
  createDiscoveryLedgerIndex,
  createDiscoveryProvenance,
  formatDiscoveryFreshnessDigest,
  mergePendingJobs,
  mergeSavedJobs,
  overlayTouchedPendingJobs,
  recordDiscoveredPostingInLedger,
  shouldSkipPostingFromLedger,
} from "./workspace-service-helpers";
import { createDiscoveryRefreshDecision } from "./workspace-discovery-refresh-schedule";
import { createDiscoveryListingFingerprints } from "./workspace-discovery-ledger";
import { rebaseRunLedgerOntoPersisted } from "./workspace-discovery-state-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type {
  CampaignRunContext,
  DiscoveryTargetPipelineOptions,
  JobFinderWorkspaceService,
} from "./workspace-service-contracts";
import {
  completeTargetExecution,
  finalizeDiscoveryRun,
  finalizeRunningTargetExecutions,
  resolveDiscoveryBudgetPlan,
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
import { createJobIdentityIndex } from "./job-identity";
import { assessJobPostingDetailQuality } from "./job-posting-detail-quality";
import {
  describeListingDetailEnrichment,
  enrichSavedJobListingDetails,
  jobNeedsListingDetail,
} from "./listing-detail-enrichment";

const DISCOVERY_ACTIVITY_SAMPLE_LIMIT = 3;
const LOW_YIELD_TECHNICAL_DISCOVERY_FLOOR = 6;
const PUBLIC_API_PREFETCH_CONCURRENCY = 8;
const MIN_DISCOVERY_TARGET_TIME_BUDGET_MS = 120_000;

/**
 * Bounded heartbeat for duplicate-only agent checkpoint sequences.
 *
 * A checkpoint whose postings were all processed by earlier flushes carries no
 * new jobs, no ledger deltas, and no counter changes: persisting it would
 * rewrite the whole discovery singleton only to refresh resume metadata and
 * the activity tail. Such checkpoints therefore skip persistence until either
 * this many agent revisions have accumulated since the last durable
 * checkpoint — bounding how much collected progress a hard crash can lose —
 * or an unconditional trigger fires: abort, disabled mid-run saving, or a
 * real kept batch. Revision counting keeps the gate deterministic; each
 * target's first checkpoint always flushes so target-start truth becomes
 * durable promptly.
 */
const CHECKPOINT_RESUME_HEARTBEAT_REVISIONS = 8;

/**
 * Truthful warning recorded on a browser-backed target when the campaign asked
 * for the bounded agent runtime but the configured browser runtime cannot
 * provide it. Prevents a silent zero-yield target when only the direct
 * discovery stub is available.
 */
const AGENT_RUNTIME_UNAVAILABLE_WARNING =
  "The bounded browser agent runtime is unavailable for this source; live collection fell back to direct discovery.";

function serializeSavedJobDeltaValue(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function applySavedJobDelta(
  currentJob: SavedJob,
  baselineJob: SavedJob,
  intendedJob: SavedJob,
): SavedJob {
  const changedFields: Record<string, unknown> = {};
  for (const key of Object.keys(intendedJob) as Array<keyof SavedJob>) {
    if (
      serializeSavedJobDeltaValue(intendedJob[key]) !==
      serializeSavedJobDeltaValue(baselineJob[key])
    ) {
      changedFields[key] = intendedJob[key];
    }
  }

  return SavedJobSchema.parse({ ...currentJob, ...changedFields });
}

type PublicProviderJobsResult = Awaited<
  ReturnType<typeof collectPublicProviderJobs>
>;
type SettledPublicProviderJobsResult =
  | { result: PublicProviderJobsResult; error: null }
  | { result: null; error: unknown };

async function* iterateDiscoveryTargetsByReadiness(input: {
  targets: readonly JobDiscoveryTarget[];
  publicApiTargetIds: ReadonlySet<string>;
  createPublicApiRequest: (
    target: JobDiscoveryTarget,
  ) => Promise<SettledPublicProviderJobsResult>;
  signal: AbortSignal;
}): AsyncGenerator<{
  target: JobDiscoveryTarget;
  prefetchedPublicApiResult: Promise<SettledPublicProviderJobsResult> | null;
}> {
  const apiTargets: JobDiscoveryTarget[] = [];
  const serialTargets: JobDiscoveryTarget[] = [];
  const readyApiTargets: Array<{
    target: JobDiscoveryTarget;
    request: Promise<SettledPublicProviderJobsResult>;
  }> = [];
  const activeApiRequests = new Map<
    string,
    Promise<SettledPublicProviderJobsResult>
  >();
  let notifyReady: (() => void) | null = null;

  for (const target of input.targets) {
    if (!input.publicApiTargetIds.has(target.id)) {
      serialTargets.push(target);
      continue;
    }
    apiTargets.push(target);
  }

  let nextApiTargetIndex = 0;
  const startAvailableApiRequests = () => {
    while (
      activeApiRequests.size < PUBLIC_API_PREFETCH_CONCURRENCY &&
      nextApiTargetIndex < apiTargets.length
    ) {
      const target = apiTargets[nextApiTargetIndex];
      nextApiTargetIndex += 1;
      if (!target) continue;
      const request = input.createPublicApiRequest(target);
      activeApiRequests.set(target.id, request);
      void request.then(() => {
        if (!activeApiRequests.has(target.id)) return;
        readyApiTargets.push({ target, request });
        const notify = notifyReady;
        notifyReady = null;
        notify?.();
      });
    }
  };

  startAvailableApiRequests();
  let serialTargetIndex = 0;
  while (
    activeApiRequests.size > 0 ||
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
      activeApiRequests.delete(readyApiTarget.target.id);
      startAvailableApiRequests();
      yield {
        target: readyApiTarget.target,
        prefetchedPublicApiResult: readyApiTarget.request,
      };
      continue;
    }

    const serialTarget = serialTargets[serialTargetIndex];
    if (serialTarget) {
      serialTargetIndex += 1;
      yield { target: serialTarget, prefetchedPublicApiResult: null };
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

function getDiscoveryBudgetListingRecency(posting: JobPosting): number {
  const listingRecency = getDiscoveryListingRecencyKey({
    postedAt: posting.postedAt,
    postedAtText: posting.postedAtText,
    providerUpdatedAt: posting.providerUpdatedAt,
  });
  if (listingRecency.basis !== null) {
    return listingRecency.timestamp;
  }
  return toSortableListingTime(posting.firstSeenAt ?? posting.discoveredAt);
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
      recency: getDiscoveryBudgetListingRecency(posting),
    }))
    .sort(
      (left, right) =>
        compareMatchRecommendationPriority(left.assessment, right.assessment) ||
        Number(right.preferred) - Number(left.preferred) ||
        compareMatchRoleSuitabilityPriority(
          left.assessment,
          right.assessment,
        ) ||
        compareMatchScores(left.assessment, right.assessment) ||
        right.recency - left.recency ||
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

/**
 * Execution states whose stored checkpoint still represents genuinely
 * interrupted mid-source work. A completed execution may keep its last
 * checkpoint recorded for durability, so eligibility comes from this set
 * plus the run-state guard below rather than from checkpoint presence:
 * completed-run progress never replays into a fresh run. Skipped targets
 * and per-target error failures clear any inherited or earned checkpoint,
 * so a surviving checkpoint here always belongs to an execution that
 * stopped before finishing collection (user cancellation, app close before
 * recovery finalization, or a pipeline-level abort).
 */
const RESUMABLE_AGENT_CHECKPOINT_EXECUTION_STATES: ReadonlySet<
  DiscoveryTargetExecution["state"]
> = new Set(["cancelled", "failed", "running"]);

/**
 * Explicit resume eligibility for agent checkpoints.
 *
 * Only genuinely interrupted work may resume process progress (collected
 * jobs, steps, visited URLs). A prior run that reached a terminal state still
 * informs dedupe and ledger decisions through the persisted ledger, but it
 * must never seed loop progress, visited URLs, target counts, or stagnation
 * baselines into a fresh run. A still-running record (an app close observed
 * before recovery finalized it) is the newest candidate; history order is
 * newest-first, so the first eligible match carries the freshest progress.
 */
function selectResumableAgentCheckpoint(input: {
  activeRun: DiscoveryRunRecord | null;
  previousRuns: readonly DiscoveryRunRecord[];
  targetId: string;
}): DiscoveryRunRecord["targetExecutions"][number]["agentCheckpoint"] {
  const candidateRuns =
    input.activeRun && input.activeRun.state === "running"
      ? [input.activeRun, ...input.previousRuns]
      : input.previousRuns;

  for (const run of candidateRuns) {
    if (run.state === "completed") {
      continue;
    }

    const execution = run.targetExecutions.find(
      (candidate) =>
        candidate.targetId === input.targetId &&
        candidate.agentCheckpoint &&
        RESUMABLE_AGENT_CHECKPOINT_EXECUTION_STATES.has(candidate.state),
    );
    if (execution?.agentCheckpoint) {
      return execution.agentCheckpoint;
    }
  }

  return null;
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
  campaignId: string | null;
  targets: readonly JobDiscoveryTarget[];
  scope: DiscoveryRunScope;
  activeRun: DiscoveryRunRecord | null;
  previousRuns?: readonly DiscoveryRunRecord[];
}): DiscoveryRunRecord {
  return DiscoveryRunRecordSchema.parse({
    id: input.id,
    campaignId: input.campaignId,
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
      agentCheckpoint: selectResumableAgentCheckpoint({
        activeRun: input.activeRun,
        previousRuns: input.previousRuns ?? [],
        targetId: target.id,
      }),
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

/**
 * Stable identity key for a raw collected posting across checkpoint payloads
 * and the final collection result. The agent's collected list only grows, so
 * the same posting appears in many consecutive checkpoints; this key lets the
 * discovery pipeline process each posting exactly once per target, keeping
 * every run counter additive when checkpoints persist jobs mid-run.
 */
function getDiscoveryCheckpointPostingKey(posting: JobPosting): string {
  return `${posting.sourceJobId ?? ""}|${posting.canonicalUrl}`;
}

/**
 * Raw agent checkpoint payloads bypass the provider-aware mapping applied to
 * final collection results, so they still carry the schema-default detail
 * quality even when the extraction captured full listing detail. Derive it
 * once here so fingerprint claiming, freshness classification, and ledger
 * skip decisions see exactly the content the merge would persist: a
 * materially richer re-extraction of a retained identity must classify as
 * changed and reach the budget-free upgrade merge instead of hiding behind
 * the card-only default. Re-assessing an already-scored posting is
 * idempotent.
 */
function normalizeCollectedCheckpointPosting(posting: JobPosting): JobPosting {
  return JobPostingSchema.parse({
    ...posting,
    detailQuality: assessJobPostingDetailQuality(posting),
  });
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
  onAgentCheckpoint: (
    targetId: string,
    checkpoint: NonNullable<
      DiscoveryRunRecord["targetExecutions"][number]["agentCheckpoint"]
    >,
  ) => Promise<void>;
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
        inventoryCompleteness:
          apiResult.warning === null ? "complete" : "partial",
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
      purpose: "automation",
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
    const resumeCheckpoint = input.activeRun.targetExecutions.find(
      (execution) => execution.targetId === target.id,
    )?.agentCheckpoint;
    const result = await ctx.browserRuntime.runAgentDiscovery(adapterKind, {
      userProfile: input.profile,
      searchPreferences: {
        targetRoles:
          input.searchPreferences.targetRoles.length > 0
            ? input.searchPreferences.targetRoles
            : [DEFAULT_ROLE],
        locations: input.searchPreferences.locations,
        workModes: input.searchPreferences.workModes,
      },
      targetJobCount: input.targetJobCount,
      maxSteps: input.maxSteps,
      runControl: {
        // Scale the wall-clock budget with the step budget, but keep a hard
        // ceiling so a scaled run can never hold one target open forever.
        timeBudgetMs: Math.min(
          MAX_DISCOVERY_TARGET_TIME_BUDGET_MS,
          Math.max(
            MIN_DISCOVERY_TARGET_TIME_BUDGET_MS,
            input.maxSteps * 20_000,
          ),
        ),
        noProgressStepLimit: Math.min(
          MAX_DISCOVERY_AGENT_NO_PROGRESS_STEPS,
          Math.max(6, Math.ceil(input.maxSteps / 3)),
        ),
      },
      ...(resumeCheckpoint ? { resumeCheckpoint } : {}),
      onCheckpoint: (checkpoint) =>
        input.onAgentCheckpoint(target.id, checkpoint),
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
  const agentRuntimeUnavailable =
    input.useAgentRuntime && !ctx.browserRuntime.runAgentDiscovery;
  return {
    result: {
      ...result,
      warning: agentRuntimeUnavailable
        ? [result.warning, AGENT_RUNTIME_UNAVAILABLE_WARNING]
            .filter(Boolean)
            .join(" ")
        : result.warning,
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
> & {
  runCampaignDiscovery(
    campaign: CampaignRunContext,
  ): Promise<JobFinderWorkspaceSnapshot>;
} {
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
      options.campaign?.searchPreferences ?? searchPreferences,
      profile,
    );
    // Explicit run budget resolution order: campaign limit first (the
    // campaign-scoped control), then the discovery preferences field, then the
    // interactive precision default handled inside the budget resolver.
    const runJobBudget =
      options.campaign?.runJobBudget ??
      enrichedPreferences.discovery.runJobBudget ??
      null;
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
    const savedJobsAtLastCommitById = new Map(
      startingSavedJobs.map((job) => [job.id, job]),
    );
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
    // Every posting this run retained (new or re-seen), by saved-job id: the
    // population the listing-detail read stage is allowed to touch.
    const runRetainedJobIds = new Set<string>();
    const touchedPendingJobIds = new Set<string>();
    workingSavedJobs.forEach((job) => touchedSavedJobIds.add(job.id));
    workingPendingJobs.forEach((job) => touchedPendingJobIds.add(job.id));
    // Run-start snapshots define ownership for the whole run: ledger decisions
    // and pending-job removals that differ from these baselines while the run
    // is in flight belong to the user and must survive run persistence.
    const baselineLedger = startingDiscovery.discoveryLedger;
    const baselinePendingJobIds = new Set(
      startingDiscovery.pendingDiscoveryJobs.map((job) => job.id),
    );

    const persistWorkingSavedJobs = async (
      updateDiscoveryState?: (
        current: JobFinderDiscoveryState,
      ) => JobFinderDiscoveryState,
    ): Promise<void> => {
      const workingSavedJobsById = new Map(
        workingSavedJobs.map((job) => [job.id, job]),
      );
      const newSavedJobs = workingSavedJobs.filter(
        (job) => !savedJobsAtLastCommitById.has(job.id),
      );

      await ctx.repository.commitSavedJobDelta({
        upserts: newSavedJobs,
        update: (currentJob) => {
          if (!touchedSavedJobIds.has(currentJob.id)) {
            return currentJob;
          }

          const baselineJob = savedJobsAtLastCommitById.get(currentJob.id);
          const intendedJob = workingSavedJobsById.get(currentJob.id);
          if (!baselineJob || !intendedJob) {
            return currentJob;
          }

          return applySavedJobDelta(currentJob, baselineJob, intendedJob);
        },
        ...(updateDiscoveryState ? { updateDiscoveryState } : {}),
      });

      for (const job of workingSavedJobs) {
        savedJobsAtLastCommitById.set(job.id, job);
      }
    };
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
    // Budgets are allocated once, up front, over the stable configuration
    // order so readiness or completion order can never shift them. Invalid
    // target lists (duplicate or empty ids) fail fast here, before any run
    // record is persisted and before any API or browser work starts.
    let discoveryBudgets: ReadonlyMap<
      string,
      { targetJobCount: number; maxSteps: number }
    >;
    try {
      discoveryBudgets = resolveDiscoveryBudgetPlan({
        targetIds: targets.map((target) => target.id),
        runJobBudget,
      });
    } catch (error) {
      clearActiveController();
      throw error;
    }
    const keepSessionAlive = settings.keepSessionAlive;
    let activeRun = createInitialRunRecord({
      id: runId,
      campaignId:
        options.campaign?.campaignId ?? (await ctx.getActiveCampaignId()),
      targets,
      scope: options.scope,
      activeRun: startingDiscovery.activeRun,
      previousRuns: startingDiscovery.recentRuns,
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
        pendingDiscoveryJobs: overlayTouchedPendingJobs(
          current.pendingDiscoveryJobs,
          workingPendingJobs,
          touchedPendingJobIds,
          baselinePendingJobIds,
        ),
        discoveryLedger: rebaseRunLedgerOntoPersisted({
          baselineLedger,
          workingLedger,
          persistedLedger: current.discoveryLedger,
        }),
      }))
      .catch((error: unknown) => {
        clearActiveController();
        throw error;
      });

    // Public inventories are independent network reads, but starting hundreds
    // at once can starve Electron's main process and retain every response until
    // the run ends. The readiness iterator keeps a small rolling window and
    // releases each response after its durable target batch is processed.
    // Zero-budget targets never enter the prefetch set, so their provider
    // requests are not started at all.
    const publicApiTargetIds = new Set<string>();
    for (const target of targets) {
      if (discoveryBudgets.get(target.id)?.targetJobCount === 0) {
        continue;
      }
      const artifact = resolveActiveSourceInstructionArtifact(
        target,
        sourceInstructionArtifacts,
      );
      if (selectDiscoveryCollectionMethod(target, artifact) !== "api") {
        continue;
      }
      publicApiTargetIds.add(target.id);
    }

    try {
      let executionIndex = 0;
      for await (const readyTarget of iterateDiscoveryTargetsByReadiness({
        targets,
        publicApiTargetIds,
        createPublicApiRequest: (target) => {
          const artifact = resolveActiveSourceInstructionArtifact(
            target,
            sourceInstructionArtifacts,
          );
          const intelligence = inferSourceIntelligenceFromTarget({
            target,
            currentArtifact: artifact,
          });
          return collectPublicProviderJobs({
            target,
            artifact: { intelligence },
            source: resolveAdapterKind(target),
            signal: executionSignal,
          }).then(
            (result): SettledPublicProviderJobsResult => ({
              result,
              error: null,
            }),
            (error: unknown): SettledPublicProviderJobsResult => ({
              result: null,
              error,
            }),
          );
        },
        signal: executionSignal,
      })) {
        const { target, prefetchedPublicApiResult } = readyTarget;
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

        const plannedBudget = discoveryBudgets.get(target.id);
        if (!plannedBudget) {
          throw new Error(
            `Missing planned discovery budget for target ${target.label}.`,
          );
        }

        // Zero-allocation targets are resolved up front so they never open a
        // browser session or join an API prefetch; record the budget-exhausted
        // skip truthfully instead of treating it as a source failure.
        if (plannedBudget.targetJobCount === 0) {
          const skippedAt = new Date().toISOString();
          const skipWarning = `Skipped ${target.label} without collection: the run job budget was fully allocated to earlier sources.`;
          activeRun = completeTargetExecution(activeRun, target.id, skippedAt, {
            state: "skipped",
            // Nothing was requested from this source, so the execution
            // records "no budget" rather than a positive job count.
            requestedJobBudget: null,
            jobsReviewed: 0,
            jobsFound: 0,
            jobsPersisted: 0,
            jobsStaged: 0,
            jobsSkippedByLedger: 0,
            jobsSkippedByTitleTriage: 0,
            duplicatesMerged: 0,
            invalidSkipped: 0,
            warning: skipWarning,
            // A skipped target never collects, so any inherited checkpoint
            // loses resume rights here instead of leaking into later runs.
            agentCheckpoint: null,
          });
          emitActivity(
            createDiscoveryEvent({
              runId,
              timestamp: skippedAt,
              kind: "info",
              stage: "target",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: resolveAdapterKind(target),
              collectionMethod: targetCollectionMethod,
              sourceIntelligenceProvider: getDiscoveryProviderKey({
                target,
                intelligence: targetIntelligence,
              }),
              terminalState: "skipped",
              message: skipWarning,
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

        const discoveryBudget = plannedBudget;
        activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
          ...entry,
          requestedJobBudget: discoveryBudget.targetJobCount,
        }));
        const resolvedTargetAdapterKind = resolveAdapterKind(target);
        const targetProviderKey = getDiscoveryProviderKey({
          target,
          intelligence: targetIntelligence,
        });

        // ------------------------------------------------------------------
        // Incremental checkpoint persistence.
        //
        // Agent checkpoints carry the kept-jobs snapshot after every tool
        // call. Each new posting is processed through exactly the same
        // triage/ledger/budget/merge path as final collection and committed
        // atomically (saved or staged pending jobs + ledger + run state), so
        // distinct usable jobs become visible while the source is still
        // running. Every posting is processed at most once per target: the
        // final pass handles only the remainder, which keeps found/persisted/
        // duplicate counters additive and idempotent without a second merge.
        // A failed incremental attempt rolls back to the pre-attempt state and
        // falls back to end-of-source persistence instead of failing the run;
        // AbortError still propagates so cancellation stays immediate.
        const targetBaselineLedger = [...workingLedger];
        // Processed identity keys carry the listing-fingerprint composites of
        // every raw variant already processed for that identity (one identity
        // may legitimately appear with several card/title variants inside one
        // payload). A repeat whose composite was seen before is fully handled
        // and suppressed; a repeat with a NEW composite (a richer re-extraction
        // of the same job) is deliberately reprocessed so the upgrade reaches
        // the merge — where it updates the existing saved/staged job and counts
        // exactly like a legacy single-pass duplicate merge (found/duplicates
        // yes, new/persisted/staged no).
        const checkpointState = {
          processedKeys: new Map<string, string[]>(),
          budgetedCount: 0,
          reviewedCount: 0,
          validatedCount: 0,
          jobsPersisted: 0,
          jobsStaged: 0,
          skippedByLedger: 0,
          skippedByTitleTriage: 0,
          duplicatesMerged: 0,
          invalidSkipped: 0,
          disabled: false,
          // Newest checkpoint revision known to be durable in storage; null
          // until this target's first checkpoint flush. Drives the bounded
          // duplicate-checkpoint heartbeat.
          persistedCheckpointRevision: null as number | null,
        };
        const getDiscoveryCheckpointFingerprintKey = (
          posting: JobPosting,
        ): string => {
          const fingerprints = createDiscoveryListingFingerprints(posting);
          return `${fingerprints.card}|${fingerprints.material}`;
        };
        // True when the posting was never processed, or carries a content
        // variant that was not processed before (an upgrade worth merging).
        const isUnprocessedOrMateriallyChangedPosting = (
          posting: JobPosting,
        ): boolean => {
          const retainedVariants = checkpointState.processedKeys.get(
            getDiscoveryCheckpointPostingKey(posting),
          );
          if (!retainedVariants) {
            return true;
          }
          return !retainedVariants.includes(
            getDiscoveryCheckpointFingerprintKey(posting),
          );
        };
        const triageSkippedPostings: JobPosting[] = [];
        const titleTriageSkipSamples: Array<{
          title: string;
          company: string;
          reason: string | null;
        }> = [];
        const resumeAffectingChangedJobIds: string[] = [];

        const runTriageAndLedgerForPostings = (
          rawPostings: readonly JobPosting[],
        ): {
          keptPostings: JobPosting[];
          keptUpgradePostings: JobPosting[];
          knownJobIndex: ReturnType<typeof createDiscoveryLedgerIndex>;
          skippedByLedger: number;
          skippedByTitleTriage: number;
        } => {
          const knownJobIndex = createDiscoveryLedgerIndex(workingLedger);
          const keptPostings: JobPosting[] = [];
          // Re-observations of identities already processed by an earlier
          // phase whose content changed (richer re-extractions), plus
          // identities already retained as kept jobs from any earlier run,
          // are kept separately: they merge over the existing saved/staged
          // row without consuming a new budget slot.
          const keptUpgradePostings: JobPosting[] = [];
          // Identities already persisted as kept jobs mirror exactly the pool
          // the merge step treats as existing rows: saved jobs normally, and
          // staged pending jobs alongside saved jobs in discovery-only mode.
          // Re-observing them can never produce a new distinct job, so they
          // must never compete with fresh candidates for budget.
          const retainedJobIndex = createJobIdentityIndex(
            settings.discoveryOnly
              ? [...workingSavedJobs, ...workingPendingJobs]
              : workingSavedJobs,
            (job) => job,
          );
          // Repeat identities inside one pass must keep flowing through
          // triage/budget/merge so duplicate merges stay counted exactly like
          // single-pass collection; only identities fully processed by an
          // earlier phase with unchanged content are skipped here. Changed
          // content (a richer re-extraction) is reprocessed on purpose so the
          // upgrade reaches the merge.
          const processedBeforePass = new Map(checkpointState.processedKeys);
          let phaseSkippedByLedger = 0;
          let phaseSkippedByTitleTriage = 0;

          for (const rawPosting of rawPostings) {
            const postingKey = getDiscoveryCheckpointPostingKey(rawPosting);
            const fingerprintKey =
              getDiscoveryCheckpointFingerprintKey(rawPosting);
            const retainedBeforePass = processedBeforePass.get(postingKey);
            const isEarlierPhaseIdentity = retainedBeforePass !== undefined;
            if (
              retainedBeforePass &&
              retainedBeforePass.includes(fingerprintKey)
            ) {
              continue;
            }
            const knownVariants =
              checkpointState.processedKeys.get(postingKey) ?? [];
            if (!knownVariants.includes(fingerprintKey)) {
              checkpointState.processedKeys.set(
                postingKey,
                knownVariants.concat(fingerprintKey),
              );
            }

            const posting = JobPostingSchema.parse(rawPosting);
            const { posting: triagedPosting, triageReason } =
              createPostingWithTriage(posting, enrichedPreferences, profile);

            if (triagedPosting.titleTriageOutcome !== "pass") {
              phaseSkippedByTitleTriage += 1;
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
            const retainedJob = retainedJobIndex.find(triagedPosting) ?? null;
            const ledgerDecision = shouldSkipPostingFromLedger({
              ledgerEntry,
              posting: triagedPosting,
              triageOutcome: triagedPosting.titleTriageOutcome,
              ...(retainedJob ? { hasRetainedJob: true } : {}),
            });
            const canReuseKnownPosting =
              ledgerDecision.skip &&
              refreshDecision.disposition !== "refresh_now";

            if (canReuseKnownPosting) {
              phaseSkippedByLedger += 1;
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
            // Enrich once, here, so budget selection and the merge below score
            // exactly the content that will be persisted.
            const enrichedKept = enrichDiscoveredPosting(
              triagedPosting,
              undefined,
            );
            if (isEarlierPhaseIdentity || retainedJob) {
              // A retained identity with changed content (a richer
              // re-extraction or a provider update) merges over its existing
              // row as a budget-free upgrade; it can never become a new
              // distinct result even when the refresh schedule asks for an
              // immediate verification.
              keptUpgradePostings.push(enrichedKept);
            } else {
              keptPostings.push(enrichedKept);
            }
          }

          checkpointState.skippedByLedger += phaseSkippedByLedger;
          checkpointState.skippedByTitleTriage += phaseSkippedByTitleTriage;
          return {
            keptPostings,
            keptUpgradePostings,
            knownJobIndex,
            skippedByLedger: phaseSkippedByLedger,
            skippedByTitleTriage: phaseSkippedByTitleTriage,
          };
        };

        const mergeAndAccountPostings = (
          newCandidates: readonly JobPosting[],
          upgradeCandidates: readonly JobPosting[],
          knownJobIndex: ReturnType<typeof createDiscoveryLedgerIndex>,
        ): {
          budgetedPostings: JobPosting[];
          mergeResult: ReturnType<typeof mergeDiscoveredPostings>;
          jobsPersisted: number;
          jobsStaged: number;
        } => {
          // Greedy budget applies only to genuinely new identities: each
          // consumes one of the target's remaining slots. Upgrades of already
          // retained identities update existing saved/staged rows and consume
          // no slot, so they stay eligible even when the budget is exhausted.
          const remainingBudget = Math.max(
            0,
            discoveryBudget.targetJobCount - checkpointState.budgetedCount,
          );
          const budgetedNewPostings = selectDiscoveryBudgetPostings({
            postings: newCandidates,
            profile,
            searchPreferences: enrichedPreferences,
            limit: remainingBudget,
            preferredCanonicalUrls: [target.startingUrl],
            assessPosting: assessmentSession.assess,
          });
          checkpointState.budgetedCount += budgetedNewPostings.length;
          checkpointState.reviewedCount +=
            budgetedNewPostings.length + upgradeCandidates.length;
          const budgetedPostings = [
            ...budgetedNewPostings,
            ...upgradeCandidates,
          ];

          const mergeSeedJobs = settings.discoveryOnly
            ? mergeSavedJobs(workingSavedJobs, workingPendingJobs)
            : workingSavedJobs;
          for (const posting of budgetedPostings) {
            runRetainedJobIds.add(toSavedJobId(posting));
          }
          const mergeResult = mergeDiscoveredPostings(
            profile,
            enrichedPreferences,
            mergeSeedJobs,
            budgetedPostings,
            (posting) =>
              createDiscoveryProvenance({
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: resolvedTargetAdapterKind,
                startingUrl: target.startingUrl,
                discoveredAt: new Date().toISOString(),
                collectionMethod: targetCollectionMethod,
                providerKey: posting.providerKey,
                providerBoardToken: posting.providerBoardToken,
                titleTriageOutcome: posting.titleTriageOutcome,
              }),
            executionSignal,
            assessmentSession.assess,
          );
          resumeAffectingChangedJobIds.push(
            ...collectResumeAffectingChangedJobIds(
              mergeSeedJobs,
              mergeResult.mergedJobs,
            ),
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
                posting.detailQuality === "detail_enriched"
                  ? "enriched"
                  : "seen",
            });
          }

          checkpointState.validatedCount += mergeResult.validatedCount;
          checkpointState.jobsPersisted += jobsPersisted;
          checkpointState.jobsStaged += jobsStaged;
          checkpointState.duplicatesMerged += mergeResult.duplicatesMerged;
          checkpointState.invalidSkipped += mergeResult.invalidSkipped;

          return { budgetedPostings, mergeResult, jobsPersisted, jobsStaged };
        };

        const persistTargetWorkingState = async (): Promise<void> => {
          await persistWorkingSavedJobs((current) =>
            finalizeDiscoveryState(
              {
                ...current,
                pendingDiscoveryJobs: overlayTouchedPendingJobs(
                  current.pendingDiscoveryJobs,
                  workingPendingJobs,
                  touchedPendingJobIds,
                  baselinePendingJobIds,
                ),
                discoveryLedger: rebaseRunLedgerOntoPersisted({
                  baselineLedger,
                  workingLedger,
                  persistedLedger: current.discoveryLedger,
                }),
              },
              activeRun,
              enrichedPreferences,
            ),
          );
        };

        // Lightweight run-state-only save for checkpoints that carry no
        // unprocessed postings: keeps the resume checkpoint and live run
        // truth durable without a saved-job delta commit or ledger rebase.
        const persistTargetRunStateOnly = async (): Promise<void> => {
          await ctx.persistDiscoveryState((current) =>
            finalizeDiscoveryState(
              {
                ...current,
                pendingDiscoveryJobs: overlayTouchedPendingJobs(
                  current.pendingDiscoveryJobs,
                  workingPendingJobs,
                  touchedPendingJobIds,
                  baselinePendingJobIds,
                ),
                discoveryLedger: rebaseRunLedgerOntoPersisted({
                  baselineLedger,
                  workingLedger,
                  persistedLedger: current.discoveryLedger,
                }),
              },
              activeRun,
              enrichedPreferences,
            ),
          );
        };

        const processCheckpointJobs = async (
          checkpoint: NonNullable<
            DiscoveryRunRecord["targetExecutions"][number]["agentCheckpoint"]
          >,
        ): Promise<void> => {
          // Clone at storage assignment so the stored revision can never alias
          // the runtime-provided checkpoint object or its mutable arrays.
          activeRun = updateTargetExecution(activeRun, target.id, (entry) => ({
            ...entry,
            agentCheckpoint: {
              ...checkpoint,
              collectedJobs: checkpoint.collectedJobs.map((posting) => ({
                ...posting,
              })),
              visitedUrls: [...checkpoint.visitedUrls],
            },
          }));

          // Copy the checkpoint payload: collectedJobs is the agent's live
          // mutable array, and processing must never alias it. Detail quality
          // is derived from the payload content before any fingerprint is
          // claimed so richer re-extractions of known identities reach the
          // upgrade merge instead of being skipped as unchanged cards.
          const checkpointJobs = checkpoint.collectedJobs.map(
            normalizeCollectedCheckpointPosting,
          );
          const newRawPostings = checkpointJobs.filter(
            isUnprocessedOrMateriallyChangedPosting,
          );

          if (
            checkpointState.disabled ||
            newRawPostings.length === 0 ||
            executionSignal.aborted
          ) {
            // A checkpoint with no newly processable postings carries no job,
            // ledger, or counter delta: persisting it would rewrite the whole
            // discovery singleton only to refresh resume metadata and the
            // activity tail. Flush only when durability is required — abort,
            // disabled mid-run saving, this target's first checkpoint (so
            // target-start truth becomes durable promptly), or the bounded
            // revision heartbeat. Everything else stays in memory for the
            // next kept batch or the unconditional terminal saves.
            const shouldPersistCheckpoint =
              executionSignal.aborted ||
              checkpointState.disabled ||
              checkpointState.persistedCheckpointRevision === null ||
              checkpoint.revision -
                checkpointState.persistedCheckpointRevision >=
                CHECKPOINT_RESUME_HEARTBEAT_REVISIONS;
            if (!shouldPersistCheckpoint) {
              return;
            }
            await persistTargetRunStateOnly();
            checkpointState.persistedCheckpointRevision = checkpoint.revision;
            return;
          }

          // Rollback snapshot for the speculative incremental attempt. The
          // working containers are replaced immutably by merges, so restoring
          // the captured references plus the tracked additions undoes the
          // attempt completely; the repository commit itself is atomic.
          const stateBeforeAttempt = {
            workingSavedJobs,
            workingPendingJobs,
            workingLedger,
            activeRun,
          };
          const totalsBeforeAttempt = {
            budgetedCount: checkpointState.budgetedCount,
            reviewedCount: checkpointState.reviewedCount,
            validatedCount: checkpointState.validatedCount,
            jobsPersisted: checkpointState.jobsPersisted,
            jobsStaged: checkpointState.jobsStaged,
            skippedByLedger: checkpointState.skippedByLedger,
            skippedByTitleTriage: checkpointState.skippedByTitleTriage,
            duplicatesMerged: checkpointState.duplicatesMerged,
            invalidSkipped: checkpointState.invalidSkipped,
          };
          const triagePoolSnapshot = triageSkippedPostings.length;
          const samplePoolSnapshot = titleTriageSkipSamples.length;
          const resumeChangeIdsSnapshot = resumeAffectingChangedJobIds.length;
          // Snapshot of the processed-key map before the attempt; restoring
          // it releases exactly the keys and fingerprints this attempt claimed,
          // including any claimed before a mid-closure throw.
          const processedKeysBeforeAttempt = new Map(
            checkpointState.processedKeys,
          );

          try {
            const triageOutcome = runTriageAndLedgerForPostings(newRawPostings);

            const { mergeResult, jobsPersisted, jobsStaged } =
              mergeAndAccountPostings(
                triageOutcome.keptPostings,
                triageOutcome.keptUpgradePostings,
                triageOutcome.knownJobIndex,
              );

            // validJobsFound counts only distinct additions retained by this
            // run (persisted or staged). Duplicate merges and upgrades that
            // update an existing retained job stay in duplicatesMerged and
            // never inflate the run's found/kept total.
            activeRun = updateRunSummary(activeRun, {
              validJobsFound:
                activeRun.summary.validJobsFound + jobsPersisted + jobsStaged,
              jobsPersisted: activeRun.summary.jobsPersisted + jobsPersisted,
              jobsStaged: activeRun.summary.jobsStaged + jobsStaged,
              jobsSkippedByLedger:
                activeRun.summary.jobsSkippedByLedger +
                triageOutcome.skippedByLedger,
              jobsSkippedByTitleTriage:
                activeRun.summary.jobsSkippedByTitleTriage +
                triageOutcome.skippedByTitleTriage,
              duplicatesMerged:
                activeRun.summary.duplicatesMerged +
                mergeResult.duplicatesMerged,
              invalidSkipped:
                activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
            });
            // Mirror cumulative truth onto the running execution so a snapshot
            // or cancellation taken mid-run reports what checkpoints already
            // committed, not zeros. jobsFound carries the distinct-retained
            // semantic (persisted + staged additions); review volume lives in
            // jobsReviewed and duplicate merges in duplicatesMerged.
            activeRun = updateTargetExecution(
              activeRun,
              target.id,
              (entry) => ({
                ...entry,
                jobsReviewed: checkpointState.reviewedCount,
                jobsFound:
                  checkpointState.jobsPersisted + checkpointState.jobsStaged,
                jobsPersisted: checkpointState.jobsPersisted,
                jobsStaged: checkpointState.jobsStaged,
                jobsSkippedByLedger: checkpointState.skippedByLedger,
                jobsSkippedByTitleTriage: checkpointState.skippedByTitleTriage,
                duplicatesMerged: checkpointState.duplicatesMerged,
                invalidSkipped: checkpointState.invalidSkipped,
              }),
            );

            const keptNow = jobsPersisted + jobsStaged;
            // User-facing "kept" claims derive from distinct persisted or
            // staged additions only; duplicate merges stay in their own
            // counter and never inflate what this run claims to have kept.
            const keptOverall =
              checkpointState.jobsPersisted + checkpointState.jobsStaged;
            const checkpointEvent = createDiscoveryEvent({
              runId,
              timestamp: new Date().toISOString(),
              kind: keptNow > 0 ? "progress" : "info",
              stage: "persistence",
              waitReason: "persisting_results",
              targetId: target.id,
              adapterKind: target.adapterKind,
              resolvedAdapterKind: resolvedTargetAdapterKind,
              collectionMethod: targetCollectionMethod,
              sourceIntelligenceProvider: targetProviderKey,
              message:
                keptNow > 0
                  ? `Saved ${keptNow} new job${keptNow === 1 ? "" : "s"} from ${target.label} so far (${keptOverall} kept overall). Results stay available while the search continues.`
                  : `Reviewed new results from ${target.label}; no additional distinct jobs were kept.`,
              url: target.startingUrl,
              // Event-level jobsFound deliberately keeps the review-volume
              // semantic (valid cards merged, duplicates included): the
              // renderer count label derives "unique retained" as jobsFound
              // minus duplicatesMerged. Kept/found claims come from the run
              // summary and execution fields, which carry distinct-retained.
              jobsFound: checkpointState.validatedCount,
              jobsPersisted,
              jobsStaged,
              duplicatesMerged: mergeResult.duplicatesMerged,
              invalidSkipped: mergeResult.invalidSkipped,
            });
            recordActivity(checkpointEvent);
            await persistTargetWorkingState();
            checkpointState.persistedCheckpointRevision = checkpoint.revision;
            publishActivity(checkpointEvent);
          } catch (error) {
            const interrupted =
              executionSignal.aborted ||
              (error instanceof DOMException && error.name === "AbortError");
            if (interrupted) {
              throw error;
            }

            checkpointState.disabled = true;
            checkpointState.processedKeys = processedKeysBeforeAttempt;
            Object.assign(checkpointState, totalsBeforeAttempt);
            triageSkippedPostings.length = triagePoolSnapshot;
            titleTriageSkipSamples.length = samplePoolSnapshot;
            resumeAffectingChangedJobIds.length = resumeChangeIdsSnapshot;
            workingSavedJobs = stateBeforeAttempt.workingSavedJobs;
            workingPendingJobs = stateBeforeAttempt.workingPendingJobs;
            workingLedger = stateBeforeAttempt.workingLedger;
            activeRun = stateBeforeAttempt.activeRun;

            emitActivity(
              createDiscoveryEvent({
                runId,
                timestamp: new Date().toISOString(),
                kind: "warning",
                stage: "persistence",
                waitReason: "finalizing",
                targetId: target.id,
                adapterKind: target.adapterKind,
                resolvedAdapterKind: resolvedTargetAdapterKind,
                collectionMethod: targetCollectionMethod,
                sourceIntelligenceProvider: targetProviderKey,
                message: `Mid-run saving hit a problem (${describeUnknownThrowable(error)}). Jobs will be saved when this source finishes.`,
                url: target.startingUrl,
                jobsFound: null,
                jobsPersisted: 0,
                jobsStaged: 0,
                duplicatesMerged: 0,
                invalidSkipped: 0,
              }),
            );
          }
        };

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
            onAgentCheckpoint: async (targetId, checkpoint) => {
              if (targetId !== target.id) {
                return;
              }
              await processCheckpointJobs(checkpoint);
            },
            signal: executionSignal,
            openedSessionSources,
            useAgentRuntime: options.useAgentRuntime ?? false,
            ...(prefetchedPublicApiResult ? { prefetchedPublicApiResult } : {}),
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
            // Failure truth is cumulative: checkpoint flushes may already have
            // committed jobs durably, so the failed execution must report what
            // was actually kept rather than zeros. jobsFound is the distinct
            // retained total (persisted + staged), matching the summary.
            jobsReviewed: checkpointState.reviewedCount,
            jobsFound:
              checkpointState.jobsPersisted + checkpointState.jobsStaged,
            jobsPersisted: checkpointState.jobsPersisted,
            jobsStaged: checkpointState.jobsStaged,
            jobsSkippedByLedger: checkpointState.skippedByLedger,
            jobsSkippedByTitleTriage: checkpointState.skippedByTitleTriage,
            duplicatesMerged: checkpointState.duplicatesMerged,
            invalidSkipped: checkpointState.invalidSkipped,
            warning,
            // An errored source is dead work, not resumable progress: the
            // ledger keeps what was committed, and the next run starts fresh.
            agentCheckpoint: null,
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
        // Freshness classification runs against the ledger captured before
        // this target started processing (checkpoint flushes included), so a
        // job kept mid-run still classifies exactly once against the same
        // pre-target baseline.
        const freshnessDigest = createDiscoveryFreshnessDigest({
          ledger: targetBaselineLedger,
          postings: collectedJobs,
        });
        const freshnessSummary =
          formatDiscoveryFreshnessDigest(freshnessDigest);
        // Re-seen postings never reach the merge (their content is unchanged),
        // but a card the last search left unread is still a card: it is in
        // this run's retained population for the listing-detail read.
        for (const posting of collectedJobs) {
          runRetainedJobIds.add(toSavedJobId(posting));
        }
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
        const collectionSupportsInactiveMarking =
          collected.result.warning == null &&
          collected.result.inventoryCompleteness === "complete";

        // Checkpoint processing already handled its postings; the final pass
        // covers only the remainder (plus any posting whose content was
        // materially upgraded after it was first processed) so no job is
        // merged, ledger-recorded, or counted twice.
        const remainingRawPostings = collectedJobs.filter(
          isUnprocessedOrMateriallyChangedPosting,
        );
        const triageOutcome =
          runTriageAndLedgerForPostings(remainingRawPostings);
        const knownJobIndex = triageOutcome.knownJobIndex;
        const triagedPostings = [...triageOutcome.keptPostings];

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
            triagedPostings.push(enrichDiscoveredPosting(posting, undefined));
          }

          checkpointState.skippedByTitleTriage = Math.max(
            0,
            checkpointState.skippedByTitleTriage - rescuedPostings.length,
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

        const { budgetedPostings, mergeResult, jobsPersisted, jobsStaged } =
          mergeAndAccountPostings(
            triagedPostings,
            triageOutcome.keptUpgradePostings,
            knownJobIndex,
          );
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
                : `Reviewing 0 promising jobs from ${target.label}. Title triage skipped ${checkpointState.skippedByTitleTriage}. Sample skips: ${formatDiscoverySkipSamples(titleTriageSkipSamples) ?? "none"}`,
            url: target.startingUrl,
            jobsFound: budgetedPostings.length,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          }),
        );

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
            collectionSupportsInactiveMarking,
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
            // Review-volume semantic on purpose: see the checkpoint persistence
            // event above. Kept/found claims read the summary/execution
            // fields, which carry distinct retained additions.
            jobsFound: mergeResult.validatedCount,
            jobsPersisted,
            jobsStaged,
            duplicatesMerged: mergeResult.duplicatesMerged,
            invalidSkipped: mergeResult.invalidSkipped,
          }),
        );

        // validJobsFound counts only distinct additions retained by this run
        // (persisted or staged); duplicate merges stay in duplicatesMerged.
        activeRun = updateRunSummary(activeRun, {
          validJobsFound:
            activeRun.summary.validJobsFound + jobsPersisted + jobsStaged,
          jobsPersisted: activeRun.summary.jobsPersisted + jobsPersisted,
          jobsStaged: activeRun.summary.jobsStaged + jobsStaged,
          jobsSkippedByLedger:
            activeRun.summary.jobsSkippedByLedger +
            triageOutcome.skippedByLedger,
          jobsSkippedByTitleTriage:
            activeRun.summary.jobsSkippedByTitleTriage +
            triageOutcome.skippedByTitleTriage,
          duplicatesMerged:
            activeRun.summary.duplicatesMerged + mergeResult.duplicatesMerged,
          invalidSkipped:
            activeRun.summary.invalidSkipped + mergeResult.invalidSkipped,
        });

        const targetCompletedAt = new Date().toISOString();
        const targetFailed = Boolean(
          collected.result.warning && collectedJobs.length === 0,
        );
        activeRun = completeTargetExecution(
          activeRun,
          target.id,
          targetCompletedAt,
          {
            state: targetFailed ? "failed" : "completed",
            requestedJobBudget: discoveryBudget.targetJobCount,
            // Execution truth is cumulative across checkpoint flushes and the
            // final remainder, so a completed source never hides the work its
            // mid-run persistence already committed. Reviewed counts every
            // scored/merged observation; budget slots are tracked separately
            // so upgrades of known identities do not consume them. jobsFound
            // is the distinct retained total (persisted + staged), matching
            // the run summary so user-facing found/kept claims stay truthful.
            jobsReviewed: checkpointState.reviewedCount,
            jobsFound:
              checkpointState.jobsPersisted + checkpointState.jobsStaged,
            jobsPersisted: checkpointState.jobsPersisted,
            jobsStaged: checkpointState.jobsStaged,
            jobsSkippedByLedger: checkpointState.skippedByLedger,
            jobsSkippedByTitleTriage: checkpointState.skippedByTitleTriage,
            duplicatesMerged: checkpointState.duplicatesMerged,
            invalidSkipped: checkpointState.invalidSkipped,
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
                checkpointState.skippedByLedger +
                checkpointState.skippedByTitleTriage +
                checkpointState.invalidSkipped,
            },
            warning: collected.result.warning,
          },
        );
        const targetCompletedEvent = createDiscoveryEvent({
          runId,
          timestamp: targetCompletedAt,
          kind: targetFailed ? "error" : "success",
          stage: "target",
          waitReason: "persisting_results",
          targetId: target.id,
          adapterKind: target.adapterKind,
          resolvedAdapterKind: collected.adapterKind,
          collectionMethod: collected.collectionMethod,
          sourceIntelligenceProvider: collectedProviderKey,
          terminalState: targetFailed ? "failed" : "completed",
          message: targetFailed
            ? `Could not finish ${target.label}: ${collected.result.warning}`
            : `Finished ${target.label} (${index + 1}/${targets.length})`,
          url: target.startingUrl,
          // Review-volume semantic on purpose (valid cards merged, duplicates
          // included): the renderer count label derives "unique retained" as
          // jobsFound minus duplicatesMerged from merged-result events. The
          // execution and summary fields above carry distinct retained.
          jobsFound: checkpointState.validatedCount,
          jobsPersisted: checkpointState.jobsPersisted,
          jobsStaged: checkpointState.jobsStaged,
          duplicatesMerged: checkpointState.duplicatesMerged,
          invalidSkipped: checkpointState.invalidSkipped,
        });
        // Record the event before saving so run history stays complete, but do
        // not publish "Finished" until the jobs and ledger are durable. The
        // desktop uses this terminal event as its progressive-refresh signal.
        recordActivity(targetCompletedEvent);

        const changedJobIds = uniqueStrings(resumeAffectingChangedJobIds);
        if (!settings.discoveryOnly && changedJobIds.length > 0) {
          await ctx.staleApprovedResumeDrafts(
            "Saved job details changed after approval and the resume needs a fresh review.",
            changedJobIds,
          );
        }
        await persistWorkingSavedJobs((current) =>
          finalizeDiscoveryState(
            {
              ...current,
              pendingDiscoveryJobs: overlayTouchedPendingJobs(
                current.pendingDiscoveryJobs,
                workingPendingJobs,
                touchedPendingJobIds,
                baselinePendingJobIds,
              ),
              discoveryLedger: rebaseRunLedgerOntoPersisted({
                baselineLedger,
                workingLedger,
                persistedLedger: current.discoveryLedger,
              }),
            },
            activeRun,
            enrichedPreferences,
          ),
        );
        publishActivity(targetCompletedEvent);

        // Persistence and matching above can resolve entirely through
        // microtasks for fast API sources. Give Electron a real event-loop turn
        // so window messages and IPC remain responsive during large catalogs.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      // Read the listing bodies the compact scan did not. Every job this run
      // retained as a card gets one plain-HTTP read of its own page, then a
      // fresh score from the same assessment session, before the run is
      // declared finished: "Search finished" should mean the results are
      // scored, not that a list of titles arrived. Bounded (count, time,
      // concurrency) and never fatal: a page that will not read stays a
      // title match with the attempt recorded on the job.
      const enrichmentCandidates = workingSavedJobs.filter(
        (job) => runRetainedJobIds.has(job.id) && jobNeedsListingDetail(job),
      );
      // No reader configured means no reads: the desktop composes the
      // plain-HTTP reader in; tests and other hosts opt in explicitly so a
      // fixture URL is never fetched for real.
      if (
        ctx.fetchListingHtml &&
        enrichmentCandidates.length > 0 &&
        !executionSignal.aborted
      ) {
        const fetchListingHtml = ctx.fetchListingHtml;
        const readEvent = (message: string) =>
          createDiscoveryEvent({
            runId,
            timestamp: new Date().toISOString(),
            kind: "info",
            stage: "extraction",
            waitReason: "extracting_jobs",
            targetId: null,
            adapterKind: null,
            resolvedAdapterKind: null,
            message,
            url: null,
            jobsFound:
              activeRun.summary.jobsPersisted + activeRun.summary.jobsStaged,
            jobsPersisted: activeRun.summary.jobsPersisted,
            jobsStaged: activeRun.summary.jobsStaged,
            duplicatesMerged: activeRun.summary.duplicatesMerged,
            invalidSkipped: activeRun.summary.invalidSkipped,
          });
        emitActivity(
          readEvent(
            `Reading listing details for ${enrichmentCandidates.length} ${
              enrichmentCandidates.length === 1 ? "job" : "jobs"
            }`,
          ),
        );
        try {
          const enrichment = await enrichSavedJobListingDetails({
            jobs: enrichmentCandidates,
            fetchHtml: fetchListingHtml,
            assess: assessmentSession.assess,
            signal: executionSignal,
          });
          if (enrichment.changedJobIds.length > 0) {
            const enrichedById = new Map(
              enrichment.jobs.map((job) => [job.id, job]),
            );
            workingSavedJobs = workingSavedJobs.map(
              (job) => enrichedById.get(job.id) ?? job,
            );
            for (const jobId of enrichment.changedJobIds) {
              touchedSavedJobIds.add(jobId);
            }
            // The scan-time "only cards were read" warning stops being true
            // for a target once any of its retained jobs has a body.
            const targetsWithBodies = new Set(
              workingSavedJobs
                .filter(
                  (job) =>
                    runRetainedJobIds.has(job.id) &&
                    job.detailQuality !== "card_only",
                )
                .flatMap((job) =>
                  job.provenance.map((entry) => entry.targetId),
                ),
            );
            activeRun = {
              ...activeRun,
              targetExecutions: activeRun.targetExecutions.map((execution) =>
                targetsWithBodies.has(execution.targetId)
                  ? {
                      ...execution,
                      warning: stripDiscoveryCardOnlyEvidenceWarning(
                        execution.warning,
                      ),
                    }
                  : execution,
              ),
            };
            if (targetsWithBodies.size > 0) {
              activeRun = updateRunSummary(activeRun, {
                warnings: activeRun.summary.warnings
                  .map((warning) =>
                    stripDiscoveryCardOnlyEvidenceWarning(warning),
                  )
                  .filter((warning): warning is string => Boolean(warning)),
              });
            }
            await persistWorkingSavedJobs();
          }
          emitActivity(
            readEvent(describeListingDetailEnrichment(enrichment.summary)),
          );
        } catch (error) {
          if (executionSignal.aborted) {
            throw error;
          }
          emitActivity(
            readEvent(
              `Listing details could not be read this time: ${describeUnknownThrowable(error)}`,
            ),
          );
        }
      }

      const completedTargets = activeRun.targetExecutions.filter(
        (target) => target.state === "completed",
      ).length;
      const failedTargets = activeRun.targetExecutions.filter(
        (target) => target.state === "failed",
      );
      if (completedTargets === 0 && failedTargets.length > 0) {
        terminalStatus = "failed";
        caughtError = new Error(
          failedTargets[0]?.warning ??
            "Discovery could not complete any configured source. Retry the failed source from Search history.",
        );
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

    await persistWorkingSavedJobs((current) =>
      finalizeDiscoveryState(
        {
          ...current,
          pendingDiscoveryJobs: overlayTouchedPendingJobs(
            current.pendingDiscoveryJobs,
            workingPendingJobs,
            touchedPendingJobIds,
            baselinePendingJobIds,
          ),
          discoveryLedger: rebaseRunLedgerOntoPersisted({
            baselineLedger,
            workingLedger,
            persistedLedger: current.discoveryLedger,
          }),
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
    async runCampaignDiscovery(campaign) {
      // Campaign runs are discovery-only and always cover every enabled target
      // of the supplied campaign using that campaign's own preferences. The
      // run record is tagged with the campaign id while the active campaign and
      // the global search preferences are left untouched.
      //
      // Browser-backed targets run on the bounded agent runtime (the direct
      // discovery path is a zero-yield production stub); public API sources
      // stay progressive through the shared readiness iterator regardless.
      return trackDiscoveryPromise(
        executeDiscoveryPipeline({
          scope: "run_all",
          campaign,
          allowInactiveMarking: true,
          useAgentRuntime: true,
        }),
      );
    },
  };
}
