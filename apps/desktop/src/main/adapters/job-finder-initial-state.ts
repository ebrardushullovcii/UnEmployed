import {
  CandidateProfileSchema,
  JobFinderSettingsSchema,
  JobSearchPreferencesSchema,
  type JobFinderRepositoryState
} from '@unemployed/contracts'

export function createEmptyJobFinderRepositoryState(): JobFinderRepositoryState {
  return {
    profile: CandidateProfileSchema.parse({
      id: 'candidate_fresh_start',
      firstName: 'New',
      lastName: 'Candidate',
      middleName: null,
      fullName: 'New Candidate',
      preferredDisplayName: null,
      headline: 'Import your resume to begin',
      summary: 'Import a resume or paste resume text to build your profile, targeting, and tailored documents.',
      currentLocation: 'Set your preferred location',
      currentCity: null,
      currentRegion: null,
      currentCountry: null,
      timeZone: null,
      yearsExperience: 0,
      email: null,
      secondaryEmail: null,
      phone: null,
      portfolioUrl: null,
      linkedinUrl: null,
      githubUrl: null,
      personalWebsiteUrl: null,
      baseResume: {
        id: 'resume_fresh_start',
        fileName: 'No resume imported yet',
        uploadedAt: new Date(0).toISOString(),
        storagePath: null,
        textContent: null,
        textUpdatedAt: null,
        extractionStatus: 'needs_text',
        lastAnalyzedAt: null,
        analysisWarnings: []
      },
      workEligibility: {},
      professionalSummary: {},
      skillGroups: {},
      targetRoles: [],
      locations: [],
      skills: [],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: []
    }),
    searchPreferences: JobSearchPreferencesSchema.parse({
      targetRoles: [],
      jobFamilies: [],
      locations: [],
      excludedLocations: [],
      workModes: [],
      seniorityLevels: [],
      minimumSalaryUsd: null,
      targetSalaryUsd: null,
      salaryCurrency: 'USD',
      targetIndustries: [],
      targetCompanyStages: [],
      employmentTypes: [],
      approvalMode: 'review_before_submit',
      tailoringMode: 'balanced',
      companyBlacklist: [],
      companyWhitelist: []
    }),
    savedJobs: [],
    tailoredAssets: [],
    applicationRecords: [],
    applicationAttempts: [],
    settings: JobFinderSettingsSchema.parse({
      resumeTemplateId: 'classic_ats',
      resumeFormat: 'pdf',
      fontPreset: 'inter_requisite',
      humanReviewRequired: true,
      keepSessionAlive: true,
      allowAutoSubmitOverride: false,
      discoveryOnly: false
    })
  }
}
