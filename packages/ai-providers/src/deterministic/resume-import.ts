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
  type ResumeImportExtractionStage,
  type ResumeImportStageExtractionResult,
} from "../resume-import";
import { buildDeterministicResumeProfileExtraction } from "./resume-parser";
import {
  PROFILE_PLACEHOLDER_HEADLINE,
  PROFILE_PLACEHOLDER_LOCATION,
} from "@unemployed/job-finder";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function findEvidence(bundle: ResumeDocumentBundle, candidates: readonly string[]) {
  const normalizedCandidates = candidates.map((candidate) => normalizeText(candidate));
  const matchedBlocks = bundle.blocks.filter((block) => {
    const blockText = normalizeText(block.text);
    return normalizedCandidates.some(
      (candidate) => candidate.length > 0 && blockText.includes(candidate),
    );
  });

  // If no block matched, return the first candidate as evidence (or null).
  if (matchedBlocks.length === 0) {
    return {
      sourceBlockIds: [],
      evidenceText: candidates[0] ?? null,
    };
  }

  // Prefer a short snippet around the first exact match in the first matched block.
  const block = matchedBlocks[0];
  const blockText = block.text ?? "";

  // Helper to safely escape candidate strings for RegExp
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const re = new RegExp(`(.{0,80}{CAND}.{0,240})`.replace("{CAND}", escapeRegExp(candidate)), "is");
      const m = blockText.match(re);
      if (m && m[1]) {
        const snippet = m[1].trim().replace(/\s+/g, " ");
        return { sourceBlockIds: [block.id], evidenceText: snippet };
      }
    } catch (_) {
      // fallthrough to next candidate
    }
  }

  // If we couldn't extract a focused snippet, return a truncated version of the block
  const truncated = blockText.length > 400 ? `${blockText.slice(0, 400).trim()}...` : blockText.trim();
  return { sourceBlockIds: [block.id], evidenceText: truncated || (candidates[0] ?? null) };
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
    notes: [...(input.notes ?? [])],
    alternatives: [],
  });
}

function toResumeText(bundle: ResumeDocumentBundle): string {
  return bundle.fullText ?? bundle.blocks.map((block) => block.text).join("\n\n");
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
  );
  const candidates: ResumeImportFieldCandidateDraft[] = [];

  const add = (
    target: ResumeImportFieldCandidateDraft["target"],
    label: string,
    value: unknown,
    confidence: number,
    evidenceCandidates: readonly string[],
    options?: {
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

    // Avoid emitting candidates that are simply the current workspace's defaults
    // (these come from buildDeterministicResumeProfileExtraction falling back to the
    // existing profile). When a candidate exactly equals the existing profile value
    // for the same field, skip it to avoid creating noisy auto-applies.
    try {
      if (typeof value === "string") {
        const key = target.key as string;
        if (target.section === "identity" || target.section === "location" || target.section === "contact" || target.section === "narrative") {
          const existing = (input.existingProfile as any)[key];
          // Only skip when the existing value is non-empty and not a placeholder
          if (
            existing &&
            typeof existing === "string" &&
            existing === value &&
            existing !== PROFILE_PLACEHOLDER_HEADLINE &&
            existing !== PROFILE_PLACEHOLDER_LOCATION &&
            existing !== "New Candidate"
          ) {
            return;
          }
        }
        if (target.section === "search_preferences") {
          const existing = (input.existingSearchPreferences as any)[key];
          if (existing && typeof existing === "string" && existing === value) {
            return;
          }
        }
      }
    } catch (_) {
      // If anything goes wrong reading existing profile, continue and create candidate.
    }

    candidates.push(
      createCandidate(input.documentBundle, {
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
    add({ section: "identity", key: "fullName", recordId: null }, "Full name", extraction.fullName, 0.96, [extraction.fullName ?? ""]);
    add({ section: "identity", key: "firstName", recordId: null }, "First name", extraction.firstName, 0.92, [extraction.firstName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "middleName", recordId: null }, "Middle name", extraction.middleName, 0.85, [extraction.middleName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "lastName", recordId: null }, "Last name", extraction.lastName, 0.92, [extraction.lastName ?? "", extraction.fullName ?? ""]);
    add({ section: "identity", key: "headline", recordId: null }, "Headline", extraction.headline, 0.84, [extraction.headline ?? ""]);
    add({ section: "identity", key: "summary", recordId: null }, "Summary", extraction.summary, 0.8, [extraction.summary ?? ""]);
    add({ section: "location", key: "currentLocation", recordId: null }, "Current location", extraction.currentLocation, 0.88, [extraction.currentLocation ?? ""]);
    add({ section: "location", key: "timeZone", recordId: null }, "Time zone", extraction.timeZone, 0.62, [extraction.currentLocation ?? ""]);
    add({ section: "identity", key: "yearsExperience", recordId: null }, "Years of experience", extraction.yearsExperience, 0.7, [`${extraction.yearsExperience ?? ""} years`]);
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
    add({ section: "skill", key: "skillGroups.softSkills", recordId: null }, "Soft skills", extraction.skillGroups.softSkills, 0.68, extraction.skillGroups.softSkills);
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
    add({ section: "application_identity", key: "preferredEmail", recordId: null }, "Preferred application email", extraction.email, 0.72, [extraction.email ?? ""]);
    add({ section: "application_identity", key: "preferredPhone", recordId: null }, "Preferred application phone", extraction.phone, 0.72, [extraction.phone ?? ""]);
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
