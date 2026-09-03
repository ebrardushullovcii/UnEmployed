import { describe, expect, it } from "vitest";
import {
  PROFILE_SETUP_FOOTER_CLEARANCE_CLASS_NAME,
  getProfileSetupContentClassName,
  getProfileSetupLayoutClassNames,
  getProfileSetupTopClassName,
} from "./profile-setup-screen";

describe("profile setup responsive layout", () => {
  it("gives the pristine import card a full-width single-column composition", () => {
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: false,
      isPristineSetup: true,
    });

    expect(layout.summary).toContain("w-full");
    expect(layout.summary).not.toContain("mx-auto");
    expect(layout.summary).not.toContain("max-w-");
    expect(layout.summary).not.toContain("xl:grid-cols-[");
    expect(layout.content).toContain("xl:grid-cols-1");
    // Sticky footer plus the collapsed Copilot launcher docked above it.
    expect(PROFILE_SETUP_FOOTER_CLEARANCE_CLASS_NAME).toBe("pb-32 xl:pb-36");
    expect(layout.reviewRail).toContain("pb-4");
    expect(layout.reviewRail).not.toContain("h-full");
  });

  it("lets a long editor use the full desktop width when the step has no pending review work", () => {
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: false,
      isPristineSetup: false,
    });

    expect(layout.summary).toContain("xl:grid-cols-1");
    expect(layout.content).toContain("xl:grid-cols-1");
    expect(layout.reviewRail).not.toContain("h-full");
  });

  it("keeps the editor single-column and renders the review queue full-width beneath it even with pending work", () => {
    // A second column beside long steps left thousands of pixels empty and
    // squeezed inputs; the review queue now follows the editor instead.
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: true,
      isPristineSetup: false,
    });

    expect(layout.summary).not.toContain("xl:grid-cols-[");
    expect(layout.content).toContain("xl:grid-cols-1");
    expect(layout.content).not.toContain("xl:grid-cols-[");
    expect(layout.reviewRail).not.toContain("h-full");
    expect(layout.reviewRail).toContain("xl:pb-6");
  });

  it("reserves footer clearance only while a sticky step footer is rendered", () => {
    // The pristine entry screen renders no footer, so reserving ~7rem beneath
    // it only pushed a page that otherwise fits past the viewport.
    expect(getProfileSetupContentClassName(true)).toBe("");
    expect(getProfileSetupContentClassName(false)).toBe(
      PROFILE_SETUP_FOOTER_CLEARANCE_CLASS_NAME,
    );
  });

  it("lets the pristine import card use its natural height instead of a nested viewport scroller", () => {
    const pristineTop = getProfileSetupTopClassName(true);
    const activeTop = getProfileSetupTopClassName(false);

    expect(pristineTop).toContain("overflow-visible");
    expect(pristineTop).not.toContain("max-h-[min(34vh,18rem)]");
    expect(pristineTop).not.toContain("overflow-y-auto");
    expect(activeTop).toContain("overflow-visible");
    expect(activeTop).not.toContain("max-h-[min(34vh,18rem)]");
    expect(activeTop).not.toContain("overflow-y-auto");
  });
});
