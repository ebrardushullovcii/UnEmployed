import { CheckCircle2, CircleDashed, Pencil, TriangleAlert } from 'lucide-react'
import type { BrowserSessionState, ReviewQueueItem, SavedJob, TailoredAsset } from '@unemployed/contracts'
import { Button, ProgressBar } from '@renderer/components/ui'
import { EmptyState } from '../../components/empty-state'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import {
  getApplyReadinessStatus,
  hasResumeGenerationFailure,
  isResumeGenerationInProgress,
  needsResumeGeneration,
  type ApplySupportState
} from './review-queue-status'

interface ReviewQueueMissionPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  onApproveApply: (jobId: string) => void
  onEditResumeWorkspace: (jobId: string) => void
  onGenerateResume: (jobId: string) => void
  selectedAsset: TailoredAsset | null
  selectedItem: ReviewQueueItem | null
  selectedJob: SavedJob | null
}

interface ApplyChecklistItem {
  description: string
  label: string
  state: 'attention' | 'complete' | 'in_progress' | 'blocked'
}

function getChecklistTone(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return 'positive' as const
    case 'in_progress':
    case 'attention':
      return 'active' as const
    default:
      return 'critical' as const
  }
}

function getChecklistIcon(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return CheckCircle2
    case 'in_progress':
      return CircleDashed
    case 'attention':
      return TriangleAlert
    default:
      return TriangleAlert
  }
}

function getApplySupportState(selectedJob: SavedJob | null): ApplySupportState {
  if (!selectedJob) {
    return 'supported'
  }

  return selectedJob.applyPath === 'easy_apply' && selectedJob.easyApplyEligible
    ? 'supported'
    : 'manual_follow_up'
}

function getChecklistStateLabel(state: ApplyChecklistItem['state']) {
  switch (state) {
    case 'complete':
      return 'Ready'
    case 'in_progress':
      return 'In progress'
    case 'attention':
      return 'Heads-up'
    default:
      return 'Blocked'
  }
}

function getNextChecklistItem(checklist: readonly ApplyChecklistItem[]) {
  return (
    checklist.find((item) => item.state === 'blocked') ??
    checklist.find((item) => item.state === 'in_progress') ??
    checklist.find((item) => item.state === 'attention') ??
    null
  )
}

export function ReviewQueueMissionPanel({
  actionMessage,
  browserSession,
  busy,
  onApproveApply,
  onEditResumeWorkspace,
  onGenerateResume,
  selectedAsset,
  selectedItem,
  selectedJob
}: ReviewQueueMissionPanelProps) {
  const needsGeneration = needsResumeGeneration(selectedItem)
  const hasGenerationFailure = hasResumeGenerationFailure(selectedItem)
  const isGenerating = isResumeGenerationInProgress(selectedItem)
  const applySupportState = getApplySupportState(selectedJob)
  const resumeReviewStatus = selectedItem?.resumeReview.status ?? 'not_started'
  const approvedResumeReview = selectedItem?.resumeReview.status === 'approved'
    ? selectedItem.resumeReview
    : null
  const hasApprovedResumeExport = approvedResumeReview !== null
  const hasReadyApprovedAsset =
    selectedAsset !== null &&
    selectedAsset.status === 'ready' &&
    selectedItem?.resumeAssetId === selectedAsset.id &&
    approvedResumeReview !== null &&
    selectedAsset.storagePath === approvedResumeReview.approvedFilePath
  const canApproveApply =
    browserSession.status === 'ready' &&
    hasApprovedResumeExport &&
    hasReadyApprovedAsset
  const primaryActionLabel = isGenerating
    ? 'Preparing resume...'
    : hasGenerationFailure
      ? 'Try again'
    : needsGeneration
      ? 'Create tailored resume'
      : 'Start application'
  const browserActionMessage =
    browserSession.status === 'ready'
      ? null
      : browserSession.status === 'login_required'
        ? 'Sign in to the browser before you start the application.'
      : browserSession.status === 'blocked'
          ? 'Resolve the browser issue before you start the application.'
          : 'Wait for the browser to finish starting before you start the application.'
  const applyReadinessStatus = getApplyReadinessStatus({
    applySupportState,
    browserSession,
    hasGenerationFailure,
    hasReadyApprovedAsset,
    isGenerating,
    needsGeneration,
    resumeReviewStatus,
    selectedItem
  })
  const checklist: ApplyChecklistItem[] = [
    {
      label: 'Tailored resume ready',
      state: hasGenerationFailure ? 'blocked' : isGenerating ? 'in_progress' : needsGeneration ? 'blocked' : 'complete',
      description: hasGenerationFailure
        ? 'The last resume run failed. Try again or open the workspace to fix it.'
        : needsGeneration
          ? 'Create the first tailored resume for this job.'
          : isGenerating
            ? 'Job Finder is still preparing the latest draft.'
            : 'A tailored resume exists for this job.'
    },
    {
      label: 'Approved PDF ready',
      state: hasReadyApprovedAsset ? 'complete' : 'blocked',
      description: hasReadyApprovedAsset
        ? 'The current approved PDF will be used when you start the application.'
        : resumeReviewStatus === 'approved'
          ? 'The approved PDF could not be matched to the latest ready export. Reopen the workspace and approve again.'
          : resumeReviewStatus === 'stale'
            ? 'Your last approved PDF is out of date. Export and approve a fresh version.'
            : 'Open the workspace to export a PDF and approve the version you want to use.'
    },
    {
      label: 'Apply path',
      state: applySupportState === 'manual_follow_up' ? 'attention' : 'complete',
      description: applySupportState === 'manual_follow_up'
        ? 'Saved job data does not confirm a supported Easy Apply path. Starting can still stop with a manual-only next step in Applications.'
        : 'Saved job data still points to a supported Easy Apply path. Live questions can still pause automation before submission.'
    },
    {
      label: 'Browser ready',
      state: browserSession.status === 'ready' ? 'complete' : browserSession.status === 'unknown' ? 'in_progress' : 'blocked',
      description: browserSession.status === 'ready'
        ? 'The browser is ready for supported application steps.'
        : browserActionMessage ?? 'Open or refresh the browser before continuing.'
    }
  ]
  const nextBlockedChecklistItem = getNextChecklistItem(checklist)

  return (
    <section className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full xl:min-h-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-2 pt-6">
        <p className="font-display text-(length:--text-small) font-bold uppercase tracking-(--tracking-caps) text-primary">Apply readiness</p>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-6 pb-6 pt-4">
        <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Current state</span>
            <StatusBadge tone={applyReadinessStatus.tone}>{applyReadinessStatus.label}</StatusBadge>
          </div>
          <p className="text-(length:--text-small) leading-6 text-foreground-soft">
            {!selectedItem
              ? 'Select a shortlisted job to see what needs attention before you apply.'
              : hasGenerationFailure
              ? 'The last tailored resume run failed. Try again or open the resume workspace before you continue.'
              : needsGeneration
              ? 'Create a tailored resume first.'
              : isGenerating
                ? 'Job Finder is still preparing the latest resume for this job.'
                : !hasReadyApprovedAsset
                  ? resumeReviewStatus === 'stale'
                    ? 'The last approved PDF is out of date and needs a fresh approval.'
                    : 'Open the resume workspace to export a PDF and approve it before applying.'
                : applySupportState === 'manual_follow_up'
                  ? 'The approved PDF is ready, but saved job data does not confirm a supported Easy Apply path. Starting can still stop with a manual-only next step.'
                : hasReadyApprovedAsset
                  ? 'The approved PDF is ready to use. Starting now can still pause if the live form asks for unsupported information.'
                  : 'Open the resume workspace to export a PDF and approve it before applying.'}
          </p>
          {selectedItem && isGenerating ? <ProgressBar ariaLabel="Resume progress" percent={selectedItem?.progressPercent ?? 0} /> : null}
        </div>
        {selectedItem && selectedJob ? (
          <>
            <div className="surface-card-tint grid min-w-0 gap-2 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Checklist</span>
                {nextBlockedChecklistItem ? (
                  <StatusBadge tone={getChecklistTone(nextBlockedChecklistItem.state)}>
                    Next: {nextBlockedChecklistItem.label}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="positive">Ready to start</StatusBadge>
                )}
              </div>
              <div className="grid gap-3">
                {checklist.map((item) => {
                  const Icon = getChecklistIcon(item.state)

                  return (
                    <div key={item.label} className="grid gap-2 rounded-(--radius-small) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className="mt-0.5 size-4 shrink-0 text-current" />
                          <strong className="text-(length:--text-small) text-(--text-headline)">{item.label}</strong>
                        </div>
                        <StatusBadge tone={getChecklistTone(item.state)}>
                          {getChecklistStateLabel(item.state)}
                        </StatusBadge>
                      </div>
                      <p className="text-(length:--text-small) leading-6 text-foreground-soft">{item.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="surface-card-tint grid min-w-0 gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <div className="grid gap-1">
                <span className="text-(length:--text-label) uppercase tracking-(--tracking-heading) text-muted-foreground">Job summary</span>
                <strong className="text-(length:--text-body) text-(--text-headline)">{selectedJob.title}</strong>
              </div>
              <p className="text-(length:--text-body) leading-7 text-foreground-soft">{selectedJob.summary ?? selectedJob.description}</p>
              {selectedJob.employerWebsiteUrl ? (
                <p className="min-w-0 break-words text-(length:--text-small) leading-6 text-foreground-soft">
                  Company site: {selectedJob.employerWebsiteUrl}
                </p>
              ) : null}
            </div>
            <div className="surface-card-tint min-w-0 rounded-(--radius-field) border border-(--surface-panel-border) p-4">
              <PreferenceList label="Why it fits" values={selectedJob.matchAssessment.reasons} />
            </div>
            {actionMessage ? <p aria-atomic="true" aria-live="polite" className="min-w-0 break-words text-(length:--text-small) leading-6 text-primary" role="status">{actionMessage}</p> : null}
            <div className="grid min-w-0 gap-2.5">
              <Button
                className="h-11 w-full"
                variant="primary"
                disabled={busy || isGenerating || (needsGeneration || hasGenerationFailure ? false : !canApproveApply)}
                onClick={() => {
                  if (needsGeneration || hasGenerationFailure) {
                    onGenerateResume(selectedItem.jobId)
                    return
                  }

                  onApproveApply(selectedItem.jobId)
                }}
                type="button"
              >
                {primaryActionLabel}
              </Button>
              <Button
                className="h-11 w-full"
                onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                type="button"
                variant="secondary"
              >
                <Pencil aria-hidden="true" className="size-4" focusable="false" />
                Open resume workspace
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="Choose a job"
            description="Select a shortlisted job to see what its resume needs next and when it is ready to apply."
          />
        )}
      </div>
    </section>
  )
}
