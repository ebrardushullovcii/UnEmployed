// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type {
  BrowserSessionState,
  ReviewQueueItem,
  SavedJob,
} from "@unemployed/contracts";
import {
  ApplicationRecordSchema,
  TailoredAssetSchema,
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
        applicationRecords={[
          ApplicationRecordSchema.parse({
            id: "application_circle_first",
            jobId: "job_circle",
            title: selectedItem.title,
            company: selectedItem.company,
            status: "ready_for_review",
            lastActionLabel: "First application",
            nextActionLabel: "Prepare",
            lastUpdatedAt: "2026-07-16T09:00:00.000Z",
          }),
          ApplicationRecordSchema.parse({
            id: "application_circle_second",
            jobId: "job_circle",
            title: selectedItem.title,
            company: selectedItem.company,
            status: "approved",
            lastActionLabel: "Second application",
            nextActionLabel: "Prepare",
            lastUpdatedAt: "2026-07-16T09:30:00.000Z",
          }),
        ]}
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        globalDailyApplicationPreparationCapacity={{
          limit: 20,
          used: 0,
          legacyUncertain: 0,
          remaining: 20,
          localDate: "2026-07-16",
          resetsAt: "2026-07-17T00:00:00.000Z",
        }}
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
        originalResume={{
          id: "resume_ebrar",
          fileName: "Ebrar.pdf",
          uploadedAt: "2026-07-16T09:00:00.000Z",
          storagePath: "/tmp/Ebrar.pdf",
          textContent: null,
          textUpdatedAt: null,
          extractionStatus: "ready",
          lastAnalyzedAt: null,
          analysisProviderKind: null,
          analysisProviderLabel: null,
          analysisWarnings: [],
        }}
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
    expect(screen.getByText(/Original file: Ebrar.pdf/)).toBeTruthy();
    expect(
      screen.getByText(/sensitive contact or personal details/),
    ).toBeTruthy();
    expect(screen.getByText("circle.com")).toBeTruthy();
    expect(screen.getByText("Checked on the live form")).toBeTruthy();
    expect(screen.getByText("Authorized for preparation")).toBeTruthy();
    expect(screen.getByText("Disabled for this run")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Prepare application" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/0 exact begun of 20 \/ 20 remaining/),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", {
        name: /senior full-stack software engineer at circle · ready for review/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Start new application" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Prepare application to final review",
      }),
    ).toBeNull();

    const footer = screen.getByTestId("apply-copilot-footer");
    expect(within(footer).getAllByRole("button")).toHaveLength(1);
    expect(
      within(footer).queryByRole("button", {
        name: /queue selected applications/i,
      }),
    ).toBeNull();
    const heading = screen.getByRole("heading", {
      name: "Preparation readiness",
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

    const prepareButton = screen.getByRole("button", {
      name: "Prepare application",
    });
    expect((prepareButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("radio", {
        name: /senior full-stack software engineer at circle · approved/i,
      }),
    );
    fireEvent.click(prepareButton);
    expect(onStartApplyCopilot).toHaveBeenCalledWith({
      jobId: "job_circle",
      applicationRecordId: "application_circle_second",
    });
    fireEvent.click(
      screen.getByRole("radio", { name: "Start new application" }),
    );
    fireEvent.click(prepareButton);
    expect(onStartApplyCopilot).toHaveBeenLastCalledWith({
      jobId: "job_circle",
      startNewApplication: true,
    });

    const originalResumeOption = screen.getByRole("radio", {
      name: "Original resume unchanged",
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

  it("queues the selected applications with the unchanged batch callback", () => {
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
      applicationUrl:
        "https://signal.example/jobs/senior-product-designer/apply",
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
        applicationRecords={[]}
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        globalDailyApplicationPreparationCapacity={{
          limit: 20,
          used: 7,
          legacyUncertain: 2,
          remaining: 11,
          localDate: "2026-08-10",
          resetsAt: "2026-08-11T00:00:00.000Z",
        }}
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
      name: "Queue selected applications (2)",
    });
    expect(batchAction.closest("details")).toBeNull();
    expect(batchAction.closest('[data-testid="apply-copilot-footer"]')).toBe(
      screen.getByTestId("apply-copilot-footer"),
    );
    expect(
      screen.getAllByRole("button", {
        name: "Queue selected applications (2)",
      }),
    ).toHaveLength(1);

    fireEvent.click(batchAction);
    expect(onStartAutoApplyQueue).toHaveBeenCalledWith([
      "job_primary",
      "job_second",
    ]);
    expect(screen.getByText("2 of 10 selected for this run")).toBeTruthy();
    expect(
      screen.getByText(
        /7 exact begun \/ 2 older records may also have begun of 20 \/ 11 remaining/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Each employer-application run can include up to 10 jobs.",
      ),
    ).toBeTruthy();
  });

  it("never queues more than 10 unique employer-application jobs", () => {
    const onStartAutoApplyQueue = vi.fn();
    const readyItems = Array.from({ length: 11 }, (_, index) => {
      const jobId = `job_${String(index + 1).padStart(2, "0")}`;
      return {
        jobId,
        title: `Ready role ${index + 1}`,
        company: "Acme",
        location: "Remote",
        matchScore: 90,
        applicationStatus: "ready_for_review",
        resumeApplicationMode: "original_resume",
        assetStatus: "ready",
        progressPercent: 100,
        resumeAssetId: `resume_${jobId}`,
        resumeReview: {
          status: "original_resume",
          sourceDocumentId: `resume_${jobId}`,
          fileName: `${jobId}.pdf`,
          filePath: `/tmp/${jobId}.pdf`,
        },
        updatedAt: "2026-08-10T10:00:00.000Z",
      } as ReviewQueueItem;
    });
    const selectedItem = readyItems[0]!;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Build reliable products.",
      description: "Build reliable products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://acme.example/jobs/ready-role",
      applicationUrl: "https://acme.example/jobs/ready-role/apply",
      atsProvider: "Acme Careers",
      screeningHints: { requiresConsentInterrupt: false },
      applyPath: "easy_apply",
      easyApplyEligible: true,
      matchAssessment: {
        score: 90,
        reasons: ["Relevant experience"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: "Review before continuing.",
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
        applicationRecords={[]}
        actionMessage="Daily preparation limit reached (20 of 20)."
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        globalDailyApplicationPreparationCapacity={{
          limit: 20,
          used: 20,
          legacyUncertain: 0,
          remaining: 0,
          localDate: "2026-08-10",
          resetsAt: "2026-08-11T00:00:00.000Z",
        }}
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
        queue={readyItems}
        queueSelection={readyItems.map((item) => item.jobId)}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    expect(screen.getByText("10 of 10 selected for this run")).toBeTruthy();
    const limitNote = screen
      .getByText(/The selection limit is reached/)
      .closest('[role="note"]');
    expect(limitNote).not.toBeNull();
    expect(limitNote?.textContent).toMatch(
      /up to 10 jobs\. The selection limit is reached; deselect a job before choosing another\./,
    );
    const batchAction = screen.getByRole("button", {
      name: "Queue selected applications (10)",
    });
    expect(batchAction.getAttribute("aria-describedby")).toBe(limitNote?.id);
    expect(
      screen
        .getByText("Daily preparation limit reached (20 of 20).")
        .closest('[role="status"]'),
    ).not.toBeNull();

    expect((batchAction as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/available after local midnight/i)).toBeTruthy();
    fireEvent.click(batchAction);
    expect(onStartAutoApplyQueue).not.toHaveBeenCalled();
  });

  it("keeps secondary actions side by side to reduce footer height", () => {
    const selectedItem = {
      jobId: "job_tailored",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      matchScore: 94,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "tailored_per_job",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "resume_tailored",
      resumeReview: {
        status: "approved",
        sourceDocumentId: "resume_tailored",
        fileName: "Tailored.pdf",
        filePath: "/tmp/Tailored.pdf",
        approvedAt: "2026-08-10T10:00:00.000Z",
        approvedExportId: "export_tailored",
        approvedFormat: "pdf",
        approvedFilePath: "/tmp/Tailored.pdf",
      },
      updatedAt: "2026-08-10T10:00:00.000Z",
    } as ReviewQueueItem;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Design resilient workflow products.",
      description: "Design resilient workflow products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://signal.example/jobs/senior-product-designer",
      applicationUrl:
        "https://signal.example/jobs/senior-product-designer/apply",
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
    const selectedAsset = TailoredAssetSchema.parse({
      id: "resume_tailored",
      jobId: "job_tailored",
      kind: "resume",
      status: "ready",
      label: "Tailored PDF",
      version: "1",
      templateName: "Chronology Classic",
      compatibilityScore: 90,
      progressPercent: 100,
      updatedAt: "2026-08-10T10:00:00.000Z",
      storagePath: "/tmp/Tailored.pdf",
    });
    const browserSession = {
      source: "target_site",
      status: "blocked",
      driver: "chrome_profile_agent",
      label: "Browser blocked",
      detail: "The application browser needs attention.",
      lastCheckedAt: "2026-08-10T10:00:00.000Z",
    } as BrowserSessionState;

    render(
      <ReviewQueueMissionPanel
        applicationRecords={[]}
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
        onStartAutoApplyQueue={vi.fn()}
        queue={[selectedItem]}
        queueSelection={[]}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={selectedAsset}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    const footer = screen.getByTestId("apply-copilot-footer");
    expect(footer.className).toContain("py-3");
    expect(
      within(footer).getByText(
        "Daily safeguard: up to 20 begun employer applications per local day.",
      ),
    ).toBeTruthy();

    const recoveryButton = screen.getByRole("button", {
      name: "Fix browser connection",
    });
    const workspaceButton = screen.getByRole("button", {
      name: "Open resume workspace",
    });
    expect(recoveryButton.parentElement).toBe(workspaceButton.parentElement);
    expect(workspaceButton.parentElement?.className).toContain("flex-wrap");
    for (const button of [recoveryButton, workspaceButton]) {
      expect(button.className).toContain("flex-1");
      expect(button.className).not.toContain("w-full");
    }
  });

  it("keeps queue controls absent until jobs are selected for the batch", () => {
    const onRemoveReviewJob = vi.fn();
    const selectedItem = {
      jobId: "job_unselected",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      matchScore: 94,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "original_resume",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "resume_unselected",
      resumeReview: {
        status: "original_resume",
        sourceDocumentId: "resume_unselected",
        fileName: "Alex.pdf",
        filePath: "/tmp/Alex.pdf",
      },
      updatedAt: "2026-08-10T10:00:00.000Z",
    } as ReviewQueueItem;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Design resilient workflow products.",
      description: "Design resilient workflow products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://signal.example/jobs/senior-product-designer",
      applicationUrl:
        "https://signal.example/jobs/senior-product-designer/apply",
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
        applicationRecords={[]}
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        isApplyPending={false}
        isJobPending={() => false}
        isResumeStrategyPending={() => false}
        onClearQueueSelection={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn().mockResolvedValue(true)}
        onOpenBrowserSession={vi.fn()}
        onOpenJobDetails={vi.fn()}
        onOpenProfile={vi.fn()}
        onRecommendResumeStrategy={vi.fn().mockResolvedValue(null)}
        onRemoveReviewJob={onRemoveReviewJob}
        onSelectResumeStrategy={vi.fn()}
        onSetJobResumeApplicationMode={vi.fn()}
        onStartApplyCopilot={vi.fn()}
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

    fireEvent.click(screen.getByText("More actions"));

    const moreActions = screen.getByText("More actions").closest("details");
    expect(
      screen.queryByRole("button", { name: "Stage selected queue" }),
    ).toBeNull();
    expect(moreActions?.querySelector("button[disabled]")).toBeNull();
    expect(screen.queryByText("Batch actions")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /queue selected applications/i }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove from shortlisted" }),
    );
    expect(onRemoveReviewJob).toHaveBeenCalledWith("job_unselected");
  });

  it("does not surface batch staging when no shortlisted job is selected", () => {
    const selectedItem = {
      jobId: "job_not_ready",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      matchScore: 94,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "tailored_per_job",
      assetStatus: "not_started",
      progressPercent: 0,
      resumeAssetId: null,
      resumeReview: {
        status: "not_started",
        sourceDocumentId: null,
        fileName: null,
        filePath: null,
      },
      updatedAt: "2026-08-10T10:00:00.000Z",
    } as unknown as ReviewQueueItem;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Design resilient workflow products.",
      description: "Design resilient workflow products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://signal.example/jobs/senior-product-designer",
      applicationUrl:
        "https://signal.example/jobs/senior-product-designer/apply",
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
        applicationRecords={[]}
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        isApplyPending={false}
        isJobPending={() => false}
        isResumeStrategyPending={() => false}
        onClearQueueSelection={vi.fn()}
        onEditResumeWorkspace={vi.fn()}
        onGenerateResume={vi.fn().mockResolvedValue(true)}
        onOpenBrowserSession={vi.fn()}
        onOpenJobDetails={vi.fn()}
        onOpenProfile={vi.fn()}
        onRecommendResumeStrategy={vi.fn().mockResolvedValue(null)}
        onRemoveReviewJob={vi.fn()}
        onSelectResumeStrategy={vi.fn()}
        onSetJobResumeApplicationMode={vi.fn()}
        onStartApplyCopilot={vi.fn()}
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

    fireEvent.click(screen.getByText("More actions"));

    expect(
      screen.queryByRole("button", { name: "Stage selected queue" }),
    ).toBeNull();
    expect(screen.queryByText("Batch actions")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /queue selected applications/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Stage queue/ })).toBeNull();
  });

  it("keeps legacy internal operation names out of every user-facing label", () => {
    const selectedItem = {
      jobId: "job_vocab",
      title: "Senior Product Designer",
      company: "Signal Systems",
      location: "Remote",
      matchScore: 94,
      applicationStatus: "ready_for_review",
      resumeApplicationMode: "original_resume",
      assetStatus: "ready",
      progressPercent: 100,
      resumeAssetId: "resume_vocab",
      resumeReview: {
        status: "original_resume",
        sourceDocumentId: "resume_vocab",
        fileName: "Alex.pdf",
        filePath: "/tmp/Alex.pdf",
      },
      updatedAt: "2026-08-10T10:00:00.000Z",
    } as ReviewQueueItem;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Design resilient workflow products.",
      description: "Design resilient workflow products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://signal.example/jobs/senior-product-designer",
      applicationUrl:
        "https://signal.example/jobs/senior-product-designer/apply",
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
        applicationRecords={[]}
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
        onStartAutoApplyQueue={vi.fn()}
        queue={[selectedItem]}
        queueSelection={[selectedItem.jobId]}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    fireEvent.click(screen.getByText("More actions"));

    expect(document.body.textContent ?? "").toMatch(/Prepare application/);
    expect(document.body.textContent ?? "").not.toMatch(
      /apply copilot|restage|submit approval|ready to apply/i,
    );
  });

  it("uses a full-strength focus ring for the resume mode toggle (diluted primary fails 3:1)", () => {
    // Audit: full --primary and --ring both clear 3:1 (dark 4.09+ / light 4.64+),
    // but ring-primary/70 at 70% composites to ~2.76:1 on #29313a dark and
    // 2.86:1 on #c9cdd1 light — below the 3:1 floor. The toggle must use the
    // proven --ring token at full strength; non-focus borders stay diluted.
    const selectedItem = {
      jobId: "job_focus",
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
    } as unknown as ReviewQueueItem;
    const selectedJob = {
      id: "job_focus",
      title: selectedItem.title,
      company: selectedItem.company,
      summary: "Build applied AI products.",
      description: "Build applied AI products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://circle.com/jobs/senior-full-stack",
      applicationUrl: "https://circle.com/jobs/senior-full-stack/apply",
      atsProvider: "Circle Careers",
      screeningHints: { requiresConsentInterrupt: false },
      applyPath: "easy_apply",
      easyApplyEligible: true,
      matchAssessment: {
        score: 90,
        reasons: ["Relevant"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: "Remote eligibility still needs confirmation.",
        requirements: [],
      },
    } as unknown as SavedJob;

    const { container } = render(
      <ReviewQueueMissionPanel
        applicationRecords={[]}
        actionMessage={null}
        browserSession={
          {
            source: "target_site",
            status: "ready",
            driver: "chrome_profile_agent",
            label: "Browser ready",
            detail: "Ready when needed.",
            lastCheckedAt: "2026-07-16T10:00:00.000Z",
          } as BrowserSessionState
        }
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

    const toggleOption = container.querySelector(
      ".peer-focus-visible\\:ring-2",
    );
    // Fallback: query by the peer pair class directly from rendered toggle
    const peerRing = container.querySelector('[class*="peer-focus-visible:ring-ring"]');
    expect(peerRing).toBeTruthy();
    expect(peerRing?.className).toContain("peer-focus-visible:ring-2");
    expect(peerRing?.className).toContain("peer-focus-visible:ring-ring");
    expect(peerRing?.className).not.toMatch(/ring-primary\/\d/);
    // Non-focus decoration stays diluted by design.
    expect(container.innerHTML).toContain("border-primary/70");
    expect(container.innerHTML).toContain("hover:border-primary/35");
    expect(toggleOption ?? peerRing).toBeTruthy();
  });

  it("disables Queue with a control-associated capacity reason when the batch passes remaining daily slots", () => {
    const onStartAutoApplyQueue = vi.fn();
    const readyItems = Array.from({ length: 4 }, (_, index) => {
      const jobId = `job_partial_${index + 1}`;
      return {
        jobId,
        title: `Ready role ${index + 1}`,
        company: "Acme",
        location: "Remote",
        matchScore: 90,
        applicationStatus: "ready_for_review",
        resumeApplicationMode: "original_resume",
        assetStatus: "ready",
        progressPercent: 100,
        resumeAssetId: `resume_${jobId}`,
        resumeReview: {
          status: "original_resume",
          sourceDocumentId: `resume_${jobId}`,
          fileName: `${jobId}.pdf`,
          filePath: `/tmp/${jobId}.pdf`,
        },
        updatedAt: "2026-08-10T10:00:00.000Z",
      } as ReviewQueueItem;
    });
    const selectedItem = readyItems[0]!;
    const selectedJob = {
      id: selectedItem.jobId,
      title: selectedItem.title,
      company: "Acme",
      location: "Remote",
      summary: "Build reliable products.",
      description: "Build reliable products.",
      employerWebsiteUrl: null,
      canonicalUrl: "https://acme.example/jobs/ready-role",
      applicationUrl: "https://acme.example/jobs/ready-role/apply",
      atsProvider: "Acme Careers",
      screeningHints: { requiresConsentInterrupt: false },
      applyPath: "easy_apply",
      easyApplyEligible: true,
      matchAssessment: {
        score: 90,
        reasons: ["Relevant experience"],
        gaps: [],
        recommendation: "review_before_applying",
        recommendationRationale: "Review before continuing.",
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
        applicationRecords={[]}
        actionMessage={null}
        browserSession={browserSession}
        campaignId="campaign_1"
        displayedProgress={100}
        globalDailyApplicationPreparationCapacity={{
          limit: 20,
          used: 17,
          legacyUncertain: 0,
          remaining: 3,
          localDate: "2026-08-10",
          resetsAt: "2026-08-11T00:00:00.000Z",
        }}
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
        queue={readyItems}
        queueSelection={readyItems.map((item) => item.jobId)}
        resumeStrategies={[]}
        resumeStrategySelections={[]}
        selectedAsset={null}
        selectedItem={selectedItem}
        selectedJob={selectedJob}
      />,
    );

    // The control-associated reason names the selected count, the remaining
    // slots, and the local reset timing, and is described by the control.
    const exceedanceNote = screen.getByTestId(
      "daily-capacity-batch-exceeded-note",
    );
    expect(exceedanceNote.textContent).toContain(
      "You selected 4 jobs for this run",
    );
    expect(exceedanceNote.textContent).toContain(
      "only 3 of 20 daily application slots remain",
    );
    expect(exceedanceNote.textContent).toMatch(/local midnight \(/u);

    const batchAction = screen.getByRole("button", {
      name: "Queue selected applications (4)",
    });
    expect((batchAction as HTMLButtonElement).disabled).toBe(true);
    const describedBy = batchAction.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toContain(
      "employer-application-daily-capacity-limit",
    );
    expect(describedBy.split(" ")).toContain("employer-application-batch-limit");

    fireEvent.click(batchAction);
    expect(onStartAutoApplyQueue).not.toHaveBeenCalled();

    // A partial exceedance stays distinct from full exhaustion: the summary
    // keeps a reset time (no exhausted copy) and single-job start stays open.
    expect(screen.queryByText(/available after local midnight/iu)).toBeNull();
    expect(screen.getByText(/Resets at local midnight \(/u)).toBeTruthy();
    const prepareButton = screen.getByRole("button", {
      name: "Prepare application",
    });
    expect((prepareButton as HTMLButtonElement).disabled).toBe(false);
    // And it never borrows the per-run cap wording.
    expect(exceedanceNote.textContent).not.toContain("selection limit");
  });
});
