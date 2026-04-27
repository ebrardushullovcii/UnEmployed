import { describe, expect, test } from "vitest";
import {
  JobFinderResumePreviewSchema,
  JobFinderResumeWorkspaceSchema,
  ResumeDraftSectionSchema,
  ResumeAssistantMessageSchema,
  ResumeExportArtifactSchema,
  ResumeQualityBenchmarkReportSchema,
  ResumeValidationResultSchema,
} from "./index";

describe("contracts resume workspace schemas", () => {
  test("parses a structured resume workspace payload", () => {
    const workspace = JobFinderResumeWorkspaceSchema.parse({
      job: {
        id: "job_1",
        source: "target_site",
        sourceJobId: "target_job_1",
        discoveryMethod: "catalog_seed",
        canonicalUrl: "https://jobs.example.com/roles/target_job_1",
        title: "Senior Product Designer",
        company: "Signal Systems",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T09:00:00.000Z",
        postedAtText: null,
        discoveredAt: "2026-03-20T10:01:00.000Z",
        salaryText: "$180k - $220k",
        summary: "Own the design system.",
        description: "Own the design system and workflow platform.",
        keySkills: ["Figma"],
        responsibilities: [],
        minimumQualifications: [],
        preferredQualifications: [],
        seniority: null,
        employmentType: null,
        department: null,
        team: null,
        employerWebsiteUrl: null,
        employerDomain: null,
        benefits: [],
        status: "ready_for_review",
        matchAssessment: {
          score: 96,
          reasons: ["Strong product design overlap"],
          gaps: [],
        },
        provenance: [],
      },
      draft: {
        id: "resume_draft_1",
        jobId: "job_1",
        status: "needs_review",
        templateId: "classic_ats",
        identity: {
          fullName: "Alex Vanguard",
          headline: "Senior Product Designer",
          location: "Remote",
          email: "alex@example.com",
          phone: "+44 7700 900123",
          portfolioUrl: "https://alex.example.com",
          linkedinUrl: "https://www.linkedin.com/in/alex-vanguard",
          githubUrl: null,
          personalWebsiteUrl: null,
          additionalLinks: [],
        },
        sections: [
          {
            id: "section_summary",
            kind: "summary",
            label: "Summary",
            text: "Lead design-systems work grounded in workflow tooling experience.",
            bullets: [],
            entries: [],
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: null,
            sourceRefs: [
              {
                id: "source_1",
                sourceKind: "profile",
                sourceId: "experience_1",
                snippet: "Led design-system rollout across core surfaces.",
              },
            ],
            updatedAt: "2026-03-20T10:02:30.000Z",
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
                title: "Senior Product Designer",
                subtitle: "Signal Systems",
                location: "Remote",
                dateRange: "2023 – Present",
                summary: "Owned design-system adoption across platform surfaces.",
                bullets: [
                  {
                    id: "experience_1_bullet_1",
                    text: "Led rollout across core product surfaces used by design and operations teams.",
                    origin: "ai_generated",
                    locked: false,
                    included: true,
                    sourceRefs: [],
                    updatedAt: "2026-03-20T10:02:30.000Z",
                  },
                ],
                origin: "ai_generated",
                locked: false,
                included: true,
                sortOrder: 0,
                profileRecordId: "experience_1",
                sourceRefs: [],
                updatedAt: "2026-03-20T10:02:30.000Z",
              },
            ],
            origin: "ai_generated",
            locked: false,
            included: true,
            sortOrder: 1,
            profileRecordId: null,
            sourceRefs: [],
            updatedAt: "2026-03-20T10:02:30.000Z",
          },
        ],
        targetPageCount: 2,
        generationMethod: "ai",
        approvedAt: null,
        approvedExportId: null,
        staleReason: null,
        createdAt: "2026-03-20T10:02:00.000Z",
        updatedAt: "2026-03-20T10:02:30.000Z",
      },
      validation: {
        id: "resume_validation_1",
        draftId: "resume_draft_1",
        issues: [
          {
            id: "issue_1",
            severity: "warning",
            category: "poor_keyword_coverage",
            sectionId: "section_summary",
            bulletId: null,
            message: "Add one more role-specific keyword to the summary.",
          },
        ],
        pageCount: 2,
        validatedAt: "2026-03-20T10:02:35.000Z",
      },
      exports: [
        {
          id: "resume_export_1",
          draftId: "resume_draft_1",
          jobId: "job_1",
          format: "pdf",
          filePath: "/tmp/alex-signal.pdf",
          pageCount: 2,
          templateId: "classic_ats",
          exportedAt: "2026-03-20T10:03:10.000Z",
          isApproved: false,
        },
      ],
      research: [
        {
          id: "resume_research_1",
          jobId: "job_1",
          sourceUrl: "https://signalsystems.example.com/about",
          pageTitle: "About Signal Systems",
          fetchedAt: "2026-03-20T10:01:30.000Z",
          extractedText: "Signal Systems builds workflow software.",
          companyNotes: "Workflow tooling for design and operations teams.",
          domainVocabulary: ["workflow platform"],
          priorityThemes: ["design systems"],
          fetchStatus: "success",
        },
      ],
      assistantMessages: [
        {
          id: "assistant_message_1",
          jobId: "job_1",
          role: "assistant",
          content: "I tightened the summary around workflow tooling and design systems.",
          patches: [],
          createdAt: "2026-03-20T10:02:40.000Z",
        },
      ],
      tailoredAsset: null,
    });

    expect(workspace.draft.sections[0]?.kind).toBe("summary");
    const parsedExperienceSection = ResumeDraftSectionSchema.parse(
      workspace.draft.sections[1],
    );
    expect(parsedExperienceSection.id).toBe("section_experience");
    expect(parsedExperienceSection.entries[0]).toMatchObject({
      entryType: "experience",
      id: "experience_1",
      title: "Senior Product Designer",
      subtitle: "Signal Systems",
      dateRange: "2023 – Present",
    });
    expect(Array.isArray(parsedExperienceSection.entries[0]?.bullets)).toBe(true);
    expect(workspace.validation?.issues[0]?.category).toBe(
      "poor_keyword_coverage",
    );
    expect(workspace.exports[0]?.format).toBe("pdf");
  });

  test("rejects unsupported resume export formats", () => {
    expect(() =>
      ResumeExportArtifactSchema.parse({
        id: "resume_export_1",
        draftId: "resume_draft_1",
        jobId: "job_1",
        format: "docx",
        filePath: "/tmp/alex-signal.docx",
        pageCount: 2,
        templateId: "classic_ats",
        exportedAt: "2026-03-20T10:03:10.000Z",
        isApproved: false,
      }),
    ).toThrow();
  });

  test("parses a live resume preview payload", () => {
    const preview = JobFinderResumePreviewSchema.parse({
      draftId: "resume_draft_1",
      revisionKey: "resume_preview_resume_draft_1_f49a0e2d",
      html: "<!doctype html><html><body><article data-resume-section-id=\"section_summary\">Preview</article></body></html>",
      warnings: [
        {
          id: "preview_warning_1",
          source: "validation",
          severity: "warning",
          category: "poor_keyword_coverage",
          sectionId: "section_summary",
          entryId: null,
          bulletId: null,
          message: "Add one more role-specific keyword to the summary.",
        },
      ],
      metadata: {
        templateId: "classic_ats",
        renderedAt: "2026-03-20T10:04:00.000Z",
        pageCount: null,
        sectionCount: 2,
        entryCount: 1,
      },
    });

    expect(preview.metadata.templateId).toBe("classic_ats");
    expect(preview.warnings[0]?.source).toBe("validation");
    expect(preview.html).toContain("data-resume-section-id");
  });

  test("parses resume assistant messages and validation results", () => {
    expect(
      ResumeAssistantMessageSchema.parse({
        id: "assistant_message_1",
        jobId: "job_1",
        role: "assistant",
        content: "Shortened the bullets and kept the metric grounded.",
        patches: [],
        createdAt: "2026-03-20T10:02:40.000Z",
      }).role,
    ).toBe("assistant");

    expect(
      ResumeValidationResultSchema.parse({
        id: "resume_validation_1",
        draftId: "resume_draft_1",
        issues: [],
        pageCount: 2,
        validatedAt: "2026-03-20T10:02:35.000Z",
      }).pageCount,
    ).toBe(2);
  });

  test("parses resume quality benchmark reports", () => {
    const report = ResumeQualityBenchmarkReportSchema.parse({
      benchmarkVersion: "023-local-benchmark-v1",
      generatedAt: "2026-04-26T12:00:00.000Z",
      templates: [
        "classic_ats",
        "compact_exec",
        "modern_split",
        "technical_matrix",
        "project_showcase",
        "credentials_focus",
      ],
      persistedArtifactsDirectory: "apps/desktop/test-artifacts/ui/resume-quality-benchmark",
      cases: [
        {
          caseId: "grounded_baseline",
          label: "Grounded baseline",
          templateId: "classic_ats",
          passed: true,
          visibleSkills: ["Figma", "Design Systems"],
          issueCategories: [],
          issueCount: 0,
          metrics: {
            groundedVisibleSkillRate: 1,
            bleedFreeCaseRate: 1,
            keywordCoverageRate: 1,
            duplicateIssueFreeRate: 1,
            thinOutputFreeRate: 1,
            pageTargetPassRate: 1,
            atsRenderPassRate: 1,
            issueFreeCaseRate: 1,
          },
          htmlArtifactRelativePath: "grounded_baseline/classic_ats/sample.html",
          notes: [],
        },
      ],
      aggregate: {
        groundedVisibleSkillRate: 1,
        bleedFreeCaseRate: 1,
        keywordCoverageRate: 1,
        duplicateIssueFreeRate: 1,
        thinOutputFreeRate: 1,
        pageTargetPassRate: 1,
        atsRenderPassRate: 1,
        issueFreeCaseRate: 1,
      },
      notes: [],
    });

    expect(report.templates).toEqual([
      "classic_ats",
      "compact_exec",
      "modern_split",
      "technical_matrix",
      "project_showcase",
      "credentials_focus",
    ]);
    expect(report.persistedArtifactsDirectory).toBe(
      "apps/desktop/test-artifacts/ui/resume-quality-benchmark",
    );
    expect(report.cases[0]?.metrics.atsRenderPassRate).toBe(1);
  });

  test("parses draft templateId for template themes", () => {
    const workspace = JobFinderResumeWorkspaceSchema.parse({
      job: {
        id: "job_2",
        source: "target_site",
        sourceJobId: "target_job_2",
        discoveryMethod: "catalog_seed",
        canonicalUrl: "https://jobs.example.com/roles/target_job_2",
        title: "Staff Frontend Engineer",
        company: "Atlas Product",
        location: "Remote",
        workMode: ["remote"],
        applyPath: "easy_apply",
        easyApplyEligible: true,
        postedAt: "2026-03-20T09:00:00.000Z",
        postedAtText: null,
        discoveredAt: "2026-03-20T10:01:00.000Z",
        salaryText: null,
        summary: "Lead frontend platform work.",
        description: "Lead frontend platform work.",
        keySkills: ["React"],
        responsibilities: [],
        minimumQualifications: [],
        preferredQualifications: [],
        seniority: null,
        employmentType: null,
        department: null,
        team: null,
        employerWebsiteUrl: null,
        employerDomain: null,
        benefits: [],
        status: "ready_for_review",
        matchAssessment: {
          score: 91,
          reasons: ["Strong frontend overlap"],
          gaps: [],
        },
        provenance: [],
      },
      draft: {
        id: "resume_draft_2",
        jobId: "job_2",
        status: "needs_review",
        templateId: "technical_matrix",
        identity: null,
        sections: [],
        targetPageCount: 2,
        generationMethod: "ai",
        approvedAt: null,
        approvedExportId: null,
        staleReason: null,
        createdAt: "2026-03-20T10:02:00.000Z",
        updatedAt: "2026-03-20T10:02:30.000Z",
      },
      validation: null,
      exports: [],
      research: [],
      assistantMessages: [],
      tailoredAsset: null,
      sharedProfile: {},
    })

    expect(workspace.draft.templateId).toBe("technical_matrix")
  })
});
