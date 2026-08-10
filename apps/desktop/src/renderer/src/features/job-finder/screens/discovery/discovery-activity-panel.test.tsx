// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DiscoveryRunRecordSchema, type JobSearchPreferences } from '@unemployed/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DiscoveryHistoryModal } from './discovery-activity-panel'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const targets = [
  {
    id: 'greenhouse-source',
    label: 'Greenhouse roles',
    enabled: true,
    adapterKind: 'auto',
    startingUrl: 'https://example.com/jobs'
  }
] as JobSearchPreferences['discovery']['targets']

const failedRun = DiscoveryRunRecordSchema.parse({
  id: 'failed-run',
  state: 'completed',
  scope: 'run_all',
  startedAt: '2026-07-31T10:00:00.000Z',
  completedAt: '2026-07-31T10:00:04.000Z',
  targetIds: ['greenhouse-source'],
  targetExecutions: [
    {
      targetId: 'greenhouse-source',
      adapterKind: 'auto',
      state: 'failed',
      startedAt: '2026-07-31T10:00:00.000Z',
      completedAt: '2026-07-31T10:00:04.000Z',
      warning: 'Sign-in expired before the source could be read.',
      changeDigest: {
        new: 2,
        unchanged: 3,
        changed: 1,
        reactivated: 0,
        inactive: 1,
        known: 4,
        skipped: 2
      },
      timing: { totalDurationMs: 4_000, longestGapMs: 0, eventCount: 0 }
    }
  ],
  summary: {
    targetsPlanned: 1,
    targetsCompleted: 1,
    validJobsFound: 2,
    outcome: 'completed',
    changeDigest: {
      new: 2,
      unchanged: 3,
      changed: 1,
      reactivated: 0,
      inactive: 1,
      known: 4,
      skipped: 2
    },
    sourceHealth: [
      {
        targetId: 'greenhouse-source',
        health: 'failed',
        durationMs: 4_000,
        warnings: ['Sign-in expired before the source could be read.']
      }
    ],
    warnings: ['Sign-in expired before the source could be read.']
  }
})

describe('DiscoveryHistoryModal', () => {
  it('presents persisted changes and retries only the failed source', () => {
    const onRetrySource = vi.fn()

    render(
      <DiscoveryHistoryModal
        activeRun={null}
        isDiscoveryPending={false}
        isTargetPending={() => false}
        liveEvents={[]}
        onClose={vi.fn()}
        onRetrySource={onRetrySource}
        open
        recentRuns={[failedRun]}
        targets={targets}
      />
    )

    expect(screen.getByRole('heading', { name: 'Changes since earlier searches' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Source health' })).toBeTruthy()
    expect(screen.getByText('Greenhouse roles')).toBeTruthy()
    expect(screen.getByText('Sign-in expired before the source could be read.')).toBeTruthy()

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Retry failed source Greenhouse roles'
      })
    )

    expect(onRetrySource).toHaveBeenCalledTimes(1)
    expect(onRetrySource).toHaveBeenCalledWith('greenhouse-source')
  })

  it('disables retry while another all-source search is active', () => {
    render(
      <DiscoveryHistoryModal
        activeRun={null}
        isDiscoveryPending
        isTargetPending={() => false}
        liveEvents={[]}
        onClose={vi.fn()}
        onRetrySource={vi.fn()}
        open
        recentRuns={[failedRun]}
        targets={targets}
      />
    )

    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Retry failed source Greenhouse roles'
      }).disabled
    ).toBe(true)
  })
})
