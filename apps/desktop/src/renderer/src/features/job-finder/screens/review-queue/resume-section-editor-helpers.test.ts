import { describe, expect, it } from "vitest";
import type { ResumeDraftEntry } from "@unemployed/contracts";

import { orderResumeEntriesNewestFirst } from "./resume-section-editor-helpers";

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
        dateRange: "01/12/2018 – 31/07/2019",
        sortOrder: 0,
      }),
      buildEntry({
        id: "current",
        dateRange: "01/07/2023 – Present",
        sortOrder: 1,
      }),
      buildEntry({
        id: "middle",
        dateRange: "01/11/2021 – 30/06/2023",
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
});
