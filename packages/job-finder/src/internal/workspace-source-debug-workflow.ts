import {
  type AgentDiscoveryProgress,
  SourceDebugCompactionStateSchema,
  SourceDebugEvidenceRefSchema,
  SourceDebugProgressEventSchema,
  SourceDebugRunRecordSchema,
  SourceDebugWorkerAttemptSchema,
  SourceInstructionArtifactSchema,
  SourceInstructionVerificationSchema,
  type JobDiscoveryTarget,
  type SourceDebugProgressEvent,
  type SourceDebugPhase,
  type SourceInstructionArtifact,
  type SourceDebugWorkerAttempt,
} from "@unemployed/contracts";
import { runSequentialArtifactOrchestrator } from "../orchestrator";
import {
  filterSourceDebugWarnings,
  formatStatusLabel,
  isInternalSourceDebugFailure,
  prefixedLines,
  reviewSourceInstructionArtifactWithAi,
  summarizeApplyPathBehavior,
  summarizeCanonicalUrlBehavior,
  type SourceInstructionFinalReviewPhaseContext,
  warningSuggestsAuthRestriction,
} from "./source-instructions";
import { uniqueStrings } from "./shared";
import {
  buildSourceInstructionVersionInfo,
  resolveActiveSourceInstructionArtifact,
  resolveAdapterKind,
} from "./workspace-helpers";
import { DEFAULT_ROLE, SOURCE_DEBUG_PHASES, discoveryAdapters } from "./workspace-defaults";
import {
  buildSourceDebugPhasePacket,
  buildSourceDebugPhaseSummary,
  classifySourceDebugAttemptOutcome,
  composeSourceDebugInstructions,
  getSourceDebugMaxSteps,
  getSourceDebugTargetJobCount,
  resolveSourceDebugCompletion,
  synthesizeSourceInstructionArtifact,
} from "./workspace-service-helpers";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function normalizeProgressUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function buildSourceDebugProgressEmitter(input: {
  runId: string;
  targetId: string;
  onProgress?: (event: SourceDebugProgressEvent) => void;
}) {
  const startedAtMs = Date.now();
  let lastActivityAt = new Date().toISOString();

  return (eventInput: {
    phase?: SourceDebugPhase | null;
    waitReason: SourceDebugProgressEvent["waitReason"];
    message: string;
    currentUrl?: string | null;
    stepCount?: number;
    jobsFound?: number;
  }) => {
    lastActivityAt = new Date().toISOString();
    const event = SourceDebugProgressEventSchema.parse({
      runId: input.runId,
      targetId: input.targetId,
      phase: eventInput.phase ?? null,
      waitReason: eventInput.waitReason,
      timestamp: lastActivityAt,
      elapsedMs: Date.now() - startedAtMs,
      lastActivityAt,
      message: eventInput.message,
      currentUrl: normalizeProgressUrl(eventInput.currentUrl),
      stepCount: eventInput.stepCount ?? 0,
      jobsFound: eventInput.jobsFound ?? 0,
    });

    input.onProgress?.(event);
    return event;
  };
}

function inferProgressWaitReason(
  progress: Pick<AgentDiscoveryProgress, "currentAction" | "waitReason">,
): SourceDebugProgressEvent["waitReason"] {
  if (progress.waitReason) {
    return progress.waitReason;
  }

  const normalizedAction = (progress.currentAction ?? "").toLowerCase();

  if (!normalizedAction || normalizedAction === "thinking...") {
    return "waiting_on_ai";
  }

  if (normalizedAction === "thinking" || normalizedAction.includes("retrying_ai")) {
    return normalizedAction.includes("retrying_ai")
      ? "retrying_ai"
      : "waiting_on_ai";
  }

  if (
    normalizedAction.startsWith("retry:") ||
    normalizedAction.includes("retrying_tool")
  ) {
    return "retrying_tool";
  }

  if (
    normalizedAction.startsWith("extract_result:") ||
    normalizedAction.includes("extract_jobs")
  ) {
    return "extracting_jobs";
  }

  return "executing_tool";
}

function buildFallbackProgressMessage(
  waitReason: SourceDebugProgressEvent["waitReason"],
  phaseLabel: string,
  jobsFound: number,
  stepCount: number,
): string {
  switch (waitReason) {
    case "waiting_on_ai":
      return `${phaseLabel}: planning the next browser action (step ${stepCount}).`;
    case "retrying_ai":
      return `${phaseLabel}: retrying AI planning after a temporary model error.`;
    case "waiting_on_page":
      return `${phaseLabel}: waiting for the page to settle before continuing.`;
    case "executing_tool":
      return `${phaseLabel}: executing the next browser action.`;
    case "retrying_tool":
      return `${phaseLabel}: retrying the last browser action after a temporary page error.`;
    case "extracting_jobs":
      return `${phaseLabel}: extracting jobs from the current page (${jobsFound} found so far).`;
    case "persisting_results":
      return `${phaseLabel}: saving the findings from this phase.`;
    case "manual_prerequisite":
      return `${phaseLabel}: waiting on a manual browser prerequisite.`;
    case "finalizing":
      return "Finalizing the source-debug run.";
    case "starting_browser":
      return "Starting or attaching the browser profile for source debug.";
    case "attaching_browser":
      return "Preparing the browser tab for the next phase.";
    case "merging_results":
      return `${phaseLabel}: organizing the collected findings.`;
    default:
      return `${phaseLabel}: continuing source debug.`;
  }
}

function summarizeAgentProgressForSourceDebug(
  progress: AgentDiscoveryProgress,
  phase: SourceDebugPhase,
): {
  waitReason: SourceDebugProgressEvent["waitReason"];
  message: string;
} {
  const phaseLabel = formatStatusLabel(phase);
  const waitReason = inferProgressWaitReason(progress);
  const message =
    progress.message?.trim() ||
    buildFallbackProgressMessage(
      waitReason,
      phaseLabel,
      progress.jobsFound,
      progress.stepCount,
    );

  return {
    waitReason,
    message:
      message.toLowerCase().startsWith(phaseLabel.toLowerCase()) ||
      waitReason === "starting_browser" ||
      waitReason === "attaching_browser" ||
      waitReason === "finalizing"
        ? message
        : `${phaseLabel}: ${message}`,
  };
}

export async function runSourceDebugWorkflow(
  ctx: WorkspaceServiceContext,
  targetId: string,
  signal?: AbortSignal,
  options?: {
    clearExistingInstructions?: boolean;
    reviewInstructionId?: string | null;
  },
  onProgress?: (event: SourceDebugProgressEvent) => void,
) {
  if (ctx.activeSourceDebugAbortControllerRef.current) {
    throw new Error(
      "A source-debug run is already in progress. Cancel it before starting another run.",
    );
  }

  const executionController = new AbortController();
  ctx.activeSourceDebugAbortControllerRef.current = executionController;
  const onExternalAbort = () => executionController.abort();
  signal?.addEventListener("abort", onExternalAbort);
  const executionSignal = executionController.signal;
  const [profile, searchPreferences] = await Promise.all([
    ctx.repository.getProfile(),
    ctx.repository.getSearchPreferences(),
  ]);
  const target = searchPreferences.discovery.targets.find(
    (entry) => entry.id === targetId,
  );

  if (!target) {
    throw new Error(`Unknown discovery target '${targetId}'.`);
  }

  const targetUrl = (() => {
    try {
      return new URL(target.startingUrl);
    } catch {
      return null;
    }
  })();

  if (!targetUrl) {
    throw new Error(`Target '${target.label}' does not have a valid starting URL.`);
  }

  const clearExistingInstructions = options?.clearExistingInstructions !== false;

  if (clearExistingInstructions) {
    await ctx.repository.deleteSourceInstructionArtifactsForTarget(target.id);
    await ctx.saveDiscoveryTargetUpdate(target.id, (currentTarget) => ({
      ...currentTarget,
      instructionStatus: "missing",
      validatedInstructionId: null,
      draftInstructionId: null,
      lastVerifiedAt: null,
      staleReason: null,
    }));
  }

  const normalizedTarget: JobDiscoveryTarget = clearExistingInstructions
    ? {
        ...target,
        instructionStatus: "missing",
        validatedInstructionId: null,
        draftInstructionId: null,
        lastVerifiedAt: null,
        staleReason: null,
      }
    : target;
  const instructionArtifacts = await ctx.repository.listSourceInstructionArtifacts();
  const reviewInstructionArtifact = options?.reviewInstructionId
    ? (instructionArtifacts.find(
        (artifact) =>
          artifact.id === options.reviewInstructionId &&
          artifact.targetId === normalizedTarget.id,
      ) ?? null)
    : null;

  if (options?.reviewInstructionId && !reviewInstructionArtifact) {
    throw new Error(
      `Source instruction '${options.reviewInstructionId}' does not belong to target '${normalizedTarget.id}'.`,
    );
  }

  const adapterKind = resolveAdapterKind(normalizedTarget);
  const adapter = discoveryAdapters[adapterKind];
  const runId = `source_debug_${normalizedTarget.id}_${Date.now()}`;
  const emitProgress = buildSourceDebugProgressEmitter({
    runId,
    targetId: normalizedTarget.id,
    ...(onProgress ? { onProgress } : {}),
  });
  ctx.activeSourceDebugExecutionIdRef.current = runId;

  let run = SourceDebugRunRecordSchema.parse({
    id: runId,
    targetId: normalizedTarget.id,
    state: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    activePhase: SOURCE_DEBUG_PHASES[0],
    phases: SOURCE_DEBUG_PHASES,
    targetLabel: normalizedTarget.label,
    targetUrl: normalizedTarget.startingUrl,
    targetHostname: targetUrl.hostname,
    manualPrerequisiteSummary: null,
    finalSummary: null,
    attemptIds: [],
    phaseSummaries: [],
    instructionArtifactId:
      reviewInstructionArtifact?.id ??
      normalizedTarget.draftInstructionId ??
      normalizedTarget.validatedInstructionId ??
      null,
  });

  await ctx.persistSourceDebugRun(run);
  await ctx.saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
    ...currentTarget,
    lastDebugRunId: run.id,
  }));

  const attempts: SourceDebugWorkerAttempt[] = [];
  const strategyFingerprints: string[] = [];
  const finalReviewContextsByAttemptId = new Map<
    string,
    SourceInstructionFinalReviewPhaseContext
  >();
  let synthesizedInstruction: SourceInstructionArtifact | null =
    reviewInstructionArtifact ??
    resolveActiveSourceInstructionArtifact(normalizedTarget, instructionArtifacts);
  let browserSessionOpened = false;

  try {
    emitProgress({
      waitReason: "starting_browser",
      message: `Starting or attaching the browser profile for ${normalizedTarget.label}.`,
      currentUrl: normalizedTarget.startingUrl,
    });
    await ctx.openRunBrowserSession(adapterKind);
    browserSessionOpened = true;
    await runSequentialArtifactOrchestrator<SourceDebugPhase, SourceDebugWorkerAttempt>({
      phases: SOURCE_DEBUG_PHASES,
      beforePhase: async (phase) => {
        if (executionSignal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        run = SourceDebugRunRecordSchema.parse({
          ...run,
          activePhase: phase,
          updatedAt: new Date().toISOString(),
        });
        await ctx.persistSourceDebugRun(run);
        emitProgress({
          phase,
          waitReason: "waiting_on_ai",
          message: `${formatStatusLabel(phase)} started. Waiting on AI to choose the next browser action.`,
          currentUrl: normalizedTarget.startingUrl,
        });
      },
      executePhase: async (phase, index) => {
        const phasePacket = buildSourceDebugPhasePacket(
          phase,
          run.phaseSummaries,
          strategyFingerprints,
          run.manualPrerequisiteSummary,
        );
        const strategyFingerprint = `${phase}:${adapterKind}:${phasePacket.strategyLabel?.toLowerCase() ?? "default"}`;
        strategyFingerprints.push(strategyFingerprint);
        const phaseInstructionArtifact =
          phase === "replay_verification"
            ? (reviewInstructionArtifact ?? synthesizedInstruction)
            : null;
        const nextPhase = SOURCE_DEBUG_PHASES[index + 1] ?? null;
        const debugResult = await ctx.browserRuntime.runAgentDiscovery?.(adapterKind, {
          userProfile: profile,
          searchPreferences: {
            targetRoles:
              searchPreferences.targetRoles.length > 0
                ? searchPreferences.targetRoles
                : [DEFAULT_ROLE],
            locations: searchPreferences.locations,
          },
          targetJobCount: getSourceDebugTargetJobCount(phase),
          maxSteps: getSourceDebugMaxSteps(phase),
          startingUrls: [normalizedTarget.startingUrl],
          siteLabel: `${normalizedTarget.label} ${formatStatusLabel(phase)}`,
          navigationHostnames: [targetUrl.hostname],
          siteInstructions: composeSourceDebugInstructions(
            normalizedTarget,
            adapter,
            phase,
            phaseInstructionArtifact,
            phasePacket,
          ),
          toolUsageNotes: uniqueStrings([
            ...adapter.toolUsageNotes,
            "Prefer concise, high-confidence evidence over broad exploration.",
            "Stop when the phase goal has been proven or blocked.",
          ]),
          taskPacket: phasePacket,
          compaction: {
            maxTranscriptMessages: 16,
            preserveRecentMessages: 6,
            maxToolPayloadChars: 180,
          },
          relevantUrlSubstrings: adapter.relevantUrlSubstrings,
          experimental: adapter.experimental,
          skipSessionValidation: true,
          aiClient: ctx.aiClient,
          signal: executionSignal,
          onProgress: (progress) => {
            const summary = summarizeAgentProgressForSourceDebug(progress, phase);
            emitProgress({
              phase,
              waitReason: summary.waitReason,
              message: summary.message,
              currentUrl: progress.currentUrl,
              stepCount: progress.stepCount,
              jobsFound: progress.jobsFound,
            });
          },
        });

        if (!debugResult) {
          throw new Error(
            "Browser runtime does not support agent discovery for source debugging.",
          );
        }

        const outcome = classifySourceDebugAttemptOutcome(debugResult, phase);
        const completion = resolveSourceDebugCompletion(debugResult);
        const attemptId = `source_debug_attempt_${phase}_${Date.now()}`;
        emitProgress({
          phase,
          waitReason: "persisting_results",
          message: `Saving the findings from ${formatStatusLabel(phase)}.`,
          currentUrl: debugResult.jobs[0]?.canonicalUrl ?? normalizedTarget.startingUrl,
          stepCount: debugResult.agentMetadata?.steps ?? 0,
          jobsFound: debugResult.jobs.length,
        });
        const evidenceRefs = [
          SourceDebugEvidenceRefSchema.parse({
            id: `${attemptId}_start`,
            runId: run.id,
            attemptId,
            targetId: normalizedTarget.id,
            phase,
            kind: "url",
            label: "Starting URL",
            capturedAt: new Date().toISOString(),
            url: normalizedTarget.startingUrl,
            storagePath: null,
            excerpt: debugResult.warning ?? null,
          }),
          ...debugResult.jobs.slice(0, 3).map((job, evidenceIndex) =>
            SourceDebugEvidenceRefSchema.parse({
              id: `${attemptId}_job_${evidenceIndex + 1}`,
              runId: run.id,
              attemptId,
              targetId: normalizedTarget.id,
              phase,
              kind: "url",
              label: `${job.title} at ${job.company}`,
              capturedAt: new Date().toISOString(),
              url: job.canonicalUrl,
              storagePath: null,
              excerpt: job.summary ?? job.description ?? null,
            }),
          ),
        ];

        for (const evidenceRef of evidenceRefs) {
          await ctx.repository.upsertSourceDebugEvidenceRef(evidenceRef);
        }

        const applyReadyCount = debugResult.jobs.filter(
          (job) => job.applyPath !== "unknown" || job.easyApplyEligible,
        ).length;
        const debugFindings = debugResult.agentMetadata?.debugFindings ?? null;
        const hostname = new URL(normalizedTarget.startingUrl).hostname;
        const canonicalUrlBehavior =
          phase === "job_detail_validation" || phase === "replay_verification"
            ? summarizeCanonicalUrlBehavior(debugResult.jobs, hostname)
            : [];
        const applyPathBehavior =
          phase === "apply_path_validation" &&
          !warningSuggestsAuthRestriction(debugResult.warning)
            ? summarizeApplyPathBehavior(debugResult.jobs)
            : [];
        const confirmedFacts = uniqueStrings([
          ...(debugFindings?.summary ? [debugFindings.summary] : []),
          ...prefixedLines("Reliable control: ", debugFindings?.reliableControls ?? []),
          ...prefixedLines("Filter note: ", debugFindings?.trickyFilters ?? []),
          ...prefixedLines("Navigation note: ", debugFindings?.navigationTips ?? []),
          ...prefixedLines("Apply note: ", debugFindings?.applyTips ?? []),
          ...canonicalUrlBehavior,
          ...applyPathBehavior,
          ...filterSourceDebugWarnings(debugFindings?.warnings ?? []),
          ...filterSourceDebugWarnings([debugResult.warning]),
        ]);

        const artifact = SourceDebugWorkerAttemptSchema.parse({
          id: attemptId,
          runId: run.id,
          targetId: normalizedTarget.id,
          phase,
          startedAt: debugResult.startedAt,
          completedAt: debugResult.completedAt,
          outcome,
          completionMode: completion.completionMode,
          completionReason: completion.completionReason,
          strategyLabel: phasePacket.strategyLabel ?? formatStatusLabel(phase),
          strategyFingerprint,
          confirmedFacts,
          attemptedActions: uniqueStrings([
            `Started from ${normalizedTarget.startingUrl}.`,
            ...(phase === "apply_path_validation"
              ? [
                  "Inspected discovered jobs for apply entry points without submitting an application.",
                ]
              : []),
            ...(completion.phaseEvidence?.attemptedControls ?? []),
            ...prefixedLines(
              "Validated behavior: ",
              debugFindings?.reliableControls ?? [],
            ),
            ...prefixedLines(
              "Validated navigation: ",
              debugFindings?.navigationTips ?? [],
            ),
          ]),
          blockerSummary: isInternalSourceDebugFailure(debugResult.warning)
            ? null
            : (debugResult.warning ??
              (completion.completionMode !== "structured_finish" &&
              completion.completionMode !== "forced_finish"
                ? completion.completionReason
                : null)),
          resultSummary: debugFindings?.summary
            ? debugFindings.summary
            : phase === "replay_verification"
              ? debugResult.jobs.length > 0
                ? `Replay verification reached ${debugResult.jobs.length} job result${debugResult.jobs.length === 1 ? "" : "s"} again.`
                : isInternalSourceDebugFailure(debugResult.warning)
                  ? "Replay verification did not complete because the agent runtime failed."
                  : (debugResult.warning ??
                    "Replay verification did not reproduce the expected path.")
              : phase === "apply_path_validation"
                ? applyReadyCount > 0
                  ? `Apply path validation confirmed reusable apply guidance on ${applyReadyCount} job${applyReadyCount === 1 ? "" : "s"} without submitting.`
                  : isInternalSourceDebugFailure(debugResult.warning)
                    ? "Apply path validation did not complete because the agent runtime failed."
                    : (debugResult.warning ??
                      "Apply path validation did not confirm a reusable apply path.")
                : debugResult.jobs.length > 0
                  ? `${formatStatusLabel(phase)} found ${debugResult.jobs.length} credible job result${debugResult.jobs.length === 1 ? "" : "s"}.`
                  : isInternalSourceDebugFailure(debugResult.warning)
                    ? `${formatStatusLabel(phase)} did not complete because the agent runtime failed.`
                    : (debugResult.warning ??
                      `${formatStatusLabel(phase)} produced no reusable evidence.`),
          confidenceScore:
            phase === "apply_path_validation"
              ? applyReadyCount > 0
                ? 76
                : 42
              : debugResult.jobs.length > 0
                ? 80
                : 45,
          nextRecommendedStrategies:
            phase === "replay_verification"
              ? []
              : nextPhase
                ? [formatStatusLabel(nextPhase)]
                : [],
          avoidStrategyFingerprints: [strategyFingerprint],
          evidenceRefIds: evidenceRefs.map((evidenceRef) => evidenceRef.id),
          phaseEvidence: completion.phaseEvidence,
          compactionState: debugResult.agentMetadata?.compactionState
            ? SourceDebugCompactionStateSchema.parse(
                debugResult.agentMetadata.compactionState,
              )
            : null,
        });

        finalReviewContextsByAttemptId.set(artifact.id, {
          phase,
          phaseGoal: phasePacket.phaseGoal,
          successCriteria: [...phasePacket.successCriteria],
          stopConditions: [...phasePacket.stopConditions],
          knownFactsAtStart: [...phasePacket.knownFacts],
          startedAt: artifact.startedAt,
          completedAt: artifact.completedAt,
          outcome: artifact.outcome,
          completionMode: artifact.completionMode,
          completionReason: artifact.completionReason,
          resultSummary: artifact.resultSummary,
          blockerSummary: artifact.blockerSummary,
          confirmedFacts: [...artifact.confirmedFacts],
          attemptedActions: [...artifact.attemptedActions],
          phaseEvidence: artifact.phaseEvidence,
          compactionState: artifact.compactionState,
          reviewTranscript: [...(debugResult.agentMetadata?.reviewTranscript ?? [])],
        });

        return {
          artifact,
          stop: outcome === "blocked_auth" || outcome === "blocked_manual_step",
        };
      },
      afterPhase: async (phase, _index, attempt) => {
        if (!attempt) {
          return;
        }

        await ctx.repository.upsertSourceDebugAttempt(attempt);
        attempts.push(attempt);
        const phaseSummary = buildSourceDebugPhaseSummary(attempt);

        if (
          attempt.outcome === "blocked_auth" ||
          attempt.outcome === "blocked_manual_step"
        ) {
          run = SourceDebugRunRecordSchema.parse({
            ...run,
            state: "paused_manual",
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            manualPrerequisiteSummary: attempt.blockerSummary,
            finalSummary: attempt.resultSummary,
            attemptIds: [...run.attemptIds, attempt.id],
            phaseSummaries: [...run.phaseSummaries, phaseSummary],
          });
          await ctx.persistSourceDebugRun(run);
          await ctx.saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
            ...currentTarget,
            instructionStatus: currentTarget.validatedInstructionId
              ? currentTarget.instructionStatus
              : "missing",
            lastDebugRunId: run.id,
          }));
          emitProgress({
            phase,
            waitReason: "manual_prerequisite",
            message:
              attempt.blockerSummary ??
              `${formatStatusLabel(phase)} is paused until a manual browser step is completed.`,
            currentUrl: normalizedTarget.startingUrl,
          });
          return;
        }

        run = SourceDebugRunRecordSchema.parse({
          ...run,
          updatedAt: new Date().toISOString(),
          attemptIds: [...run.attemptIds, attempt.id],
          phaseSummaries: [...run.phaseSummaries, phaseSummary],
        });

        if (phase !== "replay_verification") {
          const nextSynthesizedInstruction = synthesizeSourceInstructionArtifact(
            normalizedTarget,
            run,
            attempts,
            adapterKind,
            null,
          );
          synthesizedInstruction = nextSynthesizedInstruction;

          if (!reviewInstructionArtifact) {
            run = SourceDebugRunRecordSchema.parse({
              ...run,
              instructionArtifactId: nextSynthesizedInstruction.id,
            });
            await ctx.repository.upsertSourceInstructionArtifact(
              nextSynthesizedInstruction,
            );
            await ctx.saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
              ...currentTarget,
              draftInstructionId: nextSynthesizedInstruction.id,
              instructionStatus: nextSynthesizedInstruction.status,
              lastDebugRunId: run.id,
            }));
          }
        }

        await ctx.persistSourceDebugRun(run);
      },
    });

    if (run.state === "paused_manual") {
      return ctx.getWorkspaceSnapshot();
    }

    const verification = SourceInstructionVerificationSchema.parse({
      id: `source_instruction_verification_${run.id}`,
      replayRunId: run.id,
      verifiedAt: new Date().toISOString(),
      outcome: attempts.some(
        (attempt) =>
          attempt.phase === "replay_verification" && attempt.outcome === "succeeded",
      )
        ? "passed"
        : "failed",
      proofSummary:
        attempts.find((attempt) => attempt.phase === "replay_verification")
          ?.resultSummary ?? null,
      reason:
        attempts.find((attempt) => attempt.phase === "replay_verification")
          ?.blockerSummary ?? null,
      versionInfo: buildSourceInstructionVersionInfo(adapterKind),
    });

    const heuristicFinalizedInstruction = synthesizeSourceInstructionArtifact(
      normalizedTarget,
      run,
      attempts,
      adapterKind,
      verification,
    );
    emitProgress({
      waitReason: "waiting_on_ai",
      message:
        "Reviewing the collected evidence and organizing the final source instructions.",
      currentUrl: normalizedTarget.startingUrl,
      jobsFound: attempts.filter((attempt) => attempt.outcome === "succeeded").length,
    });
    const reviewOverride = await reviewSourceInstructionArtifactWithAi({
      aiClient: ctx.aiClient,
      target: normalizedTarget,
      run,
      adapterKind,
      verification,
      instructionUnderReview: reviewInstructionArtifact,
      heuristicInstruction: heuristicFinalizedInstruction,
      phaseContexts: attempts.flatMap((attempt) => {
        const context = finalReviewContextsByAttemptId.get(attempt.id);
        return context ? [context] : [];
      }),
      signal: executionSignal,
    });
    const finalizedInstruction = reviewOverride
      ? synthesizeSourceInstructionArtifact(
          normalizedTarget,
          run,
          attempts,
          adapterKind,
          verification,
          reviewOverride,
        )
      : heuristicFinalizedInstruction;
    const preserveExistingValidatedInstruction =
      reviewInstructionArtifact?.status === "validated" &&
      verification.outcome !== "passed";
    const shouldCreateSuccessorArtifact = Boolean(reviewInstructionArtifact);
    const instructionToPersist = shouldCreateSuccessorArtifact
      ? SourceInstructionArtifactSchema.parse({
          ...finalizedInstruction,
          id: `source_instruction_${normalizedTarget.id}_${Date.now()}`,
          status: preserveExistingValidatedInstruction
            ? "draft"
            : finalizedInstruction.status,
          acceptedAt: preserveExistingValidatedInstruction
            ? null
            : finalizedInstruction.acceptedAt,
          updatedAt: new Date().toISOString(),
        })
      : finalizedInstruction;
    emitProgress({
      waitReason: "finalizing",
      message: "Saving the final source instructions and verification result.",
      currentUrl: normalizedTarget.startingUrl,
      jobsFound: attempts.filter((attempt) => attempt.outcome === "succeeded").length,
    });
    await ctx.repository.upsertSourceInstructionArtifact(instructionToPersist);
    run = SourceDebugRunRecordSchema.parse({
      ...run,
      state: verification.outcome === "passed" ? "completed" : "failed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      activePhase: null,
      finalSummary: verification.proofSummary ?? "Source debug workflow completed.",
      instructionArtifactId: instructionToPersist.id,
    });
    await ctx.persistSourceDebugRun(run);
    await ctx.saveDiscoveryTargetUpdate(normalizedTarget.id, (currentTarget) => ({
      ...currentTarget,
      instructionStatus: preserveExistingValidatedInstruction
        ? currentTarget.validatedInstructionId
          ? "validated"
          : instructionToPersist.status
        : instructionToPersist.status,
      draftInstructionId:
        preserveExistingValidatedInstruction ||
        instructionToPersist.status !== "validated"
          ? instructionToPersist.id
          : null,
      validatedInstructionId:
        instructionToPersist.status === "validated"
          ? instructionToPersist.id
          : currentTarget.validatedInstructionId,
      lastDebugRunId: run.id,
      lastVerifiedAt: verification.verifiedAt,
      staleReason: verification.outcome === "passed" ? null : verification.reason,
    }));
  } catch (error) {
    const interrupted = error instanceof DOMException && error.name === "AbortError";
    run = SourceDebugRunRecordSchema.parse({
      ...run,
      state: interrupted ? "cancelled" : "failed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      activePhase: null,
      finalSummary: interrupted
        ? "Source debug run was interrupted before completion."
        : `Source debug run failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    await ctx.persistSourceDebugRun(run);
    if (!interrupted) {
      throw error;
    }
  } finally {
    if (browserSessionOpened) {
      await ctx.closeRunBrowserSession(adapterKind).catch(() => {});
    }
    signal?.removeEventListener("abort", onExternalAbort);
    ctx.activeSourceDebugExecutionIdRef.current = null;
    ctx.activeSourceDebugAbortControllerRef.current = null;
  }

  return ctx.getWorkspaceSnapshot();
}
