import type { Page } from "playwright";
import type {
  AgentConfig,
  AgentProgress,
  AgentResult,
  AgentState,
  ToolCall,
} from "../types";
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

const DEFERRED_SEARCH_EXTRACTION_BATCH_SIZE = 3;
const DEFERRED_SEARCH_EXTRACTION_FLUSH_STEP_INTERVAL = 10;
const DISCOVERY_STAGNATION_ZERO_YIELD_LIMIT = 3;
const DISCOVERY_STAGNATION_STEP_WINDOW = 8;
const DISCOVERY_CANDIDATE_HOLD_STEP_WINDOW = 4;
const DISCOVERY_CANDIDATE_HOLD_MIN_JOBS = 2;
const DISCOVERY_LATE_STEP_STOP_BUFFER = 3;
const EARLY_FORCED_FINISH_MIN_STEP = 4;
const EARLY_FORCED_FINISH_STALE_STEP_WINDOW = 2;

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
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    failedInteractionAttempts: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: "",
    lastStableUrl: "",
    isRunning: true,
    phaseEvidence: createEmptyPhaseEvidence(),
    compactionState: null,
    compactionStatus: createAgentCompactionStatus(),
  };
  let consecutiveZeroYieldExtractionPasses = 0;
  let lastJobGainStep = 0;
  let lastEvidenceSignalCount = getEvidenceSignalCount(state);
  let lastEvidenceGrowthStep = 0;
  const getAlignedCollectedJobCount = (): number =>
    state.collectedJobs.filter((job) =>
      isJobPreferenceAligned({
        job,
        searchPreferences: config.searchPreferences,
      }),
    ).length;

  const tools = getToolDefinitions();
  const emitProgress = createProgressEmitter(state, config, onProgress);
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
            incomplete: state.collectedJobs.length < config.targetJobCount,
          }
        : partial;

    return buildAgentResult(state, resolvedPartial);
  };
  const maybeStopForStagnation = async (): Promise<AgentResult | null> => {
    if (
      requiresExplicitFinish ||
      state.collectedJobs.length >= config.targetJobCount ||
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
      state.collectedJobs.length >= config.targetJobCount ||
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
      incomplete: state.collectedJobs.length < config.targetJobCount,
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

    while (state.stepCount < config.maxSteps && state.isRunning) {
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
        message: `Planning the next browser action (step ${state.stepCount}/${config.maxSteps}).`,
        waitReason: "waiting_on_ai",
      });

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

          if (state.collectedJobs.length >= config.targetJobCount) {
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
        );
        recordEvidenceProgress();

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
      }

      if (
        !requiresExplicitFinish &&
        state.collectedJobs.length >= config.targetJobCount
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
