// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeCoverageComparison } from "@unemployed/contracts";
import { ResumeCoverageComparisonPanel } from "./resume-coverage-comparison-panel";

const baseComparison: ResumeCoverageComparison = {
  originalRoleCount: 1,
  representedRoleCount: 1,
  visibleRoleCount: 1,
  rewrittenRoleCount: 0,
  compactedRoleCount: 0,
  hiddenRoleCount: 0,
  missingRoleCount: 0,
  reorderedRoleCount: 0,
  addedClaimCount: 0,
  removedClaimCount: 0,
  duplicateIssueCount: 0,
  addedKeywords: [],
  removedKeywords: [],
  pageImpact: "within_target",
  pageCount: 1,
  targetPageCount: 2,
  roles: [
    {
      profileRecordId: "experience_1",
      title: "Software Engineer",
      employer: "Signal Systems",
      sectionId: "section_experience",
      entryId: "experience_1",
      status: "unchanged",
      included: true,
      reordered: false,
      originalIndex: 0,
      tailoredIndex: 0,
      originalClaimCount: 1,
      retainedClaimCount: 1,
      addedClaims: [],
      removedClaims: [],
      reasons: [],
    },
  ],
};

describe("ResumeCoverageComparisonPanel", () => {
  afterEach(cleanup);

  it("uses a full-strength focus ring so the disclosure stays >=3:1 in both themes", () => {
    // Audit: ring-primary/50 at 50% composites to ~2.03:1 on #c9cdd1 light and
    // 2.09:1 on #29313a dark — below WCAG 2.4.11 3:1. Full --ring is proven
    // >=3:1 in both themes by styles/globals.test.ts, so the <summary> must
    // bind to that token at full strength. Non-focus borders stay unchanged.
    const { container } = render(
      <ResumeCoverageComparisonPanel
        comparison={baseComparison}
        disabled={false}
        onRestoreClaim={vi.fn()}
        onRestoreRole={vi.fn()}
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).toBeTruthy();
    expect(summary?.className).toContain("focus-visible:ring-2");
    expect(summary?.className).toContain("focus-visible:ring-ring");
    expect(summary?.className).not.toMatch(/ring-primary\/\d/);
    // Ensure we didn't accidentally promote decorative borders.
    expect(container.innerHTML).toContain(
      "border border-(--surface-panel-border)",
    );
  });

  it("renders the summary with the full-strength ring class", () => {
    const { container } = render(
      <ResumeCoverageComparisonPanel
        comparison={baseComparison}
        disabled={false}
        onRestoreClaim={vi.fn()}
        onRestoreRole={vi.fn()}
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).toBeTruthy();
    expect(summary?.className).toContain("focus-visible:ring-2");
    expect(summary?.className).toContain("focus-visible:ring-ring");
    expect(summary?.className).not.toMatch(/ring-primary\/\d/);
  });
});
