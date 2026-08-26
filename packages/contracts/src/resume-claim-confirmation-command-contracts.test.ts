import { describe, expect, test } from "vitest";
import {
  JobFinderSetResumeClaimConfirmationInputSchema,
  resumeClaimOwnershipStatement,
  type JobFinderSetResumeClaimConfirmationInput,
} from "./index";

function buildValidAddInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    intent: "add",
    jobId: "job_1",
    draftId: "resume_draft_1",
    expectedDraftUpdatedAt: "2026-03-20T10:02:30.000Z",
    field: "entry_bullet",
    sectionId: "section_experience",
    entryId: "experience_1",
    bulletId: "experience_1_bullet_1",
    confirmedClaimContentHash: "fnv1a32:5678efab",
    ownershipStatement: resumeClaimOwnershipStatement,
    ...overrides,
  };
}

const validRemove = {
  intent: "remove" as const,
  jobId: "job_1",
  draftId: "resume_draft_1",
  expectedDraftUpdatedAt: "2026-03-20T10:02:30.000Z",
  confirmationId: "claim_confirmation_section_experience_abc",
};

describe("contracts resume claim confirmation command schema", () => {
  test("parses add and remove intents with their exact shapes", () => {
    const added = JobFinderSetResumeClaimConfirmationInputSchema.parse(
      buildValidAddInput(),
    );
    expect(added).toMatchObject({
      intent: "add",
      draftId: "resume_draft_1",
      field: "entry_bullet",
      sectionId: "section_experience",
      entryId: "experience_1",
      bulletId: "experience_1_bullet_1",
      confirmedClaimContentHash: "fnv1a32:5678efab",
      ownershipStatement: resumeClaimOwnershipStatement,
    });

    const removed = JobFinderSetResumeClaimConfirmationInputSchema.parse(
      validRemove,
    );
    expect(removed).toMatchObject({
      intent: "remove",
      confirmationId: "claim_confirmation_section_experience_abc",
    });
  });

  test("parses every claim field with correctly shaped locators", () => {
    expect(
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({
          field: "section_text",
          entryId: null,
          bulletId: null,
        }),
      ),
    ).toMatchObject({ field: "section_text" });
    expect(
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({
          field: "section_bullet",
          entryId: null,
        }),
      ),
    ).toMatchObject({ field: "section_bullet" });
    expect(
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({
          field: "entry_summary",
          bulletId: null,
        }),
      ),
    ).toMatchObject({ field: "entry_summary" });
  });

  test("rejects locator shapes that disagree with the claim field", () => {
    const invalidLocators = [
      { field: "section_text", entryId: null, bulletId: "bullet_1" },
      { field: "section_text", entryId: "experience_1", bulletId: null },
      { field: "section_bullet", entryId: "experience_1", bulletId: null },
      { field: "entry_summary", entryId: null, bulletId: null },
      { field: "entry_bullet", entryId: null, bulletId: "bullet_1" },
      { field: "entry_bullet", entryId: "experience_1", bulletId: null },
    ];

    for (const locator of invalidLocators) {
      expect(() =>
        JobFinderSetResumeClaimConfirmationInputSchema.parse(
          buildValidAddInput(locator),
        ),
      ).toThrow();
    }
  });

  test("requires the literal ownership statement and a normalized content hash", () => {
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({
          ownershipStatement: "I promise this is mine.",
        }),
      ),
    ).toThrow(/confirm this content is accurate/i);

    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({ confirmedClaimContentHash: "sha256:deadbeef" }),
      ),
    ).toThrow();
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({ confirmedClaimContentHash: "fnv1a32:NOTHEX" }),
      ),
    ).toThrow();
  });

  test("rejects client-minted record ids and timestamps on both intents", () => {
    for (const forged of [
      { id: "claim_confirmation_client_minted" },
      { confirmedAt: "2026-03-20T10:05:00.000Z" },
      { staleReason: "because" },
    ]) {
      expect(() =>
        JobFinderSetResumeClaimConfirmationInputSchema.parse(
          buildValidAddInput(forged),
        ),
      ).toThrow();
      expect(() =>
        JobFinderSetResumeClaimConfirmationInputSchema.parse({
          ...validRemove,
          ...forged,
        }),
      ).toThrow();
    }

    // Cross-intent fields never parse: remove carries only the confirmation
    // id, add never carries one.
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse(
        buildValidAddInput({ confirmationId: "claim_confirmation_extra" }),
      ),
    ).toThrow();
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse({
        ...validRemove,
        confirmedClaimContentHash: "fnv1a32:5678efab",
      }),
    ).toThrow();
  });

  test("rejects invalid identity fields and unknown intents", () => {
    const invalidOverrides = [
      { jobId: "" },
      { draftId: undefined },
      { expectedDraftUpdatedAt: "2026-03-20 10:02:30" },
      { sectionId: "" },
      { bulletId: "" },
    ];

    for (const override of invalidOverrides) {
      expect(() =>
        JobFinderSetResumeClaimConfirmationInputSchema.parse(
          buildValidAddInput(override),
        ),
      ).toThrow();
    }

    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse({
        ...validRemove,
        confirmationId: "",
      }),
    ).toThrow();
    expect(() =>
      JobFinderSetResumeClaimConfirmationInputSchema.parse({
        ...validRemove,
        intent: "defer",
      }),
    ).toThrow();
  });

  test("exports a discriminated inferred type", () => {
    const assertCommand = (
      command: JobFinderSetResumeClaimConfirmationInput,
    ): void => {
      if (command.intent === "add") {
        expect(command.ownershipStatement).toBe(resumeClaimOwnershipStatement);
        return;
      }
      expect(command.confirmationId).toContain("claim_confirmation");
    };

    assertCommand(validRemove);
    assertCommand(
      JobFinderSetResumeClaimConfirmationInputSchema.parse(buildValidAddInput()),
    );
  });
});
