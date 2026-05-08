import { describe, expect, test } from "vitest";
import type { ResumeDraft } from "@unemployed/contracts";
import {
  buildResumeRenderDocument,
  buildResumeDraftFromTailoredDraft,
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
              startDate: "2020-01",
              endDate: null,
              isCurrent: true,
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

    const document = buildResumeRenderDocument(profile, draft);

    expect(document.sections[0]?.entries[0]).toEqual({
      id: "experience_experience_1",
      title: "Senior systems designer",
      subtitle: "Signal Systems",
      location: "London, UK",
      dateRange: "Jan 2020 – Present",
      startDate: "2020-01",
      endDate: null,
      isCurrent: true,
      heading:
        "Senior systems designer — Signal Systems | London, UK | Jan 2020 – Present",
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
    expect(experience?.startDate).toMatch(/^\d{4}-\d{2}$/);
    expect(experience?.endDate).toBeNull();
    expect(experience?.isCurrent).toBe(true);
  });

  test("seedResumeDraft normalizes imported profile experience to newest-first chronology", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      experiences: [
        {
          ...seed.profile.experiences[0]!,
          id: "older_dotnet",
          title: ".NET Developer",
          startDate: "2016-01",
          endDate: "2018-08",
          isCurrent: false,
        },
        {
          ...seed.profile.experiences[0]!,
          id: "recent_dotnet",
          title: ".NET Developer",
          startDate: "2019-08",
          endDate: "2022-01",
          isCurrent: false,
        },
        {
          ...seed.profile.experiences[0]!,
          id: "current_platform",
          title: "Platform Engineer",
          startDate: "2023-07",
          endDate: null,
          isCurrent: true,
        },
      ],
    };

    const draft = seedResumeDraft({
      profile,
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
    });
    const experienceEntries = draft.sections.find((section) => section.kind === "experience")?.entries ?? [];
    const documentEntries = buildResumeRenderDocument(profile, draft).sections
      .find((section) => section.kind === "experience")?.entries ?? [];

    expect(experienceEntries.map((entry) => entry.profileRecordId)).toEqual([
      "current_platform",
      "recent_dotnet",
      "older_dotnet",
    ]);
    expect(experienceEntries.map((entry) => entry.sortOrder)).toEqual([0, 1, 2]);
    expect(documentEntries.map((entry) => entry.id)).toEqual(
      experienceEntries.map((entry) => entry.id),
    );
  });

  test("buildResumeDraftFromTailoredDraft keeps suggested-hidden guidance out of rendered resume content", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      experiences: [
        ...seed.profile.experiences,
        {
          id: "experience_sales_bridge",
          companyName: "Bright Market",
          companyUrl: null,
          title: "Sales Operations Associate",
          employmentType: "Full-time",
          location: "Remote",
          workMode: ["remote" as const],
          startDate: "2019-01",
          endDate: "2020-01",
          isCurrent: false,
          isDraft: false,
          summary: "Coordinated customer operations reporting.",
          achievements: ["Prepared weekly pipeline reporting for account teams."],
          skills: [],
          domainTags: [],
          peopleManagementScope: null,
          ownershipScope: null,
        },
      ],
    };
    const draft = buildResumeDraftFromTailoredDraft({
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
      createdAt: "2026-03-20T10:04:00.000Z",
      generationMethod: "deterministic",
      profile,
      draft: {
        label: "Tailored Resume",
        summary: "Grounded software summary.",
        experienceHighlights: [],
        coreSkills: ["React"],
        targetedKeywords: ["React"],
        experienceEntries: [
          {
            title: "Senior systems designer",
            employer: "Signal Systems",
            location: "London, UK",
            dateRange: "Jan 2020 – Present",
            summary: "Built workflow systems.",
            bullets: ["Built workflow systems with React."],
            profileRecordId: seed.profile.experiences[0]?.id ?? "experience_1",
          },
        ],
        projectEntries: [],
        educationEntries: [],
        certificationEntries: [],
        coverageMetadata: [
          {
            profileRecordId: "experience_sales_bridge",
            classification: "suggested_hidden",
            careerFamilyFit: "weak",
            reasons: ["weak career-family fit"],
            reviewGuidance: [
              "Hidden by default for review: this role has a weaker career-family fit for the target job.",
            ],
            coversMeaningfulGap: false,
          },
        ],
        additionalSkills: [],
        languages: [],
        fullText: "Grounded software summary.",
        compatibilityScore: 80,
        notes: [],
      },
    });
    const experienceSection = draft.sections.find((section) => section.kind === "experience");
    const hiddenEntry = experienceSection?.entries.find(
      (entry) => entry.profileRecordId === "experience_sales_bridge",
    );
    const document = buildResumeRenderDocument(profile, draft);

    expect(hiddenEntry).toMatchObject({
      included: false,
      title: "Sales Operations Associate",
    });
    expect(JSON.stringify(document)).not.toContain("weaker career-family fit");
    expect(JSON.stringify(document)).not.toContain("Sales Operations Associate");
  });

  test("buildResumeDraftFromTailoredDraft preserves imported dates and detail when tailored entries are thin", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      experiences: [
        {
          ...seed.profile.experiences[0]!,
          id: "experience_full_stack",
          title: "Full-Stack Software Engineer",
          companyName: "INFOTECH L.L.C",
          location: "Hybrid, Kosovo",
          startDate: "2019-08",
          endDate: "2021-10",
          isCurrent: false,
          summary:
            "Supported and enhanced a comprehensive .NET desktop application for business management covering inventory, sales, tax documentation, POS, restaurant orders, car repair, and fuel-pump control.",
          achievements: [
            "Improved Inventory Management accuracy by integrating live sales data for reliable stock tracking.",
            "Automated invoice generation, reporting, and customer management workflows.",
          ],
        },
      ],
    };
    const draft = buildResumeDraftFromTailoredDraft({
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
      createdAt: "2026-03-20T10:04:00.000Z",
      generationMethod: "ai",
      profile,
      draft: {
        label: "Tailored Resume",
        summary: "Grounded software summary.",
        experienceHighlights: [],
        coreSkills: ["React"],
        targetedKeywords: ["React"],
        experienceEntries: [
          {
            title: "Full-Stack Software Engineer",
            employer: "INFOTECH L.L.C",
            location: "Hybrid, Kosovo",
            dateRange: "Hybrid, Kosovo",
            summary: null,
            bullets: [
              "Supported and enhanced a comprehensive .NET desktop application for business management covering inventory, sales, tax documentation, POS, restaurant orders, car repair, and fuel-pump control.",
            ],
            profileRecordId: "experience_full_stack",
          },
        ],
        projectEntries: [],
        educationEntries: [],
        certificationEntries: [],
        coverageMetadata: [],
        additionalSkills: [],
        languages: [],
        fullText: "Grounded software summary.",
        compatibilityScore: 80,
        notes: [],
      },
    });
    const entry = draft.sections
      .find((section) => section.kind === "experience")
      ?.entries.find((item) => item.profileRecordId === "experience_full_stack");

    expect(entry?.dateRange).toBe("Aug 2019 – Oct 2021");
    expect(entry?.startDate).toBe("2019-08");
    expect(entry?.endDate).toBe("2021-10");
    expect(entry?.isCurrent).toBe(false);
    expect(entry?.summary).toBe(profile.experiences[0]?.summary);
    expect(entry?.bullets.map((bullet) => bullet.text)).toEqual([
      "Supported and enhanced a comprehensive .NET desktop application for business management covering inventory, sales, tax documentation, POS, restaurant orders, car repair, and fuel-pump control.",
      "Improved Inventory Management accuracy by integrating live sales data for reliable stock tracking.",
      "Automated invoice generation, reporting, and customer management workflows.",
    ]);
  });

  test("buildResumeDraftFromTailoredDraft preserves profile-backed education and certification dates", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      certifications: [
        {
          id: "cert_aws",
          name: "AWS Certified Developer",
          issuer: "Amazon Web Services",
          issueDate: "2021-05",
          expiryDate: "2024-05",
          credentialUrl: null,
          isDraft: false,
        },
      ],
    };
    const draft = buildResumeDraftFromTailoredDraft({
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
      createdAt: "2026-03-20T10:04:00.000Z",
      generationMethod: "ai",
      profile,
      draft: {
        label: "Tailored Resume",
        summary: "Grounded software summary.",
        experienceHighlights: [],
        coreSkills: ["React"],
        targetedKeywords: ["React"],
        experienceEntries: [],
        projectEntries: [],
        educationEntries: [
          {
            school: "Royal College of Art",
            degree: "MA",
            fieldOfStudy: "Design Products",
            location: "London, UK",
            dateRange: "London, UK",
            summary: null,
            profileRecordId: "education_1",
          },
        ],
        certificationEntries: [
          {
            name: "AWS Certified Developer",
            issuer: "Amazon Web Services",
            dateRange: "Amazon Web Services",
            profileRecordId: "cert_aws",
          },
        ],
        coverageMetadata: [],
        additionalSkills: [],
        languages: [],
        fullText: "Grounded software summary.",
        compatibilityScore: 80,
        notes: [],
      },
    });
    const education = draft.sections
      .find((section) => section.kind === "education")
      ?.entries.find((entry) => entry.profileRecordId === "education_1");
    const certification = draft.sections
      .find((section) => section.kind === "certifications")
      ?.entries.find((entry) => entry.profileRecordId === "cert_aws");

    expect(education).toMatchObject({
      dateRange: "Sep 2012 – Jun 2014",
      startDate: "2012-09",
      endDate: "2014-06",
    });
    expect(certification).toMatchObject({
      dateRange: "May 2021 – May 2024",
      startDate: "2021-05",
      endDate: "2024-05",
    });
  });

  test("buildResumeDraftFromTailoredDraft canonicalizes profile-backed metadata and splits dense imported descriptions", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      experiences: [
        {
          ...seed.profile.experiences[0]!,
          id: "experience_operations_system",
          title: "Operations Systems Engineer",
          companyName: "AUTOMATEDPROS",
          location: "Remote, Kosovo",
          startDate: "01/07/2023",
          endDate: null,
          isCurrent: true,
          summary: "Led hands-on product engineering across order, kitchen, and billing workflows.",
          achievements: [
            "Engineered a real-time restaurant order platform with React, Next.js, TailwindCSS & WebSockets, synchronizing POS and kitchen screens and eliminating manual order calls. Improved release confidence across kitchen workflows.",
            "Integrated car-repair parts tracking and service scheduling; reducing car-parts load time by 87% (15s to 2s); improving ordering logic aligned with safety protocols.",
          ],
        },
      ],
    };
    const draft = buildResumeDraftFromTailoredDraft({
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
      createdAt: "2026-03-20T10:04:00.000Z",
      generationMethod: "ai",
      profile,
      draft: {
        label: "Tailored Resume",
        summary: "Grounded software summary.",
        experienceHighlights: [],
        coreSkills: ["React", "Next.js"],
        targetedKeywords: ["React"],
        experienceEntries: [
          {
            title: "Operations Systems Engineer",
            employer: "AUTOMATEDPROS",
            location: "Remote, Kosovo",
            dateRange: "Remote, Kosovo | Present",
            summary: "AUTOMATEDPROS Remote Kosovo Present",
            bullets: ["React and WebSockets"],
            profileRecordId: "experience_operations_system",
          },
        ],
        projectEntries: [],
        educationEntries: [],
        certificationEntries: [],
        coverageMetadata: [],
        additionalSkills: [],
        languages: [],
        fullText: "Grounded software summary.",
        compatibilityScore: 80,
        notes: [],
      },
    });
    const entry = draft.sections
      .find((section) => section.kind === "experience")
      ?.entries.find((item) => item.profileRecordId === "experience_operations_system");

    expect(entry?.dateRange).toBe("Jan 2023 – Present");
    expect(entry?.startDate).toBe("01/07/2023");
    expect(entry?.endDate).toBeNull();
    expect(entry?.isCurrent).toBe(true);
    expect(entry?.summary).toBe("Led hands-on product engineering across order, kitchen, and billing workflows.");
    expect(entry?.bullets.map((bullet) => bullet.text)).toEqual([
      "React and WebSockets",
      "Engineered a real-time restaurant order platform with React, Next.js, TailwindCSS & WebSockets, synchronizing POS and kitchen screens and eliminating manual order calls.",
      "Improved release confidence across kitchen workflows.",
    ]);
  });

  test("buildResumeDraftFromTailoredDraft chronologically reinserts suggested-hidden entries", () => {
    const seed = createSeed();
    const profile = {
      ...seed.profile,
      experiences: [
        {
          ...seed.profile.experiences[0]!,
          id: "current_role",
          title: "Current role",
          startDate: "2023-07",
          endDate: null,
          isCurrent: true,
        },
        {
          ...seed.profile.experiences[0]!,
          id: "hidden_middle",
          title: "Hidden middle role",
          startDate: "2019-08",
          endDate: "2022-01",
          isCurrent: false,
        },
        {
          ...seed.profile.experiences[0]!,
          id: "older_role",
          title: "Older role",
          startDate: "2016-01",
          endDate: "2018-08",
          isCurrent: false,
        },
      ],
    };
    const draft = buildResumeDraftFromTailoredDraft({
      job: seed.savedJobs[0]!,
      templateId: seed.settings.resumeTemplateId,
      createdAt: "2026-03-20T10:04:00.000Z",
      generationMethod: "deterministic",
      profile,
      draft: {
        label: "Tailored Resume",
        summary: "Grounded software summary.",
        experienceHighlights: [],
        coreSkills: ["React"],
        targetedKeywords: ["React"],
        experienceEntries: [
          {
            title: "Older role",
            employer: "Example Co",
            location: "Remote",
            dateRange: "Jan 2016 - Aug 2018",
            summary: "Older summary.",
            bullets: ["Older impact."],
            profileRecordId: "older_role",
          },
          {
            title: "Current role",
            employer: "Example Co",
            location: "Remote",
            dateRange: "Jul 2023 - Present",
            summary: "Current summary.",
            bullets: ["Current impact."],
            profileRecordId: "current_role",
          },
        ],
        projectEntries: [],
        educationEntries: [],
        certificationEntries: [],
        coverageMetadata: [
          {
            profileRecordId: "hidden_middle",
            classification: "suggested_hidden",
            careerFamilyFit: "weak",
            reasons: ["weak fit"],
            reviewGuidance: ["Hidden for review."],
            coversMeaningfulGap: false,
          },
        ],
        additionalSkills: [],
        languages: [],
        fullText: "Grounded software summary.",
        compatibilityScore: 80,
        notes: [],
      },
    });
    const experienceEntries = draft.sections.find((section) => section.kind === "experience")?.entries ?? [];

    expect(experienceEntries.map((entry) => entry.profileRecordId)).toEqual([
      "current_role",
      "hidden_middle",
      "older_role",
    ]);
    expect(experienceEntries.find((entry) => entry.profileRecordId === "hidden_middle")?.included).toBe(false);
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
      { field: "email", text: "apply@example.com" },
      { field: "phone", text: "+44 7700 900123" },
      { field: "portfolioUrl", text: "https://alex.example.com" },
      { field: "linkedinUrl", text: "https://www.linkedin.com/in/alex-vanguard" },
      { field: "githubUrl", text: "https://github.com/alex-vanguard" },
      { field: "personalWebsiteUrl", text: "https://alex.dev" },
      { field: "additionalLinks", text: "https://alex.example.com/case-study" },
    ]);
    expect(project).toEqual({
      id: "project_project_workflow_os",
      title: "Workflow OS",
      subtitle: "Design lead",
      location: "https://alex.example.com/workflow-os-case-study",
      dateRange: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
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
    expect(document.contactItems[0]).toEqual({ field: 'email', text: 'tailored@example.com' });
    expect(document.contactItems[1]).toEqual({ field: 'phone', text: '+1 555 0100' });
  });
});
