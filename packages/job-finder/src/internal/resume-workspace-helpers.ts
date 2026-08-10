import {
  buildCandidateSkillBank,
  type TailoredResumeDraft,
} from "@unemployed/ai-providers";
import {
  ResumeAssistantMessageSchema,
  ResumeDraftRevisionSchema,
  ResumeExportArtifactSchema,
  ResumeCoverageComparisonSchema,
  ResumeValidationResultSchema,
  TailoredAssetSchema,
  type CandidateProfile,
  type ResumeAssistantMessage,
  type ResumeClaimAssessment,
  type ResumeCoverageComparison,
  type ResumeDraft,
  type ResumeDraftBullet,
  type ResumeDraftPatch,
  type ResumeDraftRevision,
  type ResumeDraftRevisionActor,
  type ResumeDraftRevisionMutationKind,
  type ResumeExportArtifact,
  type ResumeResearchArtifact,
  type ResumeTemplateDefinition,
  type ResumeValidationIssue,
  type ResumeValidationResult,
  type SavedJob,
  type TailoredAsset,
  type WorkHistoryReviewSuggestion,
} from "@unemployed/contracts";
import { createLocalKnowledgeIndex } from "@unemployed/knowledge-base";
import {
  createUniqueId,
  normalizeText,
  tokenize,
  uniqueStrings,
} from "./shared";
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
import {
  buildResumeEntryDateQualityIssues,
  normalizeResumeDraftEntryOrdering,
} from "./resume-entry-ordering";

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

  return new RegExp(`(^|\\s)${escapeRegex(normalizeText(phrase))}($|\\s)`).test(
    normalizeText(candidate),
  );
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
  updatedAt?: string;
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
    input.templates?.find((template) => template.id === input.templateId)
      ?.label ??
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

function buildProfileSupportBank(
  profile: CandidateProfile | undefined,
): string[] {
  if (!profile) {
    return [];
  }

  return uniqueStrings(
    [
      profile.baseResume.textContent ?? "",
      profile.summary ?? "",
      profile.professionalSummary.fullSummary ?? "",
      profile.professionalSummary.shortValueProposition ?? "",
      profile.yearsExperience > 0
        ? `${profile.yearsExperience} years of experience`
        : "",
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
    ].filter((entry): entry is string => Boolean(entry && entry.trim())),
  );
}

function isSupportedByProfile(
  content: string,
  profileSupportBank: readonly string[],
): boolean {
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
    return (
      matchesWholePhrase(skill, content) || matchesWholePhrase(content, skill)
    );
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
      [
        entry.language,
        [entry.language, entry.proficiency].filter(Boolean).join(" — "),
      ].filter((value): value is string => Boolean(value && value.trim())),
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
    return (
      matchesWholePhrase(language, content) ||
      matchesWholePhrase(content, language)
    );
  });
}

function isLanguageSection(
  section: Pick<ResumeDraft["sections"][number], "kind" | "label">,
): boolean {
  return (
    section.kind === "skills" &&
    normalizeText(section.label).includes("language")
  );
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

  const shortJobTerms = uniqueStrings(
    [
      job.company,
      job.title,
      job.team ?? "",
      job.department ?? "",
      job.atsProvider ?? "",
      ...job.benefits,
      ...job.screeningHints.remoteGeographies,
    ].filter(Boolean),
  );

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

  return (
    Boolean(copiedPhrase) && !isSupportedByProfile(content, profileSupportBank)
  );
}

function looksLikeKeywordStuffing(content: string): boolean {
  const commaCount = (content.match(/,/g) ?? []).length;
  const tokenCount = tokenize(content).length;
  return (
    commaCount >= 4 &&
    tokenCount >= 8 &&
    !/\b(led|built|designed|shipped|managed|improved|created|owned|delivered|launched|partnered|collaborated|standardized|reduced|increased|drove|implemented)\b/i.test(
      content,
    )
  );
}

const resumeActionVerbs = new Set([
  "achieved",
  "architected",
  "automated",
  "built",
  "collaborated",
  "created",
  "delivered",
  "deployed",
  "designed",
  "developed",
  "directed",
  "drove",
  "engineered",
  "established",
  "grew",
  "implemented",
  "improved",
  "increased",
  "launched",
  "led",
  "managed",
  "mentored",
  "migrated",
  "modernized",
  "optimized",
  "owned",
  "partnered",
  "reduced",
  "resolved",
  "scaled",
  "streamlined",
  "supported",
  "tested",
  "transformed",
  "validated",
]);
const nearDuplicateStopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);
const numberWordValues: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};
const quantifiedClaimPattern = new RegExp(
  String.raw`(?:[$€£]\s*(?:\d+(?:[.,]\d+)?)\s*(?:k|m|b|thousand|million|billion)?|(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:%|percent|x|times|k|m|b|thousand|million|billion|users?|customers?|clients?|teams?|engineers?|employees?|people|projects?|products?|services?|systems?|applications?|apps?|markets?|countries?|regions?|sites?|workflows?|releases?|deployments?|incidents?|bugs?|defects?|tickets?|hours?|days?|weeks?|months?|years?|quarters?))`,
  "gi",
);

function normalizeQuantifiedClaim(value: string): string {
  return normalizeText(
    value
      .replace(/[$]/g, " usd ")
      .replace(/[€]/g, " eur ")
      .replace(/[£]/g, " gbp ")
      .replace(/%/g, " percent ")
      .replace(
        /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
        (word) => numberWordValues[word.toLowerCase()] ?? word,
      )
      .replace(/\bk\b/gi, "thousand")
      .replace(/\bm\b/gi, "million")
      .replace(/\bb\b/gi, "billion"),
  );
}

function extractQuantifiedClaims(content: string): string[] {
  return [
    ...content.matchAll(
      new RegExp(quantifiedClaimPattern.source, quantifiedClaimPattern.flags),
    ),
  ]
    .map((match) => normalizeQuantifiedClaim(match[0]))
    .filter(Boolean);
}

function hasUnsupportedQuantifiedClaim(
  content: string,
  profileSupportBank: readonly string[],
): boolean {
  const claims = extractQuantifiedClaims(content);
  if (claims.length === 0) {
    return false;
  }

  return claims.some(
    (claim) =>
      !profileSupportBank.some(
        (evidence) =>
          extractQuantifiedClaims(evidence).includes(claim) &&
          calculateTokenOverlap(content, evidence) >= 0.35,
      ),
  );
}

function looksLikeUnsupportedAbsoluteClaim(
  content: string,
  profileSupportBank: readonly string[],
): boolean {
  return (
    /\b(?:best[- ]in[- ]class|industry[- ]leading|world[- ]class|unmatched|unprecedented|revolutionized|single[- ]handedly|eliminated all|zero (?:bugs|defects|downtime|incidents)|guaranteed)\b/i.test(
      content,
    ) && !isSupportedByProfile(content, profileSupportBank)
  );
}

function meaningfulLineTokens(content: string): Set<string> {
  return new Set(
    tokenize(content).filter(
      (token) => token.length > 1 && !nearDuplicateStopWords.has(token),
    ),
  );
}

function areNearDuplicateResumeLines(left: string, right: string): boolean {
  const leftTokens = meaningfulLineTokens(left);
  const rightTokens = meaningfulLineTokens(right);
  const smallestSize = Math.min(leftTokens.size, rightTokens.size);
  if (smallestSize < 4) {
    return false;
  }

  const sharedCount = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  return sharedCount / smallestSize >= 0.8;
}

function looksLikeRepeatedProse(content: string): boolean {
  if (/\b([a-z][a-z0-9'-]{2,})\s+\1\b/i.test(content)) {
    return true;
  }

  const clauses = content
    .split(/[.!?;]+/)
    .map((clause) => normalizeText(clause))
    .filter((clause) => tokenize(clause).length >= 3);
  return new Set(clauses).size !== clauses.length;
}

function looksLikeExperienceBulletFragment(content: string): boolean {
  const trimmed = content.trim();
  const tokens = tokenize(trimmed);
  if (!trimmed || tokens.length === 0) {
    return true;
  }

  const firstLetter = trimmed.match(/[A-Za-z]/)?.[0] ?? null;
  const startsWithLowercase = Boolean(
    firstLetter && firstLetter === firstLetter.toLowerCase(),
  );
  const startsWithActionVerb = resumeActionVerbs.has(tokens[0] ?? "");
  return (
    startsWithLowercase ||
    /[,;:]$/.test(trimmed) ||
    (tokens.length <= 2 && !startsWithActionVerb) ||
    (tokens.length <= 4 && !/[.!?)]$/.test(trimmed) && !startsWithActionVerb)
  );
}

function looksLikeVagueFiller(content: string): boolean {
  return (
    /\b(results[- ]driven|detail[- ]oriented|hardworking|team player|fast[- ]paced|responsible for|go-getter|self-starter)\b/i.test(
      content,
    ) ||
    /\b(?:did (?:a lot|lots)|helped (?:out|with) (?:different|many|some|various|a lot of|lots of)|worked on (?:different|many|some|various|a lot of|lots of)|handled (?:different|many|some|various|a lot of|lots of)|good at lots of|great at lots of|lots of (?:stuff|things)|various tasks|and more|really (?:good|great)|super (?:good|great))\b/i.test(
      content,
    ) ||
    /\b(?:i|me|my|mine|myself)\b/i.test(content) ||
    looksLikeRepeatedProse(content)
  );
}

function isProfessionalExperienceSummaryText(
  summary: string,
  location: string | null,
): boolean {
  const normalized = normalizeText(summary);
  const tokens = tokenize(summary);
  const normalizedLocation = normalizeText(location ?? "");
  return !(
    looksLikeVagueFiller(summary) ||
    /\b(?:career\s+(?:change|pivot|transition)|decid(?:ed|ing)\s+to|passion|pivot(?:ed|ing)?\s+(?:back\s+)?to|return(?:ed|ing)?\s+to|seeking\s+(?:a|my)\s+next)\b/i.test(
      summary,
    ) ||
    Boolean(normalizedLocation && normalized === normalizedLocation) ||
    (tokens.length <= 5 &&
      /^(?:remote|hybrid|onsite|on\s+site)\b/i.test(summary)) ||
    (tokens.length <= 5 && summary.includes(",") && !/[.!?]$/.test(summary)) ||
    (tokens.length <= 5 &&
      /[A-Z]/.test(summary) &&
      summary === summary.toUpperCase())
  );
}

interface ResumeClaimCandidateEvidence {
  ref: ResumeClaimAssessment["evidenceRefs"][number];
  text: string;
}

interface ResumeClaimDescriptor {
  field: ResumeClaimAssessment["field"];
  sectionId: string;
  entryId: string | null;
  bulletId: string | null;
  text: string;
  origin: ResumeDraft["sections"][number]["origin"];
}

function stableContentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildResumeClaimDescriptors(
  draft: ResumeDraft,
): ResumeClaimDescriptor[] {
  return draft.sections
    .filter((section) => section.included)
    .flatMap((section) => {
      const claims: ResumeClaimDescriptor[] = [];
      if (section.text?.trim()) {
        claims.push({
          field: "section_text",
          sectionId: section.id,
          entryId: null,
          bulletId: null,
          text: section.text,
          origin: section.origin,
        });
      }
      for (const bullet of section.bullets.filter((entry) => entry.included)) {
        claims.push({
          field: "section_bullet",
          sectionId: section.id,
          entryId: null,
          bulletId: bullet.id,
          text: bullet.text,
          origin: bullet.origin,
        });
      }
      for (const entry of section.entries.filter(
        (candidate) => candidate.included,
      )) {
        if (entry.summary?.trim()) {
          claims.push({
            field: "entry_summary",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            text: entry.summary,
            origin: entry.origin,
          });
        }
        for (const bullet of entry.bullets.filter(
          (candidate) => candidate.included,
        )) {
          claims.push({
            field: "entry_bullet",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: bullet.id,
            text: bullet.text,
            origin: bullet.origin,
          });
        }
      }
      return claims;
    });
}

function omitResumeVersionTimestamps(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitResumeVersionTimestamps);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "updatedAt")
        .map(([key, entry]) => [key, omitResumeVersionTimestamps(entry)]),
    );
  }
  return value;
}

function stringifyResumeVersionState(value: unknown): string {
  return JSON.stringify(omitResumeVersionTimestamps(value));
}

export function buildResumeDraftStateHash(draft: ResumeDraft): string {
  return stableContentHash(
    stringifyResumeVersionState({
      templateId: draft.templateId,
      identity: draft.identity,
      sections: draft.sections,
      targetPageCount: draft.targetPageCount,
      generationMethod: draft.generationMethod,
    }),
  );
}

function buildResumeDraftRevisionDiff(before: ResumeDraft, after: ResumeDraft) {
  const beforeSections = new Map(
    before.sections.map((section) => [section.id, section] as const),
  );
  const afterSections = new Map(
    after.sections.map((section) => [section.id, section] as const),
  );
  const addedSectionIds = after.sections
    .filter((section) => !beforeSections.has(section.id))
    .map((section) => section.id)
    .slice(0, 100);
  const removedSectionIds = before.sections
    .filter((section) => !afterSections.has(section.id))
    .map((section) => section.id)
    .slice(0, 100);
  const changedSectionIds = before.sections
    .filter((section) => {
      const nextSection = afterSections.get(section.id);
      return (
        nextSection !== undefined &&
        stringifyResumeVersionState(section) !==
          stringifyResumeVersionState(nextSection)
      );
    })
    .map((section) => section.id)
    .slice(0, 100);

  return {
    templateChanged: before.templateId !== after.templateId,
    identityChanged:
      stringifyResumeVersionState(before.identity) !==
      stringifyResumeVersionState(after.identity),
    sectionOrderChanged:
      before.sections.map((section) => section.id).join("\u0000") !==
      after.sections.map((section) => section.id).join("\u0000"),
    addedSectionIds,
    removedSectionIds,
    changedSectionIds,
  };
}
export function buildResumeDraftContentHash(draft: ResumeDraft): string {
  return stableContentHash(
    buildResumeClaimDescriptors(draft)
      .map((claim) =>
        [
          claim.field,
          claim.origin,
          claim.sectionId,
          claim.entryId ?? "",
          claim.bulletId ?? "",
          normalizeText(claim.text),
        ].join("\u0000"),
      )
      .join("\u0001"),
  );
}

function splitCandidateEvidence(
  value: string,
  minimumTokenCount = 2,
): string[] {
  return value
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])/u)
    .map((part) => part.trim())
    .filter((part) => tokenize(part).length >= minimumTokenCount)
    .slice(0, 500);
}

function buildResumeClaimEvidenceBank(
  profile: CandidateProfile | undefined,
): ResumeClaimCandidateEvidence[] {
  if (!profile) {
    return [];
  }

  const evidence: ResumeClaimCandidateEvidence[] = [];
  const add = (
    sourceKind: ResumeClaimAssessment["evidenceRefs"][number]["sourceKind"],
    sourceId: string,
    value: string | null | undefined,
    minimumTokenCount = 2,
  ) => {
    if (!value?.trim()) {
      return;
    }
    for (const [index, text] of splitCandidateEvidence(
      value,
      minimumTokenCount,
    ).entries()) {
      evidence.push({
        text,
        ref: {
          id: `claim_evidence_${sourceKind}_${sourceId}_${index + 1}`,
          sourceKind,
          sourceId,
          snippet: text.slice(0, 320),
        },
      });
    }
  };

  add("resume", profile.baseResume.id, profile.baseResume.textContent);
  add("profile", "profile:summary", profile.summary);
  add("profile", "profile:headline", profile.headline);
  add("profile", "profile:current-location", profile.currentLocation);
  for (const [index, role] of profile.targetRoles.entries()) {
    add("profile", `profile:target-role:${index + 1}`, role, 1);
  }
  for (const [index, location] of profile.locations.entries()) {
    add("profile", `profile:location:${index + 1}`, location, 1);
  }
  add(
    "profile",
    "profile:professional-summary",
    profile.professionalSummary.fullSummary,
  );
  add(
    "profile",
    "profile:value-proposition",
    profile.professionalSummary.shortValueProposition,
  );
  const groupedSkills = [
    ...profile.skillGroups.coreSkills,
    ...profile.skillGroups.tools,
    ...profile.skillGroups.languagesAndFrameworks,
    ...profile.skillGroups.softSkills,
    ...profile.skillGroups.highlightedSkills,
  ];
  for (const [index, skill] of groupedSkills.entries()) {
    add("profile", `profile:grouped-skill:${index + 1}`, skill, 1);
  }
  for (const [index, skill] of profile.skills.entries()) {
    add("profile", `profile:skill:${index + 1}`, skill, 1);
  }
  for (const experience of profile.experiences) {
    add("profile", `experience:${experience.id}:summary`, experience.summary);
    for (const [index, skill] of experience.skills.entries()) {
      add(
        "profile",
        `experience:${experience.id}:skill:${index + 1}`,
        skill,
        1,
      );
    }
    for (const [index, achievement] of experience.achievements.entries()) {
      add(
        "profile",
        `experience:${experience.id}:achievement:${index + 1}`,
        achievement,
      );
    }
  }
  for (const project of profile.projects) {
    add("profile", `project:${project.id}:summary`, project.summary);
    add("profile", `project:${project.id}:outcome`, project.outcome);
    for (const [index, skill] of project.skills.entries()) {
      add("profile", `project:${project.id}:skill:${index + 1}`, skill, 1);
    }
  }
  for (const proof of profile.proofBank) {
    add("proof", `proof:${proof.id}:claim`, proof.claim);
    add("proof", `proof:${proof.id}:metric`, proof.heroMetric);
    add("proof", `proof:${proof.id}:context`, proof.supportingContext);
  }
  for (const education of profile.education) {
    add("profile", `education:${education.id}:summary`, education.summary);
  }
  for (const language of profile.spokenLanguages) {
    add(
      "profile",
      `language:${language.id}`,
      [language.language, language.proficiency].filter(Boolean).join(" — "),
    );
  }

  return evidence;
}

function assessResumeClaims(input: {
  draft: ResumeDraft;
  job: SavedJob;
  profile: CandidateProfile | undefined;
  assessedAt: string;
  jobPhraseBank: readonly string[];
  profileSupportBank: readonly string[];
}): ResumeClaimAssessment[] {
  const evidenceBank = buildResumeClaimEvidenceBank(input.profile);

  return buildResumeClaimDescriptors(input.draft).map((claim) => {
    const rankedEvidence = evidenceBank
      .map((evidence) => ({
        ...evidence,
        overlap: calculateTokenOverlap(claim.text, evidence.text),
        exact:
          normalizeText(claim.text) === normalizeText(evidence.text) ||
          matchesWholePhrase(evidence.text, claim.text),
      }))
      .filter((evidence) => evidence.exact || evidence.overlap >= 0.25)
      .sort(
        (left, right) =>
          Number(right.exact) - Number(left.exact) ||
          right.overlap - left.overlap,
      );
    const unsupported =
      hasUnsupportedQuantifiedClaim(claim.text, input.profileSupportBank) ||
      looksLikeUnsupportedAbsoluteClaim(claim.text, input.profileSupportBank) ||
      isJobDescriptionBleed(
        claim.text,
        input.jobPhraseBank,
        input.profileSupportBank,
      ) ||
      isShortJobTermBleed(claim.text, input.job, input.profileSupportBank);
    const bestEvidence = rankedEvidence[0] ?? null;
    const generatedClaim =
      claim.origin === "ai_generated" ||
      claim.origin === "assistant_edited" ||
      claim.origin === "deterministic_fallback";
    const status: ResumeClaimAssessment["status"] = unsupported
      ? "unsupported"
      : bestEvidence?.exact
        ? "exact"
        : (bestEvidence?.overlap ?? 0) >= 0.72
          ? "paraphrase"
          : generatedClaim && !bestEvidence
            ? "unsupported"
            : "review";
    const locator = [
      claim.field,
      claim.sectionId,
      claim.entryId ?? "",
      claim.bulletId ?? "",
    ].join(":");

    return {
      id: `claim_${stableContentHash(locator).replace(":", "_")}`,
      field: claim.field,
      sectionId: claim.sectionId,
      entryId: claim.entryId,
      bulletId: claim.bulletId,
      claimText: claim.text,
      claimOrigin: claim.origin,
      contentHash: stableContentHash(normalizeText(claim.text)),
      status,
      evidenceRefs: rankedEvidence.slice(0, 3).map((evidence) => evidence.ref),
      verifier: "deterministic_candidate_evidence_v1",
      assessedAt: input.assessedAt,
    };
  });
}
function hasVisibleEntryContent(input: {
  title?: string | null;
  subtitle?: string | null;
  location?: string | null;
  dateRange?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string | null;
  bullets: readonly { included: boolean }[];
}): boolean {
  return (
    Boolean(input.title) ||
    Boolean(input.subtitle) ||
    Boolean(input.location) ||
    Boolean(input.dateRange) ||
    Boolean(input.startDate) ||
    Boolean(input.endDate) ||
    input.isCurrent === true ||
    Boolean(input.summary) ||
    input.bullets.some((bullet) => bullet.included)
  );
}

function removeBulletDuplicatesFromSummary(
  summary: string,
  bullets: readonly { included: boolean; text: string }[],
): string | null {
  const visibleBulletLines = new Set(
    bullets
      .filter((bullet) => bullet.included)
      .map((bullet) => normalizeText(bullet.text))
      .filter(Boolean),
  );
  const sentences = summary
    .split(/(?<=[.!?])\s+(?=[A-Z])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const uniqueSentences = sentences.filter(
    (sentence) => !visibleBulletLines.has(normalizeText(sentence)),
  );

  return uniqueSentences.length > 0 ? uniqueSentences.join(" ") : null;
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

  const orderedDraft = normalizeResumeDraftEntryOrdering(input.draft);
  const nextSections = orderedDraft.sections.map((section) => {
    const normalizedSectionText = normalizeText(section.text ?? "");
    const nextText = (() => {
      if (!section.text?.trim()) {
        return null;
      }
      if (section.locked) {
        seenLines.add(normalizedSectionText);
        return section.text;
      }
      const canSuppressGeneratedSummary =
        section.kind === "summary" &&
        (section.origin === "ai_generated" ||
          section.origin === "assistant_edited" ||
          section.origin === "deterministic_fallback");
      if (
        canSuppressGeneratedSummary &&
        (looksLikeVagueFiller(section.text) ||
          hasUnsupportedQuantifiedClaim(section.text, profileSupportBank) ||
          looksLikeUnsupportedAbsoluteClaim(section.text, profileSupportBank))
      ) {
        return null;
      }
      if (seenLines.has(normalizedSectionText)) {
        return null;
      }
      if (
        isJobDescriptionBleed(section.text, jobPhraseBank, profileSupportBank)
      ) {
        return null;
      }
      if (
        looksLikeKeywordStuffing(section.text) &&
        !isSupportedByProfile(section.text, profileSupportBank)
      ) {
        return null;
      }
      seenLines.add(normalizedSectionText);
      return section.text;
    })();

    const sanitizeBullets = (
      bullets: typeof section.bullets,
      contextText?: string | null,
    ) =>
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
            if (
              !isGroundedVisibleLanguage(bullet.text, candidateLanguageBank)
            ) {
              return false;
            }
          } else if (!isGroundedVisibleSkill(bullet.text, candidateSkillBank)) {
            return false;
          }
        }
        if (
          isJobDescriptionBleed(bullet.text, jobPhraseBank, profileSupportBank)
        ) {
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

        const deduplicatedSummary = entry.summary
          ? removeBulletDuplicatesFromSummary(entry.summary, entry.bullets)
          : null;
        const nextSummary = (() => {
          if (!deduplicatedSummary?.trim()) {
            return null;
          }
          const normalized = normalizeText(deduplicatedSummary);
          if (seenLines.has(normalized)) {
            return null;
          }
          if (
            isJobDescriptionBleed(
              deduplicatedSummary,
              jobPhraseBank,
              profileSupportBank,
            )
          ) {
            return null;
          }
          seenLines.add(normalized);
          return deduplicatedSummary;
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
    const hasVisibleContent =
      Boolean(nextText) || nextBullets.length > 0 || nextEntries.length > 0;
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
    ...orderedDraft,
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
  const seenBullets: Array<{
    text: string;
    normalized: string;
    sectionId: string;
    bulletId: string;
  }> = [];
  const includedSections = input.draft.sections.filter(
    (section) => section.included,
  );
  const jobPhraseBank = buildJobPhraseBank(input.job);
  const profileSupportBank = buildProfileSupportBank(input.profile);
  const includedLineCount = buildPreviewSectionsFromResumeDraft(
    input.draft,
  ).flatMap((section) => section.lines).length;
  const hasExperienceContent = includedSections.some(
    (section) =>
      section.kind === "experience" &&
      (section.bullets.some((bullet) => bullet.included) ||
        section.entries.some(
          (entry) =>
            entry.included &&
            (Boolean(entry.summary) ||
              entry.bullets.some((bullet) => bullet.included)),
        )),
  );

  function pushBulletIssues(args: {
    bullet: ResumeDraftBullet;
    sectionId: string;
    entryId?: string | null;
    isExperience: boolean;
  }) {
    const normalizedBullet = normalizeText(args.bullet.text);
    const existing = seenBullets.find(
      (entry) =>
        entry.normalized === normalizedBullet ||
        areNearDuplicateResumeLines(entry.text, args.bullet.text),
    );

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
    }
    seenBullets.push({
      text: args.bullet.text,
      normalized: normalizedBullet,
      sectionId: args.sectionId,
      bulletId: args.bullet.id,
    });

    if (
      isJobDescriptionBleed(args.bullet.text, jobPhraseBank, profileSupportBank)
    ) {
      issues.push({
        id: `issue_job_bleed_${args.bullet.id}`,
        severity: "error",
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
        severity: "error",
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
        message:
          "This line reads like keyword packing instead of resume content.",
      });
    }

    if (hasUnsupportedQuantifiedClaim(args.bullet.text, profileSupportBank)) {
      issues.push({
        id: `issue_metric_${args.bullet.id}`,
        severity: "error",
        category: "invented_metric",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message:
          "This quantified claim is not supported by the canonical resume or profile evidence.",
      });
    }

    if (
      looksLikeUnsupportedAbsoluteClaim(args.bullet.text, profileSupportBank)
    ) {
      issues.push({
        id: `issue_claim_${args.bullet.id}`,
        severity: "error",
        category: "unsupported_claim",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message:
          "This absolute claim is not supported by the canonical resume or profile evidence.",
      });
    }

    const isFragment =
      args.isExperience && looksLikeExperienceBulletFragment(args.bullet.text);
    if (looksLikeVagueFiller(args.bullet.text) || isFragment) {
      issues.push({
        id: `issue_filler_${args.bullet.id}`,
        severity: "info",
        category: "vague_filler",
        sectionId: args.sectionId,
        entryId: args.entryId ?? null,
        bulletId: args.bullet.id,
        message: isFragment
          ? "Rewrite this fragment as a complete, professional accomplishment statement."
          : "Replace generic or repetitive filler with a grounded accomplishment or skill example.",
      });
    }
  }

  for (const section of includedSections) {
    const includedBullets = section.bullets.filter((bullet) => bullet.included);
    const includedEntries = section.entries.filter((entry) => entry.included);
    const includedEntriesWithVisibleContent = includedEntries.filter((entry) =>
      hasVisibleEntryContent(entry),
    );

    if (
      !section.text &&
      includedBullets.length === 0 &&
      includedEntriesWithVisibleContent.length === 0
    ) {
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

    if (section.text) {
      if (hasUnsupportedQuantifiedClaim(section.text, profileSupportBank)) {
        issues.push({
          id: `issue_metric_${section.id}`,
          severity: "error",
          category: "invented_metric",
          sectionId: section.id,
          entryId: null,
          bulletId: null,
          message:
            "This quantified claim is not supported by the canonical resume or profile evidence.",
        });
      }

      if (looksLikeUnsupportedAbsoluteClaim(section.text, profileSupportBank)) {
        issues.push({
          id: `issue_claim_${section.id}`,
          severity: "error",
          category: "unsupported_claim",
          sectionId: section.id,
          entryId: null,
          bulletId: null,
          message:
            "This absolute claim is not supported by the canonical resume or profile evidence.",
        });
      }

      if (looksLikeVagueFiller(section.text)) {
        issues.push({
          id: `issue_filler_${section.id}`,
          severity: "info",
          category: "vague_filler",
          sectionId: section.id,
          entryId: null,
          bulletId: null,
          message:
            "Replace generic or repetitive summary prose with grounded professional evidence.",
        });
      }
    }

    for (const bullet of includedBullets) {
      pushBulletIssues({
        bullet,
        sectionId: section.id,
        isExperience: section.kind === "experience",
      });
    }

    const seenEntryContent: string[] = [];
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
        const repeatedSummary = seenEntryContent.some(
          (summary) =>
            normalizeText(summary) === normalizedSummary ||
            areNearDuplicateResumeLines(summary, entry.summary ?? ""),
        );
        if (repeatedSummary) {
          issues.push({
            id: `issue_duplicate_entry_${entry.id}`,
            severity: "warning",
            category: "duplicate_section_content",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message: `${section.label} repeats the same supporting content more than once.`,
          });
        }
        seenEntryContent.push(entry.summary);

        if (
          isJobDescriptionBleed(
            entry.summary,
            jobPhraseBank,
            profileSupportBank,
          )
        ) {
          issues.push({
            id: `issue_job_bleed_entry_${entry.id}`,
            severity: "error",
            category: "job_description_bleed",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message: `${section.label} includes summary text that reads like copied job-description language.`,
          });
        }

        if (hasUnsupportedQuantifiedClaim(entry.summary, profileSupportBank)) {
          issues.push({
            id: `issue_metric_entry_${entry.id}`,
            severity: "error",
            category: "invented_metric",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message:
              "This quantified claim is not supported by the canonical resume or profile evidence.",
          });
        }

        if (
          looksLikeUnsupportedAbsoluteClaim(entry.summary, profileSupportBank)
        ) {
          issues.push({
            id: `issue_claim_entry_${entry.id}`,
            severity: "error",
            category: "unsupported_claim",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message:
              "This absolute claim is not supported by the canonical resume or profile evidence.",
          });
        }

        if (
          entry.entryType === "experience" &&
          !isProfessionalExperienceSummaryText(entry.summary, entry.location)
        ) {
          issues.push({
            id: `issue_filler_entry_${entry.id}`,
            severity: "info",
            category: "vague_filler",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: null,
            message:
              "Rewrite this summary as concise, third-person professional evidence.",
          });
        }
      }

      for (const bullet of entry.bullets.filter((bullet) => bullet.included)) {
        pushBulletIssues({
          bullet,
          sectionId: section.id,
          entryId: entry.id,
          isExperience: entry.entryType === "experience",
        });
      }
    }
  }

  if (input.profile) {
    const allExperienceEntries = input.draft.sections
      .filter((section) => section.kind === "experience")
      .flatMap((section) =>
        section.entries
          .filter(
            (entry) =>
              entry.entryType === "experience" && entry.profileRecordId,
          )
          .map((entry) => ({
            profileRecordId: entry.profileRecordId as string,
            visible: section.included && entry.included,
          })),
      );
    const visibleExperienceIds = new Set(
      allExperienceEntries
        .filter((entry) => entry.visible)
        .map((entry) => entry.profileRecordId),
    );

    for (const experience of input.profile.experiences) {
      const isCanonicalRole = Boolean(
        experience.companyName ||
        experience.title ||
        experience.summary ||
        experience.achievements.length > 0,
      );
      if (!isCanonicalRole || visibleExperienceIds.has(experience.id)) {
        continue;
      }

      const isRepresented = allExperienceEntries.some(
        (entry) => entry.profileRecordId === experience.id,
      );
      issues.push({
        id: `issue_work_history_${experience.id}`,
        severity: "warning",
        category: "work_history_review",
        sectionId: null,
        entryId: null,
        bulletId: null,
        message: isRepresented
          ? "A canonical work-history role is hidden from the visible resume."
          : "A canonical work-history role is missing from the resume draft.",
      });
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

  if (
    includedLineCount < 5 ||
    !hasExperienceContent ||
    includedSections.length < 2
  ) {
    issues.push({
      id: `issue_thin_${input.draft.id}`,
      severity: "warning",
      category: "thin_output",
      sectionId: null,
      entryId: null,
      bulletId: null,
      message:
        "The current resume is still too thin to read like a complete submission-ready document.",
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
          : `The exported resume exceeded the ${input.draft.targetPageCount}-page target.`,
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
      message:
        input.draft.staleReason ??
        "This approved resume is stale and should be re-reviewed.",
    });
  }

  issues.push(
    ...buildResumeEntryDateQualityIssues(input.draft, new Date(validatedAt)),
  );

  const claimAssessments = assessResumeClaims({
    draft: input.draft,
    job: input.job,
    profile: input.profile,
    assessedAt: validatedAt,
    jobPhraseBank,
    profileSupportBank,
  });
  for (const assessment of claimAssessments) {
    const generatedClaim =
      assessment.claimOrigin === "ai_generated" ||
      assessment.claimOrigin === "assistant_edited" ||
      assessment.claimOrigin === "deterministic_fallback";
    const blocksExport =
      assessment.status === "unsupported" ||
      (assessment.status === "review" && generatedClaim);
    const alreadyReported = issues.some(
      (issue) =>
        issue.sectionId === assessment.sectionId &&
        issue.entryId === assessment.entryId &&
        issue.bulletId === assessment.bulletId &&
        (issue.category === "unsupported_claim" ||
          issue.category === "invented_metric" ||
          issue.category === "job_description_bleed"),
    );
    if (!blocksExport || alreadyReported) {
      continue;
    }

    issues.push({
      id: `issue_claim_grounding_${assessment.id}`,
      severity: "error",
      category: "unsupported_claim",
      sectionId: assessment.sectionId,
      entryId: assessment.entryId,
      bulletId: assessment.bulletId,
      message: generatedClaim
        ? "This generated claim lacks strong candidate-only evidence and must be rewritten or explicitly user-edited before export."
        : "This claim conflicts with candidate evidence and must be corrected before export.",
    });
  }

  return ResumeValidationResultSchema.parse({
    id: `resume_validation_${input.draft.id}`,
    draftId: input.draft.id,
    issues,
    draftContentHash: buildResumeDraftContentHash(input.draft),
    claimAssessments,
    coverageComparison: input.profile
      ? buildResumeCoverageComparison({
          profile: input.profile,
          draft: input.draft,
          pageCount: input.pageCount ?? null,
          validationIssues: issues,
        })
      : null,
    pageCount: input.pageCount ?? null,
    validatedAt,
  });
}

function buildCoverageMetadataMap(draft: TailoredResumeDraft) {
  return new Map(
    draft.coverageMetadata.map((metadata) => [
      metadata.profileRecordId,
      metadata,
    ]),
  );
}

function compareResumeTextSets(
  baseline: readonly string[],
  current: readonly string[],
): string[] {
  const currentKeys = new Set(current.map((value) => normalizeText(value)));
  return uniqueStrings(baseline).filter(
    (value) => !currentKeys.has(normalizeText(value)),
  );
}

export function buildResumeCoverageComparison(input: {
  profile: CandidateProfile;
  draft: ResumeDraft;
  pageCount?: number | null;
  validationIssues?: readonly ResumeValidationIssue[];
  coverageMetadata?: TailoredResumeDraft["coverageMetadata"];
}): ResumeCoverageComparison {
  const experienceSection =
    input.draft.sections.find((section) => section.kind === "experience") ??
    null;
  const experienceEntries = [...(experienceSection?.entries ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const entriesByRecordId = new Map(
    experienceEntries.flatMap((entry, index) =>
      entry.profileRecordId
        ? ([[entry.profileRecordId, { entry, index }]] as const)
        : [],
    ),
  );
  const coverageByRecordId = new Map(
    (input.coverageMetadata ?? []).map((metadata) => [
      metadata.profileRecordId,
      metadata,
    ]),
  );
  const roles = input.profile.experiences
    .filter(
      (experience) =>
        Boolean(experience.id) &&
        Boolean(experience.title?.trim()) &&
        Boolean(experience.companyName?.trim()),
    )
    .map((experience, originalIndex) => {
      const match = entriesByRecordId.get(experience.id) ?? null;
      const entry = match?.entry ?? null;
      const metadata = coverageByRecordId.get(experience.id) ?? null;
      const isVisible = Boolean(
        experienceSection?.included && entry?.included,
      );
      const originalClaims = uniqueStrings(
        [experience.summary, ...experience.achievements].filter(
          (value): value is string => Boolean(value?.trim()),
        ),
      );
      const tailoredClaims = entry && isVisible
        ? uniqueStrings(
            [
              entry.summary,
              ...entry.bullets
                .filter((bullet) => bullet.included)
                .map((bullet) => bullet.text),
            ].filter((value): value is string => Boolean(value?.trim())),
          )
        : [];
      const removedClaimText = compareResumeTextSets(
        originalClaims,
        tailoredClaims,
      );
      const addedClaimText = compareResumeTextSets(
        tailoredClaims,
        originalClaims,
      );
      const originalSummaryKey = normalizeText(experience.summary ?? "");
      const removedClaims = removedClaimText.map((text) => ({
        field:
          originalSummaryKey && normalizeText(text) === originalSummaryKey
            ? ("summary" as const)
            : ("bullet" as const),
        text,
        restorable: Boolean(entry && experienceSection && isVisible),
      }));
      const addedClaims = addedClaimText.map((text) => ({
        field:
          entry?.summary && normalizeText(text) === normalizeText(entry.summary)
            ? ("summary" as const)
            : ("bullet" as const),
        text,
        restorable: false,
      }));
      const reordered = match ? match.index !== originalIndex : false;
      const retainedClaimCount = originalClaims.filter((claim) =>
        tailoredClaims.some(
          (tailoredClaim) =>
            normalizeText(tailoredClaim) === normalizeText(claim),
        ),
      ).length;
      const status = !entry
        ? ("missing" as const)
        : !isVisible
          ? ("hidden" as const)
          : metadata?.classification === "compact" ||
              (originalClaims.length > 0 &&
                tailoredClaims.length < originalClaims.length)
            ? ("compacted" as const)
            : addedClaims.length > 0 || removedClaims.length > 0
              ? ("rewritten" as const)
              : ("unchanged" as const);
      const reasons = uniqueStrings([
        ...(metadata?.reasons ?? []),
        ...(metadata?.reviewGuidance ?? []),
        ...(status === "hidden"
          ? ["This role is saved in the draft but hidden from the exported resume."]
          : []),
        ...(status === "missing"
          ? ["This canonical role is not represented in the current draft."]
          : []),
        ...(reordered
          ? ["This role moved from its original chronological position."]
          : []),
      ]);

      return {
        profileRecordId: experience.id,
        title: experience.title as string,
        employer: experience.companyName as string,
        sectionId: experienceSection?.id ?? null,
        entryId: entry?.id ?? null,
        status,
        included: isVisible,
        reordered,
        originalIndex,
        tailoredIndex: match?.index ?? null,
        originalClaimCount: originalClaims.length,
        retainedClaimCount,
        addedClaims,
        removedClaims,
        reasons,
      };
    });
  const originalKeywords = buildCandidateSkillBank(input.profile);
  const tailoredKeywords = uniqueStrings(
    input.draft.sections
      .filter(
        (section) =>
          section.included &&
          (section.kind === "skills" || section.kind === "keywords"),
      )
      .flatMap((section) => [
        ...(section.text ? [section.text] : []),
        ...section.bullets
          .filter((bullet) => bullet.included)
          .map((bullet) => bullet.text),
        ...section.entries
          .filter((entry) => entry.included)
          .flatMap((entry) => [
            ...(entry.title ? [entry.title] : []),
            ...(entry.summary ? [entry.summary] : []),
            ...entry.bullets
              .filter((bullet) => bullet.included)
              .map((bullet) => bullet.text),
          ]),
      ]),
  );
  const pageCount = input.pageCount ?? null;

  return ResumeCoverageComparisonSchema.parse({
    originalRoleCount: roles.length,
    representedRoleCount: roles.filter((role) => role.entryId).length,
    visibleRoleCount: roles.filter((role) => role.included).length,
    rewrittenRoleCount: roles.filter((role) => role.status === "rewritten")
      .length,
    compactedRoleCount: roles.filter((role) => role.status === "compacted")
      .length,
    hiddenRoleCount: roles.filter((role) => role.status === "hidden").length,
    missingRoleCount: roles.filter((role) => role.status === "missing").length,
    reorderedRoleCount: roles.filter((role) => role.reordered).length,
    addedClaimCount: roles.reduce(
      (count, role) => count + role.addedClaims.length,
      0,
    ),
    removedClaimCount: roles.reduce(
      (count, role) => count + role.removedClaims.length,
      0,
    ),
    duplicateIssueCount: (input.validationIssues ?? []).filter(
      (issue) =>
        issue.category === "duplicate_bullet" ||
        issue.category === "duplicate_section_content",
    ).length,
    addedKeywords: compareResumeTextSets(tailoredKeywords, originalKeywords),
    removedKeywords: compareResumeTextSets(originalKeywords, tailoredKeywords),
    pageImpact:
      pageCount === null
        ? "unknown"
        : pageCount > input.draft.targetPageCount
          ? "over_target"
          : "within_target",
    pageCount,
    targetPageCount: input.draft.targetPageCount,
    roles,
  });
}

export function buildWorkHistoryReviewSuggestions(input: {
  draft: ResumeDraft;
  tailoredDraft: TailoredResumeDraft;
}): WorkHistoryReviewSuggestion[] {
  const coverageByRecordId = buildCoverageMetadataMap(input.tailoredDraft);
  const experienceSection =
    input.draft.sections.find((section) => section.kind === "experience") ??
    null;
  const entriesByRecordId = new Map(
    (experienceSection?.entries ?? [])
      .filter((entry) => entry.profileRecordId)
      .map((entry) => [entry.profileRecordId as string, entry]),
  );

  return input.tailoredDraft.coverageMetadata
    .flatMap((metadata) => {
      const guidance =
        metadata.reviewGuidance[0] ?? metadata.reasons[0] ?? null;
      const entry = entriesByRecordId.get(metadata.profileRecordId) ?? null;

      if (!guidance) {
        return [];
      }

      if (metadata.classification === "detailed") {
        return [];
      }

      const isHiddenRecommendation =
        metadata.classification === "suggested_hidden" ||
        metadata.classification === "omitted";

      const kind = metadata.coversMeaningfulGap
        ? "gap_coverage"
        : metadata.classification === "compact"
          ? "compact_recommended"
          : "weak_fit";
      const action = isHiddenRecommendation
        ? "consider_showing"
        : "keep_compact";

      return [
        {
          id: `work_history_review_${metadata.profileRecordId}`,
          profileRecordId: metadata.profileRecordId,
          sectionId: experienceSection?.id ?? null,
          entryId: isHiddenRecommendation ? null : (entry?.id ?? null),
          kind,
          action,
          severity: "info",
          message: guidance,
        } satisfies WorkHistoryReviewSuggestion,
      ];
    })
    .filter((suggestion, index, suggestions) => {
      const existingIndex = suggestions.findIndex(
        (entry) => entry.id === suggestion.id,
      );
      return (
        existingIndex === index &&
        coverageByRecordId.has(suggestion.profileRecordId)
      );
    });
}

export { applyPatchToResumeDraft } from "./resume-workspace-patches";

export function buildResumeDraftRevision(input: {
  draft: ResumeDraft;
  resultingDraft: ResumeDraft;
  createdAt: string;
  parentRevisionId?: string | null;
  actor: ResumeDraftRevisionActor;
  mutationKind: ResumeDraftRevisionMutationKind;
  restoredFromRevisionId?: string | null;
  reason?: string | null;
}): ResumeDraftRevision {
  if (input.draft.id !== input.resultingDraft.id) {
    throw new Error("Resume revision drafts must share the same draft id.");
  }

  return ResumeDraftRevisionSchema.parse({
    id: createUniqueId(`resume_revision_${input.draft.id}`),
    draftId: input.draft.id,
    parentRevisionId: input.parentRevisionId ?? null,
    actor: input.actor,
    mutationKind: input.mutationKind,
    snapshotDraft: input.draft,
    snapshotIdentity: input.draft.identity ?? null,
    snapshotSections: input.draft.sections,
    beforeHash: buildResumeDraftStateHash(input.draft),
    afterHash: buildResumeDraftStateHash(input.resultingDraft),
    diff: buildResumeDraftRevisionDiff(input.draft, input.resultingDraft),
    restoredFromRevisionId: input.restoredFromRevisionId ?? null,
    createdAt: input.createdAt,
    reason: input.reason ?? null,
  });
}
export function buildResumeExportArtifact(input: {
  draft: ResumeDraft;
  job: SavedJob;
  filePath: string;
  format?: ResumeExportArtifact["format"];
  exportedAt: string;
  pageCount?: number | null;
  sha256?: string | null;
  isApproved?: boolean;
}): ResumeExportArtifact {
  return ResumeExportArtifactSchema.parse({
    id: createUniqueId(`resume_export_${input.job.id}`),
    draftId: input.draft.id,
    jobId: input.job.id,
    format: input.format ?? "pdf",
    filePath: input.filePath,
    sha256: input.sha256 ?? null,
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
    : (input.storagePath ?? input.existingAsset?.storagePath ?? null);
  const isApprovalStale =
    input.draft.status === "stale" || !resolvedStoragePath;
  const fallbackStatus = isApprovalStale
    ? "failed"
    : (input.existingAsset?.status ?? "queued");
  const fallbackProgressPercent = isApprovalStale
    ? 0
    : (input.existingAsset?.progressPercent ?? 0);

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
      input.compatibilityScore ??
      input.existingAsset?.compatibilityScore ??
      input.job.matchAssessment.score,
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
      ...(input.pageCount
        ? [`Generated PDF page count: ${input.pageCount}.`]
        : []),
    ]),
  });
}

export { buildResumeRenderDocument } from "./resume-workspace-structure";

export function buildUnavailableAssistantReply(
  jobId: string,
): ResumeAssistantMessage {
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
  baseDraftUpdatedAt?: string | null;
  proposalError?: string | null;
  createdAt?: string;
}): ResumeAssistantMessage {
  return ResumeAssistantMessageSchema.parse({
    id: createUniqueId(`resume_message_assistant_${input.jobId}`),
    jobId: input.jobId,
    role: "assistant",
    content: input.content,
    patches: [...input.patches],
    proposalStatus: input.patches.length > 0 ? "pending" : "none",
    baseDraftUpdatedAt: input.baseDraftUpdatedAt ?? null,
    proposalError: input.proposalError ?? null,
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
    index.addDocument(
      input.profile.baseResume.id,
      input.profile.baseResume.textContent,
      {
        tags: ["resume"],
        title: "Base Resume",
        section: "resume",
        sourceId: input.profile.baseResume.id,
      },
    );
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
      [link.label, link.url, link.kind].filter(Boolean).join(" "),
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
    summary: index
      .search(`${input.job.title} ${input.job.company} summary`, { limit: 3 })
      .map((entry: { text: string }) => entry.text),
    candidateSummary: candidateSummaryEvidence,
    experience: index
      .search(
        `${input.job.title} ${buildPriorityJobTerms(input.job).join(" ")} achievements`,
        {
          limit: 6,
          tags: ["profile", "resume"],
        },
      )
      .map((entry: { text: string }) => entry.text),
    skills: index
      .search(
        `${buildPriorityJobTerms(input.job).join(" ")} ${input.job.title} skills`,
        {
          limit: 6,
          tags: ["profile", "job"],
        },
      )
      .map((entry: { text: string }) => entry.text),
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
    domainVocabulary: uniqueStrings(
      research.flatMap((artifact) => artifact.domainVocabulary),
    ).slice(0, 8),
    priorityThemes: uniqueStrings(
      research.flatMap((artifact) => artifact.priorityThemes),
    ).slice(0, 6),
  };
}
