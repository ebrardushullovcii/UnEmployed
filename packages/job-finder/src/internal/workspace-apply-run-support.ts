import {
  ApplicationAnswerRecordSchema,
  ApplicationRecordSchema,
  ApplyJobResultSchema,
  ApplyRunSchema,
  ApplySubmitApprovalSchema,
  ApplicationArtifactRefSchema,
  ApplicationConsentRequestSchema,
  ApplicationQuestionRecordSchema,
  ApplicationReplayCheckpointSchema,
  type ApplyExecutionResult,
  type ApplyJobResult,
  type ApplyRun,
  type JobFinderWorkspaceSnapshot,
  type SavedJob,
} from "@unemployed/contracts";

import { createUniqueId } from "./shared";

export function buildMissingResumeCopilotArtifacts(input: {
  job: SavedJob;
  detectedAt: string;
}): {
  run: ApplyRun;
  result: ApplyJobResult;
  applicationRecord: ReturnType<typeof ApplicationRecordSchema.parse>;
  questionRecord: ReturnType<typeof ApplicationQuestionRecordSchema.parse>;
  artifactRef: ReturnType<typeof ApplicationArtifactRefSchema.parse>;
  checkpoint: ReturnType<typeof ApplicationReplayCheckpointSchema.parse>;
  consentRequest: ReturnType<typeof ApplicationConsentRequestSchema.parse>;
} {
  const runId = createUniqueId("apply_run");
  const resultId = createUniqueId("apply_result");
  const questionId = createUniqueId("apply_question");
  const artifactId = createUniqueId("apply_artifact");
  const checkpointId = createUniqueId("apply_checkpoint");
  const consentRequestId = createUniqueId("apply_consent_request");
  const canonicalApplyUrl = input.job.applicationUrl ?? input.job.canonicalUrl;

  const run = ApplyRunSchema.parse({
    id: runId,
    mode: "copilot",
    state: "paused_for_consent",
    jobIds: [input.job.id],
    currentJobId: input.job.id,
    submitApprovalId: null,
    createdAt: input.detectedAt,
    updatedAt: input.detectedAt,
    completedAt: null,
    summary: `Apply copilot paused for '${input.job.title}' before any live application execution.`,
    detail:
      "The approved tailored resume is missing or stale, so the copilot run recorded a review-ready blocker instead of starting any live application flow.",
    totalJobs: 1,
    pendingJobs: 0,
    submittedJobs: 0,
    skippedJobs: 0,
    blockedJobs: 1,
    failedJobs: 0,
  });

  const result = ApplyJobResultSchema.parse({
    id: resultId,
    runId,
    jobId: input.job.id,
    queuePosition: 0,
    state: "blocked",
    summary: "Apply copilot blocked before launch.",
    detail:
      "This job does not currently have an approved, non-stale tailored resume export on disk, so the run stopped before any live application action.",
    startedAt: input.detectedAt,
    updatedAt: input.detectedAt,
    completedAt: input.detectedAt,
    blockerReason: "resume_missing",
    blockerSummary: "An approved tailored resume is required before apply copilot can start.",
    latestQuestionCount: 1,
    latestAnswerCount: 0,
    pendingConsentRequestCount: 1,
    artifactCount: 1,
    latestCheckpointId: checkpointId,
  });

  const questionRecord = ApplicationQuestionRecordSchema.parse({
    id: questionId,
    runId,
    jobId: input.job.id,
    resultId,
    prompt: "Approved tailored resume available for this job",
    kind: "resume",
    isRequired: true,
    detectedAt: input.detectedAt,
    answerOptions: [],
    suggestedAnswers: [],
    selectedAnswerId: null,
    submittedAnswer: null,
    status: "skipped",
    pageUrl: canonicalApplyUrl,
  });

  const applicationRecord = ApplicationRecordSchema.parse({
    id: `application_${input.job.id}`,
    jobId: input.job.id,
    title: input.job.title,
    company: input.job.company,
    status: input.job.status,
    lastActionLabel: result.summary,
    nextActionLabel: "Export and approve a tailored resume before retrying apply copilot.",
    lastUpdatedAt: input.detectedAt,
    lastAttemptState: null,
    questionSummary: {
      total: 1,
      required: 1,
      answered: 0,
      unansweredRequired: 1,
    },
    latestBlocker: {
      code: "missing_resume",
      summary: result.blockerSummary,
    },
    consentSummary: {
      status: "none",
      pendingCount: 0,
    },
    replaySummary: {
      lastUrl: canonicalApplyUrl,
      checkpointCount: 1,
      evidenceCount: 1,
      sourceInstructionArtifactId: null,
    },
    events: [
      {
        id: `event_${runId}_missing_resume_blocker`,
        at: input.detectedAt,
        title: "Apply copilot blocked before launch",
        detail: result.detail,
        emphasis: "critical",
      },
    ],
  });

  const artifactRef = ApplicationArtifactRefSchema.parse({
    id: artifactId,
    runId,
    jobId: input.job.id,
    resultId,
    questionId,
    kind: "field_snapshot",
    label: "Missing approved tailored resume blocker",
    createdAt: input.detectedAt,
    storagePath: null,
    url: canonicalApplyUrl,
    textSnippet: "Apply copilot stayed local and non-submitting because no approved tailored resume export was available.",
  });

  const checkpoint = ApplicationReplayCheckpointSchema.parse({
    id: checkpointId,
    runId,
    jobId: input.job.id,
    resultId,
    createdAt: input.detectedAt,
    label: "Blocked before live apply launch",
    detail:
      "The run recorded the missing-resume blocker and stayed in local non-submitting copilot mode.",
    url: canonicalApplyUrl,
    jobState: "blocked",
    artifactRefIds: [artifactId],
  });

  const consentRequest = ApplicationConsentRequestSchema.parse({
    id: consentRequestId,
    runId,
    jobId: input.job.id,
    resultId,
    kind: "resume_use",
    linkedConsentKind: "resume_use",
    label: "Approve and export a tailored resume before starting apply copilot",
    detail:
      "This non-submitting Milestone 1 run only records the prerequisite blocker. Export and approve a fresh tailored PDF before later apply-copilot slices can continue.",
    status: "pending",
    requestedAt: input.detectedAt,
    decidedAt: null,
    expiresAt: null,
  });

  return {
    run,
    result,
    applicationRecord,
    questionRecord,
    artifactRef,
    checkpoint,
    consentRequest,
  };
}

export function selectLatestApplyRunId(
  applyRuns: readonly JobFinderWorkspaceSnapshot["applyRuns"][number][],
) {
  return applyRuns.reduce<JobFinderWorkspaceSnapshot["applyRuns"][number] | null>(
    (latest, run) => {
      if (!latest) {
        return run;
      }

      const latestTimestamp = Date.parse(latest.updatedAt);
      const nextTimestamp = Date.parse(run.updatedAt);

      if (Number.isFinite(nextTimestamp) && !Number.isFinite(latestTimestamp)) {
        return run;
      }

      if (!Number.isFinite(nextTimestamp)) {
        return latest;
      }

      if (nextTimestamp > latestTimestamp) {
        return run;
      }

      if (nextTimestamp === latestTimestamp && run.id.localeCompare(latest.id) > 0) {
        return run;
      }

      return latest;
    },
    null,
  )?.id ?? null;
}

export function buildSingleJobAutoApplyArtifacts(input: {
  approvalId?: string | null;
  createdAt: string;
  detail?: string | null;
  job: SavedJob;
  mode?: "single_job_auto";
}): {
  approval: ReturnType<typeof ApplySubmitApprovalSchema.parse>;
  result: ApplyJobResult;
  run: ApplyRun;
} {
  const runId = createUniqueId("apply_run");
  const resultId = createUniqueId("apply_result");
  const approvalId = input.approvalId ?? createUniqueId("apply_submit_approval");

  const run = ApplyRunSchema.parse({
    id: runId,
    mode: input.mode ?? "single_job_auto",
    state: "awaiting_submit_approval",
    jobIds: [input.job.id],
    currentJobId: input.job.id,
    submitApprovalId: approvalId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    completedAt: null,
    summary: `Automatic submit run is staged for '${input.job.title}'.`,
    detail:
      input.detail ??
      "This safe development run records explicit submit approval before any later submit-enabled execution. It does not click the final submit action.",
    totalJobs: 1,
    pendingJobs: 1,
    submittedJobs: 0,
    skippedJobs: 0,
    blockedJobs: 0,
    failedJobs: 0,
  });

  const result = ApplyJobResultSchema.parse({
    id: resultId,
    runId,
    jobId: input.job.id,
    queuePosition: 0,
    state: "planned",
    summary: "Waiting for explicit submit approval.",
    detail:
      "This job is queued behind a run-scoped submit approval. The current safe implementation records approval state only and still stops before any final submit action.",
    startedAt: input.createdAt,
    updatedAt: input.createdAt,
    completedAt: null,
    blockerReason: null,
    blockerSummary: null,
    latestQuestionCount: 0,
    latestAnswerCount: 0,
    pendingConsentRequestCount: 0,
    artifactCount: 0,
    latestCheckpointId: null,
  });

  const approval = ApplySubmitApprovalSchema.parse({
    id: approvalId,
    runId,
    mode: input.mode ?? "single_job_auto",
    jobIds: [input.job.id],
    status: "pending",
    createdAt: input.createdAt,
    approvedAt: null,
    revokedAt: null,
    expiresAt: null,
    detail:
      "Explicit submit approval is required before any later submit-enabled run can continue. Final submit remains disabled in the current safe development slice.",
  });

  return {
    approval,
    result,
    run,
  };
}

export function mapExecutionResultToApplyBlockerReason(
  blocker: ApplyExecutionResult["blocker"],
): ApplyJobResult["blockerReason"] {
  if (!blocker) {
    return null;
  }

  switch (blocker.code) {
    case "missing_resume":
      return "resume_missing";
    case "requires_manual_review":
      return "required_human_input";
    case "site_login_required":
      return "auth_required";
    case "missing_consent":
      return "signup_consent_required";
    case "external_redirect":
    case "unsupported_apply_path":
      return "unexpected_navigation";
    default:
      console.warn(
        `[job-finder] Unhandled apply blocker code '${String(blocker.code)}' while mapping apply blocker reason.`,
      );
      return null;
  }
}

export function mapExecutionResultToApplyJobState(input: {
  consentRequests: readonly ReturnType<typeof ApplicationConsentRequestSchema.parse>[];
  executionResult: ApplyExecutionResult;
}): ApplyJobResult["state"] {
  if (input.executionResult.state === "submitted") {
    return "submitted";
  }

  if (input.executionResult.state === "failed") {
    return "failed";
  }

  if (input.executionResult.state === "unsupported") {
    return "blocked";
  }

  if (input.consentRequests.length > 0) {
    return "blocked";
  }

  return "awaiting_review";
}

export function mapExecutionResultToApplyRunState(input: {
  consentRequests: readonly ReturnType<typeof ApplicationConsentRequestSchema.parse>[];
  executionResult: ApplyExecutionResult;
}): ApplyRun["state"] {
  if (input.executionResult.state === "submitted") {
    return "completed";
  }

  if (input.executionResult.state === "failed") {
    return "failed";
  }

  if (input.executionResult.state === "unsupported") {
    return "completed";
  }

  if (input.consentRequests.length > 0) {
    return "paused_for_consent";
  }

  return "paused_for_user_review";
}

export function buildApplyCopilotArtifacts(input: {
  job: SavedJob;
  executionResult: ApplyExecutionResult;
  detectedAt: string;
}): {
  run: ApplyRun;
  result: ApplyJobResult;
  questionRecords: ReturnType<typeof ApplicationQuestionRecordSchema.parse>[];
  answerRecords: ReturnType<typeof ApplicationAnswerRecordSchema.parse>[];
  artifactRefs: ReturnType<typeof ApplicationArtifactRefSchema.parse>[];
  checkpoints: ReturnType<typeof ApplicationReplayCheckpointSchema.parse>[];
  consentRequests: ReturnType<typeof ApplicationConsentRequestSchema.parse>[];
} {
  const runId = createUniqueId("apply_run");
  const resultId = createUniqueId("apply_result");
  const canonicalApplyUrl = input.job.applicationUrl ?? input.job.canonicalUrl;
  const persistedQuestionIdByExecutionId = new Map<string, string>();
  const persistedAnswerIdByExecutionId = new Map<string, string>();
  const checkpointArtifactIdsByExecutionId = new Map<string, string[]>();
  const executionQuestionIdByPersistedId = new Map<string, string>();
  input.executionResult.questions.forEach((question) => {
    const persistedQuestionId = createUniqueId("apply_question");
    persistedQuestionIdByExecutionId.set(question.id, persistedQuestionId);
    executionQuestionIdByPersistedId.set(persistedQuestionId, question.id);
  });

  for (const question of input.executionResult.questions) {
    for (const answer of question.suggestedAnswers) {
      persistedAnswerIdByExecutionId.set(answer.id, createUniqueId("apply_answer"));
    }
  }

  function mapCheckpointStateToJobState(
    checkpoint: ApplyExecutionResult["checkpoints"][number],
  ): ReturnType<typeof ApplicationReplayCheckpointSchema.parse>["jobState"] {
    switch (checkpoint.state) {
      case 'submitted':
        return 'submitted'
      case 'failed':
        return 'failed'
      case 'paused':
        return 'awaiting_review'
      case 'unsupported':
        return 'blocked'
      default:
        return checkpoint.label.toLowerCase().includes('question')
          ? 'question_capture'
          : 'filling'
    }
  }

  const answerRecords = input.executionResult.questions.flatMap((question) =>
    question.suggestedAnswers.map((answer) => {
      return ApplicationAnswerRecordSchema.parse({
        id: persistedAnswerIdByExecutionId.get(answer.id) ?? createUniqueId("apply_answer"),
        runId,
        jobId: input.job.id,
        resultId,
        questionId: persistedQuestionIdByExecutionId.get(question.id) ?? question.id,
        status:
          question.submittedAnswer && question.submittedAnswer === answer.text
            ? 'filled'
            : 'suggested',
        text: answer.text,
        sourceKind: answer.sourceKind,
        sourceId: answer.sourceId,
        confidenceLabel: answer.confidenceLabel,
        provenance: answer.provenance,
        createdAt: input.detectedAt,
        submittedAt:
          question.submittedAnswer && question.submittedAnswer === answer.text
            ? input.detectedAt
            : null,
      });
    }),
  );
  const questionRecords = input.executionResult.questions.map((question) => {
    const persistedQuestionId = persistedQuestionIdByExecutionId.get(question.id) ?? question.id;
    const matchingSuggestedAnswer = question.submittedAnswer
      ? question.suggestedAnswers.find(
          (suggestedAnswer) => suggestedAnswer.text === question.submittedAnswer,
        ) ?? null
      : null;
    const selectedAnswerId = matchingSuggestedAnswer?.id
      ? persistedAnswerIdByExecutionId.get(matchingSuggestedAnswer.id) ?? null
      : null;

    return ApplicationQuestionRecordSchema.parse({
      id: persistedQuestionId,
      runId,
      jobId: input.job.id,
      resultId,
      prompt: question.prompt,
      kind: question.kind,
      isRequired: question.isRequired,
      detectedAt: question.detectedAt,
      answerOptions: question.answerOptions,
      suggestedAnswers: question.suggestedAnswers,
      selectedAnswerId,
      submittedAnswer: question.submittedAnswer,
      status: question.status,
      pageUrl: canonicalApplyUrl,
    });
  });
  const blockerQuestionIds = input.executionResult.blocker?.questionIds ?? [];
  const artifactRefs = [
    ...questionRecords
      .filter((record) => {
        const executionQuestionId = executionQuestionIdByPersistedId.get(record.id);
        return executionQuestionId ? blockerQuestionIds.includes(executionQuestionId) : false;
      })
      .map((record) =>
        ApplicationArtifactRefSchema.parse({
          id: createUniqueId("apply_artifact"),
          runId,
          jobId: input.job.id,
          resultId,
          questionId: record.id,
          kind: 'field_snapshot',
          label: `Captured prompt: ${record.prompt}`,
          createdAt: input.detectedAt,
          storagePath: null,
          url: record.pageUrl,
          textSnippet: record.prompt,
        }),
      ),
    ...input.executionResult.checkpoints.map((checkpoint) => {
      const artifactId = createUniqueId("apply_artifact");
      const existingArtifactIds = checkpointArtifactIdsByExecutionId.get(checkpoint.id) ?? [];
      checkpointArtifactIdsByExecutionId.set(checkpoint.id, [...existingArtifactIds, artifactId]);

      return ApplicationArtifactRefSchema.parse({
        id: artifactId,
        runId,
        jobId: input.job.id,
        resultId,
        questionId: null,
        kind: 'checkpoint',
        label: checkpoint.label,
        createdAt: checkpoint.at,
        storagePath: null,
        url: canonicalApplyUrl,
        textSnippet: checkpoint.detail,
      });
    }),
  ];
  const checkpoints = input.executionResult.checkpoints.map((checkpoint) => {
    const persistedCheckpointId = createUniqueId("apply_checkpoint");

    return ApplicationReplayCheckpointSchema.parse({
      id: persistedCheckpointId,
      runId,
      jobId: input.job.id,
      resultId,
      createdAt: checkpoint.at,
      label: checkpoint.label,
      detail: checkpoint.detail,
      url: canonicalApplyUrl,
      jobState: mapCheckpointStateToJobState(checkpoint),
      artifactRefIds: checkpointArtifactIdsByExecutionId.get(checkpoint.id) ?? [],
    });
  });
  const consentRequests = input.executionResult.consentDecisions
    .filter((decision) => decision.status === 'requested')
    .map((decision) =>
      ApplicationConsentRequestSchema.parse({
        id: createUniqueId("apply_consent_request"),
        runId,
        jobId: input.job.id,
        resultId,
        kind:
          decision.kind === 'resume_use'
            ? 'resume_use'
            : decision.kind === 'autofill_profile'
              ? 'profile_autofill'
              : 'manual_verification',
        linkedConsentKind: decision.kind,
        label: decision.label,
        detail: decision.detail,
        status: 'pending',
        requestedAt: input.detectedAt,
        decidedAt: null,
        expiresAt: null,
      }),
    );

  const resultState = mapExecutionResultToApplyJobState({
    consentRequests,
    executionResult: input.executionResult,
  });
  const runState = mapExecutionResultToApplyRunState({
    consentRequests,
    executionResult: input.executionResult,
  });

  const result = ApplyJobResultSchema.parse({
    id: resultId,
    runId,
    jobId: input.job.id,
    queuePosition: 0,
    state: resultState,
    summary: input.executionResult.summary,
    detail: input.executionResult.detail,
    startedAt: input.executionResult.checkpoints[0]?.at ?? input.detectedAt,
    updatedAt: input.detectedAt,
    completedAt:
      input.executionResult.state === 'submitted' ||
      input.executionResult.state === 'failed' ||
      input.executionResult.state === 'unsupported'
        ? input.detectedAt
        : null,
    blockerReason: mapExecutionResultToApplyBlockerReason(
      input.executionResult.blocker,
    ),
    blockerSummary: input.executionResult.blocker?.summary ?? null,
    latestQuestionCount: questionRecords.length,
    latestAnswerCount: answerRecords.length,
    pendingConsentRequestCount: consentRequests.length,
    artifactCount: artifactRefs.length,
    latestCheckpointId: checkpoints.at(-1)?.id ?? null,
  });

  const run = ApplyRunSchema.parse({
    id: runId,
    mode: 'copilot',
    state: runState,
    jobIds: [input.job.id],
    currentJobId: input.job.id,
    submitApprovalId: null,
    createdAt: input.detectedAt,
    updatedAt: input.detectedAt,
    completedAt:
      input.executionResult.state === 'submitted' ||
      input.executionResult.state === 'failed' ||
      input.executionResult.state === 'unsupported'
        ? input.detectedAt
        : null,
    summary: input.executionResult.summary,
    detail: input.executionResult.detail,
    totalJobs: 1,
    pendingJobs: result.state === 'awaiting_review' ? 1 : 0,
    submittedJobs: result.state === 'submitted' ? 1 : 0,
    skippedJobs: 0,
    blockedJobs: result.state === 'blocked' ? 1 : 0,
    failedJobs: result.state === 'failed' ? 1 : 0,
  });

  return {
    run,
    result,
    questionRecords,
    answerRecords,
    artifactRefs,
    checkpoints,
    consentRequests,
  };
}
