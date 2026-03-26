import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
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
    return value
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
  onImportResume: () => void
  onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => void
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}) {
  const {
    actionState,
    busy,
    onAnalyzeProfileFromResume,
    onImportResume,
    onSaveAll,
    profile,
    searchPreferences
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
  const profileValues = profileForm.watch()
  const preferenceValues = preferencesForm.watch()

  useEffect(() => {
    profileForm.reset(createProfileEditorValues(profile))
    setValidationMessage(null)
  }, [profile, profileForm])

  useEffect(() => {
    preferencesForm.reset(createSearchPreferencesEditorValues(searchPreferences))
    setValidationMessage(null)
  }, [preferencesForm, searchPreferences])

  const snapshotDisplayName = profileForm.watch('identity.preferredDisplayName') || null
  const snapshotFullName = [
    profileForm.watch('identity.firstName'),
    profileForm.watch('identity.middleName'),
    profileForm.watch('identity.lastName')
  ]
    .filter(Boolean)
    .join(' ') || profile.fullName
  const snapshotHeadline = profileForm.watch('identity.headline') || profile.headline
  const snapshotLocation = profileForm.watch('identity.currentLocation') || profile.currentLocation
  const snapshotYearsExperience = profileForm.watch('identity.yearsExperience')

  const overviewProfile = useMemo<CandidateProfile>(() => ({
    ...profile,
    preferredDisplayName: snapshotDisplayName,
    fullName: snapshotFullName,
    headline: snapshotHeadline,
    currentLocation: snapshotLocation,
    yearsExperience: snapshotYearsExperience ? parseInt(snapshotYearsExperience, 10) : profile.yearsExperience
  }), [
    profile,
    snapshotDisplayName,
    snapshotFullName,
    snapshotHeadline,
    snapshotLocation,
    snapshotYearsExperience
  ])

  const sectionProgress = useMemo<Record<ProfileSection, SectionProgress>>(() => {
    const basics = countFilledFields([
      profileValues.identity.firstName,
      profileValues.identity.lastName,
      profileValues.identity.middleName,
      profileValues.identity.preferredDisplayName,
      profileValues.identity.headline,
      profileValues.identity.yearsExperience,
      profileValues.identity.email,
      profileValues.identity.secondaryEmail,
      profileValues.identity.phone,
      profileValues.identity.timeZone,
      profileValues.identity.currentCity,
      profileValues.identity.currentRegion,
      profileValues.identity.currentCountry,
      profileValues.identity.currentLocation,
      profileValues.identity.linkedinUrl,
      profileValues.identity.portfolioUrl,
      profileValues.identity.githubUrl,
      profileValues.identity.personalWebsiteUrl,
      profileValues.summary.shortValueProposition,
      profileValues.summary.fullSummary,
      profileValues.summary.careerThemes,
      profileValues.summary.strengths,
      profileValues.summary.leadershipSummary,
      profileValues.summary.domainFocusSummary,
      profileValues.profileSkills,
      profileValues.skillGroups.highlightedSkills,
      profileValues.skillGroups.coreSkills,
      profileValues.skillGroups.tools,
      profileValues.skillGroups.languagesAndFrameworks,
      profileValues.skillGroups.softSkills
    ])

    const experience = countFilledRecordFields(profileValues.records.experiences, ['id', 'isCurrent'])

    const background = combineSectionProgress(
      countFilledRecordFields(profileValues.records.education, ['id']),
      countFilledRecordFields(profileValues.records.certifications, ['id']),
      countFilledRecordFields(profileValues.projects, ['id']),
      countFilledRecordFields(profileValues.links, ['id']),
      countFilledRecordFields(profileValues.languages, ['id', 'interviewPreference'])
    )

    const preferences = countFilledFields([
      profileValues.eligibility.authorizedWorkCountries,
      profileValues.eligibility.requiresVisaSponsorship,
      profileValues.eligibility.remoteEligible,
      profileValues.eligibility.securityClearance,
      profileValues.eligibility.willingToRelocate,
      profileValues.eligibility.willingToTravel,
      profileValues.eligibility.preferredRelocationRegions,
      profileValues.eligibility.noticePeriodDays,
      profileValues.eligibility.availableStartDate,
      preferenceValues.targetRoles,
      preferenceValues.jobFamilies,
      preferenceValues.seniorityLevels,
      preferenceValues.employmentTypes,
      preferenceValues.locations,
      preferenceValues.excludedLocations,
      preferenceValues.targetIndustries,
      preferenceValues.targetCompanyStages,
      preferenceValues.companyWhitelist,
      preferenceValues.companyBlacklist,
      preferenceValues.workModes,
      preferenceValues.tailoringMode,
      preferenceValues.minimumSalaryUsd,
      preferenceValues.targetSalaryUsd,
      preferenceValues.salaryCurrency
    ])

    return {
      basics,
      experience,
      background,
      preferences
    }
  }, [preferenceValues, profileValues])

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

  const activeSectionContent =
    activeSection === 'basics' ? <ProfileCoreTab profileForm={profileForm} />
      : activeSection === 'experience' ? <ProfileExperienceTab busy={busy} experienceArray={experienceArray} profileForm={profileForm} />
        : activeSection === 'background' ? (
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
          ) : <ProfilePreferencesTab preferencesForm={preferencesForm} profileForm={profileForm} />

  return (
    <section className="grid gap-[var(--gap-section)]">
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

      <section className="grid gap-3">
        <div className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-2">
          <div aria-label="Profile sections" className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {sections.map((section) => (
                <div key={section.id} className={cn(activeSection === section.id ? 'relative z-30 w-full' : 'relative w-full')}>
                  <button
                    aria-pressed={activeSection === section.id}
                    className={cn(
                      'group relative w-full border text-left transition-all duration-200',
                      activeSection === section.id
                        ? 'translate-y-[4px] overflow-hidden rounded-[0.95rem] border-[rgba(85,184,120,0.48)] bg-transparent text-[var(--text-headline)]'
                        : 'overflow-hidden rounded-[0.95rem] border-[rgba(227,202,127,0.18)] bg-[rgba(255,255,255,0.01)] text-foreground-soft hover:border-[rgba(227,202,127,0.28)] hover:bg-[rgba(255,255,255,0.025)] hover:text-foreground'
                    )}
                    onClick={() => setActiveSection(section.id)}
                    type="button"
                    >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-[inherit] transition-[width] duration-300',
                        activeSection === section.id
                          ? 'bg-transparent'
                          : 'bg-[linear-gradient(135deg,rgba(227,202,127,0.12),rgba(255,255,255,0.02)_42%,rgba(0,0,0,0.06))]'
                      )}
                      style={{ width: activeSection === section.id ? '0%' : `${section.progress.percent}%` }}
                    />
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)]',
                        activeSection === section.id ? 'opacity-0' : 'opacity-80'
                      )}
                    />
                    <span className="relative grid gap-2 px-4 pt-3 pb-2.5">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-[0.98rem] font-semibold tracking-[-0.02em]">{section.label}</span>
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">
                          {formatSectionProgressLabel(section.id, section.progress)}
                        </span>
                      </span>

                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted">
                          {section.progress.percent}%
                        </span>
                        <span className="h-1 flex-1 overflow-hidden rounded-sm bg-[rgba(0,0,0,0.26)]">
                          <span
                            className={cn(
                              'block h-full transition-[width] duration-300',
                              activeSection === section.id
                                ? 'bg-[linear-gradient(90deg,rgba(100,214,136,0.95),rgba(180,244,199,0.72))]'
                                : 'bg-[linear-gradient(90deg,rgba(227,202,127,0.92),rgba(255,255,255,0.58))]'
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

        <div className="relative rounded-[var(--radius-field)] border border-[rgba(85,184,120,0.4)] bg-[var(--surface-panel)]">
          <div className="relative z-0 p-4 sm:p-5">{activeSectionContent}</div>

          <div className="border-t border-[var(--surface-panel-border)] bg-[rgba(0,0,0,0.12)] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-2">
                {validationMessage ? (
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="text-[var(--text-description)] leading-6 text-foreground-muted"
                    role="status"
                  >
                    {validationMessage}
                  </p>
                ) : null}
                {actionState.message ? (
                  <p
                    aria-atomic="true"
                    aria-live="polite"
                    className="text-[var(--text-description)] leading-6 text-foreground-muted"
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
    </section>
  )
}
