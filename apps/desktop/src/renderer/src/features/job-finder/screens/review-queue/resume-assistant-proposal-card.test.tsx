// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  ResumeAssistantMessage,
  ResumeClaimAssessment,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeDraftSourceRef,
  ResumeValidationResult,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeAssistantProposalCard } from "./resume-assistant-proposal-card";

const savedSummaryText =
  "Systems-focused product designer with deep workflow automation experience.";
const savedBulletText = "Led design-system rollout across core workflow surfaces.";
const proposedBulletText = "Proposed replacement bullet wording.";
const profileSnippet = "Ran the rollout playbook across teams.";

const profileSourceRef: ResumeDraftSourceRef = {
  id: "ref profile demo",
  sourceKind: "profile",
  sourceId: null,
  snippet: profileSnippet,
};

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
        sourceRefs: [],
        updatedAt,
      },
      {
        id: "sec experience",
        kind: "experience",
        label: "Experience",
        text: null,
        bullets: [],
        entries: [
          {
            id: "ent design",
            entryType: "experience",
            title: "Senior Systems Designer",
            subtitle: "Signal Systems",
            location: "London, UK",
            dateRange: "2020 - Present",
            startDate: "2020",
            endDate: null,
            isCurrent: true,
            summary: "Leads design systems work.",
            bullets: [
              {
                id: "bul one",
                text: savedBulletText,
                origin: "ai_generated",
                locked: false,
                included: true,
                sourceRefs: [],
                lastGeneratedContentHash: null,
                updatedAt,
              },
            ],
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: null,
            sourceRefs: [profileSourceRef],
            updatedAt,
          },
        ],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 1,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [],
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

function buildPatch(
  overrides?: Partial<ResumeDraftPatch>,
): ResumeDraftPatch {
  return {
    id: "patch one",
    draftId: "draft demo",
    operation: "update_bullet",
    targetSectionId: "sec experience",
    targetEntryId: "ent design",
    anchorEntryId: null,
    targetBulletId: "bul one",
    anchorBulletId: null,
    position: null,
    newText: proposedBulletText,
    newIncluded: null,
    newLocked: null,
    newBullets: null,
    appliedAt: "2026-04-27T00:30:00.000Z",
    origin: "assistant",
    conflictReason: null,
    ...overrides,
  };
}

function buildMessage(overrides?: Partial<ResumeAssistantMessage>) {
  const fallbackPatch = buildPatch();
  const { patches, ...rest } = overrides ?? {};

  return {
    id: "assistant one",
    jobId: "job demo",
    role: "assistant" as const,
    content: "Here is a grounded edit.",
    patches: patches ?? [fallbackPatch],
    proposalStatus: "pending" as const,
    baseDraftUpdatedAt: null,
    resolvedPatchIds: [],
    resolvedAt: null,
    proposalError: null,
    createdAt: "2026-04-27T00:40:00.000Z",
    ...rest,
  } satisfies ResumeAssistantMessage;
}

function buildAssessment(overrides?: {
  claimText?: string;
  status?: "exact" | "paraphrase" | "review" | "unsupported";
}): ResumeClaimAssessment {
  return {
    id: "assessment one",
    field: "entry_bullet",
    sectionId: "sec experience",
    entryId: "ent design",
    bulletId: "bul one",
    claimText: overrides?.claimText ?? savedBulletText,
    claimOrigin: "assistant_edited",
    contentHash: "fnv1a32:00000000",
    status: overrides?.status ?? "exact",
    evidenceRefs: [],
    verifier: "deterministic_candidate_evidence_v1",
    assessedAt: "2026-04-27T01:00:00.000Z",
  };
}

function buildValidation(
  claimAssessments: readonly ResumeClaimAssessment[],
): ResumeValidationResult {
  return {
    id: "validation one",
    draftId: "draft demo",
    issues: [],
    draftContentHash: null,
    claimAssessments: [...claimAssessments],
    coverageComparison: null,
    pageCount: null,
    validatedAt: "2026-04-27T01:00:00.000Z",
  };
}

function renderCard(props?: {
  draft?: ResumeDraft;
  message?: ResumeAssistantMessage;
  validation?: ResumeValidationResult | null;
}) {
  return render(
    <ResumeAssistantProposalCard
      draft={props?.draft ?? buildDraft()}
      isPending={false}
      message={props?.message ?? buildMessage()}
      onResolve={vi.fn()}
      validation={props?.validation ?? null}
    />,
  );
}

function openGroundingDisclosure() {
  fireEvent.click(screen.getByText("Why this edit is grounded"));
}

afterEach(() => {
  cleanup();
});

describe("ResumeAssistantProposalCard grounding", () => {
  it("shows matched saved-text evidence behind a collapsed disclosure", () => {
    const renderResult = renderCard({
      validation: buildValidation([buildAssessment({ status: "exact" })]),
    });

    // Collapsed by default: the disclosure starts closed.
    const details = renderResult.container.querySelector("details");
    expect(details?.open).toBe(false);

    openGroundingDisclosure();
    expect(details?.open).toBe(true);

    expect(screen.getByText("Current saved text: Exact evidence.")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText(profileSnippet)).toBeTruthy();
    expect(
      screen.getByText("New wording is checked after you accept and save."),
    ).toBeTruthy();
    expect(screen.getByText(proposedBulletText)).toBeTruthy();
    expect(screen.getByText("Experience · Senior Systems Designer · Bullet 1")).toBeTruthy();
  });

  it("reports not-checked saved text when validation is absent, mismatched, or stale", () => {
    // No validation at all.
    const absent = renderCard();
    openGroundingDisclosure();
    expect(
      screen.getByText("Current saved text: Not checked yet."),
    ).toBeTruthy();
    absent.unmount();

    // Validation exists but describes different text than the draft holds.
    renderCard({
      validation: buildValidation([
        buildAssessment({ claimText: "Older saved bullet wording." }),
      ]),
    });
    openGroundingDisclosure();
    expect(
      screen.getByText("Current saved text: Not checked yet."),
    ).toBeTruthy();
    expect(screen.queryByText("Current saved text: Exact evidence.")).toBeNull();
    expect(
      screen.getByText("New wording is checked after you accept and save."),
    ).toBeTruthy();
  });

  it("never presents the proposed wording as already verified", () => {
    renderCard({
      validation: buildValidation([buildAssessment({ status: "exact" })]),
    });
    openGroundingDisclosure();

    // Only one status line exists, and it names the saved text, not the proposal.
    const statusLines = screen.getAllByText(/Current saved text:/);
    expect(statusLines.length).toBe(1);

    const disclosureRegion = screen.getByText(
      "New wording is checked after you accept and save.",
    );
    expect(disclosureRegion).toBeTruthy();
  });

  it("keeps grounded provenance on accepted and rejected historical cards", () => {
    // Accepted and applied, revalidated after saving.
    const accepted = renderCard({
      message: buildMessage({
        proposalStatus: "accepted",
        resolvedPatchIds: ["patch one"],
        resolvedAt: "2026-04-27T02:00:00.000Z",
      }),
      validation: buildValidation([buildAssessment({ status: "exact" })]),
    });
    expect(screen.getByText("Applied")).toBeTruthy();
    openGroundingDisclosure();
    expect(screen.getByText("Current saved text: Exact evidence.")).toBeTruthy();
    expect(document.querySelectorAll("input[type=checkbox]").length).toBe(0);
    accepted.unmount();

    // Rejected, nothing saved changed, no validation available.
    renderCard({
      message: buildMessage({
        proposalStatus: "rejected",
        resolvedAt: "2026-04-27T02:00:00.000Z",
      }),
    });
    expect(screen.getByText("Rejected")).toBeTruthy();
    openGroundingDisclosure();
    expect(
      screen.getByText("Current saved text: Not checked yet."),
    ).toBeTruthy();
    expect(document.querySelectorAll("input[type=checkbox]").length).toBe(0);
  });

  it("toggles the disclosure without changing proposal selection", () => {
    const renderResult = renderCard({
      validation: buildValidation([buildAssessment()]),
    });
    const checkbox = screen.getByLabelText(
      "Select proposed change 1: update bullet",
    );
    if (!(checkbox instanceof HTMLInputElement)) {
      throw new Error("Expected checkbox input element");
    }
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByText("Why this edit is grounded"));
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(profileSnippet)).toBeTruthy();

    // Positive control: direct selection still works.
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(renderResult.container.textContent).not.toContain("_");
  });

  it("degrades honestly when the patch target is gone", () => {
    renderCard({
      message: buildMessage({
        patches: [
          buildPatch({
            targetSectionId: "sec removed",
            targetEntryId: null,
            targetBulletId: null,
          }),
        ],
      }),
    });

    expect(
      screen.getByText("Original target is no longer in the draft"),
    ).toBeTruthy();

    openGroundingDisclosure();
    expect(
      screen.getByText(
        "This edit points at a target that is no longer in the draft.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Current saved text: Not checked yet."),
    ).toBeTruthy();
    expect(screen.queryByText(profileSnippet)).toBeNull();
  });

  it("skips saved-text claims for wording-free operations", () => {
    renderCard({
      message: buildMessage({
        patches: [
          buildPatch({
            operation: "toggle_include",
            newIncluded: false,
            newText: null,
          }),
        ],
      }),
    });

    openGroundingDisclosure();
    expect(screen.queryByText(/Current saved text:/)).toBeNull();
    expect(
      screen.queryByText("New wording is checked after you accept and save."),
    ).toBeNull();
    // Nearest linked evidence still renders.
    expect(screen.getByText("Profile")).toBeTruthy();
  });
});
