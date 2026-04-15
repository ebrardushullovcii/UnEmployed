import type {
  EditableSourceInstructionArtifact,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import type { ReactNode } from 'react'
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { ProfileBackgroundTab } from './profile-background-tab'
import { ProfileCoreTab } from './profile-core-tab'
import { ProfileExperienceTab } from './profile-experience-tab'
import { ProfilePreferencesTab } from './profile-preferences-tab'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../lib/profile-editor'
import type { ProfileBackgroundArrays, ProfileFieldArrayKeyName } from './profile-field-array-types'
import type { ProfileSection } from '../../lib/profile-screen-progress'

interface ProfileActiveSectionContentProps {
  activeSection: ProfileSection
  backgroundArrays: ProfileBackgroundArrays
  busy: boolean
  experienceArray: UseFieldArrayReturn<ProfileEditorValues, 'records.experiences', ProfileFieldArrayKeyName>
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
}

export function ProfileActiveSectionContent({
  activeSection,
  backgroundArrays,
  busy,
  experienceArray,
  onGetSourceDebugRunDetails,
  onRunSourceDebug,
  onSaveSourceInstructionArtifact,
  onVerifySourceInstructions,
  preferencesForm,
  profileForm,
  recentSourceDebugRuns,
  sourceInstructionArtifacts
}: ProfileActiveSectionContentProps) {
  const content: Record<ProfileSection, ReactNode> = {
    basics: <ProfileCoreTab profileForm={profileForm} />,
    experience: <ProfileExperienceTab busy={busy} experienceArray={experienceArray} profileForm={profileForm} />,
    background: <ProfileBackgroundTab backgroundArrays={backgroundArrays} busy={busy} profileForm={profileForm} />,
    preferences: (
      <ProfilePreferencesTab
        busy={busy}
        onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
        onRunSourceDebug={onRunSourceDebug}
        onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
        onVerifySourceInstructions={onVerifySourceInstructions}
        preferencesForm={preferencesForm}
        profileForm={profileForm}
        customAnswerArray={backgroundArrays.customAnswerArray}
        recentSourceDebugRuns={recentSourceDebugRuns}
        sourceInstructionArtifacts={sourceInstructionArtifacts}
      />
    )
  }

  return content[activeSection]
}
