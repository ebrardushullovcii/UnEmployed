import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type ResumeImportFieldCandidate,
  type ResumeImportRun,
} from "@unemployed/contracts";

import {
  mergeCertificationRecords,
  mergeEducationRecords,
  mergeExperienceRecords,
  mergeLanguageRecords,
  mergeLinkRecords,
  mergeProjectRecords,
  parseLocationParts,
} from "./profile-merge";
import { toStringArray } from "./resume-import-common";
import {
  candidateScore,
  isListTarget,
  isRecordTarget,
  shouldPreferCandidateOverExistingValue,
} from "./resume-import-reconciliation";
import { normalizeText, uniqueStrings } from "./shared";

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

function isProofPointValue(
  value: object,
): value is {
  title?: unknown;
  claim?: unknown;
  heroMetric?: unknown;
  supportingContext?: unknown;
  roleFamilies?: unknown;
  projectIds?: unknown;
  linkIds?: unknown;
} {
  if (value === null || Array.isArray(value)) {
    return false;
  }

  return "title" in value || "claim" in value || "heroMetric" in value;
}

function buildResolvedSelection(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
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
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
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
          if (!isProofPointValue(value)) {
            break;
          }

          if (
            typeof value.title === "string" &&
            value.title.trim().length > 0 &&
            typeof value.claim === "string" &&
            value.claim.trim().length > 0
          ) {
            selection.proofBank.push({
              title: value.title,
              claim: value.claim,
              heroMetric:
                typeof value.heroMetric === "string" ? value.heroMetric : null,
              supportingContext:
                typeof value.supportingContext === "string"
                  ? value.supportingContext
                  : null,
              roleFamilies: toStringArray(value.roleFamilies),
              projectIds: toStringArray(value.projectIds),
              linkIds: toStringArray(value.linkIds),
            } as CandidateProfile["proofBank"][number]);
          }
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

    const existing = scalarCandidates.get(key);

    if (!existing) {
      scalarCandidates.set(key, candidate);
      continue;
    }

    const preferNext = shouldPreferCandidateOverExistingValue(
      profile,
      searchPreferences,
      candidate,
    );
    const preferExisting = shouldPreferCandidateOverExistingValue(
      profile,
      searchPreferences,
      existing,
    );

    if (preferNext && !preferExisting) {
      scalarCandidates.set(key, candidate);
      continue;
    }

    if (preferNext === preferExisting && candidateScore(candidate) > candidateScore(existing)) {
      scalarCandidates.set(key, candidate);
    }
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
      id: match?.id ?? `proof_${index}_${normalizeText(entry.title).replaceAll(" ", "_")}`,
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
  const fullName = selection.scalarFields.fullName ?? profile.fullName;
  const [derivedFirstName, ...remainingNameParts] =
    typeof fullName === "string" ? fullName.trim().split(/\s+/).filter(Boolean) : [];
  const derivedLastName =
    remainingNameParts.length > 0
      ? remainingNameParts[remainingNameParts.length - 1]
      : null;
  const derivedMiddleName =
    remainingNameParts.length > 1
      ? remainingNameParts.slice(0, -1).join(" ")
      : null;
  const locationParts = parseLocationParts(currentLocation);
  const mergedLinks = mergeLinkRecords(profile.links, selection.links);
  const preferredLinkUrls = uniqueStrings(
    selection.scalarFields.applicationIdentity?.preferredLinkUrls ?? [],
  );
  const nextLinkedinUrl =
    selection.scalarFields.linkedinUrl !== undefined
      ? selection.scalarFields.linkedinUrl
      : profile.linkedinUrl;
  const rawPersonalWebsiteUrl =
    selection.scalarFields.personalWebsiteUrl !== undefined
      ? selection.scalarFields.personalWebsiteUrl
      : profile.personalWebsiteUrl;
  const nextPersonalWebsiteUrl =
    nextLinkedinUrl && rawPersonalWebsiteUrl && nextLinkedinUrl === rawPersonalWebsiteUrl
      ? null
      : rawPersonalWebsiteUrl;
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
      firstName:
        selection.scalarFields.firstName ??
        (selection.scalarFields.fullName ? derivedFirstName ?? profile.firstName : profile.firstName),
      lastName:
        selection.scalarFields.lastName ??
        (selection.scalarFields.fullName ? derivedLastName ?? profile.lastName : profile.lastName),
      middleName:
        selection.scalarFields.middleName !== undefined
          ? selection.scalarFields.middleName
          : selection.scalarFields.fullName
            ? derivedMiddleName
            : profile.middleName,
      fullName,
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
      linkedinUrl: nextLinkedinUrl,
      githubUrl:
        selection.scalarFields.githubUrl !== undefined
          ? selection.scalarFields.githubUrl
          : profile.githubUrl,
      personalWebsiteUrl: nextPersonalWebsiteUrl,
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

export function applyResolvedResumeImportCandidatesToWorkspace(input: {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
  candidates: readonly ResumeImportFieldCandidate[];
  analysisProviderKind: ResumeImportRun["analysisProviderKind"];
  analysisProviderLabel: ResumeImportRun["analysisProviderLabel"];
  analysisWarnings: readonly string[];
}) {
  const resolvedSelection = buildResolvedSelection(
    input.profile,
    input.searchPreferences,
    input.candidates,
  );

  return mergeResolvedSelectionIntoWorkspace(
    input.profile,
    input.searchPreferences,
    resolvedSelection,
    input.analysisProviderKind,
    input.analysisProviderLabel,
    input.analysisWarnings,
  );
}
