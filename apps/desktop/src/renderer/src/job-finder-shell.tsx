import { useEffect, useMemo, useState } from 'react'
import {
  candidateLinkKindValues,
  type AgentProviderStatus,
  type ApprovalMode,
  type ApplicationAttempt,
  type ApplicationEvent,
  type ApplicationRecord,
  type ApplicationStatus,
  type AssetStatus,
  type BrowserSessionState,
  type CandidateProfile,
  type DesktopWindowControlsState,
  type JobFinderSettings,
  type JobFinderWorkspaceSnapshot,
  type JobSearchPreferences,
  type ResumeTemplateDefinition,
  type ReviewQueueItem,
  type SavedJob,
  type TailoredAsset,
  type WorkMode,
  workModeValues,
  suiteModules
} from '@unemployed/contracts'

type JobFinderScreen = 'profile' | 'discovery' | 'review-queue' | 'applications' | 'settings'

interface JobFinderShellProps {
  actions: {
    analyzeProfileFromResume: () => Promise<void>
    openBrowserSession: () => Promise<void>
    refreshWorkspace: () => Promise<void>
    resetWorkspace: () => Promise<void>
    runDiscovery: () => Promise<void>
    importResume: () => Promise<void>
    saveProfile: (profile: CandidateProfile) => Promise<void>
    saveSearchPreferences: (searchPreferences: JobSearchPreferences) => Promise<void>
    saveSettings: (settings: JobFinderSettings) => Promise<void>
    queueJobForReview: (jobId: string) => Promise<void>
    dismissDiscoveryJob: (jobId: string) => Promise<void>
    generateResume: (jobId: string) => Promise<void>
    approveApply: (jobId: string) => Promise<void>
  }
  platform: 'darwin' | 'win32' | 'linux'
  workspace: JobFinderWorkspaceSnapshot
}

interface ScreenDefinition {
  id: JobFinderScreen
  label: string
  count: number | null
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function formatDateOnly(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(timestamp))
}

function formatApprovalMode(value: ApprovalMode): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}

function formatStatusLabel(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ')
}

function formatResumeAnalysisSummary(profile: CandidateProfile): string | null {
  const providerLabel = profile.baseResume.analysisProviderLabel
  const analyzedAt = profile.baseResume.lastAnalyzedAt

  if (!providerLabel || !analyzedAt) {
    return null
  }

  return `${providerLabel} parsed this resume on ${formatTimestamp(analyzedAt)}.`
}

function formatCountLabel(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}

function getApplicationTone(status: ApplicationStatus): string {
  switch (status) {
    case 'interview':
    case 'offer':
      return 'tone-positive'
    case 'ready_for_review':
    case 'approved':
    case 'drafting':
    case 'shortlisted':
      return 'tone-active'
    case 'submitted':
    case 'assessment':
      return 'tone-neutral'
    case 'rejected':
    case 'withdrawn':
      return 'tone-critical'
    default:
      return 'tone-muted'
  }
}

function getAssetTone(status: AssetStatus): string {
  switch (status) {
    case 'ready':
      return 'tone-positive'
    case 'generating':
    case 'queued':
      return 'tone-active'
    case 'failed':
      return 'tone-critical'
    default:
      return 'tone-muted'
  }
}

function getEventTone(event: ApplicationEvent): string {
  switch (event.emphasis) {
    case 'positive':
      return 'tone-positive'
    case 'warning':
      return 'tone-active'
    case 'critical':
      return 'tone-critical'
    default:
      return 'tone-muted'
  }
}

function getSessionTone(session: BrowserSessionState): string {
  switch (session.status) {
    case 'ready':
      return 'tone-positive'
    case 'login_required':
      return 'tone-active'
    case 'blocked':
      return 'tone-critical'
    default:
      return 'tone-muted'
  }
}

function useResettableSelection<TValue extends string | null>(initialValue: TValue) {
  const [value, setValue] = useState<TValue>(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return [value, setValue] as const
}

function joinListInput(values: readonly string[]): string {
  return values.join('\n')
}

function parseListInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildFullName(parts: {
  firstName: string
  middleName: string
  lastName: string
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
}

type ExperienceFormEntry = {
  id: string
  companyName: string
  companyUrl: string
  title: string
  employmentType: string
  location: string
  workMode: WorkMode | ''
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

type EducationFormEntry = {
  id: string
  schoolName: string
  degree: string
  fieldOfStudy: string
  location: string
  startDate: string
  endDate: string
  summary: string
}

type CertificationFormEntry = {
  id: string
  name: string
  issuer: string
  issueDate: string
  expiryDate: string
  credentialUrl: string
}

type LinkFormEntry = {
  id: string
  label: string
  url: string
  kind: string
}

type ProjectFormEntry = {
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

type LanguageFormEntry = {
  id: string
  language: string
  proficiency: string
  interviewPreference: boolean
  notes: string
}

type BooleanSelectValue = '' | 'yes' | 'no'

function booleanToSelect(value: boolean | null): BooleanSelectValue {
  if (value === true) {
    return 'yes'
  }

  if (value === false) {
    return 'no'
  }

  return ''
}

function selectToBoolean(value: BooleanSelectValue): boolean | null {
  if (value === 'yes') {
    return true
  }

  if (value === 'no') {
    return false
  }

  return null
}

function uniqueList(values: readonly string[]): string[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const trimmed = value.trim()

    if (!trimmed) {
      return []
    }

    const key = trimmed.toLowerCase()

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [trimmed]
  })
}

function createProfileEntryId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function parseRequiredNonNegativeInteger(value: string): number | null {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const parsedValue = Number(trimmedValue)

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

function toExperienceFormEntries(profile: CandidateProfile): ExperienceFormEntry[] {
  return profile.experiences.map((experience) => ({
    id: experience.id,
    companyName: experience.companyName ?? '',
    companyUrl: experience.companyUrl ?? '',
    title: experience.title ?? '',
    employmentType: experience.employmentType ?? '',
    location: experience.location ?? '',
    workMode: experience.workMode ?? '',
    startDate: experience.startDate ?? '',
    endDate: experience.endDate ?? '',
    isCurrent: experience.isCurrent,
    summary: experience.summary ?? '',
    achievements: joinListInput(experience.achievements),
    skills: joinListInput(experience.skills),
    domainTags: joinListInput(experience.domainTags),
    peopleManagementScope: experience.peopleManagementScope ?? '',
    ownershipScope: experience.ownershipScope ?? ''
  }))
}

function toEducationFormEntries(profile: CandidateProfile): EducationFormEntry[] {
  return profile.education.map((education) => ({
    id: education.id,
    schoolName: education.schoolName ?? '',
    degree: education.degree ?? '',
    fieldOfStudy: education.fieldOfStudy ?? '',
    location: education.location ?? '',
    startDate: education.startDate ?? '',
    endDate: education.endDate ?? '',
    summary: education.summary ?? ''
  }))
}

function toCertificationFormEntries(profile: CandidateProfile): CertificationFormEntry[] {
  return profile.certifications.map((certification) => ({
    id: certification.id,
    name: certification.name ?? '',
    issuer: certification.issuer ?? '',
    issueDate: certification.issueDate ?? '',
    expiryDate: certification.expiryDate ?? '',
    credentialUrl: certification.credentialUrl ?? ''
  }))
}

function toLinkFormEntries(profile: CandidateProfile): LinkFormEntry[] {
  return profile.links.map((link) => ({
    id: link.id,
    label: link.label ?? '',
    url: link.url ?? '',
    kind: link.kind ?? ''
  }))
}

function toProjectFormEntries(profile: CandidateProfile): ProjectFormEntry[] {
  return profile.projects.map((project) => ({
    id: project.id,
    name: project.name,
    projectType: project.projectType ?? '',
    summary: project.summary ?? '',
    role: project.role ?? '',
    skills: joinListInput(project.skills),
    outcome: project.outcome ?? '',
    projectUrl: project.projectUrl ?? '',
    repositoryUrl: project.repositoryUrl ?? '',
    caseStudyUrl: project.caseStudyUrl ?? ''
  }))
}

function toLanguageFormEntries(profile: CandidateProfile): LanguageFormEntry[] {
  return profile.spokenLanguages.map((language) => ({
    id: language.id,
    language: language.language,
    proficiency: language.proficiency ?? '',
    interviewPreference: language.interviewPreference,
    notes: language.notes ?? ''
  }))
}

export function JobFinderShell(props: JobFinderShellProps) {
  const { actions, workspace } = props
  const isMac = props.platform === 'darwin'
  const [activeScreen, setActiveScreen] = useState<JobFinderScreen>('profile')
  const [actionState, setActionState] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null
  })
  const [windowControlsState, setWindowControlsState] = useState<DesktopWindowControlsState>({
    isClosable: true,
    isMaximized: false,
    isMinimizable: true
  })
  const [selectedDiscoveryJobId, setSelectedDiscoveryJobId] = useResettableSelection(
    workspace.selectedDiscoveryJobId
  )
  const [selectedReviewJobId, setSelectedReviewJobId] = useResettableSelection(
    workspace.selectedReviewJobId
  )
  const [selectedApplicationRecordId, setSelectedApplicationRecordId] = useResettableSelection(
    workspace.selectedApplicationRecordId
  )

  const isFullscreenWindow = isMac && windowControlsState.isMaximized

  const screenDefinitions = useMemo<ScreenDefinition[]>(
    () => [
      { id: 'profile', label: 'Profile', count: null },
      { id: 'discovery', label: 'Discovery', count: workspace.discoveryJobs.length },
      { id: 'review-queue', label: 'Review Queue', count: workspace.reviewQueue.length },
      { id: 'applications', label: 'Applications', count: workspace.applicationRecords.length },
      { id: 'settings', label: 'Settings', count: null }
    ],
    [workspace.applicationRecords.length, workspace.discoveryJobs.length, workspace.reviewQueue.length]
  )

  const selectedDiscoveryJob = useMemo(
    () =>
      workspace.discoveryJobs.find((job) => job.id === selectedDiscoveryJobId) ??
      workspace.discoveryJobs[0] ??
      null,
    [selectedDiscoveryJobId, workspace.discoveryJobs]
  )
  const selectedReviewItem = useMemo(
    () =>
      workspace.reviewQueue.find((item) => item.jobId === selectedReviewJobId) ??
      workspace.reviewQueue[0] ??
      null,
    [selectedReviewJobId, workspace.reviewQueue]
  )
  const selectedReviewJob = useMemo(
    () =>
      workspace.discoveryJobs.find((job) => job.id === selectedReviewItem?.jobId) ??
      selectedDiscoveryJob,
    [selectedDiscoveryJob, selectedReviewItem?.jobId, workspace.discoveryJobs]
  )
  const selectedTailoredAsset = useMemo(
    () =>
      workspace.tailoredAssets.find((asset) => asset.id === selectedReviewItem?.resumeAssetId) ??
      null,
    [selectedReviewItem?.resumeAssetId, workspace.tailoredAssets]
  )
  const selectedApplicationRecord = useMemo(
    () =>
      workspace.applicationRecords.find((record) => record.id === selectedApplicationRecordId) ??
      workspace.applicationRecords[0] ??
      null,
    [selectedApplicationRecordId, workspace.applicationRecords]
  )

  const selectedApplicationAttempt = useMemo(() => {
    if (!selectedApplicationRecord) {
      return null
    }

    return (
      [...workspace.applicationAttempts]
        .filter((attempt) => attempt.jobId === selectedApplicationRecord.jobId)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ??
      null
    )
  }, [selectedApplicationRecord, workspace.applicationAttempts])

  useEffect(() => {
    let cancelled = false

    const unsubscribe = window.unemployed.window.onControlsStateChange((controlsState) => {
      if (!cancelled) {
        setWindowControlsState(controlsState)
      }
    })

    void window.unemployed.window
      .getControlsState()
      .then((controlsState) => {
        if (!cancelled) {
          setWindowControlsState(controlsState)
        }
      })
      .catch(() => {
        // Keep the initial fallback state when the window bridge is unavailable.
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function runAction(
    action: () => Promise<void>,
    onSuccess: () => void,
    successMessage: string
  ) {
    try {
      setActionState({ busy: true, message: null })
      await action()
      onSuccess()
      setActionState({ busy: false, message: successMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The requested Job Finder action failed.'
      setActionState({ busy: false, message })
    }
  }

  async function runWindowAction(
    action: () => Promise<DesktopWindowControlsState>
  ): Promise<void> {
    try {
      const nextControlsState = await action()
      setWindowControlsState(nextControlsState)
    } catch {
      // Keep the current controls state if the desktop action fails.
    }
  }

  function minimizeWindow() {
    void runWindowAction(() => window.unemployed.window.minimize())
  }

  function toggleWindowExpand() {
    void runWindowAction(() => window.unemployed.window.toggleMaximize())
  }

  function closeWindow() {
    void window.unemployed.window.close()
  }

  return (
    <div
      className={`window-shell platform-${props.platform} ${isFullscreenWindow ? 'window-shell-fullscreen' : ''}`}
    >
      <header className={`custom-titlebar ${isMac ? 'custom-titlebar-mac' : ''}`}>
        <div className="titlebar-drag-zone">
          <div className="titlebar-brand">
            <span className="titlebar-app-name">UnEmployed</span>
          </div>
          <div className="module-switcher module-switcher-titlebar">
            {suiteModules.map((moduleName) => (
              <button
                key={moduleName}
                className={`module-pill ${moduleName === 'job-finder' ? 'module-pill-active' : 'module-pill-disabled'}`}
                type="button"
              >
                {formatStatusLabel(moduleName)}
              </button>
            ))}
          </div>
        </div>

        {!isMac ? (
          <div className="window-controls" role="group" aria-label="Window controls">
            <button
              aria-label="Minimize window"
              className="window-control-button window-control-button-minimize"
              disabled={!windowControlsState.isMinimizable}
              onClick={minimizeWindow}
              type="button"
            >
              <span aria-hidden="true" className="window-control-glyph" />
            </button>
            <button
              aria-label={windowControlsState.isMaximized ? 'Restore window' : 'Maximize window'}
              className={`window-control-button ${windowControlsState.isMaximized ? 'window-control-button-restore' : 'window-control-button-maximize'}`}
              onClick={toggleWindowExpand}
              type="button"
            >
              <span aria-hidden="true" className="window-control-glyph" />
            </button>
            <button
              aria-label="Close window"
              className="window-control-button window-control-button-critical"
              disabled={!windowControlsState.isClosable}
              onClick={closeWindow}
              type="button"
            >
              <span aria-hidden="true" className="window-control-glyph" />
            </button>
          </div>
        ) : null}
      </header>

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div className="brand-block">
              <div className="brand-wordmark">UNEMPLOYED</div>
              <div className="brand-subtitle">First job finder slice</div>
            </div>

            <div className="operator-card panel">
              <p className="eyebrow">Operator</p>
              <h2>{workspace.profile.fullName}</h2>
              <p>{workspace.profile.headline}</p>
              <div className={`status-chip ${getSessionTone(workspace.browserSession)}`}>
                {workspace.browserSession.label}
              </div>
            </div>

            <nav className="nav-list">
              {screenDefinitions.map((screen) => (
                <button
                  key={screen.id}
                  className={`nav-item ${activeScreen === screen.id ? 'nav-item-active' : ''}`}
                  onClick={() => setActiveScreen(screen.id)}
                  type="button"
                >
                  <span>{screen.label}</span>
                  {screen.count !== null ? <span className="nav-count">{screen.count}</span> : null}
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-footer panel">
            <div className="summary-metric-row">
              <div className="summary-metric-box">
                <span className="summary-metric-label">Saved</span>
                <strong className="summary-metric-value">{workspace.discoveryJobs.length}</strong>
                <span className="summary-metric-caption">jobs</span>
              </div>
              <div className="summary-metric-box">
                <span className="summary-metric-label">Queue</span>
                <strong className="summary-metric-value">{workspace.reviewQueue.length}</strong>
                <span className="summary-metric-caption">items</span>
              </div>
              <div className="summary-metric-box summary-metric-box-wide">
                <span className="summary-metric-label">Tracked</span>
                <strong className="summary-metric-value">{workspace.applicationRecords.length}</strong>
                <span className="summary-metric-caption">applications</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="workspace-shell">
          <main className="screen-scroll-area">
          {activeScreen === 'profile' ? (
            <ProfileScreen
              agentProvider={workspace.agentProvider}
              actionState={actionState}
              busy={actionState.busy}
              onAnalyzeProfileFromResume={() =>
                void runAction(
                  actions.analyzeProfileFromResume,
                  () => undefined,
                  'Candidate details refreshed from the stored resume text.'
                )
              }
              onImportResume={() =>
                void runAction(
                  actions.importResume,
                  () => undefined,
                  'Base resume replaced from a local document.'
                )
              }
              onSaveProfile={(profile) =>
                void runAction(
                  () => actions.saveProfile(profile),
                  () => undefined,
                  'Candidate profile saved locally.'
                )
              }
              onSaveSearchPreferences={(searchPreferences) =>
                void runAction(
                  () => actions.saveSearchPreferences(searchPreferences),
                  () => undefined,
                  'Discovery preferences updated.'
                )
              }
              profile={workspace.profile}
              searchPreferences={workspace.searchPreferences}
            />
          ) : null}

          {activeScreen === 'discovery' ? (
            <DiscoveryScreen
              actionState={actionState}
              busy={actionState.busy}
              browserSession={workspace.browserSession}
              jobs={workspace.discoveryJobs}
              onDismissJob={(jobId) =>
                void runAction(
                  () => actions.dismissDiscoveryJob(jobId),
                  () => undefined,
                  'Saved job archived from discovery.'
                )
              }
              onOpenBrowserSession={() =>
                void runAction(
                  actions.openBrowserSession,
                  () => undefined,
                  'Dedicated Chrome profile opened for the LinkedIn agent.'
                )
              }
              onQueueJob={(jobId) =>
                void runAction(
                  () => actions.queueJobForReview(jobId),
                  () => {
                    setSelectedReviewJobId(jobId)
                    setActiveScreen('review-queue')
                  },
                  'Job moved into the review queue.'
                )
              }
              searchPreferences={workspace.searchPreferences}
              selectedJob={selectedDiscoveryJob}
              onSelectJob={setSelectedDiscoveryJobId}
              onRefreshDiscovery={() =>
                void runAction(
                  actions.runDiscovery,
                  () => undefined,
                  'LinkedIn discovery run completed and saved locally.'
                )
              }
            />
          ) : null}

          {activeScreen === 'review-queue' ? (
            <ReviewQueueScreen
              actionState={actionState}
              busy={actionState.busy}
              browserSession={workspace.browserSession}
              onApproveApply={(jobId) =>
                void runAction(
                  () => actions.approveApply(jobId),
                  () => {
                    setActiveScreen('applications')
                  },
                  'Easy Apply marked as submitted and moved into Applications.'
                )
              }
              onGenerateResume={(jobId) =>
                void runAction(
                  () => actions.generateResume(jobId),
                  () => setSelectedReviewJobId(jobId),
                  'A tailored resume was generated for the selected job.'
                )
              }
              queue={workspace.reviewQueue}
              selectedItem={selectedReviewItem}
              selectedJob={selectedReviewJob}
              selectedAsset={selectedTailoredAsset}
              onSelectItem={setSelectedReviewJobId}
            />
          ) : null}

          {activeScreen === 'applications' ? (
            <ApplicationsScreen
              applicationRecords={workspace.applicationRecords}
              selectedAttempt={selectedApplicationAttempt}
              selectedRecord={selectedApplicationRecord}
              onSelectRecord={setSelectedApplicationRecordId}
            />
          ) : null}

          {activeScreen === 'settings' ? (
            <SettingsScreen
              agentProvider={workspace.agentProvider}
              availableResumeTemplates={workspace.availableResumeTemplates}
              actionState={actionState}
              browserSession={workspace.browserSession}
              busy={actionState.busy}
              onResetWorkspace={() =>
                void runAction(
                  actions.resetWorkspace,
                  () => {
                    setActiveScreen('profile')
                  },
                  'Workspace reset to a fresh profile, cleared resume state, and empty job history.'
                )
              }
              onSaveSettings={(settings) =>
                void runAction(
                  () => actions.saveSettings(settings),
                  () => undefined,
                  'Job Finder settings updated.'
                )
              }
              settings={workspace.settings}
            />
          ) : null}
        </main>

          <footer className="footer-bar">
            <span>Job Finder MVP</span>
            {actionState.message ? <span>{actionState.message}</span> : null}
          </footer>
        </div>
      </div>
    </div>
  )
}

function PageHeader(props: { eyebrow: string; title: string; description: string }) {
  const { description, eyebrow, title } = props

  return (
    <div className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="page-description">{description}</p>
    </div>
  )
}

function ProfileScreen(props: {
  agentProvider: AgentProviderStatus
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onImportResume: () => void
  onSaveProfile: (profile: CandidateProfile) => void
  onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => void
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}) {
  const {
    agentProvider,
    actionState,
    busy,
    onAnalyzeProfileFromResume,
    onImportResume,
    onSaveProfile,
    onSaveSearchPreferences,
    profile,
    searchPreferences
  } = props

  const [profileForm, setProfileForm] = useState({
    firstName: profile.firstName,
    middleName: profile.middleName ?? '',
    lastName: profile.lastName,
    preferredDisplayName: profile.preferredDisplayName ?? '',
    headline: profile.headline,
    summary: profile.summary,
    currentLocation: profile.currentLocation,
    currentCity: profile.currentCity ?? '',
    currentRegion: profile.currentRegion ?? '',
    currentCountry: profile.currentCountry ?? '',
    timeZone: profile.timeZone ?? '',
    yearsExperience: String(profile.yearsExperience),
    email: profile.email ?? '',
    secondaryEmail: profile.secondaryEmail ?? '',
    phone: profile.phone ?? '',
    portfolioUrl: profile.portfolioUrl ?? '',
    linkedinUrl: profile.linkedinUrl ?? '',
    githubUrl: profile.githubUrl ?? '',
    personalWebsiteUrl: profile.personalWebsiteUrl ?? '',
    resumeText: profile.baseResume.textContent ?? '',
    skills: joinListInput(profile.skills)
  })
  const [eligibilityForm, setEligibilityForm] = useState({
    authorizedWorkCountries: joinListInput(profile.workEligibility.authorizedWorkCountries),
    requiresVisaSponsorship: booleanToSelect(profile.workEligibility.requiresVisaSponsorship),
    willingToRelocate: booleanToSelect(profile.workEligibility.willingToRelocate),
    preferredRelocationRegions: joinListInput(profile.workEligibility.preferredRelocationRegions),
    willingToTravel: booleanToSelect(profile.workEligibility.willingToTravel),
    remoteEligible: booleanToSelect(profile.workEligibility.remoteEligible),
    noticePeriodDays: profile.workEligibility.noticePeriodDays?.toString() ?? '',
    availableStartDate: profile.workEligibility.availableStartDate ?? '',
    securityClearance: profile.workEligibility.securityClearance ?? ''
  })
  const [summaryForm, setSummaryForm] = useState({
    shortValueProposition: profile.professionalSummary.shortValueProposition ?? '',
    fullSummary: profile.professionalSummary.fullSummary ?? profile.summary,
    careerThemes: joinListInput(profile.professionalSummary.careerThemes),
    leadershipSummary: profile.professionalSummary.leadershipSummary ?? '',
    domainFocusSummary: profile.professionalSummary.domainFocusSummary ?? '',
    strengths: joinListInput(profile.professionalSummary.strengths)
  })
  const [skillGroupForm, setSkillGroupForm] = useState({
    coreSkills: joinListInput(profile.skillGroups.coreSkills),
    tools: joinListInput(profile.skillGroups.tools),
    languagesAndFrameworks: joinListInput(profile.skillGroups.languagesAndFrameworks),
    softSkills: joinListInput(profile.skillGroups.softSkills),
    highlightedSkills: joinListInput(profile.skillGroups.highlightedSkills)
  })
  const [experienceEntries, setExperienceEntries] = useState<ExperienceFormEntry[]>(toExperienceFormEntries(profile))
  const [educationEntries, setEducationEntries] = useState<EducationFormEntry[]>(toEducationFormEntries(profile))
  const [certificationEntries, setCertificationEntries] = useState<CertificationFormEntry[]>(toCertificationFormEntries(profile))
  const [linkEntries, setLinkEntries] = useState<LinkFormEntry[]>(toLinkFormEntries(profile))
  const [projectEntries, setProjectEntries] = useState<ProjectFormEntry[]>(toProjectFormEntries(profile))
  const [languageEntries, setLanguageEntries] = useState<LanguageFormEntry[]>(toLanguageFormEntries(profile))
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [preferenceForm, setPreferenceForm] = useState({
    targetRoles: joinListInput(searchPreferences.targetRoles),
    jobFamilies: joinListInput(searchPreferences.jobFamilies),
    locations: joinListInput(searchPreferences.locations),
    excludedLocations: joinListInput(searchPreferences.excludedLocations),
    seniorityLevels: joinListInput(searchPreferences.seniorityLevels),
    targetIndustries: joinListInput(searchPreferences.targetIndustries),
    targetCompanyStages: joinListInput(searchPreferences.targetCompanyStages),
    employmentTypes: joinListInput(searchPreferences.employmentTypes),
    tailoringMode: searchPreferences.tailoringMode,
    workModes: searchPreferences.workModes,
    minimumSalaryUsd: searchPreferences.minimumSalaryUsd?.toString() ?? '',
    targetSalaryUsd: searchPreferences.targetSalaryUsd?.toString() ?? '',
    salaryCurrency: searchPreferences.salaryCurrency ?? 'USD',
    companyBlacklist: joinListInput(searchPreferences.companyBlacklist),
    companyWhitelist: joinListInput(searchPreferences.companyWhitelist)
  })

  useEffect(() => {
    setProfileForm({
      firstName: profile.firstName,
      middleName: profile.middleName ?? '',
      lastName: profile.lastName,
      preferredDisplayName: profile.preferredDisplayName ?? '',
      headline: profile.headline,
      summary: profile.summary,
      currentLocation: profile.currentLocation,
      currentCity: profile.currentCity ?? '',
      currentRegion: profile.currentRegion ?? '',
      currentCountry: profile.currentCountry ?? '',
      timeZone: profile.timeZone ?? '',
      yearsExperience: String(profile.yearsExperience),
      email: profile.email ?? '',
      secondaryEmail: profile.secondaryEmail ?? '',
      phone: profile.phone ?? '',
      portfolioUrl: profile.portfolioUrl ?? '',
      linkedinUrl: profile.linkedinUrl ?? '',
      githubUrl: profile.githubUrl ?? '',
      personalWebsiteUrl: profile.personalWebsiteUrl ?? '',
      resumeText: profile.baseResume.textContent ?? '',
      skills: joinListInput(profile.skills)
    })
    setEligibilityForm({
      authorizedWorkCountries: joinListInput(profile.workEligibility.authorizedWorkCountries),
      requiresVisaSponsorship: booleanToSelect(profile.workEligibility.requiresVisaSponsorship),
      willingToRelocate: booleanToSelect(profile.workEligibility.willingToRelocate),
      preferredRelocationRegions: joinListInput(profile.workEligibility.preferredRelocationRegions),
      willingToTravel: booleanToSelect(profile.workEligibility.willingToTravel),
      remoteEligible: booleanToSelect(profile.workEligibility.remoteEligible),
      noticePeriodDays: profile.workEligibility.noticePeriodDays?.toString() ?? '',
      availableStartDate: profile.workEligibility.availableStartDate ?? '',
      securityClearance: profile.workEligibility.securityClearance ?? ''
    })
    setSummaryForm({
      shortValueProposition: profile.professionalSummary.shortValueProposition ?? '',
      fullSummary: profile.professionalSummary.fullSummary ?? profile.summary,
      careerThemes: joinListInput(profile.professionalSummary.careerThemes),
      leadershipSummary: profile.professionalSummary.leadershipSummary ?? '',
      domainFocusSummary: profile.professionalSummary.domainFocusSummary ?? '',
      strengths: joinListInput(profile.professionalSummary.strengths)
    })
    setSkillGroupForm({
      coreSkills: joinListInput(profile.skillGroups.coreSkills),
      tools: joinListInput(profile.skillGroups.tools),
      languagesAndFrameworks: joinListInput(profile.skillGroups.languagesAndFrameworks),
      softSkills: joinListInput(profile.skillGroups.softSkills),
      highlightedSkills: joinListInput(profile.skillGroups.highlightedSkills)
    })
    setExperienceEntries(toExperienceFormEntries(profile))
    setEducationEntries(toEducationFormEntries(profile))
    setCertificationEntries(toCertificationFormEntries(profile))
    setLinkEntries(toLinkFormEntries(profile))
    setProjectEntries(toProjectFormEntries(profile))
    setLanguageEntries(toLanguageFormEntries(profile))
  }, [profile])

  useEffect(() => {
    setPreferenceForm({
      targetRoles: joinListInput(searchPreferences.targetRoles),
      jobFamilies: joinListInput(searchPreferences.jobFamilies),
      locations: joinListInput(searchPreferences.locations),
      excludedLocations: joinListInput(searchPreferences.excludedLocations),
      seniorityLevels: joinListInput(searchPreferences.seniorityLevels),
      targetIndustries: joinListInput(searchPreferences.targetIndustries),
      targetCompanyStages: joinListInput(searchPreferences.targetCompanyStages),
      employmentTypes: joinListInput(searchPreferences.employmentTypes),
      tailoringMode: searchPreferences.tailoringMode,
      workModes: searchPreferences.workModes,
      minimumSalaryUsd: searchPreferences.minimumSalaryUsd?.toString() ?? '',
      targetSalaryUsd: searchPreferences.targetSalaryUsd?.toString() ?? '',
      salaryCurrency: searchPreferences.salaryCurrency ?? 'USD',
      companyBlacklist: joinListInput(searchPreferences.companyBlacklist),
      companyWhitelist: joinListInput(searchPreferences.companyWhitelist)
    })
  }, [searchPreferences])

  const updateExperienceEntry = (id: string, field: keyof ExperienceFormEntry, value: string | boolean) => {
    setExperienceEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }
  const updateEducationEntry = (id: string, field: keyof EducationFormEntry, value: string) => {
    setEducationEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }
  const updateCertificationEntry = (id: string, field: keyof CertificationFormEntry, value: string) => {
    setCertificationEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }
  const updateLinkEntry = (id: string, field: keyof LinkFormEntry, value: string) => {
    setLinkEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }
  const updateProjectEntry = (id: string, field: keyof ProjectFormEntry, value: string) => {
    setProjectEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }
  const updateLanguageEntry = (id: string, field: keyof LanguageFormEntry, value: string | boolean) => {
    setLanguageEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }

  const addExperienceEntry = () => setExperienceEntries((current) => [...current, { id: createProfileEntryId('experience'), companyName: '', companyUrl: '', title: '', employmentType: '', location: '', workMode: '', startDate: '', endDate: '', isCurrent: false, summary: '', achievements: '', skills: '', domainTags: '', peopleManagementScope: '', ownershipScope: '' }])
  const addEducationEntry = () => setEducationEntries((current) => [...current, { id: createProfileEntryId('education'), schoolName: '', degree: '', fieldOfStudy: '', location: '', startDate: '', endDate: '', summary: '' }])
  const addCertificationEntry = () => setCertificationEntries((current) => [...current, { id: createProfileEntryId('certification'), name: '', issuer: '', issueDate: '', expiryDate: '', credentialUrl: '' }])
  const addLinkEntry = () => setLinkEntries((current) => [...current, { id: createProfileEntryId('link'), label: '', url: '', kind: '' }])
  const addProjectEntry = () => setProjectEntries((current) => [...current, { id: createProfileEntryId('project'), name: '', projectType: '', summary: '', role: '', skills: '', outcome: '', projectUrl: '', repositoryUrl: '', caseStudyUrl: '' }])
  const addLanguageEntry = () => setLanguageEntries((current) => [...current, { id: createProfileEntryId('language'), language: '', proficiency: '', interviewPreference: false, notes: '' }])

  const mergedSkills = uniqueList([
    ...parseListInput(profileForm.skills),
    ...parseListInput(skillGroupForm.coreSkills),
    ...parseListInput(skillGroupForm.tools),
    ...parseListInput(skillGroupForm.languagesAndFrameworks),
    ...parseListInput(skillGroupForm.highlightedSkills)
  ])

  const builtLocation = uniqueList([
    [profileForm.currentCity, profileForm.currentRegion, profileForm.currentCountry].filter(Boolean).join(', '),
    profileForm.currentLocation
  ])[0] ?? profileForm.currentLocation.trim()

  const parsedYearsExperience = parseRequiredNonNegativeInteger(profileForm.yearsExperience)
  const parsedNoticePeriodDays = parseRequiredNonNegativeInteger(eligibilityForm.noticePeriodDays)
  const parsedMinimumSalaryUsd = parseRequiredNonNegativeInteger(preferenceForm.minimumSalaryUsd)
  const parsedTargetSalaryUsd = parseRequiredNonNegativeInteger(preferenceForm.targetSalaryUsd)

  const saveProfilePayload: CandidateProfile = {
    ...profile,
    firstName: profileForm.firstName.trim(),
    middleName: profileForm.middleName.trim() || null,
    lastName: profileForm.lastName.trim(),
    preferredDisplayName: profileForm.preferredDisplayName.trim() || null,
    fullName: buildFullName({ firstName: profileForm.firstName, middleName: profileForm.middleName, lastName: profileForm.lastName }),
    headline: profileForm.headline.trim(),
    summary: (summaryForm.fullSummary.trim() || profileForm.summary.trim()),
    currentLocation: builtLocation,
    currentCity: profileForm.currentCity.trim() || null,
    currentRegion: profileForm.currentRegion.trim() || null,
    currentCountry: profileForm.currentCountry.trim() || null,
    timeZone: profileForm.timeZone.trim() || null,
    yearsExperience: parsedYearsExperience ?? 0,
    email: profileForm.email.trim() || null,
    secondaryEmail: profileForm.secondaryEmail.trim() || null,
    phone: profileForm.phone.trim() || null,
    portfolioUrl: profileForm.portfolioUrl.trim() || null,
    linkedinUrl: profileForm.linkedinUrl.trim() || null,
    githubUrl: profileForm.githubUrl.trim() || null,
    personalWebsiteUrl: profileForm.personalWebsiteUrl.trim() || null,
    baseResume: {
      ...profile.baseResume,
      textContent: profileForm.resumeText.trim() || null
    },
    workEligibility: {
      authorizedWorkCountries: parseListInput(eligibilityForm.authorizedWorkCountries),
      requiresVisaSponsorship: selectToBoolean(eligibilityForm.requiresVisaSponsorship),
      willingToRelocate: selectToBoolean(eligibilityForm.willingToRelocate),
      preferredRelocationRegions: parseListInput(eligibilityForm.preferredRelocationRegions),
      willingToTravel: selectToBoolean(eligibilityForm.willingToTravel),
      remoteEligible: selectToBoolean(eligibilityForm.remoteEligible),
      noticePeriodDays: parsedNoticePeriodDays,
      availableStartDate: eligibilityForm.availableStartDate.trim() || null,
      securityClearance: eligibilityForm.securityClearance.trim() || null
    },
    professionalSummary: {
      shortValueProposition: summaryForm.shortValueProposition.trim() || null,
      fullSummary: summaryForm.fullSummary.trim() || null,
      careerThemes: parseListInput(summaryForm.careerThemes),
      leadershipSummary: summaryForm.leadershipSummary.trim() || null,
      domainFocusSummary: summaryForm.domainFocusSummary.trim() || null,
      strengths: parseListInput(summaryForm.strengths)
    },
    skillGroups: {
      coreSkills: parseListInput(skillGroupForm.coreSkills),
      tools: parseListInput(skillGroupForm.tools),
      languagesAndFrameworks: parseListInput(skillGroupForm.languagesAndFrameworks),
      softSkills: parseListInput(skillGroupForm.softSkills),
      highlightedSkills: parseListInput(skillGroupForm.highlightedSkills)
    },
    targetRoles: profile.targetRoles,
    locations: profile.locations,
    skills: mergedSkills,
    experiences: experienceEntries.map((entry) => ({
      id: entry.id,
      companyName: entry.companyName.trim() || null,
      companyUrl: entry.companyUrl.trim() || null,
      title: entry.title.trim() || null,
      employmentType: entry.employmentType.trim() || null,
      location: entry.location.trim() || null,
      workMode: entry.workMode || null,
      startDate: entry.startDate.trim() || null,
      endDate: entry.isCurrent ? null : entry.endDate.trim() || null,
      isCurrent: entry.isCurrent,
      isDraft: !entry.companyName.trim() || !entry.title.trim(),
      summary: entry.summary.trim() || null,
      achievements: parseListInput(entry.achievements),
      skills: parseListInput(entry.skills),
      domainTags: parseListInput(entry.domainTags),
      peopleManagementScope: entry.peopleManagementScope.trim() || null,
      ownershipScope: entry.ownershipScope.trim() || null
    })),
    education: educationEntries.map((entry) => ({
      id: entry.id,
      schoolName: entry.schoolName.trim() || null,
      degree: entry.degree.trim() || null,
      fieldOfStudy: entry.fieldOfStudy.trim() || null,
      location: entry.location.trim() || null,
      startDate: entry.startDate.trim() || null,
      endDate: entry.endDate.trim() || null,
      isDraft: !entry.schoolName.trim(),
      summary: entry.summary.trim() || null
    })),
    certifications: certificationEntries.map((entry) => ({
      id: entry.id,
      name: entry.name.trim() || null,
      issuer: entry.issuer.trim() || null,
      issueDate: entry.issueDate.trim() || null,
      expiryDate: entry.expiryDate.trim() || null,
      credentialUrl: entry.credentialUrl.trim() || null,
      isDraft: !entry.name.trim()
    })),
    links: linkEntries.map((entry) => ({
      id: entry.id,
      label: entry.label.trim() || null,
      url: entry.url.trim() || null,
      kind: entry.kind ? (entry.kind as CandidateProfile['links'][number]['kind']) : null,
      isDraft: !entry.label.trim() || !entry.url.trim()
    })),
    projects: projectEntries.filter((entry) => entry.name.trim()).map((entry) => ({
      id: entry.id,
      name: entry.name.trim(),
      projectType: entry.projectType.trim() || null,
      summary: entry.summary.trim() || null,
      role: entry.role.trim() || null,
      skills: parseListInput(entry.skills),
      outcome: entry.outcome.trim() || null,
      projectUrl: entry.projectUrl.trim() || null,
      repositoryUrl: entry.repositoryUrl.trim() || null,
      caseStudyUrl: entry.caseStudyUrl.trim() || null
    })),
    spokenLanguages: languageEntries.filter((entry) => entry.language.trim()).map((entry) => ({
      id: entry.id,
      language: entry.language.trim(),
      proficiency: entry.proficiency.trim() || null,
      interviewPreference: entry.interviewPreference,
      notes: entry.notes.trim() || null
    }))
  }

  const handleSaveProfile = () => {
    if (parsedYearsExperience === null) {
      setValidationMessage('Years of experience must be a whole number greater than or equal to 0.')
      return
    }

    if (eligibilityForm.noticePeriodDays.trim() && parsedNoticePeriodDays === null) {
      setValidationMessage('Notice period must be a whole number greater than or equal to 0.')
      return
    }

    setValidationMessage(null)
    onSaveProfile(saveProfilePayload)
  }

  const handleSaveSearchPreferences = () => {
    if (preferenceForm.minimumSalaryUsd.trim() && parsedMinimumSalaryUsd === null) {
      setValidationMessage('Minimum salary must be a whole number greater than or equal to 0.')
      return
    }

    if (preferenceForm.targetSalaryUsd.trim() && parsedTargetSalaryUsd === null) {
      setValidationMessage('Target salary must be a whole number greater than or equal to 0.')
      return
    }

    setValidationMessage(null)
    onSaveSearchPreferences({
      ...searchPreferences,
      targetRoles: parseListInput(preferenceForm.targetRoles),
      jobFamilies: parseListInput(preferenceForm.jobFamilies),
      locations: parseListInput(preferenceForm.locations),
      excludedLocations: parseListInput(preferenceForm.excludedLocations),
      workModes: preferenceForm.workModes,
      seniorityLevels: parseListInput(preferenceForm.seniorityLevels),
      targetIndustries: parseListInput(preferenceForm.targetIndustries),
      targetCompanyStages: parseListInput(preferenceForm.targetCompanyStages),
      employmentTypes: parseListInput(preferenceForm.employmentTypes),
      minimumSalaryUsd: parsedMinimumSalaryUsd,
      targetSalaryUsd: parsedTargetSalaryUsd,
      salaryCurrency: preferenceForm.salaryCurrency.trim() || null,
      approvalMode: searchPreferences.approvalMode,
      tailoringMode: preferenceForm.tailoringMode,
      companyBlacklist: parseListInput(preferenceForm.companyBlacklist),
      companyWhitelist: parseListInput(preferenceForm.companyWhitelist)
    })
  }

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Profile"
        title="Candidate setup"
        description="Structured candidate data for ATS-safe applications, stronger tailoring, and future field-by-field automation across profile, discovery, and apply flows."
      />

      <div className="profile-layout">
        <section className="panel panel-spacious profile-panel-summary">
          <p className="section-label">Profile summary</p>
          <div className="two-up-grid">
            <div>
              <h2>{profile.preferredDisplayName ?? profile.fullName}</h2>
              <p className="profile-headline">{profile.headline}</p>
              <div className="chip-row chip-row-compact">
                {profile.email ? <span className="chip">{profile.email}</span> : null}
                {profile.secondaryEmail ? <span className="chip">Secondary email on file</span> : null}
                {profile.phone ? <span className="chip">{profile.phone}</span> : null}
                {profile.timeZone ? <span className="chip">{profile.timeZone}</span> : null}
              </div>
            </div>
            <div className="stat-grid">
              <div><span>Experience</span><strong>{profile.yearsExperience} years</strong></div>
              <div><span>Base location</span><strong>{profile.currentLocation}</strong></div>
              <div><span>Projects</span><strong>{profile.projects.length}</strong></div>
              <div><span>Languages</span><strong>{profile.spokenLanguages.length}</strong></div>
            </div>
          </div>
          <p className="body-copy">{profile.professionalSummary.shortValueProposition ?? profile.summary}</p>
          <div className="chip-row">
            {profile.skillGroups.highlightedSkills.length > 0
              ? profile.skillGroups.highlightedSkills.map((skill) => <span key={skill} className="chip">{skill}</span>)
              : profile.skills.map((skill) => <span key={skill} className="chip">{skill}</span>)}
          </div>
        </section>

        <section className="panel panel-spacious profile-panel-resume">
          <div className="panel-header-row">
            <p className="section-label">Resume intake and provenance</p>
            <span className={`status-chip ${agentProvider.kind === 'openai_compatible' ? 'tone-positive' : 'tone-active'}`}>{agentProvider.label}</span>
          </div>
          <div className="resume-dropzone">
            <strong>{profile.baseResume.fileName}</strong>
            <span>Uploaded {formatDateOnly(profile.baseResume.uploadedAt)}</span>
            <span className={`status-chip ${getAssetTone(profile.baseResume.extractionStatus === 'ready' ? 'ready' : profile.baseResume.extractionStatus === 'failed' ? 'failed' : profile.baseResume.extractionStatus === 'needs_text' ? 'queued' : 'generating')}`}>{formatStatusLabel(profile.baseResume.extractionStatus)}</span>
            {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? (
              <div className="resume-analysis-inline">
                <span className={`status-chip ${profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'tone-positive' : 'tone-active'}`}>
                  {profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'AI parsed' : 'Fallback parsed'}
                </span>
                <span className="meta-copy">{profile.baseResume.analysisProviderLabel}</span>
              </div>
            ) : null}
            <div className="button-row">
              <button className="secondary-action compact-action" disabled={busy} onClick={onImportResume} type="button">Replace resume</button>
              <button className="primary-action compact-action" disabled={busy || !profileForm.resumeText.trim() || profileForm.resumeText.trim() !== (profile.baseResume.textContent ?? '')} onClick={onAnalyzeProfileFromResume} type="button">Analyze saved resume text</button>
            </div>
          </div>
          <p className="muted-copy">{profile.baseResume.textContent ? 'Stored resume text is ready for structured extraction, tailoring, and validation.' : 'PDF, DOCX, TXT, and Markdown resumes can be stored locally. If extraction misses content, paste clean text below so the agent can continue.'}</p>
          {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? <div className="resume-analysis-summary"><p className="body-copy body-copy-compact">{formatResumeAnalysisSummary(profile)}</p></div> : null}
          {profile.baseResume.analysisWarnings.length > 0 ? <PreferenceList label="Review notes" values={profile.baseResume.analysisWarnings} /> : null}
        </section>
      </div>

      <section className="panel panel-spacious profile-panel-overview">
        <div className="panel-header-row">
          <p className="section-label">Structured coverage</p>
          <span className="section-badge">Plan-backed fields now live in code</span>
        </div>
        <div className="profile-secondary-grid">
          <div className="panel-muted profile-subsection">
            <p className="section-label">Candidate record</p>
            <div className="stat-grid">
              <div><span>Experience entries</span><strong>{profile.experiences.length}</strong></div>
              <div><span>Education entries</span><strong>{profile.education.length}</strong></div>
              <div><span>Projects</span><strong>{profile.projects.length}</strong></div>
              <div><span>Proof links</span><strong>{profile.links.length}</strong></div>
            </div>
          </div>
          <div className="panel-muted profile-subsection">
            <p className="section-label">Targeting rules</p>
            <div className="settings-grid preference-summary-grid">
              <PreferenceList label="Target roles" values={searchPreferences.targetRoles} />
              <PreferenceList label="Job families" values={searchPreferences.jobFamilies} />
              <PreferenceList label="Locations" values={searchPreferences.locations} />
              <PreferenceList label="Industries" values={searchPreferences.targetIndustries} />
            </div>
          </div>
        </div>
      </section>

      <div className="profile-stack-layout">
        <section className="panel panel-spacious">
          <div className="panel-header-row">
            <div>
              <p className="section-label">Identity and contact</p>
              <p className="muted-copy">Explicit ATS-safe header fields, contact channels, location details, and public profile links.</p>
            </div>
            <span className="section-badge">Identity</span>
          </div>
          <div className="form-grid two-column-form-grid">
            <label className="field-stack"><span className="section-label">First name</span><input className="input-shell" value={profileForm.firstName} onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Last name</span><input className="input-shell" value={profileForm.lastName} onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Middle name</span><input className="input-shell" value={profileForm.middleName} onChange={(event) => setProfileForm((current) => ({ ...current, middleName: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Preferred display name</span><input className="input-shell" value={profileForm.preferredDisplayName} onChange={(event) => setProfileForm((current) => ({ ...current, preferredDisplayName: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Headline</span><input className="input-shell" value={profileForm.headline} onChange={(event) => setProfileForm((current) => ({ ...current, headline: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Years of experience</span><input className="input-shell" min="0" step="1" type="number" value={profileForm.yearsExperience} onChange={(event) => setProfileForm((current) => ({ ...current, yearsExperience: event.target.value === "" ? "" : Number.isInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 0 ? String(event.target.valueAsNumber) : current.yearsExperience }))} /></label>
            <label className="field-stack"><span className="section-label">Primary email</span><input className="input-shell" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Secondary email</span><input className="input-shell" value={profileForm.secondaryEmail} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryEmail: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Phone</span><input className="input-shell" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Timezone</span><input className="input-shell" value={profileForm.timeZone} onChange={(event) => setProfileForm((current) => ({ ...current, timeZone: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">City</span><input className="input-shell" value={profileForm.currentCity} onChange={(event) => setProfileForm((current) => ({ ...current, currentCity: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Region / state</span><input className="input-shell" value={profileForm.currentRegion} onChange={(event) => setProfileForm((current) => ({ ...current, currentRegion: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Country</span><input className="input-shell" value={profileForm.currentCountry} onChange={(event) => setProfileForm((current) => ({ ...current, currentCountry: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Fallback location label</span><input className="input-shell" value={profileForm.currentLocation} onChange={(event) => setProfileForm((current) => ({ ...current, currentLocation: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">LinkedIn URL</span><input className="input-shell" value={profileForm.linkedinUrl} onChange={(event) => setProfileForm((current) => ({ ...current, linkedinUrl: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Portfolio URL</span><input className="input-shell" value={profileForm.portfolioUrl} onChange={(event) => setProfileForm((current) => ({ ...current, portfolioUrl: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">GitHub URL</span><input className="input-shell" value={profileForm.githubUrl} onChange={(event) => setProfileForm((current) => ({ ...current, githubUrl: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Personal website</span><input className="input-shell" value={profileForm.personalWebsiteUrl} onChange={(event) => setProfileForm((current) => ({ ...current, personalWebsiteUrl: event.target.value }))} /></label>
            <label className="field-stack two-column-span"><span className="section-label">Resume text for agents</span><textarea className="textarea-shell" rows={8} value={profileForm.resumeText} onChange={(event) => setProfileForm((current) => ({ ...current, resumeText: event.target.value }))} /></label>
          </div>
        </section>

        <div className="profile-edit-layout">
          <section className="panel panel-spacious">
            <div className="panel-header-row"><div><p className="section-label">Work eligibility and logistics</p><p className="muted-copy">Structured screening answers for authorization, relocation, travel, and availability.</p></div><span className="section-badge">Eligibility</span></div>
            <div className="form-grid two-column-form-grid">
              <label className="field-stack"><span className="section-label">Authorized work countries</span><textarea className="textarea-shell compact-textarea" rows={3} value={eligibilityForm.authorizedWorkCountries} onChange={(event) => setEligibilityForm((current) => ({ ...current, authorizedWorkCountries: event.target.value }))} /></label>
              <label className="field-stack"><span className="section-label">Preferred relocation regions</span><textarea className="textarea-shell compact-textarea" rows={3} value={eligibilityForm.preferredRelocationRegions} onChange={(event) => setEligibilityForm((current) => ({ ...current, preferredRelocationRegions: event.target.value }))} /></label>
              <label className="field-stack"><span className="section-label">Requires visa sponsorship</span><select className="select-shell" value={eligibilityForm.requiresVisaSponsorship} onChange={(event) => setEligibilityForm((current) => ({ ...current, requiresVisaSponsorship: event.target.value as BooleanSelectValue }))}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label className="field-stack"><span className="section-label">Willing to relocate</span><select className="select-shell" value={eligibilityForm.willingToRelocate} onChange={(event) => setEligibilityForm((current) => ({ ...current, willingToRelocate: event.target.value as BooleanSelectValue }))}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label className="field-stack"><span className="section-label">Willing to travel</span><select className="select-shell" value={eligibilityForm.willingToTravel} onChange={(event) => setEligibilityForm((current) => ({ ...current, willingToTravel: event.target.value as BooleanSelectValue }))}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label className="field-stack"><span className="section-label">Remote eligible</span><select className="select-shell" value={eligibilityForm.remoteEligible} onChange={(event) => setEligibilityForm((current) => ({ ...current, remoteEligible: event.target.value as BooleanSelectValue }))}><option value="">Not set</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label className="field-stack"><span className="section-label">Notice period (days)</span><input className="input-shell" min="0" type="number" value={eligibilityForm.noticePeriodDays} onChange={(event) => setEligibilityForm((current) => ({ ...current, noticePeriodDays: event.target.value }))} /></label>
              <label className="field-stack"><span className="section-label">Available start date</span><input className="input-shell" placeholder="YYYY-MM-DD" value={eligibilityForm.availableStartDate} onChange={(event) => setEligibilityForm((current) => ({ ...current, availableStartDate: event.target.value }))} /></label>
              <label className="field-stack two-column-span"><span className="section-label">Security clearance</span><input className="input-shell" value={eligibilityForm.securityClearance} onChange={(event) => setEligibilityForm((current) => ({ ...current, securityClearance: event.target.value }))} /></label>
            </div>
          </section>

          <section className="panel panel-spacious">
            <div className="panel-header-row"><div><p className="section-label">Professional summary layer</p><p className="muted-copy">Separate reusable narrative blocks from the raw factual record.</p></div><span className="section-badge">Narrative</span></div>
            <div className="form-grid">
              <label className="field-stack"><span className="section-label">Short value proposition</span><textarea className="textarea-shell compact-textarea" rows={3} value={summaryForm.shortValueProposition} onChange={(event) => setSummaryForm((current) => ({ ...current, shortValueProposition: event.target.value }))} /></label>
              <label className="field-stack"><span className="section-label">Full summary</span><textarea className="textarea-shell" rows={5} value={summaryForm.fullSummary} onChange={(event) => setSummaryForm((current) => ({ ...current, fullSummary: event.target.value }))} /></label>
              <div className="form-grid two-column-form-grid">
                <label className="field-stack"><span className="section-label">Career themes</span><textarea className="textarea-shell compact-textarea" rows={4} value={summaryForm.careerThemes} onChange={(event) => setSummaryForm((current) => ({ ...current, careerThemes: event.target.value }))} /></label>
                <label className="field-stack"><span className="section-label">Strengths / differentiators</span><textarea className="textarea-shell compact-textarea" rows={4} value={summaryForm.strengths} onChange={(event) => setSummaryForm((current) => ({ ...current, strengths: event.target.value }))} /></label>
                <label className="field-stack"><span className="section-label">Leadership summary</span><textarea className="textarea-shell compact-textarea" rows={4} value={summaryForm.leadershipSummary} onChange={(event) => setSummaryForm((current) => ({ ...current, leadershipSummary: event.target.value }))} /></label>
                <label className="field-stack"><span className="section-label">Domain focus</span><textarea className="textarea-shell compact-textarea" rows={4} value={summaryForm.domainFocusSummary} onChange={(event) => setSummaryForm((current) => ({ ...current, domainFocusSummary: event.target.value }))} /></label>
              </div>
            </div>
          </section>
        </div>

        <section className="panel panel-spacious">
          <div className="panel-header-row"><div><p className="section-label">Skills and evidence</p><p className="muted-copy">Maintain searchable skill groups and highlighted evidence alongside the general skills list.</p></div><span className="section-badge">Skills</span></div>
          <div className="form-grid two-column-form-grid">
            <label className="field-stack"><span className="section-label">General skills</span><textarea className="textarea-shell compact-textarea" rows={4} value={profileForm.skills} onChange={(event) => setProfileForm((current) => ({ ...current, skills: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Highlighted skills for target roles</span><textarea className="textarea-shell compact-textarea" rows={4} value={skillGroupForm.highlightedSkills} onChange={(event) => setSkillGroupForm((current) => ({ ...current, highlightedSkills: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Core skills</span><textarea className="textarea-shell compact-textarea" rows={4} value={skillGroupForm.coreSkills} onChange={(event) => setSkillGroupForm((current) => ({ ...current, coreSkills: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Tools / platforms</span><textarea className="textarea-shell compact-textarea" rows={4} value={skillGroupForm.tools} onChange={(event) => setSkillGroupForm((current) => ({ ...current, tools: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Languages / frameworks</span><textarea className="textarea-shell compact-textarea" rows={4} value={skillGroupForm.languagesAndFrameworks} onChange={(event) => setSkillGroupForm((current) => ({ ...current, languagesAndFrameworks: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Soft skills</span><textarea className="textarea-shell compact-textarea" rows={4} value={skillGroupForm.softSkills} onChange={(event) => setSkillGroupForm((current) => ({ ...current, softSkills: event.target.value }))} /></label>
          </div>
        </section>

        <section className="panel panel-spacious">
          <div className="panel-header-row"><div><p className="section-label">Experience timeline</p><p className="muted-copy">Field-by-field reusable work history for ATS alignment, tailoring, and future form-fill.</p></div><button className="secondary-action compact-action" disabled={busy} onClick={addExperienceEntry} type="button">Add experience</button></div>
          <div className="record-stack">
            {experienceEntries.length > 0 ? experienceEntries.map((entry, index) => (
              <article key={entry.id} className="record-card">
                <div className="panel-header-row"><p className="section-label">Role {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setExperienceEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                <div className="form-grid two-column-form-grid">
                  <label className="field-stack"><span className="section-label">Company</span><input className="input-shell" value={entry.companyName} onChange={(event) => updateExperienceEntry(entry.id, 'companyName', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Company URL</span><input className="input-shell" value={entry.companyUrl} onChange={(event) => updateExperienceEntry(entry.id, 'companyUrl', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Title</span><input className="input-shell" value={entry.title} onChange={(event) => updateExperienceEntry(entry.id, 'title', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Employment type</span><input className="input-shell" value={entry.employmentType} onChange={(event) => updateExperienceEntry(entry.id, 'employmentType', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Location</span><input className="input-shell" value={entry.location} onChange={(event) => updateExperienceEntry(entry.id, 'location', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Work mode</span><select className="select-shell" value={entry.workMode} onChange={(event) => updateExperienceEntry(entry.id, 'workMode', event.target.value as WorkMode | '')}><option value="">Select mode</option>{workModeValues.map((workMode) => <option key={workMode} value={workMode}>{formatStatusLabel(workMode)}</option>)}</select></label>
                  <label className="field-stack"><span className="section-label">Start date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.startDate} onChange={(event) => updateExperienceEntry(entry.id, 'startDate', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">End date</span><input className="input-shell" disabled={entry.isCurrent} placeholder="YYYY-MM" value={entry.endDate} onChange={(event) => updateExperienceEntry(entry.id, 'endDate', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Domain / industry tags</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.domainTags} onChange={(event) => updateExperienceEntry(entry.id, 'domainTags', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">People-management scope</span><input className="input-shell" value={entry.peopleManagementScope} onChange={(event) => updateExperienceEntry(entry.id, 'peopleManagementScope', event.target.value)} /></label>
                  <label className="field-stack two-column-span"><span className="section-label">Ownership / budget scope</span><input className="input-shell" value={entry.ownershipScope} onChange={(event) => updateExperienceEntry(entry.id, 'ownershipScope', event.target.value)} /></label>
                  <label className="checkbox-row two-column-span"><input checked={entry.isCurrent} onChange={(event) => updateExperienceEntry(entry.id, 'isCurrent', event.target.checked)} type="checkbox" /><span>Current role</span></label>
                  <label className="field-stack two-column-span"><span className="section-label">Role summary</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.summary} onChange={(event) => updateExperienceEntry(entry.id, 'summary', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Achievements</span><textarea className="textarea-shell" rows={4} value={entry.achievements} onChange={(event) => updateExperienceEntry(entry.id, 'achievements', event.target.value)} /></label>
                  <label className="field-stack"><span className="section-label">Skills used</span><textarea className="textarea-shell compact-textarea" rows={4} value={entry.skills} onChange={(event) => updateExperienceEntry(entry.id, 'skills', event.target.value)} /></label>
                </div>
              </article>
            )) : <EmptyState title="No structured experience yet" description="Add each role with dedicated fields so tailoring and future form-fill flows do not depend on one large text box." />}
          </div>
        </section>

        <div className="profile-edit-layout">
          <section className="panel panel-spacious">
            <div className="panel-header-row"><div><p className="section-label">Education and credentials</p><p className="muted-copy">Schools, degrees, certifications, and qualification metadata stored as explicit records.</p></div><button className="secondary-action compact-action" disabled={busy} onClick={addEducationEntry} type="button">Add education</button></div>
            <div className="record-stack">
              {educationEntries.length > 0 ? educationEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row"><p className="section-label">Education {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setEducationEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">School</span><input className="input-shell" value={entry.schoolName} onChange={(event) => updateEducationEntry(entry.id, 'schoolName', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Degree</span><input className="input-shell" value={entry.degree} onChange={(event) => updateEducationEntry(entry.id, 'degree', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Field of study</span><input className="input-shell" value={entry.fieldOfStudy} onChange={(event) => updateEducationEntry(entry.id, 'fieldOfStudy', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Location</span><input className="input-shell" value={entry.location} onChange={(event) => updateEducationEntry(entry.id, 'location', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Start date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.startDate} onChange={(event) => updateEducationEntry(entry.id, 'startDate', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">End date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.endDate} onChange={(event) => updateEducationEntry(entry.id, 'endDate', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Notes</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.summary} onChange={(event) => updateEducationEntry(entry.id, 'summary', event.target.value)} /></label>
                  </div>
                </article>
              )) : <EmptyState title="No education records yet" description="Add schools and credentials here instead of burying them in one freeform summary box." />}
            </div>
            <div className="button-row"><button className="secondary-action compact-action" disabled={busy} onClick={addCertificationEntry} type="button">Add certification</button></div>
            <div className="record-stack">
              {certificationEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row"><p className="section-label">Certification {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setCertificationEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Name</span><input className="input-shell" value={entry.name} onChange={(event) => updateCertificationEntry(entry.id, 'name', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Issuer</span><input className="input-shell" value={entry.issuer} onChange={(event) => updateCertificationEntry(entry.id, 'issuer', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Issue date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.issueDate} onChange={(event) => updateCertificationEntry(entry.id, 'issueDate', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Expiry date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.expiryDate} onChange={(event) => updateCertificationEntry(entry.id, 'expiryDate', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Credential URL</span><input className="input-shell" value={entry.credentialUrl} onChange={(event) => updateCertificationEntry(entry.id, 'credentialUrl', event.target.value)} /></label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel panel-spacious">
            <div className="panel-header-row"><div><p className="section-label">Projects, proof, and languages</p><p className="muted-copy">Portfolio projects, public links, and communication signals stored separately from the summary.</p></div><div className="button-row"><button className="secondary-action compact-action" disabled={busy} onClick={addProjectEntry} type="button">Add project</button><button className="secondary-action compact-action" disabled={busy} onClick={addLinkEntry} type="button">Add link</button><button className="secondary-action compact-action" disabled={busy} onClick={addLanguageEntry} type="button">Add language</button></div></div>
            <div className="record-stack">
              {projectEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row"><p className="section-label">Project {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setProjectEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Project name</span><input className="input-shell" value={entry.name} onChange={(event) => updateProjectEntry(entry.id, 'name', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Project type</span><input className="input-shell" value={entry.projectType} onChange={(event) => updateProjectEntry(entry.id, 'projectType', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Role</span><input className="input-shell" value={entry.role} onChange={(event) => updateProjectEntry(entry.id, 'role', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Skills used</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.skills} onChange={(event) => updateProjectEntry(entry.id, 'skills', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Summary</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.summary} onChange={(event) => updateProjectEntry(entry.id, 'summary', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Outcome / impact</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.outcome} onChange={(event) => updateProjectEntry(entry.id, 'outcome', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Project URL</span><input className="input-shell" value={entry.projectUrl} onChange={(event) => updateProjectEntry(entry.id, 'projectUrl', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Repository URL</span><input className="input-shell" value={entry.repositoryUrl} onChange={(event) => updateProjectEntry(entry.id, 'repositoryUrl', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Case-study URL</span><input className="input-shell" value={entry.caseStudyUrl} onChange={(event) => updateProjectEntry(entry.id, 'caseStudyUrl', event.target.value)} /></label>
                  </div>
                </article>
              ))}
              {linkEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row"><p className="section-label">Link {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setLinkEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Label</span><input className="input-shell" value={entry.label} onChange={(event) => updateLinkEntry(entry.id, 'label', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Kind</span><select className="select-shell" value={entry.kind} onChange={(event) => updateLinkEntry(entry.id, 'kind', event.target.value)}><option value="">Select kind</option>{candidateLinkKindValues.map((kind) => <option key={kind} value={kind}>{formatStatusLabel(kind)}</option>)}</select></label>
                    <label className="field-stack two-column-span"><span className="section-label">URL</span><input className="input-shell" value={entry.url} onChange={(event) => updateLinkEntry(entry.id, 'url', event.target.value)} /></label>
                  </div>
                </article>
              ))}
              {languageEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row"><p className="section-label">Language {index + 1}</p><button className="ghost-action compact-action" disabled={busy} onClick={() => setLanguageEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button></div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Language</span><input className="input-shell" value={entry.language} onChange={(event) => updateLanguageEntry(entry.id, 'language', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Proficiency</span><input className="input-shell" value={entry.proficiency} onChange={(event) => updateLanguageEntry(entry.id, 'proficiency', event.target.value)} /></label>
                    <label className="checkbox-row"><input checked={entry.interviewPreference} onChange={(event) => updateLanguageEntry(entry.id, 'interviewPreference', event.target.checked)} type="checkbox" /><span>Preferred interview language</span></label>
                    <label className="field-stack two-column-span"><span className="section-label">Notes</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.notes} onChange={(event) => updateLanguageEntry(entry.id, 'notes', event.target.value)} /></label>
                  </div>
                </article>
              ))}
              {projectEntries.length === 0 && linkEntries.length === 0 && languageEntries.length === 0 ? <EmptyState title="No supporting evidence yet" description="Add projects, links, and spoken languages as first-class records instead of burying them in general notes." /> : null}
            </div>
          </section>
        </div>

        <section className="panel panel-spacious">
          <div className="panel-header-row"><div><p className="section-label">Discovery preferences</p><p className="muted-copy">Role targeting stays separate from the canonical candidate record, but is now richer and more explicit.</p></div><span className="section-badge">Targeting</span></div>
          <div className="form-grid two-column-form-grid">
            <label className="field-stack"><span className="section-label">Target roles</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.targetRoles} onChange={(event) => setPreferenceForm((current) => ({ ...current, targetRoles: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Job families</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.jobFamilies} onChange={(event) => setPreferenceForm((current) => ({ ...current, jobFamilies: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Preferred locations</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.locations} onChange={(event) => setPreferenceForm((current) => ({ ...current, locations: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Excluded locations</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.excludedLocations} onChange={(event) => setPreferenceForm((current) => ({ ...current, excludedLocations: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Seniority</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.seniorityLevels} onChange={(event) => setPreferenceForm((current) => ({ ...current, seniorityLevels: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Employment types</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.employmentTypes} onChange={(event) => setPreferenceForm((current) => ({ ...current, employmentTypes: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Industries</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.targetIndustries} onChange={(event) => setPreferenceForm((current) => ({ ...current, targetIndustries: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Company stages / sizes</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.targetCompanyStages} onChange={(event) => setPreferenceForm((current) => ({ ...current, targetCompanyStages: event.target.value }))} /></label>
            <div className="field-stack"><span className="section-label">Work modes</span><div className="checkbox-grid">{workModeValues.map((workMode) => (<label key={workMode} className="checkbox-row"><input checked={preferenceForm.workModes.includes(workMode)} onChange={(event) => setPreferenceForm((current) => ({ ...current, workModes: event.target.checked ? [...current.workModes, workMode] : current.workModes.filter((value) => value !== workMode) }))} type="checkbox" /><span>{formatStatusLabel(workMode)}</span></label>))}</div></div>
            <label className="field-stack"><span className="section-label">Tailoring mode</span><select className="select-shell" value={preferenceForm.tailoringMode} onChange={(event) => setPreferenceForm((current) => ({ ...current, tailoringMode: event.target.value as JobSearchPreferences['tailoringMode'] }))}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
            <label className="field-stack"><span className="section-label">Minimum salary</span><input className="input-shell" min="0" step="1" type="number" value={preferenceForm.minimumSalaryUsd} onChange={(event) => setPreferenceForm((current) => ({ ...current, minimumSalaryUsd: event.target.value === "" ? "" : Number.isInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 0 ? String(event.target.valueAsNumber) : current.minimumSalaryUsd }))} /></label>
            <label className="field-stack"><span className="section-label">Target salary</span><input className="input-shell" min="0" step="1" type="number" value={preferenceForm.targetSalaryUsd} onChange={(event) => setPreferenceForm((current) => ({ ...current, targetSalaryUsd: event.target.value === "" ? "" : Number.isInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 0 ? String(event.target.valueAsNumber) : current.targetSalaryUsd }))} /></label>
            <label className="field-stack"><span className="section-label">Salary currency</span><input className="input-shell" value={preferenceForm.salaryCurrency} onChange={(event) => setPreferenceForm((current) => ({ ...current, salaryCurrency: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Preferred companies</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.companyWhitelist} onChange={(event) => setPreferenceForm((current) => ({ ...current, companyWhitelist: event.target.value }))} /></label>
            <label className="field-stack"><span className="section-label">Blocked companies</span><textarea className="textarea-shell compact-textarea" rows={3} value={preferenceForm.companyBlacklist} onChange={(event) => setPreferenceForm((current) => ({ ...current, companyBlacklist: event.target.value }))} /></label>
          </div>
          <div className="button-row">
            <button className="primary-action" disabled={busy} onClick={handleSaveProfile} type="button">Save profile</button>
            <button className="secondary-action" disabled={busy} onClick={handleSaveSearchPreferences} type="button">Save preferences</button>
          </div>
          {validationMessage ? <p className="muted-copy">{validationMessage}</p> : null}
          {actionState.message ? <p className="muted-copy">{actionState.message}</p> : null}
        </section>
      </div>
    </section>
  )
}

function DiscoveryScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  browserSession: BrowserSessionState
  jobs: readonly SavedJob[]
  onDismissJob: (jobId: string) => void
  onOpenBrowserSession: () => void
  onQueueJob: (jobId: string) => void
  onRefreshDiscovery: () => void
  searchPreferences: JobSearchPreferences
  selectedJob: SavedJob | null
  onSelectJob: (jobId: string) => void
}) {
  const {
    actionState,
    browserSession,
    busy,
    jobs,
    onDismissJob,
    onOpenBrowserSession,
    onQueueJob,
    onRefreshDiscovery,
    onSelectJob,
    searchPreferences,
    selectedJob
  } = props

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Discovery"
        title="LinkedIn results"
        description="Search preferences, browser session status, and the highest-fit saved jobs for the current MVP source adapter."
      />

      <div className="three-column-layout discovery-layout">
        <section className="panel panel-shell column-stack">
          <p className="section-label">Search controls</p>
          <div className="status-card">
            <span className={`status-chip ${getSessionTone(browserSession)}`}>
              {browserSession.label}
            </span>
            <p className="muted-copy">{browserSession.detail}</p>
          </div>
          <PreferenceList label="Roles" values={searchPreferences.targetRoles} />
          <PreferenceList label="Locations" values={searchPreferences.locations} />
          <PreferenceList
            label="Work modes"
            values={searchPreferences.workModes.map(formatStatusLabel)}
          />
          {browserSession.driver !== 'catalog_seed' ? (
            <button className="secondary-action" disabled={busy} onClick={onOpenBrowserSession} type="button">
              Open dedicated Chrome profile
            </button>
          ) : null}
          <button className="primary-action" disabled={busy} onClick={onRefreshDiscovery} type="button">
            Run LinkedIn discovery
          </button>
          {actionState.message ? <p className="muted-copy">{actionState.message}</p> : null}
        </section>

        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Saved results</p>
            <span className="section-badge">{formatCountLabel(jobs.length, 'job')}</span>
          </div>
          {browserSession.status !== 'ready' ? (
            <EmptyState
              title="LinkedIn session needs attention"
              description="Discovery is blocked until the browser runtime reports a ready session for the LinkedIn adapter."
            />
          ) : null}
          {browserSession.status === 'ready' && jobs.length === 0 ? (
            <EmptyState
              title="No jobs saved yet"
              description="The discovery surface is wired and ready, but there are no matching jobs in the current repository state."
            />
          ) : null}
          {browserSession.status === 'ready' && jobs.length > 0 ? (
            <div className="stack-list">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  className={`list-card ${selectedJob?.id === job.id ? 'list-card-active' : ''}`}
                  onClick={() => onSelectJob(job.id)}
                  type="button"
                >
                  <div className="list-card-topline">
                    <strong>{job.title}</strong>
                    <span className="score-pill">{job.matchAssessment.score}</span>
                  </div>
                  <span className="muted-copy">
                    {job.company} - {job.location}
                  </span>
                  <div className="list-chip-row">
                    <span className={`status-chip ${getApplicationTone(job.status)}`}>
                      {formatStatusLabel(job.status)}
                    </span>
                    <span className="status-chip tone-muted">{formatStatusLabel(job.applyPath)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Selected job</p>
            <span className={`status-chip ${selectedJob ? getApplicationTone(selectedJob.status) : 'tone-muted'}`}>
              {selectedJob ? formatStatusLabel(selectedJob.status) : 'No selection'}
            </span>
          </div>
          {selectedJob ? (
            <>
              <h2>{selectedJob.title}</h2>
              <p className="muted-copy">
                {selectedJob.company} - {selectedJob.location}
              </p>
              <div className="stat-grid">
                <div>
                  <span>Fit score</span>
                  <strong>{selectedJob.matchAssessment.score}</strong>
                </div>
                <div>
                  <span>Posted</span>
                  <strong>{formatDateOnly(selectedJob.postedAt)}</strong>
                </div>
              </div>
              <p className="body-copy">{selectedJob.summary}</p>
              <PreferenceList label="Discovery mode" values={[formatStatusLabel(selectedJob.discoveryMethod)]} compact />
              <PreferenceList label="Key skills" values={selectedJob.keySkills} compact />
              <PreferenceList label="Fit reasons" values={selectedJob.matchAssessment.reasons} />
              <PreferenceList label="Watch-outs" values={selectedJob.matchAssessment.gaps} />
              <div className="button-row">
                <button
                  className="primary-action"
                  disabled={busy}
                  onClick={() => onQueueJob(selectedJob.id)}
                  type="button"
                >
                  Save to review queue
                </button>
                <button
                  className="secondary-action"
                  disabled={busy}
                  onClick={() => onDismissJob(selectedJob.id)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="Choose a job result"
              description="Select a saved LinkedIn result to inspect match reasons and move it toward resume tailoring."
            />
          )}
        </section>
      </div>
    </section>
  )
}

function ReviewQueueScreen(props: {
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  browserSession: BrowserSessionState
  onApproveApply: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  queue: readonly ReviewQueueItem[]
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
  selectedAsset: TailoredAsset | null
  onSelectItem: (jobId: string) => void
}) {
  const {
    actionState,
    browserSession,
    busy,
    onApproveApply,
    onGenerateResume,
    onSelectItem,
    queue,
    selectedAsset,
    selectedItem,
    selectedJob
  } = props

  const needsGeneration =
    selectedItem?.assetStatus === 'not_started' || selectedItem?.assetStatus === 'failed'
  const isGenerating =
    selectedItem?.assetStatus === 'generating' || selectedItem?.assetStatus === 'queued'
  const showGenerationState = needsGeneration || isGenerating

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Review Queue"
        title="Tailored asset review"
        description="A supervised queue for generated resume variants before the first supported Easy Apply automation path begins."
      />

      <div className="three-column-layout review-layout">
        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Queued jobs</p>
            <span className="section-badge">{formatCountLabel(queue.length, 'item')}</span>
          </div>
          {queue.length === 0 ? (
            <EmptyState
              title="No jobs in review yet"
              description="Discovery and tailoring are wired to support review queue items once jobs move beyond the shortlist stage."
            />
          ) : (
            <div className="stack-list">
              {queue.map((item) => (
                <button
                  key={item.jobId}
                  className={`list-card ${selectedItem?.jobId === item.jobId ? 'list-card-active' : ''}`}
                  onClick={() => onSelectItem(item.jobId)}
                  type="button"
                >
                  <div className="list-card-topline">
                    <strong>{item.title}</strong>
                    <span className={`status-chip ${getAssetTone(item.assetStatus)}`}>
                      {formatStatusLabel(item.assetStatus)}
                    </span>
                  </div>
                  <span className="muted-copy">
                    {item.company} - {item.location}
                  </span>
                  <div className="progress-row">
                    <div className="progress-track">
                      <span style={{ width: `${item.progressPercent ?? 0}%` }} />
                    </div>
                    <span className="meta-copy">{item.progressPercent ?? 0}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel panel-shell panel-preview column-stack">
          <div className="panel-header-row">
            <p className="section-label">Resume preview</p>
            <span className={`status-chip ${selectedItem ? getAssetTone(selectedItem.assetStatus) : 'tone-muted'}`}>
              {selectedItem ? formatStatusLabel(selectedItem.assetStatus) : 'No asset'}
            </span>
          </div>
          {queue.length === 0 ? (
            <EmptyState
              title="Review queue is empty"
              description="Once a saved job moves into drafting or ready-for-review status, its asset preview will appear here."
            />
          ) : null}
          {queue.length > 0 && selectedItem && showGenerationState ? (
            <div className="generation-state">
              <div className="generation-ring">
                <span>{selectedItem.progressPercent ?? 0}%</span>
              </div>
              <h2>{needsGeneration ? 'Tailored resume required' : 'Tailored resume in progress'}</h2>
              <p>
                {needsGeneration
                  ? `Generate a tailored resume for ${selectedItem.title} before the apply review step can continue.`
                  : `Resume generation is still running for ${selectedItem.title}. Approval stays locked until the asset reaches a ready state.`}
              </p>
            </div>
          ) : null}
          {queue.length > 0 && selectedItem && !showGenerationState && selectedAsset ? (
            <div className="resume-preview-sheet">
              <div className="resume-preview-header">
                <strong>{selectedJob?.title ?? selectedItem.title}</strong>
                <span>{selectedAsset.label}</span>
              </div>
              {selectedAsset.previewSections.map((section) => (
                <div key={section.heading} className="resume-section">
                  <p className="section-label">{section.heading}</p>
                  {section.lines.map((line) => (
                    <p key={line} className="body-copy">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Readiness</p>
            <span className={`status-chip ${getSessionTone(browserSession)}`}>
              {formatStatusLabel(browserSession.status)}
            </span>
          </div>
          {selectedItem && selectedJob ? (
            <>
              <div className="stat-grid">
                <div>
                  <span>Match score</span>
                  <strong>{selectedItem.matchScore}</strong>
                </div>
                <div>
                  <span>Template</span>
                  <strong>{selectedAsset?.templateName ?? 'Pending'}</strong>
                </div>
                <div>
                  <span>Generation</span>
                  <strong>{selectedAsset ? formatStatusLabel(selectedAsset.generationMethod) : 'Pending'}</strong>
                </div>
              </div>
              <p className="body-copy">{selectedJob.summary}</p>
              {selectedAsset?.storagePath ? <p className="muted-copy">Template file: {selectedAsset.storagePath}</p> : null}
              <PreferenceList label="Role fit" values={selectedJob.matchAssessment.reasons} />
              {selectedAsset?.notes.length ? <PreferenceList label="Agent notes" values={selectedAsset.notes} /> : null}
              {actionState.message ? <p className="muted-copy">{actionState.message}</p> : null}
              <div className="button-row">
                <button
                  className="primary-action"
                  disabled={busy || isGenerating || (!needsGeneration && browserSession.status !== 'ready')}
                  onClick={() => {
                    if (needsGeneration) {
                      onGenerateResume(selectedItem.jobId)
                      return
                    }

                    onApproveApply(selectedItem.jobId)
                  }}
                  type="button"
                >
                  {needsGeneration ? 'Generate tailored resume' : 'Approve Easy Apply'}
                </button>
                <button className="secondary-action" disabled={busy} type="button">
                  Edit asset
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              title="Choose a queued item"
              description="Select a job in the review queue to inspect asset readiness and pre-apply context."
            />
          )}
        </section>
      </div>
    </section>
  )
}

function ApplicationsScreen(props: {
  applicationRecords: readonly ApplicationRecord[]
  selectedAttempt: ApplicationAttempt | null
  selectedRecord: ApplicationRecord | null
  onSelectRecord: (recordId: string) => void
}) {
  const { applicationRecords, onSelectRecord, selectedAttempt, selectedRecord } = props

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Applications"
        title="Application history"
        description="Tracked statuses, follow-ups, and timeline events for the first set of saved application records."
      />

      <div className="two-column-layout applications-layout">
        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Tracked records</p>
            <span className="section-badge">{formatCountLabel(applicationRecords.length, 'record')}</span>
          </div>
          {applicationRecords.length === 0 ? (
            <EmptyState
              title="No application records yet"
              description="Successful submissions and paused attempts will appear here once the apply workflow is active."
            />
          ) : (
            <div className="table-list">
              {applicationRecords.map((record) => (
                <button
                  key={record.id}
                  className={`table-row ${selectedRecord?.id === record.id ? 'table-row-active' : ''}`}
                  onClick={() => onSelectRecord(record.id)}
                  type="button"
                >
                  <span className="table-cell table-cell-primary">
                    <strong>{record.title}</strong>
                    <small>{record.company}</small>
                  </span>
                  <span className="table-cell">{record.lastActionLabel}</span>
                  <span className={`status-chip ${getApplicationTone(record.status)}`}>
                    {formatStatusLabel(record.status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel panel-shell column-stack">
          <div className="panel-header-row">
            <p className="section-label">Selected record</p>
            <span className={`status-chip ${selectedRecord ? getApplicationTone(selectedRecord.status) : 'tone-muted'}`}>
              {selectedRecord ? formatStatusLabel(selectedRecord.status) : 'No selection'}
            </span>
          </div>
          {selectedRecord ? (
            <>
              <h2>{selectedRecord.title}</h2>
              <p className="muted-copy">{selectedRecord.company}</p>
              <div className="stat-grid">
                <div>
                  <span>Last updated</span>
                  <strong>{formatTimestamp(selectedRecord.lastUpdatedAt)}</strong>
                </div>
                <div>
                  <span>Next step</span>
                  <strong>{selectedRecord.nextActionLabel ?? 'None'}</strong>
                </div>
              </div>
              {selectedAttempt ? (
                <section className="status-card">
                  <p className="section-label">Latest apply attempt</p>
                  <div className="panel-header-row">
                    <strong>{selectedAttempt.summary}</strong>
                    <span className={`status-chip ${getAssetTone(selectedAttempt.state === 'submitted' ? 'ready' : selectedAttempt.state === 'paused' ? 'queued' : selectedAttempt.state === 'unsupported' ? 'failed' : selectedAttempt.state === 'failed' ? 'failed' : 'generating')}`}>
                      {formatStatusLabel(selectedAttempt.state)}
                    </span>
                  </div>
                  <p className="body-copy">{selectedAttempt.detail}</p>
                </section>
              ) : null}
              <div className="timeline-list">
                {selectedRecord.events.map((event) => (
                  <article key={event.id} className="timeline-item">
                    <div className={`timeline-marker ${getEventTone(event)}`} />
                    <div>
                      <div className="timeline-heading-row">
                        <strong>{event.title}</strong>
                        <span className="meta-copy">{formatTimestamp(event.at)}</span>
                      </div>
                      <p className="body-copy">{event.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="Choose an application record"
              description="Select a tracked application to inspect the latest events and determine what needs attention next."
            />
          )}
        </section>
      </div>
    </section>
  )
}

function SettingsScreen(props: {
  agentProvider: AgentProviderStatus
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  actionState: { busy: boolean; message: string | null }
  browserSession: BrowserSessionState
  busy: boolean
  onResetWorkspace: () => void
  onSaveSettings: (settings: JobFinderSettings) => void
  settings: JobFinderSettings
}) {
  const {
    agentProvider,
    availableResumeTemplates,
    actionState,
    browserSession,
    busy,
    onResetWorkspace,
    onSaveSettings,
    settings
  } = props
  const [settingsForm, setSettingsForm] = useState(settings)

  useEffect(() => {
    setSettingsForm(settings)
  }, [settings])

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Settings"
        title="MVP defaults"
        description="The current slice keeps settings intentionally narrow: session persistence, resume defaults, and review safety controls."
      />

      <section className="panel panel-spacious settings-hero">
        <div>
          <p className="section-label">Current profile</p>
          <h2>Workspace controls</h2>
          <p className="body-copy">
            Resetting clears the current profile, imported resume data, saved jobs, generated assets, and browser session state so you can start fresh.
          </p>
        </div>
        <div className="settings-hero-actions">
          <button className="secondary-action" disabled={busy} onClick={onResetWorkspace} type="button">
            Reset workspace
          </button>
        </div>
      </section>

      <div className="settings-layout">
        <section className="panel panel-spacious">
          <p className="section-label">Session management</p>
          <div className="settings-grid compact-grid">
            <SettingsStat label="Keep session alive" value={settings.keepSessionAlive ? 'Enabled' : 'Disabled'} />
            <SettingsStat label="Approval default" value={settings.humanReviewRequired ? 'Human review' : 'Auto'} />
          </div>
        </section>

        <section className="panel panel-spacious">
          <p className="section-label">Automation runtime</p>
          <div className="settings-grid compact-grid">
            <SettingsStat label="Model provider" value={agentProvider.label} />
            <SettingsStat label="Browser driver" value={formatStatusLabel(browserSession.driver)} />
            <SettingsStat label="Session status" value={formatStatusLabel(browserSession.status)} />
          </div>
          {agentProvider.detail ? <p className="muted-copy">{agentProvider.detail}</p> : null}
          {browserSession.detail ? <p className="muted-copy">{browserSession.detail}</p> : null}
        </section>

        <section className="panel panel-spacious">
          <p className="section-label">Document defaults</p>
          <div className="settings-grid compact-grid">
            <SettingsStat label="Export format" value={settings.resumeFormat.toUpperCase()} />
            <SettingsStat label="Font preset" value={formatStatusLabel(settings.fontPreset)} />
            <SettingsStat
              label="Template"
              value={
                availableResumeTemplates.find((template) => template.id === settings.resumeTemplateId)?.label ??
                formatStatusLabel(settings.resumeTemplateId)
              }
            />
          </div>
        </section>

        <section className="panel panel-spacious">
          <p className="section-label">Safety protocols</p>
          <div className="settings-grid compact-grid">
            <SettingsStat
              label="Human in the loop"
              value={settings.humanReviewRequired ? 'Required' : 'Disabled'}
            />
            <SettingsStat
              label="Auto-submit override"
              value={settings.allowAutoSubmitOverride ? 'Enabled' : 'Disabled'}
            />
          </div>
        </section>
      </div>

      <section className="panel panel-spacious">
        <div className="panel-header-row">
          <p className="section-label">Editable defaults</p>
          <span className="section-badge">Persist locally</span>
        </div>
        <div className="form-grid two-column-form-grid">
          <label className="field-stack">
            <span className="section-label">Resume format</span>
            <select
              className="select-shell"
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  resumeFormat: event.target.value as JobFinderSettings['resumeFormat']
                }))
              }
              value={settingsForm.resumeFormat}
            >
              <option value="html">HTML</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </select>
          </label>
          <label className="field-stack">
            <span className="section-label">Resume template</span>
            <select
              className="select-shell"
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  resumeTemplateId: event.target.value as JobFinderSettings['resumeTemplateId']
                }))
              }
              value={settingsForm.resumeTemplateId}
            >
              {availableResumeTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span className="section-label">Font preset</span>
            <select
              className="select-shell"
              onChange={(event) =>
                setSettingsForm((current) => ({
                  ...current,
                  fontPreset: event.target.value as JobFinderSettings['fontPreset']
                }))
              }
              value={settingsForm.fontPreset}
            >
              <option value="inter_requisite">Inter Requisite</option>
              <option value="space_grotesk_display">Space Grotesk Display</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              checked={settingsForm.keepSessionAlive}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, keepSessionAlive: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Keep browser session alive between discovery and apply runs</span>
          </label>
          <label className="checkbox-row">
            <input
              checked={settingsForm.humanReviewRequired}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, humanReviewRequired: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Require explicit human review before every Easy Apply attempt</span>
          </label>
          <label className="checkbox-row two-column-span">
            <input
              checked={settingsForm.allowAutoSubmitOverride}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, allowAutoSubmitOverride: event.target.checked }))
              }
              type="checkbox"
            />
            <span>Allow future adapter overrides to submit automatically when the flow is fully supported</span>
          </label>
        </div>
        {availableResumeTemplates.length > 0 ? (
          <PreferenceList
            label="Template notes"
            values={availableResumeTemplates.map((template) => `${template.label}: ${template.description}`)}
          />
        ) : null}
        <div className="button-row">
          <button className="primary-action" disabled={busy} onClick={() => onSaveSettings(settingsForm)} type="button">
            Save settings
          </button>
        </div>
        {actionState.message ? <p className="muted-copy">{actionState.message}</p> : null}
      </section>
    </section>
  )
}

function SettingsStat(props: { label: string; value: string }) {
  const { label, value } = props

  return (
    <div className="settings-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PreferenceList(props: { label: string; values: readonly string[]; compact?: boolean }) {
  const { compact = false, label, values } = props

  return (
    <div>
      <p className="section-label">{label}</p>
      {values.length > 0 ? (
        <div className={`chip-row ${compact ? 'chip-row-compact' : ''}`}>
          {values.map((value) => (
            <span key={value} className="chip">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted-copy">No values configured.</p>
      )}
    </div>
  )
}

function EmptyState(props: { title: string; description: string }) {
  const { description, title } = props

  return (
    <div className="empty-state panel-muted">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}
