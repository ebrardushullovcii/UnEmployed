import type { Page } from "playwright";
import type {
  DiscoveryCompactObservation,
  JobPosting,
} from "@unemployed/contracts";
import {
  buildDiscoveryCardOnlyEvidenceWarning,
  isCardOnlyDiscoveryEvidence,
} from "@unemployed/contracts";
import type {
  AgentConfig,
  AgentProgress,
  AgentResult,
  AgentState,
  ToolCall,
} from "../types";
import { captureCompactDiscoveryObservation } from "../compact-discovery-observer";
import { getToolDefinitions } from "../tools";
import { createSystemPrompt } from "../prompts";
import { isAllowedUrl } from "../allowlist";
import {
  appendConversationMessage,
  createAgentCompactionStatus,
  createContextBudgetFailureReason,
  compactToolContent,
  getEffectiveCompactionConfig,
  maybeCompactConversation,
  renderReviewTranscriptMessage,
  shouldFailForContextBudget,
} from "./conversation";
import { isJobPreferenceAligned } from "./job-extraction";
import {
  appendPhaseEvidence,
  createEmptyPhaseEvidence,
  hasMeaningfulPhaseEvidence,
  recordToolEvidence,
  sanitizeUrl,
  synthesizeFallbackDebugFindings,
} from "./evidence";
import { recoverFrom404LikeSurface } from "./navigation-recovery";
import {
  executeToolCall,
  restoreSeededQuerySurfaceIfNeeded,
} from "./tool-execution";
import { buildForcedFinishPrompt, createUserPrompt } from "./user-prompts";
import type { JobExtractor, LLMClient } from "./contracts";
import {
  buildAgentResult,
  createProgressEmitter,
  flushDeferredSearchExtractions,
  getEvidenceSignalCount,
  getLlmResponse,
  getNonRouteEvidenceSignalCount,
  hasSufficientEarlyForcedFinishEvidence,
  isClosedPageError,
  recoverLivePageState,
  summarizeExtractionPassResult,
  waitForInitialPageReady,
  type ExtractionPassSummary,
} from "./discovery-helpers";

// Deferred search pages are extracted one at a time as soon as possible so
// kept jobs reach incremental persistence early. This does not multiply
// provider calls: each captured page is extracted at most once regardless of
// batching, per-page review caps are unchanged, and reaching the target count
// mid-flush stops remaining extraction work sooner.
const DEFERRED_SEARCH_EXTRACTION_BATCH_SIZE = 1;
const DEFERRED_SEARCH_EXTRACTION_FLUSH_STEP_INTERVAL = 5;
const DISCOVERY_STAGNATION_ZERO_YIELD_LIMIT = 3;
const DISCOVERY_STAGNATION_STEP_WINDOW = 8;
const DISCOVERY_CANDIDATE_HOLD_STEP_WINDOW = 4;
const DISCOVERY_CANDIDATE_HOLD_MIN_JOBS = 2;
const DISCOVERY_LATE_STEP_STOP_BUFFER = 3;
const EARLY_FORCED_FINISH_MIN_STEP = 4;
const EARLY_FORCED_FINISH_STALE_STEP_WINDOW = 2;
// Navigation progress resets protect genuinely new landings (for example a
// pagination click) between the click and the next extraction turn. The
// protection is bounded so revisits and repeat attempts cannot reset the
// stagnation, no-progress, or candidate-hold windows indefinitely.
const DISCOVERY_NAVIGATION_RESET_LIMIT = 2;
// A weak source may stop below the requested target once a useful candidate
// set is already held and slow extraction keeps returning nothing new.
const DISCOVERY_YIELD_EXHAUSTION_ZERO_YIELD_PASSES = 2;
const DISCOVERY_YIELD_EXHAUSTION_STALE_STEP_WINDOW = 4;
const DISCOVERY_YIELD_EXHAUSTION_MIN_CANDIDATES = 2;

// ---------------------------------------------------------------------------
// Deterministic compact-first observation (ADR 0013 tier two)
//
// Ordinary discovery captures exactly one compact observation of the landed
// surface before any model call. These helpers only build caller-owned
// identity and bounded fallback evidence; capture, merge, and control
// execution policy stay with the observer contract and the run loop.
// ---------------------------------------------------------------------------

// Observation ids must be unique within the process so snapshot-scoped
// references can never alias across runs. The run start timestamp keeps ids
// readable; the process-wide sequence disambiguates same-millisecond runs.
let compactObservationSequence = 0;
function createCompactObservationId(runStartedAtMs: number): string {
  compactObservationSequence += 1;
  return `compact_obs_${runStartedAtMs}_${compactObservationSequence}`;
}

/**
 * Stable, secret-free target identity for one discovery run. The sanitized
 * selected starting URL (origin + pathname) is preferred: it is stable across
 * navigation retries, source-generic, strips query/fragment/credential
 * secrets, and matches the URL identity already recorded in route evidence.
 */
function buildCompactObservationTargetId(
  selectedStartingUrl: string,
  landedUrl: string,
  siteLabel: string,
): string {
  const sanitizedStartingUrl = sanitizeUrl(selectedStartingUrl);
  if (sanitizedStartingUrl?.trim()) {
    return sanitizedStartingUrl.trim();
  }

  try {
    const hostname = new URL(landedUrl).hostname.trim();
    if (hostname) {
      const label = siteLabel.trim() || "unknown_site";
      return `${label}::${hostname}`;
    }
  } catch {
    // Fall through to the site label below.
  }

  return siteLabel.trim() || "unknown_discovery_target";
}

/** Page identity without query string, fragment, or credentials. */
function describeCompactObservationPageIdentity(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return pageUrl.split(/[?#]/, 1)[0] ?? pageUrl;
  }
}

/**
 * Bounded summary of one observation for the model fallback path. Only
 * contract-capped fields travel here: kind/reason, page identity, posting
 * titles/canonical URLs/composites, control kinds+labels+ref ids,
 * uncertainty notes with omitted counts, and truncation flags. Raw
 * textSample/accessibilitySummary bodies and unsupported detail never cross.
 */
function buildCompactFallbackSummary(
  observation: DiscoveryCompactObservation,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    kind: observation.kind,
    ...(observation.kind === "unsupported"
      ? { reason: observation.reason }
      : {}),
    pageUrl: describeCompactObservationPageIdentity(observation.pageUrl),
    pageTitle: observation.pageTitle,
    contentTruncation: {
      textSampleTruncated: observation.content.textTruncated,
      accessibilitySummaryTruncated:
        observation.content.accessibilitySummaryTruncated,
    },
  };

  if (observation.kind !== "supported") {
    return summary;
  }

  return {
    ...summary,
    sourceKind: observation.sourceKind,
    postingCandidateCount: observation.postingCandidates.length,
    omittedPostingCandidateCount: observation.omittedPostingCandidateCount,
    retainedComposites: observation.postingCandidates.map((candidate) => ({
      compositeKey: `${candidate.canonicalUrl}::${candidate.sourceJobId}`,
      title: candidate.title,
      canonicalUrl: candidate.canonicalUrl,
    })),
    paginationCandidates: observation.paginationCandidates.map((candidate) => ({
      refId: candidate.refId,
      kind: candidate.kind,
      label: candidate.label,
    })),
    actionCandidates: observation.actionCandidates.map((candidate) => ({
      refId: candidate.refId,
      kind: candidate.kind,
      label: candidate.label,
    })),
    uncertaintyNotes: observation.uncertaintyNotes,
  };
}

function buildCompactFallbackMessage(
  observation: DiscoveryCompactObservation,
): string {
  return [
    "[compact page scan] A deterministic compact observation ran before planning. Bounded summary JSON:",
    JSON.stringify(buildCompactFallbackSummary(observation)),
    "The retained composites above are already collected; do not spend steps rediscovering those exact canonicalUrl::sourceJobId postings.",
    "Pagination and action ref ids are snapshot-scoped proposals from that single observation; they are context only, not executable selectors or commands.",
  ].join("\n");
}

function buildContextBudgetFailureResult(
  state: AgentState,
  requiresExplicitFinish: boolean,
  pendingDebugFindings: NonNullable<AgentResult["debugFindings"]> | null,
): AgentResult {
  const reason = createContextBudgetFailureReason();

  return buildAgentResult(state, {
    error: reason,
    phaseCompletionMode: requiresExplicitFinish ? "runtime_failed" : null,
    phaseCompletionReason: requiresExplicitFinish ? reason : null,
    phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
    debugFindings: pendingDebugFindings,
  });
}

export async function runAgentDiscovery(
  page: Page,
  config: AgentConfig,
  llmClient: LLMClient,
  jobExtractor: JobExtractor,
  onProgress?: (progress: AgentProgress) => void,
  signal?: AbortSignal,
): Promise<AgentResult> {
  const runStartedAtMs = Date.now();
  console.log(
    `[Agent] Starting discovery: ${config.targetJobCount} jobs target`,
  );
  let pendingDebugFindings: NonNullable<AgentResult["debugFindings"]> | null =
    null;
  let awaitingStructuredFinish = false;
  let forcedFinishPromptSent = false;
  const requiresExplicitFinish = Boolean(config.promptContext.taskPacket);
  const startingUrlCandidates = [
    ...new Set(config.startingUrls.map((url) => url.trim()).filter(Boolean)),
  ];
  const pageRef: { current: Page } = { current: page };

  const state: AgentState = {
    conversation: [
      { role: "system", content: createSystemPrompt(config) },
      { role: "user", content: createUserPrompt(config) },
    ],
    reviewTranscript: [
      renderReviewTranscriptMessage({
        role: "system",
        content: createSystemPrompt(config),
      }),
      renderReviewTranscriptMessage({
        role: "user",
        content: createUserPrompt(config),
      }),
    ],
    collectedJobs: config.resumeCheckpoint?.collectedJobs ?? [],
    deferredSearchExtractions: new Map(),
    failedInteractionAttempts: new Map(),
    visitedUrls: new Set(config.resumeCheckpoint?.visitedUrls ?? []),
    stepCount: config.resumeCheckpoint?.stepCount ?? 0,
    currentUrl: config.resumeCheckpoint?.currentUrl ?? "",
    lastStableUrl: config.resumeCheckpoint?.lastStableUrl ?? "",
    visualObservationSets: [],
    visualSnapshots: [],
    isRunning: true,
    phaseEvidence:
      config.resumeCheckpoint?.phaseEvidence ?? createEmptyPhaseEvidence(),
    compactionState: null,
    compactionStatus: createAgentCompactionStatus(),
  };
  let consecutiveZeroYieldExtractionPasses = 0;
  // Stagnation and evidence windows start at the resume point so an
  // interrupted attempt's lifetime step count cannot instantly satisfy a
  // stale-window check before this run takes any action.
  let lastJobGainStep = state.stepCount;
  let navigationResetsSinceLastJobGain = 0;
  let lastEvidenceSignalCount = getEvidenceSignalCount(state);
  let lastEvidenceGrowthStep = state.stepCount;
  // A resumed checkpoint carries jobs collected by the interrupted attempt.
  // They are already durable downstream, so this run's target, candidate
  // thresholds, and completion checks measure only what THIS run adds:
  // comparing lifetime totals against the fresh run share stops a resumed
  // run before it explores anything new.
  const resumedCollectedJobCount =
    config.resumeCheckpoint?.collectedJobs.length ?? 0;
  const getThisRunCollectedJobCount = (): number =>
    Math.max(0, state.collectedJobs.length - resumedCollectedJobCount);

  const getAlignedCollectedJobCount = (): number =>
    state.collectedJobs.slice(resumedCollectedJobCount).filter((job) =>
      isJobPreferenceAligned({
        job,
        searchPreferences: config.searchPreferences,
      }),
    ).length;

  const tools = getToolDefinitions();
  const emitProgress = createProgressEmitter(state, config, onProgress);
  let checkpointRevision = config.resumeCheckpoint?.revision ?? 0;
  const saveRunCheckpoint = async () => {
    if (!config.onCheckpoint) return;
    await config.onCheckpoint({
      revision: ++checkpointRevision,
      savedAt: new Date().toISOString(),
      currentUrl: state.currentUrl,
      lastStableUrl: state.lastStableUrl,
      stepCount: state.stepCount,
      // Snapshot the live collected list so a stored revision can never alias
      // the agent's mutable array or job objects.
      collectedJobs: state.collectedJobs.map((job) => ({ ...job })),
      visitedUrls: [...state.visitedUrls],
      phaseEvidence: state.phaseEvidence,
    });
  };
  // Deterministic merge of compact observation candidates: exact
  // canonicalUrl::sourceJobId composites only, earlier/resumed rows are never
  // displaced or recounted, and nothing is fabricated or rescored. Rows keep
  // observation order so merges stay reproducible.
  const mergeCompactPostingCandidates = (
    candidates: readonly JobPosting[],
  ): number => {
    const seenComposites = new Set(
      state.collectedJobs.map(
        (job) => `${job.canonicalUrl}::${job.sourceJobId}`,
      ),
    );
    let addedCount = 0;

    for (const candidate of candidates) {
      const compositeKey = `${candidate.canonicalUrl}::${candidate.sourceJobId}`;
      if (seenComposites.has(compositeKey)) {
        continue;
      }

      seenComposites.add(compositeKey);
      state.collectedJobs.push(candidate);
      addedCount += 1;
    }

    return addedCount;
  };
  // Truthful interrupted result for cancellation between navigation and the
  // first model/tool work; ordinary runs carry no completion mode here.
  const buildInterruptedBeforeModelWorkResult = (): AgentResult =>
    buildAgentResult(state, {
      incomplete: true,
      phaseCompletionMode: null,
      phaseCompletionReason: null,
      phaseEvidence: null,
      debugFindings: pendingDebugFindings,
    });
  const recordEvidenceProgress = () => {
    const nextEvidenceSignalCount = getEvidenceSignalCount(state);

    if (nextEvidenceSignalCount > lastEvidenceSignalCount) {
      lastEvidenceSignalCount = nextEvidenceSignalCount;
      lastEvidenceGrowthStep = state.stepCount;
    }
  };
  const maybeTriggerEarlyForcedFinish = () => {
    if (!requiresExplicitFinish || forcedFinishPromptSent) {
      return false;
    }

    const nonRouteEvidenceSignals = getNonRouteEvidenceSignalCount(state);
    if (nonRouteEvidenceSignals === 0) {
      return false;
    }

    const minStepBeforeForcedFinish = Math.min(
      Math.max(2, config.maxSteps - 2),
      EARLY_FORCED_FINISH_MIN_STEP,
    );
    if (state.stepCount < minStepBeforeForcedFinish) {
      return false;
    }

    if (!hasSufficientEarlyForcedFinishEvidence(state, config)) {
      return false;
    }

    const evidenceStalled =
      state.stepCount - lastEvidenceGrowthStep >=
      EARLY_FORCED_FINISH_STALE_STEP_WINDOW;
    if (!evidenceStalled) {
      return false;
    }

    forcedFinishPromptSent = true;
    appendConversationMessage(state, {
      role: "user",
      content: buildForcedFinishPrompt(state, config),
    });
    return maybeCompactConversation(state, config, createUserPrompt);
  };
  const recordExtractionPassSummary = (summary: ExtractionPassSummary) => {
    if (summary.extractionPasses === 0) {
      return;
    }

    if (summary.newJobsAdded > 0) {
      consecutiveZeroYieldExtractionPasses =
        summary.trailingZeroYieldExtractionPasses;
      navigationResetsSinceLastJobGain = 0;
      lastJobGainStep = state.stepCount;
      return;
    }

    consecutiveZeroYieldExtractionPasses += summary.zeroYieldExtractionPasses;
  };
  const buildDiscoveryResult = async (
    partial: Omit<
      AgentResult,
      | "jobs"
      | "steps"
      | "transcriptMessageCount"
      | "reviewTranscript"
      | "compactionState"
    >,
  ): Promise<AgentResult> => {
    if (!requiresExplicitFinish && state.deferredSearchExtractions.size > 0) {
      await flushDeferredSearchExtractions({
        state,
        config,
        jobExtractor,
        emitProgress,
        mode: "final",
        ...(signal ? { signal } : {}),
      });
    }

    const resolvedPartial =
      !requiresExplicitFinish && partial.incomplete === true
        ? {
            ...partial,
            incomplete: getThisRunCollectedJobCount() < config.targetJobCount,
          }
        : partial;

    // Completion accounting is a count of postings, not a measure of evidence
    // depth: a run can meet its target from card evidence alone and otherwise
    // report as a clean, healthy, complete success. When every retained
    // posting is card_only, say so once at run level so the run record and
    // source health carry the shortfall instead of leaving it to per-row copy.
    const cardOnlyWarning =
      !requiresExplicitFinish &&
      isCardOnlyDiscoveryEvidence(state.collectedJobs)
        ? buildDiscoveryCardOnlyEvidenceWarning(config.promptContext.siteLabel)
        : null;
    const warnedPartial = cardOnlyWarning
      ? {
          ...resolvedPartial,
          warning: [resolvedPartial.warning, cardOnlyWarning]
            .filter((entry): entry is string => Boolean(entry))
            .join(" "),
        }
      : resolvedPartial;

    return buildAgentResult(state, warnedPartial);
  };
  const maybeStopForStagnation = async (): Promise<AgentResult | null> => {
    if (
      requiresExplicitFinish ||
      getThisRunCollectedJobCount() >= config.targetJobCount ||
      state.deferredSearchExtractions.size > 0 ||
      consecutiveZeroYieldExtractionPasses <
        DISCOVERY_STAGNATION_ZERO_YIELD_LIMIT ||
      state.stepCount - lastJobGainStep < DISCOVERY_STAGNATION_STEP_WINDOW
    ) {
      return null;
    }

    emitProgress({
      currentAction: "stop_stagnant_source",
      currentUrl: state.currentUrl,
      jobsFound: state.collectedJobs.length,
      stepCount: state.stepCount,
      waitReason: "finalizing",
      message:
        "Stopping this source early because recent extraction passes stopped producing new jobs.",
    });
    console.log(
      `[Agent] Stopping early after ${consecutiveZeroYieldExtractionPasses} zero-yield extraction passes and ${state.stepCount - lastJobGainStep} stale steps`,
    );

    return buildDiscoveryResult({
      incomplete: true,
      phaseCompletionMode: null,
      phaseCompletionReason: null,
      phaseEvidence: null,
      debugFindings: pendingDebugFindings,
    });
  };
  const maybeStopForYieldAwareExhaustion =
    async (): Promise<AgentResult | null> => {
      const alignedCollectedJobCount = getAlignedCollectedJobCount();
      if (
        requiresExplicitFinish ||
        getThisRunCollectedJobCount() >= config.targetJobCount ||
        state.deferredSearchExtractions.size > 0 ||
        alignedCollectedJobCount < DISCOVERY_YIELD_EXHAUSTION_MIN_CANDIDATES ||
        consecutiveZeroYieldExtractionPasses <
          DISCOVERY_YIELD_EXHAUSTION_ZERO_YIELD_PASSES ||
        state.stepCount - lastJobGainStep <
          DISCOVERY_YIELD_EXHAUSTION_STALE_STEP_WINDOW
      ) {
        return null;
      }

      emitProgress({
        currentAction: "stop_yield_exhausted_source",
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        waitReason: "finalizing",
        message:
          "Stopping this source early because recent slow extraction passes kept producing no new jobs even though a useful candidate set is already held.",
      });
      console.log(
        `[Agent] Stopping after ${consecutiveZeroYieldExtractionPasses} consecutive zero-yield extraction passes and ${state.stepCount - lastJobGainStep} stale steps while holding ${alignedCollectedJobCount} aligned candidate job${alignedCollectedJobCount === 1 ? "" : "s"}`,
      );

      return buildDiscoveryResult({
        incomplete: getThisRunCollectedJobCount() < config.targetJobCount,
        phaseCompletionMode: null,
        phaseCompletionReason: null,
        phaseEvidence: null,
        debugFindings: pendingDebugFindings,
      });
    };
  const maybeStopAfterCandidateHold = async (): Promise<AgentResult | null> => {
    const alignedCollectedJobCount = getAlignedCollectedJobCount();
    const usefulCandidateThreshold = Math.min(
      config.targetJobCount,
      Math.max(
        DISCOVERY_CANDIDATE_HOLD_MIN_JOBS,
        Math.ceil(config.targetJobCount * 0.5),
      ),
    );
    const nearStepLimit =
      state.stepCount >=
      Math.max(1, config.maxSteps - DISCOVERY_LATE_STEP_STOP_BUFFER);
    const hasGeneralCandidateHold =
      alignedCollectedJobCount >= usefulCandidateThreshold &&
      state.stepCount - lastJobGainStep >= DISCOVERY_CANDIDATE_HOLD_STEP_WINDOW;
    const hasLateUsefulCandidateHold =
      nearStepLimit && alignedCollectedJobCount >= usefulCandidateThreshold;

    if (
      requiresExplicitFinish ||
      getThisRunCollectedJobCount() >= config.targetJobCount ||
      state.deferredSearchExtractions.size > 0 ||
      (!hasGeneralCandidateHold && !hasLateUsefulCandidateHold)
    ) {
      return null;
    }

    emitProgress({
      currentAction: "stop_after_candidate_hold",
      currentUrl: state.currentUrl,
      jobsFound: state.collectedJobs.length,
      stepCount: state.stepCount,
      waitReason: "finalizing",
      message: nearStepLimit
        ? "Stopping this discovery run near the step limit because it already has a useful candidate set and another planning turn is unlikely to improve it enough."
        : "Stopping this discovery run early because it already has a useful candidate set and recent steps did not keep improving it.",
    });
    console.log(
      `[Agent] Stopping after holding ${alignedCollectedJobCount} aligned candidate job${alignedCollectedJobCount === 1 ? "" : "s"} for ${state.stepCount - lastJobGainStep} stale steps${nearStepLimit ? " near the step limit" : ""}`,
    );

    return buildDiscoveryResult({
      incomplete: getThisRunCollectedJobCount() < config.targetJobCount,
      phaseCompletionMode: null,
      phaseCompletionReason: null,
      phaseEvidence: null,
      debugFindings: pendingDebugFindings,
    });
  };
  const recoverLivePage = async (reason: string): Promise<boolean> => {
    return recoverLivePageState({
      config,
      pageRef,
      state,
      reason,
      emitProgress,
    });
  };

  try {
    if (startingUrlCandidates.length === 0) {
      return buildAgentResult(state, {
        error: "No starting URLs provided",
        phaseCompletionMode: requiresExplicitFinish ? "runtime_failed" : null,
        phaseCompletionReason: requiresExplicitFinish
          ? "No starting URLs provided"
          : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings,
      });
    }

    let landedUrl: string | null = null;
    let selectedStartingUrl: string | null = null;
    const startingUrlFailures: string[] = [];

    startingUrlLoop: for (const [
      index,
      candidateUrl,
    ] of startingUrlCandidates.entries()) {
      const candidateValidation = isAllowedUrl(
        candidateUrl,
        config.navigationPolicy,
      );
      if (!candidateValidation.valid) {
        const detail =
          candidateValidation.error ?? "Starting URL not in allowlist.";
        console.error(`[Agent] Starting URL not allowed: ${candidateUrl}`);
        startingUrlFailures.push(`${candidateUrl} (${detail})`);
        continue;
      }

      const usingFallbackCandidate = index > 0;
      let recoveredClosedPageForCandidate = false;

      while (true) {
        emitProgress({
          currentAction: "navigate",
          waitReason: "waiting_on_page",
          message: usingFallbackCandidate
            ? `Trying fallback starting page ${index + 1}/${startingUrlCandidates.length}.`
            : "Opening the starting page for this run.",
          currentUrl: candidateUrl,
          stepCount: 0,
          jobsFound: 0,
        });

        try {
          const activePage = pageRef.current;
          await activePage.goto(candidateUrl, {
            waitUntil: "domcontentloaded",
          });
          emitProgress({
            currentAction: "page_settle",
            waitReason: "waiting_on_page",
            message: usingFallbackCandidate
              ? "Waiting for the fallback starting page to settle before the first action."
              : "Waiting for the starting page to settle before the first action.",
            currentUrl: activePage.url() || candidateUrl,
            stepCount: 0,
            jobsFound: 0,
          });
          await waitForInitialPageReady(activePage);

          const candidateLandedUrl = activePage.url() || candidateUrl;
          const landedUrlValidation = isAllowedUrl(
            candidateLandedUrl,
            config.navigationPolicy,
          );
          if (!landedUrlValidation.valid) {
            console.error(
              `[Agent] Starting URL redirected off-allowlist: ${candidateLandedUrl}`,
            );
            startingUrlFailures.push(
              `${candidateUrl} redirected to ${candidateLandedUrl} (${landedUrlValidation.error ?? "redirected off allowlist"})`,
            );
            break;
          }

          landedUrl = candidateLandedUrl;
          selectedStartingUrl = candidateUrl;
          break startingUrlLoop;
        } catch (error) {
          let effectiveError: unknown = error;

          if (
            isClosedPageError(effectiveError) &&
            !recoveredClosedPageForCandidate
          ) {
            try {
              if (await recoverLivePage("starting_url")) {
                recoveredClosedPageForCandidate = true;
                continue;
              }
            } catch (resolveError) {
              effectiveError = resolveError;
            }
          }

          if (
            (effectiveError instanceof DOMException &&
              effectiveError.name === "AbortError") ||
            signal?.aborted
          ) {
            throw effectiveError;
          }

          const detail =
            effectiveError instanceof Error
              ? effectiveError.message
              : "Unknown navigation error";
          console.error(
            `[Agent] Starting URL failed: ${candidateUrl} | ${detail}`,
          );
          startingUrlFailures.push(`${candidateUrl} (${detail})`);
          break;
        }
      }
    }

    if (!landedUrl || !selectedStartingUrl) {
      const detail =
        startingUrlFailures.length > 0
          ? ` Tried: ${startingUrlFailures.join("; ")}`
          : "";
      return buildAgentResult(state, {
        error: `Unable to open a usable starting URL.${detail}`,
        phaseCompletionMode: requiresExplicitFinish ? "runtime_failed" : null,
        phaseCompletionReason: requiresExplicitFinish
          ? `Unable to open a usable starting URL.${detail}`
          : null,
        phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
        debugFindings: pendingDebugFindings,
      });
    }

    state.currentUrl = landedUrl;
    state.lastStableUrl = landedUrl;
    state.visitedUrls.add(state.currentUrl);
    appendPhaseEvidence(state, "routeSignals", [
      sanitizeUrl(landedUrl)
        ? selectedStartingUrl === landedUrl
          ? `Started on ${sanitizeUrl(landedUrl)}`
          : `Started from ${sanitizeUrl(selectedStartingUrl)} and landed on ${sanitizeUrl(landedUrl)}`
        : null,
      startingUrlFailures.length > 0
        ? `Starting URL fallback skipped ${startingUrlFailures.length} earlier candidate${startingUrlFailures.length === 1 ? "" : "s"}.`
        : null,
    ]);
    console.log(`[Agent] Started at: ${state.currentUrl}`);

    // Compact-first deterministic observation (ADR 0013 tier two), ordinary
    // discovery only. Source-debug phases keep their own observation policy
    // and skip this slice entirely. Capture happens exactly once here, before
    // any executeToolCall or LLM call: enough inventory ends the run with zero
    // model calls and zero legacy extraction tool calls; otherwise one bounded
    // summary message seeds the existing batch/model path unchanged. Capture
    // failures are represented as unsupported outcomes and always fall through
    // to the legacy path rather than aborting discovery.
    if (!requiresExplicitFinish) {
      if (signal?.aborted) {
        return buildInterruptedBeforeModelWorkResult();
      }

      const observation = await captureCompactDiscoveryObservation({
        page: pageRef.current,
        targetId: buildCompactObservationTargetId(
          selectedStartingUrl,
          landedUrl,
          config.promptContext.siteLabel,
        ),
        observationId: createCompactObservationId(runStartedAtMs),
        revision: 1,
        observedAt: new Date().toISOString(),
      });

      if (signal?.aborted) {
        return buildInterruptedBeforeModelWorkResult();
      }

      if (observation.kind === "supported") {
        const compactAddedCount = mergeCompactPostingCandidates(
          observation.postingCandidates,
        );
        // Persist before any user-visible kept-jobs progress event so
        // incremental downstream persistence never trails this run's report.
        if (compactAddedCount > 0) {
          await saveRunCheckpoint();
        }
        emitProgress({
          currentAction: "compact_page_observation",
          currentUrl: state.currentUrl,
          jobsFound: state.collectedJobs.length,
          stepCount: state.stepCount,
          waitReason: "extracting_jobs",
          message:
            compactAddedCount > 0
              ? `Deterministic page scan kept ${compactAddedCount} new job${compactAddedCount === 1 ? "" : "s"} from ${observation.postingCandidates.length} candidate${observation.postingCandidates.length === 1 ? "" : "s"} recognized.`
              : `Deterministic page scan recognized ${observation.postingCandidates.length} candidate job${observation.postingCandidates.length === 1 ? "" : "s"} with no new additions.`,
        });

        if (getThisRunCollectedJobCount() >= config.targetJobCount) {
          console.log(
            `[Agent] Target reached by deterministic page scan: ${state.collectedJobs.length} jobs`,
          );
          return await buildDiscoveryResult({
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings,
          });
        }
      }

      appendConversationMessage(state, {
        role: "user",
        content: buildCompactFallbackMessage(observation),
      });
    }

    if (!requiresExplicitFinish && config.targetJobCount >= 20) {
      const maxBatchPasses = Math.min(
        28,
        Math.max(8, Math.ceil(config.targetJobCount / 5) + 12),
      );
      const maxAutomaticPageAdvances = Math.min(
        4,
        Math.max(1, Math.ceil(config.targetJobCount / 20) - 1),
      );
      let automaticPageAdvances = 0;
      let batchResultsFullyPaged = false;

      for (let passIndex = 0; passIndex < maxBatchPasses; passIndex += 1) {
        if (signal?.aborted) {
          break;
        }

        const jobsBeforePass = state.collectedJobs.length;
        emitProgress({
          currentUrl: state.currentUrl,
          jobsFound: jobsBeforePass,
          stepCount: 0,
          currentAction: "batch_extract_search_results",
          message: `Collecting visible job cards in batch ${passIndex + 1}/${maxBatchPasses}.`,
          waitReason: "extracting_jobs",
        });
        const extractionResult = await executeToolCall(
          {
            id: `auto_batch_extract_${passIndex + 1}`,
            type: "function",
            function: {
              name: "extract_jobs",
              arguments: JSON.stringify({
                pageType: "search_results",
                maxJobs: Math.max(
                  1,
                  config.targetJobCount - state.collectedJobs.length,
                ),
              }),
            },
          },
          pageRef,
          state,
          config,
          jobExtractor,
          onProgress,
          signal,
        );
        recordExtractionPassSummary(
          summarizeExtractionPassResult(extractionResult),
        );
        // Persist a checkpoint as soon as batch collection keeps jobs so
        // incremental persistence downstream does not have to wait for the
        // first planned step after the batch loop. Checkpoints stay bounded:
        // at most one per batch pass, and only when the pass added jobs.
        if (state.collectedJobs.length > jobsBeforePass) {
          await saveRunCheckpoint();
        }

        if (getThisRunCollectedJobCount() >= config.targetJobCount) {
          console.log(
            `[Agent] Target reached during batch collection: ${state.collectedJobs.length} jobs`,
          );
          return await buildDiscoveryResult({
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings,
          });
        }
        const scrollResult = await executeToolCall(
          {
            id: `auto_batch_scroll_${passIndex + 1}`,
            type: "function",
            function: {
              name: "scroll_down",
              arguments: JSON.stringify({ amount: 1200, delayMs: 900 }),
            },
          },
          pageRef,
          state,
          config,
          jobExtractor,
          onProgress,
          signal,
        );
        const scrollResultRecord =
          scrollResult && typeof scrollResult === "object"
            ? (scrollResult as Record<string, unknown>)
            : null;
        const rawScrollData = scrollResultRecord?.data;
        const scrollData =
          scrollResultRecord?.success === true &&
          rawScrollData &&
          typeof rawScrollData === "object"
            ? (rawScrollData as Record<string, unknown>)
            : null;
        const scrolledPixels =
          typeof scrollData?.scrolledPixels === "number" &&
          Number.isFinite(scrollData.scrolledPixels)
            ? scrollData.scrolledPixels
            : 0;
        const canScrollMore = scrollData?.canScrollMore !== false;
        if (scrolledPixels <= 0 || !canScrollMore) {
          if (automaticPageAdvances >= maxAutomaticPageAdvances) {
            batchResultsFullyPaged = true;
            break;
          }

          let advancedToNextPage = false;
          for (const accessibleName of [
            "View next page",
            "Next page",
            "Next",
          ]) {
            const paginationResult = await executeToolCall(
              {
                id: `auto_batch_next_page_${automaticPageAdvances + 1}_${accessibleName.replace(/\s+/g, "_").toLowerCase()}`,
                type: "function",
                function: {
                  name: "click",
                  arguments: JSON.stringify({
                    role: "button",
                    name: accessibleName,
                    retryIfNotVisible: false,
                  }),
                },
              },
              pageRef,
              state,
              config,
              jobExtractor,
              onProgress,
              signal,
            );
            const paginationResultRecord =
              paginationResult && typeof paginationResult === "object"
                ? (paginationResult as Record<string, unknown>)
                : null;
            if (paginationResultRecord?.success === true) {
              advancedToNextPage = true;
              break;
            }
          }

          if (!advancedToNextPage) {
            batchResultsFullyPaged = true;
            break;
          }

          automaticPageAdvances += 1;
          await executeToolCall(
            {
              id: `auto_batch_next_page_top_${automaticPageAdvances}`,
              type: "function",
              function: {
                name: "scroll_to_top",
                arguments: JSON.stringify({ delayMs: 900 }),
              },
            },
            pageRef,
            state,
            config,
            jobExtractor,
            onProgress,
            signal,
          );
        }
      }

      if (state.deferredSearchExtractions.size > 0) {
        const flushSummary = await flushDeferredSearchExtractions({
          state,
          config,
          jobExtractor,
          emitProgress,
          mode: "batch",
          ...(signal ? { signal } : {}),
        });
        recordExtractionPassSummary(flushSummary);
        // Checkpoint kept jobs in the same turn as their extraction so
        // downstream incremental persistence does not wait for the next
        // planning cycle.
        if (flushSummary.newJobsAdded > 0) {
          await saveRunCheckpoint();
        }
      }

      if (state.collectedJobs.length > 0) {
        appendConversationMessage(state, {
          role: "user",
          content: batchResultsFullyPaged
            ? `Automatic results-surface collection gathered ${state.collectedJobs.length} job cards before AI planning. Scrolling and pagination reached the end of this source: no further result pages were reachable, so do not keep retrying scroll or pagination. Call finish once no additional relevant results remain, or spend steps only on selective detail enrichment when a specific collected card still needs verification.`
            : `Automatic results-surface collection gathered ${state.collectedJobs.length} job cards before AI planning. Continue with pagination, recovery, or selective detail enrichment; do not reopen every collected card one by one.`,
        });
      }
    }

    const emergencyCeiling = config.runControl
      ? Math.max(config.maxSteps, 64)
      : config.maxSteps;
    const timeBudgetMs = Math.max(
      30_000,
      config.runControl?.timeBudgetMs ?? 10 * 60_000,
    );
    const noProgressStepLimit = Math.max(
      3,
      config.runControl?.noProgressStepLimit ?? 8,
    );
    while (state.stepCount < emergencyCeiling && state.isRunning) {
      if (Date.now() - runStartedAtMs >= timeBudgetMs) {
        return await buildDiscoveryResult({
          incomplete: true,
          error:
            "Discovery paused after reaching its elapsed-time budget. Saved jobs and progress remain available for an explicit resume.",
          phaseCompletionMode: requiresExplicitFinish ? "interrupted" : null,
          phaseCompletionReason: requiresExplicitFinish
            ? "Elapsed-time budget reached after saving progress."
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        });
      }
      const lastUsefulProgressStep = requiresExplicitFinish
        ? lastEvidenceGrowthStep
        : lastJobGainStep;
      if (
        state.stepCount > 0 &&
        state.stepCount - lastUsefulProgressStep >= noProgressStepLimit &&
        state.deferredSearchExtractions.size === 0
      ) {
        return await buildDiscoveryResult({
          incomplete: true,
          error:
            "Discovery stopped because repeated actions produced no new jobs, page evidence, or useful state changes.",
          phaseCompletionMode: requiresExplicitFinish ? "interrupted" : null,
          phaseCompletionReason: requiresExplicitFinish
            ? "No measurable progress remained after repeated actions."
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        });
      }
      if (signal?.aborted) {
        return buildAgentResult(state, {
          incomplete: true,
          phaseCompletionMode: requiresExplicitFinish ? "interrupted" : null,
          phaseCompletionReason: requiresExplicitFinish
            ? "The source-debug phase was interrupted before completion."
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        });
      }

      state.stepCount += 1;
      let recoveredClosedPageForLlm = false;

      if (state.stepCount % 10 === 0) {
        console.log(
          `[Agent] Step ${state.stepCount}/${config.maxSteps} | Jobs: ${state.collectedJobs.length}`,
        );
      }

      const seededQueryRecovery = await restoreSeededQuerySurfaceIfNeeded({
        pageRef,
        state,
        config,
      });
      if (seededQueryRecovery) {
        const seededDriftKey = `${seededQueryRecovery.blockedUrl}|${seededQueryRecovery.restoredUrl ?? ""}`;
        const shouldAppendSeededDrift =
          state.lastSeededDrift !== seededDriftKey;
        state.lastSeededDrift = seededDriftKey;
        const blockedUrl = sanitizeUrl(seededQueryRecovery.blockedUrl);
        const restoredUrl = sanitizeUrl(seededQueryRecovery.restoredUrl);
        if (shouldAppendSeededDrift) {
          appendPhaseEvidence(state, "routeSignals", [
            seededQueryRecovery.restoredUrl
              ? blockedUrl && restoredUrl
                ? `Restored the seeded search surface from ${blockedUrl} back to ${restoredUrl} before the next planning turn.`
                : restoredUrl
                  ? `Restored the seeded search surface before the next planning turn: ${restoredUrl}`
                  : null
              : blockedUrl
                ? `Detected a blocked seeded query route before planning but automatic restore failed: ${blockedUrl}`
                : "Detected a blocked seeded query route before planning but automatic restore failed.",
          ]);
          appendConversationMessage(state, {
            role: "user",
            content: seededQueryRecovery.restoredUrl
              ? `${seededQueryRecovery.guardMessage} The browser was automatically restored to the seeded search surface before planning continued. Stay on that seeded search route unless it is clearly broken.`
              : `${seededQueryRecovery.guardMessage} Automatic restore did not succeed yet, so the next action must restore the seeded search surface before any broader exploration.`,
          });
        }
        emitProgress({
          currentUrl:
            seededQueryRecovery.restoredUrl ?? seededQueryRecovery.blockedUrl,
          jobsFound: state.collectedJobs.length,
          stepCount: state.stepCount,
          currentAction: seededQueryRecovery.restoredUrl
            ? "restore_seeded_query_surface"
            : "restore_seeded_query_surface_failed",
          message: seededQueryRecovery.restoredUrl
            ? "Restored the seeded search surface before the next planning turn."
            : "Detected a blocked seeded query route before planning, but automatic restore failed.",
          waitReason: "waiting_on_page",
        });
        if (
          shouldAppendSeededDrift &&
          !maybeCompactConversation(state, config, createUserPrompt)
        ) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }
        if (shouldAppendSeededDrift) {
          recordEvidenceProgress();
        }
      }

      if (!requiresExplicitFinish) {
        const candidateHoldResult = await maybeStopAfterCandidateHold();
        if (candidateHoldResult) {
          return candidateHoldResult;
        }
      }

      if (
        requiresExplicitFinish &&
        !forcedFinishPromptSent &&
        state.stepCount >= Math.max(2, config.maxSteps - 2)
      ) {
        forcedFinishPromptSent = true;
        appendConversationMessage(state, {
          role: "user",
          content: buildForcedFinishPrompt(state, config),
        });
        if (!maybeCompactConversation(state, config, createUserPrompt)) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }
      }

      emitProgress({
        currentUrl: state.currentUrl,
        jobsFound: state.collectedJobs.length,
        stepCount: state.stepCount,
        currentAction: "thinking",
        message: requiresExplicitFinish
          ? `Reviewing source evidence: ${getEvidenceSignalCount(state)} useful signal${getEvidenceSignalCount(state) === 1 ? "" : "s"} recorded.`
          : `Searching this source: ${state.collectedJobs.length} distinct job${state.collectedJobs.length === 1 ? "" : "s"} kept so far.`,
        waitReason: "waiting_on_ai",
      });

      if (
        config.visualAnalysis?.enabled &&
        requiresExplicitFinish &&
        state.stepCount >= 2 &&
        state.visualObservationSets.length === 0 &&
        getNonRouteEvidenceSignalCount(state) === 0
      ) {
        emitProgress({
          currentUrl: state.currentUrl,
          jobsFound: state.collectedJobs.length,
          stepCount: state.stepCount,
          currentAction: "capture_visual_snapshot",
          message:
            "Analyzing a bounded visual snapshot because structured page evidence is weak.",
          waitReason: "analyzing_visual_snapshot",
        });
        const visualResult = await executeToolCall(
          {
            id: `auto_visual_snapshot_${state.stepCount}`,
            type: "function",
            function: {
              name: "capture_visual_snapshot",
              arguments: JSON.stringify({
                purpose: "source_debug",
                mode: "viewport",
                label: "Source-debug weak-signal visual check",
                reason:
                  "Source-debug phase has not produced non-route evidence yet; classify visible page state before continuing.",
              }),
            },
          },
          pageRef,
          state,
          config,
          jobExtractor,
          onProgress,
          signal,
        );
        recordToolEvidence(
          "capture_visual_snapshot",
          {},
          visualResult,
          state,
          config.promptContext.taskPacket?.phase,
        );
        appendConversationMessage(state, {
          role: "user",
          content: `[auto visual snapshot] ${compactToolContent(JSON.stringify(visualResult), getEffectiveCompactionConfig(config).maxToolPayloadChars)}`,
        });
        recordEvidenceProgress();
      }

      let response: {
        content?: string;
        toolCalls?: ToolCall[];
        reasoning?: string;
      };
      try {
        if (shouldFailForContextBudget(state, config)) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }

        response = await getLlmResponse(
          state,
          tools,
          llmClient,
          {
            maxOutputTokens:
              getEffectiveCompactionConfig(config)
                .minimumResponseHeadroomTokens,
          },
          emitProgress,
          signal,
        );
      } catch (llmError) {
        let effectiveLlmError: unknown = llmError;

        if (
          isClosedPageError(effectiveLlmError) &&
          !recoveredClosedPageForLlm
        ) {
          try {
            if (await recoverLivePage("thinking")) {
              recoveredClosedPageForLlm = true;
              continue;
            }
          } catch (resolveError) {
            effectiveLlmError = resolveError;
          }
        }

        if (
          (effectiveLlmError instanceof DOMException &&
            effectiveLlmError.name === "AbortError") ||
          signal?.aborted
        ) {
          throw effectiveLlmError;
        }
        const errorMessage =
          effectiveLlmError instanceof Error
            ? effectiveLlmError.message
            : "Unknown";
        console.error("[Agent] LLM call failed:", errorMessage);

        if (!requiresExplicitFinish && getThisRunCollectedJobCount() > 0) {
          return buildDiscoveryResult({
            incomplete: true,
            warning:
              "Deterministic page discovery kept partial results, but model-assisted expansion was unavailable.",
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings,
          });
        }

        return buildAgentResult(state, {
          error: `LLM call failed after 3 attempts: ${errorMessage}`,
          phaseCompletionMode: requiresExplicitFinish ? "runtime_failed" : null,
          phaseCompletionReason: requiresExplicitFinish
            ? `LLM call failed after 3 attempts: ${errorMessage}`
            : null,
          phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
          debugFindings: pendingDebugFindings,
        });
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        appendConversationMessage(state, {
          role: "assistant",
          content: response.content || "No action taken",
        });
        if (!maybeCompactConversation(state, config, createUserPrompt)) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }

        if (
          !requiresExplicitFinish &&
          state.deferredSearchExtractions.size > 0
        ) {
          const flushSummary = await flushDeferredSearchExtractions({
            state,
            config,
            jobExtractor,
            emitProgress,
            mode: "batch",
            ...(signal ? { signal } : {}),
          });
          recordExtractionPassSummary(flushSummary);
          recordEvidenceProgress();
          if (flushSummary.newJobsAdded > 0) {
            await saveRunCheckpoint();
          }

          if (getThisRunCollectedJobCount() >= config.targetJobCount) {
            console.log(
              `[Agent] Target reached: ${state.collectedJobs.length} jobs`,
            );
            return await buildDiscoveryResult({
              phaseCompletionMode: null,
              phaseCompletionReason: null,
              phaseEvidence: null,
              debugFindings: pendingDebugFindings,
            });
          }

          const yieldExhaustedResult = await maybeStopForYieldAwareExhaustion();
          if (yieldExhaustedResult) {
            return yieldExhaustedResult;
          }

          const stagnantResult = await maybeStopForStagnation();
          if (stagnantResult) {
            return stagnantResult;
          }

          const candidateHoldResult = await maybeStopAfterCandidateHold();
          if (candidateHoldResult) {
            return candidateHoldResult;
          }
        }

        recordEvidenceProgress();
        const earlyForcedFinishTriggered = maybeTriggerEarlyForcedFinish();

        if (
          requiresExplicitFinish &&
          !earlyForcedFinishTriggered &&
          shouldFailForContextBudget(state, config)
        ) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }

        if (!requiresExplicitFinish) {
          const yieldExhaustedResult = await maybeStopForYieldAwareExhaustion();
          if (yieldExhaustedResult) {
            return yieldExhaustedResult;
          }

          const stagnantResult = await maybeStopForStagnation();
          if (stagnantResult) {
            return stagnantResult;
          }

          const candidateHoldResult = await maybeStopAfterCandidateHold();
          if (candidateHoldResult) {
            return candidateHoldResult;
          }
        }

        if (!requiresExplicitFinish && state.stepCount >= config.maxSteps - 5) {
          return await buildDiscoveryResult({
            incomplete: true,
            phaseCompletionMode: null,
            phaseCompletionReason: null,
            phaseEvidence: null,
            debugFindings: pendingDebugFindings,
          });
        }

        if (
          requiresExplicitFinish &&
          forcedFinishPromptSent &&
          !earlyForcedFinishTriggered
        ) {
          break;
        }

        continue;
      }

      appendConversationMessage(state, {
        role: "assistant",
        content: response.content || "",
        toolCalls: response.toolCalls,
      });
      if (!maybeCompactConversation(state, config, createUserPrompt)) {
        return buildContextBudgetFailureResult(
          state,
          requiresExplicitFinish,
          pendingDebugFindings,
        );
      }

      for (const toolCall of response.toolCalls) {
        const knownUrlsBeforeToolCall = new Set(state.visitedUrls);
        const currentUrlBeforeToolCall = state.currentUrl;
        const result = await executeToolCall(
          toolCall,
          pageRef,
          state,
          config,
          jobExtractor,
          onProgress,
          signal,
        );
        recordExtractionPassSummary(summarizeExtractionPassResult(result));

        let parsedArguments: Record<string, unknown> = {};
        try {
          parsedArguments = JSON.parse(
            toolCall.function.arguments || "{}",
          ) as Record<string, unknown>;
        } catch {
          parsedArguments = {};
        }

        recordToolEvidence(
          toolCall.function.name,
          parsedArguments,
          result,
          state,
          config.promptContext.taskPacket?.phase,
        );
        recordEvidenceProgress();
        if (
          !requiresExplicitFinish &&
          ["navigate", "click", "go_back"].includes(toolCall.function.name) &&
          (result as { success?: boolean }).success === true
        ) {
          // Reaching a genuinely new results/detail surface is useful
          // discovery progress even before that surface's extraction occurs,
          // so a bounded number of consecutive new-URL landings reset the
          // stagnation window to keep pagination alive between the click and
          // the next planning/extraction turn. Revisits and repeat attempts
          // to pages this run already landed on are not progress and must
          // not keep resetting stagnation, no-progress, or candidate-hold
          // windows.
          const navigationData = (
            result as {
              data?: {
                navigated?: boolean;
                newUrl?: string;
                url?: string;
                currentUrl?: string;
              };
            }
          ).data;
          const landedUrl =
            navigationData?.newUrl ??
            navigationData?.url ??
            (toolCall.function.name === "go_back"
              ? navigationData?.currentUrl
              : undefined);
          const landedOnNewUrl =
            typeof landedUrl === "string" &&
            landedUrl.length > 0 &&
            landedUrl !== currentUrlBeforeToolCall &&
            !knownUrlsBeforeToolCall.has(landedUrl);
          if (
            landedOnNewUrl &&
            navigationResetsSinceLastJobGain < DISCOVERY_NAVIGATION_RESET_LIMIT
          ) {
            navigationResetsSinceLastJobGain += 1;
            lastJobGainStep = state.stepCount;
          }
        }
        await saveRunCheckpoint();

        if (
          ["navigate", "click", "fill", "select_option", "go_back"].includes(
            toolCall.function.name,
          )
        ) {
          await recoverFrom404LikeSurface(pageRef.current, state);
        }

        const compactResult =
          toolCall.function.name === "extract_jobs"
            ? {
                success: (result as { success?: boolean }).success,
                error: (result as { error?: string }).error,
                summary: (result as { data?: { jobsExtracted?: number } }).data
                  ? `jobs:${(result as { data?: { jobsExtracted?: number } }).data?.jobsExtracted ?? 0}`
                  : undefined,
              }
            : result;
        appendConversationMessage(state, {
          role: "tool",
          toolCallId: toolCall.id,
          content: compactToolContent(
            JSON.stringify(compactResult),
            getEffectiveCompactionConfig(config).maxToolPayloadChars,
          ),
        });
        if (!maybeCompactConversation(state, config, createUserPrompt)) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }

        if (
          toolCall.function.name === "finish" &&
          (result as { success?: boolean }).success === true
        ) {
          pendingDebugFindings =
            (
              result as {
                data?: { debugFindings?: AgentResult["debugFindings"] };
              }
            ).data?.debugFindings ?? pendingDebugFindings;
          console.log(
            `[Agent] Finished: ${state.collectedJobs.length} jobs found`,
          );
          return await buildDiscoveryResult({
            phaseCompletionMode: requiresExplicitFinish
              ? forcedFinishPromptSent
                ? "forced_finish"
                : "structured_finish"
              : null,
            phaseCompletionReason: requiresExplicitFinish
              ? ((result as { data?: { reason?: string } }).data?.reason ??
                null)
              : null,
            phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
            debugFindings: pendingDebugFindings,
          });
        }
      }

      if (
        !requiresExplicitFinish &&
        state.deferredSearchExtractions.size > 0 &&
        (state.deferredSearchExtractions.size >=
          DEFERRED_SEARCH_EXTRACTION_BATCH_SIZE ||
          state.stepCount % DEFERRED_SEARCH_EXTRACTION_FLUSH_STEP_INTERVAL ===
            0 ||
          state.stepCount >= config.maxSteps - 2)
      ) {
        const flushSummary = await flushDeferredSearchExtractions({
          state,
          config,
          jobExtractor,
          emitProgress,
          mode: "batch",
          ...(signal ? { signal } : {}),
        });
        recordExtractionPassSummary(flushSummary);
        recordEvidenceProgress();
        // Checkpoint kept jobs in the same step as their extraction so
        // downstream incremental persistence sees them immediately.
        if (flushSummary.newJobsAdded > 0) {
          await saveRunCheckpoint();
        }
      }

      if (
        !requiresExplicitFinish &&
        getThisRunCollectedJobCount() >= config.targetJobCount
      ) {
        console.log(
          `[Agent] Target reached: ${state.collectedJobs.length} jobs`,
        );
        return await buildDiscoveryResult({
          phaseCompletionMode: null,
          phaseCompletionReason: null,
          phaseEvidence: null,
          debugFindings: pendingDebugFindings,
        });
      }

      if (!requiresExplicitFinish) {
        const yieldExhaustedResult = await maybeStopForYieldAwareExhaustion();
        if (yieldExhaustedResult) {
          return yieldExhaustedResult;
        }

        const stagnantResult = await maybeStopForStagnation();
        if (stagnantResult) {
          return stagnantResult;
        }

        const candidateHoldResult = await maybeStopAfterCandidateHold();
        if (candidateHoldResult) {
          return candidateHoldResult;
        }

        continue;
      }

      const earlyForcedFinishTriggered = maybeTriggerEarlyForcedFinish();

      if (
        !earlyForcedFinishTriggered &&
        shouldFailForContextBudget(state, config)
      ) {
        return buildContextBudgetFailureResult(
          state,
          requiresExplicitFinish,
          pendingDebugFindings,
        );
      }

      if (forcedFinishPromptSent) {
        continue;
      }

      if (!awaitingStructuredFinish) {
        awaitingStructuredFinish = true;
        appendConversationMessage(state, {
          role: "user",
          content:
            "The evidence sampling budget is already satisfied. Do not stop yet unless the phase goal is complete. Either keep probing the missing route/control/detail evidence or call finish with structured site findings, including any reliable controls, tricky filters, navigation rules, and apply caveats you proved.",
        });
        if (!maybeCompactConversation(state, config, createUserPrompt)) {
          return buildContextBudgetFailureResult(
            state,
            requiresExplicitFinish,
            pendingDebugFindings,
          );
        }
      }
    }

    console.log(
      `[Agent] Max steps reached: ${state.collectedJobs.length} jobs`,
    );
    const fallbackDebugFindings =
      pendingDebugFindings ??
      (requiresExplicitFinish ? synthesizeFallbackDebugFindings(state) : null);
    const hasEvidence = hasMeaningfulPhaseEvidence(state);
    return await buildDiscoveryResult({
      incomplete: state.stepCount >= config.maxSteps,
      phaseCompletionMode: requiresExplicitFinish
        ? hasEvidence
          ? "timed_out_with_partial_evidence"
          : "timed_out_without_evidence"
        : null,
      phaseCompletionReason: requiresExplicitFinish
        ? hasEvidence
          ? "The phase timed out before the worker returned a structured finish call."
          : "The phase timed out before the worker produced structured findings or reusable evidence."
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: fallbackDebugFindings,
    });
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      signal?.aborted
    ) {
      throw error;
    }
    console.error(
      "[Agent] Error:",
      error instanceof Error ? error.message : "Unknown",
    );
    return buildAgentResult(state, {
      error: error instanceof Error ? error.message : "Unknown error",
      phaseCompletionMode: requiresExplicitFinish ? "runtime_failed" : null,
      phaseCompletionReason: requiresExplicitFinish
        ? error instanceof Error
          ? error.message
          : "Unknown error"
        : null,
      phaseEvidence: requiresExplicitFinish ? state.phaseEvidence : null,
      debugFindings: pendingDebugFindings,
    });
  } finally {
    state.isRunning = false;
  }
}
