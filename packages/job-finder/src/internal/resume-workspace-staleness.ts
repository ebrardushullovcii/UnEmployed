import {
  ResumeDraftSchema,
  type CandidateProfile,
  type JobFinderSettings,
  type ResumeDraft,
  type SavedJob,
} from "@unemployed/contracts";

function toProfileResumeStalenessSignature(profile: CandidateProfile) {
  return {
    fullName: profile.fullName,
    preferredDisplayName: profile.preferredDisplayName,
    headline: profile.headline,
    summary: profile.summary,
    currentLocation: profile.currentLocation,
    currentCity: profile.currentCity,
    currentRegion: profile.currentRegion,
    currentCountry: profile.currentCountry,
    timeZone: profile.timeZone,
    yearsExperience: profile.yearsExperience,
    email: profile.email,
    secondaryEmail: profile.secondaryEmail,
    phone: profile.phone,
    portfolioUrl: profile.portfolioUrl,
    linkedinUrl: profile.linkedinUrl,
    githubUrl: profile.githubUrl,
    personalWebsiteUrl: profile.personalWebsiteUrl,
    workEligibility: profile.workEligibility,
    professionalSummary: profile.professionalSummary,
    skillGroups: profile.skillGroups,
    targetRoles: profile.targetRoles,
    locations: profile.locations,
    skills: profile.skills,
    experiences: profile.experiences,
    education: profile.education,
    certifications: profile.certifications,
    links: profile.links,
    projects: profile.projects,
    spokenLanguages: profile.spokenLanguages,
    baseResume: {
      id: profile.baseResume.id,
      fileName: profile.baseResume.fileName,
      storagePath: profile.baseResume.storagePath,
      textContent: profile.baseResume.textContent,
      textUpdatedAt: profile.baseResume.textUpdatedAt,
    },
  };
}

function toSettingsResumeStalenessSignature(settings: JobFinderSettings) {
  return {
    resumeFormat: settings.resumeFormat,
    resumeTemplateId: settings.resumeTemplateId,
    fontPreset: settings.fontPreset,
  };
}

function toJobResumeStalenessSignature(job: SavedJob) {
  return {
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    salaryText: job.salaryText,
    summary: job.summary,
    description: job.description,
    keySkills: job.keySkills,
    responsibilities: job.responsibilities,
    minimumQualifications: job.minimumQualifications,
    preferredQualifications: job.preferredQualifications,
    seniority: job.seniority,
    employmentType: job.employmentType,
    department: job.department,
    team: job.team,
    employerWebsiteUrl: job.employerWebsiteUrl,
    employerDomain: job.employerDomain,
    benefits: job.benefits,
  };
}

export function hasResumeAffectingProfileChange(
  currentProfile: CandidateProfile,
  nextProfile: CandidateProfile,
): boolean {
  return (
    JSON.stringify(toProfileResumeStalenessSignature(currentProfile)) !==
    JSON.stringify(toProfileResumeStalenessSignature(nextProfile))
  );
}

export function hasResumeAffectingSettingsChange(
  currentSettings: JobFinderSettings,
  nextSettings: JobFinderSettings,
): boolean {
  return (
    JSON.stringify(toSettingsResumeStalenessSignature(currentSettings)) !==
    JSON.stringify(toSettingsResumeStalenessSignature(nextSettings))
  );
}

export function hasResumeAffectingJobChange(
  currentJob: SavedJob,
  nextJob: SavedJob,
): boolean {
  return (
    JSON.stringify(toJobResumeStalenessSignature(currentJob)) !==
    JSON.stringify(toJobResumeStalenessSignature(nextJob))
  );
}

export function collectResumeAffectingChangedJobIds(
  currentJobs: readonly SavedJob[],
  nextJobs: readonly SavedJob[],
): string[] {
  const currentJobsById = new Map(currentJobs.map((job) => [job.id, job]));

  return nextJobs.flatMap((job) => {
    const currentJob = currentJobsById.get(job.id);

    if (!currentJob || !hasResumeAffectingJobChange(currentJob, job)) {
      return [];
    }

    return [job.id];
  });
}

export function buildStaleResumeDraft(
  draft: ResumeDraft,
  staleReason: string,
  updatedAt = new Date().toISOString(),
): ResumeDraft {
  return ResumeDraftSchema.parse({
    ...draft,
    status: "stale",
    approvedAt: null,
    approvedExportId: null,
    staleReason,
    updatedAt,
  });
}
