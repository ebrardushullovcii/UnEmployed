// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApplyRunDetails, ApplyRunSummary, ApplyJobResultSummary, ApplicationRecord } from '@unemployed/contracts'
import { ApplicationsScreen } from './applications-screen'

describe('ApplicationsScreen', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows action-led first-run CTAs when there are no applications yet', () => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    render(
      <ApplicationsScreen
        applicationAttempts={[]}
        applicationRecords={[]}
        applyRuns={[]}
        applyJobResults={[]}
        discoveryJobs={[]}
        isApplyPending={false}
        isApplyRequestPending={() => false}
        isApplyRunPending={() => false}
        onApproveApplyRun={vi.fn()}
        onCancelApplyRun={vi.fn()}
        onGetApplyRunDetails={vi.fn()}
        onResolveApplyConsentRequest={vi.fn()}
        onRevokeApplyRunApproval={vi.fn()}
        onSelectRecord={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedApplyRunId={null}
        selectedAttempt={null}
        selectedRecord={null}
      />,
    )

    expect(screen.getByText('Start your first application')).toBeTruthy()
    expect(screen.getByText('Applications keeps follow-up in one place')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Shortlisted' }).getAttribute('href')).toBe('#/job-finder/review-queue')
    expect(screen.getByRole('link', { name: 'Open Shortlisted' }).getAttribute('href')).toBe('#/job-finder/review-queue')
    expect(screen.getAllByRole('link', { name: 'Find jobs' })[0]?.getAttribute('href')).toBe('#/job-finder/discovery')
  })

  it('loads details for a newly selected historical apply run', async () => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const selectedRecord: ApplicationRecord = {
      id: 'application_1',
      jobId: 'job_ready',
      title: 'Senior Product Designer',
      company: 'Signal Systems',
      status: 'ready_for_review',
      lastActionLabel: 'Resume approved',
      nextActionLabel: 'Start apply copilot',
      lastUpdatedAt: '2026-03-20T10:05:00.000Z',
      lastAttemptState: 'submitted',
      questionSummary: {
        total: 0,
        required: 0,
        answered: 0,
        unansweredRequired: 0,
      },
      latestBlocker: null,
      consentSummary: {
        status: 'none',
        pendingCount: 0,
      },
      replaySummary: {
        sourceInstructionArtifactId: null,
        lastUrl: null,
        checkpointCount: 0,
        evidenceCount: 0,
      },
      events: [],
    }
    const applyRuns: ApplyRunSummary[] = [
      {
        id: 'apply_run_latest',
        mode: 'copilot',
        state: 'completed',
        jobIds: ['job_ready'],
        currentJobId: null,
        submitApprovalId: null,
        createdAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        completedAt: '2026-03-20T10:05:00.000Z',
        summary: 'Latest run',
        detail: 'Latest safe run finished.',
        totalJobs: 1,
        pendingJobs: 0,
        submittedJobs: 1,
        skippedJobs: 0,
        blockedJobs: 0,
        failedJobs: 0,
      },
      {
        id: 'apply_run_older',
        mode: 'copilot',
        state: 'completed',
        jobIds: ['job_ready'],
        currentJobId: null,
        submitApprovalId: null,
        createdAt: '2026-03-20T09:54:00.000Z',
        updatedAt: '2026-03-20T09:55:00.000Z',
        completedAt: '2026-03-20T09:55:00.000Z',
        summary: 'Older run',
        detail: 'Older safe run finished.',
        totalJobs: 1,
        pendingJobs: 0,
        submittedJobs: 1,
        skippedJobs: 0,
        blockedJobs: 0,
        failedJobs: 0,
      },
    ]
    const applyJobResults: ApplyJobResultSummary[] = [
      {
        id: 'apply_result_latest',
        runId: 'apply_run_latest',
        jobId: 'job_ready',
        queuePosition: 0,
        state: 'submitted',
        summary: 'Latest application summary',
        detail: 'Latest application detail',
        startedAt: '2026-03-20T10:04:00.000Z',
        updatedAt: '2026-03-20T10:05:00.000Z',
        completedAt: '2026-03-20T10:05:00.000Z',
        blockerReason: null,
        blockerSummary: null,
        latestQuestionCount: 0,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
      },
      {
        id: 'apply_result_older',
        runId: 'apply_run_older',
        jobId: 'job_ready',
        queuePosition: 0,
        state: 'blocked',
        summary: 'Older application summary',
        detail: 'Older application detail',
        startedAt: '2026-03-20T09:54:00.000Z',
        updatedAt: '2026-03-20T09:55:00.000Z',
        completedAt: '2026-03-20T09:55:00.000Z',
        blockerReason: 'required_human_input',
        blockerSummary: 'Needed manual follow-up',
        latestQuestionCount: 0,
        latestAnswerCount: 0,
        pendingConsentRequestCount: 0,
        artifactCount: 0,
        latestCheckpointId: null,
      },
    ]
    const onGetApplyRunDetails = vi.fn((runId: string): Promise<ApplyRunDetails> => Promise.resolve({
      run: applyRuns.find((entry) => entry.id === runId) ?? applyRuns[0]!,
      result: applyJobResults.find((entry) => entry.runId === runId) ?? null,
      results: applyJobResults.filter((entry) => entry.runId === runId),
      submitApproval: null,
      questionRecords: [],
      answerRecords: [],
      artifactRefs: [],
      checkpoints: [],
      consentRequests: [],
    }))

    render(
      <ApplicationsScreen
        applicationAttempts={[]}
        applicationRecords={[selectedRecord]}
        applyRuns={applyRuns}
        applyJobResults={applyJobResults}
        discoveryJobs={[]}
        isApplyPending={false}
        isApplyRequestPending={() => false}
        isApplyRunPending={() => false}
        onApproveApplyRun={vi.fn()}
        onCancelApplyRun={vi.fn()}
        onGetApplyRunDetails={onGetApplyRunDetails}
        onResolveApplyConsentRequest={vi.fn()}
        onRevokeApplyRunApproval={vi.fn()}
        onSelectRecord={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApply={vi.fn()}
        onStartAutoApplyQueue={vi.fn()}
        selectedApplyRunId={null}
        selectedAttempt={null}
        selectedRecord={selectedRecord}
      />,
    )

    await waitFor(() => {
      expect(onGetApplyRunDetails).toHaveBeenCalledTimes(1)
    })

    const olderRunButton = screen.getByTitle('apply_run_older')

    fireEvent.click(olderRunButton)

    await waitFor(() => {
      expect(onGetApplyRunDetails).toHaveBeenCalledTimes(2)
    })
    expect(onGetApplyRunDetails).toHaveBeenLastCalledWith('apply_run_older', 'job_ready')
  })
})
