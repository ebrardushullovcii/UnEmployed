// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CompanyEntity } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompaniesScreen } from "./companies-screen";

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
    jobIds: [],
    applicationRecordIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderScreen(
  overrides: {
    companies?: readonly CompanyEntity[];
    onReviewCompanyMerge?: ReturnType<typeof vi.fn>;
    onSetCompanyPreference?: ReturnType<typeof vi.fn>;
    onNavigate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onReviewCompanyMerge = overrides.onReviewCompanyMerge ?? vi.fn();
  const onSetCompanyPreference = overrides.onSetCompanyPreference ?? vi.fn();
  const onNavigate = overrides.onNavigate ?? vi.fn();
  render(
    <CompaniesScreen
      actionMessage={null}
      companies={overrides.companies ?? [makeCompany()]}
      discoveryJobs={[]}
      isMergePending={() => false}
      isMutationPending={() => false}
      isPreferencePending={() => false}
      isRefreshPending={false}
      onMutateCompanyIntelligence={vi.fn()}
      onNavigate={onNavigate}
      onRefresh={vi.fn()}
      onReviewCompanyMerge={onReviewCompanyMerge}
      onSetCompanyPreference={onSetCompanyPreference}
    />,
  );
  return { onNavigate, onReviewCompanyMerge, onSetCompanyPreference };
}

describe("CompaniesScreen", () => {
  it("renders an empty state when no companies are reconciled yet", () => {
    renderScreen({ companies: [] });

    expect(screen.getByText("No companies yet")).toBeTruthy();
  });

  it("searches companies by name, alias, and domain and keeps the count visible", () => {
    renderScreen({
      companies: [
        makeCompany({
          id: "c1",
          canonicalName: "Acme Inc",
          aliases: [
            {
              alias: "Acme Corporation",
              normalized: "acme corporation",
              confidence: 1,
            },
          ],
          domains: [{ domain: "acme.com", primary: true, verifiedAt: null }],
        }),
        makeCompany({ id: "c2", canonicalName: "Northwind Labs" }),
      ],
    });

    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(screen.getByText("Northwind Labs")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "acme.com" },
    });
    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(screen.queryByText("Northwind Labs")).toBeNull();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "acme corporation" },
    });
    expect(screen.getByText("Acme Inc")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "northwind" },
    });
    expect(screen.queryByText("Acme Inc")).toBeNull();
    expect(screen.getByText("Northwind Labs")).toBeTruthy();
  });

  it("shows a no-match state without changing selection or filters", () => {
    renderScreen({
      companies: [makeCompany({ id: "c1", canonicalName: "Acme Inc" })],
    });

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzz no such company" },
    });

    expect(screen.getByText(/No companies match/)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Clear search" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("mounts one page at a time for a 500-plus company catalog", () => {
    const companies = Array.from({ length: 501 }, (_, index) =>
      makeCompany({
        id: `company_${index}`,
        canonicalName: `Company ${String(index).padStart(3, "0")}`,
      }),
    );
    renderScreen({ companies });

    expect(screen.getAllByTestId(/^company-card-/)).toHaveLength(40);
    expect(screen.getByText("Showing 1–40 of 501 companies")).toBeTruthy();
    expect(screen.getByText("Page 1 of 13")).toBeTruthy();
    expect(screen.getByText("Company 000")).toBeTruthy();
    expect(screen.queryByText("Company 040")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getAllByTestId(/^company-card-/)).toHaveLength(40);
    expect(screen.getByText("Showing 41–80 of 501 companies")).toBeTruthy();
    expect(screen.getByText("Company 040")).toBeTruthy();
    expect(screen.queryByText("Company 000")).toBeNull();
  });

  it("links a company card to its detail route", () => {
    const { onNavigate } = renderScreen({
      companies: [makeCompany({ id: "company_1", canonicalName: "Acme Inc" })],
    });

    fireEvent.click(screen.getByRole("button", { name: "View company" }));
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/companies/company_1");
  });

  it("surfaces pending merge candidates with explicit merge and reject controls", () => {
    const onReviewCompanyMerge = vi.fn();
    renderScreen({
      companies: [
        makeCompany({
          id: "c1",
          canonicalName: "Acme Inc",
          mergeReviewCandidates: [
            {
              candidateCompanyId: "c2",
              reason: "Similar company name.",
              decision: "pending",
              decidedAt: null,
              requiresUserDecision: true,
            },
          ],
        }),
        makeCompany({ id: "c2", canonicalName: "Acme" }),
      ],
      onReviewCompanyMerge,
    });

    expect(screen.getByText("Duplicate employer review")).toBeTruthy();
    expect(screen.getByText("Possible match: Acme")).toBeTruthy();
    expect(screen.getByText("1 merge review")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReviewCompanyMerge).toHaveBeenCalledWith({
      companyId: "c1",
      candidateId: "c2",
      decision: "rejected",
    });

    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onReviewCompanyMerge).toHaveBeenCalledWith({
      companyId: "c1",
      candidateId: "c2",
      decision: "accepted",
    });
  });

  it("records an explicit user preference for a company", () => {
    const onSetCompanyPreference = vi.fn();
    renderScreen({
      companies: [makeCompany({ id: "c1", canonicalName: "Acme Inc" })],
      onSetCompanyPreference,
    });

    fireEvent.change(screen.getByLabelText("Preference for Acme Inc"), {
      target: { value: "exclude" },
    });
    expect(onSetCompanyPreference).toHaveBeenCalledWith({
      companyId: "c1",
      preference: "exclude",
    });
  });
});
