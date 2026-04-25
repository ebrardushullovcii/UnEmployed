export interface ResumeImportPathPayload {
  sourcePath: string;
}

const warnedInvalidEnvValues = new Set<string>();

export function resetInvalidBooleanEnvWarnings() {
  warnedInvalidEnvValues.clear();
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

function warnInvalidBooleanEnvValue(
  variableName: string,
  configuredValue: string,
) {
  const normalizedConfiguredValue = normalizeFlagValue(configuredValue);
  if (normalizedConfiguredValue == null) {
    return;
  }
  const warningKey = `${variableName}:${normalizedConfiguredValue}`;
  if (warnedInvalidEnvValues.has(warningKey)) {
    return;
  }

  warnedInvalidEnvValues.add(warningKey);
  console.warn(
    `[desktop test-api] Unrecognized ${variableName} value: ${JSON.stringify(configuredValue)}. Falling back to the default enabled behavior.`,
  );
}

function warnInvalidEnvValue(variableName: string, configuredValue: string) {
  const normalizedConfiguredValue = normalizeFlagValue(configuredValue);
  if (normalizedConfiguredValue == null) {
    return;
  }

  const warningKey = `${variableName}:${normalizedConfiguredValue}`;
  if (warnedInvalidEnvValues.has(warningKey)) {
    return;
  }

  warnedInvalidEnvValues.add(warningKey);
  console.warn(
    `[desktop test-api] Unrecognized ${variableName} value: ${JSON.stringify(configuredValue)}. Falling back to the default disabled behavior.`,
  );
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
  const normalizedValue = normalizeFlagValue(configuredValue);

  if (normalizedValue == null) {
    return true;
  }

  if (isDisabled(normalizedValue)) {
    return false;
  }

  if (isEnabled(normalizedValue)) {
    return true;
  }

  if (configuredValue == null) {
    return true;
  }

  warnInvalidBooleanEnvValue("UNEMPLOYED_BROWSER_AGENT", configuredValue);
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
    sourcePath: payload.sourcePath.trim(),
  };
}

export function getDesktopTestDelayMs(value: string | undefined): number {
  const normalized = normalizeFlagValue(value);
  if (normalized == null) {
    return 0;
  }

  if (!/^\d+$/.test(normalized)) {
    warnInvalidEnvValue("UNEMPLOYED_TEST_PROFILE_COPILOT_DELAY_MS", value ?? "");
    return 0;
  }

  const parsed = Number.parseInt(normalized, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
