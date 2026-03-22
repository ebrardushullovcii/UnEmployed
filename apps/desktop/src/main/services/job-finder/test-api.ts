export interface ResumeImportPathPayload {
  sourcePath: string
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

export function isDesktopTestApiEnabled(): boolean {
  return isEnabled(process.env.UNEMPLOYED_ENABLE_TEST_API)
}

export function isLinkedInBrowserAgentEnabled(): boolean {
  return isEnabled(process.env.UNEMPLOYED_LINKEDIN_BROWSER_AGENT)
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
