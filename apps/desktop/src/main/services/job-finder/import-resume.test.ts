import { mkdtemp, rm } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CandidateProfileSchema,
  JobFinderWorkspaceSnapshotSchema,
  type ResumeDocumentBundle,
  type ResumeSourceDocument,
} from "@unemployed/contracts";
import { createEmptyJobFinderRepositoryState } from "../../adapters/job-finder-initial-state";

const {
  mockMkdir,
  mockCopyFile,
  mockExtractResumeDocument,
  mockGenerateResumeVisionImages,
  mockGetJobFinderWorkspaceService,
  mockGetJobFinderDocumentsDirectory,
} = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockCopyFile: vi.fn(),
  mockExtractResumeDocument: vi.fn(),
  mockGenerateResumeVisionImages: vi.fn(),
  mockGetJobFinderWorkspaceService: vi.fn(),
  mockGetJobFinderDocumentsDirectory: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();

  return {
    ...actual,
    mkdir: mockMkdir,
    copyFile: mockCopyFile,
  };
});

vi.mock("../../adapters/resume-document", () => ({
  detectResumeDocumentFileKind: (filePath: string) => filePath.endsWith(".pdf") ? "pdf" : "txt",
  extractResumeDocument: mockExtractResumeDocument,
}));

vi.mock("../../adapters/resume-vision-images", () => ({
  generateResumeVisionImages: mockGenerateResumeVisionImages,
}));

vi.mock("./workspace-service", () => ({
  getJobFinderWorkspaceService: mockGetJobFinderWorkspaceService,
}));

vi.mock("./paths", () => ({
  getJobFinderDocumentsDirectory: mockGetJobFinderDocumentsDirectory,
}));

function createTestBundle(fullText: string): ResumeDocumentBundle {
  return {
    id: "bundle_test",
    runId: "run_test",
    sourceResumeId: "resume_test",
    sourceFileKind: "pdf",
    primaryParserKind: "pdfjs_text",
    parserKinds: ["pdfjs_text"],
    createdAt: "2026-04-10T00:00:00.000Z",
    warnings: [],
    languageHints: [],
    pages: [
      {
        pageNumber: 1,
        text: fullText,
        charCount: fullText.length,
        parserKinds: ["pdfjs_text"],
        usedOcr: false,
        routeKind: "native_first",
        quality: {
          score: 0.9,
          textDensity: 0.9,
          tokenCount: fullText.split(/\s+/).filter(Boolean).length,
          lineCount: fullText.split(/\r?\n/).filter(Boolean).length,
          blockCount: fullText.split(/\r?\n/).filter(Boolean).length,
          columnLikelihood: 0.08,
          readingOrderConfidence: 0.95,
          nativeTextCoverage: 1,
          ocrConfidence: null,
          imageCoverageRatio: 0,
          invalidUnicodeRatio: 0,
        },
        qualityWarnings: [],
      },
    ],
    blocks: fullText.split(/\r?\n/).filter(Boolean).map((text, index) => ({
      id: `page_1_block_${index + 1}`,
      pageNumber: 1,
      readingOrder: index,
      text,
      kind: index === 0 ? "heading" : "paragraph",
      sectionHint: index === 0 ? "identity" : "other",
      bbox: null,
      sourceParserKinds: ["pdfjs_text"],
      sourceConfidence: 0.9,
      parserLineage: ["pdfjs_text"],
      readingOrderConfidence: 0.94,
      lineIds: [`line_${index + 1}`],
      textSpan: null,
    })),
    fullText,
    route: {
      routeKind: "native_first",
      triageReasons: ["test_fixture"],
      preferredExecutors: ["pdfjs_text"],
      usedExecutors: ["pdfjs_text"],
    },
    parserManifest: {
      workerKind: "embedded_node",
      workerVersion: process.versions.node,
      manifestVersion: "019-test-v1",
      runtimeLabel: "vitest",
      availableCapabilities: ["resume_import"],
      executorVersions: { pdfjs_text: process.versions.node },
    },
    quality: {
      score: 0.9,
      textDensity: 0.9,
      tokenCount: fullText.split(/\s+/).filter(Boolean).length,
      lineCount: fullText.split(/\r?\n/).filter(Boolean).length,
      blockCount: fullText.split(/\r?\n/).filter(Boolean).length,
      columnLikelihood: 0.08,
      readingOrderConfidence: 0.95,
      nativeTextCoverage: 1,
      ocrConfidence: null,
      imageCoverageRatio: 0,
      invalidUnicodeRatio: 0,
    },
    qualityWarnings: [],
  };
}

function createSnapshot(baseResume: ResumeSourceDocument) {
  const state = createEmptyJobFinderRepositoryState();
  return JobFinderWorkspaceSnapshotSchema.parse({
    module: "job-finder",
    generatedAt: "2026-04-10T00:00:00.000Z",
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
    profile: CandidateProfileSchema.parse({
      ...state.profile,
      baseResume,
    }),
    searchPreferences: state.searchPreferences,
    profileSetupState: state.profileSetupState,
    browserSession: {
      source: "target_site",
      status: "ready",
      driver: "catalog_seed",
      label: "Ready",
      detail: "Ready",
      lastCheckedAt: "2026-04-10T00:00:00.000Z",
    },
    sourceAccessPrompts: [],
    discoverySessions: [],
    discoveryRunState: "idle",
    activeDiscoveryRun: null,
    recentDiscoveryRuns: [],
    activeSourceDebugRun: null,
    recentSourceDebugRuns: [],
    discoveryJobs: [],
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
  });
}

async function createTempResumeFile() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "unemployed-import-resume-test-"));
  const filePath = path.join(directory, "resume.pdf");
  return { directory, filePath };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("importResumeFromSourcePath", () => {
  test("skips local image generation when scripted comparison disables vision", async () => {
    const { importResumeFromSourcePath } = await import("./import-resume");
    const { directory, filePath } = await createTempResumeFile();
    const targetDirectory = path.join(directory, "target");
    const bundle = createTestBundle("Jamie Rivers\nStaff Frontend Engineer");
    const workspaceService = {
      runResumeImport: vi.fn(({ baseResume }: { baseResume: ResumeSourceDocument }) => Promise.resolve(createSnapshot(baseResume))),
      getWorkspaceSnapshot: vi.fn(),
      saveProfile: vi.fn(),
    };

    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockGetJobFinderDocumentsDirectory.mockReturnValue(targetDirectory);
    mockGetJobFinderWorkspaceService.mockResolvedValue(workspaceService);
    mockExtractResumeDocument.mockResolvedValue({
      textContent: bundle.fullText,
      bundle,
      warnings: [],
    });

    await importResumeFromSourcePath(filePath, { useVision: false });

    expect(mockGenerateResumeVisionImages).not.toHaveBeenCalled();
    expect(workspaceService.runResumeImport).toHaveBeenCalledWith(
      expect.objectContaining({ visionArtifact: null }),
    );

    await rm(directory, { recursive: true, force: true });
  });

  test("generates vision artifacts by default", async () => {
    const { importResumeFromSourcePath } = await import("./import-resume");
    const { directory, filePath } = await createTempResumeFile();
    const targetDirectory = path.join(directory, "target");
    const bundle = createTestBundle("Jamie Rivers\nStaff Frontend Engineer");
    const workspaceService = {
      runResumeImport: vi.fn(({ baseResume }: { baseResume: ResumeSourceDocument }) => Promise.resolve(createSnapshot(baseResume))),
      getWorkspaceSnapshot: vi.fn(),
      saveProfile: vi.fn(),
    };
    const visionArtifact = {
      id: "vision_artifact_test",
      runId: "run_test",
      sourceResumeId: "resume_test",
      sourceFileKind: "pdf",
      createdAt: "2026-04-10T00:00:00.000Z",
      retained: "temporary",
      pages: [],
      warnings: [],
    };

    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockGetJobFinderDocumentsDirectory.mockReturnValue(targetDirectory);
    mockGetJobFinderWorkspaceService.mockResolvedValue(workspaceService);
    mockExtractResumeDocument.mockResolvedValue({
      textContent: bundle.fullText,
      bundle,
      warnings: [],
    });
    mockGenerateResumeVisionImages.mockResolvedValue({ artifact: visionArtifact, warnings: [] });

    await importResumeFromSourcePath(filePath);

    expect(mockGenerateResumeVisionImages).toHaveBeenCalledTimes(1);
    expect(workspaceService.runResumeImport).toHaveBeenCalledWith(
      expect.objectContaining({ visionArtifact }),
    );

    await rm(directory, { recursive: true, force: true });
  });
});
