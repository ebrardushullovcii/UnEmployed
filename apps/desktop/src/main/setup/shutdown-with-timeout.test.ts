import { afterEach, describe, expect, test, vi } from "vitest";
import { runShutdownWithTimeout } from "./shutdown-with-timeout";

describe("shutdown timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("reports completed shutdown before the deadline", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    const resultPromise = runShutdownWithTimeout(
      () => undefined,
      100,
      onTimeout,
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ status: "completed" });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test("wins when shutdown work never settles and invokes the timeout hook once", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const shutdown = vi.fn(() => new Promise<void>(() => undefined));

    const resultPromise = runShutdownWithTimeout(shutdown, 100, onTimeout);
    await vi.advanceTimersByTimeAsync(100);

    await expect(resultPromise).resolves.toEqual({ status: "timed-out" });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  test("reports cleanup failures without waiting for the timeout", async () => {
    vi.useFakeTimers();
    const error = new Error("close failed");
    const onTimeout = vi.fn();

    const resultPromise = runShutdownWithTimeout(
      () => {
        throw error;
      },
      100,
      onTimeout,
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ status: "failed", error });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
