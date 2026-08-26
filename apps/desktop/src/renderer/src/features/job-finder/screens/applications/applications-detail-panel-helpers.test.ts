import type {
  ApplicationPrivacyReceipt,
  JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import {
  applyResultNeedsResumeAttachment,
  getCustomerFacingApplyText,
  getQueueStateExplanation,
  getVerifiedExternalWriteRecoveryText,
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
      "No verified site writes are recorded for this run",
    );
    expect(message).toContain("Review what remains on the employer page");
    expect(message).not.toMatch(/fields? (?:were )?saved|fields? remain/i);
  });

  it("makes no saved or retained-field claim for a zero-write receipt", () => {
    expect(getVerifiedExternalWriteRecoveryText(createReceipt([]))).toBe(
      "No verified site writes are recorded for this run. Review what remains on the employer page before retrying.",
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
      "The receipt verifies writes to the employer page for profile fields, application answers. It does not confirm how the site stored them or what remains; review the employer page before retrying.",
    );
  });

  it("preserves already customer-readable messages", () => {
    expect(
      getCustomerFacingApplyText("Resume attachment needs your help"),
    ).toBe("Resume attachment needs your help");
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

  it("says a stop-rule pause will not continue and needs a fresh Queue remaining jobs run", () => {
    const explanation = getQueueStateExplanation({
      ...baseInput,
      runState: "paused_for_user_review",
    });

    expect(explanation).toContain("paused this run on one of its stop rules");
    expect(explanation).toContain("will not continue on its own");
    expect(explanation).toContain("no consent decision is holding it here");
    expect(explanation).toContain(
      "Use Queue remaining jobs to finish the unfinished jobs in a fresh safe recovery run",
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
