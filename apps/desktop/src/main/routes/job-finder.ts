import { writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import type {
  IpcMain,
  IpcMainInvokeEvent,
  OpenDialogOptions,
  SaveDialogOptions,
} from "electron";
import {
  ApplicationCrmExportInputSchema,
  ApplicationCrmFileExportResultSchema,
  ApplicationCrmBulkStageMutationInputSchema,
  ApplicationCrmMutationInputSchema,
  ApplicationCrmSettingsSchema,
  ApplicationPacketSchema,
  AppearanceThemeSchema,
  ApplyGroupedManualAnswerInputSchema,
  ApplyRunDetailsSchema,
  CampaignRuleFunnelProjectionSchema,
  ClearApplicationAnswerCommandSchema,
  CandidateProfileSchema,
  CompanyIntelligenceMutationInputSchema,
  DiscoveryActivityEventSchema,
  DesktopTestOkResponseSchema,
  JobFinderAgentDiscoveryActionInputSchema,
  JobFinderAgentDiscoveryResultSchema,
  JobFinderApplicationPacketExportResultSchema,
  JobFinderApplyCopilotActionInputSchema,
  JobFinderApplyConsentActionInputSchema,
  JobFinderApplyQueueActionInputSchema,
  JobFinderApplyRunActionInputSchema,
  JobFinderApplyRunDetailsQuerySchema,
  JobFinderApplicationStartTargetSchema,
  JobFinderApplyResumePatchInputSchema,
  JobFinderApproveResumeInputSchema,
  JobFinderPreviewResumeDraftInputSchema,
  JobFinderProfileCopilotMessageInputSchema,
  JobFinderProfileCopilotPatchGroupActionInputSchema,
  JobFinderProfileSetupReviewActionInputSchema,
  JobFinderResumeTimelineRepairActionInputSchema,
  JobFinderResumePreviewSchema,
  JobFinderResumePreviewModeSchema,
  JobFinderResumeAssistantMessageInputSchema,
  JobFinderResolveResumeAssistantProposalInputSchema,
  JobFinderRepositoryStateSchema,
  JobFinderSetResumeClaimConfirmationInputSchema,
  JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema,
  JobFinderStartupDatabaseRecoveryFactSchema,
  JobFinderStartupResetRecoveryFactSchema,
  ResumeQualityBenchmarkRequestSchema,
  ResumeImportBenchmarkRequestSchema,
  JobFinderResumeWorkspaceQuerySchema,
  JobFinderSaveResumeDraftInputSchema,
  JobFinderRestoreResumeDraftRevisionInputSchema,
  JobFinderResumeWorkspaceSchema,
  JobFinderResumeSectionActionInputSchema,
  JobFinderExportResumePdfInputSchema,
  JobFinderJobActionInputSchema,
  JobFinderJobResumeApplicationModeInputSchema,
  JobFinderDismissDiscoveryJobInputSchema,
  EmployerExclusionPreviewSchema,
  RemoveEmployerExclusionInputSchema,
  JobFinderOpenBrowserSessionInputSchema,
  JobFinderPerformanceSnapshotSchema,
  JobFinderDiagnosticExportSchema,
  JobFinderDiagnosticExportResultSchema,
  JobFinderSaveSourceInstructionInputSchema,
  JobFinderSourceDebugActionInputSchema,
  JobFinderSourceDebugRunQuerySchema,
  JobFinderSourceInstructionActionInputSchema,
  JobFinderSettingsSchema,
  SaveJobFinderWorkspaceInputSchema,
  ProfileSetupStateSchema,
  ProjectGroupedManualAnswerCommandSchema,
  SourceDebugProgressEventSchema,
  SourceDebugRunDetailsSchema,
  SourceDebugRunRecordSchema,
  JobFinderWorkspaceEntityMutationInputSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobFinderWorkspaceSyncInputSchema,
  JobSearchPreferencesSchema,
  NonEmptyStringSchema,
  SaveJobSearchCampaignInputSchema,
  SaveCampaignRuleRouteInputSchema,
  SafeguardMutationInputSchema,
  SelectJobSearchCampaignInputSchema,
  DeleteCampaignRuleInputSchema,
  DeleteJobSearchCampaignInputSchema,
  ToggleCampaignRuleInputSchema,
  ProjectCampaignRuleFunnelInputSchema,
  SetJobFinderActivityControlInputSchema,
  RunCampaignNowInputSchema,
  MarkCampaignNotificationReadInputSchema,
  JobFinderUndoProfileRevisionInputSchema,
  ResumeImportBenchmarkReportSchema,
  ResumeImportBenchmarkCaseSchema,
  ResumeDocumentBundleSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportProgressEventSchema,
  ResumeImportRunSchema,
  ResumeQualityBenchmarkReportSchema,
  RapidReviewMutationInputSchema,
  RecommendResumeStrategyInputSchema,
  RecordOutcomeInputSchema,
  ResumeStrategyRecommendationSchema,
  ReviewCompanyMergeInputSchema,
  SaveResumeStrategyInputSchema,
  SaveApplicationAnswerCommandSchema,
  SelectResumeStrategyInputSchema,
  SetCampaignResumeStrategyDefaultInputSchema,
  SnoozeGroupedDecisionInputSchema,
  SetCompanyPreferenceInputSchema,
  SetOutcomeSuggestionEnabledInputSchema,
  UpdateApplicationDefaultsInputSchema,
  UpdateWorkspaceBehaviorInputSchema,
  UserActionCommandSchema,
} from "@unemployed/contracts";
import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { createJobFinderProductActionToolRegistry } from "@unemployed/job-finder";
import { buildJobFinderDiagnosticExport } from "../services/job-finder/build-diagnostic-export";
import { collectJobFinderPerformanceSnapshot } from "../services/job-finder/collect-performance-snapshot";
import { createJobFinderWorkspaceDeltaTracker } from "../services/job-finder/workspace-delta";
import {
  getDesktopTestDelayMs,
  getJobFinderWorkspaceService,
  importResumeFromSourcePath,
  isDesktopTestApiEnabled,
  loadApplyQueueDemoState,
  loadResumeWorkspaceDemoState,
  parseResumeImportPathPayload,
  resetJobFinderWorkspace,
  getJobFinderStartupResetRecoveryFact,
  dismissJobFinderStartupDatabaseRecoveryNotice,
  getJobFinderStartupDatabaseRecoveryFact,
  runDesktopResumeQualityBenchmark,
  runDesktopResumeImportBenchmark,
  defaultBenchmarkCases,
  setJobFinderWorkspaceServiceTestEnv,
} from "../services/job-finder";
import {
  armJobFinderTestSaveFailure,
  consumeArmedJobFinderTestSaveFailure,
  type JobFinderSaveChannel,
} from "../services/job-finder/test-save-failure";
import { registerJobFinderBootstrapDesktopRoutes } from "../setup/register-job-finder-bootstrap-routes";

function parseAgentDiscoveryRequest(payload: unknown) {
  return JobFinderAgentDiscoveryActionInputSchema.parse(payload);
}

function parseOptionalRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const requestId = (payload as { requestId?: unknown }).requestId;
  if (typeof requestId !== "string" || requestId.trim().length === 0) {
    return null;
  }

  return requestId;
}

function throwIfResumePreviewAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  throw new DOMException("Resume preview was superseded.", "AbortError");
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildResumeExportDefaultPath(
  jobTitle: string,
  company: string,
): string {
  const titleSegment = sanitizeFileNameSegment(jobTitle) || "Resume";
  const companySegment = sanitizeFileNameSegment(company);
  const fileName = companySegment
    ? `${titleSegment} - ${companySegment}.pdf`
    : `${titleSegment}.pdf`;

  return path.join(app.getPath("documents"), fileName);
}
function buildApplicationPacketExportDefaultPath(
  jobTitle: string,
  company: string,
): string {
  const titleSegment = sanitizeFileNameSegment(jobTitle) || "Job";
  const companySegment = sanitizeFileNameSegment(company);
  const fileName = companySegment
    ? `Application packet - ${titleSegment} - ${companySegment}.json`
    : `Application packet - ${titleSegment}.json`;

  return path.join(app.getPath("documents"), fileName);
}

/**
 * Mutation responses carry the exact workspace snapshot the service just
 * produced. `getWorkspaceSnapshot` already schema-parses that value inside
 * `@unemployed/job-finder`, so re-parsing it in every route handler validated
 * every job, application record, and stored answer a second time on every
 * user action. That cost grows linearly with everything the user has ever
 * discovered — the repository's own scale gate is 5,000 jobs / 1,001
 * records — and it can never reject anything the first parse accepted.
 *
 * Removing the deep parse must not remove the fail-closed guarantee that a
 * malformed main-process value never reaches the renderer, so this keeps a
 * constant-time structural guard: the response must still be recognisably a
 * workspace snapshot, checked without walking a single collection. The
 * compile-time contract is unchanged (the argument must be exactly a
 * `JobFinderWorkspaceSnapshot`), mutation *input* parsing is unchanged, and
 * the genuine integrity boundaries — workspace reset, demo/fixture loading,
 * and native resume-import recovery — keep the full deep parse.
 */
const REQUIRED_WORKSPACE_SNAPSHOT_COLLECTIONS = [
  "discoveryJobs",
  "reviewQueue",
  "applyRuns",
  "applicationRecords",
] as const satisfies readonly (keyof JobFinderWorkspaceSnapshot)[];

function workspaceMutationResponse(
  snapshot: JobFinderWorkspaceSnapshot,
): JobFinderWorkspaceSnapshot {
  const candidate = snapshot as unknown;
  const isWorkspaceSnapshotShape =
    typeof candidate === "object" &&
    candidate !== null &&
    (candidate as { module?: unknown }).module === "job-finder" &&
    typeof (candidate as { generatedAt?: unknown }).generatedAt === "string" &&
    typeof (candidate as { profile?: unknown }).profile === "object" &&
    (candidate as { profile?: unknown }).profile !== null &&
    REQUIRED_WORKSPACE_SNAPSHOT_COLLECTIONS.every((key) =>
      Array.isArray((candidate as Record<string, unknown>)[key]),
    );

  if (!isWorkspaceSnapshotShape) {
    throw new Error(
      "Job Finder produced a workspace response that is not a workspace snapshot.",
    );
  }

  return snapshot;
}

export function registerJobFinderRouteHandlers(
  ipcMain: IpcMain,
  options: { includeBootstrapRoutes?: boolean } = {},
) {
  if (options.includeBootstrapRoutes !== false) {
    registerJobFinderBootstrapDesktopRoutes(ipcMain);
  }
  const workspaceDeltaTracker = createJobFinderWorkspaceDeltaTracker();
  const activeResumePreviewRequests = new WeakMap<
    object,
    {
      requestId: string;
      controller: AbortController;
    }
  >();
  const activeResumeImportRequests = new WeakMap<
    object,
    {
      requestId: string;
      cancelled: boolean;
      phase: "picking" | "processing";
    }
  >();

  /**
   * Registers one protected save channel. The only behavior it adds is the
   * desktop test API's one-shot synthetic save failure, which is inert unless
   * a tester armed that exact surface while UNEMPLOYED_ENABLE_TEST_API is set.
   * Production builds run the listener verbatim.
   */
  function handleJobFinderSaveRoute<TResult>(
    channel: JobFinderSaveChannel,
    listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<TResult>,
  ): void {
    ipcMain.handle(
      channel,
      async (event: IpcMainInvokeEvent, payload: unknown) => {
        consumeArmedJobFinderTestSaveFailure(channel);
        return listener(event, payload);
      },
    );
  }

  ipcMain.handle(
    "job-finder:sync-workspace",
    async (_event, payload: unknown) => {
      const input = JobFinderWorkspaceSyncInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot();

      return workspaceDeltaTracker.synchronize(input.baseRevision, snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:mutate-workspace-entities",
    async (_event, payload: unknown) => {
      const input = JobFinderWorkspaceEntityMutationInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await (async () => {
        switch (input.mutation.type) {
          case "queue_job_for_review":
            return jobFinderWorkspaceService.queueJobForReview(
              input.mutation.jobId,
            );
          case "set_job_resume_application_mode":
            return jobFinderWorkspaceService.setJobResumeApplicationMode(
              input.mutation.jobId,
              input.mutation.resumeApplicationMode,
            );
          case "remove_job_from_review":
            return jobFinderWorkspaceService.removeJobFromReview(
              input.mutation.jobId,
            );
          case "dismiss_discovery_job":
            return jobFinderWorkspaceService.dismissDiscoveryJob({
              jobId: input.mutation.jobId,
              reasons: input.mutation.reasons,
              action: input.mutation.action ?? "hide_job",
              expectedNormalizedCompanyName:
                input.mutation.expectedNormalizedCompanyName ?? null,
            });
          case "restore_dismissed_discovery_job":
            return jobFinderWorkspaceService.restoreDismissedDiscoveryJob(
              input.mutation.jobId,
            );
          default: {
            const unreachable: never = input.mutation;
            throw new Error(
              `Unsupported workspace entity mutation: ${JSON.stringify(unreachable)}`,
            );
          }
        }
      })();
      return workspaceDeltaTracker.synchronize(input.baseRevision, snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:open-browser-session",
    async (_event, payload: unknown) => {
      const input = JobFinderOpenBrowserSessionInputSchema.parse(payload ?? {});
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.openBrowserSession(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle("job-finder:check-browser-session", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.checkBrowserSession();

    return workspaceMutationResponse(snapshot);
  });

  handleJobFinderSaveRoute(
    "job-finder:save-profile",
    async (_event, payload: unknown) => {
      const profile = CandidateProfileSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveProfile(profile);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:save-workspace-inputs",
    async (_event, payload: unknown) => {
      const { profile, searchPreferences, settings } =
        SaveJobFinderWorkspaceInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      await jobFinderWorkspaceService.saveProfileAndSearchPreferences(
        profile,
        searchPreferences,
      );

      if (settings) {
        await jobFinderWorkspaceService.saveSettings(settings);
      }

      const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot();

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle("job-finder:analyze-profile-from-resume", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.analyzeProfileFromResume();

    return workspaceMutationResponse(snapshot);
  });

  handleJobFinderSaveRoute(
    "job-finder:save-search-preferences",
    async (_event, payload: unknown) => {
      const searchPreferences = JobSearchPreferencesSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.saveSearchPreferences(
          searchPreferences,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:save-campaign",
    async (_event, payload: unknown) => {
      const campaign = SaveJobSearchCampaignInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.saveCampaign(campaign));
    },
  );

  ipcMain.handle(
    "job-finder:select-campaign",
    async (_event, payload: unknown) => {
      const { campaignId } = SelectJobSearchCampaignInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.selectCampaign(campaignId),
      );
    },
  );

  ipcMain.handle(
    "job-finder:delete-campaign",
    async (_event, payload: unknown) => {
      const input = DeleteJobSearchCampaignInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return service.deleteCampaign(input);
    },
  );

  ipcMain.handle(
    "job-finder:run-campaign-now",
    async (_event, payload: unknown) => {
      const input = RunCampaignNowInputSchema.parse(payload ?? {});
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.runCampaignNow(input));
    },
  );

  ipcMain.handle(
    "job-finder:mark-campaign-notification-read",
    async (_event, payload: unknown) => {
      const { notificationId } = MarkCampaignNotificationReadInputSchema.omit({
        readAt: true,
      }).parse(payload);
      const service = await getJobFinderWorkspaceService();
      const snapshot = await service.markCampaignNotificationRead({
        notificationId,
        readAt: new Date().toISOString(),
      });

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:mark-all-campaign-notifications-read",
    async () => {
      const service = await getJobFinderWorkspaceService();
      const snapshot = await service.markAllCampaignNotificationsRead({
        readAt: new Date().toISOString(),
      });

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:save-campaign-rule",
    async (_event, payload: unknown) => {
      const input = SaveCampaignRuleRouteInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.saveCampaignRule(input));
    },
  );

  ipcMain.handle(
    "job-finder:delete-campaign-rule",
    async (_event, payload: unknown) => {
      const input = DeleteCampaignRuleInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.deleteCampaignRule(input));
    },
  );

  ipcMain.handle(
    "job-finder:toggle-campaign-rule",
    async (_event, payload: unknown) => {
      const input = ToggleCampaignRuleInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.toggleCampaignRule(input));
    },
  );

  ipcMain.handle(
    "job-finder:project-campaign-rule-funnel",
    async (_event, payload: unknown) => {
      const input = ProjectCampaignRuleFunnelInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return CampaignRuleFunnelProjectionSchema.parse(
        await service.projectCampaignRuleFunnel(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:set-activity-control",
    async (_event, payload: unknown) => {
      const input = SetJobFinderActivityControlInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      const { getEmbeddedBrowser } =
        await import("../services/browser/embedded-browser");
      getEmbeddedBrowser().syncActivityPaused(input.paused);
      return workspaceMutationResponse(await service.setActivityControl(input));
    },
  );

  ipcMain.handle(
    "job-finder:mutate-rapid-review",
    async (_event, payload: unknown) => {
      const input = RapidReviewMutationInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.mutateRapidReview(input));
    },
  );

  ipcMain.handle(
    "job-finder:record-outcome",
    async (_event, payload: unknown) => {
      const input = RecordOutcomeInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.recordOutcome(input));
    },
  );

  ipcMain.handle(
    "job-finder:save-resume-strategy",
    async (_event, payload: unknown) => {
      const input = SaveResumeStrategyInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.saveResumeStrategy(input));
    },
  );

  ipcMain.handle(
    "job-finder:disable-resume-strategy",
    async (_event, payload: unknown) => {
      const strategyId = NonEmptyStringSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.disableResumeStrategy(strategyId),
      );
    },
  );

  ipcMain.handle(
    "job-finder:select-resume-strategy",
    async (_event, payload: unknown) => {
      const input = SelectResumeStrategyInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.selectResumeStrategy(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:recommend-resume-strategy",
    async (_event, payload: unknown) => {
      const input = RecommendResumeStrategyInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return ResumeStrategyRecommendationSchema.parse(
        await service.recommendResumeStrategy(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:set-campaign-resume-strategy-default",
    async (_event, payload: unknown) => {
      const input = SetCampaignResumeStrategyDefaultInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.setCampaignResumeStrategyDefault(input),
      );
    },
  );

  ipcMain.handle("job-finder:refresh-company-intelligence", async () => {
    const service = await getJobFinderWorkspaceService();
    return workspaceMutationResponse(
      await service.refreshCompanyIntelligence(),
    );
  });

  ipcMain.handle(
    "job-finder:set-company-preference",
    async (_event, payload: unknown) => {
      const input = SetCompanyPreferenceInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.setCompanyPreference(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:review-company-merge",
    async (_event, payload: unknown) => {
      const input = ReviewCompanyMergeInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.reviewCompanyMerge(input));
    },
  );

  ipcMain.handle(
    "job-finder:mutate-company-intelligence",
    async (_event, payload: unknown) => {
      const input = CompanyIntelligenceMutationInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.mutateCompanyIntelligence(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:set-outcome-suggestion-enabled",
    async (_event, payload: unknown) => {
      const input = SetOutcomeSuggestionEnabledInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await service.setOutcomeSuggestionEnabled(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:mutate-safeguards",
    async (_event, payload: unknown) => {
      const input = SafeguardMutationInputSchema.parse(payload);
      const service = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(await service.mutateSafeguards(input));
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:save-profile-setup-state",
    async (_event, payload: unknown) => {
      const profileSetupState = ProfileSetupStateSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.saveProfileSetupState(
          profileSetupState,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-profile-setup-review-action",
    async (_event, payload: unknown) => {
      const { reviewItemId, action, options } =
        JobFinderProfileSetupReviewActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyProfileSetupReviewAction(
          reviewItemId,
          action,
          options,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-resume-timeline-repair-action",
    async (_event, payload: unknown) => {
      const { runId, proposalId, action } =
        JobFinderResumeTimelineRepairActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyResumeTimelineRepairAction(
          runId,
          proposalId,
          action,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:send-profile-copilot-message",
    async (_event, payload: unknown) => {
      const { content, context } =
        JobFinderProfileCopilotMessageInputSchema.parse(payload);
      const testDelayMs = isDesktopTestApiEnabled()
        ? getDesktopTestDelayMs(
            process.env.UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS,
            "UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS",
          )
        : 0;

      if (testDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, testDelayMs));
      }

      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const productActions = createJobFinderProductActionToolRegistry(
        jobFinderWorkspaceService,
      );
      const proposal = await productActions.execute("propose_profile_change", {
        request: content,
        context,
      });
      if (!proposal.ok) {
        throw new Error(proposal.error.message);
      }
      const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot();

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:apply-profile-copilot-patch-group",
    async (_event, payload: unknown) => {
      const { patchGroupId } =
        JobFinderProfileCopilotPatchGroupActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyProfileCopilotPatchGroup(
          patchGroupId,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:reject-profile-copilot-patch-group",
    async (_event, payload: unknown) => {
      const { patchGroupId } =
        JobFinderProfileCopilotPatchGroupActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.rejectProfileCopilotPatchGroup(
          patchGroupId,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:undo-profile-revision",
    async (_event, payload: unknown) => {
      const { revisionId } =
        JobFinderUndoProfileRevisionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.undoProfileRevision(revisionId);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:save-settings",
    async (_event, payload: unknown) => {
      const settings = JobFinderSettingsSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveSettings(settings);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:update-application-defaults",
    async (_event, payload: unknown) => {
      const input = UpdateApplicationDefaultsInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.updateApplicationDefaults(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:update-workspace-behavior",
    async (_event, payload: unknown) => {
      const input = UpdateWorkspaceBehaviorInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.updateWorkspaceBehavior(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:update-appearance-theme",
    async (_event, payload: unknown) => {
      const appearanceTheme = AppearanceThemeSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.updateAppearanceTheme(appearanceTheme);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:update-tracker-crm",
    async (_event, payload: unknown) => {
      const applicationCrm = ApplicationCrmSettingsSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.updateTrackerCrm(applicationCrm);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:import-resume",
    async (event, payload: unknown) => {
      const requestId = parseOptionalRequestId(payload);
      const request: {
        requestId: string;
        cancelled: boolean;
        phase: "picking" | "processing";
      } | null = requestId
        ? { requestId, cancelled: false, phase: "picking" }
        : null;
      if (request) {
        activeResumeImportRequests.set(event.sender, request);
      }

      const cancelHandler = request
        ? (cancelEvent: Electron.IpcMainEvent, cancelPayload: unknown) => {
            const activeRequest = activeResumeImportRequests.get(
              cancelEvent.sender,
            );
            if (
              activeRequest === request &&
              parseOptionalRequestId(cancelPayload) === request.requestId &&
              activeRequest.phase === "picking"
            ) {
              // The native picker cannot be force-closed safely from the main
              // process. Marking the request is enough to discard a late file
              // choice, so a manual fallback never imports behind the user's
              // back after they stopped waiting.
              request.cancelled = true;
            }
          }
        : null;
      if (cancelHandler) {
        ipcMain.on("job-finder:cancel-import-resume", cancelHandler);
      }

      const reportProgress = requestId
        ? (
            progress: Parameters<
              typeof ResumeImportProgressEventSchema.parse
            >[0],
          ) => {
            const parsedProgress =
              ResumeImportProgressEventSchema.parse(progress);

            // A native picker can outlive the renderer that opened it. Do
            // not let a progress notification race turn a successful import
            // into a rejected IPC request after a reload or window close.
            try {
              if (event.sender.isDestroyed()) {
                return;
              }
              event.sender.send(
                `job-finder:resume-import-progress:${requestId}`,
                parsedProgress,
              );
            } catch (error) {
              // The sender may be destroyed between the check and send.
              // Preserve import persistence for that expected lifecycle race,
              // while still surfacing unexpected send failures.
              if (!event.sender.isDestroyed()) {
                throw error;
              }
            }
          }
        : undefined;
      const dialogOptions: OpenDialogOptions = {
        properties: ["openFile"],
        filters: [
          {
            name: "Resume documents",
            extensions: ["pdf", "docx", "txt", "md"],
          },
          { name: "All files", extensions: ["*"] },
        ],
      };
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      try {
        const usableParentWindow =
          parentWindow && !parentWindow.isDestroyed() ? parentWindow : null;
        if (usableParentWindow) {
          // A hidden or backgrounded renderer can otherwise leave the native
          // picker behind another window where automation and users cannot
          // see Escape/cancel feedback.
          usableParentWindow.show();
          usableParentWindow.focus();
        }
        const selection = usableParentWindow
          ? await dialog.showOpenDialog(usableParentWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);

        if (
          request?.cancelled ||
          selection.canceled ||
          selection.filePaths.length === 0
        ) {
          const jobFinderWorkspaceService =
            await getJobFinderWorkspaceService();
          return JobFinderWorkspaceSnapshotSchema.parse(
            await jobFinderWorkspaceService.getWorkspaceSnapshot(),
          );
        }

        const sourcePath = selection.filePaths[0];

        if (!sourcePath) {
          const jobFinderWorkspaceService =
            await getJobFinderWorkspaceService();
          return JobFinderWorkspaceSnapshotSchema.parse(
            await jobFinderWorkspaceService.getWorkspaceSnapshot(),
          );
        }

        if (request) {
          // A valid selection transfers ownership from the native picker to
          // the importer synchronously, before any further await can let a
          // route-change cancellation race discard real processing.
          request.phase = "processing";
        }
        return importResumeFromSourcePath(sourcePath, {
          ...(reportProgress ? { onProgress: reportProgress } : {}),
        });
      } finally {
        if (cancelHandler) {
          ipcMain.removeListener(
            "job-finder:cancel-import-resume",
            cancelHandler,
          );
        }
        if (
          request &&
          activeResumeImportRequests.get(event.sender) === request
        ) {
          activeResumeImportRequests.delete(event.sender);
        }
      }
    },
  );

  ipcMain.handle(
    "job-finder:test-reset-workspace-state",
    async (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      const partialPayload =
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const state = JobFinderRepositoryStateSchema.parse(partialPayload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.resetWorkspace(state);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle("job-finder:test-load-resume-workspace-demo", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const snapshot = await loadResumeWorkspaceDemoState();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle(
    "job-finder:test-set-resume-preview-mode",
    async (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      const mode = JobFinderResumePreviewModeSchema.parse(payload);
      await setJobFinderWorkspaceServiceTestEnv({
        UNEMPLOYED_TEST_RESUME_PREVIEW: mode,
      });

      return DesktopTestOkResponseSchema.parse({ ok: true });
    },
  );

  ipcMain.handle("job-finder:test-load-apply-queue-demo", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const snapshot = await loadApplyQueueDemoState();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle(
    "job-finder:test-fail-next-save",
    (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      // One-shot and per-surface: the very next save the named surface starts
      // rejects, then the arm clears itself. Nothing else is affected, and no
      // application, browser, or submission authority is involved.
      armJobFinderTestSaveFailure(payload);

      return DesktopTestOkResponseSchema.parse({ ok: true });
    },
  );

  ipcMain.handle("job-finder:get-performance-snapshot", async () => {
    const service = await getJobFinderWorkspaceService();
    const { performance } = await collectJobFinderPerformanceSnapshot({
      service,
    });

    return JobFinderPerformanceSnapshotSchema.parse(performance);
  });

  ipcMain.handle("job-finder:test-get-performance-snapshot", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }
    const service = await getJobFinderWorkspaceService();
    const { performance } = await collectJobFinderPerformanceSnapshot({
      service,
    });

    return JobFinderPerformanceSnapshotSchema.parse(performance);
  });

  ipcMain.handle(
    "job-finder:test-run-resume-import-benchmark",
    async (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      const parsed = ResumeImportBenchmarkRequestSchema.partial().parse(
        payload ?? {},
      );
      const options = {
        ...(parsed.benchmarkVersion !== undefined
          ? { benchmarkVersion: parsed.benchmarkVersion }
          : {}),
        ...(parsed.cases !== undefined ? { cases: parsed.cases } : {}),
        ...(parsed.canaryOnly !== undefined
          ? { canaryOnly: parsed.canaryOnly }
          : {}),
        ...(parsed.useConfiguredAi !== undefined
          ? { useConfiguredAi: parsed.useConfiguredAi }
          : {}),
        ...(parsed.useVision !== undefined
          ? { useVision: parsed.useVision }
          : {}),
      };

      const report = await runDesktopResumeImportBenchmark(options);
      return ResumeImportBenchmarkReportSchema.parse(report);
    },
  );

  ipcMain.handle("job-finder:test-get-resume-import-benchmark-cases", () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    return ResumeImportBenchmarkCaseSchema.array().parse(defaultBenchmarkCases);
  });

  ipcMain.handle("job-finder:test-get-resume-import-state", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const state = await jobFinderWorkspaceService.getResumeImportState();

    return {
      resumeImportRuns: ResumeImportRunSchema.array().parse(
        state.resumeImportRuns,
      ),
      resumeImportDocumentBundles: ResumeDocumentBundleSchema.array().parse(
        state.resumeImportDocumentBundles,
      ),
      resumeImportFieldCandidates:
        ResumeImportFieldCandidateSchema.array().parse(
          state.resumeImportFieldCandidates,
        ),
    };
  });

  ipcMain.handle(
    "job-finder:test-run-resume-quality-benchmark",
    async (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      const parsed = ResumeQualityBenchmarkRequestSchema.partial().parse(
        payload ?? {},
      );
      const options = {
        ...(parsed.benchmarkVersion !== undefined
          ? { benchmarkVersion: parsed.benchmarkVersion }
          : {}),
        ...(parsed.caseIds !== undefined ? { caseIds: parsed.caseIds } : {}),
        ...(parsed.templateIds !== undefined
          ? { templateIds: parsed.templateIds }
          : {}),
        ...(parsed.canaryOnly !== undefined
          ? { canaryOnly: parsed.canaryOnly }
          : {}),
        ...(parsed.useConfiguredAi !== undefined
          ? { useConfiguredAi: parsed.useConfiguredAi }
          : {}),
        ...(parsed.persistArtifactsDirectory !== undefined
          ? { persistArtifactsDirectory: parsed.persistArtifactsDirectory }
          : {}),
      };

      const report = await runDesktopResumeQualityBenchmark(options);
      return ResumeQualityBenchmarkReportSchema.parse(report);
    },
  );

  ipcMain.handle(
    "job-finder:test-import-resume-from-path",
    async (_event, payload: unknown) => {
      if (!isDesktopTestApiEnabled()) {
        throw new Error(
          "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
        );
      }

      const { sourcePath, useVision } = parseResumeImportPathPayload(payload);
      return importResumeFromSourcePath(
        sourcePath,
        useVision !== undefined ? { useVision } : {},
      );
    },
  );

  ipcMain.handle(
    "job-finder:perform-user-action",
    async (_event, payload: unknown) => {
      const command = UserActionCommandSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.performUserAction(command);
      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle("job-finder:run-discovery", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.runDiscovery();

    return workspaceMutationResponse(snapshot);
  });

  ipcMain.handle(
    "job-finder:run-agent-discovery",
    async (event, payload: unknown) => {
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const window = event.sender;
      const senderId = event.sender.id;
      const { requestId, targetId } = parseAgentDiscoveryRequest(payload);
      const controller = new AbortController();

      const cancelHandler = (
        cancelEvent: Electron.IpcMainEvent,
        cancelPayload: unknown,
      ) => {
        const cancelRequestId = (() => {
          try {
            return parseAgentDiscoveryRequest(cancelPayload).requestId;
          } catch (error) {
            if (
              error instanceof Error &&
              error.name === "ZodError" &&
              Array.isArray((error as { issues?: unknown }).issues)
            ) {
              return null;
            }

            throw error;
          }
        })();

        if (
          cancelEvent.sender.id !== senderId ||
          cancelRequestId !== requestId
        ) {
          return;
        }

        controller.abort();
      };
      ipcMain.on("job-finder:cancel-agent-discovery", cancelHandler);

      try {
        const snapshot = await jobFinderWorkspaceService.runAgentDiscovery(
          (eventPayload) => {
            window.send(
              `job-finder:discovery-activity:${requestId}`,
              DiscoveryActivityEventSchema.parse(eventPayload),
            );
          },
          controller.signal,
          targetId ?? undefined,
        );

        // The service resolves cancelled runs (it finalizes the run record as
        // `cancelled` and persists incrementally committed jobs before
        // returning), so the terminal outcome is read from the authoritative
        // workspace state. Only an AbortError that escaped the pipeline — an
        // abort before the run record existed — is itself proof of
        // cancellation.
        return JobFinderAgentDiscoveryResultSchema.parse({
          outcome:
            snapshot.discoveryRunState === "cancelled"
              ? "cancelled"
              : "completed",
          snapshot,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[JobFinder] Agent discovery cancelled");
          // Return current workspace snapshot even on abort
          const currentSnapshot =
            await jobFinderWorkspaceService.getWorkspaceSnapshot();
          return JobFinderAgentDiscoveryResultSchema.parse({
            outcome: "cancelled",
            snapshot: currentSnapshot,
          });
        }
        throw error;
      } finally {
        ipcMain.removeListener(
          "job-finder:cancel-agent-discovery",
          cancelHandler,
        );
      }
    },
  );

  ipcMain.handle(
    "job-finder:run-source-debug",
    async (event, payload: unknown) => {
      const { targetId } = JobFinderSourceDebugActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const requestId = parseOptionalRequestId(payload);
      const snapshot = await jobFinderWorkspaceService.runSourceDebug(
        targetId,
        undefined,
        requestId
          ? (progressEvent) => {
              event.sender.send(
                `job-finder:source-debug-progress:${requestId}`,
                SourceDebugProgressEventSchema.parse(progressEvent),
              );
            }
          : undefined,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:cancel-source-debug",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderSourceDebugRunQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.cancelSourceDebug(runId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:get-source-debug-run",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderSourceDebugRunQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const run = await jobFinderWorkspaceService.getSourceDebugRun(runId);

      return SourceDebugRunRecordSchema.parse(run);
    },
  );

  ipcMain.handle(
    "job-finder:get-source-debug-run-details",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderSourceDebugRunQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const details =
        await jobFinderWorkspaceService.getSourceDebugRunDetails(runId);

      return SourceDebugRunDetailsSchema.parse(details);
    },
  );

  ipcMain.handle(
    "job-finder:save-source-instruction-artifact",
    async (_event, payload: unknown) => {
      const { targetId, artifact } =
        JobFinderSaveSourceInstructionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.saveSourceInstructionArtifact(
          targetId,
          artifact,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:list-source-debug-runs",
    async (_event, payload: unknown) => {
      const { targetId } = JobFinderSourceDebugActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const runs =
        await jobFinderWorkspaceService.listSourceDebugRuns(targetId);

      return SourceDebugRunRecordSchema.array().parse(runs);
    },
  );

  ipcMain.handle(
    "job-finder:accept-source-instruction-draft",
    async (_event, payload: unknown) => {
      const { targetId, instructionId } =
        JobFinderSourceInstructionActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.acceptSourceInstructionDraft(
          targetId,
          instructionId,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:verify-source-instructions",
    async (_event, payload: unknown) => {
      const { targetId, instructionId } =
        JobFinderSourceInstructionActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.verifySourceInstructions(
        targetId,
        instructionId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:queue-job-for-review",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.queueJobForReview(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:set-job-resume-application-mode",
    async (_event, payload: unknown) => {
      const { jobId, resumeApplicationMode } =
        JobFinderJobResumeApplicationModeInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.setJobResumeApplicationMode(
          jobId,
          resumeApplicationMode,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:remove-job-from-review",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.removeJobFromReview(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:preview-employer-exclusion",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      return EmployerExclusionPreviewSchema.parse(
        await jobFinderWorkspaceService.previewEmployerExclusion(jobId),
      );
    },
  );

  ipcMain.handle(
    "job-finder:remove-employer-exclusion",
    async (_event, payload: unknown) => {
      const input = RemoveEmployerExclusionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      return workspaceMutationResponse(
        await jobFinderWorkspaceService.removeEmployerExclusion(input),
      );
    },
  );

  ipcMain.handle(
    "job-finder:dismiss-discovery-job",
    async (_event, payload: unknown) => {
      const input = JobFinderDismissDiscoveryJobInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.dismissDiscoveryJob(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:restore-dismissed-discovery-job",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.restoreDismissedDiscoveryJob(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:get-apply-run-details",
    async (_event, payload: unknown) => {
      const { runId, jobId, applicationRecordId } =
        JobFinderApplyRunDetailsQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const details = await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
        applicationRecordId,
      );

      return ApplyRunDetailsSchema.parse(details);
    },
  );

  ipcMain.handle(
    "job-finder:save-application-answer",
    async (_event, payload: unknown) => {
      const command = SaveApplicationAnswerCommandSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      return ApplyRunDetailsSchema.parse(
        await jobFinderWorkspaceService.saveApplicationAnswer(command),
      );
    },
  );

  ipcMain.handle(
    "job-finder:clear-application-answer",
    async (_event, payload: unknown) => {
      const command = ClearApplicationAnswerCommandSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      return ApplyRunDetailsSchema.parse(
        await jobFinderWorkspaceService.clearApplicationAnswer(command),
      );
    },
  );

  ipcMain.handle(
    "job-finder:project-grouped-manual-answer",
    async (_event, payload: unknown) => {
      const command = ProjectGroupedManualAnswerCommandSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.projectGroupedManualAnswer(command);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-grouped-manual-answer",
    async (_event, payload: unknown) => {
      const input = ApplyGroupedManualAnswerInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyGroupedManualAnswer(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:snooze-grouped-decision",
    async (_event, payload: unknown) => {
      const input = SnoozeGroupedDecisionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.snoozeGroupedDecision(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:export-application-packet",
    async (event, payload: unknown) => {
      const { runId, jobId, applicationRecordId } =
        JobFinderApplyRunDetailsQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const packet = ApplicationPacketSchema.parse(
        await jobFinderWorkspaceService.buildApplicationPacket(
          runId,
          jobId,
          applicationRecordId,
        ),
      );

      if (isDesktopTestApiEnabled()) {
        return JobFinderApplicationPacketExportResultSchema.parse({
          status: "cancelled",
        });
      }

      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      const saveDialogOptions: SaveDialogOptions = {
        defaultPath: buildApplicationPacketExportDefaultPath(
          packet.job.title,
          packet.job.company,
        ),
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: "Export application packet",
      };
      const saveResult = browserWindow
        ? await dialog.showSaveDialog(browserWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions);

      if (saveResult.canceled || !saveResult.filePath) {
        return JobFinderApplicationPacketExportResultSchema.parse({
          status: "cancelled",
        });
      }

      const outputPath = saveResult.filePath.toLowerCase().endsWith(".json")
        ? saveResult.filePath
        : `${saveResult.filePath}.json`;
      await writeFile(
        outputPath,
        `${JSON.stringify(packet, null, 2)}\n`,
        "utf8",
      );

      return JobFinderApplicationPacketExportResultSchema.parse({
        status: "saved",
      });
    },
  );
  ipcMain.handle(
    "job-finder:mutate-application-crm",
    async (_event, payload: unknown) => {
      const input = ApplicationCrmMutationInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.mutateApplicationCrm(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:mutate-application-crm-bulk-stage",
    async (_event, payload: unknown) => {
      const input = ApplicationCrmBulkStageMutationInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.mutateApplicationCrmBulkStage(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:run-application-no-response-automation",
    async (_event, payload: unknown) => {
      const settings = ApplicationCrmSettingsSchema.optional().parse(
        payload ?? undefined,
      );
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.runApplicationNoResponseAutomation(
          settings,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:export-application-crm",
    async (event, payload: unknown) => {
      const input = ApplicationCrmExportInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const exportResult =
        await jobFinderWorkspaceService.exportApplicationCrm(input);

      if (isDesktopTestApiEnabled()) {
        return ApplicationCrmFileExportResultSchema.parse({
          status: "cancelled",
          exportedCount: exportResult.exportedCount,
          filePath: null,
        });
      }

      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      const saveDialogOptions: SaveDialogOptions = {
        defaultPath: path.join(app.getPath("documents"), exportResult.fileName),
        filters: [
          {
            name: exportResult.format === "json" ? "JSON" : "CSV",
            extensions: [exportResult.format],
          },
        ],
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: "Export application CRM",
      };
      const saveResult = browserWindow
        ? await dialog.showSaveDialog(browserWindow, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions);

      if (saveResult.canceled || !saveResult.filePath) {
        return ApplicationCrmFileExportResultSchema.parse({
          status: "cancelled",
          exportedCount: exportResult.exportedCount,
          filePath: null,
        });
      }

      const outputPath = saveResult.filePath
        .toLowerCase()
        .endsWith(`.${exportResult.format}`)
        ? saveResult.filePath
        : `${saveResult.filePath}.${exportResult.format}`;
      await writeFile(outputPath, exportResult.content, {
        encoding: "utf8",
        mode: 0o600,
      });

      return ApplicationCrmFileExportResultSchema.parse({
        status: "saved",
        exportedCount: exportResult.exportedCount,
        filePath: outputPath,
      });
    },
  );
  ipcMain.handle("job-finder:export-diagnostics", async (event) => {
    const service = await getJobFinderWorkspaceService();
    const { performance, workspace } =
      await collectJobFinderPerformanceSnapshot({ service });
    const diagnostic = buildJobFinderDiagnosticExport({
      workspace,
      performance,
      build: {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron ?? "unknown",
        chromiumVersion: process.versions.chrome ?? "unknown",
        nodeVersion: process.versions.node,
        platform:
          process.platform === "win32" ||
          process.platform === "darwin" ||
          process.platform === "linux"
            ? process.platform
            : "linux",
        architecture:
          process.arch === "x64" ||
          process.arch === "arm64" ||
          process.arch === "ia32"
            ? process.arch
            : "x64",
      },
    });
    if (isDesktopTestApiEnabled()) {
      return JobFinderDiagnosticExportResultSchema.parse({
        status: "cancelled",
      });
    }
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: SaveDialogOptions = {
      defaultPath: "unemployed-job-finder-diagnostics.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
      title: "Export Job Finder diagnostics",
    };
    const saveResult = browserWindow
      ? await dialog.showSaveDialog(browserWindow, options)
      : await dialog.showSaveDialog(options);
    if (saveResult.canceled || !saveResult.filePath) {
      return JobFinderDiagnosticExportResultSchema.parse({
        status: "cancelled",
      });
    }
    const outputPath = saveResult.filePath.toLowerCase().endsWith(".json")
      ? saveResult.filePath
      : saveResult.filePath + ".json";
    await writeFile(
      outputPath,
      JSON.stringify(
        JobFinderDiagnosticExportSchema.parse(diagnostic),
        null,
        2,
      ) + "\n",
      "utf8",
    );
    return JobFinderDiagnosticExportResultSchema.parse({ status: "saved" });
  });
  ipcMain.handle(
    "job-finder:get-resume-workspace",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderResumeWorkspaceQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const workspace =
        await jobFinderWorkspaceService.getResumeWorkspace(jobId);

      return JobFinderResumeWorkspaceSchema.parse(workspace);
    },
  );

  ipcMain.handle(
    "job-finder:preview-resume-draft",
    async (event, payload: unknown) => {
      const { draft, requestId } =
        JobFinderPreviewResumeDraftInputSchema.parse(payload);
      const previousRequest = activeResumePreviewRequests.get(event.sender);
      previousRequest?.controller.abort();
      const request = {
        requestId,
        controller: new AbortController(),
      };
      activeResumePreviewRequests.set(event.sender, request);

      const assertCurrentRequest = () => {
        throwIfResumePreviewAborted(request.controller.signal);
        if (activeResumePreviewRequests.get(event.sender) !== request) {
          throw new DOMException(
            `Resume preview request '${request.requestId}' was superseded.`,
            "AbortError",
          );
        }
      };

      try {
        assertCurrentRequest();
        const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
        assertCurrentRequest();
        const preview = await jobFinderWorkspaceService.previewResumeDraft(
          draft,
          request.controller.signal,
        );
        assertCurrentRequest();

        return JobFinderResumePreviewSchema.parse(preview);
      } finally {
        if (activeResumePreviewRequests.get(event.sender) === request) {
          activeResumePreviewRequests.delete(event.sender);
        }
      }
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:save-resume-draft",
    async (_event, payload: unknown) => {
      const { draft } = JobFinderSaveResumeDraftInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveResumeDraft(draft);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:restore-resume-draft-revision",
    async (_event, payload: unknown) => {
      const { jobId, revisionId } =
        JobFinderRestoreResumeDraftRevisionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.restoreResumeDraftRevision(
          jobId,
          revisionId,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:regenerate-resume-draft",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.regenerateResumeDraft(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:regenerate-resume-section",
    async (_event, payload: unknown) => {
      const { jobId, sectionId } =
        JobFinderResumeSectionActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.regenerateResumeSection(
        jobId,
        sectionId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:export-resume-pdf",
    async (event, payload: unknown) => {
      const { intent, jobId } =
        JobFinderExportResumePdfInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      let outputPath: string | null = null;

      if (intent === "download" && !isDesktopTestApiEnabled()) {
        const workspace =
          await jobFinderWorkspaceService.getResumeWorkspace(jobId);
        const browserWindow = BrowserWindow.fromWebContents(event.sender);
        const saveDialogOptions: SaveDialogOptions = {
          defaultPath: buildResumeExportDefaultPath(
            workspace.job.title,
            workspace.job.company,
          ),
          filters: [
            {
              name: "PDF",
              extensions: ["pdf"],
            },
          ],
          properties: ["createDirectory", "showOverwriteConfirmation"],
          title: "Export tailored resume PDF",
        };
        const saveResult = browserWindow
          ? await dialog.showSaveDialog(browserWindow, saveDialogOptions)
          : await dialog.showSaveDialog(saveDialogOptions);

        if (saveResult.canceled || !saveResult.filePath) {
          const snapshot =
            await jobFinderWorkspaceService.getWorkspaceSnapshot();

          return workspaceMutationResponse(snapshot);
        }

        outputPath = saveResult.filePath.toLowerCase().endsWith(".pdf")
          ? saveResult.filePath
          : `${saveResult.filePath}.pdf`;
      }

      const snapshot = await jobFinderWorkspaceService.exportResumePdf(
        jobId,
        outputPath,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:approve-resume",
    async (_event, payload: unknown) => {
      const { jobId, exportId } =
        JobFinderApproveResumeInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.approveResume(
        jobId,
        exportId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:clear-resume-approval",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.clearResumeApproval(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:set-work-history-review-acknowledgment",
    async (_event, payload: unknown) => {
      const input =
        JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.setWorkHistoryReviewAcknowledgment(
          input,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:set-resume-claim-confirmation",
    async (_event, payload: unknown) => {
      const input =
        JobFinderSetResumeClaimConfirmationInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.setResumeClaimConfirmation(input);

      return workspaceMutationResponse(snapshot);
    },
  );

  handleJobFinderSaveRoute(
    "job-finder:apply-resume-patch",
    async (_event, payload: unknown) => {
      const { patch, revisionReason } =
        JobFinderApplyResumePatchInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.applyResumePatch(
        patch,
        revisionReason,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:get-resume-assistant-messages",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderResumeWorkspaceQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const messages =
        await jobFinderWorkspaceService.getResumeAssistantMessages(jobId);

      return JobFinderResumeWorkspaceSchema.shape.assistantMessages.parse(
        messages,
      );
    },
  );

  ipcMain.handle(
    "job-finder:send-resume-assistant-message",
    async (_event, payload: unknown) => {
      const { jobId, content } =
        JobFinderResumeAssistantMessageInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const messages =
        await jobFinderWorkspaceService.sendResumeAssistantMessage(
          jobId,
          content,
        );

      return JobFinderResumeWorkspaceSchema.shape.assistantMessages.parse(
        messages,
      );
    },
  );

  ipcMain.handle(
    "job-finder:resolve-resume-assistant-proposal",
    async (_event, payload: unknown) => {
      const { jobId, proposalId, action, patchIds } =
        JobFinderResolveResumeAssistantProposalInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const messages =
        await jobFinderWorkspaceService.resolveResumeAssistantProposal(
          jobId,
          proposalId,
          action,
          patchIds,
        );

      return JobFinderResumeWorkspaceSchema.shape.assistantMessages.parse(
        messages,
      );
    },
  );

  ipcMain.handle(
    "job-finder:generate-resume",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.generateResume(jobId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-apply-copilot-run",
    async (_event, payload: unknown) => {
      const {
        jobId,
        applicationRecordId,
        startNewApplication,
        visualCheckpointsEnabled,
      } = JobFinderApplyCopilotActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.startApplyCopilotRun(
        jobId,
        {
          visualCheckpointsEnabled,
        },
        startNewApplication ? null : applicationRecordId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-auto-apply-run",
    async (_event, payload: unknown) => {
      const { jobId, applicationRecordId, startNewApplication } =
        JobFinderApplicationStartTargetSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.startAutoApplyRun(
        jobId,
        startNewApplication ? null : applicationRecordId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-auto-apply-queue-run",
    async (_event, payload: unknown) => {
      const { jobIds } = JobFinderApplyQueueActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.startAutoApplyQueueRun(jobIds);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:approve-apply-run",
    async (_event, payload: unknown) => {
      const { runId, jobId, applicationRecordId } =
        JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
        applicationRecordId,
      );
      const snapshot = await jobFinderWorkspaceService.approveApplyRun(runId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:cancel-apply-run",
    async (_event, payload: unknown) => {
      const { runId, jobId, applicationRecordId } =
        JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
        applicationRecordId,
      );
      const snapshot = await jobFinderWorkspaceService.cancelApplyRun(runId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:resolve-apply-consent-request",
    async (_event, payload: unknown) => {
      const { requestId, runId, jobId, applicationRecordId, action } =
        JobFinderApplyConsentActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const details = await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
        applicationRecordId,
      );
      if (
        !details.consentRequests.some((request) => request.id === requestId)
      ) {
        throw new Error(
          `Consent request '${requestId}' does not belong to the selected application record.`,
        );
      }
      const snapshot =
        await jobFinderWorkspaceService.resolveApplyConsentRequest(
          requestId,
          action,
        );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:revoke-apply-run-approval",
    async (_event, payload: unknown) => {
      const { runId, jobId, applicationRecordId } =
        JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
        applicationRecordId,
      );
      const snapshot =
        await jobFinderWorkspaceService.revokeApplyRunApproval(runId);

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:approve-apply",
    async (_event, payload: unknown) => {
      const { jobId, applicationRecordId, startNewApplication } =
        JobFinderApplicationStartTargetSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.approveApply(
        jobId,
        startNewApplication ? null : applicationRecordId,
      );

      return workspaceMutationResponse(snapshot);
    },
  );

  ipcMain.handle("job-finder:reset-workspace", async () => {
    return resetJobFinderWorkspace();
  });

  ipcMain.handle("job-finder:get-startup-reset-recovery", () =>
    JobFinderStartupResetRecoveryFactSchema.parse(
      getJobFinderStartupResetRecoveryFact(),
    ),
  );

  ipcMain.handle("job-finder:get-startup-database-recovery", async () =>
    JobFinderStartupDatabaseRecoveryFactSchema.parse(
      await getJobFinderStartupDatabaseRecoveryFact(),
    ),
  );

  ipcMain.handle(
    "job-finder:dismiss-startup-database-recovery-notice",
    async () =>
      JobFinderStartupDatabaseRecoveryFactSchema.parse(
        await dismissJobFinderStartupDatabaseRecoveryNotice(),
      ),
  );
}
