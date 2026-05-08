// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApplyRunDetails, ApplyRunSummary, ApplyJobResultSummary, ApplicationRecord, BrowserVisualEvidenceSummary } from '@unemployed/contracts'
import { ApplicationsScreen } from './applications-screen'

describe('ApplicationsScreen', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  function createVisualEvidence(
    overrides: Partial<BrowserVisualEvidenceSummary> = {},
  ): BrowserVisualEvidenceSummary {
    return {
      snapshotId: 'visual_snapshot_apply_1',
      observationSetId: 'visual_observation_apply_1',
      summary: 'Visible resume upload and disabled final submit button.',
      capturedAt: '2026-03-20T10:04:30.000Z',
      storagePath: null,
      retention: 'temporary',
      redactionLevel: 'sensitive',
      confidence: 0.76,
      reconciliationStatus: 'not_compared',
      ...overrides,
    }
  }

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
    expect(screen.getByText('Keep all application follow-ups in one place')).toBeTruthy()
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
        visualCheckpointsEnabled: false,
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
        visualCheckpointsEnabled: false,
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
        visualObservationSets: [],
        visualCheckpoints: [],
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
        visualObservationSets: [],
        visualCheckpoints: [],
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

  it('renders persisted apply visual evidence in the review panel', async () => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const visualEvidence = createVisualEvidence()
    const selectedRecord: ApplicationRecord = {
      id: 'application_visual',
      jobId: 'job_visual',
      title: 'Senior Platform Engineer',
      company: 'Visual Systems',
      status: 'ready_for_review',
      lastActionLabel: 'Apply copilot paused before final submit',
      nextActionLabel: 'Review the prepared application and submit manually when ready',
      lastUpdatedAt: '2026-03-20T10:05:00.000Z',
      lastAttemptState: 'paused',
      questionSummary: {
        total: 1,
        required: 1,
        answered: 1,
        unansweredRequired: 0,
      },
      latestBlocker: null,
      consentSummary: {
        status: 'approved',
        pendingCount: 0,
      },
      replaySummary: {
        sourceInstructionArtifactId: null,
        lastUrl: 'https://jobs.example.com/apply',
        checkpointCount: 1,
        evidenceCount: 0,
      },
      events: [],
    }
    const applyRun: ApplyRunSummary = {
      id: 'apply_run_visual',
      mode: 'copilot',
      state: 'paused_for_user_review',
      jobIds: ['job_visual'],
      currentJobId: 'job_visual',
      submitApprovalId: null,
      visualCheckpointsEnabled: true,
      createdAt: '2026-03-20T10:04:00.000Z',
      updatedAt: '2026-03-20T10:05:00.000Z',
      completedAt: null,
      summary: 'Apply copilot paused before final submit',
      detail: 'Safe non-submitting apply paused for user review.',
      totalJobs: 1,
      pendingJobs: 1,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    }
    const applyResult: ApplyJobResultSummary = {
      id: 'apply_result_visual',
      runId: applyRun.id,
      jobId: 'job_visual',
      queuePosition: 0,
      state: 'awaiting_review',
      summary: 'Apply copilot paused before final submit',
      detail: 'Safe non-submitting apply paused for user review.',
      startedAt: '2026-03-20T10:04:00.000Z',
      updatedAt: '2026-03-20T10:05:00.000Z',
      completedAt: null,
      blockerReason: null,
      blockerSummary: null,
      visualObservationSets: [],
      visualCheckpoints: [
        {
          id: 'apply_visual_checkpoint_1',
          label: 'Apply page visual checkpoint',
          purpose: 'apply_checkpoint',
          snapshotId: visualEvidence.snapshotId,
          observationSetId: visualEvidence.observationSetId,
          summary: visualEvidence.summary,
          capturedAt: visualEvidence.capturedAt,
          retained: false,
          storagePath: null,
          blockers: [],
          fieldControls: ['Resume upload control is visible.'],
          validationErrors: [],
          buttonStates: ['Final submit button appears disabled.'],
          questionContextIds: [],
          reconciliations: [],
        },
      ],
      latestQuestionCount: 1,
      latestAnswerCount: 1,
      pendingConsentRequestCount: 0,
      artifactCount: 1,
      latestCheckpointId: 'apply_checkpoint_visual',
    }
    const onGetApplyRunDetails = vi.fn((): Promise<ApplyRunDetails> => Promise.resolve({
      run: applyRun,
      result: applyResult,
      results: [applyResult],
      submitApproval: null,
      questionRecords: [
        {
          id: 'apply_question_visual',
          runId: applyRun.id,
          jobId: 'job_visual',
          resultId: applyResult.id,
          prompt: 'Upload resume',
          kind: 'resume',
          isRequired: true,
          detectedAt: '2026-03-20T10:04:10.000Z',
          answerOptions: [],
          suggestedAnswers: [],
          selectedAnswerId: null,
          submittedAnswer: '/tmp/resume.pdf',
          status: 'submitted',
          pageUrl: 'https://jobs.example.com/apply',
          visualContext: visualEvidence,
        },
      ],
      answerRecords: [],
      artifactRefs: [
        {
          id: 'apply_artifact_visual',
          runId: applyRun.id,
          jobId: 'job_visual',
          resultId: applyResult.id,
          questionId: null,
          kind: 'checkpoint',
          label: 'Prepared application for final review',
          createdAt: '2026-03-20T10:04:30.000Z',
          storagePath: null,
          url: 'https://jobs.example.com/apply',
          textSnippet: 'Stopped before final submit.',
          visualEvidence,
        },
      ],
      checkpoints: [
        {
          id: 'apply_checkpoint_visual',
          runId: applyRun.id,
          jobId: 'job_visual',
          resultId: applyResult.id,
          createdAt: '2026-03-20T10:04:30.000Z',
          label: 'Prepared application for final review',
          detail: 'Stopped before final submit.',
          url: 'https://jobs.example.com/apply',
          jobState: 'awaiting_review',
          artifactRefIds: ['apply_artifact_visual'],
          visualEvidence: [visualEvidence],
          visualReconciliations: [],
        },
      ],
      consentRequests: [],
    }))

    render(
      <ApplicationsScreen
        applicationAttempts={[]}
        applicationRecords={[selectedRecord]}
        applyRuns={[applyRun]}
        applyJobResults={[applyResult]}
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
      expect(screen.getByText('Visual apply checkpoints')).toBeTruthy()
    })
    expect(screen.getAllByText(/Visible resume upload and disabled final submit button/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Resume upload control is visible/i)).toBeTruthy()
  })
})
