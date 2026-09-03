/**
 * One shared way to reach a Settings section, used by the sticky section nav
 * and by the sticky unsaved-changes bar. Both must land on the same element
 * and move focus there, so a keyboard user who follows either affordance ends
 * up in the same place.
 *
 * Returns whether a target was found. Movement is best effort: an environment
 * without `scrollIntoView` still gets focus, and a missing target never
 * throws out of a click handler and takes the rest of the interaction with it.
 */
export function focusSettingsSection(sectionId: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const target = document.getElementById(sectionId);
  if (!target) {
    return false;
  }

  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "start" });
  }
  if (typeof target.focus === "function") {
    target.focus({ preventScroll: true });
  }
  return true;
}
