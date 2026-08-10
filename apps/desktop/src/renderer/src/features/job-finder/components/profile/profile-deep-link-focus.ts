export type ProfileDeepLinkFocus = "job-sources" | "target-roles";

export const PROFILE_SECTION_SCROLL_AREA_ID = "profile-section-scroll-area";

const profileFocusTargets: Record<
  ProfileDeepLinkFocus,
  { headingId: string; sectionId: string }
> = {
  "job-sources": {
    headingId: "profile-job-sources-heading",
    sectionId: "profile-job-sources",
  },
  "target-roles": {
    headingId: "profile-target-roles-heading",
    sectionId: "profile-target-roles",
  },
};

function resetScroll(element: HTMLElement, top: number) {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ behavior: "auto", left: 0, top });
    return;
  }

  element.scrollTop = top;
}

export function resetProfileSectionScroll(
  documentRef: Document = document,
): boolean {
  const sectionScroller = documentRef.getElementById(
    PROFILE_SECTION_SCROLL_AREA_ID,
  );

  if (!(sectionScroller instanceof HTMLElement)) {
    return false;
  }

  resetScroll(sectionScroller, 0);
  return true;
}

export function focusProfileDeepLink(
  requestedFocus: ProfileDeepLinkFocus,
  documentRef: Document = document,
): boolean {
  const target = profileFocusTargets[requestedFocus];
  const heading = documentRef.getElementById(target.headingId);
  const section = documentRef.getElementById(target.sectionId);
  const sectionScroller = documentRef.getElementById(
    PROFILE_SECTION_SCROLL_AREA_ID,
  );

  if (!heading || !section || !(sectionScroller instanceof HTMLElement)) {
    return false;
  }

  sectionScroller.scrollIntoView({ behavior: "auto", block: "start" });

  const sectionTop =
    sectionScroller.scrollTop +
    section.getBoundingClientRect().top -
    sectionScroller.getBoundingClientRect().top;
  resetScroll(sectionScroller, Math.max(0, sectionTop - 16));
  heading.focus({ preventScroll: true });
  return true;
}
