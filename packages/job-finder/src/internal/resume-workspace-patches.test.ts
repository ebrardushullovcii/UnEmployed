import { describe, expect, test } from "vitest";
import type { ResumeDraft, ResumeDraftPatch } from "@unemployed/contracts";

import { applyPatchToResumeDraft } from "./resume-workspace-patches";

const updatedAt = "2026-08-09T12:00:00.000Z";

function createDraft(): ResumeDraft {
  return {
    id: "draft_restore",
    jobId: "job_restore",
    status: "draft",
    templateId: "classic_ats",
    identity: null,
    sections: [
      {
        id: "section_experience",
        kind: "experience",
        label: "Experience",
        text: null,
        bullets: [],
        entries: [
          {
            id: "experience_1",
            entryType: "experience",
            title: "Software Engineer",
            subtitle: "Signal Systems",
            location: null,
            dateRange: "2022 – Present",
            startDate: "2022",
            endDate: null,
            isCurrent: true,
            summary: "Tailored summary.",
            bullets: [],
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: "experience_1",
            sourceRefs: [],
            updatedAt: "2026-08-09T10:00:00.000Z",
          },
        ],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 0,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: "2026-08-09T10:00:00.000Z",
      },
    ],
    targetPageCount: 2,
    generationMethod: "ai",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
  };
}

function createPatch(
  overrides: Partial<ResumeDraftPatch>,
): ResumeDraftPatch {
  return {
    id: "patch_restore_summary",
    draftId: "draft_restore",
    operation: "replace_entry_summary",
    targetSectionId: "section_experience",
    targetEntryId: "experience_1",
    anchorEntryId: null,
    targetBulletId: null,
    anchorBulletId: null,
    position: null,
    newText: "Original summary.",
    newIncluded: null,
    newLocked: null,
    newBullets: null,
    appliedAt: updatedAt,
    origin: "user",
    conflictReason: null,
    ...overrides,
  };
}

describe("resume workspace patches", () => {
  test("restores an original entry summary as a user edit", () => {
    const nextDraft = applyPatchToResumeDraft({
      draft: createDraft(),
      patch: createPatch({}),
      updatedAt,
    });

    expect(nextDraft.sections[0]?.entries[0]).toMatchObject({
      summary: "Original summary.",
      origin: "user_edited",
      updatedAt,
    });
    expect(nextDraft.updatedAt).toBe(updatedAt);
  });

  test("rejects summary restoration without a target entry", () => {
    expect(() =>
      applyPatchToResumeDraft({
        draft: createDraft(),
        patch: createPatch({ targetEntryId: null }),
        updatedAt,
      }),
    ).toThrow("replace_entry_summary requires a target resume entry");
  });

  test("showing a role also restores its hidden parent section", () => {
    const draft = createDraft();
    const hiddenDraft: ResumeDraft = {
      ...draft,
      sections: draft.sections.map((section) => ({
        ...section,
        included: false,
      })),
    };

    const nextDraft = applyPatchToResumeDraft({
      draft: hiddenDraft,
      patch: createPatch({
        operation: "toggle_include",
        newIncluded: true,
        newText: null,
      }),
      updatedAt,
    });

    expect(nextDraft.sections[0]).toMatchObject({ included: true });
    expect(nextDraft.sections[0]?.entries[0]).toMatchObject({
      included: true,
    });
  });
});
