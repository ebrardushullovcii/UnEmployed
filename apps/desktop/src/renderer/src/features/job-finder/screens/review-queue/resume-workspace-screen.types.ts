import type {
  JobFinderResumePreview,
  JobFinderResumeWorkspace,
  JobFinderSetResumeClaimConfirmationInput,
  JobFinderWorkspaceSnapshot,
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeTemplateDefinition,
} from "@unemployed/contracts";
import type { ResumeWorkHistoryDecisionRequest } from "./resume-workspace-work-history-decisions";

export interface ResumeWorkspaceScreenProps {
  actionMessage: string | null;
  jobId: string;
  isWorkspacePending: boolean;
  workspace: JobFinderResumeWorkspace | null;
  availableResumeTemplates: readonly ResumeTemplateDefinition[];
  assistantMessages: readonly ResumeAssistantMessage[];
  assistantPending: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /**
   * Reports each user-authored draft edit — including edits made while the
   * studio was already dirty, when no dirty transition fires — so the shell
   * can retire an exact-request save retry captured before the edit.
   */
  onDraftEdited?: () => void;
  onPreviewDraft: (
    draft: ResumeDraft,
    requestId?: string,
  ) => Promise<JobFinderResumePreview>;
  onSaveDraft: (draft: ResumeDraft) => void;
  onSaveDraftAndThen: (
    draft: ResumeDraft,
    next: () => void | Promise<void>,
    successMessage?: string | null,
  ) => void;
  onExportPdf: (jobId: string) => void;
  onApproveResume: (jobId: string, exportId: string) => void;
  onClearResumeApproval: (jobId: string) => void;
  onSetWorkHistoryReviewAcknowledgment: (
    jobId: string,
    decision: ResumeWorkHistoryDecisionRequest,
  ) => void;
  /**
   * Optional until the Resume Studio claim-confirmation control lands; when
   * present it resolves with the committed workspace snapshot.
   */
  onSetResumeClaimConfirmation?: (
    input: JobFinderSetResumeClaimConfirmationInput,
  ) => Promise<JobFinderWorkspaceSnapshot>;
  onRegenerateDraft: (jobId: string) => void;
  onRegenerateSection: (jobId: string, sectionId: string) => void;
  onRestoreRevision: (jobId: string, revisionId: string) => void;
  onApplyPatch: (
    patch: ResumeDraftPatch,
    revisionReason?: string | null,
  ) => void;
  onSendAssistantMessage: (jobId: string, content: string) => void;
  onResolveAssistantProposal?: (
    jobId: string,
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void;
}
