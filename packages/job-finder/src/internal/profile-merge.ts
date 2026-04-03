import type { ResumeProfileExtraction, TailoredResumeDraft } from "@unemployed/ai-providers";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
  type CandidateProfile,
  type JobSearchPreferences,
  type SavedJob,
} from "@unemployed/contracts";
import { normalizeText, uniqueStrings } from "./shared";

export function buildTailoredResumeText(
  profile: CandidateProfile,
  job: SavedJob,
  previewSections: Array<{ heading: string; lines: string[] }>,
): string {
  const sections = previewSections
    .map(
      (section) => `${section.heading}
${section.lines.join("\n")}`,
    )
    .join("\n\n");

  return `${profile.fullName}\n${profile.headline}\n${profile.currentLocation}\n\nTarget Role: ${job.title} at ${job.company}\n\n${sections}\n`;
}

export function buildPreviewSectionsFromDraft(draft: TailoredResumeDraft) {
  return [
    {
      heading: "Summary",
      lines: [draft.summary],
    },
    {
      heading: "Experience Highlights",
      lines: [...draft.experienceHighlights],
    },
    {
      heading: "Core Skills",
      lines: [...draft.coreSkills],
    },
    {
      heading: "Targeted Keywords",
      lines: [...draft.targetedKeywords],
    },
  ].filter((section) => section.lines.length > 0);
}

export function normalizeProfileBeforeSave(
  currentProfile: CandidateProfile,
  nextProfile: CandidateProfile,
): CandidateProfile {
  const resumeChanged =
    currentProfile.baseResume.id !== nextProfile.baseResume.id ||
    currentProfile.baseResume.storagePath !==
      nextProfile.baseResume.storagePath ||
    currentProfile.baseResume.textContent !==
      nextProfile.baseResume.textContent;

  if (!resumeChanged) {
    return CandidateProfileSchema.parse(nextProfile);
  }

  const nextResumeText = nextProfile.baseResume.textContent;

  return CandidateProfileSchema.parse({
    ...nextProfile,
    baseResume: {
      ...nextProfile.baseResume,
      textUpdatedAt: nextResumeText ? new Date().toISOString() : null,
      extractionStatus: nextResumeText ? "not_started" : "needs_text",
      lastAnalyzedAt: null,
      analysisWarnings: [],
    },
  });
}

export function buildExtractionId(
  prefix: string,
  index: number,
  parts: ReadonlyArray<string | null | undefined>,
): string {
  const slug = parts
    .map((part) => normalizeText(part ?? "").replaceAll(" ", "_"))
    .filter(Boolean)
    .join("_")
    .slice(0, 48);

  return `${prefix}_${slug || index + 1}`;
}

export function normalizeRecordKey(
  parts: ReadonlyArray<string | null | undefined>,
): string {
  return parts
    .map((part) => normalizeText(part ?? ""))
    .filter(Boolean)
    .join("|");
}

export function toValidUrlOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export function parseLocationParts(location: string | null | undefined): {
  currentCity: string | null;
  currentRegion: string | null;
  currentCountry: string | null;
} {
  if (!location) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null,
    };
  }

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      currentCity: null,
      currentRegion: null,
      currentCountry: null,
    };
  }

  if (parts.length === 1) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: null,
      currentCountry: null,
    };
  }

  if (parts.length === 2) {
    return {
      currentCity: parts[0] ?? null,
      currentRegion: parts[1] ?? null,
      currentCountry: null,
    };
  }

  return {
    currentCity: parts[0] ?? null,
    currentRegion: parts[1] ?? null,
    currentCountry: parts[parts.length - 1] ?? null,
  };
}

export function mergeExperienceRecords(
  existing: CandidateProfile["experiences"],
  extracted: ResumeProfileExtraction["experiences"],
): CandidateProfile["experiences"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [
      normalizeRecordKey([entry.companyName, entry.title, entry.startDate]),
      entry,
    ]),
  );

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([
      entry.companyName,
      entry.title,
      entry.startDate,
    ]);
    const match = existingByKey.get(key);

    return {
      id:
        match?.id ??
        buildExtractionId("experience", index, [
          entry.companyName,
          entry.title,
          entry.startDate,
        ]),
      companyName: entry.companyName,
      companyUrl: entry.companyUrl,
      title: entry.title,
      employmentType: entry.employmentType,
      location: entry.location,
      workMode: entry.workMode ? [entry.workMode] : [],
      startDate: entry.startDate,
      endDate: entry.endDate,
      isCurrent: entry.isCurrent,
      isDraft: !entry.companyName && !entry.title,
      summary: entry.summary,
      achievements: uniqueStrings(entry.achievements),
      skills: uniqueStrings(entry.skills),
      domainTags: uniqueStrings(entry.domainTags),
      peopleManagementScope: entry.peopleManagementScope,
      ownershipScope: entry.ownershipScope,
    };
  });
}

export function mergeEducationRecords(
  existing: CandidateProfile["education"],
  extracted: ResumeProfileExtraction["education"],
): CandidateProfile["education"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [
      normalizeRecordKey([entry.schoolName, entry.degree, entry.startDate]),
      entry,
    ]),
  );

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([
      entry.schoolName,
      entry.degree,
      entry.startDate,
    ]);
    const match = existingByKey.get(key);

    return {
      id:
        match?.id ??
        buildExtractionId("education", index, [
          entry.schoolName,
          entry.degree,
          entry.startDate,
        ]),
      schoolName: entry.schoolName,
      degree: entry.degree,
      fieldOfStudy: entry.fieldOfStudy,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      isDraft: !entry.schoolName,
      summary: entry.summary,
    };
  });
}

export function mergeCertificationRecords(
  existing: CandidateProfile["certifications"],
  extracted: ResumeProfileExtraction["certifications"],
): CandidateProfile["certifications"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [
      normalizeRecordKey([entry.name, entry.issuer, entry.issueDate]),
      entry,
    ]),
  );

  return extracted.map((entry, index) => {
    const key = normalizeRecordKey([entry.name, entry.issuer, entry.issueDate]);
    const match = existingByKey.get(key);

    return {
      id:
        match?.id ??
        buildExtractionId("certification", index, [
          entry.name,
          entry.issuer,
          entry.issueDate,
        ]),
      name: entry.name,
      issuer: entry.issuer,
      issueDate: entry.issueDate,
      expiryDate: entry.expiryDate,
      credentialUrl: toValidUrlOrNull(entry.credentialUrl),
      isDraft: !entry.name,
    };
  });
}

export function mergeLinkRecords(
  existing: CandidateProfile["links"],
  extracted: ResumeProfileExtraction["links"],
): CandidateProfile["links"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.url]), entry]),
  );
  const nextLinks: CandidateProfile["links"] = [];

  extracted.forEach((entry, index) => {
    const url = toValidUrlOrNull(entry.url);

    if (!url) {
      return;
    }

    const key = normalizeRecordKey([url]);
    const match = existingByKey.get(key);

    nextLinks.push({
      id: match?.id ?? buildExtractionId("link", index, [entry.label, url]),
      label: entry.label,
      url,
      kind: entry.kind,
      isDraft: !entry.label || !url,
    });
  });

  return nextLinks.length === 0 ? existing : nextLinks;
}

export function mergeProjectRecords(
  existing: CandidateProfile["projects"],
  extracted: ResumeProfileExtraction["projects"],
): CandidateProfile["projects"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [
      normalizeRecordKey([entry.name, entry.role]),
      entry,
    ]),
  );

  const nextProjects = extracted
    .map((entry, index) => {
      if (!entry.name) {
        return null;
      }

      const key = normalizeRecordKey([entry.name, entry.role]);
      const match = existingByKey.get(key);

      return {
        id:
          match?.id ??
          buildExtractionId("project", index, [entry.name, entry.role]),
        name: entry.name,
        projectType: entry.projectType,
        summary: entry.summary,
        role: entry.role,
        skills: uniqueStrings(entry.skills),
        outcome: entry.outcome,
        projectUrl: entry.projectUrl,
        repositoryUrl: entry.repositoryUrl,
        caseStudyUrl: entry.caseStudyUrl,
      };
    })
    .filter(
      (entry): entry is CandidateProfile["projects"][number] => entry !== null,
    );

  return nextProjects.length === 0 ? existing : nextProjects;
}

export function mergeLanguageRecords(
  existing: CandidateProfile["spokenLanguages"],
  extracted: ResumeProfileExtraction["spokenLanguages"],
): CandidateProfile["spokenLanguages"] {
  if (extracted.length === 0) {
    return existing;
  }

  const existingByKey = new Map(
    existing.map((entry) => [normalizeRecordKey([entry.language]), entry]),
  );

  const nextLanguages = extracted
    .map((entry, index) => {
      if (!entry.language) {
        return null;
      }

      const key = normalizeRecordKey([entry.language]);
      const match = existingByKey.get(key);

      return {
        id: match?.id ?? buildExtractionId("language", index, [entry.language]),
        language: entry.language,
        proficiency: entry.proficiency,
        interviewPreference: entry.interviewPreference,
        notes: entry.notes,
      };
    })
    .filter(
      (entry): entry is CandidateProfile["spokenLanguages"][number] =>
        entry !== null,
    );

  return nextLanguages.length === 0 ? existing : nextLanguages;
}

export function mergeResumeExtractionIntoWorkspace(
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
  extraction: ResumeProfileExtraction,
): {
  profile: CandidateProfile;
  searchPreferences: JobSearchPreferences;
} {
  const profileTargetRoles =
    extraction.targetRoles.length > 0
      ? uniqueStrings(extraction.targetRoles)
      : profile.targetRoles;
  const locationFallback =
    extraction.currentLocation ?? profile.currentLocation;
  const profileLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : profile.locations.length > 0
        ? profile.locations
        : uniqueStrings([locationFallback]);
  const preferenceLocations =
    extraction.preferredLocations.length > 0
      ? uniqueStrings(extraction.preferredLocations)
      : searchPreferences.locations.length > 0
        ? searchPreferences.locations
        : profileLocations;
  const locationParts = parseLocationParts(
    extraction.currentLocation ?? profile.currentLocation,
  );
  const mergedSkills = uniqueStrings([
    ...extraction.skills,
    ...extraction.skillGroups.coreSkills,
    ...extraction.skillGroups.tools,
    ...extraction.skillGroups.languagesAndFrameworks,
    ...extraction.skillGroups.highlightedSkills,
    ...extraction.skillGroups.softSkills,
  ]);

  return {
    profile: CandidateProfileSchema.parse({
      ...profile,
      firstName: extraction.firstName ?? profile.firstName,
      lastName: extraction.lastName ?? profile.lastName,
      middleName: extraction.middleName ?? profile.middleName,
      fullName: extraction.fullName ?? profile.fullName,
      headline: extraction.headline ?? profile.headline,
      summary: extraction.summary ?? profile.summary,
      currentLocation: extraction.currentLocation ?? profile.currentLocation,
      currentCity: locationParts.currentCity ?? profile.currentCity,
      currentRegion: locationParts.currentRegion ?? profile.currentRegion,
      currentCountry: locationParts.currentCountry ?? profile.currentCountry,
      timeZone: extraction.timeZone ?? profile.timeZone,
      yearsExperience: extraction.yearsExperience ?? profile.yearsExperience,
      email: extraction.email,
      phone: extraction.phone,
      portfolioUrl: extraction.portfolioUrl,
      linkedinUrl: extraction.linkedinUrl,
      githubUrl: extraction.githubUrl ?? profile.githubUrl,
      personalWebsiteUrl:
        extraction.personalWebsiteUrl ?? profile.personalWebsiteUrl,
      professionalSummary: {
        ...profile.professionalSummary,
        shortValueProposition:
          extraction.professionalSummary.shortValueProposition ??
          profile.professionalSummary.shortValueProposition,
        fullSummary:
          extraction.professionalSummary.fullSummary ??
          extraction.summary ??
          profile.professionalSummary.fullSummary,
        careerThemes:
          extraction.professionalSummary.careerThemes.length > 0
            ? uniqueStrings(extraction.professionalSummary.careerThemes)
            : profile.professionalSummary.careerThemes,
        leadershipSummary:
          extraction.professionalSummary.leadershipSummary ??
          profile.professionalSummary.leadershipSummary,
        domainFocusSummary:
          extraction.professionalSummary.domainFocusSummary ??
          profile.professionalSummary.domainFocusSummary,
        strengths:
          extraction.professionalSummary.strengths.length > 0
            ? uniqueStrings(extraction.professionalSummary.strengths)
            : profile.professionalSummary.strengths,
      },
      skillGroups: {
        coreSkills:
          extraction.skillGroups.coreSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.coreSkills)
            : profile.skillGroups.coreSkills,
        tools:
          extraction.skillGroups.tools.length > 0
            ? uniqueStrings(extraction.skillGroups.tools)
            : profile.skillGroups.tools,
        languagesAndFrameworks:
          extraction.skillGroups.languagesAndFrameworks.length > 0
            ? uniqueStrings(extraction.skillGroups.languagesAndFrameworks)
            : profile.skillGroups.languagesAndFrameworks,
        softSkills:
          extraction.skillGroups.softSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.softSkills)
            : profile.skillGroups.softSkills,
        highlightedSkills:
          extraction.skillGroups.highlightedSkills.length > 0
            ? uniqueStrings(extraction.skillGroups.highlightedSkills)
            : profile.skillGroups.highlightedSkills,
      },
      targetRoles: profileTargetRoles,
      locations: profileLocations,
      skills: mergedSkills.length > 0 ? mergedSkills : profile.skills,
      experiences: mergeExperienceRecords(
        profile.experiences,
        extraction.experiences,
      ),
      education: mergeEducationRecords(profile.education, extraction.education),
      certifications: mergeCertificationRecords(
        profile.certifications,
        extraction.certifications,
      ),
      links: mergeLinkRecords(profile.links, extraction.links),
      projects: mergeProjectRecords(profile.projects, extraction.projects),
      spokenLanguages: mergeLanguageRecords(
        profile.spokenLanguages,
        extraction.spokenLanguages,
      ),
      baseResume: {
        ...profile.baseResume,
        extractionStatus: "ready",
        lastAnalyzedAt: new Date().toISOString(),
        analysisProviderKind: extraction.analysisProviderKind,
        analysisProviderLabel: extraction.analysisProviderLabel,
        analysisWarnings: uniqueStrings(extraction.notes),
      },
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      ...searchPreferences,
      targetRoles:
        extraction.targetRoles.length > 0
          ? uniqueStrings(extraction.targetRoles)
          : searchPreferences.targetRoles.length > 0
            ? searchPreferences.targetRoles
            : profileTargetRoles,
      locations: preferenceLocations,
      salaryCurrency:
        extraction.salaryCurrency ?? searchPreferences.salaryCurrency,
    }),
  };
}

