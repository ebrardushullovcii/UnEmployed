import { describe, expect, test } from "vitest";

import {
  ApplicationRecordSchema,
  type ApplicationRecord,
  type ApplicationStatus,
  CompanyEntitySchema,
  type CompanyEntity,
  type SavedJob,
  SavedJobSchema,
} from "@unemployed/contracts";
import {
  applyCompanyIntelligenceMutation,
  normalizeCompanyName,
  normalizeEmployerDomain,
  projectCompanyApplicationHistory,
  projectCompanyDuplicateJobs,
  projectCompanyOpenings,
  reconcileCompanies,
  reviewCompanyMerge,
  setCompanyPreference,
} from "./company-intelligence-operations";

const now = "2026-08-15T10:00:00.000Z";
const later = "2026-08-15T11:00:00.000Z";
const latest = "2026-08-15T12:00:00.000Z";

function makeCompany(overrides: Partial<CompanyEntity> = {}): CompanyEntity {
  return CompanyEntitySchema.parse({
    id: "company_1",
    canonicalName: "Acme Inc",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeJob(input: {
  id: string;
  company: string;
  employerDomain?: string | null;
  status?: ApplicationStatus;
  postedAt?: string | null;
  discoveredAt?: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  sourceJobId?: string;
  canonicalUrl?: string;
  title?: string;
  location?: string | null;
}): SavedJob {
  return SavedJobSchema.parse({
    id: input.id,
    source: "target_site",
    sourceJobId: input.sourceJobId ?? `source_${input.id}`,
    discoveryMethod: "catalog_seed",
    canonicalUrl: input.canonicalUrl ?? `https://jobs.example.com/${input.id}`,
    applicationUrl: null,
    title: input.title ?? "Engineer",
    company: input.company,
    location: input.location ?? "Remote",
    workMode: ["remote"],
    applyPath: "easy_apply",
    easyApplyEligible: true,
    postedAt: input.postedAt ?? null,
    postedAtText: null,
    providerUpdatedAt: null,
    discoveredAt: input.discoveredAt ?? "2026-08-01T00:00:00.000Z",
    firstSeenAt: input.firstSeenAt ?? null,
    lastSeenAt: input.lastSeenAt ?? null,
    lastVerifiedActiveAt: null,
    salaryText: null,
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
    employerDomain: input.employerDomain ?? null,
    atsProvider: null,
    status: input.status ?? "ready_for_review",
    matchAssessment: { score: 80 },
    provenance: [],
  });
}

function makeApplicationRecord(input: {
  id: string;
  jobId: string;
  company: string;
  status?: ApplicationStatus;
  lastUpdatedAt?: string;
}): ApplicationRecord {
  return ApplicationRecordSchema.parse({
    id: input.id,
    jobId: input.jobId,
    title: "Engineer",
    company: input.company,
    status: input.status ?? "submitted",
    lastActionLabel: "Submitted",
    nextActionLabel: null,
    lastUpdatedAt: input.lastUpdatedAt ?? "2026-08-10T00:00:00.000Z",
  });
}

function defaultCreateCompanyId(identity: {
  normalizedName: string;
  normalizedDomain: string | null;
}): string {
  const domain = identity.normalizedDomain ?? "no_domain";
  return `company_${identity.normalizedName.replace(/\s+/gu, "_")}_${domain}`;
}

describe("normalizeCompanyName and normalizeEmployerDomain", () => {
  test("normalizes names for exact comparison", () => {
    expect(normalizeCompanyName("Acme Inc.")).toBe("acme inc");
    expect(normalizeCompanyName("  Acme, Inc.  ")).toBe("acme inc");
    expect(normalizeCompanyName("Northwind Labs")).toBe("northwind labs");
  });

  test("normalizes domains for exact comparison", () => {
    expect(normalizeEmployerDomain("Acme.com")).toBe("acme.com");
    expect(normalizeEmployerDomain("www.acme.com")).toBe("acme.com");
    expect(normalizeEmployerDomain("acme.com.")).toBe("acme.com");
  });
});

describe("reconcileCompanies", () => {
  test("creates a company from a job with a domain", () => {
    const result = reconcileCompanies({
      companies: [],
      jobs: [
        makeJob({
          id: "job_1",
          company: "Acme Inc",
          employerDomain: "acme.com",
          firstSeenAt: "2026-08-02T00:00:00.000Z",
          lastSeenAt: "2026-08-03T00:00:00.000Z",
        }),
      ],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(1);
    const company = result.companies[0]!;
    expect(company.id).toBe("company_acme_inc_acme.com");
    expect(company.canonicalName).toBe("Acme Inc");
    expect(company.domains).toEqual([
      { domain: "acme.com", primary: true, verifiedAt: null },
    ]);
    expect(company.jobIds).toEqual(["job_1"]);
    expect(company.applicationRecordIds).toEqual([]);
    expect(company.preference).toBe("neutral");
    expect(company.aliases).toEqual([]);
    expect(company.sourceHistory).toEqual([
      {
        id: "target_site",
        sourceId: "target_site",
        firstSeenAt: "2026-08-02T00:00:00.000Z",
        lastSeenAt: "2026-08-03T00:00:00.000Z",
        applicationRecordIds: [],
      },
    ]);
    expect(CompanyEntitySchema.safeParse(result.companies[0]).success).toBe(
      true,
    );
    expect(result.summary.createdCompanyIds).toEqual([
      "company_acme_inc_acme.com",
    ]);
  });

  test("merges jobs sharing an exact normalized domain into one company", () => {
    const result = reconcileCompanies({
      companies: [],
      jobs: [
        makeJob({
          id: "job_1",
          company: "Acme Inc",
          employerDomain: "www.acme.com",
        }),
        makeJob({
          id: "job_2",
          company: "Acme Corporation",
          employerDomain: "Acme.com",
        }),
      ],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(1);
    const company = result.companies[0]!;
    expect(company.canonicalName).toBe("Acme Inc");
    expect(company.jobIds).toEqual(["job_1", "job_2"]);
    expect(company.domains).toEqual([
      { domain: "acme.com", primary: true, verifiedAt: null },
    ]);
    expect(company.aliases).toEqual([
      {
        alias: "Acme Corporation",
        normalized: "acme corporation",
        confidence: 1,
      },
    ]);
    expect(result.summary.createdCompanyIds).toHaveLength(1);
  });

  test("matches by exact normalized name when no domain is present", () => {
    const result = reconcileCompanies({
      companies: [],
      jobs: [
        makeJob({ id: "job_1", company: "Acme Inc." }),
        makeJob({ id: "job_2", company: "Acme Inc" }),
      ],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]!.jobIds).toEqual(["job_1", "job_2"]);
    expect(result.summary.createdCompanyIds).toHaveLength(1);
  });

  test("never silently merges ambiguous domain identities", () => {
    const existing = [
      makeCompany({
        id: "c1",
        canonicalName: "Acme Inc",
        domains: [{ domain: "acme.com", primary: true, verifiedAt: null }],
      }),
      makeCompany({
        id: "c2",
        canonicalName: "Acme Corp",
        domains: [{ domain: "acme.com", primary: true, verifiedAt: null }],
      }),
    ];

    const result = reconcileCompanies({
      companies: existing,
      jobs: [
        makeJob({
          id: "job_1",
          company: "Acme Inc",
          employerDomain: "acme.com",
        }),
      ],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(2);
    const primary = result.companies.find((company) => company.id === "c1")!;
    expect(primary.jobIds).toEqual([]);
    expect(primary.mergeReviewCandidates).toEqual([
      {
        candidateCompanyId: "c2",
        reason: 'Multiple companies share the employer domain "acme.com".',
        decision: "pending",
        decidedAt: null,
        requiresUserDecision: true,
      },
    ]);
    expect(result.summary.ambiguousEvidenceCount).toBe(1);
  });

  test("creates a pending merge candidate for a near-name conflict", () => {
    const result = reconcileCompanies({
      companies: [
        makeCompany({ id: "c1", canonicalName: "Acme Inc" }),
        makeCompany({ id: "c2", canonicalName: "Acme" }),
      ],
      jobs: [],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const primary = result.companies.find((company) => company.id === "c1")!;
    expect(primary.mergeReviewCandidates).toHaveLength(1);
    expect(primary.mergeReviewCandidates[0]!.candidateCompanyId).toBe("c2");
    expect(primary.mergeReviewCandidates[0]!.decision).toBe("pending");
    expect(primary.mergeReviewCandidates[0]!.reason).toContain("Similar");
    expect(primary.mergeReviewCandidates[0]!.requiresUserDecision).toBe(true);
  });

  test("creates a pending merge candidate for a near-domain conflict", () => {
    const result = reconcileCompanies({
      companies: [
        makeCompany({
          id: "c1",
          canonicalName: "Acme Inc",
          domains: [{ domain: "acme.com", primary: true, verifiedAt: null }],
        }),
        makeCompany({
          id: "c2",
          canonicalName: "Acme Corp",
          domains: [{ domain: "acme.io", primary: true, verifiedAt: null }],
        }),
      ],
      jobs: [],
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const primary = result.companies.find((company) => company.id === "c1")!;
    expect(primary.mergeReviewCandidates).toHaveLength(1);
    expect(primary.mergeReviewCandidates[0]!.candidateCompanyId).toBe("c2");
    expect(primary.mergeReviewCandidates[0]!.reason).toContain(
      "Similar employer domain",
    );
  });

  test("reconciles application records by name and links source history", () => {
    const result = reconcileCompanies({
      companies: [],
      jobs: [makeJob({ id: "job_1", company: "Northwind Labs" })],
      applicationRecords: [
        makeApplicationRecord({
          id: "app_1",
          jobId: "job_1",
          company: "Northwind Labs",
        }),
      ],
      now,
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(1);
    const company = result.companies[0]!;
    expect(company.jobIds).toEqual(["job_1"]);
    expect(company.applicationRecordIds).toEqual(["app_1"]);
    expect(company.sourceHistory[0]!.sourceId).toBe("target_site");
    expect(company.sourceHistory[0]!.applicationRecordIds).toEqual(["app_1"]);
  });

  test("is idempotent and never mutates its inputs", () => {
    const companies = [makeCompany({ id: "c1", canonicalName: "Acme Inc" })];
    const companiesSnapshot = JSON.stringify(companies);
    const jobs = [
      makeJob({ id: "job_1", company: "Acme Inc", employerDomain: "acme.com" }),
    ];
    const jobsSnapshot = JSON.stringify(jobs);

    const first = reconcileCompanies({
      companies,
      jobs,
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = reconcileCompanies({
      companies: first.companies,
      jobs,
      applicationRecords: [],
      now,
      createCompanyId: defaultCreateCompanyId,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.companies).toEqual(first.companies);
    expect(second.companies[0]!.jobIds).toEqual(["job_1"]);
    expect(second.companies[0]!.updatedAt).toBe(now);
    expect(JSON.stringify(companies)).toBe(companiesSnapshot);
    expect(JSON.stringify(jobs)).toBe(jobsSnapshot);
  });

  test("fails with a structured failure when createCompanyId collides", () => {
    const result = reconcileCompanies({
      companies: [makeCompany({ id: "existing", canonicalName: "Acme Inc" })],
      jobs: [makeJob({ id: "job_1", company: "Northwind Labs" })],
      applicationRecords: [],
      now,
      createCompanyId: () => "existing",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("invalid_input");
    expect(result.failure.message).toContain("already exists");
  });

  test("fails with a structured failure for an invalid now", () => {
    const result = reconcileCompanies({
      companies: [],
      jobs: [makeJob({ id: "job_1", company: "Acme Inc" })],
      applicationRecords: [],
      now: "not-a-date",
      createCompanyId: defaultCreateCompanyId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("invalid_input");
  });
});

describe("setCompanyPreference", () => {
  test("sets the preference, clears the reason, and stamps caller now", () => {
    const companies = [
      makeCompany({
        id: "c1",
        preference: "follow",
        preferenceReason: "Inferred from volume.",
      }),
    ];

    const result = setCompanyPreference({
      companies,
      input: { companyId: "c1", preference: "exclude" },
      now: later,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.company.preference).toBe("exclude");
    expect(result.company.preferenceReason).toBeNull();
    expect(result.company.updatedAt).toBe(later);
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toEqual(result.company);
    expect(CompanyEntitySchema.safeParse(result.company).success).toBe(true);
  });

  test("fails when the company does not exist", () => {
    const result = setCompanyPreference({
      companies: [makeCompany({ id: "c1" })],
      input: { companyId: "missing", preference: "exclude" },
      now,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("company_not_found");
  });
});

describe("reviewCompanyMerge", () => {
  function companiesWithCandidate(): CompanyEntity[] {
    return [
      makeCompany({
        id: "primary",
        canonicalName: "Acme Inc",
        mergeReviewCandidates: [
          {
            candidateCompanyId: "secondary",
            reason: "Similar company name.",
            decision: "pending",
            decidedAt: null,
            requiresUserDecision: true,
          },
        ],
      }),
      makeCompany({ id: "secondary", canonicalName: "Acme" }),
    ];
  }

  test("rejects a merge candidate explicitly", () => {
    const result = reviewCompanyMerge({
      companies: companiesWithCandidate(),
      input: {
        companyId: "primary",
        candidateId: "secondary",
        decision: "rejected",
      },
      now: later,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.merged).toBeNull();
    expect(result.companies).toHaveLength(2);
    const primary = result.companies.find(
      (company) => company.id === "primary",
    )!;
    expect(primary.mergeReviewCandidates[0]!.decision).toBe("rejected");
    expect(primary.mergeReviewCandidates[0]!.decidedAt).toBe(later);
    expect(primary.updatedAt).toBe(later);
    expect(
      CompanyEntitySchema.array().safeParse(result.companies).success,
    ).toBe(true);
  });

  test("accepts a merge and preserves ids and aliases deterministically", () => {
    const primary = makeCompany({
      id: "primary",
      canonicalName: "Acme Inc",
      aliases: [
        {
          alias: "Acme Incorporated",
          normalized: "acme incorporated",
          confidence: 1,
        },
      ],
      domains: [{ domain: "acme.com", primary: true, verifiedAt: null }],
      contacts: [
        {
          id: "contact_1",
          name: "Ada",
          role: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      notes: [
        { id: "note_1", body: "Initial note", createdAt: now, updatedAt: now },
      ],
      sourceHistory: [
        {
          id: "target_site",
          sourceId: "target_site",
          firstSeenAt: "2026-08-01T00:00:00.000Z",
          lastSeenAt: "2026-08-02T00:00:00.000Z",
          applicationRecordIds: ["app_1"],
        },
      ],
      jobIds: ["job_1"],
      applicationRecordIds: ["app_1"],
      mergeReviewCandidates: [
        {
          candidateCompanyId: "secondary",
          reason: "Similar company name.",
          decision: "pending",
          decidedAt: null,
          requiresUserDecision: true,
        },
      ],
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    const secondary = makeCompany({
      id: "secondary",
      canonicalName: "Acme",
      domains: [{ domain: "acme.io", primary: true, verifiedAt: null }],
      contacts: [
        {
          id: "contact_2",
          name: "Grace",
          role: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      notes: [
        { id: "note_2", body: "Second note", createdAt: now, updatedAt: now },
      ],
      sourceHistory: [
        {
          id: "target_site",
          sourceId: "target_site",
          firstSeenAt: "2026-08-01T00:00:00.000Z",
          lastSeenAt: "2026-08-05T00:00:00.000Z",
          applicationRecordIds: ["app_2"],
        },
      ],
      jobIds: ["job_2"],
      applicationRecordIds: ["app_2"],
      createdAt: "2026-08-02T00:00:00.000Z",
    });

    const result = reviewCompanyMerge({
      companies: [primary, secondary],
      input: {
        companyId: "primary",
        candidateId: "secondary",
        decision: "accepted",
      },
      now: latest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(1);
    const merged = result.merged!;
    expect(merged.id).toBe("primary");
    expect(merged.canonicalName).toBe("Acme Inc");
    expect(merged.jobIds).toEqual(["job_1", "job_2"]);
    expect(merged.applicationRecordIds).toEqual(["app_1", "app_2"]);
    expect(merged.contacts.map((contact) => contact.id)).toEqual([
      "contact_1",
      "contact_2",
    ]);
    expect(merged.notes.map((note) => note.id)).toEqual(["note_1", "note_2"]);
    expect(merged.sourceHistory).toEqual([
      {
        id: "target_site",
        sourceId: "target_site",
        firstSeenAt: "2026-08-01T00:00:00.000Z",
        lastSeenAt: "2026-08-05T00:00:00.000Z",
        applicationRecordIds: ["app_1", "app_2"],
      },
    ]);
    expect(merged.aliases.map((alias) => alias.normalized)).toEqual([
      "acme incorporated",
      "acme",
    ]);
    expect(merged.domains).toEqual([
      { domain: "acme.com", primary: true, verifiedAt: null },
      { domain: "acme.io", primary: false, verifiedAt: null },
    ]);
    expect(merged.createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(merged.updatedAt).toBe(latest);
    expect(merged.mergeReviewCandidates).toEqual([]);
    expect(result.company).toEqual(merged);
    expect(CompanyEntitySchema.safeParse(merged).success).toBe(true);
  });

  test("remaps merge candidates on other companies after an accept", () => {
    const result = reviewCompanyMerge({
      companies: [
        makeCompany({
          id: "primary",
          canonicalName: "Acme Inc",
          mergeReviewCandidates: [
            {
              candidateCompanyId: "secondary",
              reason: "Similar company name.",
              decision: "pending",
              decidedAt: null,
              requiresUserDecision: true,
            },
          ],
        }),
        makeCompany({ id: "secondary", canonicalName: "Acme" }),
        makeCompany({
          id: "third",
          canonicalName: "Acme Tools",
          mergeReviewCandidates: [
            {
              candidateCompanyId: "secondary",
              reason: "Similar company name.",
              decision: "pending",
              decidedAt: null,
              requiresUserDecision: true,
            },
          ],
        }),
      ],
      input: {
        companyId: "primary",
        candidateId: "secondary",
        decision: "accepted",
      },
      now: latest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.companies).toHaveLength(2);
    const third = result.companies.find((company) => company.id === "third")!;
    expect(third.mergeReviewCandidates[0]!.candidateCompanyId).toBe("primary");
    expect(third.updatedAt).toBe(latest);
  });

  test("fails when the candidate was already decided", () => {
    const companies = [
      makeCompany({
        id: "primary",
        canonicalName: "Acme Inc",
        mergeReviewCandidates: [
          {
            candidateCompanyId: "secondary",
            reason: "Similar company name.",
            decision: "rejected",
            decidedAt: now,
            requiresUserDecision: true,
          },
        ],
      }),
      makeCompany({ id: "secondary", canonicalName: "Acme" }),
    ];

    const result = reviewCompanyMerge({
      companies,
      input: {
        companyId: "primary",
        candidateId: "secondary",
        decision: "accepted",
      },
      now: later,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("candidate_already_decided");
  });

  test("fails when the company or candidate is missing", () => {
    const missingCompany = reviewCompanyMerge({
      companies: companiesWithCandidate(),
      input: {
        companyId: "missing",
        candidateId: "secondary",
        decision: "accepted",
      },
      now,
    });
    expect(missingCompany.ok).toBe(false);
    if (missingCompany.ok) return;
    expect(missingCompany.failure.code).toBe("company_not_found");

    const missingCandidate = reviewCompanyMerge({
      companies: companiesWithCandidate(),
      input: {
        companyId: "primary",
        candidateId: "missing",
        decision: "accepted",
      },
      now,
    });
    expect(missingCandidate.ok).toBe(false);
    if (missingCandidate.ok) return;
    expect(missingCandidate.failure.code).toBe("candidate_not_found");
  });
});

describe("projectCompanyOpenings", () => {
  test("splits linked jobs into current and previous openings", () => {
    const company = makeCompany({
      id: "c1",
      canonicalName: "Acme Inc",
      jobIds: ["job_open", "job_closed"],
    });

    const projection = projectCompanyOpenings({
      company,
      jobs: [
        makeJob({
          id: "job_open",
          company: "Acme Inc",
          status: "interview",
          postedAt: "2026-08-05T00:00:00.000Z",
        }),
        makeJob({
          id: "job_closed",
          company: "Acme Inc",
          status: "rejected",
          postedAt: "2026-08-10T00:00:00.000Z",
        }),
        makeJob({
          id: "job_unlinked",
          company: "Other",
          status: "submitted",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    expect(projection.companyId).toBe("c1");
    expect(projection.current.map((job) => job.id)).toEqual(["job_open"]);
    expect(projection.previous.map((job) => job.id)).toEqual(["job_closed"]);
    expect(projection.currentCount).toBe(1);
    expect(projection.previousCount).toBe(1);
    expect(projection.totalCount).toBe(2);
    expect(projection.lastOpenedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(SavedJobSchema.safeParse(projection.current[0]).success).toBe(true);
  });

  test("sorts openings most recent first", () => {
    const company = makeCompany({
      id: "c1",
      jobIds: ["job_a", "job_b"],
    });

    const projection = projectCompanyOpenings({
      company,
      jobs: [
        makeJob({
          id: "job_a",
          company: "Acme Inc",
          status: "ready_for_review",
          postedAt: "2026-07-01T00:00:00.000Z",
        }),
        makeJob({
          id: "job_b",
          company: "Acme Inc",
          status: "submitted",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    expect(projection.current.map((job) => job.id)).toEqual(["job_b", "job_a"]);
  });
});

describe("projectCompanyApplicationHistory", () => {
  test("projects linked records newest first with status counts", () => {
    const company = makeCompany({
      id: "c1",
      applicationRecordIds: ["app_old", "app_new"],
    });

    const projection = projectCompanyApplicationHistory({
      company,
      applicationRecords: [
        makeApplicationRecord({
          id: "app_old",
          jobId: "job_1",
          company: "Acme Inc",
          status: "rejected",
          lastUpdatedAt: "2026-08-01T00:00:00.000Z",
        }),
        makeApplicationRecord({
          id: "app_new",
          jobId: "job_2",
          company: "Acme Inc",
          status: "interview",
          lastUpdatedAt: "2026-08-10T00:00:00.000Z",
        }),
        makeApplicationRecord({
          id: "app_unlinked",
          jobId: "job_3",
          company: "Other",
          status: "submitted",
          lastUpdatedAt: "2026-08-09T00:00:00.000Z",
        }),
      ],
    });

    expect(projection.companyId).toBe("c1");
    expect(projection.records.map((record) => record.id)).toEqual([
      "app_new",
      "app_old",
    ]);
    expect(projection.totalCount).toBe(2);
    expect(projection.statusCounts.interview).toBe(1);
    expect(projection.statusCounts.rejected).toBe(1);
    expect(projection.statusCounts.submitted).toBe(0);
    expect(projection.latestUpdatedAt).toBe("2026-08-10T00:00:00.000Z");
    expect(projection.earliestUpdatedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(
      ApplicationRecordSchema.safeParse(projection.records[0]).success,
    ).toBe(true);
  });

  test("returns empty counts when nothing is linked", () => {
    const projection = projectCompanyApplicationHistory({
      company: makeCompany({ id: "c1" }),
      applicationRecords: [],
    });

    expect(projection.records).toEqual([]);
    expect(projection.totalCount).toBe(0);
    expect(projection.latestUpdatedAt).toBeNull();
    expect(projection.earliestUpdatedAt).toBeNull();
    expect(projection.statusCounts.interview).toBe(0);
  });
});

describe("applyCompanyIntelligenceMutation", () => {
  function companiesWith(canonicalName = "Acme Inc"): CompanyEntity[] {
    return [
      makeCompany({
        id: "c1",
        canonicalName,
        contacts: [
          {
            id: "contact_1",
            name: "Ada",
            role: "Recruiter",
            email: "ada@acme.com",
            phone: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        notes: [
          {
            id: "note_1",
            body: "First call went well",
            createdAt: now,
            updatedAt: now,
          },
        ],
        salaryOfferEvidence: [
          {
            id: "evidence_1",
            kind: "offer",
            summary: "Verbal offer",
            currency: "USD",
            minimum: 190000,
            maximum: 190000,
            period: "year",
            offerStatus: "active",
            jobId: null,
            applicationRecordId: null,
            source: "manual",
            recordedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    ];
  }

  test("upserts a contact preserving the original createdAt", () => {
    const result = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: {
          type: "upsert_contact",
          contact: {
            id: "contact_1",
            name: "Ada Lovelace",
            role: "Senior recruiter",
            email: "ada@acme.com",
            phone: null,
            notes: null,
            createdAt: later,
            updatedAt: later,
          },
        },
      },
      now: latest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.companies).toHaveLength(1);
    const company = result.company;
    expect(company.contacts).toHaveLength(1);
    expect(company.contacts[0]).toMatchObject({
      id: "contact_1",
      name: "Ada Lovelace",
      role: "Senior recruiter",
    });
    // The caller-provided createdAt is ignored on an upsert; the original is kept.
    expect(company.contacts[0]!.createdAt).toBe(now);
    expect(company.contacts[0]!.updatedAt).toBe(latest);
    expect(company.updatedAt).toBe(latest);
    expect(CompanyEntitySchema.safeParse(company).success).toBe(true);
  });

  test("adds a new contact when the id does not exist", () => {
    const result = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: {
          type: "upsert_contact",
          contact: {
            id: "contact_2",
            name: "Grace",
            role: null,
            email: null,
            phone: null,
            notes: null,
            createdAt: later,
            updatedAt: later,
          },
        },
      },
      now: latest,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.company.contacts.map((contact) => contact.id)).toEqual([
      "contact_1",
      "contact_2",
    ]);
  });

  test("removes a contact and fails when the contact is missing", () => {
    const removed = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: { type: "remove_contact", contactId: "contact_1" },
      },
      now: latest,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.company.contacts).toEqual([]);

    const missing = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: { type: "remove_contact", contactId: "missing" },
      },
      now: latest,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.failure.code).toBe("contact_not_found");
  });

  test("adds and removes notes", () => {
    const added = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: {
          type: "add_note",
          note: {
            id: "note_2",
            body: "Second call scheduled",
            createdAt: later,
            updatedAt: later,
          },
        },
      },
      now: latest,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.company.notes.map((note) => note.id)).toEqual([
      "note_1",
      "note_2",
    ]);

    const removed = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: { type: "remove_note", noteId: "note_1" },
      },
      now: latest,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.company.notes).toEqual([]);
  });

  test("upserts and removes salary/offer evidence", () => {
    const updated = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: {
          type: "upsert_salary_offer_evidence",
          evidence: {
            id: "evidence_1",
            kind: "offer",
            summary: "Signed offer",
            currency: "USD",
            minimum: 195000,
            maximum: 195000,
            period: "year",
            offerStatus: "accepted",
            jobId: null,
            applicationRecordId: null,
            source: "manual",
            recordedAt: later,
            createdAt: later,
            updatedAt: later,
          },
        },
      },
      now: latest,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.company.salaryOfferEvidence).toHaveLength(1);
    expect(updated.company.salaryOfferEvidence[0]).toMatchObject({
      id: "evidence_1",
      summary: "Signed offer",
      offerStatus: "accepted",
    });
    expect(updated.company.salaryOfferEvidence[0]!.createdAt).toBe(now);

    const removed = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: now,
        mutation: {
          type: "remove_salary_offer_evidence",
          evidenceId: "evidence_1",
        },
      },
      now: latest,
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.company.salaryOfferEvidence).toEqual([]);
  });

  test("rejects a stale compare-and-swap timestamp", () => {
    const result = applyCompanyIntelligenceMutation({
      companies: companiesWith(),
      input: {
        companyId: "c1",
        expectedUpdatedAt: "2026-08-01T00:00:00.000Z",
        mutation: { type: "remove_note", noteId: "note_1" },
      },
      now: latest,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("company_changed");
  });

  test("fails for an unknown company and never mutates inputs", () => {
    const companies = companiesWith();
    const snapshot = JSON.stringify(companies);
    const missing = applyCompanyIntelligenceMutation({
      companies,
      input: {
        companyId: "missing",
        expectedUpdatedAt: now,
        mutation: { type: "remove_note", noteId: "note_1" },
      },
      now,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.failure.code).toBe("company_not_found");
    expect(JSON.stringify(companies)).toBe(snapshot);
  });
});

describe("projectCompanyDuplicateJobs", () => {
  test("flags jobs sharing a strong identity alias as exact duplicates", () => {
    const company = makeCompany({
      id: "c1",
      jobIds: ["job_a", "job_b", "job_c"],
    });
    const groups = projectCompanyDuplicateJobs({
      company,
      jobs: [
        makeJob({
          id: "job_a",
          company: "Acme Inc",
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.acme.com/posting_1",
        }),
        // Same source posting id but a different URL: still an exact duplicate.
        makeJob({
          id: "job_b",
          company: "Acme Inc",
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.acme.com/repost/posting_1",
        }),
        makeJob({
          id: "job_c",
          company: "Acme Inc",
          sourceJobId: "posting_3",
          canonicalUrl: "https://jobs.acme.com/posting_3",
        }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      kind: "exact",
      jobIds: ["job_a", "job_b"],
    });
  });

  test("flags same-title/company/location/posted-date postings as possible duplicates", () => {
    const company = makeCompany({
      id: "c1",
      jobIds: ["job_a", "job_b"],
    });
    const groups = projectCompanyDuplicateJobs({
      company,
      jobs: [
        makeJob({
          id: "job_a",
          company: "Acme Inc",
          sourceJobId: "posting_a",
          canonicalUrl: "https://jobs.acme.com/a",
          title: "Engineer",
          location: "Remote",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
        makeJob({
          id: "job_b",
          company: "Acme Inc",
          sourceJobId: "posting_b",
          canonicalUrl: "https://jobs.acme.com/b",
          title: "Engineer",
          location: "Remote",
          postedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("possible");
  });

  test("leaves unrelated postings alone", () => {
    const company = makeCompany({
      id: "c1",
      jobIds: ["job_a", "job_b"],
    });
    const groups = projectCompanyDuplicateJobs({
      company,
      jobs: [
        makeJob({
          id: "job_a",
          company: "Acme Inc",
          sourceJobId: "posting_a",
          canonicalUrl: "https://jobs.acme.com/a",
          title: "Engineer",
          location: "Remote",
        }),
        makeJob({
          id: "job_b",
          company: "Acme Inc",
          sourceJobId: "posting_b",
          canonicalUrl: "https://jobs.acme.com/b",
          title: "Designer",
          location: "London",
        }),
      ],
    });

    expect(groups).toEqual([]);
  });

  test("returns no groups for a company with fewer than two jobs", () => {
    expect(
      projectCompanyDuplicateJobs({
        company: makeCompany({ id: "c1", jobIds: ["job_a"] }),
        jobs: [makeJob({ id: "job_a", company: "Acme Inc" })],
      }),
    ).toEqual([]);
  });
});
