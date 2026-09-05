import { describe, expect, it } from "vitest";
import {
  searchJobFinderEntries,
  type JobFinderGlobalSearchEntry,
} from "./job-finder-global-search";

const entries: readonly JobFinderGlobalSearchEntry[] = [
  {
    campaignId: "campaign-a",
    href: "/job-finder/discovery?job=one",
    id: "one",
    kind: "job",
    metadata: ["TypeScript", "remote"],
    subtitle: "Acme · Remote",
    title: "Platform Engineer",
  },
  {
    campaignId: "campaign-b",
    href: "/job-finder/applications?application=two",
    id: "two",
    kind: "application",
    metadata: ["applied"],
    subtitle: "Example · Applied",
    title: "Frontend Engineer",
  },
];

describe("searchJobFinderEntries", () => {
  it("searches metadata and groups results", () => {
    expect(searchJobFinderEntries(entries, "typescript")).toEqual([
      { entries: [entries[0]], kind: "job" },
    ]);
  });

  it("can stay inside the active campaign", () => {
    expect(
      searchJobFinderEntries(entries, "engineer", { campaignId: "campaign-b" }),
    ).toEqual([{ entries: [entries[1]], kind: "application" }]);
  });
});
