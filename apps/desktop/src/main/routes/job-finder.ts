import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import type { IpcMain, SaveDialogOptions } from "electron";
import {
  ApplyRunDetailsSchema,
  CandidateProfileSchema,
  DiscoveryActivityEventSchema,
  JobFinderAgentDiscoveryActionInputSchema,
  JobFinderApplyConsentActionInputSchema,
  JobFinderApplyQueueActionInputSchema,
  JobFinderApplyRunActionInputSchema,
  JobFinderApplyRunDetailsQuerySchema,
  JobFinderApplyResumePatchInputSchema,
  JobFinderApproveResumeInputSchema,
  JobFinderPreviewResumeDraftInputSchema,
  JobFinderProfileCopilotMessageInputSchema,
  JobFinderProfileCopilotPatchGroupActionInputSchema,
  JobFinderProfileSetupReviewActionInputSchema,
  JobFinderResumePreviewSchema,
  JobFinderResumeAssistantMessageInputSchema,
  JobFinderRepositoryStateSchema,
  ResumeQualityBenchmarkRequestSchema,
  ResumeImportBenchmarkRequestSchema,
  JobFinderResumeWorkspaceQuerySchema,
  JobFinderSaveResumeDraftInputSchema,
  JobFinderResumeWorkspaceSchema,
  JobFinderResumeSectionActionInputSchema,
  JobFinderJobActionInputSchema,
  JobFinderOpenBrowserSessionInputSchema,
  JobFinderPerformanceSnapshotSchema,
  JobFinderSaveSourceInstructionInputSchema,
  JobFinderSourceDebugActionInputSchema,
  JobFinderSourceDebugRunQuerySchema,
  JobFinderSourceInstructionActionInputSchema,
  JobFinderSettingsSchema,
  SaveJobFinderWorkspaceInputSchema,
  ProfileSetupStateSchema,
  SourceDebugProgressEventSchema,
  SourceDebugRunDetailsSchema,
  SourceDebugRunRecordSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  JobFinderUndoProfileRevisionInputSchema,
} from "@unemployed/contracts";
import {
  getDesktopTestDelayMs,
  getJobFinderWorkspaceService,
  importResumeFromSourcePath,
  isDesktopTestApiEnabled,
  loadApplyQueueDemoState,
  loadResumeWorkspaceDemoState,
  parseResumeImportPathPayload,
  resetJobFinderWorkspace,
  runDesktopResumeQualityBenchmark,
  runDesktopResumeImportBenchmark,
  setJobFinderWorkspaceServiceTestEnv,
} from "../services/job-finder";

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

export function registerJobFinderRouteHandlers(ipcMain: IpcMain) {
  ipcMain.handle("job-finder:get-workspace", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.getWorkspaceSnapshot();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle("job-finder:open-browser-session", async (_event, payload: unknown) => {
    const input = JobFinderOpenBrowserSessionInputSchema.parse(payload ?? {});
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.openBrowserSession(input);

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle("job-finder:check-browser-session", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.checkBrowserSession();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle(
    "job-finder:save-profile",
    async (_event, payload: unknown) => {
      const profile = CandidateProfileSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveProfile(profile);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle("job-finder:analyze-profile-from-resume", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.analyzeProfileFromResume();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle(
    "job-finder:save-search-preferences",
    async (_event, payload: unknown) => {
      const searchPreferences = JobSearchPreferencesSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.saveSearchPreferences(
          searchPreferences,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:save-profile-setup-state",
    async (_event, payload: unknown) => {
      const profileSetupState = ProfileSetupStateSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.saveProfileSetupState(
          profileSetupState,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-profile-setup-review-action",
    async (_event, payload: unknown) => {
      const { reviewItemId, action } =
        JobFinderProfileSetupReviewActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyProfileSetupReviewAction(
          reviewItemId,
          action,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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
      const snapshot =
        await jobFinderWorkspaceService.sendProfileCopilotMessage(
          content,
          context,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-profile-copilot-patch-group",
    async (_event, payload: unknown) => {
      const { patchGroupId } =
        JobFinderProfileCopilotPatchGroupActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.applyProfileCopilotPatchGroup(
          patchGroupId,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:save-settings",
    async (_event, payload: unknown) => {
      const settings = JobFinderSettingsSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveSettings(settings);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle("job-finder:import-resume", async () => {
    const selection = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Resume documents", extensions: ["pdf", "docx", "txt", "md"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();

    if (selection.canceled || selection.filePaths.length === 0) {
      return JobFinderWorkspaceSnapshotSchema.parse(
        await jobFinderWorkspaceService.getWorkspaceSnapshot(),
      );
    }

    const sourcePath = selection.filePaths[0];

    if (!sourcePath) {
      return JobFinderWorkspaceSnapshotSchema.parse(
        await jobFinderWorkspaceService.getWorkspaceSnapshot(),
      );
    }

    return importResumeFromSourcePath(sourcePath);
  });

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

  ipcMain.handle("job-finder:test-set-resume-preview-mode", async (_event, payload: unknown) => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const mode = payload === "fail_once" ? "fail_once" : "ok";
    await setJobFinderWorkspaceServiceTestEnv({
      UNEMPLOYED_TEST_RESUME_PREVIEW: mode,
    });

    return { ok: true as const };
  });

  ipcMain.handle("job-finder:test-load-apply-queue-demo", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const snapshot = await loadApplyQueueDemoState();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
  });

  ipcMain.handle("job-finder:test-get-performance-snapshot", async () => {
    if (!isDesktopTestApiEnabled()) {
      throw new Error(
        "Desktop test API is disabled. Set UNEMPLOYED_ENABLE_TEST_API=1 to enable scripted UI flows.",
      );
    }

    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const workspace = await jobFinderWorkspaceService.getWorkspaceSnapshot();
    const latestDiscoveryRun =
      workspace.activeDiscoveryRun ?? workspace.recentDiscoveryRuns[0] ?? null;
    const latestSourceDebugSummary =
      workspace.activeSourceDebugRun ??
      workspace.recentSourceDebugRuns[0] ??
      null;
    const latestSourceDebugRun = latestSourceDebugSummary
      ? await jobFinderWorkspaceService.getSourceDebugRunDetails(
          latestSourceDebugSummary.id,
        )
      : null;

    return JobFinderPerformanceSnapshotSchema.parse({
      generatedAt: new Date().toISOString(),
      latestDiscoveryRun,
      latestSourceDebugRun,
    });
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
      };

      return runDesktopResumeImportBenchmark(options);
    },
  );

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
        ...(parsed.canaryOnly !== undefined
          ? { canaryOnly: parsed.canaryOnly }
          : {}),
        ...(parsed.persistArtifactsDirectory !== undefined
          ? { persistArtifactsDirectory: parsed.persistArtifactsDirectory }
          : {}),
      };

      return runDesktopResumeQualityBenchmark(options);
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

      const { sourcePath } = parseResumeImportPathPayload(payload);
      return importResumeFromSourcePath(sourcePath);
    },
  );

  ipcMain.handle("job-finder:run-discovery", async () => {
    const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
    const snapshot = await jobFinderWorkspaceService.runDiscovery();

    return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

        return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[JobFinder] Agent discovery cancelled");
          // Return current workspace snapshot even on abort
          const currentSnapshot =
            await jobFinderWorkspaceService.getWorkspaceSnapshot();
          return JobFinderWorkspaceSnapshotSchema.parse(currentSnapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:cancel-source-debug",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderSourceDebugRunQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.cancelSourceDebug(runId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:queue-job-for-review",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.queueJobForReview(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:dismiss-discovery-job",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.dismissDiscoveryJob(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:get-apply-run-details",
    async (_event, payload: unknown) => {
      const { runId, jobId } =
        JobFinderApplyRunDetailsQuerySchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const details = await jobFinderWorkspaceService.getApplyRunDetails(
        runId,
        jobId,
      );

      return ApplyRunDetailsSchema.parse(details);
    },
  );

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
    async (_event, payload: unknown) => {
      const { draft } = JobFinderPreviewResumeDraftInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const preview = await jobFinderWorkspaceService.previewResumeDraft(draft);

      return JobFinderResumePreviewSchema.parse(preview);
    },
  );

  ipcMain.handle(
    "job-finder:save-resume-draft",
    async (_event, payload: unknown) => {
      const { draft } = JobFinderSaveResumeDraftInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.saveResumeDraft(draft);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:regenerate-resume-draft",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.regenerateResumeDraft(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:export-resume-pdf",
    async (event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      let outputPath: string | null = null;

      if (!isDesktopTestApiEnabled()) {
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

          return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
        }

        outputPath = saveResult.filePath.toLowerCase().endsWith(".pdf")
          ? saveResult.filePath
          : `${saveResult.filePath}.pdf`;
      }

      const snapshot = await jobFinderWorkspaceService.exportResumePdf(
        jobId,
        outputPath,
      );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:clear-resume-approval",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.clearResumeApproval(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:apply-resume-patch",
    async (_event, payload: unknown) => {
      const { patch, revisionReason } =
        JobFinderApplyResumePatchInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.applyResumePatch(
        patch,
        revisionReason,
      );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
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
    "job-finder:generate-resume",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.generateResume(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-apply-copilot-run",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.startApplyCopilotRun(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-auto-apply-run",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.startAutoApplyRun(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:start-auto-apply-queue-run",
    async (_event, payload: unknown) => {
      const { jobIds } = JobFinderApplyQueueActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.startAutoApplyQueueRun(jobIds);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:approve-apply-run",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.approveApplyRun(runId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:cancel-apply-run",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.cancelApplyRun(runId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:resolve-apply-consent-request",
    async (_event, payload: unknown) => {
      const { requestId, action } =
        JobFinderApplyConsentActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.resolveApplyConsentRequest(
          requestId,
          action,
        );

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:revoke-apply-run-approval",
    async (_event, payload: unknown) => {
      const { runId } = JobFinderApplyRunActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot =
        await jobFinderWorkspaceService.revokeApplyRunApproval(runId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle(
    "job-finder:approve-apply",
    async (_event, payload: unknown) => {
      const { jobId } = JobFinderJobActionInputSchema.parse(payload);
      const jobFinderWorkspaceService = await getJobFinderWorkspaceService();
      const snapshot = await jobFinderWorkspaceService.approveApply(jobId);

      return JobFinderWorkspaceSnapshotSchema.parse(snapshot);
    },
  );

  ipcMain.handle("job-finder:reset-workspace", async () => {
    return resetJobFinderWorkspace();
  });
}
