import { afterEach, describe, expect, test, vi } from "vitest";
import {
  bindMainWindowLifecycle,
  type MainWindowFailure,
  type MainWindowRecoveryChoice,
} from "./main-window-lifecycle";

type EventListener = (...args: unknown[]) => void;

function createWindowHarness() {
  const listeners = new Map<string, EventListener>();
  const webContents = {
    isDestroyed: vi.fn(() => false),
    on: vi.fn((eventName: string, listener: EventListener) => {
      listeners.set(eventName, listener);
    }),
    removeListener: vi.fn((eventName: string) => {
      listeners.delete(eventName);
    }),
  };

  return {
    window: { webContents } as never,
    emit(eventName: string, ...args: unknown[]) {
      listeners.get(eventName)?.(...args);
    },
    listeners,
    webContents,
  };
}

function flushPromises() {
  return new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("main window lifecycle recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("surfaces a startup timeout without automatically reloading the window", async () => {
    vi.useFakeTimers();
    const harness = createWindowHarness();
    const showRecoveryDialog = vi
      .fn<
        (
          failure: MainWindowFailure,
          canRetry: boolean,
        ) => Promise<MainWindowRecoveryChoice>
      >()
      .mockResolvedValue("quit");
    const recover = vi.fn();
    const requestQuit = vi.fn();

    bindMainWindowLifecycle(harness.window, {
      startupLoadTimeoutMs: 100,
      showRecoveryDialog,
      recover,
      requestQuit,
    });

    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();

    expect(showRecoveryDialog).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "startup-load-timeout" }),
      true,
    );
    expect(recover).not.toHaveBeenCalled();
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  test("cancels the startup watchdog after the renderer finishes loading", async () => {
    vi.useFakeTimers();
    const harness = createWindowHarness();
    const showRecoveryDialog = vi.fn().mockResolvedValue("quit" as const);

    bindMainWindowLifecycle(harness.window, {
      startupLoadTimeoutMs: 100,
      showRecoveryDialog,
      recover: vi.fn(),
      requestQuit: vi.fn(),
    });

    harness.emit("did-finish-load");
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();

    expect(showRecoveryDialog).not.toHaveBeenCalled();
  });

  test("allows one explicit retry, then quits after a second failure", async () => {
    const harness = createWindowHarness();
    const choices: MainWindowRecoveryChoice[] = ["retry", "quit"];
    const showRecoveryDialog = vi.fn(() =>
      Promise.resolve(choices.shift() ?? "quit"),
    );
    const recover = vi.fn();
    const requestQuit = vi.fn();

    bindMainWindowLifecycle(harness.window, {
      startupLoadTimeoutMs: 10_000,
      showRecoveryDialog,
      recover,
      requestQuit,
    });

    harness.emit(
      "did-fail-load",
      {},
      -105,
      "Network disconnected",
      "file:///app/index.html",
      true,
    );
    await flushPromises();
    await flushPromises();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(showRecoveryDialog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reason: "renderer-load-failed",
        errorCode: -105,
      }),
      true,
    );

    harness.emit(
      "render-process-gone",
      {},
      {
        reason: "crashed",
        exitCode: 139,
      },
    );
    await flushPromises();
    await flushPromises();

    expect(showRecoveryDialog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ reason: "renderer-crashed", exitCode: 139 }),
      false,
    );
    expect(requestQuit).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledTimes(1);
  });

  test("handles unresponsive pages through the same bounded, user-selected path", async () => {
    const harness = createWindowHarness();
    const showRecoveryDialog = vi.fn().mockResolvedValue("retry" as const);
    const recover = vi.fn();
    const requestQuit = vi.fn();

    const binding = bindMainWindowLifecycle(harness.window, {
      showRecoveryDialog,
      recover,
      requestQuit,
    });

    harness.emit("unresponsive");
    await flushPromises();
    await flushPromises();

    expect(showRecoveryDialog).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "renderer-unresponsive" }),
      true,
    );
    expect(recover).toHaveBeenCalledTimes(1);
    expect(requestQuit).not.toHaveBeenCalled();

    binding.dispose();
    expect(harness.listeners.size).toBe(0);
  });

  test("disposes safely after Electron has already destroyed web contents", () => {
    const harness = createWindowHarness();
    const binding = bindMainWindowLifecycle(harness.window, {
      showRecoveryDialog: vi.fn().mockResolvedValue("quit" as const),
      recover: vi.fn(),
      requestQuit: vi.fn(),
    });

    harness.webContents.isDestroyed.mockReturnValue(true);

    expect(() => binding.dispose()).not.toThrow();
    expect(harness.webContents.removeListener).not.toHaveBeenCalled();
  });

  test("ignores aborted navigations and clean renderer exits", async () => {
    const harness = createWindowHarness();
    const showRecoveryDialog = vi.fn().mockResolvedValue("quit" as const);
    const requestQuit = vi.fn();

    bindMainWindowLifecycle(harness.window, {
      showRecoveryDialog,
      recover: vi.fn(),
      requestQuit,
    });

    harness.emit(
      "did-fail-load",
      {},
      -3,
      "Aborted",
      "file:///app/index.html",
      true,
    );
    harness.emit(
      "render-process-gone",
      {},
      {
        reason: "clean-exit",
        exitCode: 0,
      },
    );
    await flushPromises();

    expect(showRecoveryDialog).not.toHaveBeenCalled();
    expect(requestQuit).not.toHaveBeenCalled();
  });
});
