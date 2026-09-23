import { buildValuePreview } from "@unemployed/ai-providers";
import {
  ResumeImportFieldCandidateSchema,
  isFreshStartCandidateProfile,
  type CandidateProfile,
  type JobSearchPreferences,
  type ResumeImportConflictChoice,
  type ResumeImportFieldCandidate,
} from "@unemployed/contracts";

import {
  areEquivalentRecordCandidates,
  isClearlyResumeDateRange,
  isObject,
  stringifyCandidateTarget,
  toCandidateListValues,
  toNarrativeStringArray,
  toStringArray,
} from "./resume-import-common";
import {
  canonicalizeRecordDateText,
  areEquivalentEducationRecords,
  areEquivalentExperienceRecords,
  scoreEducationRecordCompleteness,
  scoreExperienceRecordCompleteness,
} from "./resume-record-identity";
export {
  normalizeSharedMemoryCandidates,
  promoteGroundedSharedMemoryCandidates,
} from "./resume-import-shared-memory-candidates";
import { normalizeText, uniqueStrings } from "./shared";
import {
  PROFILE_PLACEHOLDER_HEADLINE,
  PROFILE_PLACEHOLDER_LOCATION,
  PROFILE_PLACEHOLDER_SUMMARY,
} from "./workspace-defaults";
import {
  findResumeImportIdentityConflicts,
  isLikelyPersonName as isLikelyPersonNameFromIdentity,
} from "./resume-identity";

function recordFieldText(value: unknown, key: string): string {
  if (!isObject(value)) {
    return "";
  }
  const field = value[key];
  return typeof field === "string" ? normalizeText(field) : "";
}

export function candidateScore(candidate: ResumeImportFieldCandidate): number {
  const sourceBonus = (() => {
    switch (candidate.sourceKind) {
      case "parser_literal":
        return 0.04;
      case "vision_omni":
        return 0.015;
      default:
        return 0;
    }
  })();
  const deterministicFallbackBonus = candidate.notes.includes(
    "deterministic_stage_fallback",
  )
    ? 0.03
    : 0;
  const evidenceBonus = candidate.sourceBlockIds.length > 0 ? 0.01 : 0;
  const recommendationBonus =
    candidate.confidenceBreakdown?.recommendation === "auto_apply"
      ? 0.03
      : candidate.confidenceBreakdown?.recommendation === "abstain"
        ? -0.05
        : 0;
  return (
    candidate.confidence +
    sourceBonus +
    deterministicFallbackBonus +
    evidenceBonus +
    recommendationBonus
  );
}

function candidateOverallConfidence(
  candidate: ResumeImportFieldCandidate,
): number {
  return candidate.confidenceBreakdown?.overall ?? candidate.confidence;
}

function recommendationForCandidate(
  candidate: ResumeImportFieldCandidate,
): NonNullable<
  ResumeImportFieldCandidate["confidenceBreakdown"]
>["recommendation"] {
  return (
    candidate.confidenceBreakdown?.recommendation ??
    (candidateOverallConfidence(candidate) < 0.35 ? "abstain" : "needs_review")
  );
}

function existingScalarValueForCandidate(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): unknown {
  switch (`${candidate.target.section}.${candidate.target.key}`) {
    case "identity.fullName":
      return profile.fullName;
    case "identity.firstName":
      return profile.firstName;
    case "identity.middleName":
      return profile.middleName;
    case "identity.lastName":
      return profile.lastName;
    case "identity.headline":
      return profile.headline;
    case "identity.summary":
      return profile.summary;
    case "identity.yearsExperience":
      return profile.yearsExperience;
    case "location.currentLocation":
      return profile.currentLocation;
    case "location.timeZone":
      return profile.timeZone;
    case "contact.email":
      return profile.email;
    case "contact.phone":
      return profile.phone;
    case "contact.portfolioUrl":
      return profile.portfolioUrl;
    case "contact.linkedinUrl":
      return profile.linkedinUrl;
    case "contact.githubUrl":
      return profile.githubUrl;
    case "contact.personalWebsiteUrl":
      return profile.personalWebsiteUrl;
    case "application_identity.preferredEmail":
      return profile.applicationIdentity.preferredEmail;
    case "application_identity.preferredPhone":
      return profile.applicationIdentity.preferredPhone;
    case "search_preferences.workModes":
      return searchPreferences.workModes;
    case "search_preferences.salaryCurrency":
      return searchPreferences.salaryCurrency;
    default:
      return undefined;
  }
}

function isPlaceholderScalarValue(
  profile: CandidateProfile,
  candidate: ResumeImportFieldCandidate,
  currentValue: unknown,
): boolean {
  if (candidate.target.key === "yearsExperience") {
    return (
      typeof currentValue === "number" &&
      currentValue <= 0 &&
      isFreshStartCandidateProfile(profile)
    );
  }

  if (typeof currentValue !== "string") {
    return false;
  }

  switch (candidate.target.key) {
    case "firstName":
      return (
        isFreshStartCandidateProfile(profile) &&
        normalizeText(currentValue) === "new"
      );
    case "lastName":
      return (
        isFreshStartCandidateProfile(profile) &&
        normalizeText(currentValue) === "candidate"
      );
    case "fullName":
      return (
        isFreshStartCandidateProfile(profile) &&
        normalizeText(currentValue) === "new candidate"
      );
    case "headline":
      return (
        isFreshStartCandidateProfile(profile) &&
        currentValue === PROFILE_PLACEHOLDER_HEADLINE
      );
    case "summary":
      return (
        isFreshStartCandidateProfile(profile) &&
        currentValue === PROFILE_PLACEHOLDER_SUMMARY
      );
    case "currentLocation":
      return (
        isFreshStartCandidateProfile(profile) &&
        currentValue === PROFILE_PLACEHOLDER_LOCATION
      );
    default:
      return false;
  }
}

function scalarValueConflictsWithWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const currentValue = existingScalarValueForCandidate(
    profile,
    searchPreferences,
    candidate,
  );

  if (currentValue === undefined || currentValue === null) {
    return false;
  }

  if (isPlaceholderScalarValue(profile, candidate, currentValue)) {
    return false;
  }

  if (typeof currentValue === "string" && typeof candidate.value === "string") {
    return normalizeText(currentValue) !== normalizeText(candidate.value);
  }

  if (typeof currentValue === "number" && typeof candidate.value === "number") {
    return currentValue !== candidate.value;
  }

  return false;
}

function scalarValueMatchesWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const currentValue = existingScalarValueForCandidate(
    profile,
    searchPreferences,
    candidate,
  );

  if (
    currentValue === undefined ||
    currentValue === null ||
    isPlaceholderScalarValue(profile, candidate, currentValue)
  ) {
    return false;
  }

  if (typeof currentValue === "string" && typeof candidate.value === "string") {
    return normalizeText(currentValue) === normalizeText(candidate.value);
  }

  return (
    typeof currentValue === "number" &&
    typeof candidate.value === "number" &&
    currentValue === candidate.value
  );
}

export function shouldPreferCandidateOverExistingValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const currentValue = existingScalarValueForCandidate(
    profile,
    searchPreferences,
    candidate,
  );

  if (currentValue === undefined || currentValue === null) {
    return true;
  }

  if (isPlaceholderScalarValue(profile, candidate, currentValue)) {
    return true;
  }

  if (
    candidate.sourceKind === "parser_literal" &&
    hasSufficientEvidence(candidate)
  ) {
    if (
      typeof currentValue === "string" &&
      typeof candidate.value === "string"
    ) {
      return normalizeText(currentValue) !== normalizeText(candidate.value);
    }

    return currentValue !== candidate.value;
  }

  return !scalarValueConflictsWithWorkspace(
    profile,
    searchPreferences,
    candidate,
  );
}

type EducationCandidateFieldKind = "degree" | "fieldOfStudy" | "location";

function educationEvidenceTokens(value: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "at",
    "degree",
    "in",
    "of",
    "s",
    "the",
  ]);
  return normalizeText(value)
    .split(/\s+/)
    .map((token) =>
      token === "bachelors"
        ? "bachelor"
        : token === "masters"
          ? "master"
          : token,
    )
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function normalizeSupportedEducationValue(
  candidate: ResumeImportFieldCandidate,
  value: unknown,
  kind: EducationCandidateFieldKind,
): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const evidenceText = candidate.evidenceText?.trim();
  if (evidenceText) {
    const evidenceTokens = new Set(educationEvidenceTokens(evidenceText));
    const valueTokens = educationEvidenceTokens(trimmed);
    if (
      valueTokens.length === 0 ||
      !valueTokens.every((token) => evidenceTokens.has(token))
    ) {
      return null;
    }
  }

  const normalized = normalizeText(trimmed);
  const compact = normalized.replace(/\s+/g, "");
  const degreeMarker =
    /\b(?:associate|associates|bachelor|bachelors|master|masters|doctor|doctorate|phd|degree|diploma|certificate|bsc|bba|msc|mba|ba|bs|ma|ms)\b/;

  if (kind === "degree") {
    return degreeMarker.test(normalized) ||
      ["ba", "bs", "ma", "ms"].some((prefix) => compact.startsWith(prefix))
      ? trimmed
      : null;
  }

  if (kind === "fieldOfStudy") {
    const firstToken = normalized.split(/\s+/)[0] ?? "";
    return degreeMarker.test(firstToken) ? null : trimmed;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (
    trimmed.length > 80 ||
    tokens.length > 8 ||
    /[@\d]|https?:\/\//i.test(trimmed) ||
    /\b(?:bachelor|master|degree|computer|science|engineering|business|administration|technology|studies)\b/.test(
      normalized,
    )
  ) {
    return null;
  }

  return trimmed;
}

function readAliasString(
  value: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim().length > 0) {
      return entry;
    }
  }
  return null;
}

function normalizeRecordCandidateValue(
  candidate: ResumeImportFieldCandidate,
): ResumeImportFieldCandidate["value"] {
  const parsedValue = (() => {
    if (typeof candidate.value !== "string") {
      return candidate.value;
    }

    try {
      const parsed: unknown = JSON.parse(candidate.value);
      return isObject(parsed) ? parsed : candidate.value;
    } catch {
      return candidate.value;
    }
  })();

  if (!isObject(parsedValue)) {
    return candidate.value;
  }

  switch (candidate.target.section) {
    case "experience": {
      const value = parsedValue;
      // The model names the same facts under different keys from one run to
      // the next (company/employer, highlights/bullets, current/present).
      // Reading the aliases keeps the employer and the bullets instead of
      // silently dropping them into an empty card.
      const rawEndDate = readAliasString(value, ["endDate", "end", "to"]);
      const endDateSaysCurrent =
        rawEndDate !== null && /^(?:present|current|now|ongoing)$/i.test(rawEndDate.trim());
      return {
        companyName: readAliasString(value, [
          "companyName",
          "company",
          "employer",
          "organization",
          "organisation",
        ]),
        companyUrl: readAliasString(value, ["companyUrl", "companyWebsite"]),
        title: readAliasString(value, ["title", "role", "position", "jobTitle"]),
        employmentType: readAliasString(value, ["employmentType", "type"]),
        location: readAliasString(value, ["location"]),
        workMode: toStringArray(value.workMode ?? value.workModes),
        startDate: canonicalizeRecordDateText(
          readAliasString(value, ["startDate", "start", "from"]),
        ),
        endDate: endDateSaysCurrent
          ? null
          : canonicalizeRecordDateText(rawEndDate),
        isCurrent:
          value.isCurrent === true ||
          value.current === true ||
          value.isPresent === true ||
          endDateSaysCurrent,
        summary: readAliasString(value, ["summary", "description", "overview"]),
        achievements: toNarrativeStringArray(
          value.achievements ??
            value.highlights ??
            value.bullets ??
            value.responsibilities ??
            value.accomplishments,
        ),
        skills: toStringArray(value.skills ?? value.technologies ?? value.tools),
        domainTags: toStringArray(
          value.domainTags ?? value.domains ?? value.industries,
        ),
        peopleManagementScope:
          typeof value.peopleManagementScope === "string"
            ? value.peopleManagementScope
            : null,
        ownershipScope:
          typeof value.ownershipScope === "string"
            ? value.ownershipScope
            : null,
      };
    }
    case "education": {
      const value = parsedValue;
      const schoolName =
        typeof value.schoolName === "string" ? value.schoolName : null;
      const degree = normalizeSupportedEducationValue(
        candidate,
        value.degree,
        "degree",
      );
      const fieldOfStudy = normalizeSupportedEducationValue(
        candidate,
        value.fieldOfStudy,
        "fieldOfStudy",
      );
      const location = normalizeSupportedEducationValue(
        candidate,
        value.location,
        "location",
      );
      const rawSummary =
        typeof value.summary === "string" ? value.summary : null;
      return {
        schoolName,
        degree,
        fieldOfStudy,
        location:
          location &&
          schoolName &&
          normalizeText(location) === normalizeText(schoolName)
            ? null
            : location,
        startDate: typeof value.startDate === "string" ? value.startDate : null,
        endDate: typeof value.endDate === "string" ? value.endDate : null,
        summary:
          rawSummary &&
          candidate.evidenceText &&
          normalizeText(rawSummary) === normalizeText(candidate.evidenceText)
            ? null
            : rawSummary,
      };
    }
    case "certification": {
      const value = parsedValue;
      return {
        name: typeof value.name === "string" ? value.name : null,
        issuer: typeof value.issuer === "string" ? value.issuer : null,
        issueDate: typeof value.issueDate === "string" ? value.issueDate : null,
        expiryDate:
          typeof value.expiryDate === "string" ? value.expiryDate : null,
        credentialUrl:
          typeof value.credentialUrl === "string" ? value.credentialUrl : null,
      };
    }
    case "link": {
      const value = parsedValue;
      return {
        label: typeof value.label === "string" ? value.label : null,
        url: typeof value.url === "string" ? value.url : null,
        kind: typeof value.kind === "string" ? value.kind : null,
      };
    }
    case "project": {
      const value = parsedValue;
      return {
        name: typeof value.name === "string" ? value.name : null,
        projectType:
          typeof value.projectType === "string" ? value.projectType : null,
        summary: typeof value.summary === "string" ? value.summary : null,
        role: typeof value.role === "string" ? value.role : null,
        skills: toStringArray(value.skills),
        outcome: typeof value.outcome === "string" ? value.outcome : null,
        projectUrl:
          typeof value.projectUrl === "string" ? value.projectUrl : null,
        repositoryUrl:
          typeof value.repositoryUrl === "string" ? value.repositoryUrl : null,
        caseStudyUrl:
          typeof value.caseStudyUrl === "string" ? value.caseStudyUrl : null,
      };
    }
    case "language": {
      const value = parsedValue;
      return {
        language: typeof value.language === "string" ? value.language : null,
        proficiency:
          typeof value.proficiency === "string" ? value.proficiency : null,
        interviewPreference: value.interviewPreference === true,
        notes: typeof value.notes === "string" ? value.notes : null,
      };
    }
    case "proof_point": {
      const value = parsedValue;
      return {
        title: typeof value.title === "string" ? value.title : null,
        claim: typeof value.claim === "string" ? value.claim : null,
        heroMetric:
          typeof value.heroMetric === "string" ? value.heroMetric : null,
        supportingContext:
          typeof value.supportingContext === "string"
            ? value.supportingContext
            : null,
        roleFamilies: toStringArray(value.roleFamilies),
        projectIds: toStringArray(value.projectIds),
        linkIds: toStringArray(value.linkIds),
      };
    }
    default:
      return candidate.value;
  }
}

function normalizeRecordCandidateForReconciliation(
  candidate: ResumeImportFieldCandidate,
): ResumeImportFieldCandidate {
  if (!isRecordTarget(candidate)) {
    return candidate;
  }

  const value = normalizeRecordCandidateValue(candidate);
  // The model sometimes keys a structured record by a slug ("experiences",
  // "albanian") instead of "record". Same section, same object shape, same
  // person's job: it must group with the deterministic twin instead of
  // showing up beside it as a second copy to confirm.
  const target =
    candidate.target.key !== "record" && isObject(value)
      ? {
          section: candidate.target.section,
          key: "record",
          recordId: candidate.target.recordId ?? candidate.target.key,
        }
      : candidate.target;
  if (value === candidate.value && target === candidate.target) {
    return candidate;
  }

  return ResumeImportFieldCandidateSchema.parse({
    ...candidate,
    target,
    value,
    valuePreview: buildValuePreview(value),
  });
}

/**
 * Two extractions of the same record rarely agree on which fields they
 * filled: the model reads the summary and dates, the text reader finds the
 * employer line. The winner keeps its own values and takes what it lacks
 * from its siblings, so applying one record never drops the company name
 * only the other copy knew.
 */
const RECORD_FILLABLE_FIELDS = new Set([
  "companyName",
  "companyUrl",
  "location",
  "employmentType",
  "workMode",
  "startDate",
  "endDate",
  "schoolName",
  "degree",
  "fieldOfStudy",
  "url",
  "label",
  "language",
  "proficiency",
  "name",
  "projectType",
  "role",
  "issuer",
  "achievements",
  "skills",
  "isCurrent",
]);

function enrichRecordCandidateFromSiblings(
  winner: ResumeImportFieldCandidate,
  siblings: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate {
  if (!isObject(winner.value) || siblings.length === 0) {
    return winner;
  }
  const merged: Record<string, unknown> = { ...winner.value };
  let changed = false;
  let keepEmployerEmpty = false;

  if (winner.target.section === "experience") {
    const winnerCompany = recordFieldText(winner.value, "companyName");
    const winnerTitle = recordFieldText(winner.value, "title");
    for (const sibling of siblings) {
      if (!isObject(sibling.value)) {
        continue;
      }
      const siblingCompany = recordFieldText(sibling.value, "companyName");
      const siblingTitle = recordFieldText(sibling.value, "title");
      if (
        winnerCompany &&
        winnerTitle &&
        !siblingCompany &&
        siblingTitle === `${winnerCompany} ${winnerTitle}`
      ) {
        merged.companyName = null;
        merged.title = sibling.value.title;
        keepEmployerEmpty = true;
        changed = true;
        break;
      }
      if (
        !winnerCompany &&
        winnerTitle &&
        siblingCompany &&
        siblingTitle &&
        winnerTitle === `${siblingCompany} ${siblingTitle}`
      ) {
        keepEmployerEmpty = true;
      }
    }
  }

  for (const sibling of siblings) {
    if (!isObject(sibling.value)) {
      continue;
    }
    for (const [key, siblingValue] of Object.entries(sibling.value)) {
      // Prose (summary, notes) is never borrowed: the text reader's version
      // is the raw paragraph, often first person or a bare location line.
      if (!RECORD_FILLABLE_FIELDS.has(key)) {
        continue;
      }
      if (key === "companyName" && keepEmployerEmpty) {
        continue;
      }
      const current = merged[key];
      if (Array.isArray(current) && Array.isArray(siblingValue)) {
        const union = uniqueStrings([
          ...current.filter((entry): entry is string => typeof entry === "string"),
          ...siblingValue.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        ]);
        if (union.length !== current.length) {
          merged[key] = union;
          changed = true;
        }
        continue;
      }
      const currentEmpty =
        current === null ||
        current === undefined ||
        current === false ||
        (typeof current === "string" && current.trim().length === 0);
      const siblingFilled =
        siblingValue !== null &&
        siblingValue !== undefined &&
        siblingValue !== false &&
        !(typeof siblingValue === "string" && siblingValue.trim().length === 0);
      // Only gaps are filled. A sibling's longer summary is not better: the
      // text reader's version is often the raw first-person paragraph.
      if (currentEmpty && siblingFilled) {
        merged[key] = siblingValue;
        changed = true;
      }
    }
  }
  if (!changed) {
    return winner;
  }
  return ResumeImportFieldCandidateSchema.parse({
    ...winner,
    value: merged,
    valuePreview: buildValuePreview(merged),
  });
}

function hasMeaningfulRecordValue(candidate: ResumeImportFieldCandidate): boolean {
  if (
    !isRecordTarget(candidate) ||
    candidate.target.section !== "education" ||
    !isObject(candidate.value)
  ) {
    return true;
  }
  return ["schoolName", "degree", "fieldOfStudy"].some(
    (key) => recordFieldText(candidate.value, key).length > 0,
  );
}

const SHARED_MEMORY_SECTIONS = new Set([
  "narrative",
  "proof_point",
  "answer_bank",
  "application_identity",
]);

/**
 * Importing into an empty profile fills it. The review-first policy above
 * exists to protect values the person already typed; on a fresh profile there
 * is nothing to protect, and asking someone to confirm forty rows of their
 * own resume one by one is the friction the import was meant to remove. The
 * winner of every group is applied, the person edits what is wrong on the
 * form, and only shared-memory suggestions and identity mismatches still
 * wait. The same applies to a scalar whose stored value is still empty.
 */
function promoteImportCandidatesIntoEmptyProfile(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  const freshStart = isFreshStartCandidateProfile(profile);
  const emptySections = new Set<string>(
    (
      [
        ["experience", profile.experiences.length],
        ["education", profile.education.length],
        ["certification", profile.certifications.length],
        ["link", profile.links.length],
        ["project", profile.projects.length],
        ["language", profile.spokenLanguages.length],
      ] as const
    )
      .filter(([, count]) => count === 0)
      .map(([section]) => section),
  );
  const resolvedAt = new Date().toISOString();

  return candidates.map((candidate) => {
    if (
      candidate.resolution !== "needs_review" ||
      SHARED_MEMORY_SECTIONS.has(candidate.target.section) ||
      candidate.resolutionReason?.startsWith("identity_mismatch") ||
      candidateOverallConfidence(candidate) < 0.6 ||
      !hasSufficientEvidence(candidate)
    ) {
      return candidate;
    }
    // A first-person "About me" is the person's own words but not a resume
    // summary yet; it stays a suggestion on Basics instead of landing
    // verbatim in every generated resume.
    if (
      candidate.target.section === "identity" &&
      candidate.target.key === "summary" &&
      typeof candidate.value === "string" &&
      /\b(?:i|me|my|mine|myself)\b/i.test(candidate.value)
    ) {
      return candidate;
    }
    const isRecord = isRecordTarget(candidate);
    const existingValue = existingScalarValueForCandidate(
      profile,
      searchPreferences,
      candidate,
    );
    const existingIsEmpty =
      existingValue === null ||
      existingValue === undefined ||
      (typeof existingValue === "string" &&
        existingValue.trim().length === 0) ||
      (Array.isArray(existingValue) && existingValue.length === 0) ||
      isPlaceholderScalarValue(profile, candidate, existingValue);
    const eligible = isRecord
      ? freshStart || emptySections.has(candidate.target.section)
      : freshStart || isListTarget(candidate) || existingIsEmpty;
    if (!eligible) {
      return candidate;
    }
    return ResumeImportFieldCandidateSchema.parse({
      ...candidate,
      resolution: "auto_applied",
      resolutionReason: "applied_into_empty_profile",
      resolvedAt,
    });
  });
}

function isRedundantUnstructuredRecordCandidate(
  candidate: ResumeImportFieldCandidate,
  candidates: readonly ResumeImportFieldCandidate[],
): boolean {
  if (!isRecordTarget(candidate) || typeof candidate.value !== "string") {
    return false;
  }

  const evidence = normalizeText(candidate.evidenceText ?? candidate.value);
  if (!evidence) {
    return false;
  }

  return candidates.some(
    (other) =>
      other.id !== candidate.id &&
      other.target.section === candidate.target.section &&
      other.target.key === candidate.target.key &&
      isObject(other.value) &&
      hasSufficientEvidence(other) &&
      normalizeText(other.evidenceText ?? "") === evidence,
  );
}

function isAutoApplyLiteralField(
  candidate: ResumeImportFieldCandidate,
): boolean {
  return [
    "firstName",
    "middleName",
    "lastName",
    "fullName",
    "email",
    "phone",
    "linkedinUrl",
    "githubUrl",
    "portfolioUrl",
    "personalWebsiteUrl",
    "currentLocation",
    "preferredEmail",
    "preferredPhone",
  ].includes(candidate.target.key);
}

function hasSufficientEvidence(candidate: ResumeImportFieldCandidate): boolean {
  return (
    candidate.sourceBlockIds.length > 0 ||
    (candidate.visualEvidence?.length ?? 0) > 0 ||
    candidate.sourceKind === "parser_literal"
  );
}

function isLikelyPersonNamePart(value: string): boolean {
  const trimmed = value.trim();

  return (
    trimmed.length > 0 &&
    /^\p{Lu}[\p{L}\p{M}.'’ʼ-]*$/u.test(trimmed) &&
    !/\b(?:senior|junior|staff|principal|lead|head|chief|associate|intern|engineer|developer|designer|manager|director|analyst|consultant|specialist|architect|technical|product|platform|frontend|front[- ]end|backend|back[- ]end|full[- ]stack)\b/iu.test(
      trimmed,
    )
  );
}

function shouldAutoApplyPlaceholderReplacement(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (!isFreshStartCandidateProfile(profile)) {
    return false;
  }

  const recommendation = recommendationForCandidate(candidate);

  if (recommendation === "abstain") {
    return false;
  }

  const placeholderReviewBypassKey = `${candidate.target.section}.${candidate.target.key}`;
  const canBypassNeedsReviewForFreshStart =
    recommendation === "auto_apply" ||
    placeholderReviewBypassKey === "identity.headline" ||
    placeholderReviewBypassKey === "identity.summary" ||
    placeholderReviewBypassKey === "identity.yearsExperience";

  if (!canBypassNeedsReviewForFreshStart) {
    return false;
  }

  const currentValue = existingScalarValueForCandidate(
    profile,
    searchPreferences,
    candidate,
  );

  if (!isPlaceholderScalarValue(profile, candidate, currentValue)) {
    return false;
  }

  if (!hasSufficientEvidence(candidate)) {
    return false;
  }

  const overall = candidateOverallConfidence(candidate);

  switch (placeholderReviewBypassKey) {
    case "identity.firstName":
    case "identity.middleName":
    case "identity.lastName":
      return (
        typeof candidate.value === "string" &&
        isLikelyPersonNamePart(candidate.value) &&
        overall >= 0.8
      );
    case "identity.fullName":
      return (
        typeof candidate.value === "string" &&
        isLikelyPersonName(candidate.value) &&
        overall >= 0.82
      );
    case "identity.headline": {
      if (typeof candidate.value !== "string") {
        return false;
      }

      const trimmed = candidate.value.trim();
      return (
        trimmed.length > 0 &&
        trimmed.length <= 72 &&
        trimmed.split(/\s+/).length <= 10 &&
        !/[@]|https?:\/\//i.test(trimmed) &&
        overall >= 0.75
      );
    }
    case "identity.summary":
      return (
        typeof candidate.value === "string" &&
        candidate.value.trim().length >= 48 &&
        overall >= 0.74
      );
    case "identity.yearsExperience":
      return (
        typeof candidate.value === "number" &&
        candidate.value > 0 &&
        overall >= 0.75
      );
    case "location.currentLocation":
      return (
        typeof candidate.value === "string" &&
        isLikelyLocationValue(candidate.value) &&
        overall >= 0.75
      );
    default:
      return false;
  }
}

function canAutoApplyDespiteWorkspaceConflict(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (
    !scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate)
  ) {
    return true;
  }

  return (
    candidate.sourceKind === "parser_literal" &&
    isAutoApplyLiteralField(candidate) &&
    hasSufficientEvidence(candidate)
  );
}

function isLikelyPersonName(value: string): boolean {
  return isLikelyPersonNameFromIdentity(value);
}

function isStrongLiteralIdentityCandidate(
  candidate: ResumeImportFieldCandidate,
): boolean {
  return (
    candidate.sourceKind === "parser_literal" &&
    candidate.target.section === "identity" &&
    candidate.target.key === "fullName" &&
    typeof candidate.value === "string" &&
    isLikelyPersonName(candidate.value) &&
    hasSufficientEvidence(candidate) &&
    candidateOverallConfidence(candidate) >= 0.82
  );
}

function getDerivedNameParts(fullName: string): {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    lastName: parts.length > 1 ? (parts[parts.length - 1] ?? null) : null,
  };
}

function isLikelyLocationValue(value: string): boolean {
  const cleaned = value
    .trim()
    .replace(/^Address:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .trim();

  if (!cleaned || cleaned.length > 80) {
    return false;
  }

  if (/[@]|https?:\/\//i.test(cleaned)) {
    return false;
  }

  if (/[.!?]/.test(cleaned)) {
    return false;
  }

  if (
    /\b(recently|decided|return|passion|experience|building|driven|improving)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return (
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(cleaned) ||
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(
      cleaned,
    ) ||
    /^[A-Za-z][A-Za-z\s.'-]+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(cleaned)
  );
}

export function isListTarget(candidate: ResumeImportFieldCandidate): boolean {
  if (
    candidate.target.section === "skill" &&
    candidate.target.key === "record"
  ) {
    return true;
  }

  return [
    "targetRoles",
    "locations",
    "workModes",
    "skills",
    "skillGroups.coreSkills",
    "skillGroups.tools",
    "skillGroups.languagesAndFrameworks",
    "skillGroups.softSkills",
    "skillGroups.highlightedSkills",
  ].includes(candidate.target.key);
}

export function isRecordTarget(candidate: ResumeImportFieldCandidate): boolean {
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

function normalizedStringValuesMatch(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftValues = new Set(left.map(normalizeText).filter(Boolean));
  const rightValues = new Set(right.map(normalizeText).filter(Boolean));
  return (
    leftValues.size === rightValues.size &&
    [...leftValues].every((value) => rightValues.has(value))
  );
}

function listCandidateMatchesWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const values = toCandidateListValues(candidate);
  if (values.length === 0) {
    return false;
  }

  switch (`${candidate.target.section}.${candidate.target.key}`) {
    case "search_preferences.targetRoles":
      return (
        normalizedStringValuesMatch(values, profile.targetRoles) &&
        normalizedStringValuesMatch(values, searchPreferences.targetRoles)
      );
    case "search_preferences.locations":
      return (
        normalizedStringValuesMatch(values, profile.locations) &&
        normalizedStringValuesMatch(values, searchPreferences.locations)
      );
    case "search_preferences.workModes":
      return normalizedStringValuesMatch(values, searchPreferences.workModes);
    case "skill.skills":
    case "skill.record":
      return normalizedStringValuesMatch(values, profile.skills);
    case "skill.skillGroups.coreSkills":
      return normalizedStringValuesMatch(
        values,
        profile.skillGroups.coreSkills,
      );
    case "skill.skillGroups.tools":
      return normalizedStringValuesMatch(values, profile.skillGroups.tools);
    case "skill.skillGroups.languagesAndFrameworks":
      return normalizedStringValuesMatch(
        values,
        profile.skillGroups.languagesAndFrameworks,
      );
    case "skill.skillGroups.softSkills":
      return normalizedStringValuesMatch(
        values,
        profile.skillGroups.softSkills,
      );
    case "skill.skillGroups.highlightedSkills":
      return normalizedStringValuesMatch(
        values,
        profile.skillGroups.highlightedSkills,
      );
    default:
      return false;
  }
}

function recordCandidateMatchesWorkspace(
  profile: CandidateProfile,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (candidate.target.section === "experience") {
    return profile.experiences.some((record) =>
      areEquivalentExperienceRecords(record, candidate.value),
    );
  }

  if (candidate.target.section === "education") {
    return profile.education.some((record) =>
      areEquivalentEducationRecords(record, candidate.value),
    );
  }

  return false;
}

function candidateMatchesWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  return (
    scalarValueMatchesWorkspace(profile, searchPreferences, candidate) ||
    listCandidateMatchesWorkspace(profile, searchPreferences, candidate) ||
    recordCandidateMatchesWorkspace(profile, candidate)
  );
}

function shouldAutoApply(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (
    shouldAutoApplyPlaceholderReplacement(profile, searchPreferences, candidate)
  ) {
    return true;
  }

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

  if (recommendationForCandidate(candidate) !== "auto_apply") {
    return false;
  }

  if (!hasSufficientEvidence(candidate)) {
    return false;
  }

  if (
    !canAutoApplyDespiteWorkspaceConflict(profile, searchPreferences, candidate)
  ) {
    return false;
  }

  if (isRecordTarget(candidate) || isListTarget(candidate)) {
    return false;
  }

  if (isAutoApplyLiteralField(candidate)) {
    switch (candidate.target.key) {
      case "fullName":
        return (
          typeof candidate.value === "string" &&
          isLikelyPersonName(candidate.value) &&
          candidateOverallConfidence(candidate) >= 0.82
        );
      case "currentLocation":
        return (
          typeof candidate.value === "string" &&
          isLikelyLocationValue(candidate.value) &&
          candidateOverallConfidence(candidate) >= 0.8
        );
      default:
        return candidateOverallConfidence(candidate) >= 0.82;
    }
  }

  return false;
}

function shouldMergeRecordCandidate(
  profile: CandidateProfile,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (!isRecordTarget(candidate)) {
    return false;
  }

  if (!isObject(candidate.value)) {
    return false;
  }

  const overall = candidateOverallConfidence(candidate);

  switch (candidate.target.section) {
    case "experience": {
      const value = candidate.value;
      const hasCompany =
        typeof value.companyName === "string" &&
        value.companyName.trim().length > 0;
      const hasTitle =
        typeof value.title === "string" && value.title.trim().length > 0;
      const hasDates =
        (typeof value.startDate === "string" &&
          value.startDate.trim().length > 0) ||
        (typeof value.endDate === "string" &&
          value.endDate.trim().length > 0) ||
        value.isCurrent === true;
      const completeness = scoreExperienceRecordCompleteness(candidate.value);
      const hasSubstantiveDetails =
        (typeof value.summary === "string" &&
          value.summary.trim().length >= 24) ||
        toNarrativeStringArray(value.achievements).length > 0 ||
        toStringArray(value.skills).length > 0;
      const requiredCompleteness = hasDates
        ? hasSubstantiveDetails
          ? 4
          : 5
        : 3;
      const requiredOverall = hasDates && hasSubstantiveDetails ? 0.68 : 0.72;

      return (
        isFreshStartCandidateProfile(profile) &&
        hasCompany &&
        hasTitle &&
        (hasDates || hasSubstantiveDetails) &&
        completeness >= requiredCompleteness &&
        overall >= requiredOverall &&
        hasSufficientEvidence(candidate)
      );
    }
    case "education": {
      const value = candidate.value;
      const hasSchool =
        typeof value.schoolName === "string" &&
        value.schoolName.trim().length > 0;
      const hasDegree =
        typeof value.degree === "string" && value.degree.trim().length > 0;
      const hasField =
        typeof value.fieldOfStudy === "string" &&
        value.fieldOfStudy.trim().length > 0;
      const completeness = scoreEducationRecordCompleteness(candidate.value);

      return (
        isFreshStartCandidateProfile(profile) &&
        hasSchool &&
        (hasDegree || hasField) &&
        completeness >= 2 &&
        overall >= 0.62 &&
        hasSufficientEvidence(candidate)
      );
    }
    case "certification": {
      const value = candidate.value;
      const hasName =
        typeof value.name === "string" && value.name.trim().length > 0;
      return hasName && overall >= 0.6 && hasSufficientEvidence(candidate);
    }
    case "link": {
      const value = candidate.value;
      const hasUrl =
        typeof value.url === "string" && value.url.trim().length > 0;
      return hasUrl && overall >= 0.72 && hasSufficientEvidence(candidate);
    }
    case "project": {
      const value = candidate.value;
      const hasName =
        typeof value.name === "string" && value.name.trim().length > 0;
      return hasName && overall >= 0.58 && hasSufficientEvidence(candidate);
    }
    case "language": {
      const value = candidate.value;
      const hasLanguage =
        typeof value.language === "string" && value.language.trim().length > 0;
      return hasLanguage && overall >= 0.7 && hasSufficientEvidence(candidate);
    }
    case "proof_point": {
      const value = candidate.value;
      const hasTitle =
        typeof value.title === "string" && value.title.trim().length > 0;
      const hasClaim =
        typeof value.claim === "string" && value.claim.trim().length > 0;
      return (
        hasTitle &&
        hasClaim &&
        overall >= 0.88 &&
        hasSufficientEvidence(candidate)
      );
    }
    default:
      return false;
  }
}

function shouldAutoApplyAdditionalFreshStartRecordCandidate(
  profile: CandidateProfile,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (
    !isFreshStartCandidateProfile(profile) ||
    !isRecordTarget(candidate) ||
    !isObject(candidate.value)
  ) {
    return false;
  }

  if (candidate.target.section !== "experience") {
    return false;
  }

  const value = candidate.value;
  const hasCompany =
    typeof value.companyName === "string" &&
    value.companyName.trim().length > 0;
  const hasTitle =
    typeof value.title === "string" && value.title.trim().length > 0;
  const hasDates =
    (typeof value.startDate === "string" &&
      value.startDate.trim().length > 0) ||
    (typeof value.endDate === "string" && value.endDate.trim().length > 0) ||
    value.isCurrent === true;
  const hasSubstantiveDetails =
    (typeof value.summary === "string" && value.summary.trim().length >= 24) ||
    toNarrativeStringArray(value.achievements).length > 0 ||
    toStringArray(value.skills).length > 0;
  const completeness = scoreExperienceRecordCompleteness(value);
  const overall = candidateOverallConfidence(candidate);

  return (
    hasCompany &&
    hasTitle &&
    (hasDates || hasSubstantiveDetails) &&
    completeness >= (hasDates ? 4 : 3) &&
    overall >= 0.72 &&
    hasSufficientEvidence(candidate)
  );
}

function shouldMergeListCandidate(
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (candidate.target.section === "search_preferences") {
    return false;
  }

  if (
    candidate.target.section === "skill" &&
    candidate.target.key === "record"
  ) {
    return false;
  }

  if (!isListTarget(candidate)) {
    return false;
  }

  const values = toCandidateListValues(candidate);
  if (values.length === 0) {
    return false;
  }

  if (
    candidate.target.section === "skill" &&
    candidate.target.key === "skills" &&
    values.length === 1 &&
    candidate.notes.includes("deterministic_stage_fallback")
  ) {
    return candidateOverallConfidence(candidate) >= 0.82;
  }

  return candidateOverallConfidence(candidate) >= 0.58;
}

function shouldAutoApplySkillRecordCandidate(
  candidate: ResumeImportFieldCandidate,
): boolean {
  return (
    candidate.target.section === "skill" &&
    candidate.target.key === "record" &&
    typeof candidate.value === "string" &&
    candidate.value.trim().length > 0 &&
    candidateOverallConfidence(candidate) >= 0.82 &&
    hasSufficientEvidence(candidate)
  );
}

function recordCandidateCompletenessScore(
  candidate: ResumeImportFieldCandidate,
): number {
  switch (candidate.target.section) {
    case "experience":
      return scoreExperienceRecordCompleteness(candidate.value);
    case "education":
      return scoreEducationRecordCompleteness(candidate.value);
    default:
      return 0;
  }
}

function compareRecordCandidates(
  left: ResumeImportFieldCandidate,
  right: ResumeImportFieldCandidate,
): number {
  const scoreDelta = candidateScore(right) - candidateScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const completenessDelta =
    recordCandidateCompletenessScore(right) -
    recordCandidateCompletenessScore(left);
  if (completenessDelta !== 0) {
    return completenessDelta;
  }

  return left.id.localeCompare(right.id);
}

function groupCandidatesForReconciliation(
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[][] {
  const groups: ResumeImportFieldCandidate[][] = [];
  const scalarGroups = new Map<string, ResumeImportFieldCandidate[]>();

  for (const candidate of candidates) {
    if (isRecordTarget(candidate)) {
      const existingGroup = groups.find((group) =>
        group.some((existing) =>
          areEquivalentRecordCandidates(existing, candidate),
        ),
      );

      if (existingGroup) {
        existingGroup.push(candidate);
        continue;
      }

      groups.push([candidate]);
      continue;
    }

    const key = stringifyCandidateTarget(candidate);
    const current = scalarGroups.get(key) ?? [];
    current.push(candidate);
    scalarGroups.set(key, current);
  }

  groups.push(...scalarGroups.values());
  return groups;
}

function resolutionReasonForCandidate(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
  resolution: ResumeImportFieldCandidate["resolution"],
): string {
  switch (resolution) {
    case "auto_applied":
      return "high_confidence_literal_with_direct_evidence";
    case "abstained":
      return recommendationForCandidate(candidate) === "abstain"
        ? "composite_confidence_recommended_abstain"
        : "insufficient_confidence_or_evidence";
    case "rejected":
      if (candidateMatchesWorkspace(profile, searchPreferences, candidate)) {
        return "already_matches_workspace_value";
      }

      return scalarValueConflictsWithWorkspace(
        profile,
        searchPreferences,
        candidate,
      )
        ? "conflicts_with_existing_profile_value"
        : "lower_ranked_duplicate_candidate";
    case "needs_review": {
      if (isRecordTarget(candidate)) {
        return "record_candidates_require_review";
      }

      if (isListTarget(candidate)) {
        return "list_candidates_require_review";
      }

      if (candidate.target.section === "narrative") {
        return "shared_memory_requires_review";
      }

      if (!hasSufficientEvidence(candidate)) {
        return "missing_grounded_evidence";
      }

      if (
        scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate)
      ) {
        return "conflicts_with_existing_profile_value";
      }

      return "manual_review_required_by_confidence_policy";
    }
  }
}

function applyCandidateResolution(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
  resolution: ResumeImportFieldCandidate["resolution"],
  resolutionReasonOverride?: string,
): ResumeImportFieldCandidate {
  const resolvedAt =
    resolution === "auto_applied" ? new Date().toISOString() : null;
  const normalizedValue = normalizeRecordCandidateValue(candidate);

  return ResumeImportFieldCandidateSchema.parse({
    ...candidate,
    value: normalizedValue,
    valuePreview: candidate.valuePreview ?? buildValuePreview(normalizedValue),
    confidence:
      resolution === "abstained"
        ? Math.min(candidate.confidence, candidateOverallConfidence(candidate))
        : candidate.confidence,
    resolution,
    resolutionReason:
      resolutionReasonOverride ??
      resolutionReasonForCandidate(
        profile,
        searchPreferences,
        candidate,
        resolution,
      ),
    resolvedAt,
  });
}

function sourceLabelForCandidate(
  candidate: ResumeImportFieldCandidate,
): string {
  switch (candidate.sourceKind) {
    case "parser_literal":
    case "model_identity_summary":
    case "model_experience":
    case "model_background":
    case "model_shared_memory":
      return "Document text";
    case "vision_omni":
      return "Visual scan";
    case "adjudicator":
      return "Import comparison";
    case "reconciler":
      return "Import reconciliation";
    default: {
      const _exhaustive: never = candidate.sourceKind;
      throw new Error(`Unhandled sourceKind: ${String(_exhaustive)}`);
    }
  }
}

function toConflictChoice(
  candidate: ResumeImportFieldCandidate,
  recommended: boolean,
): ResumeImportConflictChoice {
  const valuePreview =
    candidate.valuePreview ?? buildValuePreview(candidate.value);

  return {
    id: `${candidate.id}_choice`,
    label: candidate.label,
    sourceLabel: sourceLabelForCandidate(candidate),
    value: candidate.value,
    valuePreview,
    evidenceText: candidate.evidenceText,
    confidence: candidateOverallConfidence(candidate),
    recommended,
    notes: candidate.notes,
    sourceCandidateIds: [candidate.id],
    visualEvidence: candidate.visualEvidence ?? [],
  };
}

function hasTextVisionMaterialConflict(
  candidates: readonly ResumeImportFieldCandidate[],
): boolean {
  const hasVision = candidates.some(
    (candidate) => candidate.sourceKind === "vision_omni",
  );
  const hasText = candidates.some(
    (candidate) => sourceLabelForCandidate(candidate) === "Document text",
  );

  if (!hasVision || !hasText) {
    return false;
  }

  const relevantCandidates = candidates.filter(
    (candidate) =>
      candidate.sourceKind === "vision_omni" ||
      sourceLabelForCandidate(candidate) === "Document text",
  );
  const normalizedValues = new Set(
    relevantCandidates.map((candidate) =>
      candidate.target.section === "identity" &&
      candidate.target.key === "fullName" &&
      typeof candidate.value === "string"
        ? candidate.value
            .normalize("NFKD")
            .replace(/\p{M}/gu, "")
            .toLocaleLowerCase()
            .replace(/\s+/g, " ")
            .trim()
        : normalizeText(
            candidate.valuePreview ??
              buildValuePreview(candidate.value) ??
              JSON.stringify(candidate.value),
          ),
    ),
  );
  return normalizedValues.size > 1;
}

function candidateSharesMaterialTextVisionConflict(
  candidate: ResumeImportFieldCandidate,
  candidates: readonly ResumeImportFieldCandidate[],
): boolean {
  const sameTargetCandidates = candidates.filter(
    (other) =>
      stringifyCandidateTarget(other) === stringifyCandidateTarget(candidate),
  );

  return hasTextVisionMaterialConflict(sameTargetCandidates);
}

function isTextVisionWinner(candidate: ResumeImportFieldCandidate): boolean {
  return (
    candidate.resolution === "auto_applied" ||
    candidate.resolution === "needs_review"
  );
}

function applyConflictChoicesToGroup(
  candidates: readonly ResumeImportFieldCandidate[],
  winner: ResumeImportFieldCandidate,
): ResumeImportFieldCandidate[] {
  if (
    !hasTextVisionMaterialConflict(candidates) ||
    candidates.some(
      (candidate) => isRecordTarget(candidate) || isListTarget(candidate),
    )
  ) {
    return [...candidates];
  }

  const recommendedCandidate =
    candidates.find(isStrongLiteralIdentityCandidate) ?? winner;
  if (recommendedCandidate.sourceKind === "adjudicator") {
    return [...candidates];
  }

  const ranked = [...candidates].sort(
    (left, right) => candidateScore(right) - candidateScore(left),
  );
  const choices = ranked.map((candidate) =>
    toConflictChoice(candidate, candidate.id === recommendedCandidate.id),
  );
  const alternativeValues = choices.flatMap((choice) =>
    choice.recommended ? [] : [choice.value],
  );

  return candidates.map((candidate) => {
    if (candidate.id !== recommendedCandidate.id) {
      return candidate;
    }

    return ResumeImportFieldCandidateSchema.parse({
      ...candidate,
      conflictChoices: choices,
      alternatives: alternativeValues,
      resolution: "needs_review",
      resolutionReason: "text_vs_visual_conflict_requires_review",
      resolvedAt: null,
      notes: uniqueStrings([
        ...candidate.notes,
        "Different values were found in document text and visual scan. Review the alternatives before accepting.",
      ]),
    });
  });
}

function appendResolvedConflictGroup(
  resolved: ResumeImportFieldCandidate[],
  groupResolved: readonly ResumeImportFieldCandidate[],
): void {
  const winner = groupResolved.find(isTextVisionWinner) ?? groupResolved[0];
  resolved.push(
    ...(winner
      ? applyConflictChoicesToGroup(groupResolved, winner)
      : groupResolved),
  );
}

function resolveRedundantFreshStartNamePartCandidates(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  if (!isFreshStartCandidateProfile(profile)) {
    return [...candidates];
  }

  const autoAppliedFullName = candidates.find(
    (candidate) =>
      candidate.target.section === "identity" &&
      candidate.target.key === "fullName" &&
      candidate.resolution === "auto_applied" &&
      typeof candidate.value === "string" &&
      isLikelyPersonName(candidate.value),
  );

  if (!autoAppliedFullName || typeof autoAppliedFullName.value !== "string") {
    return [...candidates];
  }

  const derivedNameParts = getDerivedNameParts(autoAppliedFullName.value);

  return candidates.map((candidate) => {
    if (
      candidate.resolution !== "needs_review" ||
      candidate.target.section !== "identity" ||
      typeof candidate.value !== "string"
    ) {
      return candidate;
    }

    const expectedValue = (() => {
      switch (candidate.target.key) {
        case "firstName":
          return derivedNameParts.firstName;
        case "middleName":
          return derivedNameParts.middleName;
        case "lastName":
          return derivedNameParts.lastName;
        default:
          return null;
      }
    })();

    if (
      !expectedValue ||
      normalizeText(candidate.value) !== normalizeText(expectedValue)
    ) {
      return candidate;
    }

    return applyCandidateResolution(
      profile,
      searchPreferences,
      candidate,
      "rejected",
    );
  });
}

export function reconcileCandidates(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  const resolved: ResumeImportFieldCandidate[] = [];
  const normalizedCandidates = candidates.map(
    normalizeRecordCandidateForReconciliation,
  );
  const identityConflicts = findResumeImportIdentityConflicts(
    profile,
    normalizedCandidates,
  );
  const candidatesForGrouping: ResumeImportFieldCandidate[] = [];

  for (const candidate of normalizedCandidates) {
    if (!hasMeaningfulRecordValue(candidate)) {
      resolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          "rejected",
          "empty_record_candidate",
        ),
      );
      continue;
    }

    if (
      candidate.target.key === "phone" &&
      isClearlyResumeDateRange(candidate.value)
    ) {
      resolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          "rejected",
          "invalid_phone_candidate",
        ),
      );
      continue;
    }

    const identityConflict = identityConflicts.get(candidate.id);
    if (
      identityConflict &&
      !candidateSharesMaterialTextVisionConflict(
        candidate,
        normalizedCandidates,
      )
    ) {
      resolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          "needs_review",
          `identity_mismatch_requires_review: ${identityConflict}`,
        ),
      );
      continue;
    }

    if (candidateMatchesWorkspace(profile, searchPreferences, candidate)) {
      resolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          "rejected",
        ),
      );
      continue;
    }

    if (
      isRedundantUnstructuredRecordCandidate(candidate, normalizedCandidates)
    ) {
      resolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          "rejected",
        ),
      );
      continue;
    }

    candidatesForGrouping.push(candidate);
  }

  for (const group of groupCandidatesForReconciliation(candidatesForGrouping)) {
    const sorted = [...group].sort(
      (left, right) => candidateScore(right) - candidateScore(left),
    );

    if (sorted.length === 0) {
      continue;
    }

    const first = sorted[0];
    if (!first) {
      continue;
    }

    if (isRecordTarget(first) || isListTarget(first)) {
      if (isRecordTarget(first)) {
        const rankedByRecord = [...sorted].sort(compareRecordCandidates);
        const rankedGroup = rankedByRecord.map((candidate, index) =>
          index === 0
            ? enrichRecordCandidateFromSiblings(
                candidate,
                rankedByRecord.slice(1),
              )
            : candidate,
        );
        let hasAutoAppliedCollectionCandidate = false;
        const recordGroupResolved: ResumeImportFieldCandidate[] = [];

        rankedGroup.forEach((candidate, index) => {
          const recommendation = recommendationForCandidate(candidate);
          const shouldAutoApplyCollectionCandidate =
            shouldMergeRecordCandidate(profile, candidate) &&
            (!hasAutoAppliedCollectionCandidate ||
              shouldAutoApplyAdditionalFreshStartRecordCandidate(
                profile,
                candidate,
              ));
          const resolution =
            recommendation === "abstain"
              ? "abstained"
              : shouldAutoApplyCollectionCandidate
                ? "auto_applied"
                : index === 0
                  ? "needs_review"
                  : "rejected";

          if (resolution === "auto_applied") {
            hasAutoAppliedCollectionCandidate = true;
          }

          const resolvedCandidate = applyCandidateResolution(
            profile,
            searchPreferences,
            candidate,
            resolution,
          );
          recordGroupResolved.push(resolvedCandidate);
        });
        appendResolvedConflictGroup(resolved, recordGroupResolved);
        continue;
      }

      const listGroupResolved: ResumeImportFieldCandidate[] = [];
      for (const candidate of sorted) {
        const recommendation = recommendationForCandidate(candidate);
        const shouldAutoApplyCollectionCandidate =
          shouldMergeListCandidate(candidate) ||
          shouldAutoApplySkillRecordCandidate(candidate);
        const resolution =
          recommendation === "abstain"
            ? "abstained"
            : shouldAutoApplyCollectionCandidate
              ? "auto_applied"
              : "needs_review";

        const resolvedCandidate = applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          resolution,
        );
        listGroupResolved.push(resolvedCandidate);
      }
      appendResolvedConflictGroup(resolved, listGroupResolved);
      continue;
    }

    const autoApplicableIndex = sorted.findIndex((candidate) =>
      shouldAutoApply(profile, searchPreferences, candidate),
    );
    const winningIndex = autoApplicableIndex === -1 ? 0 : autoApplicableIndex;

    const groupResolved: ResumeImportFieldCandidate[] = [];
    sorted.forEach((candidate, index) => {
      const autoApply = index === winningIndex && autoApplicableIndex !== -1;
      const recommendation = recommendationForCandidate(candidate);

      if (index === winningIndex) {
        groupResolved.push(
          applyCandidateResolution(
            profile,
            searchPreferences,
            candidate,
            autoApply
              ? "auto_applied"
              : recommendation === "abstain"
                ? "abstained"
                : "needs_review",
          ),
        );
        return;
      }

      groupResolved.push(
        applyCandidateResolution(
          profile,
          searchPreferences,
          candidate,
          recommendation === "abstain" ? "abstained" : "rejected",
        ),
      );
    });
    appendResolvedConflictGroup(resolved, groupResolved);
  }

  return promoteImportCandidatesIntoEmptyProfile(
    profile,
    searchPreferences,
    resolveRedundantFreshStartNamePartCandidates(
      profile,
      searchPreferences,
      resolved,
    ),
  );
}
