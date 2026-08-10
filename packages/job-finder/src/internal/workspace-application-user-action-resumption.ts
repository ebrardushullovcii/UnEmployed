import type { ExecuteApplicationFlowInput } from "@unemployed/browser-runtime";
import {
  ApplyExecutionResultSchema,
  ApplyJobResultSchema,
  ApplyRecoveryContextSchema,
  ApplicationAttemptConsentDecisionSchema,
  ApplicationAttemptQuestionSchema,
  ApplicationAttemptSchema,
  UserActionVerificationResultSchema,
  ApplicationRecordSchema,
  type ApplicationAttempt,
  type ApplicationResumeArtifact,
  type ApplyExecutionResult,
  type ApplyJobResult,
  type ApplyRun,
  type JobSource,
  type SavedJob,
  type UserActionRequest,
} from "@unemployed/contracts";
import { reduceUserActionVerification } from "../user-action-domain";

import {
  buildApplicationBlockerFingerprint,
  isApplicationAuthenticationUserActionKind,
  isApplicationPrepareOnlyUserAction,
  persistApplicationUserAction,
} from "./workspace-application-user-action";
import {
  enforcePrepareOnlyExecutionResult,
  mapExecutionResultToApplyBlockerReason,
  mapExecutionResultToApplyJobState,
} from "./workspace-apply-run-support";
import {
  buildConsentSummary,
  buildEvidenceRefIdsFromInstruction,
  buildLatestBlockerSummary,
  buildQuestionSummary,
  buildReplaySummary,
  mergeAttemptBlocker,
  mergeAttemptReplay,
} from "./workspace-application-attempt-support";
import {
  buildInstructionGuidance,
  mergeEvents,
  resolveActiveSourceInstructionArtifact,
} from "./workspace-helpers";
import { uniqueStrings } from "./shared";
import { mergeApplicationAnswersIntoExecutionProfile } from "./workspace-application-answer-execution";
import { resolveApplicationAttachmentsForExecution } from "./workspace-application-attachments";
import type { WorkspaceServiceContext } from "./workspace-service-context";

type ExactApplicationScope = {
  runId: string;
  jobId: string;
  resultId: string;
  replayCheckpointId: string;
  source: JobSource;
};

type ApplicationPrerequisites = {
  job: SavedJob;
  resumeArtifact: ApplicationResumeArtifact;
};

type ApplicationResumptionDependencies = {
  resolveJobApplyPrerequisites(
    jobId: string,
  ): Promise<ApplicationPrerequisites>;
};

type ApplicationResumptionLineage = {
  run: ApplyRun;
  result: ApplyJobResult;
  checkpoint: Awaited<
    ReturnType<
      WorkspaceServiceContext["repository"]["listApplicationReplayCheckpoints"]
    >
  >[number];
  job: SavedJob;
};

function getExactApplicationScope(
  request: UserActionRequest,
): ExactApplicationScope | null {
  const isResolvedSourceAccess =
    request.state === "resolved" &&
    request.verification.type === "source_access" &&
    isApplicationAuthenticationUserActionKind(request.kind);
  const isPrepareOnlyVerification =
    isApplicationPrepareOnlyUserAction(request) &&
    (request.state === "verifying" || request.state === "resolved");

  if (
    request.scope.type !== "application" ||
    !request.scope.resultId ||
    !request.scope.replayCheckpointId ||
    (!isResolvedSourceAccess && !isPrepareOnlyVerification)
  ) {
    return null;
  }

  return {
    runId: request.scope.runId,
    jobId: request.scope.jobId,
    resultId: request.scope.resultId,
    replayCheckpointId: request.scope.replayCheckpointId,
    source: request.scope.source,
  };
}

function getResumptionRequestRevision(request: UserActionRequest): number {
  return request.state === "verifying"
    ? request.revision + 1
    : request.revision;
}

function getResumptionAttemptId(request: UserActionRequest): string {
  return `application_user_action_resume_${request.id}_r${getResumptionRequestRevision(request)}`;
}

function getVerificationEventId(request: UserActionRequest): string {
  const verificationRevision =
    request.state === "verifying" ? request.revision : request.revision - 1;
  return `verification:${request.id}:r${verificationRevision}`;
}

function hasMatchingResumptionLineage(input: {
  attempt: ApplicationAttempt;
  request: UserActionRequest;
  scope: ExactApplicationScope;
}): boolean {
  const resumption = input.attempt.userActionResumption;
  return Boolean(
    resumption &&
    resumption.requestId === input.request.id &&
    resumption.requestRevision ===
      getResumptionRequestRevision(input.request) &&
    resumption.verificationEventId === getVerificationEventId(input.request) &&
    resumption.runId === input.scope.runId &&
    resumption.jobId === input.scope.jobId &&
    resumption.resultId === input.scope.resultId &&
    resumption.replayCheckpointId === input.scope.replayCheckpointId &&
    input.attempt.jobId === input.scope.jobId,
  );
}

function createResumptionAttempt(input: {
  request: UserActionRequest;
  scope: ExactApplicationScope;
  existingAttempt: ApplicationAttempt | null;
  now: string;
  state: ApplicationAttempt["state"];
  summary: string;
  detail: string;
  completed: boolean;
  executionResult?: ApplyExecutionResult;
}): ApplicationAttempt {
  const executionResult = input.executionResult;
  const completedState =
    executionResult?.state === "not_started" ||
    executionResult?.state === "ready" ||
    executionResult?.state === "in_progress"
      ? "paused"
      : (executionResult?.state ?? input.state);

  return ApplicationAttemptSchema.parse({
    id: getResumptionAttemptId(input.request),
    jobId: input.scope.jobId,
    state: input.completed ? completedState : input.state,
    summary: input.summary,
    detail: input.detail,
    startedAt: input.existingAttempt?.startedAt ?? input.now,
    updatedAt: input.now,
    completedAt: input.completed ? input.now : null,
    outcome: executionResult?.outcome ?? input.existingAttempt?.outcome ?? null,
    checkpoints:
      executionResult?.checkpoints ?? input.existingAttempt?.checkpoints ?? [],
    questions: (
      executionResult?.questions ??
      input.existingAttempt?.questions ??
      []
    ).map((question) => ApplicationAttemptQuestionSchema.parse(question)),
    blocker: executionResult?.blocker ?? input.existingAttempt?.blocker ?? null,
    consentDecisions: (
      executionResult?.consentDecisions ??
      input.existingAttempt?.consentDecisions ??
      []
    ).map((decision) =>
      ApplicationAttemptConsentDecisionSchema.parse(decision),
    ),
    replay: executionResult?.replay ?? input.existingAttempt?.replay ?? {},
    visualEvidence:
      executionResult?.visualEvidence ??
      input.existingAttempt?.visualEvidence ??
      [],
    visualObservationSets:
      executionResult?.visualObservationSets ??
      input.existingAttempt?.visualObservationSets ??
      [],
    visualCheckpoints:
      executionResult?.visualCheckpoints ??
      input.existingAttempt?.visualCheckpoints ??
      [],
    nextActionLabel:
      executionResult?.nextActionLabel ??
      input.existingAttempt?.nextActionLabel ??
      null,
    executionTimings:
      executionResult?.executionTimings ??
      input.existingAttempt?.executionTimings ??
      [],
    userActionResumption: {
      requestId: input.request.id,
      requestRevision: getResumptionRequestRevision(input.request),
      verificationEventId: getVerificationEventId(input.request),
      runId: input.scope.runId,
      jobId: input.scope.jobId,
      resultId: input.scope.resultId,
      replayCheckpointId: input.scope.replayCheckpointId,
    },
  });
}

function buildRecoveryInstructions(input: {
  checkpointLabel: string;
  checkpointDetail: string | null;
  checkpointUrl: string | null;
  blockerSummary: string | null;
}): string[] {
  return uniqueStrings(
    [
      `Resume only the verified application checkpoint: ${input.checkpointLabel}.`,
      input.checkpointDetail
        ? `Recovery detail: ${input.checkpointDetail}`
        : null,
      input.checkpointUrl
        ? `Return to this exact retained apply URL when it still matches the current flow: ${input.checkpointUrl}`
        : null,
      input.blockerSummary
        ? `The prior browser-owned blocker was: ${input.blockerSummary}`
        : null,
    ].filter((value): value is string => Boolean(value)),
  );
}

function buildVisualExecutionOptions(input: {
  ctx: WorkspaceServiceContext;
  enabled: boolean;
  source: JobSource;
}):
  | Pick<
      ExecuteApplicationFlowInput,
      "captureVisualSnapshot" | "analyzeVisualSnapshot"
    >
  | Record<string, never> {
  if (
    !input.enabled ||
    !input.ctx.browserRuntime.captureVisualSnapshot ||
    !input.ctx.aiClient.analyzeBrowserVisualSnapshot
  ) {
    return {};
  }

  const captureVisualSnapshot =
    input.ctx.browserRuntime.captureVisualSnapshot.bind(
      input.ctx.browserRuntime,
    );
  const analyzeVisualSnapshot =
    input.ctx.aiClient.analyzeBrowserVisualSnapshot.bind(input.ctx.aiClient);

  return {
    captureVisualSnapshot: (request) =>
      captureVisualSnapshot(input.source, request),
    analyzeVisualSnapshot,
  };
}

function getPersistedResultAttemptState(
  result: ApplyJobResult,
): ApplicationAttempt["state"] {
  switch (result.state) {
    case "submitted":
      return "failed";
    case "failed":
      return "failed";
    case "blocked":
      return "unsupported";
    default:
      return "paused";
  }
}

function getResultCompletedAt(input: {
  executionResult: ApplyExecutionResult;
  now: string;
}): string | null {
  return input.executionResult.state === "failed" ||
    input.executionResult.state === "unsupported"
    ? input.now
    : null;
}

function createFailedExecutionResult(error: unknown): ApplyExecutionResult {
  return ApplyExecutionResultSchema.parse({
    state: "failed",
    summary: "Application retry stopped safely",
    detail:
      error instanceof Error
        ? error.message
        : "The scoped application retry failed for an unknown reason.",
    submittedAt: null,
    outcome: null,
    checkpoints: [],
    questions: [],
    blocker: null,
    consentDecisions: [],
    replay: {},
    visualEvidence: [],
    visualObservationSets: [],
    visualCheckpoints: [],
    nextActionLabel: "Start Apply Copilot again when you are ready.",
    executionTimings: [],
  });
}

function getPrepareOnlyVerificationOutcome(
  request: UserActionRequest,
  executionResult: ApplyExecutionResult,
): "verified" | "still_blocked" | null {
  if (
    request.state !== "verifying" ||
    !isApplicationPrepareOnlyUserAction(request)
  ) {
    return null;
  }

  if (
    executionResult.state === "failed" ||
    executionResult.state === "unsupported" ||
    executionResult.state === "submitted" ||
    executionResult.submittedAt !== null
  ) {
    return "still_blocked";
  }

  const expectedFingerprint =
    request.verification.type === "page_blocker_absent"
      ? request.verification.blockerFingerprint
      : null;
  if (expectedFingerprint === null) return null;

  return executionResult.blocker === null ||
    buildApplicationBlockerFingerprint(executionResult.blocker) !==
      expectedFingerprint
    ? "verified"
    : "still_blocked";
}

async function settlePrepareOnlyVerification(input: {
  ctx: WorkspaceServiceContext;
  outcome: "verified" | "still_blocked";
  request: UserActionRequest;
}): Promise<UserActionRequest | null> {
  if (
    input.request.state !== "verifying" ||
    !isApplicationPrepareOnlyUserAction(input.request)
  ) {
    return null;
  }

  const currentRequest = await input.ctx.repository.getUserActionRequest(
    input.request.id,
  );
  if (
    !currentRequest ||
    currentRequest.state !== "verifying" ||
    currentRequest.revision !== input.request.revision
  ) {
    return null;
  }

  const checkedAt = new Date().toISOString();
  const reduction = reduceUserActionVerification(
    currentRequest,
    UserActionVerificationResultSchema.parse({
      requestId: currentRequest.id,
      verificationId: getVerificationEventId(currentRequest),
      expectedRevision: currentRequest.revision,
      outcome: input.outcome,
      checkedAt,
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
    }),
  );

  if (reduction.status === "stale" || !reduction.event) {
    return null;
  }

  const commit = await input.ctx.repository.commitUserActionTransition({
    request: reduction.request,
    event: reduction.event,
  });
  return commit.request;
}

async function readExactLineage(input: {
  ctx: WorkspaceServiceContext;
  scope: ExactApplicationScope;
}): Promise<
  | { status: "current"; lineage: ApplicationResumptionLineage }
  | { status: "stale"; detail: string }
> {
  const [runs, results, checkpoints, savedJobs] = await Promise.all([
    input.ctx.repository.listApplyRuns({ id: input.scope.runId }),
    input.ctx.repository.listApplyJobResults({
      runId: input.scope.runId,
      jobId: input.scope.jobId,
    }),
    input.ctx.repository.listApplicationReplayCheckpoints({
      runId: input.scope.runId,
      jobId: input.scope.jobId,
      resultId: input.scope.resultId,
    }),
    input.ctx.repository.listSavedJobs(),
  ]);
  const run = runs.find((entry) => entry.id === input.scope.runId) ?? null;
  const result =
    results.find((entry) => entry.id === input.scope.resultId) ?? null;
  const checkpoint =
    checkpoints.find((entry) => entry.id === input.scope.replayCheckpointId) ??
    null;
  const job = savedJobs.find((entry) => entry.id === input.scope.jobId) ?? null;

  if (!run || !run.jobIds.includes(input.scope.jobId)) {
    return {
      status: "stale",
      detail: "The exact apply run no longer owns this job.",
    };
  }
  if (run.state === "cancelled" || run.state === "failed") {
    return {
      status: "stale",
      detail: `The exact apply run is already ${run.state}.`,
    };
  }
  if (!result || results.length !== 1) {
    return {
      status: "stale",
      detail:
        "The exact apply result is no longer current for this run and job.",
    };
  }
  if (result.latestCheckpointId !== input.scope.replayCheckpointId) {
    return {
      status: "stale",
      detail:
        "A newer or different application checkpoint replaced the verified checkpoint.",
    };
  }
  if (
    !checkpoint ||
    checkpoint.runId !== input.scope.runId ||
    checkpoint.jobId !== input.scope.jobId ||
    checkpoint.resultId !== input.scope.resultId
  ) {
    return {
      status: "stale",
      detail:
        "The verified replay checkpoint no longer matches the exact application lineage.",
    };
  }
  if (!job || job.source !== input.scope.source) {
    return {
      status: "stale",
      detail:
        "The saved job or its source changed after the user-action request was created.",
    };
  }

  return {
    status: "current",
    lineage: { run, result, checkpoint, job },
  };
}

async function persistApplicationRecord(input: {
  ctx: WorkspaceServiceContext;
  job: SavedJob;
  attempt: ApplicationAttempt;
  eventId: string;
  now: string;
}): Promise<void> {
  const records = await input.ctx.repository.listApplicationRecords();
  const existing =
    records.find((record) => record.jobId === input.job.id) ?? null;
  const emphasis =
    input.attempt.state === "failed"
      ? "critical"
      : input.attempt.state === "paused" ||
          input.attempt.state === "unsupported"
        ? "warning"
        : "neutral";

  await input.ctx.repository.upsertApplicationRecord(
    ApplicationRecordSchema.parse({
      id: existing?.id ?? `application_${input.job.id}`,
      jobId: input.job.id,
      title: input.job.title,
      company: input.job.company,
      status: existing?.status ?? input.job.status,
      lastActionLabel: input.attempt.summary,
      nextActionLabel: input.attempt.nextActionLabel,
      lastUpdatedAt: input.now,
      lastAttemptState: input.attempt.state,
      questionSummary: buildQuestionSummary(input.attempt.questions),
      latestBlocker: buildLatestBlockerSummary(input.attempt.blocker),
      consentSummary: buildConsentSummary(input.attempt.consentDecisions),
      replaySummary: buildReplaySummary(
        input.attempt.replay,
        input.attempt.visualEvidence,
      ),
      events: mergeEvents(existing?.events ?? [], [
        {
          id: input.eventId,
          at: input.now,
          title: input.attempt.summary,
          detail: input.attempt.detail,
          emphasis,
        },
      ]),
    }),
  );
}

export function createApplicationUserActionResumer(
  ctx: WorkspaceServiceContext,
  dependencies: ApplicationResumptionDependencies,
): (request: UserActionRequest) => Promise<void> {
  return async (requestInput) => {
    const request = requestInput;
    const scope = getExactApplicationScope(request);
    if (!scope) return;
    const isPrepareOnlyVerification =
      request.state === "verifying" &&
      isApplicationPrepareOnlyUserAction(request);

    const verificationEventId = getVerificationEventId(request);
    const requestEvents = await ctx.repository.listUserActionEvents({
      requestId: request.id,
    });
    const hasTransitionEvidence =
      request.state === "verifying"
        ? requestEvents.some(
            (event) =>
              (event.operation === "confirm_done" ||
                event.operation === "submit_manual_answer" ||
                event.operation === "record_legal_decision") &&
              event.resultingRevision === request.revision,
          )
        : requestEvents.some(
            (event) =>
              event.operation === "verification_succeeded" &&
              event.id === verificationEventId &&
              event.resultingRevision === request.revision,
          );
    if (!hasTransitionEvidence) return;

    const attemptId = getResumptionAttemptId(request);
    const attempts = await ctx.repository.listApplicationAttempts();
    const existingAttempt =
      attempts.find((attempt) => attempt.id === attemptId) ?? null;

    if (
      existingAttempt &&
      !hasMatchingResumptionLineage({
        attempt: existingAttempt,
        request,
        scope,
      })
    ) {
      throw new Error(
        `Application resumption attempt '${attemptId}' has conflicting lineage.`,
      );
    }
    if (existingAttempt?.completedAt) return;

    const scheduledAt = new Date().toISOString();
    const scheduledAttempt = createResumptionAttempt({
      request,
      scope,
      existingAttempt,
      now: scheduledAt,
      state: "in_progress",
      summary: isPrepareOnlyVerification
        ? "Checking the completed browser step once"
        : "Verified sign-in; retrying this application once",
      detail:
        "Job Finder scheduled one prepare-only retry for the exact application checkpoint. Final submission and account creation remain disabled.",
      completed: false,
    });
    let ownsClaim = false;
    if (!existingAttempt) {
      ownsClaim =
        await ctx.repository.claimApplicationAttempt(scheduledAttempt);
      if (!ownsClaim) {
        const claimedAttempt = (
          await ctx.repository.listApplicationAttempts()
        ).find((attempt) => attempt.id === attemptId);
        if (
          claimedAttempt &&
          !hasMatchingResumptionLineage({
            attempt: claimedAttempt,
            request,
            scope,
          })
        ) {
          throw new Error(
            `Application resumption attempt '${attemptId}' has conflicting lineage.`,
          );
        }
        return;
      }
    }

    const lineageResult = await readExactLineage({ ctx, scope });
    if (lineageResult.status === "stale") {
      const staleAt = new Date().toISOString();
      await settlePrepareOnlyVerification({
        ctx,
        outcome: "still_blocked",
        request,
      });
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: staleAt,
          state: "unsupported",
          summary: "Application retry skipped because its checkpoint changed",
          detail: lineageResult.detail,
          completed: true,
        }),
      );
      return;
    }

    const { run, result, checkpoint, job } = lineageResult.lineage;
    if (
      !isPrepareOnlyVerification &&
      result.blockerReason !== "auth_required"
    ) {
      const completedAt = new Date().toISOString();
      if (result.lastUserActionResumptionId !== attemptId) {
        await ctx.repository.upsertApplicationAttempt(
          createResumptionAttempt({
            request,
            scope,
            existingAttempt: existingAttempt ?? scheduledAttempt,
            now: completedAt,
            state: "unsupported",
            summary: "Application retry skipped because its result changed",
            detail:
              "The exact result changed without this resumption receipt, so Job Finder did not attribute or repeat another application flow.",
            completed: true,
          }),
        );
        return;
      }
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: completedAt,
          state: getPersistedResultAttemptState(result),
          summary: result.summary,
          detail: result.detail,
          completed: true,
        }),
      );
      return;
    }

    if (!ownsClaim) {
      return;
    }

    let prerequisites: ApplicationPrerequisites;
    try {
      prerequisites = await dependencies.resolveJobApplyPrerequisites(
        scope.jobId,
      );
    } catch (error) {
      const staleAt = new Date().toISOString();
      await settlePrepareOnlyVerification({
        ctx,
        outcome: "still_blocked",
        request,
      });
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: staleAt,
          state: "unsupported",
          summary: "Application retry could not reuse its approved resume",
          detail:
            error instanceof Error
              ? error.message
              : "The approved resume prerequisite changed before retry.",
          completed: true,
        }),
      );
      return;
    }

    if (
      prerequisites.job.id !== scope.jobId ||
      prerequisites.job.source !== scope.source
    ) {
      const staleAt = new Date().toISOString();
      await settlePrepareOnlyVerification({
        ctx,
        outcome: "still_blocked",
        request,
      });
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: staleAt,
          state: "unsupported",
          summary: "Application retry skipped because its saved job changed",
          detail:
            "The resolved resume prerequisites no longer match the exact job and source from the verified user-action request.",
          completed: true,
        }),
      );
      return;
    }

    const [
      profile,
      settings,
      searchPreferences,
      instructionArtifacts,
      debugAttempts,
    ] = await Promise.all([
      ctx.repository.getProfile(),
      ctx.repository.getSettings(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.listSourceInstructionArtifacts(),
      ctx.repository.listSourceDebugAttempts(),
    ]);
    const [answerRecords, questionRecords] = await Promise.all([
      ctx.repository.listApplicationAnswerRecords({
        runId: scope.runId,
        jobId: scope.jobId,
        resultId: scope.resultId,
      }),
      ctx.repository.listApplicationQuestionRecords({
        runId: scope.runId,
        jobId: scope.jobId,
        resultId: scope.resultId,
      }),
    ]);
    const executionProfile = mergeApplicationAnswersIntoExecutionProfile({
      profile,
      answerRecords,
      questionRecords,
      idPrefix: `application_${request.id}`,
    });
    const provenanceTargetId =
      job.provenance.at(-1)?.targetId ?? job.provenance[0]?.targetId ?? null;
    const provenanceTarget = provenanceTargetId
      ? (searchPreferences.discovery.targets.find(
          (target) => target.id === provenanceTargetId,
        ) ?? null)
      : null;
    const activeInstruction = provenanceTarget
      ? resolveActiveSourceInstructionArtifact(
          provenanceTarget,
          instructionArtifacts,
        )
      : null;
    const recoveryContext = ApplyRecoveryContextSchema.parse({
      previousRunId: run.id,
      previousResultId: result.id,
      previousRunMode: run.mode,
      previousRunState: run.state,
      latestCheckpoint: {
        label: checkpoint.label,
        detail: checkpoint.detail,
        url: checkpoint.url,
        jobState: checkpoint.jobState,
        createdAt: checkpoint.createdAt,
      },
      checkpointUrls: checkpoint.url ? [checkpoint.url] : [],
      blockerSummary: result.blockerSummary,
      retainedVisualEvidence: checkpoint.visualEvidence.filter(
        (evidence) => evidence.retention !== "temporary",
      ),
    });
    const instructions = uniqueStrings([
      ...buildInstructionGuidance(activeInstruction),
      ...buildRecoveryInstructions({
        checkpointLabel: checkpoint.label,
        checkpointDetail: checkpoint.detail,
        checkpointUrl: checkpoint.url,
        blockerSummary: result.blockerSummary,
      }),
    ]);

    let executionResult: ApplyExecutionResult;
    try {
      const applicationAttachments =
        await resolveApplicationAttachmentsForExecution({
          resolver: ctx.candidateAssetResolver,
          answerRecords,
          questionRecords,
        });
      const rawResult = enforcePrepareOnlyExecutionResult(
        await ctx.browserRuntime.executeApplicationFlow(scope.source, {
          job: prerequisites.job,
          resumeArtifact: prerequisites.resumeArtifact,
          profile: executionProfile,
          ...(applicationAttachments.length > 0
            ? { applicationAttachments }
            : {}),
          settings,
          mode: "prepare_only",
          idempotencyKey: attemptId,
          accountCreationAuthorized: false,
          intermediateMutationsAuthorized: true,
          submitAuthorized: false,
          recoveryContext,
          ...(instructions.length > 0 ? { instructions } : {}),
          ...buildVisualExecutionOptions({
            ctx,
            enabled: run.visualCheckpointsEnabled,
            source: scope.source,
          }),
        }),
      );

      const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
        activeInstruction,
        sourceDebugAttempts: debugAttempts,
      });
      executionResult = ApplyExecutionResultSchema.parse({
        ...rawResult,
        blocker: mergeAttemptBlocker({
          blocker: rawResult.blocker,
          sourceDebugEvidenceRefIds,
          defaultUrl: job.applicationUrl ?? job.canonicalUrl,
        }),
        replay: mergeAttemptReplay({
          replay: rawResult.replay,
          activeInstruction,
          sourceDebugEvidenceRefIds,
          fallbackUrl: job.applicationUrl ?? job.canonicalUrl,
        }),
        submittedAt: null,
      });
    } catch (error) {
      executionResult = createFailedExecutionResult(error);
    }

    const refreshedLineage = await readExactLineage({ ctx, scope });
    if (refreshedLineage.status === "stale") {
      const staleAt = new Date().toISOString();
      await settlePrepareOnlyVerification({
        ctx,
        outcome: "still_blocked",
        request,
      });
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: staleAt,
          state: "unsupported",
          summary:
            "Application retry result was not saved because its checkpoint changed",
          detail: refreshedLineage.detail,
          completed: true,
        }),
      );
      return;
    }

    const currentResult = refreshedLineage.lineage.result;
    if (JSON.stringify(currentResult) !== JSON.stringify(result)) {
      const staleAt = new Date().toISOString();
      await settlePrepareOnlyVerification({
        ctx,
        outcome: "still_blocked",
        request,
      });
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: staleAt,
          state: "unsupported",
          summary:
            "Application retry result was not saved because the result changed",
          detail:
            "Another flow changed the exact result while this retry was running, so Job Finder did not overwrite it.",
          completed: true,
        }),
      );
      return;
    }
    if (
      !isPrepareOnlyVerification &&
      currentResult.blockerReason !== "auth_required"
    ) {
      const completedAt = new Date().toISOString();
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: existingAttempt ?? scheduledAttempt,
          now: completedAt,
          state:
            currentResult.lastUserActionResumptionId === attemptId
              ? getPersistedResultAttemptState(currentResult)
              : "unsupported",
          summary:
            currentResult.lastUserActionResumptionId === attemptId
              ? currentResult.summary
              : "Application retry result was not saved because the result changed",
          detail:
            currentResult.lastUserActionResumptionId === attemptId
              ? currentResult.detail
              : "Another flow changed the exact result while this retry was running, so Job Finder did not overwrite it.",
          completed: true,
        }),
      );
      return;
    }

    const verificationOutcome = getPrepareOnlyVerificationOutcome(
      request,
      executionResult,
    );
    if (verificationOutcome) {
      const settledRequest = await settlePrepareOnlyVerification({
        ctx,
        outcome: verificationOutcome,
        request,
      });
      if (!settledRequest) {
        const staleAt = new Date().toISOString();
        await ctx.repository.upsertApplicationAttempt(
          createResumptionAttempt({
            request,
            scope,
            existingAttempt: existingAttempt ?? scheduledAttempt,
            now: staleAt,
            state: "unsupported",
            summary: "Application retry stopped because the action changed",
            detail:
              "The user-action request changed while its prepare-only verification was running, so Job Finder did not claim completion.",
            completed: true,
          }),
        );
        return;
      }
      if (verificationOutcome === "still_blocked") {
        const blockedAt = new Date().toISOString();
        await ctx.repository.upsertApplicationAttempt(
          createResumptionAttempt({
            request,
            scope,
            existingAttempt: existingAttempt ?? scheduledAttempt,
            now: blockedAt,
            state: executionResult.state,
            summary: "Browser step is still blocking this application",
            detail:
              "The exact prepare-only retry found the same persisted blocker, so Job Finder kept the action open and did not claim completion.",
            completed: true,
            executionResult,
          }),
        );
        return;
      }
    }

    const completedAt = new Date().toISOString();
    const finalAttempt = createResumptionAttempt({
      request,
      scope,
      existingAttempt: existingAttempt ?? scheduledAttempt,
      now: completedAt,
      state: executionResult.state,
      summary: executionResult.summary,
      detail: executionResult.detail,
      completed: true,
      executionResult,
    });
    const isConsentBlocked =
      executionResult.blocker?.code === "missing_consent";
    const nextResultState = isConsentBlocked
      ? "blocked"
      : mapExecutionResultToApplyJobState({
          consentRequests: [],
          executionResult,
        });
    const nextResult = ApplyJobResultSchema.parse({
      ...result,
      state: nextResultState,
      summary: executionResult.summary,
      detail: executionResult.detail,
      updatedAt: completedAt,
      completedAt: getResultCompletedAt({ executionResult, now: completedAt }),
      blockerReason: mapExecutionResultToApplyBlockerReason(
        executionResult.blocker,
      ),
      blockerSummary: executionResult.blocker?.summary ?? null,
      visualObservationSets: executionResult.visualObservationSets,
      visualCheckpoints: executionResult.visualCheckpoints,
      latestQuestionCount: executionResult.questions.length,
      latestAnswerCount: executionResult.questions.reduce(
        (count, question) => count + question.suggestedAnswers.length,
        0,
      ),
      pendingConsentRequestCount: isConsentBlocked ? 1 : 0,
      latestCheckpointId: checkpoint.id,
      lastUserActionResumptionId: attemptId,
    });

    await ctx.repository.upsertApplicationAttempt({
      ...finalAttempt,
      completedAt: null,
    });
    const resultClaimed = await ctx.repository.compareAndSwapApplyJobResult({
      expected: result,
      result: nextResult,
    });
    if (!resultClaimed) {
      const staleAt = new Date().toISOString();
      await ctx.repository.upsertApplicationAttempt(
        createResumptionAttempt({
          request,
          scope,
          existingAttempt: finalAttempt,
          now: staleAt,
          state: "unsupported",
          summary:
            "Application retry result was not saved because the result changed",
          detail:
            "Another flow changed the exact result while this retry was running, so Job Finder did not overwrite it.",
          completed: true,
        }),
      );
      return;
    }
    await ctx.repository.upsertApplicationAttempt(finalAttempt);
    await persistApplicationRecord({
      ctx,
      job,
      attempt: finalAttempt,
      eventId: `event_${attemptId}`,
      now: completedAt,
    });
    await persistApplicationUserAction({
      repository: ctx.repository,
      job,
      runId: run.id,
      resultId: nextResult.id,
      resultState: nextResult.state,
      resultStartedAt: nextResult.startedAt,
      replayCheckpointId: checkpoint.id,
      blocker: executionResult.blocker,
      occurredAt: completedAt,
    });
  };
}
