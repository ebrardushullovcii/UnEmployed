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
  partitionApplicationReadinessFacts,
} from "./review-queue-mission-panel-helpers";

const BANNED_OPERATION_COPY = /apply copilot|restage|submit approval/i;

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
  it("names the exact unchanged resume and redacts destination query data", () => {
    const facts = getApplicationReadinessFacts({
      browserSession: readyBrowser,
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });

    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Resume file",
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
    const factsText = JSON.stringify(facts);
    expect(facts).toContainEqual(
      expect.objectContaining({
        label: "Final submit",
        value: "Disabled for this run",
      }),
    );
    expect(factsText).toMatch(/without clicking submit/);
    expect(factsText).toMatch(/the site controls its own behavior/i);
    expect(factsText).toMatch(/never performs a final-submit action/i);
    expect(factsText).not.toMatch(/No application was submitted/i);
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
      recovery: { kind: "open_profile", label: "Import original resume" },
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

  it("makes Review and approve the primary action when a tailored PDF is not approved", () => {
    const state = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [],
      queueSelection: [],
      selectedAsset: {
        id: "asset_tailored",
        jobId: "job_circle",
        kind: "resume",
        status: "ready",
        label: "Tailored resume",
        version: "1",
        templateName: "default",
        compatibilityScore: 80,
        progressPercent: 100,
        updatedAt: "2026-07-30T10:00:00.000Z",
        storagePath: "/tmp/tailored.pdf",
        contentText: null,
        previewSections: [],
        generationMethod: "deterministic",
        notes: [],
        failureMessage: null,
        failedAt: null,
      },
      selectedItem: {
        ...originalResumeItem,
        resumeApplicationMode: "tailored_per_job",
        assetStatus: "ready",
        resumeAssetId: "asset_tailored",
        resumeReview: { status: "needs_review" },
      },
      selectedJob: baseJob,
    });

    expect(state.primaryApplicationAction).toMatchObject({
      kind: "approve_resume",
      label: "Review and approve resume",
      enabled: true,
      recovery: null,
    });
    // One status sentence, one noun: the ordinary "not approved yet" state is
    // stated once by Current state, not repeated as a blocker box that calls
    // the same artifact a draft, a PDF, and a resume.
    expect(state.primaryApplicationAction.blocker).toBeNull();
    expect(state.readinessDescription).toBe(
      "This resume is ready for your review. Approving it unlocks Prepare application.",
    );
    const approvedPdfItem = state.checklist.find(
      (item) => item.label === "Approved tailored PDF ready",
    );
    expect(approvedPdfItem?.state).toBe("blocked");
    expect(approvedPdfItem?.description).toBe(
      "Approve this resume to unlock Prepare application.",
    );
  });

  it("explains a long-running tailored resume request without treating it as failed", () => {
    const state = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => true,
      isSelectedJobPendingTooLong: true,
      queue: [],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: {
        ...originalResumeItem,
        assetStatus: "not_started",
        resumeApplicationMode: "tailored_per_job",
        resumeAssetId: null,
        resumeReview: { status: "not_started" },
      },
      selectedJob: baseJob,
    });

    expect(state.primaryApplicationAction).toMatchObject({
      enabled: false,
      kind: "waiting",
      label: "Creating tailored resume…",
    });
    expect(state.readinessDescription).toMatch(/taking longer than expected/i);
    expect(state.readinessDescription).toMatch(/Reload workspace/i);
    expect(state.readinessDescription).not.toMatch(/failed|finished/i);
  });

  it("keeps the primary action label stable across every blocker and ready state", () => {
    const states = [
      { browserSession: readyBrowser, selectedItem: originalResumeItem },
      {
        browserSession: {
          ...readyBrowser,
          status: "blocked",
        } as BrowserSessionState,
        selectedItem: originalResumeItem,
      },
      {
        browserSession: readyBrowser,
        selectedItem: {
          ...originalResumeItem,
          assetStatus: "not_started",
          resumeAssetId: null,
          resumeReview: { status: "not_started" },
        },
      },
    ] as const;

    for (const state of states) {
      const missionState = buildMissionPanelState({
        browserSession: state.browserSession,
        isApplyPending: false,
        isJobPending: () => false,
        queue: [],
        queueSelection: [],
        selectedAsset: null,
        selectedItem: state.selectedItem,
        selectedJob: baseJob,
      });

      expect(missionState.primaryApplicationAction.label).toBe(
        "Prepare application",
      );
    }
  });

  it("describes batch selection with preparation vocabulary instead of staging jargon", () => {
    const emptyQueueState = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    expect(emptyQueueState.queueSummary).toMatch(/preparation run/);
    expect(emptyQueueState.queueSummary).not.toMatch(BANNED_OPERATION_COPY);
    expect(emptyQueueState.queueSummary).not.toMatch(/queue staging|stage/i);

    const selectedQueueState = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [originalResumeItem],
      queueSelection: [originalResumeItem.jobId],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    expect(selectedQueueState.queueSummary).toBe(
      "1 selected job will join one safe non-submitting preparation run.",
    );
  });

  it("marks approved-ready jobs as ready-to-prepare for compact mission UI", () => {
    const ready = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [originalResumeItem],
      queueSelection: [],
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    expect(ready.isReadyToPrepare).toBe(true);
    expect(ready.canApproveApply).toBe(true);
    expect(ready.nextBlockedChecklistItem).toBeNull();
    expect(ready.primaryApplicationAction).toMatchObject({
      kind: "start_apply",
      label: "Prepare application",
      enabled: true,
    });

    const needsApprove = buildMissionPanelState({
      browserSession: readyBrowser,
      isApplyPending: false,
      isJobPending: () => false,
      queue: [],
      queueSelection: [],
      selectedAsset: {
        id: "asset_tailored",
        jobId: "job_circle",
        kind: "resume",
        status: "ready",
        label: "Tailored resume",
        version: "1",
        templateName: "default",
        compatibilityScore: 80,
        progressPercent: 100,
        updatedAt: "2026-07-30T10:00:00.000Z",
        storagePath: "/tmp/tailored.pdf",
        contentText: null,
        previewSections: [],
        generationMethod: "deterministic",
        notes: [],
        failureMessage: null,
        failedAt: null,
      },
      selectedItem: {
        ...originalResumeItem,
        resumeApplicationMode: "tailored_per_job",
        assetStatus: "ready",
        resumeAssetId: "asset_tailored",
        resumeReview: { status: "needs_review" },
      },
      selectedJob: baseJob,
    });
    expect(needsApprove.isReadyToPrepare).toBe(false);
  });

  it.each(["ready", "unknown", "blocked", "login_required"] as const)(
    "keeps %s browser guidance free of legacy operation names",
    (status) => {
      const missionState = buildMissionPanelState({
        browserSession: { ...readyBrowser, status } as BrowserSessionState,
        isApplyPending: false,
        isJobPending: () => false,
        queue: [originalResumeItem],
        queueSelection: [],
        selectedAsset: null,
        selectedItem: originalResumeItem,
        selectedJob: baseJob,
      });

      for (const item of missionState.checklist) {
        expect(`${item.label} ${item.description}`).not.toMatch(
          BANNED_OPERATION_COPY,
        );
      }
      if (missionState.readinessDescription) {
        expect(missionState.readinessDescription).not.toMatch(
          BANNED_OPERATION_COPY,
        );
      }
      for (const fact of missionState.readinessFacts) {
        expect(`${fact.value} ${fact.detail}`).not.toMatch(
          BANNED_OPERATION_COPY,
        );
      }
    },
  );

  it("never claims a run submitted anything in readiness or safety copy", () => {
    const facts = getApplicationReadinessFacts({
      browserSession: readyBrowser,
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    const factsText = facts
      .map((fact) => `${fact.value} ${fact.detail}`)
      .join(" ");

    expect(factsText).toMatch(/never performs a final-submit action/i);
    expect(factsText).not.toMatch(/will submit|submits your application/i);
  });

  it("partitions ready-strip primary facts away from secondary boundaries", () => {
    const facts = getApplicationReadinessFacts({
      browserSession: readyBrowser,
      selectedAsset: null,
      selectedItem: originalResumeItem,
      selectedJob: baseJob,
    });
    const { primary, secondary } = partitionApplicationReadinessFacts(facts);

    expect(primary.map((fact) => fact.label)).toEqual([
      "Resume file",
      "Destination",
      "Final submit",
    ]);
    expect(secondary.map((fact) => fact.label)).toEqual([
      "Sign-in or account",
      "Required answers",
      "Site writes",
    ]);
  });
});
