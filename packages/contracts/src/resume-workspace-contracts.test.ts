import { describe, expect, test } from "vitest";
import {
  JobFinderResumeWorkspaceSchema,
  ResumeAssistantMessageSchema,
  ResumeExportArtifactSchema,
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
        sections: [
          {
            id: "section_summary",
            kind: "summary",
            label: "Summary",
            text: "Lead design-systems work grounded in workflow tooling experience.",
            bullets: [],
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
});
