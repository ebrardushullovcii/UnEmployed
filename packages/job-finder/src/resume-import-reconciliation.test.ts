import { describe, expect, test } from "vitest";

import { ResumeImportFieldCandidateSchema } from "@unemployed/contracts";
import { reconcileCandidates } from "./internal/resume-import-reconciliation";
import { createSeed } from "./workspace-service.test-fixtures";
import { createStageCandidate } from "./workspace-service.resume-analysis.shared";

describe("resume import reconciliation", () => {
  test("turns material text-vs-vision disagreement into explicit review choices", () => {
    const seed = createSeed();
    const baseCandidate = {
      runId: "resume_import_run_1",
      target: { section: "identity" as const, key: "headline", recordId: null },
      label: "Headline",
      createdAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null,
    };
    const textCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: "Senior Software Engineer",
        sourceBlockIds: ["block_1"],
        confidence: 0.86,
        overall: 0.84,
        recommendation: "auto_apply",
      }),
      id: "candidate_text_headline",
      sourceKind: "model_identity_summary",
      resolution: "needs_review",
    });
    const visionCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: "Staff Platform Engineer",
        sourceBlockIds: [],
        confidence: 0.82,
        overall: 0.8,
        recommendation: "auto_apply",
      }),
      id: "candidate_vision_headline",
      sourceKind: "vision_omni",
      resolution: "needs_review",
      visualEvidence: [
        {
          branch: "vision",
          sourceFileKind: "pdf",
          pageNumber: 1,
          regionHint: "top headline",
          confidence: 0.82,
          uncertaintyNotes: [],
        },
      ],
    });

    const reconciled = reconcileCandidates(seed.profile, seed.searchPreferences, [
      textCandidate,
      visionCandidate,
    ]);
    const winner = reconciled.find(
      (candidate) => candidate.resolutionReason === "text_vs_visual_conflict_requires_review",
    );

    expect(winner?.resolution).toBe("needs_review");
    expect(winner?.conflictChoices?.map((choice) => choice.sourceLabel)).toEqual([
      "Document text",
      "Visual scan",
    ]);
    expect(winner?.conflictChoices?.find((choice) => choice.sourceLabel === "Document text")?.recommended).toBe(true);
    expect(winner?.conflictChoices?.find((choice) => choice.sourceLabel === "Visual scan")?.visualEvidence[0]).toMatchObject({
      branch: "vision",
      pageNumber: 1,
      regionHint: "top headline",
    });
    expect(winner?.alternatives).toEqual(["Staff Platform Engineer"]);
  });

  test("anchors full-name conflicts on grounded document text when vision reads a role headline as a name", () => {
    const seed = createSeed();
    const baseCandidate = {
      runId: "resume_import_run_name_conflict",
      target: { section: "identity" as const, key: "fullName", recordId: null },
      label: "Full name",
      createdAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null,
    };
    const textCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: "Aaron Murphy",
        sourceBlockIds: ["block_name"],
        confidence: 0.99,
        overall: 0.97,
        recommendation: "auto_apply",
      }),
      id: "candidate_text_full_name",
      sourceKind: "parser_literal",
      resolution: "auto_applied",
      resolvedAt: "2026-04-10T10:00:00.000Z",
    });
    const visionCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: "Senior Software Engineer",
        sourceBlockIds: [],
        confidence: 0.72,
        overall: 0.72,
        recommendation: "needs_review",
      }),
      id: "candidate_vision_full_name",
      sourceKind: "vision_omni",
      resolution: "needs_review",
      visualEvidence: [
        {
          branch: "vision",
          sourceFileKind: "pdf",
          pageNumber: 1,
          regionHint: "top headline",
          confidence: 0.72,
          uncertaintyNotes: [],
        },
      ],
    });

    const reconciled = reconcileCandidates(seed.profile, seed.searchPreferences, [
      visionCandidate,
      textCandidate,
    ]);
    const reviewCandidate = reconciled.find(
      (candidate) => candidate.resolutionReason === "text_vs_visual_conflict_requires_review",
    );

    expect(reviewCandidate).toMatchObject({
      id: "candidate_text_full_name",
      sourceKind: "parser_literal",
      value: "Aaron Murphy",
      resolution: "needs_review",
    });
    expect(
      reviewCandidate?.conflictChoices?.map((choice) => ({
        sourceLabel: choice.sourceLabel,
        value: choice.value,
        recommended: choice.recommended,
      })),
    ).toEqual([
      { sourceLabel: "Document text", value: "Aaron Murphy", recommended: true },
      { sourceLabel: "Visual scan", value: "Senior Software Engineer", recommended: false },
    ]);
    expect(reconciled.find((candidate) => candidate.id === "candidate_vision_full_name")?.resolution).toBe("rejected");
  });

  test("keeps complementary text and vision skill lists auto-applied instead of conflict-gating them", () => {
    const seed = createSeed();
    const baseCandidate = {
      runId: "resume_import_run_skills",
      target: { section: "skill" as const, key: "skills", recordId: null },
      label: "Skills",
      createdAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null,
    };
    const textCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: ["React", "TypeScript"],
        sourceBlockIds: ["block_skills"],
        confidence: 0.78,
        overall: 0.7,
        recommendation: "needs_review",
      }),
      id: "candidate_text_skills",
      sourceKind: "model_background",
      resolution: "needs_review",
    });
    const visionCandidate = ResumeImportFieldCandidateSchema.parse({
      ...baseCandidate,
      ...createStageCandidate({
        target: baseCandidate.target,
        label: baseCandidate.label,
        value: ["React", "Node.js"],
        sourceBlockIds: [],
        confidence: 0.76,
        overall: 0.68,
        recommendation: "needs_review",
      }),
      id: "candidate_vision_skills",
      sourceKind: "vision_omni",
      resolution: "needs_review",
      visualEvidence: [
        {
          branch: "vision",
          sourceFileKind: "pdf",
          pageNumber: 1,
          regionHint: "skills section",
          confidence: 0.76,
          uncertaintyNotes: [],
        },
      ],
    });

    const reconciled = reconcileCandidates(seed.profile, seed.searchPreferences, [
      textCandidate,
      visionCandidate,
    ]);

    expect(reconciled.filter((candidate) => candidate.resolution === "auto_applied")).toHaveLength(2);
    expect(reconciled.some((candidate) => candidate.resolutionReason === "text_vs_visual_conflict_requires_review")).toBe(false);
  });

  test("does not merge skill record candidates through the generic list path", () => {
    const seed = createSeed();
    const skillRecordCandidate = ResumeImportFieldCandidateSchema.parse({
      runId: "resume_import_run_skill_record",
      ...createStageCandidate({
        target: { section: "skill", key: "record", recordId: null },
        label: "Skill",
        value: "React",
        sourceBlockIds: [],
        confidence: 0.76,
        overall: 0.7,
        recommendation: "needs_review",
      }),
      id: "candidate_skill_record",
      sourceKind: "vision_omni",
      resolution: "needs_review",
      createdAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null,
    });

    const reconciled = reconcileCandidates(seed.profile, seed.searchPreferences, [skillRecordCandidate]);

    expect(reconciled[0]).toMatchObject({
      id: "candidate_skill_record",
      resolution: "needs_review",
    });
  });

  test("auto-applies grounded fresh-start education records", () => {
    const baseSeed = createSeed();
    const seed = {
      ...baseSeed,
      profile: {
        ...baseSeed.profile,
        id: "candidate_fresh_start",
        firstName: "New",
        lastName: "Candidate",
        fullName: "New Candidate",
        headline: "Import your resume to begin",
        summary:
          "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
        currentLocation: "Set your preferred location",
        education: [],
      },
    };
    const educationCandidate = ResumeImportFieldCandidateSchema.parse({
      runId: "resume_import_run_education",
      ...createStageCandidate({
        target: { section: "education", key: "record", recordId: "education_1" },
        label: "Florida State University",
        value: {
          schoolName: "Florida State University",
          degree: "Bachelor’s Degree",
          fieldOfStudy: "Computer Science and Physics",
          location: null,
          startDate: "May 2011",
          endDate: "Sept 2015",
          summary: null,
        },
        sourceBlockIds: ["block_education"],
        confidence: 0.8,
        overall: 0.68,
        recommendation: "needs_review",
      }),
      id: "candidate_education_record",
      sourceKind: "model_background",
      resolution: "needs_review",
      createdAt: "2026-04-10T10:00:00.000Z",
      resolvedAt: null,
    });

    const reconciled = reconcileCandidates(seed.profile, seed.searchPreferences, [educationCandidate]);

    expect(reconciled[0]).toMatchObject({
      id: "candidate_education_record",
      resolution: "auto_applied",
    });
  });
});
