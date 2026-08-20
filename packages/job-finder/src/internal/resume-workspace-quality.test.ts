import { describe, expect, test } from "vitest";

import type { ResumeDraft, ResumeDraftEntry } from "@unemployed/contracts";
import { ResumeDraftSchema } from "@unemployed/contracts";
import { ResumeGenerationStrategyPolicySchema } from "@unemployed/ai-providers";
import {
  buildResumeCoverageComparison,
  buildResumeDraftContentHash,
  sanitizeResumeDraft,
  validateResumeDraft,
} from "./resume-workspace-helpers";
import { createEntry } from "./resume-workspace-primitives";
import { createSeed } from "../workspace-service.test-support";

function createBullets(prefix: string, texts: string[]) {
  return texts.map((text, index) => ({
    id: `${prefix}_${index + 1}`,
    text,
    origin: "ai_generated" as const,
    locked: false,
    included: true,
    sourceRefs: [],
    updatedAt: "2026-03-20T10:04:00.000Z",
  }));
}

function createBaseDraft(): ResumeDraft {
  return {
    id: "resume_draft_job_ready",
    jobId: "job_ready",
    status: "draft",
    templateId: "classic_ats",
    identity: null,
    sections: [
      {
        id: "section_summary",
        kind: "summary",
        label: "Summary",
        text: "Grounded summary.",
        bullets: [],
        entries: [],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 0,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        text: null,
        bullets: createBullets("skill_bullet", ["Figma"]),
        entries: [],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 1,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
      {
        id: "section_experience",
        kind: "experience",
        label: "Experience",
        text: null,
        bullets: [],
        entries: [
          {
            id: "experience_1",
            entryType: "experience",
            title: "Senior systems designer",
            subtitle: "Orbit Commerce",
            location: "London, UK",
            dateRange: "2020-01 – Present",
            startDate: "2020-01",
            endDate: null,
            isCurrent: true,
            summary: "Builds resilient workflow tools.",
            bullets: createBullets("experience_bullet", [
              "Led design-system rollout across core surfaces.",
            ]),
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: "experience_1",
            sourceRefs: [],
            updatedAt: "2026-03-20T10:04:00.000Z",
          },
        ],
        origin: "ai_generated",
        locked: false,
        included: true,
        sortOrder: 2,
        entryOrderMode: "chronology",
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: "2026-03-20T10:04:00.000Z",
      },
    ],
    targetPageCount: 2,
    generationMethod: "ai",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: "2026-03-20T10:04:00.000Z",
    updatedAt: "2026-03-20T10:04:00.000Z",
  };
}

function updateSection(
  draft: ResumeDraft,
  sectionId: string,
  updater: (
    section: ResumeDraft["sections"][number],
  ) => ResumeDraft["sections"][number],
): ResumeDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === sectionId ? updater(section) : section,
    ),
  };
}

function getSection(draft: ResumeDraft, sectionId: string) {
  const section = draft.sections.find((entry) => entry.id === sectionId);

  if (!section) {
    throw new Error(`Missing section '${sectionId}' in test draft.`);
  }

  return section;
}

function getExperienceEntry(draft: ResumeDraft) {
  const experienceSection = getSection(draft, "section_experience");
  const entry = experienceSection.entries[0];

  if (!entry) {
    throw new Error("Expected an experience entry in the test draft.");
  }

  return entry;
}

function createDuplicateExperienceEntry(
  source: ResumeDraftEntry,
): ResumeDraftEntry {
  return {
    ...source,
    id: "experience_2",
    title: "Principal systems designer",
    bullets: createBullets("experience_duplicate", [
      "Led design-system rollout across core surfaces.",
    ]),
  };
}

function getSeedContext() {
  const seed = createSeed();
  const profile = seed.profile;
  const job = seed.savedJobs.find((entry) => entry.id === "job_ready");

  if (!job) {
    throw new Error("job not found: job_ready");
  }

  return { profile, job };
}

describe("resume workspace quality helpers", () => {
  test("enforces selected strategy evidence boundaries while still rejecting unsupported claims", () => {
    const { profile, job } = getSeedContext();
    const draft = ResumeDraftSchema.parse({
      id: "resume_draft_strategy_boundary",
      jobId: job.id,
      status: "draft",
      templateId: "classic_ats",
      generationMethod: "ai",
      sections: [
        {
          id: "section_experience",
          kind: "experience",
          label: "Experience",
          origin: "ai_generated",
          sortOrder: 0,
          entries: [
            {
              id: "entry_strategy_boundary",
              entryType: "experience",
              title: "Senior systems designer",
              subtitle: "Signal Systems",
              origin: "ai_generated",
              sortOrder: 0,
              profileRecordId: "experience_1",
              bullets: [
                {
                  id: "bullet_exact_boundary",
                  text: "Led design-system rollout across core surfaces.",
                  origin: "ai_generated",
                  updatedAt: "2026-08-17T10:00:00.000Z",
                },
                {
                  id: "bullet_unsupported_boundary",
                  text: "Architected a quantum operating model for global logistics teams.",
                  origin: "ai_generated",
                  updatedAt: "2026-08-17T10:00:00.000Z",
                },
              ],
              updatedAt: "2026-08-17T10:00:00.000Z",
            },
          ],
          updatedAt: "2026-08-17T10:00:00.000Z",
        },
      ],
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
    });
    const strategy = ResumeGenerationStrategyPolicySchema.parse({
      strategyId: "strategy_strict_evidence",
      strategyName: "Strict evidence",
      roleFamily: "Product Design",
      baseResumeDocumentId: profile.baseResume.id,
      templateId: "classic_ats",
      headlinePolicy: "fixed",
      skillsPolicy: "base_only",
      coveragePolicy: "base_omissions",
      tailoringStrength: "conservative",
      evidenceBoundaries: {
        allowExactClaims: false,
        allowParaphrasedClaims: false,
        maxEvidenceRefsPerBullet: 3,
        requireVerifierPass: true,
      },
      effectiveSource: "selection",
      effectiveReason: "The user selected strict evidence handling.",
      recommendationSource: "none",
      recommendationReason: null,
      selectionSource: "user",
      selectionReason: "The user selected this strategy.",
    });

    const validation = validateResumeDraft({
      draft,
      job,
      profile,
      strategy,
      validatedAt: "2026-08-17T10:00:00.000Z",
    });
    const exactClaim = validation.claimAssessments.find(
      (assessment) => assessment.bulletId === "bullet_exact_boundary",
    );
    const unsupportedClaim = validation.claimAssessments.find(
      (assessment) => assessment.bulletId === "bullet_unsupported_boundary",
    );

    expect(exactClaim).toMatchObject({
      claimOrigin: "ai_generated",
      status: "exact",
    });
    expect(
      validation.issues.some(
        (issue) =>
          issue.id.startsWith("issue_strategy_evidence_boundary_") &&
          issue.bulletId === "bullet_exact_boundary" &&
          issue.category === "unsupported_claim" &&
          issue.severity === "error",
      ),
    ).toBe(true);
    expect(unsupportedClaim).toMatchObject({
      claimOrigin: "ai_generated",
      status: "unsupported",
      evidenceRefs: [],
    });
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bulletId: "bullet_unsupported_boundary",
          category: "unsupported_claim",
          severity: "error",
        }),
      ]),
    );
  });

  test("sanitizeResumeDraft removes visible company and job-only skill bleed", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_skills",
      (section) => ({
        ...section,
        bullets: createBullets("skill_bullet", [
          "Figma",
          "Signal Systems",
          "Remote-first collaboration",
        ]),
      }),
    );

    const sanitized = sanitizeResumeDraft({ draft, job, profile });
    const visibleSkills = getSection(sanitized, "section_skills").bullets.map(
      (bullet) => bullet.text,
    );

    expect(visibleSkills).toEqual(["Figma"]);
  });

  test("validateResumeDraft flags short job-only skill bleed that remains in a draft", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_skills",
      (section) => ({
        ...section,
        bullets: createBullets("skill_bullet", ["Remote-first collaboration"]),
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "job_description_bleed",
          bulletId: "skill_bullet_1",
        }),
      ]),
    );
  });

  test("sanitizeResumeDraft keeps grounded spoken languages visible", () => {
    const { job } = getSeedContext();
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      spokenLanguages: [
        {
          id: "language_1",
          language: "English",
          proficiency: "Native",
          interviewPreference: false,
          notes: null,
        },
      ],
    };
    const draft = {
      ...createBaseDraft(),
      sections: [
        ...createBaseDraft().sections,
        {
          id: "section_languages",
          kind: "skills" as const,
          label: "Languages",
          text: null,
          bullets: createBullets("language_bullet", ["English — Native"]),
          entries: [],
          origin: "ai_generated" as const,
          locked: false,
          included: true,
          sortOrder: 3,
          entryOrderMode: "chronology" as const,
          profileRecordId: null,
          sourceRefs: [],
          updatedAt: "2026-03-20T10:04:00.000Z",
        },
      ],
    };

    const sanitized = sanitizeResumeDraft({ draft, job, profile });

    expect(
      getSection(sanitized, "section_languages").bullets.map(
        (bullet) => bullet.text,
      ),
    ).toEqual(["English — Native"]);
  });

  test("sanitizeResumeDraft keeps grounded action bullets that include multiple commas", () => {
    const { profile, job } = getSeedContext();
    const actionBullet =
      "Partnered with product, design, and platform engineering to standardize components, testing, and performance budgets.";
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets("experience_bullet", [
            "Led design-system rollout across core surfaces.",
            actionBullet,
          ]),
        })),
      }),
    );

    const sanitized = sanitizeResumeDraft({ draft, job, profile });
    const visibleBullets = getExperienceEntry(sanitized).bullets.map(
      (bullet) => bullet.text,
    );

    expect(visibleBullets).toEqual([
      "Led design-system rollout across core surfaces.",
      actionBullet,
    ]);
  });

  test("sanitizeResumeDraft keeps a comma-rich summary supported by the profile", () => {
    const { profile, job } = getSeedContext();
    const supportedSummary =
      "Frontend engineer focused on React, TypeScript, testing, performance, and mentoring.";
    const groundedProfile = {
      ...profile,
      summary: supportedSummary,
    };
    const draft = updateSection(
      createBaseDraft(),
      "section_summary",
      (section) => ({
        ...section,
        text: supportedSummary,
      }),
    );

    const sanitized = sanitizeResumeDraft({
      draft,
      job,
      profile: groundedProfile,
    });

    expect(getSection(sanitized, "section_summary").text).toBe(
      supportedSummary,
    );
    expect(getSection(sanitized, "section_summary").included).toBe(true);
  });

  test("sanitizeResumeDraft removes copied job-description summary prose and copied section bullets", () => {
    const { profile, job } = getSeedContext();
    const copiedSummary = job.description;
    const copiedResponsibility =
      job.responsibilities[0] ?? "Own the design system roadmap.";
    const draftWithSummaryBleed = updateSection(
      updateSection(createBaseDraft(), "section_summary", (section) => ({
        ...section,
        text: copiedSummary,
      })),
      "section_experience",
      (section) => ({
        ...section,
        bullets: createBullets("experience_section_bleed", [
          copiedResponsibility,
        ]),
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets("experience_quality", [
            copiedResponsibility,
            "React, TypeScript, Design Systems, Figma, Playwright, Accessibility, Testing",
            "Improved workflow QA handoff across release reviews.",
          ]),
        })),
      }),
    );

    const sanitized = sanitizeResumeDraft({
      draft: draftWithSummaryBleed,
      job,
      profile,
    });
    const summarySection = getSection(sanitized, "section_summary");
    const experienceEntry = getExperienceEntry(sanitized);

    expect(summarySection.text).toBeNull();
    expect(summarySection.included).toBe(false);
    expect(getSection(sanitized, "section_experience").bullets).toEqual([]);
    expect(experienceEntry.bullets.map((bullet) => bullet.text)).toEqual([
      "Improved workflow QA handoff across release reviews.",
    ]);
  });

  test("sanitizeResumeDraft removes summary sentences that repeat visible experience bullets", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          summary:
            "Led design-system rollout across core surfaces. Reduced median load time from 4.2 seconds to 1.9 seconds. Mentored four engineers through accessibility reviews.",
          bullets: createBullets("experience_summary_overlap", [
            "Led design-system rollout across core surfaces.",
            "Reduced median load time from 4.2 seconds to 1.9 seconds.",
          ]),
        })),
      }),
    );

    const sanitized = sanitizeResumeDraft({ draft, job, profile });
    const experienceEntry = getExperienceEntry(sanitized);

    expect(experienceEntry.summary).toBe(
      "Mentored four engineers through accessibility reviews.",
    );
    expect(experienceEntry.bullets.map((bullet) => bullet.text)).toEqual([
      "Led design-system rollout across core surfaces.",
      "Reduced median load time from 4.2 seconds to 1.9 seconds.",
    ]);
  });

  test("validateResumeDraft flags copied job-description section bullets without false grounding from short profile tokens", () => {
    const { profile, job } = getSeedContext();
    const copiedResponsibility =
      job.responsibilities[0] ?? "Own the design system roadmap.";
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        bullets: createBullets("experience_section_validate", [
          copiedResponsibility,
        ]),
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "job_description_bleed",
          bulletId: "experience_section_validate_1",
        }),
      ]),
    );
  });

  test("validateResumeDraft flags keyword stuffing and vague filler when they remain in bullets", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets("experience_validate", [
            "React, TypeScript, Design Systems, Figma, Playwright, Accessibility, Testing",
            "Results-driven team player who thrives in fast-paced environments.",
          ]),
        })),
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "keyword_stuffing",
          bulletId: "experience_validate_1",
        }),
        expect.objectContaining({
          category: "vague_filler",
          bulletId: "experience_validate_2",
        }),
      ]),
    );
  });

  test("validateResumeDraft flags duplicate bullets and duplicate entry summaries", () => {
    const { profile, job } = getSeedContext();
    const duplicateEntry = createDuplicateExperienceEntry(
      getExperienceEntry(createBaseDraft()),
    );
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: [...section.entries, duplicateEntry],
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "duplicate_bullet",
          bulletId: "experience_duplicate_1",
        }),
        expect.objectContaining({
          category: "duplicate_section_content",
          entryId: "experience_2",
        }),
      ]),
    );
  });

  test("validateResumeDraft flags thin output when only a fragment remains", () => {
    const { profile, job } = getSeedContext();
    const draft = {
      ...createBaseDraft(),
      sections: [
        {
          ...getSection(createBaseDraft(), "section_summary"),
          text: "Brief summary.",
          bullets: [],
          entries: [],
          included: true,
        },
        {
          ...getSection(createBaseDraft(), "section_skills"),
          bullets: [],
          included: false,
        },
        {
          ...getSection(createBaseDraft(), "section_experience"),
          bullets: [],
          entries: [],
          included: false,
        },
      ],
    };

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "thin_output",
        }),
      ]),
    );
  });

  test("validateResumeDraft flags page overflow at three pages as an error", () => {
    const { profile, job } = getSeedContext();
    const validation = validateResumeDraft({
      draft: createBaseDraft(),
      job,
      profile,
      pageCount: 3,
    });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "page_overflow",
          severity: "error",
        }),
      ]),
    );
  });

  test("validateResumeDraft uses the draft page target in overflow messaging", () => {
    const { profile, job } = getSeedContext();
    const validation = validateResumeDraft({
      draft: {
        ...createBaseDraft(),
        targetPageCount: 1,
      },
      job,
      profile,
      pageCount: 2,
    });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "page_overflow",
          severity: "warning",
          message: "The exported resume exceeded the 1-page target.",
        }),
      ]),
    );
  });

  test("validateResumeDraft does not mutate user-included entry included flags even under page overflow", () => {
    const { profile, job } = getSeedContext();
    const userIncludedWeakFit = {
      ...getExperienceEntry(createBaseDraft()),
      id: "experience_user_included_gap_role",
      title: "Sales Operations Associate",
      subtitle: "Bright Market",
      summary: "Kept customer operations reporting concise.",
      included: true,
      profileRecordId: "experience_sales_bridge",
    };
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: [...section.entries, userIncludedWeakFit],
      }),
    );
    const validation = validateResumeDraft({
      draft,
      job,
      profile,
      pageCount: 3,
    });

    expect(
      getSection(draft, "section_experience").entries.find(
        (entry) => entry.id === "experience_user_included_gap_role",
      )?.included,
    ).toBe(true);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "page_overflow",
          severity: "error",
        }),
      ]),
    );
  });

  test("createEntry removes near-duplicate long bullets without dropping short skills", () => {
    const entry = createEntry({
      id: "experience_net_migration",
      entryType: "experience",
      title: ".NET Developer",
      subtitle: "CREA-KO",
      bullets: [
        "Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC, refactoring both front-end and back-end code to enhance performance, scalability, and alignment with the .NET Core MVC architecture.",
        "Refactored front-end and back-end code to align with .NET Core MVC architecture, improving the performance and scalability of the web application.",
        "Replaced 12 deprecated NuGet packages, eliminating 100+ security warnings in CI builds.",
      ],
      updatedAt: "2026-03-20T10:04:00.000Z",
      origin: "imported",
      sortOrder: 0,
    });

    expect(entry.bullets.map((bullet) => bullet.text)).toEqual([
      "Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC, refactoring both front-end and back-end code to enhance performance, scalability, and alignment with the .NET Core MVC architecture.",
      "Replaced 12 deprecated NuGet packages, eliminating 100+ security warnings in CI builds.",
    ]);
  });

  test("validateResumeDraft rejects unsupported metrics while preserving canonical quantified evidence", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets("claim_quality_metric", [
            "Increased adoption to 95% across three teams.",
            "Adoption reached 80% of core product surfaces within two quarters.",
          ]),
        })),
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });
    const metricIssues = validation.issues.filter(
      (issue) => issue.category === "invented_metric",
    );

    expect(metricIssues.map((issue) => issue.bulletId)).toEqual([
      "claim_quality_metric_1",
    ]);
  });

  test("validateResumeDraft catches unsupported absolutes, teen-like filler, fragments, and near repetition", () => {
    const { profile, job } = getSeedContext();
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          summary:
            "I did a lot of different things. I did a lot of different things.",
          bullets: createBullets("claim_quality_tone", [
            "Single-handedly revolutionized the industry with a world-class platform.",
            "Worked on various things and helped with lots of stuff.",
            "TailwindCSS & WebSockets.",
            "Led design-system rollout across core surfaces.",
            "Led the design system rollout across core product surfaces.",
          ]),
        })),
      }),
    );

    const validation = validateResumeDraft({ draft, job, profile });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "unsupported_claim",
          bulletId: "claim_quality_tone_1",
        }),
        expect.objectContaining({
          category: "vague_filler",
          bulletId: "claim_quality_tone_2",
        }),
        expect.objectContaining({
          category: "vague_filler",
          bulletId: "claim_quality_tone_3",
        }),
        expect.objectContaining({
          category: "duplicate_bullet",
          bulletId: "claim_quality_tone_5",
        }),
        expect.objectContaining({
          category: "vague_filler",
          entryId: "experience_1",
        }),
      ]),
    );
  });

  test("validateResumeDraft reports missing and hidden canonical work-history roles", () => {
    const { profile, job } = getSeedContext();
    const canonicalRole = {
      ...profile.experiences[0]!,
      id: "experience_canonical_second",
      companyName: "Orbit Labs",
      title: "Product designer",
    };
    const profileWithSecondRole = {
      ...profile,
      experiences: [...profile.experiences, canonicalRole],
    };

    const missingValidation = validateResumeDraft({
      draft: createBaseDraft(),
      job,
      profile: profileWithSecondRole,
    });
    expect(missingValidation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "issue_work_history_experience_canonical_second",
          category: "work_history_review",
          message:
            "A canonical work-history role is missing from the resume draft.",
        }),
      ]),
    );

    const hiddenDraft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: [
          ...section.entries,
          {
            ...getExperienceEntry(createBaseDraft()),
            id: "experience_hidden_canonical",
            profileRecordId: canonicalRole.id,
            included: false,
          },
        ],
      }),
    );
    const hiddenValidation = validateResumeDraft({
      draft: hiddenDraft,
      job,
      profile: profileWithSecondRole,
    });
    expect(hiddenValidation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "issue_work_history_experience_canonical_second",
          category: "work_history_review",
          message:
            "A canonical work-history role is hidden from the visible resume.",
        }),
      ]),
    );
  });

  test("buildResumeCoverageComparison explains role, claim, order, and page changes", () => {
    const { profile } = getSeedContext();
    const secondRole = {
      ...profile.experiences[0]!,
      id: "experience_2",
      companyName: "Orbit Labs",
      title: "Product designer",
      summary: "Designed internal workflow products.",
      achievements: ["Shipped a shared operations dashboard."],
    };
    const profileWithHistory = {
      ...profile,
      experiences: [...profile.experiences, secondRole],
    };
    const comparisonDraft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: [
          {
            ...getExperienceEntry(createBaseDraft()),
            id: "experience_2",
            profileRecordId: secondRole.id,
            title: secondRole.title,
            subtitle: secondRole.companyName,
            summary: secondRole.summary,
            bullets: createBullets(
              "experience_2_bullet",
              secondRole.achievements,
            ),
            included: false,
            sortOrder: 0,
          },
          {
            ...getExperienceEntry(createBaseDraft()),
            summary: "Builds reliable workflow platforms for product teams.",
            bullets: createBullets("experience_rewritten", [
              "Led a grounded design-system rollout across core product surfaces.",
            ]),
            sortOrder: 1,
          },
        ],
      }),
    );

    const comparison = buildResumeCoverageComparison({
      profile: profileWithHistory,
      draft: comparisonDraft,
      pageCount: 3,
      validationIssues: [
        {
          id: "duplicate_1",
          severity: "warning",
          category: "duplicate_bullet",
          sectionId: "section_experience",
          entryId: "experience_1",
          bulletId: "experience_rewritten_1",
          message: "Repeated claim.",
        },
      ],
    });

    expect(comparison).toMatchObject({
      originalRoleCount: 2,
      representedRoleCount: 2,
      visibleRoleCount: 1,
      rewrittenRoleCount: 1,
      hiddenRoleCount: 1,
      reorderedRoleCount: 2,
      duplicateIssueCount: 1,
      pageImpact: "over_target",
      pageCount: 3,
      targetPageCount: 2,
    });
    const rewrittenRole = comparison.roles.find(
      (role) => role.profileRecordId === "experience_1",
    );
    expect(rewrittenRole).toMatchObject({
      status: "rewritten",
      reordered: true,
    });
    expect(rewrittenRole?.addedClaims).toContainEqual({
      field: "summary",
      text: "Builds reliable workflow platforms for product teams.",
      restorable: false,
    });
    expect(rewrittenRole?.removedClaims).toContainEqual({
      field: "summary",
      text: "Builds resilient workflow tools.",
      restorable: true,
    });
    expect(
      comparison.roles.find((role) => role.profileRecordId === "experience_2"),
    ).toMatchObject({
      status: "hidden",
      included: false,
    });

    const hiddenSectionComparison = buildResumeCoverageComparison({
      profile: profileWithHistory,
      draft: updateSection(
        comparisonDraft,
        "section_experience",
        (section) => ({
          ...section,
          included: false,
          entries: section.entries.map((entry) => ({
            ...entry,
            included: true,
          })),
        }),
      ),
    });

    expect(hiddenSectionComparison).toMatchObject({
      visibleRoleCount: 0,
      hiddenRoleCount: 2,
    });
    expect(
      hiddenSectionComparison.roles.flatMap((role) => role.removedClaims),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ restorable: false })]),
    );
  });

  test("sanitizeResumeDraft suppresses unprofessional generated summaries without deleting grounded history", () => {
    const { profile, job } = getSeedContext();
    const unprofessionalSummary =
      "After deciding to return to my passion, I did a lot of different things and moved back into development.";
    const generatedDraft = updateSection(
      createBaseDraft(),
      "section_summary",
      (section) => ({
        ...section,
        text: unprofessionalSummary,
        origin: "ai_generated",
      }),
    );

    const sanitized = sanitizeResumeDraft({
      draft: generatedDraft,
      job,
      profile,
    });

    expect(getSection(sanitized, "section_summary")).toMatchObject({
      text: null,
      included: false,
    });
    expect(getExperienceEntry(sanitized)).toMatchObject({
      profileRecordId: "experience_1",
      included: true,
    });

    const userEditedDraft = updateSection(
      generatedDraft,
      "section_summary",
      (section) => ({
        ...section,
        origin: "user_edited",
      }),
    );
    expect(
      getSection(
        sanitizeResumeDraft({ draft: userEditedDraft, job, profile }),
        "section_summary",
      ).text,
    ).toBe(unprofessionalSummary);
  });

  test("assesses every visible generated claim against candidate-only evidence", () => {
    const { profile, job } = getSeedContext();
    const groundedClaim = "Led design-system rollout across core surfaces.";
    const groundedProfile = {
      ...profile,
      experiences: profile.experiences.map((experience, index) =>
        index === 0
          ? {
              ...experience,
              achievements: [...experience.achievements, groundedClaim],
            }
          : experience,
      ),
    };
    const draft = updateSection(
      createBaseDraft(),
      "section_experience",
      (section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets("claim_grounding", [
            groundedClaim,
            "Architected a quantum operating model for global logistics teams.",
          ]),
        })),
      }),
    );

    const validation = validateResumeDraft({
      draft,
      job,
      profile: groundedProfile,
    });
    const grounded = validation.claimAssessments.find(
      (assessment) => assessment.bulletId === "claim_grounding_1",
    );
    const unsupported = validation.claimAssessments.find(
      (assessment) => assessment.bulletId === "claim_grounding_2",
    );

    expect(grounded).toMatchObject({
      claimOrigin: "ai_generated",
      status: "exact",
      verifier: "deterministic_candidate_evidence_v1",
    });
    expect(grounded?.evidenceRefs.length).toBeGreaterThan(0);
    expect(grounded?.evidenceRefs.map((ref) => ref.sourceKind)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(resume|profile|proof|user)$/),
      ]),
    );
    expect(unsupported).toMatchObject({
      claimOrigin: "ai_generated",
      status: "unsupported",
      evidenceRefs: [],
    });
    expect(validation.draftContentHash).toBe(
      buildResumeDraftContentHash(draft),
    );
  });

  test("does not auto-support user edits and invalidates hashes when claim text changes", () => {
    const { profile, job } = getSeedContext();
    const userEditedDraft = updateSection(
      createBaseDraft(),
      "section_summary",
      (section) => ({
        ...section,
        text: "Created a novel operating model that is not yet in candidate evidence.",
        origin: "user_edited",
      }),
    );
    const before = validateResumeDraft({
      draft: userEditedDraft,
      job,
      profile,
    });
    const editedDraft = updateSection(
      userEditedDraft,
      "section_summary",
      (section) => ({
        ...section,
        text: "Created a different novel operating model that is not yet in candidate evidence.",
      }),
    );
    const after = validateResumeDraft({ draft: editedDraft, job, profile });
    const beforeClaim = before.claimAssessments.find(
      (assessment) =>
        assessment.field === "section_text" &&
        assessment.sectionId === "section_summary",
    );
    const afterClaim = after.claimAssessments.find(
      (assessment) =>
        assessment.field === "section_text" &&
        assessment.sectionId === "section_summary",
    );

    expect(beforeClaim).toMatchObject({
      claimOrigin: "user_edited",
      status: "review",
    });
    expect(beforeClaim?.contentHash).not.toBe(afterClaim?.contentHash);
    expect(before.draftContentHash).not.toBe(after.draftContentHash);

    const originOnlyEdit = updateSection(
      userEditedDraft,
      "section_summary",
      (section) => ({ ...section, origin: "ai_generated" }),
    );
    expect(buildResumeDraftContentHash(originOnlyEdit)).not.toBe(
      buildResumeDraftContentHash(userEditedDraft),
    );
  });
});
