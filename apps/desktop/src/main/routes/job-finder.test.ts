import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMain } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationPacketSchema,
  JobFinderWorkspaceSnapshotSchema,
  ResumeQualityBenchmarkReportSchema,
} from "@unemployed/contracts";
import { createEmptyJobFinderRepositoryState } from "../adapters/job-finder-initial-state";

type RegisteredHandler = (
  event: { sender: object },
  payload: unknown,
) => Promise<unknown>;

const {
  mockBuildApplicationPacket,
  mockGetWorkspaceSnapshot,
  mockGetJobFinderWorkspaceService,
  mockIsDesktopTestApiEnabled,
  mockProposeProfileCopilotChange,
  mockQueueJobForReview,
  mockRunDesktopResumeQualityBenchmark,
  mockShowSaveDialog,
} = vi.hoisted(() => ({
  mockBuildApplicationPacket: vi.fn(),
  mockGetWorkspaceSnapshot: vi.fn(),
  mockGetJobFinderWorkspaceService: vi.fn(),
  mockIsDesktopTestApiEnabled: vi.fn(() => false),
  mockProposeProfileCopilotChange: vi.fn(),
  mockQueueJobForReview: vi.fn(),
  mockRunDesktopResumeQualityBenchmark: vi.fn(),
  mockShowSaveDialog: vi.fn(),
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

function createEmptyWorkspace(generatedAt: string) {
  const state = createEmptyJobFinderRepositoryState();

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
  });
}

describe("job-finder application packet export route", () => {
  let temporaryDirectory: string;
  let exportHandler: RegisteredHandler;
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
    mockQueueJobForReview.mockResolvedValue(
      createEmptyWorkspace("2026-08-09T10:01:00.000Z"),
    );
    mockGetJobFinderWorkspaceService.mockResolvedValue({
      buildApplicationPacket: mockBuildApplicationPacket,
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
      !registeredProfileCopilotHandler
    ) {
      throw new Error("Workspace delta handlers were not registered.");
    }
    syncHandler = registeredSyncHandler;
    entityMutationHandler = registeredEntityMutationHandler;
    profileCopilotHandler = registeredProfileCopilotHandler;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it("returns cancelled without writing when the save dialog is cancelled", async () => {
    mockShowSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });

    const result = await exportHandler(
      { sender: {} },
      { runId: "run-1", jobId: "job-1" },
    );

    expect(result).toEqual({ status: "cancelled" });
    expect(mockBuildApplicationPacket).toHaveBeenCalledWith("run-1", "job-1");
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
      { runId: "run-1", jobId: "job-1" },
    );

    expect(result).toEqual({ status: "saved" });
    const savedContents = await readFile(`${selectedPath}.json`, "utf8");
    expect(savedContents).toBe(`${JSON.stringify(packet, null, 2)}\n`);
    expect(JSON.parse(savedContents)).toEqual(packet);
  });

  it("returns a typed delta for a bounded entity mutation", async () => {
    const initial = await syncHandler(
      { sender: {} },
      { baseRevision: null },
    );
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
