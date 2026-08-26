// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  ResumeAssistantMessage,
  ResumeClaimAssessment,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeValidationResult,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeWorkspaceSecondaryRail } from "./resume-workspace-secondary-rail";

const savedSummaryText =
  "Systems-focused product designer with deep workflow automation experience.";
const proposedSummaryText = "A tighter, job-specific proposed summary.";
const jobSnippet = "Own the workflow automation surface end to end.";

function buildDraft(): ResumeDraft {
  const updatedAt = "2026-04-27T00:00:00.000Z";

  return {
    id: "draft demo",
    jobId: "job demo",
    status: "draft",
    templateId: "classic_ats",
    identity: null,
    sections: [
      {
        id: "sec summary",
        kind: "summary",
        label: "Summary",
        text: savedSummaryText,
        bullets: [],
        entries: [],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 0,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [
          {
            id: "ref job demo",
            sourceKind: "job",
            sourceId: null,
            snippet: jobSnippet,
          },
        ],
        updatedAt,
      },
    ],
    targetPageCount: 2,
    generationMethod: "ai",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    workHistoryReviewAcknowledgments: [],
    claimConfirmations: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function buildPatch(): ResumeDraftPatch {
  return {
    id: "patch one",
    draftId: "draft demo",
    operation: "replace_section_text",
    targetSectionId: "sec summary",
    targetEntryId: null,
    anchorEntryId: null,
    targetBulletId: null,
    anchorBulletId: null,
    position: null,
    newText: proposedSummaryText,
    newIncluded: null,
    newLocked: null,
    newBullets: null,
    appliedAt: "2026-04-27T00:30:00.000Z",
    origin: "assistant",
    conflictReason: null,
  };
}

function buildMessage(): ResumeAssistantMessage {
  return {
    id: "assistant one",
    jobId: "job demo",
    role: "assistant",
    content: "Here is a grounded edit.",
    patches: [buildPatch()],
    proposalStatus: "pending",
    baseDraftUpdatedAt: null,
    resolvedPatchIds: [],
    resolvedAt: null,
    proposalError: null,
    createdAt: "2026-04-27T00:40:00.000Z",
  };
}

function buildValidation(): ResumeValidationResult {
  const assessment: ResumeClaimAssessment = {
    id: "assessment one",
    field: "section_text",
    sectionId: "sec summary",
    entryId: null,
    bulletId: null,
    claimText: savedSummaryText,
    claimOrigin: "ai_generated",
    contentHash: "fnv1a32:00000000",
    status: "exact",
    evidenceRefs: [],
    verifier: "deterministic_candidate_evidence_v1",
    assessedAt: "2026-04-27T01:00:00.000Z",
  };

  return {
    id: "validation one",
    draftId: "draft demo",
    issues: [],
    draftContentHash: null,
    claimAssessments: [assessment],
    coverageComparison: null,
    pageCount: null,
    validatedAt: "2026-04-27T01:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
});

describe("ResumeWorkspaceSecondaryRail grounding", () => {
  it("renders the same grounding provenance as the guided edits popup", () => {
    render(
      <ResumeWorkspaceSecondaryRail
        assistantMessages={[buildMessage()]}
        assistantPending={false}
        draft={buildDraft()}
        isWorkspacePending={false}
        onSendAssistantMessage={vi.fn()}
        onResolveProposal={vi.fn()}
        validation={buildValidation()}
      />,
    );

    const disclosures = screen.getAllByText("Why this edit is grounded");
    expect(disclosures.length).toBe(1);

    fireEvent.click(disclosures[0]!);

    // Identical copy and evidence the popup renders for the same inputs.
    expect(screen.getByText("Current saved text: Exact evidence.")).toBeTruthy();
    expect(screen.getByText("Job details")).toBeTruthy();
    expect(screen.getByText(jobSnippet)).toBeTruthy();
    expect(
      screen.getByText("New wording is checked after you accept and save."),
    ).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();

    const checkbox = screen.getByLabelText(
      "Select proposed change 1: replace section text",
    );
    expect(checkbox).toBeTruthy();
  });

  it("degrades to not-checked when validation has not been loaded", () => {
    render(
      <ResumeWorkspaceSecondaryRail
        assistantMessages={[buildMessage()]}
        assistantPending={false}
        draft={buildDraft()}
        isWorkspacePending={false}
        onSendAssistantMessage={vi.fn()}
        onResolveProposal={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Why this edit is grounded"));
    expect(
      screen.getByText("Current saved text: Not checked yet."),
    ).toBeTruthy();
  });
});
