import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import type * as childProcess from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobFinderAiClient } from "@unemployed/ai-providers";
import {
  BrowserVisualObservationSetSchema,
  type BrowserVisualAnalysisInput,
  type BrowserVisualObservationSet,
} from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

function createTestJob() {
  return {
    id: "job_visual_runtime",
    source: "target_site" as const,
    sourceJobId: "job_visual_runtime",
    discoveryMethod: "catalog_seed" as const,
    collectionMethod: "fallback_search" as const,
    canonicalUrl: "https://example.com/jobs/job_visual_runtime",
    applicationUrl: "https://example.com/apply/job_visual_runtime",
    title: "Senior Engineer",
    company: "Example Co",
    location: "Remote",
    workMode: ["remote" as const],
    applyPath: "external_redirect" as const,
    easyApplyEligible: false,
    postedAt: "2026-03-20T09:00:00.000Z",
    postedAtText: null,
    discoveredAt: "2026-03-20T10:00:00.000Z",
    firstSeenAt: null,
    lastSeenAt: null,
    lastVerifiedActiveAt: null,
    salaryText: null,
    normalizedCompensation: {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    },
    summary: "Build resilient workflows.",
    description: "Upload resume and review required fields before final submit.",
    keySkills: ["TypeScript"],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: "pass" as const,
    sourceIntelligence: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: [],
      requiresConsentInterrupt: null,
      requiresConsentInterruptKind: null,
    },
    keywordSignals: [],
    benefits: [],
    status: "approved" as const,
    matchAssessment: {
      score: 91,
      reasons: ["Strong fit"],
      gaps: [],
    },
    provenance: [],
  };
}

function createTestProfile() {
  return {
    id: "candidate_1",
    firstName: "Alex",
    lastName: "Vanguard",
    middleName: null,
    fullName: "Alex Vanguard",
    preferredDisplayName: null,
    headline: "Senior systems designer",
    summary: "Builds resilient workflows.",
    currentLocation: "Remote",
    currentCity: null,
    currentRegion: null,
    currentCountry: null,
    timeZone: null,
    yearsExperience: 10,
    email: "alex@example.com",
    secondaryEmail: null,
    phone: "+44 7700 900123",
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    narrative: {
      professionalStory: "Builds resilient workflows.",
      nextChapterSummary: "Open to workflow roles.",
      careerTransitionSummary: null,
      differentiators: [],
      motivationThemes: [],
    },
    proofBank: [],
    answerBank: {
      workAuthorization: null,
      visaSponsorship: null,
      relocation: null,
      travel: null,
      noticePeriod: null,
      availability: null,
      salaryExpectations: null,
      selfIntroduction: null,
      careerTransition: null,
      customAnswers: [],
    },
    applicationIdentity: {
      preferredEmail: "alex@example.com",
      preferredPhone: "+44 7700 900123",
      preferredLinkIds: [],
    },
    baseResume: {
      id: "resume_1",
      fileName: "alex-vanguard.pdf",
      uploadedAt: "2026-03-20T10:00:00.000Z",
      storagePath: null,
      textContent: null,
      textUpdatedAt: null,
      extractionStatus: "not_started" as const,
      lastAnalyzedAt: null,
      analysisProviderKind: null,
      analysisProviderLabel: null,
      analysisWarnings: [],
    },
    workEligibility: {
      authorizedWorkCountries: [],
      requiresVisaSponsorship: null,
      willingToRelocate: null,
      preferredRelocationRegions: [],
      willingToTravel: null,
      remoteEligible: null,
      noticePeriodDays: null,
      availableStartDate: null,
      securityClearance: null,
    },
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: [],
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: [],
    },
    targetRoles: [],
    locations: [],
    skills: [],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
  };
}

function createTestSettings() {
  return {
    resumeFormat: "pdf" as const,
    resumeTemplateId: "classic_ats" as const,
    fontPreset: "inter_requisite" as const,
    appearanceTheme: "system" as const,
    humanReviewRequired: true,
    allowAutoSubmitOverride: false,
    keepSessionAlive: false,
    discoveryOnly: false,
  };
}

function createTestResumeExport() {
  return {
    id: "resume_export_visual_runtime",
    draftId: "resume_draft_visual_runtime",
    jobId: "job_visual_runtime",
    format: "pdf" as const,
    filePath: "/tmp/alex-vanguard.pdf",
    pageCount: 2,
    templateId: "classic_ats" as const,
    exportedAt: "2026-03-20T10:00:00.000Z",
    isApproved: true,
  };
}

const spawnMock = vi.fn();
const execFileMock = vi.fn();
const connectOverCDPMock = vi.fn();
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "platform",
);

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
    spawn: spawnMock,
  };
});

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: connectOverCDPMock,
  },
}));

function withPlatform(
  platform: NodeJS.Platform,
  run: () => Promise<void>,
): Promise<void> {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });

  return run().finally(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });
}

function createMockChildProcess(input: { pid: number; emitExit?: boolean }) {
  const processEmitter = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    killed: boolean;
    unref: () => void;
    kill: () => boolean;
  };
  processEmitter.pid = input.pid;
  processEmitter.exitCode = null;
  processEmitter.killed = false;
  processEmitter.unref = () => undefined;
  processEmitter.kill = () => {
    processEmitter.killed = true;
    processEmitter.exitCode = 0;
    processEmitter.emit("exit", 0);
    return true;
  };

  if (input.emitExit) {
    queueMicrotask(() => {
      processEmitter.exitCode = 0;
      processEmitter.emit("exit", 0);
    });
  }

  return processEmitter;
}

function createSlowExitMockChildProcess(input: {
  pid: number;
  exitDelayMs: number;
}) {
  const processEmitter = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    killed: boolean;
    unref: () => void;
    kill: () => boolean;
  };
  processEmitter.pid = input.pid;
  processEmitter.exitCode = null;
  processEmitter.killed = false;
  processEmitter.unref = () => undefined;
  processEmitter.kill = () => {
    processEmitter.killed = true;
    setTimeout(() => {
      processEmitter.exitCode = 0;
      processEmitter.emit("exit", 0);
    }, input.exitDelayMs);
    return true;
  };

  return processEmitter;
}

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

function maybeInvokeExecFileCallback(args: unknown[]) {
  const callback = args[args.length - 1];
  if (typeof callback === "function") {
    (callback as ExecFileCallback)(null, "[]", "");
  }
}

async function reserveFreePort(): Promise<number> {
  const server = net.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  if (!port) {
    throw new Error("Failed to reserve a free TCP port for the runtime test.");
  }

  return port;
}

describe("playwright browser runtime", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    spawnMock.mockReset();
    execFileMock.mockReset();
    connectOverCDPMock.mockReset();

    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  test("closeSession still terminates an owned Chrome process after browser disconnect reset", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-close-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 42424 });
      let disconnectedHandler: (() => void) | null = null;

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(() => {
          disconnectedHandler?.();
          launchedChromeProcess.kill();
          return Promise.resolve();
        }),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn((event: string, callback: () => void) => {
          if (event === "disconnected") {
            disconnectedHandler = callback;
          }
          return fakeBrowser;
        }),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockImplementation((command: string) => {
        if (command === "taskkill") {
          return createMockChildProcess({ pid: 52525, emitExit: true });
        }

        return launchedChromeProcess;
      });
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await withPlatform("win32", async () => {
        await runtime.openSession("target_site");
        const closedState = await runtime.closeSession("target_site");

        expect(closedState.label).toBe("Browser profile closed");
      });

      expect(fakeBrowser.close).toHaveBeenCalledTimes(1);
      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(spawnMock.mock.calls[0]?.[0]).toBe(chromeExecutablePath);
      expect(spawnMock.mock.calls[0]?.[1]).toContain(
        `--remote-debugging-port=${debugPort}`,
      );
      expect(spawnMock.mock.calls[1]?.[0]).toBe("taskkill");
      expect(spawnMock.mock.calls[1]?.[1]).toEqual([
        "/PID",
        String(launchedChromeProcess.pid),
        "/T",
        "/F",
      ]);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("captures an in-memory viewport visual snapshot through Playwright", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-visual-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 42425 });
      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
        title: vi.fn().mockResolvedValue("Example jobs"),
        viewportSize: () => ({ width: 1440, height: 900 }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn().mockResolvedValue(undefined),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response),
        ),
      );
      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });
      spawnMock.mockImplementation((command: string) => {
        if (command === "taskkill") {
          return createMockChildProcess({ pid: 52526, emitExit: true });
        }

        return launchedChromeProcess;
      });
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      const snapshot = await runtime.captureVisualSnapshot!("target_site", {
        purpose: "source_debug",
        mode: "viewport",
        label: "Search page visual evidence",
        reason: "Weak DOM extraction needs visible page context.",
        region: null,
        retention: {
          retention: "temporary",
          redactionLevel: "standard",
          reason: "Temporary analysis input only.",
          expiresAt: null,
        },
      });

      expect(snapshot.url).toBe("https://example.com/jobs");
      expect(snapshot.pageTitle).toBe("Example jobs");
      expect(snapshot.dataUrl).toBe(
        `data:image/png;base64,${Buffer.from("fake-png").toString("base64")}`,
      );
      expect(snapshot.viewport?.width).toBe(1440);
      expect(fakePage.screenshot).toHaveBeenCalledWith({
        type: "png",
        animations: "disabled",
        timeout: 10_000,
        fullPage: false,
      });
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("retains visual snapshots with metadata and cleans expired files", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-visual-retained-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 42426 });
      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
        title: vi.fn().mockResolvedValue("Example jobs"),
        viewportSize: () => ({ width: 1440, height: 900 }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from("retained-png")),
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn().mockResolvedValue(undefined),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };
      const visualDir = join(userDataDir, "visual-snapshots");
      await writeFile(join(userDataDir, "placeholder.txt"), "", "utf8");

      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response),
        ),
      );
      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });
      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await mkdir(visualDir, { recursive: true });
      const expiredPath = join(visualDir, "expired.png");
      const expiredMetadataPath = join(visualDir, "expired.json");
      await writeFile(expiredPath, "expired", "utf8");
      await writeFile(
        expiredMetadataPath,
        JSON.stringify({ expiresAt: "2000-01-01T00:00:00.000Z" }),
        "utf8",
      );

      const snapshot = await runtime.captureVisualSnapshot!("target_site", {
        purpose: "source_debug",
        mode: "viewport",
        label: "Search page visual evidence",
        reason: "Weak DOM extraction needs visible page context.",
        region: null,
        retention: {
          retention: "retained",
          redactionLevel: "standard",
          reason: "Retained source-debug evidence explains a blocker.",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      });

      expect(snapshot.storagePath).toMatch(/visual-snapshots/);
      const files = await readdir(visualDir);
      expect(files.some((file) => file.endsWith(".png"))).toBe(true);
      expect(files.some((file) => file.endsWith(".json"))).toBe(true);
      expect(files).not.toContain("expired.png");
      expect(files).not.toContain("expired.json");
      const retainedStats = await stat(snapshot.storagePath!);
      expect(retainedStats.size).toBeGreaterThan(0);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("does not capture apply-page screenshots unless caller explicitly opts in", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-apply-visual-opt-in-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 42427 });
      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/apply/job_visual_runtime",
        title: vi.fn().mockResolvedValue("Apply"),
        viewportSize: () => ({ width: 1440, height: 900 }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from("apply-png")),
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn().mockResolvedValue(undefined),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };
      const visualObservationSet = BrowserVisualObservationSetSchema.parse({
        id: "visual_observation_apply_runtime",
        snapshotId: "visual_snapshot_apply_runtime",
        observedAt: "2026-03-20T10:00:00.000Z",
        url: "https://example.com/apply/job_visual_runtime",
        purpose: "apply_checkpoint",
        providerKind: "deterministic",
        providerLabel: "Test visual analyzer",
        summary: "Visible resume upload context.",
        blockers: [],
        visibleControls: [],
        jobCardClues: [],
        applyPathClues: [],
        fieldControls: ["Resume upload context is visible."],
        validationErrors: [],
        buttonStates: [],
        recoveryNotes: [],
        uncertainty: [],
        observations: [],
        questionContexts: [],
        reconciliations: [],
        rejectedOutputReasons: [],
      });
      const analyzeBrowserVisualSnapshot = vi
        .fn<
          (input: BrowserVisualAnalysisInput) => Promise<BrowserVisualObservationSet>
        >()
        .mockResolvedValue(visualObservationSet);

      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response),
        ),
      );
      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });
      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
        aiClient: {
          getStatus: () => ({
            kind: "deterministic",
            role: "chat",
            ready: true,
            label: "Test visual analyzer",
            model: null,
            baseUrl: null,
            modelContextWindowTokens: null,
            reservedHeadroomTokens: null,
            requestTimeoutMs: null,
            detail: null,
          }),
          analyzeBrowserVisualSnapshot,
        } as unknown as JobFinderAiClient,
      });

      const input = {
        job: createTestJob(),
        resumeExport: createTestResumeExport(),
        resumeFilePath: "/tmp/alex-vanguard.pdf",
        profile: createTestProfile(),
        settings: createTestSettings(),
        mode: "prepare_only" as const,
      };
      const defaultResult = await runtime.executeApplicationFlow(
        "target_site",
        input,
      );

      expect(defaultResult.visualEvidence).toEqual([]);
      expect(defaultResult.visualObservationSets).toEqual([]);
      expect(defaultResult.visualCheckpoints).toEqual([]);
      expect(fakePage.screenshot).not.toHaveBeenCalled();
      expect(analyzeBrowserVisualSnapshot).not.toHaveBeenCalled();

      const optedInResult = await runtime.executeApplicationFlow(
        "target_site",
        {
          ...input,
          captureVisualSnapshot: (request) =>
            runtime.captureVisualSnapshot!("target_site", request),
          analyzeVisualSnapshot: (analysisInput: BrowserVisualAnalysisInput) =>
            analyzeBrowserVisualSnapshot({
              ...analysisInput,
              snapshot: {
                ...analysisInput.snapshot,
                id: "visual_snapshot_apply_runtime",
              },
            }),
        },
      );

      expect(optedInResult.visualEvidence[0]?.summary).toContain(
        "Visible resume upload context",
      );
      expect(fakePage.screenshot).toHaveBeenCalledTimes(1);
      expect(analyzeBrowserVisualSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("closeSession waits for owned Windows Chrome exit after taskkill returns", async () => {
    vi.useFakeTimers();
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-windows-exit-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createSlowExitMockChildProcess({
        pid: 43434,
        exitDelayMs: 200,
      });
      let disconnectedHandler: (() => void) | null = null;

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(() => {
          disconnectedHandler?.();
          launchedChromeProcess.kill();
          return Promise.resolve();
        }),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn((event: string, callback: () => void) => {
          if (event === "disconnected") {
            disconnectedHandler = callback;
          }
          return fakeBrowser;
        }),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockImplementation((command: string) => {
        if (command === "taskkill") {
          return createMockChildProcess({ pid: 53535, emitExit: true });
        }

        return launchedChromeProcess;
      });
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await withPlatform("win32", async () => {
        await runtime.openSession("target_site");
        const closePromise = runtime.closeSession("target_site");
        await vi.advanceTimersByTimeAsync(150);
        // Verify the close promise is still pending until Chrome exits.
        await expect(
          Promise.race([
            closePromise.then(() => "closed"),
            Promise.resolve("pending"),
          ]),
        ).resolves.toBe("pending");
        await vi.advanceTimersByTimeAsync(50);
        await expect(closePromise).resolves.toEqual(
          expect.objectContaining({ label: "Browser profile closed" }),
        );
      });

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(spawnMock.mock.calls[1]?.[0]).toBe("taskkill");
      expect(launchedChromeProcess.exitCode).toBe(0);
    } finally {
      vi.useRealTimers();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("resolveLivePage avoids focus churn when the session is already ready", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-resolve-live-page-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 54545 });

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
        goto: vi.fn().mockResolvedValue(undefined),
      };
      const fakeContext = {
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const mockAiClient = {
        chatWithTools: vi
          .fn()
          .mockResolvedValue({ content: "done", toolCalls: [] }),
        getStatus: () => ({
          kind: "deterministic",
          role: "chat",
          ready: true,
          label: "Test AI client ready",
          model: null,
          baseUrl: null,
          modelContextWindowTokens: null,
          reservedHeadroomTokens: null,
          requestTimeoutMs: null,
          detail: null,
        }),
      } satisfies Pick<JobFinderAiClient, "chatWithTools" | "getStatus">;
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
        aiClient: mockAiClient as unknown as JobFinderAiClient,
        jobExtractor: vi.fn().mockResolvedValue([]),
      });

      await runtime.openSession("target_site");
      fakePage.bringToFront.mockClear();

      await runtime.runAgentDiscovery!("target_site", {
        maxSteps: 1,
        targetJobCount: 1,
        userProfile: {
          id: "candidate_1",
          firstName: "Alex",
          lastName: "Vanguard",
          middleName: null,
          fullName: "Alex Vanguard",
          preferredDisplayName: null,
          headline: "Senior systems designer",
          summary: "Builds resilient workflows.",
          currentLocation: "Remote",
          currentCity: null,
          currentRegion: null,
          currentCountry: null,
          timeZone: null,
          yearsExperience: 10,
          email: "alex@example.com",
          secondaryEmail: null,
          phone: "+44 7700 900123",
          portfolioUrl: null,
          linkedinUrl: null,
          githubUrl: null,
          personalWebsiteUrl: null,
          narrative: {
            professionalStory: "Builds resilient workflows.",
            nextChapterSummary: "Open to workflow roles.",
            careerTransitionSummary: null,
            differentiators: [],
            motivationThemes: [],
          },
          proofBank: [],
          answerBank: {
            workAuthorization: null,
            visaSponsorship: null,
            relocation: null,
            travel: null,
            noticePeriod: null,
            availability: null,
            salaryExpectations: null,
            selfIntroduction: null,
            careerTransition: null,
            customAnswers: [],
          },
          applicationIdentity: {
            preferredEmail: "alex@example.com",
            preferredPhone: "+44 7700 900123",
            preferredLinkIds: [],
          },
          baseResume: {
            id: "resume_1",
            fileName: "alex-vanguard.pdf",
            uploadedAt: "2026-03-20T10:00:00.000Z",
            storagePath: null,
            textContent: null,
            textUpdatedAt: null,
            extractionStatus: "not_started",
            lastAnalyzedAt: null,
            analysisProviderKind: null,
            analysisProviderLabel: null,
            analysisWarnings: [],
          },
          workEligibility: {
            authorizedWorkCountries: [],
            requiresVisaSponsorship: null,
            willingToRelocate: null,
            preferredRelocationRegions: [],
            willingToTravel: null,
            remoteEligible: null,
            noticePeriodDays: null,
            availableStartDate: null,
            securityClearance: null,
          },
          professionalSummary: {
            shortValueProposition: null,
            fullSummary: null,
            careerThemes: [],
            leadershipSummary: null,
            domainFocusSummary: null,
            strengths: [],
          },
          skillGroups: {
            coreSkills: [],
            tools: [],
            languagesAndFrameworks: [],
            softSkills: [],
            highlightedSkills: [],
          },
          targetRoles: [],
          locations: [],
          skills: [],
          experiences: [],
          education: [],
          certifications: [],
          links: [],
          projects: [],
          spokenLanguages: [],
        },
        searchPreferences: { targetRoles: [], locations: [] },
        startingUrls: ["https://example.com/jobs"],
        navigationHostnames: ["example.com"],
        siteLabel: "Example Jobs",
      });

      expect(fakePage.bringToFront).not.toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("runAgentDiscovery navigates the visible blank startup tab to the starting url before agent work", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-agent-visible-blank-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 54646 });

      let blankPageUrl = "about:blank";
      const blankPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn((url: string) => {
          blankPageUrl = url;
          return Promise.resolve(undefined);
        }),
        isClosed: () => false,
        url: () => blankPageUrl,
      };
      const backgroundLivePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://previous.example/jobs",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(blankPage),
        pages: () => [blankPage, backgroundLivePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const mockAiClient = {
        chatWithTools: vi
          .fn()
          .mockResolvedValue({ content: "done", toolCalls: [] }),
        getStatus: () => ({
          kind: "deterministic",
          role: "chat",
          ready: true,
          label: "Test AI client ready",
          model: null,
          baseUrl: null,
          modelContextWindowTokens: null,
          reservedHeadroomTokens: null,
          requestTimeoutMs: null,
          detail: null,
        }),
      } satisfies Pick<JobFinderAiClient, "chatWithTools" | "getStatus">;
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
        aiClient: mockAiClient as unknown as JobFinderAiClient,
        jobExtractor: vi.fn().mockResolvedValue([]),
      });

      await runtime.runAgentDiscovery!("target_site", {
        maxSteps: 1,
        targetJobCount: 1,
        userProfile: createTestProfile(),
        searchPreferences: { targetRoles: [], locations: [] },
        startingUrls: ["https://example.com/jobs"],
        navigationHostnames: ["example.com"],
        siteLabel: "Example Jobs",
      });

      expect(fakeContext.newPage).not.toHaveBeenCalled();
      expect(blankPage.goto).toHaveBeenCalledWith("https://example.com/jobs", {
        waitUntil: "domcontentloaded",
      });
      expect(blankPage.bringToFront).toHaveBeenCalled();
      expect(backgroundLivePage.goto).not.toHaveBeenCalled();
      expect(backgroundLivePage.bringToFront).not.toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("runAgentDiscovery reuses an already-open matching page instead of navigating a blank tab", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-agent-ready-blank-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 54747 });

      let blankPageUrl = "about:blank";
      const blankPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn((url: string) => {
          blankPageUrl = url;
          return Promise.resolve(undefined);
        }),
        isClosed: () => false,
        url: () => blankPageUrl,
      };
      const backgroundTargetPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(blankPage),
        pages: () => [blankPage, backgroundTargetPage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const mockAiClient = {
        chatWithTools: vi
          .fn()
          .mockResolvedValue({ content: "done", toolCalls: [] }),
        getStatus: () => ({
          kind: "deterministic",
          role: "chat",
          ready: true,
          label: "Test AI client ready",
          model: null,
          baseUrl: null,
          modelContextWindowTokens: null,
          reservedHeadroomTokens: null,
          requestTimeoutMs: null,
          detail: null,
        }),
      } satisfies Pick<JobFinderAiClient, "chatWithTools" | "getStatus">;
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
        aiClient: mockAiClient as unknown as JobFinderAiClient,
        jobExtractor: vi.fn().mockResolvedValue([]),
      });

      await runtime.openSession("target_site");
      blankPageUrl = "about:blank";
      blankPage.goto.mockClear();
      blankPage.bringToFront.mockClear();
      backgroundTargetPage.bringToFront.mockClear();

      await runtime.runAgentDiscovery!("target_site", {
        maxSteps: 1,
        targetJobCount: 1,
        userProfile: createTestProfile(),
        searchPreferences: { targetRoles: [], locations: [] },
        startingUrls: ["https://example.com/jobs"],
        navigationHostnames: ["example.com"],
        siteLabel: "Example Jobs",
      });

      // The agent navigates the selected page to the starting URL at startup
      expect(backgroundTargetPage.goto).toHaveBeenCalledWith(
        "https://example.com/jobs",
        { waitUntil: "domcontentloaded" },
      );
      // The blank tab is left completely untouched
      expect(blankPage.goto).not.toHaveBeenCalled();
      expect(backgroundTargetPage.bringToFront).not.toHaveBeenCalled();
      expect(blankPage.bringToFront).not.toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("openSession reuses an existing blank startup tab instead of creating a third tab", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-blank-reuse-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 55555 });

      const closedBlankPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => true,
        url: () => "about:blank",
      };
      const openBlankPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "about:blank",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(openBlankPage),
        pages: () => [closedBlankPage, openBlankPage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await runtime.openSession("target_site");

      expect(fakeContext.newPage).not.toHaveBeenCalled();
      expect(openBlankPage.bringToFront).toHaveBeenCalledTimes(1);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("openSession can navigate the shared browser profile to a specific target url", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-target-open-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 56565 });

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "about:blank",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(fakePage),
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await runtime.openSession("target_site", {
        targetUrl: "https://example.com/jobs/sign-in",
      });

      expect(fakePage.goto).toHaveBeenCalledWith(
        "https://example.com/jobs/sign-in",
        { waitUntil: "domcontentloaded" },
      );
      expect(fakePage.bringToFront).toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("openSession navigates a visible blank startup tab even when another live page exists", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-target-visible-blank-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 56665 });

      const blankPage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "about:blank",
      };
      const backgroundLivePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://previous.example/jobs",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(blankPage),
        pages: () => [blankPage, backgroundLivePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await runtime.openSession("target_site", {
        targetUrl: "https://example.com/jobs",
      });

      expect(fakeContext.newPage).not.toHaveBeenCalled();
      expect(blankPage.goto).toHaveBeenCalledWith("https://example.com/jobs", {
        waitUntil: "domcontentloaded",
      });
      expect(blankPage.bringToFront).toHaveBeenCalled();
      expect(backgroundLivePage.bringToFront).not.toHaveBeenCalled();
      expect(backgroundLivePage.goto).not.toHaveBeenCalled();
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("openSession skips navigation when the current and target urls are structurally equivalent", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-equivalent-target-open-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 57575 });

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        isClosed: () => false,
        url: () => "https://example.com/jobs/search/?keywords=frontend&currentJobId=123#top",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(fakePage),
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await runtime.openSession("target_site", {
        targetUrl: "https://example.com/jobs/search/?keywords=frontend",
      });

      expect(fakePage.goto).not.toHaveBeenCalled();
      expect(fakePage.bringToFront).toHaveBeenCalledTimes(1);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });

  test("openSession marks the session blocked when navigation fails", async () => {
    const userDataDir = await mkdtemp(
      join(tmpdir(), "unemployed-browser-runtime-target-open-failure-"),
    );

    try {
      const chromeExecutablePath = join(userDataDir, "chrome.exe");
      await writeFile(chromeExecutablePath, "", "utf8");
      const debugPort = await reserveFreePort();
      const launchedChromeProcess = createMockChildProcess({ pid: 58585 });

      const fakePage = {
        bringToFront: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockRejectedValue(new Error("navigation failed")),
        isClosed: () => false,
        url: () => "about:blank",
      };
      const fakeContext = {
        newPage: vi.fn().mockResolvedValue(fakePage),
        pages: () => [fakePage],
      };
      const fakeBrowser = {
        close: vi.fn(),
        contexts: () => [fakeContext],
        isConnected: () => true,
        once: vi.fn(() => fakeBrowser),
      };

      let debuggerReadyChecks = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          debuggerReadyChecks += 1;
          if (debuggerReadyChecks === 1) {
            return Promise.reject(new Error("debugger not ready yet"));
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        maybeInvokeExecFileCallback(args);
      });

      spawnMock.mockReturnValue(launchedChromeProcess);
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } =
        await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await expect(
        runtime.openSession("target_site", {
          targetUrl: "https://example.com/jobs/sign-in",
        }),
      ).rejects.toThrow("navigation failed");
      await expect(runtime.getSessionState("target_site")).resolves.toEqual(
        expect.objectContaining({
          status: "blocked",
          label: "Browser navigation failed",
        }),
      );
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
