import {
  createDeterministicJobFinderAiClient,
  createJobFinderAiClientFromEnvironment,
} from '@unemployed/ai-providers'
import { createBrowserAgentRuntime, createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
import type { BrowserSessionState } from '@unemployed/contracts'
import { createFileJobFinderRepository } from '@unemployed/db'
import { createJobFinderWorkspaceService } from '@unemployed/job-finder'
import { createLocalJobFinderDocumentManager } from '../../adapters/job-finder-document-manager'
import { createLocalResumeExportFileVerifier } from '../../adapters/job-finder-export-file-verifier'
import { createEmptyJobFinderRepositoryState } from '../../adapters/job-finder-initial-state'
import { createDesktopResumeResearchAdapter } from '../../adapters/job-finder-research-adapter'
import { getBrowserAgentProfileDirectory, getGeneratedResumeDocumentsDirectory, getJobFinderWorkspaceFilePath } from './paths'
import {
  getResumePreviewTestMode,
  getTestBrowserSessionDetail,
  getTestBrowserSessionLabel,
  getTestBrowserSessionStatus,
  isBrowserAgentEnabled,
  isBrowserHeadlessEnabled,
  isDesktopTestApiEnabled,
  isEnabled,
} from './test-api'
import type { BrowserSessionRuntime } from '@unemployed/browser-runtime'

const deterministicTestTimestamp = '2026-03-20T10:00:00.000Z'

function buildCatalogSessionLabel(status: BrowserSessionState['status']): string {
  switch (status) {
    case 'ready':
      return 'Browser session ready'
    case 'login_required':
      return 'Browser session needs sign-in'
    case 'blocked':
      return 'Browser session blocked'
    case 'unknown':
      return 'Browser session not started'
  }

  const exhaustiveStatus: never = status
  throw new Error(`Unhandled browser session status: ${String(exhaustiveStatus)}`)
}

function buildCatalogSessionDetail(
  status: BrowserSessionState['status'],
  desktopTestApiEnabled: boolean,
): string {
  switch (status) {
    case 'ready':
      return desktopTestApiEnabled
        ? 'Deterministic desktop test runtime is ready.'
        : 'Deterministic catalog runtime is ready.'
    case 'login_required':
      return 'A saved source needs sign-in before the next search can continue.'
    case 'blocked':
      return 'The shared browser session is blocked until you resolve the current browser issue.'
    case 'unknown':
      return 'Open the dedicated browser profile when you want to sign in or prepare a site before the next run.'
  }

  const exhaustiveStatus: never = status
  throw new Error(`Unhandled browser session status: ${String(exhaustiveStatus)}`)
}

function buildCatalogSessionSeed(
  env: NodeJS.ProcessEnv,
  desktopTestApiEnabled: boolean,
): BrowserSessionState {
  const status = desktopTestApiEnabled
    ? (getTestBrowserSessionStatus(env) ?? 'ready')
    : 'ready'
  const label = desktopTestApiEnabled
    ? (getTestBrowserSessionLabel(env) ?? buildCatalogSessionLabel(status))
    : buildCatalogSessionLabel(status)
  const detail = desktopTestApiEnabled
    ? (getTestBrowserSessionDetail(env) ?? buildCatalogSessionDetail(status, desktopTestApiEnabled))
    : buildCatalogSessionDetail(status, desktopTestApiEnabled)

  return {
    source: 'target_site',
    status,
    driver: 'catalog_seed',
    label,
    detail,
    lastCheckedAt: desktopTestApiEnabled
      ? deterministicTestTimestamp
      : new Date().toISOString()
  }
}

export function createDesktopJobFinderAiClient(env: NodeJS.ProcessEnv = process.env) {
  const desktopTestApiEnabled = isDesktopTestApiEnabled(env)
  const forceLiveAiDuringTestApi = isEnabled(env.UNEMPLOYED_TEST_API_USE_LIVE_AI)

  if (desktopTestApiEnabled && !forceLiveAiDuringTestApi) {
    return createDeterministicJobFinderAiClient(
      'Desktop test API forces deterministic AI runtime so scripted UI flows stay stable even when local model credentials exist.',
    )
  }

  return createJobFinderAiClientFromEnvironment(env)
}

export function createDesktopBrowserRuntime(input: {
  env?: NodeJS.ProcessEnv
  aiClient?: ReturnType<typeof createDesktopJobFinderAiClient>
  desktopTestApiEnabled?: boolean
} = {}): BrowserSessionRuntime {
  const env = input.env ?? process.env
  const desktopTestApiEnabled = input.desktopTestApiEnabled ?? isDesktopTestApiEnabled(env)
  const rawPort = env.UNEMPLOYED_CHROME_DEBUG_PORT
    ? Number.parseInt(env.UNEMPLOYED_CHROME_DEBUG_PORT, 10)
    : null
  const chromeDebugPort = (rawPort !== null && Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535)
    ? rawPort
    : null

  if (isBrowserAgentEnabled(env)) {
    const aiClient = input.aiClient ?? createDesktopJobFinderAiClient(env)

    return createBrowserAgentRuntime({
      userDataDir: getBrowserAgentProfileDirectory(),
      headless: isBrowserHeadlessEnabled(env),
      ...(env.UNEMPLOYED_CHROME_PATH
        ? { chromeExecutablePath: env.UNEMPLOYED_CHROME_PATH }
        : {}),
      ...(chromeDebugPort !== null ? { debugPort: chromeDebugPort } : {}),
      jobExtractor: (runtimeInput) => aiClient.extractJobsFromPage(runtimeInput),
      aiClient,
    })
  }

  const runtime = createCatalogBrowserSessionRuntime({
    sessions: [
      buildCatalogSessionSeed(env, desktopTestApiEnabled)
    ],
    catalog: []
  })

  return {
    ...runtime,
    async openSession(source, options) {
      const hasTargetId =
        options !== null &&
        typeof options === 'object' &&
        'targetId' in options &&
        Boolean((options as { targetId?: unknown }).targetId)

      if (options?.targetUrl || hasTargetId) {
        throw new Error(
          'Targeted sign-in requires the browser agent runtime, but it is disabled in this desktop build.',
        )
      }

      return runtime.openSession(source, options)
    },
  }
}

export async function createJobFinderWorkspaceServiceAsync(
  envOverrides?: Partial<NodeJS.ProcessEnv>,
) {
  const env = {
    ...process.env,
    ...(envOverrides ?? {}),
  }
  const desktopTestApiEnabled = isDesktopTestApiEnabled(env)
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createEmptyJobFinderRepositoryState()
  })
  const aiClient = createDesktopJobFinderAiClient(env)
  const browserRuntime = createDesktopBrowserRuntime({
    env,
    aiClient,
    desktopTestApiEnabled,
  })
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: getGeneratedResumeDocumentsDirectory(),
    previewTestMode: desktopTestApiEnabled
      ? getResumePreviewTestMode(env)
      : 'ok',
  })
  const exportFileVerifier = createLocalResumeExportFileVerifier()
  const researchAdapter = desktopTestApiEnabled
    ? undefined
    : createDesktopResumeResearchAdapter()

  return createJobFinderWorkspaceService({
    aiClient,
    documentManager,
    exportFileVerifier,
    repository: jobFinderRepository,
    browserRuntime,
    ...(researchAdapter ? { researchAdapter } : {})
  })
}
