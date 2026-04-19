import {
  BrowserSessionStateSchema,
  JobPostingSchema,
  type BrowserSessionState,
  type JobSource,
} from '@unemployed/contracts'
import { createCatalogSessionAgent } from '@unemployed/browser-agent'
import type {
  BrowserSessionRuntime,
  CatalogBrowserSessionRuntimeSeed,
  StubBrowserSessionRuntimeSeed,
} from './runtime-types'
import { cloneValue } from './catalog-runtime-utils'

export function createCatalogBrowserSessionRuntime(
  seed: CatalogBrowserSessionRuntimeSeed,
): BrowserSessionRuntime {
  const initialSessions = new Map(
    seed.sessions.map((session) => [
      session.source,
      BrowserSessionStateSchema.parse(cloneValue(session)),
    ]),
  )
  const sessions = new Map(initialSessions)
  const catalog = JobPostingSchema.array().parse(cloneValue(seed.catalog))

  function getSession(source: JobSource): BrowserSessionState {
    const session = sessions.get(source)

    if (session) {
      return cloneValue(session)
    }

    return BrowserSessionStateSchema.parse({
      source,
      status: 'unknown',
      label: 'Session status unavailable',
      detail:
        'No browser runtime session has been configured for this source yet.',
      lastCheckedAt: new Date(0).toISOString(),
    })
  }

  const catalogSessionAgent = createCatalogSessionAgent({
    getSessionState: getSession,
    listCatalogJobs(source) {
      return catalog
        .filter((job) => job.source === source)
        .map((job) => cloneValue(job))
    },
  })

  return {
    getSessionState(source) {
      return Promise.resolve(getSession(source))
    },
    openSession(source) {
      const reopenedSession = cloneValue(
        initialSessions.get(source) ??
          BrowserSessionStateSchema.parse({
            source,
            status: 'unknown',
            driver: 'catalog_seed',
            label: 'Browser session unavailable',
            detail:
              'No browser runtime session has been configured for this source yet.',
            lastCheckedAt: new Date().toISOString(),
          }),
      )
      sessions.set(source, reopenedSession)
      return Promise.resolve(reopenedSession)
    },
    closeSession(source) {
      const closedState = BrowserSessionStateSchema.parse({
        source,
        status: 'unknown',
        driver: 'catalog_seed',
        label: 'Browser session closed',
        detail:
          'The browser session is closed. It will reopen when the next run starts.',
        lastCheckedAt: new Date().toISOString(),
      })
      sessions.set(source, closedState)
      return Promise.resolve(closedState)
    },
    runDiscovery: (source, searchPreferences) =>
      catalogSessionAgent.runDiscovery(source, searchPreferences),
    executeEasyApply: (source, input) =>
      catalogSessionAgent.executeEasyApply(source, input),
    executeApplicationFlow: (source, input) =>
      catalogSessionAgent.executeApplicationFlow(source, input),
    runAgentDiscovery: (source, options) =>
      catalogSessionAgent.runAgentDiscovery(source, options),
  }
}

export function createStubBrowserSessionRuntime(
  seed: StubBrowserSessionRuntimeSeed,
): BrowserSessionRuntime {
  return createCatalogBrowserSessionRuntime(seed)
}
