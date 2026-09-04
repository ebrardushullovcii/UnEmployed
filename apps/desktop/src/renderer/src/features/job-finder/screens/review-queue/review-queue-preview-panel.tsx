import type {
  ResumeSourceDocument,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { ProgressBar } from "@renderer/components/ui";
import { EmptyState } from "../../components/empty-state";
import { StatusBadge } from "../../components/status-badge";
import { Link } from "react-router-dom";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";
import { cn } from "@renderer/lib/cn";
import {
  formatResumeOperationElapsed,
  RESUME_DRAFT_EXPECTED_WAIT_LABEL,
} from "./review-queue-progress";
import {
  getReviewQueueWorkflowStatus,
  hasResumeGenerationFailure,
  isResumeGenerationInProgress,
  needsResumeGeneration,
} from "./review-queue-status";

interface ReviewQueuePreviewPanelProps {
  /** Seconds the current preparation has been running. */
  pendingElapsedSeconds: number;
  embedded?: boolean;
  /** Stacked into one page column: the column owns the scrolling. */
  stacked?: boolean;
  isGenerating?: boolean;
  isPendingTooLong?: boolean;
  onEditResumeWorkspace: (jobId: string) => void;
  onGenerateResume: (jobId: string) => Promise<boolean>;
  originalResume?: ResumeSourceDocument;
  previewState: PreviewState;
  queue: readonly ReviewQueueItem[];
  selectedAsset: TailoredAsset | null;
  selectedItem: ReviewQueueItem | null;
  selectedJob: SavedJob | null;
}

type PreviewState = "missing" | null;

export function ReviewQueuePreviewPanel({
  pendingElapsedSeconds,
  embedded = false,
  stacked = false,
  isGenerating: isSelectedJobPending = false,
  isPendingTooLong = false,
  onEditResumeWorkspace,
  onGenerateResume,
  originalResume,
  previewState,
  queue,
  selectedAsset,
  selectedItem,
  selectedJob,
}: ReviewQueuePreviewPanelProps) {
  const needsGeneration = needsResumeGeneration(selectedItem);
  const hasGenerationFailure = hasResumeGenerationFailure(
    selectedItem,
    selectedAsset,
  );
  const isGenerating =
    isResumeGenerationInProgress(selectedItem) || isSelectedJobPending;
  const showGenerationState =
    needsGeneration || isGenerating || hasGenerationFailure;
  const workflowStatus = getReviewQueueWorkflowStatus(
    selectedItem,
    selectedAsset,
  );
  const previewTone =
    previewState === "missing" ? "critical" : workflowStatus.tone;
  const previewLabel =
    previewState === "missing" ? "Resume issue" : workflowStatus.label;

  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col gap-4",
        stacked ? null : "overflow-hidden xl:h-full xl:min-h-0",
        stacked
          ? null
          : embedded
            ? "h-full min-h-0"
            : "surface-panel-shell min-h-124 rounded-(--radius-field) border border-(--surface-panel-border)",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        {/* An eyebrow is a label, not a heading: as an `h2` it polluted the
            document outline and rendered a 19px level at 11px. */}
        <p className="font-display text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-caps) text-foreground">
          Resume
        </p>
        {/* The workspace header above this panel already shows the workflow
            state; repeating it here (and again on the document card) printed
            the same chip three times within 200px. Only a state this panel
            alone knows about earns a badge. */}
        {previewState === "missing" ? (
          <StatusBadge tone={previewTone}>{previewLabel}</StatusBadge>
        ) : null}
      </header>
      {queue.length === 0 ? (
        <div
          className={cn(
            "mx-5 mb-5 flex items-center justify-center",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="No shortlisted jobs yet"
              description="Find jobs first, then shortlist the strongest matches to start building tailored resumes."
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild type="button" variant="primary">
                <Link to={JOB_FINDER_ROUTE_PATHS.discovery}>
                  Go to Find jobs
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && selectedItem && showGenerationState ? (
        <div
          className={cn(
            "mx-5 mb-5 flex items-center justify-center",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="grid w-full min-h-full place-items-center content-center gap-4 rounded-(--radius-field) bg-(--surface-panel-tint) p-8 text-center">
            {isGenerating ? (
              /* The percentage here was invented: nothing in the pipeline
                 reports a completion fraction, so the bar climbed to a 94%
                 ceiling in ~15s and then sat frozen for the remaining ~42s of
                 a 57.7s draft, making a successful run look like a hang. An
                 indeterminate bar plus a live clock and a stated expectation
                 says only what the app can actually substantiate. */
              <div className="grid w-full max-w-xl gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-left">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="label-mono-xs text-foreground-muted">
                    Draft and PDF
                  </span>
                  <strong
                    className="text-[1.15rem] tabular-nums text-(--text-headline)"
                    data-resume-draft-elapsed
                  >
                    {formatResumeOperationElapsed(pendingElapsedSeconds)}
                  </strong>
                </div>
                <ProgressBar
                  ariaLabel="Resume preparation in progress"
                  className="h-2.5 w-full overflow-hidden rounded-full bg-(--surface-progress-track)"
                  indeterminate
                />
                <p
                  className="text-(length:--text-small) leading-5 text-foreground-muted"
                  data-resume-draft-expected-wait
                >
                  {RESUME_DRAFT_EXPECTED_WAIT_LABEL}
                </p>
                <p className="text-(length:--text-small) leading-5 text-foreground-muted">
                  {isPendingTooLong
                    ? "This request is taking longer than expected. Open the resume workspace and use Reload workspace to check for a saved result."
                    : "You can leave this screen. The draft keeps running and finishes on its own."}
                </p>
              </div>
            ) : null}
            <h2 className="tracking-[-0.03em] text-(--text-headline)">
              {hasGenerationFailure
                ? "Resume issue"
                : isGenerating
                  ? "Preparing resume"
                  : needsGeneration
                    ? "No tailored resume yet"
                    : "Preparing resume"}
            </h2>
            <p className="max-w-136 text-(length:--text-body) leading-7 text-foreground-soft">
              {hasGenerationFailure
                ? `The last tailored resume attempt for ${selectedItem.title} did not finish. Try again to create a fresh draft.`
                : isGenerating
                  ? isPendingTooLong
                    ? `The resume request for ${selectedItem.title} is still running. Open the resume workspace and reload it to check whether a saved result is ready; do not start another request yet.`
                    : `Job Finder is preparing the resume for ${selectedItem.title}. The draft and PDF are being built now.`
                  : needsGeneration
                    ? `Create a tailored resume for ${selectedItem.title} to continue.`
                    : `Job Finder is still preparing the resume for ${selectedItem.title}. You can continue once it is ready.`}
            </p>
            {isGenerating && isPendingTooLong ? (
              <Button
                onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                type="button"
                variant="secondary"
              >
                Open workspace to reload
              </Button>
            ) : null}
            {!isGenerating ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  disabled={isSelectedJobPending}
                  pending={isSelectedJobPending}
                  onClick={() => {
                    void onGenerateResume(selectedItem.jobId);
                  }}
                  type="button"
                  variant="primary"
                >
                  {hasGenerationFailure
                    ? "Try again"
                    : "Create tailored resume"}
                </Button>
                {hasGenerationFailure ? (
                  <Button
                    onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                    type="button"
                    variant="secondary"
                  >
                    Open resume workspace
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {queue.length > 0 && !selectedItem ? (
        <div
          className={cn(
            "mx-5 mb-5 flex items-center justify-center",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <EmptyState
            title="Choose a job"
            description="Select a shortlisted job to see what the resume needs next."
          />
        </div>
      ) : null}
      {queue.length > 0 &&
      selectedItem?.resumeReview.status === "original_resume" ? (
        <div
          className={cn(
            "px-5 pb-5",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
          {...(stacked ? {} : { "data-locked-pane-scroll-region": true })}
        >
          <div className="surface-card-tint relative grid gap-5 rounded-(--radius-field) border border-primary/25 p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="grid gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1">
                <span className="label-mono-xs text-primary">
                  Original resume · unchanged
                </span>
                <strong className="text-[1.1rem] text-(--text-headline)">
                  {selectedItem.resumeReview.fileName}
                </strong>
              </div>
              <StatusBadge tone="positive">Ready for this job</StatusBadge>
            </div>
            <p className="rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm leading-6 text-foreground-soft">
              Job Finder will attach this exact imported file during
              preparation. It will not rewrite it, remove roles, or create a
              job-specific copy.
            </p>
            <div className="rounded-(--radius-field) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-sm leading-6 text-(--warning-text)">
              <strong className="block text-foreground">
                Check sensitive personal details before attaching
              </strong>
              Original resumes can include a home address, date of birth,
              nationality, phone number, or other details you may not want to
              share with every employer. Review the preview below before
              preparing the application.
            </div>
            <dl className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 px-4 py-3 text-sm sm:grid-cols-2">
              <div className="grid gap-1">
                <dt className="label-mono-xs">File selected for attachment</dt>
                <dd className="break-words font-medium text-foreground">
                  {selectedItem.resumeReview.fileName}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="label-mono-xs">Imported</dt>
                <dd className="text-foreground-soft">
                  {originalResume?.uploadedAt
                    ? new Date(originalResume.uploadedAt).toLocaleString()
                    : "Import date unavailable"}
                </dd>
              </div>
            </dl>
            <div className="grid gap-2">
              <span className="label-mono-xs">
                Read-only extracted text preview
              </span>
              <p className="text-sm leading-6 text-foreground-soft">
                This preview is only for review. The attachment remains the
                original imported file shown above.
              </p>
              {originalResume?.textContent ? (
                <div className="max-h-[56vh] overflow-y-auto whitespace-pre-wrap rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-sm leading-7 text-foreground-soft">
                  {originalResume.textContent}
                </div>
              ) : (
                <p className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5 text-sm leading-6 text-foreground-soft">
                  The original file is available, but extracted preview text is
                  not. Re-import it in Profile if you want a readable preview
                  before continuing.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {queue.length > 0 &&
      selectedItem?.resumeApplicationMode === "original_resume" &&
      selectedItem.resumeReview.status !== "original_resume" ? (
        <div
          className={cn(
            "mx-5 mb-5 flex items-center justify-center",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="Original resume unavailable"
              description="Import or re-import your original resume in Profile. This mode never substitutes a tailored resume when the original file is missing."
            />
            <Button asChild type="button" variant="primary">
              <Link to={JOB_FINDER_ROUTE_PATHS.profile}>Go to Profile</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {queue.length > 0 && previewState === "missing" ? (
        <div
          className={cn(
            "mx-5 mb-5 flex items-center justify-center",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          <div className="grid w-full max-w-xl gap-4 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-tint) p-8 text-center">
            <EmptyState
              title="Resume unavailable"
              description="We couldn't load the latest resume. Reopen the workspace to refresh the preview, export a new PDF, or approve the exact version you want to use."
            />
            {selectedItem ? (
              <Button
                onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                type="button"
                variant="primary"
              >
                Open resume workspace
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {queue.length > 0 &&
      selectedItem &&
      selectedItem.resumeApplicationMode !== "original_resume" &&
      !showGenerationState &&
      selectedAsset ? (
        <div
          className={cn(
            "px-5 pb-5",
            stacked ? null : "min-h-0 flex-1 overflow-y-auto",
          )}
          {...(stacked ? {} : { "data-locked-pane-scroll-region": true })}
        >
          <div className="surface-card-tint relative grid gap-4 rounded-(--radius-field) border border-(--surface-panel-border) p-6 text-(length:--text-body) leading-[1.48] text-foreground">
            <div className="grid items-end gap-3 border-b border-(--surface-panel-border) pb-4 sm:grid-cols-[1fr_auto]">
              <strong className="text-[1.1rem] text-(--text-headline)">
                {selectedJob?.title ?? selectedItem.title}
              </strong>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[0.9rem] text-foreground-soft">
                  {selectedAsset.label}
                </span>
              </div>
            </div>
            {selectedItem.resumeReview.status === "approved" ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                Approved on{" "}
                {new Date(
                  selectedItem.resumeReview.approvedAt,
                ).toLocaleString()}
                . This is the PDF used when you prepare the application.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === "needs_review" ? (
              <p className="text-(length:--text-small) text-foreground-soft">
                This is a draft preview. Review and approve the resume before
                you prepare the application.
              </p>
            ) : null}
            {selectedItem.resumeReview.status === "stale" ? (
              <p className="text-(length:--text-small) text-(--warning-text)">
                This approved resume is out of date. Review the current version
                and approve it again before preparing the application.
              </p>
            ) : null}
            {selectedItem.resumeReview.status !== "approved" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-4">
                <div className="grid gap-1">
                  <p className="label-mono-xs text-primary">Next step</p>
                  <p className="text-sm leading-6 text-foreground-soft">
                    Open the workspace to review the live document, then approve
                    it. Job Finder creates the application PDF in the
                    background.
                  </p>
                </div>
                <Button
                  onClick={() => onEditResumeWorkspace(selectedItem.jobId)}
                  type="button"
                  variant="primary"
                >
                  Open resume workspace
                </Button>
              </div>
            ) : null}
            {selectedAsset.previewSections.map((section, sectionIndex) => (
              <div
                key={`${section.heading}-${sectionIndex}`}
                className="grid gap-2"
              >
                <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
                  {section.heading}
                </p>
                {section.lines.map((line, lineIndex) => (
                  <p
                    key={`${section.heading}-${lineIndex}-${line}`}
                    className="text-(length:--text-body) leading-7 text-foreground-soft"
                  >
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
