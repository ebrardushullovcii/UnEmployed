// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { CompanyEntity, SavedJob } from "@unemployed/contracts";
import {
  projectCompanyApplicationHistory,
  projectCompanyDuplicateJobs,
  projectCompanyOpenings,
} from "./company-projections";

const now = "2026-08-15T10:00:00.000Z";

function makeCompany(overrides: Partial<CompanyEntity> = {}): CompanyEntity {
  return {
    id: "company_1",
    canonicalName: "Acme Inc",
    aliases: [],
    domains: [],
    preference: "neutral",
    preferenceReason: null,
    mergeReviewCandidates: [],
    contacts: [],
    notes: [],
    salaryOfferEvidence: [],
    sourceHistory: [],
    jobIds: [],
    applicationRecordIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeJob(id: string, overrides: Partial<SavedJob> = {}): SavedJob {
  return {
    id,
    source: "target_site",
    sourceJobId: `source_${id}`,
    discoveryMethod: "catalog_seed",
    collectionMethod: "fallback_search",
    canonicalUrl: `https://jobs.example.com/${id}`,
    applicationUrl: null,
    title: "Engineer",
    company: "Acme Inc",
    location: "Remote",
    workMode: ["remote"],
    applyPath: "easy_apply",
    easyApplyEligible: true,
    postedAt: null,
    postedAtText: null,
    providerUpdatedAt: null,
    discoveredAt: now,
    firstSeenAt: null,
    lastSeenAt: null,
    lastVerifiedActiveAt: null,
    salaryText: null,
    normalizedCompensation: {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    },
    detailQuality: "card_only",
    summary: null,
    description: "A job.",
    keySkills: [],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: "pass",
    sourceIntelligence: null,
    screeningHints: {},
    keywordSignals: [],
    benefits: [],
    status: "ready_for_review",
    matchAssessment: { score: 80, reasons: [], gaps: [] },
    provenance: [],
    discoveryFeedback: null,
    resumeApplicationMode: null,
    latestMatchAssessmentAudit: null,
    ...overrides,
  } as SavedJob;
}

describe("projectCompanyOpenings", () => {
  it("splits linked jobs into current and previous openings sorted newest first", () => {
    const projection = projectCompanyOpenings({
      company: makeCompany({
        jobIds: ["job_open", "job_closed"],
      }),
      jobs: [
        makeJob("job_open", {
          status: "interview",
          postedAt: "2026-08-05T00:00:00.000Z",
        }),
        makeJob("job_closed", {
          status: "rejected",
          postedAt: "2026-08-10T00:00:00.000Z",
        }),
        makeJob("job_unlinked", {
          status: "submitted",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    expect(projection.current.map((job) => job.id)).toEqual(["job_open"]);
    expect(projection.previous.map((job) => job.id)).toEqual(["job_closed"]);
    expect(projection.totalCount).toBe(2);
    expect(projection.lastOpenedAt).toBe("2026-08-10T00:00:00.000Z");
  });
});

describe("projectCompanyApplicationHistory", () => {
  it("returns linked records newest first with status counts", () => {
    const projection = projectCompanyApplicationHistory({
      company: makeCompany({ applicationRecordIds: ["app_old", "app_new"] }),
      applicationRecords: [
        {
          id: "app_old",
          jobId: "job_1",
          title: "Engineer",
          company: "Acme Inc",
          status: "rejected",
          lastActionLabel: "Rejected",
          nextActionLabel: null,
          lastUpdatedAt: "2026-08-01T00:00:00.000Z",
          lastAttemptState: null,
          questionSummary: {
            total: 0,
            required: 0,
            answered: 0,
            unansweredRequired: 0,
          },
          latestBlocker: null,
          consentSummary: { status: "none", pendingCount: 0 },
          replaySummary: {
            sourceInstructionArtifactId: null,
            lastUrl: null,
            checkpointCount: 0,
            evidenceCount: 0,
          },
          events: [],
          crm: null,
        },
        {
          id: "app_new",
          jobId: "job_2",
          title: "Engineer",
          company: "Acme Inc",
          status: "interview",
          lastActionLabel: "Interviewed",
          nextActionLabel: null,
          lastUpdatedAt: "2026-08-10T00:00:00.000Z",
          lastAttemptState: null,
          questionSummary: {
            total: 0,
            required: 0,
            answered: 0,
            unansweredRequired: 0,
          },
          latestBlocker: null,
          consentSummary: { status: "none", pendingCount: 0 },
          replaySummary: {
            sourceInstructionArtifactId: null,
            lastUrl: null,
            checkpointCount: 0,
            evidenceCount: 0,
          },
          events: [],
          crm: null,
        },
      ],
    });

    expect(projection.records.map((record) => record.id)).toEqual([
      "app_new",
      "app_old",
    ]);
    expect(projection.statusCounts.interview).toBe(1);
    expect(projection.statusCounts.rejected).toBe(1);
    expect(projection.latestUpdatedAt).toBe("2026-08-10T00:00:00.000Z");
  });
});

describe("projectCompanyDuplicateJobs", () => {
  it("flags an exact duplicate when postings share a source posting id", () => {
    const groups = projectCompanyDuplicateJobs({
      company: makeCompany({ jobIds: ["job_a", "job_b"] }),
      jobs: [
        makeJob("job_a", {
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.example.com/a",
        }),
        makeJob("job_b", {
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.example.com/b",
        }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: "exact",
      jobIds: ["job_a", "job_b"],
    });
  });

  it("flags an exact duplicate when postings share a canonical listing url", () => {
    const groups = projectCompanyDuplicateJobs({
      company: makeCompany({ jobIds: ["job_a", "job_b"] }),
      jobs: [
        makeJob("job_a", {
          sourceJobId: "posting_a",
          canonicalUrl: "https://jobs.example.com/same",
        }),
        makeJob("job_b", {
          sourceJobId: "posting_b",
          canonicalUrl: "https://jobs.example.com/same",
        }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("exact");
  });

  it("flags a possible duplicate for identical title/company/location/posted date", () => {
    const groups = projectCompanyDuplicateJobs({
      company: makeCompany({ jobIds: ["job_a", "job_b"] }),
      jobs: [
        makeJob("job_a", {
          sourceJobId: "posting_a",
          canonicalUrl: "https://jobs.example.com/a",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
        makeJob("job_b", {
          sourceJobId: "posting_b",
          canonicalUrl: "https://jobs.example.com/b",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("possible");
  });

  it("leaves unrelated postings alone and never silently merges", () => {
    const groups = projectCompanyDuplicateJobs({
      company: makeCompany({ jobIds: ["job_a", "job_b"] }),
      jobs: [
        makeJob("job_a", {
          title: "Engineer",
          location: "Remote",
          sourceJobId: "posting_a",
          canonicalUrl: "https://jobs.example.com/a",
        }),
        makeJob("job_b", {
          title: "Designer",
          location: "London",
          sourceJobId: "posting_b",
          canonicalUrl: "https://jobs.example.com/b",
        }),
      ],
    });

    expect(groups).toEqual([]);
  });

  it("returns no groups for a company with fewer than two jobs", () => {
    expect(
      projectCompanyDuplicateJobs({
        company: makeCompany({ jobIds: ["job_a"] }),
        jobs: [makeJob("job_a")],
      }),
    ).toEqual([]);
  });
});
