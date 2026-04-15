import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type {
  CandidateProfile,
  JobSearchPreferences,
  ProfileSetupState,
  ResumeImportFieldCandidateSummary,
} from '@unemployed/contracts'
import type { ProfileBackgroundArrays } from '../profile-field-array-types'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  hasProfileDraftChanges,
  hasSearchPreferencesDraftChanges,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from '../../../lib/profile-editor'
import { buildDraftAwareSetupReviewItems } from './profile-setup-screen-helpers'

export function useProfileSetupForms(input: {
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  profile: CandidateProfile
  profileSetupState: ProfileSetupState
  searchPreferences: JobSearchPreferences
}) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const latestProfileRef = useRef(input.profile)
  const latestSearchPreferencesRef = useRef(input.searchPreferences)
  const currentProfileBaseline = latestProfileRef.current
  const currentSearchPreferencesBaseline = latestSearchPreferencesRef.current
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(input.profile, input.latestResumeImportReviewCandidates),
  })
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: createSearchPreferencesEditorValues(input.searchPreferences),
  })

  const experienceArray = useFieldArray({ control: profileForm.control, name: 'records.experiences', keyName: 'fieldKey' })
  const educationArray = useFieldArray({ control: profileForm.control, name: 'records.education', keyName: 'fieldKey' })
  const certificationArray = useFieldArray({ control: profileForm.control, name: 'records.certifications', keyName: 'fieldKey' })
  const projectArray = useFieldArray({ control: profileForm.control, name: 'projects', keyName: 'fieldKey' })
  const linkArray = useFieldArray({ control: profileForm.control, name: 'links', keyName: 'fieldKey' })
  const languageArray = useFieldArray({ control: profileForm.control, name: 'languages', keyName: 'fieldKey' })
  const proofBankArray = useFieldArray({ control: profileForm.control, name: 'proofBank', keyName: 'fieldKey' })
  const customAnswerArray = useFieldArray({ control: profileForm.control, name: 'answerBank.customAnswers', keyName: 'fieldKey' })
  const backgroundArrays: ProfileBackgroundArrays = {
    certificationArray,
    customAnswerArray,
    educationArray,
    languageArray,
    linkArray,
    proofBankArray,
    projectArray,
  }

  const currentProfileValues = profileForm.watch()
  const currentPreferenceValues = preferencesForm.watch()
  const draftProfileResult = buildProfilePayload(
    currentProfileBaseline,
    currentProfileValues,
  )
  const draftPreferencesResult = buildSearchPreferencesPayload(
    currentSearchPreferencesBaseline,
    currentPreferenceValues,
  )
  const draftProfile = draftProfileResult.payload ?? currentProfileBaseline
  const draftSearchPreferences =
    draftPreferencesResult.payload ?? currentSearchPreferencesBaseline
  const hasUnsavedChanges =
    profileForm.formState.isDirty ||
    preferencesForm.formState.isDirty ||
    hasProfileDraftChanges(currentProfileBaseline, draftProfileResult.payload) ||
    hasSearchPreferencesDraftChanges(
      currentSearchPreferencesBaseline,
      draftPreferencesResult.payload,
    )
  const hasUserDraftChanges =
    profileForm.formState.isDirty || preferencesForm.formState.isDirty
  const draftAwareReviewItems = useMemo(
    () => buildDraftAwareSetupReviewItems({
      currentProfile: currentProfileBaseline,
      currentSearchPreferences: currentSearchPreferencesBaseline,
      draftProfile,
      draftSearchPreferences,
      reviewItems: input.profileSetupState.reviewItems,
    }),
    [
      currentProfileBaseline,
      currentSearchPreferencesBaseline,
      draftProfile,
      draftSearchPreferences,
      input.profileSetupState.reviewItems,
    ],
  )

  useEffect(() => {
    latestProfileRef.current = input.profile
    profileForm.reset(createProfileEditorValues(input.profile, input.latestResumeImportReviewCandidates))
    setValidationMessage(null)
  }, [input.latestResumeImportReviewCandidates, input.profile, profileForm])

  useEffect(() => {
    latestSearchPreferencesRef.current = input.searchPreferences
    preferencesForm.reset(createSearchPreferencesEditorValues(input.searchPreferences))
    setValidationMessage(null)
  }, [input.searchPreferences, preferencesForm])

  return {
    backgroundArrays,
    draftAwareReviewItems,
    draftProfile,
    draftSearchPreferences,
    experienceArray,
    hasUserDraftChanges,
    hasUnsavedChanges,
    preferencesForm,
    profileForm,
    setValidationMessage,
    validationMessage,
  }
}
