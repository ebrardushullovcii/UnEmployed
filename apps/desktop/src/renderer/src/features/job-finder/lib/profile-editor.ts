import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  type CandidateProfile,
  type CandidateLinkKind,
  type JobSearchPreferences
} from '@unemployed/contracts'
import type {
  BooleanSelectValue,
  CertificationFormEntry,
  EducationFormEntry,
  ExperienceFormEntry,
  LanguageFormEntry,
  LinkFormEntry,
  ProjectFormEntry
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

export interface ProfileEditorValues {
  identity: {
    currentCity: string
    currentCountry: string
    currentLocation: string
    currentRegion: string
    email: string
    firstName: string
    githubUrl: string
    headline: string
    lastName: string
    linkedinUrl: string
    middleName: string
    personalWebsiteUrl: string
    phone: string
    portfolioUrl: string
    preferredDisplayName: string
    resumeText: string
    secondaryEmail: string
    summary: string
    timeZone: string
    yearsExperience: string
  }
  eligibility: {
    authorizedWorkCountries: string
    availableStartDate: string
    noticePeriodDays: string
    preferredRelocationRegions: string
    remoteEligible: BooleanSelectValue
    requiresVisaSponsorship: BooleanSelectValue
    securityClearance: string
    willingToRelocate: BooleanSelectValue
    willingToTravel: BooleanSelectValue
  }
  languages: LanguageFormEntry[]
  links: LinkFormEntry[]
  profileSkills: string
  projects: ProjectFormEntry[]
  records: {
    certifications: CertificationFormEntry[]
    education: EducationFormEntry[]
    experiences: ExperienceFormEntry[]
  }
  skillGroups: {
    coreSkills: string
    highlightedSkills: string
    languagesAndFrameworks: string
    softSkills: string
    tools: string
  }
  summary: {
    careerThemes: string
    domainFocusSummary: string
    fullSummary: string
    leadershipSummary: string
    shortValueProposition: string
    strengths: string
  }
}

export interface SearchPreferencesEditorValues {
  companyBlacklist: string
  companyWhitelist: string
  employmentTypes: string
  excludedLocations: string
  jobFamilies: string
  locations: string
  minimumSalaryUsd: string
  salaryCurrency: string
  seniorityLevels: string
  tailoringMode: JobSearchPreferences['tailoringMode']
  targetCompanyStages: string
  targetIndustries: string
  targetRoles: string
  targetSalaryUsd: string
  workModes: JobSearchPreferences['workModes']
}

export function createProfileEditorValues(profile: CandidateProfile): ProfileEditorValues {
  return {
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
    languages: toLanguageFormEntries(profile),
    links: toLinkFormEntries(profile),
    profileSkills: joinListInput(profile.skills),
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
    targetCompanyStages: joinListInput(searchPreferences.targetCompanyStages),
    targetIndustries: joinListInput(searchPreferences.targetIndustries),
    targetRoles: joinListInput(searchPreferences.targetRoles),
    targetSalaryUsd: searchPreferences.targetSalaryUsd?.toString() ?? '',
    workModes: searchPreferences.workModes
  }
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
    professionalSummary: {
      shortValueProposition: values.summary.shortValueProposition.trim() || null,
      fullSummary: values.summary.fullSummary.trim() || null,
      careerThemes: parseListInput(values.summary.careerThemes),
      leadershipSummary: values.summary.leadershipSummary.trim() || null,
      domainFocusSummary: values.summary.domainFocusSummary.trim() || null,
      strengths: parseListInput(values.summary.strengths)
    },
    skillGroups: {
      coreSkills: parseListInput(values.skillGroups.coreSkills),
      tools: parseListInput(values.skillGroups.tools),
      languagesAndFrameworks: parseListInput(values.skillGroups.languagesAndFrameworks),
      softSkills: parseListInput(values.skillGroups.softSkills),
      highlightedSkills: parseListInput(values.skillGroups.highlightedSkills)
    },
    skills: mergedSkills,
    experiences: values.records.experiences.map((entry) => ({
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
      ownershipScope: entry.ownershipScope.trim() || null
    })),
    education: values.records.education.map((entry) => ({
      id: entry.id,
      schoolName: entry.schoolName.trim() || null,
      degree: entry.degree.trim() || null,
      fieldOfStudy: entry.fieldOfStudy.trim() || null,
      location: entry.location.trim() || null,
      startDate: entry.startDate.trim() || null,
      endDate: entry.endDate.trim() || null,
      isDraft: !entry.schoolName.trim(),
      summary: entry.summary.trim() || null
    })),
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
      kind: entry.kind ? (entry.kind as CandidateLinkKind) : null,
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
    companyWhitelist: parseListInput(values.companyWhitelist)
  }

  const parsedPayload = JobSearchPreferencesSchema.safeParse(payload)
  if (!parsedPayload.success) {
    return { validationMessage: parsedPayload.error.issues[0]?.message ?? 'Search preferences are invalid.' }
  }

  return { payload: parsedPayload.data }
}
