import { describe, expect, test } from "vitest";
import type { ResumeDraft } from "@unemployed/contracts";
import {
  buildResumeRenderDocument,
  seedResumeDraft,
} from "./internal/resume-workspace-structure";
import { createSeed } from "./workspace-service.test-support";

describe("buildResumeRenderDocument", () => {
  test("renders experience entry metadata with tailored entry content", () => {
    const seed = createSeed();
    const profile = seed.profile;
    const draft: ResumeDraft = {
      id: "resume_draft_job_ready",
      jobId: "job_ready",
      status: "draft",
      templateId: "classic_ats",
      identity: {
        fullName: profile.fullName,
        headline: profile.headline,
        location: profile.currentLocation,
        email: profile.email,
        phone: profile.phone,
        portfolioUrl: profile.portfolioUrl,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        personalWebsiteUrl: profile.personalWebsiteUrl,
        additionalLinks: [],
      },
      sections: [
        {
          id: "section_experience",
          kind: "experience",
          label: "Experience",
          text: null,
          bullets: [],
          entries: [
            {
              id: "experience_experience_1",
              entryType: "experience",
              title: "Senior systems designer",
              subtitle: "Signal Systems",
              location: "London, UK",
              dateRange: "2020-01 – Present",
              summary: "Tailored workflow platform summary.",
              bullets: [
                {
                  id: "experience_bullet_1",
                  text: "Tailored workflow platform impact.",
                  origin: "ai_generated",
                  locked: false,
                  included: true,
                  sourceRefs: [],
                  updatedAt: "2026-03-20T10:04:00.000Z",
                },
              ],
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
          sortOrder: 0,
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

    const document = buildResumeRenderDocument(profile, draft);

    expect(document.sections[0]?.entries[0]).toEqual({
      id: "experience_experience_1",
      title: "Senior systems designer",
      subtitle: "Signal Systems",
      location: "London, UK",
      dateRange: "2020-01 – Present",
      heading:
        "Senior systems designer — Signal Systems | London, UK | 2020-01 – Present",
      summary: "Tailored workflow platform summary.",
      bullets: [
        {
          id: "experience_bullet_1",
          text: "Tailored workflow platform impact.",
        },
      ],
    });
  });

  test("seedResumeDraft formats imported year-month ranges for recruiter-facing output", () => {
    const seed = createSeed();
    const draft = seedResumeDraft({
      profile: seed.profile,
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
    });

    const experience = draft.sections.find((section) => section.kind === "experience")?.entries[0];

    expect(experience?.dateRange).toMatch(/^[A-Z][a-z]{2} \d{4} – Present$/);
  });

  test("surfaces preferred links and project URLs without turning project skills into bullets", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      githubUrl: "https://github.com/alex-vanguard",
      personalWebsiteUrl: "https://alex.dev",
      applicationIdentity: {
        ...seed.profile.applicationIdentity,
        preferredEmail: "apply@example.com",
        preferredLinkIds: ["link_case_study"],
      },
      links: [
        ...seed.profile.links,
        {
          id: "link_case_study",
          label: "Case Study",
          url: "https://alex.example.com/case-study",
          kind: "case_study" as const,
          isDraft: false,
        },
      ],
      projects: [
        {
          id: "project_workflow_os",
          name: "Workflow OS",
          projectType: "product",
          summary: "Scaled a workflow design system.",
          role: "Design lead",
          skills: ["Figma", "React"],
          outcome: "Reduced release churn.",
          projectUrl: "https://alex.example.com/workflow-os",
          repositoryUrl: "https://github.com/alex-vanguard/workflow-os",
          caseStudyUrl: "https://alex.example.com/workflow-os-case-study",
        },
      ],
    };
    const draft = seedResumeDraft({
      profile,
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
    });
    const document = buildResumeRenderDocument(profile, draft);
    const project = document.sections.find((section) => section.kind === "projects")?.entries[0];

    expect(document.contactItems).toEqual([
      "apply@example.com",
      "+44 7700 900123",
      "https://alex.example.com",
      "https://www.linkedin.com/in/alex-vanguard",
      "https://github.com/alex-vanguard",
      "https://alex.dev",
      "https://alex.example.com/case-study",
    ]);
    expect(project).toEqual({
      id: "project_project_workflow_os",
      title: "Workflow OS",
      subtitle: "Design lead",
      location: "https://alex.example.com/workflow-os-case-study",
      dateRange: null,
      heading: "Workflow OS — Design lead | https://alex.example.com/workflow-os-case-study",
      summary: "Scaled a workflow design system. Reduced release churn. Technologies: Figma, React.",
      bullets: [],
    });
  });

  test("prefers draft identity fields over the base profile for resume header rendering", () => {
    const seed = createSeed();
    const profile = seed.profile;
    const draft = seedResumeDraft({
      profile,
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
    });

    const document = buildResumeRenderDocument(profile, {
      ...draft,
      identity: {
        ...(draft.identity ?? {
          fullName: null,
          headline: null,
          location: null,
          email: null,
          phone: null,
          portfolioUrl: null,
          linkedinUrl: null,
          githubUrl: null,
          personalWebsiteUrl: null,
          additionalLinks: [],
        }),
        fullName: 'Alex Tailored',
        headline: 'Staff platform engineer',
        location: 'Remote',
        email: 'tailored@example.com',
        phone: '+1 555 0100',
      },
    });

    expect(document.fullName).toBe('Alex Tailored');
    expect(document.headline).toBe('Staff platform engineer');
    expect(document.location).toBe('Remote');
    expect(document.contactItems[0]).toBe('tailored@example.com');
    expect(document.contactItems[1]).toBe('+1 555 0100');
  });
});
