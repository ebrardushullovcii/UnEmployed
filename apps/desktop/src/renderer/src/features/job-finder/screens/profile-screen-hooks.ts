import { useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import type {
  CandidateProfile,
  JobSearchPreferences,
  ResumeImportFieldCandidateSummary,
} from '@unemployed/contracts'
import type { ProfileBackgroundArrays } from '../components/profile/profile-field-array-types'
import {
  buildProfilePayload,
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  hasProfileDraftChanges,
  hasSearchPreferencesDraftChanges,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from '../lib/profile-editor'
import { buildProfileScreenViewModel } from '../lib/profile-screen-view-model'

export function useProfileScreenForms(input: {
  latestResumeImportReviewCandidates: readonly ResumeImportFieldCandidateSummary[]
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}) {
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const latestProfileRef = useRef(input.profile)
  const latestSearchPreferencesRef = useRef(input.searchPreferences)

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

  const [identityValues, summaryValues, narrativeValues, skillGroupValues, profileSkillValues, eligibilityValues, applicationIdentityValues, answerBankValues, experienceValues, educationValues, certificationValues, projectValues, linkValues, languageValues, proofBankValues] = useWatch({
    control: profileForm.control,
    name: [
      'identity',
      'summary',
      'narrative',
      'skillGroups',
      'profileSkills',
      'eligibility',
      'applicationIdentity',
      'answerBank',
      'records.experiences',
      'records.education',
      'records.certifications',
      'projects',
      'links',
      'languages',
      'proofBank',
    ],
  })
  const [targetRoles, jobFamilies, seniorityLevels, employmentTypes, locations, excludedLocations, targetIndustries, targetCompanyStages, companyWhitelist, companyBlacklist, workModes, tailoringMode, minimumSalaryUsd, targetSalaryUsd] = useWatch({
    control: preferencesForm.control,
    name: [
      'targetRoles',
      'jobFamilies',
      'seniorityLevels',
      'employmentTypes',
      'locations',
      'excludedLocations',
      'targetIndustries',
      'targetCompanyStages',
      'companyWhitelist',
      'companyBlacklist',
      'workModes',
      'tailoringMode',
      'minimumSalaryUsd',
      'targetSalaryUsd',
    ],
  })

  const currentProfileValues = profileForm.watch()
  const currentPreferenceValues = preferencesForm.watch()
  const draftProfileResult = useMemo(
    () => buildProfilePayload(latestProfileRef.current, currentProfileValues),
    [currentProfileValues],
  )
  const draftSearchPreferencesResult = useMemo(
    () => buildSearchPreferencesPayload(latestSearchPreferencesRef.current, currentPreferenceValues),
    [currentPreferenceValues],
  )

  useEffect(() => {
    profileForm.reset(createProfileEditorValues(input.profile, input.latestResumeImportReviewCandidates))
    setValidationMessage(null)
    latestProfileRef.current = input.profile
  }, [input.latestResumeImportReviewCandidates, input.profile, profileForm])

  useEffect(() => {
    preferencesForm.reset(createSearchPreferencesEditorValues(input.searchPreferences))
    setValidationMessage(null)
    latestSearchPreferencesRef.current = input.searchPreferences
  }, [input.searchPreferences, preferencesForm])

  const hasUnsavedChanges =
    profileForm.formState.isDirty ||
    preferencesForm.formState.isDirty ||
    hasProfileDraftChanges(input.profile, draftProfileResult.payload) ||
    hasSearchPreferencesDraftChanges(input.searchPreferences, draftSearchPreferencesResult.payload)
  const hasUserDraftChanges =
    profileForm.formState.isDirty || preferencesForm.formState.isDirty
  const backgroundArrays: ProfileBackgroundArrays = {
    certificationArray,
    customAnswerArray,
    educationArray,
    languageArray,
    linkArray,
    proofBankArray,
    projectArray,
  }
  const { overviewProfile, sections } = useMemo(() => buildProfileScreenViewModel({
    applicationIdentityValues,
    answerBankValues,
    certificationValues,
    companyBlacklist,
    companyWhitelist,
    educationValues,
    eligibilityValues,
    employmentTypes,
    excludedLocations,
    experienceValues,
    identityValues,
    jobFamilies,
    languageValues,
    linkValues,
    locations,
    minimumSalaryUsd,
    narrativeValues,
    profile: input.profile,
    profileSkillValues,
    proofBankValues,
    projectValues,
    seniorityLevels,
    skillGroupValues,
    summaryValues,
    tailoringMode,
    targetCompanyStages,
    targetIndustries,
    targetRoles,
    targetSalaryUsd,
    workModes,
  }), [
    applicationIdentityValues,
    answerBankValues,
    certificationValues,
    companyBlacklist,
    companyWhitelist,
    educationValues,
    eligibilityValues,
    employmentTypes,
    excludedLocations,
    experienceValues,
    identityValues,
    input.profile,
    jobFamilies,
    languageValues,
    linkValues,
    locations,
    minimumSalaryUsd,
    narrativeValues,
    profileSkillValues,
    proofBankValues,
    projectValues,
    seniorityLevels,
    skillGroupValues,
    summaryValues,
    tailoringMode,
    targetCompanyStages,
    targetIndustries,
    targetRoles,
    targetSalaryUsd,
    workModes,
  ])

  return {
    backgroundArrays,
    experienceArray,
    hasUnsavedChanges,
    hasUserDraftChanges,
    overviewProfile,
    preferencesForm,
    profileForm,
    sections,
    setValidationMessage,
    validationMessage,
  }
}
