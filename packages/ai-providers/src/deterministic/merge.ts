import type { ResumeProfileExtraction } from "../shared";
import { ResumeProfileExtractionSchema } from "../shared";
import { uniqueStrings } from "./utils";

function mergeExperienceExtractionEntries(
  primary: readonly ResumeProfileExtraction["experiences"][number][],
  fallback: readonly ResumeProfileExtraction["experiences"][number][],
) {
  if (primary.length === 0) {
    return fallback;
  }

  const matchedFallbackIndices = new Set<number>();
  const merged = primary.map((entry) => {
    let matchIndex = fallback.findIndex((fb, idx) => {
      if (matchedFallbackIndices.has(idx)) return false;
      const titleMatch =
        (entry.title && fb.title && entry.title.toLowerCase() === fb.title.toLowerCase()) ||
        (!entry.title && !fb.title);
      const startMatch =
        (entry.startDate && fb.startDate && entry.startDate === fb.startDate) ||
        (!entry.startDate && !fb.startDate);
      return titleMatch && startMatch;
    });

    if (matchIndex === -1) {
      matchIndex = fallback.findIndex((_, idx) => !matchedFallbackIndices.has(idx));
    }

    if (matchIndex !== -1) {
      matchedFallbackIndices.add(matchIndex);
    }

    const match = matchIndex !== -1 ? fallback[matchIndex] : null;

    return {
      ...entry,
      companyName: entry.companyName ?? match?.companyName ?? null,
      companyUrl: entry.companyUrl ?? match?.companyUrl ?? null,
      location: entry.location ?? match?.location ?? null,
      workMode: entry.workMode ?? match?.workMode ?? null,
      employmentType: entry.employmentType ?? match?.employmentType ?? null,
      endDate: entry.endDate ?? match?.endDate ?? null,
      isCurrent: entry.isCurrent ?? match?.isCurrent ?? false,
      summary: entry.summary ?? match?.summary ?? null,
      achievements: entry.achievements.length > 0 ? entry.achievements : (match?.achievements ?? []),
      skills: entry.skills.length > 0 ? entry.skills : (match?.skills ?? []),
      domainTags: entry.domainTags.length > 0 ? entry.domainTags : (match?.domainTags ?? []),
      peopleManagementScope: entry.peopleManagementScope ?? match?.peopleManagementScope ?? null,
      ownershipScope: entry.ownershipScope ?? match?.ownershipScope ?? null,
    };
  });

  const unmatchedFallback = fallback.filter((_, idx) => !matchedFallbackIndices.has(idx));
  return [...merged, ...unmatchedFallback];
}

function mergeEducationExtractionEntries(
  primary: readonly ResumeProfileExtraction["education"][number][],
  fallback: readonly ResumeProfileExtraction["education"][number][],
) {
  if (primary.length === 0) {
    return fallback;
  }

  const matchedFallbackIndices = new Set<number>();
  const merged = primary.map((entry) => {
    const normalize = (s: string | null) => s?.toLowerCase().trim() ?? "";

    let matchIndex = fallback.findIndex((fb, idx) => {
      if (matchedFallbackIndices.has(idx)) return false;
      return normalize(entry.schoolName) === normalize(fb.schoolName) && normalize(entry.location) === normalize(fb.location);
    });

    if (matchIndex === -1) {
      matchIndex = fallback.findIndex((_, idx) => !matchedFallbackIndices.has(idx));
    }

    if (matchIndex !== -1) {
      matchedFallbackIndices.add(matchIndex);
    }

    const match = matchIndex !== -1 ? fallback[matchIndex] : null;

    return {
      ...entry,
      schoolName: entry.schoolName ?? match?.schoolName ?? null,
      location: entry.location ?? match?.location ?? null,
      summary: entry.summary ?? match?.summary ?? null,
      degree: entry.degree ?? match?.degree ?? null,
      fieldOfStudy: entry.fieldOfStudy ?? match?.fieldOfStudy ?? null,
      startDate: entry.startDate ?? match?.startDate ?? null,
      endDate: entry.endDate ?? match?.endDate ?? null,
    };
  });

  const unmatchedFallback = fallback.filter((_, idx) => !matchedFallbackIndices.has(idx));
  return [...merged, ...unmatchedFallback];
}

function mergeLinkExtractionEntries(
  primary: readonly ResumeProfileExtraction["links"][number][],
  fallback: readonly ResumeProfileExtraction["links"][number][],
) {
  if (primary.length === 0) {
    return fallback;
  }

  const fallbackByUrl = new Map(fallback.map((entry) => [entry.url, entry]));
  const merged = primary.map((entry, index) => {
    const match = fallbackByUrl.get(entry.url) ?? (entry.url != null ? fallback[index] : undefined);

    return {
      ...entry,
      label: entry.label ?? match?.label ?? null,
      url: entry.url ?? match?.url ?? null,
      kind: entry.kind ?? match?.kind ?? null,
    };
  });

  const primaryUrls = new Set(primary.map((entry) => entry.url));
  const unmatchedFallback = fallback.filter((entry) => !primaryUrls.has(entry.url));
  return [...merged, ...unmatchedFallback];
}

function scoreExperienceEntries(entries: readonly ResumeProfileExtraction["experiences"][number][]): number {
  if (entries.length === 0) {
    return 0;
  }

  const total = entries.reduce((score, entry) => {
    return (
      score +
      (entry.companyName ? 2 : 0) +
      (entry.title ? 1 : 0) +
      (entry.location ? 1 : 0) +
      (entry.summary ? 2 : 0) +
      Math.min(entry.achievements.length, 2) +
      Math.min(entry.skills.length, 2)
    );
  }, 0);

  return total / entries.length;
}

function scoreEducationEntries(entries: readonly ResumeProfileExtraction["education"][number][]): number {
  if (entries.length === 0) {
    return 0;
  }

  const total = entries.reduce((score, entry) => {
    return score + (entry.schoolName ? 2 : 0) + (entry.degree ? 1 : 0) + (entry.fieldOfStudy ? 1 : 0);
  }, 0);

  return total / entries.length;
}

function choosePreferredHeadline(primary: string | null, fallback: string | null): string | null {
  if (!primary) {
    return fallback;
  }

  if (primary.length > 60 || primary.includes("|")) {
    return fallback ?? primary;
  }

  return primary;
}

export function completeResumeExtraction(
  primary: ResumeProfileExtraction,
  fallback: ResumeProfileExtraction,
): ResumeProfileExtraction {
  const mergedExperiences = mergeExperienceExtractionEntries(primary.experiences, fallback.experiences);
  const mergedEducation = mergeEducationExtractionEntries(primary.education, fallback.education);
  const useFallbackExperiences = scoreExperienceEntries(primary.experiences) < scoreExperienceEntries(fallback.experiences);
  const useFallbackEducation = scoreEducationEntries(primary.education) < scoreEducationEntries(fallback.education);

  return ResumeProfileExtractionSchema.parse({
    ...primary,
    firstName: primary.firstName ?? fallback.firstName,
    lastName: primary.lastName ?? fallback.lastName,
    middleName: primary.middleName ?? fallback.middleName,
    fullName: primary.fullName ?? fallback.fullName,
    headline: choosePreferredHeadline(primary.headline, fallback.headline),
    summary: primary.summary ?? fallback.summary,
    currentLocation: primary.currentLocation ?? fallback.currentLocation,
    timeZone: primary.timeZone ?? fallback.timeZone,
    salaryCurrency: primary.salaryCurrency ?? fallback.salaryCurrency,
    yearsExperience: primary.yearsExperience ?? fallback.yearsExperience,
    email: primary.email ?? fallback.email,
    phone: primary.phone ?? fallback.phone,
    portfolioUrl: primary.portfolioUrl ?? fallback.portfolioUrl,
    linkedinUrl: primary.linkedinUrl ?? fallback.linkedinUrl,
    githubUrl: primary.githubUrl ?? fallback.githubUrl,
    personalWebsiteUrl: primary.personalWebsiteUrl ?? fallback.personalWebsiteUrl,
    professionalSummary: {
      shortValueProposition:
        primary.professionalSummary.shortValueProposition ?? fallback.professionalSummary.shortValueProposition,
      fullSummary: primary.professionalSummary.fullSummary ?? fallback.professionalSummary.fullSummary,
      careerThemes:
        primary.professionalSummary.careerThemes.length > 0
          ? primary.professionalSummary.careerThemes
          : fallback.professionalSummary.careerThemes,
      leadershipSummary:
        primary.professionalSummary.leadershipSummary ?? fallback.professionalSummary.leadershipSummary,
      domainFocusSummary:
        primary.professionalSummary.domainFocusSummary ?? fallback.professionalSummary.domainFocusSummary,
      strengths:
        primary.professionalSummary.strengths.length > 0
          ? primary.professionalSummary.strengths
          : fallback.professionalSummary.strengths,
    },
    skillGroups: {
      coreSkills:
        primary.skillGroups.coreSkills.length > 0 ? primary.skillGroups.coreSkills : fallback.skillGroups.coreSkills,
      tools: primary.skillGroups.tools.length > 0 ? primary.skillGroups.tools : fallback.skillGroups.tools,
      languagesAndFrameworks:
        primary.skillGroups.languagesAndFrameworks.length > 0
          ? primary.skillGroups.languagesAndFrameworks
          : fallback.skillGroups.languagesAndFrameworks,
      softSkills:
        primary.skillGroups.softSkills.length > 0 ? primary.skillGroups.softSkills : fallback.skillGroups.softSkills,
      highlightedSkills:
        primary.skillGroups.highlightedSkills.length > 0
          ? primary.skillGroups.highlightedSkills
          : fallback.skillGroups.highlightedSkills,
    },
    skills: uniqueStrings([...primary.skills, ...fallback.skills]),
    targetRoles: primary.targetRoles.length > 0 ? primary.targetRoles : fallback.targetRoles,
    preferredLocations:
      primary.preferredLocations.length > 0 ? primary.preferredLocations : fallback.preferredLocations,
    experiences: useFallbackExperiences ? fallback.experiences : mergedExperiences,
    education: useFallbackEducation ? fallback.education : mergedEducation,
    certifications:
      primary.certifications.length > 0 ? primary.certifications : fallback.certifications,
    links: mergeLinkExtractionEntries(primary.links, fallback.links),
    projects: primary.projects.length > 0 ? primary.projects : fallback.projects,
    spokenLanguages:
      primary.spokenLanguages.length > 0 ? primary.spokenLanguages : fallback.spokenLanguages,
    notes: uniqueStrings([...primary.notes, ...fallback.notes]),
  });
}
