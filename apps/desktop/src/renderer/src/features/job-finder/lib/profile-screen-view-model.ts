import type { CandidateProfile } from '@unemployed/contracts'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from './profile-editor'
import {
  combineSectionProgress,
  countFilledFields,
  countFilledRecordFields,
  type ProfileSection,
  type SectionProgress
} from './profile-screen-progress'

interface BuildProfileScreenViewModelInput {
  applicationIdentityValues: ProfileEditorValues['applicationIdentity'] | undefined
  answerBankValues: ProfileEditorValues['answerBank'] | undefined
  certificationValues: ProfileEditorValues['records']['certifications'] | undefined
  companyBlacklist: SearchPreferencesEditorValues['companyBlacklist']
  companyWhitelist: SearchPreferencesEditorValues['companyWhitelist']
  educationValues: ProfileEditorValues['records']['education'] | undefined
  eligibilityValues: ProfileEditorValues['eligibility'] | undefined
  employmentTypes: SearchPreferencesEditorValues['employmentTypes']
  excludedLocations: SearchPreferencesEditorValues['excludedLocations']
  experienceValues: ProfileEditorValues['records']['experiences'] | undefined
  identityValues: ProfileEditorValues['identity'] | undefined
  jobFamilies: SearchPreferencesEditorValues['jobFamilies']
  languageValues: ProfileEditorValues['languages'] | undefined
  linkValues: ProfileEditorValues['links'] | undefined
  locations: SearchPreferencesEditorValues['locations']
  minimumSalaryUsd: SearchPreferencesEditorValues['minimumSalaryUsd']
  narrativeValues: ProfileEditorValues['narrative'] | undefined
  profile: CandidateProfile
  profileSkillValues: ProfileEditorValues['profileSkills'] | undefined
  proofBankValues: ProfileEditorValues['proofBank'] | undefined
  projectValues: ProfileEditorValues['projects'] | undefined
  seniorityLevels: SearchPreferencesEditorValues['seniorityLevels']
  skillGroupValues: ProfileEditorValues['skillGroups'] | undefined
  summaryValues: ProfileEditorValues['summary'] | undefined
  tailoringMode: SearchPreferencesEditorValues['tailoringMode']
  targetCompanyStages: SearchPreferencesEditorValues['targetCompanyStages']
  targetIndustries: SearchPreferencesEditorValues['targetIndustries']
  targetRoles: SearchPreferencesEditorValues['targetRoles']
  targetSalaryUsd: SearchPreferencesEditorValues['targetSalaryUsd']
  workModes: SearchPreferencesEditorValues['workModes']
}

export function buildProfileScreenViewModel(input: BuildProfileScreenViewModelInput): {
  overviewProfile: CandidateProfile
  sections: Array<{
    id: ProfileSection
    label: string
    description: string
    progress: SectionProgress
  }>
} {
  const snapshotDisplayName = input.identityValues?.preferredDisplayName || null
  const snapshotFullName = [
    input.identityValues?.firstName,
    input.identityValues?.middleName,
    input.identityValues?.lastName
  ]
    .filter(Boolean)
    .join(' ') || input.profile.fullName
  const snapshotHeadline = input.identityValues?.headline || input.profile.headline
  const snapshotLocation = input.identityValues?.currentLocation || input.profile.currentLocation
  const snapshotYearsExperience = input.identityValues?.yearsExperience
  const parsedSnapshotYearsExperience = Number.parseInt(snapshotYearsExperience ?? '', 10)

  const overviewProfile: CandidateProfile = {
    ...input.profile,
    preferredDisplayName: snapshotDisplayName,
    fullName: snapshotFullName,
    headline: snapshotHeadline,
    currentLocation: snapshotLocation,
    yearsExperience: Number.isFinite(parsedSnapshotYearsExperience)
      ? parsedSnapshotYearsExperience
      : input.profile.yearsExperience
  }

  const sectionProgress = buildProfileSectionProgress(input)

  return {
    overviewProfile,
    sections: [
      {
        id: 'basics',
        label: 'Basics',
        description: 'Review your contact info, summary, and skills in one place.',
        progress: sectionProgress.basics
      },
      {
        id: 'experience',
        label: 'Experience',
        description: 'Keep each role separate so resumes and forms stay accurate.',
        progress: sectionProgress.experience
      },
      {
        id: 'background',
        label: 'Background',
        description: 'Manage education, certifications, projects, links, and languages.',
        progress: sectionProgress.background
      },
      {
        id: 'preferences',
        label: 'Preferences',
        description: 'Set screening answers, job preferences, and source setup for future searches and applications.',
        progress: sectionProgress.preferences
      }
    ]
  }
}

function buildProfileSectionProgress(input: BuildProfileScreenViewModelInput): Record<ProfileSection, SectionProgress> {
  const basics = countFilledFields([
    input.identityValues?.firstName,
    input.identityValues?.lastName,
    input.identityValues?.preferredDisplayName,
    input.identityValues?.headline,
    input.identityValues?.yearsExperience,
    input.identityValues?.email,
    input.identityValues?.phone,
    input.identityValues?.currentCity,
    input.identityValues?.currentRegion,
    input.identityValues?.currentCountry,
    input.identityValues?.currentLocation,
    input.identityValues?.linkedinUrl,
    input.identityValues?.portfolioUrl,
    input.identityValues?.githubUrl,
    input.summaryValues?.shortValueProposition,
    input.summaryValues?.fullSummary,
    input.narrativeValues?.professionalStory,
    input.narrativeValues?.nextChapterSummary,
    input.narrativeValues?.careerTransitionSummary,
    input.narrativeValues?.differentiators,
    input.summaryValues?.strengths,
    input.summaryValues?.leadershipSummary,
    input.summaryValues?.domainFocusSummary,
    input.profileSkillValues,
    input.skillGroupValues?.highlightedSkills,
    input.skillGroupValues?.coreSkills,
    input.skillGroupValues?.tools,
    input.skillGroupValues?.languagesAndFrameworks,
    input.skillGroupValues?.softSkills
  ])

  const experience = countFilledRecordFields(input.experienceValues ?? [], ['id', 'isCurrent'])

  const background = combineSectionProgress(
    countFilledRecordFields(input.educationValues ?? [], ['id']),
    countFilledRecordFields(input.certificationValues ?? [], ['id']),
    countFilledRecordFields(input.projectValues ?? [], ['id']),
    countFilledRecordFields(input.linkValues ?? [], ['id']),
    countFilledRecordFields(input.languageValues ?? [], ['id', 'interviewPreference']),
    countFilledRecordFields(input.proofBankValues ?? [], ['id'])
  )

  const preferences = combineSectionProgress(
    countFilledFields([
      input.eligibilityValues?.authorizedWorkCountries,
      input.eligibilityValues?.requiresVisaSponsorship,
      input.eligibilityValues?.remoteEligible,
      input.eligibilityValues?.securityClearance,
      input.eligibilityValues?.willingToRelocate,
      input.eligibilityValues?.willingToTravel,
      input.eligibilityValues?.preferredRelocationRegions,
      input.eligibilityValues?.noticePeriodDays,
      input.eligibilityValues?.availableStartDate,
      input.applicationIdentityValues?.preferredEmail,
      input.applicationIdentityValues?.preferredPhone,
      input.applicationIdentityValues?.preferredLinkIds,
      input.answerBankValues?.workAuthorization,
      input.answerBankValues?.visaSponsorship,
      input.answerBankValues?.relocation,
      input.answerBankValues?.travel,
      input.answerBankValues?.noticePeriod,
      input.answerBankValues?.availability,
      input.answerBankValues?.salaryExpectations,
      input.answerBankValues?.selfIntroduction,
      input.answerBankValues?.careerTransition,
      input.targetRoles,
      input.jobFamilies,
      input.seniorityLevels,
      input.employmentTypes,
      input.locations,
      input.excludedLocations,
      input.targetIndustries,
      input.targetCompanyStages,
      input.companyWhitelist,
      input.companyBlacklist,
      input.workModes,
      input.tailoringMode,
      input.minimumSalaryUsd,
      input.targetSalaryUsd
    ]),
    countFilledRecordFields(input.answerBankValues?.customAnswers ?? [], ['id'])
  )

  return { basics, experience, background, preferences }
}
