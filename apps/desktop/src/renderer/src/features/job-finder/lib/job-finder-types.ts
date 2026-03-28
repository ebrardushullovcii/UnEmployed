import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderSettings,
  JobSearchPreferences,
  JobSourceAdapterKind,
  WorkMode
} from '@unemployed/contracts'

export type JobFinderScreen =
  | 'profile'
  | 'discovery'
  | 'review-queue'
  | 'applications'
  | 'settings'

export interface JobFinderShellActions {
  analyzeProfileFromResume: () => Promise<void>
  openBrowserSession: () => Promise<void>
  checkBrowserSession: () => Promise<void>
  refreshWorkspace: () => Promise<void>
  resetWorkspace: () => Promise<void>
  runAgentDiscovery: (onActivity?: (event: DiscoveryActivityEvent) => void) => Promise<void>
  importResume: () => Promise<void>
  saveProfile: (profile: CandidateProfile) => Promise<void>
  saveWorkspaceInputs: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => Promise<void>
  saveSearchPreferences: (searchPreferences: JobSearchPreferences) => Promise<void>
  saveSettings: (settings: JobFinderSettings) => Promise<void>
  queueJobForReview: (jobId: string) => Promise<void>
  dismissDiscoveryJob: (jobId: string) => Promise<void>
  generateResume: (jobId: string) => Promise<void>
  approveApply: (jobId: string) => Promise<void>
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
}

export type BooleanSelectValue = '' | 'yes' | 'no'

export type BadgeTone = 'active' | 'critical' | 'muted' | 'neutral' | 'positive'

export interface ActionState {
  busy: boolean
  message: string | null
}
