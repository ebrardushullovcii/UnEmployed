import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import {
  applyResultNeedsResumeAttachment,
  getCustomerFacingApplyText,
} from "./applications-detail-panel-helpers";

describe("getCustomerFacingApplyText", () => {
  it("keeps transport implementation language out of retained customer history", () => {
    const resumeMessage = getCustomerFacingApplyText(
      "Prepare-only guard blocked a POST xhr attempt while the resume upload was running.",
    );
    const genericMessage = getCustomerFacingApplyText(
      "Prepare-only guard blocked a mutating page action.",
    );

    expect(resumeMessage).toContain("selected CV could not be attached");
    expect(genericMessage).toContain(
      "could not safely save this prepared step",
    );
    expect(`${resumeMessage} ${genericMessage}`).not.toMatch(
      /POST|XHR|mutating page action/i,
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
    state: "blocked" | "completed" | "failed";
  }) {
    return {
      state: input.state,
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
});
