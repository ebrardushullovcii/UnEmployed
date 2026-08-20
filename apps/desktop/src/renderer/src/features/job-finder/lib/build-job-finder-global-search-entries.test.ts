import type { JobFinderWorkspaceSnapshot } from "@unemployed/contracts";
import { describe, expect, it } from "vitest";
import { buildJobFinderGlobalSearchEntries } from "./build-job-finder-global-search-entries";

describe("buildJobFinderGlobalSearchEntries", () => {
  it("keeps the exact job and application context in search links", () => {
    const workspace = {
      campaigns: [],
      discoveryJobs: [
        {
          company: "Acme",
          id: "job-target",
          location: "Remote",
          matchAssessment: { reasons: [], recommendation: "review" },
          status: "new",
          title: "Target job",
          workMode: ["remote"],
        },
      ],
      applicationRecords: [
        {
          company: "Acme",
          id: "application-target",
          jobId: "job-target",
          lastActionLabel: null,
          nextActionLabel: null,
          status: "prepared",
          title: "Target application",
          crm: null,
        },
      ],
      intelligence: { companies: [] },
      resumeExportArtifacts: [],
      tailoredAssets: [],
    } as unknown as JobFinderWorkspaceSnapshot;

    const entries = buildJobFinderGlobalSearchEntries(workspace);

    expect(entries.find((entry) => entry.kind === "job")?.href).toBe(
      "/job-finder/discovery?jobId=job-target",
    );
    expect(entries.find((entry) => entry.kind === "application")?.href).toBe(
      "/job-finder/applications?applicationRecordId=application-target",
    );
  });
});
