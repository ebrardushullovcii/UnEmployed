const REMOTE_METHOD_ERROR_RE =
  /^Error invoking remote method '[^']+': (?:(?:[A-Za-z]*Error): )?(.*)$/s;

export function getJobFinderErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? (error as { message?: unknown }).message
        : null;

  if (typeof message !== "string") {
    return fallbackMessage;
  }

  const remoteMethodMatch = REMOTE_METHOD_ERROR_RE.exec(message);
  return remoteMethodMatch?.[1]?.trim() || message.trim() || fallbackMessage;
}
