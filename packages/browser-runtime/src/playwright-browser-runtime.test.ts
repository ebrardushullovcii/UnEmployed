import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as ChildProcessModule from "node:child_process";
import { afterEach, describe, expect, test, vi } from "vitest";

const spawnMock = vi.fn();
const execFileMock = vi.fn();
const connectOverCDPMock = vi.fn();
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof ChildProcessModule>("node:child_process");
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

function withPlatform(platform: NodeJS.Platform, run: () => Promise<void>): Promise<void> {
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

function createSlowExitMockChildProcess(input: { pid: number; exitDelayMs: number }) {
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
    const userDataDir = await mkdtemp(join(tmpdir(), "unemployed-browser-runtime-close-"));

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
            throw new Error("debugger not ready yet");
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          (callback as ExecFileCallback)(null, "[]", "");
        }
      });

      spawnMock.mockImplementation((command: string) => {
        if (command === "taskkill") {
          return createMockChildProcess({ pid: 52525, emitExit: true });
        }

        return launchedChromeProcess;
      });
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } = await import("./playwright-browser-runtime");
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
      expect(spawnMock.mock.calls[0]?.[1]).toContain(`--remote-debugging-port=${debugPort}`);
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
    const userDataDir = await mkdtemp(join(tmpdir(), "unemployed-browser-runtime-windows-exit-"));

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
            throw new Error("debugger not ready yet");
          }

          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          } as Response);
        }),
      );

      execFileMock.mockImplementation((...args: unknown[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          (callback as ExecFileCallback)(null, "[]", "");
        }
      });

      spawnMock.mockImplementation((command: string) => {
        if (command === "taskkill") {
          return createMockChildProcess({ pid: 53535, emitExit: true });
        }

        return launchedChromeProcess;
      });
      connectOverCDPMock.mockResolvedValue(fakeBrowser);

      const { createBrowserAgentRuntime } = await import("./playwright-browser-runtime");
      const runtime = createBrowserAgentRuntime({
        userDataDir,
        chromeExecutablePath,
        debugPort,
      });

      await withPlatform("win32", async () => {
        await runtime.openSession("target_site");
        const closeStartedAt = Date.now();
        await runtime.closeSession("target_site");

        expect(Date.now() - closeStartedAt).toBeGreaterThanOrEqual(150);
      });

      expect(spawnMock).toHaveBeenCalledTimes(2);
      expect(spawnMock.mock.calls[1]?.[0]).toBe("taskkill");
      expect(launchedChromeProcess.exitCode).toBe(0);
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
