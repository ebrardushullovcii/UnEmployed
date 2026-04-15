import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  DiscoveryActivityEvent,
  JobFinderResumeWorkspace,
  JobFinderWorkspaceSnapshot,
  ProfileCopilotMessage,
  ProfileSetupState,
  ResumeAssistantMessage,
} from '@unemployed/contracts'
import type {
  ActionState,
  JobFinderShellActions,
} from '@renderer/features/job-finder/lib/job-finder-types'
import { type JobFinderPageContext } from './job-finder-page-routes'
import {
  createActionRunners,
  createPrimaryPageActions,
} from './use-job-finder-page-controller-actions'

type BuildJobFinderPageContextArgs = {
  actionState: ActionState
  actions: JobFinderShellActions
  activeRouteResumeAssistantMessages: readonly ResumeAssistantMessage[]
  activeRouteResumeAssistantPending: boolean
  activeRouteResumeWorkspace: JobFinderResumeWorkspace | null
  canImportResume: boolean
  confirmLeaveDirtyResumeWorkspace: () => boolean
  importResumeGuardMessage: string | null
  isCurrentResumeAssistantRequest: (jobId: string, requestToken: number) => boolean
  isCurrentResumeWorkspaceJob: (jobId: string) => boolean
  liveDiscoveryEvents: readonly DiscoveryActivityEvent[]
  locationPathname: string
  navigate: (path: string, options?: { replace?: boolean; state?: unknown }) => void
  profileCopilotBusy: boolean
  profileCopilotPendingContextKey: string | null
  profileSetupState: ProfileSetupState | null
  refreshResumeWorkspace: (
    jobId: string,
    options?: {
      updateAssistantMessages?: boolean
    },
  ) => Promise<boolean>
  resumeAssistantRequestTokenRef: MutableRefObject<number>
  selectedApplicationAttempt: JobFinderPageContext['selectedApplicationAttempt']
  selectedApplicationRecord: JobFinderPageContext['selectedApplicationRecord']
  selectedDiscoveryJob: JobFinderPageContext['selectedDiscoveryJob']
  selectedReviewItem: JobFinderPageContext['selectedReviewItem']
  selectedReviewJob: JobFinderPageContext['selectedReviewJob']
  selectedTailoredAsset: JobFinderPageContext['selectedTailoredAsset']
  setActionState: Dispatch<SetStateAction<ActionState>>
  setLiveDiscoveryEvents: Dispatch<SetStateAction<DiscoveryActivityEvent[]>>
  setOptimisticProfileCopilotMessages: Dispatch<
    SetStateAction<readonly ProfileCopilotMessage[]>
  >
  setProfileCopilotBusy: Dispatch<SetStateAction<boolean>>
  setProfileCopilotPendingContextKey: Dispatch<SetStateAction<string | null>>
  setProfileSurfaceDirty: Dispatch<SetStateAction<boolean>>
  setResumeAssistantMessages: Dispatch<
    SetStateAction<readonly ResumeAssistantMessage[]>
  >
  setResumeAssistantPending: Dispatch<SetStateAction<boolean>>
  setResumeWorkspace: Dispatch<SetStateAction<JobFinderResumeWorkspace | null>>
  setResumeWorkspaceDirty: Dispatch<SetStateAction<boolean>>
  setSelectedApplicationRecordId: (recordId: string) => void
  setSelectedDiscoveryJobId: (jobId: string) => void
  setSelectedReviewJobId: (jobId: string) => void
  sourceDebugRunIdRef: MutableRefObject<number>
  workspace: JobFinderWorkspaceSnapshot
}

export function buildJobFinderPageContext(
  args: BuildJobFinderPageContextArgs,
): JobFinderPageContext {
  const {
    actionState,
    actions,
    activeRouteResumeAssistantMessages,
    activeRouteResumeAssistantPending,
    activeRouteResumeWorkspace,
    canImportResume,
    confirmLeaveDirtyResumeWorkspace,
    importResumeGuardMessage,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    liveDiscoveryEvents,
    locationPathname,
    navigate,
    profileCopilotBusy,
    profileCopilotPendingContextKey,
    profileSetupState,
    refreshResumeWorkspace,
    resumeAssistantRequestTokenRef,
    selectedApplicationAttempt,
    selectedApplicationRecord,
    selectedDiscoveryJob,
    selectedReviewItem,
    selectedReviewJob,
    selectedTailoredAsset,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
    setProfileCopilotBusy,
    setProfileCopilotPendingContextKey,
    setProfileSurfaceDirty,
    setResumeAssistantMessages,
    setResumeAssistantPending,
    setResumeWorkspace,
    setResumeWorkspaceDirty,
    setSelectedApplicationRecordId,
    setSelectedDiscoveryJobId,
    setSelectedReviewJobId,
    sourceDebugRunIdRef,
    workspace,
  } = args

  const { runAction, runResumeWorkspaceAction } = createActionRunners({
    setActionState,
  })

  const primaryActions = createPrimaryPageActions({
    actions,
    activeRouteResumeWorkspace,
    canImportResume,
    confirmLeaveDirtyResumeWorkspace,
    importResumeGuardMessage,
    isCurrentResumeAssistantRequest,
    isCurrentResumeWorkspaceJob,
    locationPathname,
    navigate,
    profileSetupState,
    refreshResumeWorkspace,
    resumeAssistantRequestTokenRef,
    runAction,
    runResumeWorkspaceAction,
    setActionState,
    setLiveDiscoveryEvents,
    setOptimisticProfileCopilotMessages,
    setProfileCopilotBusy,
    setProfileCopilotPendingContextKey,
    setResumeAssistantMessages,
    setResumeAssistantPending,
    setResumeWorkspace,
    setResumeWorkspaceDirty,
    setSelectedReviewJobId,
    sourceDebugRunIdRef,
    workspace,
  })

  return {
    actionState,
    busy: actionState.busy,
    canImportResume,
    importResumeGuardMessage,
    profileCopilotBusy,
    ...primaryActions,
    onProfileSurfaceDirtyChange: setProfileSurfaceDirty,
    profileCopilotPendingContextKey,
    onGetSourceDebugRunDetails: actions.getSourceDebugRunDetails,
    onSaveSourceInstructionArtifact: (targetId, artifact) =>
      void runAction(
        () => actions.saveSourceInstructionArtifact(targetId, artifact),
        () => undefined,
        'Saved guidance updated.',
      ),
    onVerifySourceInstructions: (targetId: string, instructionId: string) =>
      void runAction(
        () => actions.verifySourceInstructions(targetId, instructionId),
        () => undefined,
        'Saved guidance checked.',
      ),
    onResetWorkspace: () => {
      if (!confirmLeaveDirtyResumeWorkspace()) {
        return
      }

      void runAction(
        actions.resetWorkspace,
        (snapshot) => {
          navigate(
            snapshot.profileSetupState.status === 'not_started'
              ? '/job-finder/profile/setup'
              : '/job-finder/profile',
          )
        },
        'Workspace reset. Your profile, resume, jobs, and browser session were cleared on this device.',
      )
    },
    onResumeWorkspaceDirtyChange: (dirty: boolean) => {
      setResumeWorkspaceDirty(dirty)
    },
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
    resumeAssistantMessages: activeRouteResumeAssistantMessages,
    resumeAssistantPending: activeRouteResumeAssistantPending,
    resumeWorkspace: activeRouteResumeWorkspace,
    workspace,
  }
}
