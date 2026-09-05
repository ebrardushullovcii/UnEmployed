export const PROFILE_SETUP_STEP_HEADING_ID =
  "profile-setup-current-step-heading";

export function focusProfileSetupStepHeading(
  documentRef: Document = document,
): boolean {
  const activeElement = documentRef.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement !== documentRef.body &&
    activeElement.isConnected
  ) {
    return false;
  }

  const stepHeading = documentRef.getElementById(PROFILE_SETUP_STEP_HEADING_ID);

  if (!stepHeading) {
    return false;
  }

  stepHeading.focus({ preventScroll: true });
  return true;
}
