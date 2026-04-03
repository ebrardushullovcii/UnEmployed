import { describe, expect, test } from 'vitest'
import { runSequentialArtifactOrchestrator } from './orchestrator'

describe('runSequentialArtifactOrchestrator', () => {
  test('runs phases sequentially and stops when a phase requests it', async () => {
    const trace: string[] = []
    const phases = ['phase_a', 'phase_b', 'phase_c'] as const

    const artifacts = await runSequentialArtifactOrchestrator<(typeof phases)[number], string>({
      phases,
      beforePhase: (phase) => {
        trace.push(`before:${phase}`)
      },
      executePhase: (phase) => {
        trace.push(`execute:${phase}`)

        return Promise.resolve({
          artifact: `artifact:${phase}`,
          stop: phase === 'phase_b'
        })
      },
      afterPhase: (phase, _index, artifact) => {
        trace.push(['after', phase, artifact ?? 'none'].join(':'))
      }
    })

    expect(artifacts).toEqual(['artifact:phase_a', 'artifact:phase_b'])
    expect(trace).toEqual([
      'before:phase_a',
      'execute:phase_a',
      'after:phase_a:artifact:phase_a',
      'before:phase_b',
      'execute:phase_b',
      'after:phase_b:artifact:phase_b'
    ])
  })
})
