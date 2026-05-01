import { describe, expect, it } from 'vitest'
import { ApplicationRecordSchema } from '@unemployed/contracts'
import {
  getApplicationLatestActivityLabel,
  getApplicationNextStepLabel,
  getApplicationReadableNextStepLabel,
  getApplicationStagePresentation,
} from './applications-status'

function createRecord(overrides: Partial<ReturnType<typeof ApplicationRecordSchema.parse>> = {}) {
  return ApplicationRecordSchema.parse({
    id: 'application_1',
    jobId: 'job_1',
    title: 'Principal Designer',
    company: 'Acme',
    status: 'ready_for_review',
    lastActionLabel: 'Ready for review.',
    nextActionLabel: 'Review the prepared application.',
    lastUpdatedAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  })
}

describe('applications status helpers', () => {
  it('keeps the consent-declined stage while showing the paused next action as latest activity', () => {
    const record = createRecord({
      consentSummary: { status: 'declined', pendingCount: 0 },
      lastAttemptState: 'paused',
    })

    expect(getApplicationStagePresentation(record)).toEqual({
      label: 'Consent declined',
      tone: 'critical',
    })
    expect(getApplicationLatestActivityLabel(record)).toBe('Review the prepared application.')
    expect(getApplicationNextStepLabel(record)).toBe('Review the prepared application.')
  })

  it('keeps the ready-after-consent stage while showing the paused next action as latest activity', () => {
    const record = createRecord({
      consentSummary: { status: 'approved', pendingCount: 0 },
      lastAttemptState: 'paused',
    })

    expect(getApplicationStagePresentation(record)).toEqual({
      label: 'Ready after consent',
      tone: 'active',
    })
    expect(getApplicationLatestActivityLabel(record)).toBe('Review the prepared application.')
  })

  it('keeps waiting-on-consent stage while paused activity falls back to a follow-up label', () => {
    const record = createRecord({
      consentSummary: { status: 'requested', pendingCount: 2 },
      nextActionLabel: null,
      lastAttemptState: 'paused',
    })

    expect(getApplicationStagePresentation(record)).toEqual({
      label: 'Waiting on consent',
      tone: 'active',
    })
    expect(getApplicationLatestActivityLabel(record)).toBe('Needs follow-up')
    expect(getApplicationNextStepLabel(record)).toBe('Choose continue or skip in Consent requests below.')
  })

  it('prefers progressed status and latest action once the record has moved beyond consent states', () => {
    const record = createRecord({
      status: 'interview',
      lastActionLabel: 'Interview scheduled for Tuesday.',
      nextActionLabel: 'Prepare portfolio walkthrough.',
      consentSummary: { status: 'approved', pendingCount: 0 },
      lastAttemptState: 'paused',
    })

    expect(getApplicationStagePresentation(record)).toEqual({
      label: 'Interview',
      tone: 'positive',
    })
    expect(getApplicationLatestActivityLabel(record)).toBe(
      'Interview scheduled for Tuesday.',
    )
    expect(getApplicationNextStepLabel(record)).toBe('Prepare portfolio walkthrough.')
  })

  it('does not keep showing consent declined after the record is later archived', () => {
    const record = createRecord({
      status: 'archived',
      lastActionLabel: 'Archived after final decision.',
      nextActionLabel: null,
      consentSummary: { status: 'declined', pendingCount: 0 },
      lastAttemptState: 'paused',
    })

    expect(getApplicationStagePresentation(record)).toEqual({
      label: 'Archived',
      tone: 'muted',
    })
    expect(getApplicationLatestActivityLabel(record)).toBe('Archived after final decision.')
    expect(getApplicationNextStepLabel(record)).toBe('No next step saved')
  })

  it('shortens long manual-submit guidance for tighter card layouts', () => {
    expect(
      getApplicationReadableNextStepLabel(
        'Review the prepared application and submit manually when ready',
      ),
    ).toBe('Submit the prepared application manually')
  })
})
