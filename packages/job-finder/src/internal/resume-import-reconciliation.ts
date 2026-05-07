import { buildValuePreview } from "@unemployed/ai-providers";
import { ResumeImportFieldCandidateSchema, type CandidateProfile, type JobSearchPreferences, type ResumeImportConflictChoice, type ResumeImportFieldCandidate } from "@unemployed/contracts";

import {
  areEquivalentRecordCandidates,
  isObject,
  stringifyCandidateTarget,
  toStringArray,
} from "./resume-import-common";
import {
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
  const deterministicFallbackBonus = candidate.notes.includes("deterministic_stage_fallback")
    ? 0.03
    : 0;
  const evidenceBonus = candidate.sourceBlockIds.length > 0 ? 0.01 : 0;
  const recommendationBonus =
    candidate.confidenceBreakdown?.recommendation === "auto_apply"
      ? 0.03
      : candidate.confidenceBreakdown?.recommendation === "abstain"
        ? -0.05
        : 0;
  return candidate.confidence + sourceBonus + deterministicFallbackBonus + evidenceBonus + recommendationBonus;
}

function candidateOverallConfidence(candidate: ResumeImportFieldCandidate): number {
  return candidate.confidenceBreakdown?.overall ?? candidate.confidence;
}

function recommendationForCandidate(
  candidate: ResumeImportFieldCandidate,
): NonNullable<ResumeImportFieldCandidate["confidenceBreakdown"]>["recommendation"] {
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
    case "search_preferences.salaryCurrency":
      return searchPreferences.salaryCurrency;
    default:
      return undefined;
  }
}

function isFreshStartProfile(profile: CandidateProfile): boolean {
  return (
    profile.id === "candidate_fresh_start" ||
    (normalizeText(profile.firstName) === "new" &&
      normalizeText(profile.lastName) === "candidate" &&
      normalizeText(profile.fullName) === "new candidate" &&
      normalizeText(profile.headline) === normalizeText(PROFILE_PLACEHOLDER_HEADLINE) &&
      normalizeText(profile.currentLocation) === normalizeText(PROFILE_PLACEHOLDER_LOCATION))
  );
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
      isFreshStartProfile(profile)
    );
  }

  if (typeof currentValue !== "string") {
    return false;
  }

  switch (candidate.target.key) {
    case "firstName":
      return isFreshStartProfile(profile) && normalizeText(currentValue) === "new";
    case "lastName":
      return (
        isFreshStartProfile(profile) && normalizeText(currentValue) === "candidate"
      );
    case "fullName":
      return isFreshStartProfile(profile) && normalizeText(currentValue) === "new candidate";
    case "headline":
      return isFreshStartProfile(profile) && currentValue === PROFILE_PLACEHOLDER_HEADLINE;
    case "summary":
      return isFreshStartProfile(profile) && currentValue === PROFILE_PLACEHOLDER_SUMMARY;
    case "currentLocation":
      return isFreshStartProfile(profile) && currentValue === PROFILE_PLACEHOLDER_LOCATION;
    default:
      return false;
  }
}

function scalarValueConflictsWithWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const currentValue = existingScalarValueForCandidate(profile, searchPreferences, candidate);

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

export function shouldPreferCandidateOverExistingValue(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  const currentValue = existingScalarValueForCandidate(profile, searchPreferences, candidate);

  if (currentValue === undefined || currentValue === null) {
    return true;
  }

  if (isPlaceholderScalarValue(profile, candidate, currentValue)) {
    return true;
  }

  if (candidate.sourceKind === "parser_literal" && hasSufficientEvidence(candidate)) {
    if (typeof currentValue === "string" && typeof candidate.value === "string") {
      return normalizeText(currentValue) !== normalizeText(candidate.value);
    }

    return currentValue !== candidate.value;
  }

  return !scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate);
}

function normalizeRecordCandidateValue(
  candidate: ResumeImportFieldCandidate,
): ResumeImportFieldCandidate["value"] {
  if (!isObject(candidate.value)) {
    return candidate.value;
  }

  switch (candidate.target.section) {
    case "experience": {
      const value = candidate.value;
      return {
        companyName:
          typeof value.companyName === "string" ? value.companyName : null,
        companyUrl:
          typeof value.companyUrl === "string" ? value.companyUrl : null,
        title: typeof value.title === "string" ? value.title : null,
        employmentType:
          typeof value.employmentType === "string" ? value.employmentType : null,
        location: typeof value.location === "string" ? value.location : null,
        workMode: toStringArray(value.workMode),
        startDate: typeof value.startDate === "string" ? value.startDate : null,
        endDate: typeof value.endDate === "string" ? value.endDate : null,
        isCurrent: value.isCurrent === true,
        summary: typeof value.summary === "string" ? value.summary : null,
        achievements: toStringArray(value.achievements),
        skills: toStringArray(value.skills),
        domainTags: toStringArray(value.domainTags),
        peopleManagementScope:
          typeof value.peopleManagementScope === "string"
            ? value.peopleManagementScope
            : null,
        ownershipScope:
          typeof value.ownershipScope === "string" ? value.ownershipScope : null,
      };
    }
    case "education": {
      const value = candidate.value;
      return {
        schoolName:
          typeof value.schoolName === "string" ? value.schoolName : null,
        degree: typeof value.degree === "string" ? value.degree : null,
        fieldOfStudy:
          typeof value.fieldOfStudy === "string" ? value.fieldOfStudy : null,
        location: typeof value.location === "string" ? value.location : null,
        startDate: typeof value.startDate === "string" ? value.startDate : null,
        endDate: typeof value.endDate === "string" ? value.endDate : null,
        summary: typeof value.summary === "string" ? value.summary : null,
      };
    }
    case "certification": {
      const value = candidate.value;
      return {
        name: typeof value.name === "string" ? value.name : null,
        issuer: typeof value.issuer === "string" ? value.issuer : null,
        issueDate: typeof value.issueDate === "string" ? value.issueDate : null,
        expiryDate: typeof value.expiryDate === "string" ? value.expiryDate : null,
        credentialUrl:
          typeof value.credentialUrl === "string" ? value.credentialUrl : null,
      };
    }
    case "link": {
      const value = candidate.value;
      return {
        label: typeof value.label === "string" ? value.label : null,
        url: typeof value.url === "string" ? value.url : null,
        kind: typeof value.kind === "string" ? value.kind : null,
      };
    }
    case "project": {
      const value = candidate.value;
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
      const value = candidate.value;
      return {
        language: typeof value.language === "string" ? value.language : null,
        proficiency:
          typeof value.proficiency === "string" ? value.proficiency : null,
        interviewPreference: value.interviewPreference === true,
        notes: typeof value.notes === "string" ? value.notes : null,
      };
    }
    case "proof_point": {
      const value = candidate.value;
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

function isAutoApplyLiteralField(candidate: ResumeImportFieldCandidate): boolean {
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

  return trimmed.length > 0 && /^[A-Z][A-Za-z.'-]*$/.test(trimmed);
}

function shouldAutoApplyPlaceholderReplacement(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (!isFreshStartProfile(profile)) {
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

  const currentValue = existingScalarValueForCandidate(profile, searchPreferences, candidate);

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
      return typeof candidate.value === "string" && isLikelyPersonNamePart(candidate.value) && overall >= 0.8;
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
      return typeof candidate.value === "number" && candidate.value > 0 && overall >= 0.75;
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
  if (!scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate)) {
    return true;
  }

  return (
    candidate.sourceKind === "parser_literal" &&
    isAutoApplyLiteralField(candidate) &&
    hasSufficientEvidence(candidate)
  );
}

function isLikelyPersonName(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 48) {
    return false;
  }

  if (/[@\d]|https?:\/\//i.test(trimmed)) {
    return false;
  }

  if (/(about me|about|summary|profile|skills|experience|education|language skills|work experience)/i.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.length <= 4 &&
    /^[A-Za-z][A-Za-z\s.'-]+$/.test(trimmed) &&
    parts.every((part) => /^[A-Z][A-Za-z.'-]*$/.test(part) || /^[A-Z]{2,}$/.test(part))
  );
}

function isStrongLiteralIdentityCandidate(candidate: ResumeImportFieldCandidate): boolean {
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
  const cleaned = value.trim().replace(/^Address:\s*/i, "").replace(/\s*\([^)]*\)\s*$/u, "").trim();

  if (!cleaned || cleaned.length > 80) {
    return false;
  }

  if (/[@]|https?:\/\//i.test(cleaned)) {
    return false;
  }

  if (/[.!?]/.test(cleaned)) {
    return false;
  }

  if (/\b(recently|decided|return|passion|experience|building|driven|improving)\b/i.test(cleaned)) {
    return false;
  }

  return (
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(cleaned) ||
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(cleaned) ||
    /^[A-Za-z][A-Za-z\s.'-]+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(cleaned)
  );
}

export function isListTarget(candidate: ResumeImportFieldCandidate): boolean {
  if (candidate.target.section === "skill" && candidate.target.key === "record") {
    return true;
  }

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

function shouldAutoApply(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (shouldAutoApplyPlaceholderReplacement(profile, searchPreferences, candidate)) {
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

  if (!canAutoApplyDespiteWorkspaceConflict(profile, searchPreferences, candidate)) {
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
        typeof value.companyName === "string" && value.companyName.trim().length > 0;
      const hasTitle = typeof value.title === "string" && value.title.trim().length > 0;
      const hasDates =
        (typeof value.startDate === "string" && value.startDate.trim().length > 0) ||
        (typeof value.endDate === "string" && value.endDate.trim().length > 0) ||
        value.isCurrent === true;
      const completeness = scoreExperienceRecordCompleteness(candidate.value);
      const hasSubstantiveDetails =
        (typeof value.summary === "string" && value.summary.trim().length >= 24) ||
        toStringArray(value.achievements).length > 0 ||
        toStringArray(value.skills).length > 0;
      const requiredCompleteness = hasDates
        ? hasSubstantiveDetails ? 4 : 5
        : 3;
      const requiredOverall = hasDates && hasSubstantiveDetails ? 0.68 : 0.72;

      return (
        isFreshStartProfile(profile) &&
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
        typeof value.schoolName === "string" && value.schoolName.trim().length > 0;
      const hasDegree = typeof value.degree === "string" && value.degree.trim().length > 0;
      const hasField =
        typeof value.fieldOfStudy === "string" && value.fieldOfStudy.trim().length > 0;
      const completeness = scoreEducationRecordCompleteness(candidate.value);

      return (
        isFreshStartProfile(profile) &&
        hasSchool &&
        (hasDegree || hasField) &&
        completeness >= 2 &&
        overall >= 0.62 &&
        hasSufficientEvidence(candidate)
      );
    }
    case "certification": {
      const value = candidate.value;
      const hasName = typeof value.name === "string" && value.name.trim().length > 0;
      return hasName && overall >= 0.6 && hasSufficientEvidence(candidate);
    }
    case "link": {
      const value = candidate.value;
      const hasUrl = typeof value.url === "string" && value.url.trim().length > 0;
      return hasUrl && overall >= 0.72 && hasSufficientEvidence(candidate);
    }
    case "project": {
      const value = candidate.value;
      const hasName = typeof value.name === "string" && value.name.trim().length > 0;
      return hasName && overall >= 0.58 && hasSufficientEvidence(candidate);
    }
    case "language": {
      const value = candidate.value;
      const hasLanguage = typeof value.language === "string" && value.language.trim().length > 0;
      return hasLanguage && overall >= 0.7 && hasSufficientEvidence(candidate);
    }
    case "proof_point": {
      const value = candidate.value;
      const hasTitle = typeof value.title === "string" && value.title.trim().length > 0;
      const hasClaim = typeof value.claim === "string" && value.claim.trim().length > 0;
      return hasTitle && hasClaim && overall >= 0.88 && hasSufficientEvidence(candidate);
    }
    default:
      return false;
  }
}

function shouldAutoApplyAdditionalFreshStartRecordCandidate(
  profile: CandidateProfile,
  candidate: ResumeImportFieldCandidate,
): boolean {
  if (!isFreshStartProfile(profile) || !isRecordTarget(candidate) || !isObject(candidate.value)) {
    return false;
  }

  if (candidate.target.section !== "experience") {
    return false;
  }

  const value = candidate.value;
  const hasCompany = typeof value.companyName === "string" && value.companyName.trim().length > 0;
  const hasTitle = typeof value.title === "string" && value.title.trim().length > 0;
  const hasDates =
    (typeof value.startDate === "string" && value.startDate.trim().length > 0) ||
    (typeof value.endDate === "string" && value.endDate.trim().length > 0) ||
    value.isCurrent === true;
  const hasSubstantiveDetails =
    (typeof value.summary === "string" && value.summary.trim().length >= 24) ||
    toStringArray(value.achievements).length > 0 ||
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

function shouldMergeListCandidate(candidate: ResumeImportFieldCandidate): boolean {
  if (candidate.target.section === "skill" && candidate.target.key === "record") {
    return false;
  }

  if (!isListTarget(candidate)) {
    return false;
  }

  const values = toStringArray(candidate.value);
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

function shouldAutoApplySkillRecordCandidate(candidate: ResumeImportFieldCandidate): boolean {
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
    recordCandidateCompletenessScore(right) - recordCandidateCompletenessScore(left);
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
        group.some((existing) => areEquivalentRecordCandidates(existing, candidate)),
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
      return scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate)
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

      if (scalarValueConflictsWithWorkspace(profile, searchPreferences, candidate)) {
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
): ResumeImportFieldCandidate {
  const resolvedAt = resolution === "auto_applied" ? new Date().toISOString() : null;
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
    resolutionReason: resolutionReasonForCandidate(
      profile,
      searchPreferences,
      candidate,
      resolution,
    ),
    resolvedAt,
  });
}

function sourceLabelForCandidate(candidate: ResumeImportFieldCandidate): string {
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
  }
}

function toConflictChoice(
  candidate: ResumeImportFieldCandidate,
  recommended: boolean,
): ResumeImportConflictChoice {
  const valuePreview = candidate.valuePreview ?? buildValuePreview(candidate.value);

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
  const hasVision = candidates.some((candidate) => candidate.sourceKind === "vision_omni");
  const hasText = candidates.some((candidate) => sourceLabelForCandidate(candidate) === "Document text");

  if (!hasVision || !hasText) {
    return false;
  }

  const normalizedValues = new Set(
    candidates.map((candidate) =>
      normalizeText(candidate.valuePreview ?? buildValuePreview(candidate.value) ?? JSON.stringify(candidate.value)),
    ),
  );
  return normalizedValues.size > 1;
}

function isTextVisionWinner(candidate: ResumeImportFieldCandidate): boolean {
  return candidate.resolution === "auto_applied" || candidate.resolution === "needs_review";
}

function applyConflictChoicesToGroup(
  candidates: readonly ResumeImportFieldCandidate[],
  winner: ResumeImportFieldCandidate,
): ResumeImportFieldCandidate[] {
  if (
    !hasTextVisionMaterialConflict(candidates) ||
    candidates.some((candidate) => isRecordTarget(candidate) || isListTarget(candidate))
  ) {
    return [...candidates];
  }

  const recommendedCandidate = candidates.find(isStrongLiteralIdentityCandidate) ?? winner;
  if (recommendedCandidate.sourceKind === "adjudicator") {
    return [...candidates];
  }

  const ranked = [...candidates].sort((left, right) => candidateScore(right) - candidateScore(left));
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
  resolved.push(...(winner ? applyConflictChoicesToGroup(groupResolved, winner) : groupResolved));
}

function resolveRedundantFreshStartNamePartCandidates(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  candidates: readonly ResumeImportFieldCandidate[],
): ResumeImportFieldCandidate[] {
  if (!isFreshStartProfile(profile)) {
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

    if (!expectedValue || normalizeText(candidate.value) !== normalizeText(expectedValue)) {
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

  for (const group of groupCandidatesForReconciliation(candidates)) {
    const sorted = [...group].sort((left, right) => candidateScore(right) - candidateScore(left));

    if (sorted.length === 0) {
      continue;
    }

    const first = sorted[0];
    if (!first) {
      continue;
    }

    if (isRecordTarget(first) || isListTarget(first)) {
      if (isRecordTarget(first)) {
        const rankedGroup = [...sorted].sort(compareRecordCandidates);
        let hasAutoAppliedCollectionCandidate = false;

        rankedGroup.forEach((candidate, index) => {
          const recommendation = recommendationForCandidate(candidate);
          const shouldAutoApplyCollectionCandidate =
            shouldMergeRecordCandidate(profile, candidate) &&
            (!hasAutoAppliedCollectionCandidate ||
              shouldAutoApplyAdditionalFreshStartRecordCandidate(profile, candidate));
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
          resolved.push(resolvedCandidate);
        });
        const lastGroup = resolved.splice(resolved.length - rankedGroup.length, rankedGroup.length);
        appendResolvedConflictGroup(resolved, lastGroup);
        continue;
      }

      for (const candidate of sorted) {
        const recommendation = recommendationForCandidate(candidate);
        const shouldAutoApplyCollectionCandidate =
          shouldMergeListCandidate(candidate) || shouldAutoApplySkillRecordCandidate(candidate);
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
        resolved.push(resolvedCandidate);
      }
      const lastGroup = resolved.splice(resolved.length - sorted.length, sorted.length);
      appendResolvedConflictGroup(resolved, lastGroup);
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

  return resolveRedundantFreshStartNamePartCandidates(
    profile,
    searchPreferences,
    resolved,
  );
}
