import type {
  JobFinderAiClient,
  ResumeProfileExtraction,
  TailoredResumeDraft
} from '@unemployed/ai-providers'
import type { BrowserSessionRuntime } from '@unemployed/browser-runtime'
import {
  ApplicationAttemptSchema,
  ApplicationRecordSchema,
  CandidateProfileSchema,
  JobFinderSettingsSchema,
  JobFinderWorkspaceSnapshotSchema,
  JobSearchPreferencesSchema,
  SavedJobSchema,
  TailoredAssetSchema,
  type ApplicationAttempt,
  type ApplicationEvent,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type CandidateProfile,
  type JobFinderSettings,
  type JobFinderWorkspaceSnapshot,
  type JobPosting,
  type JobSearchPreferences,
  type MatchAssessment,
  type ResumeTemplateDefinition,
  type ReviewQueueItem,
  type SavedJob,
  type TailoredAsset
} from '@unemployed/contracts'
import type { JobFinderRepository, JobFinderRepositorySeed } from '@unemployed/db'

const reviewableStatuses = new Set<ApplicationStatus>(['drafting', 'ready_for_review', 'approved'])

const discoveryVisibleStatuses = new Set<ApplicationStatus>([
  'discovered',
  'shortlisted',
  'drafting',
  'ready_for_review',
  'approved'
])

const assetStatusPriority: Record<AssetStatus, number> = {
  ready: 0,
  generating: 1,
  queued: 2,
  failed: 3,
  not_started: 4
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return []
    }

    const key = trimmedValue.toLowerCase()

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [trimmedValue]
  })
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseSalaryFloor(salaryText: string | null): number | null {
  if (!salaryText) {
    return null
  }

  const matches = [...salaryText.matchAll(/(\d[\d,]*)(?:\s*)(k|m)?/gi)]

  if (matches.length === 0) {
    return null
  }

  const parsed = matches
    .map((match) => {
      const baseValue = Number((match[1] ?? '').replaceAll(',', ''))
      const suffix = (match[2] ?? '').toLowerCase()

      if (!Number.isFinite(baseValue) || baseValue <= 0) {
        return null
      }

      if (suffix === 'k') {
        return baseValue * 1000
      }

      if (suffix === 'm') {
        return baseValue * 1_000_000
      }

      return baseValue
    })
    .filter((value): value is number => value !== null)

  if (parsed.length === 0) {
    return null
  }

  return Math.min(...parsed)
}

function matchesAnyPhrase(candidate: string, desiredValues: readonly string[]): boolean {
  if (desiredValues.length === 0) {
    return true
  }

  const normalizedCandidate = normalizeText(candidate)
  const candidateTokens = new Set(tokenize(candidate))

  return desiredValues.some((desiredValue) => {
    const normalizedDesired = normalizeText(desiredValue)

    if (normalizedCandidate.includes(normalizedDesired)) {
      return true
    }

    return tokenize(desiredValue).every((token) => candidateTokens.has(token))
  })
}

function toSavedJobId(posting: JobPosting): string {
  return `job_${posting.source}_${posting.sourceJobId}`
}

function buildReviewQueue(
  savedJobs: readonly SavedJob[],
  tailoredAssets: readonly TailoredAsset[]
): ReviewQueueItem[] {
  const assetsByJobId = new Map(tailoredAssets.map((asset) => [asset.jobId, asset]))

  return savedJobs
    .filter((job) => reviewableStatuses.has(job.status))
    .map<ReviewQueueItem>((job) => {
      const asset = assetsByJobId.get(job.id) ?? null

      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        matchScore: job.matchAssessment.score,
        applicationStatus: job.status,
        assetStatus: asset?.status ?? 'not_started',
        progressPercent: asset?.progressPercent ?? null,
        resumeAssetId: asset?.id ?? null,
        updatedAt: asset?.updatedAt ?? job.discoveredAt
      }
    })
    .sort((left, right) => {
      const assetDelta = assetStatusPriority[left.assetStatus] - assetStatusPriority[right.assetStatus]

      if (assetDelta !== 0) {
        return assetDelta
      }

      return right.matchScore - left.matchScore
    })
}

function buildDiscoveryJobs(savedJobs: readonly SavedJob[]): SavedJob[] {
  return [...savedJobs]
    .filter((job) => discoveryVisibleStatuses.has(job.status))
    .sort((left, right) => right.matchAssessment.score - left.matchAssessment.score)
}

function buildApplicationRecords(
  savedApplicationRecords: readonly ApplicationRecord[]
): ApplicationRecord[] {
  return [...savedApplicationRecords].sort(
    (left, right) => new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
  )
}

function createMatchAssessment(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting
): MatchAssessment {
  let score = 48
  const reasons: string[] = []
  const gaps: string[] = []

  const matchesRole = matchesAnyPhrase(posting.title, searchPreferences.targetRoles)
  const matchesLocation = matchesAnyPhrase(posting.location, searchPreferences.locations)
  const matchesWorkMode =
    searchPreferences.workModes.length === 0 ||
    searchPreferences.workModes.includes('flexible') ||
    posting.workMode.some((mode) => searchPreferences.workModes.includes(mode))
  const salaryFloor = parseSalaryFloor(posting.salaryText)
  const meetsSalaryExpectation =
    searchPreferences.minimumSalaryUsd === null ||
    salaryFloor === null ||
    salaryFloor >= searchPreferences.minimumSalaryUsd
  const isPreferredCompany = searchPreferences.companyWhitelist.some(
    (company) => normalizeText(company) === normalizeText(posting.company)
  )
  const profileSkills = new Set(profile.skills.map((skill) => normalizeText(skill)))
  const overlappingSkills = posting.keySkills.filter((skill) => profileSkills.has(normalizeText(skill)))

  if (matchesRole) {
    score += 16
    reasons.push('Role title aligns closely with the current target roles.')
  } else {
    gaps.push('Role title is adjacent to the target list but not an exact fit.')
  }

  if (matchesLocation) {
    score += 10
    reasons.push('Location fits the saved search preferences.')
  } else {
    gaps.push('Location falls outside the preferred search areas.')
  }

  if (matchesWorkMode) {
    score += 8
    reasons.push('Work mode matches the preferred operating model.')
  } else {
    gaps.push('Work mode does not match the saved remote or hybrid preferences.')
  }

  if (meetsSalaryExpectation) {
    score += 6
  } else {
    gaps.push('Compensation looks below the saved salary target.')
  }

  if (isPreferredCompany) {
    score += 8
    reasons.push('Company appears in the current preferred-company list.')
  }

  if (overlappingSkills.length > 0) {
    score += Math.min(12, overlappingSkills.length * 4)
    reasons.push(`Skill overlap includes ${overlappingSkills.slice(0, 2).join(' and ')}.`)
  } else {
    gaps.push('The listing emphasizes skills that are not yet prominent in the current profile.')
  }

  if (posting.easyApplyEligible) {
    score += 6
    reasons.push('Easy Apply is available for the listing, keeping the flow in scope.')
  }

  return {
    score: clampScore(score),
    reasons: reasons.slice(0, 3),
    gaps: gaps.slice(0, 3)
  }
}

async function createMatchAssessmentAsync(
  aiClient: JobFinderAiClient,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  posting: JobPosting
): Promise<MatchAssessment> {
  const fallbackAssessment = createMatchAssessment(profile, searchPreferences, posting)
  const assistedAssessment = await aiClient.assessJobFit({
    profile,
    searchPreferences,
    job: posting
  })

  if (!assistedAssessment) {
    return fallbackAssessment
  }

  return {
    score: clampScore(assistedAssessment.score),
    reasons: assistedAssessment.reasons.slice(0, 3),
    gaps: assistedAssessment.gaps.slice(0, 3)
  }
}

function preserveJobStatus(existingJob: SavedJob | undefined): ApplicationStatus {
  if (!existingJob) {
    return 'discovered'
  }

  if (existingJob.status === 'archived' || existingJob.status === 'submitted' || existingJob.status === 'rejected') {
    return existingJob.status
  }

  return existingJob.status
}

function mergeDiscoveredJob(
  matchAssessment: MatchAssessment,
  posting: JobPosting,
  existingJob: SavedJob | undefined
): SavedJob {
  return SavedJobSchema.parse({
    ...posting,
    id: existingJob?.id ?? toSavedJobId(posting),
    status: preserveJobStatus(existingJob),
    matchAssessment
  })
}

function buildTailoredResumeText(
  profile: CandidateProfile,
  job: SavedJob,
  previewSections: Array<{ heading: string; lines: string[] }>
): string {
  const sections = previewSections
    .map((section) => `${section.heading}
${section.lines.join('\n')}`)
    .join('\n\n')

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`
}

function buildPreviewSectionsFromDraft(draft: TailoredResumeDraft) {
  return [
    {
      heading: 'Summary',
      lines: [draft.summary]
    },
    {
      heading: 'Experience Highlights',
      lines: [...draft.experienceHighlights]
    },
    {
      heading: 'Core Skills',
      lines: [...draft.coreSkills]
    },
    {
      heading: 'Targeted Keywords',
      lines: [...draft.targetedKeywords]
    }
  ].filter((section) => section.lines.length > 0)
}

function normalizeProfileBeforeSave(
  currentProfile: CandidateProfile,
  nextProfile: CandidateProfile
): CandidateProfile {
  const resumeChanged =
    currentProfile.baseResume.id !== nextProfile.baseResume.id ||
    currentProfile.baseResume.storagePath !== nextProfile.baseResume.storagePath ||
    currentProfile.baseResume.textContent !== nextProfile.baseResume.textContent

  if (!resumeChanged) {
    return CandidateProfileSchema.parse(nextProfile)
  }

  const nextResumeText = nextProfile.baseResume.textContent

  return CandidateProfileSchema.parse({
    ...nextProfile,
    baseResume: {
      ...nextProfile.baseResume,
      textUpdatedAt: nextResumeText ? new Date().toISOString() : null,
      extractionStatus: nextResumeText ? 'not_started' : 'needs_text',
      lastAnalyzedAt: null,
      analysisWarnings: []
    }
  })
}

function buildExtractionId(
  prefix: string,
  index: number,
  parts: ReadonlyArray<string | null | undefined>
): string {
  const slug = parts
    .map((part) => normalizeText(part ?? '').replaceAll(' ', '_'))
    .filter(Boolean)
    .join('_')
    .slice(0, 48)

  return `${prefix}_${slug || index + 1}`
}

function normalizeRecordKey(parts: ReadonlyArray<string | null | undefined>): string {
  return parts.map((part) => normalizeText(part ?? '')).filter(Boolean).join('|')
}

function toValidUrlOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

function parseLocationParts(location: string | null | undefined): {
  currentCity: string | null
  currentRegion: string | null
  currentCountry: string | null
} {
  if (!location) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null
    }
  }

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)

  if (parts.length === 0) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null
    }
  }

  if (parts.length === 1) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: null,
      currentCountry: null
    }
  }

  if (parts.length === 2) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: null,
      currentCountry: parts[1] ?? null
    }
  }

  return {
    currentCity: parts[0] ?? null,
    currentRegion: parts[1] ?? null,
    currentCountry: parts[parts.length - 1] ?? null
  }
}

function mergeExperienceRecords(
  existing: CandidateProfile['experiences'],
  extracted: ResumeProfileExtraction['experiences']
): CandidateProfile['experiences'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.companyName, entry.title, entry.startDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.companyName, entry.title, entry.startDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('experience', index, [entry.companyName, entry.title, entry.startDate]),
      companyName: entry.companyName,
      companyUrl: entry.companyUrl,
      title: entry.title,
      employmentType: entry.employmentType,
      location: entry.location,
      workMode: entry.workMode ? [entry.workMode] : [],
      startDate: entry.startDate,
      endDate: entry.endDate,
      isCurrent: entry.isCurrent,
      isDraft: !entry.companyName && !entry.title,
      summary: entry.summary,
      achievements: uniqueStrings(entry.achievements),
      skills: uniqueStrings(entry.skills),
      domainTags: uniqueStrings(entry.domainTags),
      peopleManagementScope: entry.peopleManagementScope,
      ownershipScope: entry.ownershipScope
    }
  })
}

function mergeEducationRecords(
  existing: CandidateProfile['education'],
  extracted: ResumeProfileExtraction['education']
): CandidateProfile['education'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.schoolName, entry.degree, entry.startDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.schoolName, entry.degree, entry.startDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('education', index, [entry.schoolName, entry.degree, entry.startDate]),
      schoolName: entry.schoolName,
      degree: entry.degree,
      fieldOfStudy: entry.fieldOfStudy,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      isDraft: !entry.schoolName,
      summary: entry.summary
    }
  })
}

function mergeCertificationRecords(
  existing: CandidateProfile['certifications'],
  extracted: ResumeProfileExtraction['certifications']
): CandidateProfile['certifications'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.name, entry.issuer, entry.issueDate]), entry])
  )

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.name, entry.issuer, entry.issueDate])
    const match = existingByKey.get(key)

    return {
      id: match?.id ?? buildExtractionId('certification', index, [entry.name, entry.issuer, entry.issueDate]),
      name: entry.name,
      issuer: entry.issuer,
      issueDate: entry.issueDate,
      expiryDate: entry.expiryDate,
      credentialUrl: toValidUrlOrNull(entry.credentialUrl),
      isDraft: !entry.name
    }
  })
}

function mergeLinkRecords(
  existing: CandidateProfile['links'],
  extracted: ResumeProfileExtraction['links']
): CandidateProfile['links'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.url]), entry]))
  const nextLinks: CandidateProfile['links'] = []

  extracted.forEach((entry, index) => {
    const url = toValidUrlOrNull(entry.url)

    if (!url) {
      return
    }

    const key = normalizeRecordKey([url])
    const match = existingByKey.get(key)

    nextLinks.push({
      id: match?.id ?? buildExtractionId('link', index, [entry.label, url]),
      label: entry.label,
      url,
      kind: entry.kind,
      isDraft: !entry.label || !url
    })
  })

  return nextLinks
}

function mergeProjectRecords(
  existing: CandidateProfile['projects'],
  extracted: ResumeProfileExtraction['projects']
): CandidateProfile['projects'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.name, entry.role]), entry]))

  return extracted
    .map((entry, index) => {
      if (!entry.name) {
        return null
      }

      const key = normalizeRecordKey([entry.name, entry.role])
      const match = existingByKey.get(key)

      return {
        id: match?.id ?? buildExtractionId('project', index, [entry.name, entry.role]),
        name: entry.name,
        projectType: entry.projectType,
        summary: entry.summary,
        role: entry.role,
        skills: uniqueStrings(entry.skills),
        outcome: entry.outcome,
        projectUrl: entry.projectUrl,
        repositoryUrl: entry.repositoryUrl,
        caseStudyUrl: entry.caseStudyUrl
      }
    })
    .filter((entry): entry is CandidateProfile['projects'][number] => entry !== null)
}

function mergeLanguageRecords(
  existing: CandidateProfile['spokenLanguages'],
  extracted: ResumeProfileExtraction['spokenLanguages']
): CandidateProfile['spokenLanguages'] {
  if (extracted.length === 0) {
    return existing
  }

  const existingByKey = new Map(existing.map((entry) => [normalizeRecordKey([entry.language]), entry]))

  return extracted
    .map((entry, index) => {
      if (!entry.language) {
        return null
      }

      const key = normalizeRecordKey([entry.language])
      const match = existingByKey.get(key)

      return {
        id: match?.id ?? buildExtractionId('language', index, [entry.language]),
        language: entry.language,
        proficiency: entry.proficiency,
        interviewPreference: entry.interviewPreference,
        notes: entry.notes
      }
    })
    .filter((entry): entry is CandidateProfile['spokenLanguages'][number] => entry !== null)
}

function mergeResumeExtractionIntoWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  extraction: ResumeProfileExtraction
): {
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
} {
  const profileTargetRoles =
    extraction.targetRoles.length > 0 ? uniqueStrings(extraction.targetRoles) : profile.targetRoles
  const locationFallback = extraction.currentLocation ?? profile.currentLocation
  const profileLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : profile.locations.length > 0
        ? profile.locations
        : uniqueStrings([locationFallback])
  const preferenceLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : searchPreferences.locations.length > 0
        ? searchPreferences.locations
        : profileLocations
  const locationParts = parseLocationParts(extraction.currentLocation ?? profile.currentLocation)
  const mergedSkills = uniqueStrings([
    ...extraction.skills,
    ...extraction.skillGroups.coreSkills,
    ...extraction.skillGroups.tools,
    ...extraction.skillGroups.languagesAndFrameworks,
    ...extraction.skillGroups.highlightedSkills,
    ...extraction.skillGroups.softSkills
  ])

  return {
    profile: CandidateProfileSchema.parse({
      ...profile,
      firstName: extraction.firstName ?? profile.firstName,
      lastName: extraction.lastName ?? profile.lastName,
      middleName: extraction.middleName ?? profile.middleName,
      fullName: extraction.fullName ?? profile.fullName,
      headline: extraction.headline ?? profile.headline,
      summary: extraction.summary ?? profile.summary,
      currentLocation: extraction.currentLocation ?? profile.currentLocation,
      currentCity: locationParts.currentCity ?? profile.currentCity,
      currentRegion: locationParts.currentRegion ?? profile.currentRegion,
      currentCountry: locationParts.currentCountry ?? profile.currentCountry,
      timeZone: extraction.timeZone ?? profile.timeZone,
      yearsExperience: extraction.yearsExperience ?? profile.yearsExperience,
      email: extraction.email,
      phone: extraction.phone,
      portfolioUrl: extraction.portfolioUrl,
      linkedinUrl: extraction.linkedinUrl,
      githubUrl: extraction.githubUrl ?? profile.githubUrl,
      personalWebsiteUrl: extraction.personalWebsiteUrl ?? profile.personalWebsiteUrl,
      professionalSummary: {
        ...profile.professionalSummary,
        shortValueProposition:
          extraction.professionalSummary.shortValueProposition ??
          profile.professionalSummary.shortValueProposition,
        fullSummary:
          extraction.professionalSummary.fullSummary ?? extraction.summary ?? profile.professionalSummary.fullSummary,
        careerThemes:
          extraction.professionalSummary.careerThemes.length > 0
            ? uniqueStrings(extraction.professionalSummary.careerThemes)
            : profile.professionalSummary.careerThemes,
        leadershipSummary:
          extraction.professionalSummary.leadershipSummary ?? profile.professionalSummary.leadershipSummary,
        domainFocusSummary:
          extraction.professionalSummary.domainFocusSummary ?? profile.professionalSummary.domainFocusSummary,
        strengths:
          extraction.professionalSummary.strengths.length > 0
            ? uniqueStrings(extraction.professionalSummary.strengths)
            : profile.professionalSummary.strengths
      },
      skillGroups: {
        coreSkills:
          extraction.skillGroups.coreSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.coreSkills)
            : profile.skillGroups.coreSkills,
        tools:
          extraction.skillGroups.tools.length > 0
            ? uniqueStrings(extraction.skillGroups.tools)
            : profile.skillGroups.tools,
        languagesAndFrameworks:
          extraction.skillGroups.languagesAndFrameworks.length > 0
            ? uniqueStrings(extraction.skillGroups.languagesAndFrameworks)
            : profile.skillGroups.languagesAndFrameworks,
        softSkills:
          extraction.skillGroups.softSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.softSkills)
            : profile.skillGroups.softSkills,
        highlightedSkills:
          extraction.skillGroups.highlightedSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.highlightedSkills)
            : profile.skillGroups.highlightedSkills
      },
      targetRoles: profileTargetRoles,
      locations: profileLocations,
      skills: mergedSkills.length > 0 ? mergedSkills : profile.skills,
      experiences: mergeExperienceRecords(profile.experiences, extraction.experiences),
      education: mergeEducationRecords(profile.education, extraction.education),
      certifications: mergeCertificationRecords(profile.certifications, extraction.certifications),
      links: mergeLinkRecords(profile.links, extraction.links),
      projects: mergeProjectRecords(profile.projects, extraction.projects),
      spokenLanguages: mergeLanguageRecords(profile.spokenLanguages, extraction.spokenLanguages),
      baseResume: {
        ...profile.baseResume,
        extractionStatus: 'ready',
        lastAnalyzedAt: new Date().toISOString(),
        analysisProviderKind: extraction.analysisProviderKind,
        analysisProviderLabel: extraction.analysisProviderLabel,
        analysisWarnings: uniqueStrings(extraction.notes)
      }
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      ...searchPreferences,
      targetRoles:
        extraction.targetRoles.length > 0
          ? uniqueStrings(extraction.targetRoles)
          : searchPreferences.targetRoles.length > 0
            ? searchPreferences.targetRoles
            : profileTargetRoles,
      locations: preferenceLocations,
      salaryCurrency: extraction.salaryCurrency ?? searchPreferences.salaryCurrency
    })
  }
}

function nextAssetVersion(existingAsset: TailoredAsset | undefined): string {
  if (!existingAsset) {
    return 'v1'
  }

  const numericPortion = Number(existingAsset.version.replace(/^v/i, ''))

  if (Number.isNaN(numericPortion)) {
    return 'v1'
  }

  return `v${numericPortion + 1}`
}

function mergeEvents(
  existingEvents: readonly ApplicationEvent[],
  additionalEvents: readonly ApplicationEvent[]
): ApplicationEvent[] {
  const merged = new Map(existingEvents.map((event) => [event.id, event]))

  for (const event of additionalEvents) {
    merged.set(event.id, event)
  }

  return [...merged.values()].sort(
    (left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()
  )
}

function toApplicationEvents(
  job: SavedJob,
  checkpoints: ApplicationAttempt['checkpoints']
): ApplicationEvent[] {
  return checkpoints.map((checkpoint) => ({
    id: `event_${checkpoint.id}`,
    at: checkpoint.at,
    title: checkpoint.label,
    detail: `${checkpoint.detail} (${job.company})`,
    emphasis:
      checkpoint.state === 'submitted'
        ? 'positive'
        : checkpoint.state === 'paused' || checkpoint.state === 'unsupported'
          ? 'warning'
          : checkpoint.state === 'failed'
            ? 'critical'
            : 'neutral'
  }))
}

function nextJobStatusFromAttempt(job: SavedJob, attemptState: ApplicationAttempt['state']): ApplicationStatus {
  switch (attemptState) {
    case 'submitted':
      return 'submitted'
    case 'paused':
    case 'unsupported':
    case 'failed':
      return 'approved'
    default:
      return job.status
  }
}

export interface JobFinderWorkspaceService {
  getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot>
  openBrowserSession(): Promise<JobFinderWorkspaceSnapshot>
  resetWorkspace(seed: JobFinderRepositorySeed): Promise<JobFinderWorkspaceSnapshot>
  saveProfile(profile: CandidateProfile): Promise<JobFinderWorkspaceSnapshot>
  analyzeProfileFromResume(): Promise<JobFinderWorkspaceSnapshot>
  saveSearchPreferences(searchPreferences: JobSearchPreferences): Promise<JobFinderWorkspaceSnapshot>
  saveSettings(settings: JobFinderSettings): Promise<JobFinderWorkspaceSnapshot>
  runDiscovery(): Promise<JobFinderWorkspaceSnapshot>
  queueJobForReview(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  dismissDiscoveryJob(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  generateResume(jobId: string): Promise<JobFinderWorkspaceSnapshot>
  approveApply(jobId: string): Promise<JobFinderWorkspaceSnapshot>
}

export interface RenderedResumeArtifact {
  fileName: string | null
  storagePath: string | null
}

export interface JobFinderDocumentManager {
  listResumeTemplates(): readonly ResumeTemplateDefinition[]
  renderResumeArtifact(input: {
    job: SavedJob
    profile: CandidateProfile
    previewSections: Array<{ heading: string; lines: string[] }>
    settings: JobFinderSettings
    textContent: string
  }): Promise<RenderedResumeArtifact>
}

export interface CreateJobFinderWorkspaceServiceOptions {
  aiClient: JobFinderAiClient
  documentManager: JobFinderDocumentManager
  repository: JobFinderRepository
  browserRuntime: BrowserSessionRuntime
}

export function createJobFinderWorkspaceService(
  options: CreateJobFinderWorkspaceServiceOptions
): JobFinderWorkspaceService {
  const { aiClient, browserRuntime, documentManager, repository } = options

  async function getWorkspaceSnapshot(): Promise<JobFinderWorkspaceSnapshot> {
    const [
      profile,
      searchPreferences,
      savedJobs,
      tailoredAssets,
      applicationRecords,
      applicationAttempts,
      settings,
      browserSession
    ] = await Promise.all([
      repository.getProfile(),
      repository.getSearchPreferences(),
      repository.listSavedJobs(),
      repository.listTailoredAssets(),
      repository.listApplicationRecords(),
      repository.listApplicationAttempts(),
      repository.getSettings(),
      browserRuntime.getSessionState('linkedin')
    ])

    const discoveryJobs = buildDiscoveryJobs(savedJobs)
    const reviewQueue = buildReviewQueue(savedJobs, tailoredAssets)
    const orderedApplicationRecords = buildApplicationRecords(applicationRecords)

    return JobFinderWorkspaceSnapshotSchema.parse({
      module: 'job-finder',
      generatedAt: new Date().toISOString(),
      agentProvider: aiClient.getStatus(),
      availableResumeTemplates: documentManager.listResumeTemplates(),
      profile,
      searchPreferences,
      browserSession,
      discoveryJobs,
      selectedDiscoveryJobId: discoveryJobs[0]?.id ?? null,
      reviewQueue,
      selectedReviewJobId: reviewQueue[0]?.jobId ?? null,
      tailoredAssets,
      applicationRecords: orderedApplicationRecords,
      applicationAttempts,
      selectedApplicationRecordId: orderedApplicationRecords[0]?.id ?? null,
      settings
    })
  }

  async function updateJob(jobId: string, updater: (job: SavedJob) => SavedJob): Promise<void> {
    const savedJobs = await repository.listSavedJobs()
    let found = false
    const nextJobs = savedJobs.map((job) => {
      if (job.id !== jobId) {
        return job
      }

      found = true
      return SavedJobSchema.parse(updater(job))
    })

    if (!found) {
      throw new Error(`Unknown Job Finder job '${jobId}'.`)
    }

    await repository.replaceSavedJobs(nextJobs)
  }

  return {
    getWorkspaceSnapshot,
    async resetWorkspace(seed) {
      await repository.reset(seed)
      return getWorkspaceSnapshot()
    },
    async openBrowserSession() {
      await browserRuntime.openSession('linkedin')
      return getWorkspaceSnapshot()
    },
    async saveProfile(profile) {
      const currentProfile = await repository.getProfile()
      await repository.saveProfile(normalizeProfileBeforeSave(currentProfile, CandidateProfileSchema.parse(profile)))
      return getWorkspaceSnapshot()
    },
    async analyzeProfileFromResume() {
      const [profile, searchPreferences] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences()
      ])

      if (!profile.baseResume.textContent) {
        await repository.saveProfile(
          CandidateProfileSchema.parse({
            ...profile,
            baseResume: {
              ...profile.baseResume,
              extractionStatus: 'needs_text',
              lastAnalyzedAt: null,
              analysisWarnings: ['Paste plain-text resume content to let the agent extract candidate details.']
            }
          })
        )

        throw new Error('Resume text is required before the profile agent can extract candidate details.')
      }

      const extraction = await aiClient.extractProfileFromResume({
        existingProfile: profile,
        existingSearchPreferences: searchPreferences,
        resumeText: profile.baseResume.textContent
      })
      const merged = mergeResumeExtractionIntoWorkspace(profile, searchPreferences, extraction)

      await Promise.all([
        repository.saveProfile(merged.profile),
        repository.saveSearchPreferences(merged.searchPreferences)
      ])

      return getWorkspaceSnapshot()
    },
    async saveSearchPreferences(searchPreferences) {
      await repository.saveSearchPreferences(JobSearchPreferencesSchema.parse(searchPreferences))
      return getWorkspaceSnapshot()
    },
    async saveSettings(settings) {
      await repository.saveSettings(JobFinderSettingsSchema.parse(settings))
      return getWorkspaceSnapshot()
    },
    async runDiscovery() {
      const [profile, searchPreferences, savedJobs] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.listSavedJobs()
      ])
      const discoveryResult = await browserRuntime.runDiscovery('linkedin', searchPreferences)
      const savedJobsByPostingKey = new Map<string, SavedJob>()

      for (const job of savedJobs) {
        const key = `${job.source}:${job.sourceJobId}:${job.canonicalUrl}`
        savedJobsByPostingKey.set(key, job)
      }

      const nextJobsById = new Map(savedJobs.map((job) => [job.id, job]))

      for (const posting of discoveryResult.jobs) {
        const postingKey = `${posting.source}:${posting.sourceJobId}:${posting.canonicalUrl}`
        const existingJob = savedJobsByPostingKey.get(postingKey)
        const matchAssessment = await createMatchAssessmentAsync(
          aiClient,
          profile,
          searchPreferences,
          posting
        )
        const mergedJob = mergeDiscoveredJob(matchAssessment, posting, existingJob)
        nextJobsById.set(mergedJob.id, mergedJob)
      }

      await repository.replaceSavedJobs([...nextJobsById.values()])
      return getWorkspaceSnapshot()
    },
    async queueJobForReview(jobId) {
      const tailoredAssets = await repository.listTailoredAssets()
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

      await updateJob(jobId, (job) => ({
        ...job,
        status: asset?.status === 'ready' ? 'ready_for_review' : 'drafting'
      }))

      return getWorkspaceSnapshot()
    },
    async dismissDiscoveryJob(jobId) {
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'archived'
      }))

      return getWorkspaceSnapshot()
    },
    async generateResume(jobId) {
      const [profile, searchPreferences, settings, savedJobs, tailoredAssets] = await Promise.all([
        repository.getProfile(),
        repository.getSearchPreferences(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.listTailoredAssets()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)

      if (!job) {
        throw new Error(`Unable to generate a resume for unknown job '${jobId}'.`)
      }

      const existingAsset = tailoredAssets.find((asset) => asset.jobId === jobId)
      const draft = await aiClient.tailorResume({
        profile,
        searchPreferences,
        settings,
        job,
        resumeText: profile.baseResume.textContent
      })
      const generationMethod = draft.notes.some((note: string) => normalizeText(note).includes('deterministic'))
        ? 'deterministic'
        : aiClient.getStatus().kind === 'openai_compatible'
          ? 'ai_assisted'
          : 'deterministic'
      const previewSections = buildPreviewSectionsFromDraft(draft)
      const contentText = draft.fullText || buildTailoredResumeText(profile, job, previewSections)
      const renderedArtifact = await documentManager.renderResumeArtifact({
        job,
        profile,
        previewSections,
        settings,
        textContent: contentText
      })
      const selectedTemplate = documentManager
        .listResumeTemplates()
        .find((template) => template.id === settings.resumeTemplateId)
      const nextAsset = TailoredAssetSchema.parse({
        id: existingAsset?.id ?? `resume_${jobId}`,
        jobId,
        kind: 'resume',
        status: 'ready',
        label: draft.label ?? 'Tailored Resume',
        version: nextAssetVersion(existingAsset),
        templateName: selectedTemplate?.label ?? existingAsset?.templateName ?? 'Classic ATS',
        compatibilityScore: draft.compatibilityScore ?? Math.min(100, job.matchAssessment.score + 3),
        progressPercent: 100,
        updatedAt: new Date().toISOString(),
        storagePath: renderedArtifact.storagePath,
        contentText,
        previewSections,
        generationMethod,
        notes: uniqueStrings([
          ...draft.notes,
          ...(renderedArtifact.fileName ? [`Rendered into template file ${renderedArtifact.fileName}.`] : [])
        ])
      })

      await repository.upsertTailoredAsset(nextAsset)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: 'ready_for_review'
      }))

      return getWorkspaceSnapshot()
    },
    async approveApply(jobId) {
      const [profile, settings, savedJobs, tailoredAssets, applicationRecords] = await Promise.all([
        repository.getProfile(),
        repository.getSettings(),
        repository.listSavedJobs(),
        repository.listTailoredAssets(),
        repository.listApplicationRecords()
      ])
      const job = savedJobs.find((entry) => entry.id === jobId)
      const asset = tailoredAssets.find((entry) => entry.jobId === jobId)

      if (!job) {
        throw new Error(`Unable to approve apply flow for unknown job '${jobId}'.`)
      }

      if (!asset || asset.status !== 'ready') {
        throw new Error(`A ready tailored resume is required before applying to '${job.title}'.`)
      }

      const executionResult = await browserRuntime.executeEasyApply('linkedin', {
        job,
        asset,
        profile,
        settings
      })
      const now = new Date().toISOString()
      const attempt = ApplicationAttemptSchema.parse({
        id: `attempt_${jobId}_${Date.now()}`,
        jobId,
        state: executionResult.state,
        summary: executionResult.summary,
        detail: executionResult.detail,
        startedAt: executionResult.checkpoints[0]?.at ?? now,
        updatedAt: executionResult.submittedAt ?? now,
        completedAt:
          executionResult.state === 'in_progress' ? null : executionResult.submittedAt ?? now,
        outcome: executionResult.outcome,
        checkpoints: executionResult.checkpoints,
        nextActionLabel: executionResult.nextActionLabel
      })

      await repository.upsertApplicationAttempt(attempt)

      const existingRecord = applicationRecords.find((record) => record.jobId === jobId)
      const nextRecord = ApplicationRecordSchema.parse({
        id: existingRecord?.id ?? `application_${jobId}`,
        jobId,
        title: job.title,
        company: job.company,
        status: nextJobStatusFromAttempt(job, executionResult.state),
        lastActionLabel: executionResult.summary,
        nextActionLabel: executionResult.nextActionLabel,
        lastUpdatedAt: executionResult.submittedAt ?? now,
        lastAttemptState: executionResult.state,
        events: mergeEvents(existingRecord?.events ?? [], toApplicationEvents(job, executionResult.checkpoints))
      })

      await repository.upsertApplicationRecord(nextRecord)
      await updateJob(jobId, (currentJob) => ({
        ...currentJob,
        status: nextJobStatusFromAttempt(currentJob, executionResult.state)
      }))

      return getWorkspaceSnapshot()
    }
  }
}
