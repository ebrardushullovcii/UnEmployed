import { normalizeWorkModeList, type CandidateProfile, type ResumeImportFieldCandidateSummary } from '@unemployed/contracts'
import type { EducationFormEntry, ExperienceFormEntry } from './job-finder-types'
import { joinListInput } from './job-finder-utils'
import type { ProfileEditorValues } from './profile-editor-types'

const PROFILE_PLACEHOLDER_HEADLINE = 'Import your resume to begin'
const PROFILE_PLACEHOLDER_LOCATION = 'Set your preferred location'
const PROFILE_FRESH_START_ID = 'candidate_fresh_start'

const monthNumberByName: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeIdentityText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeIdentityDate(value: string) {
  const trimmed = normalizeIdentityText(value)

  if (!trimmed) {
    return ''
  }

  if (trimmed === 'present' || trimmed === 'current') {
    return 'present'
  }

  const isoMonthMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (isoMonthMatch) {
    return `${isoMonthMatch[1]}-${isoMonthMatch[2]}`
  }

  const monthYearMatch = trimmed.replace(/\./g, '').match(/^([a-z]+)\s+(\d{4})$/)
  if (monthYearMatch) {
    const monthName = monthYearMatch[1]
    const year = monthYearMatch[2]

    if (!monthName || !year) {
      return trimmed
    }

    const month = monthNumberByName[monthName]
    if (month) {
      return `${year}-${month}`
    }
  }

  return trimmed
}

const comparableValueOmittedKeys = new Set([
  'id',
  'isDraft',
  'sourceCandidateId',
  'sourceCandidateFingerprint',
])

export function buildComparableValueFingerprint(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeIdentityText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => buildComparableValueFingerprint(entry))
      .filter(Boolean)
      .sort()
      .join('||')
  }

  if (!isObject(value)) {
    return ''
  }

  return Object.entries(value)
    .filter(([key, entry]) => !comparableValueOmittedKeys.has(key) && entry !== undefined)
    .map(([key, entry]) => {
      if (key === 'startDate' || key === 'endDate') {
        return [key, typeof entry === 'string' ? normalizeIdentityDate(entry) : buildComparableValueFingerprint(entry)] as const
      }

      return [key, buildComparableValueFingerprint(entry)] as const
    })
    .filter(([, entry]) => entry.length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, entry]) => `${key}:${entry}`)
    .join('|')
}

export function buildExperienceFormFingerprint(entry: ExperienceFormEntry): string {
  return buildComparableValueFingerprint(entry)
}

export function buildEducationFormFingerprint(entry: EducationFormEntry): string {
  return buildComparableValueFingerprint(entry)
}

function normalizeExperienceWorkMode(value: unknown): ExperienceFormEntry['workMode'] {
  const normalized = normalizeWorkModeList(value)

  return Array.isArray(normalized)
    ? normalized.filter((entry): entry is ExperienceFormEntry['workMode'][number] => typeof entry === 'string')
    : []
}

function buildExperienceIdentity(entry: ExperienceFormEntry) {
  return [
    normalizeIdentityText(entry.title),
    normalizeIdentityText(entry.companyName),
    normalizeIdentityDate(entry.startDate),
    normalizeIdentityDate(entry.endDate)
  ].join('|')
}

function buildEducationIdentity(entry: EducationFormEntry) {
  return [
    normalizeIdentityText(entry.schoolName),
    normalizeIdentityText(entry.degree),
    normalizeIdentityDate(entry.startDate),
    normalizeIdentityDate(entry.endDate)
  ].join('|')
}

function fieldsMatch(left: string, right: string) {
  return left.length > 0 && right.length > 0 && left === right
}

function fieldsCompatible(left: string, right: string) {
  return !left || !right || left === right
}

function scoreTruthyFields(values: readonly unknown[]) {
  return values.reduce<number>((count, value) => {
    if (typeof value === 'string') {
      return value.trim().length > 0 ? count + 1 : count
    }

    if (typeof value === 'boolean') {
      return value ? count + 1 : count
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? count + 1 : count
    }

    return value !== null && value !== undefined ? count + 1 : count
  }, 0)
}

function areEquivalentExperienceEntries(left: ExperienceFormEntry, right: ExperienceFormEntry) {
  const leftCompany = normalizeIdentityText(left.companyName)
  const rightCompany = normalizeIdentityText(right.companyName)
  const leftTitle = normalizeIdentityText(left.title)
  const rightTitle = normalizeIdentityText(right.title)
  const leftLocation = normalizeIdentityText(left.location)
  const rightLocation = normalizeIdentityText(right.location)
  const leftStart = normalizeIdentityDate(left.startDate)
  const rightStart = normalizeIdentityDate(right.startDate)
  const leftEnd = left.isCurrent ? 'present' : normalizeIdentityDate(left.endDate)
  const rightEnd = right.isCurrent ? 'present' : normalizeIdentityDate(right.endDate)

  return (
    (fieldsMatch(leftTitle, rightTitle) &&
      fieldsMatch(leftStart, rightStart) &&
      fieldsCompatible(leftCompany, rightCompany) &&
      (fieldsMatch(leftCompany, rightCompany) || fieldsMatch(leftEnd, rightEnd) || fieldsCompatible(leftLocation, rightLocation))) ||
    (fieldsMatch(leftCompany, rightCompany) &&
      fieldsMatch(leftStart, rightStart) &&
      fieldsCompatible(leftTitle, rightTitle) &&
      (fieldsMatch(leftTitle, rightTitle) || fieldsMatch(leftEnd, rightEnd) || fieldsCompatible(leftLocation, rightLocation))) ||
    (fieldsMatch(leftTitle, rightTitle) &&
      fieldsMatch(leftCompany, rightCompany) &&
      fieldsCompatible(leftStart, rightStart) &&
      fieldsCompatible(leftEnd, rightEnd))
  )
}

function areEquivalentEducationEntries(left: EducationFormEntry, right: EducationFormEntry) {
  const leftSchool = normalizeIdentityText(left.schoolName)
  const rightSchool = normalizeIdentityText(right.schoolName)
  const leftDegree = normalizeIdentityText(left.degree)
  const rightDegree = normalizeIdentityText(right.degree)
  const leftField = normalizeIdentityText(left.fieldOfStudy)
  const rightField = normalizeIdentityText(right.fieldOfStudy)
  const leftStart = normalizeIdentityDate(left.startDate)
  const rightStart = normalizeIdentityDate(right.startDate)
  const leftEnd = normalizeIdentityDate(left.endDate)
  const rightEnd = normalizeIdentityDate(right.endDate)

  return (
    (fieldsMatch(leftSchool, rightSchool) &&
      fieldsMatch(leftDegree, rightDegree) &&
      (fieldsMatch(leftStart, rightStart) || fieldsMatch(leftEnd, rightEnd) || fieldsCompatible(leftField, rightField))) ||
    (fieldsMatch(leftSchool, rightSchool) &&
      fieldsMatch(leftStart, rightStart) &&
      fieldsCompatible(leftDegree, rightDegree) &&
      fieldsCompatible(leftField, rightField))
  )
}

function scoreExperienceEntryCompleteness(entry: ExperienceFormEntry) {
  return scoreTruthyFields([
    entry.companyName,
    entry.companyUrl,
    entry.title,
    entry.employmentType,
    entry.location,
    entry.startDate,
    entry.endDate,
    entry.isCurrent,
    entry.summary,
    entry.peopleManagementScope,
    entry.ownershipScope,
    entry.workMode,
    entry.achievements,
    entry.skills,
    entry.domainTags,
  ])
}

function scoreEducationEntryCompleteness(entry: EducationFormEntry) {
  return scoreTruthyFields([
    entry.schoolName,
    entry.degree,
    entry.fieldOfStudy,
    entry.location,
    entry.startDate,
    entry.endDate,
    entry.summary,
  ])
}

function mergeExperienceReviewCandidates(
  existing: ExperienceFormEntry[],
  candidates: readonly ResumeImportFieldCandidateSummary[]
): ExperienceFormEntry[] {
  const merged = [...existing]
  const canonicalEntryIds = new Set(existing.filter((entry) => !entry.sourceCandidateId).map((entry) => entry.id))

  for (const candidate of candidates) {
    if (candidate.target.section !== 'experience' || candidate.target.key !== 'record' || !isObject(candidate.value)) {
      continue
    }

    const value = candidate.value
    const nextEntry: ExperienceFormEntry = {
      id: candidate.target.recordId ?? candidate.id,
      companyName: typeof value.companyName === 'string' ? value.companyName : '',
      companyUrl: typeof value.companyUrl === 'string' ? value.companyUrl : '',
      title: typeof value.title === 'string' ? value.title : '',
      employmentType: typeof value.employmentType === 'string' ? value.employmentType : '',
      location: typeof value.location === 'string' ? value.location : '',
      workMode: normalizeExperienceWorkMode(value.workMode),
      startDate: typeof value.startDate === 'string' ? value.startDate : '',
      endDate: typeof value.endDate === 'string' ? value.endDate : '',
      isCurrent: value.isCurrent === true,
      summary: typeof value.summary === 'string' ? value.summary : '',
      achievements: joinListInput(Array.isArray(value.achievements) ? value.achievements.filter((entry): entry is string => typeof entry === 'string') : []),
      skills: joinListInput(Array.isArray(value.skills) ? value.skills.filter((entry): entry is string => typeof entry === 'string') : []),
      domainTags: joinListInput(Array.isArray(value.domainTags) ? value.domainTags.filter((entry): entry is string => typeof entry === 'string') : []),
      peopleManagementScope: typeof value.peopleManagementScope === 'string' ? value.peopleManagementScope : '',
      ownershipScope: typeof value.ownershipScope === 'string' ? value.ownershipScope : ''
    }
    const nextFingerprint = buildExperienceFormFingerprint(nextEntry)
    nextEntry.sourceCandidateId = candidate.id
    nextEntry.sourceCandidateFingerprint = nextFingerprint

    const matchingIndex = merged.findIndex((entry) =>
      buildExperienceIdentity(entry) === buildExperienceIdentity(nextEntry) ||
      areEquivalentExperienceEntries(entry, nextEntry)
    )

    if (matchingIndex === -1) {
      merged.push(nextEntry)
      continue
    }

    const existingEntry = merged[matchingIndex]
    if (existingEntry && canonicalEntryIds.has(existingEntry.id)) {
      continue
    }

    if ((existingEntry ? scoreExperienceEntryCompleteness(existingEntry) : 0) < scoreExperienceEntryCompleteness(nextEntry)) {
      merged.splice(matchingIndex, 1, nextEntry)
    }
  }

  return merged
}

function mergeEducationReviewCandidates(
  existing: EducationFormEntry[],
  candidates: readonly ResumeImportFieldCandidateSummary[]
): EducationFormEntry[] {
  const merged = [...existing]
  const canonicalEntryIds = new Set(existing.filter((entry) => !entry.sourceCandidateId).map((entry) => entry.id))

  for (const candidate of candidates) {
    if (candidate.target.section !== 'education' || candidate.target.key !== 'record' || !isObject(candidate.value)) {
      continue
    }

    const value = candidate.value
    const nextEntry: EducationFormEntry = {
      id: candidate.target.recordId ?? candidate.id,
      schoolName: typeof value.schoolName === 'string' ? value.schoolName : '',
      degree: typeof value.degree === 'string' ? value.degree : '',
      fieldOfStudy: typeof value.fieldOfStudy === 'string' ? value.fieldOfStudy : '',
      location: typeof value.location === 'string' ? value.location : '',
      startDate: typeof value.startDate === 'string' ? value.startDate : '',
      endDate: typeof value.endDate === 'string' ? value.endDate : '',
      summary: typeof value.summary === 'string' ? value.summary : ''
    }
    const nextFingerprint = buildEducationFormFingerprint(nextEntry)
    nextEntry.sourceCandidateId = candidate.id
    nextEntry.sourceCandidateFingerprint = nextFingerprint

    const matchingIndex = merged.findIndex((entry) =>
      buildEducationIdentity(entry) === buildEducationIdentity(nextEntry) ||
      areEquivalentEducationEntries(entry, nextEntry)
    )

    if (matchingIndex === -1) {
      merged.push(nextEntry)
      continue
    }

    const existingEntry = merged[matchingIndex]
    if (existingEntry && canonicalEntryIds.has(existingEntry.id)) {
      continue
    }

    if ((existingEntry ? scoreEducationEntryCompleteness(existingEntry) : 0) < scoreEducationEntryCompleteness(nextEntry)) {
      merged.splice(matchingIndex, 1, nextEntry)
    }
  }

  return merged
}

export function applyReviewCandidates(
  values: ProfileEditorValues,
  profile: CandidateProfile,
  candidates: readonly ResumeImportFieldCandidateSummary[]
): ProfileEditorValues {
  const nextValues = structuredClone(values)

  for (const candidate of candidates) {
    if (candidate.target.recordId !== null || candidate.target.section === 'experience' || candidate.target.section === 'education') {
      continue
    }

    switch (`${candidate.target.section}.${candidate.target.key}`) {
      case 'identity.firstName':
        if (!profile.firstName.trim() && typeof candidate.value === 'string') {
          nextValues.identity.firstName = candidate.value
        }
        break
      case 'identity.middleName':
        if (!profile.middleName?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.middleName = candidate.value
        }
        break
      case 'identity.lastName':
        if (!profile.lastName.trim() && typeof candidate.value === 'string') {
          nextValues.identity.lastName = candidate.value
        }
        break
      case 'identity.headline':
        if (profile.headline.trim() === PROFILE_PLACEHOLDER_HEADLINE && typeof candidate.value === 'string') {
          nextValues.identity.headline = candidate.value
        }
        break
      case 'identity.summary':
        if (!profile.summary.trim() || profile.summary.includes('Import a resume or paste resume text')) {
          if (typeof candidate.value === 'string') {
            nextValues.identity.summary = candidate.value
            nextValues.summary.fullSummary = candidate.value
          }
        }
        break
      case 'identity.yearsExperience':
        if (profile.id === PROFILE_FRESH_START_ID && profile.yearsExperience === 0 && typeof candidate.value === 'number') {
          nextValues.identity.yearsExperience = String(candidate.value)
        }
        break
      case 'location.currentLocation':
        if (profile.currentLocation.trim() === PROFILE_PLACEHOLDER_LOCATION && typeof candidate.value === 'string') {
          nextValues.identity.currentLocation = candidate.value
        }
        break
      case 'contact.email':
        if (!profile.email?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.email = candidate.value
        }
        break
      case 'contact.phone':
        if (!profile.phone?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.phone = candidate.value
        }
        break
      case 'contact.linkedinUrl':
        if (!profile.linkedinUrl?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.linkedinUrl = candidate.value
        }
        break
      case 'contact.githubUrl':
        if (!profile.githubUrl?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.githubUrl = candidate.value
        }
        break
      case 'contact.portfolioUrl':
        if (!profile.portfolioUrl?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.portfolioUrl = candidate.value
        }
        break
      case 'contact.personalWebsiteUrl':
        if (!profile.personalWebsiteUrl?.trim() && typeof candidate.value === 'string') {
          nextValues.identity.personalWebsiteUrl = candidate.value
        }
        break
    }
  }

  nextValues.records.experiences = mergeExperienceReviewCandidates(nextValues.records.experiences, candidates)
  nextValues.records.education = mergeEducationReviewCandidates(nextValues.records.education, candidates)

  return nextValues
}
