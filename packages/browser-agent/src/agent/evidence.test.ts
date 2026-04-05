import { describe, expect, test, vi } from 'vitest'
import { recordToolEvidence } from './evidence'
import type { AgentState } from '../types'

function createState(): AgentState {
  return {
    conversation: [],
    reviewTranscript: [],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: 'https://jobs.example.com/search?debug=1',
    lastStableUrl: 'https://jobs.example.com/search',
    isRunning: true,
    phaseEvidence: {
      visibleControls: [],
      successfulInteractions: [],
      routeSignals: [],
      attemptedControls: [],
      warnings: []
    },
    compactionState: null
  }
}

describe('recordToolEvidence', () => {
  test('sanitizes user-facing warnings and logs raw tool errors', () => {
    const state = createState()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      recordToolEvidence(
        'fill',
        { role: 'searchbox', name: 'Keywords' },
        { success: false, error: 'Timeout 10000ms exceeded while querying internal selector stack' },
        state
      )

      expect(state.phaseEvidence.warnings).toEqual(['fill timed out.'])
      expect(errorSpy).toHaveBeenCalledWith(
        '[Agent] Tool failed during evidence recording:',
        expect.objectContaining({
          error: 'Timeout 10000ms exceeded while querying internal selector stack',
          toolName: 'fill'
        })
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})
