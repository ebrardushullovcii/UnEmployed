import type { ProfileSetupStep } from '@unemployed/contracts'

export const profileSetupSteps: readonly ProfileSetupStep[] = [
  'import',
  'essentials',
  'background',
  'targeting',
  'narrative',
  'answers',
  'ready_check'
]

export const profileSetupStepDefinitions: Array<{
  id: ProfileSetupStep
  label: string
  summary: string
}> = [
  {
    id: 'import',
    label: 'Import',
    summary: 'Bring in a resume first, then focus only on the important follow-up questions.'
  },
  {
    id: 'essentials',
    label: 'Essentials',
    summary: 'Confirm your identity, contact path, headline, and location before discovery relies on them.'
  },
  {
    id: 'background',
    label: 'Background',
    summary: 'Review work history and supporting records so resumes and fit scoring stay grounded.'
  },
  {
    id: 'targeting',
    label: 'Targeting',
    summary: 'Set roles, locations, work mode, and eligibility so search is not generic.'
  },
  {
    id: 'narrative',
    label: 'Narrative',
    summary: 'Capture the story and strongest proof the rest of the product can reuse.'
  },
  {
    id: 'answers',
    label: 'Answers',
    summary: 'Save common screener answers so you do not rewrite them for every application.'
  },
  {
    id: 'ready_check',
    label: 'Ready check',
    summary: 'See what is ready, what still needs review, and what could weaken downstream quality.'
  }
]

export function formatProfileSetupStepLabel(step: ProfileSetupStep): string {
  return profileSetupStepDefinitions.find((entry) => entry.id === step)?.label ?? step
}

export function getNextProfileSetupStep(
  currentStep: ProfileSetupStep,
): ProfileSetupStep | null {
  const currentIndex = profileSetupSteps.indexOf(currentStep)

  if (currentIndex < 0 || currentIndex >= profileSetupSteps.length - 1) {
    return null
  }

  return profileSetupSteps[currentIndex + 1] ?? null
}

export function getPreviousProfileSetupStep(
  currentStep: ProfileSetupStep,
): ProfileSetupStep | null {
  const currentIndex = profileSetupSteps.indexOf(currentStep)

  if (currentIndex <= 0) {
    return null
  }

  return profileSetupSteps[currentIndex - 1] ?? null
}
