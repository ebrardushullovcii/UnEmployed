import type {
  CandidateProfile,
  JobPosting,
  JobRequirementAssessment,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import { createSeed } from "../workspace-service.test-fixtures";
import {
  buildFitRecommendation,
  buildRequirementEvidenceAssessment,
} from "./matching-requirements";

function buildAssessment(input: {
  profile?: Partial<CandidateProfile>;
  posting?: Partial<JobPosting>;
}) {
  const seed = createSeed();
  return buildRequirementEvidenceAssessment({
    profile: {
      ...seed.profile,
      ...input.profile,
    },
    posting: {
      ...seed.savedJobs[0]!,
      title: "Senior Software Engineer",
      description: "Build reliable software for customers.",
      keySkills: [],
      minimumQualifications: [],
      preferredQualifications: [],
      responsibilities: [],
      ...input.posting,
    },
    locationCompatibility: "compatible",
    workModeCompatibility: "compatible",
    hasLocationPreferences: false,
    hasWorkModePreferences: false,
  });
}

describe("location requirement labels", () => {
  test("never renders a dangling label when the listing states no location", () => {
    const seed = createSeed();
    const requirements = buildRequirementEvidenceAssessment({
      profile: seed.profile,
      posting: { ...seed.savedJobs[0]!, location: "" },
      locationCompatibility: "unknown",
      workModeCompatibility: "unknown",
      hasLocationPreferences: true,
      hasWorkModePreferences: false,
    });
    const location = requirements.find(
      (requirement) =>
        requirement.category === "location" &&
        requirement.label.startsWith("Location"),
    );

    expect(location?.label).toBe("Location (not stated in listing)");
    expect(location?.status).toBe("unknown");
    expect(location?.explanation).toBe(
      "The listing does not state a location, so it could not be compared with the saved search areas.",
    );

    const stated = buildRequirementEvidenceAssessment({
      profile: seed.profile,
      posting: { ...seed.savedJobs[0]!, location: "Austin, TX" },
      locationCompatibility: "compatible",
      workModeCompatibility: "unknown",
      hasLocationPreferences: true,
      hasWorkModePreferences: false,
    }).find(
      (requirement) =>
        requirement.category === "location" &&
        requirement.label.startsWith("Location"),
    );
    expect(stated?.label).toBe("Location: Austin, TX");
  });
});

describe("structured requirement evidence extraction", () => {
  test("reads a requirements section flattened into compact inline text", () => {
    const requirements = buildAssessment({
      posting: {
        description:
          "Role: Own lifecycle marketing. What You'll Do: - Build campaigns - Report results Candidate Requirements: - Experience with Salesforce is required - Proven lifecycle email experience.",
      },
    });

    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "skill",
          importance: "required",
          label: "Salesforce",
        }),
      ]),
    );
  });

  test("maps location compatibility states onto truthful requirement evidence", () => {
    const seed = createSeed();
    const buildLocationRequirement = (
      locationCompatibility: "compatible" | "incompatible" | "unknown",
      profileOverrides?: Partial<CandidateProfile>,
    ) =>
      buildRequirementEvidenceAssessment({
        profile: { ...seed.profile, ...profileOverrides },
        posting: {
          ...seed.savedJobs[0]!,
          title: "Senior Software Engineer",
          description: "Build reliable software for customers.",
          keySkills: [],
          minimumQualifications: [],
          preferredQualifications: [],
          responsibilities: [],
        },
        locationCompatibility,
        workModeCompatibility: "compatible",
        hasLocationPreferences: true,
        hasWorkModePreferences: false,
      }).find(
        (requirement) =>
          requirement.category === "location" &&
          requirement.label.startsWith("Location:"),
      )!;

    const compatible = buildLocationRequirement("compatible");
    expect(compatible.status).toBe("supported");
    expect(compatible.explanation).toContain(
      "is compatible with the saved search area",
    );

    const unknownFit = buildLocationRequirement("unknown");
    expect(unknownFit.status).toBe("unknown");
    expect(unknownFit.explanation).toContain(
      "does not specify enough geographic detail to verify it against the saved search areas",
    );

    const relocatableConflict = buildLocationRequirement("incompatible");
    expect(relocatableConflict.status).toBe("unknown");
    expect(relocatableConflict.explanation).toBe(
      "The listing location is outside the saved search area; relocation needs confirmation.",
    );

    // Outside the saved area and unwilling to move still is not a blocker on
    // its own: the listing may be doable from home, so it sinks rather than
    // being thrown away.
    const settledMiss = buildLocationRequirement("incompatible", {
      workEligibility: {
        ...seed.profile.workEligibility,
        willingToRelocate: false,
      },
    });
    expect(settledMiss.status).toBe("unknown");
    expect(settledMiss.explanation).toBe(
      "The listing location is outside the saved search area; relocation needs confirmation.",
    );
  });

  test("blocks a location only when it is out of reach or the person excluded it", () => {
    const seed = createSeed();
    const buildLocationRequirement = (extra: {
      locationReach?: "unknown" | "outside_area";
      locationExcluded?: boolean;
      willingToRelocate?: boolean | null;
    }) =>
      buildRequirementEvidenceAssessment({
        profile: {
          ...seed.profile,
          workEligibility: {
            ...seed.profile.workEligibility,
            willingToRelocate: extra.willingToRelocate ?? false,
          },
        },
        posting: {
          ...seed.savedJobs[0]!,
          title: "Senior Software Engineer",
          location: "Madrid, Spain",
        },
        locationCompatibility: "incompatible",
        workModeCompatibility: "compatible",
        hasLocationPreferences: true,
        hasWorkModePreferences: false,
        locationReach: extra.locationReach,
        locationExcluded: extra.locationExcluded,
      }).find(
        (requirement) =>
          requirement.category === "location" &&
          requirement.label.startsWith("Location:"),
      )!;

    // On site, elsewhere, and relocation ruled out: there is no way to do it.
    const outOfReach = buildLocationRequirement({
      locationReach: "outside_area",
    });
    expect(outOfReach.status).toBe("conflict");
    expect(outOfReach.explanation).toBe(
      "The listing is on site outside the saved search area and the profile rules out relocation.",
    );

    // The same place, but the person is open to moving.
    expect(
      buildLocationRequirement({
        locationReach: "outside_area",
        willingToRelocate: true,
      }).status,
    ).toBe("unknown");

    const excluded = buildLocationRequirement({ locationExcluded: true });
    expect(excluded.status).toBe("conflict");
    expect(excluded.explanation).toBe(
      "The listing location is one you asked the search to leave out.",
    );
  });

  test("never blocks a listing for a work mode the person ticked", () => {
    const seed = createSeed();
    const buildWorkModeRequirement = (input: {
      workModeCompatibility: "compatible" | "conflict" | "unknown";
      workModeExcluded?: boolean;
    }) =>
      buildRequirementEvidenceAssessment({
        profile: seed.profile,
        posting: {
          ...seed.savedJobs[0]!,
          title: "Marketing Manager",
          location: "Chicago, IL",
          workMode: ["hybrid"],
        },
        locationCompatibility: "compatible",
        workModeCompatibility: input.workModeCompatibility,
        hasLocationPreferences: false,
        hasWorkModePreferences: true,
        workModeExcluded: input.workModeExcluded,
      }).find((requirement) => requirement.category === "work_mode")!;

    expect(
      buildWorkModeRequirement({ workModeCompatibility: "compatible" }).status,
    ).toBe("supported");

    // Not ticked is a preference miss, not a blocker.
    const notTicked = buildWorkModeRequirement({
      workModeCompatibility: "conflict",
    });
    expect(notTicked.status).toBe("missing");
    expect(notTicked.explanation).toBe(
      "The listing work mode is not one you ticked, so it ranks lower rather than being thrown out.",
    );

    const excluded = buildWorkModeRequirement({
      workModeCompatibility: "conflict",
      workModeExcluded: true,
    });
    expect(excluded.status).toBe("conflict");
    expect(excluded.explanation).toBe(
      "You asked the search to leave this work mode out.",
    );
  });

  test("preserves Go when a structured qualification lists Go with another technology", () => {
    const requirements = buildAssessment({
      profile: {
        skills: ["Go", "Kubernetes"],
        skillGroups: {
          coreSkills: ["Go", "Kubernetes"],
          tools: ["Kubernetes"],
          languagesAndFrameworks: ["Go"],
          softSkills: [],
          highlightedSkills: [],
        },
        experiences: [],
        projects: [],
      },
      posting: {
        description:
          "We go beyond customer expectations and improve net revenue retention.",
        minimumQualifications: [
          "Go and Kubernetes are required for backend services.",
        ],
      },
    });

    expect(requirements.find(({ label }) => label === "Go")).toMatchObject({
      importance: "required",
      status: "supported",
      jobEvidence: "Go and Kubernetes are required for backend services.",
    });
    expect(
      requirements.find(({ label }) => label === "Kubernetes"),
    ).toMatchObject({ importance: "required", status: "supported" });
  });

  test("keeps explicit SQL and Salesforce requirements separate from adjacent database names", () => {
    const requirements = buildAssessment({
      profile: {
        skills: ["PostgreSQL", "MySQL"],
        skillGroups: {
          coreSkills: ["PostgreSQL", "MySQL"],
          tools: ["PostgreSQL", "MySQL"],
          languagesAndFrameworks: [],
          softSkills: [],
          highlightedSkills: [],
        },
        experiences: [],
        projects: [],
      },
      posting: {
        title: "Technical Customer Success Manager",
        minimumQualifications: [
          "Advanced SQL and Salesforce reporting are required.",
        ],
      },
    });

    expect(requirements.find(({ label }) => label === "SQL")).toMatchObject({
      importance: "required",
      status: "missing",
    });
    expect(
      requirements.find(({ label }) => label === "Salesforce"),
    ).toMatchObject({ importance: "required", status: "missing" });
  });

  test("does not promote arbitrary technology nouns in descriptive prose to requirements", () => {
    const requirements = buildAssessment({
      posting: {
        title: "Go-to-Market Systems Engineer",
        description:
          "Our customers use Go, React, and Figma. We go beyond expectations, react to feedback, and track net revenue.",
        responsibilities: ["Coordinate go-live plans with customer teams."],
      },
    });

    expect(
      requirements.filter(({ label }) =>
        ["Go", "React", "Figma", ".NET"].includes(label),
      ),
    ).toEqual([]);
  });

  test("still accepts an explicitly marked description requirement", () => {
    const requirements = buildAssessment({
      profile: {
        skills: ["C#", ".NET"],
        skillGroups: {
          coreSkills: ["C#", ".NET"],
          tools: [],
          languagesAndFrameworks: ["C#", ".NET"],
          softSkills: [],
          highlightedSkills: [],
        },
        experiences: [],
        projects: [],
      },
      posting: {
        description:
          "Requirements\nYou must have production experience with C# and .NET services.",
      },
    });

    expect(requirements.find(({ label }) => label === "C#")).toMatchObject({
      importance: "required",
      status: "supported",
    });
    expect(requirements.find(({ label }) => label === ".NET")).toMatchObject({
      importance: "required",
      status: "supported",
    });
  });

  test("grounds customer-success capabilities in structured listing and resume evidence", () => {
    const seed = createSeed();
    const requirements = buildAssessment({
      profile: {
        headline: "Customer Success Manager",
        skills: ["Customer onboarding", "QBRs"],
        skillGroups: {
          coreSkills: ["Customer onboarding", "QBRs"],
          tools: [],
          languagesAndFrameworks: [],
          softSkills: [],
          highlightedSkills: [],
        },
        experiences: [
          {
            ...seed.profile.experiences[0]!,
            id: "experience_customer_success",
            title: "Customer Success Manager",
            summary: "Owned a portfolio of enterprise customer accounts.",
            achievements: [
              "Onboarded customers and led QBRs for enterprise accounts.",
              "Drove product adoption and managed customer renewals while resolving customer escalations.",
            ],
            skills: ["Customer onboarding", "QBRs"],
          },
        ],
        projects: [],
      },
      posting: {
        title: "Customer Success Manager",
        minimumQualifications: [
          "Experience leading customer onboarding and QBRs.",
        ],
        responsibilities: [
          "Drive product adoption, manage customer renewals, and resolve customer escalations.",
        ],
      },
    });

    expect(
      requirements
        .filter(({ label }) =>
          [
            "Customer onboarding",
            "Customer adoption",
            "Renewals",
            "Quarterly business reviews (QBRs)",
            "Customer escalations",
          ].includes(label),
        )
        .map(({ label, status }) => ({ label, status })),
    ).toEqual([
      { label: "Customer onboarding", status: "supported" },
      {
        label: "Quarterly business reviews (QBRs)",
        status: "supported",
      },
      { label: "Customer adoption", status: "supported" },
      { label: "Renewals", status: "supported" },
      { label: "Customer escalations", status: "supported" },
    ]);
  });

  test("does not confuse internal operations verbs with customer-success capabilities", () => {
    const requirements = buildAssessment({
      posting: {
        title: "People Operations Manager",
        responsibilities: [
          "Support employee onboarding and adopt engineering standards.",
          "Renew TLS certificates and escalate deployment failures.",
        ],
      },
    });

    expect(
      requirements.filter(({ label }) =>
        [
          "Customer onboarding",
          "Customer adoption",
          "Renewals",
          "Quarterly business reviews (QBRs)",
          "Customer escalations",
        ].includes(label),
      ),
    ).toEqual([]);
  });

  test("grounds product-design capabilities while rejecting backend lookalikes", () => {
    const seed = createSeed();
    const supported = buildAssessment({
      profile: {
        headline: "Senior Product Designer",
        skills: ["Figma", "Design systems", "Prototyping", "Accessibility"],
        skillGroups: {
          coreSkills: ["Design systems", "Prototyping", "Accessibility"],
          tools: ["Figma"],
          languagesAndFrameworks: [],
          softSkills: [],
          highlightedSkills: [],
        },
        experiences: [
          {
            ...seed.profile.experiences[0]!,
            id: "experience_product_design",
            title: "Senior Product Designer",
            summary: "Built an accessible design system in Figma.",
            achievements: [
              "Conducted user research, user interviews, and usability testing.",
              "Created interactive prototypes for complex user flows.",
            ],
            skills: ["Figma", "Design systems", "Prototyping", "Accessibility"],
          },
        ],
        projects: [],
      },
      posting: {
        title: "Senior Product Designer",
        keySkills: ["Figma", "Design systems", "Prototyping", "Accessibility"],
        minimumQualifications: ["Conduct user research and usability testing."],
        responsibilities: ["Create interactive prototypes for new user flows."],
      },
    });
    const lookalikes = buildAssessment({
      posting: {
        title: "Senior Backend Engineer",
        description:
          "Our design team uses Figma and makes reports accessible to finance.",
        responsibilities: [
          "Prototype backend services, research database options, use system design, and keep dashboards accessible.",
        ],
      },
    });
    const designLabels = [
      "User research",
      "Prototyping",
      "Design systems",
      "Figma",
      "Accessibility",
    ];

    expect(
      supported
        .filter(({ label }) => designLabels.includes(label))
        .every(({ status }) => status === "supported"),
    ).toBe(true);
    expect(
      supported.filter(({ label }) => designLabels.includes(label)),
    ).toHaveLength(5);
    expect(
      lookalikes.filter(({ label }) => designLabels.includes(label)),
    ).toEqual([]);
  });

  test("grounds singular component-library achievements without treating bare Storybook as proof", () => {
    const seed = createSeed();
    const posting = {
      title: "Senior Frontend Engineer - Design Systems",
      minimumQualifications: [
        "Experience building or maintaining a design system or shared component library.",
      ],
    };
    const baseProfile = {
      skills: ["React", "TypeScript", "Storybook"],
      skillGroups: {
        coreSkills: ["React", "TypeScript", "Storybook"],
        tools: ["Storybook"],
        languagesAndFrameworks: ["React", "TypeScript"],
        softSkills: [],
        highlightedSkills: ["React", "TypeScript"],
      },
      projects: [],
    };
    const supported = buildAssessment({
      profile: {
        ...baseProfile,
        experiences: [
          {
            ...seed.profile.experiences[0]!,
            id: "experience_frontend_component_library",
            title: "Senior Frontend Engineer",
            summary: null,
            achievements: [
              "Built an accessible component library with Storybook and automated axe checks.",
            ],
            skills: ["React", "TypeScript"],
          },
        ],
      },
      posting,
    });
    const bareStorybook = buildAssessment({
      profile: {
        ...baseProfile,
        experiences: [],
      },
      posting,
    });
    const supportedDesignSystems = supported.find(
      ({ label }) => label === "Design systems",
    );

    expect(supportedDesignSystems).toMatchObject({
      importance: "required",
      status: "supported",
      jobEvidence:
        "Experience building or maintaining a design system or shared component library.",
    });
    expect(supportedDesignSystems?.resumeEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKind: "experience",
          detail:
            "Built an accessible component library with Storybook and automated axe checks.",
        }),
      ]),
    );
    expect(
      bareStorybook.find(({ label }) => label === "Design systems"),
    ).toMatchObject({ status: "missing", resumeEvidence: [] });
  });
});

describe("fit recommendation rationale wording", () => {
  const requirement = (
    overrides: Partial<JobRequirementAssessment>,
  ): JobRequirementAssessment => ({
    id: "requirement_1",
    category: "skill",
    label: "TypeScript",
    importance: "required",
    status: "missing",
    jobEvidence: "TypeScript experience required.",
    resumeEvidence: [],
    explanation: "No matching resume evidence was located.",
    ...overrides,
  });

  test("keeps the resume-evidence sentence for resume-backed categories", () => {
    expect(
      buildFitRecommendation({
        score: 50,
        requirements: [requirement({})],
      }).rationale,
    ).toBe("TypeScript is not yet supported by explicit resume evidence.");
  });

  test("never asks a resume to prove work mode, location, or work authorization", () => {
    const cases: readonly [Partial<JobRequirementAssessment>, string][] = [
      [
        {
          category: "work_mode",
          label: "Work mode: remote",
          status: "unknown",
        },
        "Work mode: remote — not stated clearly enough to compare with your preferred work modes.",
      ],
      [
        {
          category: "work_mode",
          label: "Work mode: onsite",
          status: "missing",
        },
        "Work mode: onsite — does not match your preferred work modes.",
      ],
      [
        {
          category: "location",
          label: "Location: Berlin, Germany",
          status: "unknown",
        },
        "The listing location could not be compared with the saved search areas yet.",
      ],
      [
        {
          category: "location",
          label: "Location: Berlin, Germany",
          status: "missing",
        },
        "This job is in Berlin, Germany, outside your saved search areas.",
      ],
      [
        {
          category: "work_authorization",
          label: "Work authorization without sponsorship",
          status: "unknown",
        },
        "Work authorization is not stated in your profile yet.",
      ],
      [
        {
          category: "work_authorization",
          label: "Work authorization without sponsorship",
          status: "missing",
        },
        "Work authorization does not match what this listing requires.",
      ],
    ];

    for (const [overrides, expected] of cases) {
      const { rationale } = buildFitRecommendation({
        score: 50,
        requirements: [requirement(overrides)],
      });
      expect(rationale, overrides.label).toBe(expected);
      expect(rationale, overrides.label).not.toContain("resume evidence");
    }
  });
});
