import { useEffect, useMemo, useState } from 'react'
import {
  type ApprovalMode,
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
  type ReviewQueueItem,
  type SavedJob,
  type TailoredAsset,
  suiteModules
} from '@unemployed/contracts'

type JobFinderScreen = 'profile' | 'discovery' | 'review-queue' | 'applications' | 'settings'

interface JobFinderShellProps {
  actions: {
    refreshWorkspace: () => Promise<void>
    resetWorkspace: () => Promise<void>
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
                  actions.refreshWorkspace,
                  () => undefined,
                  'Workspace refreshed. Discovery adapter still uses seeded data.'
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
              selectedRecord={selectedApplicationRecord}
              onSelectRecord={setSelectedApplicationRecordId}
            />
          ) : null}

          {activeScreen === 'settings' ? (
            <SettingsScreen
              actionState={actionState}
              busy={actionState.busy}
              onResetWorkspace={() =>
                void runAction(
                  actions.resetWorkspace,
                  () => undefined,
                  'Workspace reset to the seeded Job Finder baseline.'
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
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
}) {
  const { profile, searchPreferences } = props

  return (
    <section className="screen-section">
      <PageHeader
        eyebrow="Profile"
        title="Candidate setup"
        description="Foundational resume, extracted profile details, and targeting rules for the first LinkedIn Easy Apply slice."
      />

      <div className="profile-layout">
        <section className="panel panel-spacious profile-panel-resume">
          <p className="section-label">Source resume</p>
          <div className="resume-dropzone">
            <strong>{profile.baseResume.fileName}</strong>
            <span>Uploaded {formatDateOnly(profile.baseResume.uploadedAt)}</span>
          </div>
        </section>

        <section className="panel panel-spacious profile-panel-summary">
          <p className="section-label">Profile summary</p>
          <div className="two-up-grid">
            <div>
              <h2>{profile.fullName}</h2>
              <p className="muted-copy">{profile.headline}</p>
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

        <section className="panel panel-spacious profile-panel-targeting">
          <p className="section-label">Targeting rules</p>
          <div className="settings-grid">
            <PreferenceList label="Target roles" values={searchPreferences.targetRoles} />
            <PreferenceList label="Locations" values={searchPreferences.locations} />
            <PreferenceList label="Work modes" values={searchPreferences.workModes.map(formatStatusLabel)} />
            <PreferenceList
              label="Seniority"
              values={searchPreferences.seniorityLevels}
            />
          </div>
        </section>

        <section className="panel panel-spacious profile-panel-workflow">
          <p className="section-label">Workflow defaults</p>
          <div className="stat-grid">
            <div>
              <span>Tailoring mode</span>
              <strong>{formatStatusLabel(searchPreferences.tailoringMode)}</strong>
            </div>
            <div>
              <span>Approval mode</span>
              <strong>{formatApprovalMode(searchPreferences.approvalMode)}</strong>
            </div>
            <div>
              <span>Minimum salary</span>
              <strong>
                {searchPreferences.minimumSalaryUsd
                  ? `$${searchPreferences.minimumSalaryUsd.toLocaleString('en-US')}`
                  : 'Not set'}
              </strong>
            </div>
            <div>
              <span>Preferred companies</span>
              <strong>{searchPreferences.companyWhitelist.length || 0}</strong>
            </div>
          </div>
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
          <button className="primary-action" disabled={busy} onClick={onRefreshDiscovery} type="button">
            Refresh discovery snapshot
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
              </div>
              <p className="body-copy">{selectedJob.summary}</p>
              <PreferenceList label="Role fit" values={selectedJob.matchAssessment.reasons} />
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
  selectedRecord: ApplicationRecord | null
  onSelectRecord: (recordId: string) => void
}) {
  const { applicationRecords, onSelectRecord, selectedRecord } = props

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
  actionState: { busy: boolean; message: string | null }
  busy: boolean
  onResetWorkspace: () => void
  settings: JobFinderSettings
}) {
  const { actionState, busy, onResetWorkspace, settings } = props

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
            Keep the current seeded shell stable while iterating on UI polish. Resetting restores the seeded review and discovery state.
          </p>
        </div>
        <div className="settings-hero-actions">
          <button className="secondary-action" disabled={busy} onClick={onResetWorkspace} type="button">
            Reset workspace
          </button>
          {actionState.message ? <p className="muted-copy">{actionState.message}</p> : null}
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
          <p className="section-label">Document defaults</p>
          <div className="settings-grid compact-grid">
            <SettingsStat label="Export format" value={settings.resumeFormat.toUpperCase()} />
            <SettingsStat label="Font preset" value={formatStatusLabel(settings.fontPreset)} />
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
