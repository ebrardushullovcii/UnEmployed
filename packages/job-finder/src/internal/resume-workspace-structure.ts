import type { TailoredResumeDraft } from "@unemployed/ai-providers";
import type {
  CandidateProfile,
  ResumeDraft,
  ResumeDraftOrigin,
  ResumeResearchArtifact,
  ResumeDraftSection,
  ResumeDraftSourceRef,
  ResumeTemplateId,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { ResumeDraftSchema } from "@unemployed/contracts";
import {
  createEntry,
  createSection,
  createSourceRef,
  safeSnippet,
} from "./resume-workspace-primitives";
import { buildJobContextText } from "./resume-workspace-primitives";
import { normalizeText, uniqueStrings } from "./shared";

function joinCompact(parts: ReadonlyArray<string | null | undefined>, separator: string): string | null {
  const values = parts.filter((value): value is string => Boolean(value && value.trim()));
  return values.length > 0 ? values.join(separator) : null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeContactIdentity(value: string): string {
  return normalizeText(value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, ""));
}

function pickProjectLink(project: CandidateProfile["projects"][number] | null | undefined): string | null {
  return normalizeUrl(project?.caseStudyUrl) ?? normalizeUrl(project?.projectUrl) ?? normalizeUrl(project?.repositoryUrl);
}

function formatProjectSummary(input: {
  summary: string | null | undefined;
  outcome: string | null | undefined;
  skills: readonly string[] | undefined;
}): string | null {
  return joinCompact(
    [
      joinCompact([input.summary, input.outcome], " "),
      input.skills && input.skills.length > 0 ? `Technologies: ${uniqueStrings(input.skills).join(", ")}.` : null,
    ],
    " ",
  );
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined, isCurrent?: boolean): string | null {
  const formatMonthYear = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim() ?? "";
    const match = /^(\d{4})-(\d{2})$/.exec(trimmed);

    if (!match) {
      return trimmed || null;
    }

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = Number(match[2]) - 1;
    const month = monthNames[monthIndex];

    return month ? `${month} ${match[1]}` : trimmed;
  };

  const from = formatMonthYear(start);
  const to = isCurrent ? "Present" : formatMonthYear(end);

  if (from && to) {
    return `${from} – ${to}`;
  }

  return from ?? to ?? null;
}

function toSectionPreviewLines(section: ResumeDraftSection): string[] {
  const lines: string[] = [];

  if (section.text?.trim()) {
    lines.push(section.text.trim());
  }

  for (const entry of section.entries
    .filter((item) => item.included)
    .sort((left, right) => left.sortOrder - right.sortOrder)) {
    const heading = joinCompact(
      [
        joinCompact([entry.title, entry.subtitle], " — "),
        joinCompact([entry.location, entry.dateRange], " | "),
      ],
      " | ",
    );

    if (heading) {
      lines.push(heading);
    }

    if (entry.summary?.trim()) {
      lines.push(entry.summary.trim());
    }

    lines.push(
      ...entry.bullets
        .filter((bullet) => bullet.included)
        .map((bullet) => bullet.text.trim())
        .filter(Boolean),
    );
  }

  lines.push(
    ...section.bullets
      .filter((bullet) => bullet.included)
      .map((bullet) => bullet.text.trim())
      .filter(Boolean),
  );

  return lines;
}

export interface ResumeRenderSectionEntry {
  id: string;
  heading: string | null;
  summary: string | null;
  bullets: string[];
}

export interface ResumeRenderSection {
  id: string;
  kind: ResumeDraftSection["kind"];
  label: string;
  text: string | null;
  bullets: string[];
  entries: ResumeRenderSectionEntry[];
}

export interface ResumeRenderDocument {
  fullName: string;
  headline: string | null;
  location: string | null;
  contactItems: string[];
  sections: ResumeRenderSection[];
}

export interface ResumeRenderOptions {
  includePreviewAnchors?: boolean;
}

function buildCoreAndAdditionalSkills(
  profile: Pick<CandidateProfile, "skills" | "skillGroups"> | null | undefined,
  draftSkills: readonly string[],
) {
  const allSkills = uniqueStrings([
    ...draftSkills,
    ...(profile?.skills ?? []),
    ...(profile?.skillGroups.coreSkills ?? []),
    ...(profile?.skillGroups.tools ?? []),
    ...(profile?.skillGroups.languagesAndFrameworks ?? []),
  ]);

  return {
    coreSkills: uniqueStrings(draftSkills).slice(0, 10),
    additionalSkills: allSkills.filter(
      (skill) => !new Set(uniqueStrings(draftSkills).map((entry) => normalizeText(entry))).has(normalizeText(skill)),
    ).slice(0, 10),
  };
}

function buildDraftSectionsFromStructuredTailoredDraft(input: {
  createdAt: string;
  draft: TailoredResumeDraft;
  origin: ResumeDraftOrigin;
  profile: CandidateProfile | undefined;
  sharedRefs: readonly ResumeDraftSourceRef[];
}): ResumeDraftSection[] {
  const { createdAt, draft, origin, profile, sharedRefs } = input;
  const draftSkills = buildCoreAndAdditionalSkills(profile, draft.coreSkills);
  const sections: ResumeDraftSection[] = [];

  sections.push(
    createSection({
      id: "section_summary",
      kind: "summary",
      label: "Summary",
      text: draft.summary,
      updatedAt: createdAt,
      origin,
      sortOrder: 0,
      sourceRefs: sharedRefs,
    }),
  );

  const experienceEntries = draft.experienceEntries.map((entry, index) =>
    createEntry({
      id: entry.profileRecordId ? `experience_${entry.profileRecordId}` : `experience_entry_${index + 1}`,
      entryType: "experience",
      title: entry.title,
      subtitle: entry.employer,
      location: entry.location,
      dateRange: entry.dateRange,
      summary: entry.summary,
      bullets: entry.bullets,
      updatedAt: createdAt,
      origin,
      sortOrder: index,
      profileRecordId: entry.profileRecordId,
      sourceRefs: sharedRefs,
    }),
  );

  if (experienceEntries.length > 0 || draft.experienceHighlights.length > 0) {
    sections.push(
      createSection({
        id: "section_experience",
        kind: "experience",
        label: "Experience",
        bullets: draft.experienceHighlights,
        entries: experienceEntries,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  if (draftSkills.coreSkills.length > 0) {
    sections.push(
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: draftSkills.coreSkills,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  const projectEntries = draft.projectEntries.map((entry, index) => {
    const profileProject = profile?.projects.find((project) => project.id === entry.profileRecordId);

    return createEntry({
      id: entry.profileRecordId ? `project_${entry.profileRecordId}` : `project_entry_${index + 1}`,
      entryType: "project",
      title: entry.name,
      subtitle: entry.role,
      location: pickProjectLink(profileProject),
      summary: formatProjectSummary({
        summary: entry.summary,
        outcome: entry.outcome,
        skills: profileProject?.skills,
      }),
      bullets: entry.bullets,
      updatedAt: createdAt,
      origin,
      sortOrder: index,
      profileRecordId: entry.profileRecordId,
      sourceRefs: sharedRefs,
    });
  });

  if (projectEntries.length > 0) {
    sections.push(
      createSection({
        id: "section_projects",
        kind: "projects",
        label: "Projects",
        entries: projectEntries,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  const educationEntries = draft.educationEntries.map((entry, index) =>
    createEntry({
      id: entry.profileRecordId ? `education_${entry.profileRecordId}` : `education_entry_${index + 1}`,
      entryType: "education",
      title: entry.school,
      subtitle: joinCompact([entry.degree, entry.fieldOfStudy], ", "),
      location: entry.location,
      dateRange: entry.dateRange,
      summary: entry.summary,
      updatedAt: createdAt,
      origin,
      sortOrder: index,
      profileRecordId: entry.profileRecordId,
      sourceRefs: sharedRefs,
    }),
  );

  if (educationEntries.length > 0) {
    sections.push(
      createSection({
        id: "section_education",
        kind: "education",
        label: "Education",
        entries: educationEntries,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  const certificationEntries = draft.certificationEntries.map((entry, index) =>
    createEntry({
      id: entry.profileRecordId ? `certification_${entry.profileRecordId}` : `certification_entry_${index + 1}`,
      entryType: "certification",
      title: entry.name,
      subtitle: entry.issuer,
      dateRange: entry.dateRange,
      updatedAt: createdAt,
      origin,
      sortOrder: index,
      profileRecordId: entry.profileRecordId,
      sourceRefs: sharedRefs,
    }),
  );

  if (certificationEntries.length > 0) {
    sections.push(
      createSection({
        id: "section_certifications",
        kind: "certifications",
        label: "Certifications",
        entries: certificationEntries,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  const additionalSkills = uniqueStrings([...draft.additionalSkills, ...draftSkills.additionalSkills]).slice(0, 10);
  if (additionalSkills.length > 0) {
    sections.push(
      createSection({
        id: "section_additional_skills",
        kind: "skills",
        label: "Additional Skills",
        bullets: additionalSkills,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  if (draft.languages.length > 0) {
    sections.push(
      createSection({
        id: "section_languages",
        kind: "skills",
        label: "Languages",
        bullets: uniqueStrings(draft.languages).slice(0, 8),
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
    );
  }

  if (draft.targetedKeywords.length > 0) {
    sections.push({
      ...createSection({
        id: "section_keywords",
        kind: "keywords",
        label: "Targeted Keywords",
        bullets: draft.targetedKeywords,
        updatedAt: createdAt,
        origin,
        sortOrder: sections.length,
        sourceRefs: sharedRefs,
      }),
      included: false,
    });
  }

  return sections.filter((section) =>
    Boolean(section.text) ||
    section.bullets.length > 0 ||
    section.entries.length > 0,
  );
}

export function buildPreviewSectionsFromResumeDraft(draft: ResumeDraft): Array<{ heading: string; lines: string[] }> {
  return [...draft.sections]
    .filter((section) => section.included)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => ({
      heading: section.label,
      lines: toSectionPreviewLines(section),
    }))
    .filter((section) => section.lines.length > 0);
}

export function buildTailoredResumeTextFromResumeDraft(
  profile: CandidateProfile,
  job: SavedJob,
  draft: ResumeDraft,
): string {
  const sections = buildPreviewSectionsFromResumeDraft(draft)
    .map((section) => `${section.heading}\n${section.lines.join("\n")}`)
    .join("\n\n");

  return [
    profile.fullName,
    profile.headline,
    joinCompact(
      [
        profile.currentLocation,
        profile.email,
        profile.phone,
        profile.portfolioUrl,
        profile.linkedinUrl,
      ],
      " | ",
    ),
    "",
    `${job.title} at ${job.company}`,
    "",
    sections,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n");
}

export function buildResumeRenderDocument(
  profile: CandidateProfile,
  draft: ResumeDraft,
  options?: ResumeRenderOptions,
): ResumeRenderDocument {
  void options;
  const preferredLinks = profile.applicationIdentity.preferredLinkIds
    .map((linkId) => profile.links.find((link) => link.id === linkId && link.url))
    .filter((link): link is NonNullable<typeof link> => Boolean(link?.url));
  const fallbackLinks = profile.links.filter((link) =>
    link.url &&
    ["portfolio", "github", "website", "case_study"].includes(link.kind ?? "") &&
    !preferredLinks.some((preferredLink) => preferredLink.id === link.id),
  );
  const contactItems = [
    profile.applicationIdentity.preferredEmail ?? profile.email,
    profile.applicationIdentity.preferredPhone ?? profile.phone,
    profile.portfolioUrl,
    profile.linkedinUrl,
    profile.githubUrl,
    profile.personalWebsiteUrl,
    ...[...preferredLinks, ...fallbackLinks].map((link) => link.url),
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, values) => values.findIndex((entry) => normalizeContactIdentity(entry) === normalizeContactIdentity(value)) === index);

  return {
    fullName: profile.fullName,
    headline: profile.headline ?? null,
    location: profile.currentLocation ?? null,
    contactItems,
    sections: [...draft.sections]
      .filter((section) => section.included)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        id: section.id,
        kind: section.kind,
        label: section.label,
        text: section.text?.trim() || null,
        bullets: section.bullets
          .filter((bullet) => bullet.included)
          .map((bullet) => bullet.text.trim())
          .filter(Boolean),
        entries: section.entries
          .filter((entry) => entry.included)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((entry) => ({
            id: entry.id,
            heading: joinCompact(
              [
                joinCompact([entry.title, entry.subtitle], " — "),
                joinCompact([entry.location, entry.dateRange], " | "),
              ],
              " | ",
            ),
            summary: entry.summary?.trim() || null,
            bullets: entry.bullets
              .filter((bullet) => bullet.included)
              .map((bullet) => bullet.text.trim())
              .filter(Boolean),
          })),
      }))
      .filter((section) =>
        Boolean(section.text) ||
        section.bullets.length > 0 ||
        section.entries.length > 0,
      ),
  };
}

export function buildResumeDraftFromTailoredDraft(input: {
  job: SavedJob;
  templateId: ResumeTemplateId;
  draft: TailoredResumeDraft;
  createdAt: string;
  existingDraftId?: string | null;
  generationMethod: ResumeDraft["generationMethod"];
  profile?: CandidateProfile;
  research?: readonly ResumeResearchArtifact[];
}): ResumeDraft {
  const { createdAt, draft, existingDraftId, generationMethod, job, templateId } = input;
  const jobRef = createSourceRef(
    "job",
    job.id,
    safeSnippet(job.description || job.summary || buildJobContextText(job)),
  );
  const resumeRef = input.profile?.baseResume.textContent
    ? createSourceRef("resume", input.profile.baseResume.id, safeSnippet(input.profile.baseResume.textContent))
    : null;
  const firstResearch = input.research?.find((artifact) => artifact.fetchStatus === "success") ?? null;
  const researchRef = firstResearch
    ? createSourceRef("research", firstResearch.id, safeSnippet(firstResearch.companyNotes))
    : null;
  const sharedRefs = [jobRef, resumeRef, researchRef].filter(
    (value): value is ResumeDraftSourceRef => value !== null,
  );
  const origin = generationMethod === "ai" ? "ai_generated" : "deterministic_fallback";

  return ResumeDraftSchema.parse({
    id: existingDraftId ?? `resume_draft_${job.id}`,
    jobId: job.id,
    status: "needs_review",
    templateId,
    sections: buildDraftSectionsFromStructuredTailoredDraft({
      createdAt,
      draft,
      origin,
      profile: input.profile,
      sharedRefs,
    }),
    targetPageCount: 2,
    generationMethod,
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt,
    updatedAt: createdAt,
  });
}

export function seedResumeDraft(input: {
  profile: CandidateProfile;
  job: SavedJob;
  templateId: ResumeTemplateId;
  tailoredAsset?: TailoredAsset | null;
}): ResumeDraft {
  const now = input.tailoredAsset?.updatedAt ?? new Date().toISOString();
  const tailoredAsset = input.tailoredAsset;

  if (tailoredAsset?.previewSections.length) {
    const seededSections = tailoredAsset.previewSections
      .map((section, index) =>
        createSection({
          id: `section_seeded_${normalizeText(section.heading).replaceAll(" ", "_") || index + 1}`,
          kind: normalizeText(section.heading).includes("skill")
            ? "skills"
            : normalizeText(section.heading).includes("project")
              ? "projects"
              : normalizeText(section.heading).includes("education")
                ? "education"
                : normalizeText(section.heading).includes("certification")
                  ? "certifications"
                  : normalizeText(section.heading).includes("keyword")
                    ? "keywords"
                    : normalizeText(section.heading).includes("summary")
                      ? "summary"
                      : "experience",
          label: section.heading,
          text: normalizeText(section.heading).includes("summary") ? (section.lines[0] ?? null) : null,
          bullets: normalizeText(section.heading).includes("summary") ? section.lines.slice(1) : section.lines,
          updatedAt: now,
          origin: tailoredAsset.generationMethod === "ai_assisted" ? "ai_generated" : "deterministic_fallback",
          sortOrder: index,
        }),
      )
      .filter((section) => section.text || section.bullets.length > 0);

    if (seededSections.length > 0) {
      return ResumeDraftSchema.parse({
        id: `resume_draft_${input.job.id}`,
        jobId: input.job.id,
        status: "draft",
        templateId: input.templateId,
        sections: seededSections,
        targetPageCount: 2,
        generationMethod:
          tailoredAsset.generationMethod === "ai_assisted" ? "ai" : "deterministic",
        approvedAt: null,
        approvedExportId: null,
        staleReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const coreSkills = uniqueStrings([
    ...input.profile.skills,
    ...input.profile.skillGroups.coreSkills,
    ...input.profile.skillGroups.tools,
  ]).slice(0, 10);
  const additionalSkills = uniqueStrings([
    ...input.profile.skillGroups.languagesAndFrameworks,
    ...input.profile.skillGroups.highlightedSkills,
  ]).filter((skill) => !coreSkills.some((coreSkill) => normalizeText(coreSkill) === normalizeText(skill)));
  const experienceEntries = input.profile.experiences.map((experience, index) =>
    createEntry({
      id: `experience_${experience.id}`,
      entryType: "experience",
      title: experience.title,
      subtitle: experience.companyName,
      location: experience.location,
      dateRange: formatDateRange(experience.startDate, experience.endDate, experience.isCurrent),
      summary: experience.summary,
      bullets: experience.achievements,
      updatedAt: now,
      origin: "imported",
      sortOrder: index,
      profileRecordId: experience.id,
    }),
  );
  const projectEntries = input.profile.projects.map((project, index) =>
    createEntry({
      id: `project_${project.id}`,
      entryType: "project",
      title: project.name,
      subtitle: project.role,
      location: pickProjectLink(project),
      summary: formatProjectSummary({
        summary: project.summary,
        outcome: project.outcome,
        skills: project.skills,
      }),
      bullets: [],
      updatedAt: now,
      origin: "imported",
      sortOrder: index,
      profileRecordId: project.id,
    }),
  );
  const educationEntries = input.profile.education.map((education, index) =>
    createEntry({
      id: `education_${education.id}`,
      entryType: "education",
      title: education.schoolName,
      subtitle: joinCompact([education.degree, education.fieldOfStudy], ", "),
      location: education.location,
      dateRange: formatDateRange(education.startDate, education.endDate),
      summary: education.summary,
      updatedAt: now,
      origin: "imported",
      sortOrder: index,
      profileRecordId: education.id,
    }),
  );
  const certificationEntries = input.profile.certifications.map((certification, index) =>
    createEntry({
      id: `certification_${index + 1}`,
      entryType: "certification",
      title: certification.name,
      subtitle: certification.issuer,
      dateRange: formatDateRange(certification.issueDate, certification.expiryDate),
      updatedAt: now,
      origin: "imported",
      sortOrder: index,
    }),
  );
  const summaryText =
    input.profile.professionalSummary.fullSummary ??
    input.profile.summary ??
    `${input.profile.headline} targeting ${input.job.title} opportunities.`;

  return ResumeDraftSchema.parse({
    id: `resume_draft_${input.job.id}`,
    jobId: input.job.id,
    status: "draft",
    templateId: input.templateId,
    sections: [
      createSection({
        id: "section_summary",
        kind: "summary",
        label: "Summary",
        text: summaryText,
        updatedAt: now,
        origin: "imported",
        sortOrder: 0,
      }),
      createSection({
        id: "section_experience",
        kind: "experience",
        label: "Experience",
        entries: experienceEntries,
        updatedAt: now,
        origin: "imported",
        sortOrder: 1,
      }),
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: coreSkills,
        updatedAt: now,
        origin: "imported",
        sortOrder: 2,
      }),
      ...(projectEntries.length > 0
        ? [
            createSection({
              id: "section_projects",
              kind: "projects",
              label: "Projects",
              entries: projectEntries,
              updatedAt: now,
              origin: "imported",
              sortOrder: 3,
            }),
          ]
        : []),
      ...(educationEntries.length > 0
        ? [
            createSection({
              id: "section_education",
              kind: "education",
              label: "Education",
              entries: educationEntries,
              updatedAt: now,
              origin: "imported",
              sortOrder: 4,
            }),
          ]
        : []),
      ...(certificationEntries.length > 0
        ? [
            createSection({
              id: "section_certifications",
              kind: "certifications",
              label: "Certifications",
              entries: certificationEntries,
              updatedAt: now,
              origin: "imported",
              sortOrder: 5,
            }),
          ]
        : []),
      ...(additionalSkills.length > 0
        ? [
            createSection({
              id: "section_additional_skills",
              kind: "skills",
              label: "Additional Skills",
              bullets: additionalSkills,
              updatedAt: now,
              origin: "imported",
              sortOrder: 6,
            }),
          ]
        : []),
      ...(input.profile.spokenLanguages.length > 0
        ? [
            createSection({
              id: "section_languages",
              kind: "skills",
              label: "Languages",
              bullets: input.profile.spokenLanguages.map((language) =>
                joinCompact([language.language, language.proficiency], " — ") ?? language.language ?? "",
              ).filter(Boolean),
              updatedAt: now,
              origin: "imported",
              sortOrder: 7,
            }),
          ]
        : []),
    ].filter((section) =>
      Boolean(section.text) ||
      section.bullets.length > 0 ||
      section.entries.length > 0,
    ),
    targetPageCount: 2,
    generationMethod: "manual",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: now,
    updatedAt: now,
  });
}
