import {
  type EditableSourceInstructionArtifact,
  type SourceAccessPrompt,
  type SourceDebugRunDetails,
  type SourceDebugRunRecord,
  type SourceInstructionArtifact
} from '@unemployed/contracts'
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../lib/profile-editor'
import { ProfilePreferencesEligibilitySection } from './profile-preferences-eligibility-section'
import {
  ProfilePreferencesTargetingSection,
} from './profile-preferences-sections'
import type { ProfileFieldArrayKeyName } from './profile-field-array-types'

interface ProfilePreferencesTabProps {
  busy: boolean
  customAnswerArray: UseFieldArrayReturn<ProfileEditorValues, 'answerBank.customAnswers', ProfileFieldArrayKeyName>
  isBrowserSessionPending: (targetId: string) => boolean
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

export function ProfilePreferencesTab({
  busy,
  customAnswerArray,
  isBrowserSessionPending,
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
}: ProfilePreferencesTabProps) {
  const { setValue: setPreferenceValue, watch: watchPreferences } = preferencesForm
  const listFieldOptions = { shouldDirty: true, shouldTouch: true, shouldValidate: true } as const
  const discoveryTargets = watchPreferences('discoveryTargets')

  const updateDiscoveryTargets = (nextTargets: SearchPreferencesEditorValues['discoveryTargets']) => {
    setPreferenceValue('discoveryTargets', nextTargets, listFieldOptions)
  }

  const createDiscoveryTargetId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `target_${globalThis.crypto.randomUUID()}`
    }

    return `target_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  const addDiscoveryTarget = () => {
    updateDiscoveryTargets([
      ...discoveryTargets,
      {
        id: createDiscoveryTargetId(),
        label: '',
        startingUrl: '',
        enabled: true,
        adapterKind: 'auto',
        customInstructions: '',
        instructionStatus: 'missing',
        validatedInstructionId: null,
        draftInstructionId: null,
        lastDebugRunId: null,
        lastVerifiedAt: null,
        staleReason: null
      }
    ])
  }

  return (
    <div className="grid gap-6">
      <ProfilePreferencesEligibilitySection busy={busy} customAnswerArray={customAnswerArray} profileForm={profileForm} />
      <ProfilePreferencesTargetingSection
        addDiscoveryTarget={addDiscoveryTarget}
        discoveryTargets={discoveryTargets}
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
        recentSourceDebugRuns={recentSourceDebugRuns}
        sourceAccessPrompts={sourceAccessPrompts}
        sourceInstructionArtifacts={sourceInstructionArtifacts}
        updateDiscoveryTargets={updateDiscoveryTargets}
      />
    </div>
  )
}
