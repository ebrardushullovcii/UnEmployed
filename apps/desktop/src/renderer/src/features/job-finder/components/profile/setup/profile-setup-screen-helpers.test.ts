// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  JobSearchPreferencesSchema,
  createFreshStartCandidateProfile,
  PROFILE_SETUP_PLACEHOLDER_HEADLINE,
} from '@unemployed/contracts'
import {
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
} from '../../../lib/profile-editor'
import {
  buildProfileSetupIdentityBlockerReason,
  formatProfileSetupReviewValue,
  isBlockingPendingReviewItem,
  isOptionalPendingReviewItem,
  isProfileSetupPathStepComplete,
  PROFILE_SETUP_VALIDATION_ALERT_ID,
  type ProfileSetupPathStepReadiness,
} from './profile-setup-screen-helpers'
import { profileSetupSteps } from './profile-setup-steps'
import {
  revealProfileSetupValidationAlert,
  useProfileSetupScreenActions,
} from './profile-setup-screen-actions'

function stubScrollIntoView() {
  const scrollIntoView = vi.fn()
  ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
    scrollIntoView
  return scrollIntoView
}

function createTestSearchPreferences() {
  return JobSearchPreferencesSchema.parse({
    targetRoles: [],
    jobFamilies: [],
    locations: [],
    excludedLocations: [],
    workModes: [],
    seniorityLevels: [],
    targetIndustries: [],
    targetCompanyStages: [],
    employmentTypes: [],
    minimumSalaryUsd: null,
    targetSalaryUsd: null,
    salaryCurrency: 'USD',
    approvalMode: 'review_before_submit',
    tailoringMode: 'balanced',
    companyBlacklist: [],
    companyWhitelist: [],
    discovery: {
      historyLimit: 5,
      targets: [],
    },
  })
}

describe('formatProfileSetupReviewValue', () => {
  it('renders serialized education records as readable details without internal ids', () => {
    const formatted = formatProfileSetupReviewValue(JSON.stringify({
      id: 'education_internal_1',
      schoolName: 'University of Prishtina',
      degree: 'Bachelor of Science',
      fieldOfStudy: 'Computer Science',
      location: 'Prishtina, Kosovo',
    }))

    expect(formatted).toBe(
      'School name: University of Prishtina · Degree: Bachelor of Science · Field of study: Computer Science · Location: Prishtina, Kosovo',
    )
    expect(formatted).not.toContain('education_internal_1')
    expect(formatted).not.toContain('{')
  })

  it('renders structured language values with human labels', () => {
    expect(formatProfileSetupReviewValue({
      id: 'language_internal_1',
      language: 'English',
      proficiency: 'fluent',
      interviewPreference: true,
    })).toBe('Language: English · Proficiency: fluent · Interview preference: Yes')
  })

  it('leaves ordinary text untouched and safely handles malformed JSON-like text', () => {
    expect(formatProfileSetupReviewValue('Senior Software Engineer')).toBe('Senior Software Engineer')
    expect(formatProfileSetupReviewValue('{not json')).toBe('{not json')
  })
})

describe('profile setup review priority', () => {
  it('keeps pending optional suggestions out of blocking counts', () => {
    const optionalItem = { severity: 'optional' as const, status: 'pending' as const }
    const recommendedItem = { severity: 'recommended' as const, status: 'pending' as const }
    const resolvedCriticalItem = { severity: 'critical' as const, status: 'confirmed' as const }

    expect(isOptionalPendingReviewItem(optionalItem)).toBe(true)
    expect(isBlockingPendingReviewItem(optionalItem)).toBe(false)
    expect(isBlockingPendingReviewItem(recommendedItem)).toBe(true)
    expect(isBlockingPendingReviewItem(resolvedCriticalItem)).toBe(false)
  })
})

describe('isProfileSetupPathStepComplete', () => {
  const baseInput = {
    pendingBlockingReviewCount: 0,
    // Legacy callers without draft evidence keep the chronology-only rule.
    readiness: null,
    setupStatus: 'in_progress' as const,
  }

  it('never reports Import complete without an imported resume', () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'import',
        currentStep: 'essentials',
        hasImportedResume: false,
      }),
    ).toBe(false)

    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'import',
        currentStep: 'essentials',
        hasImportedResume: true,
      }),
    ).toBe(true)
  })

  it('keeps Import open while setup has not moved past it yet', () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'import',
        currentStep: 'import',
        hasImportedResume: true,
      }),
    ).toBe(false)
  })

  it('keeps manual-setup later steps chronological without faking the import row', () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'essentials',
        currentStep: 'targeting',
        hasImportedResume: false,
      }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'import',
        currentStep: 'targeting',
        hasImportedResume: false,
      }),
    ).toBe(false)
  })

  it('still blocks rows behind pending critical or recommended review items', () => {
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        pendingBlockingReviewCount: 1,
        stepId: 'essentials',
        currentStep: 'targeting',
        hasImportedResume: false,
      }),
    ).toBe(false)
  })

  it('reports every reached row complete for completed setup', () => {
    expect(
      isProfileSetupPathStepComplete({
        pendingBlockingReviewCount: 0,
        setupStatus: 'completed',
        stepId: 'background',
        currentStep: 'ready_check',
        hasImportedResume: true,
        readiness: null,
      }),
    ).toBe(true)
  })
})

describe('isProfileSetupPathStepComplete domain evidence', () => {
  const untouchedReadiness: ProfileSetupPathStepReadiness = {
    hasAnswerBank: false,
    hasContactPath: false,
    hasCoreIdentity: false,
    hasDiscoverySource: false,
    hasEligibilityPreferences: false,
    hasMeaningfulBackground: false,
    hasNarrative: false,
    hasWorkModePreference: false,
  }
  const completeReadiness: ProfileSetupPathStepReadiness = {
    hasAnswerBank: true,
    hasContactPath: true,
    hasCoreIdentity: true,
    hasDiscoverySource: true,
    hasEligibilityPreferences: true,
    hasMeaningfulBackground: true,
    hasNarrative: true,
    hasWorkModePreference: true,
  }

  it('never marks untouched steps complete after blitz-clicking to ready check', () => {
    for (const stepId of profileSetupSteps) {
      expect(
        isProfileSetupPathStepComplete({
          currentStep: 'ready_check',
          hasImportedResume: false,
          pendingBlockingReviewCount: 0,
          readiness: untouchedReadiness,
          setupStatus: 'in_progress',
          stepId,
        }),
      ).toBe(false)
    }

    // Finishing setup cannot promote rows whose domain content never existed.
    expect(
      isProfileSetupPathStepComplete({
        currentStep: 'ready_check',
        hasImportedResume: false,
        pendingBlockingReviewCount: 0,
        readiness: untouchedReadiness,
        setupStatus: 'completed',
        stepId: 'background',
      }),
    ).toBe(false)
  })

  it('keeps genuinely satisfied steps complete while they sit behind the current step', () => {
    const baseInput = {
      currentStep: 'ready_check' as const,
      hasImportedResume: true,
      pendingBlockingReviewCount: 0,
      readiness: completeReadiness,
      setupStatus: 'in_progress' as const,
    }

    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'import' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'essentials' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'background' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'targeting' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'narrative' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'answers' }),
    ).toBe(true)

    // The ready check row itself only completes when setup finishes.
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        stepId: 'ready_check',
      }),
    ).toBe(false)
    expect(
      isProfileSetupPathStepComplete({
        ...baseInput,
        setupStatus: 'completed',
        stepId: 'ready_check',
      }),
    ).toBe(true)
  })

  it('judges each step by its own signals instead of the strongest one', () => {
    const identityWithoutContact: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasContactPath: false,
    }
    expect(
      isProfileSetupPathStepComplete({
        currentStep: 'ready_check',
        hasImportedResume: true,
        pendingBlockingReviewCount: 0,
        readiness: identityWithoutContact,
        setupStatus: 'in_progress',
        stepId: 'essentials',
      }),
    ).toBe(false)

    const targetingWithoutWorkMode: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasWorkModePreference: false,
    }
    expect(
      isProfileSetupPathStepComplete({
        currentStep: 'ready_check',
        hasImportedResume: true,
        pendingBlockingReviewCount: 0,
        readiness: targetingWithoutWorkMode,
        setupStatus: 'in_progress',
        stepId: 'targeting',
      }),
    ).toBe(false)
  })

  it('leaves empty optional steps unbadged without turning them into blockers', () => {
    const readiness: ProfileSetupPathStepReadiness = {
      ...completeReadiness,
      hasAnswerBank: false,
      hasNarrative: false,
    }
    const baseInput = {
      currentStep: 'ready_check' as const,
      hasImportedResume: true,
      pendingBlockingReviewCount: 0,
      readiness,
      setupStatus: 'in_progress' as const,
    }

    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'narrative' }),
    ).toBe(false)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'answers' }),
    ).toBe(false)

    // Required neighbors stay honestly complete beside the empty optionals.
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'essentials' }),
    ).toBe(true)
    expect(
      isProfileSetupPathStepComplete({ ...baseInput, stepId: 'targeting' }),
    ).toBe(true)
  })

  it('still lets pending blocking reviews outrank any evidence', () => {
    expect(
      isProfileSetupPathStepComplete({
        currentStep: 'ready_check',
        hasImportedResume: true,
        pendingBlockingReviewCount: 1,
        readiness: completeReadiness,
        setupStatus: 'completed',
        stepId: 'essentials',
      }),
    ).toBe(false)
  })

  it('keeps manual-setup import rows honest even with otherwise full evidence', () => {
    expect(
      isProfileSetupPathStepComplete({
        currentStep: 'ready_check',
        hasImportedResume: false,
        pendingBlockingReviewCount: 0,
        readiness: completeReadiness,
        setupStatus: 'completed',
        stepId: 'import',
      }),
    ).toBe(false)
  })
})

describe('buildProfileSetupIdentityBlockerReason', () => {
  it('enumerates full name, headline, location, contact, and fresh-start years when they miss', () => {
    const reason = buildProfileSetupIdentityBlockerReason(
      createFreshStartCandidateProfile(),
    )

    expect(reason).toContain('your full name')
    expect(reason).toContain('a headline')
    expect(reason).toContain('your location')
    expect(reason).toContain('at least one contact method')
    expect(reason).toContain('your years of experience')
  })

  it('names only the requirements that are still missing', () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      firstName: 'Alex',
      lastName: 'Vanguard',
      fullName: 'Alex Vanguard',
      headline: 'Senior systems designer',
      currentLocation: 'London, UK',
      yearsExperience: 7,
    })

    expect(reason).not.toContain('your full name')
    expect(reason).not.toContain('a headline')
    expect(reason).not.toContain('your location')
    expect(reason).toContain('at least one contact method')
    expect(reason).not.toContain('your years of experience')
  })

  it('says exactly add a headline when only the headline is missing', () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: 'candidate_complete_identity',
      firstName: 'Alex',
      lastName: 'Vanguard',
      middleName: null,
      fullName: 'Alex Vanguard',
      currentLocation: 'London, UK',
      email: 'alex@example.com',
      yearsExperience: 7,
      headline: null,
    })

    expect(reason).toBe(
      'Add a headline before discovery and applications rely on your identity.',
    )
    expect(reason).not.toContain('your full name')
    expect(reason).not.toContain('your location')
    expect(reason).not.toContain('at least one contact method')
  })

  it('treats a first-run placeholder headline as a missing headline', () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: 'candidate_placeholder_headline',
      firstName: 'Alex',
      lastName: 'Vanguard',
      middleName: null,
      fullName: 'Alex Vanguard',
      currentLocation: 'London, UK',
      email: 'alex@example.com',
      yearsExperience: 7,
      headline: PROFILE_SETUP_PLACEHOLDER_HEADLINE,
    })

    expect(reason).toBe(
      'Add a headline before discovery and applications rely on your identity.',
    )
  })

  it('requires fresh-start years only for fresh-start profiles', () => {
    const reason = buildProfileSetupIdentityBlockerReason({
      ...createFreshStartCandidateProfile(),
      id: 'candidate_legacy_import',
      email: 'alex@example.com',
      yearsExperience: 0,
    })

    expect(reason).toContain('your full name')
    expect(reason).toContain('a headline')
    expect(reason).not.toContain('your years of experience')
  })
})

describe('aborted save-and-move validation alert', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    delete (Element.prototype as unknown as { scrollIntoView?: unknown })
      .scrollIntoView
    vi.restoreAllMocks()
  })

  it('keeps failed values on the current step and reveals one canonical alert', () => {
    const scrollIntoView = stubScrollIntoView()
    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`

    const profile = createFreshStartCandidateProfile()
    const searchPreferences = createTestSearchPreferences()
    const onResumeSetup = vi.fn()
    const onSaveSetupStep = vi.fn()
    const onContinueToProfile = vi.fn()
    const setValidationMessage = vi.fn()

    const { result } = renderHook(() =>
      useProfileSetupScreenActions({
        draftAwareReviewItems: [],
        hasUnsavedChanges: true,
        onContinueToProfile,
        onResumeSetup,
        onSaveSetupStep,
        profile,
        profileFormValues: () => ({
          ...createProfileEditorValues(profile),
          identity: {
            ...createProfileEditorValues(profile).identity,
            yearsExperience: '-2',
          },
        }),
        profileSetupCurrentStep: 'essentials',
        searchPreferences,
        preferencesFormValues: () =>
          createSearchPreferencesEditorValues(searchPreferences),
        setValidationMessage,
      }),
    )

    act(() => {
      result.current.goToStep('background')
    })

    expect(onResumeSetup).not.toHaveBeenCalled()
    expect(onSaveSetupStep).not.toHaveBeenCalled()
    expect(setValidationMessage).toHaveBeenCalledTimes(1)
    expect(setValidationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Years of experience'),
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.openProfile()
    })

    expect(onContinueToProfile).not.toHaveBeenCalled()
    expect(onSaveSetupStep).not.toHaveBeenCalled()
  })

  it('scrolls immediately when the alert is mounted and defers when it is not', () => {
    const scrollIntoView = stubScrollIntoView()
    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`

    revealProfileSetupValidationAlert()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    document.body.innerHTML = ''
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })

    revealProfileSetupValidationAlert()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    document.body.innerHTML = `<p id="${PROFILE_SETUP_VALIDATION_ALERT_ID}" role="alert"></p>`
    for (const callback of rafCallbacks) {
      callback(0)
    }
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })
})
