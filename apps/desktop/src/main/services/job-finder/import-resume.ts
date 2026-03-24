import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { JobFinderWorkspaceSnapshotSchema, JobSearchPreferencesSchema } from '@unemployed/contracts'
import { extractResumeText } from '../../adapters/resume-document'
import { getJobFinderWorkspaceService } from './workspace-service'
import { getJobFinderDocumentsDirectory } from './paths'

const emptySearchPreferences = JobSearchPreferencesSchema.parse({
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
})

export async function importResumeFromSourcePath(sourcePath: string) {
  const targetDirectory = getJobFinderDocumentsDirectory()
  const jobFinderWorkspaceService = await getJobFinderWorkspaceService()

  await mkdir(targetDirectory, { recursive: true })

  const extractedResume = await extractResumeText(sourcePath)
  const timestamp = Date.now()
  const fileName = path.basename(sourcePath)
  const targetPath = path.join(targetDirectory, `${timestamp}_${fileName}`)

  await copyFile(sourcePath, targetPath)

  await jobFinderWorkspaceService.saveSearchPreferences(emptySearchPreferences)

  const savedSnapshot = await jobFinderWorkspaceService.saveProfile({
    id: 'candidate_imported',
    firstName: 'Candidate',
    lastName: 'Imported',
    middleName: null,
    fullName: 'Imported Candidate',
    preferredDisplayName: null,
    headline: 'Resume imported - analysis pending',
    summary: 'Your resume has been imported. Run analysis to extract profile details.',
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
      id: `resume_${timestamp}`,
      fileName,
      uploadedAt: new Date(timestamp).toISOString(),
      storagePath: targetPath,
      textContent: extractedResume.textContent,
      textUpdatedAt: extractedResume.textContent ? new Date(timestamp).toISOString() : null,
      extractionStatus: extractedResume.textContent ? 'not_started' : 'needs_text',
      lastAnalyzedAt: null,
      analysisProviderKind: null,
      analysisProviderLabel: null,
      analysisWarnings:
        extractedResume.warnings.length > 0
          ? extractedResume.warnings
          : extractedResume.textContent
            ? []
            : ['Paste plain-text resume content below if you want the agent to extract profile details from this file.']
    },
    workEligibility: {
      authorizedWorkCountries: [],
      requiresVisaSponsorship: null,
      willingToRelocate: null,
      preferredRelocationRegions: [],
      willingToTravel: null,
      remoteEligible: null,
      noticePeriodDays: null,
      availableStartDate: null,
      securityClearance: null
    },
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: []
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: []
    },
    targetRoles: [],
    locations: [],
    skills: [],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: []
  })

  if (!extractedResume.textContent) {
    return JobFinderWorkspaceSnapshotSchema.parse(savedSnapshot)
  }

  const analyzedSnapshot = await jobFinderWorkspaceService.analyzeProfileFromResume()
  return JobFinderWorkspaceSnapshotSchema.parse(analyzedSnapshot)
}
