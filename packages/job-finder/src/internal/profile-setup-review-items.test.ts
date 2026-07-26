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
  resolution?: ResumeImportFieldCandidate["resolution"];
  value: ResumeImportFieldCandidate["value"];
}): ResumeImportFieldCandidate {
  return ResumeImportFieldCandidateSchema.parse({
    id: input.id,
    runId: "resume_import_education",
    target: {
      section: "education",
      key: input.key,
      recordId: input.recordId ?? null,
    },
    label: input.label,
    sourceKind: "model_background",
    value: input.value,
    confidence: 0.9,
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
});
