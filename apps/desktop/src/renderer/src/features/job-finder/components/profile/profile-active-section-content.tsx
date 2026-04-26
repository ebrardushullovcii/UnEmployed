import type {
  EditableSourceInstructionArtifact,
  SourceAccessPrompt,
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
  isBrowserSessionPending: boolean
  isProfileMutationPending: boolean
  isSourceDebugPending: (targetId: string) => boolean
  isSourceInstructionPending: (targetId: string) => boolean
  isSourceInstructionVerifyPending: (instructionId: string) => boolean
  isTargetDiscoveryPending: (targetId: string) => boolean
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onOpenBrowserSessionForTarget: (targetId: string) => void
  onRunDiscoveryForTarget?: (targetId: string) => void
  onRunSourceDebug: (targetId: string) => void
  onSaveSourceInstructionArtifact: (targetId: string, artifact: EditableSourceInstructionArtifact) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  profileForm: UseFormReturn<ProfileEditorValues>
  recentSourceDebugRuns: readonly SourceDebugRunRecord[]
  sourceAccessPrompts: readonly SourceAccessPrompt[]
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[]
}

export function ProfileActiveSectionContent({
  activeSection,
  backgroundArrays,
  experienceArray,
  isBrowserSessionPending,
  isProfileMutationPending,
  isSourceDebugPending,
  isSourceInstructionPending,
  isSourceInstructionVerifyPending,
  isTargetDiscoveryPending,
  onGetSourceDebugRunDetails,
  onOpenBrowserSessionForTarget,
  onRunDiscoveryForTarget,
  onRunSourceDebug,
  onSaveSourceInstructionArtifact,
  onVerifySourceInstructions,
  preferencesForm,
  profileForm,
  recentSourceDebugRuns,
  sourceAccessPrompts,
  sourceInstructionArtifacts
}: ProfileActiveSectionContentProps) {
  const content: Record<ProfileSection, ReactNode> = {
    basics: <ProfileCoreTab profileForm={profileForm} />,
    experience: <ProfileExperienceTab busy={isProfileMutationPending} experienceArray={experienceArray} profileForm={profileForm} />,
    background: <ProfileBackgroundTab backgroundArrays={backgroundArrays} busy={isProfileMutationPending} profileForm={profileForm} />,
    preferences: (
      <ProfilePreferencesTab
        busy={isProfileMutationPending}
        isBrowserSessionPending={isBrowserSessionPending}
        isSourceDebugPending={isSourceDebugPending}
        isSourceInstructionPending={isSourceInstructionPending}
        isSourceInstructionVerifyPending={isSourceInstructionVerifyPending}
        isTargetDiscoveryPending={isTargetDiscoveryPending}
        onGetSourceDebugRunDetails={onGetSourceDebugRunDetails}
        onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
        {...(onRunDiscoveryForTarget ? { onRunDiscoveryForTarget } : {})}
        onRunSourceDebug={onRunSourceDebug}
        onSaveSourceInstructionArtifact={onSaveSourceInstructionArtifact}
        onVerifySourceInstructions={onVerifySourceInstructions}
        preferencesForm={preferencesForm}
        profileForm={profileForm}
        customAnswerArray={backgroundArrays.customAnswerArray}
        recentSourceDebugRuns={recentSourceDebugRuns}
        sourceAccessPrompts={sourceAccessPrompts}
        sourceInstructionArtifacts={sourceInstructionArtifacts}
      />
    )
  }

  return content[activeSection]
}
