// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  ApplicationRecord,
  CompanyEntity,
  SavedJob,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyDetailScreen } from "./company-detail-screen";

afterEach(cleanup);

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
    jobIds: ["job_1"],
    applicationRecordIds: ["app_1"],
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

function makeRecord(id: string, overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id,
    jobId: "job_1",
    title: "Engineer",
    company: "Acme Inc",
    status: "submitted",
    lastActionLabel: "Submitted",
    nextActionLabel: null,
    lastUpdatedAt: now,
    lastAttemptState: "submitted",
    questionSummary: { total: 0, required: 0, answered: 0, unansweredRequired: 0 },
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
    ...overrides,
  };
}

function renderDetail(overrides: {
  company?: CompanyEntity;
  discoveryJobs?: readonly SavedJob[];
  onMutate?: ReturnType<typeof vi.fn>;
  onReviewMerge?: ReturnType<typeof vi.fn>;
  onSetPreference?: ReturnType<typeof vi.fn>;
  onOpenJob?: ReturnType<typeof vi.fn>;
  onOpenApplication?: ReturnType<typeof vi.fn>;
} = {}) {
  const company = overrides.company ?? makeCompany();
  const onMutate = overrides.onMutate ?? vi.fn(async () => {});
  const onReviewMerge = overrides.onReviewMerge ?? vi.fn(async () => {});
  const onSetPreference = overrides.onSetPreference ?? vi.fn(async () => {});
  const onOpenJob = overrides.onOpenJob ?? vi.fn();
  const onOpenApplication = overrides.onOpenApplication ?? vi.fn();
  render(
    <CompanyDetailScreen
      actionMessage={null}
      applicationRecords={[makeRecord("app_1")]}
      companies={[company]}
      company={company}
      companyId={company.id}
      discoveryJobs={overrides.discoveryJobs ?? [makeJob("job_1")]}
      isMergePending={() => false}
      isMutationPending={() => false}
      isPreferencePending={() => false}
      onBack={vi.fn()}
      onMutateCompanyIntelligence={onMutate}
      onNavigate={vi.fn()}
      onOpenApplication={onOpenApplication}
      onOpenJob={onOpenJob}
      onReviewCompanyMerge={onReviewMerge}
      onSetCompanyPreference={onSetPreference}
    />,
  );
  return { onMutate, onOpenApplication, onOpenJob, onReviewMerge, onSetPreference };
}

describe("CompanyDetailScreen", () => {
  it("aggregates current openings, application history, and links to each record", () => {
    const { onOpenJob, onOpenApplication } = renderDetail();

    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(screen.getByText("Openings (1)")).toBeTruthy();
    expect(screen.getByText("Applications (1)")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);
    expect(onOpenJob).toHaveBeenCalledWith("job_1");

    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[1]!);
    expect(onOpenApplication).toHaveBeenCalledWith("app_1");
  });

  it("detects duplicate postings and distinguishes exact from possible matches", () => {
    const company = makeCompany({
      jobIds: ["job_a", "job_b", "job_c"],
    });
    renderDetail({
      company,
      discoveryJobs: [
        makeJob("job_a", {
          title: "Engineer",
          location: "Remote",
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.example.com/a",
        }),
        // Same source posting id: exact duplicate.
        makeJob("job_b", {
          title: "Engineer",
          location: "Remote",
          sourceJobId: "posting_1",
          canonicalUrl: "https://jobs.example.com/b",
        }),
        makeJob("job_c", {
          title: "Designer",
          location: "London",
          sourceJobId: "posting_3",
          canonicalUrl: "https://jobs.example.com/c",
        }),
      ],
    });

    expect(screen.getByText("Duplicate jobs (1)")).toBeTruthy();
    expect(screen.getByText("Exact match")).toBeTruthy();
  });

  it("records contacts, notes, and salary/offer evidence through typed local mutations", () => {
    const company = makeCompany({
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
        { id: "note_1", body: "First call went well", createdAt: now, updatedAt: now },
      ],
      salaryOfferEvidence: [
        {
          id: "evidence_1",
          kind: "offer",
          summary: "Verbal offer 190k",
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
    });
    const { onMutate } = renderDetail({ company });

    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("First call went well")).toBeTruthy();
    expect(screen.getByText(/Verbal offer 190k/)).toBeTruthy();

    // Add a note through the visible form.
    fireEvent.change(screen.getByLabelText("New note"), {
      target: { value: "Second call scheduled" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const noteCommand = onMutate.mock.calls[0]?.[0] as {
      companyId: string;
      expectedUpdatedAt: string;
      mutation: { type: string; note: { body: string } };
    };
    expect(noteCommand.companyId).toBe("company_1");
    expect(noteCommand.expectedUpdatedAt).toBe(now);
    expect(noteCommand.mutation.type).toBe("add_note");
    expect(noteCommand.mutation.note.body).toBe("Second call scheduled");
    expect(noteCommand).not.toHaveProperty("mutation.submitAuthorized");

    // Remove the contact.
    fireEvent.click(screen.getByRole("button", { name: "Remove contact Ada" }));
    const removeCommand = onMutate.mock.calls[1]?.[0] as {
      mutation: { type: string; contactId: string };
    };
    expect(removeCommand.mutation.type).toBe("remove_contact");
    expect(removeCommand.mutation.contactId).toBe("contact_1");

    // Remove the evidence record.
    fireEvent.click(
      screen.getByRole("button", { name: "Remove salary or offer evidence" }),
    );
    const removeEvidence = onMutate.mock.calls[2]?.[0] as {
      mutation: { type: string; evidenceId: string };
    };
    expect(removeEvidence.mutation.type).toBe("remove_salary_offer_evidence");
    expect(removeEvidence.mutation.evidenceId).toBe("evidence_1");
  });

  it("lets the user merge or reject a pending duplicate candidate explicitly", () => {
    const company = makeCompany({
      mergeReviewCandidates: [
        {
          candidateCompanyId: "company_2",
          reason: "Similar company name.",
          decision: "pending",
          decidedAt: null,
          requiresUserDecision: true,
        },
      ],
    });
    const { onReviewMerge } = renderDetail({ company });

    expect(screen.getByText("Duplicate employer review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReviewMerge).toHaveBeenCalledWith({
      companyId: "company_1",
      candidateId: "company_2",
      decision: "rejected",
    });

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onReviewMerge).toHaveBeenCalledWith({
      companyId: "company_1",
      candidateId: "company_2",
      decision: "accepted",
    });
  });

  it("records an explicit user preference with no submission side effects", () => {
    const { onSetPreference } = renderDetail();

    fireEvent.change(screen.getByLabelText("Preference for Acme Inc"), {
      target: { value: "prefer" },
    });
    expect(onSetPreference).toHaveBeenCalledWith({
      companyId: "company_1",
      preference: "prefer",
    });
  });
});
