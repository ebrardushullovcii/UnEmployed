import type { ExecuteApplicationFlowInput } from "@unemployed/browser-runtime";
import {
  ApplyJobResultSchema,
  ApplyRecoveryContextSchema,
  ApplyRunSchema,
  ApplySubmitApprovalSchema,
  ApplicationConsentRequestSchema,
  ApplicationAttemptConsentDecisionSchema,
  ApplicationAttemptQuestionSchema,
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  ApplicationResumeArtifactSchema,
  JobFinderInterviewFollowUpInputSchema,
  ResumeAssistantMessageSchema,
  ResumeValidationResultSchema,
  isResumeTemplateApplyEligible,
  isResumeTemplateApprovalEligible,
  type ResumeDraft,
  ResumeDraftPatchSchema,
  ResumeDraftSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplyExecutionResult,
  type BrowserVisualEvidenceSummary,
  type JobSource,
  type ResumeValidationIssue,
  type ResumeValidationResult,
  type ResumeTemplateDefinition,
  type UserActionRequest,
} from "@unemployed/contracts";
import {
  buildApplyCopilotArtifacts,
  buildSingleJobAutoApplyArtifacts,
  buildMissingResumeCopilotArtifacts,
  enforcePrepareOnlyExecutionResult,
  mapExecutionResultToApplyBlockerReason,
  mapExecutionResultToApplyJobState,
  mapExecutionResultToApplyRunState,
} from "./workspace-apply-run-support";
import { markSavedJobStatusInLedger } from "./workspace-discovery-ledger";
import { mergeSavedJobs } from "./workspace-service-helpers";
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
  nextAssetVersion,
  nextJobStatusFromAttempt,
  resolveActiveSourceInstructionArtifact,
  toApplicationEvents,
  wasResumeDraftApproved,
} from "./workspace-helpers";
import { createUniqueId, normalizeText, uniqueStrings } from "./shared";
import {
  DEFAULT_RESUME_APPLICATION_MODE,
  resolveJobResumeApplicationMode,
} from "./job-resume-application-mode";
import { evaluateCampaignApplyStopRules } from "./campaign-apply-stop-rules";
import {
  applyPatchToResumeDraft,
  buildAssistantReplyMessage,
  buildResumeDraftFromTailoredDraft,
  buildResumeDraftContentHash,
  buildResumeCoverageComparison,
  buildResumeDraftStateHash,
  buildResumeDraftRevision,
  buildResumeExportArtifact,
  buildResumeRenderDocument,
  buildTailoredResumeTextFromResumeDraft,
  buildTailoredAssetBridge,
  buildWorkHistoryReviewSuggestions,
  collectResearchContext,
  collectResumeWorkspaceEvidence,
  resolveResumeTemplateLabel,
  sanitizeResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import {
  buildResumeWorkspace,
  ensureResumeDraft,
  fetchAndPersistResearch,
  previewResumeDraft,
  renderDraftToPdf,
} from "./workspace-application-resume-support";
import {
  buildResumeGenerationStrategyPolicy,
  buildResumeStrategyContext,
  resolveCampaignDefaultResumeStrategyId,
} from "./resume-strategy-application";
import { createApplicationUserActionResumer } from "./workspace-application-user-action-resumption";
import { persistApplicationUserAction } from "./workspace-application-user-action";
import { persistAutomaticApplicationSafeguards } from "./automatic-safeguards";
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
    ].filter((value): value is string =>
      Boolean(value && value.trim().length > 0),
    ),
  );
}

function createMonotonicTimestamp(
  previousIso: string | null | undefined,
): string {
  const now = Date.now();
  const parsedPrevious = previousIso
    ? new Date(previousIso).getTime()
    : Number.NaN;
  const previous = Number.isNaN(parsedPrevious) ? now : parsedPrevious + 1;
  return new Date(Math.max(now, previous)).toISOString();
}

function getApplyResultSortTime(input: {
  completedAt: string | null;
  updatedAt: string;
  startedAt: string;
}): number {
  return Date.parse(input.completedAt ?? input.updatedAt ?? input.startedAt);
}

type WorkspaceApplicationMethods = Pick<
  JobFinderWorkspaceService,
  | "queueJobForReview"
  | "setJobResumeApplicationMode"
  | "removeJobFromReview"
  | "dismissDiscoveryJob"
  | "restoreDismissedDiscoveryJob"
  | "generateResume"
  | "getResumeWorkspace"
  | "previewResumeDraft"
  | "saveResumeDraft"
  | "restoreResumeDraftRevision"
  | "regenerateResumeDraft"
  | "regenerateResumeSection"
  | "exportResumePdf"
  | "approveResume"
  | "clearResumeApproval"
  | "applyResumePatch"
  | "getResumeAssistantMessages"
  | "sendResumeAssistantMessage"
  | "resolveResumeAssistantProposal"
  | "startApplyCopilotRun"
  | "startAutoApplyRun"
  | "startAutoApplyQueueRun"
  | "approveApplyRun"
  | "cancelApplyRun"
  | "resolveApplyConsentRequest"
  | "revokeApplyRunApproval"
  | "approveApply"
  | "recordInterviewHelperApplicationAction"
> & {
  resumeApplicationUserAction(request: UserActionRequest): Promise<void>;
};

async function getLatestResumeRevisionId(
  ctx: WorkspaceServiceContext,
  draftId: string,
): Promise<string | null> {
  return (
    (await ctx.repository.listResumeDraftRevisions(draftId))[0]?.id ?? null
  );
}
export function createWorkspaceApplicationMethods(
  ctx: WorkspaceServiceContext,
): WorkspaceApplicationMethods {
  const ACTIVITY_PAUSED_MESSAGE =
    "Browser and application activity is paused. Resume it from the Job Finder command center before starting new work.";

  type DirectApplyExecutionClaim = {
    jobId: string;
    runId: string;
    resultId: string;
    controller: AbortController;
  };

  // Copilot and the legacy approveApply entry point both execute a browser
  // flow directly instead of going through executeSafeApplyRun(). Keep one
  // in-memory claim per job so repeated renderer requests cannot open two
  // application pages, while the shared context maps let pause/shutdown abort
  // and await the same work.
  const activeDirectApplyClaims = new Map<string, DirectApplyExecutionClaim>();

  function claimDirectApplyExecution(jobId: string): DirectApplyExecutionClaim {
    if (activeDirectApplyClaims.has(jobId)) {
      throw new Error(
        `Application preparation for job '${jobId}' is already running.`,
      );
    }

    const claim = {
      jobId,
      runId: createUniqueId("apply_run"),
      resultId: createUniqueId("apply_result"),
      controller: new AbortController(),
    } satisfies DirectApplyExecutionClaim;
    activeDirectApplyClaims.set(jobId, claim);
    ctx.activeApplyRunAbortControllers.set(claim.runId, claim.controller);
    return claim;
  }

  function releaseDirectApplyExecution(claim: DirectApplyExecutionClaim): void {
    if (activeDirectApplyClaims.get(claim.jobId) === claim) {
      activeDirectApplyClaims.delete(claim.jobId);
    }
    if (
      ctx.activeApplyRunAbortControllers.get(claim.runId) === claim.controller
    ) {
      ctx.activeApplyRunAbortControllers.delete(claim.runId);
    }
    ctx.activeApplyRunPromises.delete(claim.runId);
  }

  async function requireApplyActivityEnabled(): Promise<void> {
    if ((await ctx.repository.getActivityControl()).paused) {
      throw new Error(ACTIVITY_PAUSED_MESSAGE);
    }
  }

  async function assertDirectApplyExecutionCanContinue(
    claim: DirectApplyExecutionClaim,
  ): Promise<void> {
    if (claim.controller.signal.aborted) {
      throw new DOMException(
        "Application preparation was aborted.",
        "AbortError",
      );
    }
    await requireApplyActivityEnabled();
    if (claim.controller.signal.aborted) {
      throw new DOMException(
        "Application preparation was aborted.",
        "AbortError",
      );
    }
  }

  async function assertNoOtherRunningApplyForJob(
    claim: DirectApplyExecutionClaim,
  ): Promise<void> {
    const runningRun = (await ctx.repository.listApplyRuns()).find(
      (run) =>
        run.id !== claim.runId &&
        run.state === "running" &&
        run.jobIds.includes(claim.jobId),
    );
    if (runningRun) {
      throw new Error(
        `Application preparation for job '${claim.jobId}' is already running in apply run '${runningRun.id}'.`,
      );
    }
  }

  async function persistDirectApplyRunStart(input: {
    claim: DirectApplyExecutionClaim;
    job: ReturnType<typeof SavedJobSchema.parse>;
    campaignId: string | null;
    startedAt: string;
  }): Promise<void> {
    const run = ApplyRunSchema.parse({
      id: input.claim.runId,
      campaignId: input.campaignId,
      mode: "copilot",
      state: "running",
      jobIds: [input.job.id],
      currentJobId: input.job.id,
      submitApprovalId: null,
      createdAt: input.startedAt,
      updatedAt: input.startedAt,
      completedAt: null,
      summary: "Apply copilot preparation is running in safe review mode.",
      detail:
        "The application flow is active and can be interrupted by pause or shutdown. It still stops before any final submit action.",
      totalJobs: 1,
      pendingJobs: 1,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    });
    const result = ApplyJobResultSchema.parse({
      id: input.claim.resultId,
      runId: input.claim.runId,
      jobId: input.job.id,
      queuePosition: 0,
      state: "planned",
      summary: "Apply copilot preparation is starting.",
      detail:
        "The browser application flow has not reached a review checkpoint yet.",
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
      completedAt: null,
      blockerReason: null,
      blockerSummary: null,
      pendingConsentRequestCount: 0,
      artifactCount: 0,
      latestCheckpointId: null,
    });
    await Promise.all([
      ctx.repository.upsertApplyRun(run),
      ctx.repository.upsertApplyJobResult(result),
    ]);
  }

  async function markDirectApplyRunFailed(
    claim: DirectApplyExecutionClaim,
    error: unknown,
  ): Promise<void> {
    if (claim.controller.signal.aborted) {
      // Pause and shutdown own the cancellation transition. Their callers
      // either cancel this durable run or recover it as failed after waiting.
      return;
    }
    // Activity pause owns the cancellation transition. A direct flow can
    // observe the persisted pause between its final guard and this failure
    // handler, before the pause caller reaches the controller abort loop.
    if ((await ctx.repository.getActivityControl()).paused) {
      return;
    }
    const latestRun = (await ctx.repository.listApplyRuns()).find(
      (run) => run.id === claim.runId,
    );
    if (!latestRun || latestRun.state !== "running") {
      return;
    }
    const completedAt = new Date().toISOString();
    const detail =
      error instanceof Error
        ? error.message
        : "The direct application preparation flow failed before review.";
    const failedRun = ApplyRunSchema.parse({
      ...latestRun,
      state: "failed",
      updatedAt: completedAt,
      completedAt,
      summary: "Apply copilot preparation failed.",
      detail: `${detail} No final submit action was taken; the run can be restarted after the failure is reviewed.`,
      pendingJobs: 0,
      failedJobs: Math.max(1, latestRun.failedJobs),
    });
    const latestResult = (await ctx.repository.listApplyJobResults()).find(
      (result) => result.id === claim.resultId,
    );
    const failedResult =
      latestResult &&
      !["submitted", "skipped", "blocked", "failed"].includes(
        latestResult.state,
      )
        ? ApplyJobResultSchema.parse({
            ...latestResult,
            state: "failed",
            updatedAt: completedAt,
            completedAt,
            summary: "Application preparation failed.",
            detail: `${detail} No final submit action was taken.`,
          })
        : null;

    await Promise.all([
      ctx.repository.upsertApplyRun(failedRun),
      ...(failedResult
        ? [ctx.repository.upsertApplyJobResult(failedResult)]
        : []),
    ]);
  }

  function trackDirectApplyExecution<T>(
    claim: DirectApplyExecutionClaim,
    operation: () => Promise<T>,
  ): Promise<T> {
    const operationPromise = operation()
      .catch(async (error: unknown) => {
        await markDirectApplyRunFailed(claim, error).catch(() => undefined);
        throw error;
      })
      .finally(() => releaseDirectApplyExecution(claim));
    ctx.activeApplyRunPromises.set(
      claim.runId,
      operationPromise.then(
        () => undefined,
        () => undefined,
      ),
    );
    return operationPromise;
  }

  async function withApplyRunTransition<T>(
    runId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous =
      ctx.applyRunTransitionTails.get(runId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    ctx.applyRunTransitionTails.set(runId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (ctx.applyRunTransitionTails.get(runId) === tail) {
        ctx.applyRunTransitionTails.delete(runId);
      }
    }
  }

  const resumeDraftTransitionTails = new Map<string, Promise<void>>();

  async function withResumeDraftTransition<T>(
    jobId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = resumeDraftTransitionTails.get(jobId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    resumeDraftTransitionTails.set(jobId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (resumeDraftTransitionTails.get(jobId) === tail) {
        resumeDraftTransitionTails.delete(jobId);
      }
    }
  }

  async function assertResumeDraftCurrent(draft: ResumeDraft): Promise<void> {
    const currentDraft = await ctx.repository.getResumeDraftByJobId(
      draft.jobId,
    );
    if (
      !currentDraft ||
      currentDraft.updatedAt !== draft.updatedAt ||
      buildResumeDraftStateHash(currentDraft) !==
        buildResumeDraftStateHash(draft)
    ) {
      throw new Error(
        "Resume draft changed before this operation could be saved. Reload the workspace and try again.",
      );
    }
  }

  const consentResolutionTails = new Map<string, Promise<void>>();

  async function withConsentResolution<T>(
    requestId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = consentResolutionTails.get(requestId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    consentResolutionTails.set(requestId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (consentResolutionTails.get(requestId) === tail) {
        consentResolutionTails.delete(requestId);
      }
    }
  }

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

  function validateApplyTemplate(input: {
    templateId: string;
    templates: readonly ResumeTemplateDefinition[];
    jobTitle: string;
  }) {
    const template = input.templates.find(
      (entry) => entry.id === input.templateId,
    );

    if (!template || !isResumeTemplateApplyEligible(template)) {
      throw new Error(
        `The selected resume template for '${input.jobTitle}' is not eligible for automatic apply. Choose an apply-safe template, export a fresh PDF, and approve it again.`,
      );
    }
  }

  function preserveWorkHistoryReviewGuidance(input: {
    validation: ResumeValidationResult;
    previousValidation: ResumeValidationResult | null;
    draft: ResumeDraft;
  }): ResumeValidationResult {
    const existingIssueIds = new Set(
      input.validation.issues.map((issue) => issue.id),
    );
    const entryIds = new Set(
      input.draft.sections.flatMap((section) =>
        section.entries.map((entry) => entry.id),
      ),
    );
    const preservedIssues: ResumeValidationIssue[] = (
      input.previousValidation?.issues ?? []
    )
      .filter((issue) => issue.category === "work_history_review")
      .filter((issue) => !issue.entryId || entryIds.has(issue.entryId))
      .filter((issue) => !existingIssueIds.has(issue.id));

    if (preservedIssues.length === 0) {
      return input.validation;
    }

    return ResumeValidationResultSchema.parse({
      ...input.validation,
      issues: [...input.validation.issues, ...preservedIssues],
    });
  }

  async function verifyResumeFileIntegrity(input: {
    expectedSha256: string | null | undefined;
    filePath: string;
    label: string;
  }): Promise<string | null> {
    if (!ctx.exportFileVerifier?.sha256) {
      return input.expectedSha256 ?? null;
    }

    if (!input.expectedSha256) {
      throw new Error(
        `${input.label} has no saved SHA-256 integrity record. Re-import or re-export it before starting Apply Copilot.`,
      );
    }

    const actualSha256 = await ctx.exportFileVerifier.sha256(input.filePath);
    if (actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
      throw new Error(
        `${input.label} changed after it was saved. Re-import or re-export it before starting Apply Copilot.`,
      );
    }

    return actualSha256.toLowerCase();
  }

  async function resolveJobApplyPrerequisites(jobId: string) {
    const [
      savedJobs,
      tailoredAssets,
      draft,
      approvedExports,
      profile,
      settings,
    ] = await Promise.all([
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.getResumeDraftByJobId(jobId),
      ctx.repository.listResumeExportArtifacts({ jobId }),
      ctx.repository.getProfile(),
      ctx.repository.getSettings(),
    ]);
    const job = savedJobs.find((entry) => entry.id === jobId) ?? null;

    if (!job) {
      throw new Error(
        `Unable to start automatic apply for unknown job '${jobId}'.`,
      );
    }
    const resumeApplicationMode = resolveJobResumeApplicationMode(
      job,
      settings,
    );

    if (resumeApplicationMode === "original_resume") {
      const originalResumePath = profile.baseResume.storagePath?.trim() ?? "";
      if (!originalResumePath) {
        throw new Error(
          `The original CV is unavailable for '${job.title}'. Import or re-import it in Profile before starting Apply Copilot.`,
        );
      }

      if (
        ctx.exportFileVerifier &&
        !(await ctx.exportFileVerifier.exists(originalResumePath))
      ) {
        throw new Error(
          `The original CV file is missing on disk for '${job.title}'. Re-import it in Profile before starting Apply Copilot.`,
        );
      }

      const verifiedSha256 = await verifyResumeFileIntegrity({
        expectedSha256: profile.baseResume.sha256,
        filePath: originalResumePath,
        label: "The original CV",
      });

      return {
        job,
        resumeApplicationMode,
        resumeArtifact: ApplicationResumeArtifactSchema.parse({
          id: `application_resume_${job.id}_${profile.baseResume.id}`,
          jobId: job.id,
          source: "original_upload",
          sourceDocumentId: profile.baseResume.id,
          exportArtifactId: null,
          fileName: profile.baseResume.fileName,
          filePath: originalResumePath,
          sha256: verifiedSha256,
          approvedAt: new Date().toISOString(),
        }),
      };
    }

    const approvedExport = draft?.approvedExportId
      ? (approvedExports.find((entry) => entry.id === draft.approvedExportId) ??
        null)
      : null;
    const asset = tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;

    if (!draft || draft.status !== "approved" || !approvedExport) {
      throw new Error(
        `An approved tailored PDF is required before staging automatic apply for '${job.title}'.`,
      );
    }

    validateApplyTemplate({
      templateId: draft.templateId,
      templates: ctx.documentManager.listResumeTemplates(),
      jobTitle: job.title,
    });

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

    if (
      !asset ||
      asset.status !== "ready" ||
      asset.storagePath !== approvedExport.filePath
    ) {
      throw new Error(
        `A ready approved tailored resume is required before staging automatic apply for '${job.title}'.`,
      );
    }

    const verifiedSha256 = await verifyResumeFileIntegrity({
      expectedSha256: approvedExport.sha256,
      filePath: approvedExport.filePath,
      label: "The approved tailored CV",
    });

    return {
      job,
      resumeApplicationMode,
      resumeArtifact: ApplicationResumeArtifactSchema.parse({
        id: `application_resume_${job.id}_${approvedExport.id}`,
        jobId: job.id,
        source: "tailored_export",
        sourceDocumentId: null,
        exportArtifactId: approvedExport.id,
        fileName:
          approvedExport.filePath.split(/[\\/]/).at(-1) ??
          `${job.title}-resume.pdf`,
        filePath: approvedExport.filePath,
        sha256: verifiedSha256,
        approvedAt: new Date().toISOString(),
      }),
    };
  }

  async function syncRunApplicationRecord(input: {
    consentSummary?: ReturnType<
      typeof ApplicationRecordSchema.shape.consentSummary.parse
    >;
    eventDetail: string;
    eventEmphasis: "neutral" | "positive" | "warning" | "critical";
    eventId: string;
    eventTitle: string;
    jobId: string;
    lastActionLabel: string;
    lastAttemptState?: ReturnType<
      typeof ApplicationRecordSchema.shape.lastAttemptState.parse
    >;
    latestBlocker?: ReturnType<
      typeof ApplicationRecordSchema.shape.latestBlocker.parse
    >;
    nextActionLabel: string | null;
    questionSummary?: ReturnType<
      typeof ApplicationRecordSchema.shape.questionSummary.parse
    >;
    replaySummary?: ReturnType<
      typeof ApplicationRecordSchema.shape.replaySummary.parse
    >;
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
      lastAttemptState:
        input.lastAttemptState !== undefined
          ? input.lastAttemptState
          : (existingRecord?.lastAttemptState ?? null),
      questionSummary:
        input.questionSummary !== undefined
          ? input.questionSummary
          : existingRecord?.questionSummary,
      latestBlocker:
        input.latestBlocker !== undefined
          ? input.latestBlocker
          : (existingRecord?.latestBlocker ?? null),
      consentSummary:
        input.consentSummary !== undefined
          ? input.consentSummary
          : existingRecord?.consentSummary,
      replaySummary:
        input.replaySummary !== undefined
          ? input.replaySummary
          : existingRecord?.replaySummary,
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

  function mergeMissingResumeApplicationRecord(input: {
    applicationRecord: ReturnType<typeof ApplicationRecordSchema.parse>;
    existingRecord: ReturnType<typeof ApplicationRecordSchema.parse> | null;
  }) {
    if (!input.existingRecord) {
      return input.applicationRecord;
    }

    return ApplicationRecordSchema.parse({
      ...input.existingRecord,
      ...input.applicationRecord,
      id: input.existingRecord.id,
      status: input.existingRecord.status,
      lastAttemptState: input.existingRecord.lastAttemptState,
      questionSummary: input.applicationRecord.questionSummary,
      latestBlocker: input.applicationRecord.latestBlocker,
      consentSummary: input.applicationRecord.consentSummary,
      replaySummary: input.applicationRecord.replaySummary,
      events: mergeEvents(
        input.existingRecord.events,
        input.applicationRecord.events,
      ),
    });
  }

  function buildApplyVisualExecutionOptions(input: {
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
      !ctx.browserRuntime.captureVisualSnapshot ||
      !ctx.aiClient.analyzeBrowserVisualSnapshot
    ) {
      return {};
    }

    const captureVisualSnapshot = ctx.browserRuntime.captureVisualSnapshot.bind(
      ctx.browserRuntime,
    );
    const analyzeVisualSnapshot =
      ctx.aiClient.analyzeBrowserVisualSnapshot.bind(ctx.aiClient);

    return {
      captureVisualSnapshot: (request) =>
        captureVisualSnapshot(input.source, request),
      analyzeVisualSnapshot,
    };
  }

  async function buildApplyRecoveryContext(jobId: string) {
    const [runs, results, checkpoints] = await Promise.all([
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults(),
      ctx.repository.listApplicationReplayCheckpoints({ jobId }),
    ]);
    const latestResult =
      results
        .filter((entry) => entry.jobId === jobId && entry.state !== "planned")
        .sort((left, right) => {
          const rightTime = getApplyResultSortTime(right);
          const leftTime = getApplyResultSortTime(left);
          return rightTime - leftTime;
        })[0] ?? null;

    if (!latestResult) {
      return {
        recoveryContext: null,
        recoveryInstructions: [] as string[],
      };
    }

    const previousRun =
      runs.find((entry) => entry.id === latestResult.runId) ?? null;
    if (!previousRun) {
      return {
        recoveryContext: null,
        recoveryInstructions: [] as string[],
      };
    }

    const latestRunCheckpoints = checkpoints.filter(
      (checkpoint) => checkpoint.runId === latestResult.runId,
    );
    const latestCheckpoint = latestRunCheckpoints[0] ?? null;
    const retainedVisualEvidence = (() => {
      const seenEvidence = new Set<string>();
      const candidates: BrowserVisualEvidenceSummary[] = [
        ...latestRunCheckpoints.flatMap(
          (checkpoint) => checkpoint.visualEvidence,
        ),
        ...latestResult.visualCheckpoints.flatMap((checkpoint) =>
          checkpoint.retained
            ? [
                {
                  snapshotId: checkpoint.snapshotId,
                  observationSetId: checkpoint.observationSetId,
                  summary: checkpoint.summary,
                  capturedAt: checkpoint.capturedAt,
                  storagePath: checkpoint.storagePath,
                  retention: "retained" as const,
                  redactionLevel: "sensitive" as const,
                  confidence: 0.5,
                  reconciliationStatus:
                    checkpoint.reconciliations[0]?.status ??
                    ("not_compared" as const),
                },
              ]
            : [],
        ),
      ];

      return candidates
        .filter((entry) => entry.retention !== "temporary")
        .flatMap((entry) => {
          const key = `${entry.snapshotId}:${entry.observationSetId}`;
          if (seenEvidence.has(key)) {
            return [];
          }

          seenEvidence.add(key);
          return [entry];
        });
    })();
    const checkpointUrls = uniqueStrings(
      latestRunCheckpoints
        .map((checkpoint) => checkpoint.url)
        .filter(
          (url): url is string =>
            typeof url === "string" && url.trim().length > 0,
        ),
    );

    return {
      recoveryContext: ApplyRecoveryContextSchema.parse({
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
        retainedVisualEvidence,
      }),
      recoveryInstructions: buildRecoveryInstructions({
        blockerSummary: latestResult.blockerSummary,
        latestCheckpointDetail: latestCheckpoint?.detail ?? null,
        latestCheckpointLabel: latestCheckpoint?.label ?? null,
        latestCheckpointUrl: latestCheckpoint?.url ?? null,
      }),
    };
  }

  async function executeSafeApplyRunOwned(
    input: {
      mode: "single_job_auto" | "queue_auto";
      runId: string;
    },
    executionController: AbortController,
  ): Promise<void> {
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
      campaignState,
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
      ctx.repository.getCampaignState(),
    ]);
    const run = runs.find((entry) => entry.id === input.runId) ?? null;

    if (!run) {
      throw new Error(`Unknown apply run '${input.runId}'.`);
    }

    if (run.mode !== input.mode) {
      throw new Error(`Apply run '${input.runId}' is not a ${input.mode} run.`);
    }

    if (!run.submitApprovalId) {
      throw new Error(
        `Apply run '${input.runId}' does not have a submit approval record.`,
      );
    }

    const approval =
      approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

    if (!approval || approval.status !== "approved") {
      throw new Error(
        `Apply run '${input.runId}' must be approved before it can execute.`,
      );
    }

    if (!ctx.browserRuntime.executeApplicationFlow) {
      throw new Error(
        "The current browser runtime does not support staged apply execution.",
      );
    }

    let currentRunState: ReturnType<typeof ApplyRunSchema.parse> =
      ApplyRunSchema.parse({
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
    const executionSignal = executionController.signal;
    const campaignStopRules = campaignState?.campaigns.find(
      (campaign) => campaign.id === campaignState.activeCampaignId,
    )?.stopRules;
    const stopIfRunWasCancelled = async (): Promise<boolean> => {
      if (executionSignal.aborted) {
        return true;
      }
      if ((await ctx.repository.getActivityControl()).paused) {
        executionController.abort();
        return true;
      }
      const latestRun = (await ctx.repository.listApplyRuns()).find(
        (entry) => entry.id === run.id,
      );
      if (latestRun?.state !== "cancelled") {
        return false;
      }
      executionController.abort();
      return true;
    };

    const persistRunUnlessCancelled = async (
      nextRun: ReturnType<typeof ApplyRunSchema.parse>,
    ): Promise<boolean> =>
      withApplyRunTransition(run.id, async () => {
        const latestRun = (await ctx.repository.listApplyRuns()).find(
          (entry) => entry.id === run.id,
        );
        const activityPaused = (await ctx.repository.getActivityControl())
          .paused;
        if (
          executionSignal.aborted ||
          activityPaused ||
          latestRun?.state === "cancelled"
        ) {
          executionController.abort();
          return false;
        }
        await ctx.repository.upsertApplyRun(nextRun);
        return true;
      });

    if (!(await persistRunUnlessCancelled(currentRunState))) {
      return;
    }

    let submittedJobs = 0;
    let blockedJobs = 0;
    let failedJobs = 0;
    let skippedJobs = 0;
    let awaitingReviewJobs = 0;
    let pendingConsentRequests = consentRequests.filter(
      (request) => request.runId === run.id && request.status === "pending",
    ).length;
    let activeSource: JobSource | null = null;
    let shouldCloseActiveSessionOnExit = false;
    const keepSessionAlive = settings.keepSessionAlive;
    try {
      for (let index = 0; index < run.jobIds.length; index += 1) {
        if (await stopIfRunWasCancelled()) {
          return;
        }
        const jobId = run.jobIds[index]!;
        const jobResult = results.find(
          (entry) => entry.runId === run.id && entry.jobId === jobId,
        );

        if (jobResult?.state && jobResult.state !== "planned") {
          if (jobResult.state === "submitted") {
            submittedJobs += 1;
          } else if (jobResult.state === "awaiting_review") {
            awaitingReviewJobs += 1;
          } else if (jobResult.state === "blocked") {
            blockedJobs += 1;
          } else if (jobResult.state === "failed") {
            failedJobs += 1;
          } else if (jobResult.state === "skipped") {
            skippedJobs += 1;
          }
          continue;
        }

        const { job, resumeApplicationMode, resumeArtifact } =
          await resolveJobApplyPrerequisites(jobId);
        if (await stopIfRunWasCancelled()) {
          return;
        }
        const recoverySeed = await buildApplyRecoveryContext(jobId);
        if (activeSource !== job.source) {
          if (activeSource && !keepSessionAlive) {
            await ctx.closeRunBrowserSession(activeSource);
          }
          await ctx.openRunBrowserSession(job.source);
          activeSource = job.source;
          shouldCloseActiveSessionOnExit = false;
          if (await stopIfRunWasCancelled()) {
            return;
          }
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

        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            job.source,
            {
              job,
              resumeArtifact,
              profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              intermediateMutationsAuthorized: true,
              accountCreationAuthorized: false,
              submitAuthorized: false,
              ...(recoverySeed.recoveryContext
                ? { recoveryContext: recoverySeed.recoveryContext }
                : {}),
              ...(applyInstructions.length > 0
                ? { instructions: applyInstructions }
                : {}),
              ...buildApplyVisualExecutionOptions({
                enabled: currentRunState.visualCheckpointsEnabled,
                source: job.source,
              }),
            },
            { signal: executionSignal },
          ),
        );
        if (await stopIfRunWasCancelled()) {
          return;
        }
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
          resumeArtifact,
          executionResult: normalizedExecutionResult,
          runId: run.id,
          ...(jobResult ? { resultId: jobResult.id } : {}),
          detectedAt,
          visualCheckpointsEnabled: currentRunState.visualCheckpointsEnabled,
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
          listingSignalEvidence:
            normalizedExecutionResult.listingSignalEvidence,
          visualObservationSets:
            normalizedExecutionResult.visualObservationSets,
          visualCheckpoints: normalizedExecutionResult.visualCheckpoints,
          latestQuestionCount: runArtifacts.questionRecords.length,
          latestAnswerCount: runArtifacts.answerRecords.length,
          pendingConsentRequestCount: runArtifacts.consentRequests.length,
          artifactCount: runArtifacts.artifactRefs.length,
          latestCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
          privacyReceipt: runArtifacts.result.privacyReceipt,
        });

        if (await stopIfRunWasCancelled()) {
          return;
        }

        await Promise.all([
          ctx.repository.upsertApplyJobResult(updatedResult),
          ...runArtifacts.questionRecords
            .filter((record) => !existingQuestionIds.has(record.id))
            .map((record) =>
              ctx.repository.upsertApplicationQuestionRecord({
                ...record,
                runId: run.id,
                resultId: updatedResult.id,
              }),
            ),
          ...runArtifacts.answerRecords
            .filter((record) => !existingAnswerIds.has(record.id))
            .map((record) =>
              ctx.repository.upsertApplicationAnswerRecord({
                ...record,
                runId: run.id,
                resultId: updatedResult.id,
              }),
            ),
          ...runArtifacts.artifactRefs
            .filter((record) => !existingArtifactIds.has(record.id))
            .map((record) =>
              ctx.repository.upsertApplicationArtifactRef({
                ...record,
                runId: run.id,
                resultId: updatedResult.id,
              }),
            ),
          ...runArtifacts.checkpoints
            .filter((record) => !existingCheckpointIds.has(record.id))
            .map((record) =>
              ctx.repository.upsertApplicationReplayCheckpoint({
                ...record,
                runId: run.id,
                resultId: updatedResult.id,
              }),
            ),
          ...runArtifacts.consentRequests
            .filter((record) => !existingConsentIds.has(record.id))
            .map((record) =>
              ctx.repository.upsertApplicationConsentRequest({
                ...record,
                runId: run.id,
                resultId: updatedResult.id,
              }),
            ),
        ]);

        if (await stopIfRunWasCancelled()) {
          return;
        }

        await persistApplicationUserAction({
          repository: ctx.repository,
          job,
          runId: run.id,
          resultId: updatedResult.id,
          resultState: updatedResult.state,
          resultStartedAt: updatedResult.startedAt,
          replayCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
          blocker,
          occurredAt: detectedAt,
        });

        if (await stopIfRunWasCancelled()) {
          return;
        }

        const attempt = ApplicationAttemptSchema.parse({
          id: `attempt_${jobId}_${Date.now()}`,
          jobId,
          state: normalizedExecutionResult.state,
          summary: normalizedExecutionResult.summary,
          detail: normalizedExecutionResult.detail,
          startedAt: normalizedExecutionResult.checkpoints[0]?.at ?? detectedAt,
          updatedAt: detectedAt,
          completedAt:
            normalizedExecutionResult.state === "in_progress"
              ? null
              : detectedAt,
          outcome: normalizedExecutionResult.outcome,
          checkpoints: normalizedExecutionResult.checkpoints,
          questions: normalizedExecutionResult.questions.map((question) =>
            ApplicationAttemptQuestionSchema.parse(question),
          ),
          blocker,
          consentDecisions: normalizedExecutionResult.consentDecisions.map(
            (decision) =>
              ApplicationAttemptConsentDecisionSchema.parse(decision),
          ),
          replay,
          visualEvidence: normalizedExecutionResult.visualEvidence,
          visualObservationSets:
            normalizedExecutionResult.visualObservationSets,
          visualCheckpoints: normalizedExecutionResult.visualCheckpoints,
          nextActionLabel: normalizedExecutionResult.nextActionLabel,
          executionTimings: normalizedExecutionResult.executionTimings,
        });
        await ctx.repository.upsertApplicationAttempt(attempt);

        if (await stopIfRunWasCancelled()) {
          return;
        }

        const jobState = updatedResult.state;
        if (jobState === "submitted") {
          submittedJobs += 1;
        } else if (jobState === "awaiting_review") {
          awaitingReviewJobs += 1;
        } else if (jobState === "blocked") {
          blockedJobs += 1;
        } else if (jobState === "failed") {
          failedJobs += 1;
        } else if (jobState === "skipped") {
          skippedJobs += 1;
        }
        pendingConsentRequests += runArtifacts.consentRequests.length;

        await syncRunApplicationRecord({
          consentSummary: buildConsentSummary(attempt.consentDecisions),
          eventDetail:
            jobState === "blocked" && runArtifacts.consentRequests.length > 0
              ? input.mode === "queue_auto"
                ? "This job needs an explicit consent decision. The queue continued preparing unrelated jobs safely."
                : "This run paused on a consent-gated step for this job. Resolve or decline the consent request to continue."
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
              ? "Consent needed"
              : normalizedExecutionResult.summary,
          jobId,
          lastActionLabel: normalizedExecutionResult.summary,
          lastAttemptState: normalizedExecutionResult.state,
          latestBlocker: buildLatestBlockerSummary(attempt.blocker),
          nextActionLabel:
            jobState === "blocked" && runArtifacts.consentRequests.length > 0
              ? input.mode === "queue_auto"
                ? "Resolve this job's consent request; other queued jobs continue independently."
                : "Resolve the consent request in Applications to continue."
              : normalizedExecutionResult.nextActionLabel,
          questionSummary: buildQuestionSummary(attempt.questions),
          replaySummary: buildReplaySummary(
            attempt.replay,
            attempt.visualEvidence,
          ),
          updatedAt: detectedAt,
        });

        const remainingJobs = run.jobIds.length - (index + 1);
        const pendingJobs = remainingJobs + awaitingReviewJobs;
        const nextRunState = mapExecutionResultToApplyRunState({
          consentRequests: runArtifacts.consentRequests,
          executionResult: normalizedExecutionResult,
        });
        const campaignPauseReason = campaignStopRules
          ? evaluateCampaignApplyStopRules({
              blockerReason: updatedResult.blockerReason,
              blockedCount: blockedJobs,
              failedCount: failedJobs,
              processedCount:
                submittedJobs +
                awaitingReviewJobs +
                blockedJobs +
                failedJobs +
                skippedJobs,
              stopRules: campaignStopRules,
            })
          : null;
        currentRunState = ApplyRunSchema.parse({
          ...currentRunState,
          currentJobId: jobId,
          updatedAt: detectedAt,
          state: campaignPauseReason
            ? "paused_for_user_review"
            : input.mode === "queue_auto"
              ? remainingJobs > 0
                ? "running"
                : pendingConsentRequests > 0
                  ? "paused_for_consent"
                  : pendingJobs > 0 || blockedJobs > 0
                    ? "paused_for_user_review"
                    : "completed"
              : nextRunState,
          summary: campaignPauseReason
            ? "Automatic apply paused by this campaign's safety rules."
            : input.mode === "queue_auto"
              ? remainingJobs === 0 && pendingConsentRequests > 0
                ? `Automatic apply prepared every unblocked job; ${pendingConsentRequests} consent ${pendingConsentRequests === 1 ? "decision needs" : "decisions need"} you.`
                : `Automatic apply queue processed ${index + 1} of ${run.jobIds.length} jobs in safe review mode.`
              : runArtifacts.consentRequests.length > 0
                ? `Automatic apply paused for consent on '${job.title}'.`
                : `Automatic apply run processed '${job.title}' in safe review mode.`,
          detail:
            campaignPauseReason ??
            (input.mode === "queue_auto" && pendingConsentRequests > 0
              ? "Consent-blocked jobs remain explicit user actions, while every unrelated ready job was allowed to reach its safe review checkpoint."
              : runArtifacts.consentRequests.length > 0
                ? "The run stopped because a consent-gated step needs an explicit user decision."
                : "The current safe development execution filled and classified the application but still stopped before any final submit action."),
          completedAt: campaignPauseReason
            ? null
            : input.mode === "queue_auto"
              ? pendingConsentRequests > 0 || pendingJobs > 0 || blockedJobs > 0
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
        if (await stopIfRunWasCancelled()) {
          return;
        }
        if (!(await persistRunUnlessCancelled(currentRunState))) {
          return;
        }

        if (
          updatedResult.completedAt !== null ||
          updatedResult.state === "awaiting_review"
        ) {
          await persistAutomaticApplicationSafeguards({
            ctx,
            run: currentRunState,
            result: updatedResult,
            job,
            now: detectedAt,
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });
        }

        if (input.mode === "single_job_auto" || campaignPauseReason) {
          break;
        }
      }
    } catch (error) {
      if (await stopIfRunWasCancelled()) {
        return;
      }
      shouldCloseActiveSessionOnExit = Boolean(activeSource);
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
        detail:
          error instanceof Error
            ? error.message
            : "Unknown automatic apply failure.",
      });
      const persistedFailureRun =
        await persistRunUnlessCancelled(currentRunState);
      if (persistedFailureRun) {
        await persistAutomaticApplicationSafeguards({
          ctx,
          run: currentRunState,
          now: failedAt,
        }).catch((safeguardError: unknown) => {
          console.error(
            "Failed to persist automatic application safeguards.",
            safeguardError,
          );
        });
      }
      throw error;
    } finally {
      if (
        activeSource &&
        (!keepSessionAlive ||
          shouldCloseActiveSessionOnExit ||
          executionSignal.aborted)
      ) {
        try {
          await ctx.closeRunBrowserSession(activeSource);
        } catch (cleanupError) {
          console.error("Failed to close apply browser session.", cleanupError);
        }
      }
    }
  }

  function executeSafeApplyRun(input: {
    mode: "single_job_auto" | "queue_auto";
    runId: string;
  }): Promise<void> {
    if (ctx.activeApplyRunAbortControllers.has(input.runId)) {
      return Promise.reject(
        new Error(`Apply run '${input.runId}' is already executing.`),
      );
    }

    const executionController = new AbortController();
    ctx.activeApplyRunAbortControllers.set(input.runId, executionController);
    const executionPromise = executeSafeApplyRunOwned(
      input,
      executionController,
    ).finally(() => {
      if (
        ctx.activeApplyRunAbortControllers.get(input.runId) ===
        executionController
      ) {
        ctx.activeApplyRunAbortControllers.delete(input.runId);
      }
      if (ctx.activeApplyRunPromises.get(input.runId) === executionPromise) {
        ctx.activeApplyRunPromises.delete(input.runId);
      }
    });
    ctx.activeApplyRunPromises.set(input.runId, executionPromise);
    return executionPromise;
  }

  const resumeApplicationUserAction = createApplicationUserActionResumer(ctx, {
    resolveJobApplyPrerequisites,
  });

  return {
    resumeApplicationUserAction,
    async recordInterviewHelperApplicationAction(rawInput) {
      const input = JobFinderInterviewFollowUpInputSchema.parse(rawInput);
      const applicationRecords = await ctx.repository.listApplicationRecords();
      const existingRecord = applicationRecords.find(
        (record) => record.id === input.applicationRecordId,
      );

      if (!existingRecord) {
        throw new Error(
          `Unknown Job Finder application record '${input.applicationRecordId}'.`,
        );
      }

      const now = new Date().toISOString();
      const note = input.note?.trim();
      const terminalStatuses = new Set([
        "offer",
        "rejected",
        "withdrawn",
        "archived",
      ]);
      const shouldMarkInterview =
        input.action === "mark_interviewed" &&
        !terminalStatuses.has(existingRecord.status);
      const nextStatus = shouldMarkInterview
        ? "interview"
        : existingRecord.status;
      const lastActionLabel =
        input.action === "mark_interviewed"
          ? "Interview completed"
          : "Interview follow-up note added";
      const eventTitle =
        input.action === "mark_interviewed"
          ? "Interview marked complete"
          : "Interview follow-up note added";
      const eventDetail =
        note && note.length > 0
          ? `Interview Helper session ${input.sessionId}: ${note}`
          : `Interview Helper session ${input.sessionId} was reviewed and linked to this application record.`;

      if (shouldMarkInterview) {
        const savedJobs = await ctx.repository.listSavedJobs();
        if (savedJobs.some((job) => job.id === existingRecord.jobId)) {
          await ctx.updateJob(existingRecord.jobId, (job) =>
            SavedJobSchema.parse({
              ...job,
              status: "interview",
            }),
          );
        }
      }

      const nextRecord = ApplicationRecordSchema.parse({
        ...existingRecord,
        status: nextStatus,
        lastActionLabel,
        nextActionLabel:
          input.action === "mark_interviewed"
            ? "Add a follow-up note or track the interview outcome."
            : existingRecord.nextActionLabel,
        lastUpdatedAt: now,
        events: mergeEvents(existingRecord.events, [
          {
            id: createUniqueId("event"),
            at: now,
            title: eventTitle,
            detail: eventDetail,
            emphasis:
              input.action === "mark_interviewed" ? "positive" : "neutral",
          },
        ]),
      });

      await ctx.repository.upsertApplicationRecord(nextRecord);
      return ctx.getWorkspaceSnapshot();
    },
    async queueJobForReview(jobId) {
      const [discoveryState, settings] = await Promise.all([
        ctx.repository.getDiscoveryState(),
        ctx.repository.getSettings(),
      ]);
      const defaultResumeApplicationMode =
        settings.resumeApplicationMode ?? DEFAULT_RESUME_APPLICATION_MODE;
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex];
        if (!pendingJob) {
          throw new Error(`Unable to shortlist unknown job '${jobId}'.`);
        }
        const nextJob = SavedJobSchema.parse({
          ...pendingJob,
          status: "shortlisted",
          resumeApplicationMode:
            pendingJob.resumeApplicationMode ?? defaultResumeApplicationMode,
        });
        await ctx.repository.commitSavedJobDelta({
          upserts: [nextJob],
          update: (currentJob) =>
            currentJob.id === nextJob.id
              ? (mergeSavedJobs([currentJob], [nextJob])[0] ?? currentJob)
              : currentJob,
        });
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
          resumeApplicationMode:
            job.resumeApplicationMode ?? defaultResumeApplicationMode,
        }));
      }

      return ctx.getWorkspaceSnapshot();
    },
    async setJobResumeApplicationMode(jobId, resumeApplicationMode) {
      await ctx.updateJob(jobId, (job) =>
        SavedJobSchema.parse({
          ...job,
          resumeApplicationMode,
        }),
      );

      return ctx.getWorkspaceSnapshot();
    },
    async removeJobFromReview(jobId) {
      await ctx.updateJob(jobId, (job) =>
        SavedJobSchema.parse({
          ...job,
          status: "shortlisted",
        }),
      );

      return ctx.getWorkspaceSnapshot();
    },
    async dismissDiscoveryJob(input) {
      const discoveryState = await ctx.repository.getDiscoveryState();
      const savedJobs = await ctx.repository.listSavedJobs();
      const pendingJob =
        discoveryState.pendingDiscoveryJobs.find(
          (job) => job.id === input.jobId,
        ) ?? null;
      const targetJob =
        pendingJob ?? savedJobs.find((job) => job.id === input.jobId) ?? null;

      if (!targetJob) {
        throw new Error("Unable to hide unknown job '" + input.jobId + "'.");
      }

      const occurredAt = new Date().toISOString();
      const reasons = [...new Set(input.reasons)];
      const nextJob = SavedJobSchema.parse({
        ...targetJob,
        status: "archived",
        discoveryFeedback: {
          version: 1,
          revision: (targetJob.discoveryFeedback?.revision ?? 0) + 1,
          reasons,
          recordedAt: occurredAt,
        },
      });
      const nextDiscoveryState = {
        ...discoveryState,
        discoveryLedger: markSavedJobStatusInLedger({
          ledger: discoveryState.discoveryLedger,
          job: nextJob,
          status: "skipped",
          occurredAt,
          skipReason: "Not interested: " + reasons.join(", ") + ".",
        }),
        pendingDiscoveryJobs: discoveryState.pendingDiscoveryJobs.filter(
          (job) => job.id !== input.jobId,
        ),
      };

      await ctx.repository.commitSavedJobDelta({
        ...(pendingJob ? { upserts: [nextJob] } : {}),
        ...(!pendingJob
          ? {
              update: (job) =>
                job.id === input.jobId
                  ? SavedJobSchema.parse({
                      ...job,
                      status: nextJob.status,
                      discoveryFeedback: nextJob.discoveryFeedback,
                    })
                  : job,
            }
          : {}),
        discoveryState: nextDiscoveryState,
      });
      return ctx.getWorkspaceSnapshot();
    },
    async restoreDismissedDiscoveryJob(jobId) {
      const [discoveryState, savedJobs] = await Promise.all([
        ctx.repository.getDiscoveryState(),
        ctx.repository.listSavedJobs(),
      ]);
      const targetJob = savedJobs.find((job) => job.id === jobId) ?? null;

      if (!targetJob || targetJob.status !== "archived") {
        throw new Error(
          "Unable to restore unknown hidden job '" + jobId + "'.",
        );
      }

      const restoredJob = SavedJobSchema.parse({
        ...targetJob,
        status: "discovered",
        discoveryFeedback: null,
      });
      const nextDiscoveryState = {
        ...discoveryState,
        discoveryLedger: markSavedJobStatusInLedger({
          ledger: discoveryState.discoveryLedger,
          job: restoredJob,
          status: "seen",
          occurredAt: new Date().toISOString(),
          skipReason: null,
        }),
      };

      await ctx.repository.commitSavedJobDelta({
        update: (job) =>
          job.id === jobId
            ? SavedJobSchema.parse({
                ...job,
                status: restoredJob.status,
                discoveryFeedback: restoredJob.discoveryFeedback,
              })
            : job,
        discoveryState: nextDiscoveryState,
      });
      return ctx.getWorkspaceSnapshot();
    },
    async generateResume(jobId) {
      const [
        profile,
        searchPreferences,
        settings,
        savedJobs,
        tailoredAssets,
        intelligenceState,
        campaignState,
      ] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.getIntelligenceState(),
        ctx.repository.getCampaignState(),
      ]);
      const job = savedJobs.find((entry) => entry.id === jobId);

      if (!job) {
        throw new Error(
          `Unable to generate a resume for unknown job '${jobId}'.`,
        );
      }

      const existingAsset = tailoredAssets.find(
        (asset) => asset.jobId === jobId,
      );
      const existingDraft = await ctx.repository.getResumeDraftByJobId(jobId);
      const templates = ctx.documentManager.listResumeTemplates();
      const strategyContext = buildResumeStrategyContext({
        state: intelligenceState,
        job,
        campaignDefaultResumeStrategyId: resolveCampaignDefaultResumeStrategyId(
          campaignState,
          jobId,
        ),
      });
      const strategyPolicy = buildResumeGenerationStrategyPolicy({
        state: intelligenceState,
        job,
        campaignDefaultResumeStrategyId: resolveCampaignDefaultResumeStrategyId(
          campaignState,
          jobId,
        ),
      });
      const selectedBaseResumeDocumentId =
        strategyPolicy?.baseResumeDocumentId ?? profile.baseResume.id;
      const resumeImportBundles = strategyPolicy
        ? await ctx.repository.listResumeImportDocumentBundles()
        : [];
      const selectedBaseResume =
        resumeImportBundles.find(
          (bundle) =>
            bundle.id === selectedBaseResumeDocumentId ||
            bundle.sourceResumeId === selectedBaseResumeDocumentId,
        ) ?? null;
      const resumeText =
        selectedBaseResume?.fullText ?? profile.baseResume.textContent;
      const baseResumeFallbackNote =
        strategyPolicy &&
        selectedBaseResumeDocumentId !== profile.baseResume.id &&
        !selectedBaseResume?.fullText
          ? `Strategy base resume document "${selectedBaseResumeDocumentId}" was unavailable, so the current profile resume was used as the grounded source.`
          : null;
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
        resumeText,
        strategy: strategyPolicy,
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
      const now = createMonotonicTimestamp(existingDraft?.updatedAt ?? null);
      // A strategy may supply the template default for a fresh draft, but it
      // never approves or readies the artifact: the generated draft stays
      // unapproved and the per-job approval/staleness checks stay
      // authoritative.
      const strategyTemplateId =
        existingDraft?.templateId ?? strategyContext.templateId ?? null;
      const strategyDisplayName =
        strategyContext.selectedStrategyName ??
        strategyContext.recommendedStrategyName ??
        null;
      const resumeDraft = buildResumeDraftFromTailoredDraft({
        job,
        templateId: strategyTemplateId ?? settings.resumeTemplateId,
        draft,
        createdAt: existingDraft?.createdAt ?? now,
        updatedAt: now,
        existingDraftId: existingDraft?.id ?? null,
        generationMethod:
          generationMethod === "ai_assisted" ? "ai" : "deterministic",
        profile,
        research,
        headline:
          strategyPolicy?.headlinePolicy === "fixed"
            ? profile.headline
            : strategyPolicy?.headlinePolicy === "role_family_template"
              ? strategyPolicy.roleFamily
              : strategyPolicy?.headlinePolicy === "per_job_tailored"
                ? job.title
                : undefined,
      });
      const sanitizedResumeDraft = sanitizeResumeDraft({
        draft: resumeDraft,
        job,
        profile,
        ...(strategyPolicy ? { sourceSkills: draft.coreSkills } : {}),
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
        renderDocument: buildResumeRenderDocument(
          profile,
          sanitizedResumeDraft,
        ),
        templateId: sanitizedResumeDraft.templateId,
        settings,
      });

      if (!renderedArtifact.storagePath) {
        throw new Error(
          `Resume export failed for '${job.title}' at '${job.company}'.`,
        );
      }

      const validation = validateResumeDraft({
        draft: sanitizedResumeDraft,
        job,
        profile,
        strategy: strategyPolicy,
        pageCount: renderedArtifact.pageCount ?? null,
        validatedAt: now,
      });
      const workHistoryReviewSuggestions = buildWorkHistoryReviewSuggestions({
        draft: sanitizedResumeDraft,
        tailoredDraft: draft,
      });
      const validationWithReviewGuidance = ResumeValidationResultSchema.parse({
        ...validation,
        coverageComparison: buildResumeCoverageComparison({
          profile,
          draft: sanitizedResumeDraft,
          pageCount: renderedArtifact.pageCount ?? null,
          validationIssues: validation.issues,
          coverageMetadata: draft.coverageMetadata,
        }),
        issues: [
          ...validation.issues,
          ...workHistoryReviewSuggestions.map((suggestion) => ({
            id: `issue_${suggestion.id}`,
            severity: suggestion.severity,
            category:
              suggestion.kind === "date_quality"
                ? ("date_quality" as const)
                : ("work_history_review" as const),
            sectionId: suggestion.sectionId,
            entryId: suggestion.entryId,
            bulletId: null,
            message: suggestion.message,
          })),
        ],
      });
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: "resume",
        status: "ready",
        label: draft.label ?? "Tailored Resume",
        version: nextAssetVersion(existingAsset),
        templateName: resolveResumeTemplateLabel({
          templateId: sanitizedResumeDraft.templateId,
          templates,
          fallbackLabel: existingAsset?.templateName ?? "Chronology Classic",
        }),
        compatibilityScore:
          draft.compatibilityScore ??
          Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: now,
        storagePath: renderedArtifact.storagePath,
        contentText,
        previewSections,
        generationMethod,
        notes: uniqueStrings([
          ...draft.notes,
          ...(strategyTemplateId && !existingDraft
            ? [
                `Used resume strategy${strategyDisplayName ? ` "${strategyDisplayName}"` : ""} as the template default. The strategy does not approve or ready this artifact; it still needs your review and explicit approval.`,
              ]
            : []),
          ...(strategyPolicy
            ? [
                `Applied resume strategy "${strategyPolicy.strategyName}" (${strategyPolicy.effectiveSource}: ${strategyPolicy.effectiveReason}); policies ${strategyPolicy.headlinePolicy} headline, ${strategyPolicy.skillsPolicy} skills, ${strategyPolicy.coveragePolicy} coverage, ${strategyPolicy.tailoringStrength} tailoring.`,
              ]
            : []),
          ...(baseResumeFallbackNote ? [baseResumeFallbackNote] : []),
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
          renderedArtifact.pageCount > sanitizedResumeDraft.targetPageCount
            ? [
                renderedArtifact.pageCount >= 3
                  ? "Resume export reached 3 or more pages and needs review before apply."
                  : `Resume export exceeded the ${sanitizedResumeDraft.targetPageCount}-page target and should be reviewed.`,
              ]
            : []),
        ]),
      });

      if (
        existingDraft &&
        buildResumeDraftStateHash(existingDraft) !==
          buildResumeDraftStateHash(sanitizedResumeDraft)
      ) {
        const revision = buildResumeDraftRevision({
          draft: existingDraft,
          resultingDraft: sanitizedResumeDraft,
          createdAt: now,
          parentRevisionId: await getLatestResumeRevisionId(
            ctx,
            existingDraft.id,
          ),
          actor: "assistant",
          mutationKind: "regenerate_draft",
          reason: "Regenerated full resume draft",
        });
        await ctx.repository.applyResumePatchWithRevision({
          expectedDraftUpdatedAt: existingDraft.updatedAt,
          draft: sanitizedResumeDraft,
          revision,
          validation: validationWithReviewGuidance,
          tailoredAsset: nextAsset,
        });
      } else {
        await ctx.repository.saveResumeDraftWithValidation({
          draft: sanitizedResumeDraft,
          validation: validationWithReviewGuidance,
          tailoredAsset: nextAsset,
        });
      }
      await ctx.updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: "ready_for_review",
      }));

      return ctx.getWorkspaceSnapshot();
    },
    async getResumeWorkspace(jobId) {
      return buildResumeWorkspace(ctx, jobId);
    },
    async previewResumeDraft(draft, signal) {
      return previewResumeDraft(ctx, ResumeDraftSchema.parse(draft), signal);
    },
    async saveResumeDraft(draft) {
      const parsedDraft = ResumeDraftSchema.parse(draft);
      return withResumeDraftTransition(parsedDraft.jobId, async () => {
        const { job, profile, tailoredAsset, templates } =
          await ensureResumeDraft(ctx, parsedDraft.jobId);
        const currentDraft = await ctx.repository.getResumeDraftByJobId(
          parsedDraft.jobId,
        );
        if (!currentDraft) {
          throw new Error(`Unable to find resume draft '${parsedDraft.id}'.`);
        }
        const parsedStateHash = buildResumeDraftStateHash(parsedDraft);
        const currentStateHash = buildResumeDraftStateHash(currentDraft);
        if (
          parsedDraft.updatedAt !== currentDraft.updatedAt &&
          parsedStateHash !== currentStateHash
        ) {
          throw new Error(
            "Resume draft changed before this edit could be saved. Reload the workspace and try again.",
          );
        }
        const now = createMonotonicTimestamp(currentDraft.updatedAt);
        const hadApprovedExport = wasResumeDraftApproved(currentDraft);
        const nextDraft = ResumeDraftSchema.parse({
          ...parsedDraft,
          status: hadApprovedExport ? "stale" : "needs_review",
          approvedAt: null,
          approvedExportId: null,
          staleReason: hadApprovedExport
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
        const previousValidation =
          (
            await ctx.repository.listResumeValidationResults(sanitizedDraft.id)
          )[0] ?? null;
        const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
          validation,
          previousValidation,
          draft: sanitizedDraft,
        });
        const nextAsset = buildTailoredAssetBridge({
          draft: sanitizedDraft,
          job,
          profile,
          existingAsset: tailoredAsset,
          storagePath: tailoredAsset?.storagePath ?? null,
          templates,
        });

        if (currentStateHash !== buildResumeDraftStateHash(sanitizedDraft)) {
          const revision = buildResumeDraftRevision({
            draft: currentDraft,
            resultingDraft: sanitizedDraft,
            createdAt: now,
            parentRevisionId: await getLatestResumeRevisionId(
              ctx,
              currentDraft.id,
            ),
            actor: "user",
            mutationKind: "manual_save",
            reason:
              currentDraft.templateId !== sanitizedDraft.templateId
                ? "Changed resume template"
                : "Saved resume draft edits",
          });
          await ctx.repository.applyResumePatchWithRevision({
            expectedDraftUpdatedAt: currentDraft.updatedAt,
            draft: sanitizedDraft,
            revision,
            validation: validationWithReviewGuidance,
            tailoredAsset: nextAsset,
          });
        } else {
          await ctx.repository.saveResumeDraftWithValidation({
            draft: sanitizedDraft,
            validation: validationWithReviewGuidance,
            tailoredAsset: nextAsset,
          });
        }

        return ctx.getWorkspaceSnapshot();
      });
    },
    async restoreResumeDraftRevision(jobId, revisionId) {
      const state = await ensureResumeDraft(ctx, jobId);
      const revisions = await ctx.repository.listResumeDraftRevisions(
        state.draft.id,
      );
      const targetRevision = revisions.find(
        (revision) => revision.id === revisionId,
      );
      if (!targetRevision) {
        throw new Error(`Unknown resume revision '${revisionId}'.`);
      }
      if (!targetRevision.snapshotDraft) {
        throw new Error(
          "This legacy resume revision cannot be restored because it does not contain a complete draft snapshot.",
        );
      }
      if (
        targetRevision.draftId !== state.draft.id ||
        targetRevision.snapshotDraft.id !== state.draft.id ||
        targetRevision.snapshotDraft.jobId !== jobId
      ) {
        throw new Error("Resume revision does not belong to this job draft.");
      }

      const restoredAt = createMonotonicTimestamp(state.draft.updatedAt);
      const restoredDraft = sanitizeResumeDraft({
        draft: ResumeDraftSchema.parse({
          ...targetRevision.snapshotDraft,
          id: state.draft.id,
          jobId,
          status: "needs_review",
          approvedAt: null,
          approvedExportId: null,
          staleReason: "Restored from resume history and needs a fresh review.",
          createdAt: state.draft.createdAt,
          updatedAt: restoredAt,
        }),
        job: state.job,
        profile: state.profile,
      });
      if (
        buildResumeDraftStateHash(restoredDraft) ===
        buildResumeDraftStateHash(state.draft)
      ) {
        return ctx.getWorkspaceSnapshot();
      }

      const validation = validateResumeDraft({
        draft: restoredDraft,
        job: state.job,
        profile: state.profile,
        validatedAt: restoredAt,
      });
      const previousValidation =
        (await ctx.repository.listResumeValidationResults(state.draft.id))[0] ??
        null;
      const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
        validation,
        previousValidation,
        draft: restoredDraft,
      });
      const nextAsset = buildTailoredAssetBridge({
        draft: restoredDraft,
        job: state.job,
        profile: state.profile,
        existingAsset: state.tailoredAsset,
        clearStoragePath: true,
        templates: state.templates,
      });
      const restoreRevision = buildResumeDraftRevision({
        draft: state.draft,
        resultingDraft: restoredDraft,
        createdAt: restoredAt,
        parentRevisionId: revisions[0]?.id ?? null,
        actor: "restore",
        mutationKind: "restore",
        restoredFromRevisionId: targetRevision.id,
        reason: `Restored resume revision from ${targetRevision.createdAt}`,
      });

      await ctx.repository.applyResumePatchWithRevision({
        expectedDraftUpdatedAt: state.draft.updatedAt,
        draft: restoredDraft,
        revision: restoreRevision,
        validation: validationWithReviewGuidance,
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
      const targetSection = draft.sections.find(
        (section) => section.id === sectionId,
      );

      if (!targetSection) {
        throw new Error(
          `Unable to regenerate unknown resume section '${sectionId}'.`,
        );
      }

      if (
        targetSection.locked ||
        targetSection.bullets.some((bullet) => bullet.locked)
      ) {
        throw new Error(
          `Unlock the '${targetSection.label}' section before regenerating it.`,
        );
      }

      if (
        targetSection.entries.some(
          (entry) =>
            entry.locked || entry.bullets.some((bullet) => bullet.locked),
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
        validationIssues:
          (
            await ctx.repository.listResumeValidationResults(draft.id)
          )[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const sectionPatch = assistantReply.patches.find(
        (patch) => patch.targetSectionId === sectionId,
      );

      if (!sectionPatch) {
        return this.applyResumePatch(
          {
            id: createUniqueId(`resume_patch_regen_${sectionId}`),
            draftId: draft.id,
            operation: targetSection.text
              ? "replace_section_text"
              : "replace_section_bullets",
            targetSectionId: sectionId,
            targetEntryId: null,
            anchorEntryId: null,
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
          },
          "Regenerated section fallback",
        );
      }

      return this.applyResumePatch(sectionPatch, "Regenerated section");
    },
    async exportResumePdf(jobId, outputPath) {
      return withResumeDraftTransition(jobId, async () => {
        const { draft, job, profile, settings, tailoredAsset, templates } =
          await ensureResumeDraft(ctx, jobId);
        const preExportValidation = validateResumeDraft({
          draft,
          job,
          profile,
        });
        if (
          preExportValidation.claimAssessments.some(
            (assessment) =>
              assessment.status === "unsupported" ||
              (assessment.status === "review" &&
                (assessment.claimOrigin === "ai_generated" ||
                  assessment.claimOrigin === "assistant_edited" ||
                  assessment.claimOrigin === "deterministic_fallback")),
          )
        ) {
          const previousValidation =
            (await ctx.repository.listResumeValidationResults(draft.id))[0] ??
            null;
          const visibleValidation = preserveWorkHistoryReviewGuidance({
            validation: preExportValidation,
            previousValidation,
            draft,
          });
          await assertResumeDraftCurrent(draft);
          await ctx.repository.saveResumeDraftWithValidation({
            draft,
            validation: visibleValidation,
            tailoredAsset,
          });
          throw new Error(
            "This resume has blocking candidate-claim validation issues and cannot be exported yet.",
          );
        }
        const renderedArtifact = await renderDraftToPdf(ctx, {
          job,
          profile,
          settings,
          draft,
          outputPath: outputPath ?? null,
        });

        if (!renderedArtifact.storagePath) {
          throw new Error(
            `Resume export failed for '${job.title}' at '${job.company}'.`,
          );
        }

        const exportedAt = new Date().toISOString();
        const exportArtifact = buildResumeExportArtifact({
          draft,
          job,
          filePath: renderedArtifact.storagePath,
          format: renderedArtifact.format,
          sha256: renderedArtifact.sha256 ?? null,
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
        const previousValidation =
          (await ctx.repository.listResumeValidationResults(draft.id))[0] ??
          null;
        const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
          validation,
          previousValidation,
          draft,
        });
        const nextAsset = buildTailoredAssetBridge({
          draft,
          job,
          profile,
          existingAsset: tailoredAsset,
          storagePath: renderedArtifact.storagePath,
          pageCount: renderedArtifact.pageCount ?? null,
          templates,
          notes: uniqueStrings([
            ...(renderedArtifact.fileName
              ? [`Generated PDF resume artifact ${renderedArtifact.fileName}.`]
              : []),
            ...(renderedArtifact.intermediateFileName
              ? [
                  `Saved HTML debug render ${renderedArtifact.intermediateFileName}.`,
                ]
              : []),
            ...(renderedArtifact.warnings ?? []),
          ]),
        });

        await assertResumeDraftCurrent(draft);
        await ctx.repository.upsertResumeExportArtifact(exportArtifact);
        await assertResumeDraftCurrent(draft);
        await ctx.repository.saveResumeDraftWithValidation({
          draft,
          validation: validationWithReviewGuidance,
          tailoredAsset: nextAsset,
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async approveResume(jobId, exportId) {
      return withResumeDraftTransition(jobId, async () => {
        const { draft, job, profile, tailoredAsset, templates } =
          await ensureResumeDraft(ctx, jobId);
        const [exports, validations] = await Promise.all([
          ctx.repository.listResumeExportArtifacts({ jobId }),
          ctx.repository.listResumeValidationResults(draft.id),
        ]);
        const targetExport = exports.find(
          (artifact) => artifact.id === exportId,
        );
        const latestValidation = validations[0] ?? null;

        if (!targetExport) {
          throw new Error(
            `Unable to approve unknown resume export '${exportId}'.`,
          );
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

        if (
          !latestValidation ||
          latestValidation.draftContentHash !==
            buildResumeDraftContentHash(draft)
        ) {
          throw new Error(
            `Resume export '${exportId}' does not have a current claim-grounding assessment. Export a fresh PDF before approval.`,
          );
        }

        if (
          latestValidation.claimAssessments.some(
            (assessment) =>
              assessment.status === "unsupported" ||
              (assessment.status === "review" &&
                (assessment.claimOrigin === "ai_generated" ||
                  assessment.claimOrigin === "assistant_edited" ||
                  assessment.claimOrigin === "deterministic_fallback")),
          )
        ) {
          throw new Error(
            `Resume export '${exportId}' contains unsupported candidate claims and cannot be approved.`,
          );
        }

        if (
          latestValidation?.issues.some((issue) => issue.severity === "error")
        ) {
          throw new Error(
            `Resume export '${exportId}' still has blocking validation errors and cannot be approved yet.`,
          );
        }

        const template =
          templates.find((entry) => entry.id === draft.templateId) ?? null;

        if (!template || !isResumeTemplateApprovalEligible(template)) {
          throw new Error(
            `Resume export '${exportId}' uses a share-ready template and cannot be approved for apply-safe flows. Choose an apply-safe template and export a fresh PDF instead.`,
          );
        }

        if (
          ctx.exportFileVerifier &&
          !(await ctx.exportFileVerifier.exists(targetExport.filePath))
        ) {
          throw new Error(
            `Resume export '${exportId}' is missing on disk and cannot be approved. Export a fresh file first.`,
          );
        }
        const verifiedSha256 = await verifyResumeFileIntegrity({
          expectedSha256: targetExport.sha256,
          filePath: targetExport.filePath,
          label: "The resume export",
        });

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
          templates,
        });

        await assertResumeDraftCurrent(draft);
        await ctx.repository.approveResumeExport({
          draft: approvedDraft,
          exportArtifact: {
            ...targetExport,
            sha256: verifiedSha256,
            isApproved: true,
          },
          validation: latestValidation,
          tailoredAsset: nextAsset,
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async clearResumeApproval(jobId) {
      return withResumeDraftTransition(jobId, async () => {
        const { draft, job, profile, tailoredAsset, templates } =
          await ensureResumeDraft(ctx, jobId);
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
          templates,
        });

        await assertResumeDraftCurrent(draft);
        await ctx.repository.clearResumeApproval({
          draft: nextDraft,
          staleReason: nextDraft.staleReason ?? "Resume approval cleared.",
          tailoredAsset: nextAsset,
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async applyResumePatch(patch, revisionReason) {
      const parsedPatch = ResumeDraftPatchSchema.parse(patch);
      return withResumeDraftTransition(parsedPatch.draftId, async () => {
        const currentDraft =
          (await ctx.repository.listResumeDrafts()).find(
            (entry) => entry.id === parsedPatch.draftId,
          ) ?? null;

        if (!currentDraft) {
          throw new Error(
            `Unable to find resume draft '${parsedPatch.draftId}'.`,
          );
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
        if (
          buildResumeDraftStateHash(currentDraft) ===
          buildResumeDraftStateHash(sanitizedDraft)
        ) {
          return ctx.getWorkspaceSnapshot();
        }
        const revision = buildResumeDraftRevision({
          draft: currentDraft,
          resultingDraft: sanitizedDraft,
          createdAt: updatedAt,
          parentRevisionId: await getLatestResumeRevisionId(
            ctx,
            currentDraft.id,
          ),
          actor: parsedPatch.origin === "assistant" ? "assistant" : "user",
          mutationKind:
            revisionReason?.startsWith("Regenerated section") === true
              ? "regenerate_section"
              : "manual_patch",
          reason: revisionReason ?? null,
        });
        const validation = validateResumeDraft({
          draft: sanitizedDraft,
          job: state.job,
          profile: state.profile,
          validatedAt: updatedAt,
        });
        const previousValidation =
          (
            await ctx.repository.listResumeValidationResults(currentDraft.id)
          )[0] ?? null;
        const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
          validation,
          previousValidation,
          draft: sanitizedDraft,
        });
        const nextAsset = buildTailoredAssetBridge({
          draft: sanitizedDraft,
          job: state.job,
          profile: state.profile,
          existingAsset: state.tailoredAsset,
          clearStoragePath: true,
          templates: state.templates,
        });

        await ctx.repository.applyResumePatchWithRevision({
          expectedDraftUpdatedAt: currentDraft.updatedAt,
          draft: sanitizedDraft,
          revision,
          validation: validationWithReviewGuidance,
          tailoredAsset: nextAsset,
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async getResumeAssistantMessages(jobId) {
      await ensureResumeDraft(ctx, jobId);
      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async sendResumeAssistantMessage(jobId, content) {
      const workspaceState = await ensureResumeDraft(ctx, jobId);
      const messageTimestamp = createMonotonicTimestamp(
        workspaceState.draft.updatedAt,
      );
      const assistantMessageTimestamp =
        createMonotonicTimestamp(messageTimestamp);
      const userMessage = ResumeAssistantMessageSchema.parse({
        id: createUniqueId(`resume_message_user_${jobId}`),
        jobId,
        role: "user",
        content,
        patches: [],
        createdAt: messageTimestamp,
      });
      const validations = await ctx.repository.listResumeValidationResults(
        workspaceState.draft.id,
      );
      const research = await fetchAndPersistResearch(ctx, workspaceState.job);
      const assistantReply = await ctx.aiClient.reviseResumeDraft({
        draft: workspaceState.draft,
        job: workspaceState.job,
        request: content,
        validationIssues:
          validations[0]?.issues.map((issue) => issue.message) ?? [],
        researchContext: collectResearchContext(research),
      });
      const normalizedPatches = assistantReply.patches.map((patch) =>
        ResumeDraftPatchSchema.parse({
          ...patch,
          draftId: workspaceState.draft.id,
          targetEntryId: patch.targetEntryId ?? null,
        }),
      );
      const invalidReplacementPatch = normalizedPatches.find(
        (patch) =>
          [
            "replace_section_text",
            "replace_entry_summary",
            "update_bullet",
          ].includes(patch.operation) && !patch.newText?.trim(),
      );
      const reviewablePatches = invalidReplacementPatch
        ? []
        : normalizedPatches;
      const assistantContent =
        reviewablePatches.length > 0
          ? `I prepared ${reviewablePatches.length} grounded resume edit${reviewablePatches.length === 1 ? "" : "s"} for your review. Nothing changed yet; select the changes you want and accept them explicitly.`
          : invalidReplacementPatch
            ? "I could not produce a usable replacement for that request, so no resume change was proposed. Try asking for the exact section and outcome you want."
            : assistantReply.content;
      const assistantMessage = buildAssistantReplyMessage({
        jobId,
        content: assistantContent,
        patches: reviewablePatches,
        baseDraftUpdatedAt: workspaceState.draft.updatedAt,
        executionAttribution: assistantReply.executionReceipt,
        createdAt: assistantMessageTimestamp,
      });

      let candidateDraft = workspaceState.draft;
      try {
        for (const patch of reviewablePatches) {
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
          proposalError: failureDetail,
          executionAttribution: assistantReply.executionReceipt,
          createdAt: assistantMessageTimestamp,
        });

        await ctx.repository.upsertResumeAssistantMessage(userMessage);
        await ctx.repository.upsertResumeAssistantMessage(failureMessage);
        return ctx.repository.listResumeAssistantMessages(jobId);
      }

      await ctx.repository.upsertResumeAssistantMessage(userMessage);
      await ctx.repository.upsertResumeAssistantMessage(assistantMessage);

      return ctx.repository.listResumeAssistantMessages(jobId);
    },
    async resolveResumeAssistantProposal(jobId, proposalId, action, patchIds) {
      return withResumeDraftTransition(jobId, async () => {
        const proposal = (
          await ctx.repository.listResumeAssistantMessages(jobId)
        ).find((message) => message.id === proposalId);
        if (!proposal || proposal.role !== "assistant") {
          throw new Error(`Unable to find resume proposal '${proposalId}'.`);
        }
        if (proposal.proposalStatus !== "pending") {
          throw new Error("This resume proposal has already been resolved.");
        }

        const resolvedAt = createMonotonicTimestamp(proposal.createdAt);
        if (action === "reject") {
          await ctx.repository.upsertResumeAssistantMessage(
            ResumeAssistantMessageSchema.parse({
              ...proposal,
              proposalStatus: "rejected",
              resolvedPatchIds: [],
              resolvedAt,
              proposalError: null,
            }),
          );
          return ctx.repository.listResumeAssistantMessages(jobId);
        }

        const uniquePatchIds = [...new Set(patchIds)];
        const proposalPatchIds = new Set(
          proposal.patches.map((patch) => patch.id),
        );
        if (
          uniquePatchIds.length === 0 ||
          uniquePatchIds.some((patchId) => !proposalPatchIds.has(patchId))
        ) {
          throw new Error(
            "Select at least one change from this exact proposal.",
          );
        }

        const workspaceState = await ensureResumeDraft(ctx, jobId);
        if (
          !proposal.baseDraftUpdatedAt ||
          workspaceState.draft.updatedAt !== proposal.baseDraftUpdatedAt
        ) {
          const message =
            "The resume changed after this proposal was created. Review the current draft and request fresh edits.";
          await ctx.repository.upsertResumeAssistantMessage(
            ResumeAssistantMessageSchema.parse({
              ...proposal,
              proposalError: message,
            }),
          );
          throw new Error(message);
        }

        try {
          let candidateDraft = workspaceState.draft;
          for (const patch of proposal.patches) {
            if (!uniquePatchIds.includes(patch.id)) {
              continue;
            }
            candidateDraft = applyPatchToResumeDraft({
              draft: candidateDraft,
              patch,
              updatedAt: createMonotonicTimestamp(candidateDraft.updatedAt),
            });
          }

          const finalUpdatedAt = createMonotonicTimestamp(
            candidateDraft.updatedAt,
          );
          const sanitizedDraft = sanitizeResumeDraft({
            draft: candidateDraft,
            job: workspaceState.job,
            profile: workspaceState.profile,
          });
          if (
            buildResumeDraftStateHash(workspaceState.draft) ===
            buildResumeDraftStateHash(sanitizedDraft)
          ) {
            throw new Error(
              "The selected proposal does not change the current resume.",
            );
          }

          const revision = buildResumeDraftRevision({
            draft: workspaceState.draft,
            resultingDraft: sanitizedDraft,
            createdAt: finalUpdatedAt,
            parentRevisionId: await getLatestResumeRevisionId(
              ctx,
              workspaceState.draft.id,
            ),
            actor: "assistant",
            mutationKind: "assistant_patch",
            reason: `Approved guided edits proposal: ${proposal.content}`,
          });
          const validations = await ctx.repository.listResumeValidationResults(
            workspaceState.draft.id,
          );
          const validation = validateResumeDraft({
            draft: sanitizedDraft,
            job: workspaceState.job,
            profile: workspaceState.profile,
            validatedAt: finalUpdatedAt,
          });
          const validationWithReviewGuidance =
            preserveWorkHistoryReviewGuidance({
              validation,
              previousValidation: validations[0] ?? null,
              draft: sanitizedDraft,
            });
          const nextAsset = buildTailoredAssetBridge({
            draft: sanitizedDraft,
            job: workspaceState.job,
            profile: workspaceState.profile,
            existingAsset: workspaceState.tailoredAsset,
            clearStoragePath: true,
            templates: workspaceState.templates,
          });

          await ctx.repository.applyResumePatchWithRevision({
            expectedDraftUpdatedAt: workspaceState.draft.updatedAt,
            draft: sanitizedDraft,
            revision,
            validation: validationWithReviewGuidance,
            tailoredAsset: nextAsset,
          });
          await ctx.repository.upsertResumeAssistantMessage(
            ResumeAssistantMessageSchema.parse({
              ...proposal,
              proposalStatus: "accepted",
              resolvedPatchIds: uniquePatchIds,
              resolvedAt,
              proposalError: null,
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The selected resume changes could not be applied.";
          await ctx.repository.upsertResumeAssistantMessage(
            ResumeAssistantMessageSchema.parse({
              ...proposal,
              proposalError: message,
            }),
          );
          throw error;
        }

        return ctx.repository.listResumeAssistantMessages(jobId);
      });
    },
    async approveApply(jobId) {
      const claim = claimDirectApplyExecution(jobId);
      return trackDirectApplyExecution(claim, async () => {
        await requireApplyActivityEnabled();
        const [
          profile,
          searchPreferences,
          settings,
          savedJobs,
          applicationRecords,
          sourceInstructionArtifacts,
          sourceDebugAttempts,
          discoveryState,
        ] = await Promise.all([
          ctx.repository.getProfile(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.listSavedJobs(),
          ctx.repository.listApplicationRecords(),
          ctx.repository.listSourceInstructionArtifacts(),
          ctx.repository.listSourceDebugAttempts(),
          ctx.repository.getDiscoveryState(),
        ]);
        const job = savedJobs.find((entry) => entry.id === jobId);

        if (!job) {
          throw new Error(
            `Unable to approve apply flow for unknown job '${jobId}'.`,
          );
        }

        const { resumeApplicationMode, resumeArtifact } =
          await resolveJobApplyPrerequisites(jobId);
        const capturedCampaignId = await ctx.getActiveCampaignId();
        await assertNoOtherRunningApplyForJob(claim);
        await assertDirectApplyExecutionCanContinue(claim);
        await persistDirectApplyRunStart({
          claim,
          job,
          campaignId: capturedCampaignId,
          startedAt: new Date().toISOString(),
        });
        await assertDirectApplyExecutionCanContinue(claim);

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

        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            job.source,
            {
              job,
              resumeArtifact,
              profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              intermediateMutationsAuthorized: true,
              accountCreationAuthorized: false,
              submitAuthorized: false,
              ...(applyInstructions.length > 0
                ? { instructions: applyInstructions }
                : {}),
            },
            { signal: claim.controller.signal },
          ),
        );
        await assertDirectApplyExecutionCanContinue(claim);
        const now = new Date().toISOString();
        const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
          activeInstruction,
          sourceDebugAttempts,
        });
        const questions = executionResult.questions.map((question) =>
          ApplicationAttemptQuestionSchema.parse(question),
        );
        const consentDecisions = executionResult.consentDecisions.map(
          (decision) => ApplicationAttemptConsentDecisionSchema.parse(decision),
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
        const runArtifacts = buildApplyCopilotArtifacts({
          job,
          resumeArtifact,
          executionResult: {
            ...executionResult,
            blocker,
            replay,
          },
          detectedAt: now,
          runId: claim.runId,
          resultId: claim.resultId,
        });
        const persistedRun = ApplyRunSchema.parse({
          ...runArtifacts.run,
          campaignId: capturedCampaignId,
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
          visualEvidence: executionResult.visualEvidence,
          visualObservationSets: executionResult.visualObservationSets,
          visualCheckpoints: executionResult.visualCheckpoints,
          nextActionLabel: executionResult.nextActionLabel,
          executionTimings: executionResult.executionTimings,
        });

        await assertDirectApplyExecutionCanContinue(claim);
        await ctx.repository.upsertApplicationAttempt(attempt);
        await Promise.all([
          ctx.repository.upsertApplyRun(persistedRun),
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

        const existingRecord = applicationRecords.find(
          (record) => record.jobId === jobId,
        );
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
          replaySummary: buildReplaySummary(
            attempt.replay,
            attempt.visualEvidence,
          ),
          events: mergeEvents(
            existingRecord?.events ?? [],
            toApplicationEvents(job, executionResult.checkpoints),
          ),
        });

        await ctx.repository.upsertApplicationRecord(nextRecord);
        if (executionResult.state === "submitted") {
          await ctx.repository.commitSavedJobDelta({
            update: (savedJob) =>
              savedJob.id === jobId
                ? SavedJobSchema.parse({
                    ...savedJob,
                    status: nextJobStatusFromAttempt(
                      savedJob,
                      executionResult.state,
                    ),
                  })
                : savedJob,
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
          await ctx.repository.commitSavedJobDelta({
            update: (savedJob) =>
              savedJob.id === jobId
                ? SavedJobSchema.parse({
                    ...savedJob,
                    status: nextJobStatusFromAttempt(
                      savedJob,
                      executionResult.state,
                    ),
                  })
                : savedJob,
          });
        }

        return ctx.getWorkspaceSnapshot();
      });
    },
    async startApplyCopilotRun(jobId, options) {
      const claim = claimDirectApplyExecution(jobId);
      return trackDirectApplyExecution(claim, async () => {
        await requireApplyActivityEnabled();
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
        const capturedCampaignId = await ctx.getActiveCampaignId();
        const job = savedJobs.find((entry) => entry.id === jobId) ?? null;

        if (!job) {
          throw new Error(
            `Unable to start apply copilot for unknown job '${jobId}'.`,
          );
        }

        const approvedExport = draft?.approvedExportId
          ? (approvedExports.find(
              (entry) => entry.id === draft.approvedExportId,
            ) ?? null)
          : null;
        const asset =
          tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;
        const originalResumePath = profile.baseResume.storagePath?.trim() ?? "";
        const usesOriginalResume =
          resolveJobResumeApplicationMode(job, settings) === "original_resume";

        const shouldBlockForMissingResume = usesOriginalResume
          ? !originalResumePath
          : !draft ||
            draft.status !== "approved" ||
            !approvedExport ||
            !asset ||
            asset.status !== "ready" ||
            asset.storagePath !== approvedExport.filePath;

        if (!shouldBlockForMissingResume && ctx.exportFileVerifier) {
          const approvedFileExists = await ctx.exportFileVerifier.exists(
            usesOriginalResume ? originalResumePath : approvedExport!.filePath,
          );

          if (!approvedFileExists) {
            const detectedAt = new Date().toISOString();
            const artifacts = buildMissingResumeCopilotArtifacts({
              job,
              detectedAt,
            });
            await assertDirectApplyExecutionCanContinue(claim);
            const existingRecord =
              applicationRecords.find((record) => record.jobId === jobId) ??
              null;
            const persistedRun = ApplyRunSchema.parse({
              ...artifacts.run,
              campaignId: capturedCampaignId,
              visualCheckpointsEnabled:
                options?.visualCheckpointsEnabled === true,
            });

            await Promise.all([
              ctx.repository.upsertApplyRun(persistedRun),
              ctx.repository.upsertApplyJobResult(artifacts.result),
              ctx.repository.upsertApplicationQuestionRecord(
                artifacts.questionRecord,
              ),
              ctx.repository.upsertApplicationArtifactRef(
                artifacts.artifactRef,
              ),
              ctx.repository.upsertApplicationReplayCheckpoint(
                artifacts.checkpoint,
              ),
              ctx.repository.upsertApplicationConsentRequest(
                artifacts.consentRequest,
              ),
              ctx.repository.upsertApplicationRecord(
                mergeMissingResumeApplicationRecord({
                  applicationRecord: artifacts.applicationRecord,
                  existingRecord,
                }),
              ),
            ]);

            await persistAutomaticApplicationSafeguards({
              ctx,
              run: persistedRun,
              result: artifacts.result,
              job,
              now: detectedAt,
            }).catch((safeguardError: unknown) => {
              console.error(
                "Failed to persist automatic application safeguards.",
                safeguardError,
              );
            });

            return ctx.getWorkspaceSnapshot();
          }
        }

        if (shouldBlockForMissingResume) {
          const detectedAt = new Date().toISOString();
          const artifacts = buildMissingResumeCopilotArtifacts({
            job,
            detectedAt,
          });
          await assertDirectApplyExecutionCanContinue(claim);
          const existingRecord =
            applicationRecords.find((record) => record.jobId === jobId) ?? null;
          const persistedRun = ApplyRunSchema.parse({
            ...artifacts.run,
            campaignId: capturedCampaignId,
            visualCheckpointsEnabled:
              options?.visualCheckpointsEnabled === true,
          });

          await Promise.all([
            ctx.repository.upsertApplyRun(persistedRun),
            ctx.repository.upsertApplyJobResult(artifacts.result),
            ctx.repository.upsertApplicationQuestionRecord(
              artifacts.questionRecord,
            ),
            ctx.repository.upsertApplicationArtifactRef(artifacts.artifactRef),
            ctx.repository.upsertApplicationReplayCheckpoint(
              artifacts.checkpoint,
            ),
            ctx.repository.upsertApplicationConsentRequest(
              artifacts.consentRequest,
            ),
            ctx.repository.upsertApplicationRecord(
              mergeMissingResumeApplicationRecord({
                applicationRecord: artifacts.applicationRecord,
                existingRecord,
              }),
            ),
          ]);

          await persistAutomaticApplicationSafeguards({
            ctx,
            run: persistedRun,
            result: artifacts.result,
            job,
            now: detectedAt,
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });

          return ctx.getWorkspaceSnapshot();
        }

        const { resumeApplicationMode, resumeArtifact } =
          await resolveJobApplyPrerequisites(jobId);
        await assertNoOtherRunningApplyForJob(claim);
        await assertDirectApplyExecutionCanContinue(claim);
        await persistDirectApplyRunStart({
          claim,
          job,
          campaignId: capturedCampaignId,
          startedAt: new Date().toISOString(),
        });
        await assertDirectApplyExecutionCanContinue(claim);

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

        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            job.source,
            {
              job,
              resumeArtifact,
              profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              intermediateMutationsAuthorized: true,
              accountCreationAuthorized: false,
              submitAuthorized: false,
              ...(recoverySeed.recoveryContext
                ? { recoveryContext: recoverySeed.recoveryContext }
                : {}),
              ...(applyInstructions.length > 0
                ? { instructions: applyInstructions }
                : {}),
              ...buildApplyVisualExecutionOptions({
                enabled: options?.visualCheckpointsEnabled === true,
                source: job.source,
              }),
            },
            { signal: claim.controller.signal },
          ),
        );
        await assertDirectApplyExecutionCanContinue(claim);
        const detectedAt = new Date().toISOString();
        const sourceDebugEvidenceRefIds = buildEvidenceRefIdsFromInstruction({
          activeInstruction,
          sourceDebugAttempts,
        });
        const questions = executionResult.questions.map((question) =>
          ApplicationAttemptQuestionSchema.parse(question),
        );
        const consentDecisions = executionResult.consentDecisions.map(
          (decision) => ApplicationAttemptConsentDecisionSchema.parse(decision),
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
          completedAt:
            executionResult.state === "in_progress" ? null : detectedAt,
          outcome: executionResult.outcome,
          checkpoints: executionResult.checkpoints,
          questions,
          blocker,
          consentDecisions,
          replay,
          visualEvidence: executionResult.visualEvidence,
          visualObservationSets: executionResult.visualObservationSets,
          visualCheckpoints: executionResult.visualCheckpoints,
          nextActionLabel: executionResult.nextActionLabel,
          executionTimings: executionResult.executionTimings,
        });
        const runArtifacts = buildApplyCopilotArtifacts({
          job,
          resumeArtifact,
          executionResult: {
            ...executionResult,
            blocker,
            replay,
          },
          detectedAt,
          runId: claim.runId,
          resultId: claim.resultId,
          visualCheckpointsEnabled: options?.visualCheckpointsEnabled === true,
        });
        const persistedRun = ApplyRunSchema.parse({
          ...runArtifacts.run,
          campaignId: capturedCampaignId,
        });

        await ctx.repository.upsertApplicationAttempt(attempt);
        await Promise.all([
          ctx.repository.upsertApplyRun(persistedRun),
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

        const existingRecord = applicationRecords.find(
          (record) => record.jobId === jobId,
        );
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
          replaySummary: buildReplaySummary(
            attempt.replay,
            attempt.visualEvidence,
          ),
          events: mergeEvents(
            existingRecord?.events ?? [],
            toApplicationEvents(job, executionResult.checkpoints),
          ),
        });

        await ctx.repository.upsertApplicationRecord(nextRecord);
        await ctx.repository.commitSavedJobDelta({
          update: (savedJob) =>
            savedJob.id === jobId
              ? SavedJobSchema.parse({
                  ...savedJob,
                  status: nextJobStatusFromAttempt(
                    savedJob,
                    executionResult.state,
                  ),
                })
              : savedJob,
        });
        await persistApplicationUserAction({
          repository: ctx.repository,
          job,
          runId: persistedRun.id,
          resultId: runArtifacts.result.id,
          resultState: runArtifacts.result.state,
          resultStartedAt: runArtifacts.result.startedAt,
          replayCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
          blocker,
          occurredAt: detectedAt,
        });

        await persistAutomaticApplicationSafeguards({
          ctx,
          run: persistedRun,
          result: runArtifacts.result,
          job,
          now: detectedAt,
        }).catch((safeguardError: unknown) => {
          console.error(
            "Failed to persist automatic application safeguards.",
            safeguardError,
          );
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async startAutoApplyRun(jobId) {
      const { job } = await resolveJobApplyPrerequisites(jobId);
      const capturedCampaignId = await ctx.getActiveCampaignId();

      const createdAt = new Date().toISOString();
      const runArtifacts = buildSingleJobAutoApplyArtifacts({
        createdAt,
        job,
      });
      const persistedRun = ApplyRunSchema.parse({
        ...runArtifacts.run,
        campaignId: capturedCampaignId,
      });

      await Promise.all([
        ctx.repository.upsertApplyRun(persistedRun),
        ctx.repository.upsertApplyJobResult(runArtifacts.result),
        ctx.repository.upsertApplySubmitApproval(runArtifacts.approval),
      ]);

      const applicationRecords = await ctx.repository.listApplicationRecords();
      const existingRecord = applicationRecords.find(
        (record) => record.jobId === jobId,
      );
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: job.status,
        lastActionLabel: persistedRun.summary,
        nextActionLabel: "Review the pending submit approval in Applications.",
        lastUpdatedAt: createdAt,
        lastAttemptState: existingRecord?.lastAttemptState ?? null,
        questionSummary: existingRecord?.questionSummary,
        latestBlocker: existingRecord?.latestBlocker ?? null,
        consentSummary: existingRecord?.consentSummary,
        replaySummary: existingRecord?.replaySummary,
        events: mergeEvents(existingRecord?.events ?? [], [
          {
            id: `event_${persistedRun.id}_awaiting_submit_approval`,
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
        throw new Error(
          "At least one job is required before starting an automatic apply queue.",
        );
      }

      const jobs = await Promise.all(
        uniqueJobIds.map(
          async (jobId) => (await resolveJobApplyPrerequisites(jobId)).job,
        ),
      );
      const createdAt = new Date().toISOString();
      const capturedCampaignId = await ctx.getActiveCampaignId();
      const runId = createUniqueId("apply_run");
      const approvalId = createUniqueId("apply_submit_approval");
      const run = ApplyRunSchema.parse({
        id: runId,
        campaignId: capturedCampaignId,
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
      const mode = await withApplyRunTransition(runId, async () => {
        await requireApplyActivityEnabled();
        const [runs, approvals] = await Promise.all([
          ctx.repository.listApplyRuns(),
          ctx.repository.listApplySubmitApprovals(),
        ]);
        const run = runs.find((entry) => entry.id === runId) ?? null;

        if (!run) {
          throw new Error(`Unknown apply run '${runId}'.`);
        }

        if (run.mode !== "single_job_auto" && run.mode !== "queue_auto") {
          throw new Error(
            `Apply run '${runId}' is not waiting on submit approval.`,
          );
        }

        if (run.state !== "awaiting_submit_approval") {
          throw new Error(
            `Apply run '${runId}' is not currently awaiting submit approval.`,
          );
        }

        if (!run.submitApprovalId) {
          throw new Error(
            `Apply run '${runId}' does not have a submit approval record.`,
          );
        }

        const approval =
          approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

        if (!approval) {
          throw new Error(
            `Missing submit approval '${run.submitApprovalId}' for run '${runId}'.`,
          );
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
        return run.mode;
      });

      await requireApplyActivityEnabled();
      await executeSafeApplyRun({
        mode,
        runId,
      });

      return ctx.getWorkspaceSnapshot();
    },
    async cancelApplyRun(runId) {
      ctx.activeApplyRunAbortControllers.get(runId)?.abort();
      const { run, updatedRun, applicationRecords, now } =
        await withApplyRunTransition(runId, async () => {
          const [runs, applicationRecords] = await Promise.all([
            ctx.repository.listApplyRuns(),
            ctx.repository.listApplicationRecords(),
          ]);
          const run = runs.find((entry) => entry.id === runId) ?? null;

          if (!run) {
            throw new Error(`Unknown apply run '${runId}'.`);
          }

          if (
            run.state === "completed" ||
            run.state === "cancelled" ||
            run.state === "failed"
          ) {
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
          return { run, updatedRun, applicationRecords, now };
        });

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
      return withConsentResolution(requestId, async () => {
        await requireApplyActivityEnabled();
        const [requests, runs, results, approvals, applicationRecords] =
          await Promise.all([
            ctx.repository.listApplicationConsentRequests(),
            ctx.repository.listApplyRuns(),
            ctx.repository.listApplyJobResults(),
            ctx.repository.listApplySubmitApprovals(),
            ctx.repository.listApplicationRecords(),
          ]);
        const request =
          requests.find((entry) => entry.id === requestId) ?? null;

        if (!request) {
          throw new Error(`Unknown consent request '${requestId}'.`);
        }

        if (request.status !== "pending") {
          throw new Error(
            `Consent request '${requestId}' is already ${request.status}.`,
          );
        }

        const run = runs.find((entry) => entry.id === request.runId) ?? null;

        if (!run) {
          throw new Error(
            `Unknown apply run '${request.runId}' for consent request '${requestId}'.`,
          );
        }

        if (
          run.state !== "paused_for_consent" &&
          run.state !== "paused_for_user_review" &&
          run.state !== "running"
        ) {
          throw new Error(
            `Consent request '${requestId}' cannot be resolved because run '${run.id}' is ${run.state}.`,
          );
        }

        const now = new Date().toISOString();
        const updatedRequest = ApplicationConsentRequestSchema.parse({
          ...request,
          status: action === "approve" ? "approved" : "declined",
          decidedAt: now,
        });
        await ctx.repository.upsertApplicationConsentRequest(updatedRequest);
        const otherPendingConsentCount = requests.filter(
          (candidate) =>
            candidate.runId === run.id &&
            candidate.id !== request.id &&
            candidate.status === "pending",
        ).length;

        const relatedResult = results.find(
          (entry) =>
            entry.runId === request.runId && entry.jobId === request.jobId,
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
          const awaitingReviewJobs = run.jobIds.filter((jobId) => {
            if (jobId === request.jobId) return false;
            return results.some(
              (result) =>
                result.runId === run.id &&
                result.jobId === jobId &&
                result.state === "awaiting_review",
            );
          }).length;
          const blockedJobs = Math.max(0, run.blockedJobs - 1);
          const nextState =
            remainingJobs.length > 0
              ? "running"
              : otherPendingConsentCount > 0
                ? "paused_for_consent"
                : awaitingReviewJobs > 0 || blockedJobs > 0
                  ? "paused_for_user_review"
                  : "completed";
          const updatedRun = ApplyRunSchema.parse({
            ...run,
            state: nextState,
            updatedAt: now,
            completedAt: nextState === "completed" ? now : null,
            currentJobId: remainingJobs[0] ?? request.jobId,
            pendingJobs: remainingJobs.length + awaitingReviewJobs,
            skippedJobs: run.skippedJobs + 1,
            blockedJobs,
            summary:
              remainingJobs.length > 0
                ? "Consent declined. The queue skipped this job and continued."
                : otherPendingConsentCount > 0
                  ? `Consent declined for this job. ${otherPendingConsentCount} other consent ${otherPendingConsentCount === 1 ? "decision still needs" : "decisions still need"} you.`
                  : awaitingReviewJobs > 0 || blockedJobs > 0
                    ? "Consent declined for this job. Other prepared or blocked jobs remain available for review."
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
                status: existingRecord.status,
                lastAttemptState: "paused",
                latestBlocker: {
                  code: "missing_consent",
                  summary: "Consent was declined for this job.",
                },
                consentSummary: {
                  status: "declined",
                  pendingCount: 0,
                },
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
            const approval =
              approvals.find((entry) => entry.id === run.submitApprovalId) ??
              null;
            if (approval?.status === "approved") {
              await requireApplyActivityEnabled();
              await executeSafeApplyRun({
                mode: "queue_auto",
                runId: run.id,
              });
            }
          }

          return ctx.getWorkspaceSnapshot();
        }

        const approvedResult = relatedResult
          ? ApplyJobResultSchema.parse({
              ...relatedResult,
              state: "awaiting_review",
              summary:
                "Consent approved and the job stayed prepared for review.",
              detail:
                "The consent-gated branch was approved. This safe build keeps the job in a review-ready state and still stops before final submit.",
              updatedAt: now,
              completedAt: now,
              blockerReason: null,
              blockerSummary: null,
              pendingConsentRequestCount: 0,
            })
          : null;
        if (approvedResult) {
          await ctx.repository.upsertApplyJobResult(approvedResult);
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
        const awaitingReviewJobs = run.jobIds.filter((jobId) => {
          if (jobId === request.jobId) return true;
          return results.some(
            (result) =>
              result.runId === run.id &&
              result.jobId === jobId &&
              result.state === "awaiting_review",
          );
        }).length;
        const blockedJobs = Math.max(0, run.blockedJobs - 1);
        const nextState =
          remainingJobs.length > 0
            ? "running"
            : otherPendingConsentCount > 0
              ? "paused_for_consent"
              : "paused_for_user_review";

        const updatedRun = ApplyRunSchema.parse({
          ...run,
          state: nextState,
          updatedAt: now,
          currentJobId: remainingJobs[0] ?? request.jobId,
          pendingJobs: remainingJobs.length + awaitingReviewJobs,
          blockedJobs,
          summary:
            remainingJobs.length > 0
              ? "Consent approved. The queue resumed in safe review mode."
              : otherPendingConsentCount > 0
                ? `Consent approved for this job. ${otherPendingConsentCount} other consent ${otherPendingConsentCount === 1 ? "decision still needs" : "decisions still need"} you.`
                : "Consent approved. The job stayed prepared for review.",
          detail:
            "The consent-gated job can continue in safe review mode, still without any final submit action.",
        });
        await ctx.repository.upsertApplyRun(updatedRun);

        // A consent decision can be the final transition that leaves an
        // automatic queue with only review-ready work. Persist the same
        // terminal safeguards here as the normal execution path does; otherwise
        // the prepared-batch sample is skipped when no remaining job restarts
        // the queue.
        if (approvedResult && updatedRun.state !== "running") {
          await persistAutomaticApplicationSafeguards({
            ctx,
            run: updatedRun,
            result: approvedResult,
            job: null,
            now,
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });
        }

        const existingRecord = applicationRecords.find(
          (record) => record.jobId === request.jobId,
        );

        if (existingRecord) {
          await ctx.repository.upsertApplicationRecord(
            ApplicationRecordSchema.parse({
              ...existingRecord,
              status: "ready_for_review",
              lastAttemptState: "paused",
              latestBlocker: null,
              consentSummary: {
                status: "approved",
                pendingCount: 0,
              },
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
          await requireApplyActivityEnabled();
          await executeSafeApplyRun({
            mode: run.mode,
            runId: run.id,
          });
        }

        return ctx.getWorkspaceSnapshot();
      });
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
        throw new Error(
          `Apply run '${runId}' is not waiting on submit approval.`,
        );
      }

      if (
        run.state === "completed" ||
        run.state === "cancelled" ||
        run.state === "failed" ||
        run.state === "running" ||
        run.state === "paused_for_consent"
      ) {
        throw new Error(
          `Cannot revoke approval for run '${runId}' in state '${run.state}'.`,
        );
      }

      if (!run.submitApprovalId) {
        throw new Error(
          `Apply run '${runId}' does not have a submit approval record.`,
        );
      }

      const approval =
        approvals.find((entry) => entry.id === run.submitApprovalId) ?? null;

      if (!approval) {
        throw new Error(
          `Missing submit approval '${run.submitApprovalId}' for run '${runId}'.`,
        );
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
              nextActionLabel:
                "Re-approve this run before any later submit-enabled execution.",
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
