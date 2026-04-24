import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as childProcess from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JobFinderAiClient } from "@unemployed/ai-providers";
import { afterEach, describe, expect, test, vi } from "vitest";

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
          ready: true,
          label: "Test AI client ready",
          model: null,
          baseUrl: null,
          modelContextWindowTokens: null,
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
});
