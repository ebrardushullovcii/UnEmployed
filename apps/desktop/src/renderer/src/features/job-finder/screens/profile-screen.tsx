import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import type {
  CandidateProfile,
  EditableSourceInstructionArtifact,
  JobSearchPreferences,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { LockedScreenLayout } from '../components/locked-screen-layout'
import { ProfileActiveSectionContent } from '../components/profile/profile-active-section-content'
import { ProfileResumePanel } from '../components/profile/profile-resume-panel'
import { ProfileSaveFooter } from '../components/profile/profile-save-footer'
import { ProfileSectionTabs } from '../components/profile/profile-section-tabs'
import { PageHeader } from '../components/page-header'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues
} from '../lib/profile-editor'
import {
  combineSectionProgress,
  countFilledFields,
  countFilledRecordFields,
  type ProfileSection,
  type SectionProgress
} from '../lib/profile-screen-progress'

export function ProfileScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onImportResume: () => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  profile: CandidateProfile
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  searchPreferences: JobSearchPreferences
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
}) {
  const {
    actionState,
    busy,
    onAnalyzeProfileFromResume,
    onGetSourceDebugRunDetails,
    onImportResume,
    onRunSourceDebug,
    onSaveSourceInstructionArtifact,
    onSaveAll,
    onVerifySourceInstructions,
    profile,
    recentSourceDebugRuns,
    searchPreferences,
    sourceInstructionArtifacts
  } = props

  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ProfileSection>('basics')

  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile)
  })
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: createSearchPreferencesEditorValues(searchPreferences)
  })

  const experienceArray = useFieldArray({ control: profileForm.control, name: 'records.experiences' })
  const educationArray = useFieldArray({ control: profileForm.control, name: 'records.education' })
  const certificationArray = useFieldArray({ control: profileForm.control, name: 'records.certifications' })
  const projectArray = useFieldArray({ control: profileForm.control, name: 'projects' })
  const linkArray = useFieldArray({ control: profileForm.control, name: 'links' })
  const languageArray = useFieldArray({ control: profileForm.control, name: 'languages' })
  const [identityValues, summaryValues, skillGroupValues, profileSkillValues, eligibilityValues, experienceValues, educationValues, certificationValues, projectValues, linkValues, languageValues] = useWatch({
    control: profileForm.control,
    name: [
      'identity',
      'summary',
      'skillGroups',
      'profileSkills',
      'eligibility',
      'records.experiences',
      'records.education',
      'records.certifications',
      'projects',
      'links',
      'languages'
    ]
  })
  const [
    targetRoles,
    jobFamilies,
    seniorityLevels,
    employmentTypes,
    locations,
    excludedLocations,
    targetIndustries,
    targetCompanyStages,
    companyWhitelist,
    companyBlacklist,
    workModes,
    tailoringMode,
    minimumSalaryUsd,
    targetSalaryUsd,
    salaryCurrency
  ] = useWatch({
    control: preferencesForm.control,
    name: [
      'targetRoles',
      'jobFamilies',
      'seniorityLevels',
      'employmentTypes',
      'locations',
      'excludedLocations',
      'targetIndustries',
      'targetCompanyStages',
      'companyWhitelist',
      'companyBlacklist',
      'workModes',
      'tailoringMode',
      'minimumSalaryUsd',
      'targetSalaryUsd',
      'salaryCurrency'
    ]
  })

  useEffect(() => {
    profileForm.reset(createProfileEditorValues(profile))
    setValidationMessage(null)
  }, [profile, profileForm])

  useEffect(() => {
    preferencesForm.reset(createSearchPreferencesEditorValues(searchPreferences))
    setValidationMessage(null)
  }, [preferencesForm, searchPreferences])

  const snapshotDisplayName = identityValues?.preferredDisplayName || null
  const snapshotFullName = [
    identityValues?.firstName,
    identityValues?.middleName,
    identityValues?.lastName
  ]
    .filter(Boolean)
    .join(' ') || profile.fullName
  const snapshotHeadline = identityValues?.headline || profile.headline
  const snapshotLocation = identityValues?.currentLocation || profile.currentLocation
  const snapshotYearsExperience = identityValues?.yearsExperience
  const parsedSnapshotYearsExperience = Number.parseInt(snapshotYearsExperience ?? '', 10)

  const overviewProfile = useMemo<CandidateProfile>(() => ({
    ...profile,
    preferredDisplayName: snapshotDisplayName,
    fullName: snapshotFullName,
    headline: snapshotHeadline,
    currentLocation: snapshotLocation,
    yearsExperience: Number.isFinite(parsedSnapshotYearsExperience) ? parsedSnapshotYearsExperience : profile.yearsExperience
  }), [
    parsedSnapshotYearsExperience,
    profile,
    snapshotDisplayName,
    snapshotFullName,
    snapshotHeadline,
    snapshotLocation
  ])

  const sectionProgress = useMemo<Record<ProfileSection, SectionProgress>>(() => {
    const basics = countFilledFields([
      identityValues?.firstName,
      identityValues?.lastName,
      identityValues?.middleName,
      identityValues?.preferredDisplayName,
      identityValues?.headline,
      identityValues?.yearsExperience,
      identityValues?.email,
      identityValues?.secondaryEmail,
      identityValues?.phone,
      identityValues?.timeZone,
      identityValues?.currentCity,
      identityValues?.currentRegion,
      identityValues?.currentCountry,
      identityValues?.currentLocation,
      identityValues?.linkedinUrl,
      identityValues?.portfolioUrl,
      identityValues?.githubUrl,
      identityValues?.personalWebsiteUrl,
      summaryValues?.shortValueProposition,
      summaryValues?.fullSummary,
      summaryValues?.careerThemes,
      summaryValues?.strengths,
      summaryValues?.leadershipSummary,
      summaryValues?.domainFocusSummary,
      profileSkillValues,
      skillGroupValues?.highlightedSkills,
      skillGroupValues?.coreSkills,
      skillGroupValues?.tools,
      skillGroupValues?.languagesAndFrameworks,
      skillGroupValues?.softSkills
    ])

    const experience = countFilledRecordFields(experienceValues ?? [], ['id', 'isCurrent'])

    const background = combineSectionProgress(
      countFilledRecordFields(educationValues ?? [], ['id']),
      countFilledRecordFields(certificationValues ?? [], ['id']),
      countFilledRecordFields(projectValues ?? [], ['id']),
      countFilledRecordFields(linkValues ?? [], ['id']),
      countFilledRecordFields(languageValues ?? [], ['id', 'interviewPreference'])
    )

    const preferences = countFilledFields([
      eligibilityValues?.authorizedWorkCountries,
      eligibilityValues?.requiresVisaSponsorship,
      eligibilityValues?.remoteEligible,
      eligibilityValues?.securityClearance,
      eligibilityValues?.willingToRelocate,
      eligibilityValues?.willingToTravel,
      eligibilityValues?.preferredRelocationRegions,
      eligibilityValues?.noticePeriodDays,
      eligibilityValues?.availableStartDate,
      targetRoles,
      jobFamilies,
      seniorityLevels,
      employmentTypes,
      locations,
      excludedLocations,
      targetIndustries,
      targetCompanyStages,
      companyWhitelist,
      companyBlacklist,
      workModes,
      tailoringMode,
      minimumSalaryUsd,
      targetSalaryUsd,
      salaryCurrency
    ])

    return {
      basics,
      experience,
      background,
      preferences
    }
  }, [
    certificationValues,
    companyBlacklist,
    companyWhitelist,
    educationValues,
    eligibilityValues,
    employmentTypes,
    excludedLocations,
    experienceValues,
    identityValues,
    jobFamilies,
    languageValues,
    linkValues,
    locations,
    minimumSalaryUsd,
    profileSkillValues,
    projectValues,
    salaryCurrency,
    seniorityLevels,
    skillGroupValues,
    summaryValues,
    tailoringMode,
    targetCompanyStages,
    targetIndustries,
    targetRoles,
    targetSalaryUsd,
    workModes
  ])

  const sections = useMemo(
    () => [
      {
        id: 'basics' as const,
        label: 'Basics',
        description: 'Review the contact details, summary, and skills that resume analysis fills first.',
        progress: sectionProgress.basics
      },
      {
        id: 'experience' as const,
        label: 'Experience',
        description: 'Maintain each role separately so tailoring and form-fill stay grounded.',
        progress: sectionProgress.experience
      },
      {
        id: 'background' as const,
        label: 'Background',
        description: 'Manage education, certifications, projects, public links, and languages.',
        progress: sectionProgress.background
      },
      {
        id: 'preferences' as const,
        label: 'Preferences',
        description: 'Keep eligibility answers and job-targeting rules in a separate workspace.',
        progress: sectionProgress.preferences
      }
    ],
    [sectionProgress]
  )

  const activeSectionPanelId = 'profile-section-panel'

  function handleSaveAll() {
    const profileResult = buildProfilePayload(profile, profileForm.getValues())

    if (!profileResult.payload) {
      setValidationMessage(profileResult.validationMessage ?? 'Profile data is invalid.')
      return
    }

    const preferencesResult = buildSearchPreferencesPayload(searchPreferences, preferencesForm.getValues())

    if (!preferencesResult.payload) {
      setValidationMessage(preferencesResult.validationMessage ?? 'Search preferences are invalid.')
      return
    }

    setValidationMessage(null)
    onSaveAll(profileResult.payload, preferencesResult.payload)
  }

  return (
    <LockedScreenLayout
      contentClassName="xl:overflow-hidden"
      topClassName="grid gap-(--gap-section) pb-(--gap-section) pt-8"
      topContent={(
        <>
          <PageHeader
            eyebrow="Profile"
            title="Candidate setup"
            description="Import your resume once, then review the structured profile it creates. Each tab below focuses on one part of the candidate record so the form feels lighter and easier to edit."
          />

          <ProfileResumePanel
            busy={busy}
            onAnalyzeProfileFromResume={onAnalyzeProfileFromResume}
            onImportResume={onImportResume}
            profile={overviewProfile}
          />
        </>
      )}
    >
      <section className="grid min-h-124 min-w-0 gap-(--gap-content) xl:h-full xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)]">
        <ProfileSectionTabs
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          panelId={activeSectionPanelId}
          sections={sections}
        />

        <div className="surface-panel-shell relative flex min-h-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border-active-soft)">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div aria-labelledby={`${activeSection}-tab`} className="relative z-0 p-4 sm:p-5" id={activeSectionPanelId} role="tabpanel">
              <ProfileActiveSectionContent
                activeSection={activeSection}
                backgroundArrays={{
                  certificationArray,
                  educationArray,
                  languageArray,
                  linkArray,
                  projectArray
                }}
                busy={busy}
                experienceArray={experienceArray}
                onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
                onRunSourceDebug={onRunSourceDebug}
                onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
                onVerifySourceInstructions={onVerifySourceInstructions}
                preferencesForm={preferencesForm}
                profileForm={profileForm}
                recentSourceDebugRuns={recentSourceDebugRuns}
                sourceInstructionArtifacts={sourceInstructionArtifacts}
              />
            </div>
          </div>

          <ProfileSaveFooter
            actionMessage={actionState.message}
            busy={busy}
            onSave={handleSaveAll}
            validationMessage={validationMessage}
          />
        </div>
      </section>
    </LockedScreenLayout>
  )
}
