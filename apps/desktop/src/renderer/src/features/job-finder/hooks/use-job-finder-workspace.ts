import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderApplyConsentActionInput,
  JobFinderApplyQueueActionInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugProgressEvent,
} from "@unemployed/contracts";
import type { JobFinderShellActions } from "../lib/job-finder-types";

type JobFinderWorkspaceState =
  | { status: "loading" }
  | {
      status: "ready";
      actions: JobFinderShellActions;
      platform: "darwin" | "win32" | "linux";
      workspace: JobFinderWorkspaceSnapshot;
    }
  | { status: "error"; message: string };

export function useJobFinderWorkspace(): JobFinderWorkspaceState {
  const [workspaceState, setWorkspaceState] = useState<JobFinderWorkspaceState>(
    { status: "loading" },
  );

  const runWorkspaceAction = useCallback(
    async (action: () => Promise<JobFinderWorkspaceSnapshot>) => {
      const workspace = await action();

      setWorkspaceState((currentState) => {
        if (currentState.status !== "ready") {
          return currentState;
        }

        return {
          ...currentState,
          workspace,
        };
      });

      return workspace;
    },
    [],
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
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.checkBrowserSession(),
        ),
      approveApply: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.approveApply(jobId),
        ),
      dismissDiscoveryJob: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.dismissDiscoveryJob(jobId),
        ),
      getResumeWorkspace: (jobId: string) =>
        window.unemployed.jobFinder.getResumeWorkspace(jobId),
      saveResumeDraft: (draft: ResumeDraft) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.saveResumeDraft(draft)),
      regenerateResumeDraft: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.regenerateResumeDraft(jobId),
        ),
      regenerateResumeSection: (jobId: string, sectionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.regenerateResumeSection(jobId, sectionId),
        ),
      exportResumePdf: (jobId: string) =>
        runWorkspaceAction(() => window.unemployed.jobFinder.exportResumePdf(jobId)),
      approveResume: (jobId: string, exportId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.approveResume(jobId, exportId),
        ),
      clearResumeApproval: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.clearResumeApproval(jobId),
        ),
      applyResumePatch: (patch: ResumeDraftPatch, revisionReason?: string | null) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyResumePatch(patch, revisionReason),
        ),
      getResumeAssistantMessages: (jobId: string) =>
        window.unemployed.jobFinder.getResumeAssistantMessages(jobId),
      sendResumeAssistantMessage: (jobId: string, content: string) =>
        window.unemployed.jobFinder.sendResumeAssistantMessage(jobId, content),
      generateResume: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.generateResume(jobId),
        ),
      startApplyCopilotRun: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.startApplyCopilotRun(jobId),
        ),
      startAutoApplyRun: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.startAutoApplyRun(jobId),
        ),
      startAutoApplyQueueRun: (
        jobIds: JobFinderApplyQueueActionInput['jobIds'],
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
        action: JobFinderApplyConsentActionInput['action'],
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.resolveApplyConsentRequest(requestId, action),
        ),
      revokeApplyRunApproval: (runId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.revokeApplyRunApproval(runId),
        ),
      importResume: () =>
        runWorkspaceAction(() => window.unemployed.jobFinder.importResume()),
      queueJobForReview: (jobId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.queueJobForReview(jobId),
        ),
      refreshWorkspace: () =>
        runWorkspaceAction(() => window.unemployed.jobFinder.getWorkspace()),
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
        action: "confirm" | "dismiss" | "clear_value",
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyProfileSetupReviewAction(
            reviewItemId,
            action,
          ),
        ),
      sendProfileCopilotMessage: (
        content: string,
        context?: ProfileCopilotContext,
      ) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.sendProfileCopilotMessage(content, context),
        ),
      applyProfileCopilotPatchGroup: (patchGroupId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.applyProfileCopilotPatchGroup(patchGroupId),
        ),
      rejectProfileCopilotPatchGroup: (patchGroupId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.rejectProfileCopilotPatchGroup(patchGroupId),
        ),
      undoProfileRevision: (revisionId: string) =>
        runWorkspaceAction(() =>
          window.unemployed.jobFinder.undoProfileRevision(revisionId),
        ),
    }),
    [runWorkspaceAction],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [platformResponse, workspace] = await Promise.all([
          window.unemployed.ping(),
          window.unemployed.jobFinder.getWorkspace(),
        ]);

        if (!cancelled) {
          setWorkspaceState({
            status: "ready",
            actions,
            platform: platformResponse.platform,
            workspace,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load the Job Finder workspace.";

        if (!cancelled) {
          setWorkspaceState({ status: "error", message });
        }
      }
    }

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [actions]);

  return workspaceState;
}
