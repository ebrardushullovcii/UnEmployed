import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApplicationCrmBulkStageMutationInput,
  ApplicationCrmExportInput,
  ApplicationCrmMutationInput,
  ApplicationCrmSettings,
  ApplyGroupedManualAnswerInput,
  CandidateProfile,
  ClearApplicationAnswerCommandInput,
  CompanyIntelligenceMutationInput,
  DiscoveryActivityEvent,
  DiscoveryFeedbackReason,
  EditableSourceInstructionArtifact,
  JobFinderApplyConsentActionInput,
  JobFinderApplyCopilotActionInput,
  JobFinderApplyQueueActionInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobFinderWorkspaceEntityMutation,
  JobFinderWorkspaceSyncResult,
  JobSearchPreferences,
  RapidReviewMutationInput,
  RecommendResumeStrategyInput,
  RecordOutcomeInput,
  SafeguardMutationInput,
  ReviewCompanyMergeInput,
  SaveResumeStrategyInput,
  SaveCampaignRuleInput,
  SaveJobSearchCampaignInput,
  SelectResumeStrategyInput,
  SetCampaignResumeStrategyDefaultInput,
  SetCompanyPreferenceInput,
  SetJobFinderActivityControlInput,
  SetOutcomeSuggestionEnabledInput,
  WorkspaceRevision,
  ProfileCopilotContext,
  ProfileSetupReviewAction,
  ProfileSetupReviewActionOptions,
  ProfileSetupState,
  ProjectGroupedManualAnswerCommand,
  ResumeImportProgressEvent,
  ResumeApplicationMode,
  ResumeTimelineRepairAction,
  ResumeDraft,
  ResumeDraftPatch,
  SaveApplicationAnswerCommandInput,
  SnoozeGroupedDecisionInput,
  SourceDebugProgressEvent,
  UserActionCommandInput,
} from "@unemployed/contracts";
import type { JobFinderShellActions } from "../lib/job-finder-types";
import { applyJobFinderWorkspaceDelta } from "../../../pages/job-finder-workspace-delta";

type JobFinderWorkspaceState =
  | { status: "loading" }
  | {
      status: "ready";
      actions: JobFinderShellActions;
      platform: "darwin" | "win32" | "linux";
      resumeImportProgress: ResumeImportProgressEvent | null;
      workspace: JobFinderWorkspaceSnapshot;
    }
  | { status: "error"; message: string; retry: () => void };

function markJobFinderTiming(markName: string, startMarkName?: string) {
  const performanceApi = globalThis.performance;
  if (!performanceApi?.mark) {
    return;
  }

  performanceApi.mark(markName);
  if (startMarkName && performanceApi.measure) {
    try {
      performanceApi.measure(markName, startMarkName, markName);
    } catch {
      // Performance diagnostics must never affect workspace loading.
    }
  }
}

export function useJobFinderWorkspace(): JobFinderWorkspaceState {
  const [workspaceState, setWorkspaceState] = useState<JobFinderWorkspaceState>(
    { status: "loading" },
  );
  const [loadRequest, setLoadRequest] = useState(0);
  const performanceRunRef = useRef(0);
  const workspaceRef = useRef<JobFinderWorkspaceSnapshot | null>(null);
  const workspaceRevisionRef = useRef<WorkspaceRevision>(0);
  // A workspace action may finish after a newer action has already committed.
  // Keep the latest invocation authoritative so a slow IPC response cannot
  // restore an older snapshot or revision.
  const workspaceRequestSequenceRef = useRef(0);

  const beginWorkspaceRequest = useCallback(() => {
    workspaceRequestSequenceRef.current += 1;
    return workspaceRequestSequenceRef.current;
  }, []);

  const isCurrentWorkspaceRequest = useCallback((sequence: number) => {
    return workspaceRequestSequenceRef.current === sequence;
  }, []);

  const assertWorkspaceHydrated = useCallback(() => {
    if (workspaceRef.current?.hydration?.phase === "bootstrap") {
      throw new Error(
        "Job Finder is still finishing its initial load. Please wait a moment and try again.",
      );
    }
  }, []);

  const commitWorkspace = useCallback(
    (workspace: JobFinderWorkspaceSnapshot) => {
      workspaceRef.current = workspace;
      setWorkspaceState((currentState) =>
        currentState.status === "ready"
          ? { ...currentState, workspace }
          : currentState,
      );
    },
    [],
  );

  const runWorkspaceAction = useCallback(
    async (
      action: () => Promise<JobFinderWorkspaceSnapshot>,
      options?: { allowDuringBootstrap?: boolean },
    ) => {
      if (!options?.allowDuringBootstrap) {
        assertWorkspaceHydrated();
      }
      const sequence = beginWorkspaceRequest();
      const workspace = await action();
      if (!isCurrentWorkspaceRequest(sequence)) {
        return workspaceRef.current ?? workspace;
      }

      workspaceRevisionRef.current = 0;
      commitWorkspace(workspace);
      return workspace;
    },
    [
      assertWorkspaceHydrated,
      beginWorkspaceRequest,
      commitWorkspace,
      isCurrentWorkspaceRequest,
    ],
  );

  const commitWorkspaceSyncResult = useCallback(
    (
      result: JobFinderWorkspaceSyncResult,
      sequence: number,
    ): JobFinderWorkspaceSnapshot | null => {
      if (!isCurrentWorkspaceRequest(sequence)) {
        return workspaceRef.current;
      }

      if (result.kind === "snapshot") {
        workspaceRevisionRef.current = result.currentRevision;
        commitWorkspace(result.snapshot);
        return result.snapshot;
      }

      const workspace = workspaceRef.current;
      if (!workspace) {
        return null;
      }

      const applied = applyJobFinderWorkspaceDelta({
        revision: workspaceRevisionRef.current,
        workspace,
        delta: result.delta,
      });
      if (applied.status !== "applied") {
        return null;
      }

      workspaceRevisionRef.current = applied.revision;
      commitWorkspace(applied.workspace);
      return applied.workspace;
    },
    [commitWorkspace, isCurrentWorkspaceRequest],
  );

  const recoverFullWorkspaceOnce = useCallback(
    async (sequence?: number) => {
      const requestSequence = sequence ?? beginWorkspaceRequest();
      try {
        const result = await window.unemployed.jobFinder.syncWorkspace(null);
        if (result.kind === "snapshot") {
          if (!isCurrentWorkspaceRequest(requestSequence)) {
            return workspaceRef.current ?? result.snapshot;
          }

          workspaceRevisionRef.current = result.currentRevision;
          commitWorkspace(result.snapshot);
          return result.snapshot;
        }
      } catch {
        // Older preload builds still use the existing full-snapshot fallback.
      }

      const workspace = await window.unemployed.jobFinder.getWorkspace();
      if (!isCurrentWorkspaceRequest(requestSequence)) {
        return workspaceRef.current ?? workspace;
      }

      workspaceRevisionRef.current = 0;
      commitWorkspace(workspace);
      return workspace;
    },
    [beginWorkspaceRequest, commitWorkspace, isCurrentWorkspaceRequest],
  );

  const syncWorkspace = useCallback(async () => {
    const sequence = beginWorkspaceRequest();
    const baseRevision = workspaceRevisionRef.current || null;
    let result: JobFinderWorkspaceSyncResult;
    try {
      result = await window.unemployed.jobFinder.syncWorkspace(baseRevision);
    } catch {
      return recoverFullWorkspaceOnce(sequence);
    }

    return (
      commitWorkspaceSyncResult(result, sequence) ??
      (await recoverFullWorkspaceOnce(sequence))
    );
  }, [
    beginWorkspaceRequest,
    commitWorkspaceSyncResult,
    recoverFullWorkspaceOnce,
  ]);

  const runWorkspaceEntityMutation = useCallback(
    async (mutation: JobFinderWorkspaceEntityMutation) => {
      assertWorkspaceHydrated();
      const sequence = beginWorkspaceRequest();
      const baseRevision = workspaceRevisionRef.current || null;
      const result = await window.unemployed.jobFinder.mutateWorkspaceEntities({
        baseRevision,
        mutation,
      });

      return (
        commitWorkspaceSyncResult(result, sequence) ??
        (await recoverFullWorkspaceOnce(sequence))
      );
    },
    [
      beginWorkspaceRequest,
      commitWorkspaceSyncResult,
      recoverFullWorkspaceOnce,
      assertWorkspaceHydrated,
    ],
  );

  const actions = useMemo<JobFinderShellActions>(
    () => ({
      analyzeProfileFromResume: () =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.analyzeProfileFromResume(),
        ),
      openBrowserSession: (input?: JobFinderOpenBrowserSessionInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.openBrowserSession(input),
        ),
      checkBrowserSession: () =>
        runWorkspaceAction(
          () => window.unemployed.jobFinder.checkBrowserSession(),
          { allowDuringBootstrap: true },
        ),
      performUserAction: (command: UserActionCommandInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.performUserAction(command),
        ),
      approveApply: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.approveApply(jobId),
        ),
      dismissDiscoveryJob: (
        jobId: string,
        reasons: readonly DiscoveryFeedbackReason[],
      ) =>
        runWorkspaceEntityMutation({
          type: "dismiss_discovery_job",
          jobId,
          reasons: [...reasons],
        }),
      restoreDismissedDiscoveryJob: (jobId: string) =>
        runWorkspaceEntityMutation({
          type: "restore_dismissed_discovery_job",
          jobId,
        }),
      removeJobFromReview: (jobId: string) =>
        runWorkspaceEntityMutation({
          type: "remove_job_from_review",
          jobId,
        }),
      getResumeWorkspace: (jobId: string) =>
        window.unemployed.jobFinder.getResumeWorkspace(jobId),
      previewResumeDraft: (draft: ResumeDraft, requestId?: string) =>
        window.unemployed.jobFinder.previewResumeDraft(draft, requestId),
      saveResumeDraft: (draft: ResumeDraft) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveResumeDraft(draft),
        ),
      regenerateResumeDraft: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.regenerateResumeDraft(jobId),
        ),
      regenerateResumeSection: (jobId: string, sectionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.regenerateResumeSection(jobId, sectionId),
        ),
      restoreResumeDraftRevision: (jobId: string, revisionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.restoreResumeDraftRevision(
            jobId,
            revisionId,
          ),
        ),
      exportResumePdf: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.exportResumePdf(jobId),
        ),
      approveResume: (jobId: string, exportId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.approveResume(jobId, exportId),
        ),
      clearResumeApproval: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.clearResumeApproval(jobId),
        ),
      applyResumePatch: (
        patch: ResumeDraftPatch,
        revisionReason?: string | null,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyResumePatch(patch, revisionReason),
        ),
      getResumeAssistantMessages: (jobId: string) =>
        window.unemployed.jobFinder.getResumeAssistantMessages(jobId),
      sendResumeAssistantMessage: (jobId: string, content: string) =>
        window.unemployed.jobFinder.sendResumeAssistantMessage(jobId, content),
      resolveResumeAssistantProposal: (
        jobId: string,
        proposalId: string,
        action: "accept" | "reject",
        patchIds: readonly string[],
      ) =>
        window.unemployed.jobFinder.resolveResumeAssistantProposal(
          jobId,
          proposalId,
          action,
          patchIds,
        ),
      generateResume: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.generateResume(jobId),
        ),
      startApplyCopilotRun: (
        jobId: string,
        options?: Pick<
          JobFinderApplyCopilotActionInput,
          "visualCheckpointsEnabled"
        >,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.startApplyCopilotRun(jobId, options),
        ),
      startAutoApplyRun: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.startAutoApplyRun(jobId),
        ),
      startAutoApplyQueueRun: (
        jobIds: JobFinderApplyQueueActionInput["jobIds"],
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.startAutoApplyQueueRun(jobIds),
        ),
      approveApplyRun: (runId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.approveApplyRun(runId),
        ),
      cancelApplyRun: (runId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.cancelApplyRun(runId),
        ),
      resolveApplyConsentRequest: (
        requestId: string,
        action: JobFinderApplyConsentActionInput["action"],
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.resolveApplyConsentRequest(
            requestId,
            action,
          ),
        ),
      revokeApplyRunApproval: (runId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.revokeApplyRunApproval(runId),
        ),
      mutateApplicationCrm: (input: ApplicationCrmMutationInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.mutateApplicationCrm(input),
        ),
      mutateApplicationCrmBulkStage: (
        input: ApplicationCrmBulkStageMutationInput,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.mutateApplicationCrmBulkStage(input),
        ),
      runApplicationNoResponseAutomation: (settings?: ApplicationCrmSettings) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.runApplicationNoResponseAutomation(
            settings,
          ),
        ),
      exportApplicationCrm: (input: ApplicationCrmExportInput) =>
        window.unemployed.jobFinder.exportApplicationCrm(input),
      importResume: () => {
        setWorkspaceState((currentState) =>
          currentState.status === "ready"
            ? { ...currentState, resumeImportProgress: null }
            : currentState,
        );
        return runWorkspaceAction(() =>
          window.unemployed.jobFinder.importResume((progress) => {
            setWorkspaceState((currentState) =>
              currentState.status === "ready"
                ? { ...currentState, resumeImportProgress: progress }
                : currentState,
            );
          }),
        );
      },
      queueJobForReview: (jobId: string) =>
        runWorkspaceEntityMutation({
          type: "queue_job_for_review",
          jobId,
        }),
      setJobResumeApplicationMode: (
        jobId: string,
        resumeApplicationMode: ResumeApplicationMode,
      ) =>
        runWorkspaceEntityMutation({
          type: "set_job_resume_application_mode",
          jobId,
          resumeApplicationMode,
        }),
      refreshWorkspace: syncWorkspace,
      resetWorkspace: () =>
        runWorkspaceAction(() => window.unemployed.jobFinder.resetWorkspace()),
      runAgentDiscovery: (
        onProgress?: (event: DiscoveryActivityEvent) => void,
        targetId?: string,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.runAgentDiscovery(onProgress, targetId),
        ),
      runSourceDebug: (
        targetId: string,
        onProgress?: (event: SourceDebugProgressEvent) => void,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.runSourceDebug(targetId, onProgress),
        ),
      getSourceDebugRunDetails: (runId: string) =>
        window.unemployed.jobFinder.getSourceDebugRunDetails(runId),
      getApplyRunDetails: (runId: string, jobId: string) =>
        window.unemployed.jobFinder.getApplyRunDetails(runId, jobId),
      saveApplicationAnswer: (command: SaveApplicationAnswerCommandInput) =>
        window.unemployed.jobFinder.saveApplicationAnswer(command),
      clearApplicationAnswer: (command: ClearApplicationAnswerCommandInput) =>
        window.unemployed.jobFinder.clearApplicationAnswer(command),
      projectGroupedManualAnswer: (
        command: ProjectGroupedManualAnswerCommand,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.projectGroupedManualAnswer(command),
        ),
      applyGroupedManualAnswer: (input: ApplyGroupedManualAnswerInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyGroupedManualAnswer(input),
        ),
      snoozeGroupedDecision: (input: SnoozeGroupedDecisionInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.snoozeGroupedDecision(input),
        ),
      exportApplicationPacket: (runId: string, jobId: string) =>
        window.unemployed.jobFinder.exportApplicationPacket(runId, jobId),
      saveSourceInstructionArtifact: (
        targetId: string,
        artifact: EditableSourceInstructionArtifact,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveSourceInstructionArtifact(
            targetId,
            artifact,
          ),
        ),
      acceptSourceInstructionDraft: (targetId: string, instructionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.acceptSourceInstructionDraft(
            targetId,
            instructionId,
          ),
        ),
      verifySourceInstructions: (targetId: string, instructionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.verifySourceInstructions(
            targetId,
            instructionId,
          ),
        ),
      saveProfile: (profile: CandidateProfile) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveProfile(profile),
        ),
      saveWorkspaceInputs: (
        profile: CandidateProfile,
        searchPreferences: JobSearchPreferences,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveWorkspaceInputs(
            profile,
            searchPreferences,
          ),
        ),
      saveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveSearchPreferences(searchPreferences),
        ),
      saveCampaign: (campaign: SaveJobSearchCampaignInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveCampaign(campaign),
        ),
      selectCampaign: (campaignId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.selectCampaign(campaignId),
        ),
      runCampaignNow: (campaignId?: string | null) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.runCampaignNow(
            campaignId ? { campaignId } : undefined,
          ),
        ),
      markCampaignNotificationRead: (notificationId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.markCampaignNotificationRead(
            notificationId,
          ),
        ),
      markAllCampaignNotificationsRead: () =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.markAllCampaignNotificationsRead(),
        ),
      saveCampaignRule: (campaignId: string, rule: SaveCampaignRuleInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveCampaignRule(campaignId, rule),
        ),
      deleteCampaignRule: (campaignId: string, ruleId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.deleteCampaignRule(campaignId, ruleId),
        ),
      toggleCampaignRule: (
        campaignId: string,
        ruleId: string,
        enabled: boolean,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.toggleCampaignRule(
            campaignId,
            ruleId,
            enabled,
          ),
        ),
      projectCampaignRuleFunnel: (campaignId: string) =>
        window.unemployed.jobFinder.projectCampaignRuleFunnel(campaignId),
      setActivityControl: (input: SetJobFinderActivityControlInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.setActivityControl(input),
        ),
      mutateRapidReview: (input: RapidReviewMutationInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.mutateRapidReview(input),
        ),
      recordOutcome: (input: RecordOutcomeInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.recordOutcome(input),
        ),
      saveResumeStrategy: (input: SaveResumeStrategyInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveResumeStrategy(input),
        ),
      disableResumeStrategy: (strategyId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.disableResumeStrategy(strategyId),
        ),
      selectResumeStrategy: (input: SelectResumeStrategyInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.selectResumeStrategy(input),
        ),
      recommendResumeStrategy: (input: RecommendResumeStrategyInput) =>
        window.unemployed.jobFinder.recommendResumeStrategy(input),
      setCampaignResumeStrategyDefault: (
        input: SetCampaignResumeStrategyDefaultInput,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.setCampaignResumeStrategyDefault(input),
        ),
      refreshCompanyIntelligence: () =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.refreshCompanyIntelligence(),
        ),
      setCompanyPreference: (input: SetCompanyPreferenceInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.setCompanyPreference(input),
        ),
      reviewCompanyMerge: (input: ReviewCompanyMergeInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.reviewCompanyMerge(input),
        ),
      mutateCompanyIntelligence: (input: CompanyIntelligenceMutationInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.mutateCompanyIntelligence(input),
        ),
      setOutcomeSuggestionEnabled: (input: SetOutcomeSuggestionEnabledInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.setOutcomeSuggestionEnabled(input),
        ),
      mutateSafeguards: (input: SafeguardMutationInput) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.mutateSafeguards(input),
        ),
      saveSettings: (settings: JobFinderSettings) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveSettings(settings),
        ),
      saveProfileSetupState: (profileSetupState: ProfileSetupState) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.saveProfileSetupState(profileSetupState),
        ),
      applyProfileSetupReviewAction: (
        reviewItemId: string,
        action: ProfileSetupReviewAction,
        options?: ProfileSetupReviewActionOptions,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyProfileSetupReviewAction(
            reviewItemId,
            action,
            options,
          ),
        ),
      applyResumeTimelineRepairAction: (
        runId: string,
        proposalId: string,
        action: ResumeTimelineRepairAction,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyResumeTimelineRepairAction(
            runId,
            proposalId,
            action,
          ),
        ),
      sendProfileCopilotMessage: (
        content: string,
        context?: ProfileCopilotContext,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.sendProfileCopilotMessage(
            content,
            context,
          ),
        ),
      applyProfileCopilotPatchGroup: (patchGroupId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyProfileCopilotPatchGroup(
            patchGroupId,
          ),
        ),
      rejectProfileCopilotPatchGroup: (patchGroupId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.rejectProfileCopilotPatchGroup(
            patchGroupId,
          ),
        ),
      undoProfileRevision: (revisionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.undoProfileRevision(revisionId),
        ),
    }),
    [runWorkspaceAction, runWorkspaceEntityMutation, syncWorkspace],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      const performanceRunId = ++performanceRunRef.current;
      const performancePrefix = `job-finder:workspace:${performanceRunId}`;
      markJobFinderTiming(`${performancePrefix}:bootstrap:start`);

      try {
        const [platformResponse, bootstrap] = await Promise.all([
          window.unemployed.ping(),
          typeof window.unemployed.jobFinder.getWorkspaceBootstrap ===
          "function"
            ? window.unemployed.jobFinder.getWorkspaceBootstrap()
            : recoverFullWorkspaceOnce(),
        ]);

        if (!cancelled) {
          // Keep the bootstrap snapshot as the authoritative visible state
          // before deferred hydration begins. The hydration failure path uses
          // this identity check to report a real failure; without recording it
          // here, that error is silently discarded because the ref is still
          // null while the shell is already showing the bootstrap.
          workspaceRef.current = bootstrap;
          if (bootstrap.hydration?.phase === "bootstrap") {
            workspaceRevisionRef.current = 0;
          }
          setWorkspaceState({
            status: "ready",
            actions,
            platform: platformResponse.platform,
            resumeImportProgress: null,
            workspace: bootstrap,
          });
          markJobFinderTiming(
            `${performancePrefix}:bootstrap:ready`,
            `${performancePrefix}:bootstrap:start`,
          );
          markJobFinderTiming("job-finder:workspace:bootstrap:ready");
        }

        // Keep the shell responsive while the large collections hydrate. The
        // hydration request is fenced like every other workspace request so a
        // later user action can never be overwritten by a stale full snapshot.
        if (bootstrap.hydration?.phase === "bootstrap") {
          const hydrationSequence = beginWorkspaceRequest();
          markJobFinderTiming(`${performancePrefix}:hydration:start`);
          markJobFinderTiming("job-finder:workspace:hydration:start");
          void recoverFullWorkspaceOnce(hydrationSequence)
            .then((hydratedWorkspace) => {
              if (hydratedWorkspace?.hydration?.phase === "complete") {
                markJobFinderTiming(
                  `${performancePrefix}:hydration:complete`,
                  `${performancePrefix}:hydration:start`,
                );
                markJobFinderTiming("job-finder:workspace:hydration:complete");
              }
            })
            .catch((error) => {
              if (
                cancelled ||
                !isCurrentWorkspaceRequest(hydrationSequence) ||
                workspaceRef.current !== bootstrap
              ) {
                return;
              }

              const message =
                error instanceof Error
                  ? error.message
                  : "Unable to finish loading the Job Finder workspace.";
              setWorkspaceState({
                status: "error",
                message,
                retry: () => {
                  setWorkspaceState({ status: "loading" });
                  setLoadRequest((current) => current + 1);
                },
              });
            });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load the Job Finder workspace.";

        if (!cancelled) {
          setWorkspaceState({
            status: "error",
            message,
            retry: () => {
              setWorkspaceState({ status: "loading" });
              setLoadRequest((current) => current + 1);
            },
          });
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [
    actions,
    beginWorkspaceRequest,
    isCurrentWorkspaceRequest,
    loadRequest,
    recoverFullWorkspaceOnce,
  ]);

  return workspaceState;
}
