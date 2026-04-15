import { useEffect, useMemo, useState } from 'react'
import type { CandidateProfile, JobSearchPreferences, ProfileSetupStep } from '@unemployed/contracts'
import type { ProfileEditorValues, SearchPreferencesEditorValues } from '../../../lib/profile-editor'
import { buildProfilePayload, buildSearchPreferencesPayload } from '../../../lib/profile-editor'
import { getReviewItemScrollTargetId } from './profile-setup-review-scroll-targets'
import type { ProfileSetupReviewItemDisplay } from './profile-setup-screen-helpers'

export function useProfileSetupScreenActions(input: {
  draftAwareReviewItems: readonly ProfileSetupReviewItemDisplay[]
  hasUnsavedChanges: boolean
  onContinueToProfile: () => void
  onResumeSetup: (step: ProfileSetupStep) => void
  onSaveSetupStep: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
    nextStep: ProfileSetupStep,
    options?: { message?: string; openProfile?: boolean; stayOnCurrentStep?: boolean },
  ) => void
  profile: CandidateProfile
  profileFormValues: () => ProfileEditorValues
  profileSetupCurrentStep: ProfileSetupStep
  searchPreferences: JobSearchPreferences
  preferencesFormValues: () => SearchPreferencesEditorValues
  setValidationMessage: (message: string | null) => void
}) {
  const [focusedReviewItemId, setFocusedReviewItemId] = useState<string | null>(null)
  const [focusedReviewRequestKey, setFocusedReviewRequestKey] = useState(0)

  const currentStepReviewItems = useMemo(
    () => input.draftAwareReviewItems.filter((item) => item.step === input.profileSetupCurrentStep),
    [input.draftAwareReviewItems, input.profileSetupCurrentStep],
  )

  function openAndScrollToReviewTarget(targetId: string) {
    const target = document.getElementById(targetId)

    if (!target) {
      return
    }

    const parentDetails = target.closest('details')
    if (parentDetails instanceof HTMLDetailsElement) {
      parentDetails.open = true
    }

    if (target instanceof HTMLDetailsElement) {
      target.open = true
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })

    window.requestAnimationFrame(() => {
      const focusTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
          ? target
          : target.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]:not([tabindex="-1"])')

      focusTarget?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (!focusedReviewItemId) {
      return
    }

    const focusedItem = input.draftAwareReviewItems.find((item) => item.id === focusedReviewItemId)
    if (!focusedItem || focusedItem.step !== input.profileSetupCurrentStep) {
      return
    }

    const targetId = getReviewItemScrollTargetId(focusedItem)
    if (!targetId) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      openAndScrollToReviewTarget(targetId)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusedReviewItemId, input.draftAwareReviewItems, input.profileSetupCurrentStep])

  function handleSaveStep(nextStep: ProfileSetupStep, options?: { message?: string; openProfile?: boolean; stayOnCurrentStep?: boolean }) {
    const profileResult = buildProfilePayload(input.profile, input.profileFormValues())
    if (!profileResult.payload) {
      input.setValidationMessage(profileResult.validationMessage ?? 'Profile data is invalid.')
      return
    }

    const preferencesResult = buildSearchPreferencesPayload(input.searchPreferences, input.preferencesFormValues())
    if (!preferencesResult.payload) {
      input.setValidationMessage(preferencesResult.validationMessage ?? 'Search preferences are invalid.')
      return
    }

    input.setValidationMessage(null)
    input.onSaveSetupStep(profileResult.payload, preferencesResult.payload, nextStep, options)
  }

  function goToStep(step: ProfileSetupStep) {
    if (input.hasUnsavedChanges) {
      handleSaveStep(step)
      return
    }

    input.onResumeSetup(step)
  }

  function handleEditReviewItem(item: ProfileSetupReviewItemDisplay) {
    setFocusedReviewItemId(item.id)
    setFocusedReviewRequestKey((current) => current + 1)

    if (item.step !== input.profileSetupCurrentStep) {
      goToStep(item.step)
      return
    }

    const targetId = getReviewItemScrollTargetId(item)
    if (!targetId) {
      return
    }

    window.requestAnimationFrame(() => {
      openAndScrollToReviewTarget(targetId)
    })
  }

  function openProfile() {
    if (input.hasUnsavedChanges) {
      handleSaveStep(input.profileSetupCurrentStep, { openProfile: true })
      return
    }

    input.onContinueToProfile()
  }

  function handleSaveCurrentStep() {
    handleSaveStep(input.profileSetupCurrentStep, {
      message: 'Saved this step.',
      stayOnCurrentStep: true,
    })
  }

  return {
    currentStepReviewItems,
    focusedReviewItemId,
    focusedReviewRequestKey,
    goToStep,
    handleEditReviewItem,
    handleSaveCurrentStep,
    handleSaveStep,
    openProfile,
  }
}
