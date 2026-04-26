import {
  buildCandidateSkillBank,
  type TailoredResumeDraft,
} from "@unemployed/ai-providers";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeExportArtifactSchema,
  ResumeValidationResultSchema,
  TailoredAssetSchema,
  type CandidateProfile,
  type ResumeAssistantMessage,
    type ResumeDraft,
    type ResumeDraftBullet,
    type ResumeDraftPatch,
    type ResumeDraftRevision,
   type ResumeExportArtifact,
   type ResumeResearchArtifact,
  type ResumeTemplateDefinition,
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
} from "./resume-workspace-primitives";
import {
  buildPreviewSectionsFromResumeDraft as buildStructuredPreviewSectionsFromResumeDraft,
  buildResumeDraftFromTailoredDraft as buildStructuredResumeDraftFromTailoredDraft,
  buildTailoredResumeTextFromResumeDraft as buildStructuredTailoredResumeTextFromResumeDraft,
  seedResumeDraft as seedStructuredResumeDraft,
} from "./resume-workspace-structure";

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
  return buildStructuredPreviewSectionsFromResumeDraft(draft);
}

export function buildTailoredResumeTextFromResumeDraft(
  profile: CandidateProfile,
  job: SavedJob,
  draft: ResumeDraft,
): string {
  return buildStructuredTailoredResumeTextFromResumeDraft(profile, job, draft);
}

export function buildResumeDraftFromTailoredDraft(input: {
  job: SavedJob;
  templateId: ResumeDraft["templateId"];
  draft: TailoredResumeDraft;
  createdAt: string;
  existingDraftId?: string | null;
  generationMethod: ResumeDraft["generationMethod"];
  profile?: CandidateProfile;
  research?: readonly ResumeResearchArtifact[];
}): ResumeDraft {
  return buildStructuredResumeDraftFromTailoredDraft(input);
}

export function seedResumeDraft(input: {
  profile: CandidateProfile;
  job: SavedJob;
  templateId: ResumeDraft["templateId"];
  tailoredAsset?: TailoredAsset | null;
}): ResumeDraft {
  return seedStructuredResumeDraft(input);
}

export function resolveResumeTemplateLabel(input: {
  templateId: ResumeDraft["templateId"];
  templates?: readonly ResumeTemplateDefinition[] | undefined;
  fallbackLabel?: string | null;
}): string {
  return (
    input.templates?.find((template) => template.id === input.templateId)?.label ??
    input.fallbackLabel ??
    input.templateId
  );
}

function toTokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

function calculateTokenOverlap(left: string, right: string): number {
  const leftTokens = [...toTokenSet(left)];
  const rightTokens = toTokenSet(right);

  if (leftTokens.length === 0 || rightTokens.size === 0) {
    return 0;
  }

  const matched = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matched / Math.max(Math.min(leftTokens.length, rightTokens.size), 1);
}

function buildJobPhraseBank(job: SavedJob): string[] {
  return uniqueStrings([
    job.summary ?? "",
    ...job.responsibilities,
    ...job.minimumQualifications,
    ...job.preferredQualifications,
    ...job.description
      .split(/[\n.;!?]+/)
      .map((entry) => entry.trim())
      .filter((entry) => tokenize(entry).length >= 5)
      .slice(0, 12),
  ]).filter((entry) => tokenize(entry).length >= 5);
}

function buildProfileSupportBank(profile: CandidateProfile | undefined): string[] {
  if (!profile) {
    return [];
  }

  return uniqueStrings([
    profile.baseResume.textContent ?? "",
    profile.summary ?? "",
    profile.professionalSummary.fullSummary ?? "",
    profile.professionalSummary.shortValueProposition ?? "",
    profile.narrative.professionalStory ?? "",
    profile.narrative.nextChapterSummary ?? "",
    profile.narrative.careerTransitionSummary ?? "",
    ...profile.narrative.differentiators,
    ...profile.skills,
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.experiences.flatMap((experience) => [
      experience.title,
      experience.companyName,
      experience.summary,
      ...experience.achievements,
    ]),
    ...profile.projects.flatMap((project) => [
      project.name,
      project.role,
      project.summary,
      project.outcome,
      ...project.skills,
    ]),
    ...profile.education.flatMap((education) => [
      education.schoolName,
      education.degree,
      education.fieldOfStudy,
      education.summary,
    ]),
    ...profile.certifications.flatMap((certification) => [
      certification.name,
      certification.issuer,
    ]),
    ...profile.proofBank.flatMap((proof) => [
      proof.title,
      proof.claim,
      proof.heroMetric,
      proof.supportingContext,
    ]),
  ].filter((entry): entry is string => Boolean(entry && entry.trim())));
}

function isSupportedByProfile(content: string, profileSupportBank: readonly string[]): boolean {
  const normalized = normalizeText(content);
  if (!normalized) {
    return false;
  }

  return profileSupportBank.some((entry) => {
    const normalizedEntry = normalizeText(entry);
    const entryTokenCount = tokenize(entry).length;
    const contentTokenCount = tokenize(content).length;

    if (!normalizedEntry) {
      return false;
    }

    if (entryTokenCount <= 1 || contentTokenCount <= 1) {
      return normalizedEntry === normalized;
    }

    return (
      matchesWholePhrase(entry, content) ||
      matchesWholePhrase(content, entry) ||
      calculateTokenOverlap(content, entry) >= 0.72
    );
  });
}

function isGroundedVisibleSkill(
  content: string,
  candidateSkillBank: readonly string[],
): boolean {
  const normalized = normalizeText(content);

  if (!normalized) {
    return false;
  }

  return candidateSkillBank.some((skill) => {
    return matchesWholePhrase(skill, content) || matchesWholePhrase(content, skill);
  });
}

function buildCandidateLanguageBank(
  profile: CandidateProfile | null | undefined,
): string[] {
  if (!profile) {
    return [];
  }

  return uniqueStrings(
    profile.spokenLanguages.flatMap((entry) =>
      [entry.language, [entry.language, entry.proficiency].filter(Boolean).join(" — ")].filter(
        (value): value is string => Boolean(value && value.trim()),
      ),
    ),
  );
}

function isGroundedVisibleLanguage(
  content: string,
  candidateLanguageBank: readonly string[],
): boolean {
  const normalized = normalizeText(content);

  if (!normalized) {
    return false;
  }

  return candidateLanguageBank.some((language) => {
    return matchesWholePhrase(language, content) || matchesWholePhrase(content, language);
  });
}

function isLanguageSection(section: Pick<ResumeDraft["sections"][number], "kind" | "label">): boolean {
  return section.kind === "skills" && normalizeText(section.label).includes("language");
}

function isShortJobTermBleed(
  content: string,
  job: SavedJob,
  profileSupportBank: readonly string[],
): boolean {
  const normalizedContent = normalizeText(content);

  if (!normalizedContent || tokenize(content).length > 4) {
    return false;
  }

  if (isSupportedByProfile(content, profileSupportBank)) {
    return false;
  }

  const shortJobTerms = uniqueStrings([
    job.company,
    job.title,
    job.team ?? "",
    job.department ?? "",
    job.atsProvider ?? "",
    ...job.benefits,
    ...job.screeningHints.remoteGeographies,
  ].filter(Boolean));

  return shortJobTerms.some(
    (term) => normalizeText(term) && normalizeText(term) === normalizedContent,
  );
}

function isJobDescriptionBleed(
  content: string,
  jobPhraseBank: readonly string[],
  profileSupportBank: readonly string[],
): boolean {
  const tokenCount = tokenize(content).length;
  if (tokenCount < 5) {
    return false;
  }

  const copiedPhrase = jobPhraseBank.find((phrase) => {
    const normalizedPhrase = normalizeText(phrase);
    const normalizedContent = normalizeText(content);
    return (
      normalizedPhrase === normalizedContent ||
      normalizedContent.includes(normalizedPhrase) ||
      calculateTokenOverlap(content, phrase) >= 0.92
    );
  });

  return Boolean(copiedPhrase) && !isSupportedByProfile(content, profileSupportBank);
}

function looksLikeKeywordStuffing(content: string): boolean {
  const commaCount = (content.match(/,/g) ?? []).length;
  const tokenCount = tokenize(content).length;
  return commaCount >= 4 && tokenCount >= 8 && !/\b(led|built|designed|shipped|managed|improved|created|owned|delivered|launched|partnered|collaborated|standardized|reduced|increased|drove|implemented)\b/i.test(content);
}

function looksLikeVagueFiller(content: string): boolean {
  return /\b(results[- ]driven|detail[- ]oriented|hardworking|team player|fast[- ]paced|responsible for|go-getter|self-starter)\b/i.test(
    content,
  );
}

function hasVisibleEntryContent(input: {
  title?: string | null;
  subtitle?: string | null;
  location?: string | null;
  dateRange?: string | null;
  summary?: string | null;
  bullets: readonly { included: boolean }[];
}): boolean {
  return (
    Boolean(input.title) ||
    Boolean(input.subtitle) ||
    Boolean(input.location) ||
    Boolean(input.dateRange) ||
    Boolean(input.summary) ||
    input.bullets.some((bullet) => bullet.included)
  );
}

export function sanitizeResumeDraft(input: {
  draft: ResumeDraft;
  job: SavedJob;
  profile?: CandidateProfile;
}): ResumeDraft {
  const jobPhraseBank = buildJobPhraseBank(input.job);
  const profileSupportBank = buildProfileSupportBank(input.profile);
  const candidateSkillBank = buildCandidateSkillBank(input.profile);
  const candidateLanguageBank = buildCandidateLanguageBank(input.profile);
  const seenLines = new Set<string>();

  const nextSections = input.draft.sections.map((section) => {
    const normalizedSectionText = normalizeText(section.text ?? "");
    const nextText = (() => {
      if (!section.text?.trim()) {
        return null;
      }
      if (section.locked) {
        seenLines.add(normalizedSectionText);
        return section.text;
      }
      if (seenLines.has(normalizedSectionText)) {
        return null;
      }
      if (isJobDescriptionBleed(section.text, jobPhraseBank, profileSupportBank)) {
        return null;
      }
      if (looksLikeKeywordStuffing(section.text)) {
        return null;
      }
      seenLines.add(normalizedSectionText);
      return section.text;
    })();

    const sanitizeBullets = (bullets: typeof section.bullets, contextText?: string | null) =>
      bullets.filter((bullet) => {
        const normalized = normalizeText(bullet.text);
        if (!normalized) {
          return false;
        }
        if (bullet.locked) {
          seenLines.add(normalized);
          return true;
        }
        if (contextText && normalizeText(contextText) === normalized) {
          return false;
        }
        if (seenLines.has(normalized)) {
          return false;
        }
        if (section.kind === "skills") {
          if (isLanguageSection(section)) {
            if (!isGroundedVisibleLanguage(bullet.text, candidateLanguageBank)) {
              return false;
            }
          } else if (!isGroundedVisibleSkill(bullet.text, candidateSkillBank)) {
            return false;
          }
        }
        if (isJobDescriptionBleed(bullet.text, jobPhraseBank, profileSupportBank)) {
          return false;
        }
        if (isShortJobTermBleed(bullet.text, input.job, profileSupportBank)) {
          return false;
        }
        if (looksLikeKeywordStuffing(bullet.text)) {
          return false;
        }
        seenLines.add(normalized);
        return true;
      });

    const nextEntries = section.entries
      .map((entry) => {
        if (entry.locked) {
          if (entry.summary) {
            seenLines.add(normalizeText(entry.summary));
          }
          for (const bullet of entry.bullets) {
            const normalizedBullet = normalizeText(bullet.text);
            if (normalizedBullet) {
              seenLines.add(normalizedBullet);
            }
          }
          return entry;
        }

        const nextSummary = (() => {
          if (!entry.summary?.trim()) {
            return null;
          }
          const normalized = normalizeText(entry.summary);
          if (seenLines.has(normalized)) {
            return null;
          }
          if (isJobDescriptionBleed(entry.summary, jobPhraseBank, profileSupportBank)) {
            return null;
          }
          seenLines.add(normalized);
          return entry.summary;
        })();

        const nextBullets = sanitizeBullets(entry.bullets, nextSummary);

        if (
          !hasVisibleEntryContent({
            ...entry,
            summary: nextSummary,
            bullets: nextBullets,
          })
        ) {
          return null;
        }

        return {
          ...entry,
          summary: nextSummary,
          bullets: nextBullets,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const nextBullets = sanitizeBullets(section.bullets, nextText);
    const hasVisibleContent = Boolean(nextText) || nextBullets.length > 0 || nextEntries.length > 0;
    const nextIncluded =
      section.kind === "keywords"
        ? false
        : section.locked
          ? true
          : hasVisibleContent && section.included;

    return {
      ...section,
      text: nextText,
      bullets: nextBullets,
      entries: nextEntries,
      included: nextIncluded,
    };
  });

  return {
    ...input.draft,
    sections: nextSections,
  };
}

export function validateResumeDraft(input: {
  draft: ResumeDraft;
  job: SavedJob;
  profile?: CandidateProfile;
  pageCount?: number | null;
  validatedAt?: string;
}): ResumeValidationResult {
  const validatedAt = input.validatedAt ?? new Date().toISOString();
  const issues: ResumeValidationIssue[] = [];
  const seenBullets = new Map<string, { sectionId: string; bulletId: string }>();
  const includedSections = input.draft.sections.filter((section) => section.included);
  const jobPhraseBank = buildJobPhraseBank(input.job);
  const profileSupportBank = buildProfileSupportBank(input.profile);
  const includedLineCount = buildPreviewSectionsFromResumeDraft(input.draft).flatMap((section) => section.lines).length;
  const hasExperienceContent = includedSections.some(
    (section) =>
      section.kind === "experience" &&
      (section.bullets.some((bullet) => bullet.included) ||
        section.entries.some(
          (entry) => entry.included && (Boolean(entry.summary) || entry.bullets.some((bullet) => bullet.included)),
        )),
  );

  function pushBulletIssues(args: {
    bullet: ResumeDraftBullet;
    sectionId: string;
    entryId?: string | null;
  }) {
    const normalizedBullet = normalizeText(args.bullet.text);
    const existing = seenBullets.get(normalizedBullet);

    if (existing) {
      issues.push({
        id: `issue_duplicate_${args.bullet.id}`,
        severity: "warning",
        category: "duplicate_bullet",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message: "This bullet duplicates another included bullet.",
      });
    } else {
      seenBullets.set(normalizedBullet, {
        sectionId: args.sectionId,
        bulletId: args.bullet.id,
      });
    }

    if (isJobDescriptionBleed(args.bullet.text, jobPhraseBank, profileSupportBank)) {
      issues.push({
        id: `issue_job_bleed_${args.bullet.id}`,
        severity: "warning",
        category: "job_description_bleed",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message:
          "This bullet reads like copied job-description language instead of grounded candidate evidence.",
      });
    }

    if (isShortJobTermBleed(args.bullet.text, input.job, profileSupportBank)) {
      issues.push({
        id: `issue_short_job_bleed_${args.bullet.id}`,
        severity: "warning",
        category: "job_description_bleed",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message:
          "This bullet uses short job-only language that is not grounded in the candidate profile.",
      });
    }

    if (looksLikeKeywordStuffing(args.bullet.text)) {
      issues.push({
        id: `issue_keyword_stuffing_${args.bullet.id}`,
        severity: "warning",
        category: "keyword_stuffing",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message: "This line reads like keyword packing instead of resume content.",
      });
    }

    if (looksLikeVagueFiller(args.bullet.text)) {
      issues.push({
        id: `issue_filler_${args.bullet.id}`,
        severity: "info",
        category: "vague_filler",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message: "Replace generic filler language with a grounded accomplishment or skill example.",
      });
    }
  }

  for (const section of includedSections) {
    const includedBullets = section.bullets.filter((bullet) => bullet.included);
    const includedEntries = section.entries.filter((entry) => entry.included);
    const includedEntriesWithVisibleContent = includedEntries.filter(
      (entry) => hasVisibleEntryContent(entry),
    );

    if (!section.text && includedBullets.length === 0 && includedEntriesWithVisibleContent.length === 0) {
      issues.push({
        id: `issue_empty_${section.id}`,
        severity: "warning",
        category: "empty_section",
        sectionId: section.id,
        entryId: null,
        bulletId: null,
        message: `${section.label} is included but has no content yet.`,
      });
    }

    for (const bullet of includedBullets) {
      pushBulletIssues({ bullet, sectionId: section.id });
    }

    const seenEntryContent = new Set<string>();
    for (const entry of includedEntries) {
      if (!hasVisibleEntryContent(entry)) {
        issues.push({
          id: `issue_empty_entry_${entry.id}`,
          severity: "warning",
          category: "empty_section",
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
          message: `${section.label} includes an empty entry that should be removed or filled in.`,
        });
      }

      if (entry.summary) {
        const normalizedSummary = normalizeText(entry.summary);
        if (seenEntryContent.has(normalizedSummary)) {
          issues.push({
            id: `issue_duplicate_entry_${entry.id}`,
            severity: "warning",
            category: "duplicate_section_content",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message: `${section.label} repeats the same supporting content more than once.`,
          });
        } else {
          seenEntryContent.add(normalizedSummary);
        }

        if (isJobDescriptionBleed(entry.summary, jobPhraseBank, profileSupportBank)) {
          issues.push({
            id: `issue_job_bleed_entry_${entry.id}`,
            severity: "warning",
            category: "job_description_bleed",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message: `${section.label} includes summary text that reads like copied job-description language.`,
          });
        }
      }

      for (const bullet of entry.bullets.filter((bullet) => bullet.included)) {
        pushBulletIssues({ bullet, sectionId: section.id, entryId: entry.id });
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
      entryId: null,
      bulletId: null,
      message: "The current draft does not yet echo the saved job keywords.",
    });
  }

  if (includedLineCount < 5 || !hasExperienceContent || includedSections.length < 2) {
    issues.push({
      id: `issue_thin_${input.draft.id}`,
      severity: "warning",
      category: "thin_output",
      sectionId: null,
      entryId: null,
      bulletId: null,
      message: "The current resume is still too thin to read like a complete submission-ready document.",
    });
  }

  if (input.pageCount && input.pageCount > input.draft.targetPageCount) {
    issues.push({
      id: `issue_page_overflow_${input.draft.id}`,
      severity: input.pageCount >= 3 ? "error" : "warning",
      category: "page_overflow",
      sectionId: null,
      entryId: null,
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
      entryId: null,
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
  templates?: readonly ResumeTemplateDefinition[];
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
    templateName: resolveResumeTemplateLabel({
      templateId: input.draft.templateId,
      templates: input.templates,
      fallbackLabel: input.existingAsset?.templateName ?? null,
    }),
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

export { buildResumeRenderDocument } from "./resume-workspace-structure";

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
  createdAt?: string;
}): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: createUniqueId(`resume_message_assistant_${input.jobId}`),
    jobId: input.jobId,
    role: "assistant",
    content: input.content,
    patches: [...input.patches],
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function collectResumeWorkspaceEvidence(input: {
  profile: CandidateProfile;
  job: SavedJob;
  research: readonly ResumeResearchArtifact[];
}): ResumeWorkspaceEvidence {
  const index = createLocalKnowledgeIndex();
  const candidateSummaryEvidence = uniqueStrings([
    input.profile.professionalSummary.fullSummary ?? "",
    input.profile.professionalSummary.shortValueProposition ?? "",
    input.profile.summary ?? "",
    input.profile.narrative.professionalStory ?? "",
    input.profile.narrative.nextChapterSummary ?? "",
    input.profile.narrative.careerTransitionSummary ?? "",
    ...input.profile.narrative.differentiators,
    ...input.profile.experiences
      .map((experience) => experience.summary ?? "")
      .filter(Boolean),
  ]).slice(0, 4);

  const highlightedProofs = input.profile.proofBank.slice(0, 6);

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

  if (
    input.profile.narrative.professionalStory ||
    input.profile.narrative.nextChapterSummary ||
    input.profile.narrative.careerTransitionSummary ||
    input.profile.narrative.differentiators.length > 0 ||
    input.profile.narrative.motivationThemes.length > 0
  ) {
    index.addDocument(
      "profile_narrative",
      [
        input.profile.narrative.professionalStory,
        input.profile.narrative.nextChapterSummary,
        input.profile.narrative.careerTransitionSummary,
        ...input.profile.narrative.differentiators,
        ...input.profile.narrative.motivationThemes,
      ]
        .filter(Boolean)
        .join(" "),
      {
        tags: ["profile"],
        title: "Candidate Narrative",
        section: "narrative",
        sourceId: "profile_narrative",
      },
    );
  }

  highlightedProofs.forEach((proof) => {
    index.addDocument(
      proof.id,
      [
        proof.title,
        proof.claim,
        proof.heroMetric,
        proof.supportingContext,
        ...proof.roleFamilies,
      ]
        .filter(Boolean)
        .join(" "),
      {
        tags: ["profile"],
        title: proof.title,
        section: "proof",
        sourceId: proof.id,
      },
    );
  });

  input.profile.projects.forEach((project) => {
    const text = [
      project.name,
      project.summary,
      project.role,
      project.outcome,
      ...project.skills,
    ]
      .filter(Boolean)
      .join(" ");

    if (text.trim()) {
      index.addDocument(project.id, text, {
        tags: ["profile"],
        title: project.name,
        section: "project",
        sourceId: project.id,
      });
    }
  });

  input.profile.links.forEach((link) => {
    if (!link.label && !link.url) {
      return;
    }

    index.addDocument(
      link.id,
      [link.label, link.url, link.kind]
        .filter(Boolean)
        .join(" "),
      {
        tags: ["profile"],
        title: link.label ?? link.url ?? "Profile link",
        section: "link",
        sourceId: link.id,
      },
    );
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
    experience: index.search(`${input.job.title} ${buildPriorityJobTerms(input.job).join(" ")} achievements`, { limit: 6, tags: ["profile", "resume"] }).map((entry: { text: string }) => entry.text),
    skills: index.search(`${buildPriorityJobTerms(input.job).join(" ")} ${input.job.title} skills`, { limit: 6, tags: ["profile", "job"] }).map((entry: { text: string }) => entry.text),
    keywords: uniqueStrings([
      ...buildPriorityJobTerms(input.job),
      ...input.research.flatMap((artifact) => artifact.domainVocabulary),
      ...highlightedProofs.flatMap((proof) => proof.roleFamilies),
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
