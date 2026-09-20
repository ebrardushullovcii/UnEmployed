import type {
  BrowserSessionState,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import { JOB_FINDER_BROWSER_NAME } from "../../lib/job-finder-browser-handoff-copy";
import {
  buildMissionPanelState,
  describeApplyOutcome,
  getApplySupportState,
  getPrimaryApplicationAction,
  stripInternalCodeParenthetical,
} from "./review-queue-mission-panel-helpers";

function createBrowserSession(
  status: BrowserSessionState["status"] = "ready",
): BrowserSessionState {
  return {
    source: "target_site",
    status,
    driver: "chrome_profile_agent",
    label: "Browser",
    detail: null,
    lastCheckedAt: "2026-08-20T00:00:00.000Z",
  } as BrowserSessionState;
}

function createJob(overrides: Partial<SavedJob> = {}): SavedJob {
  return {
    id: "job_1",
    title: "Product Designer",
    company: "Example Co",
    canonicalUrl: "https://jobs.example/role",
    applicationUrl: "https://jobs.example/apply",
    applyPath: "easy_apply",
    easyApplyEligible: true,
    matchAssessment: { score: 90, reasons: [], gaps: [] },
    ...overrides,
  } as unknown as SavedJob;
}

function createItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    jobId: "job_1",
    title: "Product Designer",
    company: "Example Co",
    location: "Remote",
    matchScore: 90,
    applicationStatus: "shortlisted",
    assetStatus: "not_started",
    progressPercent: null,
    resumeAssetId: null,
    resumeApplicationMode: "tailored_per_job",
    resumeTailoringMode: "balanced",
    resumeReview: { status: "not_started" },
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function createApprovedItem(): ReviewQueueItem {
  return createItem({
    assetStatus: "ready",
    resumeAssetId: "asset_1",
    resumeReview: {
      status: "approved",
      approvedAt: "2026-08-20T00:00:00.000Z",
      approvedExportId: "export_1",
      approvedFormat: "pdf",
      approvedFilePath: "/tmp/resume.pdf",
    },
  });
}

function createReadyAsset(): TailoredAsset {
  return {
    id: "asset_1",
    jobId: "job_1",
    kind: "resume",
    status: "ready",
    label: "Tailored Resume",
    version: "v1",
    templateName: "Chronology Classic",
    compatibilityScore: 80,
    progressPercent: 100,
    updatedAt: "2026-08-20T00:00:00.000Z",
    storagePath: "/tmp/resume.pdf",
    contentText: "Resume",
    previewSections: [],
    generationMethod: "ai",
    generationReason: null,
    notes: [],
    failureMessage: null,
    failedAt: null,
  } as unknown as TailoredAsset;
}

const baseActionInput = {
  applySupportState: "supported" as const,
  browserSession: createBrowserSession(),
  hasGenerationFailure: false,
  hasReadyApprovedAsset: true,
  isApplyPending: false,
  isGenerating: false,
  isSelectedJobPending: false,
  needsGeneration: false,
  resumeReviewStatus: "approved" as const,
  usesOriginalResume: false,
};

describe("getPrimaryApplicationAction", () => {
  it("walks one job through create, review, and apply in plain words", () => {
    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        hasReadyApprovedAsset: false,
        needsGeneration: true,
        resumeReviewStatus: "not_started",
      }),
    ).toMatchObject({ kind: "generate_resume", label: "Create the resume" });

    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        hasReadyApprovedAsset: false,
        isGenerating: true,
        resumeReviewStatus: "not_started",
      }),
    ).toMatchObject({ kind: "waiting", label: "Writing the resume…" });

    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        hasReadyApprovedAsset: false,
        resumeReviewStatus: "needs_review",
      }),
    ).toMatchObject({ kind: "approve_and_apply", label: "Apply" });

    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        draftNeedsPersonReview: true,
        hasReadyApprovedAsset: false,
        resumeReviewStatus: "needs_review",
      }),
    ).toMatchObject({ kind: "approve_resume", label: "Review the resume" });

    expect(getPrimaryApplicationAction(baseActionInput)).toMatchObject({
      enabled: true,
      kind: "start_apply",
      label: "Apply",
    });
  });

  it("offers a retry after a failed resume run", () => {
    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        hasGenerationFailure: true,
        hasReadyApprovedAsset: false,
        resumeReviewStatus: "not_started",
      }),
    ).toMatchObject({
      kind: "generate_resume",
      label: "Try again",
      blocker: "The last attempt to write this resume did not finish.",
    });
  });

  it("returns one plain recovery for each blocker", () => {
    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        hasReadyApprovedAsset: false,
        resumeReviewStatus: "not_started",
        usesOriginalResume: true,
      }),
    ).toMatchObject({
      kind: "blocked",
      recovery: { kind: "open_profile", label: "Import original resume" },
    });

    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        applySupportState: "incomplete",
      }),
    ).toMatchObject({
      kind: "blocked",
      recovery: { kind: "open_job_details", label: "Check the job details" },
    });

    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        browserSession: createBrowserSession("blocked"),
      }),
    ).toMatchObject({
      kind: "blocked",
      recovery: {
        kind: "open_browser",
        label: `Open ${JOB_FINDER_BROWSER_NAME}`,
      },
    });
  });

  it("replaces Apply with Open Safeguards while a safeguard holds, without internal codes", () => {
    const action = getPrimaryApplicationAction({
      ...baseActionInput,
      safeguardBlocker:
        "Automatic runs are paused after repeated failures (abnormal_failure_pause: automatic_discovery_failures:campaign_default).",
    });

    expect(action).toMatchObject({
      enabled: true,
      kind: "open_safeguards",
      label: "Open Safeguards",
    });
    expect(action.blocker).toBe(
      "Automatic runs are paused after repeated failures.",
    );
    expect(
      stripInternalCodeParenthetical("Paused (user requested pause)"),
    ).toBe("Paused (user requested pause)");
  });

  it("keeps saying the run is in flight for as long as the run record runs", () => {
    expect(
      getPrimaryApplicationAction({
        ...baseActionInput,
        runElapsedLabel: "3 min",
      }),
    ).toMatchObject({
      enabled: false,
      kind: "start_apply",
      label: "Filling in the form… (3 min)",
    });
    expect(
      getPrimaryApplicationAction({ ...baseActionInput, isApplyPending: true }),
    ).toMatchObject({ enabled: false, label: "Filling in the form…" });
  });
});

describe("describeApplyOutcome", () => {
  it("says what Apply does in the mode the person chose once in Settings", () => {
    expect(describeApplyOutcome("prepare_only", false)).toBe(
      "Job Finder opens the application, fills it in, attaches this resume, and leaves the browser open for you to send.",
    );
    expect(describeApplyOutcome("confirm_before_submit", true)).toContain(
      "attaches your original resume, then waits for your go-ahead before sending.",
    );
    expect(describeApplyOutcome("autonomous_submit", false)).toContain(
      "and sends it. It stops and asks you only when the site needs you.",
    );
  });

  it("never promises a send in the fill-in mode", () => {
    expect(describeApplyOutcome("prepare_only", false)).not.toMatch(
      /sends it|submits/i,
    );
  });
});

describe("buildMissionPanelState", () => {
  it("is quiet when the job is ready: no state line, Apply enabled", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession(),
      isApplyPending: false,
      isJobPending: () => false,
      selectedAsset: createReadyAsset(),
      selectedItem: createApprovedItem(),
      selectedJob: createJob(),
    });

    expect(state.primaryApplicationAction).toMatchObject({
      enabled: true,
      kind: "start_apply",
      label: "Apply",
    });
    expect(state.readinessDescription).toBeNull();
    expect(state.canApproveApply).toBe(true);
  });

  it("explains an Aggressive draft's review step instead of promising Apply", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession(),
      isApplyPending: false,
      isJobPending: () => false,
      selectedAsset: { ...createReadyAsset(), storagePath: null },
      selectedItem: createItem({
        assetStatus: "ready",
        resumeAssetId: "asset_1",
        resumeTailoringMode: "aggressive",
        resumeReview: { status: "needs_review" },
      }),
      selectedJob: createJob(),
    });

    expect(state.primaryApplicationAction).toMatchObject({
      kind: "approve_resume",
      label: "Review the resume",
    });
    expect(state.readinessDescription).toBe(
      "Aggressive resumes stretch a little past your saved evidence. Read it, keep or remove the flagged lines, then approve it.",
    );
  });

  it("makes Apply the approval for a Light or Tailored draft", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession(),
      isApplyPending: false,
      isJobPending: () => false,
      selectedAsset: { ...createReadyAsset(), storagePath: null },
      selectedItem: createItem({
        assetStatus: "ready",
        resumeAssetId: "asset_1",
        resumeReview: { status: "needs_review" },
      }),
      selectedJob: createJob(),
    });

    expect(state.primaryApplicationAction).toMatchObject({
      kind: "approve_and_apply",
      label: "Apply",
    });
    expect(state.readinessDescription).toBe(
      "The resume is ready. Apply approves it and starts the application.",
    );
  });

  it("explains a long-running resume request without treating it as failed", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession(),
      isApplyPending: false,
      isJobPending: () => true,
      isSelectedJobPendingTooLong: true,
      selectedAsset: null,
      selectedItem: createItem(),
      selectedJob: createJob(),
    });

    expect(state.isGenerating).toBe(true);
    expect(state.primaryApplicationAction.kind).toBe("waiting");
    expect(state.readinessDescription).toContain("taking longer than usual");
    expect(state.readinessDescription).not.toMatch(/failed/i);
  });

  it("says a safeguard is what is stopping the run", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession("unknown"),
      isApplyPending: false,
      isJobPending: () => false,
      safeguardBlocker: "Automatic runs are paused (abnormal_failure_pause: x).",
      selectedAsset: createReadyAsset(),
      selectedItem: createApprovedItem(),
      selectedJob: createJob(),
    });

    expect(state.primaryApplicationAction.kind).toBe("open_safeguards");
    expect(state.readinessDescription).toBe("Automatic runs are paused.");
  });

  it("keeps the start control counting while the run record runs", () => {
    const state = buildMissionPanelState({
      browserSession: createBrowserSession(),
      isApplyPending: false,
      isJobPending: () => false,
      selectedApplyResult: {
        startedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      },
      selectedAsset: createReadyAsset(),
      selectedItem: createApprovedItem(),
      selectedJob: createJob(),
    });

    expect(state.primaryApplicationAction.enabled).toBe(false);
    expect(state.primaryApplicationAction.label).toMatch(
      /^Filling in the form… \(/,
    );
  });
});

describe("getApplySupportState", () => {
  it("blocks only when a job has no usable application destination", () => {
    expect(getApplySupportState(null)).toBe("incomplete");
    expect(
      getApplySupportState(
        createJob({ applicationUrl: null, canonicalUrl: "  " } as never),
      ),
    ).toBe("incomplete");
    expect(getApplySupportState(createJob())).toBe("supported");
    expect(
      getApplySupportState(createJob({ applyPath: "external" } as never)),
    ).toBe("manual_follow_up");
  });
});
