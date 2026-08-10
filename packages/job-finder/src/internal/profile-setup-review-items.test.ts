import { describe, expect, test } from "vitest";
import {
  ResumeImportFieldCandidateSchema,
  type ResumeImportFieldCandidate,
} from "@unemployed/contracts";
import { createSeed } from "../workspace-service.test-support";
import { buildProfileSetupReviewItems } from "./profile-setup-review-items";

const createdAt = "2026-07-16T10:00:00.000Z";

function candidate(input: {
  id: string;
  key: string;
  label: string;
  recordId?: string | null;
  evidenceText?: string | null;
  section?: ResumeImportFieldCandidate["target"]["section"];
  resolution?: ResumeImportFieldCandidate["resolution"];
  value: ResumeImportFieldCandidate["value"];
}): ResumeImportFieldCandidate {
  return ResumeImportFieldCandidateSchema.parse({
    id: input.id,
    runId: "resume_import_education",
    target: {
      section: input.section ?? "education",
      key: input.key,
      recordId: input.recordId ?? null,
    },
    label: input.label,
    sourceKind: "model_background",
    value: input.value,
    confidence: 0.9,
    evidenceText: input.evidenceText ?? null,
    resolution: input.resolution ?? "needs_review",
    createdAt,
  });
}

describe("buildProfileSetupReviewItems", () => {
  test("does not create duplicate scalar blockers after a complete education record is confirmed", () => {
    const seed = createSeed();
    const candidates = [
      candidate({
        id: "education_record",
        key: "record",
        label: "Education",
        recordId: "education_1",
        resolution: "auto_applied",
        value: {
          schoolName: "University of Prishtina",
          degree: "Bachelor of Science",
          fieldOfStudy: "Computer Science",
          location: "Prishtina, Kosovo",
        },
      }),
      candidate({ id: "education_school", key: "institution", label: "School name", value: "University of Prishtina" }),
      candidate({ id: "education_degree", key: "degree", label: "Degree", value: "Bachelor of Science" }),
      candidate({ id: "education_field", key: "fieldOfStudy", label: "Field of study", value: "Computer Science" }),
      candidate({ id: "education_location", key: "location", label: "Location", value: "Prishtina, Kosovo" }),
    ];

    const items = buildProfileSetupReviewItems({
      currentState: null,
      documentBundle: null,
      now: createdAt,
      profile: seed.profile,
      candidates,
      searchPreferences: seed.searchPreferences,
    });

    expect(items.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["School name", "Degree", "Field of study", "Location"]),
    );
  });

  test("keeps an uncovered education scalar visible for review", () => {
    const seed = createSeed();
    const items = buildProfileSetupReviewItems({
      currentState: null,
      documentBundle: null,
      now: createdAt,
      profile: seed.profile,
      candidates: [
        candidate({
          id: "education_record",
          key: "record",
          label: "Education",
          recordId: "education_1",
          value: { schoolName: "University of Prishtina", degree: "Bachelor of Science" },
        }),
        candidate({ id: "education_field", key: "fieldOfStudy", label: "Field of study", value: "Computer Science" }),
      ],
      searchPreferences: seed.searchPreferences,
    });

    expect(items.map((item) => item.label)).toContain("Field of study");
  });

  test("omits saved suggestions and resolves an older pending item once its value is saved", () => {
    const seed = createSeed();
    const locationCandidate = candidate({
      id: "saved_location",
      section: "location",
      key: "currentLocation",
      label: "Location",
      value: "Paris, France",
    });
    const initialItems = buildProfileSetupReviewItems({
      currentState: null,
      documentBundle: null,
      now: createdAt,
      profile: seed.profile,
      candidates: [locationCandidate],
      searchPreferences: seed.searchPreferences,
    });

    expect(initialItems.find((item) => item.sourceCandidateId === locationCandidate.id)?.status).toBe("pending");

    const unchangedItems = buildProfileSetupReviewItems({
      currentState: { ...seed.profileSetupState, reviewItems: initialItems },
      documentBundle: null,
      now: "2026-07-16T10:30:00.000Z",
      profile: seed.profile,
      candidates: [locationCandidate],
      searchPreferences: seed.searchPreferences,
    });

    expect(unchangedItems.find((item) => item.sourceCandidateId === locationCandidate.id)).toMatchObject({
      status: "pending",
      resolvedAt: null,
    });

    const savedProfile = { ...seed.profile, currentLocation: "Paris, France" };
    const refreshedItems = buildProfileSetupReviewItems({
      currentState: { ...seed.profileSetupState, reviewItems: initialItems },
      documentBundle: null,
      now: "2026-07-16T11:00:00.000Z",
      profile: savedProfile,
      candidates: [locationCandidate],
      searchPreferences: seed.searchPreferences,
    });

    expect(refreshedItems.find((item) => item.sourceCandidateId === locationCandidate.id)).toMatchObject({
      status: "confirmed",
      resolvedAt: "2026-07-16T11:00:00.000Z",
    });
    expect(
      buildProfileSetupReviewItems({
        currentState: null,
        documentBundle: null,
        now: createdAt,
        profile: savedProfile,
        candidates: [locationCandidate],
        searchPreferences: seed.searchPreferences,
      }).filter((item) => item.sourceCandidateId === locationCandidate.id),
    ).toHaveLength(0);
  });

  test("deduplicates repeated evidence lines in review snippets", () => {
    const seed = createSeed();
    const evidence = "Bachelor of Science in Computer Science";
    const items = buildProfileSetupReviewItems({
      currentState: null,
      documentBundle: null,
      now: createdAt,
      profile: seed.profile,
      candidates: [
        candidate({
          id: "education_degree_evidence",
          key: "degree",
          label: "Degree",
          value: evidence,
          evidenceText: `${evidence}\n  bachelor   of science in computer science  `,
        }),
      ],
      searchPreferences: seed.searchPreferences,
    });

    expect(items.find((item) => item.sourceCandidateId === "education_degree_evidence")?.sourceSnippet).toBe(evidence);
  });
});
