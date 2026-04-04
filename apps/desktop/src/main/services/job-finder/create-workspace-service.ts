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
import { isBrowserAgentEnabled, isBrowserHeadlessEnabled, isDesktopTestApiEnabled } from './test-api'

export async function createJobFinderWorkspaceServiceAsync() {
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createEmptyJobFinderRepositoryState()
  })
  const rawPort = process.env.UNEMPLOYED_CHROME_DEBUG_PORT
    ? Number.parseInt(process.env.UNEMPLOYED_CHROME_DEBUG_PORT, 10)
    : null
  const chromeDebugPort = (rawPort !== null && Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535)
    ? rawPort
    : null
  const aiClient = isDesktopTestApiEnabled()
    ? createDeterministicJobFinderAiClient(
        'Deterministic desktop test runtime is active for scripted UI validation.',
      )
    : createJobFinderAiClientFromEnvironment(process.env)
  const browserAgentEnabled = isBrowserAgentEnabled()
  const browserRuntime = browserAgentEnabled
    ? createBrowserAgentRuntime({
        userDataDir: getBrowserAgentProfileDirectory(),
        headless: isBrowserHeadlessEnabled(),
        ...(process.env.UNEMPLOYED_CHROME_PATH
          ? { chromeExecutablePath: process.env.UNEMPLOYED_CHROME_PATH }
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
            detail: isDesktopTestApiEnabled()
              ? 'Deterministic desktop test runtime is ready.'
              : 'Deterministic catalog runtime is ready.',
            lastCheckedAt: new Date().toISOString()
          }
        ],
        catalog: []
      })
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: getGeneratedResumeDocumentsDirectory()
  })
  const exportFileVerifier = createLocalResumeExportFileVerifier()
  const researchAdapter = createDesktopResumeResearchAdapter()

  return createJobFinderWorkspaceService({
    aiClient,
    documentManager,
    exportFileVerifier,
    repository: jobFinderRepository,
    browserRuntime,
    researchAdapter
  })
}
