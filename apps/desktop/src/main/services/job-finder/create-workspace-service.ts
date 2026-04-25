import {
  createDeterministicJobFinderAiClient,
  createJobFinderAiClientFromEnvironment,
} from '@unemployed/ai-providers'
import { createBrowserAgentRuntime, createCatalogBrowserSessionRuntime } from '@unemployed/browser-runtime'
import { createFileJobFinderRepository } from '@unemployed/db'
import { createJobFinderWorkspaceService } from '@unemployed/job-finder'
import { createLocalJobFinderDocumentManager } from '../../adapters/job-finder-document-manager'
import { createLocalResumeExportFileVerifier } from '../../adapters/job-finder-export-file-verifier'
import { createEmptyJobFinderRepositoryState } from '../../adapters/job-finder-initial-state'
import { createDesktopResumeResearchAdapter } from '../../adapters/job-finder-research-adapter'
import { getBrowserAgentProfileDirectory, getGeneratedResumeDocumentsDirectory, getJobFinderWorkspaceFilePath } from './paths'
import { isBrowserAgentEnabled, isBrowserHeadlessEnabled, isDesktopTestApiEnabled, isEnabled } from './test-api'

const deterministicTestTimestamp = '2026-03-20T10:00:00.000Z'

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

export async function createJobFinderWorkspaceServiceAsync() {
  const env = process.env
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createEmptyJobFinderRepositoryState()
  })
  const rawPort = env.UNEMPLOYED_CHROME_DEBUG_PORT
    ? Number.parseInt(env.UNEMPLOYED_CHROME_DEBUG_PORT, 10)
    : null
  const chromeDebugPort = (rawPort !== null && Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535)
    ? rawPort
    : null
  const aiClient = createDesktopJobFinderAiClient(env)
  const browserAgentEnabled = isBrowserAgentEnabled(env)
  const browserRuntime = browserAgentEnabled
    ? createBrowserAgentRuntime({
        userDataDir: getBrowserAgentProfileDirectory(),
        headless: isBrowserHeadlessEnabled(env),
        ...(env.UNEMPLOYED_CHROME_PATH
          ? { chromeExecutablePath: env.UNEMPLOYED_CHROME_PATH }
          : {}),
        ...(chromeDebugPort !== null ? { debugPort: chromeDebugPort } : {}),
        jobExtractor: (input) => aiClient.extractJobsFromPage(input),
        aiClient
      })
    : createCatalogBrowserSessionRuntime({
        sessions: [
          {
            source: 'target_site',
            status: 'ready',
            driver: 'catalog_seed',
            label: 'Browser session ready',
            detail: isDesktopTestApiEnabled(env)
              ? 'Deterministic desktop test runtime is ready.'
              : 'Deterministic catalog runtime is ready.',
            lastCheckedAt: isDesktopTestApiEnabled(env)
              ? deterministicTestTimestamp
              : new Date().toISOString()
          }
        ],
        catalog: []
      })
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: getGeneratedResumeDocumentsDirectory()
  })
  const exportFileVerifier = createLocalResumeExportFileVerifier()
  const researchAdapter = isDesktopTestApiEnabled(env)
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
