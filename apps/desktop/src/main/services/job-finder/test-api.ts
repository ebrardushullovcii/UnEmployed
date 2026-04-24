export interface ResumeImportPathPayload {
  sourcePath: string
}

export function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function isDisabled(value: string | undefined): boolean {
  return value === '0' || value === 'false'
}

export function isDesktopTestApiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabled(env.UNEMPLOYED_ENABLE_TEST_API)
}

export function isBrowserAgentEnabled(): boolean {
  const configuredValue = process.env.UNEMPLOYED_BROWSER_AGENT ?? process.env.UNEMPLOYED_LINKEDIN_BROWSER_AGENT

  if (configuredValue == null) {
    return true
  }

  if (isDisabled(configuredValue)) {
    return false
  }

  return isEnabled(configuredValue)
}

export function isBrowserHeadlessEnabled(): boolean {
  return isEnabled(process.env.UNEMPLOYED_BROWSER_HEADLESS)
}

export function parseResumeImportPathPayload(payload: unknown): ResumeImportPathPayload {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('sourcePath' in payload) ||
    typeof payload.sourcePath !== 'string' ||
    payload.sourcePath.trim().length === 0
  ) {
    throw new Error('A non-empty sourcePath string is required for scripted resume import.')
  }

  return {
    sourcePath: payload.sourcePath
  }
}

export function getDesktopTestDelayMs(value: string | undefined): number {
  const parsed = value ? Number.parseInt(value, 10) : 0

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
