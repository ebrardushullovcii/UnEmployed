import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMain } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationPacketSchema,
  ApplicationCrmSettingsSchema,
  AppearanceThemeSchema,
  getDefaultCampaignConfiguration,
  DiscoveryRunRecordSchema,
  JobFinderProfileCopilotPatchGroupActionInputSchema,
  JobFinderResumePreviewSchema,
  JobFinderSetResumeClaimConfirmationInputSchema,
  JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema,
  JobFinderUndoProfileRevisionInputSchema,
  ResumeDraftSchema,
  JobFinderWorkspaceSnapshotSchema,
  MarkAllCampaignNotificationsReadInputSchema,
  MarkCampaignNotificationReadInputSchema,
  ResumeQualityBenchmarkReportSchema,
  SaveCampaignRuleRouteInputSchema,
  UpdateApplicationDefaultsInputSchema,
  UpdateWorkspaceBehaviorInputSchema,
  resumeClaimOwnershipStatement,
} from "@unemployed/contracts";
import { createEmptyJobFinderRepositoryState } from "../adapters/job-finder-initial-state";

type RegisteredHandler = (
  event: { sender: object },
  payload: unknown,
) => Promise<unknown>;

const {
  mockApplyGroupedManualAnswer,
  mockBuildApplicationPacket,
  mockDeleteCampaignRule,
  mockPreviewResumeDraft,
  mockGetWorkspaceBootstrap,
  mockGetWorkspaceSnapshot,
  mockGetJobFinderWorkspaceService,
  mockIsDesktopTestApiEnabled,
  mockMarkAllCampaignNotificationsRead,
  mockMarkCampaignNotificationRead,
  mockProjectCampaignRuleFunnel,
  mockProjectGroupedManualAnswer,
  mockProposeProfileCopilotChange,
  mockQueueJobForReview,
  mockRunCampaignNow,
  mockRunDesktopResumeQualityBenchmark,
  mockSaveCampaignRule,
  mockSetResumeClaimConfirmation,
  mockSetWorkHistoryReviewAcknowledgment,
  mockStartApplyCopilotRun,
  mockCancelApplyRun,
  mockGetApplyRunDetails,
  mockResolveApplyConsentRequest,
  mockShowSaveDialog,
  mockSnoozeGroupedDecision,
  mockToggleCampaignRule,
  mockUpdateAppearanceTheme,
  mockUpdateApplicationDefaults,
  mockUpdateTrackerCrm,
  mockUpdateWorkspaceBehavior,
} = vi.hoisted(() => ({
  mockApplyGroupedManualAnswer: vi.fn(),
  mockBuildApplicationPacket: vi.fn(),
  mockDeleteCampaignRule: vi.fn(),
  mockPreviewResumeDraft: vi.fn(),
  mockGetWorkspaceBootstrap: vi.fn(),
  mockGetWorkspaceSnapshot: vi.fn(),
  mockGetJobFinderWorkspaceService: vi.fn(),
  mockIsDesktopTestApiEnabled: vi.fn(() => false),
  mockMarkAllCampaignNotificationsRead: vi.fn(),
  mockMarkCampaignNotificationRead: vi.fn(),
  mockProjectCampaignRuleFunnel: vi.fn(),
  mockProjectGroupedManualAnswer: vi.fn(),
  mockProposeProfileCopilotChange: vi.fn(),
  mockQueueJobForReview: vi.fn(),
  mockRunCampaignNow: vi.fn(),
  mockRunDesktopResumeQualityBenchmark: vi.fn(),
  mockSaveCampaignRule: vi.fn(),
  mockSetResumeClaimConfirmation: vi.fn(),
  mockSetWorkHistoryReviewAcknowledgment: vi.fn(),
  mockStartApplyCopilotRun: vi.fn(),
  mockCancelApplyRun: vi.fn(),
  mockGetApplyRunDetails: vi.fn(),
  mockResolveApplyConsentRequest: vi.fn(),
  mockShowSaveDialog: vi.fn(),
  mockSnoozeGroupedDecision: vi.fn(),
  mockToggleCampaignRule: vi.fn(),
  mockUpdateAppearanceTheme: vi.fn(),
  mockUpdateApplicationDefaults: vi.fn(),
  mockUpdateTrackerCrm: vi.fn(),
  mockUpdateWorkspaceBehavior: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
  dialog: {
    showSaveDialog: mockShowSaveDialog,
  },
}));

vi.mock("../services/job-finder", () => ({
  defaultBenchmarkCases: [],
  getDesktopTestDelayMs: vi.fn(() => 0),
  getJobFinderWorkspaceService: mockGetJobFinderWorkspaceService,
  importResumeFromSourcePath: vi.fn(),
  isDesktopTestApiEnabled: mockIsDesktopTestApiEnabled,
  loadApplyQueueDemoState: vi.fn(),
  loadResumeWorkspaceDemoState: vi.fn(),
  parseResumeImportPathPayload: vi.fn(),
  resetJobFinderWorkspace: vi.fn(),
  runDesktopResumeImportBenchmark: vi.fn(),
  runDesktopResumeQualityBenchmark: mockRunDesktopResumeQualityBenchmark,
  setJobFinderWorkspaceServiceTestEnv: vi.fn(),
}));

import { registerJobFinderRouteHandlers } from "./job-finder";

const packet = ApplicationPacketSchema.parse({
  generatedAt: "2026-07-30T12:00:00.000Z",
  job: {
    id: "job-1",
    source: "target_site",
    title: "Senior Engineer",
    company: "Example",
    location: "Remote",
    listingDestination: {
      origin: "https://jobs.example.com",
      safePath: "/jobs/123",
    },
    applicationDestination: {
      origin: "https://apply.example.com",
      safePath: "/applications/123",
    },
    summary: "Build reliable systems.",
  },
  run: {
    id: "run-1",
    mode: "copilot",
    state: "paused_for_user_review",
  },
  result: {
    id: "result-1",
    applicationRecordId: "application-1",
    state: "awaiting_review",
    summary: "Prepared",
    detail: "Stopped before final submit.",
    blockerReason: null,
    blockerSummary: null,
    updatedAt: "2026-07-30T12:00:00.000Z",
  },
  resume: {
    source: "original_upload",
    sourceDocumentId: "document-1",
    exportArtifactId: null,
    fileName: "Original CV.pdf",
    sha256: null,
  },
  questions: [],
  consent: [],
  checkpoints: [],
  privacyReceipt: null,
  submissionOccurred: false,
});

describe("job-finder profile copilot patch-group routes", () => {
  const mockApplyProfileCopilotPatchGroup = vi.fn();
  const mockRejectProfileCopilotPatchGroup = vi.fn();
  const mockUndoProfileRevision = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndFindHandler(channel: string): RegisteredHandler {
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((registeredChannel: string, handler: RegisteredHandler) => {
        handlers.set(registeredChannel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(
        `Profile Copilot patch-group handler was not registered: ${channel}`,
      );
    }
    return handler;
  }

  it("forwards exact patch-group and revision IDs through apply, reject, and undo routes", async () => {
    const snapshot = createEmptyWorkspace("2026-08-22T11:00:00.000Z");
    mockApplyProfileCopilotPatchGroup.mockResolvedValue(snapshot);
    mockRejectProfileCopilotPatchGroup.mockResolvedValue(snapshot);
    mockUndoProfileRevision.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      applyProfileCopilotPatchGroup: mockApplyProfileCopilotPatchGroup,
      rejectProfileCopilotPatchGroup: mockRejectProfileCopilotPatchGroup,
      undoProfileRevision: mockUndoProfileRevision,
    });

    const applyInput = JobFinderProfileCopilotPatchGroupActionInputSchema.parse(
      { patchGroupId: "profile_patch_group_1" },
    );
    const applyResult = await registerAndFindHandler(
      "job-finder:apply-profile-copilot-patch-group",
    )({ sender: {} }, applyInput);
    expect(mockApplyProfileCopilotPatchGroup).toHaveBeenCalledWith(
      "profile_patch_group_1",
    );
    expect(applyResult).toEqual(snapshot);

    const rejectInput =
      JobFinderProfileCopilotPatchGroupActionInputSchema.parse({
        patchGroupId: "profile_patch_group_2",
      });
    const rejectResult = await registerAndFindHandler(
      "job-finder:reject-profile-copilot-patch-group",
    )({ sender: {} }, rejectInput);
    expect(mockRejectProfileCopilotPatchGroup).toHaveBeenCalledWith(
      "profile_patch_group_2",
    );
    expect(rejectResult).toEqual(snapshot);

    const undoInput = JobFinderUndoProfileRevisionInputSchema.parse({
      revisionId: "profile_revision_3",
    });
    const undoResult = await registerAndFindHandler(
      "job-finder:undo-profile-revision",
    )({ sender: {} }, undoInput);
    expect(mockUndoProfileRevision).toHaveBeenCalledWith("profile_revision_3");
    expect(undoResult).toEqual(snapshot);
  });

  it("parses strict input schemas before touching the service", async () => {
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      applyProfileCopilotPatchGroup: mockApplyProfileCopilotPatchGroup,
      rejectProfileCopilotPatchGroup: mockRejectProfileCopilotPatchGroup,
      undoProfileRevision: mockUndoProfileRevision,
    });

    const applyHandler = registerAndFindHandler(
      "job-finder:apply-profile-copilot-patch-group",
    );
    const rejectHandler = registerAndFindHandler(
      "job-finder:reject-profile-copilot-patch-group",
    );
    const undoHandler = registerAndFindHandler(
      "job-finder:undo-profile-revision",
    );

    await expect(
      applyHandler({ sender: {} }, { patchGroupId: "" }),
    ).rejects.toThrow();
    await expect(
      applyHandler({ sender: {} }, { patchGroupId: "  " }),
    ).rejects.toThrow();
    await expect(rejectHandler({ sender: {} }, {})).rejects.toThrow();
    await expect(
      undoHandler({ sender: {} }, { revisionId: 42 }),
    ).rejects.toThrow();

    expect(mockApplyProfileCopilotPatchGroup).not.toHaveBeenCalled();
    expect(mockRejectProfileCopilotPatchGroup).not.toHaveBeenCalled();
    expect(mockUndoProfileRevision).not.toHaveBeenCalled();
  });

  it("re-parses the service snapshot before returning it to IPC", async () => {
    mockUndoProfileRevision.mockResolvedValue({
      module: "job-finder",
    } as unknown as ReturnType<typeof createEmptyWorkspace>);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      undoProfileRevision: mockUndoProfileRevision,
    });

    await expect(
      registerAndFindHandler("job-finder:undo-profile-revision")(
        { sender: {} },
        { revisionId: "profile_revision_4" },
      ),
    ).rejects.toThrow();
    expect(mockUndoProfileRevision).toHaveBeenCalledWith("profile_revision_4");
  });
});

function createEmptyWorkspace(generatedAt: string) {
  const state = createEmptyJobFinderRepositoryState();
  const campaign = {
    id: "campaign-test",
    name: "Test campaign",
    description: "",
    mode: "precision" as const,
    status: "active" as const,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    searchPreferences: state.searchPreferences,
    sourceTargetIds: [],
    jobIds: [],
    minimumFitScore: null,
    ...getDefaultCampaignConfiguration("precision"),
    schedule: {},
    progress: { lastUpdatedAt: generatedAt },
    history: [],
  };

  return JobFinderWorkspaceSnapshotSchema.parse({
    module: "job-finder",
    generatedAt,
    agentProvider: {
      kind: "deterministic",
      role: "chat",
      ready: true,
      label: "Test AI",
      model: null,
      baseUrl: null,
      modelContextWindowTokens: null,
      reservedHeadroomTokens: null,
      requestTimeoutMs: null,
      detail: "Test AI",
    },
    visionProvider: null,
    availableResumeTemplates: [],
    profile: state.profile,
    searchPreferences: state.searchPreferences,
    profileSetupState: state.profileSetupState,
    browserSession: {
      source: "target_site",
      status: "ready",
      driver: "catalog_seed",
      label: "Ready",
      detail: "Ready",
      lastCheckedAt: "2026-08-09T09:59:00.000Z",
    },
    sourceAccessPrompts: [],
    discoverySessions: [],
    discoveryRunState: "idle",
    activeDiscoveryRun: null,
    recentDiscoveryRuns: [],
    activeSourceDebugRun: null,
    recentSourceDebugRuns: [],
    discoveryJobs: [],
    dismissedDiscoveryJobs: [],
    selectedDiscoveryJobId: null,
    reviewQueue: [],
    selectedReviewJobId: null,
    tailoredAssets: [],
    resumeDrafts: [],
    resumeExportArtifacts: [],
    resumeResearchArtifacts: [],
    applyRuns: [],
    applyJobResults: [],
    applicationRecords: [],
    applicationAttempts: [],
    sourceInstructionArtifacts: [],
    latestResumeImportRun: null,
    latestResumeImportReviewCandidates: [],
    profileCopilotMessages: [],
    profileRevisions: [],
    selectedApplyRunId: null,
    selectedApplicationRecordId: null,
    settings: state.settings,
    userActionRequests: [],
    userActionEvents: [],
    campaigns: [campaign],
    activeCampaignId: campaign.id,
    dashboard: {
      generatedAt,
      activeCampaignId: campaign.id,
      activeCampaignCount: 1,
      jobsFoundToday: 0,
      jobsAwaitingReview: 0,
      applicationsReadyForApproval: 0,
      applicationsAppliedToday: 0,
      applicationsAppliedThisWeek: 0,
      needsYouCount: 0,
      upcomingInterviews: 0,
      upcomingFollowUps: 0,
      responseRate: null,
      interviewRate: null,
      sourceHealth: {
        healthy: 0,
        needsAttention: 0,
        running: 0,
        total: 0,
      },
      backgroundOperationCount: 0,
      recommendedNextAction: {
        label: "Review profile",
        detail: "Complete the profile before searching.",
        route: "/job-finder/profile",
      },
    },
    activityControl: { paused: false, pausedAt: null, reason: null },
  });
}

describe("job-finder application packet export route", () => {
  let temporaryDirectory: string;
  let exportHandler: RegisteredHandler;
  let bootstrapHandler: RegisteredHandler;
  let syncHandler: RegisteredHandler;
  let entityMutationHandler: RegisteredHandler;
  let profileCopilotHandler: RegisteredHandler;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "unemployed-application-packet-"),
    );
    mockBuildApplicationPacket.mockResolvedValue(packet);
    mockGetWorkspaceSnapshot.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T10:00:00.000Z"),
    );
    mockGetWorkspaceBootstrap.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T09:59:00.000Z"),
    );
    mockQueueJobForReview.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T10:01:00.000Z"),
    );
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      buildApplicationPacket: mockBuildApplicationPacket,
      getWorkspaceBootstrap: mockGetWorkspaceBootstrap,
      getWorkspaceSnapshot: mockGetWorkspaceSnapshot,
      proposeProfileCopilotChange: mockProposeProfileCopilotChange,
      queueJobForReview: mockQueueJobForReview,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;

    registerJobFinderRouteHandlers(ipcMain);
    const registeredHandler = handlers.get(
      "job-finder:export-application-packet",
    );
    if (!registeredHandler) {
      throw new Error("Application packet export handler was not registered.");
    }
    exportHandler = registeredHandler;
    const registeredBootstrapHandler = handlers.get(
      "job-finder:get-workspace-bootstrap",
    );
    const registeredSyncHandler = handlers.get("job-finder:sync-workspace");
    const registeredEntityMutationHandler = handlers.get(
      "job-finder:mutate-workspace-entities",
    );
    const registeredProfileCopilotHandler = handlers.get(
      "job-finder:send-profile-copilot-message",
    );
    if (
      !registeredSyncHandler ||
      !registeredEntityMutationHandler ||
      !registeredProfileCopilotHandler ||
      !registeredBootstrapHandler
    ) {
      throw new Error("Workspace delta handlers were not registered.");
    }
    syncHandler = registeredSyncHandler;
    entityMutationHandler = registeredEntityMutationHandler;
    profileCopilotHandler = registeredProfileCopilotHandler;
    bootstrapHandler = registeredBootstrapHandler;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it("serves the shell-safe workspace bootstrap through its dedicated route", async () => {
    const result = await bootstrapHandler({ sender: {} }, undefined);

    expect(result).toMatchObject({
      module: "job-finder",
      generatedAt: "2026-08-09T09:59:00.000Z",
    });
    expect(mockGetWorkspaceBootstrap).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled without writing when the save dialog is cancelled", async () => {
    mockShowSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });

    const result = await exportHandler(
      { sender: {} },
      {
        runId: "run-1",
        jobId: "job-1",
        applicationRecordId: "application-1",
      },
    );

    expect(result).toEqual({ status: "cancelled" });
    expect(mockBuildApplicationPacket).toHaveBeenCalledWith(
      "run-1",
      "job-1",
      "application-1",
    );
    await expect(readdir(temporaryDirectory)).resolves.toEqual([]);
  });

  it("writes the exact schema-validated packet as formatted JSON", async () => {
    const selectedPath = path.join(temporaryDirectory, "application-packet");
    mockShowSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: selectedPath,
    });

    const result = await exportHandler(
      { sender: {} },
      {
        runId: "run-1",
        jobId: "job-1",
        applicationRecordId: "application-1",
      },
    );

    expect(result).toEqual({ status: "saved" });
    const savedContents = await readFile(`${selectedPath}.json`, "utf8");
    expect(savedContents).toBe(`${JSON.stringify(packet, null, 2)}\n`);
    expect(JSON.parse(savedContents)).toEqual(packet);
  });

  it("returns a typed delta for a bounded entity mutation", async () => {
    const initial = await syncHandler({ sender: {} }, { baseRevision: null });
    expect(initial).toMatchObject({
      kind: "snapshot",
      currentRevision: 1,
    });

    const result = await entityMutationHandler(
      { sender: {} },
      {
        baseRevision: 1,
        mutation: {
          type: "queue_job_for_review",
          jobId: "job-1",
        },
      },
    );

    expect(mockQueueJobForReview).toHaveBeenCalledWith("job-1");
    expect(result).toMatchObject({
      kind: "delta",
      delta: {
        baseRevision: 1,
        currentRevision: 2,
      },
    });
    expect(result).not.toHaveProperty("snapshot");
  });

  it("routes visible Profile Copilot requests through proposal-only product actions", async () => {
    const base = createEmptyWorkspace("2026-08-09T10:05:00.000Z");
    const proposed = JobFinderWorkspaceSnapshotSchema.parse({
      ...base,
      profileCopilotMessages: [
        {
          id: "profile_copilot_assistant_message_1",
          role: "assistant",
          content:
            "I prepared this change for your review. Nothing changed yet.",
          context: { surface: "profile", section: "preferences" },
          patchGroups: [
            {
              id: "profile_patch_group_1",
              summary: "Update preferred location",
              applyMode: "needs_review",
              createdAt: "2026-08-09T10:05:00.000Z",
              operations: [
                {
                  operation: "replace_search_preferences_fields",
                  value: { locations: ["New York, NY"] },
                },
              ],
            },
          ],
          createdAt: "2026-08-09T10:05:00.000Z",
        },
      ],
    });
    mockProposeProfileCopilotChange.mockResolvedValueOnce(proposed);
    mockGetWorkspaceSnapshot.mockResolvedValueOnce(proposed);

    const result = await profileCopilotHandler(
      { sender: {} },
      {
        content: "Look for jobs around New York",
        context: { surface: "profile", section: "preferences" },
      },
    );

    expect(mockProposeProfileCopilotChange).toHaveBeenCalledWith(
      "Look for jobs around New York",
      { surface: "profile", section: "preferences" },
    );
    expect(result).toMatchObject({
      profileCopilotMessages: [
        {
          patchGroups: [{ applyMode: "needs_review" }],
        },
      ],
    });
  });

  it("falls back to a revisioned snapshot when a mutation changes an unsupported scalar", async () => {
    await syncHandler({ sender: {} }, { baseRevision: null });
    const changed = createEmptyWorkspace("2026-08-09T10:01:00.000Z");
    mockQueueJobForReview.mockResolvedValueOnce(
      JobFinderWorkspaceSnapshotSchema.parse({
        ...changed,
        profile: {
          ...changed.profile,
          summary: "Changed outside a delta-backed entity slice.",
        },
      }),
    );

    const result = await entityMutationHandler(
      { sender: {} },
      {
        baseRevision: 1,
        mutation: {
          type: "queue_job_for_review",
          jobId: "job-1",
        },
      },
    );

    expect(result).toMatchObject({
      kind: "snapshot",
      currentRevision: 2,
      reason: "unsupported_change",
    });
  });
});

describe("job-finder employer exclusion routes", () => {
  it("validates preview and exact reversal payloads across IPC", async () => {
    const previewEmployerExclusion = vi.fn().mockResolvedValue({
      status: "available",
      jobId: "job-1",
      displayCompanyName: "Example Co",
      normalizedCompanyName: "example co",
      employerDomain: "example.test",
    });
    const removeEmployerExclusion = vi
      .fn()
      .mockResolvedValue(createEmptyWorkspace("2026-08-23T10:00:00.000Z"));
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      previewEmployerExclusion,
      removeEmployerExclusion,
    });
    const handlers = new Map<string, RegisteredHandler>();
    registerJobFinderRouteHandlers({
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain);

    await expect(
      handlers.get("job-finder:preview-employer-exclusion")?.(
        { sender: {} },
        { jobId: "job-1" },
      ),
    ).resolves.toMatchObject({ normalizedCompanyName: "example co" });
    await handlers.get("job-finder:remove-employer-exclusion")?.(
      { sender: {} },
      { jobId: "job-1", normalizedCompanyName: "example co" },
    );
    expect(removeEmployerExclusion).toHaveBeenCalledWith({
      jobId: "job-1",
      normalizedCompanyName: "example co",
    });
    await expect(
      handlers.get("job-finder:remove-employer-exclusion")?.(
        { sender: {} },
        { jobId: "job-1", normalizedCompanyName: "" },
      ),
    ).rejects.toThrow();
  });
});

describe("job-finder exact application lineage routes", () => {
  it("rejects omitted Applications identity and forwards exact start/cancel/consent targets", async () => {
    const snapshot = createEmptyWorkspace("2026-08-23T10:00:00.000Z");
    mockStartApplyCopilotRun.mockResolvedValue(snapshot);
    mockCancelApplyRun.mockResolvedValue(snapshot);
    mockResolveApplyConsentRequest.mockResolvedValue(snapshot);
    mockGetApplyRunDetails.mockResolvedValue({
      run: {
        id: "run-1",
        jobIds: ["job-1"],
      },
      consentRequests: [
        {
          id: "consent-1",
          runId: "run-1",
          jobId: "job-1",
          applicationRecordId: "application-1",
        },
      ],
    });
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      startApplyCopilotRun: mockStartApplyCopilotRun,
      cancelApplyRun: mockCancelApplyRun,
      getApplyRunDetails: mockGetApplyRunDetails,
      resolveApplyConsentRequest: mockResolveApplyConsentRequest,
    });
    const handlers = new Map<string, RegisteredHandler>();
    registerJobFinderRouteHandlers({
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain);

    await expect(
      handlers.get("job-finder:get-apply-run-details")?.(
        { sender: {} },
        { runId: "run-1", jobId: "job-1" },
      ),
    ).rejects.toThrow();

    await handlers.get("job-finder:start-apply-copilot-run")?.(
      { sender: {} },
      {
        jobId: "job-1",
        applicationRecordId: "application-1",
        visualCheckpointsEnabled: true,
      },
    );
    expect(mockStartApplyCopilotRun).toHaveBeenCalledWith(
      "job-1",
      { visualCheckpointsEnabled: true },
      "application-1",
    );

    const exactRunTarget = {
      runId: "run-1",
      jobId: "job-1",
      applicationRecordId: "application-1",
    };
    await handlers.get("job-finder:cancel-apply-run")?.(
      { sender: {} },
      exactRunTarget,
    );
    expect(mockGetApplyRunDetails).toHaveBeenCalledWith(
      "run-1",
      "job-1",
      "application-1",
    );
    expect(mockCancelApplyRun).toHaveBeenCalledWith("run-1");

    await handlers.get("job-finder:resolve-apply-consent-request")?.(
      { sender: {} },
      { ...exactRunTarget, requestId: "consent-1", action: "approve" },
    );
    expect(mockResolveApplyConsentRequest).toHaveBeenCalledWith(
      "consent-1",
      "approve",
    );
  });
});

describe("job-finder resume preview route", () => {
  const draft = ResumeDraftSchema.parse({
    id: "draft_preview",
    jobId: "job_preview",
    status: "needs_review",
    templateId: "classic_ats",
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
  });
  const preview = JobFinderResumePreviewSchema.parse({
    draftId: draft.id,
    revisionKey: "resume_preview_draft_preview_latest",
    html: "<!doctype html><html><body>latest</body></html>",
    warnings: [],
    metadata: {
      templateId: draft.templateId,
      renderedAt: "2026-08-19T10:00:00.000Z",
      pageCount: null,
      sectionCount: 0,
      entryCount: 0,
    },
  });

  let previewHandler: RegisteredHandler;

  beforeEach(() => {
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      previewResumeDraft: mockPreviewResumeDraft,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const registeredHandler = handlers.get("job-finder:preview-resume-draft");
    if (!registeredHandler) {
      throw new Error("Resume preview handler was not registered.");
    }
    previewHandler = registeredHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aborts a superseded render and returns only the latest preview", async () => {
    const signals: AbortSignal[] = [];
    const resolvers: Array<(value: typeof preview) => void> = [];
    const rejecters: Array<(reason: unknown) => void> = [];

    mockPreviewResumeDraft.mockImplementation(
      (_draft: unknown, signal?: AbortSignal) =>
        new Promise<typeof preview>((resolve, reject) => {
          if (!signal) {
            reject(new Error("Expected the route to pass an abort signal."));
            return;
          }

          signals.push(signal);
          resolvers.push(resolve);
          rejecters.push(reject);
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("superseded", "AbortError")),
            { once: true },
          );
        }),
    );

    const sender = {};
    const firstRequest = previewHandler(
      { sender },
      { draft, requestId: "resume_preview_1" },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(mockPreviewResumeDraft).toHaveBeenCalledTimes(1);

    const secondRequest = previewHandler(
      { sender },
      { draft, requestId: "resume_preview_2" },
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    resolvers[1]?.(preview);
    await expect(secondRequest).resolves.toEqual(preview);
    await expect(firstRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(rejecters).toHaveLength(2);
  });
});

describe("job-finder work-history review acknowledgment route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndFindHandler(): RegisteredHandler {
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get(
      "job-finder:set-work-history-review-acknowledgment",
    );
    if (!handler) {
      throw new Error(
        "Work-history review acknowledgment handler was not registered.",
      );
    }
    return handler;
  }

  it("parses the typed command, forwards it to the service, and returns a parsed snapshot", async () => {
    const snapshot = createEmptyWorkspace("2026-08-19T10:05:00.000Z");
    mockSetWorkHistoryReviewAcknowledgment.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setWorkHistoryReviewAcknowledgment:
        mockSetWorkHistoryReviewAcknowledgment,
    });

    const input = JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema.parse({
      intent: "acknowledge",
      jobId: "job_ready",
      draftId: "resume_draft_job_ready",
      expectedDraftUpdatedAt: "2026-08-19T10:00:00.000Z",
      suggestionId: "work_history_review_experience_sales_bridge",
      profileRecordId: "experience_sales_bridge",
      kind: "weak_fit",
      action: "consider_showing",
      messageContentHash: "fnv1a32:465fc3f2",
      reason: "intentional_omission",
    });
    const result = await registerAndFindHandler()({ sender: {} }, input);

    expect(mockSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledOnce();
    expect(mockSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("forwards remove commands by acknowledgment id", async () => {
    const snapshot = createEmptyWorkspace("2026-08-19T10:06:00.000Z");
    mockSetWorkHistoryReviewAcknowledgment.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setWorkHistoryReviewAcknowledgment:
        mockSetWorkHistoryReviewAcknowledgment,
    });

    const input = JobFinderSetWorkHistoryReviewAcknowledgmentInputSchema.parse({
      intent: "remove",
      jobId: "job_ready",
      draftId: "resume_draft_job_ready",
      expectedDraftUpdatedAt: "2026-08-19T10:00:00.000Z",
      acknowledgmentId: "work_history_ack_experience_sales_bridge_1",
    });
    const result = await registerAndFindHandler()({ sender: {} }, input);

    expect(mockSetWorkHistoryReviewAcknowledgment).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("rejects payloads that violate the strict discriminated schema before touching the service", async () => {
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setWorkHistoryReviewAcknowledgment:
        mockSetWorkHistoryReviewAcknowledgment,
    });
    const handler = registerAndFindHandler();

    await expect(
      handler({ sender: {} }, { intent: "acknowledge" }),
    ).rejects.toThrow();
    await expect(
      handler(
        { sender: {} },
        {
          intent: "acknowledge",
          jobId: "job_ready",
          draftId: "resume_draft_job_ready",
          expectedDraftUpdatedAt: "2026-08-19T10:00:00.000Z",
          suggestionId: "work_history_review_x",
          profileRecordId: "experience_x",
          kind: "compact_recommended",
          action: "keep_compact",
          messageContentHash: "fnv1a32:465fc3f2",
          reason: "intentional_omission",
        },
      ),
    ).rejects.toThrow(/intentional_omission/);

    expect(mockSetWorkHistoryReviewAcknowledgment).not.toHaveBeenCalled();
  });
});

describe("job-finder resume claim confirmation route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndFindHandler(): RegisteredHandler {
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get("job-finder:set-resume-claim-confirmation");
    if (!handler) {
      throw new Error(
        "Resume claim confirmation handler was not registered.",
      );
    }
    return handler;
  }

  function buildValidAddInput(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      intent: "add",
      jobId: "job_ready",
      draftId: "resume_draft_job_ready",
      expectedDraftUpdatedAt: "2026-08-19T10:00:00.000Z",
      field: "entry_bullet",
      sectionId: "section_experience",
      entryId: "experience_1",
      bulletId: "experience_1_bullet_1",
      confirmedClaimContentHash: "fnv1a32:5678efab",
      ownershipStatement: resumeClaimOwnershipStatement,
      ...overrides,
    };
  }

  it("parses the typed command, forwards it to the service, and returns a parsed snapshot", async () => {
    const snapshot = createEmptyWorkspace("2026-08-19T10:07:00.000Z");
    mockSetResumeClaimConfirmation.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setResumeClaimConfirmation: mockSetResumeClaimConfirmation,
    });

    const input = JobFinderSetResumeClaimConfirmationInputSchema.parse(
      buildValidAddInput(),
    );
    const result = await registerAndFindHandler()({ sender: {} }, input);

    expect(mockSetResumeClaimConfirmation).toHaveBeenCalledOnce();
    expect(mockSetResumeClaimConfirmation).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("forwards remove commands by confirmation id", async () => {
    const snapshot = createEmptyWorkspace("2026-08-19T10:08:00.000Z");
    mockSetResumeClaimConfirmation.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setResumeClaimConfirmation: mockSetResumeClaimConfirmation,
    });

    const input = JobFinderSetResumeClaimConfirmationInputSchema.parse({
      intent: "remove",
      jobId: "job_ready",
      draftId: "resume_draft_job_ready",
      expectedDraftUpdatedAt: "2026-08-19T10:00:00.000Z",
      confirmationId: "claim_confirmation_section_experience_abc",
    });
    const result = await registerAndFindHandler()({ sender: {} }, input);

    expect(mockSetResumeClaimConfirmation).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("rejects payloads that violate the strict discriminated schema before touching the service", async () => {
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      setResumeClaimConfirmation: mockSetResumeClaimConfirmation,
    });
    const handler = registerAndFindHandler();

    await expect(
      handler({ sender: {} }, { intent: "add" }),
    ).rejects.toThrow();
    await expect(
      handler({ sender: {} }, buildValidAddInput({ bulletId: null })),
    ).rejects.toThrow(/bulletId/);
    await expect(
      handler(
        { sender: {} },
        {
          ...buildValidAddInput(),
          confirmedAt: "2026-08-19T10:05:00.000Z",
        },
      ),
    ).rejects.toThrow();

    expect(mockSetResumeClaimConfirmation).not.toHaveBeenCalled();
  });
});

describe("job-finder scoped settings routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndFindHandler(channel: string): RegisteredHandler {
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((registeredChannel: string, handler: RegisteredHandler) => {
        handlers.set(registeredChannel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`Scoped settings handler was not registered: ${channel}`);
    }
    return handler;
  }

  it("routes application-default payloads to updateApplicationDefaults without whole-object save", async () => {
    const snapshot = createEmptyWorkspace("2026-08-22T10:00:00.000Z");
    mockUpdateApplicationDefaults.mockResolvedValue(snapshot);
    // Only the scoped method exists on the mocked service, so any fallback to
    // saveSettings or another settings method would fail this route.
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateApplicationDefaults: mockUpdateApplicationDefaults,
    });

    const input = UpdateApplicationDefaultsInputSchema.parse({
      resumeApplicationMode: "original_resume",
      resumeTemplateId: "modern_split",
    });
    const result = await registerAndFindHandler(
      "job-finder:update-application-defaults",
    )({ sender: {} }, input);

    expect(mockUpdateApplicationDefaults).toHaveBeenCalledOnce();
    expect(mockUpdateApplicationDefaults).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("routes tracker CRM payloads to updateTrackerCrm and never through saveSettings", async () => {
    const snapshot = createEmptyWorkspace("2026-08-22T10:01:00.000Z");
    mockUpdateTrackerCrm.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateTrackerCrm: mockUpdateTrackerCrm,
    });

    const input = ApplicationCrmSettingsSchema.parse({
      noResponseAutomation: { enabled: true, afterDays: 7 },
    });
    const result = await registerAndFindHandler(
      "job-finder:update-tracker-crm",
    )({ sender: {} }, input);

    expect(mockUpdateTrackerCrm).toHaveBeenCalledOnce();
    expect(mockUpdateTrackerCrm).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("routes workspace-behavior payloads to updateWorkspaceBehavior", async () => {
    const snapshot = createEmptyWorkspace("2026-08-22T10:02:00.000Z");
    mockUpdateWorkspaceBehavior.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateWorkspaceBehavior: mockUpdateWorkspaceBehavior,
    });

    const input = UpdateWorkspaceBehaviorInputSchema.parse({
      keepSessionAlive: true,
      discoveryOnly: true,
    });
    const result = await registerAndFindHandler(
      "job-finder:update-workspace-behavior",
    )({ sender: {} }, input);

    expect(mockUpdateWorkspaceBehavior).toHaveBeenCalledWith(input);
    expect(result).toEqual(snapshot);
  });

  it("routes appearance-theme payloads to updateAppearanceTheme with the parsed theme", async () => {
    const snapshot = createEmptyWorkspace("2026-08-22T10:03:00.000Z");
    mockUpdateAppearanceTheme.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateAppearanceTheme: mockUpdateAppearanceTheme,
    });

    const theme = AppearanceThemeSchema.parse("dark");
    const result = await registerAndFindHandler(
      "job-finder:update-appearance-theme",
    )({ sender: {} }, theme);

    expect(mockUpdateAppearanceTheme).toHaveBeenCalledWith("dark");
    expect(result).toEqual(snapshot);
  });

  it("rejects a malformed application-defaults payload before touching the service", async () => {
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateApplicationDefaults: mockUpdateApplicationDefaults,
    });
    const handler = registerAndFindHandler(
      "job-finder:update-application-defaults",
    );

    await expect(
      handler({ sender: {} }, { resumeTemplateId: 42 }),
    ).rejects.toThrow();

    expect(mockUpdateApplicationDefaults).not.toHaveBeenCalled();
  });

  it("propagates scoped service failures so renderer save state can report them", async () => {
    mockUpdateTrackerCrm.mockRejectedValue(
      new Error("Tracker settings could not be committed."),
    );
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      updateTrackerCrm: mockUpdateTrackerCrm,
    });

    const handler = registerAndFindHandler("job-finder:update-tracker-crm");

    await expect(
      handler(
        { sender: {} },
        ApplicationCrmSettingsSchema.parse({
          noResponseAutomation: { enabled: false, afterDays: 30 },
        }),
      ),
    ).rejects.toThrow(/could not be committed/);
  });
});

describe("job-finder resume quality benchmark route", () => {
  afterEach(() => {
    mockIsDesktopTestApiEnabled.mockReturnValue(false);
    vi.clearAllMocks();
  });

  it("forwards configured AI selection to the benchmark service", async () => {
    mockIsDesktopTestApiEnabled.mockReturnValue(true);
    const report = ResumeQualityBenchmarkReportSchema.parse({
      benchmarkVersion: "configured-route-regression",
      generatedAt: "2026-08-09T12:00:00.000Z",
      providerMode: "configured",
      templates: [],
      persistedArtifactsDirectory: null,
      cases: [],
      aggregate: {},
      notes: [],
    });
    mockRunDesktopResumeQualityBenchmark.mockResolvedValue(report);

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get(
      "job-finder:test-run-resume-quality-benchmark",
    );
    if (!handler) {
      throw new Error("Resume quality benchmark handler was not registered.");
    }

    await expect(
      handler(
        { sender: {} },
        {
          benchmarkVersion: "configured-route-regression",
          canaryOnly: true,
          useConfiguredAi: true,
        },
      ),
    ).resolves.toEqual(report);
    expect(mockRunDesktopResumeQualityBenchmark).toHaveBeenCalledWith({
      benchmarkVersion: "configured-route-regression",
      canaryOnly: true,
      useConfiguredAi: true,
    });
  });
});

describe("job-finder campaign run and notification read routes", () => {
  let runCampaignNowHandler: RegisteredHandler;
  let markNotificationReadHandler: RegisteredHandler;
  let markAllNotificationsReadHandler: RegisteredHandler;

  beforeEach(() => {
    mockRunCampaignNow.mockClear();
    mockMarkCampaignNotificationRead.mockClear();
    mockMarkAllCampaignNotificationsRead.mockClear();
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      markAllCampaignNotificationsRead: mockMarkAllCampaignNotificationsRead,
      markCampaignNotificationRead: mockMarkCampaignNotificationRead,
      runCampaignNow: mockRunCampaignNow,
    });
    mockRunCampaignNow.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:00:00.000Z"),
    );
    mockMarkCampaignNotificationRead.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:01:00.000Z"),
    );
    mockMarkAllCampaignNotificationsRead.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:02:00.000Z"),
    );

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const runNow = handlers.get("job-finder:run-campaign-now");
    const markRead = handlers.get("job-finder:mark-campaign-notification-read");
    const markAllRead = handlers.get(
      "job-finder:mark-all-campaign-notifications-read",
    );
    if (!runNow || !markRead || !markAllRead) {
      throw new Error(
        "Campaign run and notification read handlers were not registered.",
      );
    }
    runCampaignNowHandler = runNow;
    markNotificationReadHandler = markRead;
    markAllNotificationsReadHandler = markAllRead;
  });

  it("parses an explicit campaign id for run-campaign-now", async () => {
    const result = await runCampaignNowHandler(
      { sender: {} },
      { campaignId: "campaign-1" },
    );

    expect(mockRunCampaignNow).toHaveBeenCalledWith({
      campaignId: "campaign-1",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("treats omitted or null campaign ids as the active campaign", async () => {
    await runCampaignNowHandler({ sender: {} }, undefined);
    expect(mockRunCampaignNow).toHaveBeenCalledWith({});

    mockRunCampaignNow.mockClear();
    await runCampaignNowHandler({ sender: {} }, { campaignId: null });
    expect(mockRunCampaignNow).toHaveBeenCalledWith({ campaignId: null });
  });

  it("rejects a malformed run-campaign-now payload", async () => {
    await expect(
      runCampaignNowHandler({ sender: {} }, { campaignId: 42 }),
    ).rejects.toThrow();
    expect(mockRunCampaignNow).not.toHaveBeenCalled();
  });

  it("supplies the ISO readAt for mark-campaign-notification-read", async () => {
    const result = await markNotificationReadHandler(
      { sender: {} },
      { notificationId: "notification-1" },
    );

    const input = MarkCampaignNotificationReadInputSchema.parse(
      mockMarkCampaignNotificationRead.mock.calls.at(-1)?.[0],
    );
    expect(input.notificationId).toBe("notification-1");
    expect(typeof input.readAt).toBe("string");
    expect(new Date(input.readAt).toISOString()).toBe(input.readAt);
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a mark-read payload without a notification id", async () => {
    await expect(
      markNotificationReadHandler({ sender: {} }, {}),
    ).rejects.toThrow();
    expect(mockMarkCampaignNotificationRead).not.toHaveBeenCalled();
  });

  it("routes mark-all-campaign-notifications-read to the service without extra payload", async () => {
    const result = await markAllNotificationsReadHandler(
      { sender: {} },
      undefined,
    );

    expect(mockMarkAllCampaignNotificationsRead).toHaveBeenCalledTimes(1);
    const rawInput: unknown =
      mockMarkAllCampaignNotificationsRead.mock.calls.at(-1)?.[0];
    const input = MarkAllCampaignNotificationsReadInputSchema.parse(rawInput);
    expect(new Date(input.readAt).toISOString()).toBe(input.readAt);
    expect(result).toMatchObject({ module: "job-finder" });
  });
});

describe("job-finder campaign rule mutation and funnel routes", () => {
  let saveRuleHandler: RegisteredHandler;
  let deleteRuleHandler: RegisteredHandler;
  let toggleRuleHandler: RegisteredHandler;
  let projectFunnelHandler: RegisteredHandler;

  const rulePayload = {
    id: null,
    kind: "must_have",
    field: "role",
    operator: "contains",
    value: "frontend",
    provenance: { source: "user", recordedAt: "2026-08-15T10:00:00.000Z" },
  };

  beforeEach(() => {
    mockSaveCampaignRule.mockClear();
    mockDeleteCampaignRule.mockClear();
    mockToggleCampaignRule.mockClear();
    mockProjectCampaignRuleFunnel.mockClear();
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      deleteCampaignRule: mockDeleteCampaignRule,
      projectCampaignRuleFunnel: mockProjectCampaignRuleFunnel,
      saveCampaignRule: mockSaveCampaignRule,
      toggleCampaignRule: mockToggleCampaignRule,
    });
    mockSaveCampaignRule.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:02:00.000Z"),
    );
    mockDeleteCampaignRule.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:03:00.000Z"),
    );
    mockToggleCampaignRule.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T11:04:00.000Z"),
    );
    mockProjectCampaignRuleFunnel.mockResolvedValue({
      campaignId: "campaign-1",
      generatedAt: "2026-08-09T11:05:00.000Z",
      rules: [],
      disabledRuleIds: [],
      funnel: {
        sampleSize: 0,
        hardRemovedCount: 0,
        retainedCount: 0,
        preferDowngradedCount: 0,
        uncertainCount: 0,
        confirmedRetainedCount: 0,
        rankedJobIds: [],
        measuredAt: "2026-08-09T11:05:00.000Z",
      },
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const saveRule = handlers.get("job-finder:save-campaign-rule");
    const deleteRule = handlers.get("job-finder:delete-campaign-rule");
    const toggleRule = handlers.get("job-finder:toggle-campaign-rule");
    const projectFunnel = handlers.get(
      "job-finder:project-campaign-rule-funnel",
    );
    if (!saveRule || !deleteRule || !toggleRule || !projectFunnel) {
      throw new Error("Campaign rule handlers were not registered.");
    }
    saveRuleHandler = saveRule;
    deleteRuleHandler = deleteRule;
    toggleRuleHandler = toggleRule;
    projectFunnelHandler = projectFunnel;
  });

  it("parses a save-campaign-rule payload and returns a snapshot", async () => {
    const result = await saveRuleHandler(
      { sender: {} },
      { campaignId: "campaign-1", rule: rulePayload },
    );

    const input = SaveCampaignRuleRouteInputSchema.parse(
      mockSaveCampaignRule.mock.calls.at(-1)?.[0],
    );
    expect(input.campaignId).toBe("campaign-1");
    expect(input.rule.kind).toBe("must_have");
    expect(input.rule.field).toBe("role");
    expect(input.rule.operator).toBe("contains");
    expect(input.rule.value).toBe("frontend");
    // The route input defaults the id, enabled state, and effect so the
    // service always receives a complete rule.
    expect(input.rule.id).toBeNull();
    expect(input.rule.enabled).toBe(true);
    expect(input.rule.effect.sampleSize).toBe(0);
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a save-campaign-rule payload without a campaign id", async () => {
    await expect(
      saveRuleHandler({ sender: {} }, { rule: rulePayload }),
    ).rejects.toThrow();
    expect(mockSaveCampaignRule).not.toHaveBeenCalled();
  });

  it("parses a delete-campaign-rule payload", async () => {
    const result = await deleteRuleHandler(
      { sender: {} },
      { campaignId: "campaign-1", ruleId: "rule_1" },
    );
    expect(mockDeleteCampaignRule).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      ruleId: "rule_1",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a delete-campaign-rule payload without a rule id", async () => {
    await expect(
      deleteRuleHandler({ sender: {} }, { campaignId: "campaign-1" }),
    ).rejects.toThrow();
    expect(mockDeleteCampaignRule).not.toHaveBeenCalled();
  });

  it("parses a toggle-campaign-rule payload", async () => {
    const result = await toggleRuleHandler(
      { sender: {} },
      { campaignId: "campaign-1", ruleId: "rule_1", enabled: false },
    );
    expect(mockToggleCampaignRule).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      ruleId: "rule_1",
      enabled: false,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a toggle-campaign-rule payload with a non-boolean enabled flag", async () => {
    await expect(
      toggleRuleHandler(
        { sender: {} },
        { campaignId: "campaign-1", ruleId: "rule_1", enabled: "yes" },
      ),
    ).rejects.toThrow();
    expect(mockToggleCampaignRule).not.toHaveBeenCalled();
  });

  it("returns a parsed funnel projection from project-campaign-rule-funnel", async () => {
    const result = await projectFunnelHandler(
      { sender: {} },
      { campaignId: "campaign-1" },
    );
    expect(mockProjectCampaignRuleFunnel).toHaveBeenCalledWith({
      campaignId: "campaign-1",
    });
    expect(result).toMatchObject({
      campaignId: "campaign-1",
      funnel: { sampleSize: 0 },
    });
  });

  it("rejects a project-campaign-rule-funnel payload without a campaign id", async () => {
    await expect(projectFunnelHandler({ sender: {} }, {})).rejects.toThrow();
    expect(mockProjectCampaignRuleFunnel).not.toHaveBeenCalled();
  });
});

describe("job-finder grouped manual-answer routes", () => {
  let projectHandler: RegisteredHandler;
  let applyHandler: RegisteredHandler;
  let snoozeHandler: RegisteredHandler;

  beforeEach(() => {
    const groupedSnapshot = createEmptyWorkspace("2026-08-15T10:00:00.000Z");
    mockProjectGroupedManualAnswer.mockResolvedValue(groupedSnapshot);
    mockApplyGroupedManualAnswer.mockResolvedValue(groupedSnapshot);
    mockSnoozeGroupedDecision.mockResolvedValue(groupedSnapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      applyGroupedManualAnswer: mockApplyGroupedManualAnswer,
      projectGroupedManualAnswer: mockProjectGroupedManualAnswer,
      snoozeGroupedDecision: mockSnoozeGroupedDecision,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const project = handlers.get("job-finder:project-grouped-manual-answer");
    const apply = handlers.get("job-finder:apply-grouped-manual-answer");
    const snooze = handlers.get("job-finder:snooze-grouped-decision");
    if (!project || !apply || !snooze) {
      throw new Error("Grouped manual-answer handlers were not registered.");
    }
    projectHandler = project;
    applyHandler = apply;
    snoozeHandler = snooze;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("projects a typed grouped manual-answer command and returns the parsed snapshot", async () => {
    const result = await projectHandler(
      { sender: {} },
      {
        groupKey: "group_1",
        requestId: "request_a",
        expectedRequestRevision: 1,
        answer: { type: "text", value: "5 years" },
        saveScope: "reusable_profile",
      },
    );

    expect(mockProjectGroupedManualAnswer).toHaveBeenCalledWith({
      groupKey: "group_1",
      requestId: "request_a",
      expectedRequestRevision: 1,
      answer: { type: "text", value: "5 years" },
      saveScope: "reusable_profile",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a project command whose answer is not reusable text", async () => {
    await expect(
      projectHandler(
        { sender: {} },
        {
          groupKey: "group_1",
          requestId: "request_a",
          expectedRequestRevision: 1,
          answer: { type: "single_choice", value: "Yes" },
        },
      ),
    ).rejects.toThrow();
    expect(mockProjectGroupedManualAnswer).not.toHaveBeenCalled();
  });

  it("applies a typed grouped manual-answer input and returns the parsed snapshot", async () => {
    const result = await applyHandler(
      { sender: {} },
      {
        decisionId: "group_1:abc123",
        requestIds: ["request_a", "request_b"],
        expectedRequestRevisions: { request_a: 1, request_b: 1 },
        answer: { type: "text", value: "5 years" },
      },
    );

    expect(mockApplyGroupedManualAnswer).toHaveBeenCalledWith({
      decisionId: "group_1:abc123",
      requestIds: ["request_a", "request_b"],
      expectedRequestRevisions: { request_a: 1, request_b: 1 },
      answer: { type: "text", value: "5 years" },
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects an apply input whose revisions do not cover every request id", async () => {
    await expect(
      applyHandler(
        { sender: {} },
        {
          decisionId: "group_1:abc123",
          requestIds: ["request_a", "request_b"],
          expectedRequestRevisions: { request_a: 1 },
          answer: { type: "text", value: "5 years" },
        },
      ),
    ).rejects.toThrow();
    expect(mockApplyGroupedManualAnswer).not.toHaveBeenCalled();
  });

  it("snoozes a grouped decision and defaults a missing reason to null", async () => {
    const result = await snoozeHandler(
      { sender: {} },
      {
        decisionId: "group_1:abc123",
        expectedRevision: 1,
        until: "2026-08-17T10:00:00.000Z",
      },
    );

    expect(mockSnoozeGroupedDecision).toHaveBeenCalledWith({
      decisionId: "group_1:abc123",
      expectedRevision: 1,
      until: "2026-08-17T10:00:00.000Z",
      reason: null,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a snooze payload without a decision id", async () => {
    await expect(
      snoozeHandler(
        { sender: {} },
        { expectedRevision: 1, until: "2026-08-17T10:00:00.000Z" },
      ),
    ).rejects.toThrow();
    expect(mockSnoozeGroupedDecision).not.toHaveBeenCalled();
  });
});

describe("job-finder outcome analytics routes", () => {
  let recordOutcomeHandler: RegisteredHandler;
  let setOutcomeSuggestionEnabledHandler: RegisteredHandler;
  const mockRecordOutcome = vi.fn();
  const mockSetOutcomeSuggestionEnabled = vi.fn();

  beforeEach(() => {
    mockRecordOutcome.mockClear();
    mockSetOutcomeSuggestionEnabled.mockClear();
    mockRecordOutcome.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T12:00:00.000Z"),
    );
    mockSetOutcomeSuggestionEnabled.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T12:01:00.000Z"),
    );
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      recordOutcome: mockRecordOutcome,
      setOutcomeSuggestionEnabled: mockSetOutcomeSuggestionEnabled,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const recordOutcome = handlers.get("job-finder:record-outcome");
    const setOutcomeSuggestionEnabled = handlers.get(
      "job-finder:set-outcome-suggestion-enabled",
    );
    if (!recordOutcome || !setOutcomeSuggestionEnabled) {
      throw new Error("Outcome analytics handlers were not registered.");
    }
    recordOutcomeHandler = recordOutcome;
    setOutcomeSuggestionEnabledHandler = setOutcomeSuggestionEnabled;
  });

  it("parses a record-outcome payload and returns a parsed snapshot", async () => {
    const result = await recordOutcomeHandler(
      { sender: {} },
      {
        jobId: "job-1",
        outcome: "interview",
        resumeStrategyId: "strategy-1",
        note: "Recruiter call went well",
      },
    );

    expect(mockRecordOutcome).toHaveBeenCalledWith({
      jobId: "job-1",
      outcome: "interview",
      resumeStrategyId: "strategy-1",
      note: "Recruiter call went well",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("defaults optional facts to null on a record-outcome payload", async () => {
    const result = await recordOutcomeHandler(
      { sender: {} },
      { jobId: "job-1", outcome: "applied" },
    );

    expect(mockRecordOutcome).toHaveBeenCalledWith({
      jobId: "job-1",
      outcome: "applied",
      resumeStrategyId: null,
      note: null,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a record-outcome payload with an unknown outcome", async () => {
    await expect(
      recordOutcomeHandler(
        { sender: {} },
        { jobId: "job-1", outcome: "submitted_without_approval" },
      ),
    ).rejects.toThrow();
    expect(mockRecordOutcome).not.toHaveBeenCalled();
  });

  it("parses a suggestion disable payload", async () => {
    const result = await setOutcomeSuggestionEnabledHandler(
      { sender: {} },
      { dimension: "source", key: "example", enabled: false },
    );

    expect(mockSetOutcomeSuggestionEnabled).toHaveBeenCalledWith({
      dimension: "source",
      key: "example",
      enabled: false,
      reset: false,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("parses a suggestion reset payload with the reset flag", async () => {
    const result = await setOutcomeSuggestionEnabledHandler(
      { sender: {} },
      { dimension: "campaign", key: "campaign-1", enabled: true, reset: true },
    );

    expect(mockSetOutcomeSuggestionEnabled).toHaveBeenCalledWith({
      dimension: "campaign",
      key: "campaign-1",
      enabled: true,
      reset: true,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a suggestion payload without a key", async () => {
    await expect(
      setOutcomeSuggestionEnabledHandler(
        { sender: {} },
        { dimension: "source", enabled: false },
      ),
    ).rejects.toThrow();
    expect(mockSetOutcomeSuggestionEnabled).not.toHaveBeenCalled();
  });
});

describe("job-finder resume strategy routes", () => {
  let recommendHandler: RegisteredHandler;
  let setCampaignDefaultHandler: RegisteredHandler;
  let saveHandler: RegisteredHandler;
  let disableHandler: RegisteredHandler;
  let selectHandler: RegisteredHandler;
  const mockRecommendResumeStrategy = vi.fn();
  const mockSetCampaignResumeStrategyDefault = vi.fn();
  const mockSaveResumeStrategy = vi.fn();
  const mockDisableResumeStrategy = vi.fn();
  const mockSelectResumeStrategy = vi.fn();

  beforeEach(() => {
    mockRecommendResumeStrategy.mockClear();
    mockSetCampaignResumeStrategyDefault.mockClear();
    mockSaveResumeStrategy.mockClear();
    mockDisableResumeStrategy.mockClear();
    mockSelectResumeStrategy.mockClear();
    const snapshot = createEmptyWorkspace("2026-08-15T10:00:00.000Z");
    const recommendation = {
      jobId: "job-1",
      campaignId: "campaign-test",
      roleFamily: "Backend Engineering",
      strategyId: "strategy-1",
      strategyName: "Backend",
      source: "role_family",
      reason: "Exact role family match.",
    };
    mockRecommendResumeStrategy.mockResolvedValue(recommendation);
    mockSetCampaignResumeStrategyDefault.mockResolvedValue(snapshot);
    mockSaveResumeStrategy.mockResolvedValue(snapshot);
    mockDisableResumeStrategy.mockResolvedValue(snapshot);
    mockSelectResumeStrategy.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      recommendResumeStrategy: mockRecommendResumeStrategy,
      setCampaignResumeStrategyDefault: mockSetCampaignResumeStrategyDefault,
      saveResumeStrategy: mockSaveResumeStrategy,
      disableResumeStrategy: mockDisableResumeStrategy,
      selectResumeStrategy: mockSelectResumeStrategy,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const recommend = handlers.get("job-finder:recommend-resume-strategy");
    const setCampaignDefault = handlers.get(
      "job-finder:set-campaign-resume-strategy-default",
    );
    const save = handlers.get("job-finder:save-resume-strategy");
    const disable = handlers.get("job-finder:disable-resume-strategy");
    const select = handlers.get("job-finder:select-resume-strategy");
    if (!recommend || !setCampaignDefault || !save || !disable || !select) {
      throw new Error("Resume strategy handlers were not registered.");
    }
    recommendHandler = recommend;
    setCampaignDefaultHandler = setCampaignDefault;
    saveHandler = save;
    disableHandler = disable;
    selectHandler = select;
  });

  it("returns a parsed recommendation for a job", async () => {
    const result = await recommendHandler(
      { sender: {} },
      { jobId: "job-1", campaignId: "campaign-test" },
    );

    expect(mockRecommendResumeStrategy).toHaveBeenCalledWith({
      jobId: "job-1",
      campaignId: "campaign-test",
    });
    expect(result).toMatchObject({
      jobId: "job-1",
      source: "role_family",
      strategyId: "strategy-1",
    });
  });

  it("rejects a recommendation payload without a job id", async () => {
    await expect(
      recommendHandler({ sender: {} }, { campaignId: "campaign-test" }),
    ).rejects.toThrow();
    expect(mockRecommendResumeStrategy).not.toHaveBeenCalled();
  });

  it("assigns a campaign resume strategy default", async () => {
    const result = await setCampaignDefaultHandler(
      { sender: {} },
      { campaignId: "campaign-test", strategyId: "strategy-1" },
    );

    expect(mockSetCampaignResumeStrategyDefault).toHaveBeenCalledWith({
      campaignId: "campaign-test",
      strategyId: "strategy-1",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a campaign default payload missing the strategy id field", async () => {
    await expect(
      setCampaignDefaultHandler(
        { sender: {} },
        { campaignId: "campaign-test" },
      ),
    ).rejects.toThrow();
    expect(mockSetCampaignResumeStrategyDefault).not.toHaveBeenCalled();
  });

  it("saves, disables, and selects strategies through typed payloads", async () => {
    const saveInput = {
      id: null,
      name: "Backend",
      roleFamily: "Backend Engineering",
      baseResumeDocumentId: "document-1",
      templateId: "classic_ats",
      headlinePolicy: "fixed",
      skillsPolicy: "base_only",
      coveragePolicy: "base_omissions",
      tailoringStrength: "conservative",
      evidenceBoundaries: {
        allowExactClaims: true,
        allowParaphrasedClaims: false,
        maxEvidenceRefsPerBullet: 3,
        requireVerifierPass: true,
      },
      enabled: true,
    };
    await saveHandler({ sender: {} }, saveInput);
    expect(mockSaveResumeStrategy).toHaveBeenCalledWith(saveInput);

    await disableHandler({ sender: {} }, "strategy-1");
    expect(mockDisableResumeStrategy).toHaveBeenCalledWith("strategy-1");

    const selectInput = {
      jobId: "job-1",
      campaignId: "campaign-test",
      strategyId: "strategy-1",
      source: "manual",
      reason: "Picked by the user.",
    };
    await selectHandler({ sender: {} }, selectInput);
    expect(mockSelectResumeStrategy).toHaveBeenCalledWith(selectInput);
  });

  it("rejects a selection with an empty reason so every selection stays inspectable", async () => {
    await expect(
      selectHandler(
        { sender: {} },
        {
          jobId: "job-1",
          campaignId: "campaign-test",
          strategyId: "strategy-1",
          source: "manual",
          reason: "   ",
        },
      ),
    ).rejects.toThrow();
    expect(mockSelectResumeStrategy).not.toHaveBeenCalled();
  });
});

describe("job-finder company intelligence routes", () => {
  let mutateHandler: RegisteredHandler;
  let preferenceHandler: RegisteredHandler;
  let mergeHandler: RegisteredHandler;
  let refreshHandler: RegisteredHandler;
  const mockMutateCompanyIntelligence = vi.fn();
  const mockSetCompanyPreference = vi.fn();
  const mockReviewCompanyMerge = vi.fn();
  const mockRefreshCompanyIntelligence = vi.fn();

  beforeEach(() => {
    mockMutateCompanyIntelligence.mockClear();
    mockSetCompanyPreference.mockClear();
    mockReviewCompanyMerge.mockClear();
    mockRefreshCompanyIntelligence.mockClear();
    const snapshot = createEmptyWorkspace("2026-08-15T10:00:00.000Z");
    mockMutateCompanyIntelligence.mockResolvedValue(snapshot);
    mockSetCompanyPreference.mockResolvedValue(snapshot);
    mockReviewCompanyMerge.mockResolvedValue(snapshot);
    mockRefreshCompanyIntelligence.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      mutateCompanyIntelligence: mockMutateCompanyIntelligence,
      setCompanyPreference: mockSetCompanyPreference,
      reviewCompanyMerge: mockReviewCompanyMerge,
      refreshCompanyIntelligence: mockRefreshCompanyIntelligence,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const mutate = handlers.get("job-finder:mutate-company-intelligence");
    const preference = handlers.get("job-finder:set-company-preference");
    const merge = handlers.get("job-finder:review-company-merge");
    const refresh = handlers.get("job-finder:refresh-company-intelligence");
    if (!mutate || !preference || !merge || !refresh) {
      throw new Error("Company intelligence handlers were not registered.");
    }
    mutateHandler = mutate;
    preferenceHandler = preference;
    mergeHandler = merge;
    refreshHandler = refresh;
  });

  it("applies a typed company intelligence mutation and returns the parsed snapshot", async () => {
    const result = await mutateHandler(
      { sender: {} },
      {
        companyId: "company_1",
        expectedUpdatedAt: "2026-08-15T10:00:00.000Z",
        mutation: {
          type: "upsert_contact",
          contact: {
            id: "contact_1",
            name: "Ada",
            role: null,
            email: null,
            phone: null,
            notes: null,
            createdAt: "2026-08-15T10:00:00.000Z",
            updatedAt: "2026-08-15T10:00:00.000Z",
          },
        },
      },
    );

    expect(mockMutateCompanyIntelligence).toHaveBeenCalledWith({
      companyId: "company_1",
      expectedUpdatedAt: "2026-08-15T10:00:00.000Z",
      mutation: {
        type: "upsert_contact",
        contact: {
          id: "contact_1",
          name: "Ada",
          role: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: "2026-08-15T10:00:00.000Z",
          updatedAt: "2026-08-15T10:00:00.000Z",
        },
      },
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a company mutation without the compare-and-swap timestamp", async () => {
    await expect(
      mutateHandler(
        { sender: {} },
        {
          companyId: "company_1",
          mutation: { type: "remove_note", noteId: "note_1" },
        },
      ),
    ).rejects.toThrow();
    expect(mockMutateCompanyIntelligence).not.toHaveBeenCalled();
  });

  it("sets a company preference and reviews a merge through typed payloads", async () => {
    await preferenceHandler(
      { sender: {} },
      { companyId: "company_1", preference: "exclude" },
    );
    expect(mockSetCompanyPreference).toHaveBeenCalledWith({
      companyId: "company_1",
      preference: "exclude",
    });

    await mergeHandler(
      { sender: {} },
      {
        companyId: "company_1",
        candidateId: "company_2",
        decision: "accepted",
      },
    );
    expect(mockReviewCompanyMerge).toHaveBeenCalledWith({
      companyId: "company_1",
      candidateId: "company_2",
      decision: "accepted",
    });
  });

  it("rejects a merge decision that is not accepted or rejected", async () => {
    await expect(
      mergeHandler(
        { sender: {} },
        { companyId: "company_1", candidateId: "company_2", decision: "maybe" },
      ),
    ).rejects.toThrow();
    expect(mockReviewCompanyMerge).not.toHaveBeenCalled();
  });

  it("refreshes company intelligence and returns the parsed snapshot", async () => {
    const result = await refreshHandler({ sender: {} }, undefined);
    expect(mockRefreshCompanyIntelligence).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ module: "job-finder" });
  });
});

describe("job-finder safeguards route", () => {
  let mutateHandler: RegisteredHandler;
  const mockMutateSafeguards = vi.fn();

  beforeEach(() => {
    mockMutateSafeguards.mockClear();
    const snapshot = createEmptyWorkspace("2026-08-15T10:00:00.000Z");
    mockMutateSafeguards.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      mutateSafeguards: mockMutateSafeguards,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const mutate = handlers.get("job-finder:mutate-safeguards");
    if (!mutate) {
      throw new Error("Safeguards mutation handler was not registered.");
    }
    mutateHandler = mutate;
  });

  it("applies a typed listing-signal safeguard mutation and returns the parsed snapshot", async () => {
    const result = await mutateHandler(
      { sender: {} },
      {
        type: "record_listing_signal",
        signalId: "signal_1",
        jobId: "job_1",
        signal: "suspicious",
        detail: null,
        detectedAt: "2026-08-15T10:00:00.000Z",
        confidence: 0.9,
        provenance: "provider",
        explanation: "Provider reported the listing state.",
        recoveryGuidance: "Re-verify the listing.",
      },
    );

    expect(mockMutateSafeguards).toHaveBeenCalledWith({
      type: "record_listing_signal",
      signalId: "signal_1",
      jobId: "job_1",
      signal: "suspicious",
      detail: null,
      detectedAt: "2026-08-15T10:00:00.000Z",
      confidence: 0.9,
      provenance: "provider",
      explanation: "Provider reported the listing state.",
      recoveryGuidance: "Re-verify the listing.",
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });

  it("rejects a safeguard mutation that attempts to carry submit authority", async () => {
    await expect(
      mutateHandler(
        { sender: {} },
        {
          type: "record_listing_signal",
          signalId: "signal_1",
          jobId: "job_1",
          signal: "stale",
          detail: null,
          detectedAt: "2026-08-15T10:00:00.000Z",
          confidence: 0.5,
          provenance: "provider",
          explanation: "Provider reported the listing state.",
          recoveryGuidance: "Re-verify the listing.",
          submitAuthorized: true,
        },
      ),
    ).rejects.toThrow();
    expect(mockMutateSafeguards).not.toHaveBeenCalled();
  });

  it("rejects an unknown safeguard mutation kind", async () => {
    await expect(
      mutateHandler({ sender: {} }, { type: "not_a_real_kind" }),
    ).rejects.toThrow();
    expect(mockMutateSafeguards).not.toHaveBeenCalled();
  });
});

describe("job-finder application CRM bulk stage route", () => {
  const mockMutateApplicationCrmBulkStage = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("validates one batch payload and returns one parsed workspace snapshot", async () => {
    const snapshot = createEmptyWorkspace("2026-08-15T10:00:00.000Z");
    mockMutateApplicationCrmBulkStage.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      mutateApplicationCrmBulkStage: mockMutateApplicationCrmBulkStage,
    });

    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);
    const handler = handlers.get(
      "job-finder:mutate-application-crm-bulk-stage",
    );
    if (!handler) {
      throw new Error("Application CRM bulk stage handler was not registered.");
    }

    const result = await handler(
      { sender: {} },
      {
        items: [
          { applicationRecordId: "application_1", expectedRevision: 2 },
          { applicationRecordId: "application_2", expectedRevision: 0 },
        ],
        stage: "reviewing",
      },
    );

    expect(mockMutateApplicationCrmBulkStage).toHaveBeenCalledWith({
      items: [
        { applicationRecordId: "application_1", expectedRevision: 2 },
        { applicationRecordId: "application_2", expectedRevision: 0 },
      ],
      stage: "reviewing",
      customStageId: null,
      note: null,
    });
    expect(result).toMatchObject({ module: "job-finder" });
  });
});

describe("job-finder agent discovery outcome routes", () => {
  const mockRunAgentDiscovery = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  function registerAndFindDiscoveryHandler(): RegisteredHandler {
    const handlers = new Map<string, RegisteredHandler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => {
        handlers.set(channel, handler);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    registerJobFinderRouteHandlers(ipcMain);

    const handler = handlers.get("job-finder:run-agent-discovery");
    if (!handler) {
      throw new Error("Agent discovery handler was not registered.");
    }
    return handler;
  }

  function workspaceWithRunState(
    generatedAt: string,
    runState: "completed" | "cancelled",
    validJobsFound: number,
  ) {
    const cancelledRun = DiscoveryRunRecordSchema.parse({
      id: `discovery_run_${runState}`,
      state: runState,
      startedAt: "2026-08-26T10:00:00.000Z",
      summary: { validJobsFound },
    });

    return JobFinderWorkspaceSnapshotSchema.parse({
      ...createEmptyWorkspace(generatedAt),
      discoveryRunState: runState,
      recentDiscoveryRuns: [cancelledRun],
    });
  }

  const sender = { id: 7, send: vi.fn() };

  it("classifies a resolved cancel-after-partial-checkpoint run as cancelled", async () => {
    // The service finalizes a user-cancelled run as state `cancelled`,
    // persists incrementally committed jobs, and resolves — no rejection.
    const snapshot = workspaceWithRunState("2026-08-26T10:05:00.000Z", "cancelled", 3);
    mockRunAgentDiscovery.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      runAgentDiscovery: mockRunAgentDiscovery,
      getWorkspaceSnapshot: mockGetWorkspaceSnapshot,
    });

    const result = await registerAndFindDiscoveryHandler()(
      { sender },
      { requestId: "agent_discovery_partial", targetId: null },
    );

    expect(result).toEqual({ outcome: "cancelled", snapshot });
    // Derivation came from the returned run state; the abort fallback never
    // ran.
    expect(mockGetWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it("classifies an escaped AbortError before any result as cancelled", async () => {
    mockRunAgentDiscovery.mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );
    const freshSnapshot = createEmptyWorkspace("2026-08-26T10:06:00.000Z");
    mockGetWorkspaceSnapshot.mockResolvedValue(freshSnapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      runAgentDiscovery: mockRunAgentDiscovery,
      getWorkspaceSnapshot: mockGetWorkspaceSnapshot,
    });

    const result = await registerAndFindDiscoveryHandler()(
      { sender },
      { requestId: "agent_discovery_abort", targetId: null },
    );

    expect(result).toEqual({ outcome: "cancelled", snapshot: freshSnapshot });
    expect(mockGetWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps outcome completed for a normally finished run", async () => {
    const snapshot = workspaceWithRunState(
      "2026-08-26T10:07:00.000Z",
      "completed",
      12,
    );
    mockRunAgentDiscovery.mockResolvedValue(snapshot);
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      runAgentDiscovery: mockRunAgentDiscovery,
      getWorkspaceSnapshot: mockGetWorkspaceSnapshot,
    });

    const result = await registerAndFindDiscoveryHandler()(
      { sender },
      { requestId: "agent_discovery_done", targetId: null },
    );

    expect(result).toEqual({ outcome: "completed", snapshot });
    expect(mockGetWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it("rethrows non-abort discovery failures instead of inventing an outcome", async () => {
    mockRunAgentDiscovery.mockRejectedValue(new Error("fetch failed"));
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      runAgentDiscovery: mockRunAgentDiscovery,
      getWorkspaceSnapshot: mockGetWorkspaceSnapshot,
    });

    await expect(
      registerAndFindDiscoveryHandler()(
        { sender },
        { requestId: "agent_discovery_failed", targetId: null },
      ),
    ).rejects.toThrow("fetch failed");
    expect(mockGetWorkspaceSnapshot).not.toHaveBeenCalled();
  });
});
