import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeDraftEntry } from "@unemployed/contracts";

import {
  createResumeDraftPatch,
  orderResumeEntriesNewestFirst,
  resetResumeDraftPatchCounter,
} from "./resume-section-editor-helpers";

function buildEntry(input: {
  id: string;
  dateRange: string | null;
  sortOrder: number;
  title?: string;
}): ResumeDraftEntry {
  return {
    id: input.id,
    entryType: "experience",
    title: input.title ?? input.id,
    subtitle: "Example Co",
    location: null,
    dateRange: input.dateRange,
    startDate: null,
    endDate: null,
    isCurrent: false,
    summary: null,
    bullets: [],
    origin: "imported",
    locked: false,
    included: true,
    sortOrder: input.sortOrder,
    profileRecordId: input.id,
    sourceRefs: [],
    updatedAt: "2026-05-04T00:00:00.000Z",
  };
}

describe("orderResumeEntriesNewestFirst", () => {
  it("orders DD/MM/YYYY ranges chronologically", () => {
    const ordered = orderResumeEntriesNewestFirst([
      buildEntry({
        id: "older",
        dateRange: "13/12/2018 – 31/07/2019",
        sortOrder: 0,
      }),
      buildEntry({
        id: "current",
        dateRange: "13/07/2023 – Present",
        sortOrder: 1,
      }),
      buildEntry({
        id: "middle",
        dateRange: "14/11/2021 – 30/06/2023",
        sortOrder: 2,
      }),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      "current",
      "middle",
      "older",
    ]);
  });

  it("treats textual range separators as chronology separators", () => {
    const ordered = orderResumeEntriesNewestFirst([
      buildEntry({ id: "older", dateRange: "Jan 2020 through Feb 2021", sortOrder: 0 }),
      buildEntry({ id: "newer", dateRange: "Mar 2021 until Apr 2022", sortOrder: 1 }),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("prefers structured dates over legacy dateRange text", () => {
    const legacyCurrent = buildEntry({
      id: "legacy_current",
      dateRange: "Jan 2020 – Jan 2021",
      sortOrder: 0,
    });
    const structuredNewer = {
      ...buildEntry({ id: "structured_newer", dateRange: "Jan 2020 – Jan 2021", sortOrder: 1 }),
      startDate: "2025-01",
      endDate: "2025-12",
    };

    const ordered = orderResumeEntriesNewestFirst([legacyCurrent, structuredNewer]);

    expect(ordered.map((entry) => entry.id)).toEqual(["structured_newer", "legacy_current"]);
  });
});

describe("createResumeDraftPatch", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetResumeDraftPatchCounter();
  });

  it("can reset generated patch id counters for deterministic tests", () => {
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));
    resetResumeDraftPatchCounter();

    const firstPatch = createResumeDraftPatch({
      idPrefix: "resume_patch_test",
      operation: "toggle_include",
      sectionId: "section_experience",
    });
    const secondPatch = createResumeDraftPatch({
      idPrefix: "resume_patch_test",
      operation: "toggle_include",
      sectionId: "section_experience",
    });
    resetResumeDraftPatchCounter();
    const resetPatch = createResumeDraftPatch({
      idPrefix: "resume_patch_test",
      operation: "toggle_include",
      sectionId: "section_experience",
    });

    expect(firstPatch.id).toBe("resume_patch_test_1777852800000_1");
    expect(secondPatch.id).toBe("resume_patch_test_1777852800000_2");
    expect(resetPatch.id).toBe(firstPatch.id);
  });
});
