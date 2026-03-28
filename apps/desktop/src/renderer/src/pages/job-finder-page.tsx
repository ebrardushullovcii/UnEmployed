import { useCallback, useEffect, useState } from 'react'
import type {
  CandidateProfile,
  DiscoveryActivityEvent,
  JobFinderSettings,
  JobSearchPreferences,
  JobFinderWorkspaceSnapshot
} from '@unemployed/contracts'
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { JobFinderShell } from '../features/job-finder/components/job-finder-shell'
import { useJobFinderWorkspace } from '../features/job-finder/hooks/use-job-finder-workspace'
import { ApplicationsScreen } from '../features/job-finder/screens/applications-screen'
import { DiscoveryScreen } from '../features/job-finder/screens/discovery-screen'
import { ProfileScreen } from '../features/job-finder/screens/profile-screen'
import { ReviewQueueScreen } from '../features/job-finder/screens/review-queue-screen'
import { SettingsScreen } from '../features/job-finder/screens/settings-screen'
import type { ActionState } from '../features/job-finder/lib/job-finder-types'

type SelectedState = string | null

function useResettableSelection(initialValue: SelectedState) {
  const [value, setValue] = useState<SelectedState>(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return [value, setValue] as const
}

function WorkspaceStateScreen(props: {
  kicker: string
  message: string
  title: string
  tone?: 'default' | 'error'
}) {
  return (
    <main className="grid min-h-full place-items-center bg-canvas px-6 py-10">
      <div className={props.tone === 'error' ? 'grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-critical/35 bg-(--workspace-state-card-bg-error) p-8 shadow-(--workspace-state-card-shadow)' : 'grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-border-subtle bg-(--workspace-state-card-bg-default) p-8 shadow-(--workspace-state-card-shadow)'}>
        <p className="text-(length:--text-tiny) uppercase tracking-[0.24em] text-foreground-muted">{props.kicker}</p>
        <h1>{props.title}</h1>
        <p>{props.message}</p>
      </div>
    </main>
  )
}

export interface JobFinderPageContext {
  actionState: ActionState
  busy: boolean
  onAnalyzeProfileFromResume: () => void
  onApproveApply: (jobId: string) => void
  onCheckBrowserSession: () => void
  onDismissJob: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onImportResume: () => void
  onOpenBrowserSession: () => void
  onQueueJob: (jobId: string) => void
  onResetWorkspace: () => void
  onRunAgentDiscovery: (() => void) | undefined
  onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => void
  onSaveProfile: (profile: CandidateProfile) => void
  onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => void
  onSaveSettings: (settings: JobFinderSettings) => void
  onSelectApplicationRecord: (recordId: string) => void
  onSelectDiscoveryJob: (jobId: string) => void
  onSelectReviewItem: (jobId: string) => void
  selectedApplicationAttempt: JobFinderWorkspaceSnapshot['applicationAttempts'][number] | null
  selectedApplicationRecord: JobFinderWorkspaceSnapshot['applicationRecords'][number] | null
  selectedDiscoveryJob: JobFinderWorkspaceSnapshot['discoveryJobs'][number] | null
  selectedReviewItem: JobFinderWorkspaceSnapshot['reviewQueue'][number] | null
  selectedReviewJob: JobFinderWorkspaceSnapshot['discoveryJobs'][number] | null
  selectedTailoredAsset: JobFinderWorkspaceSnapshot['tailoredAssets'][number] | null
  liveDiscoveryEvents: readonly DiscoveryActivityEvent[]
  workspace: JobFinderWorkspaceSnapshot
}

function useJobFinderPageContext() {
  return useOutletContext<JobFinderPageContext>()
}

export function JobFinderProfileRoute() {
  const context = useJobFinderPageContext()

  return (
    <ProfileScreen
      actionState={context.actionState}
      busy={context.busy}
      onAnalyzeProfileFromResume={context.onAnalyzeProfileFromResume}
      onImportResume={context.onImportResume}
      onSaveAll={context.onSaveAll}
      profile={context.workspace.profile}
      searchPreferences={context.workspace.searchPreferences}
    />
  )
}

export function JobFinderDiscoveryRoute() {
  const context = useJobFinderPageContext()

  return (
    <DiscoveryScreen
      actionState={context.actionState}
      busy={context.busy}
      browserSession={context.workspace.browserSession}
      discoverySessions={context.workspace.discoverySessions}
      activeRun={context.workspace.activeDiscoveryRun}
      jobs={context.workspace.discoveryJobs}
      liveEvents={context.liveDiscoveryEvents}
      onDismissJob={context.onDismissJob}
      onOpenBrowserSession={context.onOpenBrowserSession}
      onQueueJob={context.onQueueJob}
      onRunAgentDiscovery={context.onRunAgentDiscovery}
      onSelectJob={context.onSelectDiscoveryJob}
      recentRuns={context.workspace.recentDiscoveryRuns}
      searchPreferences={context.workspace.searchPreferences}
      selectedJob={context.selectedDiscoveryJob}
    />
  )
}

export function JobFinderReviewQueueRoute() {
  const context = useJobFinderPageContext()

  return (
    <ReviewQueueScreen
      actionState={context.actionState}
      busy={context.busy}
      browserSession={context.workspace.browserSession}
      onApproveApply={context.onApproveApply}
      onGenerateResume={context.onGenerateResume}
      onSelectItem={context.onSelectReviewItem}
      queue={context.workspace.reviewQueue}
      selectedAsset={context.selectedTailoredAsset}
      selectedItem={context.selectedReviewItem}
      selectedJob={context.selectedReviewJob}
    />
  )
}

export function JobFinderApplicationsRoute() {
  const context = useJobFinderPageContext()

  return (
    <ApplicationsScreen
      applicationRecords={context.workspace.applicationRecords}
      onSelectRecord={context.onSelectApplicationRecord}
      selectedAttempt={context.selectedApplicationAttempt}
      selectedRecord={context.selectedApplicationRecord}
    />
  )
}

export function JobFinderSettingsRoute() {
  const context = useJobFinderPageContext()

  return (
    <SettingsScreen
      actionState={context.actionState}
      agentProvider={context.workspace.agentProvider}
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      browserSession={context.workspace.browserSession}
      busy={context.busy}
      onResetWorkspace={context.onResetWorkspace}
      onSaveSettings={context.onSaveSettings}
      settings={context.workspace.settings}
    />
  )
}

export function JobFinderPage() {
  const navigate = useNavigate()
  const workspaceState = useJobFinderWorkspace()
  const [actionState, setActionState] = useState<ActionState>({ busy: false, message: null })
  const [liveDiscoveryEvents, setLiveDiscoveryEvents] = useState<DiscoveryActivityEvent[]>([])

  const [selectedDiscoveryJobId, setSelectedDiscoveryJobId] = useResettableSelection(
    workspaceState.status === 'ready' ? workspaceState.workspace.selectedDiscoveryJobId : null
  )
  const [selectedReviewJobId, setSelectedReviewJobId] = useResettableSelection(
    workspaceState.status === 'ready' ? workspaceState.workspace.selectedReviewJobId : null
  )
  const [selectedApplicationRecordId, setSelectedApplicationRecordId] = useResettableSelection(
    workspaceState.status === 'ready' ? workspaceState.workspace.selectedApplicationRecordId : null
  )

  const runAction = useCallback(async (action: () => Promise<void>, onSuccess: () => void, successMessage: string | null) => {
    try {
      setActionState({ busy: true, message: null })
      await action()
      onSuccess()
      setActionState({ busy: false, message: successMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The requested Job Finder action failed.'
      setActionState({ busy: false, message })
    }
  }, [])

  if (workspaceState.status === 'loading') {
    return (
      <WorkspaceStateScreen
        kicker="UnEmployed"
        message="Loading the first LinkedIn Easy Apply slice and typed desktop context."
        title="Booting Job Finder workspace"
      />
    )
  }

  if (workspaceState.status === 'error') {
    return (
      <WorkspaceStateScreen
        kicker="Workspace Error"
        message={workspaceState.message}
        title="Job Finder failed to load"
        tone="error"
      />
    )
  }

  const { actions, platform, workspace } = workspaceState

  const selectedDiscoveryJob =
    workspace.discoveryJobs.find((job) => job.id === selectedDiscoveryJobId) ?? workspace.discoveryJobs[0] ?? null

  const selectedReviewItem =
    workspace.reviewQueue.find((item) => item.jobId === selectedReviewJobId) ?? workspace.reviewQueue[0] ?? null

  const selectedReviewJob =
    workspace.discoveryJobs.find((job) => job.id === selectedReviewItem?.jobId) ?? selectedDiscoveryJob ?? null

  const selectedTailoredAsset =
    workspace.tailoredAssets.find((asset) => asset.id === selectedReviewItem?.resumeAssetId) ?? null

  const selectedApplicationRecord =
    workspace.applicationRecords.find((record) => record.id === selectedApplicationRecordId) ??
    workspace.applicationRecords[0] ??
    null

  const selectedApplicationAttempt =
    selectedApplicationRecord
      ? [...workspace.applicationAttempts]
          .filter((attempt) => attempt.jobId === selectedApplicationRecord.jobId)
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null
      : null

  const context: JobFinderPageContext = {
    actionState,
    busy: actionState.busy,
    onAnalyzeProfileFromResume: () =>
      void runAction(
        actions.analyzeProfileFromResume,
        () => undefined,
        null
      ),
    onApproveApply: (jobId: string) =>
      void runAction(
        () => actions.approveApply(jobId),
        () => {
          void navigate('/job-finder/applications')
        },
        'Easy Apply marked as submitted and moved into Applications.'
      ),
    onCheckBrowserSession: () =>
      void runAction(
        actions.checkBrowserSession,
        () => undefined,
        'Browser session status refreshed.'
      ),
    onDismissJob: (jobId: string) =>
      void runAction(
        () => actions.dismissDiscoveryJob(jobId),
        () => undefined,
        'Saved job archived from discovery.'
      ),
    onGenerateResume: (jobId: string) =>
      void runAction(
        () => actions.generateResume(jobId),
        () => setSelectedReviewJobId(jobId),
        'A tailored resume was generated for the selected job.'
      ),
    onImportResume: () =>
      void runAction(
        actions.importResume,
        () => undefined,
        'Base resume replaced from a local document.'
      ),
    onOpenBrowserSession: () =>
      void runAction(
        actions.openBrowserSession,
        () => undefined,
        workspace.browserSession.status === 'ready'
          ? 'Chrome session refreshed.'
          : 'Chrome profile opened and session status refreshed.'
      ),
    onQueueJob: (jobId: string) =>
      void runAction(
        () => actions.queueJobForReview(jobId),
        () => {
          setSelectedReviewJobId(jobId)
          void navigate('/job-finder/review-queue')
        },
        'Job moved into the review queue.'
      ),
    onRunAgentDiscovery: () => {
      setLiveDiscoveryEvents([])
      void runAction(
        () => actions.runAgentDiscovery((event) => {
          setLiveDiscoveryEvents((current) => [...current, event])
        }),
        () => {
          setLiveDiscoveryEvents([])
        },
        'AI Agent discovery run completed and saved locally.'
      )
    },
    onResetWorkspace: () =>
      void runAction(
        actions.resetWorkspace,
        () => {
          void navigate('/job-finder/profile')
        },
        'Workspace reset to a fresh profile, cleared resume state, and empty job history.'
      ),
    onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) =>
      void runAction(
        () => actions.saveWorkspaceInputs(profile, searchPreferences),
        () => undefined,
        null
      ),
    onSaveProfile: (profile: CandidateProfile) =>
      void runAction(() => actions.saveProfile(profile), () => undefined, null),
    onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) =>
      void runAction(
        () => actions.saveSearchPreferences(searchPreferences),
        () => undefined,
        null
      ),
    onSaveSettings: (settings: JobFinderSettings) =>
      void runAction(() => actions.saveSettings(settings), () => undefined, null),
    onSelectApplicationRecord: setSelectedApplicationRecordId,
    onSelectDiscoveryJob: setSelectedDiscoveryJobId,
    onSelectReviewItem: setSelectedReviewJobId,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    liveDiscoveryEvents,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    workspace
  }

  return (
    <JobFinderShell actionMessage={actionState.message} platform={platform} workspace={workspace}>
      <Outlet context={context} />
    </JobFinderShell>
  )
}
