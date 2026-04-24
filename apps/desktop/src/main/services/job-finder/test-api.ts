export interface ResumeImportPathPayload {
  sourcePath: string;
}

function normalizeFlagValue(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isEnabled(value: string | null | undefined): boolean {
  const normalized = normalizeFlagValue(value);
  return normalized === "1" || normalized === "true";
}

function isDisabled(value: string | null | undefined): boolean {
  const normalized = normalizeFlagValue(value);
  return normalized === "0" || normalized === "false";
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

  if (configuredValue == null) {
    return true;
  }

  if (isDisabled(configuredValue)) {
    return false;
  }

  if (isEnabled(configuredValue)) {
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
