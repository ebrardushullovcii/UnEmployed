import type { JobRequirementAssessment } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import { createSeed } from "../workspace-service.test-fixtures";
import {
  type BuildMatchDimensionsAssessmentInput,
  buildMatchDimensionsAssessment,
} from "./matching-dimensions";

function createRequirement(
  status: JobRequirementAssessment["status"],
  index: number,
): JobRequirementAssessment {
  return {
    id: `requirement_${index}`,
    category: "skill",
    label: `Requirement ${index}`,
    importance: "required",
    status,
    jobEvidence: `Listing evidence ${index}`,
    resumeEvidence: [],
    explanation: `Evidence explanation ${index}`,
  };
}

function createInput(
  overrides: Partial<BuildMatchDimensionsAssessmentInput> = {},
): BuildMatchDimensionsAssessmentInput {
  const seed = createSeed();
  return {
    posting: {
      ...seed.savedJobs[0]!,
      detailQuality: "detail_enriched",
    },
    searchPreferences: seed.searchPreferences,
    requirements: [
      createRequirement("supported", 1),
      createRequirement("supported", 2),
    ],
    matchesRole: true,
    roleFamilyMismatch: false,
    roleFamilyUnclear: false,
    matchesLocation: true,
    matchesWorkMode: true,
    isPreferredCompany: true,
    ...overrides,
  };
}

describe("match dimensions", () => {
  test("explains exact role, aligned preferences, low effort, and supportability confidence", () => {
    const dimensions = buildMatchDimensionsAssessment(createInput());

    expect(dimensions.roleSuitability).toMatchObject({
      state: "exact",
      evidence: [
        { source: "listing", label: "Listing title" },
        { source: "preference", label: "Saved target roles" },
      ],
    });
    expect(dimensions.preferenceAlignment.state).toBe("aligned");
    expect(dimensions.applicationEffort.level).toBe("low");
    expect(dimensions.evidenceConfidence).toMatchObject({
      level: "high",
      supportedCount: 2,
      missingCount: 0,
      unknownCount: 0,
    });
  });

  test("treats explicit negative evidence as supportable rather than low-confidence", () => {
    const dimensions = buildMatchDimensionsAssessment(
      createInput({
        requirements: [
          createRequirement("missing", 1),
          createRequirement("conflict", 2),
        ],
      }),
    );

    expect(dimensions.evidenceConfidence).toMatchObject({
      level: "high",
      missingCount: 1,
      conflictCount: 1,
      unknownCount: 0,
    });
    expect(dimensions.evidenceConfidence.explanation).toContain(
      "not positive fit",
    );
  });

  test("downgrades a matching title without supported required core evidence", () => {
    for (const status of ["missing", "partial", "unknown"] as const) {
      const dimensions = buildMatchDimensionsAssessment(
        createInput({ requirements: [createRequirement(status, 1)] }),
      );
      expect(dimensions.roleSuitability.state).toBe("adjacent");
      const requirementEvidence = dimensions.roleSuitability.evidence.find(
        (entry) => entry.label === "Required: Requirement 1",
      );
      expect(requirementEvidence?.source).toBe("listing");
      expect(requirementEvidence?.detail).toContain(status);
    }

    const cardOnlyWithoutRequirements = buildMatchDimensionsAssessment(
      createInput({
        posting: {
          ...createInput().posting,
          detailQuality: "card_only",
        },
        requirements: [],
      }),
    );

    expect(cardOnlyWithoutRequirements.roleSuitability.state).toBe("adjacent");
  });

  test("turns an explicit required work-authorization conflict into a role conflict", () => {
    const requirement = {
      ...createRequirement("conflict", 1),
      category: "work_authorization" as const,
    };
    const dimensions = buildMatchDimensionsAssessment(
      createInput({ requirements: [requirement] }),
    );

    expect(dimensions.roleSuitability.state).toBe("conflict");
    const requirementEvidence = dimensions.roleSuitability.evidence.find(
      (entry) => entry.label === "Required: Requirement 1",
    );
    expect(requirementEvidence?.source).toBe("listing");
    expect(requirementEvidence?.detail).toContain("conflict");
  });

  test("does not let supported eligibility evidence certify an exact role fit", () => {
    const requirement = {
      ...createRequirement("supported", 1),
      category: "work_authorization" as const,
    };
    const dimensions = buildMatchDimensionsAssessment(
      createInput({ requirements: [requirement] }),
    );

    expect(dimensions.roleSuitability).toMatchObject({
      state: "adjacent",
    });
  });

  test("separates role conflict from mixed preference alignment", () => {
    const dimensions = buildMatchDimensionsAssessment(
      createInput({
        matchesRole: false,
        roleFamilyMismatch: true,
        matchesLocation: true,
        matchesWorkMode: false,
        isPreferredCompany: false,
      }),
    );

    expect(dimensions.roleSuitability.state).toBe("conflict");
    expect(dimensions.preferenceAlignment.state).toBe("mixed");
  });

  test("keeps a non-preferred company neutral when it is the only saved preference", () => {
    const base = createInput();
    const dimensions = buildMatchDimensionsAssessment({
      ...base,
      searchPreferences: {
        ...base.searchPreferences,
        locations: [],
        workModes: [],
        seniorityLevels: [],
        employmentTypes: [],
        companyWhitelist: ["Preferred Co"],
      },
      matchesLocation: true,
      matchesWorkMode: true,
      isPreferredCompany: false,
    });

    expect(dimensions.preferenceAlignment.state).toBe("unknown");
    expect(dimensions.preferenceAlignment.explanation).toContain("neutral");
  });

  test("evaluates saved seniority and employment type only when listing fields are present", () => {
    const base = createInput();
    const searchPreferences = {
      ...base.searchPreferences,
      locations: [],
      workModes: [],
      companyWhitelist: [],
      seniorityLevels: ["senior"],
      employmentTypes: ["full-time"],
    };
    const aligned = buildMatchDimensionsAssessment({
      ...base,
      searchPreferences,
      posting: {
        ...base.posting,
        seniority: "Senior",
        employmentType: "Full-time",
      },
    });
    const conflict = buildMatchDimensionsAssessment({
      ...base,
      searchPreferences,
      posting: {
        ...base.posting,
        seniority: "Junior",
        employmentType: "Contract",
      },
    });
    const unknown = buildMatchDimensionsAssessment({
      ...base,
      searchPreferences,
      posting: {
        ...base.posting,
        seniority: null,
        employmentType: null,
      },
    });

    expect(aligned.preferenceAlignment.state).toBe("aligned");
    expect(conflict.preferenceAlignment.state).toBe("conflict");
    expect(unknown.preferenceAlignment.state).toBe("unknown");
    expect(unknown.preferenceAlignment.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Seniority comparison" }),
        expect.objectContaining({ label: "Employment-type comparison" }),
      ]),
    );
  });

  test("uses Easy Apply only for effort and recognizes redirect and consent checkpoints", () => {
    const base = createInput();
    const low = buildMatchDimensionsAssessment(base);
    const moderate = buildMatchDimensionsAssessment({
      ...base,
      posting: {
        ...base.posting,
        applyPath: "external_redirect",
        easyApplyEligible: false,
      },
    });
    const high = buildMatchDimensionsAssessment({
      ...base,
      posting: {
        ...base.posting,
        screeningHints: {
          ...base.posting.screeningHints,
          requiresConsentInterrupt: true,
          requiresConsentInterruptKind: "signup",
        },
      },
    });
    const unknown = buildMatchDimensionsAssessment({
      ...base,
      posting: {
        ...base.posting,
        applyPath: "unknown",
        easyApplyEligible: false,
      },
    });
    const inconsistentEasy = buildMatchDimensionsAssessment({
      ...base,
      posting: {
        ...base.posting,
        applyPath: "easy_apply",
        easyApplyEligible: false,
      },
    });
    const inconsistentUnknown = buildMatchDimensionsAssessment({
      ...base,
      posting: {
        ...base.posting,
        applyPath: "unknown",
        easyApplyEligible: true,
      },
    });

    expect(low.applicationEffort.level).toBe("low");
    expect(moderate.applicationEffort.level).toBe("moderate");
    expect(high.applicationEffort.level).toBe("high");
    expect(unknown.applicationEffort.level).toBe("unknown");
    expect(inconsistentEasy.applicationEffort.level).toBe("unknown");
    expect(inconsistentUnknown.applicationEffort.level).toBe("unknown");
  });

  test("defaults confidence to unavailable when card-only detail has no extracted requirements", () => {
    const base = createInput();
    const dimensions = buildMatchDimensionsAssessment({
      ...base,
      posting: { ...base.posting, detailQuality: "card_only" },
      requirements: [],
    });

    expect(dimensions.evidenceConfidence).toMatchObject({
      level: "unavailable",
      supportedCount: 0,
      partialCount: 0,
      missingCount: 0,
      unknownCount: 0,
      conflictCount: 0,
    });
  });
});
