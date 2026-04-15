import type {
  CandidateProfile,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupState,
  ProfileSetupStep,
} from '@unemployed/contracts'

export type ProfileSetupReviewItem = ProfileSetupState['reviewItems'][number]
export type ProfileSetupReviewItemDisplay = ProfileSetupReviewItem & {
  savedStatus: ProfileSetupReviewItem['status']
  statusSource: 'saved' | 'draft'
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getPreferredApplicationLinkUrls(profile: CandidateProfile): string[] {
  return Array.from(
    new Set(
      profile.applicationIdentity.preferredLinkIds.flatMap((linkId) => {
        const url = profile.links.find((entry) => entry.id === linkId)?.url
        return typeof url === 'string' && url.trim().length > 0 ? [url] : []
      }),
    ),
  )
}

function getCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileSetupReviewItem['target'],
): unknown {
  switch (target.domain) {
    case 'identity': {
      if (target.key === 'contactPath') {
        return [profile.email ?? '', profile.phone ?? ''].filter((value) => hasMeaningfulText(value))
      }

      return (profile as Record<string, unknown>)[target.key] ?? null
    }
    case 'application_identity':
      if (target.key === 'preferredLinkUrls') {
        return getPreferredApplicationLinkUrls(profile)
      }

      return (profile.applicationIdentity as Record<string, unknown>)[target.key] ?? null
    case 'work_eligibility':
      return (profile.workEligibility as Record<string, unknown>)[target.key] ?? null
    case 'professional_summary':
      return (profile.professionalSummary as Record<string, unknown>)[target.key] ?? null
    case 'search_preferences':
      return (searchPreferences as Record<string, unknown>)[target.key] ?? null
    case 'narrative':
      return (profile.narrative as Record<string, unknown>)[target.key] ?? null
    case 'answer_bank':
      return (profile.answerBank as Record<string, unknown>)[target.key] ?? null
    case 'experience': {
      const record = target.recordId
        ? profile.experiences.find((entry) => entry.id === target.recordId) ?? null
        : profile.experiences

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'education': {
      const record = target.recordId
        ? profile.education.find((entry) => entry.id === target.recordId) ?? null
        : profile.education

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'certification': {
      const record = target.recordId
        ? profile.certifications.find((entry) => entry.id === target.recordId) ?? null
        : profile.certifications

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'project': {
      const record = target.recordId
        ? profile.projects.find((entry) => entry.id === target.recordId) ?? null
        : profile.projects

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'link': {
      const record = target.recordId
        ? profile.links.find((entry) => entry.id === target.recordId) ?? null
        : profile.links

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'language': {
      const record = target.recordId
        ? profile.spokenLanguages.find((entry) => entry.id === target.recordId) ?? null
        : profile.spokenLanguages

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
    case 'proof_point': {
      const record = target.recordId
        ? profile.proofBank.find((entry) => entry.id === target.recordId) ?? null
        : profile.proofBank

      return target.key === 'record' || !isObjectRecord(record)
        ? record
        : (record as Record<string, unknown>)[target.key] ?? null
    }
  }
}

function hasCurrentTargetValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  target: ProfileSetupReviewItem['target'],
): boolean {
  const value = getCurrentTargetValue(profile, searchPreferences, target)

  if (typeof value === 'string') {
    return hasMeaningfulText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (isObjectRecord(value)) {
    return Object.values(value).some((entry) => {
      if (typeof entry === 'string') {
        return hasMeaningfulText(entry)
      }

      if (typeof entry === 'number' || typeof entry === 'boolean') {
        return true
      }

      return Array.isArray(entry) ? entry.length > 0 : false
    })
  }

  return false
}

function humanizeRecordFieldKey(key: string): string {
  switch (key) {
    case 'companyName':
      return 'Company'
    case 'isCurrent':
      return 'Current role'
    case 'startDate':
      return 'Start'
    case 'endDate':
      return 'End'
    case 'fieldOfStudy':
      return 'Field of study'
    case 'workMode':
      return 'Work mode'
    case 'dateEarned':
      return 'Date earned'
    default:
      return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()
  }
}

function humanizePrimitive(value: boolean | number): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function summarizeValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return humanizePrimitive(value)
  }

  if (Array.isArray(value)) {
    const parts = value.flatMap((entry) => summarizeValue(entry) ?? [])
    return parts.length > 0 ? parts.join(', ') : null
  }

  if (isObjectRecord(value)) {
    const parts = Object.entries(value).flatMap(([key, entry]) => {
      const summary = summarizeValue(entry)
      return summary ? [`${humanizeRecordFieldKey(key)}: ${summary}`] : []
    })

    return parts.length > 0 ? parts.join(' · ') : null
  }

  return null
}

function normalizeComparableSummary(value: string | null): string | null {
  return value ? value.trim().replace(/\s+/g, ' ').toLowerCase() : null
}

export function buildDraftAwareSetupReviewItems(input: {
  currentProfile: CandidateProfile
  currentSearchPreferences: JobSearchPreferences
  draftProfile: CandidateProfile
  draftSearchPreferences: JobSearchPreferences
  reviewItems: readonly ProfileSetupReviewItem[]
}): ProfileSetupReviewItemDisplay[] {
  return input.reviewItems.map((item) => {
    if (item.status !== 'pending') {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: 'saved',
      }
    }

    const previousValue = getCurrentTargetValue(
      input.currentProfile,
      input.currentSearchPreferences,
      item.target,
    )
    const draftValue = getCurrentTargetValue(
      input.draftProfile,
      input.draftSearchPreferences,
      item.target,
    )

    if (!hasCurrentTargetValue(input.draftProfile, input.draftSearchPreferences, item.target)) {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: 'saved',
      }
    }

    const previousSummary = normalizeComparableSummary(summarizeValue(previousValue))
    const draftSummary = normalizeComparableSummary(summarizeValue(draftValue))

    if (!draftSummary || previousSummary === draftSummary) {
      return {
        ...item,
        savedStatus: item.status,
        statusSource: 'saved',
      }
    }

    const proposedSummary = normalizeComparableSummary(item.proposedValue ?? null)

    return {
      ...item,
      savedStatus: item.status,
      status: proposedSummary && proposedSummary === draftSummary ? 'confirmed' : 'edited',
      statusSource: 'draft',
    }
  })
}

export function formatReviewStatus(status: ProfileSetupReviewItem['status']): string {
  return status.replace('_', ' ')
}

export function formatReviewSeverity(severity: ProfileSetupReviewItem['severity']): string {
  return severity === 'critical' ? 'Critical' : severity === 'recommended' ? 'Recommended' : 'Optional'
}

export function badgeVariantForSeverity(
  severity: ProfileSetupReviewItem['severity'],
): 'destructive' | 'status' | 'outline' {
  if (severity === 'critical') {
    return 'destructive'
  }

  return severity === 'recommended' ? 'status' : 'outline'
}

export function canConfirmReviewItem(item: ProfileSetupReviewItem): boolean {
  return item.sourceCandidateId !== null && item.status === 'pending'
}

export function canClearReviewItem(item: ProfileSetupReviewItem): boolean {
  return !(item.target.domain === 'identity' && item.target.key === 'yearsExperience')
}

export function getReviewItemEditHint(item: ProfileSetupReviewItem): string | null {
  if (item.target.domain === 'experience') {
    return 'Edit this in Work history on the left. Use the role\'s Work mode field to mark it Remote, Hybrid, or Onsite. Keep Location for the city or region you want shown, and use Targeting later if you also want future job searches to prefer remote roles.'
  }

  if (item.target.domain === 'search_preferences' || item.target.domain === 'work_eligibility') {
    return 'Edit this in the Targeting step. Preferred work modes controls Remote, Hybrid, or Onsite for future job searches, while Preferred locations narrows where you want those roles to be based.'
  }

  if (item.target.domain === 'identity' && item.target.key === 'currentLocation') {
    return 'Edit this in Essentials. Displayed location is the location shown on your profile and generated resumes, not your remote-job preference.'
  }

  return null
}

export function buildSetupCopilotPlaceholder(step: ProfileSetupStep): string {
  switch (step) {
    case 'essentials':
      return 'Example: update my headline to "Principal product designer focused on workflow systems"'
    case 'targeting':
      return 'Example: help me tighten my target roles for remote design systems work'
    case 'narrative':
      return 'Example: rewrite my professional story: "..."'
    case 'answers':
      return 'Example: draft a stronger short self-introduction: "..."'
    default:
      return 'Ask for a grounded profile improvement or a structured edit for this setup step.'
  }
}

export function buildStepEditorContext(step: ProfileSetupStep): ProfileCopilotContext {
  return {
    surface: 'setup',
    step,
  }
}
