import { useEffect, useMemo, useState } from 'react'
import {
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

function createProfileEntryId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function toExperienceFormEntries(profile: CandidateProfile): ExperienceFormEntry[] {
  return profile.experiences.map((experience) => ({
    id: experience.id,
    companyName: experience.companyName,
    title: experience.title,
    employmentType: experience.employmentType ?? '',
    location: experience.location ?? '',
    workMode: experience.workMode ?? '',
    startDate: experience.startDate ?? '',
    endDate: experience.endDate ?? '',
    isCurrent: experience.isCurrent,
    summary: experience.summary ?? '',
    achievements: joinListInput(experience.achievements),
    skills: joinListInput(experience.skills)
  }))
}

function toEducationFormEntries(profile: CandidateProfile): EducationFormEntry[] {
  return profile.education.map((education) => ({
    id: education.id,
    schoolName: education.schoolName,
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
    name: certification.name,
    issuer: certification.issuer ?? '',
    issueDate: certification.issueDate ?? '',
    expiryDate: certification.expiryDate ?? '',
    credentialUrl: certification.credentialUrl ?? ''
  }))
}

function toLinkFormEntries(profile: CandidateProfile): LinkFormEntry[] {
  return profile.links.map((link) => ({
    id: link.id,
    label: link.label,
    url: link.url,
    kind: link.kind ?? ''
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
    currentLocation: profile.currentLocation,
    email: profile.email ?? '',
    firstName: profile.firstName,
    headline: profile.headline,
    linkedinUrl: profile.linkedinUrl ?? '',
    lastName: profile.lastName,
    middleName: profile.middleName ?? '',
    phone: profile.phone ?? '',
    portfolioUrl: profile.portfolioUrl ?? '',
    resumeText: profile.baseResume.textContent ?? '',
    skills: joinListInput(profile.skills),
    summary: profile.summary,
    yearsExperience: String(profile.yearsExperience)
  })
  const [experienceEntries, setExperienceEntries] = useState<ExperienceFormEntry[]>(toExperienceFormEntries(profile))
  const [educationEntries, setEducationEntries] = useState<EducationFormEntry[]>(toEducationFormEntries(profile))
  const [certificationEntries, setCertificationEntries] = useState<CertificationFormEntry[]>(
    toCertificationFormEntries(profile)
  )
  const [linkEntries, setLinkEntries] = useState<LinkFormEntry[]>(toLinkFormEntries(profile))
  const [preferenceForm, setPreferenceForm] = useState({
    companyBlacklist: joinListInput(searchPreferences.companyBlacklist),
    companyWhitelist: joinListInput(searchPreferences.companyWhitelist),
    locations: joinListInput(searchPreferences.locations),
    minimumSalaryUsd: searchPreferences.minimumSalaryUsd?.toString() ?? '',
    seniorityLevels: joinListInput(searchPreferences.seniorityLevels),
    tailoringMode: searchPreferences.tailoringMode,
    targetRoles: joinListInput(searchPreferences.targetRoles),
    workModes: searchPreferences.workModes
  })

  useEffect(() => {
    setProfileForm({
      currentLocation: profile.currentLocation,
      email: profile.email ?? '',
      firstName: profile.firstName,
      headline: profile.headline,
      linkedinUrl: profile.linkedinUrl ?? '',
      lastName: profile.lastName,
      middleName: profile.middleName ?? '',
      phone: profile.phone ?? '',
      portfolioUrl: profile.portfolioUrl ?? '',
      resumeText: profile.baseResume.textContent ?? '',
      skills: joinListInput(profile.skills),
      summary: profile.summary,
      yearsExperience: String(profile.yearsExperience)
    })
    setExperienceEntries(toExperienceFormEntries(profile))
    setEducationEntries(toEducationFormEntries(profile))
    setCertificationEntries(toCertificationFormEntries(profile))
    setLinkEntries(toLinkFormEntries(profile))
  }, [profile])

  useEffect(() => {
    setPreferenceForm({
      companyBlacklist: joinListInput(searchPreferences.companyBlacklist),
      companyWhitelist: joinListInput(searchPreferences.companyWhitelist),
      locations: joinListInput(searchPreferences.locations),
      minimumSalaryUsd: searchPreferences.minimumSalaryUsd?.toString() ?? '',
      seniorityLevels: joinListInput(searchPreferences.seniorityLevels),
      tailoringMode: searchPreferences.tailoringMode,
      targetRoles: joinListInput(searchPreferences.targetRoles),
      workModes: searchPreferences.workModes
    })
  }, [searchPreferences])

  const updateExperienceEntry = (id: string, field: keyof ExperienceFormEntry, value: string | boolean) => {
    setExperienceEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    )
  }

  const updateEducationEntry = (id: string, field: keyof EducationFormEntry, value: string) => {
    setEducationEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }

  const updateCertificationEntry = (id: string, field: keyof CertificationFormEntry, value: string) => {
    setCertificationEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    )
  }

  const updateLinkEntry = (id: string, field: keyof LinkFormEntry, value: string) => {
    setLinkEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)))
  }

  const addExperienceEntry = () => {
    setExperienceEntries((current) => [
      ...current,
      {
        id: createProfileEntryId('experience'),
        companyName: '',
        title: '',
        employmentType: '',
        location: '',
        workMode: '',
        startDate: '',
        endDate: '',
        isCurrent: false,
        summary: '',
        achievements: '',
        skills: ''
      }
    ])
  }

  const addEducationEntry = () => {
    setEducationEntries((current) => [
      ...current,
      {
        id: createProfileEntryId('education'),
        schoolName: '',
        degree: '',
        fieldOfStudy: '',
        location: '',
        startDate: '',
        endDate: '',
        summary: ''
      }
    ])
  }

  const addCertificationEntry = () => {
    setCertificationEntries((current) => [
      ...current,
      {
        id: createProfileEntryId('certification'),
        name: '',
        issuer: '',
        issueDate: '',
        expiryDate: '',
        credentialUrl: ''
      }
    ])
  }

  const addLinkEntry = () => {
    setLinkEntries((current) => [...current, { id: createProfileEntryId('link'), label: '', url: '', kind: '' }])
  }

  const saveProfilePayload: CandidateProfile = {
    ...profile,
    firstName: profileForm.firstName.trim(),
    lastName: profileForm.lastName.trim(),
    middleName: profileForm.middleName.trim() || null,
    fullName: buildFullName({
      firstName: profileForm.firstName,
      middleName: profileForm.middleName,
      lastName: profileForm.lastName
    }),
    headline: profileForm.headline.trim(),
    currentLocation: profileForm.currentLocation.trim(),
    yearsExperience: Number(profileForm.yearsExperience || '0'),
    email: profileForm.email.trim() || null,
    phone: profileForm.phone.trim() || null,
    portfolioUrl: profileForm.portfolioUrl.trim() || null,
    linkedinUrl: profileForm.linkedinUrl.trim() || null,
    summary: profileForm.summary.trim(),
    skills: parseListInput(profileForm.skills),
    experiences: experienceEntries
      .filter((entry) => entry.companyName.trim() && entry.title.trim())
      .map((entry) => ({
        id: entry.id,
        companyName: entry.companyName.trim(),
        title: entry.title.trim(),
        employmentType: entry.employmentType.trim() || null,
        location: entry.location.trim() || null,
        workMode: entry.workMode || null,
        startDate: entry.startDate.trim() || null,
        endDate: entry.isCurrent ? null : entry.endDate.trim() || null,
        isCurrent: entry.isCurrent,
        summary: entry.summary.trim() || null,
        achievements: parseListInput(entry.achievements),
        skills: parseListInput(entry.skills)
      })),
    education: educationEntries
      .filter((entry) => entry.schoolName.trim())
      .map((entry) => ({
        id: entry.id,
        schoolName: entry.schoolName.trim(),
        degree: entry.degree.trim() || null,
        fieldOfStudy: entry.fieldOfStudy.trim() || null,
        location: entry.location.trim() || null,
        startDate: entry.startDate.trim() || null,
        endDate: entry.endDate.trim() || null,
        summary: entry.summary.trim() || null
      })),
    certifications: certificationEntries
      .filter((entry) => entry.name.trim())
      .map((entry) => ({
        id: entry.id,
        name: entry.name.trim(),
        issuer: entry.issuer.trim() || null,
        issueDate: entry.issueDate.trim() || null,
        expiryDate: entry.expiryDate.trim() || null,
        credentialUrl: entry.credentialUrl.trim() || null
      })),
    links: linkEntries
      .filter((entry) => entry.label.trim() && entry.url.trim())
      .map((entry) => ({
        id: entry.id,
        label: entry.label.trim(),
        url: entry.url.trim(),
        kind: entry.kind.trim() || null
      })),
    baseResume: {
      ...profile.baseResume,
      textContent: profileForm.resumeText.trim() || null
    }
  }

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Profile"
        title="Candidate setup"
        description="Structured candidate data for tailoring, ATS alignment, and future field-by-field apply automation."
      />

      <div className="profile-layout">
        <section className="panel panel-spacious profile-panel-summary">
          <p className="section-label">Profile summary</p>
          <div className="two-up-grid">
            <div>
              <h2>{profile.fullName}</h2>
              <p className="profile-headline">{profile.headline}</p>
              <div className="chip-row chip-row-compact">
                {profile.email ? <span className="chip">{profile.email}</span> : null}
                {profile.phone ? <span className="chip">{profile.phone}</span> : null}
                {profile.linkedinUrl ? <span className="chip">LinkedIn on file</span> : null}
                {profile.portfolioUrl ? <span className="chip">Portfolio on file</span> : null}
              </div>
            </div>
            <div className="stat-grid">
              <div>
                <span>Experience</span>
                <strong>{profile.yearsExperience} years</strong>
              </div>
              <div>
                <span>Base location</span>
                <strong>{profile.currentLocation}</strong>
              </div>
              <div>
                <span>Roles captured</span>
                <strong>{profile.experiences.length}</strong>
              </div>
              <div>
                <span>Education records</span>
                <strong>{profile.education.length}</strong>
              </div>
            </div>
          </div>
          <p className="body-copy">{profile.summary}</p>
          <div className="chip-row">
            {profile.skills.map((skill) => (
              <span key={skill} className="chip">
                {skill}
              </span>
            ))}
          </div>
        </section>

        <section className="panel panel-spacious profile-panel-resume">
          <div className="panel-header-row">
            <p className="section-label">Source resume</p>
            <span className={`status-chip ${agentProvider.kind === 'openai_compatible' ? 'tone-positive' : 'tone-active'}`}>
              {agentProvider.label}
            </span>
          </div>
          <div className="resume-dropzone">
            <strong>{profile.baseResume.fileName}</strong>
            <span>Uploaded {formatDateOnly(profile.baseResume.uploadedAt)}</span>
            <span className={`status-chip ${getAssetTone(profile.baseResume.extractionStatus === 'ready' ? 'ready' : profile.baseResume.extractionStatus === 'failed' ? 'failed' : profile.baseResume.extractionStatus === 'needs_text' ? 'queued' : 'generating')}`}>
              {formatStatusLabel(profile.baseResume.extractionStatus)}
            </span>
            {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? (
              <div className="resume-analysis-inline">
                <span
                  className={`status-chip ${profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'tone-positive' : 'tone-active'}`}
                >
                  {profile.baseResume.analysisProviderKind === 'openai_compatible' ? 'AI parsed' : 'Fallback parsed'}
                </span>
                <span className="meta-copy">{profile.baseResume.analysisProviderLabel}</span>
              </div>
            ) : null}
            <div className="button-row">
              <button className="secondary-action compact-action" disabled={busy} onClick={onImportResume} type="button">
                Replace resume
              </button>
              <button
                className="primary-action compact-action"
                disabled={
                  busy ||
                  !profileForm.resumeText.trim() ||
                  profileForm.resumeText.trim() !== (profile.baseResume.textContent ?? '')
                }
                onClick={onAnalyzeProfileFromResume}
                type="button"
              >
                Analyze saved resume text
              </button>
            </div>
          </div>
          <p className="muted-copy">
            {profile.baseResume.textContent
              ? 'Stored resume text is ready for profile extraction, tailoring, and validation.'
              : 'PDF, DOCX, TXT, and Markdown resumes can be stored locally. If extraction misses key content, paste cleaned plain text below so the agent can continue.'}
          </p>
          {profile.baseResume.lastAnalyzedAt && profile.baseResume.analysisProviderLabel ? (
            <div className="resume-analysis-summary">
              <p className="body-copy body-copy-compact">{formatResumeAnalysisSummary(profile)}</p>
            </div>
          ) : null}
          {profile.baseResume.analysisWarnings.length > 0 ? (
            <PreferenceList label="Review notes" values={profile.baseResume.analysisWarnings} />
          ) : null}
        </section>
      </div>

      <section className="panel panel-spacious profile-panel-overview">
        <div className="panel-header-row">
          <p className="section-label">Job matching defaults</p>
          <span className="section-badge">Targeting and workflow</span>
        </div>
        <div className="profile-secondary-grid">
          <div className="panel-muted profile-subsection">
            <p className="section-label">Targeting rules</p>
            <div className="settings-grid preference-summary-grid">
              <PreferenceList label="Target roles" values={searchPreferences.targetRoles} />
              <PreferenceList label="Locations" values={searchPreferences.locations} />
              <PreferenceList label="Work modes" values={searchPreferences.workModes.map(formatStatusLabel)} />
              <PreferenceList label="Seniority" values={searchPreferences.seniorityLevels} />
            </div>
          </div>

          <div className="panel-muted profile-subsection">
            <p className="section-label">Structured coverage</p>
            <div className="stat-grid">
              <div>
                <span>Experience entries</span>
                <strong>{profile.experiences.length}</strong>
              </div>
              <div>
                <span>Education entries</span>
                <strong>{profile.education.length}</strong>
              </div>
              <div>
                <span>Certifications</span>
                <strong>{profile.certifications.length}</strong>
              </div>
              <div>
                <span>Proof links</span>
                <strong>{profile.links.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="profile-stack-layout">
        <section className="panel panel-spacious">
          <div className="panel-header-row">
            <div>
              <p className="section-label">Identity and contact</p>
              <p className="muted-copy">Keep the top-level profile concise, searchable, and ready for ATS autofill.</p>
            </div>
            <span className="section-badge">Persist locally</span>
          </div>
          <div className="form-column-layout">
            <div className="form-column">
              <label className="field-stack">
                <span className="section-label">First name</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))} value={profileForm.firstName} />
              </label>
              <label className="field-stack">
                <span className="section-label">Middle name</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, middleName: event.target.value }))} value={profileForm.middleName} />
              </label>
              <label className="field-stack">
                <span className="section-label">Headline</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, headline: event.target.value }))} value={profileForm.headline} />
              </label>
              <label className="field-stack">
                <span className="section-label">Email</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} value={profileForm.email} />
              </label>
              <label className="field-stack">
                <span className="section-label">Portfolio URL</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, portfolioUrl: event.target.value }))} value={profileForm.portfolioUrl} />
              </label>
              <label className="field-stack">
                <span className="section-label">Skills</span>
                <textarea className="textarea-shell compact-textarea" onChange={(event) => setProfileForm((current) => ({ ...current, skills: event.target.value }))} rows={4} value={profileForm.skills} />
              </label>
            </div>
            <div className="form-column">
              <label className="field-stack">
                <span className="section-label">Last name</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))} value={profileForm.lastName} />
              </label>
              <label className="field-stack">
                <span className="section-label">Current location</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, currentLocation: event.target.value }))} value={profileForm.currentLocation} />
              </label>
              <label className="field-stack">
                <span className="section-label">Years of experience</span>
                <input className="input-shell" min="0" onChange={(event) => setProfileForm((current) => ({ ...current, yearsExperience: event.target.value }))} type="number" value={profileForm.yearsExperience} />
              </label>
              <label className="field-stack">
                <span className="section-label">Phone</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} value={profileForm.phone} />
              </label>
              <label className="field-stack">
                <span className="section-label">LinkedIn URL</span>
                <input className="input-shell" onChange={(event) => setProfileForm((current) => ({ ...current, linkedinUrl: event.target.value }))} value={profileForm.linkedinUrl} />
              </label>
            </div>
          </div>
          <div className="form-grid">
            <label className="field-stack">
              <span className="section-label">Summary</span>
              <textarea className="textarea-shell" onChange={(event) => setProfileForm((current) => ({ ...current, summary: event.target.value }))} rows={4} value={profileForm.summary} />
            </label>
            <label className="field-stack">
              <span className="section-label">Resume text for agents</span>
              <textarea className="textarea-shell" onChange={(event) => setProfileForm((current) => ({ ...current, resumeText: event.target.value }))} rows={8} value={profileForm.resumeText} />
            </label>
          </div>
        </section>

        <section className="panel panel-spacious">
          <div className="panel-header-row">
            <div>
              <p className="section-label">Experience timeline</p>
              <p className="muted-copy">Each role now has dedicated fields for title, employer, dates, outcomes, and skill evidence.</p>
            </div>
            <button className="secondary-action compact-action" disabled={busy} onClick={addExperienceEntry} type="button">
              Add experience
            </button>
          </div>
          <div className="record-stack">
            {experienceEntries.length > 0 ? experienceEntries.map((entry, index) => (
              <article key={entry.id} className="record-card">
                <div className="panel-header-row">
                  <p className="section-label">Role {index + 1}</p>
                  <button className="ghost-action compact-action" disabled={busy} onClick={() => setExperienceEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">
                    Remove
                  </button>
                </div>
                <div className="form-column-layout">
                  <div className="form-column">
                    <label className="field-stack"><span className="section-label">Company</span><input className="input-shell" value={entry.companyName} onChange={(event) => updateExperienceEntry(entry.id, 'companyName', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Title</span><input className="input-shell" value={entry.title} onChange={(event) => updateExperienceEntry(entry.id, 'title', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Employment type</span><input className="input-shell" value={entry.employmentType} onChange={(event) => updateExperienceEntry(entry.id, 'employmentType', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Location</span><input className="input-shell" value={entry.location} onChange={(event) => updateExperienceEntry(entry.id, 'location', event.target.value)} /></label>
                  </div>
                  <div className="form-column">
                    <label className="field-stack"><span className="section-label">Work mode</span><select className="select-shell" value={entry.workMode} onChange={(event) => updateExperienceEntry(entry.id, 'workMode', event.target.value as WorkMode | '')}><option value="">Select mode</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">Onsite</option><option value="flexible">Flexible</option></select></label>
                    <label className="field-stack"><span className="section-label">Start date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.startDate} onChange={(event) => updateExperienceEntry(entry.id, 'startDate', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">End date</span><input className="input-shell" disabled={entry.isCurrent} placeholder="YYYY-MM" value={entry.endDate} onChange={(event) => updateExperienceEntry(entry.id, 'endDate', event.target.value)} /></label>
                    <label className="checkbox-row"><input checked={entry.isCurrent} onChange={(event) => updateExperienceEntry(entry.id, 'isCurrent', event.target.checked)} type="checkbox" /><span>Current role</span></label>
                  </div>
                </div>
                <div className="form-grid">
                  <label className="field-stack"><span className="section-label">Role summary</span><textarea className="textarea-shell compact-textarea" rows={3} value={entry.summary} onChange={(event) => updateExperienceEntry(entry.id, 'summary', event.target.value)} /></label>
                  <div className="form-column-layout">
                    <label className="field-stack"><span className="section-label">Achievements</span><textarea className="textarea-shell" rows={4} value={entry.achievements} onChange={(event) => updateExperienceEntry(entry.id, 'achievements', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Skills used</span><textarea className="textarea-shell compact-textarea" rows={4} value={entry.skills} onChange={(event) => updateExperienceEntry(entry.id, 'skills', event.target.value)} /></label>
                  </div>
                </div>
              </article>
            )) : <EmptyState title="No structured experience yet" description="Add each role with dedicated fields so resume tailoring and future form-fill flows do not depend on one large text box." />}
          </div>
        </section>

        <div className="profile-edit-layout">
          <section className="panel panel-spacious">
            <div className="panel-header-row">
              <div>
                <p className="section-label">Education</p>
                <p className="muted-copy">Store schools, degrees, fields of study, and dates as separate records.</p>
              </div>
              <button className="secondary-action compact-action" disabled={busy} onClick={addEducationEntry} type="button">Add education</button>
            </div>
            <div className="record-stack">
              {educationEntries.length > 0 ? educationEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row">
                    <p className="section-label">Education {index + 1}</p>
                    <button className="ghost-action compact-action" disabled={busy} onClick={() => setEducationEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button>
                  </div>
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
          </section>

          <section className="panel panel-spacious">
            <div className="panel-header-row">
              <div>
                <p className="section-label">Certifications and links</p>
                <p className="muted-copy">Capture credentials, portfolio links, GitHub, case studies, and other proof separately.</p>
              </div>
              <div className="button-row">
                <button className="secondary-action compact-action" disabled={busy} onClick={addCertificationEntry} type="button">Add certification</button>
                <button className="secondary-action compact-action" disabled={busy} onClick={addLinkEntry} type="button">Add link</button>
              </div>
            </div>
            <div className="record-stack">
              {certificationEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row">
                    <p className="section-label">Certification {index + 1}</p>
                    <button className="ghost-action compact-action" disabled={busy} onClick={() => setCertificationEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button>
                  </div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Name</span><input className="input-shell" value={entry.name} onChange={(event) => updateCertificationEntry(entry.id, 'name', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Issuer</span><input className="input-shell" value={entry.issuer} onChange={(event) => updateCertificationEntry(entry.id, 'issuer', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Issue date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.issueDate} onChange={(event) => updateCertificationEntry(entry.id, 'issueDate', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Expiry date</span><input className="input-shell" placeholder="YYYY-MM" value={entry.expiryDate} onChange={(event) => updateCertificationEntry(entry.id, 'expiryDate', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">Credential URL</span><input className="input-shell" value={entry.credentialUrl} onChange={(event) => updateCertificationEntry(entry.id, 'credentialUrl', event.target.value)} /></label>
                  </div>
                </article>
              ))}
              {linkEntries.map((entry, index) => (
                <article key={entry.id} className="record-card">
                  <div className="panel-header-row">
                    <p className="section-label">Link {index + 1}</p>
                    <button className="ghost-action compact-action" disabled={busy} onClick={() => setLinkEntries((current) => current.filter((item) => item.id !== entry.id))} type="button">Remove</button>
                  </div>
                  <div className="form-grid two-column-form-grid">
                    <label className="field-stack"><span className="section-label">Label</span><input className="input-shell" value={entry.label} onChange={(event) => updateLinkEntry(entry.id, 'label', event.target.value)} /></label>
                    <label className="field-stack"><span className="section-label">Kind</span><input className="input-shell" value={entry.kind} onChange={(event) => updateLinkEntry(entry.id, 'kind', event.target.value)} /></label>
                    <label className="field-stack two-column-span"><span className="section-label">URL</span><input className="input-shell" value={entry.url} onChange={(event) => updateLinkEntry(entry.id, 'url', event.target.value)} /></label>
                  </div>
                </article>
              ))}
              {certificationEntries.length === 0 && linkEntries.length === 0 ? <EmptyState title="No supporting records yet" description="Keep certifications and portfolio proof in dedicated records so future job applications can reuse them directly." /> : null}
            </div>
          </section>
        </div>

        <section className="panel panel-spacious">
          <div className="panel-header-row">
            <p className="section-label">Discovery preferences</p>
            <span className="section-badge">LinkedIn adapter</span>
          </div>
          <div className="form-column-layout">
            <div className="form-column">
              <label className="field-stack"><span className="section-label">Target roles</span><textarea className="textarea-shell compact-textarea" onChange={(event) => setPreferenceForm((current) => ({ ...current, targetRoles: event.target.value }))} rows={3} value={preferenceForm.targetRoles} /></label>
              <label className="field-stack"><span className="section-label">Locations</span><textarea className="textarea-shell compact-textarea" onChange={(event) => setPreferenceForm((current) => ({ ...current, locations: event.target.value }))} rows={3} value={preferenceForm.locations} /></label>
              <label className="field-stack"><span className="section-label">Seniority</span><textarea className="textarea-shell compact-textarea" onChange={(event) => setPreferenceForm((current) => ({ ...current, seniorityLevels: event.target.value }))} rows={3} value={preferenceForm.seniorityLevels} /></label>
              <label className="field-stack"><span className="section-label">Tailoring mode</span><select className="select-shell" onChange={(event) => setPreferenceForm((current) => ({ ...current, tailoringMode: event.target.value as JobSearchPreferences['tailoringMode'] }))} value={preferenceForm.tailoringMode}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
              <label className="field-stack"><span className="section-label">Blocked companies</span><textarea className="textarea-shell compact-textarea" onChange={(event) => setPreferenceForm((current) => ({ ...current, companyBlacklist: event.target.value }))} rows={3} value={preferenceForm.companyBlacklist} /></label>
            </div>
            <div className="form-column">
              <div className="field-stack">
                <span className="section-label">Work modes</span>
                <div className="checkbox-grid">
                  {(['remote', 'hybrid', 'onsite', 'flexible'] as const).map((workMode) => (
                    <label key={workMode} className="checkbox-row">
                      <input checked={preferenceForm.workModes.includes(workMode)} onChange={(event) => setPreferenceForm((current) => ({ ...current, workModes: event.target.checked ? [...current.workModes, workMode] : current.workModes.filter((value) => value !== workMode) }))} type="checkbox" />
                      <span>{formatStatusLabel(workMode)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="field-stack"><span className="section-label">Minimum salary</span><input className="input-shell" min="0" onChange={(event) => setPreferenceForm((current) => ({ ...current, minimumSalaryUsd: event.target.value }))} type="number" value={preferenceForm.minimumSalaryUsd} /></label>
              <label className="field-stack"><span className="section-label">Preferred companies</span><textarea className="textarea-shell compact-textarea" onChange={(event) => setPreferenceForm((current) => ({ ...current, companyWhitelist: event.target.value }))} rows={3} value={preferenceForm.companyWhitelist} /></label>
            </div>
          </div>
          <div className="button-row">
            <button className="primary-action" disabled={busy} onClick={() => onSaveProfile(saveProfilePayload)} type="button">Save profile</button>
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() =>
                onSaveSearchPreferences({
                  ...searchPreferences,
                  companyBlacklist: parseListInput(preferenceForm.companyBlacklist),
                  companyWhitelist: parseListInput(preferenceForm.companyWhitelist),
                  locations: parseListInput(preferenceForm.locations),
                  minimumSalaryUsd: preferenceForm.minimumSalaryUsd.trim() ? Number(preferenceForm.minimumSalaryUsd) : null,
                  seniorityLevels: parseListInput(preferenceForm.seniorityLevels),
                  tailoringMode: preferenceForm.tailoringMode,
                  targetRoles: parseListInput(preferenceForm.targetRoles),
                  workModes: preferenceForm.workModes
                })
              }
              type="button"
            >
              Save preferences
            </button>
          </div>
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
