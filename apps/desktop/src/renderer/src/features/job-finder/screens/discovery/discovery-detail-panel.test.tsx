// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MatchAssessmentChangeAuditSchema,
  type ListingActivity,
  type SavedJob,
} from "@unemployed/contracts";
import {
  DISCOVERY_DETAIL_HEADING_ID,
  DISCOVERY_DETAIL_REGION_ID,
} from "./discovery-accessibility";
import { JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES } from "../../lib/job-finder-scroll-reveal";
import {
  DiscoveryDetailPanel,
  MatchAssessmentChangeDisclosure,
  SourceDiagnostics,
} from "./discovery-detail-panel";

const baseSelectedJob = {
  id: "job_base",
  title: "Base role",
  company: "Example Co",
  location: "Remote",
  status: "discovered",
  canonicalUrl: "https://example.test/jobs/base",
  matchAssessment: { score: 82, reasons: [], gaps: [] },
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createSelectedJob(
  overrides: Partial<SavedJob> &
    Pick<SavedJob, "id"> & { listingActivity?: ListingActivity },
): SavedJob {
  return { ...baseSelectedJob, ...overrides };
}

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
    const { getAllByRole, getByLabelText, getByRole, getByTestId, getByText } =
      render(
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
    // Both stacked reveal anchors carry the shared responsive scroll-margin
    // trio so native reveals clear the shell header at every breakpoint.
    for (const revealAnchor of [detailRegion, detailHeading]) {
      expect(revealAnchor.className).toContain(
        JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES.base,
      );
      expect(revealAnchor.className).toContain(
        JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES.fixedHeader,
      );
      expect(revealAnchor.className).toContain(
        JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES.wideFixedHeader,
      );
    }
    expect(getByRole("group", { name: "Selected job summary" })).toBe(
      primaryActionRegion,
    );
    expect(primaryActionRegion.className).toContain("shrink-0");
    expect(detailScrollArea.className).toContain("overflow-y-auto");
    expect(detailScrollArea).toBe(
      getByRole("region", { name: "Job detail content" }),
    );
    expect(detailScrollArea.getAttribute("tabindex")).toBe("0");
    expect(
      detailScrollArea.getAttribute("data-locked-pane-scroll-region"),
    ).not.toBeNull();
    expect(
      primaryActionRegion.compareDocumentPosition(detailScrollArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(getAllByRole("button", { name: "Shortlist job" })).toHaveLength(1);
    const shortlistAction = getByRole("button", { name: "Shortlist job" });
    expect(actionRegion.contains(shortlistAction)).toBe(true);
    expect(within(primaryActionRegion).queryByRole("button")).toBeNull();
    expect(shortlistAction.getAttribute("aria-describedby")).toBe(
      DISCOVERY_DETAIL_HEADING_ID,
    );
    fireEvent.click(shortlistAction);
    expect(onQueueJob).toHaveBeenCalledTimes(1);
    expect(onQueueJob).toHaveBeenCalledWith(selectedJob.id);
    expect(detailScrollArea.contains(actionRegion)).toBe(false);
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
    fireEvent.click(getByRole("button", { name: "Not interested" }));
    expect(
      getByText(
        "Optional feedback stays local. It hides this result but never changes job facts or fit scoring.",
      ),
    ).toBeTruthy();
    const locationReason = getByRole("button", { name: "Location" });
    fireEvent.click(locationReason);
    expect(locationReason.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(getByRole("button", { name: "Hide this job only" }));
    expect(onDismissJob).toHaveBeenCalledWith(
      selectedJob.id,
      ["location"],
      "hide_job",
      null,
    );
    expect(
      getByRole("button", { name: "Copy original listing link" }),
    ).toBeTruthy();
    expect(getByRole("status")).toBeTruthy();
  });

  it("offers exact employer exclusion after Company feedback without disabling job-only", async () => {
    const onDismissJob = vi.fn();
    const onPreviewEmployerExclusion = vi.fn(() =>
      Promise.resolve({
        status: "available" as const,
        jobId: "job_employer",
        displayCompanyName: "Example Co",
        normalizedCompanyName: "example co",
        employerDomain: "example.test",
      }),
    );
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={onDismissJob}
          onPreviewEmployerExclusion={onPreviewEmployerExclusion}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_employer",
            employerDomain: "example.test",
          })}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));
    expect(onPreviewEmployerExclusion).toHaveBeenCalledWith("job_employer");
    const reusable = await screen.findByRole("radio", {
      name: "Hide and exclude employer",
    });
    expect(reusable.hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByText(/exact normalized company name “example co”/iu),
    ).toBeTruthy();
    expect(
      screen.getByText(/Domain evidence only: example.test/iu),
    ).toBeTruthy();
    fireEvent.click(reusable);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide and exclude employer" }),
    );
    expect(onDismissJob).toHaveBeenCalledWith(
      "job_employer",
      ["company"],
      "hide_and_exclude_employer",
      "example co",
    );
  });

  it("keeps job-only usable when reusable employer exclusion is unavailable", async () => {
    const onDismissJob = vi.fn();
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={onDismissJob}
          onPreviewEmployerExclusion={() =>
            Promise.resolve({
              status: "unavailable",
              jobId: "job_unsafe_employer",
              reason: "provider_domain_only",
              employerDomain: "provider.test",
            })
          }
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({ id: "job_unsafe_employer" })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));

    expect(
      await screen.findByText(/You can still hide only this job/iu),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("radio", { name: "Hide and exclude employer" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hide this job only" }));
    expect(onDismissJob).toHaveBeenCalledWith(
      "job_unsafe_employer",
      ["company"],
      "hide_job",
      null,
    );
  });

  it("ignores an out-of-order employer preview after the selected job changes", async () => {
    const firstPreview = deferred<{
      status: "available";
      jobId: string;
      displayCompanyName: string;
      normalizedCompanyName: string;
      employerDomain: string | null;
    }>();
    const secondPreview = deferred<{
      status: "available";
      jobId: string;
      displayCompanyName: string;
      normalizedCompanyName: string;
      employerDomain: string | null;
    }>();
    const onPreviewEmployerExclusion = vi.fn((jobId: string) =>
      jobId === "job_first_preview"
        ? firstPreview.promise
        : secondPreview.promise,
    );
    const onDismissJob = vi.fn();
    const renderPanel = (selectedJob: SavedJob) => (
      <DiscoveryDetailPanel
        discoveryTargets={[]}
        isJobPending={() => false}
        onDismissJob={onDismissJob}
        onPreviewEmployerExclusion={onPreviewEmployerExclusion}
        onQueueJob={vi.fn()}
        selectedJob={selectedJob}
      />
    );
    const { rerender } = render(
      renderPanel(createSelectedJob({ id: "job_first_preview" })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));

    rerender(renderPanel(createSelectedJob({ id: "job_second_preview" })));
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));

    await act(async () => {
      secondPreview.resolve({
        status: "available",
        jobId: "job_second_preview",
        displayCompanyName: "Second Co",
        normalizedCompanyName: "second co",
        employerDomain: null,
      });
      await secondPreview.promise;
    });
    expect(
      screen.getByText(/exact normalized company name “second co”/iu),
    ).toBeTruthy();

    await act(async () => {
      firstPreview.resolve({
        status: "available",
        jobId: "job_first_preview",
        displayCompanyName: "First Co",
        normalizedCompanyName: "first co",
        employerDomain: null,
      });
      await firstPreview.promise;
    });
    expect(screen.queryByText(/first co/iu)).toBeNull();
    expect(
      screen
        .getByRole("radio", { name: "Hide and exclude employer" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("radio", { name: "Hide and exclude employer" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Hide and exclude employer" }),
    );
    expect(onDismissJob).toHaveBeenCalledWith(
      "job_second_preview",
      ["company"],
      "hide_and_exclude_employer",
      "second co",
    );
  });

  it("invalidates a pending employer preview when feedback closes or the panel unmounts", async () => {
    type AvailablePreview = {
      status: "available";
      jobId: string;
      displayCompanyName: string;
      normalizedCompanyName: string;
      employerDomain: string | null;
    };
    const closedPreview = deferred<AvailablePreview>();
    const unmountedPreview = deferred<AvailablePreview>();
    const onPreviewEmployerExclusion = vi
      .fn()
      .mockReturnValueOnce(closedPreview.promise)
      .mockReturnValueOnce(unmountedPreview.promise);
    const { unmount } = render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onPreviewEmployerExclusion={onPreviewEmployerExclusion}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({ id: "job_closed_preview" })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));

    await act(async () => {
      closedPreview.resolve({
        status: "available",
        jobId: "job_closed_preview",
        displayCompanyName: "Closed Co",
        normalizedCompanyName: "closed co",
        employerDomain: null,
      });
      await closedPreview.promise;
    });
    expect(screen.queryByText(/closed co/iu)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Company" }));
    unmount();
    await act(async () => {
      unmountedPreview.resolve({
        status: "available",
        jobId: "job_closed_preview",
        displayCompanyName: "Unmounted Co",
        normalizedCompanyName: "unmounted co",
        employerDomain: null,
      });
      await unmountedPreview.promise;
    });
  });

  it("retains feedback and exact preview when dismissal fails", async () => {
    const onDismissJob = vi.fn(() => Promise.reject(new Error("failed")));
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={onDismissJob}
          onPreviewEmployerExclusion={() =>
            Promise.resolve({
              status: "available",
              jobId: "job_failed_dismiss",
              displayCompanyName: "Example Co",
              normalizedCompanyName: "example co",
              employerDomain: null,
            })
          }
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({ id: "job_failed_dismiss" })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Company" }));
    const exclusionRadio = await screen.findByRole("radio", {
      name: "Hide and exclude employer",
    });
    await waitFor(() =>
      expect(exclusionRadio.hasAttribute("disabled")).toBe(false),
    );
    fireEvent.click(exclusionRadio);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide and exclude employer" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Your choices were kept. Try again.",
    );
    expect(
      screen
        .getByRole("button", { name: "Company" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByText(/exact normalized company name “example co”/iu),
    ).toBeTruthy();
    expect((exclusionRadio as HTMLInputElement).checked).toBe(true);
  });

  it("blocks duplicate pending dismissals and closes feedback only after success", async () => {
    const dismissal = deferred<void>();
    const onDismissJob = vi.fn(() => dismissal.promise);
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={onDismissJob}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({ id: "job_pending_dismiss" })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    const submit = screen.getByRole("button", { name: "Hide this job only" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onDismissJob).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Hiding job…" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
    ).toBe(true);

    await act(async () => {
      dismissal.resolve();
      await dismissal.promise;
    });
    expect(screen.getByRole("button", { name: "Not interested" })).toBeTruthy();
    expect(onDismissJob).toHaveBeenCalledTimes(1);
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

  it("offers a single forward continuation for an already-shortlisted job", () => {
    const selectedJob = createSelectedJob({
      id: "job_shortlisted",
      title: "Senior Frontend Engineer",
      status: "shortlisted",
    });
    const onQueueJob = vi.fn();

    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={onQueueJob}
          selectedJob={selectedJob}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Shortlist job" })).toBeNull();
    expect(screen.queryByText("Already shortlisted")).toBeNull();
    expect(screen.getByText("Shortlisted")).toBeTruthy();
    const openLink = screen.getByRole("link", { name: "Open in Shortlisted" });
    expect(
      screen.getByTestId("discovery-detail-actions").contains(openLink),
    ).toBe(true);
    expect(openLink.getAttribute("href")).toBe(
      "/job-finder/review-queue?jobId=job_shortlisted",
    );
    expect(openLink.getAttribute("aria-describedby")).toBe(
      DISCOVERY_DETAIL_HEADING_ID,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    expect(
      screen.getByText(
        "Optional feedback stays local. It hides this result but never changes job facts or fit scoring.",
      ),
    ).toBeTruthy();
  });

  it("renders an application route URL identical to the canonical listing only once", () => {
    const sharedUrl = "https://example.test/jobs/shared";

    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_dedupe",
            title: "Dedupe role",
            applicationUrl: sharedUrl,
            canonicalUrl: sharedUrl,
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(sharedUrl)).toHaveLength(1);
    expect(screen.queryByText("Application route")).toBeNull();
    expect(screen.getByText("Original listing")).toBeTruthy();
  });

  it("keeps distinct application route and original listing URLs visible", () => {
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_split",
            title: "Split route role",
            applicationUrl: "https://apply.example.test/jobs/split",
            canonicalUrl: "https://example.test/jobs/split",
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Application route")).toBeTruthy();
    expect(screen.getByText("Original listing")).toBeTruthy();
    expect(
      screen.getByText("https://apply.example.test/jobs/split"),
    ).toBeTruthy();
    expect(screen.getByText("https://example.test/jobs/split")).toBeTruthy();
  });

  it("shows active and unknown availability neutrally without blocking shortlist", () => {
    const { unmount } = render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_active",
            listingActivity: {
              status: "active",
              observedAt: "2026-08-23T10:00:00.000Z",
              evidence: "last_seen_at",
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Last seen on source 23 Aug 2026.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Shortlist job" })
        .hasAttribute("disabled"),
    ).toBe(false);
    unmount();

    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_unknown",
            listingActivity: { status: "unknown" },
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Listing availability is unknown.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Shortlist job" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it.each([
    {
      activity: {
        status: "inactive",
        observedAt: "2026-08-22T10:00:00.000Z",
        ledgerEntryId: "ledger_1",
        provenance: "discovery_ledger",
        explanation: "The complete refresh did not return this job.",
      } satisfies ListingActivity,
      wording:
        "Not found in latest full source refresh on 22 Aug 2026. This does not prove the listing is closed.",
    },
    {
      activity: {
        status: "stale",
        observedAt: "2026-08-21T10:00:00.000Z",
        signalId: "signal_stale",
        provenance: "browser",
        explanation: "The apply control was unavailable.",
        detail: "A long source warning remains fully readable.",
        confidence: 0.8,
      } satisfies ListingActivity,
      wording:
        "This listing may be stale based on browser evidence observed on 21 Aug 2026.",
    },
  ])(
    "requires source verification before shortlisting a $activity.status listing",
    ({ activity, wording }) => {
      const onQueueJob = vi.fn();
      render(
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={onQueueJob}
          selectedJob={createSelectedJob({
            id: `job_${activity.status}`,
            listingActivity: activity,
          })}
        />,
      );

      expect(
        screen.getByText((content) => content.includes(wording)),
      ).toBeTruthy();
      expect(
        screen.getByText(/Verify availability on the original source/iu),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Shortlist anyway" }));
      expect(onQueueJob).toHaveBeenCalledWith(`job_${activity.status}`);
    },
  );

  it("disables shortlist for a reported-closed listing while retaining its source link and provenance", () => {
    const canonicalUrl = "https://example.test/jobs/reported-closed";
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_closed",
            canonicalUrl,
            listingActivity: {
              status: "closed",
              observedAt: "2026-08-20T10:00:00.000Z",
              signalId: "signal_closed",
              provenance: "provider",
              explanation: "The provider reported that applications ended.",
              detail: null,
              confidence: 1,
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        /Reported closed from provider evidence observed on 20 Aug 2026/iu,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Reported closed" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(canonicalUrl)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Copy original listing link" }),
    ).toBeTruthy();
  });

  it("moves source chronology behind a closed source timeline disclosure", () => {
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_timeline",
            title: "Timeline role",
            firstSeenAt: "2026-08-01T00:00:00.000Z",
            lastVerifiedActiveAt: "2026-08-20T00:00:00.000Z",
          })}
        />
      </MemoryRouter>,
    );

    const disclosure = screen
      .getByText("Source timeline")
      .closest("details") as HTMLDetailsElement;
    expect(disclosure).toBeTruthy();
    expect(disclosure.open).toBe(false);
    expect(disclosure.textContent).toContain("First seen");
    expect(disclosure.textContent).toContain("Last seen");
    expect(disclosure.textContent).toContain("Last verified active");
    expect(disclosure.textContent).toContain("01 Aug 2026");
    expect(disclosure.textContent).toContain("20 Aug 2026");
  });

  it("omits the source timeline disclosure when chronology is unknown", () => {
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_no_timeline",
            title: "No timeline role",
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Source timeline")).toBeNull();
  });

  it("keeps removed and multiple source provenance informative without exposing query URLs", () => {
    render(
      <MemoryRouter>
        <DiscoveryDetailPanel
          discoveryTargets={[]}
          isJobPending={() => false}
          onDismissJob={vi.fn()}
          onQueueJob={vi.fn()}
          selectedJob={createSelectedJob({
            id: "job_removed_sources",
            provenance: [
              {
                targetId: "removed_zeta",
                adapterKind: "auto",
                resolvedAdapterKind: "target_site",
                startingUrl: "https://www.zeta.example.test/jobs?q=private",
                discoveredAt: "2026-08-22T10:00:00.000Z",
                collectionMethod: "listing_route",
                providerKey: null,
                providerBoardToken: null,
                titleTriageOutcome: "pass",
              },
              {
                targetId: "removed_alpha",
                adapterKind: "auto",
                resolvedAdapterKind: null,
                startingUrl: "malformed source URL",
                discoveredAt: "2026-08-23T10:00:00.000Z",
                collectionMethod: "fallback_search",
                providerKey: null,
                providerBoardToken: null,
                titleTriageOutcome: "pass",
              },
            ],
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("zeta.example.test")).toBeTruthy();
    expect(screen.getByText("Auto · Fallback search")).toBeTruthy();
    expect(screen.queryByText(/private/iu)).toBeNull();
    expect(screen.queryByText("Saved source")).toBeNull();
  });
});
