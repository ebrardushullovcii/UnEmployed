import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { AgentProviderStatus, CandidateProfile, JobSearchPreferences } from '@unemployed/contracts'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/cn'
import { PageHeader } from '../components/page-header'
import { ProfileCoreTab } from '../components/profile/profile-core-tab'
import { ProfileHistoryTab } from '../components/profile/profile-history-tab'
import { ProfileOverviewTab } from '../components/profile/profile-overview-tab'
import { ProfilePreferencesTab } from '../components/profile/profile-preferences-tab'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues
} from '../lib/profile-editor'

type ProfileSection = 'overview' | 'identity' | 'history' | 'preferences'

export function ProfileScreen(props: {
  agentProvider: AgentProviderStatus
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onImportResume: () => void
  onSaveProfile: (profile: CandidateProfile) => void
  onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => void
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}) {
  const {
    agentProvider,
    actionState,
    busy,
    onAnalyzeProfileFromResume,
    onImportResume,
    onSaveProfile,
    onSaveSearchPreferences,
    profile,
    searchPreferences
  } = props

  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<ProfileSection>('overview')

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

  function handleSaveProfile() {
    const result = buildProfilePayload(profile, profileForm.getValues())

    if (!result.payload) {
      setValidationMessage(result.validationMessage ?? 'Profile data is invalid.')
      return
    }

    setValidationMessage(null)
    onSaveProfile(result.payload)
  }

  function handleSaveSearchPreferences() {
    const result = buildSearchPreferencesPayload(searchPreferences, preferencesForm.getValues())

    if (!result.payload) {
      setValidationMessage(result.validationMessage ?? 'Search preferences are invalid.')
      return
    }

    setValidationMessage(null)
    onSaveSearchPreferences(result.payload)
  }

  return (
    <section className="grid gap-[1.65rem]">
      <PageHeader
        eyebrow="Profile"
        title="Operator Profile"
        description="Structured candidate data for ATS-safe applications, stronger tailoring, and future field-by-field automation across profile, discovery, and apply flows."
      />

      <div className="grid gap-6">
        <div className="flex flex-wrap gap-2 border-b border-border/10 pb-2">
          {(['overview', 'identity', 'history', 'preferences'] as const).map((section) => (
            <Button
              key={section}
              className={cn(
                'min-w-[11rem] justify-center rounded-none border border-transparent bg-transparent px-4 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground',
                activeSection === section ? 'border-b-2 border-b-primary bg-transparent text-foreground' : ''
              )}
              onClick={() => setActiveSection(section)}
              type="button"
              variant="ghost"
            >
              {section}
            </Button>
          ))}
        </div>

        {activeSection === 'overview' ? (
          <ProfileOverviewTab
            agentProvider={agentProvider}
            busy={busy}
            onAnalyzeProfileFromResume={onAnalyzeProfileFromResume}
            onImportResume={onImportResume}
            profile={profile}
            searchPreferences={searchPreferences}
          />
        ) : null}

        {activeSection === 'identity' ? (
          <ProfileCoreTab
            busy={busy}
            onSaveProfile={handleSaveProfile}
            profileForm={profileForm}
            validationMessage={validationMessage}
          />
        ) : null}

        {activeSection === 'history' ? (
          <ProfileHistoryTab
            busy={busy}
            certificationArray={certificationArray}
            educationArray={educationArray}
            experienceArray={experienceArray}
            languageArray={languageArray}
            linkArray={linkArray}
            onSaveProfile={handleSaveProfile}
            profileForm={profileForm}
            projectArray={projectArray}
          />
        ) : null}

        {activeSection === 'preferences' ? (
          <ProfilePreferencesTab
            busy={busy}
            onSavePreferences={handleSaveSearchPreferences}
            preferencesForm={preferencesForm}
            validationMessage={validationMessage}
          />
        ) : null}
      </div>

      {actionState.message ? (
        <div className="flex items-center gap-3 rounded-[0.42rem] border border-border-subtle bg-card px-4 py-3">
          <Badge variant="section">Workspace</Badge>
          <p className="text-[0.84rem] leading-6 text-foreground-muted">{actionState.message}</p>
        </div>
      ) : null}
    </section>
  )
}
