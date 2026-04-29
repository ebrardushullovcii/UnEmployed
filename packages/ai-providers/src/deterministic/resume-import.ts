import {
  ResumeImportFieldCandidateDraftSchema,
  type ResumeDocumentBundle,
  type ResumeImportFieldCandidateDraft,
} from "@unemployed/contracts";

import type { ExtractResumeImportStageTransportInput } from "../shared";
import {
  ResumeImportStageExtractionResultSchema,
  buildValuePreview,
  sanitizeStageCandidates,
  type ResumeImportStageExtractionResult,
} from "../resume-import";
import { buildCandidateConfidenceBreakdown } from "../resume-import-helpers";
import { buildDeterministicResumeProfileExtraction } from "./resume-parser";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Escapes all regex metacharacters before user-derived text is embedded in a
 * dynamic RegExp pattern.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Performs a literal whole-phrase match. `needle` is escaped first, so the
 * dynamic pattern remains linear (`(^|\W){literal}(?=\W|$)`) and must stay
 * escaped if this helper changes.
 */
function containsWholePhrase(haystack: string, needle: string): boolean {
  return new RegExp(`(^|\\W)${escapeRegExp(needle)}(?=\\W|$)`, "i").test(haystack);
}

function getExperienceSectionText(resumeText: string): string {
  const lines = resumeText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    /^(work\s+experience|professional\s+experience|experience|employment|career\s+history)$/i.test(line.trim()),
  );

  if (startIndex < 0) {
    return "";
  }

  const endOffset = lines.slice(startIndex + 1).findIndex((line) =>
    /^(education|certifications?|projects?|skills|languages|publications?|awards?)$/i.test(line.trim()),
  );
  const endIndex = endOffset < 0 ? lines.length : startIndex + 1 + endOffset;

  return lines.slice(startIndex + 1, endIndex).join("\n");
}

function buildYearsExperienceEvidenceCandidates(
  yearsExperience: number,
  resumeText: string,
): string[] {
  const dateRangePattern = /\b(?:current|present|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:\d{1,2}\/)?\d{4})\s*[–—-]\s*(?:current|present|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:\d{1,2}\/)?\d{4})\b/i;
  const experienceText = getExperienceSectionText(resumeText) || resumeText;
  const normalizedExperienceText = normalizeText(experienceText);
  const yearForms =
    yearsExperience === 1
      ? ["1 year", "1+ year", "1 yr", "1+ yr", "1 yrs", "1+ yrs"]
      : [
          `${yearsExperience} years`,
          `${yearsExperience}+ years`,
          `${yearsExperience} yr`,
          `${yearsExperience}+ yr`,
          `${yearsExperience} yrs`,
          `${yearsExperience}+ yrs`,
        ];
  const explicitCandidates = yearForms.filter((candidate) =>
    normalizedExperienceText.length > 0 &&
    containsWholePhrase(normalizedExperienceText, normalizeText(candidate)),
  );

  if (explicitCandidates.length > 0) {
    return explicitCandidates;
  }

  if (!experienceText) {
    return [];
  }

  const lines = experienceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const datedExperienceLines = lines.filter((line) => dateRangePattern.test(line));

  return datedExperienceLines.slice(0, 6);
}

function buildRelaxedEvidenceCandidates(value: string): string[] {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);

  const withoutPlus = normalized.replace(
    /\b(\d+)\+\s+(years?|yrs?)\b/gi,
    (_match, count: string) => `${count} ${Number(count) === 1 ? "year" : "years"}`,
  );
  if (withoutPlus && withoutPlus !== normalized) {
    candidates.add(withoutPlus);
  }

  if (normalized.length >= 64) {
    const sentences = normalized
      .split(/[.!?]\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 24);

    for (const sentence of sentences) {
      candidates.add(sentence);
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 8) {
      candidates.add(words.slice(0, 12).join(" "));
      candidates.add(words.slice(0, 8).join(" "));
    }
  }

  return [...candidates].filter((entry) => entry.length > 0);
}

function buildOrderedEvidenceCandidates(candidates: readonly string[]): string[] {
  const orderedCandidates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const trimmedCandidate = candidate.trim();
    if (!trimmedCandidate) {
      continue;
    }

    for (const relaxedCandidate of buildRelaxedEvidenceCandidates(trimmedCandidate)) {
      if (seen.has(relaxedCandidate)) {
        continue;
      }

      seen.add(relaxedCandidate);
      orderedCandidates.push(relaxedCandidate);
    }
  }

  return orderedCandidates;
}

function findEvidence(bundle: ResumeDocumentBundle, candidates: readonly string[]) {
  const nonEmptyCandidates = candidates
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);
  const orderedCandidates = buildOrderedEvidenceCandidates(nonEmptyCandidates);

  for (const candidate of orderedCandidates) {
    if (!candidate) continue;

    const block = bundle.blocks.find((entry) =>
      normalizeText(entry.text).includes(candidate),
    );
    if (!block) {
      continue;
    }

    const blockText = block.text ?? "";

    try {
      const candidatePattern = escapeRegExp(candidate).replace(/\s+/g, "\\s+");
      const re = new RegExp(`(.{0,80}${candidatePattern}.{0,240})`, "is");
      const m = blockText.match(re);
      if (m && m[1]) {
        const snippet = m[1].trim().replace(/\s+/g, " ");
        return { sourceBlockIds: [block.id], evidenceText: snippet };
      }
    } catch {
      return {
        sourceBlockIds: [block.id],
        evidenceText: blockText.trim() || (nonEmptyCandidates[0] ?? null),
      };
    }

    // If we couldn't extract a focused snippet, return a truncated version of the block.
    const truncated = blockText.length > 400 ? `${blockText.slice(0, 400).trim()}...` : blockText.trim();
    return { sourceBlockIds: [block.id], evidenceText: truncated || (nonEmptyCandidates[0] ?? null) };
  }

  return {
    sourceBlockIds: [],
    evidenceText: null,
  };
}

function createCandidate(
  bundle: ResumeDocumentBundle,
  input: {
    target: ResumeImportFieldCandidateDraft["target"];
    label: string;
    value: unknown;
    normalizedValue?: unknown;
    confidence: number;
    evidenceCandidates: readonly string[];
    notes?: readonly string[];
  },
): ResumeImportFieldCandidateDraft {
  const evidence = findEvidence(bundle, input.evidenceCandidates);

  return ResumeImportFieldCandidateDraftSchema.parse({
    target: input.target,
    label: input.label,
    value: input.value,
    normalizedValue: input.normalizedValue ?? null,
    valuePreview: buildValuePreview(input.value),
    evidenceText: evidence.evidenceText,
    sourceBlockIds: evidence.sourceBlockIds,
    confidence: input.confidence,
    confidenceBreakdown: buildCandidateConfidenceBreakdown({
      candidate: {
        target: input.target,
        confidence: input.confidence,
        sourceBlockIds: evidence.sourceBlockIds,
      },
      bundle,
    }),
    notes: [...(input.notes ?? [])],
    alternatives: [],
  });
}

function getRecordStringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function toResumeText(bundle: ResumeDocumentBundle): string {
  return bundle.fullText ?? bundle.blocks.map((block) => block.text).join("\n\n");
}

function toExperienceOnlyBundle(bundle: ResumeDocumentBundle): ResumeDocumentBundle {
  const resumeText = toResumeText(bundle);
  const experienceText = getExperienceSectionText(resumeText);
  const normalizedExperienceText = normalizeText(experienceText);

  return {
    ...bundle,
    fullText: experienceText,
    blocks: normalizedExperienceText
      ? bundle.blocks.filter((block) => {
          const normalizedBlockText = normalizeText(block.text);
          return (
            normalizedBlockText.length >= 12 &&
            containsWholePhrase(normalizedExperienceText, normalizedBlockText)
          );
        })
      : [],
  };
}

export function buildDeterministicResumeImportStageExtraction(
  input: ExtractResumeImportStageTransportInput,
  providerLabel: string,
): ResumeImportStageExtractionResult {
  const extraction = buildDeterministicResumeProfileExtraction(
    {
      existingProfile: input.existingProfile,
      existingSearchPreferences: input.existingSearchPreferences,
      resumeText: toResumeText(input.documentBundle),
    },
    "deterministic",
    providerLabel,
    { preserveExistingValues: false },
  );
  const candidates: ResumeImportFieldCandidateDraft[] = [];
  const existingProfileValues = input.existingProfile as Record<string, unknown>;
  const existingSearchPreferenceValues =
    input.existingSearchPreferences as Record<string, unknown>;

  const add = (
    target: ResumeImportFieldCandidateDraft["target"],
    label: string,
    value: unknown,
    confidence: number,
    evidenceCandidates: readonly string[],
    options?: {
      evidenceBundle?: ResumeDocumentBundle;
      normalizedValue?: unknown;
      notes?: readonly string[];
    },
  ) => {
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    // Skip no-op literals so deterministic extraction emits resume-backed changes
    // rather than echoing the current workspace values.
    if (typeof value === "string") {
      const key = target.key;

      if (
        target.section === "identity" ||
        target.section === "location" ||
        target.section === "contact" ||
        target.section === "narrative"
      ) {
        const existing = getRecordStringValue(existingProfileValues, key);
        if (existing && existing === value) {
          return;
        }
      }

      if (target.section === "search_preferences") {
        const existing = getRecordStringValue(existingSearchPreferenceValues, key);
        if (existing && existing === value) {
          return;
        }
      }
    }

    candidates.push(
      createCandidate(options?.evidenceBundle ?? input.documentBundle, {
        target,
        label,
        value,
        confidence,
        evidenceCandidates,
        normalizedValue: options?.normalizedValue,
        notes: options?.notes ?? [],
      }),
    );
  };

  if (input.stage === "identity_summary") {
    const yearsExperience = extraction.yearsExperience;
    const experienceEvidenceBundle = toExperienceOnlyBundle(input.documentBundle);
    const experienceEvidenceText = toResumeText(experienceEvidenceBundle);

    add({ section: "identity", key: "fullName", recordId: null }, "Full name", extraction.fullName, 0.96, [extraction.fullName ?? ""]);
    add({ section: "identity", key: "firstName", recordId: null }, "First name", extraction.firstName, 0.92, [extraction.firstName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "middleName", recordId: null }, "Middle name", extraction.middleName, 0.85, [extraction.middleName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "lastName", recordId: null }, "Last name", extraction.lastName, 0.92, [extraction.lastName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "headline", recordId: null }, "Headline", extraction.headline, 0.84, [extraction.headline ?? ""]);
    add({ section: "identity", key: "summary", recordId: null }, "Summary", extraction.summary, 0.8, [extraction.summary ?? ""]);
    add({ section: "location", key: "currentLocation", recordId: null }, "Current location", extraction.currentLocation, 0.9, [extraction.currentLocation ?? ""]);
    add(
      { section: "location", key: "timeZone", recordId: null },
      "Time zone",
      extraction.timeZone,
      extraction.currentLocation ? 0.84 : 0.62,
      [extraction.currentLocation ?? ""],
    );
    const existingYearsExperience =
      typeof existingProfileValues.yearsExperience === "number"
        ? existingProfileValues.yearsExperience
        : null;
    if (
      yearsExperience !== null &&
      yearsExperience !== undefined &&
      existingYearsExperience !== yearsExperience
    ) {
      const yearsExperienceEvidenceCandidates = buildYearsExperienceEvidenceCandidates(
        yearsExperience,
        experienceEvidenceText,
      );
      add(
        { section: "identity", key: "yearsExperience", recordId: null },
        "Years of experience",
        yearsExperience,
        yearsExperienceEvidenceCandidates.length > 0 ? 0.82 : 0.7,
        yearsExperienceEvidenceCandidates,
        {
          evidenceBundle: experienceEvidenceBundle,
        },
      );
    }
    add({ section: "contact", key: "email", recordId: null }, "Email", extraction.email, 0.98, [extraction.email ?? ""]);
    add({ section: "contact", key: "phone", recordId: null }, "Phone", extraction.phone, 0.94, [extraction.phone ?? ""]);
    add({ section: "contact", key: "portfolioUrl", recordId: null }, "Portfolio URL", extraction.portfolioUrl, 0.9, [extraction.portfolioUrl ?? ""]);
    add({ section: "contact", key: "linkedinUrl", recordId: null }, "LinkedIn URL", extraction.linkedinUrl, 0.96, [extraction.linkedinUrl ?? ""]);
    add({ section: "contact", key: "githubUrl", recordId: null }, "GitHub URL", extraction.githubUrl, 0.96, [extraction.githubUrl ?? ""]);
    add({ section: "contact", key: "personalWebsiteUrl", recordId: null }, "Personal website", extraction.personalWebsiteUrl, 0.88, [extraction.personalWebsiteUrl ?? ""]);
    add({ section: "search_preferences", key: "targetRoles", recordId: null }, "Target roles", extraction.targetRoles, 0.72, extraction.targetRoles);
    add({ section: "search_preferences", key: "locations", recordId: null }, "Preferred locations", extraction.preferredLocations, 0.72, extraction.preferredLocations);
    add({ section: "search_preferences", key: "salaryCurrency", recordId: null }, "Salary currency", extraction.salaryCurrency, 0.6, [extraction.currentLocation ?? ""]);
  }

  if (input.stage === "experience") {
    extraction.experiences.forEach((entry, index) => {
      add(
        {
          section: "experience",
          key: "record",
          recordId: `experience_${index + 1}`,
        },
        entry.title && entry.companyName
          ? `${entry.title} at ${entry.companyName}`
          : `Experience ${index + 1}`,
        entry,
        entry.companyName && entry.title ? 0.84 : 0.62,
        [
          entry.companyName ?? "",
          entry.title ?? "",
          ...(entry.achievements ?? []),
          entry.summary ?? "",
        ],
      );
    });
  }

  if (input.stage === "background") {
    add({ section: "skill", key: "skills", recordId: null }, "Skills", extraction.skills, 0.78, extraction.skills);
    add({ section: "skill", key: "skillGroups.coreSkills", recordId: null }, "Core skills", extraction.skillGroups.coreSkills, 0.78, extraction.skillGroups.coreSkills);
    add({ section: "skill", key: "skillGroups.tools", recordId: null }, "Tools", extraction.skillGroups.tools, 0.76, extraction.skillGroups.tools);
    add({ section: "skill", key: "skillGroups.languagesAndFrameworks", recordId: null }, "Languages and frameworks", extraction.skillGroups.languagesAndFrameworks, 0.76, extraction.skillGroups.languagesAndFrameworks);
    add({ section: "skill", key: "skillGroups.softSkills", recordId: null }, "Soft skills", extraction.skillGroups.softSkills, 0.74, extraction.skillGroups.softSkills);
    add({ section: "skill", key: "skillGroups.highlightedSkills", recordId: null }, "Highlighted skills", extraction.skillGroups.highlightedSkills, 0.74, extraction.skillGroups.highlightedSkills);

    extraction.education.forEach((entry, index) => {
      add({ section: "education", key: "record", recordId: `education_${index + 1}` }, entry.schoolName ?? `Education ${index + 1}`, entry, entry.schoolName ? 0.8 : 0.56, [entry.schoolName ?? "", entry.degree ?? "", entry.fieldOfStudy ?? ""]);
    });
    extraction.certifications.forEach((entry, index) => {
      add({ section: "certification", key: "record", recordId: `certification_${index + 1}` }, entry.name ?? `Certification ${index + 1}`, entry, entry.name ? 0.76 : 0.54, [entry.name ?? "", entry.issuer ?? ""]);
    });
    extraction.links.forEach((entry, index) => {
      add({ section: "link", key: "record", recordId: `link_${index + 1}` }, entry.label ?? entry.url ?? `Link ${index + 1}`, entry, entry.url ? 0.94 : 0.5, [entry.url ?? "", entry.label ?? ""]);
    });
    extraction.projects.forEach((entry, index) => {
      add({ section: "project", key: "record", recordId: `project_${index + 1}` }, entry.name ?? `Project ${index + 1}`, entry, entry.name ? 0.7 : 0.5, [entry.name ?? "", entry.summary ?? "", ...(entry.skills ?? [])]);
    });
    extraction.spokenLanguages.forEach((entry, index) => {
      add({ section: "language", key: "record", recordId: `language_${index + 1}` }, entry.language ?? `Language ${index + 1}`, entry, entry.language ? 0.86 : 0.5, [entry.language ?? "", entry.proficiency ?? ""]);
    });
  }

  if (input.stage === "shared_memory") {
    add({ section: "narrative", key: "professionalStory", recordId: null }, "Professional story", extraction.summary, 0.46, [extraction.summary ?? ""]);
    add({ section: "answer_bank", key: "selfIntroduction", recordId: null }, "Self introduction", extraction.summary, 0.44, [extraction.summary ?? ""]);

    extraction.experiences.slice(0, 3).forEach((entry, index) => {
      const strongestAchievement = entry.achievements[0] ?? entry.summary;
      if (!strongestAchievement) {
        return;
      }

      add(
        {
          section: "proof_point",
          key: "record",
          recordId: `proof_${index + 1}`,
        },
        entry.title && entry.companyName
          ? `${entry.title} proof at ${entry.companyName}`
          : `Proof point ${index + 1}`,
        {
          title: entry.title ?? entry.companyName ?? `Proof point ${index + 1}`,
          claim: strongestAchievement,
          heroMetric: null,
          supportingContext: entry.summary,
          roleFamilies: [],
          projectIds: [],
          linkIds: [],
        },
        0.42,
        [strongestAchievement, entry.summary ?? "", entry.companyName ?? ""],
      );
    });
  }

  return sanitizeStageCandidates(
    input,
    ResumeImportStageExtractionResultSchema.parse({
      stage: input.stage,
      analysisProviderKind: "deterministic",
      analysisProviderLabel: providerLabel,
      candidates,
      notes: extraction.notes,
    }),
  );
}
