import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderSettings,
  JobSearchPreferences,
  JobFinderWorkspaceSnapshot,
  JobSourceAdapterKind,
  SourceDebugRunDetails,
  SourceInstructionArtifact,
  WorkMode
} from '@unemployed/contracts'

export type JobFinderScreen =
  | 'profile'
  | 'discovery'
  | 'review-queue'
  | 'applications'
  | 'settings'

export interface JobFinderShellActions {
  analyzeProfileFromResume: () => Promise<JobFinderWorkspaceSnapshot>
  openBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>
  checkBrowserSession: () => Promise<JobFinderWorkspaceSnapshot>
  refreshWorkspace: () => Promise<JobFinderWorkspaceSnapshot>
  resetWorkspace: () => Promise<JobFinderWorkspaceSnapshot>
  runAgentDiscovery: (onActivity?: (event: DiscoveryActivityEvent) => void) => Promise<JobFinderWorkspaceSnapshot>
  runSourceDebug: (targetId: string) => Promise<JobFinderWorkspaceSnapshot>
  getSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  saveSourceInstructionArtifact: (targetId: string, artifact: SourceInstructionArtifact) => Promise<JobFinderWorkspaceSnapshot>
  acceptSourceInstructionDraft: (targetId: string, instructionId: string) => Promise<JobFinderWorkspaceSnapshot>
  verifySourceInstructions: (targetId: string, instructionId: string) => Promise<JobFinderWorkspaceSnapshot>
  importResume: () => Promise<JobFinderWorkspaceSnapshot>
  saveProfile: (profile: CandidateProfile) => Promise<JobFinderWorkspaceSnapshot>
  saveWorkspaceInputs: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => Promise<JobFinderWorkspaceSnapshot>
  saveSearchPreferences: (searchPreferences: JobSearchPreferences) => Promise<JobFinderWorkspaceSnapshot>
  saveSettings: (settings: JobFinderSettings) => Promise<JobFinderWorkspaceSnapshot>
  queueJobForReview: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
  dismissDiscoveryJob: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
  generateResume: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
  approveApply: (jobId: string) => Promise<JobFinderWorkspaceSnapshot>
}

export interface ScreenDefinition {
  id: JobFinderScreen
  label: string
  count: number | null
}

export type ExperienceFormEntry = {
  id: string
  companyName: string
  companyUrl: string
  title: string
  employmentType: string
  location: string
  workMode: WorkMode[]
  startDate: string
  endDate: string
  isCurrent: boolean
  summary: string
  achievements: string
  skills: string
  domainTags: string
  peopleManagementScope: string
  ownershipScope: string
}

export type EducationFormEntry = {
  id: string
  schoolName: string
  degree: string
  fieldOfStudy: string
  location: string
  startDate: string
  endDate: string
  summary: string
}

export type CertificationFormEntry = {
  id: string
  name: string
  issuer: string
  issueDate: string
  expiryDate: string
  credentialUrl: string
}

export type LinkFormEntry = {
  id: string
  label: string
  url: string
  kind: string
}

export type ProjectFormEntry = {
  id: string
  name: string
  projectType: string
  summary: string
  role: string
  skills: string
  outcome: string
  projectUrl: string
  repositoryUrl: string
  caseStudyUrl: string
}

export type LanguageFormEntry = {
  id: string
  language: string
  proficiency: string
  interviewPreference: boolean
  notes: string
}

export type DiscoveryTargetEditorValue = {
  id: string
  label: string
  startingUrl: string
  enabled: boolean
  adapterKind: JobSourceAdapterKind
  customInstructions: string
  instructionStatus: string
  validatedInstructionId: string | null
  draftInstructionId: string | null
  lastDebugRunId: string | null
  lastVerifiedAt: string | null
  staleReason: string | null
}

export type BooleanSelectValue = '' | 'yes' | 'no'

export type BadgeTone = 'active' | 'critical' | 'muted' | 'neutral' | 'positive'

export interface ActionState {
  busy: boolean
  message: string | null
}
