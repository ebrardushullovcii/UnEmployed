import { describe, expect, it } from "vitest";
import { getProfileSetupLayoutClassNames } from "./profile-setup-screen";

describe("profile setup responsive layout", () => {
  it("gives the pristine import card an intentional single-column composition", () => {
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: false,
      isPristineSetup: true,
    });

    expect(layout.summary).toContain("mx-auto");
    expect(layout.summary).toContain("w-full");
    expect(layout.summary).toContain("max-w-5xl");
    expect(layout.summary).not.toContain("xl:grid-cols-[");
    expect(layout.content).toContain("xl:grid-cols-1");
    expect(layout.reviewRail).toContain("pb-24");
    expect(layout.reviewRail).not.toContain("h-full");
  });

  it("lets a long editor use the full desktop width when the step has no pending review work", () => {
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: false,
      isPristineSetup: false,
    });

    expect(layout.summary).toContain("xl:grid-cols-[");
    expect(layout.content).toContain("xl:grid-cols-1");
    expect(layout.reviewRail).not.toContain("h-full");
  });

  it("keeps the review queue beside the editor only when it has pending work", () => {
    const layout = getProfileSetupLayoutClassNames({
      hasPendingReviewItems: true,
      isPristineSetup: false,
    });

    expect(layout.summary).toContain("xl:grid-cols-[");
    expect(layout.content).toContain("xl:grid-cols-[");
    expect(layout.reviewRail).toContain("h-full");
    expect(layout.reviewRail).toContain("xl:pb-28");
  });
});
