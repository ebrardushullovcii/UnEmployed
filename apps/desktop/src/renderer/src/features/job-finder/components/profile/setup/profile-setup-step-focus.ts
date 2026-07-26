export const PROFILE_SETUP_STEP_HEADING_ID = 'profile-setup-current-step-heading'

export function resetProfileSetupStepView(documentRef: Document = document): boolean {
  const stepHeading = documentRef.getElementById(PROFILE_SETUP_STEP_HEADING_ID)

  if (!stepHeading) {
    return false
  }

  const scrollContainer = stepHeading.closest('.screen-scroll-area')

  if (scrollContainer instanceof HTMLElement) {
    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ behavior: 'auto', left: 0, top: 0 })
    } else {
      scrollContainer.scrollTop = 0
    }
  }

  stepHeading.focus({ preventScroll: true })
  return true
}
