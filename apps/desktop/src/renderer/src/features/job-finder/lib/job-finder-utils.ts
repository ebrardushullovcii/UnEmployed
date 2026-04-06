import type {
  ApplicationAttempt,
  ApplicationEvent,
  ApplicationRecord,
  ApplicationStatus,
  AssetStatus,
  BrowserSessionState,
  CandidateProfile,
  SourceDebugRunRecord
} from '@unemployed/contracts'
import type {
  BadgeTone,
  BooleanSelectValue,
  CertificationFormEntry,
  EducationFormEntry,
  ExperienceFormEntry,
  LanguageFormEntry,
  LinkFormEntry,
  ProjectFormEntry
} from './job-finder-types'

export function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export function formatDateOnly(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(timestamp))
}

export function formatOptionalDateOnly(timestamp: string | null, fallback: string | null = null): string {
  if (!timestamp) {
    return fallback ?? 'Unknown'
  }

  return formatDateOnly(timestamp)
}

export function formatStatusLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function formatResumeAnalysisSummary(profile: CandidateProfile): string | null {
  const analyzedAt = profile.baseResume.lastAnalyzedAt

  if (!analyzedAt) {
    return null
  }

  return `Profile suggestions refreshed from your resume on ${formatTimestamp(analyzedAt)}.`
}

export function formatCountLabel(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}

export function formatRunStateLabel(state: SourceDebugRunRecord['state']): string {
  switch (state) {
    case 'completed':
      return 'Completed'
    case 'paused_manual':
      return 'Needs manual step'
    case 'failed':
      return 'Needs attention'
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Interrupted'
    case 'running':
      return 'Running'
    default:
      return 'Not started'
  }
}

export function getAttemptLabel(value: ApplicationAttempt['state'] | ApplicationRecord['lastAttemptState']): string {
  if (!value) {
    return 'No apply attempt'
  }

  switch (value) {
    case 'paused':
      return 'Needs follow-up'
    case 'unsupported':
      return 'Manual apply only'
    case 'failed':
      return 'Attempt failed'
    case 'submitted':
      return 'Submitted'
    case 'in_progress':
      return 'In progress'
    case 'not_started':
      return 'Not started'
    default:
      return formatStatusLabel(value)
  }
}

export function getAttemptTone(value: ApplicationAttempt['state'] | ApplicationRecord['lastAttemptState'] | null): BadgeTone {
  switch (value) {
    case 'submitted':
      return 'positive'
    case 'failed':
    case 'unsupported':
      return 'critical'
    case 'paused':
    case 'in_progress':
      return 'active'
    default:
      return 'muted'
  }
}

export function getApplicationTone(status: ApplicationStatus): BadgeTone {
  switch (status) {
    case 'interview':
    case 'offer':
      return 'positive'
    case 'ready_for_review':
    case 'approved':
    case 'drafting':
    case 'shortlisted':
      return 'active'
    case 'submitted':
    case 'assessment':
      return 'neutral'
    case 'rejected':
    case 'withdrawn':
      return 'critical'
    default:
      return 'muted'
  }
}

export function getAssetTone(status: AssetStatus): BadgeTone {
  switch (status) {
    case 'ready':
      return 'positive'
    case 'generating':
    case 'queued':
      return 'active'
    case 'failed':
      return 'critical'
    default:
      return 'muted'
  }
}

export function getEventTone(event: ApplicationEvent): BadgeTone {
  switch (event.emphasis) {
    case 'positive':
      return 'positive'
    case 'warning':
      return 'active'
    case 'critical':
      return 'critical'
    default:
      return 'muted'
  }
}

export function getSessionTone(session: BrowserSessionState): BadgeTone {
  switch (session.status) {
    case 'ready':
      return 'positive'
    case 'login_required':
      return 'active'
    case 'blocked':
      return 'critical'
    default:
      return 'muted'
  }
}

export function joinListInput(values: readonly string[]): string {
  return values.join('\n')
}

export function parseListInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function buildFullName(parts: { firstName: string; middleName: string; lastName: string }): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
}

export function booleanToSelect(value: boolean | null): BooleanSelectValue {
  if (value === true) {
    return 'yes'
  }

  if (value === false) {
    return 'no'
  }

  return ''
}

export function selectToBoolean(value: BooleanSelectValue): boolean | null {
  if (value === 'yes') {
    return true
  }

  if (value === 'no') {
    return false
  }

  return null
}

export function uniqueList(values: readonly string[]): string[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const trimmed = value.trim()

    if (!trimmed) {
      return []
    }

    const key = trimmed.toLowerCase()

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [trimmed]
  })
}

export function createProfileEntryId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—'
  }

  if (ms < 1000) {
    return '<1s'
  }

  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function parseRequiredNonNegativeInteger(value: string): number | null {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const parsedValue = Number(trimmedValue)

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

export function toExperienceFormEntries(profile: CandidateProfile): ExperienceFormEntry[] {
  return profile.experiences.map((experience) => ({
    id: experience.id,
    companyName: experience.companyName ?? '',
    companyUrl: experience.companyUrl ?? '',
    title: experience.title ?? '',
    employmentType: experience.employmentType ?? '',
    location: experience.location ?? '',
    workMode: experience.workMode ?? [],
    startDate: experience.startDate ?? '',
    endDate: experience.endDate ?? '',
    isCurrent: experience.isCurrent,
    summary: experience.summary ?? '',
    achievements: joinListInput(experience.achievements),
    skills: joinListInput(experience.skills),
    domainTags: joinListInput(experience.domainTags),
    peopleManagementScope: experience.peopleManagementScope ?? '',
    ownershipScope: experience.ownershipScope ?? ''
  }))
}

export function toEducationFormEntries(profile: CandidateProfile): EducationFormEntry[] {
  return profile.education.map((education) => ({
    id: education.id,
    schoolName: education.schoolName ?? '',
    degree: education.degree ?? '',
    fieldOfStudy: education.fieldOfStudy ?? '',
    location: education.location ?? '',
    startDate: education.startDate ?? '',
    endDate: education.endDate ?? '',
    summary: education.summary ?? ''
  }))
}

export function toCertificationFormEntries(profile: CandidateProfile): CertificationFormEntry[] {
  return profile.certifications.map((certification) => ({
    id: certification.id,
    name: certification.name ?? '',
    issuer: certification.issuer ?? '',
    issueDate: certification.issueDate ?? '',
    expiryDate: certification.expiryDate ?? '',
    credentialUrl: certification.credentialUrl ?? ''
  }))
}

export function toLinkFormEntries(profile: CandidateProfile): LinkFormEntry[] {
  return profile.links.map((link) => ({
    id: link.id,
    label: link.label ?? '',
    url: link.url ?? '',
    kind: link.kind ?? ''
  }))
}

export function toProjectFormEntries(profile: CandidateProfile): ProjectFormEntry[] {
  return profile.projects.map((project) => ({
    id: project.id,
    name: project.name,
    projectType: project.projectType ?? '',
    summary: project.summary ?? '',
    role: project.role ?? '',
    skills: joinListInput(project.skills),
    outcome: project.outcome ?? '',
    projectUrl: project.projectUrl ?? '',
    repositoryUrl: project.repositoryUrl ?? '',
    caseStudyUrl: project.caseStudyUrl ?? ''
  }))
}

export function toLanguageFormEntries(profile: CandidateProfile): LanguageFormEntry[] {
  return profile.spokenLanguages.map((language) => ({
    id: language.id,
    language: language.language,
    proficiency: language.proficiency ?? '',
    interviewPreference: language.interviewPreference,
    notes: language.notes ?? ''
  }))
}
