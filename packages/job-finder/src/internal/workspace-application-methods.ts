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
  ApplicationArtifactRefSchema,
  ApplicationQuestionRecordSchema,
  ApplicationRecordSchema,
  ApplicationReplayCheckpointSchema,
  ApplicationResumeArtifactSchema,
  JobFinderInterviewFollowUpInputSchema,
  JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema,
  JobFinderSetResumeClaimConfirmationInputSchema,
  ResumeAssistantMessageSchema,
  type ResumeProposalApprovalBlocker,
  ResumeClaimConfirmationSchema,
  ResumeValidationResultSchema,
  WorkHistoryReviewAcknowledgmentSchema,
  isResumeTemplateApplyEligible,
  isResumeTemplateApprovalEligible,
  isBlockingResumeValidationIssue,
  type ResumeDraft,
  ResumeDraftPatchSchema,
  ResumeDraftSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplyExecutionResult,
  type BrowserVisualEvidenceSummary,
  type CandidateProfile,
  type JobSource,
  type ResumeValidationIssue,
  type ResumeValidationResult,
  type ResumeTemplateDefinition,
  type TailoredAsset,
  type UserActionRequest,
  type JobFinderWorkspaceSnapshot,
  type ResumeClaimConfirmation,
  type WorkHistoryReviewAcknowledgment,
} from "@unemployed/contracts";
import { sanitizeTailoredAssetFailureMessage } from "./tailored-asset-failure";
import { projectDiscoveryJobViews } from "./listing-activity";
import { isApprovedTailoredResumeReadyForApply } from "./matching-review-queue";
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
  deriveRecoveredApplyRunCounters,
  isInterruptedApplyJobState,
} from "./workspace-apply-run-recovery";
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
  buildResumeProposalReplyContent,
  evaluateResumeProposalGrounding,
  hasBlockingResumeIdentityMismatch,
  isWorkHistoryOmissionReviewSuggestion,
  hasBlockingResumeClaimAssessment,
  listUnresolvedWorkHistoryOmissionSuggestions,
  matchWorkHistoryReviewAcknowledgment,
  resolveResumeTemplateLabel,
  sanitizeResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import {
  findResumeDraftIdentityConflicts,
  resolveResumeIdentity,
  resumeIdentityMismatchMessage,
} from "./resume-identity";
import {
  buildResumeWorkspace,
  buildWorkHistoryReviewSuggestionsFromValidation,
  ensureResumeDraft,
  fetchAndPersistResearch,
  loadUnresolvedWorkHistoryOmissionSuggestions,
  previewResumeDraft,
  renderDraftToPdf,
  assertResumeProfileRevisionCurrent,
} from "./workspace-application-resume-support";
import {
  buildResumeGenerationStrategyPolicy,
  buildResumeStrategyContext,
  resolveCampaignDefaultResumeStrategyId,
} from "./resume-strategy-application";
import { createApplicationUserActionResumer } from "./workspace-application-user-action-resumption";
import { persistApplicationUserAction } from "./workspace-application-user-action";
import { persistAutomaticApplicationSafeguards } from "./automatic-safeguards";
import { reconcileStaleMissingResumeBlockers } from "./workspace-application-blocker-sync";
import { resolvePrepareOnlyIntermediateMutationAuthority } from "./prepare-only-intermediate-mutation-authority";
import {
  appendExactEmployerExclusion,
  removeExactEmployerExclusion,
  resolveEmployerExclusionPreview,
} from "./employer-exclusion";
import {
  resolveApplicationRecordForJob,
  withApplicationRecordTransition,
} from "./application-crm";
import type {
  ApplicationPreparationCapacityToken,
  WorkspaceServiceContext,
} from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";
import {
  enrichSavedJobListingDetails,
  jobNeedsListingDetail,
} from "./listing-detail-enrichment";
import { createMatchAssessmentSession } from "./match-assessment-session";
import { enrichSearchPreferencesFromProfile } from "./workspace-helpers";
import { createMatchAssessment } from "./matching";

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

/**
 * Builds the durable failed tailored asset recorded when resume generation,
 * rendering, or persistence throws. It keeps the existing asset identity and
 * version so a later successful retry advances them with the same semantics
 * as before, and it never invents artifact content that was not produced.
 */
function buildFailedTailoredAsset(input: {
  jobId: string;
  existingAsset: TailoredAsset | null;
  error: unknown;
}): TailoredAsset {
  const failedAt = new Date().toISOString();
  return TailoredAssetSchema.parse({
    id: input.existingAsset?.id ?? `resume_${input.jobId}`,
    jobId: input.jobId,
    kind: "resume",
    status: "failed",
    label: input.existingAsset?.label ?? "Tailored Resume",
    version: input.existingAsset?.version ?? "v1",
    templateName: input.existingAsset?.templateName ?? "Chronology Classic",
    compatibilityScore: input.existingAsset?.compatibilityScore ?? null,
    progressPercent: input.existingAsset?.progressPercent ?? null,
    updatedAt: failedAt,
    storagePath: input.existingAsset?.storagePath ?? null,
    contentText: input.existingAsset?.contentText ?? null,
    previewSections: input.existingAsset?.previewSections ?? [],
    generationMethod: input.existingAsset?.generationMethod ?? "deterministic",
    notes: input.existingAsset?.notes ?? [],
    failureMessage: sanitizeTailoredAssetFailureMessage(input.error),
    failedAt,
  });
}

function getApplyResultSortTime(input: {
  completedAt: string | null;
  updatedAt: string;
  startedAt: string;
}): number {
  return Date.parse(input.completedAt ?? input.updatedAt ?? input.startedAt);
}

type WorkspaceApplicationMethods = Omit<
  Pick<
    JobFinderWorkspaceService,
    | "queueJobForReview"
    | "setJobResumeApplicationMode"
    | "removeJobFromReview"
    | "dismissDiscoveryJob"
    | "previewEmployerExclusion"
    | "removeEmployerExclusion"
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
    | "setWorkHistoryReviewAcknowledgment"
    | "setResumeClaimConfirmation"
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
  >,
  | "startApplyCopilotRun"
  | "approveApplyRun"
  | "resolveApplyConsentRequest"
  | "approveApply"
> & {
  startApplyCopilotRun(
    jobId: string,
    options?: { visualCheckpointsEnabled?: boolean },
    applicationRecordId?: string | null,
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<
    Awaited<ReturnType<JobFinderWorkspaceService["startApplyCopilotRun"]>>
  >;
  approveApplyRun(
    runId: string,
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<Awaited<ReturnType<JobFinderWorkspaceService["approveApplyRun"]>>>;
  resolveApplyConsentRequest(
    requestId: string,
    action: "approve" | "decline",
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<
    Awaited<ReturnType<JobFinderWorkspaceService["resolveApplyConsentRequest"]>>
  >;
  approveApply(
    jobId: string,
    applicationRecordId?: string | null,
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<Awaited<ReturnType<JobFinderWorkspaceService["approveApply"]>>>;
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

function assertCoherentResumeIdentity(profile: CandidateProfile): void {
  const identityResolution = resolveResumeIdentity(profile);
  if (identityResolution.mismatchReasons.length > 0) {
    throw new Error(
      resumeIdentityMismatchMessage(identityResolution.mismatchReasons),
    );
  }
}

async function assertCurrentResumeProfile(
  ctx: WorkspaceServiceContext,
  expectedRevision: number,
  operation: string,
): Promise<
  Awaited<
    ReturnType<WorkspaceServiceContext["repository"]["getProfileWithRevision"]>
  >
> {
  const current = await assertResumeProfileRevisionCurrent(
    ctx,
    expectedRevision,
    operation,
  );
  assertCoherentResumeIdentity(current.profile);
  return current;
}

export function createWorkspaceApplicationMethods(
  ctx: WorkspaceServiceContext,
): WorkspaceApplicationMethods {
  /**
   * Shortlisting is the moment the job's body starts to matter: the tailored
   * resume is written toward it and the fit score gates "Prepare". If the
   * search left this job as a card, read its page now, once, and re-score.
   * Never fatal: a page that will not read leaves the shortlist unchanged.
   */
  async function readListingDetailForShortlistedJob(
    jobId: string,
  ): Promise<void> {
    const fetchListingHtml = ctx.fetchListingHtml;
    if (!fetchListingHtml) {
      return;
    }
    try {
      const savedJobs = await ctx.repository.listSavedJobs();
      const job = savedJobs.find((entry) => entry.id === jobId);
      if (!job || !jobNeedsListingDetail(job)) {
        return;
      }
      const [profile, searchPreferences] = await Promise.all([
        ctx.repository.getProfile(),
        ctx.repository.getSearchPreferences(),
      ]);
      const session = createMatchAssessmentSession({
        profile,
        searchPreferences: enrichSearchPreferencesFromProfile(
          searchPreferences,
          profile,
        ),
        calculate: createMatchAssessment,
      });
      const enrichment = await enrichSavedJobListingDetails({
        jobs: [job],
        fetchHtml: fetchListingHtml,
        assess: session.assess,
        timeBudgetMs: 9_000,
      });
      const next = enrichment.jobs[0];
      if (!next || enrichment.changedJobIds.length === 0) {
        return;
      }
      await ctx.repository.commitSavedJobDelta({
        update: (current) =>
          current.id === jobId
            ? SavedJobSchema.parse({
                ...current,
                company: next.company,
                location: next.location,
                description: next.description,
                summary: next.summary,
                salaryText: next.salaryText,
                postedAt: next.postedAt,
                employmentType: next.employmentType,
                workMode: next.workMode,
                applicationUrl: next.applicationUrl,
                normalizedCompensation: next.normalizedCompensation,
                screeningHints: next.screeningHints,
                detailQuality: next.detailQuality,
                listingDetailFetch: next.listingDetailFetch,
                matchAssessment: next.matchAssessment,
              })
            : current,
      });
    } catch {
      // The shortlist itself succeeded; the body stays unread for now and the
      // job records nothing, so the next look can try again.
    }
  }

  const ACTIVITY_PAUSED_MESSAGE =
    "Browser and application activity is paused. Resume it from the Job Finder command center before starting new work.";

  async function requireApplicationSafeguardClearance(
    jobIds: readonly string[],
    savedJobs?: readonly ReturnType<typeof SavedJobSchema.parse>[],
  ): Promise<void> {
    if (!ctx.requireApplicationSafeguardClearance) {
      throw new Error("Application safeguard gate not initialized.");
    }
    await ctx.requireApplicationSafeguardClearance(jobIds, savedJobs);
  }

  type DirectApplyExecutionClaim = {
    jobId: string;
    applicationRecordId: string;
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

  // Staged auto runs claim their job ids here for the whole execution so a
  // second approval of an overlapping run is rejected before any browser
  // session opens. The scan-and-set in executeSafeApplyRun must stay free of
  // awaits to keep the check atomic against concurrent approvals.
  const activeStagedApplyJobClaims = new Map<string, string>();

  function claimDirectApplyExecution(
    jobId: string,
    applicationRecordId: string,
  ): DirectApplyExecutionClaim {
    if (activeDirectApplyClaims.has(applicationRecordId)) {
      throw new Error(
        `Application preparation for job '${jobId}' is already running.`,
      );
    }

    const claim = {
      jobId,
      applicationRecordId,
      runId: createUniqueId("apply_run"),
      resultId: createUniqueId("apply_result"),
      controller: new AbortController(),
    } satisfies DirectApplyExecutionClaim;
    activeDirectApplyClaims.set(applicationRecordId, claim);
    ctx.activeApplyRunAbortControllers.set(claim.runId, claim.controller);
    return claim;
  }

  function releaseDirectApplyExecution(claim: DirectApplyExecutionClaim): void {
    if (activeDirectApplyClaims.get(claim.applicationRecordId) === claim) {
      activeDirectApplyClaims.delete(claim.applicationRecordId);
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
    const [runs, results] = await Promise.all([
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults({ jobId: claim.jobId }),
    ]);
    const runningRun = runs.find((run) => {
      if (
        run.id === claim.runId ||
        run.state !== "running" ||
        !run.jobIds.includes(claim.jobId)
      ) {
        return false;
      }
      const runResults = results.filter((result) => result.runId === run.id);
      return (
        runResults.length === 0 ||
        runResults.some(
          (result) =>
            result.applicationRecordId === null ||
            result.applicationRecordId === claim.applicationRecordId,
        )
      );
    });
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
      applicationRecordId: input.claim.applicationRecordId,
      queuePosition: 0,
      state: "planned",
      summary: "Apply copilot preparation is starting.",
      detail:
        "The browser application flow has not reached a review checkpoint yet.",
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
      completedAt: null,
      applicationPreparationStartedAt: null,
      applicationPreparationStartedLocalDate: null,
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

  function createApplyAbortedError(): Error {
    return new DOMException(
      "The apply run was cancelled before its results were saved.",
      "AbortError",
    );
  }

  // Lock ordering: run, CRM, consent, and request transitions are acquired
  // first; this per-job application-record tail is only ever acquired inside
  // one of them.
  function withExactApplicationRecordTransition<T>(
    applicationRecordId: string,
    jobId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return withApplicationRecordTransition(
      ctx.repository,
      applicationRecordId,
      async () => {
        const record = (await ctx.repository.listApplicationRecords()).find(
          (entry) => entry.id === applicationRecordId,
        );
        if (!record || record.jobId !== jobId) {
          throw new Error(
            `Application record '${applicationRecordId}' does not belong to job '${jobId}'.`,
          );
        }
        return operation();
      },
    );
  }

  async function assertDirectApplyTerminalTransitionIsOpen(
    claim: DirectApplyExecutionClaim,
  ): Promise<void> {
    const latestRun = (await ctx.repository.listApplyRuns()).find(
      (entry) => entry.id === claim.runId,
    );
    if (
      claim.controller.signal.aborted ||
      (await ctx.repository.getActivityControl()).paused ||
      latestRun?.state !== "running"
    ) {
      throw createApplyAbortedError();
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

  /**
   * Commits a work-history review acknowledgment/removal as a real draft
   * mutation: approval and export binding are cleared, the tailored asset
   * loses its storage path, and validation plus a revision are persisted
   * atomically under the same optimistic concurrency contract as every other
   * draft mutation.
   */
  async function persistWorkHistoryReviewAcknowledgmentMutation(input: {
    jobId: string;
    currentDraft: ResumeDraft;
    mutatedAt: string;
    reason: string;
    nextAcknowledgments: readonly WorkHistoryReviewAcknowledgment[];
  }): Promise<JobFinderWorkspaceSnapshot> {
    const state = await ensureResumeDraft(ctx, input.jobId);
    const hadApprovedExport = wasResumeDraftApproved(input.currentDraft);
    const nextDraft = ResumeDraftSchema.parse({
      ...input.currentDraft,
      workHistoryReviewAcknowledgments: input.nextAcknowledgments,
      status: hadApprovedExport ? "stale" : "needs_review",
      approvedAt: null,
      approvedExportId: null,
      staleReason: hadApprovedExport
        ? "Work-history review decisions changed after approval and need a fresh review."
        : null,
      updatedAt: input.mutatedAt,
    });
    const revision = buildResumeDraftRevision({
      draft: input.currentDraft,
      resultingDraft: nextDraft,
      createdAt: input.mutatedAt,
      parentRevisionId: await getLatestResumeRevisionId(
        ctx,
        input.currentDraft.id,
      ),
      actor: "user",
      mutationKind: "manual_save",
      reason: input.reason,
    });
    const validation = validateResumeDraft({
      draft: nextDraft,
      job: state.job,
      profile: state.profile,
      validatedAt: input.mutatedAt,
    });
    const previousValidation =
      (await ctx.repository.listResumeValidationResults(nextDraft.id))[0] ??
      null;
    const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
      validation,
      previousValidation,
      draft: nextDraft,
    });
    const nextAsset = buildTailoredAssetBridge({
      draft: nextDraft,
      job: state.job,
      profile: state.profile,
      existingAsset: state.tailoredAsset,
      clearStoragePath: true,
      templates: state.templates,
    });

    await ctx.repository.applyResumePatchWithRevision({
      expectedDraftUpdatedAt: input.currentDraft.updatedAt,
      draft: nextDraft,
      revision,
      validation: validationWithReviewGuidance,
      tailoredAsset: nextAsset,
    });

    return ctx.getWorkspaceSnapshot();
  }

  /**
   * Commits a resume claim confirmation/removal as a real draft mutation.
   * Confirmation truth participates in export eligibility, so any change
   * invalidates the approval and export binding exactly like every other
   * claim-affecting draft mutation, and the monotonic revision records the
   * decision even though claim text itself is unchanged.
   */
  async function persistResumeClaimConfirmationMutation(input: {
    jobId: string;
    currentDraft: ResumeDraft;
    mutatedAt: string;
    reason: string;
    nextConfirmations: readonly ResumeClaimConfirmation[];
  }): Promise<JobFinderWorkspaceSnapshot> {
    const state = await ensureResumeDraft(ctx, input.jobId);
    const hadApprovedExport = wasResumeDraftApproved(input.currentDraft);
    const nextDraft = ResumeDraftSchema.parse({
      ...input.currentDraft,
      claimConfirmations: input.nextConfirmations,
      status: hadApprovedExport ? "stale" : "needs_review",
      approvedAt: null,
      approvedExportId: null,
      staleReason: hadApprovedExport
        ? "Claim confirmations changed after approval and need a fresh review."
        : null,
      updatedAt: input.mutatedAt,
    });
    const revision = buildResumeDraftRevision({
      draft: input.currentDraft,
      resultingDraft: nextDraft,
      createdAt: input.mutatedAt,
      parentRevisionId: await getLatestResumeRevisionId(
        ctx,
        input.currentDraft.id,
      ),
      actor: "user",
      mutationKind: "manual_save",
      reason: input.reason,
    });
    const validation = validateResumeDraft({
      draft: nextDraft,
      job: state.job,
      profile: state.profile,
      validatedAt: input.mutatedAt,
    });
    const previousValidation =
      (await ctx.repository.listResumeValidationResults(nextDraft.id))[0] ??
      null;
    const validationWithReviewGuidance = preserveWorkHistoryReviewGuidance({
      validation,
      previousValidation,
      draft: nextDraft,
    });
    const nextAsset = buildTailoredAssetBridge({
      draft: nextDraft,
      job: state.job,
      profile: state.profile,
      existingAsset: state.tailoredAsset,
      clearStoragePath: true,
      templates: state.templates,
    });

    await ctx.repository.applyResumePatchWithRevision({
      expectedDraftUpdatedAt: input.currentDraft.updatedAt,
      draft: nextDraft,
      revision,
      validation: validationWithReviewGuidance,
      tailoredAsset: nextAsset,
    });

    return ctx.getWorkspaceSnapshot();
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

  /**
   * The application resume artifact must carry the path the verifier actually
   * read, not the recorded one. A workspace whose absolute export path was
   * recorded under an earlier user-data directory still passes the readiness
   * gate here — the verifier recovers the file — but the browser runtime
   * re-checks the artifact path with its own `access()` and fails the run with
   * `missing_resume`, which the stale-blocker sync then clears into another
   * identical "Retry preparation" attempt. Verifiers that cannot resolve keep
   * the recorded path exactly as before.
   */
  async function resolveVerifiedResumeFilePath(
    recordedFilePath: string,
  ): Promise<string> {
    const resolvedFilePath =
      await ctx.exportFileVerifier?.resolvePath?.(recordedFilePath);
    return resolvedFilePath ?? recordedFilePath;
  }

  async function buildIntermediateMutationExecutionOptions(input: {
    job: ReturnType<typeof SavedJobSchema.parse>;
    resumeArtifact: ExecuteApplicationFlowInput["resumeArtifact"];
  }): Promise<
    Pick<
      ExecuteApplicationFlowInput,
      | "intermediateMutationsAuthorized"
      | "intermediateMutationAllowedOrigins"
      | "recheckIntermediateMutationAuthority"
    >
  > {
    const initial = await resolvePrepareOnlyIntermediateMutationAuthority({
      job: input.job,
      now: new Date().toISOString(),
      repository: ctx.repository,
      resumeSha256: input.resumeArtifact.sha256,
    });
    if (!initial.authorized) {
      return {
        intermediateMutationsAuthorized: false,
        intermediateMutationAllowedOrigins: [],
      };
    }

    return {
      intermediateMutationsAuthorized: true,
      intermediateMutationAllowedOrigins: initial.allowedOrigins,
      recheckIntermediateMutationAuthority: async (observedOrigin) => {
        const current = await resolvePrepareOnlyIntermediateMutationAuthority({
          job: input.job,
          now: new Date().toISOString(),
          observedOrigin,
          repository: ctx.repository,
          resumeSha256: input.resumeArtifact.sha256,
        });
        return (
          current.authorized &&
          current.authorityEnvelopeId === initial.authorityEnvelopeId &&
          current.authorityRevision === initial.authorityRevision
        );
      },
    };
  }

  async function resolveJobApplyPrerequisites(
    jobId: string,
    scopedSavedJobs?: readonly ReturnType<typeof SavedJobSchema.parse>[],
    scope?: {
      tailoredAssets?: readonly TailoredAsset[];
      profile?: Awaited<
        ReturnType<WorkspaceServiceContext["repository"]["getProfile"]>
      >;
      profileRevision?: number;
      settings?: Awaited<
        ReturnType<WorkspaceServiceContext["repository"]["getSettings"]>
      >;
    },
  ) {
    const profileStatePromise =
      scope?.profile && scope.profileRevision !== undefined
        ? Promise.resolve({
            profile: scope.profile,
            revision: scope.profileRevision,
          })
        : ctx.repository.getProfileWithRevision();
    const [
      savedJobs,
      tailoredAssets,
      draft,
      approvedExports,
      profileState,
      settings,
    ] = await Promise.all([
      scopedSavedJobs
        ? Promise.resolve(scopedSavedJobs)
        : ctx.repository.listSavedJobs(),
      scope?.tailoredAssets
        ? Promise.resolve(scope.tailoredAssets)
        : ctx.repository.listTailoredAssets(),
      ctx.repository.getResumeDraftByJobId(jobId),
      ctx.repository.listResumeExportArtifacts({ jobId }),
      profileStatePromise,
      scope?.settings
        ? Promise.resolve(scope.settings)
        : ctx.repository.getSettings(),
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
    assertCoherentResumeIdentity(profileState.profile);
    const profile = profileState.profile;

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
      const verifiedOriginalResumePath =
        await resolveVerifiedResumeFilePath(originalResumePath);

      return {
        job,
        profile,
        profileRevision: profileState.revision,
        resumeApplicationMode,
        resumeArtifact: ApplicationResumeArtifactSchema.parse({
          id: `application_resume_${job.id}_${profile.baseResume.id}`,
          jobId: job.id,
          source: "original_upload",
          sourceDocumentId: profile.baseResume.id,
          exportArtifactId: null,
          fileName: profile.baseResume.fileName,
          filePath: verifiedOriginalResumePath,
          sha256: verifiedSha256,
          approvedAt: new Date().toISOString(),
        }),
      };
    }

    const asset = tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;
    const approvedExportResolution = isApprovedTailoredResumeReadyForApply({
      draft,
      exports: approvedExports,
      asset,
    });
    const approvedExport = approvedExportResolution.approvedExport;

    if (!draft || draft.status !== "approved" || !approvedExport) {
      throw new Error(
        `An approved tailored PDF is required before staging automatic apply for '${job.title}'.`,
      );
    }

    const unresolvedOmissionSuggestions =
      await loadUnresolvedWorkHistoryOmissionSuggestions(ctx, draft);
    if (unresolvedOmissionSuggestions.length > 0) {
      throw new Error(
        `Work-history omission reviews for '${job.title}' still need an explicit acknowledgment in Resume Studio before staging automatic apply.`,
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

    if (!approvedExportResolution.ready) {
      throw new Error(
        `A ready approved tailored resume is required before staging automatic apply for '${job.title}'.`,
      );
    }

    const verifiedSha256 = await verifyResumeFileIntegrity({
      expectedSha256: approvedExport.sha256,
      filePath: approvedExport.filePath,
      label: "The approved tailored CV",
    });
    const verifiedApprovedExportPath = await resolveVerifiedResumeFilePath(
      approvedExport.filePath,
    );

    return {
      job,
      profile,
      profileState,
      profileRevision: profileState.revision,
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
        filePath: verifiedApprovedExportPath,
        sha256: verifiedSha256,
        approvedAt: new Date().toISOString(),
      }),
    };
  }

  async function syncRunApplicationRecord(input: {
    applicationRecordId: string;
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
    const savedJobs = await ctx.repository.listSavedJobs();
    const job = savedJobs.find((entry) => entry.id === input.jobId) ?? null;

    if (!job) {
      return;
    }

    await withExactApplicationRecordTransition(
      input.applicationRecordId,
      input.jobId,
      async () => {
        const applicationRecords =
          await ctx.repository.listApplicationRecords();
        const existingRecord = applicationRecords.find(
          (record) => record.id === input.applicationRecordId,
        );
        if (!existingRecord) {
          throw new Error(
            `Unknown Job Finder application record '${input.applicationRecordId}'.`,
          );
        }
        const nextRecord = ApplicationRecordSchema.parse({
          id: existingRecord.id,
          jobId: input.jobId,
          title: job.title,
          company: job.company,
          status: existingRecord.status,
          lastActionLabel: input.lastActionLabel,
          nextActionLabel: input.nextActionLabel,
          lastUpdatedAt: input.updatedAt,
          lastAttemptState:
            input.lastAttemptState !== undefined
              ? input.lastAttemptState
              : existingRecord.lastAttemptState,
          questionSummary:
            input.questionSummary !== undefined
              ? input.questionSummary
              : existingRecord.questionSummary,
          latestBlocker:
            input.latestBlocker !== undefined
              ? input.latestBlocker
              : existingRecord.latestBlocker,
          consentSummary:
            input.consentSummary !== undefined
              ? input.consentSummary
              : existingRecord.consentSummary,
          replaySummary:
            input.replaySummary !== undefined
              ? input.replaySummary
              : existingRecord.replaySummary,
          crm: existingRecord.crm,
          events: mergeEvents(existingRecord.events, [
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
      },
    );
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
      crm: input.existingRecord.crm,
      events: mergeEvents(
        input.existingRecord.events,
        input.applicationRecord.events,
      ),
    });
  }

  async function clearStaleMissingResumeBlockerForJob(
    jobId: string,
  ): Promise<void> {
    const [
      applicationRecords,
      resumeDrafts,
      resumeExportArtifacts,
      tailoredAssets,
    ] = await Promise.all([
      ctx.repository.listApplicationRecords(),
      ctx.repository.listResumeDrafts(),
      ctx.repository.listResumeExportArtifacts({ jobId }),
      ctx.repository.listTailoredAssets(),
    ]);
    const now = new Date().toISOString();

    await reconcileStaleMissingResumeBlockers(ctx.repository, {
      applicationRecords: applicationRecords.filter(
        (record) => record.jobId === jobId,
      ),
      resumeDrafts,
      resumeExportArtifacts,
      tailoredAssets,
      detectedAt: now,
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

  async function buildApplyRecoveryContext(
    jobId: string,
    applicationRecordId: string,
  ) {
    const [runs, results, checkpoints] = await Promise.all([
      ctx.repository.listApplyRuns(),
      ctx.repository.listApplyJobResults({ jobId, applicationRecordId }),
      ctx.repository.listApplicationReplayCheckpoints({
        jobId,
        applicationRecordId,
      }),
    ]);
    const latestResult =
      results
        .filter(
          (entry) =>
            entry.jobId === jobId &&
            entry.applicationRecordId === applicationRecordId &&
            (entry.state !== "planned" ||
              (entry.applicationPreparationStartedAt !== null &&
                entry.applicationPreparationStartedAt !== undefined)),
        )
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
      (checkpoint) =>
        checkpoint.runId === latestResult.runId &&
        checkpoint.resultId === latestResult.id &&
        checkpoint.applicationRecordId === applicationRecordId,
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
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<void> {
    const [
      profileState,
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
      savedJobs,
    ] = await Promise.all([
      ctx.repository.getProfileWithRevision(),
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
      ctx.repository.listSavedJobs(),
    ]);
    assertCoherentResumeIdentity(profileState.profile);
    const run = runs.find((entry) => entry.id === input.runId) ?? null;
    const savedJobsById = new Map(savedJobs.map((job) => [job.id, job]));

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
    const campaignStopRules = run.campaignId
      ? campaignState?.campaigns.find(
          (campaign) => campaign.id === run.campaignId,
        )?.stopRules
      : undefined;
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
        let jobResult = results.find(
          (entry) => entry.runId === run.id && entry.jobId === jobId,
        );

        if (!jobResult?.applicationRecordId) {
          throw new Error(
            `Apply run '${run.id}' has legacy or missing application lineage for job '${jobId}'.`,
          );
        }
        const exactApplicationRecordId = jobResult.applicationRecordId;

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

        try {
          const queuedJob = savedJobsById.get(jobId);
          await requireApplicationSafeguardClearance(
            [jobId],
            queuedJob ? [queuedJob] : [],
          );
        } catch (error) {
          if (await stopIfRunWasCancelled()) {
            return;
          }
          const pausedAt = new Date().toISOString();
          currentRunState = ApplyRunSchema.parse({
            ...currentRunState,
            state: "paused_for_user_review",
            currentJobId: jobId,
            updatedAt: pausedAt,
            completedAt: null,
            pendingJobs: run.jobIds.length - index + awaitingReviewJobs,
            submittedJobs,
            skippedJobs,
            blockedJobs,
            failedJobs,
            summary: "Automatic apply paused before the next queued job.",
            detail:
              error instanceof Error
                ? error.message
                : "Application safeguards could not be verified before the next queued job.",
          });
          await persistRunUnlessCancelled(currentRunState);
          return;
        }

        const prerequisites = await resolveJobApplyPrerequisites(
          jobId,
          savedJobsById.get(jobId) ? [savedJobsById.get(jobId)!] : [],
        );
        if (await stopIfRunWasCancelled()) {
          return;
        }
        // The prerequisite read verifies the selected export/file, but it is
        // not itself a lock. Recheck the shared profile epoch immediately
        // before marking preparation started or opening the browser so an
        // intervening profile edit cannot execute stale identity input.
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "starting automatic application preparation",
        );
        const { job, resumeApplicationMode, resumeArtifact } = prerequisites;
        const recoverySeed = await buildApplyRecoveryContext(
          jobId,
          exactApplicationRecordId,
        );
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "marking this application preparation started",
        );
        jobResult = await ctx.markApplicationPreparationStarted(
          {
            resultId: jobResult.id,
            runId: run.id,
            jobId,
          },
          capacityToken,
        );
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
        const intermediateMutationAuthority =
          await buildIntermediateMutationExecutionOptions({
            job,
            resumeArtifact,
          });
        const browserProfile = await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "executing this application preparation",
        );

        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            job.source,
            {
              job,
              resumeArtifact,
              profile: browserProfile.profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              ...intermediateMutationAuthority,
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
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "recording this application preparation",
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
          applicationRecordId: exactApplicationRecordId,
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
            .filter(
              (entry) => entry.applicationRecordId === exactApplicationRecordId,
            )
            .map((entry) => entry.id),
        );
        const existingAnswerIds = new Set(
          answerRecords
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .filter(
              (entry) => entry.applicationRecordId === exactApplicationRecordId,
            )
            .map((entry) => entry.id),
        );
        const existingArtifactIds = new Set(
          artifactRefs
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .filter(
              (entry) => entry.applicationRecordId === exactApplicationRecordId,
            )
            .map((entry) => entry.id),
        );
        const existingCheckpointIds = new Set(
          checkpoints
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .filter(
              (entry) => entry.applicationRecordId === exactApplicationRecordId,
            )
            .map((entry) => entry.id),
        );
        const existingConsentIds = new Set(
          consentRequests
            .filter((entry) => entry.runId === run.id && entry.jobId === jobId)
            .filter(
              (entry) => entry.applicationRecordId === exactApplicationRecordId,
            )
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

        let campaignPauseReason: string | null = null;
        const committedJobCompletion = await withApplyRunTransition(
          run.id,
          async () => {
            const latestRun = (await ctx.repository.listApplyRuns()).find(
              (entry) => entry.id === run.id,
            );
            if (
              executionSignal.aborted ||
              (await ctx.repository.getActivityControl()).paused ||
              latestRun?.state !== "running"
            ) {
              executionController.abort();
              return false;
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

            await persistApplicationUserAction({
              repository: ctx.repository,
              applicationRecordId: exactApplicationRecordId,
              job,
              runId: run.id,
              resultId: updatedResult.id,
              resultState: updatedResult.state,
              resultStartedAt: updatedResult.startedAt,
              replayCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
              blocker,
              occurredAt: detectedAt,
            });

            const attempt = ApplicationAttemptSchema.parse({
              id: `attempt_${jobId}_${Date.now()}`,
              jobId,
              applicationRecordId: exactApplicationRecordId,
              state: normalizedExecutionResult.state,
              summary: normalizedExecutionResult.summary,
              detail: normalizedExecutionResult.detail,
              startedAt:
                normalizedExecutionResult.checkpoints[0]?.at ?? detectedAt,
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
              applicationRecordId: exactApplicationRecordId,
              consentSummary: buildConsentSummary(attempt.consentDecisions),
              eventDetail:
                jobState === "blocked" &&
                runArtifacts.consentRequests.length > 0
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
                jobState === "blocked" &&
                runArtifacts.consentRequests.length > 0
                  ? "Consent needed"
                  : normalizedExecutionResult.summary,
              jobId,
              lastActionLabel: normalizedExecutionResult.summary,
              lastAttemptState: normalizedExecutionResult.state,
              latestBlocker: buildLatestBlockerSummary(attempt.blocker),
              nextActionLabel:
                jobState === "blocked" &&
                runArtifacts.consentRequests.length > 0
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
            campaignPauseReason = campaignStopRules
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
                ? "Automatic apply paused by this search plan's safety rules."
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
                  ? pendingConsentRequests > 0 ||
                    pendingJobs > 0 ||
                    blockedJobs > 0
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
            return true;
          },
        );
        if (!committedJobCompletion) {
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
      // The failed run is terminal, so its queue counters are recomputed
      // from the exact committed result states with the canonical recovery
      // semantics instead of retaining stale running-time pending work.
      const committedFailureResults = await ctx.repository.listApplyJobResults({
        runId: run.id,
      });
      currentRunState = ApplyRunSchema.parse({
        ...currentRunState,
        state: "failed",
        updatedAt: failedAt,
        completedAt: failedAt,
        ...deriveRecoveredApplyRunCounters(committedFailureResults, failedAt),
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

  async function executeSafeApplyRun(
    input: {
      mode: "single_job_auto" | "queue_auto";
      runId: string;
    },
    capacityToken?: ApplicationPreparationCapacityToken,
  ): Promise<void> {
    if (ctx.activeApplyRunAbortControllers.has(input.runId)) {
      throw new Error(`Apply run '${input.runId}' is already executing.`);
    }

    const stagedRun =
      (await ctx.repository.listApplyRuns({ id: input.runId }))[0] ?? null;
    if (!stagedRun) {
      throw new Error(`Unknown apply run '${input.runId}'.`);
    }
    const stagedResults = await ctx.repository.listApplyJobResults({
      runId: input.runId,
    });
    const stagedLineage = stagedRun.jobIds.map((jobId) => {
      const matches = stagedResults.filter((result) => result.jobId === jobId);
      const applicationRecordId = matches[0]?.applicationRecordId;
      if (matches.length !== 1 || !applicationRecordId) {
        throw new Error(
          `Apply run '${input.runId}' has legacy or ambiguous application lineage for job '${jobId}'.`,
        );
      }
      return { jobId, applicationRecordId };
    });

    // Synchronous scan-and-set: no await may sit between this conflict check
    // and the claim writes, or two concurrent approvals could both pass.
    const conflictingLineage = stagedLineage.filter((lineage) => {
      const owningRunId = activeStagedApplyJobClaims.get(
        lineage.applicationRecordId,
      );
      return (
        (owningRunId !== undefined && owningRunId !== input.runId) ||
        activeDirectApplyClaims.has(lineage.applicationRecordId)
      );
    });
    if (conflictingLineage.length > 0) {
      const conflicting = conflictingLineage[0]!;
      const owningRunId = activeStagedApplyJobClaims.get(
        conflicting.applicationRecordId,
      );
      throw new Error(
        `Application preparation for job '${conflicting.jobId}' is already running${
          owningRunId ? ` in apply run '${owningRunId}'` : ""
        }.`,
      );
    }
    for (const { applicationRecordId } of stagedLineage) {
      activeStagedApplyJobClaims.set(applicationRecordId, input.runId);
    }

    const executionController = new AbortController();
    ctx.activeApplyRunAbortControllers.set(input.runId, executionController);
    const executionPromise = executeSafeApplyRunOwned(
      input,
      executionController,
      capacityToken,
    ).finally(() => {
      for (const { applicationRecordId } of stagedLineage) {
        if (
          activeStagedApplyJobClaims.get(applicationRecordId) === input.runId
        ) {
          activeStagedApplyJobClaims.delete(applicationRecordId);
        }
      }
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

  /**
   * Generation core shared by `generateResume` and `regenerateResumeDraft`.
   * It snapshots workspace state up front and only persists after the long
   * AI/render pipeline, so every caller must hold this job's resume-draft
   * transition across the whole call; otherwise an interleaved save could win
   * the optimistic-concurrency check between the snapshot and the durable
   * write. Because callers serialize, the equal-content persistence branch is
   * also safe: no newer validation or asset state can exist while the tail is
   * held.
   */
  async function runGenerateResume(
    jobId: string,
  ): Promise<JobFinderWorkspaceSnapshot> {
    const [
      profileState,
      searchPreferences,
      settings,
      savedJobs,
      tailoredAssets,
      intelligenceState,
      campaignState,
    ] = await Promise.all([
      ctx.repository.getProfileWithRevision(),
      ctx.repository.getSearchPreferences(),
      ctx.repository.getSettings(),
      ctx.repository.listSavedJobs(),
      ctx.repository.listTailoredAssets(),
      ctx.repository.getIntelligenceState(),
      ctx.repository.getCampaignState(),
    ]);
    const { profile, revision: profileRevision } = profileState;
    const job = savedJobs.find((entry) => entry.id === jobId);

    if (!job) {
      throw new Error(
        `Unable to generate a resume for unknown job '${jobId}'.`,
      );
    }

    const identityResolution = resolveResumeIdentity(profile);
    if (identityResolution.mismatchReasons.length > 0) {
      throw new Error(
        resumeIdentityMismatchMessage(identityResolution.mismatchReasons),
      );
    }

    const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId);
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
    // Generation, rendering, and persistence failures must leave durable
    // queue truth behind: record the failed tailored asset before
    // propagating the original error to callers.
    try {
      const research = await fetchAndPersistResearch(ctx, job, profileRevision);
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
      // Prefer the structured provenance recorded by the AI boundary; the
      // note-prose inference stays only for legacy clients that omit it.
      const provenance = draft.generationProvenance ?? null;
      const generationMethod = provenance
        ? provenance.method === "ai"
          ? "ai_assisted"
          : "deterministic"
        : draft.notes.some((note: string) =>
              normalizeText(note).includes("deterministic"),
            )
          ? "deterministic"
          : ctx.aiClient.getStatus().kind === "openai_compatible"
            ? "ai_assisted"
            : "deterministic";
      const generationReason =
        generationMethod === "deterministic"
          ? (provenance?.reason ??
            (ctx.aiClient.getStatus().kind === "openai_compatible"
              ? "provider_failed"
              : "no_provider_configured"))
          : null;
      const generationDetail = provenance?.detail?.trim() || null;
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
        previousWorkHistoryReviewAcknowledgments:
          existingDraft?.workHistoryReviewAcknowledgments ?? [],
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
      await assertCurrentResumeProfile(
        ctx,
        profileRevision,
        "rendering this generated resume",
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

      await assertCurrentResumeProfile(
        ctx,
        profileRevision,
        "completing this generated resume",
      );

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
        generationReason,
        generationDetail,
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
        // A successful generation is authoritative: clear any failure detail
        // left by an earlier failed attempt so retry truth stays accurate.
        failureMessage: null,
        failedAt: null,
      });

      await assertCurrentResumeProfile(
        ctx,
        profileRevision,
        "saving this generated resume",
      );

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
        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "committing this generated resume",
        );
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
    } catch (error) {
      // A stale-revision/concurrency rejection means a newer edit already owns
      // this draft: persisting a failed asset here would overwrite that newer
      // canonical state with false failure truth. Only when the snapshotted
      // draft is still the persisted one is this a genuine provider/render/
      // persistence failure worth recording.
      try {
        const latestDraft = await ctx.repository.getResumeDraftByJobId(jobId);
        const latestProfile = await ctx.repository.getProfileWithRevision();
        const supersededByNewerEdit =
          existingDraft === null
            ? latestDraft !== null
            : latestDraft !== null &&
              (latestDraft.updatedAt !== existingDraft.updatedAt ||
                buildResumeDraftStateHash(latestDraft) !==
                  buildResumeDraftStateHash(existingDraft));
        if (
          !supersededByNewerEdit &&
          latestProfile.revision === profileRevision
        ) {
          await ctx.repository.upsertTailoredAsset(
            buildFailedTailoredAsset({
              jobId,
              existingAsset: existingAsset ?? null,
              error,
            }),
          );
        }
      } catch {
        // Failure persistence must never mask the original generation
        // error: the caller still sees why generation failed.
      }
      throw error;
    }
  }

  /**
   * Section-regeneration core for `regenerateResumeSection`. It binds the
   * produced proposal to the draft version it read, so its caller must hold
   * the job's resume-draft transition and keep a save from changing that
   * version between this snapshot and the proposal message write.
   */
  async function runRegenerateResumeSection(
    jobId: string,
    sectionId: string,
  ): Promise<JobFinderWorkspaceSnapshot> {
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

    const research = await fetchAndPersistResearch(
      ctx,
      state.job,
      state.profileRevision,
    );
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
    // Section regeneration is review-first like Guided Edits: normalized
    // model output for the requested section is stored as a pending
    // assistant proposal bound to the current draft version, and the draft
    // stays untouched until the user explicitly accepts it. When the model
    // returns no usable patch for this section, an explicit no-change
    // message is stored instead of fabricating a same-content patch.
    const proposedAt = createMonotonicTimestamp(draft.updatedAt);
    const normalizedSectionPatches = assistantReply.patches
      .filter((patch) => patch.targetSectionId === sectionId)
      .map((patch) =>
        ResumeDraftPatchSchema.parse({
          ...patch,
          draftId: draft.id,
          targetEntryId: patch.targetEntryId ?? null,
          // Same canonical-origin rule as Guided Edits: model output never
          // self-identifies as user-authored.
          origin: "assistant",
        }),
      );
    const unusableReplacementPatch = normalizedSectionPatches.find(
      (patch) =>
        [
          "replace_section_text",
          "replace_entry_summary",
          "update_bullet",
        ].includes(patch.operation) && !patch.newText?.trim(),
    );
    const reviewablePatches = unusableReplacementPatch
      ? []
      : normalizedSectionPatches;

    await assertResumeProfileRevisionCurrent(
      ctx,
      state.profileRevision,
      "saving this generated resume proposal",
    );

    if (reviewablePatches.length === 0) {
      await ctx.repository.upsertResumeAssistantMessage(
        buildAssistantReplyMessage({
          jobId,
          content: `I reviewed the '${targetSection.label}' section but did not produce a usable rewrite for it, so no change was proposed. The section is unchanged; try again or edit it manually.`,
          patches: [],
          executionAttribution: assistantReply.executionReceipt,
          createdAt: proposedAt,
        }),
      );

      return ctx.getWorkspaceSnapshot();
    }

    // One rule with export: a rewrite may only be called grounded when the
    // same classifier that gates export accepts the resulting text.
    let sectionProposalGate: {
      accepted: boolean;
      approvalBlockers: ResumeProposalApprovalBlocker[];
    };
    try {
      sectionProposalGate = evaluateResumeProposalGrounding({
        baselineDraft: draft,
        patches: reviewablePatches,
        job: state.job,
        profile: state.profile,
        evaluatedAt: proposedAt,
      });
    } catch {
      // An unappliable patch is never presented as a reviewable proposal.
      await ctx.repository.upsertResumeAssistantMessage(
        buildAssistantReplyMessage({
          jobId,
          content: `I reviewed the '${targetSection.label}' section but the rewrite could not be applied to the current draft, so no change was proposed.`,
          patches: [],
          executionAttribution: assistantReply.executionReceipt,
          createdAt: proposedAt,
        }),
      );

      return ctx.getWorkspaceSnapshot();
    }

    await ctx.repository.upsertResumeAssistantMessage(
      buildAssistantReplyMessage({
        jobId,
        content: buildResumeProposalReplyContent({
          approvalBlockers: sectionProposalGate.approvalBlockers,
          changeCount: reviewablePatches.length,
          scopeLabel: targetSection.label,
        }),
        approvalBlockers: sectionProposalGate.approvalBlockers,
        patches: reviewablePatches,
        baseDraftUpdatedAt: draft.updatedAt,
        executionAttribution: assistantReply.executionReceipt,
        createdAt: proposedAt,
      }),
    );

    return ctx.getWorkspaceSnapshot();
  }

  return {
    resumeApplicationUserAction,
    async recordInterviewHelperApplicationAction(rawInput) {
      const input = JobFinderInterviewFollowUpInputSchema.parse(rawInput);
      const locatedRecords = await ctx.repository.listApplicationRecords();
      const locatedRecord = locatedRecords.find(
        (record) => record.id === input.applicationRecordId,
      );

      if (!locatedRecord) {
        throw new Error(
          `Unknown Job Finder application record '${input.applicationRecordId}'.`,
        );
      }

      await withExactApplicationRecordTransition(
        locatedRecord.id,
        locatedRecord.jobId,
        async () => {
          const applicationRecords =
            await ctx.repository.listApplicationRecords();
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
        },
      );
      return ctx.getWorkspaceSnapshot();
    },
    async queueJobForReview(jobId) {
      const [
        discoveryState,
        settings,
        savedJobs,
        intelligence,
        tailoredAssets,
      ] = await Promise.all([
        ctx.repository.getDiscoveryState(),
        ctx.repository.getSettings(),
        ctx.repository.listSavedJobs(),
        ctx.repository.getIntelligenceState(),
        ctx.repository.listTailoredAssets(),
      ]);
      const defaultResumeApplicationMode =
        settings.resumeApplicationMode ?? DEFAULT_RESUME_APPLICATION_MODE;
      const pendingIndex = discoveryState.pendingDiscoveryJobs.findIndex(
        (job) => job.id === jobId,
      );
      const activityJobs = [
        ...savedJobs,
        ...discoveryState.pendingDiscoveryJobs.filter(
          (pendingJob) =>
            !savedJobs.some((savedJob) => savedJob.id === pendingJob.id),
        ),
      ];
      const currentJobView = projectDiscoveryJobViews({
        jobs: activityJobs,
        discoveryLedger: discoveryState.discoveryLedger,
        listingSignals: intelligence.safeguards.listingSignals,
      }).find((job) => job.id === jobId);

      if (currentJobView?.listingActivity.status === "closed") {
        throw new Error(
          `Unable to shortlist closed job '${jobId}'. The listing has explicit closed evidence.`,
        );
      }

      if (pendingIndex >= 0) {
        const pendingJob = discoveryState.pendingDiscoveryJobs[pendingIndex];
        if (!pendingJob) {
          throw new Error(`Unable to shortlist unknown job '${jobId}'.`);
        }
        const nextJob = SavedJobSchema.parse({
          ...pendingJob,
          status: tailoredAssets.some(
            (asset) => asset.jobId === jobId && asset.status === "ready",
          )
            ? "ready_for_review"
            : "drafting",
          resumeApplicationMode:
            pendingJob.resumeApplicationMode ?? defaultResumeApplicationMode,
        });
        await ctx.repository.commitSavedJobDelta({
          upserts: [nextJob],
          update: (currentJob) =>
            currentJob.id === nextJob.id
              ? (mergeSavedJobs([currentJob], [nextJob])[0] ?? currentJob)
              : currentJob,
          updateDiscoveryState: (current) => ({
            ...current,
            pendingDiscoveryJobs: current.pendingDiscoveryJobs.filter(
              (job) => job.id !== jobId,
            ),
          }),
        });
      } else {
        const asset = tailoredAssets.find((entry) => entry.jobId === jobId);

        await ctx.updateJob(jobId, (job) => ({
          ...job,
          status: asset?.status === "ready" ? "ready_for_review" : "drafting",
          resumeApplicationMode:
            job.resumeApplicationMode ?? defaultResumeApplicationMode,
        }));
      }

      await readListingDetailForShortlistedJob(jobId);

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
      const occurredAt = new Date().toISOString();
      const reasons = [...new Set(input.reasons)];
      await ctx.repository.commitDiscoveryFeedbackUpdate(
        input.jobId,
        (current) => {
          const targetJob = current.job;
          if (!targetJob) {
            throw new Error(
              "Unable to hide unknown job '" + input.jobId + "'.",
            );
          }

          let nextSearchPreferences = current.searchPreferences;
          let nextCampaignState = current.campaignState;
          let employerExclusion =
            targetJob.discoveryFeedback?.employerExclusion ?? null;
          if (input.action === "hide_and_exclude_employer") {
            const activeCampaign = current.campaignState?.campaigns.find(
              (campaign) =>
                campaign.id === current.campaignState?.activeCampaignId,
            );
            const activePreferences =
              activeCampaign?.searchPreferences ?? current.searchPreferences;
            const preview = resolveEmployerExclusionPreview({
              job: targetJob,
              searchPreferences: {
                ...activePreferences,
                companyWhitelist: uniqueStrings([
                  ...current.searchPreferences.companyWhitelist,
                  ...activePreferences.companyWhitelist,
                ]),
              },
              companies: current.intelligenceState.companies,
            });
            if (preview.status !== "available") {
              throw new Error(
                `Employer exclusion is unavailable: ${preview.reason}.`,
              );
            }
            if (
              preview.normalizedCompanyName !==
              input.expectedNormalizedCompanyName
            ) {
              throw new Error(
                "The employer identity changed after preview. Review it again before excluding this employer.",
              );
            }
            const appended = appendExactEmployerExclusion(
              activePreferences.companyBlacklist,
              preview.displayCompanyName,
              preview.normalizedCompanyName,
            );
            nextSearchPreferences = {
              ...current.searchPreferences,
              companyBlacklist: appended.values,
            };
            employerExclusion = {
              normalizedCompanyName: preview.normalizedCompanyName,
              displayCompanyName: preview.displayCompanyName,
              addedByThisFeedback: appended.added,
              campaignId: activeCampaign?.id ?? null,
            };
            if (nextCampaignState !== null) {
              nextCampaignState = {
                ...nextCampaignState,
                campaigns: nextCampaignState.campaigns.map((campaign) =>
                  campaign.id === nextCampaignState!.activeCampaignId
                    ? {
                        ...campaign,
                        searchPreferences: {
                          ...campaign.searchPreferences,
                          companyBlacklist: appended.values,
                        },
                      }
                    : campaign,
                ),
              };
            }
          }

          const priorStatus =
            targetJob.status === "archived"
              ? (targetJob.discoveryFeedback?.priorStatus ?? null)
              : current.jobIsPending
                ? null
                : targetJob.status;
          const nextJob = SavedJobSchema.parse({
            ...targetJob,
            status: "archived",
            discoveryFeedback: {
              version: 1,
              revision: (targetJob.discoveryFeedback?.revision ?? 0) + 1,
              reasons,
              recordedAt: occurredAt,
              priorStatus,
              employerExclusion,
            },
          });
          return {
            result: null,
            savedJob: nextJob,
            searchPreferences: nextSearchPreferences,
            campaignState: nextCampaignState,
            discoveryState: {
              ...current.discoveryState,
              discoveryLedger: markSavedJobStatusInLedger({
                ledger: current.discoveryState.discoveryLedger,
                job: nextJob,
                status: "skipped",
                occurredAt,
                skipReason: "Not interested: " + reasons.join(", ") + ".",
              }),
              pendingDiscoveryJobs:
                current.discoveryState.pendingDiscoveryJobs.filter(
                  (job) => job.id !== input.jobId,
                ),
            },
          };
        },
      );
      return ctx.getWorkspaceSnapshot();
    },
    async previewEmployerExclusion(jobId) {
      const [savedJobs, discoveryState, searchPreferences, intelligenceState] =
        await Promise.all([
          ctx.repository.listSavedJobs(),
          ctx.repository.getDiscoveryState(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getIntelligenceState(),
        ]);
      const job =
        discoveryState.pendingDiscoveryJobs.find(
          (entry) => entry.id === jobId,
        ) ??
        savedJobs.find((entry) => entry.id === jobId) ??
        null;
      if (!job) {
        throw new Error(`Unable to preview an unknown job '${jobId}'.`);
      }
      return resolveEmployerExclusionPreview({
        job,
        searchPreferences,
        companies: intelligenceState.companies,
      });
    },
    async removeEmployerExclusion(input) {
      await ctx.repository.commitDiscoveryFeedbackUpdate(
        input.jobId,
        (current) => {
          if (!current.job || current.job.status !== "archived") {
            throw new Error(
              `Unable to change employer exclusion for unknown hidden job '${input.jobId}'.`,
            );
          }
          const reference = current.job.discoveryFeedback?.employerExclusion;
          if (
            !reference ||
            reference.normalizedCompanyName !== input.normalizedCompanyName
          ) {
            throw new Error("The saved employer exclusion reference is stale.");
          }
          const matchingCampaignIds =
            current.campaignState?.campaigns
              .filter((campaign) =>
                campaign.searchPreferences.companyBlacklist.some(
                  (value) =>
                    normalizeText(value.trim()) === input.normalizedCompanyName,
                ),
              )
              .map((campaign) => campaign.id) ?? [];
          const campaignId =
            reference.campaignId ??
            (matchingCampaignIds.length === 1 ? matchingCampaignIds[0]! : null);
          if (current.campaignState !== null && campaignId === null) {
            throw new Error(
              "The legacy employer exclusion cannot be tied to one campaign.",
            );
          }
          if (
            campaignId !== null &&
            !current.campaignState?.campaigns.some(
              (campaign) => campaign.id === campaignId,
            )
          ) {
            throw new Error("The saved employer exclusion campaign is stale.");
          }
          const updatesGlobalPreferences =
            current.campaignState === null ||
            current.campaignState.activeCampaignId === campaignId;
          const nextJob = SavedJobSchema.parse({
            ...current.job,
            discoveryFeedback: {
              ...current.job.discoveryFeedback,
              employerExclusion: null,
            },
          });
          return {
            result: null,
            savedJob: nextJob,
            searchPreferences: updatesGlobalPreferences
              ? {
                  ...current.searchPreferences,
                  companyBlacklist: removeExactEmployerExclusion(
                    current.searchPreferences.companyBlacklist,
                    input.normalizedCompanyName,
                  ),
                }
              : current.searchPreferences,
            campaignState:
              current.campaignState === null
                ? null
                : {
                    ...current.campaignState,
                    campaigns: current.campaignState.campaigns.map(
                      (campaign) =>
                        campaign.id === campaignId
                          ? {
                              ...campaign,
                              searchPreferences: {
                                ...campaign.searchPreferences,
                                companyBlacklist: removeExactEmployerExclusion(
                                  campaign.searchPreferences.companyBlacklist,
                                  input.normalizedCompanyName,
                                ),
                              },
                            }
                          : campaign,
                    ),
                  },
            discoveryState: current.discoveryState,
          };
        },
      );
      return ctx.getWorkspaceSnapshot();
    },
    async restoreDismissedDiscoveryJob(jobId) {
      const requestedAt = new Date().toISOString();
      await ctx.repository.commitDiscoveryFeedbackUpdate(jobId, (current) => {
        const targetJob = current.job;
        if (
          !targetJob ||
          current.jobIsPending ||
          targetJob.status !== "archived"
        ) {
          throw new Error(
            "Unable to restore unknown hidden job '" + jobId + "'.",
          );
        }
        const recordedAt = targetJob.discoveryFeedback?.recordedAt ?? null;
        if (recordedAt && Date.parse(recordedAt) > Date.parse(requestedAt)) {
          throw new Error(
            "The hidden-job decision changed while it was being restored.",
          );
        }
        const feedbackPriorStatus =
          targetJob.discoveryFeedback?.priorStatus ?? null;
        const restoredJob = SavedJobSchema.parse({
          ...targetJob,
          status:
            feedbackPriorStatus && feedbackPriorStatus !== "archived"
              ? feedbackPriorStatus
              : "discovered",
          discoveryFeedback: null,
        });
        return {
          result: null,
          savedJob: restoredJob,
          searchPreferences: current.searchPreferences,
          campaignState: current.campaignState,
          discoveryState: {
            ...current.discoveryState,
            discoveryLedger: markSavedJobStatusInLedger({
              ledger: current.discoveryState.discoveryLedger,
              job: restoredJob,
              status: "seen",
              occurredAt: requestedAt,
              skipReason: null,
            }),
          },
        };
      });
      return ctx.getWorkspaceSnapshot();
    },
    async generateResume(jobId) {
      // Full regeneration snapshots state up front and persists only after
      // the long AI/render pipeline; holding this job's transition tail
      // serializes those writes against saves, exports, approvals, and other
      // generation runs so neither side can race or clobber the other.
      return withResumeDraftTransition(jobId, () => runGenerateResume(jobId));
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
        // Acknowledgments are server-owned: the dedicated work-history review
        // command is the only writer, so an ordinary save can never inject,
        // drop, or rewrite them to bypass the review gates.
        const nextDraft = ResumeDraftSchema.parse({
          ...parsedDraft,
          workHistoryReviewAcknowledgments:
            currentDraft.workHistoryReviewAcknowledgments,
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
      // The persisted draft is always the exact sanitized result of the target
      // snapshot re-grounded against current profile evidence, never the raw
      // pre-sanitize target snapshot bytes: sanitization here is what keeps the
      // restored current draft, its validation, and the revision afterHash
      // describing identical content.
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
        // Versioning convention: the revision snapshots the exact pre-restore
        // persisted draft so undo history stays complete, while afterHash and
        // the persisted draft both describe the same sanitized restoredDraft.
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
      // The locked-content gate reads persisted state, so it must share the
      // same per-job transition as the generation it guards; otherwise a
      // save or pin change could land after the check but before generation
      // snapshots the draft. The core is called directly instead of through
      // this.generateResume so the transition is never acquired twice.
      return withResumeDraftTransition(jobId, async () => {
        const existingDraft = await ctx.repository.getResumeDraftByJobId(jobId);

        if (existingDraft && hasLockedResumeContent(existingDraft)) {
          throw new Error(
            "Unlock pinned resume sections or bullets before regenerating the full draft.",
          );
        }

        return runGenerateResume(jobId);
      });
    },
    async regenerateResumeSection(jobId, sectionId) {
      // Section proposals bind baseDraftUpdatedAt to the draft version they
      // were generated from; joining the same per-job transition tail keeps a
      // concurrent save from changing that version mid-regeneration.
      return withResumeDraftTransition(jobId, async () =>
        runRegenerateResumeSection(jobId, sectionId),
      );
    },
    async exportResumePdf(jobId, outputPath) {
      return withResumeDraftTransition(jobId, async () => {
        const {
          draft,
          job,
          profile,
          profileRevision,
          settings,
          tailoredAsset,
          templates,
        } = await ensureResumeDraft(ctx, jobId);
        // The persisted draft is the single render input: validation, content
        // hash binding, PDF rendering, and approval all describe this exact
        // draft. Persisted drafts are saved sanitized, so sanitization must be
        // content-neutral here; otherwise grounding drifted after the last
        // save and exporting would bind claims the PDF does not contain.
        const exportDraft = sanitizeResumeDraft({
          draft,
          job,
          profile,
        });
        if (
          buildResumeDraftContentHash(exportDraft) !==
          buildResumeDraftContentHash(draft)
        ) {
          throw new Error(
            "This saved resume draft no longer matches its grounded, sanitized content because candidate evidence changed after the last save. Review and save the draft before exporting.",
          );
        }
        const preExportValidation = validateResumeDraft({
          draft: exportDraft,
          job,
          profile,
        });
        if (
          hasBlockingResumeClaimAssessment({
            validation: preExportValidation,
            draft: exportDraft,
          }) ||
          hasBlockingResumeIdentityMismatch(preExportValidation)
        ) {
          const previousValidation =
            (await ctx.repository.listResumeValidationResults(draft.id))[0] ??
            null;
          const visibleValidation = preserveWorkHistoryReviewGuidance({
            validation: preExportValidation,
            previousValidation,
            draft: exportDraft,
          });
          await assertResumeDraftCurrent(draft);
          await assertCurrentResumeProfile(
            ctx,
            profileRevision,
            "saving export validation",
          );
          await ctx.repository.saveResumeDraftWithValidation({
            draft: exportDraft,
            validation: visibleValidation,
            tailoredAsset,
          });
          throw new Error(
            hasBlockingResumeIdentityMismatch(preExportValidation)
              ? "This resume has an identity mismatch between the visible profile and imported resume and cannot be exported yet."
              : "This resume has blocking candidate-claim validation issues and cannot be exported yet.",
          );
        }
        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "rendering this resume export",
        );
        const renderedArtifact = await renderDraftToPdf(ctx, {
          job,
          profile,
          settings,
          draft: exportDraft,
          outputPath: outputPath ?? null,
        });

        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "completing this resume export",
        );

        if (!renderedArtifact.storagePath) {
          throw new Error(
            `Resume export failed for '${job.title}' at '${job.company}'.`,
          );
        }

        const exportedAt = new Date().toISOString();
        const exportArtifact = buildResumeExportArtifact({
          draft: exportDraft,
          job,
          filePath: renderedArtifact.storagePath,
          format: renderedArtifact.format,
          sha256: renderedArtifact.sha256 ?? null,
          pageCount: renderedArtifact.pageCount ?? null,
          exportedAt,
        });
        const validation = validateResumeDraft({
          draft: exportDraft,
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
          draft: exportDraft,
        });
        const nextAsset = buildTailoredAssetBridge({
          draft: exportDraft,
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
        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "saving this resume export",
        );
        await ctx.repository.upsertResumeExportArtifact(exportArtifact);
        await assertResumeDraftCurrent(draft);
        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "saving this exported resume draft",
        );
        await ctx.repository.saveResumeDraftWithValidation({
          draft: exportDraft,
          validation: validationWithReviewGuidance,
          tailoredAsset: nextAsset,
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async approveResume(jobId, exportId) {
      return withResumeDraftTransition(jobId, async () => {
        const {
          draft,
          job,
          profile,
          profileRevision,
          tailoredAsset,
          templates,
        } = await ensureResumeDraft(ctx, jobId);
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
          hasBlockingResumeClaimAssessment({
            validation: latestValidation,
            draft,
          })
        ) {
          throw new Error(
            `Resume export '${exportId}' contains unconfirmed or unsupported candidate claims and cannot be approved.`,
          );
        }

        const identityResolution = resolveResumeIdentity(profile);
        const draftIdentityConflicts = findResumeDraftIdentityConflicts(
          profile,
          draft.identity,
        );
        if (
          identityResolution.mismatchReasons.length > 0 ||
          draftIdentityConflicts.length > 0 ||
          hasBlockingResumeIdentityMismatch(latestValidation)
        ) {
          throw new Error(
            resumeIdentityMismatchMessage(
              identityResolution.mismatchReasons.length > 0
                ? identityResolution.mismatchReasons
                : draftIdentityConflicts.length > 0
                  ? draftIdentityConflicts
                  : [
                      "The saved validation result contains a blocking resume identity mismatch.",
                    ],
            ),
          );
        }

        if (latestValidation.issues.some(isBlockingResumeValidationIssue)) {
          throw new Error(
            `Resume export '${exportId}' still has blocking validation errors and cannot be approved yet.`,
          );
        }

        const unresolvedOmissionSuggestions =
          listUnresolvedWorkHistoryOmissionSuggestions({
            draftId: draft.id,
            suggestions: buildWorkHistoryReviewSuggestionsFromValidation({
              draft,
              validation: latestValidation,
            }),
            acknowledgments: draft.workHistoryReviewAcknowledgments,
          });
        if (unresolvedOmissionSuggestions.length > 0) {
          throw new Error(
            `Resume export '${exportId}' still has ${unresolvedOmissionSuggestions.length} unresolved work-history omission review${unresolvedOmissionSuggestions.length === 1 ? "" : "s"}. Acknowledge ${unresolvedOmissionSuggestions.length === 1 ? "it" : "them"} in Resume Studio or show the hidden role before approving.`,
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
        await assertCurrentResumeProfile(
          ctx,
          profileRevision,
          "approving this resume export",
        );
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

        await clearStaleMissingResumeBlockerForJob(jobId);

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
    async setWorkHistoryReviewAcknowledgment(input) {
      const parsedInput =
        JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema.parse(input);
      return withResumeDraftTransition(parsedInput.jobId, async () => {
        const currentDraft = await ctx.repository.getResumeDraftByJobId(
          parsedInput.jobId,
        );

        if (!currentDraft || currentDraft.id !== parsedInput.draftId) {
          throw new Error(
            `Unable to find resume draft '${parsedInput.draftId}' for job '${parsedInput.jobId}'.`,
          );
        }
        if (currentDraft.updatedAt !== parsedInput.expectedDraftUpdatedAt) {
          throw new Error(
            "Resume draft changed before this work-history decision could be saved. Reload the workspace and try again.",
          );
        }

        if (parsedInput.intent === "remove") {
          const existing = currentDraft.workHistoryReviewAcknowledgments.find(
            (acknowledgment) =>
              acknowledgment.id === parsedInput.acknowledgmentId,
          );
          if (!existing || existing.draftId !== currentDraft.id) {
            throw new Error(
              `Unable to find work-history review acknowledgment '${parsedInput.acknowledgmentId}' on draft '${currentDraft.id}'.`,
            );
          }

          return persistWorkHistoryReviewAcknowledgmentMutation({
            jobId: parsedInput.jobId,
            currentDraft,
            mutatedAt: createMonotonicTimestamp(currentDraft.updatedAt),
            reason: `Removed work-history review acknowledgment for '${existing.profileRecordId}'.`,
            nextAcknowledgments:
              currentDraft.workHistoryReviewAcknowledgments.filter(
                (acknowledgment) =>
                  acknowledgment.id !== parsedInput.acknowledgmentId,
              ),
          });
        }

        const state = await ensureResumeDraft(ctx, parsedInput.jobId);
        const previousValidation =
          (
            await ctx.repository.listResumeValidationResults(currentDraft.id)
          )[0] ?? null;
        const projectedSuggestions =
          buildWorkHistoryReviewSuggestionsFromValidation({
            draft: currentDraft,
            validation: preserveWorkHistoryReviewGuidance({
              validation: validateResumeDraft({
                draft: currentDraft,
                job: state.job,
                profile: state.profile,
              }),
              previousValidation,
              draft: currentDraft,
            }),
          });
        const suggestion =
          projectedSuggestions.find(
            (candidate) => candidate.id === parsedInput.suggestionId,
          ) ?? null;

        if (!suggestion) {
          throw new Error(
            `Work-history review suggestion '${parsedInput.suggestionId}' is no longer projected for this draft. Reload the workspace and try again.`,
          );
        }
        if (!isWorkHistoryOmissionReviewSuggestion(suggestion)) {
          throw new Error(
            "Only hidden-role weak_fit or gap_coverage suggestions can be acknowledged as intentional omissions.",
          );
        }
        if (suggestion.profileRecordId !== parsedInput.profileRecordId) {
          throw new Error(
            `Work-history review suggestion '${parsedInput.suggestionId}' no longer matches profile record '${parsedInput.profileRecordId}'. Reload the workspace and try again.`,
          );
        }
        if (
          suggestion.kind !== parsedInput.kind ||
          suggestion.action !== parsedInput.action
        ) {
          throw new Error(
            `Work-history review suggestion '${parsedInput.suggestionId}' changed kind or action since it was reviewed. Reload the workspace and try again.`,
          );
        }
        if (suggestion.messageContentHash !== parsedInput.messageContentHash) {
          throw new Error(
            "The work-history guidance text changed since it was reviewed. Reload the workspace and acknowledge the current wording.",
          );
        }

        const identicalAcknowledgment = matchWorkHistoryReviewAcknowledgment({
          draftId: currentDraft.id,
          suggestion,
          acknowledgments: currentDraft.workHistoryReviewAcknowledgments,
        });
        if (identicalAcknowledgment) {
          // Deterministic dedupe: the same suggestion identity is already
          // acknowledged, so this command is a no-op instead of a second record.
          return ctx.getWorkspaceSnapshot();
        }

        const mutatedAt = createMonotonicTimestamp(currentDraft.updatedAt);

        return persistWorkHistoryReviewAcknowledgmentMutation({
          jobId: parsedInput.jobId,
          currentDraft,
          mutatedAt,
          reason: `Acknowledged intentional omission of '${suggestion.profileRecordId}'.`,
          nextAcknowledgments: [
            ...currentDraft.workHistoryReviewAcknowledgments,
            WorkHistoryReviewAcknowledgmentSchema.parse({
              id: createUniqueId(
                `work_history_ack_${suggestion.profileRecordId}`,
              ),
              draftId: currentDraft.id,
              profileRecordId: suggestion.profileRecordId,
              kind: suggestion.kind,
              action: suggestion.action,
              messageContentHash: suggestion.messageContentHash,
              reason: "intentional_omission",
              acknowledgedAt: mutatedAt,
            }),
          ],
        });
      });
    },
    async setResumeClaimConfirmation(rawInput) {
      const parsedInput =
        JobFinderSetResumeClaimConfirmationInputSchema.parse(rawInput);
      return withResumeDraftTransition(parsedInput.jobId, async () => {
        // Draft identity and revision must match the caller's projection, the
        // same optimistic-concurrency contract as every other draft command.
        const currentDraft = await ctx.repository.getResumeDraftByJobId(
          parsedInput.jobId,
        );

        if (!currentDraft || currentDraft.id !== parsedInput.draftId) {
          throw new Error(
            `Unable to find resume draft '${parsedInput.draftId}' for job '${parsedInput.jobId}'.`,
          );
        }
        if (currentDraft.updatedAt !== parsedInput.expectedDraftUpdatedAt) {
          throw new Error(
            "Resume draft changed before this claim confirmation could be saved. Reload the workspace and try again.",
          );
        }

        if (parsedInput.intent === "remove") {
          const existing = currentDraft.claimConfirmations.find(
            (confirmation) => confirmation.id === parsedInput.confirmationId,
          );
          if (!existing || existing.draftId !== currentDraft.id) {
            throw new Error(
              `Unable to find resume claim confirmation '${parsedInput.confirmationId}' on draft '${currentDraft.id}'.`,
            );
          }

          return persistResumeClaimConfirmationMutation({
            jobId: parsedInput.jobId,
            currentDraft,
            mutatedAt: createMonotonicTimestamp(currentDraft.updatedAt),
            reason: `Removed claim confirmation for '${existing.sectionId}'.`,
            nextConfirmations: currentDraft.claimConfirmations.filter(
              (confirmation) => confirmation.id !== parsedInput.confirmationId,
            ),
          });
        }

        // Re-run current v2 validation instead of trusting a stored result:
        // only an exact confirm_needed assessment of the current draft can be
        // confirmed, so stale projections, hard unsupported claims, and rows
        // that need no confirmation all fail closed here.
        const state = await ensureResumeDraft(ctx, parsedInput.jobId);
        const previousValidation =
          (
            await ctx.repository.listResumeValidationResults(currentDraft.id)
          )[0] ?? null;
        const freshValidation = preserveWorkHistoryReviewGuidance({
          validation: validateResumeDraft({
            draft: currentDraft,
            job: state.job,
            profile: state.profile,
          }),
          previousValidation,
          draft: currentDraft,
        });
        const assessment =
          freshValidation.claimAssessments.find(
            (candidate) =>
              candidate.field === parsedInput.field &&
              candidate.sectionId === parsedInput.sectionId &&
              candidate.entryId === parsedInput.entryId &&
              candidate.bulletId === parsedInput.bulletId &&
              candidate.contentHash === parsedInput.confirmedClaimContentHash,
          ) ?? null;

        if (!assessment) {
          throw new Error(
            "This claim is no longer projected for the current draft or its wording changed since it was reviewed. Reload the workspace and confirm the current claim text.",
          );
        }
        if (assessment.verifier !== "deterministic_candidate_evidence_v2") {
          throw new Error(
            "This claim assessment predates the current verifier and must be revalidated before it can be confirmed.",
          );
        }
        if (assessment.status === "unsupported") {
          throw new Error(
            "This claim conflicts with candidate evidence and cannot be confirmed as accurate; rewrite it instead.",
          );
        }
        if (assessment.status !== "confirm_needed") {
          throw new Error(
            "This claim does not currently need explicit confirmation.",
          );
        }

        const identicalConfirmation =
          currentDraft.claimConfirmations.find(
            (confirmation) =>
              confirmation.draftId === currentDraft.id &&
              confirmation.field === assessment.field &&
              confirmation.sectionId === assessment.sectionId &&
              confirmation.entryId === assessment.entryId &&
              confirmation.bulletId === assessment.bulletId &&
              confirmation.confirmedClaimContentHash === assessment.contentHash,
          ) ?? null;
        if (identicalConfirmation) {
          // Deterministic dedupe: the exact locator and normalized content
          // hash are already confirmed, so this command is a no-op instead of
          // a second record.
          return ctx.getWorkspaceSnapshot();
        }

        const mutatedAt = createMonotonicTimestamp(currentDraft.updatedAt);

        return persistResumeClaimConfirmationMutation({
          jobId: parsedInput.jobId,
          currentDraft,
          mutatedAt,
          reason: `Confirmed ${assessment.field} ownership for section '${assessment.sectionId}'.`,
          nextConfirmations: [
            ...currentDraft.claimConfirmations,
            ResumeClaimConfirmationSchema.parse({
              id: createUniqueId(`claim_confirmation_${assessment.sectionId}`),
              draftId: currentDraft.id,
              field: assessment.field,
              sectionId: assessment.sectionId,
              entryId: assessment.entryId,
              bulletId: assessment.bulletId,
              confirmedClaimContentHash: parsedInput.confirmedClaimContentHash,
              ownershipStatement: parsedInput.ownershipStatement,
              confirmedAt: mutatedAt,
            }),
          ],
        });
      });
    },
    async applyResumePatch(patch, revisionReason) {
      const parsedPatch = ResumeDraftPatchSchema.parse(patch);
      // Patches mutate the job's single draft, so they must queue on the same
      // per-job transition tail as saves and generation; keying by draft id
      // would create a second, uncoordinated lock for the same job and let a
      // patch race an in-flight generation's stale snapshot.
      const targetJobId =
        (await ctx.repository.listResumeDrafts()).find(
          (entry) => entry.id === parsedPatch.draftId,
        )?.jobId ?? null;

      if (!targetJobId) {
        throw new Error(
          `Unable to find resume draft '${parsedPatch.draftId}'.`,
        );
      }

      return withResumeDraftTransition(targetJobId, async () => {
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
          // Model output never self-identifies its origin: assistant proposals
          // always carry the canonical assistant origin so assistant-only
          // lock and reorder restrictions apply at acceptance time.
          origin: "assistant",
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
      // The proposal is only described as grounded when the exact classifier
      // that gates export and approval accepts the draft that accepting it
      // would produce. Applying the patches also proves they are appliable, so
      // one evaluation replaces the previous apply-only dry run.
      let proposalGate: {
        accepted: boolean;
        approvalBlockers: ResumeProposalApprovalBlocker[];
      };
      try {
        proposalGate = evaluateResumeProposalGrounding({
          baselineDraft: workspaceState.draft,
          patches: reviewablePatches,
          job: workspaceState.job,
          profile: workspaceState.profile,
          evaluatedAt: assistantMessageTimestamp,
        });
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

      const assistantContent =
        reviewablePatches.length > 0
          ? buildResumeProposalReplyContent({
              approvalBlockers: proposalGate.approvalBlockers,
              changeCount: reviewablePatches.length,
            })
          : invalidReplacementPatch
            ? "I could not produce a usable replacement for that request, so no resume change was proposed. Try asking for the exact section and outcome you want."
            : assistantReply.content;
      const assistantMessage = buildAssistantReplyMessage({
        jobId,
        content: assistantContent,
        approvalBlockers: proposalGate.approvalBlockers,
        patches: reviewablePatches,
        baseDraftUpdatedAt: workspaceState.draft.updatedAt,
        executionAttribution: assistantReply.executionReceipt,
        createdAt: assistantMessageTimestamp,
      });

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
    async approveApply(
      jobId,
      applicationRecordId?: string | null,
      capacityToken?: ApplicationPreparationCapacityToken,
    ) {
      const preflightJob = (await ctx.repository.listSavedJobs()).find(
        (entry) => entry.id === jobId,
      );
      if (!preflightJob) {
        throw new Error(
          `Unable to approve apply flow for unknown job '${jobId}'.`,
        );
      }
      const selectedApplicationRecord = await resolveApplicationRecordForJob({
        repository: ctx.repository,
        job: preflightJob,
        ...(applicationRecordId !== undefined ? { applicationRecordId } : {}),
      });
      const claim = claimDirectApplyExecution(
        jobId,
        selectedApplicationRecord.id,
      );
      return trackDirectApplyExecution(claim, async () => {
        await requireApplyActivityEnabled();
        const [
          profileState,
          searchPreferences,
          settings,
          savedJobs,
          sourceInstructionArtifacts,
          sourceDebugAttempts,
        ] = await Promise.all([
          ctx.repository.getProfileWithRevision(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.listSavedJobs(),
          ctx.repository.listSourceInstructionArtifacts(),
          ctx.repository.listSourceDebugAttempts(),
        ]);
        const profile = profileState.profile;
        assertCoherentResumeIdentity(profile);
        const job = savedJobs.find((entry) => entry.id === jobId);

        if (!job) {
          throw new Error(
            `Unable to approve apply flow for unknown job '${jobId}'.`,
          );
        }

        const prerequisites = await resolveJobApplyPrerequisites(jobId);
        const { resumeApplicationMode, resumeArtifact } = prerequisites;
        const capturedCampaignId = await ctx.getActiveCampaignId();
        await assertNoOtherRunningApplyForJob(claim);
        await assertDirectApplyExecutionCanContinue(claim);
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "staging this approved application preparation",
        );
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
        const intermediateMutationAuthority =
          await buildIntermediateMutationExecutionOptions({
            job,
            resumeArtifact,
          });
        await assertDirectApplyExecutionCanContinue(claim);
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "opening this approved application preparation",
        );
        const markedResult = await ctx.markApplicationPreparationStarted(
          {
            resultId: claim.resultId,
            runId: claim.runId,
            jobId,
          },
          capacityToken,
        );
        const browserProfile = await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "executing this approved application preparation",
        );

        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            job.source,
            {
              job,
              resumeArtifact,
              profile: browserProfile.profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              ...intermediateMutationAuthority,
              accountCreationAuthorized: false,
              submitAuthorized: false,
              ...(applyInstructions.length > 0
                ? { instructions: applyInstructions }
                : {}),
            },
            { signal: claim.controller.signal },
          ),
        );
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "recording this application preparation",
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
          applicationRecordId: selectedApplicationRecord.id,
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
          applicationRecordId: selectedApplicationRecord.id,
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

        await withApplyRunTransition(claim.runId, async () => {
          await assertDirectApplyTerminalTransitionIsOpen(claim);
          await ctx.repository.upsertApplicationAttempt(attempt);
          await Promise.all([
            ctx.repository.upsertApplyRun(persistedRun),
            ctx.repository.upsertApplyJobResult({
              ...runArtifacts.result,
              applicationPreparationStartedAt:
                markedResult.applicationPreparationStartedAt,
              applicationPreparationStartedLocalDate:
                markedResult.applicationPreparationStartedLocalDate,
            }),
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

          await withExactApplicationRecordTransition(
            selectedApplicationRecord.id,
            jobId,
            async () => {
              const applicationRecords =
                await ctx.repository.listApplicationRecords();
              const existingRecord = applicationRecords.find(
                (record) => record.id === selectedApplicationRecord.id,
              );
              if (!existingRecord) {
                throw new Error(
                  `Unknown Job Finder application record '${selectedApplicationRecord.id}'.`,
                );
              }
              const nextRecord = ApplicationRecordSchema.parse({
                id: existingRecord.id,
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
                crm: existingRecord.crm,
                events: mergeEvents(
                  existingRecord.events,
                  toApplicationEvents(job, executionResult.checkpoints),
                ),
              });

              await ctx.repository.upsertApplicationRecord(nextRecord);
            },
          );
          if (executionResult.state === "submitted") {
            // The applied ledger entry derives from the transaction-current
            // discovery state inside the same commit as the saved-job status,
            // so a discovery run finishing during the browser flow cannot be
            // reverted by a stale pre-flow snapshot.
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
              updateDiscoveryState: (current) => ({
                ...current,
                discoveryLedger: markSavedJobStatusInLedger({
                  ledger: current.discoveryLedger,
                  job,
                  ...(activeLedgerTargetId
                    ? { activeTargetId: activeLedgerTargetId }
                    : {}),
                  status: "applied",
                  occurredAt: executionResult.submittedAt ?? now,
                  skipReason: null,
                }),
              }),
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
        });

        return ctx.getWorkspaceSnapshot();
      });
    },
    async startApplyCopilotRun(
      jobId,
      options,
      applicationRecordId?: string | null,
      capacityToken?: ApplicationPreparationCapacityToken,
    ) {
      const preflightJob = (await ctx.repository.listSavedJobs()).find(
        (entry) => entry.id === jobId,
      );
      if (!preflightJob) {
        throw new Error(
          `Unable to start apply copilot for unknown job '${jobId}'.`,
        );
      }
      const selectedApplicationRecord = await resolveApplicationRecordForJob({
        repository: ctx.repository,
        job: preflightJob,
        ...(applicationRecordId !== undefined ? { applicationRecordId } : {}),
      });
      const claim = claimDirectApplyExecution(
        jobId,
        selectedApplicationRecord.id,
      );
      return trackDirectApplyExecution(claim, async () => {
        await requireApplyActivityEnabled();
        const [
          profileState,
          searchPreferences,
          settings,
          savedJobs,
          tailoredAssets,
          sourceInstructionArtifacts,
          sourceDebugAttempts,
          draft,
          approvedExports,
          recoverySeed,
        ] = await Promise.all([
          ctx.repository.getProfileWithRevision(),
          ctx.repository.getSearchPreferences(),
          ctx.repository.getSettings(),
          ctx.repository.listSavedJobs(),
          ctx.repository.listTailoredAssets(),
          ctx.repository.listSourceInstructionArtifacts(),
          ctx.repository.listSourceDebugAttempts(),
          ctx.repository.getResumeDraftByJobId(jobId),
          ctx.repository.listResumeExportArtifacts({ jobId }),
          buildApplyRecoveryContext(jobId, selectedApplicationRecord.id),
        ]);
        const profile = profileState.profile;
        assertCoherentResumeIdentity(profile);
        const capturedCampaignId = await ctx.getActiveCampaignId();
        const job = savedJobs.find((entry) => entry.id === jobId) ?? null;

        if (!job) {
          throw new Error(
            `Unable to start apply copilot for unknown job '${jobId}'.`,
          );
        }

        // Hoisted above the missing-resume branch so a copilot start can never
        // record blocked artifacts for a job that another apply run is already
        // actively preparing.
        await assertNoOtherRunningApplyForJob(claim);

        const asset =
          tailoredAssets.find((entry) => entry.jobId === jobId) ?? null;
        const approvedExportResolution = isApprovedTailoredResumeReadyForApply({
          draft,
          exports: approvedExports,
          asset,
        });
        const approvedExport = approvedExportResolution.approvedExport;
        const originalResumePath = profile.baseResume.storagePath?.trim() ?? "";
        const usesOriginalResume =
          resolveJobResumeApplicationMode(job, settings) === "original_resume";

        const shouldBlockForMissingResume = usesOriginalResume
          ? !originalResumePath
          : !approvedExportResolution.ready;

        // The missing-resume handoff must never orphan terminal artifacts on a
        // run nobody can cancel: register a durable cancellable running row
        // first, then commit the blocked artifacts inside the run transition so
        // a winning cancel writes nothing after cancellation.
        async function persistMissingResumeCopilotOutcome(): Promise<void> {
          if (!job) {
            throw new Error(
              `Unable to start apply copilot for unknown job '${jobId}'.`,
            );
          }
          const detectedAt = new Date().toISOString();
          const artifacts = buildMissingResumeCopilotArtifacts({
            applicationRecord: selectedApplicationRecord,
            job,
            detectedAt,
          });
          await assertDirectApplyExecutionCanContinue(claim);
          await assertCurrentResumeProfile(
            ctx,
            profileState.revision,
            "staging this missing-resume application preparation",
          );
          await persistDirectApplyRunStart({
            claim,
            job,
            campaignId: capturedCampaignId,
            startedAt: detectedAt,
          });
          const persistedRun = ApplyRunSchema.parse({
            ...artifacts.run,
            id: claim.runId,
            campaignId: capturedCampaignId,
            visualCheckpointsEnabled:
              options?.visualCheckpointsEnabled === true,
          });
          const persistedResult = ApplyJobResultSchema.parse({
            ...artifacts.result,
            id: claim.resultId,
            runId: claim.runId,
          });

          await withApplyRunTransition(claim.runId, async () => {
            await assertDirectApplyTerminalTransitionIsOpen(claim);
            await Promise.all([
              ctx.repository.upsertApplyRun(persistedRun),
              ctx.repository.upsertApplyJobResult(persistedResult),
              ctx.repository.upsertApplicationQuestionRecord(
                ApplicationQuestionRecordSchema.parse({
                  ...artifacts.questionRecord,
                  runId: claim.runId,
                  resultId: claim.resultId,
                }),
              ),
              ctx.repository.upsertApplicationArtifactRef(
                ApplicationArtifactRefSchema.parse({
                  ...artifacts.artifactRef,
                  runId: claim.runId,
                  resultId: claim.resultId,
                }),
              ),
              ctx.repository.upsertApplicationReplayCheckpoint(
                ApplicationReplayCheckpointSchema.parse({
                  ...artifacts.checkpoint,
                  runId: claim.runId,
                  resultId: claim.resultId,
                }),
              ),
              ctx.repository.upsertApplicationConsentRequest(
                ApplicationConsentRequestSchema.parse({
                  ...artifacts.consentRequest,
                  runId: claim.runId,
                  resultId: claim.resultId,
                }),
              ),
            ]);

            await withExactApplicationRecordTransition(
              selectedApplicationRecord.id,
              jobId,
              async () => {
                const applicationRecords =
                  await ctx.repository.listApplicationRecords();
                const existingRecord =
                  applicationRecords.find(
                    (record) => record.id === selectedApplicationRecord.id,
                  ) ?? null;
                await ctx.repository.upsertApplicationRecord(
                  mergeMissingResumeApplicationRecord({
                    applicationRecord: artifacts.applicationRecord,
                    existingRecord,
                  }),
                );
              },
            );
          });

          await persistAutomaticApplicationSafeguards({
            ctx,
            run: persistedRun,
            result: persistedResult,
            job,
            now: detectedAt,
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });
        }

        if (!shouldBlockForMissingResume && ctx.exportFileVerifier) {
          const approvedFileExists = await ctx.exportFileVerifier.exists(
            usesOriginalResume ? originalResumePath : approvedExport!.filePath,
          );

          if (!approvedFileExists) {
            await persistMissingResumeCopilotOutcome();
            return ctx.getWorkspaceSnapshot();
          }
        }

        if (shouldBlockForMissingResume) {
          await persistMissingResumeCopilotOutcome();
          return ctx.getWorkspaceSnapshot();
        }

        const prerequisites = await resolveJobApplyPrerequisites(jobId);
        const {
          job: currentJob,
          resumeApplicationMode,
          resumeArtifact,
        } = prerequisites;
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "staging this application preparation",
        );
        if (!ctx.browserRuntime.executeApplicationFlow) {
          throw new Error(
            "The current browser runtime does not support non-submitting apply copilot execution yet.",
          );
        }
        await assertDirectApplyExecutionCanContinue(claim);
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "starting this application preparation",
        );
        await persistDirectApplyRunStart({
          claim,
          job: currentJob,
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
        const intermediateMutationAuthority =
          await buildIntermediateMutationExecutionOptions({
            job: currentJob,
            resumeArtifact,
          });
        await assertDirectApplyExecutionCanContinue(claim);
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "opening this application preparation",
        );
        const markedResult = await ctx.markApplicationPreparationStarted(
          {
            resultId: claim.resultId,
            runId: claim.runId,
            jobId,
          },
          capacityToken,
        );
        const browserProfile = await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "executing this application preparation",
        );
        const executionResult = enforcePrepareOnlyExecutionResult(
          await ctx.browserRuntime.executeApplicationFlow(
            currentJob.source,
            {
              job: currentJob,
              resumeArtifact,
              profile: browserProfile.profile,
              settings: { ...settings, resumeApplicationMode },
              mode: "prepare_only",
              ...intermediateMutationAuthority,
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
                source: currentJob.source,
              }),
            },
            { signal: claim.controller.signal },
          ),
        );
        await assertCurrentResumeProfile(
          ctx,
          prerequisites.profileRevision,
          "recording this application preparation",
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
          applicationRecordId: selectedApplicationRecord.id,
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
          applicationRecordId: selectedApplicationRecord.id,
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

        await withApplyRunTransition(claim.runId, async () => {
          await assertDirectApplyTerminalTransitionIsOpen(claim);
          await ctx.repository.upsertApplicationAttempt(attempt);
          await Promise.all([
            ctx.repository.upsertApplyRun(persistedRun),
            ctx.repository.upsertApplyJobResult({
              ...runArtifacts.result,
              applicationPreparationStartedAt:
                markedResult.applicationPreparationStartedAt,
              applicationPreparationStartedLocalDate:
                markedResult.applicationPreparationStartedLocalDate,
            }),
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

          await withExactApplicationRecordTransition(
            selectedApplicationRecord.id,
            jobId,
            async () => {
              const applicationRecords =
                await ctx.repository.listApplicationRecords();
              const existingRecord = applicationRecords.find(
                (record) => record.id === selectedApplicationRecord.id,
              );
              if (!existingRecord) {
                throw new Error(
                  `Unknown Job Finder application record '${selectedApplicationRecord.id}'.`,
                );
              }
              const nextRecord = ApplicationRecordSchema.parse({
                id: existingRecord.id,
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
                crm: existingRecord.crm,
                events: mergeEvents(
                  existingRecord.events,
                  toApplicationEvents(job, executionResult.checkpoints),
                ),
              });

              await ctx.repository.upsertApplicationRecord(nextRecord);
            },
          );
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
            applicationRecordId: selectedApplicationRecord.id,
            job,
            runId: persistedRun.id,
            resultId: runArtifacts.result.id,
            resultState: runArtifacts.result.state,
            resultStartedAt: runArtifacts.result.startedAt,
            replayCheckpointId: runArtifacts.checkpoints.at(-1)?.id ?? null,
            blocker,
            occurredAt: detectedAt,
          });
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
    async startAutoApplyRun(jobId, applicationRecordId?: string | null) {
      const prerequisites = await resolveJobApplyPrerequisites(jobId);
      const { job } = prerequisites;
      const selectedApplicationRecord = await resolveApplicationRecordForJob({
        repository: ctx.repository,
        job,
        ...(applicationRecordId !== undefined ? { applicationRecordId } : {}),
      });
      const capturedCampaignId = await ctx.getActiveCampaignId();

      const createdAt = new Date().toISOString();
      const runArtifacts = buildSingleJobAutoApplyArtifacts({
        applicationRecordId: selectedApplicationRecord.id,
        createdAt,
        job,
      });
      const persistedRun = ApplyRunSchema.parse({
        ...runArtifacts.run,
        campaignId: capturedCampaignId,
      });

      await assertCurrentResumeProfile(
        ctx,
        prerequisites.profileRevision,
        "staging this automatic application run",
      );
      await Promise.all([
        ctx.repository.upsertApplyRun(persistedRun),
        ctx.repository.upsertApplyJobResult(runArtifacts.result),
        ctx.repository.upsertApplySubmitApproval(runArtifacts.approval),
      ]);

      await withExactApplicationRecordTransition(
        selectedApplicationRecord.id,
        jobId,
        async () => {
          const applicationRecords =
            await ctx.repository.listApplicationRecords();
          const existingRecord = applicationRecords.find(
            (record) => record.id === selectedApplicationRecord.id,
          );
          if (!existingRecord) {
            throw new Error(
              `Unknown Job Finder application record '${selectedApplicationRecord.id}'.`,
            );
          }
          const nextRecord = ApplicationRecordSchema.parse({
            id: existingRecord.id,
            jobId,
            title: job.title,
            company: job.company,
            status: job.status,
            lastActionLabel: persistedRun.summary,
            nextActionLabel:
              "Review the pending submit approval in Applications.",
            lastUpdatedAt: createdAt,
            lastAttemptState: existingRecord.lastAttemptState,
            questionSummary: existingRecord.questionSummary,
            latestBlocker: existingRecord.latestBlocker,
            consentSummary: existingRecord.consentSummary,
            replaySummary: existingRecord.replaySummary,
            crm: existingRecord.crm,
            events: mergeEvents(existingRecord.events, [
              {
                id: `event_${persistedRun.id}_awaiting_submit_approval`,
                at: createdAt,
                title: "Application preparation approval requested",
                detail:
                  "Your review permits opening and filling this application only. It never permits submission.",
                emphasis: "warning",
              },
            ]),
          });

          await ctx.repository.upsertApplicationRecord(nextRecord);
        },
      );

      return ctx.getWorkspaceSnapshot();
    },
    async startAutoApplyQueueRun(jobIds) {
      const uniqueJobIds = uniqueStrings(jobIds);

      if (uniqueJobIds.length === 0) {
        throw new Error(
          "At least one job is required before starting an automatic apply queue.",
        );
      }

      // Shared staging inputs are read once for the whole batch; each job
      // still gets its own draft/export lookup, omission-review decision,
      // template validation, and artifact hash verification.
      const [
        scopedSavedJobs,
        scopedTailoredAssets,
        scopedProfileState,
        scopedSettings,
      ] = await Promise.all([
        ctx.repository.listSavedJobs(),
        ctx.repository.listTailoredAssets(),
        ctx.repository.getProfileWithRevision(),
        ctx.repository.getSettings(),
      ]);
      const jobs = await Promise.all(
        uniqueJobIds.map(
          async (jobId) =>
            (
              await resolveJobApplyPrerequisites(jobId, scopedSavedJobs, {
                tailoredAssets: scopedTailoredAssets,
                profile: scopedProfileState.profile,
                profileRevision: scopedProfileState.revision,
                settings: scopedSettings,
              })
            ).job,
        ),
      );
      const selectedApplicationRecords = await Promise.all(
        jobs.map((job) =>
          resolveApplicationRecordForJob({ repository: ctx.repository, job }),
        ),
      );
      const applicationRecordIdByJobId = new Map(
        selectedApplicationRecords.map((record) => [record.jobId, record.id]),
      );
      const getApplicationRecordId = (jobId: string): string => {
        const id = applicationRecordIdByJobId.get(jobId);
        if (!id) {
          throw new Error(
            `Missing resolved application record for job '${jobId}'.`,
          );
        }
        return id;
      };
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
          applicationRecordId: getApplicationRecordId(job.id),
          queuePosition: index,
          state: "planned",
          summary: "Waiting for explicit queue approval.",
          detail:
            "This queued job will not execute until the run-scoped approval is recorded.",
          startedAt: createdAt,
          updatedAt: createdAt,
          completedAt: null,
          applicationPreparationStartedAt: null,
          applicationPreparationStartedLocalDate: null,
          blockerReason: null,
          blockerSummary: null,
          latestQuestionCount: 0,
          latestAnswerCount: 0,
          pendingConsentRequestCount: 0,
          artifactCount: 0,
          latestCheckpointId: null,
        }),
      );

      await assertCurrentResumeProfile(
        ctx,
        scopedProfileState.revision,
        "staging this automatic application queue",
      );
      await Promise.all([
        ctx.repository.upsertApplyRun(run),
        ctx.repository.upsertApplySubmitApproval(approval),
        ...results.map((result) => ctx.repository.upsertApplyJobResult(result)),
        ...jobs.map((job) =>
          syncRunApplicationRecord({
            applicationRecordId: getApplicationRecordId(job.id),
            eventDetail:
              "A batch automatic apply run was staged for this job. The current safe build still stops before final submit.",
            eventEmphasis: "warning",
            eventId: `event_${runId}_${job.id}_queue_staged`,
            eventTitle: "Automatic apply preparation staged",
            jobId: job.id,
            lastActionLabel: run.summary,
            nextActionLabel:
              "Review the prepared run approval in Applications.",
            updatedAt: createdAt,
          }),
        ),
      ]);

      return ctx.getWorkspaceSnapshot();
    },
    async approveApplyRun(
      runId,
      capacityToken?: ApplicationPreparationCapacityToken,
    ) {
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

        // Cancellation owns the terminal state when it wins the transition
        // race. Approval becomes a no-op and must never relaunch browser work.
        if (run.state === "cancelled") {
          return null;
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

        await requireApplicationSafeguardClearance(run.jobIds);

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

      if (mode === null) {
        return ctx.getWorkspaceSnapshot();
      }

      await requireApplyActivityEnabled();
      await executeSafeApplyRun(
        {
          mode,
          runId,
        },
        capacityToken,
      );

      return ctx.getWorkspaceSnapshot();
    },
    async cancelApplyRun(runId) {
      ctx.activeApplyRunAbortControllers.get(runId)?.abort();
      const { run, updatedRun, now, applicationRecordIdByJobId, results } =
        await withApplyRunTransition(runId, async () => {
          const [runs, results] = await Promise.all([
            ctx.repository.listApplyRuns(),
            ctx.repository.listApplyJobResults({ runId }),
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

          const applicationRecordIdByJobId = new Map<string, string>();
          for (const jobId of run.jobIds) {
            const matchingResults = results.filter(
              (result) => result.jobId === jobId,
            );
            const applicationRecordId = matchingResults[0]?.applicationRecordId;
            if (
              matchingResults.length !== 1 ||
              !applicationRecordId ||
              matchingResults.some(
                (result) => result.applicationRecordId !== applicationRecordId,
              )
            ) {
              throw new Error(
                `Apply run '${runId}' has legacy or ambiguous application lineage for job '${jobId}'.`,
              );
            }
            applicationRecordIdByJobId.set(jobId, applicationRecordId);
          }

          const now = new Date().toISOString();
          // A cancelled run is terminal, so its queue counters are recomputed
          // from the exact committed result states with the same canonical
          // recovery semantics an interrupted run receives: preserved
          // awaiting_review checkpoints stay the only outstanding user-owned
          // work, and abandoned queued/in-flight rows stop inflating derived
          // queue sizes forever.
          const updatedRun = ApplyRunSchema.parse({
            ...run,
            state: "cancelled",
            updatedAt: now,
            completedAt: now,
            summary: "Automatic apply run cancelled.",
            detail:
              "The queued run was cancelled before final submit. Any completed preparation artifacts remain available for review.",
            ...deriveRecoveredApplyRunCounters(results, now),
          });
          await ctx.repository.upsertApplyRun(updatedRun);
          return {
            run,
            updatedRun,
            now,
            applicationRecordIdByJobId,
            results,
          };
        });

      // Cancel writes each job record sequentially under the per-job record
      // transition so a concurrent worker sync can never interleave a lost
      // update, and committed attempt/checkpoint history is always retained.
      for (const jobId of run.jobIds) {
        const applicationRecordId = applicationRecordIdByJobId.get(jobId);
        if (!applicationRecordId) continue;
        // Only outcomes the run still owns (queued or interrupted mid-flow)
        // receive cancellation copy. Finished records keep the labels their
        // own outcome wrote: submitted and awaiting_review checkpoints,
        // declined skips, blockers, and failures all stay truthful after
        // cancellation. The cancellation audit event is appended either way.
        const jobResult = results.find((result) => result.jobId === jobId);
        const runOwnsJobOutcome =
          !jobResult || isInterruptedApplyJobState(jobResult.state);
        await withExactApplicationRecordTransition(
          applicationRecordId,
          jobId,
          async () => {
            const applicationRecords =
              await ctx.repository.listApplicationRecords();
            const existingRecord = applicationRecords.find(
              (record) => record.id === applicationRecordId,
            );

            if (!existingRecord) {
              return;
            }

            await ctx.repository.upsertApplicationRecord(
              ApplicationRecordSchema.parse({
                ...existingRecord,
                ...(runOwnsJobOutcome
                  ? {
                      lastActionLabel: updatedRun.summary,
                      nextActionLabel:
                        "Restart the run if you want to continue later.",
                    }
                  : {}),
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
          },
        );
      }

      return ctx.getWorkspaceSnapshot();
    },
    async resolveApplyConsentRequest(
      requestId,
      action,
      capacityToken?: ApplicationPreparationCapacityToken,
    ) {
      return withConsentResolution(requestId, async () => {
        await requireApplyActivityEnabled();
        const [requests, runs, results] = await Promise.all([
          ctx.repository.listApplicationConsentRequests(),
          ctx.repository.listApplyRuns(),
          ctx.repository.listApplyJobResults(),
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
        if (!request.applicationRecordId) {
          throw new Error(
            `Consent request '${requestId}' has legacy application lineage and is non-actionable.`,
          );
        }
        const requestResults = results.filter(
          (result) =>
            result.runId === request.runId &&
            result.jobId === request.jobId &&
            result.applicationRecordId === request.applicationRecordId,
        );
        if (
          requestResults.length !== 1 ||
          request.resultId !== requestResults[0]?.id
        ) {
          throw new Error(
            `Consent request '${requestId}' no longer matches its exact apply result.`,
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

        const pendingJobs = run.jobIds.filter((jobId) => {
          if (jobId === request.jobId) return false;
          const result = results.find(
            (entry) => entry.runId === run.id && entry.jobId === jobId,
          );
          return !result || result.state === "planned";
        });
        const jobsThatWillContinue =
          action === "approve" ? [request.jobId, ...pendingJobs] : pendingJobs;
        if (jobsThatWillContinue.length > 0) {
          await requireApplicationSafeguardClearance(jobsThatWillContinue);
        }

        type ConsentResolutionOutcome = {
          relaunchMode: "queue_auto" | null;
          safeguards: {
            run: ReturnType<typeof ApplyRunSchema.parse>;
            result: ReturnType<typeof ApplyJobResultSchema.parse>;
          } | null;
        };

        // The final run/result/request writes are serialized under the run
        // transition and every input is re-read inside it, so a cancel that
        // won the race keeps its terminal state and a committing worker's
        // counters are never clobbered by stale snapshots. The browser
        // relaunch stays outside the transition.
        const outcome = await withApplyRunTransition(
          run.id,
          async (): Promise<ConsentResolutionOutcome> => {
            const [latestRequests, latestRuns, latestResults, latestApprovals] =
              await Promise.all([
                ctx.repository.listApplicationConsentRequests(),
                ctx.repository.listApplyRuns(),
                ctx.repository.listApplyJobResults(),
                ctx.repository.listApplySubmitApprovals(),
              ]);
            const latestRequest =
              latestRequests.find((entry) => entry.id === requestId) ?? null;

            if (!latestRequest || latestRequest.status !== "pending") {
              throw new Error(
                `Consent request '${requestId}' is already ${
                  latestRequest?.status ?? "resolved"
                }.`,
              );
            }
            if (!latestRequest.applicationRecordId) {
              throw new Error(
                `Consent request '${requestId}' has legacy application lineage and is non-actionable.`,
              );
            }
            const latestApplicationRecordId = latestRequest.applicationRecordId;

            const latestRun =
              latestRuns.find((entry) => entry.id === run.id) ?? null;

            if (!latestRun) {
              throw new Error(
                `Unknown apply run '${run.id}' for consent request '${requestId}'.`,
              );
            }

            if (
              latestRun.state !== "paused_for_consent" &&
              latestRun.state !== "paused_for_user_review" &&
              latestRun.state !== "running"
            ) {
              // Cancellation owns the terminal state when it wins the
              // transition race; this resolution must not resurrect the run.
              throw new Error(
                `Consent request '${requestId}' cannot be resolved because run '${latestRun.id}' is ${latestRun.state}.`,
              );
            }

            const now = new Date().toISOString();
            const decidedRequest = ApplicationConsentRequestSchema.parse({
              ...latestRequest,
              status: action === "approve" ? "approved" : "declined",
              decidedAt: now,
            });
            await ctx.repository.upsertApplicationConsentRequest(
              decidedRequest,
            );
            const otherPendingConsentCount = latestRequests.filter(
              (candidate) =>
                candidate.runId === latestRun.id &&
                candidate.id !== latestRequest.id &&
                candidate.status === "pending",
            ).length;
            const remainingJobs = latestRun.jobIds.filter((jobId) => {
              if (jobId === latestRequest.jobId) return false;
              const result = latestResults.find(
                (entry) =>
                  entry.runId === latestRun.id && entry.jobId === jobId,
              );
              return !result || result.state === "planned";
            });

            if (action === "decline") {
              const relatedResult = latestResults.find(
                (entry) =>
                  entry.runId === latestRequest.runId &&
                  entry.jobId === latestRequest.jobId &&
                  entry.applicationRecordId === latestApplicationRecordId,
              );

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

              const awaitingReviewJobs = latestRun.jobIds.filter((jobId) => {
                if (jobId === latestRequest.jobId) return false;
                return latestResults.some(
                  (result) =>
                    result.runId === latestRun.id &&
                    result.jobId === jobId &&
                    result.state === "awaiting_review",
                );
              }).length;
              const blockedJobs = Math.max(0, latestRun.blockedJobs - 1);
              const nextState =
                remainingJobs.length > 0
                  ? "running"
                  : otherPendingConsentCount > 0
                    ? "paused_for_consent"
                    : awaitingReviewJobs > 0 || blockedJobs > 0
                      ? "paused_for_user_review"
                      : "completed";
              const updatedRun = ApplyRunSchema.parse({
                ...latestRun,
                state: nextState,
                updatedAt: now,
                completedAt: nextState === "completed" ? now : null,
                currentJobId: remainingJobs[0] ?? latestRequest.jobId,
                pendingJobs: remainingJobs.length + awaitingReviewJobs,
                skippedJobs: latestRun.skippedJobs + 1,
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

              await withExactApplicationRecordTransition(
                latestApplicationRecordId,
                latestRequest.jobId,
                async () => {
                  const applicationRecords =
                    await ctx.repository.listApplicationRecords();
                  const existingRecord = applicationRecords.find(
                    (record) => record.id === latestRequest.applicationRecordId,
                  );

                  if (!existingRecord) {
                    return;
                  }

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
                          id: `event_${latestRun.id}_${latestRequest.jobId}_consent_declined`,
                          at: now,
                          title: "Consent declined",
                          detail:
                            "The consent-gated branch was declined, so this job was skipped without any final submit action.",
                          emphasis: "warning",
                        },
                      ]),
                    }),
                  );
                },
              );

              const approval =
                latestApprovals.find(
                  (entry) => entry.id === latestRun.submitApprovalId,
                ) ?? null;
              return {
                relaunchMode:
                  latestRun.mode === "queue_auto" &&
                  remainingJobs.length > 0 &&
                  approval?.status === "approved"
                    ? "queue_auto"
                    : null,
                safeguards: null,
              };
            }

            const relatedResult = latestResults.find(
              (entry) =>
                entry.runId === latestRequest.runId &&
                entry.jobId === latestRequest.jobId &&
                entry.applicationRecordId === latestApplicationRecordId,
            );
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

            const awaitingReviewJobs = latestRun.jobIds.filter((jobId) => {
              if (jobId === latestRequest.jobId) return true;
              return latestResults.some(
                (result) =>
                  result.runId === latestRun.id &&
                  result.jobId === jobId &&
                  result.state === "awaiting_review",
              );
            }).length;
            const blockedJobs = Math.max(0, latestRun.blockedJobs - 1);
            const nextState =
              remainingJobs.length > 0
                ? "running"
                : otherPendingConsentCount > 0
                  ? "paused_for_consent"
                  : "paused_for_user_review";

            const updatedRun = ApplyRunSchema.parse({
              ...latestRun,
              state: nextState,
              updatedAt: now,
              currentJobId: remainingJobs[0] ?? latestRequest.jobId,
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
            // terminal safeguards here as the normal execution path does;
            // otherwise the prepared-batch sample is skipped when no remaining
            // job restarts the queue.
            const safeguards =
              approvedResult && updatedRun.state !== "running"
                ? { run: updatedRun, result: approvedResult }
                : null;

            await withExactApplicationRecordTransition(
              latestApplicationRecordId,
              latestRequest.jobId,
              async () => {
                const applicationRecords =
                  await ctx.repository.listApplicationRecords();
                const existingRecord = applicationRecords.find(
                  (record) => record.id === latestRequest.applicationRecordId,
                );

                if (!existingRecord) {
                  return;
                }

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
                      latestRun.mode === "queue_auto" &&
                      remainingJobs.length > 0
                        ? "Consent approved. The queue resumed in safe review mode."
                        : "Consent approved. The job stayed prepared for review.",
                    nextActionLabel:
                      latestRun.mode === "queue_auto" &&
                      remainingJobs.length > 0
                        ? "The queue continued with the remaining jobs."
                        : "Review the prepared application before any later execution step.",
                    lastUpdatedAt: now,
                    events: mergeEvents(existingRecord.events, [
                      {
                        id: `event_${latestRun.id}_${latestRequest.jobId}_consent_approved`,
                        at: now,
                        title: "Consent approved",
                        detail:
                          "The consent-gated branch was approved. The current safe build still stops before final submit.",
                        emphasis: "positive",
                      },
                    ]),
                  }),
                );
              },
            );

            return {
              relaunchMode:
                latestRun.mode === "queue_auto" && remainingJobs.length > 0
                  ? "queue_auto"
                  : null,
              safeguards,
            };
          },
        );

        if (outcome.safeguards) {
          await persistAutomaticApplicationSafeguards({
            ctx,
            run: outcome.safeguards.run,
            result: outcome.safeguards.result,
            job: null,
            now: new Date().toISOString(),
          }).catch((safeguardError: unknown) => {
            console.error(
              "Failed to persist automatic application safeguards.",
              safeguardError,
            );
          });
        }

        if (outcome.relaunchMode) {
          try {
            await requireApplyActivityEnabled();
            await executeSafeApplyRun(
              {
                mode: outcome.relaunchMode,
                runId: run.id,
              },
              capacityToken,
            );
          } catch (relaunchError) {
            // The transition already persisted `running`, but when the
            // relaunch fails before a worker takes over, nothing owns that
            // state and startup recovery would later misreport the ghost as
            // an app-closed run. A live execution for this run (a concurrent
            // resolution racing an active queue) owns the truthful running
            // state itself, so only an unowned run is parked.
            const ownedByLiveExecution =
              ctx.activeApplyRunAbortControllers.has(run.id) ||
              ctx.activeApplyRunPromises.has(run.id);
            if (!ownedByLiveExecution) {
              await withApplyRunTransition(run.id, async () => {
                const latestRuns = await ctx.repository.listApplyRuns();
                const latestRun =
                  latestRuns.find((entry) => entry.id === run.id) ?? null;
                // Cancellation or failure owns the terminal state when it
                // won the race; never resurrect or overwrite it.
                if (!latestRun || latestRun.state !== "running") {
                  return;
                }
                const pausedAt = new Date().toISOString();
                await ctx.repository.upsertApplyRun(
                  ApplyRunSchema.parse({
                    ...latestRun,
                    state: "paused_for_user_review",
                    updatedAt: pausedAt,
                    summary:
                      "Consent resolved, but the queue paused before continuing.",
                    detail:
                      relaunchError instanceof Error
                        ? relaunchError.message
                        : "The queue could not continue after this consent decision.",
                  }),
                );
              });
            }
            throw relaunchError;
          }
        }

        return ctx.getWorkspaceSnapshot();
      });
    },
    async revokeApplyRunApproval(runId) {
      await withApplyRunTransition(runId, async () => {
        const [runs, approvals, results] = await Promise.all([
          ctx.repository.listApplyRuns(),
          ctx.repository.listApplySubmitApprovals(),
          ctx.repository.listApplyJobResults({ runId }),
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

        const revocationJobId = run.currentJobId;

        if (revocationJobId) {
          const matchingResults = results.filter(
            (result) => result.jobId === revocationJobId,
          );
          const applicationRecordId = matchingResults[0]?.applicationRecordId;
          if (matchingResults.length !== 1 || !applicationRecordId) {
            throw new Error(
              `Apply run '${runId}' has legacy or ambiguous application lineage for job '${revocationJobId}'.`,
            );
          }
          await withExactApplicationRecordTransition(
            applicationRecordId,
            revocationJobId,
            async () => {
              const applicationRecords =
                await ctx.repository.listApplicationRecords();
              const existingRecord = applicationRecords.find(
                (record) => record.id === applicationRecordId,
              );

              if (!existingRecord) {
                return;
              }

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
            },
          );
        }
      });

      return ctx.getWorkspaceSnapshot();
    },
  };
}
