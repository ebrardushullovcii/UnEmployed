import type { TailoredResumeDraft } from "@unemployed/ai-providers";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeDraftSchema,
  ResumeExportArtifactSchema,
  ResumeValidationResultSchema,
  TailoredAssetSchema,
  type CandidateProfile,
  type JobFinderSettings,
  type ResumeAssistantMessage,
  type ResumeDraft,
  type ResumeDraftPatch,
  type ResumeDraftRevision,
  type ResumeExportArtifact,
  type ResumeResearchArtifact,
  type ResumeDraftSourceRef,
  type ResumeValidationIssue,
  type ResumeValidationResult,
  type SavedJob,
  type TailoredAsset,
} from "@unemployed/contracts";
import { createLocalKnowledgeIndex } from "@unemployed/knowledge-base";
import { createUniqueId, normalizeText, tokenize, uniqueStrings } from "./shared";
import {
  buildJobContextText,
  buildPriorityJobTerms,
  createSection,
  createSourceRef,
  safeSnippet,
  toSectionKind,
} from "./resume-workspace-primitives";

export interface ResumeWorkspaceEvidence {
  summary: readonly string[];
  candidateSummary: readonly string[];
  experience: readonly string[];
  skills: readonly string[];
  keywords: readonly string[];
}

export interface ResumeWorkspaceResearchContext {
  companyNotes: readonly string[];
  domainVocabulary: readonly string[];
  priorityThemes: readonly string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSeededSectionId(
  heading: string,
  index: number,
  counts: Map<string, number>,
): string {
  const slug = normalizeText(heading).replaceAll(" ", "_") || `${index + 1}`;
  const nextCount = (counts.get(slug) ?? 0) + 1;
  counts.set(slug, nextCount);

  return nextCount === 1 ? `section_${slug}` : `section_${slug}_${nextCount}`;
}

function matchesWholePhrase(candidate: string, phrase: string): boolean {
  const desiredTokens = tokenize(phrase);

  if (desiredTokens.length === 0) {
    return false;
  }

  const candidateTokens = new Set(tokenize(candidate));

  if (desiredTokens.length === 1) {
    return candidateTokens.has(desiredTokens[0] ?? "");
  }

  return new RegExp(
    `(^|\\s)${escapeRegex(normalizeText(phrase))}($|\\s)`,
  ).test(normalizeText(candidate));
}

export function buildPreviewSectionsFromResumeDraft(
  draft: ResumeDraft,
): Array<{ heading: string; lines: string[] }> {
  return [...draft.sections]
    .filter((section) => section.included)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((section) => {
      const lines = [
        ...(section.text ? [section.text] : []),
        ...section.bullets.filter((bullet) => bullet.included).map((bullet) => bullet.text),
      ];

      return {
        heading: section.label,
        lines,
      };
    })
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

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`;
}

export function buildResumeDraftFromTailoredDraft(input: {
  job: SavedJob;
  settings: JobFinderSettings;
  draft: TailoredResumeDraft;
  createdAt: string;
  existingDraftId?: string | null;
  generationMethod: ResumeDraft["generationMethod"];
  profile?: CandidateProfile;
  research?: readonly ResumeResearchArtifact[];
}): ResumeDraft {
  const { createdAt, draft, existingDraftId, generationMethod, job, settings } = input;
  const jobRef = createSourceRef("job", job.id, safeSnippet(job.description || job.summary || buildJobContextText(job)));
  const resumeRef = input.profile?.baseResume.textContent
    ? createSourceRef("resume", input.profile.baseResume.id, safeSnippet(input.profile.baseResume.textContent))
    : null;
  const researchRef = input.research?.find((artifact) => artifact.fetchStatus === "success")
    ? createSourceRef(
        "research",
        input.research.find((artifact) => artifact.fetchStatus === "success")?.id ?? null,
        safeSnippet(input.research.find((artifact) => artifact.fetchStatus === "success")?.companyNotes ?? null),
      )
    : null;
  const sharedRefs = [jobRef, resumeRef, researchRef].filter(
    (value): value is ResumeDraftSourceRef => value !== null,
  );

  return ResumeDraftSchema.parse({
    id: existingDraftId ?? `resume_draft_${job.id}`,
    jobId: job.id,
    status: "needs_review",
    templateId: settings.resumeTemplateId,
    sections: [
      createSection({
        id: "section_summary",
        kind: "summary",
        label: "Summary",
        text: draft.summary,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 0,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_experience",
        kind: "experience",
        label: "Experience Highlights",
        bullets: draft.experienceHighlights,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 1,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: draft.coreSkills,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 2,
        sourceRefs: sharedRefs,
      }),
      createSection({
        id: "section_keywords",
        kind: "keywords",
        label: "Targeted Keywords",
        bullets: draft.targetedKeywords,
        updatedAt: createdAt,
        origin: generationMethod === "ai" ? "ai_generated" : "deterministic_fallback",
        sortOrder: 3,
        sourceRefs: sharedRefs,
      }),
    ].filter((section) => section.text || section.bullets.length > 0),
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
  settings: JobFinderSettings;
  tailoredAsset?: TailoredAsset | null;
}): ResumeDraft {
  const now = input.tailoredAsset?.updatedAt ?? new Date().toISOString();
  const tailoredAsset = input.tailoredAsset;

  if (tailoredAsset) {
    const sectionCounts = new Map<string, number>();
    const seededSections = tailoredAsset.previewSections
      .map((section, index) => {
        const kind = toSectionKind(section.heading);
        const text = kind === "summary" && section.lines[0] ? section.lines[0] : null;
        const bullets = kind === "summary" ? section.lines.slice(1) : section.lines;

        return createSection({
          id: buildSeededSectionId(section.heading, index, sectionCounts),
          kind,
          label: section.heading,
          text,
          bullets,
          updatedAt: now,
          origin:
            tailoredAsset.generationMethod === "ai_assisted"
              ? "ai_generated"
              : "deterministic_fallback",
          sortOrder: index,
        });
      })
      .filter((section) => section.text || section.bullets.length > 0);

    if (seededSections.length > 0) {
      return ResumeDraftSchema.parse({
        id: `resume_draft_${input.job.id}`,
        jobId: input.job.id,
        status: "draft",
        templateId: input.settings.resumeTemplateId,
        sections: seededSections,
        targetPageCount: 2,
        generationMethod:
          tailoredAsset.generationMethod === "ai_assisted"
            ? "ai"
            : "deterministic",
        approvedAt: null,
        approvedExportId: null,
        staleReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const summaryText =
    input.profile.professionalSummary.fullSummary ??
    input.profile.summary ??
    `${input.profile.headline} targeting ${input.job.title} opportunities.`;
  const matchingSkills = uniqueStrings([
    ...input.job.keySkills.filter((skill) =>
      input.profile.skills.some(
        (profileSkill) => normalizeText(profileSkill) === normalizeText(skill),
      ),
    ),
    ...input.profile.skills,
  ]).slice(0, 8);
  const experienceBullets = input.profile.experiences
    .flatMap((experience) => experience.achievements)
    .slice(0, 6);

  return ResumeDraftSchema.parse({
    id: `resume_draft_${input.job.id}`,
    jobId: input.job.id,
    status: "draft",
    templateId: input.settings.resumeTemplateId,
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
        label: "Experience Highlights",
        bullets: experienceBullets,
        updatedAt: now,
        origin: "imported",
        sortOrder: 1,
      }),
      createSection({
        id: "section_skills",
        kind: "skills",
        label: "Core Skills",
        bullets: matchingSkills,
        updatedAt: now,
        origin: "imported",
        sortOrder: 2,
      }),
    ].filter((section) => section.text || section.bullets.length > 0),
    targetPageCount: 2,
    generationMethod: "manual",
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function validateResumeDraft(input: {
  draft: ResumeDraft;
  job: SavedJob;
  pageCount?: number | null;
  validatedAt?: string;
}): ResumeValidationResult {
  const validatedAt = input.validatedAt ?? new Date().toISOString();
  const issues: ResumeValidationIssue[] = [];
  const seenBullets = new Map<string, { sectionId: string; bulletId: string }>();
  const includedSections = input.draft.sections.filter((section) => section.included);

  for (const section of includedSections) {
    const includedBullets = section.bullets.filter((bullet) => bullet.included);

    if (!section.text && includedBullets.length === 0) {
      issues.push({
        id: `issue_empty_${section.id}`,
        severity: "warning",
        category: "empty_section",
        sectionId: section.id,
        bulletId: null,
        message: `${section.label} is included but has no content yet.`,
      });
    }

    for (const bullet of includedBullets) {
      const normalizedBullet = normalizeText(bullet.text);
      const existing = seenBullets.get(normalizedBullet);

      if (existing) {
        issues.push({
          id: `issue_duplicate_${bullet.id}`,
          severity: "warning",
          category: "duplicate_bullet",
          sectionId: section.id,
          bulletId: bullet.id,
          message: "This bullet duplicates another included bullet.",
        });
      } else {
        seenBullets.set(normalizedBullet, {
          sectionId: section.id,
          bulletId: bullet.id,
        });
      }
    }
  }

  const visibleText = normalizeText(
    buildPreviewSectionsFromResumeDraft(input.draft)
      .flatMap((section) => section.lines)
      .join(" "),
  );
  const keywordTargets = buildPriorityJobTerms(input.job);
  const matchingKeywords = keywordTargets.filter((skill) =>
    matchesWholePhrase(visibleText, skill),
  );

  if (keywordTargets.length > 0 && matchingKeywords.length === 0) {
    issues.push({
      id: `issue_keywords_${input.draft.id}`,
      severity: "info",
      category: "poor_keyword_coverage",
      sectionId: null,
      bulletId: null,
      message: "The current draft does not yet echo the saved job keywords.",
    });
  }

  if (input.pageCount && input.pageCount > input.draft.targetPageCount) {
    issues.push({
      id: `issue_page_overflow_${input.draft.id}`,
      severity: input.pageCount >= 3 ? "error" : "warning",
      category: "page_overflow",
      sectionId: null,
      bulletId: null,
      message:
        input.pageCount >= 3
          ? "The exported resume reached 3 or more pages and needs manual review."
          : "The exported resume exceeded the 2-page target.",
    });
  }

  if (input.draft.status === "stale" || input.draft.staleReason) {
    issues.push({
      id: `issue_stale_${input.draft.id}`,
      severity: "warning",
      category: "stale_approval",
      sectionId: null,
      bulletId: null,
      message: input.draft.staleReason ?? "This approved resume is stale and should be re-reviewed.",
    });
  }

  return ResumeValidationResultSchema.parse({
    id: `resume_validation_${input.draft.id}`,
    draftId: input.draft.id,
    issues,
    pageCount: input.pageCount ?? null,
    validatedAt,
  });
}

export { applyPatchToResumeDraft } from "./resume-workspace-patches";

export function buildResumeDraftRevision(input: {
  draft: ResumeDraft;
  createdAt: string;
  reason?: string | null;
}): ResumeDraftRevision {
  return ResumeDraftRevisionSchema.parse({
    id: createUniqueId(`resume_revision_${input.draft.id}`),
    draftId: input.draft.id,
    snapshotSections: input.draft.sections,
    createdAt: input.createdAt,
    reason: input.reason ?? null,
  });
}

export function buildResumeExportArtifact(input: {
  draft: ResumeDraft;
  job: SavedJob;
  filePath: string;
  exportedAt: string;
  pageCount?: number | null;
  isApproved?: boolean;
}): ResumeExportArtifact {
  return ResumeExportArtifactSchema.parse({
    id: createUniqueId(`resume_export_${input.job.id}`),
    draftId: input.draft.id,
    jobId: input.job.id,
    format: "pdf",
    filePath: input.filePath,
    pageCount: input.pageCount ?? null,
    templateId: input.draft.templateId,
    exportedAt: input.exportedAt,
    isApproved: input.isApproved ?? false,
  });
}

export function buildTailoredAssetBridge(input: {
  draft: ResumeDraft;
  job: SavedJob;
  profile: CandidateProfile;
  existingAsset?: TailoredAsset | null;
  storagePath?: string | null;
  clearStoragePath?: boolean;
  pageCount?: number | null;
  notes?: readonly string[];
  compatibilityScore?: number | null;
}): TailoredAsset {
  const updatedAt = input.draft.updatedAt;
  const shouldClearStoragePath =
    (input.clearStoragePath ?? false) || input.draft.status === "stale";
  const resolvedStoragePath = shouldClearStoragePath
    ? null
    : input.storagePath ?? input.existingAsset?.storagePath ?? null;
  const isApprovalStale = input.draft.status === "stale" || !resolvedStoragePath;
  const fallbackStatus = isApprovalStale
    ? "failed"
    : input.existingAsset?.status ?? "queued";
  const fallbackProgressPercent = isApprovalStale
    ? 0
    : input.existingAsset?.progressPercent ?? 0;

  return TailoredAssetSchema.parse({
    id: input.existingAsset?.id ?? `resume_${input.job.id}`,
    jobId: input.job.id,
    kind: "resume",
    status: resolvedStoragePath ? "ready" : fallbackStatus,
    label: input.existingAsset?.label ?? "Tailored Resume",
    version: input.existingAsset?.version ?? "v1",
    templateName: input.existingAsset?.templateName ?? input.draft.templateId,
    compatibilityScore:
      input.compatibilityScore ?? input.existingAsset?.compatibilityScore ?? input.job.matchAssessment.score,
    progressPercent: resolvedStoragePath ? 100 : fallbackProgressPercent,
    updatedAt,
    storagePath: resolvedStoragePath,
    contentText: buildTailoredResumeTextFromResumeDraft(
      input.profile,
      input.job,
      input.draft,
    ),
    previewSections: buildPreviewSectionsFromResumeDraft(input.draft),
    generationMethod:
      input.draft.generationMethod === "ai" ? "ai_assisted" : "deterministic",
    notes: uniqueStrings([
      ...(input.existingAsset?.notes ?? []),
      ...(input.notes ?? []),
      ...(input.pageCount ? [`Generated PDF page count: ${input.pageCount}.`] : []),
    ]),
  });
}

export function buildUnavailableAssistantReply(jobId: string): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: createUniqueId(`resume_message_assistant_${jobId}`),
    jobId,
    role: "assistant",
    content:
      "Resume assistant editing is not available in this workspace yet. Save manual edits or regenerate the draft instead.",
    patches: [],
    createdAt: new Date().toISOString(),
  });
}

export function buildAssistantReplyMessage(input: {
  jobId: string;
  content: string;
  patches: readonly ResumeDraftPatch[];
}): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: createUniqueId(`resume_message_assistant_${input.jobId}`),
    jobId: input.jobId,
    role: "assistant",
    content: input.content,
    patches: [...input.patches],
    createdAt: new Date().toISOString(),
  });
}

export function collectResumeWorkspaceEvidence(input: {
  profile: CandidateProfile;
  job: SavedJob;
  research: readonly ResumeResearchArtifact[];
}): ResumeWorkspaceEvidence {
  const index = createLocalKnowledgeIndex();
  const candidateSummaryEvidence = uniqueStrings([
    input.profile.professionalSummary.shortValueProposition ?? "",
    input.profile.professionalSummary.fullSummary ?? "",
    input.profile.summary ?? "",
    ...input.profile.experiences
      .map((experience) => experience.summary ?? "")
      .filter(Boolean),
  ]).slice(0, 4);

  if (input.profile.baseResume.textContent) {
    index.addDocument(input.profile.baseResume.id, input.profile.baseResume.textContent, {
      tags: ["resume"],
      title: "Base Resume",
      section: "resume",
      sourceId: input.profile.baseResume.id,
    });
  }

  input.profile.experiences.forEach((experience) => {
    const text = [
      experience.title,
      experience.companyName,
      experience.summary,
      ...experience.achievements,
      ...experience.skills,
    ]
      .filter(Boolean)
      .join(" ");
    if (text.trim()) {
      index.addDocument(experience.id, text, {
        tags: ["profile"],
        title: experience.title,
        section: "experience",
        sourceId: experience.id,
      });
    }
  });

  const skillText = uniqueStrings([
    ...input.profile.skills,
    ...input.profile.skillGroups.coreSkills,
    ...input.profile.skillGroups.tools,
    ...input.profile.skillGroups.languagesAndFrameworks,
  ]).join(" ");
  if (skillText.trim()) {
    index.addDocument("profile_skills", skillText, {
      tags: ["profile"],
      title: "Profile Skills",
      section: "skills",
      sourceId: "profile_skills",
    });
  }

  index.addDocument(input.job.id, buildJobContextText(input.job), {
    tags: ["job"],
    title: input.job.title,
    section: "job",
    sourceId: input.job.id,
  });

  input.research.forEach((artifact) => {
    const text = [
      artifact.pageTitle,
      artifact.companyNotes,
      artifact.extractedText,
      ...artifact.domainVocabulary,
      ...artifact.priorityThemes,
    ]
      .filter(Boolean)
      .join(" ");
    if (text.trim()) {
      index.addDocument(artifact.id, text, {
        tags: ["research"],
        title: artifact.pageTitle,
        section: "research",
        sourceId: artifact.id,
      });
    }
  });

  return {
    summary: index.search(`${input.job.title} ${input.job.company} summary`, { limit: 3 }).map((entry: { text: string }) => entry.text),
    candidateSummary: candidateSummaryEvidence,
    experience: index.search(`${input.job.title} ${buildPriorityJobTerms(input.job).join(" ")} achievements`, { limit: 4, tags: ["profile", "resume"] }).map((entry: { text: string }) => entry.text),
    skills: index.search(`${buildPriorityJobTerms(input.job).join(" ")} ${input.job.title} skills`, { limit: 6, tags: ["profile", "job"] }).map((entry: { text: string }) => entry.text),
    keywords: uniqueStrings([
      ...buildPriorityJobTerms(input.job),
      ...input.research.flatMap((artifact) => artifact.domainVocabulary),
    ]).slice(0, 8),
  };
}

export function collectResearchContext(
  research: readonly ResumeResearchArtifact[],
): ResumeWorkspaceResearchContext {
  return {
    companyNotes: research
      .map((artifact) => artifact.companyNotes)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3),
    domainVocabulary: uniqueStrings(research.flatMap((artifact) => artifact.domainVocabulary)).slice(0, 8),
    priorityThemes: uniqueStrings(research.flatMap((artifact) => artifact.priorityThemes)).slice(0, 6),
  };
}
