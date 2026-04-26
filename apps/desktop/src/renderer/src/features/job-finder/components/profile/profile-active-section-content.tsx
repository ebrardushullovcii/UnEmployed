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
  experienceArray: UseFieldArrayReturn<ProfileEditorValues, 'records.experiences', ProfileFieldArrayKeyName>
  isProfileMutationPending: boolean
  isSourceDebugPending: (targetId: string) => boolean
  isSourceInstructionPending: (targetId: string) => boolean
  isSourceInstructionVerifyPending: (instructionId: string) => boolean
  isTargetDiscoveryPending: (targetId: string) => boolean
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onRunDiscoveryForTarget?: (targetId: string) => void
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
  experienceArray,
  isProfileMutationPending,
  isSourceDebugPending,
  isSourceInstructionPending,
  isSourceInstructionVerifyPending,
  isTargetDiscoveryPending,
  onGetSourceDebugRunDetails,
  onRunDiscoveryForTarget,
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
    experience: <ProfileExperienceTab busy={isProfileMutationPending} experienceArray={experienceArray} profileForm={profileForm} />,
    background: <ProfileBackgroundTab backgroundArrays={backgroundArrays} busy={isProfileMutationPending} profileForm={profileForm} />,
    preferences: (
      <ProfilePreferencesTab
        busy={isProfileMutationPending}
        isSourceDebugPending={isSourceDebugPending}
        isSourceInstructionPending={isSourceInstructionPending}
        isSourceInstructionVerifyPending={isSourceInstructionVerifyPending}
        isTargetDiscoveryPending={isTargetDiscoveryPending}
        onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
        {...(onRunDiscoveryForTarget ? { onRunDiscoveryForTarget } : {})}
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
