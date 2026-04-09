import {
  ResumeImportExtractionStageSchema,
  buildValuePreview,
  type ResumeImportExtractionStage,
} from "@unemployed/ai-providers";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  ResumeDocumentBundleSchema,
  ResumeImportFieldCandidateSchema,
  ResumeImportRunSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type ResumeDocumentBundle,
  type ResumeImportFieldCandidate,
  type ResumeImportFieldCandidateDraft,
  type ResumeImportRun,
} from "@unemployed/contracts";

import type { WorkspaceServiceContext } from "./workspace-service-context";
import {
  buildExtractionId,
  mergeCertificationRecords,
  mergeEducationRecords,
  mergeExperienceRecords,
  mergeLanguageRecords,
  mergeLinkRecords,
  mergeProjectRecords,
  parseLocationParts,
} from "./profile-merge";
import { normalizeText, uniqueStrings } from "./shared";

const RESUME_IMPORT_STAGES = ResumeImportExtractionStageSchema.options;

type ResumeImportTrigger = ResumeImportRun["trigger"];

type ResolvedResumeImportSelection = {
  scalarFields: Partial<
    Pick<
      CandidateProfile,
      | "firstName"
      | "lastName"
      | "middleName"
      | "fullName"
      | "headline"
      | "summary"
      | "currentLocation"
      | "timeZone"
      | "yearsExperience"
      | "email"
      | "phone"
      | "portfolioUrl"
      | "linkedinUrl"
      | "githubUrl"
      | "personalWebsiteUrl"
    >
  > & {
    salaryCurrency?: string | null;
    targetRoles?: string[];
    locations?: string[];
    skills?: string[];
    skillGroups?: CandidateProfile["skillGroups"];
    narrative?: Partial<CandidateProfile["narrative"]>;
    answerBank?: Partial<CandidateProfile["answerBank"]>;
    applicationIdentity?: {
      preferredEmail?: string | null;
      preferredPhone?: string | null;
      preferredLinkUrls?: string[];
    };
  };
  experiences: CandidateProfile["experiences"];
  education: CandidateProfile["education"];
  certifications: CandidateProfile["certifications"];
  links: CandidateProfile["links"];
  projects: CandidateProfile["projects"];
  spokenLanguages: CandidateProfile["spokenLanguages"];
  proofBank: CandidateProfile["proofBank"];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringifyCandidateTarget(candidate: ResumeImportFieldCandidate): string {
  return [candidate.target.section, candidate.target.key, candidate.target.recordId ?? ""]
    .join("|")
    .trim();
}

function createCandidateId(
  runId: string,
  index: number,
  draft: ResumeImportFieldCandidateDraft,
): string {
  return buildExtractionId(`resume_import_${runId}`, index, [
    draft.target.section,
    draft.target.key,
    draft.target.recordId,
    draft.label,
  ]);
}

function toCandidate(
  runId: string,
  sourceKind: ResumeImportFieldCandidate["sourceKind"],
  createdAt: string,
  draft: ResumeImportFieldCandidateDraft,
  index: number,
): ResumeImportFieldCandidate {
  return ResumeImportFieldCandidateSchema.parse({
    ...draft,
    id: createCandidateId(runId, index, draft),
    runId,
    sourceKind,
    resolution: "needs_review",
    createdAt,
    resolvedAt: null,
    valuePreview: draft.valuePreview ?? buildValuePreview(draft.value),
  });
}

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function extractLiteralCandidates(
  runId: string,
  documentBundle: ResumeDocumentBundle,
  createdAt: string,
): ResumeImportFieldCandidate[] {
  const text = documentBundle.fullText ?? "";
  const drafts: ResumeImportFieldCandidateDraft[] = [];
  const headingBlock = documentBundle.blocks.find(
    (block) => block.sectionHint === "identity" && block.kind === "heading",
  );
  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const phoneMatches = text.match(/(\(?\+?\d[\d\s().-]{7,}\d\)?)/g) ?? [];
  const urlMatches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const locationLine = lines.find(
    (line) =>
      /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(line) &&
      !line.includes("@") &&
      !/^https?:\/\//i.test(line),
  );

  if (headingBlock?.text) {
    drafts.push({
      target: { section: "identity", key: "fullName", recordId: null },
      label: "Full name",
      value: headingBlock.text,
      normalizedValue: headingBlock.text,
      valuePreview: headingBlock.text,
      evidenceText: headingBlock.text.length > 400 ? `${headingBlock.text.slice(0, 400)}...` : headingBlock.text,
      sourceBlockIds: [headingBlock.id],
      confidence: 0.99,
      notes: [],
      alternatives: [],
    });
  }

  // If the parser didn't provide a heading block, fall back to a light-weight
  // heuristic: use the first non-empty line of the document as a possible name
  // candidate. This helps when PDF parsing produced a single big block without
  // a heading-kind split.
  if (!headingBlock) {
    const firstLine = documentBundle.fullText?.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
    if (firstLine) {
      const preview = firstLine.length > 200 ? `${firstLine.slice(0, 200)}...` : firstLine;
      drafts.push({
        target: { section: "identity", key: "fullName", recordId: null },
        label: "Full name",
        value: firstLine,
        normalizedValue: firstLine,
        valuePreview: preview,
        evidenceText: preview,
        sourceBlockIds: documentBundle.blocks.length > 0 ? [documentBundle.blocks[0].id] : [],
        confidence: 0.6,
        notes: ["heuristic_fallback"],
        alternatives: [],
      });
    }
  }

  const email = normalizeEmail(emailMatches[0] ?? "");
  if (email) {
    drafts.push({
      target: { section: "contact", key: "email", recordId: null },
      label: "Email",
      value: email,
      normalizedValue: email,
      valuePreview: email,
      evidenceText: email,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(email))
        .map((block) => block.id),
      confidence: 0.99,
      notes: [],
      alternatives: [],
    });
  }

  const phone = phoneMatches[0]?.trim();
  if (phone) {
    drafts.push({
      target: { section: "contact", key: "phone", recordId: null },
      label: "Phone",
      value: phone,
      normalizedValue: phone,
      valuePreview: phone,
      evidenceText: phone,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(phone))
        .map((block) => block.id),
      confidence: 0.96,
      notes: [],
      alternatives: [],
    });
  }

  if (locationLine) {
    drafts.push({
      target: { section: "location", key: "currentLocation", recordId: null },
      label: "Current location",
      value: locationLine,
      normalizedValue: locationLine,
      valuePreview: locationLine,
      evidenceText: locationLine,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(locationLine))
        .map((block) => block.id),
      confidence: 0.88,
      notes: [],
      alternatives: [],
    });
  }

  const urlTargets: Array<{
    key: ResumeImportFieldCandidateDraft["target"]["key"];
    label: string;
    pattern: RegExp;
  }> = [
    { key: "linkedinUrl", label: "LinkedIn URL", pattern: /linkedin\.com/i },
    { key: "githubUrl", label: "GitHub URL", pattern: /github\.com/i },
    { key: "portfolioUrl", label: "Portfolio URL", pattern: /(portfolio|projects|behance|dribbble)/i },
    { key: "personalWebsiteUrl", label: "Personal website", pattern: /.*/i },
  ];

  for (const target of urlTargets) {
    const url = urlMatches.find((entry) => target.pattern.test(entry));
    if (!url) {
      continue;
    }

    drafts.push({
      target: { section: "contact", key: target.key, recordId: null },
      label: target.label,
      value: url,
      normalizedValue: url,
      valuePreview: url,
      evidenceText: url,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(url))
        .map((block) => block.id),
      confidence: 0.95,
      notes: [],
      alternatives: [],
    });
  }

  return drafts.map((draft, index) =>
    toCandidate(runId, "parser_literal", createdAt, draft, index),
  );
}

function candidateScore(candidate: ResumeImportFieldCandidate): number {
  const sourceBonus = candidate.sourceKind === "parser_literal" ? 0.04 : 0;
  const evidenceBonus = candidate.sourceBlockIds.length > 0 ? 0.01 : 0;
  return candidate.confidence + sourceBonus + evidenceBonus;
}

function isListTarget(candidate: ResumeImportFieldCandidate): boolean {
  return [
    "targetRoles",
    "locations",
    "skills",
    "skillGroups.coreSkills",
    "skillGroups.tools",
    "skillGroups.languagesAndFrameworks",
    "skillGroups.softSkills",
    "skillGroups.highlightedSkills",
  ].includes(candidate.target.key);
}

function isRecordTarget(candidate: ResumeImportFieldCandidate): boolean {
  return [
    "experience",
    "education",
    "certification",
    "link",
    "project",
    "language",
    "proof_point",
  ].includes(candidate.target.section);
}

function shouldAutoApply(candidate: ResumeImportFieldCandidate): boolean {
  if (candidate.target.section === "narrative") {
    return false;
  }

  if (candidate.target.section === "proof_point") {
    return false;
  }

  if (candidate.target.section === "answer_bank") {
    return false;
  }

  if (
    candidate.target.section === "application_identity" &&
    candidate.target.key === "preferredLinkUrls"
  ) {
    return false;
  }

  if (isRecordTarget(candidate)) {
    return candidate.confidence >= 0.7 && candidate.sourceBlockIds.length > 0;
  }

  if (isListTarget(candidate)) {
    return candidate.confidence >= 0.72;
  }

  switch (candidate.target.key) {
    case "email":
    case "phone":
    case "linkedinUrl":
    case "githubUrl":
    case "portfolioUrl":
    case "personalWebsiteUrl":
    case "preferredEmail":
    case "preferredPhone":
      return candidate.confidence >= 0.85;
    case "currentLocation":
      return candidate.confidence >= 0.82;
    case "salaryCurrency":
      return candidate.confidence >= 0.58;
    default:
      return candidate.confidence >= 0.78;
  }
}

function reconcileCandidates(
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  const groups = new Map<string, ResumeImportFieldCandidate[]>();

  for (const candidate of candidates) {
    const key = stringifyCandidateTarget(candidate);
    const current = groups.get(key) ?? [];
    current.push(candidate);
    groups.set(key, current);
  }

  const resolved: ResumeImportFieldCandidate[] = [];

  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => candidateScore(right) - candidateScore(left));

    if (sorted.length === 0) {
      continue;
    }

    const first = sorted[0];
    if (!first) {
      continue;
    }

    if (isRecordTarget(first) || isListTarget(first)) {
      for (const candidate of sorted) {
        resolved.push({
          ...candidate,
          resolution: shouldAutoApply(candidate) ? "auto_applied" : "needs_review",
          resolvedAt: shouldAutoApply(candidate) ? new Date().toISOString() : null,
        });
      }
      continue;
    }

    sorted.forEach((candidate, index) => {
      const autoApply = index === 0 && shouldAutoApply(candidate);
      resolved.push({
        ...candidate,
        resolution:
          index === 0
            ? autoApply
              ? "auto_applied"
              : "needs_review"
            : "rejected",
        resolvedAt: autoApply ? new Date().toISOString() : null,
      });
    });
  }

  return resolved;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => (typeof entry === "string" ? [entry.trim()] : []))
    .filter(Boolean);
}

function buildResolvedSelection(
  candidates: readonly ResumeImportFieldCandidate[],
): ResolvedResumeImportSelection {
  const autoApplied = candidates.filter((candidate) => candidate.resolution === "auto_applied");
  const selection: ResolvedResumeImportSelection = {
    scalarFields: {},
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
    proofBank: [],
  };

  const scalarCandidates = new Map<string, ResumeImportFieldCandidate>();

  for (const candidate of autoApplied) {
    const key = `${candidate.target.section}.${candidate.target.key}`;

    if (isRecordTarget(candidate)) {
      const value = candidate.value;
      if (!isObject(value)) {
        continue;
      }

      switch (candidate.target.section) {
        case "experience":
          selection.experiences.push(value as CandidateProfile["experiences"][number]);
          break;
        case "education":
          selection.education.push(value as CandidateProfile["education"][number]);
          break;
        case "certification":
          selection.certifications.push(value as CandidateProfile["certifications"][number]);
          break;
        case "link":
          selection.links.push(value as CandidateProfile["links"][number]);
          break;
        case "project":
          selection.projects.push(value as CandidateProfile["projects"][number]);
          break;
        case "language":
          selection.spokenLanguages.push(value as CandidateProfile["spokenLanguages"][number]);
          break;
        case "proof_point":
          selection.proofBank.push(value as CandidateProfile["proofBank"][number]);
          break;
      }
      continue;
    }

    if (isListTarget(candidate)) {
      switch (candidate.target.key) {
        case "targetRoles":
          selection.scalarFields.targetRoles = uniqueStrings([
            ...(selection.scalarFields.targetRoles ?? []),
            ...toStringArray(candidate.value),
          ]);
          break;
        case "locations":
          selection.scalarFields.locations = uniqueStrings([
            ...(selection.scalarFields.locations ?? []),
            ...toStringArray(candidate.value),
          ]);
          break;
        case "skills":
          selection.scalarFields.skills = uniqueStrings([
            ...(selection.scalarFields.skills ?? []),
            ...toStringArray(candidate.value),
          ]);
          break;
        default: {
          const existingSkillGroups = selection.scalarFields.skillGroups ?? {
            coreSkills: [],
            tools: [],
            languagesAndFrameworks: [],
            softSkills: [],
            highlightedSkills: [],
          };
          const nextValues = toStringArray(candidate.value);
          if (candidate.target.key === "skillGroups.coreSkills") {
            existingSkillGroups.coreSkills = uniqueStrings([
              ...existingSkillGroups.coreSkills,
              ...nextValues,
            ]);
          }
          if (candidate.target.key === "skillGroups.tools") {
            existingSkillGroups.tools = uniqueStrings([
              ...existingSkillGroups.tools,
              ...nextValues,
            ]);
          }
          if (candidate.target.key === "skillGroups.languagesAndFrameworks") {
            existingSkillGroups.languagesAndFrameworks = uniqueStrings([
              ...existingSkillGroups.languagesAndFrameworks,
              ...nextValues,
            ]);
          }
          if (candidate.target.key === "skillGroups.softSkills") {
            existingSkillGroups.softSkills = uniqueStrings([
              ...existingSkillGroups.softSkills,
              ...nextValues,
            ]);
          }
          if (candidate.target.key === "skillGroups.highlightedSkills") {
            existingSkillGroups.highlightedSkills = uniqueStrings([
              ...existingSkillGroups.highlightedSkills,
              ...nextValues,
            ]);
          }
          selection.scalarFields.skillGroups = existingSkillGroups;
        }
      }
      continue;
    }

    scalarCandidates.set(key, candidate);
  }

  for (const [key, candidate] of scalarCandidates) {
    const value = candidate.value;
    switch (key) {
      case "identity.firstName":
        if (typeof value === "string") {
          selection.scalarFields.firstName = value;
        }
        break;
      case "identity.lastName":
        if (typeof value === "string") {
          selection.scalarFields.lastName = value;
        }
        break;
      case "identity.middleName":
        selection.scalarFields.middleName = typeof value === "string" ? value : null;
        break;
      case "identity.fullName":
        if (typeof value === "string") {
          selection.scalarFields.fullName = value;
        }
        break;
      case "identity.headline":
        if (typeof value === "string") {
          selection.scalarFields.headline = value;
        }
        break;
      case "identity.summary":
        if (typeof value === "string") {
          selection.scalarFields.summary = value;
        }
        break;
      case "identity.yearsExperience":
        if (typeof value === "number") {
          selection.scalarFields.yearsExperience = value;
        }
        break;
      case "location.currentLocation":
        if (typeof value === "string") {
          selection.scalarFields.currentLocation = value;
        }
        break;
      case "location.timeZone":
        selection.scalarFields.timeZone = typeof value === "string" ? value : null;
        break;
      case "contact.email":
        selection.scalarFields.email = typeof value === "string" ? value : null;
        break;
      case "contact.phone":
        selection.scalarFields.phone = typeof value === "string" ? value : null;
        break;
      case "contact.portfolioUrl":
        selection.scalarFields.portfolioUrl = typeof value === "string" ? value : null;
        break;
      case "contact.linkedinUrl":
        selection.scalarFields.linkedinUrl = typeof value === "string" ? value : null;
        break;
      case "contact.githubUrl":
        selection.scalarFields.githubUrl = typeof value === "string" ? value : null;
        break;
      case "contact.personalWebsiteUrl":
        selection.scalarFields.personalWebsiteUrl = typeof value === "string" ? value : null;
        break;
      case "search_preferences.salaryCurrency":
        selection.scalarFields.salaryCurrency = typeof value === "string" ? value : null;
        break;
      case "application_identity.preferredEmail":
        selection.scalarFields.applicationIdentity = {
          ...(selection.scalarFields.applicationIdentity ?? {}),
          preferredEmail: typeof value === "string" ? value : null,
        };
        break;
      case "application_identity.preferredPhone":
        selection.scalarFields.applicationIdentity = {
          ...(selection.scalarFields.applicationIdentity ?? {}),
          preferredPhone: typeof value === "string" ? value : null,
        };
        break;
      case "application_identity.preferredLinkUrls":
        selection.scalarFields.applicationIdentity = {
          ...(selection.scalarFields.applicationIdentity ?? {}),
          preferredLinkUrls: toStringArray(value),
        };
        break;
      case "narrative.professionalStory":
        selection.scalarFields.narrative = {
          ...(selection.scalarFields.narrative ?? {}),
          professionalStory: typeof value === "string" ? value : null,
        };
        break;
      case "narrative.nextChapterSummary":
        selection.scalarFields.narrative = {
          ...(selection.scalarFields.narrative ?? {}),
          nextChapterSummary: typeof value === "string" ? value : null,
        };
        break;
      case "narrative.careerTransitionSummary":
        selection.scalarFields.narrative = {
          ...(selection.scalarFields.narrative ?? {}),
          careerTransitionSummary: typeof value === "string" ? value : null,
        };
        break;
      case "answer_bank.selfIntroduction":
        selection.scalarFields.answerBank = {
          ...(selection.scalarFields.answerBank ?? {}),
          selfIntroduction: typeof value === "string" ? value : null,
        };
        break;
      case "answer_bank.careerTransition":
        selection.scalarFields.answerBank = {
          ...(selection.scalarFields.answerBank ?? {}),
          careerTransition: typeof value === "string" ? value : null,
        };
        break;
    }
  }

  return selection;
}

function mergeProofBankEntries(
  existing: CandidateProfile["proofBank"],
  extracted: CandidateProfile["proofBank"],
): CandidateProfile["proofBank"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [
      normalizeText(`${entry.title}|${entry.claim}`),
      entry,
    ]),
  );

  return extracted.map((entry, index) => {
    const key = normalizeText(`${entry.title}|${entry.claim}`);
    const match = existingByKey.get(key);
    return {
      id: match?.id ?? buildExtractionId("proof", index, [entry.title, entry.claim]),
      title: entry.title,
      claim: entry.claim,
      heroMetric: entry.heroMetric,
      supportingContext: entry.supportingContext,
      roleFamilies: uniqueStrings(entry.roleFamilies),
      projectIds: uniqueStrings(entry.projectIds),
      linkIds: uniqueStrings(entry.linkIds),
    };
  });
}

function mergeResolvedSelectionIntoWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  selection: ResolvedResumeImportSelection,
  analysisProviderKind: ResumeImportRun["analysisProviderKind"],
  analysisProviderLabel: ResumeImportRun["analysisProviderLabel"],
  analysisWarnings: readonly string[],
): {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
} {
  const currentLocation =
    selection.scalarFields.currentLocation ?? profile.currentLocation;
  const locationParts = parseLocationParts(currentLocation);
  const mergedLinks = mergeLinkRecords(profile.links, selection.links);
  const preferredLinkUrls = uniqueStrings(
    selection.scalarFields.applicationIdentity?.preferredLinkUrls ?? [],
  );
  const preferredLinkIds =
    preferredLinkUrls.length > 0
      ? mergedLinks
          .filter((entry) => entry.url && preferredLinkUrls.includes(entry.url))
          .map((entry) => entry.id)
      : profile.applicationIdentity.preferredLinkIds.length > 0
        ? profile.applicationIdentity.preferredLinkIds
        : mergedLinks
            .filter((entry) => entry.kind && entry.kind !== "other")
            .slice(0, 3)
            .map((entry) => entry.id);

  return {
    profile: CandidateProfileSchema.parse({
      ...profile,
      firstName: selection.scalarFields.firstName ?? profile.firstName,
      lastName: selection.scalarFields.lastName ?? profile.lastName,
      middleName:
        selection.scalarFields.middleName !== undefined
          ? selection.scalarFields.middleName
          : profile.middleName,
      fullName: selection.scalarFields.fullName ?? profile.fullName,
      headline: selection.scalarFields.headline ?? profile.headline,
      summary: selection.scalarFields.summary ?? profile.summary,
      currentLocation,
      currentCity: locationParts.currentCity ?? profile.currentCity,
      currentRegion: locationParts.currentRegion ?? profile.currentRegion,
      currentCountry: locationParts.currentCountry ?? profile.currentCountry,
      timeZone:
        selection.scalarFields.timeZone !== undefined
          ? selection.scalarFields.timeZone
          : profile.timeZone,
      yearsExperience:
        selection.scalarFields.yearsExperience ?? profile.yearsExperience,
      email:
        selection.scalarFields.email !== undefined
          ? selection.scalarFields.email
          : profile.email,
      phone:
        selection.scalarFields.phone !== undefined
          ? selection.scalarFields.phone
          : profile.phone,
      portfolioUrl:
        selection.scalarFields.portfolioUrl !== undefined
          ? selection.scalarFields.portfolioUrl
          : profile.portfolioUrl,
      linkedinUrl:
        selection.scalarFields.linkedinUrl !== undefined
          ? selection.scalarFields.linkedinUrl
          : profile.linkedinUrl,
      githubUrl:
        selection.scalarFields.githubUrl !== undefined
          ? selection.scalarFields.githubUrl
          : profile.githubUrl,
      personalWebsiteUrl:
        selection.scalarFields.personalWebsiteUrl !== undefined
          ? selection.scalarFields.personalWebsiteUrl
          : profile.personalWebsiteUrl,
      professionalSummary: {
        ...profile.professionalSummary,
        fullSummary: selection.scalarFields.summary ?? profile.professionalSummary.fullSummary,
        strengths:
          selection.scalarFields.skillGroups?.highlightedSkills.length
            ? selection.scalarFields.skillGroups.highlightedSkills
            : profile.professionalSummary.strengths,
      },
      narrative: {
        ...profile.narrative,
        ...(selection.scalarFields.narrative ?? {}),
      },
      proofBank: mergeProofBankEntries(profile.proofBank, selection.proofBank),
      answerBank: {
        ...profile.answerBank,
        ...(selection.scalarFields.answerBank ?? {}),
      },
      applicationIdentity: {
        ...profile.applicationIdentity,
        preferredEmail:
          selection.scalarFields.applicationIdentity?.preferredEmail ??
          profile.applicationIdentity.preferredEmail ??
          selection.scalarFields.email ??
          profile.email,
        preferredPhone:
          selection.scalarFields.applicationIdentity?.preferredPhone ??
          profile.applicationIdentity.preferredPhone ??
          selection.scalarFields.phone ??
          profile.phone,
        preferredLinkIds,
      },
      skillGroups: {
        ...profile.skillGroups,
        ...(selection.scalarFields.skillGroups ?? {}),
      },
      targetRoles:
        selection.scalarFields.targetRoles?.length
          ? uniqueStrings(selection.scalarFields.targetRoles)
          : profile.targetRoles,
      locations:
        selection.scalarFields.locations?.length
          ? uniqueStrings(selection.scalarFields.locations)
          : profile.locations,
      skills:
        selection.scalarFields.skills?.length
          ? uniqueStrings(selection.scalarFields.skills)
          : profile.skills,
      experiences: mergeExperienceRecords(profile.experiences, selection.experiences),
      education: mergeEducationRecords(profile.education, selection.education),
      certifications: mergeCertificationRecords(
        profile.certifications,
        selection.certifications,
      ),
      links: mergedLinks,
      projects: mergeProjectRecords(profile.projects, selection.projects),
      spokenLanguages: mergeLanguageRecords(
        profile.spokenLanguages,
        selection.spokenLanguages,
      ),
      baseResume: {
        ...profile.baseResume,
        extractionStatus: "ready",
        lastAnalyzedAt: new Date().toISOString(),
        analysisProviderKind,
        analysisProviderLabel,
        analysisWarnings: [...analysisWarnings],
      },
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      ...searchPreferences,
      targetRoles:
        selection.scalarFields.targetRoles?.length
          ? uniqueStrings(selection.scalarFields.targetRoles)
          : searchPreferences.targetRoles,
      locations:
        selection.scalarFields.locations?.length
          ? uniqueStrings(selection.scalarFields.locations)
          : searchPreferences.locations,
      salaryCurrency:
        selection.scalarFields.salaryCurrency ?? searchPreferences.salaryCurrency,
    }),
  };
}

function summarizeCandidateWarnings(
  candidates: readonly ResumeImportFieldCandidate[],
): string[] {
  const reviewCandidates = candidates.filter(
    (candidate) => candidate.resolution === "needs_review",
  );
  const leadingLabels = reviewCandidates.slice(0, 5).map((candidate) => candidate.label);

  if (reviewCandidates.length === 0) {
    return [];
  }

  return uniqueStrings([
    `${reviewCandidates.length} imported suggestion${reviewCandidates.length === 1 ? " still needs" : "s still need"} review before the app should rely on it everywhere.`,
    ...leadingLabels,
  ]);
}

function toCandidateCounts(candidates: readonly ResumeImportFieldCandidate[]) {
  return {
    total: candidates.length,
    autoApplied: candidates.filter((candidate) => candidate.resolution === "auto_applied").length,
    needsReview: candidates.filter((candidate) => candidate.resolution === "needs_review").length,
    rejected: candidates.filter((candidate) => candidate.resolution === "rejected").length,
  };
}

export async function runResumeImportWorkflow(
  ctx: WorkspaceServiceContext,
  input: {
    profile: CandidateProfile;
    searchPreferences: JobSearchPreferences;
    documentBundle: ResumeDocumentBundle;
    trigger: ResumeImportTrigger;
    importWarnings?: readonly string[];
  },
): Promise<{
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  run: ResumeImportRun;
  candidates: ResumeImportFieldCandidate[];
}> {
  const now = new Date().toISOString();
  const runId = `resume_import_run_${Date.now()}`;
  const bundle = ResumeDocumentBundleSchema.parse({
    ...input.documentBundle,
    runId,
    sourceResumeId: input.profile.baseResume.id,
  });

  let run = ResumeImportRunSchema.parse({
    id: runId,
    sourceResumeId: input.profile.baseResume.id,
    sourceResumeFileName: input.profile.baseResume.fileName,
    trigger: input.trigger,
    status: "parsing",
    startedAt: now,
    completedAt: null,
    primaryParserKind: bundle.primaryParserKind,
    parserKinds: bundle.parserKinds,
    analysisProviderKind: null,
    analysisProviderLabel: null,
    warnings: uniqueStrings([...(input.importWarnings ?? []), ...bundle.warnings]),
    errorMessage: null,
    candidateCounts: {
      total: 0,
      autoApplied: 0,
      needsReview: 0,
      rejected: 0,
    },
  });

  await ctx.repository.replaceResumeImportRunArtifacts({
    run,
    documentBundles: [bundle],
    fieldCandidates: [],
  });

  try {
    const literalCandidates = extractLiteralCandidates(runId, bundle, now);
    const stageResults = await Promise.all(
      RESUME_IMPORT_STAGES.map(async (stage) => {
        const result = await ctx.aiClient.extractResumeImportStage({
          stage,
          existingProfile: input.profile,
          existingSearchPreferences: input.searchPreferences,
          documentBundle: bundle,
        });
        return {
          stage,
          result,
        };
      }),
    );

    run = ResumeImportRunSchema.parse({
      ...run,
      status: "extracting",
      analysisProviderKind:
        stageResults.find((entry) => entry.result.analysisProviderKind !== null)?.result
          .analysisProviderKind ?? null,
      analysisProviderLabel:
        stageResults.find((entry) => entry.result.analysisProviderLabel)?.result
          .analysisProviderLabel ?? null,
    });

    const stageCandidates = stageResults.flatMap(({ stage, result }) => {
      const sourceKind = (() => {
        switch (stage) {
          case "identity_summary":
            return "model_identity_summary" as const;
          case "experience":
            return "model_experience" as const;
          case "background":
            return "model_background" as const;
          case "shared_memory":
            return "model_shared_memory" as const;
          default:
            return "reconciler" as const;
        }
      })();

      return result.candidates.map((candidate, index) =>
        toCandidate(runId, sourceKind, now, candidate, index),
      );
    });

    const provisionalCandidates = [...literalCandidates, ...stageCandidates];
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: provisionalCandidates,
    });

    const reconciledCandidates = reconcileCandidates(provisionalCandidates);
    const resolvedSelection = buildResolvedSelection(reconciledCandidates);
    const stageNotes = uniqueStrings(
      stageResults.flatMap((entry) => entry.result.notes),
    );
    const analysisWarnings = uniqueStrings([
      ...run.warnings,
      ...stageNotes,
      ...summarizeCandidateWarnings(reconciledCandidates),
    ]);
    const merged = mergeResolvedSelectionIntoWorkspace(
      input.profile,
      input.searchPreferences,
      resolvedSelection,
      run.analysisProviderKind,
      run.analysisProviderLabel,
      analysisWarnings,
    );
    const candidateCounts = toCandidateCounts(reconciledCandidates);

    run = ResumeImportRunSchema.parse({
      ...run,
      status: candidateCounts.needsReview > 0 ? "review_ready" : "applied",
      completedAt: new Date().toISOString(),
      warnings: analysisWarnings,
      candidateCounts,
    });

    await ctx.repository.saveProfileAndSearchPreferences(
      merged.profile,
      merged.searchPreferences,
    );
    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: reconciledCandidates,
    });

    return {
      profile: merged.profile,
      searchPreferences: merged.searchPreferences,
      run,
      candidates: reconciledCandidates,
    };
  } catch (error) {
    run = ResumeImportRunSchema.parse({
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error
          ? error.message
          : "Resume import failed before candidate extraction could finish.",
    });

    await ctx.repository.replaceResumeImportRunArtifacts({
      run,
      documentBundles: [bundle],
      fieldCandidates: [],
    });

    await ctx.repository.saveProfile(
      CandidateProfileSchema.parse({
        ...input.profile,
        baseResume: {
          ...input.profile.baseResume,
          extractionStatus: bundle.fullText ? "failed" : "needs_text",
          lastAnalyzedAt: null,
          analysisWarnings: uniqueStrings([
            ...(input.importWarnings ?? []),
            ...bundle.warnings,
            run.errorMessage ?? "Resume import failed.",
          ]),
        },
      }),
    );

    throw error;
  }
}
