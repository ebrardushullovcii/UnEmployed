import { jobFinderPendingActions } from './job-finder-pending-actions'
import { ProfileSetupScreen } from '@renderer/features/job-finder/components/profile/setup/profile-setup-screen'
import { ProfileScreen } from '@renderer/features/job-finder/screens/profile-screen'
import { ApplicationsScreen } from '@renderer/features/job-finder/screens/applications-screen'
import { DiscoveryScreen } from '@renderer/features/job-finder/screens/discovery-screen'
import { ReviewQueueScreen } from '@renderer/features/job-finder/screens/review-queue-screen'
import { ResumeWorkspaceScreen } from '@renderer/features/job-finder/screens/review-queue/resume-workspace-screen'
import { SettingsScreen } from '@renderer/features/job-finder/screens/settings-screen'
import { getDefaultProfileRoute } from '@renderer/features/job-finder/lib/job-finder-utils'
import { Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom'
import type { JobFinderPageContext } from './job-finder-page-context'

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
