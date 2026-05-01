import type {
  ApplyRunDetails,
  CandidateProfile,
  DiscoveryActivityEvent,
  EditableSourceInstructionArtifact,
  JobFinderApplyConsentActionInput,
  JobFinderApplyQueueActionInput,
  JobFinderOpenBrowserSessionInput,
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  JobFinderSettings,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileCopilotContext,
  ProfileSetupStep,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  SourceDebugRunDetails,
} from '@unemployed/contracts'
import type { PendingActionScope } from './job-finder-pending-actions'
import type { ActionState } from '@renderer/features/job-finder/lib/job-finder-types'

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
    action: JobFinderApplyConsentActionInput['action'],
  ) => void
  onStartAutoApply: (jobId: string) => void
  onStartAutoApplyQueue: (jobIds: JobFinderApplyQueueActionInput['jobIds']) => void
  onStartApplyCopilot: (jobId: string) => void
  onApplyProfileCopilotPatchGroup: (patchGroupId: string) => void
  onApplyProfileSetupReviewAction: (
    reviewItemId: string,
    action: 'confirm' | 'dismiss' | 'clear_value',
  ) => void
  onCheckBrowserSession: () => void
  onDismissJob: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  onRemoveReviewJob: (jobId: string) => void
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
    successMessage?: string | null,
  ) => void
  onSaveSetupStep: (
    profile: CandidateProfile,
    searchPreferences: JobSearchPreferences,
    nextStep: ProfileSetupStep,
    options?: { message?: string; openProfile?: boolean; stayOnCurrentStep?: boolean },
  ) => void
  onApplyResumePatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onSendProfileCopilotMessage: (
    content: string,
    context?: ProfileCopilotContext,
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
    artifact: EditableSourceInstructionArtifact,
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
  selectedDiscoveryJob: JobFinderWorkspaceSnapshot['discoveryJobs'][number] | null
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
