// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MatchAssessmentChangeAuditSchema,
  type SavedJob,
} from "@unemployed/contracts";
import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";
import {
  DiscoveryDetailPanel,
  MatchAssessmentChangeDisclosure,
  SourceDiagnostics,
} from "./discovery-detail-panel";

describe("MatchAssessmentChangeDisclosure", () => {
  afterEach(cleanup);

  it("keeps a concise rank explanation behind a closed disclosure", () => {
    const audit = MatchAssessmentChangeAuditSchema.parse({
      recordedAt: "2026-08-09T10:05:00.000Z",
      status: "assessment_changed_with_unknown_cause",
      causeConfidence: "unknown",
      rankingSignalChanged: true,
      summary: "The exact cause is unknown.",
      reasons: [],
      previousMetadata: {
        scorerVersion: 4,
        contextFingerprint: "match_context_v4_candidate",
        postingFingerprint: "match_posting_v4_listing",
      },
      currentMetadata: {
        scorerVersion: 4,
        contextFingerprint: "match_context_v4_candidate",
        postingFingerprint: "match_posting_v4_listing",
      },
      inputChanges: [],
      previousRank: 5,
      currentRank: 2,
      outputChanges: [
        {
          code: "rank_position_changed",
          subject: "rank_position",
          title: "Queue rank changed",
          detail:
            "The queue rank changed from #5 to #2 because other jobs changed around it.",
          previousValue: "5",
          currentValue: "2",
        },
      ],
    });
    const { getByText, getByTestId } = render(
      <MatchAssessmentChangeDisclosure audit={audit} />,
    );

    const disclosure = getByTestId(
      "match-assessment-change-audit",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(getByText(/Why this result changed/iu)).toBeTruthy();
    expect(getByText("#5 → #2")).toBeTruthy();
    expect(
      getByText(/other visible results entered, left, or changed/iu),
    ).toBeTruthy();
  });
});

describe("SourceDiagnostics", () => {
  afterEach(cleanup);

  it("keeps provider internals behind a closed diagnostics disclosure", () => {
    const { getByText } = render(
      <SourceDiagnostics
        summaries={[
          {
            title: "Provider intelligence",
            items: [{ label: "Board token", value: "internal-board-token" }],
          },
        ]}
      />,
    );

    const disclosure = getByText("Source diagnostics").closest("details");

    expect(disclosure).toBeTruthy();
    expect((disclosure as HTMLDetailsElement).open).toBe(false);
    expect(
      getByText(
        "Technical collection details for troubleshooting this saved source.",
      ),
    ).toBeTruthy();
  });
});

describe("DiscoveryDetailPanel", () => {
  afterEach(cleanup);

  it("contains the recommendation badge inside the narrow detail pane at the supported 1024px width", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event("resize"));

    const selectedJob = {
      id: "job_narrow_actions",
      title: "Senior Frontend Engineer",
      company: "Example Co",
      location: "Remote",
      status: "discovered",
      canonicalUrl: "https://example.test/jobs/frontend",
      matchAssessment: {
        score: 82,
        reasons: ["Duplicate role reason"],
        gaps: ["Duplicate role gap"],
      },
      workMode: ["remote"],
      sourceIntelligence: null,
      normalizedCompensation: null,
      description: "Build accessible interfaces.",
      descriptionFormat: "text",
      keySkills: [],
      keywordSignals: [],
      provenance: [],
      screeningHints: {
        relocationText: null,
        remoteGeographies: [],
        requiresSecurityClearance: null,
        sponsorshipText: null,
        travelText: null,
      },
      sourceTargetId: null,
    } as unknown as SavedJob;

    const onDismissJob = vi.fn();
    const onQueueJob = vi.fn();
    const { getByLabelText, getByTestId, getByRole, getByText } = render(
      <DiscoveryDetailPanel
        discoveryTargets={[]}
        isJobPending={() => false}
        onDismissJob={onDismissJob}
        onQueueJob={onQueueJob}
        selectedJob={selectedJob}
      />,
    );

    const actionRegion = getByTestId("discovery-detail-actions");
    const primaryActionRegion = getByTestId("discovery-detail-primary-action");
    const detailScrollArea = getByTestId("discovery-detail-scroll-area");

    const fitBreakdown = getByRole("region", { name: "Fit breakdown" });
    const detailRegion = getByRole("region", { name: "Job details" });
    const detailHeading = getByRole("heading", {
      name: "Senior Frontend Engineer",
    });

    expect(detailRegion.id).toBe(DISCOVERY_DETAIL_REGION_ID);
    expect(detailHeading.id).toBe(DISCOVERY_DETAIL_HEADING_ID);
    expect(detailHeading.getAttribute("tabindex")).toBe("-1");
    expect(detailHeading.className).toContain("focus-visible:ring");
    expect(detailRegion.contains(detailHeading)).toBe(true);
    expect(primaryActionRegion.className).toContain("shrink-0");
    expect(detailScrollArea.className).toContain("overflow-y-auto");
    expect(
      detailScrollArea.getAttribute("data-locked-pane-scroll-region"),
    ).not.toBeNull();
    expect(
      primaryActionRegion.compareDocumentPosition(detailScrollArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const persistentShortlistAction = getByRole("button", {
      name: "Shortlist Senior Frontend Engineer",
    });
    expect(primaryActionRegion.contains(persistentShortlistAction)).toBe(true);
    expect(persistentShortlistAction.getAttribute("aria-describedby")).toBe(
      DISCOVERY_DETAIL_HEADING_ID,
    );
    fireEvent.click(persistentShortlistAction);
    expect(onQueueJob).toHaveBeenCalledWith(selectedJob.id);
    expect(actionRegion.className).not.toContain("grid-cols-3");
    expect(actionRegion.className).not.toContain("absolute");
    expect(actionRegion.previousElementSibling?.className).toContain("pb-5");
    expect(actionRegion.previousElementSibling?.contains(fitBreakdown)).toBe(
      true,
    );
    const assessmentCard = getByText("Overall assessment").closest("div");
    const assessmentGrid = assessmentCard?.parentElement;

    expect(window.innerWidth).toBe(1024);
    expect(assessmentGrid?.className).toContain("sm:grid-cols-2");
    expect(assessmentCard?.className).toContain("sm:col-span-2");
    expect(assessmentCard?.className).toContain("min-w-0");
    const recommendationBadge = getByText("Review before applying");

    expect(assessmentCard?.contains(recommendationBadge)).toBe(true);
    expect(recommendationBadge.className).toContain("max-w-full");
    expect(recommendationBadge.className).toContain("inline-block");
    expect(recommendationBadge.className).toContain("w-auto");
    expect(recommendationBadge.className).toContain("min-w-0");
    expect(recommendationBadge.className).toContain("whitespace-normal");
    expect(recommendationBadge.className).toContain("break-words");
    expect(recommendationBadge.className).toContain("[overflow-wrap:anywhere]");
    expect(recommendationBadge.className).toContain("shrink");
    expect(recommendationBadge.className).not.toMatch(
      /(?:^|\s)whitespace-nowrap(?:\s|$)/u,
    );
    expect(recommendationBadge.className).not.toMatch(
      /(?:^|\s)shrink-0(?:\s|$)/u,
    );

    expect(getByText("Overall assessment")).toBeTruthy();
    expect(getByLabelText("Overall fit: 82 percent")).toBeTruthy();
    expect(getByText("Review before applying")).toBeTruthy();
    expect(getByText("Duplicate role reason")).toBeTruthy();
    expect(getByText("Duplicate role gap")).toBeTruthy();
    expect(getByRole("button", { name: "Shortlist job" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Not interested" }));
    expect(
      getByText(
        "Optional feedback stays local. It hides this result but never changes job facts or fit scoring.",
      ),
    ).toBeTruthy();
    const locationReason = getByRole("button", { name: "Location" });
    fireEvent.click(locationReason);
    expect(locationReason.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByRole("button", { name: "Hide with feedback" }));
    expect(onDismissJob).toHaveBeenCalledWith(selectedJob.id, ["location"]);
    expect(
      getByRole("button", { name: "Copy original listing link" }),
    ).toBeTruthy();
    expect(getByRole("status")).toBeTruthy();
  });

  it("returns the independent detail scroller to the top only when the selected job changes", () => {
    const firstJob = {
      id: "job_first",
      title: "First role",
      company: "Example Co",
      location: "Remote",
      status: "discovered",
      canonicalUrl: "https://example.test/jobs/first",
      matchAssessment: { score: 82, reasons: [], gaps: [] },
      workMode: ["remote"],
      sourceIntelligence: null,
      normalizedCompensation: null,
      description: "First description",
      descriptionFormat: "text",
      keySkills: [],
      keywordSignals: [],
      provenance: [],
      screeningHints: {
        relocationText: null,
        remoteGeographies: [],
        requiresSecurityClearance: null,
        sponsorshipText: null,
        travelText: null,
      },
      sourceTargetId: null,
    } as unknown as SavedJob;
    const renderPanel = (selectedJob: SavedJob) => (
      <DiscoveryDetailPanel
        discoveryTargets={[]}
        isJobPending={() => false}
        onDismissJob={vi.fn()}
        onQueueJob={vi.fn()}
        selectedJob={selectedJob}
      />
    );
    const { getByTestId, rerender } = render(renderPanel(firstJob));
    const scrollArea = getByTestId("discovery-detail-scroll-area");

    scrollArea.scrollTop = 2236;
    rerender(renderPanel({ ...firstJob, title: "First role refreshed" }));
    expect(scrollArea.scrollTop).toBe(2236);

    rerender(
      renderPanel({
        ...firstJob,
        id: "job_second",
        title: "Second role",
        canonicalUrl: "https://example.test/jobs/second",
      }),
    );
    expect(scrollArea.scrollTop).toBe(0);
  });
});
