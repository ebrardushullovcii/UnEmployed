// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MatchAssessmentSchema } from "@unemployed/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { MatchEvidenceMatrix } from "./match-evidence-matrix";

afterEach(cleanup);

describe("MatchEvidenceMatrix", () => {
  it("shows five plain-language dimensions and keeps detailed evidence behind a disclosure", () => {
    const assessment = MatchAssessmentSchema.parse({
      scorerVersion: 3,
      contextFingerprint: null,
      postingFingerprint: null,
      score: 63,
      compensationFit: {
        state: "below_minimum",
        confidence: "high",
        minimumSalaryUsd: 120_000,
        listingMinimumAnnualUsd: 95_000,
        listingCurrency: "USD",
        explanation: "The listing minimum is below the saved USD minimum.",
      },
      dimensions: {
        roleSuitability: {
          state: "conflict",
          explanation: "The listing belongs to a different saved role family.",
          evidence: [
            {
              source: "listing",
              label: "Listing title",
              detail: "Account Executive",
            },
          ],
        },
        preferenceAlignment: {
          state: "mixed",
          explanation: "The location aligns, but the work mode does not.",
          evidence: [
            {
              source: "preference",
              label: "Work-mode comparison",
              detail: "On-site compared with remote.",
            },
          ],
        },
        applicationEffort: {
          level: "low",
          explanation: "The listing exposes an in-platform application path.",
          evidence: [
            {
              source: "listing",
              label: "Application path",
              detail: "easy apply",
            },
          ],
        },
        evidenceConfidence: {
          level: "high",
          explanation:
            "The detailed listing supports most extracted comparisons; this is evidence coverage, not hiring confidence.",
          evidence: [
            {
              source: "derived",
              label: "Requirement supportability",
              detail: "2 of 2 requirements have explicit evidence.",
            },
          ],
          supportedCount: 1,
          missingCount: 1,
        },
      },
      reasons: ["The role title matches."],
      gaps: ["FastAPI is not present."],
      recommendation: "skip",
      recommendationRationale:
        "A hard role conflict needs review before this job is considered.",
      requirements: [
        {
          id: "requirement_skill_python",
          category: "skill",
          label: "Python",
          importance: "required",
          status: "supported",
          jobEvidence: "Production Python experience is required.",
          resumeEvidence: [
            {
              sourceKind: "experience",
              sourceId: "experience_1",
              label: "Senior Engineer at Example",
              detail: "Built Python automation services.",
            },
          ],
          explanation: "The resume contains explicit Python evidence.",
        },
        {
          id: "requirement_skill_fastapi",
          category: "skill",
          label: "FastAPI",
          importance: "required",
          status: "missing",
          jobEvidence: "Production FastAPI experience is required.",
          resumeEvidence: [],
          explanation: "No FastAPI evidence was found.",
        },
      ],
    });

    const view = render(<MatchEvidenceMatrix assessment={assessment} />);
    const region = view.getByRole("region", { name: "Fit breakdown" });
    const terms = within(region)
      .getAllByRole("term")
      .map((term) => term.textContent);

    expect(terms).toEqual([
      "Role and requirements",
      "Your preferences",
      "Compensation",
      "Application effort",
      "Evidence coverage",
    ]);
    expect(
      within(view.getByTestId("fit-dimension-role-suitability")).getByText(
        "Role conflict",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-application-effort")).getByText(
        "Lower effort",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-compensation")).getByText(
        "Below minimum",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-evidence-confidence")).getByText(
        "High coverage",
      ),
    ).toBeTruthy();
    expect(view.getByText(/1 required item still needs evidence/)).toBeTruthy();
    expect(view.queryByTestId("legacy-fit-summary")).toBeNull();

    const dimensions = view.getByTestId("fit-dimensions");
    expect(dimensions.className).toContain("min-w-0");
    expect(dimensions.className).not.toContain("grid-cols");

    const summary = view.getByText(
      "Review requirement evidence — 1 of 2 supported",
    );
    const disclosure = summary.closest("details") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
    expect(
      within(disclosure).getByText(
        /Production FastAPI experience is required\./,
      ),
    ).toBeTruthy();
    expect(
      within(disclosure).getByText("Built Python automation services."),
    ).toBeTruthy();
  });

  it("shows saved legacy reasons and gaps when detailed evidence is unavailable", () => {
    const assessment = MatchAssessmentSchema.parse({
      score: 52,
      reasons: ["The saved profile includes relevant frontend experience."],
      gaps: ["The listing asks for GraphQL evidence that was not found."],
    });
    const view = render(
      <MatchEvidenceMatrix
        assessment={assessment}
        showRecommendation={false}
      />,
    );
    const summary = view.getByTestId("legacy-fit-summary");

    expect(
      within(summary).getByText(
        "The saved profile includes relevant frontend experience.",
      ),
    ).toBeTruthy();
    expect(
      within(summary).getByText(
        "The listing asks for GraphQL evidence that was not found.",
      ),
    ).toBeTruthy();
    expect(within(summary).getByText("Why it may fit")).toBeTruthy();
    expect(within(summary).getByText("Questions to review")).toBeTruthy();
  });

  it("renders legacy unknown states literally without inventing positive evidence", () => {
    const assessment = MatchAssessmentSchema.parse({ score: 52 });
    const view = render(
      <MatchEvidenceMatrix
        assessment={assessment}
        showRecommendation={false}
      />,
    );

    expect(
      within(view.getByTestId("fit-dimension-role-suitability")).getByText(
        "Unknown",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-preference-alignment")).getByText(
        "Unknown",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-compensation")).getByText(
        "Pay unknown",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-application-effort")).getByText(
        "Unknown",
      ),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("fit-dimension-evidence-confidence")).getByText(
        "Unavailable",
      ),
    ).toBeTruthy();
    expect(view.queryByText("Strong fit")).toBeNull();
    expect(
      view.getByText(
        "Requirement-by-requirement evidence is unavailable for this listing.",
      ),
    ).toBeTruthy();
  });
});
