import type {
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeTemplateDefinition,
} from '@unemployed/contracts'

export interface ResumeWorkspaceScreenProps {
  actionMessage: string | null
  jobId: string
  isWorkspacePending: boolean
  workspace: JobFinderResumeWorkspace | null
  availableResumeTemplates: readonly ResumeTemplateDefinition[]
  assistantMessages: readonly ResumeAssistantMessage[]
  assistantPending: boolean
  onBack: () => void
  onRefresh: () => void
  onDirtyChange: (dirty: boolean) => void
  onPreviewDraft: (
    draft: ResumeDraft,
    requestId?: string,
  ) => Promise<JobFinderResumePreview>
  onSaveDraft: (draft: ResumeDraft) => void
  onSaveDraftAndThen: (
    draft: ResumeDraft,
    next: () => void | Promise<void>,
    successMessage?: string | null,
  ) => void
  onExportPdf: (jobId: string) => void
  onApproveResume: (jobId: string, exportId: string) => void
  onClearResumeApproval: (jobId: string) => void
  onRegenerateDraft: (jobId: string) => void
  onRegenerateSection: (jobId: string, sectionId: string) => void
  onRestoreRevision: (jobId: string, revisionId: string) => void
  onApplyPatch: (patch: ResumeDraftPatch, revisionReason?: string | null) => void
  onSendAssistantMessage: (jobId: string, content: string) => void
  onResolveAssistantProposal?: (
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void
}
