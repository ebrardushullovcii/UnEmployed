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

  const scrollOwner = target.closest<HTMLElement>("main.screen-scroll-area");
  if (scrollOwner) {
    // scrollIntoView also scrolls the outer document, even with overflow:hidden.
    // That moves the entire shell behind its fixed header and exposes a bottom gap.
    const clearance =
      Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const topPadding =
      Number.parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0;
    scrollOwner.scrollTop +=
      target.getBoundingClientRect().top -
      scrollOwner.getBoundingClientRect().top -
      scrollOwner.clientTop -
      clearance -
      topPadding;
  } else if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "start" });
  }
  if (typeof target.focus === "function") {
    target.focus({ preventScroll: true });
  }
  return true;
}
