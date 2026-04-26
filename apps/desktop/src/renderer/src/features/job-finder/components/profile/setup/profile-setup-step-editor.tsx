import {
  evaluateProfileSetupReadiness,
  type CandidateProfile,
  type JobSearchPreferences,
  type ProfileSetupStep,
  type ResumeImportFieldCandidateSummary,
} from '@unemployed/contracts'
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from '../../../lib/profile-editor'
import type { ProfileBackgroundArrays, ProfileFieldArrayKeyName } from '../profile-field-array-types'
import { ProfileBackgroundTab } from '../profile-background-tab'
import { ProfileExperienceTab } from '../profile-experience-tab'
import {
  getNextProfileSetupStep,
  getPreviousProfileSetupStep,
} from './profile-setup-steps'
import {
  ProfileSetupEssentialsStep,
  ProfileSetupImportStep,
  ProfileSetupTargetingStep,
} from './profile-setup-step-sections'
import {
  ProfileSetupAnswersStep,
  ProfileSetupNarrativeStep,
  ProfileSetupReadyCheckStep,
} from './profile-setup-step-sections-extra'
import type { ProfileSetupReviewItemDisplay } from './profile-setup-screen-helpers'

function getReadinessTone(status: 'ready' | 'needs_review' | 'missing'): 'default' | 'outline' | 'destructive' {
  if (status === 'ready') {
    return 'default'
  }

  return status === 'needs_review' ? 'outline' : 'destructive'
}

function getReadinessStatus(input: {
  hasSignal: boolean
  hasReviewItems: boolean
}): 'ready' | 'needs_review' | 'missing' {
  if (input.hasSignal && !input.hasReviewItems) {
    return 'ready'
  }

  return input.hasSignal || input.hasReviewItems ? 'needs_review' : 'missing'
}

export function ProfileSetupStepEditor(props: {
  backgroundArrays: ProfileBackgroundArrays
  currentStepReviewItems: readonly ProfileSetupReviewItemDisplay[]
  draftProfile: CandidateProfile
  draftSearchPreferences: JobSearchPreferences
  experienceArray: UseFieldArrayReturn<ProfileEditorValues, 'records.experiences', ProfileFieldArrayKeyName>
  focusedReviewItemId?: string | null
  focusedReviewRequestKey?: number
  hasUnsavedChanges: boolean
  importDisabledReason?: string | null
  isImportResumePending: boolean
  isProfileSetupPending: boolean
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  onContinueToProfile: () => void
  onImportResume: () => void
  onSaveCurrentStep: () => void
  onSaveAndFinish: () => void
  onSaveAndGoToStep: (step: ProfileSetupStep) => void
  profile: CandidateProfile
  profileForm: UseFormReturn<ProfileEditorValues>
  profileSetupReviewItems: readonly ProfileSetupReviewItemDisplay[]
  currentStep: ProfileSetupStep
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>
  searchPreferences: JobSearchPreferences
  validationMessage: string | null
}) {
  const readiness = evaluateProfileSetupReadiness(props.draftProfile, props.draftSearchPreferences)
  const blockingPendingItems = props.profileSetupReviewItems.filter(
    (item) => item.status === 'pending' && item.severity !== 'optional',
  )
  const focusedReviewItem = props.profileSetupReviewItems.find(
    (item) => item.id === props.focusedReviewItemId,
  )
  const focusExperienceRecordId = focusedReviewItem?.target.domain === 'experience'
    ? focusedReviewItem.target.recordId ?? null
    : null
  const focusExperienceOpenSignal = focusExperienceRecordId && props.focusedReviewRequestKey
    ? `${focusExperienceRecordId}:${props.focusedReviewRequestKey}`
    : null
  const currentStep = props.currentStep
  const nextStep = getNextProfileSetupStep(currentStep)
  const previousStep = getPreviousProfileSetupStep(currentStep)
  const canFinishSetup = readiness.materiallyComplete && blockingPendingItems.length === 0
  const currentStepReviewItems = props.currentStepReviewItems.filter(
    (item) => item.status === 'pending',
  )
  const narrativeStatus = getReadinessStatus({
    hasSignal: readiness.hasNarrative,
    hasReviewItems: props.profileSetupReviewItems.some(
      (item) => item.step === 'narrative' && item.status === 'pending',
    ),
  })
  const discoveryStatus = getReadinessStatus({
    hasSignal: readiness.hasTargeting && readiness.hasEligibilityPreferences,
    hasReviewItems: props.profileSetupReviewItems.some(
      (item) =>
        (item.step === 'essentials' || item.step === 'targeting') &&
        item.status === 'pending',
    ),
  })
  const applyStatus = getReadinessStatus({
    hasSignal: readiness.hasContactPath && readiness.hasEligibilityPreferences && readiness.hasAnswerBank,
    hasReviewItems: props.profileSetupReviewItems.some(
      (item) =>
        (item.step === 'essentials' || item.step === 'answers') &&
        item.status === 'pending',
    ),
  })

  function renderFooter(options?: {
    nextLabel?: string
    onPrimary?: (() => void) | null
    primaryDisabled?: boolean
    primaryLabel?: string
  }) {
    return (
      <div className="flex flex-col gap-3 border-t border-border/30 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="grid gap-2">
          <p className="text-sm leading-6 text-foreground-soft">
            {props.hasUnsavedChanges
              ? 'Save this step before moving on so the Profile editor and setup route stay in sync.'
              : 'This step already matches the saved workspace state.'}
          </p>
          {currentStepReviewItems.length > 0 ? (
            <p className="text-sm leading-6 text-foreground-soft">
              {currentStepReviewItems.length} review item{currentStepReviewItems.length === 1 ? '' : 's'} still {currentStepReviewItems.length === 1 ? 'needs' : 'need'} attention in this step.
            </p>
          ) : null}
          {props.validationMessage ? (
            <p className="text-sm leading-6 text-destructive" role="status">
              {props.validationMessage}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            disabled={props.isProfileSetupPending || !props.hasUnsavedChanges}
            pending={props.isProfileSetupPending}
            onClick={props.onSaveCurrentStep}
            type="button"
            variant="secondary"
          >
            Save changes
          </Button>
          {previousStep ? (
            <Button
              disabled={props.isProfileSetupPending}
              pending={props.isProfileSetupPending}
              onClick={() => props.onSaveAndGoToStep(previousStep)}
              type="button"
              variant="ghost"
            >
              Save and go back
            </Button>
          ) : null}
          {options?.onPrimary ? (
            <Button
              disabled={props.isProfileSetupPending || options.primaryDisabled === true}
              pending={props.isProfileSetupPending}
              onClick={options.onPrimary}
              type="button"
            >
              {options.primaryLabel ?? options.nextLabel ?? 'Save and continue'}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  switch (currentStep) {
    case 'import':
      return (
        <ProfileSetupImportStep
          importDisabledReason={props.importDisabledReason ?? null}
          isImportResumePending={props.isImportResumePending}
          isProfileSetupPending={props.isProfileSetupPending}
          latestResumeImportReviewCandidates={props.latestResumeImportReviewCandidates}
          onContinueToProfile={props.onContinueToProfile}
          onImportResume={props.onImportResume}
          onSaveAndGoToStep={props.onSaveAndGoToStep}
          profile={props.profile}
          renderFooter={renderFooter}
          reviewItemCount={currentStepReviewItems.length}
        />
      )
    case 'essentials':
      return (
        <ProfileSetupEssentialsStep
          nextStep={nextStep}
          onSaveAndGoToStep={props.onSaveAndGoToStep}
          profileForm={props.profileForm}
          renderFooter={renderFooter}
        />
      )
    case 'background':
      return (
        <div className="grid gap-6">
          <Card className="rounded-(--radius-panel) border-border/40">
            <CardContent className="grid gap-3 pt-6">
              <p className="text-sm font-semibold text-foreground">How to review location and remote details here</p>
              <p className="text-sm leading-6 text-foreground-soft">
                Update each imported role inside Work history. Use <span className="font-medium text-foreground">Location</span> for the city or region shown on that role, and use <span className="font-medium text-foreground">Work mode</span> to mark the role as Remote, Hybrid, or Onsite.
              </p>
            </CardContent>
          </Card>
          <ProfileExperienceTab
            busy={props.isProfileSetupPending}
            experienceArray={props.experienceArray}
            focusRecordId={focusExperienceRecordId}
            focusRecordOpenSignal={focusExperienceOpenSignal}
            profileForm={props.profileForm}
          />
          <ProfileBackgroundTab
            backgroundArrays={props.backgroundArrays}
            busy={props.isProfileSetupPending}
            profileForm={props.profileForm}
          />
          {renderFooter({
            nextLabel: 'Save and continue to targeting',
            onPrimary: () => props.onSaveAndGoToStep(nextStep ?? 'targeting'),
          })}
        </div>
      )
    case 'targeting':
      return (
        <ProfileSetupTargetingStep
          nextStep={nextStep}
          onSaveAndGoToStep={props.onSaveAndGoToStep}
          preferencesForm={props.preferencesForm}
          profileForm={props.profileForm}
          renderFooter={renderFooter}
        />
      )
    case 'narrative':
      return (
        <ProfileSetupNarrativeStep
          backgroundArrays={props.backgroundArrays}
          busy={props.isProfileSetupPending}
          nextStep={nextStep}
          onSaveAndGoToStep={props.onSaveAndGoToStep}
          profileForm={props.profileForm}
          renderFooter={renderFooter}
        />
      )
    case 'answers':
      return (
        <ProfileSetupAnswersStep
          backgroundArrays={props.backgroundArrays}
          busy={props.isProfileSetupPending}
          nextStep={nextStep}
          onSaveAndGoToStep={props.onSaveAndGoToStep}
          profileForm={props.profileForm}
          renderFooter={renderFooter}
        />
      )
    case 'ready_check':
      return (
        <ProfileSetupReadyCheckStep
          applyStatus={applyStatus}
          blockingPendingItemsCount={blockingPendingItems.length}
          canFinishSetup={canFinishSetup}
          discoveryStatus={discoveryStatus}
          getReadinessTone={getReadinessTone}
          narrativeStatus={narrativeStatus}
          onSaveAndFinish={props.onSaveAndFinish}
          renderFooter={renderFooter}
        />
      )
  }
}
