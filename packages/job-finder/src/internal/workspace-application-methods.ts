import {
  ApplyJobResultSchema,
  ApplyRunSchema,
  ApplySubmitApprovalSchema,
  ApplicationConsentRequestSchema,
  ApplicationAttemptConsentDecisionSchema,
  ApplicationAttemptQuestionSchema,
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  ResumeAssistantMessageSchema,
  type ResumeDraft,
  ResumeDraftPatchSchema,
  ResumeDraftSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplyExecutionResult,
  type JobSource,
} from "@unemployed/contracts";
import {
  buildApplyCopilotArtifacts,
  buildSingleJobAutoApplyArtifacts,
  buildMissingResumeCopilotArtifacts,
  mapExecutionResultToApplyBlockerReason,
  mapExecutionResultToApplyJobState,
  mapExecutionResultToApplyRunState,
} from "./workspace-apply-run-support";
import { mergeSavedJobs } from "./workspace-service-helpers";
import { markSavedJobStatusInLedger } from "./workspace-discovery-ledger";
import {
  buildConsentSummary,
  buildEvidenceRefIdsFromInstruction,
  buildLatestBlockerSummary,
  buildQuestionSummary,
  buildReplaySummary,
  mergeAttemptBlocker,
  mergeAttemptReplay,
} from "./workspace-application-attempt-support";
import { buildInstructionGuidance, mergeEvents, nextAssetVersion, nextJobStatusFromAttempt, resolveActiveSourceInstructionArtifact, toApplicationEvents } from "./workspace-helpers";
import { createUniqueId, normalizeText, uniqueStrings } from "./shared";
import {
  applyPatchToResumeDraft,
  buildAssistantReplyMessage,
  buildResumeDraftFromTailoredDraft,
  buildResumeDraftRevision,
  buildResumeExportArtifact,
  buildResumeRenderDocument,
  buildTailoredResumeTextFromResumeDraft,
  buildTailoredAssetBridge,
  collectResearchContext,
  collectResumeWorkspaceEvidence,
  sanitizeResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import {
  buildResumeWorkspace,
  ensureResumeDraft,
  fetchAndPersistResearch,
  renderDraftToPdf,
} from "./workspace-application-resume-support";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

function buildRecoveryInstructions(input: {
  blockerSummary: string | null;
  latestCheckpointDetail: string | null;
  latestCheckpointLabel: string | null;
  latestCheckpointUrl: string | null;
}) {
  return uniqueStrings(
    [
      input.latestCheckpointLabel
        ? `Recovery checkpoint: ${input.latestCheckpointLabel}.`
        : null,
      input.latestCheckpointDetail
        ? `Recovery detail: ${input.latestCheckpointDetail}`
        : null,
      input.latestCheckpointUrl
        ? `Return to the last retained apply URL when it still matches the current flow: ${input.latestCheckpointUrl}`
        : null,
      input.blockerSummary
        ? `Recovery goal: avoid the previously retained blocker if the current page still presents the same branch. ${input.blockerSummary}`
        : null,
    ].filter((value): value is string => Boolean(value && value.trim().length > 0)),
  );
}

function createMonotonicTimestamp(previousIso: string | null | undefined): string {
  const now = Date.now();
  const parsedPrevious = previousIso ? new Date(previousIso).getTime() : Number.NaN;
  const previous = Number.isNaN(parsedPrevious) ? now : parsedPrevious + 1;
  return new Date(Math.max(now, previous)).toISOString();
}

export function createWorkspaceApplicationMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "queueJobForReview"
  | "dismissDiscoveryJob"
  | "generateResume"
  | "getResumeWorkspace"
  | "saveResumeDraft"
  | "regenerateResumeDraft"
  | "regenerateResumeSection"
  | "exportResumePdf"
  | "approveResume"
  | "clearResumeApproval"
  | "applyResumePatch"
  | "getResumeAssistantMessages"
  | "sendResumeAssistantMessage"
  | "startApplyCopilotRun"
  | "startAutoApplyRun"
  | "startAutoApplyQueueRun"
  | "approveApplyRun"
  | "cancelApplyRun"
  | "resolveApplyConsentRequest"
  | "revokeApplyRunApproval"
  | "approveApply"
> {
  function hasLockedResumeContent(draft: ResumeDraft): boolean {
    return draft.sections.some(
      (section) =>
        section.locked ||
        section.bullets.some((bullet) => bullet.locked) ||
        section.entries.some(
          (entry) =>
            entry.locked || entry.bullets.some((bullet) => bullet.locked),
        ),
    );
  }

  async function resolveJobApplyPrerequisites(jobId: string) {
    const [savedJobs, tailoredAssets, draft, approvedExports] = await Promise.all([
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.getResumeDraftByJobId(jobId),
      ctx.repository.listResumeExportArtifacts({ jobId }),
    ]);
    const job = savedJobs.find((entry) => entry.id === jobId) ?? null;

    if (!job) {
      throw new Error(`Unable to start automatic apply for unknown job '${jobId}'.`);
    }

    const approvedExport = draft?.approvedExportId
      ? (approvedExports.find((entry) => entry.id === draft.approvedExportId) ?? null)
      : null;
    const asset = tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;

    if (!draft || draft.status !== "approved" || !approvedExport) {
      throw new Error(
        `An approved tailored PDF is required before staging automatic apply for '${job.title}'.`,
      );
    }

    if (ctx.exportFileVerifier) {
      const approvedFileExists = await ctx.exportFileVerifier.exists(
        approvedExport.filePath,
      );

      if (!approvedFileExists) {
        throw new Error(
          `The approved tailored PDF is missing on disk for '${job.title}'. Re-export and approve the resume again before staging automatic apply.`,
        );
      }
    }

    if (!asset || asset.status !== "ready" || asset.storagePath !== approvedExport.filePath) {
      throw new Error(
        `A ready approved tailored resume is required before staging automatic apply for '${job.title}'.`,
      );
    }

    return {
      approvedExport,
      asset,
      job,
    };
  }

  async function syncRunApplicationRecord(input: {
    eventDetail: string;
    eventEmphasis: "neutral" | "positive" | "warning" | "critical";
    eventId: string;
    eventTitle: string;
    jobId: string;
    lastActionLabel: string;
    nextActionLabel: string | null;
    updatedAt: string;
  }) {
    const [applicationRecords, savedJobs] = await Promise.all([
      ctx.repository.listApplicationRecords(),
      ctx.repository.listSavedJobs(),
    ]);
    const job = savedJobs.find((entry) => entry.id === input.jobId) ?? null;

    if (!job) {
      return;
    }

    const existingRecord = applicationRecords.find(
      (record) => record.jobId === input.jobId,
    );
    const nextRecord = ApplicationRecordSchema.parse({
      id: existingRecord?.id ?? `application_${input.jobId}`,
      jobId: input.jobId,
      title: job.title,
      company: job.company,
      status: existingRecord?.status ?? job.status,
      lastActionLabel: input.lastActionLabel,
      nextActionLabel: input.nextActionLabel,
      lastUpdatedAt: input.updatedAt,
      lastAttemptState: existingRecord?.lastAttemptState ?? null,
      questionSummary: existingRecord?.questionSummary,
      latestBlocker: existingRecord?.latestBlocker ?? null,
      consentSummary: existingRecord?.consentSummary,
      replaySummary: existingRecord?.replaySummary,
      events: mergeEvents(existingRecord?.events ?? [], [
        {
          id: input.eventId,
          at: input.updatedAt,
          title: input.eventTitle,
          detail: input.eventDetail,
          emphasis: input.eventEmphasis,
        },
      ]),
    });

    await ctx.repository.upsertApplicationRecord(nextRecord);
  }

  async function buildApplyRecoveryContext(jobId: string) {
    const [runs, results, checkpoints] = await Promise.all([
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults(),
      ctx.repository.listApplicationReplayCheckpoints({ jobId }),
    ]);
    const latestResult = results.find((entry) => entry.jobId === jobId) ?? null;

    if (!latestResult) {
      return {
        recoveryContext: null,
        recoveryInstructions: [] as string[],
      };
    }

    const previousRun = runs.find((entry) => entry.id === latestResult.runId) ?? null;
    if (!previousRun) {
      return {
        recoveryContext: null,
        recoveryInstructions: [] as string[],
      };
    }

    const latestCheckpoint = checkpoints[0] ?? null;
    const checkpointUrls = uniqueStrings(
      checkpoints
        .map((checkpoint) => checkpoint.url)
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0),
    );

    return {
      recoveryContext: {
        previousRunId: previousRun.id,
        previousResultId: latestResult.id,
        previousRunMode: previousRun.mode,
        previousRunState: previousRun.state,
        latestCheckpoint: latestCheckpoint
          ? {
              label: latestCheckpoint.label,
              detail: latestCheckpoint.detail,
              url: latestCheckpoint.url,
              jobState: latestCheckpoint.jobState,
              createdAt: latestCheckpoint.createdAt,
            }
          : null,
        checkpointUrls,
        blockerSummary: latestResult.blockerSummary,
      },
      recoveryInstructions: buildRecoveryInstructions({
        blockerSummary: latestResult.blockerSummary,
        latestCheckpointDetail: latestCheckpoint?.detail ?? null,
        latestCheckpointLabel: latestCheckpoint?.label ?? null,
        latestCheckpointUrl: latestCheckpoint?.url ?? null,
      }),
    };
  }

  async function executeSafeApplyRun(input: {
    mode: "single_job_auto" | "queue_auto";
    runId: string;
  }): Promise<void> {
    const [
      profile,
      searchPreferences,
      settings,
      sourceInstructionArtifacts,
      sourceDebugAttempts,
      runs,
      results,
      approvals,
      questionRecords,
      answerRecords,
      artifactRefs,
      checkpoints,
      consentRequests,
    ] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.getSettings(),
      ctx.repository.listSourceInstructionArtifacts(),
      ctx.repository.listSourceDebugAttempts(),
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults(),
      ctx.repository.listApplySubmitApprovals(),
      ctx.repository.listApplicationQuestionRecords(),
      ctx.repository.listApplicationAnswerRecords(),
      ctx.repository.listApplicationArtifactRefs(),
      ctx.repository.listApplicationReplayCheckpoints(),
      ctx.repository.listApplicationConsentRequests(),
    ]);
    const run = runs.find((entry) => entry.id === input.runId) ?? null;

    if (!run) {
      throw new Error(`Unknown apply run '${input.runId}'.`);
    }

    if (run.mode !== input.mode) {
      throw new Error(`Apply run '${input.runId}' is not a ${input.mode} run.`);
    }

    if (!run.submitApprovalId) {
      throw new Error(`Apply run '${input.runId}' does not have a submit approval record.`);
    }

    const approval = approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

    if (!approval || approval.status !== "approved") {
      throw new Error(`Apply run '${input.runId}' must be approved before it can execute.`);
    }

    if (!ctx.browserRuntime.executeApplicationFlow) {
      throw new Error(
        "The current browser runtime does not support staged apply execution.",
      );
    }

    let currentRunState: ReturnType<typeof ApplyRunSchema.parse> = ApplyRunSchema.parse({
      ...run,
      state: "running",
      updatedAt: new Date().toISOString(),
      summary:
        input.mode === "queue_auto"
          ? "Automatic apply queue is running in safe review mode."
          : "Automatic apply run is running in safe review mode.",
      detail:
        "This safe development execution can fill and classify applications, but it still stops before any final submit action.",
    });
    await ctx.repository.upsertApplyRun(currentRunState);

    let submittedJobs = 0;
    let blockedJobs = 0;
    let failedJobs = 0;
    let skippedJobs = 0;
    let activeSource: JobSource | null = null;
    try {
      for (let index = 0; index < run.jobIds.length; index += 1) {
        const jobId = run.jobIds[index]!;
        const jobResult = results.find(
          (entry) => entry.runId === run.id && entry.jobId === jobId,
        );

        if (jobResult?.state && jobResult.state !== "planned") {
          if (jobResult.state === "submitted") {
            submittedJobs += 1;
          } else if (jobResult.state === "blocked") {
            blockedJobs += 1;
          } else if (jobResult.state === "failed") {
            failedJobs += 1;
          } else if (jobResult.state === "skipped") {
            skippedJobs += 1;
          }
          continue;
        }

        const { approvedExport, job } = await resolveJobApplyPrerequisites(jobId);
        const recoverySeed = await buildApplyRecoveryContext(jobId);
        if (activeSource !== job.source) {
          if (activeSource) {
            await ctx.closeRunBrowserSession(activeSource);
          }
          await ctx.openRunBrowserSession(job.source);
          activeSource = job.source;
        }
        const provenanceTargetId =
          job.provenance[job.provenance.length - 1]?.targetId ??
          job.provenance[0]?.targetId ??
          null;
        const provenanceTarget = provenanceTargetId
          ? (searchPreferences.discovery.targets.find(
              (target) => target.id === provenanceTargetId,
            ) ?? null)
          : null;
        const activeInstruction = provenanceTarget
          ? resolveActiveSourceInstructionArtifact(
              provenanceTarget,
              sourceInstructionArtifacts,
            )
          : null;
        const applyInstructions = uniqueStrings([
          ...buildInstructionGuidance(activeInstruction),
          ...recoverySeed.recoveryInstructions,
        ]);

        const executionResult = await ctx.browserRuntime.executeApplicationFlow(job.source, {
          job,
          resumeExport: approvedExport,
          resumeFilePath: approvedExport.filePath,
          profile,
          settings,
          mode: "prepare_only",
          ...(recoverySeed.recoveryContext
            ? { recoveryContext: recoverySeed.recoveryContext }
            : {}),
          ...(applyInstructions.length > 0 ? { instructions: applyInstructions } : {}),
        });
        const detectedAt = new Date().toISOString();
        const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
          activeInstruction,
          sourceDebugAttempts,
        });
        const blocker = mergeAttemptBlocker({
          blocker: executionResult.blocker,
          sourceDebugEvidenceRefIds,
          defaultUrl: job.applicationUrl ?? job.canonicalUrl,
        });
        const replay = mergeAttemptReplay({
          replay: executionResult.replay,
          activeInstruction,
          sourceDebugEvidenceRefIds,
          fallbackUrl: job.applicationUrl ?? job.canonicalUrl,
        });
        const normalizedExecutionResult: ApplyExecutionResult = {
          ...executionResult,
          blocker,
          replay,
        };
        const runArtifacts = buildApplyCopilotArtifacts({
          job,
          executionResult: normalizedExecutionResult,
          detectedAt,
        });
        const existingQuestionIds = new Set(
          questionRecords
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .map((entry) => entry.id),
        );
        const existingAnswerIds = new Set(
          answerRecords
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .map((entry) => entry.id),
        );
        const existingArtifactIds = new Set(
          artifactRefs
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .map((entry) => entry.id),
        );
        const existingCheckpointIds = new Set(
          checkpoints
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .map((entry) => entry.id),
        );
        const existingConsentIds = new Set(
          consentRequests
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .map((entry) => entry.id),
        );
        const updatedResult = ApplyJobResultSchema.parse({
          ...(jobResult ?? runArtifacts.result),
          id: jobResult?.id ?? runArtifacts.result.id,
          runId: run.id,
          jobId,
          queuePosition: index,
          state: mapExecutionResultToApplyJobState({
            consentRequests: runArtifacts.consentRequests,
            executionResult: normalizedExecutionResult,
          }),
          summary: normalizedExecutionResult.summary,
          detail: normalizedExecutionResult.detail,
          startedAt: jobResult?.startedAt ?? detectedAt,
          updatedAt: detectedAt,
          completedAt:
            normalizedExecutionResult.state === "submitted"
              ? detectedAt
              : runArtifacts.consentRequests.length > 0 ||
                  normalizedExecutionResult.state === "paused"
                ? null
                : normalizedExecutionResult.state === "failed" ||
                    normalizedExecutionResult.state === "unsupported"
                  ? detectedAt
                  : null,
          blockerReason: mapExecutionResultToApplyBlockerReason(
            normalizedExecutionResult.blocker,
          ),
          blockerSummary: normalizedExecutionResult.blocker?.summary ?? null,
          latestQuestionCount: runArtifacts.questionRecords.length,
          latestAnswerCount: runArtifacts.answerRecords.length,
          pendingConsentRequestCount: runArtifacts.consentRequests.length,
          artifactCount: runArtifacts.artifactRefs.length,
          latestCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
        });

      await Promise.all([
        ctx.repository.upsertApplyJobResult(updatedResult),
        ...runArtifacts.questionRecords
          .filter((record) => !existingQuestionIds.has(record.id))
          .map((record) => ctx.repository.upsertApplicationQuestionRecord({
            ...record,
            runId: run.id,
            resultId: updatedResult.id,
          })),
        ...runArtifacts.answerRecords
          .filter((record) => !existingAnswerIds.has(record.id))
          .map((record) => ctx.repository.upsertApplicationAnswerRecord({
            ...record,
            runId: run.id,
            resultId: updatedResult.id,
          })),
        ...runArtifacts.artifactRefs
          .filter((record) => !existingArtifactIds.has(record.id))
          .map((record) => ctx.repository.upsertApplicationArtifactRef({
            ...record,
            runId: run.id,
            resultId: updatedResult.id,
          })),
        ...runArtifacts.checkpoints
          .filter((record) => !existingCheckpointIds.has(record.id))
          .map((record) => ctx.repository.upsertApplicationReplayCheckpoint({
            ...record,
            runId: run.id,
            resultId: updatedResult.id,
          })),
        ...runArtifacts.consentRequests
          .filter((record) => !existingConsentIds.has(record.id))
          .map((record) => ctx.repository.upsertApplicationConsentRequest({
            ...record,
            runId: run.id,
            resultId: updatedResult.id,
          })),
      ]);

      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: normalizedExecutionResult.state,
        summary: normalizedExecutionResult.summary,
        detail: normalizedExecutionResult.detail,
        startedAt: normalizedExecutionResult.checkpoints[0]?.at ?? detectedAt,
        updatedAt: detectedAt,
        completedAt:
          normalizedExecutionResult.state === "in_progress" ? null : detectedAt,
        outcome: normalizedExecutionResult.outcome,
        checkpoints: normalizedExecutionResult.checkpoints,
        questions: normalizedExecutionResult.questions.map((question) =>
          ApplicationAttemptQuestionSchema.parse(question),
        ),
        blocker,
        consentDecisions: normalizedExecutionResult.consentDecisions.map((decision) =>
          ApplicationAttemptConsentDecisionSchema.parse(decision),
        ),
        replay,
        nextActionLabel: normalizedExecutionResult.nextActionLabel,
      });
      await ctx.repository.upsertApplicationAttempt(attempt);

      const jobState = updatedResult.state;
      if (jobState === "submitted") {
        submittedJobs += 1;
      } else if (jobState === "blocked") {
        blockedJobs += 1;
      } else if (jobState === "failed") {
        failedJobs += 1;
      }

      await syncRunApplicationRecord({
        eventDetail:
          jobState === "blocked" && runArtifacts.consentRequests.length > 0
            ? "The queue paused on a consent-gated step for this job. Resolve or decline the consent request to continue."
            : normalizedExecutionResult.detail,
        eventEmphasis:
          jobState === "submitted"
            ? "positive"
            : jobState === "failed"
              ? "critical"
              : jobState === "blocked"
                ? "warning"
                : "neutral",
        eventId: `event_${run.id}_${jobId}_${Date.now()}`,
        eventTitle:
          jobState === "blocked" && runArtifacts.consentRequests.length > 0
            ? "Paused for consent"
            : normalizedExecutionResult.summary,
        jobId,
        lastActionLabel: normalizedExecutionResult.summary,
        nextActionLabel:
          jobState === "blocked" && runArtifacts.consentRequests.length > 0
            ? "Resolve the consent request in Applications to continue the queue."
            : normalizedExecutionResult.nextActionLabel,
        updatedAt: detectedAt,
      });

      const pendingJobs = run.jobIds.length - (index + 1);
      const nextRunState = mapExecutionResultToApplyRunState({
        consentRequests: runArtifacts.consentRequests,
        executionResult: normalizedExecutionResult,
      });
      currentRunState = ApplyRunSchema.parse({
        ...currentRunState,
        currentJobId: jobId,
        updatedAt: detectedAt,
        state:
          input.mode === "queue_auto"
            ? runArtifacts.consentRequests.length > 0
              ? "paused_for_consent"
              : pendingJobs > 0
                ? "running"
                : "completed"
            : nextRunState,
        summary:
          runArtifacts.consentRequests.length > 0
            ? `Automatic apply paused for consent on '${job.title}'.`
            : input.mode === "queue_auto"
              ? `Automatic apply queue processed ${index + 1} of ${run.jobIds.length} jobs in safe review mode.`
              : `Automatic apply run processed '${job.title}' in safe review mode.`,
        detail:
          runArtifacts.consentRequests.length > 0
            ? "The queue stopped because a consent-gated step needs an explicit user decision before the next job can continue."
            : "The current safe development execution filled and classified the application but still stopped before any final submit action.",
        completedAt:
          input.mode === "queue_auto"
            ? runArtifacts.consentRequests.length > 0 || pendingJobs > 0
              ? null
              : detectedAt
            : nextRunState === "completed" || nextRunState === "failed"
              ? detectedAt
              : null,
        pendingJobs,
        submittedJobs,
        skippedJobs,
        blockedJobs,
        failedJobs,
      });
      await ctx.repository.upsertApplyRun(currentRunState);

        if (runArtifacts.consentRequests.length > 0) {
          break;
        }

        if (input.mode === "single_job_auto") {
          break;
        }
      }
    } catch (error) {
      const failedAt = new Date().toISOString();
      currentRunState = ApplyRunSchema.parse({
        ...currentRunState,
        state: "failed",
        updatedAt: failedAt,
        completedAt: failedAt,
        pendingJobs: currentRunState.pendingJobs,
        submittedJobs,
        skippedJobs,
        blockedJobs,
        failedJobs: failedJobs + 1,
        summary: "Automatic apply run failed before safe review completed.",
        detail: error instanceof Error ? error.message : "Unknown automatic apply failure.",
      });
      await ctx.repository.upsertApplyRun(currentRunState);
      throw error;
    } finally {
      if (activeSource) {
        try {
          await ctx.closeRunBrowserSession(activeSource);
        } catch (cleanupError) {
          console.error("Failed to close apply browser session.", cleanupError);
        }
      }
    }
  }

  return {
    async queueJobForReview(jobId) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex];
        const savedJobs = await ctx.repository.listSavedJobs();
        const nextJob = SavedJobSchema.parse({
          ...pendingJob,
          status: "shortlisted",
        });
        await ctx.repository.replaceSavedJobs(mergeSavedJobs(savedJobs, [nextJob]));
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter(
            (job) => job.id !== jobId,
          ),
        }));
      } else {
        const tailoredAssets = await ctx.repository.listTailoredAssets();
        const asset = tailoredAssets.find((entry) => entry.jobId === jobId);

        await ctx.updateJob(jobId, (job) => ({
          ...job,
          status: asset?.status === "ready" ? "ready_for_review" : "drafting",
        }));
      }

      return ctx.getWorkspaceSnapshot();
    },
    async dismissDiscoveryJob(jobId) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex];
        if (!pendingJob) {
          throw new Error(
            `Pending discovery job missing at index ${pendingIndex} while dismissing '${jobId}' (pending count ${discoveryState.pendingDiscoveryJobs.length}).`,
          );
        }
        await ctx.persistDiscoveryState((current) => ({
          ...current,
          discoveryLedger: markSavedJobStatusInLedger({
            ledger: current.discoveryLedger,
            job: pendingJob,
            status: "skipped",
            occurredAt: new Date().toISOString(),
            skipReason: "Dismissed from discovery results.",
          }),
          pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter(
            (job) => job.id !== jobId,
          ),
        }));
      } else {
        const savedJobs = await ctx.repository.listSavedJobs();
        const targetJob = savedJobs.find((job) => job.id === jobId) ?? null;

        if (!targetJob) {
          throw new Error(`Unable to archive unknown job '${jobId}'.`);
        }

        const nextSavedJobs = savedJobs.map((job) =>
          job.id === jobId ? SavedJobSchema.parse({ ...job, status: "archived" }) : job,
        );
        const occurredAt = new Date().toISOString();
        const nextDiscoveryState = {
          ...discoveryState,
          discoveryLedger: markSavedJobStatusInLedger({
            ledger: discoveryState.discoveryLedger,
            job: targetJob,
            status: "skipped",
            occurredAt,
            skipReason: "Archived intentionally by the user.",
          }),
        };

        await ctx.persistSavedJobsAndDiscoveryState({
          savedJobs: nextSavedJobs,
          discoveryState: nextDiscoveryState,
        });
      }

      return ctx.getWorkspaceSnapshot();
    },
    async generateResume(jobId) {
      const [profile, searchPreferences, settings, savedJobs, tailoredAssets] =
        await Promise.all([
          ctx.repository.getProfile(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.listSavedJobs(),
          ctx.repository.listTailoredAssets(),
        ]);
      const job = savedJobs.find((entry) => entry.id === jobId);

      if (!job) {
        throw new Error(
          `Unable to generate a resume for unknown job '${jobId}'.`,
        );
      }

      const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId);
      const existingDraft = await ctx.repository.getResumeDraftByJobId(jobId);
      const research = await fetchAndPersistResearch(ctx, job);
      const evidence = collectResumeWorkspaceEvidence({
        profile,
        job,
        research,
      });
      const researchContext = collectResearchContext(research);
      const draft = await ctx.aiClient.createResumeDraft({
        profile,
        searchPreferences,
        settings,
        job,
        resumeText: profile.baseResume.textContent,
        evidence,
        researchContext,
      });
      const generationMethod = draft.notes.some((note: string) =>
        normalizeText(note).includes("deterministic"),
      )
        ? "deterministic"
        : ctx.aiClient.getStatus().kind === "openai_compatible"
          ? "ai_assisted"
          : "deterministic";
      const now = new Date().toISOString();
      const resumeDraft = buildResumeDraftFromTailoredDraft({
        job,
        settings,
        draft,
        createdAt: existingDraft?.createdAt ?? now,
        existingDraftId: existingDraft?.id ?? null,
        generationMethod: generationMethod === "ai_assisted" ? "ai" : "deterministic",
        profile,
        research,
      });
      const sanitizedResumeDraft = sanitizeResumeDraft({
        draft: resumeDraft,
        job,
        profile,
      });
      const previewSections = buildTailoredAssetBridge({
        draft: sanitizedResumeDraft,
        job,
        profile,
      }).previewSections;
      const contentText = buildTailoredResumeTextFromResumeDraft(
        profile,
        job,
        sanitizedResumeDraft,
      );
      const renderedArtifact = await ctx.documentManager.renderResumeArtifact({
        job,
        profile,
        renderDocument: buildResumeRenderDocument(profile, sanitizedResumeDraft),
        settings,
      });

      if (!renderedArtifact.storagePath) {
        throw new Error(
          `Resume export failed for '${job.title}' at '${job.company}'.`,
        );
      }

      const selectedTemplate = ctx.documentManager
        .listResumeTemplates()
        .find((template) => template.id === settings.resumeTemplateId);
      const validation = validateResumeDraft({
        draft: sanitizedResumeDraft,
        job,
        profile,
        pageCount: renderedArtifact.pageCount ?? null,
        validatedAt: now,
      });
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: "resume",
        status: "ready",
        label: draft.label ?? "Tailored Resume",
        version: nextAssetVersion(existingAsset),
        templateName:
          selectedTemplate?.label ?? existingAsset?.templateName ?? "Classic ATS",
        compatibilityScore:
          draft.compatibilityScore ?? Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: new Date().toISOString(),
        storagePath: renderedArtifact.storagePath,
        contentText,
        previewSections,
        generationMethod,
        notes: uniqueStrings([
          ...draft.notes,
          ...(renderedArtifact.fileName
            ? [
                `Generated ${renderedArtifact.format.toUpperCase()} resume artifact ${renderedArtifact.fileName}.`,
              ]
            : []),
          ...(renderedArtifact.intermediateFileName
            ? [
                `Saved HTML debug render ${renderedArtifact.intermediateFileName}.`,
              ]
            : []),
          ...(renderedArtifact.pageCount !== null &&
          renderedArtifact.pageCount !== undefined
            ? [`Generated PDF page count: ${renderedArtifact.pageCount}.`]
            : []),
          ...(renderedArtifact.warnings ?? []),
          ...(renderedArtifact.pageCount !== null &&
          renderedArtifact.pageCount !== undefined &&
          renderedArtifact.pageCount > 2
            ? [
                renderedArtifact.pageCount >= 3
                  ? "Resume export reached 3 or more pages and needs review before apply."
                  : "Resume export exceeded the 2-page target and should be reviewed.",
              ]
            : []),
        ]),
      });

      await ctx.repository.saveResumeDraftWithValidation({
        draft: sanitizedResumeDraft,
        validation,
        tailoredAsset: nextAsset,
      });
      await ctx.updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: "ready_for_review",
      }));

      return ctx.getWorkspaceSnapshot();
    },
    async getResumeWorkspace(jobId) {
      return buildResumeWorkspace(ctx, jobId);
    },
    async saveResumeDraft(draft) {
      const parsedDraft = ResumeDraftSchema.parse(draft);
      const { job, profile, tailoredAsset } = await ensureResumeDraft(ctx, parsedDraft.jobId);
      const now = new Date().toISOString();
      const nextDraft = ResumeDraftSchema.parse({
        ...parsedDraft,
        status:
          parsedDraft.approvedAt || parsedDraft.approvedExportId ? "stale" : "needs_review",
        approvedAt: null,
        approvedExportId: null,
        staleReason:
          parsedDraft.approvedAt || parsedDraft.approvedExportId
            ? "Draft changed after approval and needs a fresh review."
            : null,
        updatedAt: now,
      });
      const sanitizedDraft = sanitizeResumeDraft({
        draft: nextDraft,
        job,
        profile,
      });
      const validation = validateResumeDraft({
        draft: sanitizedDraft,
        job,
        profile,
        validatedAt: now,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: sanitizedDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: tailoredAsset?.storagePath ?? null,
      });

      await ctx.repository.saveResumeDraftWithValidation({
        draft: sanitizedDraft,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async regenerateResumeDraft(jobId) {
      const existingDraft = await ctx.repository.getResumeDraftByJobId(jobId);

      if (existingDraft && hasLockedResumeContent(existingDraft)) {
        throw new Error(
          "Unlock pinned resume sections or bullets before regenerating the full draft.",
        );
      }

      return this.generateResume(jobId);
    },
    async regenerateResumeSection(jobId, sectionId) {
      const state = await ensureResumeDraft(ctx, jobId);
      const { draft } = state;
      const targetSection = draft.sections.find((section) => section.id === sectionId);

      if (!targetSection) {
        throw new Error(`Unable to regenerate unknown resume section '${sectionId}'.`);
      }

      if (targetSection.locked || targetSection.bullets.some((bullet) => bullet.locked)) {
        throw new Error(
          `Unlock the '${targetSection.label}' section before regenerating it.`,
        );
      }

      if (
        targetSection.entries.some(
          (entry) => entry.locked || entry.bullets.some((bullet) => bullet.locked),
        )
      ) {
        throw new Error(
          `Unlock the '${targetSection.label}' section before regenerating it.`,
        );
      }

      const research = await fetchAndPersistResearch(ctx, state.job);
      const assistantReply = await ctx.aiClient.reviseResumeDraft({
        draft,
        job: state.job,
        request: `Regenerate the ${targetSection.label} section for stronger alignment with ${state.job.title} at ${state.job.company}.`,
        validationIssues: (await ctx.repository.listResumeValidationResults(draft.id))[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const sectionPatch = assistantReply.patches.find(
        (patch) => patch.targetSectionId === sectionId,
      );

      if (!sectionPatch) {
        return this.applyResumePatch({
          id: createUniqueId(`resume_patch_regen_${sectionId}`),
          draftId: draft.id,
          operation: targetSection.text ? "replace_section_text" : "replace_section_bullets",
          targetSectionId: sectionId,
          targetEntryId: null,
          targetBulletId: null,
          anchorBulletId: null,
          position: null,
          newText: targetSection.text,
          newIncluded: null,
          newLocked: null,
          newBullets: targetSection.bullets,
          appliedAt: new Date().toISOString(),
          origin: "user",
          conflictReason: null,
        }, "Regenerated section fallback");
      }

      return this.applyResumePatch(sectionPatch, "Regenerated section");
    },
    async exportResumePdf(jobId, outputPath) {
      const { draft, job, profile, settings, tailoredAsset } = await ensureResumeDraft(ctx, jobId);
      const renderedArtifact = await renderDraftToPdf(ctx, {
        job,
        profile,
        settings,
        draft,
        outputPath: outputPath ?? null,
      });

      if (!renderedArtifact.storagePath) {
        throw new Error(`Resume export failed for '${job.title}' at '${job.company}'.`);
      }

      const exportedAt = new Date().toISOString();
      const exportArtifact = buildResumeExportArtifact({
        draft,
        job,
        filePath: renderedArtifact.storagePath,
        pageCount: renderedArtifact.pageCount ?? null,
        exportedAt,
      });
      const validation = validateResumeDraft({
        draft,
        job,
        profile,
        pageCount: renderedArtifact.pageCount ?? null,
        validatedAt: exportedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: renderedArtifact.storagePath,
        pageCount: renderedArtifact.pageCount ?? null,
        notes: uniqueStrings([
          ...(renderedArtifact.fileName
            ? [`Generated PDF resume artifact ${renderedArtifact.fileName}.`]
            : []),
          ...(renderedArtifact.intermediateFileName
            ? [`Saved HTML debug render ${renderedArtifact.intermediateFileName}.`]
            : []),
          ...(renderedArtifact.warnings ?? []),
        ]),
      });

      await ctx.repository.upsertResumeExportArtifact(exportArtifact);
      await ctx.repository.saveResumeDraftWithValidation({
        draft,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async approveResume(jobId, exportId) {
      const { draft, job, profile, tailoredAsset } = await ensureResumeDraft(ctx, jobId);
      const [exports, validations] = await Promise.all([
        ctx.repository.listResumeExportArtifacts({ jobId }),
        ctx.repository.listResumeValidationResults(draft.id),
      ]);
      const targetExport = exports.find((artifact) => artifact.id === exportId);
      const latestValidation = validations[0] ?? null;

      if (!targetExport) {
        throw new Error(`Unable to approve unknown resume export '${exportId}'.`);
      }

      if (targetExport.draftId !== draft.id) {
        throw new Error(
          `Resume export '${exportId}' does not belong to the current draft and cannot be approved.`,
        );
      }

      if (
        new Date(targetExport.exportedAt).getTime() <
        new Date(draft.updatedAt).getTime()
      ) {
        throw new Error(
          `Resume export '${exportId}' is older than the current draft and cannot be approved. Export a fresh PDF first.`,
        );
      }

      if (latestValidation?.issues.some((issue) => issue.severity === "error")) {
        throw new Error(
          `Resume export '${exportId}' still has blocking validation errors and cannot be approved yet.`,
        );
      }

      const approvedAt = new Date().toISOString();
      const approvedDraft = ResumeDraftSchema.parse({
        ...draft,
        status: "approved",
        approvedAt,
        approvedExportId: targetExport.id,
        staleReason: null,
        updatedAt: approvedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: approvedDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        storagePath: targetExport.filePath,
        pageCount: targetExport.pageCount,
      });

      await ctx.repository.approveResumeExport({
        draft: approvedDraft,
        exportArtifact: {
          ...targetExport,
          isApproved: true,
        },
        validation: latestValidation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async clearResumeApproval(jobId) {
      const { draft, job, profile, tailoredAsset } = await ensureResumeDraft(ctx, jobId);
      const nextDraft = ResumeDraftSchema.parse({
        ...draft,
        status: "stale",
        approvedAt: null,
        approvedExportId: null,
        staleReason: "Resume approval was cleared and needs a fresh review.",
        updatedAt: new Date().toISOString(),
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: nextDraft,
        job,
        profile,
        existingAsset: tailoredAsset,
        clearStoragePath: true,
      });

      await ctx.repository.clearResumeApproval({
        draft: nextDraft,
        staleReason: nextDraft.staleReason ?? "Resume approval cleared.",
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async applyResumePatch(patch, revisionReason) {
      const parsedPatch = ResumeDraftPatchSchema.parse(patch);
      const currentDraft = (await ctx.repository.listResumeDrafts()).find(
        (entry) => entry.id === parsedPatch.draftId,
      ) ?? null;

      if (!currentDraft) {
        throw new Error(`Unable to find resume draft '${parsedPatch.draftId}'.`);
      }

      const state = await ensureResumeDraft(ctx, currentDraft.jobId);

      const updatedAt = createMonotonicTimestamp(currentDraft.updatedAt);
      const nextDraft = applyPatchToResumeDraft({
        draft: currentDraft,
        patch: parsedPatch,
        updatedAt,
      });
      const sanitizedDraft = sanitizeResumeDraft({
        draft: nextDraft,
        job: state.job,
        profile: state.profile,
      });
      const revision = buildResumeDraftRevision({
        draft: currentDraft,
        createdAt: updatedAt,
        reason: revisionReason ?? null,
      });
      const validation = validateResumeDraft({
        draft: sanitizedDraft,
        job: state.job,
        profile: state.profile,
        validatedAt: updatedAt,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: sanitizedDraft,
        job: state.job,
        profile: state.profile,
        existingAsset: state.tailoredAsset,
        clearStoragePath: true,
      });

      await ctx.repository.applyResumePatchWithRevision({
        draft: sanitizedDraft,
        revision,
        validation,
        tailoredAsset: nextAsset,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async getResumeAssistantMessages(jobId) {
      await ensureResumeDraft(ctx, jobId);
      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async sendResumeAssistantMessage(jobId, content) {
      const workspaceState = await ensureResumeDraft(ctx, jobId);
      const messageTimestamp = new Date().toISOString();
      const userMessage = ResumeAssistantMessageSchema.parse({
        id: createUniqueId(`resume_message_user_${jobId}`),
        jobId,
        role: "user",
        content,
        patches: [],
        createdAt: messageTimestamp,
      });
      const validations = await ctx.repository.listResumeValidationResults(workspaceState.draft.id);
      const research = await fetchAndPersistResearch(ctx, workspaceState.job);
      const assistantReply = await ctx.aiClient.reviseResumeDraft({
        draft: workspaceState.draft,
        job: workspaceState.job,
        request: content,
        validationIssues: validations[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const normalizedPatches = assistantReply.patches.map((patch) =>
        ResumeDraftPatchSchema.parse({
          ...patch,
          draftId: workspaceState.draft.id,
          targetEntryId: patch.targetEntryId ?? null,
        }),
      );
      const assistantMessage = buildAssistantReplyMessage({
        jobId,
        content: assistantReply.content,
        patches: normalizedPatches,
        createdAt: messageTimestamp,
      });

      let candidateDraft = workspaceState.draft;
      try {
        for (const patch of normalizedPatches) {
          const updatedAt = createMonotonicTimestamp(candidateDraft.updatedAt);
          candidateDraft = applyPatchToResumeDraft({
            draft: candidateDraft,
            patch,
            updatedAt,
          });
        }
      } catch (error) {
        const failureDetail =
          error instanceof Error
            ? error.message
            : "A resume patch could not be applied.";
        const failureMessage = buildAssistantReplyMessage({
          jobId,
          content: `No assistant changes were applied. ${failureDetail}`,
          patches: [],
          createdAt: messageTimestamp,
        });

        await ctx.repository.upsertResumeAssistantMessage(userMessage);
        await ctx.repository.upsertResumeAssistantMessage(failureMessage);
        return ctx.repository.listResumeAssistantMessages(jobId);
      }

      if (normalizedPatches.length > 0) {
        const finalUpdatedAt = createMonotonicTimestamp(candidateDraft.updatedAt);
        const sanitizedDraft = sanitizeResumeDraft({
          draft: candidateDraft,
          job: workspaceState.job,
          profile: workspaceState.profile,
        });
        const revision = buildResumeDraftRevision({
          draft: candidateDraft,
          createdAt: finalUpdatedAt,
          reason: `Assistant request: ${content}`,
        });
        const validation = validateResumeDraft({
          draft: sanitizedDraft,
          job: workspaceState.job,
          profile: workspaceState.profile,
          validatedAt: finalUpdatedAt,
        });
        const nextAsset = buildTailoredAssetBridge({
          draft: sanitizedDraft,
          job: workspaceState.job,
          profile: workspaceState.profile,
          existingAsset: workspaceState.tailoredAsset,
          clearStoragePath: true,
        });

        await ctx.repository.applyResumePatchWithRevision({
          draft: sanitizedDraft,
          revision,
          validation,
          tailoredAsset: nextAsset,
        });
      }

      await ctx.repository.upsertResumeAssistantMessage(userMessage);
      await ctx.repository.upsertResumeAssistantMessage(assistantMessage);

      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async approveApply(jobId) {
      const [
        profile,
        searchPreferences,
        settings,
        savedJobs,
        tailoredAssets,
        applicationRecords,
        sourceInstructionArtifacts,
        sourceDebugAttempts,
        draft,
        approvedExports,
        discoveryState,
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.listApplicationRecords(),
        ctx.repository.listSourceInstructionArtifacts(),
        ctx.repository.listSourceDebugAttempts(),
        ctx.repository.getResumeDraftByJobId(jobId),
        ctx.repository.listResumeExportArtifacts({ jobId }),
        ctx.repository.getDiscoveryState(),
      ]);
      const job = savedJobs.find((entry) => entry.id === jobId);
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId);
      const approvedExport = draft?.approvedExportId
        ? (approvedExports.find((entry) => entry.id === draft.approvedExportId) ?? null)
        : null;

      if (!job) {
        throw new Error(
          `Unable to approve apply flow for unknown job '${jobId}'.`,
        );
      }

      if (!draft || draft.status !== "approved" || !approvedExport) {
        throw new Error(
          `An approved tailored PDF is required before applying to '${job.title}'.`,
        );
      }

      if (ctx.exportFileVerifier) {
        const approvedFileExists = await ctx.exportFileVerifier.exists(
          approvedExport.filePath,
        );

        if (!approvedFileExists) {
          throw new Error(
            `The approved tailored PDF is missing on disk for '${job.title}'. Re-export and approve the resume again before applying.`,
          );
        }
      }

      if (!asset || asset.status !== "ready" || asset.storagePath !== approvedExport.filePath) {
        throw new Error(
          `A ready approved tailored resume is required before applying to '${job.title}'.`,
        );
      }

      const provenanceTargetId =
        job.provenance[job.provenance.length - 1]?.targetId ??
        job.provenance[0]?.targetId ??
        null;
      const provenanceTarget = provenanceTargetId
        ? (searchPreferences.discovery.targets.find(
            (target) => target.id === provenanceTargetId,
          ) ?? null)
        : null;
      const activeLedgerTargetId =
        provenanceTarget?.id ??
        (searchPreferences.discovery.targets.length === 1
          ? (searchPreferences.discovery.targets[0]?.id ?? null)
          : null);
      const activeInstruction = provenanceTarget
        ? resolveActiveSourceInstructionArtifact(
            provenanceTarget,
            sourceInstructionArtifacts,
          )
        : null;
      const applyInstructions = uniqueStrings([
        ...buildInstructionGuidance(activeInstruction),
      ]);

      const executionResult = await ctx.browserRuntime.executeEasyApply(job.source, {
        job,
        resumeExport: approvedExport,
        resumeFilePath: approvedExport.filePath,
        profile,
        settings,
        ...(applyInstructions.length > 0 ? { instructions: applyInstructions } : {}),
      });
      const now = new Date().toISOString();
      const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
        activeInstruction,
        sourceDebugAttempts,
      });
      const questions = executionResult.questions.map((question) =>
        ApplicationAttemptQuestionSchema.parse(question),
      );
      const consentDecisions = executionResult.consentDecisions.map((decision) =>
        ApplicationAttemptConsentDecisionSchema.parse(decision),
      );
      const blocker = mergeAttemptBlocker({
        blocker: executionResult.blocker,
        sourceDebugEvidenceRefIds,
        defaultUrl: job.applicationUrl ?? job.canonicalUrl,
      });
      const replay = mergeAttemptReplay({
        replay: executionResult.replay,
        activeInstruction,
        sourceDebugEvidenceRefIds,
        fallbackUrl: job.applicationUrl ?? job.canonicalUrl,
      });
      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: executionResult.state,
        summary: executionResult.summary,
        detail: executionResult.detail,
        startedAt: executionResult.checkpoints[0]?.at ?? now,
        updatedAt: executionResult.submittedAt ?? now,
        completedAt:
          executionResult.state === "in_progress"
            ? null
            : (executionResult.submittedAt ?? now),
        outcome: executionResult.outcome,
        checkpoints: executionResult.checkpoints,
        questions,
        blocker,
        consentDecisions,
        replay,
        nextActionLabel: executionResult.nextActionLabel,
      });

      await ctx.repository.upsertApplicationAttempt(attempt);

      const existingRecord = applicationRecords.find((record) => record.jobId === jobId);
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: nextJobStatusFromAttempt(job, executionResult.state),
        lastActionLabel: executionResult.summary,
        nextActionLabel: executionResult.nextActionLabel,
        lastUpdatedAt: executionResult.submittedAt ?? now,
        lastAttemptState: executionResult.state,
        questionSummary: buildQuestionSummary(attempt.questions),
        latestBlocker: buildLatestBlockerSummary(attempt.blocker),
        consentSummary: buildConsentSummary(attempt.consentDecisions),
        replaySummary: buildReplaySummary(attempt.replay),
        events: mergeEvents(
          existingRecord?.events ?? [],
          toApplicationEvents(job, executionResult.checkpoints),
        ),
      });

      await ctx.repository.upsertApplicationRecord(nextRecord);
      const nextSavedJobs = savedJobs.map((savedJob) =>
        savedJob.id === jobId
          ? SavedJobSchema.parse({
              ...savedJob,
              status: nextJobStatusFromAttempt(savedJob, executionResult.state),
            })
          : savedJob,
      );
      if (executionResult.state === "submitted") {
        await ctx.persistSavedJobsAndDiscoveryState({
          savedJobs: nextSavedJobs,
          discoveryState: {
            ...discoveryState,
            discoveryLedger: markSavedJobStatusInLedger({
              ledger: discoveryState.discoveryLedger,
              job,
              ...(activeLedgerTargetId
                ? { activeTargetId: activeLedgerTargetId }
                : {}),
              status: "applied",
              occurredAt: executionResult.submittedAt ?? now,
              skipReason: null,
            }),
          },
        });
      } else {
        await ctx.repository.replaceSavedJobs(nextSavedJobs);
      }

      return ctx.getWorkspaceSnapshot();
    },
    async startApplyCopilotRun(jobId) {
      const [
        profile,
        searchPreferences,
        settings,
        savedJobs,
        tailoredAssets,
        applicationRecords,
        sourceInstructionArtifacts,
        sourceDebugAttempts,
        draft,
        approvedExports,
        recoverySeed,
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.listApplicationRecords(),
        ctx.repository.listSourceInstructionArtifacts(),
        ctx.repository.listSourceDebugAttempts(),
        ctx.repository.getResumeDraftByJobId(jobId),
        ctx.repository.listResumeExportArtifacts({ jobId }),
        buildApplyRecoveryContext(jobId),
      ]);
      const job = savedJobs.find((entry) => entry.id === jobId) ?? null;

      if (!job) {
        throw new Error(`Unable to start apply copilot for unknown job '${jobId}'.`);
      }

      const approvedExport = draft?.approvedExportId
        ? (approvedExports.find((entry) => entry.id === draft.approvedExportId) ?? null)
        : null;
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;

      const shouldBlockForMissingResume =
        !draft ||
        draft.status !== "approved" ||
        !approvedExport ||
        !asset ||
        asset.status !== "ready" ||
        asset.storagePath !== approvedExport.filePath;

      if (!shouldBlockForMissingResume && ctx.exportFileVerifier) {
        const approvedFileExists = await ctx.exportFileVerifier.exists(
          approvedExport.filePath,
        );

        if (!approvedFileExists) {
          const detectedAt = new Date().toISOString();
          const artifacts = buildMissingResumeCopilotArtifacts({ job, detectedAt });

          await Promise.all([
            ctx.repository.upsertApplyRun(ApplyRunSchema.parse(artifacts.run)),
            ctx.repository.upsertApplyJobResult(artifacts.result),
            ctx.repository.upsertApplicationQuestionRecord(artifacts.questionRecord),
            ctx.repository.upsertApplicationArtifactRef(artifacts.artifactRef),
            ctx.repository.upsertApplicationReplayCheckpoint(artifacts.checkpoint),
            ctx.repository.upsertApplicationConsentRequest(artifacts.consentRequest),
          ]);

          return ctx.getWorkspaceSnapshot();
        }
      }

      if (shouldBlockForMissingResume) {
        const detectedAt = new Date().toISOString();
        const artifacts = buildMissingResumeCopilotArtifacts({ job, detectedAt });

        await Promise.all([
          ctx.repository.upsertApplyRun(ApplyRunSchema.parse(artifacts.run)),
          ctx.repository.upsertApplyJobResult(artifacts.result),
          ctx.repository.upsertApplicationQuestionRecord(artifacts.questionRecord),
          ctx.repository.upsertApplicationArtifactRef(artifacts.artifactRef),
          ctx.repository.upsertApplicationReplayCheckpoint(artifacts.checkpoint),
          ctx.repository.upsertApplicationConsentRequest(artifacts.consentRequest),
        ]);

        return ctx.getWorkspaceSnapshot();
      }

      const provenanceTargetId =
        job.provenance[job.provenance.length - 1]?.targetId ??
        job.provenance[0]?.targetId ??
        null;
      const provenanceTarget = provenanceTargetId
        ? (searchPreferences.discovery.targets.find(
            (target) => target.id === provenanceTargetId,
          ) ?? null)
        : null;
      const activeInstruction = provenanceTarget
        ? resolveActiveSourceInstructionArtifact(
            provenanceTarget,
            sourceInstructionArtifacts,
          )
        : null;
      const applyInstructions = uniqueStrings([
        ...buildInstructionGuidance(activeInstruction),
        ...recoverySeed.recoveryInstructions,
      ]);
      if (!ctx.browserRuntime.executeApplicationFlow) {
        throw new Error(
          "The current browser runtime does not support non-submitting apply copilot execution yet.",
        );
      }

      const executionResult = await ctx.browserRuntime.executeApplicationFlow(job.source, {
        job,
        resumeExport: approvedExport,
        resumeFilePath: approvedExport.filePath,
        profile,
        settings,
        mode: "prepare_only",
        ...(recoverySeed.recoveryContext
          ? { recoveryContext: recoverySeed.recoveryContext }
          : {}),
        ...(applyInstructions.length > 0 ? { instructions: applyInstructions } : {}),
      });
      const detectedAt = new Date().toISOString();
      const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
        activeInstruction,
        sourceDebugAttempts,
      });
      const questions = executionResult.questions.map((question) =>
        ApplicationAttemptQuestionSchema.parse(question),
      );
      const consentDecisions = executionResult.consentDecisions.map((decision) =>
        ApplicationAttemptConsentDecisionSchema.parse(decision),
      );
      const blocker = mergeAttemptBlocker({
        blocker: executionResult.blocker,
        sourceDebugEvidenceRefIds,
        defaultUrl: job.applicationUrl ?? job.canonicalUrl,
      });
      const replay = mergeAttemptReplay({
        replay: executionResult.replay,
        activeInstruction,
        sourceDebugEvidenceRefIds,
        fallbackUrl: job.applicationUrl ?? job.canonicalUrl,
      });
      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: executionResult.state,
        summary: executionResult.summary,
        detail: executionResult.detail,
        startedAt: executionResult.checkpoints[0]?.at ?? detectedAt,
        updatedAt: detectedAt,
        completedAt: executionResult.state === "in_progress" ? null : detectedAt,
        outcome: executionResult.outcome,
        checkpoints: executionResult.checkpoints,
        questions,
        blocker,
        consentDecisions,
        replay,
        nextActionLabel: executionResult.nextActionLabel,
      });
      const runArtifacts = buildApplyCopilotArtifacts({
        job,
        executionResult: {
          ...executionResult,
          blocker,
          replay,
        },
        detectedAt,
      });

      await ctx.repository.upsertApplicationAttempt(attempt);
      await Promise.all([
        ctx.repository.upsertApplyRun(runArtifacts.run),
        ctx.repository.upsertApplyJobResult(runArtifacts.result),
        ...runArtifacts.questionRecords.map((record) =>
          ctx.repository.upsertApplicationQuestionRecord(record),
        ),
        ...runArtifacts.answerRecords.map((record) =>
          ctx.repository.upsertApplicationAnswerRecord(record),
        ),
        ...runArtifacts.artifactRefs.map((ref) =>
          ctx.repository.upsertApplicationArtifactRef(ref),
        ),
        ...runArtifacts.checkpoints.map((checkpoint) =>
          ctx.repository.upsertApplicationReplayCheckpoint(checkpoint),
        ),
        ...runArtifacts.consentRequests.map((request) =>
          ctx.repository.upsertApplicationConsentRequest(request),
        ),
      ]);

      const existingRecord = applicationRecords.find((record) => record.jobId === jobId);
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: nextJobStatusFromAttempt(job, executionResult.state),
        lastActionLabel: executionResult.summary,
        nextActionLabel: executionResult.nextActionLabel,
        lastUpdatedAt: detectedAt,
        lastAttemptState: executionResult.state,
        questionSummary: buildQuestionSummary(attempt.questions),
        latestBlocker: buildLatestBlockerSummary(attempt.blocker),
        consentSummary: buildConsentSummary(attempt.consentDecisions),
        replaySummary: buildReplaySummary(attempt.replay),
        events: mergeEvents(
          existingRecord?.events ?? [],
          toApplicationEvents(job, executionResult.checkpoints),
        ),
      });

      await ctx.repository.upsertApplicationRecord(nextRecord);
      await ctx.repository.replaceSavedJobs(
        savedJobs.map((savedJob) =>
          savedJob.id === jobId
            ? SavedJobSchema.parse({
                ...savedJob,
                status: nextJobStatusFromAttempt(savedJob, executionResult.state),
              })
            : savedJob,
        ),
      );

      return ctx.getWorkspaceSnapshot();
    },
    async startAutoApplyRun(jobId) {
      const { job } = await resolveJobApplyPrerequisites(jobId);

      const createdAt = new Date().toISOString();
      const runArtifacts = buildSingleJobAutoApplyArtifacts({
        createdAt,
        job,
      });

      await Promise.all([
        ctx.repository.upsertApplyRun(runArtifacts.run),
        ctx.repository.upsertApplyJobResult(runArtifacts.result),
        ctx.repository.upsertApplySubmitApproval(runArtifacts.approval),
      ]);

      const applicationRecords = await ctx.repository.listApplicationRecords();
      const existingRecord = applicationRecords.find((record) => record.jobId === jobId);
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: job.status,
        lastActionLabel: runArtifacts.run.summary,
        nextActionLabel: "Review the pending submit approval in Applications.",
        lastUpdatedAt: createdAt,
        lastAttemptState: existingRecord?.lastAttemptState ?? null,
        questionSummary: existingRecord?.questionSummary,
        latestBlocker: existingRecord?.latestBlocker ?? null,
        consentSummary: existingRecord?.consentSummary,
        replaySummary: existingRecord?.replaySummary,
        events: mergeEvents(existingRecord?.events ?? [], [
          {
            id: `event_${runArtifacts.run.id}_awaiting_submit_approval`,
            at: createdAt,
            title: "Automatic submit approval requested",
            detail:
              "A run-scoped submit approval was created for this job. The current safe implementation still stops before any final submit action.",
            emphasis: "warning",
          },
        ]),
      });

      await ctx.repository.upsertApplicationRecord(nextRecord);

      return ctx.getWorkspaceSnapshot();
    },
    async startAutoApplyQueueRun(jobIds) {
      const uniqueJobIds = uniqueStrings(jobIds);

      if (uniqueJobIds.length === 0) {
        throw new Error("At least one job is required before starting an automatic apply queue.");
      }

      const jobs = await Promise.all(
        uniqueJobIds.map(async (jobId) => (await resolveJobApplyPrerequisites(jobId)).job),
      );
      const createdAt = new Date().toISOString();
      const runId = createUniqueId("apply_run");
      const approvalId = createUniqueId("apply_submit_approval");
      const run = ApplyRunSchema.parse({
        id: runId,
        mode: "queue_auto",
        state: "awaiting_submit_approval",
        jobIds: uniqueJobIds,
        currentJobId: uniqueJobIds[0] ?? null,
        submitApprovalId: approvalId,
        createdAt,
        updatedAt: createdAt,
        completedAt: null,
        summary: `Automatic apply queue is staged for ${uniqueJobIds.length} jobs.`,
        detail:
          "This safe development queue records run-scoped submit approval and can later fill applications sequentially, but it still stops before any final submit action.",
        totalJobs: uniqueJobIds.length,
        pendingJobs: uniqueJobIds.length,
        submittedJobs: 0,
        skippedJobs: 0,
        blockedJobs: 0,
        failedJobs: 0,
      });
      const approval = ApplySubmitApprovalSchema.parse({
        id: approvalId,
        runId,
        mode: "queue_auto",
        jobIds: uniqueJobIds,
        status: "pending",
        createdAt,
        approvedAt: null,
        revokedAt: null,
        expiresAt: null,
        detail:
          "Queue-wide submit approval is recorded for this exact run scope only. Final submit remains disabled in the current safe development slice.",
      });
      const results = jobs.map((job, index) =>
        ApplyJobResultSchema.parse({
          id: createUniqueId("apply_result"),
          runId,
          jobId: job.id,
          queuePosition: index,
          state: "planned",
          summary: "Waiting for explicit queue approval.",
          detail:
            "This queued job will not execute until the run-scoped approval is recorded.",
          startedAt: createdAt,
          updatedAt: createdAt,
          completedAt: null,
          blockerReason: null,
          blockerSummary: null,
          latestQuestionCount: 0,
          latestAnswerCount: 0,
          pendingConsentRequestCount: 0,
          artifactCount: 0,
          latestCheckpointId: null,
        }),
      );

      await Promise.all([
        ctx.repository.upsertApplyRun(run),
        ctx.repository.upsertApplySubmitApproval(approval),
        ...results.map((result) => ctx.repository.upsertApplyJobResult(result)),
        ...jobs.map((job) =>
          syncRunApplicationRecord({
            eventDetail:
              "A queue-scoped automatic apply run was created for this job. The current safe build still stops before final submit.",
            eventEmphasis: "warning",
            eventId: `event_${runId}_${job.id}_queue_staged`,
            eventTitle: "Queued automatic apply staged",
            jobId: job.id,
            lastActionLabel: run.summary,
            nextActionLabel: "Review the queued run approval in Applications.",
            updatedAt: createdAt,
          }),
        ),
      ]);

      return ctx.getWorkspaceSnapshot();
    },
    async approveApplyRun(runId) {
      const [runs, approvals] = await Promise.all([
        ctx.repository.listApplyRuns(),
        ctx.repository.listApplySubmitApprovals(),
      ]);
      const run = runs.find((entry) => entry.id === runId) ?? null;

      if (!run) {
        throw new Error(`Unknown apply run '${runId}'.`);
      }

      if (run.mode !== "single_job_auto" && run.mode !== "queue_auto") {
        throw new Error(`Apply run '${runId}' is not waiting on submit approval.`);
      }

      if (run.state !== "awaiting_submit_approval") {
        throw new Error(`Apply run '${runId}' is not currently awaiting submit approval.`);
      }

      if (!run.submitApprovalId) {
        throw new Error(`Apply run '${runId}' does not have a submit approval record.`);
      }

      const approval = approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

      if (!approval) {
        throw new Error(`Missing submit approval '${run.submitApprovalId}' for run '${runId}'.`);
      }

      if (approval.status !== "pending") {
        throw new Error(
          `Submit approval for run '${runId}' is already ${approval.status}.`,
        );
      }

      const now = new Date().toISOString();
      const updatedApproval = ApplySubmitApprovalSchema.parse({
        ...approval,
        status: "approved",
        approvedAt: now,
        revokedAt: null,
        detail:
          "Submit approval was recorded for this run. Final submit remains disabled in the current safe development slice.",
      });
      const updatedRun = ApplyRunSchema.parse({
        ...run,
        state: "paused_for_user_review",
        updatedAt: now,
        summary: "Submit approval captured for this automatic apply run.",
        detail:
          "This run is approved for later submit-enabled execution, but the current safe implementation still stops before the final submit action.",
      });

      await Promise.all([
        ctx.repository.upsertApplySubmitApproval(updatedApproval),
        ctx.repository.upsertApplyRun(updatedRun),
      ]);

      await executeSafeApplyRun({
        mode: run.mode,
        runId,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async cancelApplyRun(runId) {
      const [runs, applicationRecords] = await Promise.all([
        ctx.repository.listApplyRuns(),
        ctx.repository.listApplicationRecords(),
      ]);
      const run = runs.find((entry) => entry.id === runId) ?? null;

      if (!run) {
        throw new Error(`Unknown apply run '${runId}'.`);
      }

      if (run.state === "completed" || run.state === "cancelled") {
        throw new Error(`Apply run '${runId}' can no longer be cancelled.`);
      }

      const now = new Date().toISOString();
      const updatedRun = ApplyRunSchema.parse({
        ...run,
        state: "cancelled",
        updatedAt: now,
        completedAt: now,
        summary: "Automatic apply run cancelled.",
        detail:
          "The queued run was cancelled before final submit. Any completed preparation artifacts remain available for review.",
      });
      await ctx.repository.upsertApplyRun(updatedRun);

      await Promise.all(
        run.jobIds.map(async (jobId) => {
          const existingRecord = applicationRecords.find(
            (record) => record.jobId === jobId,
          );

          if (!existingRecord) {
            return;
          }

          await ctx.repository.upsertApplicationRecord(
            ApplicationRecordSchema.parse({
              ...existingRecord,
              lastActionLabel: updatedRun.summary,
              nextActionLabel: "Restart the run if you want to continue later.",
              lastUpdatedAt: now,
              events: mergeEvents(existingRecord.events, [
                {
                  id: `event_${run.id}_${jobId}_cancelled`,
                  at: now,
                  title: "Automatic apply run cancelled",
                  detail:
                    "The queued run was cancelled before any final submit action. Retained review data remains available.",
                  emphasis: "warning",
                },
              ]),
            }),
          );
        }),
      );

      return ctx.getWorkspaceSnapshot();
    },
    async resolveApplyConsentRequest(requestId, action) {
      const [requests, runs, results, approvals, applicationRecords] = await Promise.all([
        ctx.repository.listApplicationConsentRequests(),
        ctx.repository.listApplyRuns(),
        ctx.repository.listApplyJobResults(),
        ctx.repository.listApplySubmitApprovals(),
        ctx.repository.listApplicationRecords(),
      ]);
      const request = requests.find((entry) => entry.id === requestId) ?? null;

      if (!request) {
        throw new Error(`Unknown consent request '${requestId}'.`);
      }

      if (request.status !== "pending") {
        throw new Error(`Consent request '${requestId}' is already ${request.status}.`);
      }

      const run = runs.find((entry) => entry.id === request.runId) ?? null;

      if (!run) {
        throw new Error(`Unknown apply run '${request.runId}' for consent request '${requestId}'.`);
      }

      const now = new Date().toISOString();
      const updatedRequest = ApplicationConsentRequestSchema.parse({
        ...request,
        status: action === "approve" ? "approved" : "declined",
        decidedAt: now,
      });
      await ctx.repository.upsertApplicationConsentRequest(updatedRequest);

      const relatedResult = results.find(
        (entry) => entry.runId === request.runId && entry.jobId === request.jobId,
      );

      if (action === "decline") {
        if (relatedResult) {
          await ctx.repository.upsertApplyJobResult(
            ApplyJobResultSchema.parse({
              ...relatedResult,
              state: "skipped",
              summary: "Job skipped after consent was declined.",
              detail:
                "The queued run skipped this job because the required consent step was declined.",
              updatedAt: now,
              completedAt: now,
              blockerReason: "signup_consent_required",
              blockerSummary: "Consent was declined for this job.",
              pendingConsentRequestCount: 0,
            }),
          );
        }

        const remainingJobs = run.jobIds.filter((jobId) => {
          if (jobId === request.jobId) {
            return false;
          }

          const result = results.find(
            (entry) => entry.runId === run.id && entry.jobId === jobId,
          );
          return !result || result.state === "planned";
        });
        const updatedRun = ApplyRunSchema.parse({
          ...run,
          state: remainingJobs.length > 0 ? "running" : "completed",
          updatedAt: now,
          completedAt: remainingJobs.length > 0 ? null : now,
          currentJobId: remainingJobs[0] ?? null,
          pendingJobs: remainingJobs.length,
          skippedJobs: run.skippedJobs + 1,
          blockedJobs: Math.max(0, run.blockedJobs - 1),
          summary:
            remainingJobs.length > 0
              ? "Consent declined. The queue skipped this job and continued."
              : "Consent declined. The queue finished after skipping the blocked job.",
          detail:
            "The consent-gated job was skipped because consent was declined. The queue remains safe and non-submitting.",
        });
        await ctx.repository.upsertApplyRun(updatedRun);

        const existingRecord = applicationRecords.find(
          (record) => record.jobId === request.jobId,
        );

        if (existingRecord) {
          await ctx.repository.upsertApplicationRecord(
            ApplicationRecordSchema.parse({
              ...existingRecord,
              lastActionLabel: updatedRun.summary,
              nextActionLabel:
                remainingJobs.length > 0
                  ? "The queue skipped this job after the declined consent."
                  : "Restart the run if you want to try again later.",
              lastUpdatedAt: now,
              events: mergeEvents(existingRecord.events, [
                {
                  id: `event_${run.id}_${request.jobId}_consent_declined`,
                  at: now,
                  title: "Consent declined",
                  detail:
                    "The consent-gated branch was declined, so this job was skipped without any final submit action.",
                  emphasis: "warning",
                },
              ]),
            }),
          );
        }

        if (run.mode === "queue_auto" && remainingJobs.length > 0) {
          const approval = approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;
          if (approval?.status === "approved") {
            await executeSafeApplyRun({
              mode: "queue_auto",
              runId: run.id,
            });
          }
        }

        return ctx.getWorkspaceSnapshot();
      }

      if (relatedResult) {
        await ctx.repository.upsertApplyJobResult(
          ApplyJobResultSchema.parse({
            ...relatedResult,
            state: "awaiting_review",
            summary: "Consent approved and the job stayed prepared for review.",
            detail:
              "The consent-gated branch was approved. This safe build keeps the job in a review-ready state and still stops before final submit.",
            updatedAt: now,
            completedAt: now,
            blockerReason: null,
            blockerSummary: null,
            pendingConsentRequestCount: 0,
          }),
        );
      }

      const remainingJobs = run.jobIds.filter((jobId) => {
        const result = results.find(
          (entry) => entry.runId === run.id && entry.jobId === jobId,
        );
        if (!result) {
          return jobId !== request.jobId;
        }

        return result.state === "planned" && jobId !== request.jobId;
      });

      await ctx.repository.upsertApplyRun(
        ApplyRunSchema.parse({
          ...run,
          state:
            run.mode === "queue_auto" && remainingJobs.length > 0
              ? "running"
              : "paused_for_user_review",
          updatedAt: now,
          currentJobId: remainingJobs[0] ?? request.jobId,
          pendingJobs: remainingJobs.length,
          blockedJobs: Math.max(0, run.blockedJobs - 1),
          summary:
            run.mode === "queue_auto" && remainingJobs.length > 0
              ? "Consent approved. The queue resumed in safe review mode."
              : "Consent approved. The job stayed prepared for review.",
          detail:
            "The consent-gated job can continue in safe review mode, still without any final submit action.",
        }),
      );

      const existingRecord = applicationRecords.find(
        (record) => record.jobId === request.jobId,
      );

      if (existingRecord) {
        await ctx.repository.upsertApplicationRecord(
          ApplicationRecordSchema.parse({
            ...existingRecord,
            lastActionLabel:
              run.mode === "queue_auto" && remainingJobs.length > 0
                ? "Consent approved. The queue resumed in safe review mode."
                : "Consent approved. The job stayed prepared for review.",
            nextActionLabel:
              run.mode === "queue_auto" && remainingJobs.length > 0
                ? "The queue continued with the remaining jobs."
                : "Review the prepared application before any later execution step.",
            lastUpdatedAt: now,
            events: mergeEvents(existingRecord.events, [
              {
                id: `event_${run.id}_${request.jobId}_consent_approved`,
                at: now,
                title: "Consent approved",
                detail:
                  "The consent-gated branch was approved. The current safe build still stops before final submit.",
                emphasis: "positive",
              },
            ]),
          }),
        );
      }

      if (run.mode === "queue_auto" && remainingJobs.length > 0) {
        await executeSafeApplyRun({
          mode: run.mode,
          runId: run.id,
        });
      }

      return ctx.getWorkspaceSnapshot();
    },
    async revokeApplyRunApproval(runId) {
      const [runs, approvals, applicationRecords] = await Promise.all([
        ctx.repository.listApplyRuns(),
        ctx.repository.listApplySubmitApprovals(),
        ctx.repository.listApplicationRecords(),
      ]);
      const run = runs.find((entry) => entry.id === runId) ?? null;

      if (!run) {
        throw new Error(`Unknown apply run '${runId}'.`);
      }

      if (run.mode !== "single_job_auto" && run.mode !== "queue_auto") {
        throw new Error(`Apply run '${runId}' is not waiting on submit approval.`);
      }

      if (run.state !== "awaiting_submit_approval") {
        throw new Error(`Cannot revoke approval for run '${runId}' in state '${run.state}'.`);
      }

      if (!run.submitApprovalId) {
        throw new Error(`Apply run '${runId}' does not have a submit approval record.`);
      }

      const approval = approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

      if (!approval) {
        throw new Error(`Missing submit approval '${run.submitApprovalId}' for run '${runId}'.`);
      }

      if (approval.status !== "approved") {
        throw new Error(
          `Submit approval for run '${runId}' can only be revoked after approval.`,
        );
      }

      const now = new Date().toISOString();
      const revokedApproval = ApplySubmitApprovalSchema.parse({
        ...approval,
        status: "revoked",
        revokedAt: now,
        detail:
          "Submit approval was revoked before any submit-enabled execution started.",
      });
      const replacementApproval = ApplySubmitApprovalSchema.parse({
        id: createUniqueId("apply_submit_approval"),
        runId: run.id,
        mode: run.mode,
        jobIds: approval.jobIds,
        status: "pending",
        createdAt: now,
        approvedAt: null,
        revokedAt: null,
        expiresAt: null,
        detail:
          "Submit approval must be re-granted before any later submit-enabled execution can continue.",
      });
      const updatedRun = ApplyRunSchema.parse({
        ...run,
        state: "awaiting_submit_approval",
        submitApprovalId: replacementApproval.id,
        updatedAt: now,
        summary: "Submit approval revoked for this automatic apply run.",
        detail:
          "This run is back in a pending-approval state. Final submit remains disabled in the current safe development slice.",
      });

      await Promise.all([
        ctx.repository.upsertApplySubmitApproval(revokedApproval),
        ctx.repository.upsertApplySubmitApproval(replacementApproval),
        ctx.repository.upsertApplyRun(updatedRun),
      ]);

      if (run.currentJobId) {
        const existingRecord = applicationRecords.find(
          (record) => record.jobId === run.currentJobId,
        );

        if (existingRecord) {
          await ctx.repository.upsertApplicationRecord(
            ApplicationRecordSchema.parse({
              ...existingRecord,
              lastActionLabel: updatedRun.summary,
              nextActionLabel: "Re-approve this run before any later submit-enabled execution.",
              lastUpdatedAt: now,
              events: mergeEvents(existingRecord.events, [
                {
                  id: `event_${run.id}_approval_revoked`,
                  at: now,
                  title: "Submit approval revoked",
                  detail:
                    "The run no longer has submit approval and must be re-approved before any later execution step.",
                  emphasis: "warning",
                },
              ]),
            }),
          );
        }
      }

      return ctx.getWorkspaceSnapshot();
    },
  };
}
