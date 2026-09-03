import type {
  ApplicationPrivacyReceipt,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import {
  applyResultIsFieldSavePause,
  applyResultIsServiceWorkerBlocked,
  applyResultNeedsManualFieldFinish,
  applyResultNeedsResumeAttachment,
  applicationRecordLooksSiteBlocked,
  FIELD_SAVE_PAUSE_GUIDANCE,
  FIELD_SAVE_PAUSE_NEXT_STEP,
  formatApplyRunModeLabel,
  formatApplyRunStateLabel,
  getApplyResultDestinationUrl,
  getCustomerFacingApplyText,
  getManualFieldFinishGuidance,
  getManualFieldFinishNextStep,
  getManualFieldFinishReason,
  getQueueStateExplanation,
  getVerifiedExternalWriteRecoveryText,
  applicationNeedsPrimaryRecovery,
  MANUAL_FIELD_CONFLICT_REASON,
  MANUAL_FIELD_FINISH_GUIDANCE,
  MANUAL_FIELD_FINISH_NEXT_STEP,
  SITE_BLOCKED_AUTOMATIC_PREP_GUIDANCE,
  SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP,
  SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP,
} from "./applications-detail-panel-helpers";

function createReceipt(
  externalWrites: ApplicationPrivacyReceipt["externalWrites"],
): ApplicationPrivacyReceipt {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-16T10:01:00.000Z",
    lineage: {
      applicationRecordId: "application-1",
      runId: "run_receipt",
      jobId: "job_receipt",
      resultId: "result_receipt",
    },
    destination: {
      origin: "https://example.com",
      safePath: "/apply",
    },
    resume: {
      source: "original_upload",
      sourceDocumentId: "resume_source",
      exportArtifactId: null,
      fileName: "resume.pdf",
      sha256: null,
    },
    stayedLocal: [],
    modelUse: [],
    externalWrites,
    accountCreationAuthorized: false,
    finalSubmitAuthorized: false,
    finalSubmitOccurred: false,
    submissionOutcome: null,
  };
}

describe("getCustomerFacingApplyText", () => {
  it("keeps transport implementation language out of retained customer history", () => {
    const resumeMessage = getCustomerFacingApplyText(
      "Prepare-only guard blocked a POST xhr attempt while the resume upload was running.",
    );
    const genericMessage = getCustomerFacingApplyText(
      "Prepare-only guard blocked a mutating page action.",
    );

    expect(resumeMessage).toContain("selected resume could not be attached");
    expect(genericMessage).toContain(
      "could not safely save this prepared step",
    );
    expect(`${resumeMessage} ${genericMessage}`).not.toMatch(
      /POST|XHR|mutating page action/i,
    );
  });

  it("makes no saved or retained-field claim when no receipt exists", () => {
    const message = getCustomerFacingApplyText(
      "Prepare-only guard blocked a mutating page action.",
    );

    expect(message).toContain(
      "No verified writes to the employer page were recorded for this run",
    );
    expect(message).toContain("Check what remains on the employer site");
    expect(message).not.toMatch(/fields? (?:were )?saved|fields? remain/i);
  });

  it("makes no saved or retained-field claim for a zero-write receipt", () => {
    expect(getVerifiedExternalWriteRecoveryText(createReceipt([]))).toBe(
      "No verified writes to the employer page were recorded for this run. Check what remains on the employer site before retrying.",
    );
  });

  it("describes only verified receipt write categories", () => {
    const receipt = createReceipt([
      {
        category: "profile_field",
        fieldLabel: "Email",
        occurredAt: "2026-07-16T10:00:00.000Z",
        artifactRefId: null,
        verified: true,
      },
      {
        category: "application_answer",
        fieldLabel: "Work authorization",
        occurredAt: "2026-07-16T10:00:30.000Z",
        artifactRefId: null,
        verified: true,
      },
      {
        category: "resume_attachment",
        fieldLabel: "Resume",
        occurredAt: "2026-07-16T10:00:45.000Z",
        artifactRefId: null,
        verified: false,
      },
    ]);

    expect(getVerifiedExternalWriteRecoveryText(receipt)).toBe(
      "Job Finder recorded writes to the employer page for profile fields, application answers. That does not confirm what the site kept — review the page before retrying.",
    );
  });

  it("preserves already customer-readable messages", () => {
    expect(
      getCustomerFacingApplyText("Resume attachment needs your help"),
    ).toBe("Resume attachment needs your help");
  });

  it("rewrites service-worker jargon into the finish-first site-block next step", () => {
    expect(
      getCustomerFacingApplyText(
        "A LinkedIn service worker blocked automated preparation.",
      ),
    ).toBe(SITE_BLOCKED_AUTOMATIC_PREP_NEXT_STEP);
    expect(
      getCustomerFacingApplyText(
        "Service worker interference on this job site.",
      ),
    ).not.toMatch(/service worker/i);
  });
});

describe("applyResultNeedsResumeAttachment", () => {
  function createResult(input: {
    detail: string;
    state: "awaiting_review" | "blocked" | "completed" | "failed";
    blockerReason?: string | null;
  }) {
    return {
      state: input.state,
      blockerReason: input.blockerReason ?? null,
      detail: input.detail,
      summary: input.detail,
      blockerSummary: null,
    } as JobFinderWorkspaceSnapshot["applyJobResults"][number];
  }

  it("detects only a current failed or blocked resume attachment", () => {
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "blocked",
          detail:
            "The approved CV could not be attached. Retry the attachment.",
        }),
      ),
    ).toBe(true);
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "completed",
          detail: "The approved CV was attached.",
        }),
      ),
    ).toBe(false);
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "failed",
          detail: "The cover letter could not be saved.",
        }),
      ),
    ).toBe(false);
  });

  it("offers the CV retry CTA for an awaiting_review result stopped by a required human decision", () => {
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "awaiting_review",
          blockerReason: "required_human_input",
          detail: "Resume attachment needs your help.",
        }),
      ),
    ).toBe(true);
  });

  it("keeps non-CV awaiting_review results out of the CV retry CTA", () => {
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "awaiting_review",
          blockerReason: "required_human_input",
          detail: "Answer the required work-authorization question.",
        }),
      ),
    ).toBe(false);
    expect(
      applyResultNeedsResumeAttachment(
        createResult({
          state: "awaiting_review",
          blockerReason: null,
          detail:
            "Review the prepared application before any later execution step.",
        }),
      ),
    ).toBe(false);
  });

  it("keeps a final-checkpoint missing-resume stop out of the CV attachment CTA", () => {
    const missingResume = createResult({
      state: "failed",
      blockerReason: "resume_missing",
      detail:
        "A final application control is visible, but the runtime did not locate and attach the current approved resume on this preparation path. It stopped for manual verification.",
    });
    missingResume.summary =
      "Final checkpoint reached without a verified resume upload";

    expect(applyResultNeedsResumeAttachment(missingResume)).toBe(false);
  });
});

describe("getQueueStateExplanation", () => {
  const baseInput = {
    selectedJobCount: 3,
    blockedJobCount: 0,
    skippedJobCount: 0,
    failedJobCount: 0,
    completedJobCount: 0,
  };

  it("says a stop-rule pause will not continue and needs a fresh Prepare remaining jobs run", () => {
    const explanation = getQueueStateExplanation({
      ...baseInput,
      runState: "paused_for_user_review",
    });

    expect(explanation).toContain("paused this run on one of its stop rules");
    expect(explanation).toContain("will not continue on its own");
    expect(explanation).toContain("no consent decision is holding it here");
    expect(explanation).toContain(
      "Use Prepare remaining jobs to finish the unfinished jobs in a fresh safe recovery run",
    );
    // Unlike the consent pause, there is nothing to resolve to resume.
    expect(explanation).not.toContain("Resolve the consent request");
  });

  it("keeps the live consent pause framed as resumable", () => {
    const explanation = getQueueStateExplanation({
      ...baseInput,
      runState: "paused_for_consent",
    });

    expect(explanation).toContain("Resolve the consent request to continue");
    expect(explanation).not.toContain("will not continue on its own");
  });

  it("returns no explanation when no run is selected", () => {
    expect(getQueueStateExplanation(null)).toBeNull();
  });
});

describe("service-worker site block helpers", () => {
  it("detects service-worker blockers and marks recovery as primary", () => {
    const result = {
      id: "result_sw",
      runId: "run_sw",
      jobId: "job_li",
      applicationRecordId: "application_li",
      queuePosition: 0,
      state: "blocked" as const,
      summary: "A LinkedIn service worker blocked automated preparation.",
      detail: "Reset the browser profile, then finish manually.",
      startedAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:01:00.000Z",
      completedAt: "2026-08-27T10:01:00.000Z",
      blockerReason: "site_protection" as const,
      blockerSummary: "Service worker interference",
      listingSignalEvidence: null,
      visualObservationSets: [],
      visualCheckpoints: [],
      latestQuestionCount: 0,
      latestAnswerCount: 0,
      pendingConsentRequestCount: 0,
      artifactCount: 0,
      latestCheckpointId: null,
      privacyReceipt: null,
    };

    expect(applyResultIsServiceWorkerBlocked(result)).toBe(true);
    expect(applyResultNeedsManualFieldFinish(result)).toBe(false);
    expect(
      applicationNeedsPrimaryRecovery({
        lastAttemptState: "paused",
        visibleApplyResult: result,
      }),
    ).toBe(true);
    expect(SITE_BLOCKED_AUTOMATIC_PREP_GUIDANCE).toMatch(
      /Reset the Job Finder browser in Safeguards/i,
    );
    expect(SITE_BLOCKED_AUTOMATIC_PREP_GUIDANCE).not.toMatch(/service worker/i);
  });

  it("detects site-blocked pauses from persisted application record fields", () => {
    expect(
      applicationRecordLooksSiteBlocked({
        nextActionLabel: "Inspect the application page manually",
        lastActionLabel: "Inspect the application page manually.",
        latestBlocker: null,
      }),
    ).toBe(true);
    expect(
      applicationRecordLooksSiteBlocked({
        nextActionLabel: "Prepare application",
        lastActionLabel: "Resume approved",
        latestBlocker: null,
      }),
    ).toBe(false);
    expect(SITE_BLOCKED_AUTOMATIC_PREP_LIST_NEXT_STEP).toMatch(
      /Open Safeguards to reset the Job Finder browser/i,
    );
  });
});

describe("manual field-finish helpers", () => {
  function createResult(input: {
    summary: string;
    detail?: string;
    blockerSummary?: string | null;
    blockerReason?: JobFinderWorkspaceSnapshot["applyJobResults"][number]["blockerReason"];
    state?: JobFinderWorkspaceSnapshot["applyJobResults"][number]["state"];
  }): JobFinderWorkspaceSnapshot["applyJobResults"][number] {
    return {
      id: "result_field",
      runId: "run_field",
      jobId: "job_field",
      applicationRecordId: "application_field",
      queuePosition: 0,
      state: input.state ?? "blocked",
      summary: input.summary,
      detail: input.detail ?? input.summary,
      startedAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:01:00.000Z",
      completedAt: "2026-08-27T10:01:00.000Z",
      blockerReason: input.blockerReason ?? "required_human_input",
      blockerSummary: input.blockerSummary ?? input.summary,
      listingSignalEvidence: null,
      visualObservationSets: [],
      visualCheckpoints: [],
      latestQuestionCount: 0,
      latestAnswerCount: 0,
      pendingConsentRequestCount: 0,
      artifactCount: 0,
      latestCheckpointId: null,
      privacyReceipt: null,
    };
  }

  it("detects conflicting prefilled fields and marks recovery as primary", () => {
    const result = createResult({
      summary: "Prefilled application values need manual review",
      detail:
        "One or more known application fields already contain values that do not match the exact saved candidate profile.",
      blockerSummary: "Prefilled application values need manual review",
    });

    expect(applyResultNeedsManualFieldFinish(result)).toBe(true);
    expect(applyResultIsServiceWorkerBlocked(result)).toBe(false);
    expect(
      applicationNeedsPrimaryRecovery({
        lastAttemptState: "paused",
        visibleApplyResult: result,
      }),
    ).toBe(true);
    expect(MANUAL_FIELD_FINISH_NEXT_STEP).toMatch(
      /Review and fix the conflicting or unfinished fields/i,
    );
    expect(MANUAL_FIELD_FINISH_GUIDANCE).toMatch(
      /Run preparation again" only if you want a fresh run/i,
    );
    // Actual conflicts keep the conflicting-fields copy.
    expect(applyResultIsFieldSavePause(result)).toBe(false);
    expect(getManualFieldFinishNextStep(result)).toBe(
      MANUAL_FIELD_FINISH_NEXT_STEP,
    );
    expect(getManualFieldFinishGuidance(result)).toBe(
      MANUAL_FIELD_FINISH_GUIDANCE,
    );
    expect(getManualFieldFinishReason(result)).toBe(
      MANUAL_FIELD_CONFLICT_REASON,
    );
  });

  it("explains a prepare-only autosave pause without claiming a field conflict", () => {
    const result = createResult({
      summary: "The application page could not safely save a prepared field",
      detail:
        "The application site tried to save 'Phone' while it was being prepared, but this run did not have permission for that external save. Job Finder stopped and left the application open instead of risking a final submission.",
      blockerSummary:
        "The application page could not safely save a prepared field",
      state: "awaiting_review",
    });

    expect(applyResultNeedsManualFieldFinish(result)).toBe(true);
    expect(applyResultIsFieldSavePause(result)).toBe(true);
    expect(getManualFieldFinishNextStep(result)).toBe(
      FIELD_SAVE_PAUSE_NEXT_STEP,
    );
    expect(getManualFieldFinishGuidance(result)).toBe(
      FIELD_SAVE_PAUSE_GUIDANCE,
    );
    expect(getManualFieldFinishReason(result)).toMatch(
      /tried to save a field automatically/i,
    );
    // One name for the window, and the instruction says the window is
    // separate and names the exact action the user comes back to.
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).toMatch(
      /tried to save a field automatically/i,
    );
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).toMatch(
      /Finish this application in the Job Finder browser\./,
    );
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).toMatch(
      /separate window outside this app/i,
    );
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).toMatch(
      /Check whether this step is done/,
    );
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).not.toMatch(/the open browser/i);
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).not.toMatch(/the managed browser/i);
    expect(FIELD_SAVE_PAUSE_NEXT_STEP).not.toMatch(/conflict/i);
    expect(getManualFieldFinishReason(null)).toBeNull();
  });

  it("derives a query-free destination URL from the privacy receipt", () => {
    const receipt = createReceipt([]);
    expect(
      getApplyResultDestinationUrl({
        ...receipt,
        destination: {
          origin: "https://jobs.example.com",
          safePath: "/apply/123",
        },
      }),
    ).toBe("https://jobs.example.com/apply/123");
    expect(getApplyResultDestinationUrl(null)).toBeNull();
  });

  it("formats run states and modes for people", () => {
    expect(formatApplyRunStateLabel("paused_for_user_review")).toBe(
      "Paused for your review",
    );
    expect(formatApplyRunStateLabel("paused_for_consent")).toBe(
      "Paused for a consent decision",
    );
    expect(formatApplyRunStateLabel("completed")).toBe("Completed");
    expect(formatApplyRunModeLabel("copilot")).toBe("Preparation");
    expect(formatApplyRunModeLabel("single_job_auto")).toBe(
      "Automatic preparation",
    );
  });

  it("detects prepare-only field saves that require finishing in the open application", () => {
    const result = createResult({
      summary: "The application page could not safely save a prepared field",
      detail:
        "The application site tried to save 'application field' while it was being prepared, but this run did not have permission for that external save.",
      blockerSummary:
        "The application page could not safely save a prepared field",
    });

    expect(applyResultNeedsManualFieldFinish(result)).toBe(true);
  });

  it("keeps resume-attachment retries out of the manual-finish path", () => {
    const result = createResult({
      summary: "Resume attachment needs your help",
      detail: "The approved resume was not attached.",
      blockerSummary: "Resume attachment needs your help",
      state: "blocked",
    });

    expect(applyResultNeedsResumeAttachment(result)).toBe(true);
    expect(applyResultNeedsManualFieldFinish(result)).toBe(false);
  });
});
