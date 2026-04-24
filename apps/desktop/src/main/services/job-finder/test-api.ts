export interface ResumeImportPathPayload {
  sourcePath: string;
}

export function isEnabled(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

function isDisabled(value: string | undefined): boolean {
  return value === "0" || value === "false";
}

export function isDesktopTestApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnabled(env.UNEMPLOYED_ENABLE_TEST_API);
}

export function isBrowserAgentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configuredValue = env.UNEMPLOYED_BROWSER_AGENT;
  const normalizedValue = configuredValue?.trim().toLowerCase();

  if (configuredValue == null) {
    return true;
  }

  if (normalizedValue != null && isDisabled(normalizedValue)) {
    return false;
  }

  if (normalizedValue != null && isEnabled(normalizedValue)) {
    return true;
  }

  return true;
}

export function isBrowserHeadlessEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnabled(env.UNEMPLOYED_BROWSER_HEADLESS);
}

export function parseResumeImportPathPayload(
  payload: unknown,
): ResumeImportPathPayload {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("sourcePath" in payload) ||
    typeof payload.sourcePath !== "string" ||
    payload.sourcePath.trim().length === 0
  ) {
    throw new Error(
      "A non-empty sourcePath string is required for scripted resume import.",
    );
  }

  return {
    sourcePath: payload.sourcePath,
  };
}

export function getDesktopTestDelayMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : 0;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
