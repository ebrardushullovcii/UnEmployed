import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplyRunDetails,
  CandidateProfile,
  DesktopPlatformPing,
  EditableSourceInstructionArtifact,
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  InterviewExportFormat,
  InterviewExportResult,
  JobFinderInterviewFollowUpInput,
  InterviewHotkeyAction,
  InterviewOverlayMoveInput,
  InterviewAudioTranscriptionInput,
  InterviewCaptionFileReadInput,
  InterviewCaptionFileTextResult,
  InterviewClipboardTextResult,
  InterviewPrepArtifactFromCueInput,
  InterviewTranscriptAnnotationInput,
  InterviewTranscriptSegmentInput,
  InterviewWorkspaceSnapshot,
  SaveInterviewSetupInput,
  JobFinderApplyConsentActionInput,
  JobFinderApplyCopilotActionInput,
  JobFinderApplyQueueActionInput,
  JobFinderOpenBrowserSessionInput,
  ProfileCopilotContext,
  ProfileSetupReviewActionOptions,
  JobFinderPerformanceSnapshot,
  JobFinderResumePreview,
  ResumeQualityBenchmarkReport,
  ResumeQualityBenchmarkRequest,
  ResumeImportBenchmarkReport,
  ResumeImportBenchmarkCase,
  ResumeImportBenchmarkRequest,
  ResumeImportFieldCandidate,
  ResumeImportRun,
  ResumeDocumentBundle,
  JobFinderResumeWorkspace,
  JobFinderRepositoryState,
  JobFinderAgentDiscoveryActionInput,
  JobFinderSettings,
  ProfileSetupState,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugProgressEvent,
  SourceDebugRunRecord,
  SourceDebugRunDetails,
  SaveJobFinderWorkspaceInput,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { SYSTEM_THEME_CHANGE_EVENT } from "../shared/system-theme";

let activeAgentDiscoveryRequestId: string | null = null;
let activeSourceDebugRequestId: string | null = null;

const testApiEnabled =
  process.env.UNEMPLOYED_ENABLE_TEST_API === "1" ||
  process.env.UNEMPLOYED_ENABLE_TEST_API === "true";
const configuredSystemThemeOverride =
  process.env.UNEMPLOYED_TEST_SYSTEM_THEME === "dark" ||
  process.env.UNEMPLOYED_TEST_SYSTEM_THEME === "light"
    ? process.env.UNEMPLOYED_TEST_SYSTEM_THEME
    : null;
let currentSystemThemeOverride: "dark" | "light" | null =
  configuredSystemThemeOverride;

function applySystemThemeOverride(theme: "dark" | "light" | null) {
  currentSystemThemeOverride = theme;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SYSTEM_THEME_CHANGE_EVENT));
  }
}

function isSaveWorkspaceInputsPayload(
  profileOrInput: CandidateProfile | SaveJobFinderWorkspaceInput,
): profileOrInput is SaveJobFinderWorkspaceInput {
  return "profile" in profileOrInput && "searchPreferences" in profileOrInput;
}

function toSaveWorkspaceInputsPayload(
  profileOrInput: CandidateProfile | SaveJobFinderWorkspaceInput,
  searchPreferences?: JobSearchPreferences,
): SaveJobFinderWorkspaceInput {
  if (isSaveWorkspaceInputsPayload(profileOrInput)) {
    return profileOrInput;
  }

  if (!searchPreferences) {
    throw new Error(
      "Search preferences are required when saving workspace inputs.",
    );
  }

  return {
    profile: profileOrInput,
    searchPreferences,
  };
}

const desktopApi = {
  ping: () => ipcRenderer.invoke("system:ping") as Promise<DesktopPlatformPing>,
  window: {
    close: () => ipcRenderer.invoke("window:close") as Promise<{ ok: true }>,
    getControlsState: () =>
      ipcRenderer.invoke(
        "window:get-controls-state",
      ) as Promise<DesktopWindowControlsState>,
    onControlsStateChange: (
      listener: (state: DesktopWindowControlsState) => void,
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: DesktopWindowControlsState,
      ) => {
        listener(state);
      };

      ipcRenderer.on("window:controls-state-changed", handler);

      return () => {
        ipcRenderer.off("window:controls-state-changed", handler);
      };
    },
    minimize: () =>
      ipcRenderer.invoke(
        "window:minimize",
      ) as Promise<DesktopWindowControlsState>,
    toggleMaximize: () =>
      ipcRenderer.invoke(
        "window:toggle-maximize",
      ) as Promise<DesktopWindowControlsState>,
  },
  interviewHelper: {
    getWorkspace: () =>
      ipcRenderer.invoke(
        "interview-helper:get-workspace",
      ) as Promise<InterviewWorkspaceSnapshot>,
    saveSetup: (input: SaveInterviewSetupInput) =>
      ipcRenderer.invoke(
        "interview-helper:save-setup",
        input,
      ) as Promise<InterviewWorkspaceSnapshot>,
    runRehearsal: () =>
      ipcRenderer.invoke(
        "interview-helper:run-rehearsal",
      ) as Promise<InterviewWorkspaceSnapshot>,
    startSession: () =>
      ipcRenderer.invoke(
        "interview-helper:start-session",
      ) as Promise<InterviewWorkspaceSnapshot>,
    beginReconfiguration: () =>
      ipcRenderer.invoke(
        "interview-helper:begin-reconfiguration",
      ) as Promise<InterviewWorkspaceSnapshot>,
    finishReconfiguration: () =>
      ipcRenderer.invoke(
        "interview-helper:finish-reconfiguration",
      ) as Promise<InterviewWorkspaceSnapshot>,
    performAction: (action: InterviewHotkeyAction) =>
      ipcRenderer.invoke("interview-helper:perform-action", {
        action,
      }) as Promise<InterviewWorkspaceSnapshot>,
    moveOverlayWindow: (input: InterviewOverlayMoveInput) =>
      ipcRenderer.invoke(
        "interview-helper:move-overlay-window",
        input,
      ) as Promise<{ moved: boolean }>,
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke("interview-helper:delete-session", {
        sessionId,
      }) as Promise<InterviewWorkspaceSnapshot>,
    saveCueAsPrepArtifact: (input: InterviewPrepArtifactFromCueInput) =>
      ipcRenderer.invoke(
        "interview-helper:save-cue-as-prep-artifact",
        input,
      ) as Promise<InterviewWorkspaceSnapshot>,
    addTranscriptAnnotation: (input: InterviewTranscriptAnnotationInput) =>
      ipcRenderer.invoke(
        "interview-helper:add-transcript-annotation",
        input,
      ) as Promise<InterviewWorkspaceSnapshot>,
    addTranscriptSegment: (input: InterviewTranscriptSegmentInput) =>
      ipcRenderer.invoke(
        "interview-helper:add-transcript-segment",
        input,
      ) as Promise<InterviewWorkspaceSnapshot>,
    transcribeAudioChunk: (input: InterviewAudioTranscriptionInput) =>
      ipcRenderer.invoke(
        "interview-helper:transcribe-audio-chunk",
        input,
      ) as Promise<InterviewWorkspaceSnapshot>,
    verifyOverlayProtection: () =>
      ipcRenderer.invoke(
        "interview-helper:verify-overlay-protection",
      ) as Promise<InterviewWorkspaceSnapshot>,
    resetOverlayPreferences: () =>
      ipcRenderer.invoke(
        "interview-helper:reset-overlay-preferences",
      ) as Promise<InterviewWorkspaceSnapshot>,
    readClipboardText: () =>
      ipcRenderer.invoke(
        "interview-helper:read-clipboard-text",
      ) as Promise<InterviewClipboardTextResult>,
    selectCaptionFile: () =>
      ipcRenderer.invoke(
        "interview-helper:select-caption-file",
      ) as Promise<InterviewCaptionFileTextResult>,
    readCaptionFile: (input: InterviewCaptionFileReadInput) =>
      ipcRenderer.invoke(
        "interview-helper:read-caption-file",
        input,
      ) as Promise<InterviewCaptionFileTextResult>,
    exportSession: (
      sessionId: string,
      format: InterviewExportFormat = "markdown",
    ) =>
      ipcRenderer.invoke("interview-helper:export-session", {
        sessionId,
        format,
      }) as Promise<InterviewExportResult>,
    recordJobFinderFollowUp: (input: JobFinderInterviewFollowUpInput) =>
      ipcRenderer.invoke(
        "interview-helper:record-job-finder-follow-up",
        input,
      ) as Promise<JobFinderWorkspaceSnapshot>,
  },
  jobFinder: {
    getWorkspace: () =>
      ipcRenderer.invoke(
        "job-finder:get-workspace",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    openBrowserSession: (input?: JobFinderOpenBrowserSessionInput) =>
      ipcRenderer.invoke(
        "job-finder:open-browser-session",
        input ?? {},
      ) as Promise<JobFinderWorkspaceSnapshot>,
    checkBrowserSession: () =>
      ipcRenderer.invoke(
        "job-finder:check-browser-session",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    saveProfile: (profile: CandidateProfile) =>
      ipcRenderer.invoke(
        "job-finder:save-profile",
        profile,
      ) as Promise<JobFinderWorkspaceSnapshot>,
    saveWorkspaceInputs: (
      profileOrInput: CandidateProfile | SaveJobFinderWorkspaceInput,
      searchPreferences?: JobSearchPreferences,
    ) =>
      ipcRenderer.invoke(
        "job-finder:save-workspace-inputs",
        toSaveWorkspaceInputsPayload(profileOrInput, searchPreferences),
      ) as Promise<JobFinderWorkspaceSnapshot>,
    analyzeProfileFromResume: () =>
      ipcRenderer.invoke(
        "job-finder:analyze-profile-from-resume",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    saveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      ipcRenderer.invoke(
        "job-finder:save-search-preferences",
        searchPreferences,
      ) as Promise<JobFinderWorkspaceSnapshot>,
    saveSettings: (settings: JobFinderSettings) =>
      ipcRenderer.invoke(
        "job-finder:save-settings",
        settings,
      ) as Promise<JobFinderWorkspaceSnapshot>,
    saveProfileSetupState: (profileSetupState: ProfileSetupState) =>
      ipcRenderer.invoke(
        "job-finder:save-profile-setup-state",
        profileSetupState,
      ) as Promise<JobFinderWorkspaceSnapshot>,
    applyProfileSetupReviewAction: (
      reviewItemId: string,
      action: "confirm" | "dismiss" | "clear_value",
      options?: ProfileSetupReviewActionOptions,
    ) =>
      ipcRenderer.invoke("job-finder:apply-profile-setup-review-action", {
        reviewItemId,
        action,
        options,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    sendProfileCopilotMessage: (
      content: string,
      context?: ProfileCopilotContext,
    ) =>
      ipcRenderer.invoke("job-finder:send-profile-copilot-message", {
        content,
        context: context ?? { surface: "general" },
      }) as Promise<JobFinderWorkspaceSnapshot>,
    applyProfileCopilotPatchGroup: (patchGroupId: string) =>
      ipcRenderer.invoke("job-finder:apply-profile-copilot-patch-group", {
        patchGroupId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    rejectProfileCopilotPatchGroup: (patchGroupId: string) =>
      ipcRenderer.invoke("job-finder:reject-profile-copilot-patch-group", {
        patchGroupId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    undoProfileRevision: (revisionId: string) =>
      ipcRenderer.invoke("job-finder:undo-profile-revision", {
        revisionId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    importResume: () =>
      ipcRenderer.invoke(
        "job-finder:import-resume",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    runDiscovery: () =>
      ipcRenderer.invoke(
        "job-finder:run-discovery",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    runAgentDiscovery: (
      onActivity?: (event: DiscoveryActivityEvent) => void,
      targetId?: string,
    ) => {
      if (activeAgentDiscoveryRequestId) {
        return Promise.reject(new Error("Agent discovery is already running."));
      }

      const requestId = `agent_discovery_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const activityChannel = `job-finder:discovery-activity:${requestId}`;
      activeAgentDiscoveryRequestId = requestId;
      const activityHandler = onActivity
        ? (
            _event: Electron.IpcRendererEvent,
            event: DiscoveryActivityEvent,
          ) => {
            onActivity(event);
          }
        : null;

      if (activityHandler) {
        ipcRenderer.on(activityChannel, activityHandler);
      }

      const cleanup = () => {
        if (activityHandler) {
          ipcRenderer.off(activityChannel, activityHandler);
        }
        if (activeAgentDiscoveryRequestId === requestId) {
          activeAgentDiscoveryRequestId = null;
        }
      };

      const payload: JobFinderAgentDiscoveryActionInput = {
        requestId,
        targetId: targetId ?? null,
      };

      const promise = ipcRenderer
        .invoke("job-finder:run-agent-discovery", payload)
        .finally(cleanup) as Promise<JobFinderWorkspaceSnapshot>;

      return promise;
    },
    runSourceDebug: (
      targetId: string,
      onProgress?: (event: SourceDebugProgressEvent) => void,
    ) => {
      if (activeSourceDebugRequestId) {
        return Promise.reject(new Error("Source debug is already running."));
      }

      const requestId = `source_debug_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const progressChannel = `job-finder:source-debug-progress:${requestId}`;
      activeSourceDebugRequestId = requestId;
      const progressHandler = onProgress
        ? (
            _event: Electron.IpcRendererEvent,
            event: SourceDebugProgressEvent,
          ) => {
            onProgress(event);
          }
        : null;

      if (progressHandler) {
        ipcRenderer.on(progressChannel, progressHandler);
      }

      const cleanup = () => {
        if (progressHandler) {
          ipcRenderer.off(progressChannel, progressHandler);
        }
        if (activeSourceDebugRequestId === requestId) {
          activeSourceDebugRequestId = null;
        }
      };

      return ipcRenderer
        .invoke("job-finder:run-source-debug", {
          targetId,
          requestId,
        })
        .finally(cleanup) as Promise<JobFinderWorkspaceSnapshot>;
    },
    cancelSourceDebug: (runId: string) =>
      ipcRenderer.invoke("job-finder:cancel-source-debug", {
        runId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    getSourceDebugRun: (runId: string) =>
      ipcRenderer.invoke("job-finder:get-source-debug-run", {
        runId,
      }) as Promise<SourceDebugRunRecord>,
    getSourceDebugRunDetails: (runId: string) =>
      ipcRenderer.invoke("job-finder:get-source-debug-run-details", {
        runId,
      }) as Promise<SourceDebugRunDetails>,
    getApplyRunDetails: (runId: string, jobId: string) =>
      ipcRenderer.invoke("job-finder:get-apply-run-details", {
        runId,
        jobId,
      }) as Promise<ApplyRunDetails>,
    saveSourceInstructionArtifact: (
      targetId: string,
      artifact: EditableSourceInstructionArtifact,
    ) =>
      ipcRenderer.invoke("job-finder:save-source-instruction-artifact", {
        targetId,
        artifact,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    listSourceDebugRuns: (targetId: string) =>
      ipcRenderer.invoke("job-finder:list-source-debug-runs", {
        targetId,
      }) as Promise<readonly SourceDebugRunRecord[]>,
    acceptSourceInstructionDraft: (targetId: string, instructionId: string) =>
      ipcRenderer.invoke("job-finder:accept-source-instruction-draft", {
        targetId,
        instructionId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    verifySourceInstructions: (targetId: string, instructionId: string) =>
      ipcRenderer.invoke("job-finder:verify-source-instructions", {
        targetId,
        instructionId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    cancelAgentDiscovery: () => {
      if (!activeAgentDiscoveryRequestId) {
        return;
      }

      ipcRenderer.send("job-finder:cancel-agent-discovery", {
        requestId: activeAgentDiscoveryRequestId,
      });
    },
    resetWorkspace: () =>
      ipcRenderer.invoke(
        "job-finder:reset-workspace",
      ) as Promise<JobFinderWorkspaceSnapshot>,
    queueJobForReview: (jobId: string) =>
      ipcRenderer.invoke("job-finder:queue-job-for-review", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    removeJobFromReview: (jobId: string) =>
      ipcRenderer.invoke("job-finder:remove-job-from-review", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    dismissDiscoveryJob: (jobId: string) =>
      ipcRenderer.invoke("job-finder:dismiss-discovery-job", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    getResumeWorkspace: (jobId: string) =>
      ipcRenderer.invoke("job-finder:get-resume-workspace", {
        jobId,
      }) as Promise<JobFinderResumeWorkspace>,
    previewResumeDraft: (draft: ResumeDraft) =>
      ipcRenderer.invoke("job-finder:preview-resume-draft", {
        draft,
      }) as Promise<JobFinderResumePreview>,
    saveResumeDraft: (draft: ResumeDraft) =>
      ipcRenderer.invoke("job-finder:save-resume-draft", {
        draft,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    regenerateResumeDraft: (jobId: string) =>
      ipcRenderer.invoke("job-finder:regenerate-resume-draft", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    regenerateResumeSection: (jobId: string, sectionId: string) =>
      ipcRenderer.invoke("job-finder:regenerate-resume-section", {
        jobId,
        sectionId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    exportResumePdf: (jobId: string) =>
      ipcRenderer.invoke("job-finder:export-resume-pdf", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    approveResume: (jobId: string, exportId: string) =>
      ipcRenderer.invoke("job-finder:approve-resume", {
        jobId,
        exportId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    clearResumeApproval: (jobId: string) =>
      ipcRenderer.invoke("job-finder:clear-resume-approval", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    applyResumePatch: (
      patch: ResumeDraftPatch,
      revisionReason?: string | null,
    ) =>
      ipcRenderer.invoke("job-finder:apply-resume-patch", {
        patch,
        revisionReason: revisionReason ?? null,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    getResumeAssistantMessages: (jobId: string) =>
      ipcRenderer.invoke("job-finder:get-resume-assistant-messages", {
        jobId,
      }) as Promise<readonly ResumeAssistantMessage[]>,
    sendResumeAssistantMessage: (jobId: string, content: string) =>
      ipcRenderer.invoke("job-finder:send-resume-assistant-message", {
        jobId,
        content,
      }) as Promise<readonly ResumeAssistantMessage[]>,
    generateResume: (jobId: string) =>
      ipcRenderer.invoke("job-finder:generate-resume", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    startApplyCopilotRun: (
      jobId: string,
      options?: Pick<
        JobFinderApplyCopilotActionInput,
        "visualCheckpointsEnabled"
      >,
    ) =>
      ipcRenderer.invoke("job-finder:start-apply-copilot-run", {
        jobId,
        ...(options?.visualCheckpointsEnabled === true
          ? { visualCheckpointsEnabled: true }
          : {}),
      }) as Promise<JobFinderWorkspaceSnapshot>,
    startAutoApplyRun: (jobId: string) =>
      ipcRenderer.invoke("job-finder:start-auto-apply-run", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    startAutoApplyQueueRun: (
      jobIds: JobFinderApplyQueueActionInput["jobIds"],
    ) =>
      ipcRenderer.invoke("job-finder:start-auto-apply-queue-run", {
        jobIds,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    approveApplyRun: (runId: string) =>
      ipcRenderer.invoke("job-finder:approve-apply-run", {
        runId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    cancelApplyRun: (runId: string) =>
      ipcRenderer.invoke("job-finder:cancel-apply-run", {
        runId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    resolveApplyConsentRequest: (
      requestId: string,
      action: JobFinderApplyConsentActionInput["action"],
    ) =>
      ipcRenderer.invoke("job-finder:resolve-apply-consent-request", {
        requestId,
        action,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    revokeApplyRunApproval: (runId: string) =>
      ipcRenderer.invoke("job-finder:revoke-apply-run-approval", {
        runId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    approveApply: (jobId: string) =>
      ipcRenderer.invoke("job-finder:approve-apply", {
        jobId,
      }) as Promise<JobFinderWorkspaceSnapshot>,
    ...(testApiEnabled
      ? {
          test: {
            getSystemThemeOverride: () => currentSystemThemeOverride,
            setSystemThemeOverride: (theme: "dark" | "light" | null) =>
              Promise.resolve().then(() => {
                applySystemThemeOverride(theme);
                return { ok: true as const };
              }),
            setResumePreviewMode: (mode: "ok" | "fail_once") =>
              ipcRenderer.invoke(
                "job-finder:test-set-resume-preview-mode",
                mode,
              ) as Promise<{ ok: true }>,
            loadResumeWorkspaceDemo: () =>
              ipcRenderer.invoke(
                "job-finder:test-load-resume-workspace-demo",
              ) as Promise<JobFinderWorkspaceSnapshot>,
            loadApplyQueueDemo: () =>
              ipcRenderer.invoke(
                "job-finder:test-load-apply-queue-demo",
              ) as Promise<JobFinderWorkspaceSnapshot>,
            resetWorkspaceState: (state: JobFinderRepositoryState) =>
              ipcRenderer.invoke(
                "job-finder:test-reset-workspace-state",
                state,
              ) as Promise<JobFinderWorkspaceSnapshot>,
            getPerformanceSnapshot: () =>
              ipcRenderer.invoke(
                "job-finder:test-get-performance-snapshot",
              ) as Promise<JobFinderPerformanceSnapshot>,
            runResumeImportBenchmark: (
              input?: Partial<ResumeImportBenchmarkRequest>,
            ) =>
              ipcRenderer.invoke(
                "job-finder:test-run-resume-import-benchmark",
                input ?? {},
              ) as Promise<ResumeImportBenchmarkReport>,
            getResumeImportBenchmarkCases: () =>
              ipcRenderer.invoke(
                "job-finder:test-get-resume-import-benchmark-cases",
              ) as Promise<readonly ResumeImportBenchmarkCase[]>,
            getResumeImportState: () =>
              ipcRenderer.invoke(
                "job-finder:test-get-resume-import-state",
              ) as Promise<{
                resumeImportRuns: readonly ResumeImportRun[];
                resumeImportDocumentBundles: readonly ResumeDocumentBundle[];
                resumeImportFieldCandidates: readonly ResumeImportFieldCandidate[];
              }>,
            runResumeQualityBenchmark: (
              input?: Partial<ResumeQualityBenchmarkRequest>,
            ) =>
              ipcRenderer.invoke(
                "job-finder:test-run-resume-quality-benchmark",
                input ?? {},
              ) as Promise<ResumeQualityBenchmarkReport>,
            importResumeFromPath: (
              sourcePath: string | { sourcePath: string; useVision?: boolean },
            ) =>
              ipcRenderer.invoke("job-finder:test-import-resume-from-path", {
                ...(typeof sourcePath === "string"
                  ? { sourcePath }
                  : sourcePath),
              }) as Promise<JobFinderWorkspaceSnapshot>,
          },
        }
      : {}),
  },
};

contextBridge.exposeInMainWorld("unemployed", desktopApi);
