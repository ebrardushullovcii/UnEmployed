import { createJobFinderAiClientFromEnvironment } from '@unemployed/ai-providers'
import { createCatalogBrowserSessionRuntime, createLinkedInBrowserAgentRuntime } from '@unemployed/browser-runtime'
import { createFileJobFinderRepository } from '@unemployed/db'
import { createJobFinderWorkspaceService } from '@unemployed/job-finder'
import { createLocalJobFinderDocumentManager } from '../../adapters/job-finder-document-manager'
import {
  createJobFinderBrowserSessionSeed,
  createJobFinderRepositorySeed,
  createLinkedInDiscoveryCatalogSeed
} from '../../adapters/job-finder-seed'
import { getGeneratedResumeDocumentsDirectory, getJobFinderWorkspaceFilePath, getLinkedInBrowserProfileDirectory } from './paths'
import { isBrowserHeadlessEnabled, isLinkedInBrowserAgentEnabled } from './test-api'

export async function createJobFinderWorkspaceServiceAsync() {
  const jobFinderRepository = await createFileJobFinderRepository({
    filePath: getJobFinderWorkspaceFilePath(),
    seed: createJobFinderRepositorySeed()
  })
  const chromeDebugPort = process.env.UNEMPLOYED_CHROME_DEBUG_PORT
    ? Number.parseInt(process.env.UNEMPLOYED_CHROME_DEBUG_PORT, 10)
    : null
  const browserRuntime = isLinkedInBrowserAgentEnabled()
    ? createLinkedInBrowserAgentRuntime({
        userDataDir: getLinkedInBrowserProfileDirectory(),
        headless: isBrowserHeadlessEnabled(),
        ...(process.env.UNEMPLOYED_CHROME_PATH
          ? { chromeExecutablePath: process.env.UNEMPLOYED_CHROME_PATH }
          : {}),
        ...(chromeDebugPort !== null ? { debugPort: chromeDebugPort } : {})
      })
    : createCatalogBrowserSessionRuntime({
        sessions: createJobFinderBrowserSessionSeed(),
        catalog: createLinkedInDiscoveryCatalogSeed()
      })
  const aiClient = createJobFinderAiClientFromEnvironment(process.env)
  const documentManager = createLocalJobFinderDocumentManager({
    outputDirectory: getGeneratedResumeDocumentsDirectory()
  })

  return createJobFinderWorkspaceService({
    aiClient,
    documentManager,
    repository: jobFinderRepository,
    browserRuntime
  })
}
