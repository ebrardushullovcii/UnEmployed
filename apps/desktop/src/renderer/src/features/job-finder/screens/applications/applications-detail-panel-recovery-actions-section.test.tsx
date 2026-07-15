// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobFinderWorkspaceSnapshot } from '@unemployed/contracts'
import { ApplicationsDetailPanelRecoveryActionsSection } from './applications-detail-panel-recovery-actions-section'

afterEach(cleanup)

describe('ApplicationsDetailPanelRecoveryActionsSection', () => {
  it('offers an explicit user-confirmed retry after an application sign-in handoff', () => {
    const onStartApplyCopilot = vi.fn()
    const visibleApplyResult: JobFinderWorkspaceSnapshot['applyJobResults'][number] = {
      id: 'result_auth_wait',
      runId: 'run_auth_wait',
      jobId: 'job_workday',
      queuePosition: 0,
      state: 'blocked',
      summary: 'The application requires an authenticated account.',
      detail: 'Sign in manually, then retry preparation.',
      startedAt: '2026-07-14T10:00:00.000Z',
      updatedAt: '2026-07-14T10:01:00.000Z',
      completedAt: '2026-07-14T10:01:00.000Z',
      blockerReason: 'auth_required',
      blockerSummary: 'Sign in manually.',
      visualObservationSets: [],
      visualCheckpoints: [],
      latestQuestionCount: 0,
      latestAnswerCount: 0,
      pendingConsentRequestCount: 0,
      artifactCount: 0,
      latestCheckpointId: null,
    }

    const { getByRole, getByText } = render(
      <ApplicationsDetailPanelRecoveryActionsSection
        applyRunHistoryCount={1}
        canRestageAutoRun={false}
        canRestageQueueRun={false}
        excludedQueueRecoveryEntries={[]}
        isApplyPending={false}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedQueueOutcomeEntries={[]}
        selectedQueueRecoveryEntries={[]}
        selectedQueueRecoveryJobIds={[]}
        selectedRecordJobId="job_workday"
        selectedRun={null}
        visibleApplyResult={visibleApplyResult}
      />,
    )

    expect(getByText(/never handles or stores your credentials/i)).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /i'm signed in — retry application/i }))
    expect(onStartApplyCopilot).toHaveBeenCalledWith('job_workday')
  })
})
