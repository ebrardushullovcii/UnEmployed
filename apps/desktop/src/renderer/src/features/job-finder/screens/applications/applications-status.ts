import type { ApplicationRecord } from '@unemployed/contracts'
import { formatStatusLabel, getApplicationTone } from '../../lib/job-finder-utils'
import type { BadgeTone } from '../../lib/job-finder-types'

function shouldPresentConsentState(record: ApplicationRecord): boolean {
  return (
    record.status === 'drafting' ||
    record.status === 'ready_for_review' ||
    record.status === 'approved'
  )
}

export function getApplicationLatestActivityLabel(record: ApplicationRecord): string {
  if (record.lastAttemptState === 'unsupported') {
    return 'Manual apply only'
  }

  if (record.lastAttemptState === 'failed') {
    return 'Attempt failed'
  }

  if (record.lastAttemptState === 'submitted') {
    return record.lastActionLabel || 'Submitted'
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === 'paused'
  ) {
    return record.nextActionLabel ?? 'Needs follow-up'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'requested'
  ) {
    return record.consentSummary.pendingCount > 1
      ? `${record.consentSummary.pendingCount} consent decisions waiting`
      : 'Consent decision waiting'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'approved'
  ) {
    return 'Consent approved'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'declined'
  ) {
    return 'Consent declined'
  }

  if (!shouldPresentConsentState(record)) {
    return record.lastActionLabel
  }

  return record.lastActionLabel
}

export function getApplicationStagePresentation(record: ApplicationRecord): {
  label: string
  tone: BadgeTone
} {
  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === 'unsupported'
  ) {
    return { label: 'Manual apply only', tone: 'critical' }
  }

  if (
    shouldPresentConsentState(record) &&
    record.lastAttemptState === 'failed'
  ) {
    return { label: 'Needs recovery', tone: 'critical' }
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'requested'
  ) {
    return { label: 'Waiting on consent', tone: 'active' }
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'approved'
  ) {
    return record.lastAttemptState === 'submitted'
      ? { label: 'Submitted', tone: getApplicationTone('submitted') }
      : { label: 'Ready after consent', tone: 'active' }
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'declined'
  ) {
    return { label: 'Consent declined', tone: 'critical' }
  }

  return {
    label: formatStatusLabel(record.status),
    tone: getApplicationTone(record.status)
  }
}

export function getApplicationNextStepLabel(record: ApplicationRecord): string {
  if (record.lastAttemptState === 'submitted') {
    return record.nextActionLabel ?? 'No next step saved'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'requested'
  ) {
    return 'Choose continue or skip in Consent requests below.'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'approved'
  ) {
    return record.nextActionLabel ?? 'Review the prepared application before any later execution step.'
  }

  if (
    shouldPresentConsentState(record) &&
    record.consentSummary.status === 'declined'
  ) {
    return record.nextActionLabel ?? 'Restart the run if you want to try again later.'
  }

  return record.nextActionLabel ?? 'No next step saved'
}

export function getApplicationReadableNextStepLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim()

  if (!trimmed) {
    return null
  }

  if (/review the prepared application and submit manually when ready/i.test(trimmed)) {
    return 'Submit the prepared application manually'
  }

  if (/review the pending submit approval in applications/i.test(trimmed)) {
    return 'Review the pending submit approval'
  }

  if (/review the queued run approval in applications/i.test(trimmed)) {
    return 'Review the queued run approval'
  }

  return trimmed
}
