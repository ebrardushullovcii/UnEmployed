import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { ProfileBackgroundTab } from '../components/profile/profile-background-tab'
import { ProfileCoreTab } from '../components/profile/profile-core-tab'
import { ProfileExperienceTab } from '../components/profile/profile-experience-tab'
import { ProfileOverviewTab } from '../components/profile/profile-overview-tab'
import { ProfilePreferencesTab } from '../components/profile/profile-preferences-tab'
import { PageHeader } from '../components/page-header'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues
} from '../lib/profile-editor'

type ProfileSection = 'resume' | 'profile' | 'experience' | 'background' | 'preferences'

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
  const [activeSection, setActiveSection] = useState<ProfileSection>('resume')

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

  useEffect(() => {
    profileForm.reset(createProfileEditorValues(profile))
    setValidationMessage(null)
  }, [profile, profileForm])

  useEffect(() => {
    preferencesForm.reset(createSearchPreferencesEditorValues(searchPreferences))
    setValidationMessage(null)
  }, [preferencesForm, searchPreferences])

  const sections = useMemo(
    () => [
      {
        id: 'resume' as const,
        label: 'Resume',
        description: 'Upload your base resume, review the stored file state, and re-run parsing when needed.'
      },
      {
        id: 'profile' as const,
        label: 'Core Profile',
        description: 'Edit identity, summary, and skills that define your main candidate record.'
      },
      {
        id: 'experience' as const,
        label: 'Experience',
        description: 'Maintain each role separately so tailoring and form-fill stay grounded.'
      },
      {
        id: 'background' as const,
        label: 'Background',
        description: 'Manage education, certifications, projects, public links, and languages.'
      },
      {
        id: 'preferences' as const,
        label: 'Preferences',
        description: 'Keep eligibility answers and job-targeting rules in a separate workspace.'
      }
    ],
    []
  )

  const activeSectionDefinition =
    sections.find((section) => section.id === activeSection) ?? {
      id: 'resume' as const,
      label: 'Resume',
      description: 'Upload your base resume, review the stored file state, and re-run parsing when needed.'
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

  return (
    <section className="grid gap-[var(--gap-section)]">
      <PageHeader
        eyebrow="Profile"
        title="Candidate setup"
        description="Structured candidate data for ATS-safe applications, stronger tailoring, and future field-by-field automation across profile, discovery, and apply flows."
      />

      <section className="grid gap-5 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div aria-label="Profile sections" className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                aria-pressed={activeSection === section.id}
                className={
                  activeSection === section.id
                    ? 'inline-flex items-center rounded-full border border-[var(--field-border)] bg-[var(--field)] px-4 py-2 text-[var(--text-small)] font-medium text-[var(--text-headline)]'
                    : 'inline-flex items-center rounded-full border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-2 text-[var(--text-small)] font-medium text-foreground-soft transition-colors hover:border-[var(--field-border)] hover:bg-[var(--field)] hover:text-foreground'
                }
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </div>

          <Button className="w-full sm:w-auto lg:shrink-0" disabled={busy} onClick={handleSaveAll} type="button" variant="primary">
            Save changes
          </Button>
        </div>

        <div className="grid gap-1">
          <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">
            {activeSectionDefinition.label}
          </p>
          <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{activeSectionDefinition.description}</p>
        </div>

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
      </section>

      {activeSection === 'resume' ? (
        <ProfileOverviewTab
          busy={busy}
          onAnalyzeProfileFromResume={onAnalyzeProfileFromResume}
          onImportResume={onImportResume}
          profile={profile}
        />
      ) : null}

      {activeSection === 'profile' ? <ProfileCoreTab profileForm={profileForm} /> : null}

      {activeSection === 'experience' ? (
        <ProfileExperienceTab busy={busy} experienceArray={experienceArray} profileForm={profileForm} />
      ) : null}

      {activeSection === 'background' ? (
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
      ) : null}

      {activeSection === 'preferences' ? (
        <ProfilePreferencesTab preferencesForm={preferencesForm} profileForm={profileForm} />
      ) : null}
    </section>
  )
}
