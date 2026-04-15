import {
  candidateAnswerKindValues,
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  type ResumeImportFieldCandidateSummary,
  SourceInstructionStatusSchema,
  type CandidateProfile,
  type JobDiscoveryTarget,
  type JobSearchPreferences
} from '@unemployed/contracts'
import type {
  DiscoveryTargetEditorValue,
  ProofBankEntryFormEntry,
  ReusableAnswerFormEntry
} from './job-finder-types'
import {
  booleanToSelect,
  buildFullName,
  joinListInput,
  parseListInput,
  parseRequiredNonNegativeInteger,
  selectToBoolean,
  toCertificationFormEntries,
  toEducationFormEntries,
  toExperienceFormEntries,
  toLanguageFormEntries,
  toLinkFormEntries,
  toProjectFormEntries,
  uniqueList
} from './job-finder-utils'
import {
  applyReviewCandidates,
  buildComparableValueFingerprint,
  buildEducationFormFingerprint,
  buildExperienceFormFingerprint,
} from './profile-editor-review-candidates'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from './profile-editor-types'

export type { ProfileEditorValues, SearchPreferencesEditorValues } from './profile-editor-types'

function shouldPersistReviewCandidateEntry(input: {
  sourceCandidateId?: string | null | undefined
  sourceCandidateFingerprint?: string | null | undefined
  currentFingerprint: string
}): boolean {
  if (!input.sourceCandidateId || !input.sourceCandidateFingerprint) {
    return true
  }

  return input.currentFingerprint !== input.sourceCandidateFingerprint
}

function dedupeRecordsByFingerprint<TRecord extends Record<string, unknown>>(
  records: readonly TRecord[],
): TRecord[] {
  const seen = new Set<string>()

  return records.filter((record) => {
    const fingerprint = buildComparableValueFingerprint(record)

    if (!fingerprint) {
      return true
    }

    if (seen.has(fingerprint)) {
      return false
    }

    seen.add(fingerprint)
    return true
  })
}

function toDiscoveryTargetEditorValues(searchPreferences: JobSearchPreferences): DiscoveryTargetEditorValue[] {
  return searchPreferences.discovery.targets.map((target) => ({
    id: target.id,
    label: target.label,
    startingUrl: target.startingUrl,
    enabled: target.enabled,
    adapterKind: 'auto',
    customInstructions: target.customInstructions ?? '',
    instructionStatus: target.instructionStatus,
    validatedInstructionId: target.validatedInstructionId,
    draftInstructionId: target.draftInstructionId,
    lastDebugRunId: target.lastDebugRunId,
    lastVerifiedAt: target.lastVerifiedAt,
    staleReason: target.staleReason
  }))
}

function toDiscoveryTargets(values: readonly DiscoveryTargetEditorValue[]): JobDiscoveryTarget[] {
  return values.map((target) => {
    const parsedStatus = SourceInstructionStatusSchema.safeParse(target.instructionStatus)
    const instructionStatus = parsedStatus.success ? parsedStatus.data : 'missing'

    return {
      instructionStatus,
      id: target.id,
      label: target.label.trim(),
      startingUrl: target.startingUrl.trim(),
      enabled: target.enabled,
      adapterKind: 'auto',
      customInstructions: target.customInstructions.trim() || null,
      validatedInstructionId: target.validatedInstructionId,
      draftInstructionId: target.draftInstructionId,
      lastDebugRunId: target.lastDebugRunId,
      lastVerifiedAt: target.lastVerifiedAt,
      staleReason: target.staleReason
    }
  })
}

function isValidSourceInstructionStatus(value: string): boolean {
  return SourceInstructionStatusSchema.safeParse(value).success
}

function toProofBankFormEntries(profile: CandidateProfile): ProofBankEntryFormEntry[] {
  return profile.proofBank.map((entry) => ({
    id: entry.id,
    title: entry.title,
    claim: entry.claim,
    heroMetric: entry.heroMetric ?? '',
    supportingContext: entry.supportingContext ?? '',
    roleFamilies: joinListInput(entry.roleFamilies),
    projectIds: joinListInput(entry.projectIds),
    linkIds: joinListInput(entry.linkIds)
  }))
}

function toReusableAnswerFormEntries(profile: CandidateProfile): ReusableAnswerFormEntry[] {
  return profile.answerBank.customAnswers.map((entry) => ({
    id: entry.id,
    label: entry.label,
    question: entry.question,
    answer: entry.answer,
    kind: entry.kind,
    roleFamilies: joinListInput(entry.roleFamilies),
    proofEntryIds: joinListInput(entry.proofEntryIds)
  }))
}

export function createProfileEditorValues(
  profile: CandidateProfile,
  reviewCandidates: readonly ResumeImportFieldCandidateSummary[] = []
): ProfileEditorValues {
  const values: ProfileEditorValues = {
    identity: {
      currentCity: profile.currentCity ?? '',
      currentCountry: profile.currentCountry ?? '',
      currentLocation: profile.currentLocation,
      currentRegion: profile.currentRegion ?? '',
      email: profile.email ?? '',
      firstName: profile.firstName,
      githubUrl: profile.githubUrl ?? '',
      headline: profile.headline,
      lastName: profile.lastName,
      linkedinUrl: profile.linkedinUrl ?? '',
      middleName: profile.middleName ?? '',
      personalWebsiteUrl: profile.personalWebsiteUrl ?? '',
      phone: profile.phone ?? '',
      portfolioUrl: profile.portfolioUrl ?? '',
      preferredDisplayName: profile.preferredDisplayName ?? '',
      resumeText: profile.baseResume.textContent ?? '',
      secondaryEmail: profile.secondaryEmail ?? '',
      summary: profile.summary,
      timeZone: profile.timeZone ?? '',
      yearsExperience: String(profile.yearsExperience)
    },
    eligibility: {
      authorizedWorkCountries: joinListInput(profile.workEligibility.authorizedWorkCountries),
      availableStartDate: profile.workEligibility.availableStartDate ?? '',
      noticePeriodDays: profile.workEligibility.noticePeriodDays?.toString() ?? '',
      preferredRelocationRegions: joinListInput(profile.workEligibility.preferredRelocationRegions),
      remoteEligible: booleanToSelect(profile.workEligibility.remoteEligible),
      requiresVisaSponsorship: booleanToSelect(profile.workEligibility.requiresVisaSponsorship),
      securityClearance: profile.workEligibility.securityClearance ?? '',
      willingToRelocate: booleanToSelect(profile.workEligibility.willingToRelocate),
      willingToTravel: booleanToSelect(profile.workEligibility.willingToTravel)
    },
    applicationIdentity: {
      preferredEmail: profile.applicationIdentity.preferredEmail ?? '',
      preferredLinkIds: joinListInput(profile.applicationIdentity.preferredLinkIds),
      preferredPhone: profile.applicationIdentity.preferredPhone ?? ''
    },
    answerBank: {
      availability: profile.answerBank.availability ?? '',
      careerTransition: profile.answerBank.careerTransition ?? '',
      customAnswers: toReusableAnswerFormEntries(profile),
      noticePeriod: profile.answerBank.noticePeriod ?? '',
      relocation: profile.answerBank.relocation ?? '',
      salaryExpectations: profile.answerBank.salaryExpectations ?? '',
      selfIntroduction: profile.answerBank.selfIntroduction ?? '',
      travel: profile.answerBank.travel ?? '',
      visaSponsorship: profile.answerBank.visaSponsorship ?? '',
      workAuthorization: profile.answerBank.workAuthorization ?? ''
    },
    languages: toLanguageFormEntries(profile),
    links: toLinkFormEntries(profile),
    narrative: {
      careerTransitionSummary: profile.narrative.careerTransitionSummary ?? '',
      differentiators: joinListInput(profile.narrative.differentiators),
      motivationThemes: joinListInput(profile.narrative.motivationThemes),
      nextChapterSummary: profile.narrative.nextChapterSummary ?? '',
      professionalStory: profile.narrative.professionalStory ?? ''
    },
    profileSkills: joinListInput(profile.skills),
    proofBank: toProofBankFormEntries(profile),
    projects: toProjectFormEntries(profile),
    records: {
      certifications: toCertificationFormEntries(profile),
      education: toEducationFormEntries(profile),
      experiences: toExperienceFormEntries(profile)
    },
    skillGroups: {
      coreSkills: joinListInput(profile.skillGroups.coreSkills),
      highlightedSkills: joinListInput(profile.skillGroups.highlightedSkills),
      languagesAndFrameworks: joinListInput(profile.skillGroups.languagesAndFrameworks),
      softSkills: joinListInput(profile.skillGroups.softSkills),
      tools: joinListInput(profile.skillGroups.tools)
    },
    summary: {
      careerThemes: joinListInput(profile.professionalSummary.careerThemes),
      domainFocusSummary: profile.professionalSummary.domainFocusSummary ?? '',
      fullSummary: profile.professionalSummary.fullSummary ?? profile.summary,
      leadershipSummary: profile.professionalSummary.leadershipSummary ?? '',
      shortValueProposition: profile.professionalSummary.shortValueProposition ?? '',
      strengths: joinListInput(profile.professionalSummary.strengths)
    }
  }

  return applyReviewCandidates(values, profile, reviewCandidates)
}

export function createSearchPreferencesEditorValues(
  searchPreferences: JobSearchPreferences
): SearchPreferencesEditorValues {
  return {
    companyBlacklist: joinListInput(searchPreferences.companyBlacklist),
    companyWhitelist: joinListInput(searchPreferences.companyWhitelist),
    employmentTypes: joinListInput(searchPreferences.employmentTypes),
    excludedLocations: joinListInput(searchPreferences.excludedLocations),
    jobFamilies: joinListInput(searchPreferences.jobFamilies),
    locations: joinListInput(searchPreferences.locations),
    minimumSalaryUsd: searchPreferences.minimumSalaryUsd?.toString() ?? '',
    salaryCurrency: searchPreferences.salaryCurrency ?? 'USD',
    seniorityLevels: joinListInput(searchPreferences.seniorityLevels),
    tailoringMode: searchPreferences.tailoringMode,
    discoveryTargets: toDiscoveryTargetEditorValues(searchPreferences),
    targetCompanyStages: joinListInput(searchPreferences.targetCompanyStages),
    targetIndustries: joinListInput(searchPreferences.targetIndustries),
    targetRoles: joinListInput(searchPreferences.targetRoles),
    targetSalaryUsd: searchPreferences.targetSalaryUsd?.toString() ?? '',
    workModes: searchPreferences.workModes
  }
}

export function hasProfileDraftChanges(
  profile: CandidateProfile,
  draftProfile: CandidateProfile | undefined,
): boolean {
  if (!draftProfile) {
    return false
  }

  return buildComparableValueFingerprint(profile) !== buildComparableValueFingerprint(draftProfile)
}

export function hasSearchPreferencesDraftChanges(
  searchPreferences: JobSearchPreferences,
  draftSearchPreferences: JobSearchPreferences | undefined,
): boolean {
  if (!draftSearchPreferences) {
    return false
  }

  return buildComparableValueFingerprint(searchPreferences) !== buildComparableValueFingerprint(draftSearchPreferences)
}

export function buildProfilePayload(
  profile: CandidateProfile,
  values: ProfileEditorValues
): { payload?: CandidateProfile; validationMessage?: string } {
  const parsedYearsExperience = parseRequiredNonNegativeInteger(values.identity.yearsExperience)
  if (parsedYearsExperience === null) {
    return {
      validationMessage: 'Years of experience must be a whole number greater than or equal to 0.'
    }
  }

  const parsedNoticePeriodDays = parseRequiredNonNegativeInteger(values.eligibility.noticePeriodDays)
  if (values.eligibility.noticePeriodDays.trim() && parsedNoticePeriodDays === null) {
    return {
      validationMessage: 'Notice period must be a whole number greater than or equal to 0.'
    }
  }

  const builtLocation =
    uniqueList([
      [values.identity.currentCity, values.identity.currentRegion, values.identity.currentCountry]
        .filter(Boolean)
        .join(', '),
      values.identity.currentLocation
    ])[0] ?? values.identity.currentLocation.trim()

  const mergedSkills = uniqueList([
    ...parseListInput(values.profileSkills),
    ...parseListInput(values.skillGroups.coreSkills),
    ...parseListInput(values.skillGroups.tools),
    ...parseListInput(values.skillGroups.languagesAndFrameworks),
    ...parseListInput(values.skillGroups.highlightedSkills)
  ])
  const persistedExperiences = dedupeRecordsByFingerprint(
    values.records.experiences
      .filter((entry) =>
        shouldPersistReviewCandidateEntry({
          sourceCandidateId: entry.sourceCandidateId,
          sourceCandidateFingerprint: entry.sourceCandidateFingerprint,
          currentFingerprint: buildExperienceFormFingerprint(entry),
        }),
      )
      .map((entry) => ({
        id: entry.id,
        companyName: entry.companyName.trim() || null,
        companyUrl: entry.companyUrl.trim() || null,
        title: entry.title.trim() || null,
        employmentType: entry.employmentType.trim() || null,
        location: entry.location.trim() || null,
        workMode: entry.workMode,
        startDate: entry.startDate.trim() || null,
        endDate: entry.isCurrent ? null : entry.endDate.trim() || null,
        isCurrent: entry.isCurrent,
        isDraft: !entry.companyName.trim() || !entry.title.trim(),
        summary: entry.summary.trim() || null,
        achievements: parseListInput(entry.achievements),
        skills: parseListInput(entry.skills),
        domainTags: parseListInput(entry.domainTags),
        peopleManagementScope: entry.peopleManagementScope.trim() || null,
        ownershipScope: entry.ownershipScope.trim() || null,
      })),
  )
  const persistedEducation = dedupeRecordsByFingerprint(
    values.records.education
      .filter((entry) =>
        shouldPersistReviewCandidateEntry({
          sourceCandidateId: entry.sourceCandidateId,
          sourceCandidateFingerprint: entry.sourceCandidateFingerprint,
          currentFingerprint: buildEducationFormFingerprint(entry),
        }),
      )
      .map((entry) => ({
        id: entry.id,
        schoolName: entry.schoolName.trim() || null,
        degree: entry.degree.trim() || null,
        fieldOfStudy: entry.fieldOfStudy.trim() || null,
        location: entry.location.trim() || null,
        startDate: entry.startDate.trim() || null,
        endDate: entry.endDate.trim() || null,
        isDraft: !entry.schoolName.trim(),
        summary: entry.summary.trim() || null,
      })),
  )

  const payload: CandidateProfile = {
    ...profile,
    firstName: values.identity.firstName.trim(),
    middleName: values.identity.middleName.trim() || null,
    lastName: values.identity.lastName.trim(),
    preferredDisplayName: values.identity.preferredDisplayName.trim() || null,
    fullName: buildFullName({
      firstName: values.identity.firstName,
      middleName: values.identity.middleName,
      lastName: values.identity.lastName
    }),
    headline: values.identity.headline.trim(),
    summary: values.summary.fullSummary.trim() || values.identity.summary.trim(),
    currentLocation: builtLocation,
    currentCity: values.identity.currentCity.trim() || null,
    currentRegion: values.identity.currentRegion.trim() || null,
    currentCountry: values.identity.currentCountry.trim() || null,
    timeZone: values.identity.timeZone.trim() || null,
    yearsExperience: parsedYearsExperience,
    email: values.identity.email.trim() || null,
    secondaryEmail: values.identity.secondaryEmail.trim() || null,
    phone: values.identity.phone.trim() || null,
    portfolioUrl: values.identity.portfolioUrl.trim() || null,
    linkedinUrl: values.identity.linkedinUrl.trim() || null,
    githubUrl: values.identity.githubUrl.trim() || null,
    personalWebsiteUrl: values.identity.personalWebsiteUrl.trim() || null,
    baseResume: {
      ...profile.baseResume,
      textContent: values.identity.resumeText.trim() || null
    },
    workEligibility: {
      authorizedWorkCountries: parseListInput(values.eligibility.authorizedWorkCountries),
      requiresVisaSponsorship: selectToBoolean(values.eligibility.requiresVisaSponsorship),
      willingToRelocate: selectToBoolean(values.eligibility.willingToRelocate),
      preferredRelocationRegions: parseListInput(values.eligibility.preferredRelocationRegions),
      willingToTravel: selectToBoolean(values.eligibility.willingToTravel),
      remoteEligible: selectToBoolean(values.eligibility.remoteEligible),
      noticePeriodDays: parsedNoticePeriodDays,
      availableStartDate: values.eligibility.availableStartDate.trim() || null,
      securityClearance: values.eligibility.securityClearance.trim() || null
    },
    applicationIdentity: {
      preferredEmail: values.applicationIdentity.preferredEmail.trim() || null,
      preferredPhone: values.applicationIdentity.preferredPhone.trim() || null,
      preferredLinkIds: parseListInput(values.applicationIdentity.preferredLinkIds)
    },
    answerBank: {
      workAuthorization: values.answerBank.workAuthorization.trim() || null,
      visaSponsorship: values.answerBank.visaSponsorship.trim() || null,
      relocation: values.answerBank.relocation.trim() || null,
      travel: values.answerBank.travel.trim() || null,
      noticePeriod: values.answerBank.noticePeriod.trim() || null,
      availability: values.answerBank.availability.trim() || null,
      salaryExpectations: values.answerBank.salaryExpectations.trim() || null,
      selfIntroduction: values.answerBank.selfIntroduction.trim() || null,
      careerTransition: values.answerBank.careerTransition.trim() || null,
      customAnswers: values.answerBank.customAnswers
        .filter((entry) => entry.question.trim() && entry.answer.trim())
        .map((entry) => ({
          id: entry.id,
          kind: candidateAnswerKindValues.includes(entry.kind)
            ? entry.kind
            : 'other',
          label: entry.label.trim() || entry.question.trim(),
          question: entry.question.trim(),
          answer: entry.answer.trim(),
          roleFamilies: parseListInput(entry.roleFamilies),
          proofEntryIds: parseListInput(entry.proofEntryIds)
        }))
    },
    professionalSummary: {
      shortValueProposition: values.summary.shortValueProposition.trim() || null,
      fullSummary: values.summary.fullSummary.trim() || null,
      careerThemes: parseListInput(values.summary.careerThemes),
      leadershipSummary: values.summary.leadershipSummary.trim() || null,
      domainFocusSummary: values.summary.domainFocusSummary.trim() || null,
      strengths: parseListInput(values.summary.strengths)
    },
    narrative: {
      professionalStory: values.narrative.professionalStory.trim() || null,
      nextChapterSummary: values.narrative.nextChapterSummary.trim() || null,
      careerTransitionSummary: values.narrative.careerTransitionSummary.trim() || null,
      differentiators: parseListInput(values.narrative.differentiators),
      motivationThemes: parseListInput(values.narrative.motivationThemes)
    },
    proofBank: values.proofBank
      .filter((entry) => entry.title.trim() && entry.claim.trim())
      .map((entry) => ({
        id: entry.id,
        title: entry.title.trim(),
        claim: entry.claim.trim(),
        heroMetric: entry.heroMetric.trim() || null,
        supportingContext: entry.supportingContext.trim() || null,
        roleFamilies: parseListInput(entry.roleFamilies),
        projectIds: parseListInput(entry.projectIds),
        linkIds: parseListInput(entry.linkIds)
      })),
    skillGroups: {
      coreSkills: parseListInput(values.skillGroups.coreSkills),
      tools: parseListInput(values.skillGroups.tools),
      languagesAndFrameworks: parseListInput(values.skillGroups.languagesAndFrameworks),
      softSkills: parseListInput(values.skillGroups.softSkills),
      highlightedSkills: parseListInput(values.skillGroups.highlightedSkills)
    },
    skills: mergedSkills,
    experiences: persistedExperiences,
    education: persistedEducation,
    certifications: values.records.certifications.map((entry) => ({
      id: entry.id,
      name: entry.name.trim() || null,
      issuer: entry.issuer.trim() || null,
      issueDate: entry.issueDate.trim() || null,
      expiryDate: entry.expiryDate.trim() || null,
      credentialUrl: entry.credentialUrl.trim() || null,
      isDraft: !entry.name.trim()
    })),
    links: values.links.map((entry) => ({
      id: entry.id,
      label: entry.label.trim() || null,
      url: entry.url.trim() || null,
      kind: entry.kind ? entry.kind : null,
      isDraft: !entry.label.trim() || !entry.url.trim()
    })),
    projects: values.projects.filter((entry) => entry.name.trim()).map((entry) => ({
      id: entry.id,
      name: entry.name.trim(),
      projectType: entry.projectType.trim() || null,
      summary: entry.summary.trim() || null,
      role: entry.role.trim() || null,
      skills: parseListInput(entry.skills),
      outcome: entry.outcome.trim() || null,
      projectUrl: entry.projectUrl.trim() || null,
      repositoryUrl: entry.repositoryUrl.trim() || null,
      caseStudyUrl: entry.caseStudyUrl.trim() || null
    })),
    spokenLanguages: values.languages.filter((entry) => entry.language.trim()).map((entry) => ({
      id: entry.id,
      language: entry.language.trim(),
      proficiency: entry.proficiency.trim() || null,
      interviewPreference: entry.interviewPreference,
      notes: entry.notes.trim() || null
    }))
  }

  const parsedPayload = CandidateProfileSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return { validationMessage: parsedPayload.error.issues[0]?.message ?? 'Profile data is invalid.' }
  }

  return { payload: parsedPayload.data }
}

export function buildSearchPreferencesPayload(
  searchPreferences: JobSearchPreferences,
  values: SearchPreferencesEditorValues
): { payload?: JobSearchPreferences; validationMessage?: string } {
  const invalidTargetStatus = values.discoveryTargets.find(
    (target) => !isValidSourceInstructionStatus(target.instructionStatus)
  )

  if (invalidTargetStatus) {
    return {
      validationMessage: `Job source "${invalidTargetStatus.label.trim() || invalidTargetStatus.id}" has an invalid setup status.`
    }
  }

  const parsedMinimumSalaryUsd = parseRequiredNonNegativeInteger(values.minimumSalaryUsd)
  if (values.minimumSalaryUsd.trim() && parsedMinimumSalaryUsd === null) {
    return {
      validationMessage: 'Minimum salary must be a whole number greater than or equal to 0.'
    }
  }

  const parsedTargetSalaryUsd = parseRequiredNonNegativeInteger(values.targetSalaryUsd)
  if (values.targetSalaryUsd.trim() && parsedTargetSalaryUsd === null) {
    return {
      validationMessage: 'Target salary must be a whole number greater than or equal to 0.'
    }
  }

  const payload: JobSearchPreferences = {
    ...searchPreferences,
    targetRoles: parseListInput(values.targetRoles),
    jobFamilies: parseListInput(values.jobFamilies),
    locations: parseListInput(values.locations),
    excludedLocations: parseListInput(values.excludedLocations),
    workModes: values.workModes,
    seniorityLevels: parseListInput(values.seniorityLevels),
    targetIndustries: parseListInput(values.targetIndustries),
    targetCompanyStages: parseListInput(values.targetCompanyStages),
    employmentTypes: parseListInput(values.employmentTypes),
    minimumSalaryUsd: parsedMinimumSalaryUsd,
    targetSalaryUsd: parsedTargetSalaryUsd,
    salaryCurrency: values.salaryCurrency.trim() || null,
    tailoringMode: values.tailoringMode,
    companyBlacklist: parseListInput(values.companyBlacklist),
    companyWhitelist: parseListInput(values.companyWhitelist),
    discovery: {
      ...searchPreferences.discovery,
      targets: toDiscoveryTargets(values.discoveryTargets)
    }
  }

  const parsedPayload = JobSearchPreferencesSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return { validationMessage: parsedPayload.error.issues[0]?.message ?? 'Search preferences are invalid.' }
  }

  return { payload: parsedPayload.data }
}
