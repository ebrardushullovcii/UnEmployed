import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import type {
  CandidateProfile,
  JobSearchPreferences,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import { LockedScreenLayout } from '../components/locked-screen-layout'
import { ProfileBackgroundTab } from '../components/profile/profile-background-tab'
import { ProfileCoreTab } from '../components/profile/profile-core-tab'
import { ProfileExperienceTab } from '../components/profile/profile-experience-tab'
import { ProfilePreferencesTab } from '../components/profile/profile-preferences-tab'
import { ProfileResumePanel } from '../components/profile/profile-resume-panel'
import { PageHeader } from '../components/page-header'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues
} from '../lib/profile-editor'

type ProfileSection = 'basics' | 'experience' | 'background' | 'preferences'

interface SectionProgress {
  filled: number
  percent: number
  total: number
}

function createSectionProgress(filled: number, total: number): SectionProgress {
  if (total <= 0) {
    return { filled: 0, percent: 0, total: 0 }
  }

  return {
    filled,
    percent: Math.round((filled / total) * 100),
    total
  }
}

function isFilledValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'boolean') {
    return true
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return value !== null && value !== undefined
}

function countFilledFields(values: readonly unknown[]): SectionProgress {
  return createSectionProgress(values.filter((value) => isFilledValue(value)).length, values.length)
}

function countFilledRecordFields(
  records: ReadonlyArray<Record<string, unknown>>,
  ignoredKeys: readonly string[] = []
): SectionProgress {
  const ignored = new Set(ignoredKeys)
  let filled = 0
  let total = 0

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (ignored.has(key)) {
        continue
      }

      total += 1

      if (isFilledValue(value)) {
        filled += 1
      }
    }
  }

  return createSectionProgress(filled, total)
}

function combineSectionProgress(...stats: readonly SectionProgress[]): SectionProgress {
  return createSectionProgress(
    stats.reduce((sum, stat) => sum + stat.filled, 0),
    stats.reduce((sum, stat) => sum + stat.total, 0)
  )
}

function formatSectionProgressLabel(section: ProfileSection, progress: SectionProgress): string {
  if (progress.total === 0) {
    return section === 'experience' || section === 'background' ? 'Empty' : 'Not started'
  }

  return `${progress.filled}/${progress.total}`
}

export function ProfileScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onImportResume: () => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: SourceInstructionArtifact) => void
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

  function handleSectionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const currentIndex = sections.findIndex((section) => section.id === activeSection)

    if (currentIndex < 0) {
      return
    }

    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
      return
    }

    event.preventDefault()

    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % sections.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + sections.length) % sections.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = sections.length - 1
    }

    const nextSection = sections[nextIndex]

    if (nextSection) {
      setActiveSection(nextSection.id)
      const tabs = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      tabs[nextIndex]?.focus()
    }
  }

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

  const activeSectionContent: Record<ProfileSection, ReactNode> = {
    basics: <ProfileCoreTab profileForm={profileForm} />,
    experience: <ProfileExperienceTab busy={busy} experienceArray={experienceArray} profileForm={profileForm} />,
    background: (
      <ProfileBackgroundTab
        backgroundArrays={{
          certificationArray,
          educationArray,
          languageArray,
          linkArray,
          projectArray
        }}
        busy={busy}
        profileForm={profileForm}
      />
    ),
    preferences: (
        <ProfilePreferencesTab
          busy={busy}
          onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
          onRunSourceDebug={onRunSourceDebug}
          onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
          onVerifySourceInstructions={onVerifySourceInstructions}
          preferencesForm={preferencesForm}
          profileForm={profileForm}
          recentSourceDebugRuns={recentSourceDebugRuns}
          sourceInstructionArtifacts={sourceInstructionArtifacts}
        />
      )
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
        <div className="px-3 pb-2 sm:px-4 sm:pb-2">
          <div aria-label="Profile sections" className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-4" onKeyDown={handleSectionKeyDown} role="tablist">
              {sections.map((section) => (
                <div key={section.id} className={cn(activeSection === section.id ? 'relative z-30 w-full' : 'relative w-full')}>
                  <button
                    aria-controls={activeSectionPanelId}
                    aria-selected={activeSection === section.id}
                    id={`${section.id}-tab`}
                    className={cn(
                      'group relative w-full border text-left transition-all duration-200',
                      activeSection === section.id
                        ? 'translate-y-1 overflow-hidden rounded-(--radius-button) border-(--surface-panel-border-active) bg-transparent text-(--text-headline)'
                        : 'overflow-hidden rounded-(--radius-button) border-(--surface-panel-border-warm) bg-(--surface-fill-subtle) text-foreground-soft hover:border-(--surface-panel-border-warm-hover) hover:bg-(--surface-tab-hover) hover:text-foreground'
                    )}
                    onClick={() => setActiveSection(section.id)}
                    role="tab"
                    tabIndex={activeSection === section.id ? 0 : -1}
                    type="button"
                    >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-[inherit] transition-[width] duration-300',
                        activeSection === section.id
                          ? 'bg-transparent'
                          : 'bg-[linear-gradient(135deg,var(--surface-panel-border-warm),var(--surface-overlay-subtle)_42%,var(--surface-overlay-soft))]'
                      )}
                      style={{ width: activeSection === section.id ? '0%' : `${section.progress.percent}%` }}
                    />
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--border),transparent)]',
                        activeSection === section.id ? 'opacity-0' : 'opacity-80'
                      )}
                    />
                    <span className="relative grid gap-(--gap-field) px-4 pt-3 pb-2.5">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-(length:--text-body) font-semibold tracking-[-0.02em]">{section.label}</span>
                        <span className="text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                          {formatSectionProgressLabel(section.id, section.progress)}
                        </span>
                      </span>

                      <span className="flex items-center gap-2">
                        <span className="text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted">
                          {section.progress.percent}%
                        </span>
                        <span className="h-1 flex-1 overflow-hidden rounded-(--radius-small) bg-(--surface-overlay-track)">
                          <span
                            className={cn(
                              'block h-full transition-[width] duration-300',
                              activeSection === section.id
                                ? 'bg-[linear-gradient(90deg,var(--progress-active-start),var(--progress-active-end))]'
                                : 'bg-[linear-gradient(90deg,var(--progress-warm-start),var(--progress-warm-end))]'
                            )}
                            style={{ width: `${section.progress.percent}%` }}
                          />
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border-active-soft) bg-(--surface-panel)">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div aria-labelledby={`${activeSection}-tab`} className="relative z-0 p-4 sm:p-5" id={activeSectionPanelId} role="tabpanel">{activeSectionContent[activeSection]}</div>
          </div>

          <div className="border-t border-(--surface-panel-border) bg-(--surface-overlay-medium) px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-2">
                {validationMessage ? (
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="text-(length:--text-description) leading-6 text-foreground-muted"
                    role="status"
                  >
                    {validationMessage}
                  </p>
                ) : null}
                {actionState.message ? (
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="text-(length:--text-description) leading-6 text-foreground-muted"
                    role="status"
                  >
                    {actionState.message}
                  </p>
                ) : null}
              </div>

              <Button className="w-full sm:w-auto sm:shrink-0" disabled={busy} onClick={handleSaveAll} type="button" variant="primary">
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </section>
    </LockedScreenLayout>
  )
}
