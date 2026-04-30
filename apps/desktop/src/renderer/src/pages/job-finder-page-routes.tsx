import type {
  ApplyRunDetails,
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderApplyQueueActionInput,
  JobFinderApplyConsentActionInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderResumePreview,
  ProfileCopilotContext,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileSetupStep,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugRunDetails
} from '@unemployed/contracts'
import type { PendingActionScope } from './job-finder-pending-actions'
import { jobFinderPendingActions } from './job-finder-pending-actions'
import { ProfileSetupScreen } from '@renderer/features/job-finder/components/profile/setup/profile-setup-screen'
import { ProfileScreen } from '@renderer/features/job-finder/screens/profile-screen'
import { ApplicationsScreen } from '@renderer/features/job-finder/screens/applications-screen'
import { DiscoveryScreen } from '@renderer/features/job-finder/screens/discovery-screen'
import { ReviewQueueScreen } from '@renderer/features/job-finder/screens/review-queue-screen'
import { ResumeWorkspaceScreen } from '@renderer/features/job-finder/screens/review-queue/resume-workspace-screen'
import { SettingsScreen } from '@renderer/features/job-finder/screens/settings-screen'
import type { ActionState } from '@renderer/features/job-finder/lib/job-finder-types'
import { getDefaultProfileRoute } from '@renderer/features/job-finder/lib/job-finder-utils'
import { Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom'

export interface JobFinderPageContext {
  actionState: ActionState
  canImportResume: boolean
  importResumeGuardMessage: string | null
  isPending: (scope: PendingActionScope) => boolean
  isAnyPending: (scopes: readonly PendingActionScope[]) => boolean
  profileCopilotBusy: boolean
  liveDiscoveryEvents: readonly DiscoveryActivityEvent[]
  onAnalyzeProfileFromResume: () => void
  onApproveApplyRun: (runId: string) => void
  onApproveApply: (jobId: string) => void
  onCancelApplyRun: (runId: string) => void
  onRevokeApplyRunApproval: (runId: string) => void
  onResolveApplyConsentRequest: (
    requestId: string,
    action: JobFinderApplyConsentActionInput['action']
  ) => void
  onStartAutoApply: (jobId: string) => void
  onStartAutoApplyQueue: (jobIds: JobFinderApplyQueueActionInput['jobIds']) => void
  onStartApplyCopilot: (jobId: string) => void
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void
  onApplyProfileSetupReviewAction: (
    reviewItemId: string,
    action: 'confirm' | 'dismiss' | 'clear_value'
  ) => void
  onCheckBrowserSession: () => void
  onDismissJob: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onApproveResume: (jobId: string, exportId: string) => void
  onClearResumeApproval: (jobId: string) => void
  onExportResumePdf: (jobId: string) => void
  onPreviewResumeDraft: (draft: ResumeDraft) => Promise<JobFinderResumePreview>
  onGetApplyRunDetails: (runId: string, jobId: string) => Promise<ApplyRunDetails>
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>
  onImportResume: () => void
  onOpenBrowserSession: (input?: JobFinderOpenBrowserSessionInput) => void
  onOpenProfile: () => void
  onProfileSurfaceDirtyChange: (dirty: boolean) => void
  profileCopilotPendingContextKey: string | null
  onQueueJob: (jobId: string) => void
  onRejectProfileCopilotPatchGroup: (patchGroupId: string) => void
  onResetWorkspace: () => void
  onResumeProfileSetup: (step?: ProfileSetupStep) => void
  onRunAgentDiscovery?: () => void
  onRunDiscoveryForTarget?: (targetId: string) => void
  onRefreshResumeWorkspace: (jobId: string) => void
  onResumeWorkspaceDirtyChange: (dirty: boolean) => void
  onRegenerateResumeDraft: (jobId: string) => void
  onRegenerateResumeSection: (jobId: string, sectionId: string) => void
  onSaveResumeDraft: (draft: ResumeDraft) => void
  onSaveResumeDraftAndThen: (
    draft: ResumeDraft,
    next: () => void,
    successMessage?: string | null
  ) => void
  onSaveSetupStep: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
    nextStep: ProfileSetupStep,
    options?: { message?: string; openProfile?: boolean; stayOnCurrentStep?: boolean }
  ) => void
  onApplyResumePatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onSendProfileCopilotMessage: (
    content: string,
    context?: ProfileCopilotContext
  ) => void
  onSendResumeAssistantMessage: (jobId: string, content: string) => void
  onUndoProfileRevision: (revisionId: string) => void
  onRunSourceDebug: (targetId: string) => void
  onSaveAll: (profile: CandidateProfile, searchPreferences: JobSearchPreferences) => void
  onSaveProfile: (profile: CandidateProfile) => void
  onSaveSearchPreferences: (searchPreferences: JobSearchPreferences) => void
  onSaveSettings: (settings: JobFinderSettings) => void
  onSaveSourceInstructionArtifact: (
    targetId: string,
    artifact: EditableSourceInstructionArtifact
  ) => void
  onSelectApplicationRecord: (recordId: string) => void
  onSelectDiscoveryJob: (jobId: string) => void
  onSelectReviewItem: (jobId: string) => void
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void
  selectedApplicationAttempt:
    | JobFinderWorkspaceSnapshot['applicationAttempts'][number]
    | null
  selectedApplicationRecord:
    | JobFinderWorkspaceSnapshot['applicationRecords'][number]
    | null
  selectedDiscoveryJob:
    | JobFinderWorkspaceSnapshot['discoveryJobs'][number]
    | null
  selectedReviewItem: JobFinderWorkspaceSnapshot['reviewQueue'][number] | null
  selectedReviewJob: JobFinderWorkspaceSnapshot['discoveryJobs'][number] | null
  selectedTailoredAsset:
    | JobFinderWorkspaceSnapshot['tailoredAssets'][number]
    | null
  resumeAssistantMessages: readonly ResumeAssistantMessage[]
  resumeAssistantPending: boolean
  resumeWorkspace: JobFinderResumeWorkspace | null
  workspace: JobFinderWorkspaceSnapshot
}

function useJobFinderPageContext() {
  return useOutletContext<JobFinderPageContext>()
}

export function WorkspaceStateScreen(props: {
  kicker: string
  message: string
  title: string
  tone?: 'default' | 'error'
}) {
  return (
    <main className="grid min-h-full place-items-center bg-canvas px-6 py-10">
      <div
        aria-atomic="true"
        aria-live={props.tone === 'error' ? 'assertive' : 'polite'}
        className={
          props.tone === 'error'
            ? 'grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-critical/35 bg-(--workspace-state-card-bg-error) p-8 shadow-(--workspace-state-card-shadow)'
            : 'grid max-w-(--workspace-state-card-max-width) gap-3 rounded-(--workspace-state-card-radius) border border-border-subtle bg-(--workspace-state-card-bg-default) p-8 shadow-(--workspace-state-card-shadow)'
        }
        role={props.tone === 'error' ? 'alert' : 'status'}
      >
        <p className="text-(length:--text-tiny) uppercase tracking-[0.24em] text-foreground-muted">
          {props.kicker}
        </p>
        <h1>{props.title}</h1>
        <p>{props.message}</p>
      </div>
    </main>
  )
}

export function buildSourceDebugOutcomeMessage(
  workspace: JobFinderWorkspaceSnapshot,
  targetId: string
): string {
  const target = workspace.searchPreferences.discovery.targets.find(
    (entry) => entry.id === targetId
  )
  const latestRun = target?.lastDebugRunId
    ? workspace.activeSourceDebugRun?.id === target.lastDebugRunId
      ? workspace.activeSourceDebugRun
      : (workspace.recentSourceDebugRuns.find((run) => run.id === target.lastDebugRunId) ?? null)
    : null
  const activeRunIsLatest = Boolean(
    latestRun &&
      workspace.activeSourceDebugRun?.id === latestRun.id &&
      latestRun.state !== 'paused_manual' &&
      latestRun.state !== 'failed' &&
      latestRun.state !== 'interrupted' &&
      latestRun.state !== 'cancelled'
  )

  if (activeRunIsLatest) {
    return latestRun?.state === 'idle'
      ? 'Checking this source now.'
      : 'Still checking this source.'
  }

  if (latestRun?.state === 'paused_manual') {
    return (
      latestRun.manualPrerequisiteSummary ??
      latestRun.finalSummary ??
      'Source check paused until a manual step is completed.'
    )
  }

  if (latestRun?.state === 'failed') {
    return (
      latestRun.finalSummary ??
      'The source check failed.'
    )
  }

  if (latestRun?.state === 'interrupted') {
    return latestRun.finalSummary ?? 'The source check was interrupted before it could finish.'
  }

  if (latestRun?.state === 'cancelled') {
    return latestRun.finalSummary ?? 'The source check was cancelled before it could finish.'
  }

  if (target?.instructionStatus === 'validated') {
    return 'This source is ready to use.'
  }

  if (target?.instructionStatus === 'draft') {
    return 'The source check saved draft guidance. Review it before relying on this source.'
  }

  if (target?.instructionStatus === 'unsupported') {
    return 'This source is not supported yet.'
  }

  return (
    latestRun?.finalSummary ??
    'The source check finished without saving reusable guidance.'
  )
}

export function JobFinderProfileRoute() {
  const context = useJobFinderPageContext()
  const location = useLocation()
  const forceFullProfile = Boolean(
    (location.state as { forceFullProfile?: boolean } | null)?.forceFullProfile
  )
  const resolvedProfileRoute = getDefaultProfileRoute(context.workspace.profileSetupState, {
    forceFullProfile
  })

  if (resolvedProfileRoute !== '/job-finder/profile') {
    return <Navigate replace to={resolvedProfileRoute} />
  }

  return (
    <ProfileScreen
      actionState={context.actionState}
      importResumeGuardMessage={context.importResumeGuardMessage}
      pendingActions={{
        analyzeProfile: context.isPending(jobFinderPendingActions.profileAnalyze()),
        browserSession: (targetId) =>
          context.isPending(jobFinderPendingActions.browserSessionTarget(targetId)),
        importResume: context.isPending(jobFinderPendingActions.profileImport()),
        profileCopilotBusy: context.profileCopilotBusy,
        profileMutation: context.isPending(jobFinderPendingActions.profileMutation()),
        profileSetup: context.isPending(jobFinderPendingActions.profileSetup()),
        sourceDebug: (targetId) =>
          context.isPending(jobFinderPendingActions.sourceDebug(targetId)),
        sourceInstruction: (targetId) =>
          context.isPending(jobFinderPendingActions.sourceInstruction(targetId)),
        sourceInstructionVerify: (instructionId) =>
          context.isPending(
            jobFinderPendingActions.sourceInstructionVerify(instructionId),
          ),
        targetDiscovery: (targetId) =>
          context.isPending(jobFinderPendingActions.discoveryTarget(targetId)),
      }}
      onApplyProfileCopilotPatchGroup={context.onApplyProfileCopilotPatchGroup}
      onAnalyzeProfileFromResume={context.onAnalyzeProfileFromResume}
      onGetSourceDebugRunDetails={context.onGetSourceDebugRunDetails}
      onImportResume={context.onImportResume}
      onOpenBrowserSessionForTarget={(targetId) => context.onOpenBrowserSession({ targetId })}
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      profileCopilotPendingContextKey={context.profileCopilotPendingContextKey}
      onResumeProfileSetup={context.onResumeProfileSetup}
      onRejectProfileCopilotPatchGroup={context.onRejectProfileCopilotPatchGroup}
      {...(context.onRunDiscoveryForTarget ? { onRunDiscoveryForTarget: context.onRunDiscoveryForTarget } : {})}
      onRunSourceDebug={context.onRunSourceDebug}
      onSaveAll={context.onSaveAll}
      onSaveSourceInstructionArtifact={context.onSaveSourceInstructionArtifact}
      onSendProfileCopilotMessage={context.onSendProfileCopilotMessage}
      onUndoProfileRevision={context.onUndoProfileRevision}
      onVerifySourceInstructions={context.onVerifySourceInstructions}
      latestResumeImportReviewCandidates={context.workspace.latestResumeImportReviewCandidates}
      latestResumeImportRun={context.workspace.latestResumeImportRun}
      profile={context.workspace.profile}
      profileCopilotMessages={context.workspace.profileCopilotMessages}
      profileRevisions={context.workspace.profileRevisions}
      profileSetupState={context.workspace.profileSetupState}
      recentSourceDebugRuns={context.workspace.recentSourceDebugRuns}
      searchPreferences={context.workspace.searchPreferences}
      sourceAccessPrompts={context.workspace.sourceAccessPrompts}
      sourceInstructionArtifacts={context.workspace.sourceInstructionArtifacts}
    />
  )
}

export function JobFinderProfileSetupRoute() {
  const context = useJobFinderPageContext()

  if (context.workspace.profileSetupState.status === 'completed') {
    return <Navigate replace to="/job-finder/profile" />
  }

  return (
    <ProfileSetupScreen
      actionState={context.actionState}
      importResumeGuardMessage={context.importResumeGuardMessage}
      isImportResumePending={context.isPending(jobFinderPendingActions.profileImport())}
      isProfileSetupPending={context.isPending(jobFinderPendingActions.profileSetup())}
      isReviewItemPending={(reviewItemId) =>
        context.isPending(jobFinderPendingActions.profileReviewItem(reviewItemId))
      }
      profileCopilotBusy={context.profileCopilotBusy}
      latestResumeImportReviewCandidates={context.workspace.latestResumeImportReviewCandidates}
      onApplyProfileCopilotPatchGroup={context.onApplyProfileCopilotPatchGroup}
      onApplyProfileSetupReviewAction={context.onApplyProfileSetupReviewAction}
      onContinueToProfile={context.onOpenProfile}
      onImportResume={context.onImportResume}
      onProfileSurfaceDirtyChange={context.onProfileSurfaceDirtyChange}
      profileCopilotPendingContextKey={context.profileCopilotPendingContextKey}
      onRejectProfileCopilotPatchGroup={context.onRejectProfileCopilotPatchGroup}
      onResumeSetup={context.onResumeProfileSetup}
      onSaveSetupStep={context.onSaveSetupStep}
      onSendProfileCopilotMessage={context.onSendProfileCopilotMessage}
      onUndoProfileRevision={context.onUndoProfileRevision}
      profile={context.workspace.profile}
      profileCopilotMessages={context.workspace.profileCopilotMessages}
      profileRevisions={context.workspace.profileRevisions}
      profileSetupState={context.workspace.profileSetupState}
      searchPreferences={context.workspace.searchPreferences}
    />
  )
}

export function JobFinderDiscoveryRoute() {
  const context = useJobFinderPageContext()

  return (
    <DiscoveryScreen
      actionState={context.actionState}
      activeRun={context.workspace.activeDiscoveryRun}
      browserSession={context.workspace.browserSession}
      isBrowserSessionPending={context.isPending(jobFinderPendingActions.browserSession())}
      isBrowserSessionPendingForTarget={(targetId) =>
        context.isPending(jobFinderPendingActions.browserSessionTarget(targetId))
      }
      isDiscoveryAllPending={context.isPending(jobFinderPendingActions.discoveryAll())}
      discoverySessions={context.workspace.discoverySessions}
      jobs={context.workspace.discoveryJobs}
      liveEvents={context.liveDiscoveryEvents}
      isJobPending={(jobId) =>
        context.isAnyPending([
          jobFinderPendingActions.discoveryJob(jobId),
          jobFinderPendingActions.resumeJob(jobId),
        ])
      }
      isTargetPending={(targetId) =>
        context.isAnyPending([
          jobFinderPendingActions.discoveryTarget(targetId),
          jobFinderPendingActions.sourceDebug(targetId),
          jobFinderPendingActions.sourceInstruction(targetId),
        ])
      }
      onDismissJob={context.onDismissJob}
      onOpenBrowserSession={context.onOpenBrowserSession}
      onOpenBrowserSessionForTarget={(targetId) => context.onOpenBrowserSession({ targetId })}
      onQueueJob={context.onQueueJob}
      onRunAgentDiscovery={context.onRunAgentDiscovery}
      {...(context.onRunDiscoveryForTarget ? { onRunDiscoveryForTarget: context.onRunDiscoveryForTarget } : {})}
      onSelectJob={context.onSelectDiscoveryJob}
      recentRuns={context.workspace.recentDiscoveryRuns}
      searchPreferences={context.workspace.searchPreferences}
      selectedJob={context.selectedDiscoveryJob}
      sourceAccessPrompts={context.workspace.sourceAccessPrompts}
    />
  )
}

export function JobFinderReviewQueueRoute() {
  const context = useJobFinderPageContext()

  return (
    <ReviewQueueScreen
      actionState={context.actionState}
      browserSession={context.workspace.browserSession}
      isApplyPending={context.isPending(jobFinderPendingActions.apply())}
      onApproveApply={context.onApproveApply}
      onStartAutoApply={context.onStartAutoApply}
      onStartAutoApplyQueue={context.onStartAutoApplyQueue}
      onStartApplyCopilot={context.onStartApplyCopilot}
      onEditResumeWorkspace={context.onEditResumeWorkspace}
      onGenerateResume={context.onGenerateResume}
      isJobPending={(jobId) => context.isPending(jobFinderPendingActions.resumeJob(jobId))}
      onSelectItem={context.onSelectReviewItem}
      queue={context.workspace.reviewQueue}
      selectedAsset={context.selectedTailoredAsset}
      selectedItem={context.selectedReviewItem}
      selectedJob={context.selectedReviewJob}
    />
  )
}

export function JobFinderResumeWorkspaceRoute() {
  const context = useJobFinderPageContext()
  const { jobId } = useParams<{ jobId: string }>()

  if (!jobId) {
    return <Navigate replace to="/job-finder/review-queue" />
  }

  const reviewItem = context.workspace.reviewQueue.find((item) => item.jobId === jobId)

  if (!reviewItem) {
    return <Navigate replace to="/job-finder/review-queue" />
  }

  return (
    <ResumeWorkspaceScreen
      actionMessage={context.actionState.message}
      assistantMessages={context.resumeAssistantMessages}
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      assistantPending={context.resumeAssistantPending}
      isWorkspacePending={context.isPending(jobFinderPendingActions.resumeJob(jobId))}
      jobId={jobId}
      onApproveResume={context.onApproveResume}
      onBack={() => context.onEditResumeWorkspace('')}
      onClearResumeApproval={context.onClearResumeApproval}
      onExportPdf={context.onExportResumePdf}
      onApplyPatch={context.onApplyResumePatch}
      onDirtyChange={context.onResumeWorkspaceDirtyChange}
      onPreviewDraft={context.onPreviewResumeDraft}
      onRefresh={() => context.onRefreshResumeWorkspace(jobId)}
      onRegenerateDraft={context.onRegenerateResumeDraft}
      onRegenerateSection={context.onRegenerateResumeSection}
      onSaveDraft={context.onSaveResumeDraft}
      onSaveDraftAndThen={context.onSaveResumeDraftAndThen}
      onSendAssistantMessage={context.onSendResumeAssistantMessage}
      workspace={context.resumeWorkspace}
    />
  )
}

export function JobFinderApplicationsRoute() {
  const context = useJobFinderPageContext()

  return (
    <ApplicationsScreen
      applicationAttempts={context.workspace.applicationAttempts}
      applicationRecords={context.workspace.applicationRecords}
      applyRuns={context.workspace.applyRuns}
      applyJobResults={context.workspace.applyJobResults}
      discoveryJobs={context.workspace.discoveryJobs}
      isApplyPending={context.isPending(jobFinderPendingActions.apply())}
      isApplyRequestPending={(requestId) =>
        context.isPending(jobFinderPendingActions.applyRequest(requestId))
      }
      isApplyRunPending={(runId) => context.isPending(jobFinderPendingActions.applyRun(runId))}
      onApproveApplyRun={context.onApproveApplyRun}
      onCancelApplyRun={context.onCancelApplyRun}
      onGetApplyRunDetails={context.onGetApplyRunDetails}
      onResolveApplyConsentRequest={context.onResolveApplyConsentRequest}
      onRevokeApplyRunApproval={context.onRevokeApplyRunApproval}
      onStartAutoApplyQueue={context.onStartAutoApplyQueue}
      onStartApplyCopilot={context.onStartApplyCopilot}
      onStartAutoApply={context.onStartAutoApply}
      onSelectRecord={context.onSelectApplicationRecord}
      selectedApplyRunId={context.workspace.selectedApplyRunId}
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
      availableResumeTemplates={context.workspace.availableResumeTemplates}
      browserSession={context.workspace.browserSession}
      isSavePending={context.isPending(jobFinderPendingActions.settingsSave())}
      isWorkspaceResetPending={context.isPending(jobFinderPendingActions.workspaceReset())}
      onResetWorkspace={context.onResetWorkspace}
      onSaveSettings={context.onSaveSettings}
      settings={context.workspace.settings}
    />
  )
}
