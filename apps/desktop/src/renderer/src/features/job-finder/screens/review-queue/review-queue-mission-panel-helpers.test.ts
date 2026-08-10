import type {
  BrowserSessionState,
  ReviewQueueItem,
  SavedJob,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import {
  buildMissionPanelState,
  getApplicationReadinessFacts,
  getApplySupportState,
} from "./review-queue-mission-panel-helpers";

const readyBrowser = {
  source: "target_site",
  status: "ready",
  driver: "chrome_profile_agent",
  label: "Browser ready",
  detail: "Ready when needed.",
  lastCheckedAt: "2026-07-30T10:00:00.000Z",
} as BrowserSessionState;

const originalResumeItem = {
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
  updatedAt: "2026-07-30T10:00:00.000Z",
} as ReviewQueueItem;

const baseJob = {
  id: "job_circle",
  title: originalResumeItem.title,
  company: originalResumeItem.company,
  summary: "Build applied AI products for a global remote team.",
  description: "Build applied AI products for a global remote team.",
  employerWebsiteUrl: null,
  canonicalUrl: "https://circle.com/jobs/senior-full-stack",
  applicationUrl:
    "https://circle.com/jobs/senior-full-stack/apply?candidate_token=secret#form",
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

describe("getApplicationReadinessFacts", () => {
  it("names the exact unchanged CV and redacts destination query data", () => {
    const facts = getApplicationReadinessFacts({
      browserSession: readyBrowser,
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });

    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "CV file",
        value: "Ebrar.pdf",
      }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Destination",
        value: "circle.com",
        detail:
          "https://circle.com/jobs/senior-full-stack/apply | Circle Careers",
      }),
    );
    expect(JSON.stringify(facts)).not.toContain("candidate_token");
    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Final submit",
        value: "Disabled for this run",
      }),
    );
  });

  it.each([
    ["signup", "Sign-up may be required"],
    ["existing_account_decision", "Account choice likely"],
    ["manual_verification", "Manual verification likely"],
  ] as const)("describes a %s handoff before browser launch", (kind, value) => {
    const facts = getApplicationReadinessFacts({
      browserSession: readyBrowser,
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: {
        ...baseJob,
        screeningHints: {
          requiresConsentInterrupt: true,
          requiresConsentInterruptKind: kind,
        },
      } as SavedJob,
    });

    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Sign-in or account",
        value,
      }),
    );
  });

  it("states when the current browser session needs user sign-in", () => {
    const facts = getApplicationReadinessFacts({
      browserSession: {
        ...readyBrowser,
        status: "login_required",
      },
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });

    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Sign-in or account",
        value: "Sign-in required now",
      }),
    );
  });
  it("allows an approved resume to start when the browser has not opened yet", () => {
    const state = buildMissionPanelState({
      browserSession: { ...readyBrowser, status: "unknown" },
      isApplyPending: false,
      isJobPending: () => false,
      queue: [originalResumeItem],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: { ...baseJob, applyPath: "unknown" } as SavedJob,
    });

    expect(state.canApproveApply).toBe(true);
    expect(state.primaryApplicationAction).toMatchObject({
      kind: "start_apply",
      label: "Prepare application",
      enabled: true,
      blocker: null,
    });
    expect(state.checklist).toContainEqual(
      expect.objectContaining({
        label: "Browser handoff",
        state: "attention",
      }),
    );
    expect(state.readinessDescription).toMatch(
      /open and check the destination/i,
    );
  });

  it("blocks only when a job has no usable application destination", () => {
    expect(
      getApplySupportState({
        ...baseJob,
        applicationUrl: null,
        canonicalUrl: "",
        applyPath: "unknown",
      } as SavedJob),
    ).toBe("incomplete");
    expect(
      getApplySupportState({ ...baseJob, applyPath: "unknown" } as SavedJob),
    ).toBe("manual_follow_up");
  });

  it("returns one plain recovery for each primary application blocker", () => {
    const missingOriginal = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: {
        ...originalResumeItem,
        assetStatus: "not_started",
        resumeAssetId: null,
        resumeReview: { status: "not_started" },
      },
      selectedJob: baseJob,
    });
    expect(missingOriginal.primaryApplicationAction).toMatchObject({
      kind: "blocked",
      label: "Prepare application",
      enabled: false,
      recovery: { kind: "open_profile", label: "Import original CV" },
    });

    const missingUrl = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [originalResumeItem],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: {
        ...baseJob,
        applicationUrl: null,
        canonicalUrl: "",
      } as SavedJob,
    });
    expect(missingUrl.primaryApplicationAction).toMatchObject({
      kind: "blocked",
      recovery: {
        kind: "open_job_details",
        label: "Review job details",
      },
    });

    const browserBlocked = buildMissionPanelState({
      browserSession: { ...readyBrowser, status: "blocked" },
      isApplyPending: false,
      isJobPending: () => false,
      queue: [originalResumeItem],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    expect(browserBlocked.primaryApplicationAction).toMatchObject({
      kind: "blocked",
      recovery: {
        kind: "open_browser",
        label: "Fix browser connection",
      },
    });
  });
});
