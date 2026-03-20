import type { BrowserSessionState, JobSource } from '@unemployed/contracts'

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value)
}

export interface BrowserSessionRuntime {
  getSessionState(source: JobSource): Promise<BrowserSessionState>
}

export interface StubBrowserSessionRuntimeSeed {
  sessions: BrowserSessionState[]
}

export function createStubBrowserSessionRuntime(
  seed: StubBrowserSessionRuntimeSeed
): BrowserSessionRuntime {
  const sessions = new Map(seed.sessions.map((session) => [session.source, cloneValue(session)]))

  return {
    getSessionState(source) {
      const session = sessions.get(source)

      if (session) {
        return Promise.resolve(cloneValue(session))
      }

      return Promise.resolve({
        source,
        status: 'unknown',
        label: 'Session status unavailable',
        detail: 'No browser runtime stub has been configured for this source yet.',
        lastCheckedAt: new Date(0).toISOString()
      })
    }
  }
}
