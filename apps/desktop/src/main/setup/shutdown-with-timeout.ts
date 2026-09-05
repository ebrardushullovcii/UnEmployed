export type ShutdownWithTimeoutResult =
  | { status: "completed" }
  | { status: "timed-out" }
  | { status: "failed"; error: unknown };

/**
 * Waits for best-effort shutdown work without allowing it to block process exit
 * forever. The operation is not cancelled when the timeout wins; Electron may
 * terminate it during quit, so callers must keep cleanup idempotent.
 */
export function runShutdownWithTimeout(
  shutdown: () => Promise<void> | void,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<ShutdownWithTimeoutResult> {
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : 0;

  return new Promise<ShutdownWithTimeoutResult>((resolve) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        onTimeout?.();
      } catch {
        // A timeout logger must never prevent the quit path from resolving.
      }
      resolve({ status: "timed-out" });
    }, boundedTimeoutMs);

    Promise.resolve()
      .then(shutdown)
      .then(
        () => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          resolve({ status: "completed" });
        },
        (error: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          resolve({ status: "failed", error });
        },
      );
  });
}
