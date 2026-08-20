// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  BrowserSessionState,
  ReviewQueueItem,
  SavedJob,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueMissionPanel } from "./review-queue-mission-panel";

afterEach(cleanup);

describe("ReviewQueueMissionPanel", () => {
  it("keeps the primary action above scrollable evidence at every layout size", () => {
    const onStartApplyCopilot = vi.fn();
    const onSetJobResumeApplicationMode = vi.fn();
    const selectedItem = {
      jobId: "job_circle",
      title: "Senior Full-Stack Software Engineer",
      company: "Circle",
      location: "Remote",
      matchScore: 90,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "original_resume",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "resume_ebrar",
      resumeReview: {
        status: "original_resume",
        sourceDocumentId: "resume_ebrar",
        fileName: "Ebrar.pdf",
        filePath: "/tmp/Ebrar.pdf",
      },
      updatedAt: "2026-07-16T10:00:00.000Z",
    } as ReviewQueueItem;
    const selectedJob = {
      id: "job_circle",
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Build applied AI products for a global remote team.",
      description: "Build applied AI products for a global remote team.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://circle.com/jobs/senior-full-stack",
      applicationUrl: "https://circle.com/jobs/senior-full-stack/apply",
      atsProvider: "Circle Careers",
      screeningHints: { requiresConsentInterrupt: false },
      applyPath: "easy_apply",
      easyApplyEligible: true,
      matchAssessment: {
        score: 90,
        reasons: ["Relevant full-stack experience"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: "Remote eligibility still needs confirmation.",
        requirements: [],
      },
    } as unknown as SavedJob;
    const browserSession = {
      source: "target_site",
      status: "ready",
      driver: "chrome_profile_agent",
      label: "Browser ready",
      detail: "Ready when needed.",
      lastCheckedAt: "2026-07-16T10:00:00.000Z",
    } as BrowserSessionState;

    render(
      <ReviewQueueMissionPanel
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        isApplyPending={false}
        isJobPending={() => false}
        isResumeStrategyPending={() => false}
        onClearQueueSelection={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        onOpenBrowserSession={vi.fn()}
        onOpenJobDetails={vi.fn()}
        onOpenProfile={vi.fn()}
        onRecommendResumeStrategy={vi.fn().mockResolvedValue(null)}
        onRemoveReviewJob={vi.fn()}
        onSelectResumeStrategy={vi.fn()}
        onSetJobResumeApplicationMode={onSetJobResumeApplicationMode}
        onStartApplyCopilot={onStartApplyCopilot}
        onStartAutoApplyQueue={vi.fn()}
        queue={[selectedItem]}
        queueSelection={[]}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Application readiness" }),
    ).toBeTruthy();
    expect(screen.getByText("Ebrar.pdf")).toBeTruthy();
    expect(screen.getByText("circle.com")).toBeTruthy();
    expect(screen.getByText("Checked on the live form")).toBeTruthy();
    expect(screen.getByText("Authorized for preparation")).toBeTruthy();
    expect(screen.getByText("Disabled for this run")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare application" })).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Prepare application to final review",
      }),
    ).toBeNull();

    const footer = screen.getByTestId("apply-copilot-footer");
    const heading = screen.getByRole("heading", {
      name: "Apply Copilot readiness",
    });
    const evidence = screen.getByRole("heading", {
      name: "Application readiness",
    }).parentElement?.parentElement;
    expect(heading.parentElement?.className).toContain("order-1");
    expect(footer.className).toContain("relative");
    expect(footer.className).toContain("order-2");
    expect(evidence?.parentElement?.className).toContain("order-3");
    expect(footer.className).not.toContain("xl:order-3");
    expect(footer.className).toContain("shrink-0");
    expect(footer.className).not.toContain("xl:absolute");

    fireEvent.click(
      screen.getByRole("button", { name: "Prepare application" }),
    );
    expect(onStartApplyCopilot).toHaveBeenCalledWith("job_circle");

    const originalResumeOption = screen.getByRole("radio", {
      name: "Original CV unchanged",
    });
    const tailoredResumeOption = screen.getByRole("radio", {
      name: "Tailor for this job",
    });
    expect(originalResumeOption.tagName).toBe("INPUT");
    expect(tailoredResumeOption.tagName).toBe("INPUT");
    expect(originalResumeOption.getAttribute("name")).toBe(
      tailoredResumeOption.getAttribute("name"),
    );
    expect((originalResumeOption as HTMLInputElement).checked).toBe(true);

    fireEvent.click(tailoredResumeOption);
    expect(onSetJobResumeApplicationMode).toHaveBeenCalledWith(
      "job_circle",
      "tailored_per_job",
    );
  });

  it("surfaces the selected queue action without hiding it inside More actions", () => {
    const onStartAutoApplyQueue = vi.fn();
    const selectedItem = {
      jobId: "job_primary",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      matchScore: 94,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "original_resume",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "resume_primary",
      resumeReview: {
        status: "original_resume",
        sourceDocumentId: "resume_primary",
        fileName: "Alex.pdf",
        filePath: "/tmp/Alex.pdf",
      },
      updatedAt: "2026-08-10T10:00:00.000Z",
    } as ReviewQueueItem;
    const secondItem = {
      ...selectedItem,
      jobId: "job_second",
      title: "Staff Product Designer",
      company: "Consent Labs",
      resumeAssetId: "resume_second",
      resumeReview: {
        ...selectedItem.resumeReview,
        sourceDocumentId: "resume_second",
      },
    } as ReviewQueueItem;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Design resilient workflow products.",
      description: "Design resilient workflow products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://signal.example/jobs/senior-product-designer",
      applicationUrl: "https://signal.example/jobs/senior-product-designer/apply",
      atsProvider: "Signal Careers",
      screeningHints: { requiresConsentInterrupt: false },
      applyPath: "easy_apply",
      easyApplyEligible: true,
      matchAssessment: {
        score: 94,
        reasons: ["Relevant product design experience"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: "Review the live form before continuing.",
        requirements: [],
      },
    } as unknown as SavedJob;
    const browserSession = {
      source: "target_site",
      status: "ready",
      driver: "chrome_profile_agent",
      label: "Browser ready",
      detail: "Ready when needed.",
      lastCheckedAt: "2026-08-10T10:00:00.000Z",
    } as BrowserSessionState;

    render(
      <ReviewQueueMissionPanel
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        isApplyPending={false}
        isJobPending={() => false}
        isResumeStrategyPending={() => false}
        onClearQueueSelection={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn()}
        onOpenBrowserSession={vi.fn()}
        onOpenJobDetails={vi.fn()}
        onOpenProfile={vi.fn()}
        onRecommendResumeStrategy={vi.fn().mockResolvedValue(null)}
        onRemoveReviewJob={vi.fn()}
        onSelectResumeStrategy={vi.fn()}
        onSetJobResumeApplicationMode={vi.fn()}
        onStartApplyCopilot={vi.fn()}
        onStartAutoApplyQueue={onStartAutoApplyQueue}
        queue={[selectedItem, secondItem]}
        queueSelection={[selectedItem.jobId, secondItem.jobId]}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    const batchAction = screen.getByRole("button", {
      name: "Stage queue for 2 jobs",
    });
    expect(batchAction.closest("details")).toBeNull();
    expect(batchAction.closest('[data-testid="apply-copilot-footer"]')).toBe(
      screen.getByTestId("apply-copilot-footer"),
    );
    expect(
      screen.getAllByRole("button", { name: "Stage queue for 2 jobs" }),
    ).toHaveLength(1);

    fireEvent.click(batchAction);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith([
      "job_primary",
      "job_second",
    ]);
  });
});
