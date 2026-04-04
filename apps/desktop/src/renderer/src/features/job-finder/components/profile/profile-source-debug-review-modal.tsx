import { useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  SourceDebugRunDetails,
  SourceDebugRunRecord,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { ProfileSourceDebugReviewModalContent } from "./profile-source-debug-review-modal-content";
import { useModalFocusTrap } from "./use-modal-focus-trap";

export function ProfileSourceDebugReviewModal(props: {
  busy: boolean;
  details: SourceDebugRunDetails | null;
  errorMessage: string | null;
  loading: boolean;
  onClose: () => void;
  onLoadRun: (runId: string) => void;
  onRerun: () => void;
  onVerify: (instructionId: string) => void;
  open: boolean;
  recentRuns: readonly SourceDebugRunRecord[];
  selectedRunId: string | null;
  targetLabel: string;
}) {
  const dialogTitleId = useId();
  const recentRunsLabelId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const selectedRun = useMemo(
    () =>
      props.recentRuns.find((run) => run.id === props.selectedRunId) ??
      props.recentRuns[0] ??
      null,
    [props.recentRuns, props.selectedRunId],
  );
  useModalFocusTrap(props.open, dialogRef, props.onClose);

  if (!props.open) {
    return null;
  }

  const artifact = props.details?.instructionArtifact ?? null;
  const details = props.details;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="surface-panel-shell mx-auto flex min-h-0 max-h-[min(88vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) shadow-(--modal-shadow)"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-(--surface-panel-border) px-5 py-4">
          <div className="grid gap-1">
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Source-debug review
            </p>
            <h2
              className="text-[1.2rem] font-semibold tracking-[-0.02em] text-(--text-headline)"
              id={dialogTitleId}
            >
              {props.targetLabel}
            </h2>
            <p className="text-[0.9rem] leading-6 text-foreground-soft">
              Inspect the latest retained phase outcomes, evidence, and
              learned-instruction status before trusting this target in
              discovery.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={props.busy}
              onClick={props.onRerun}
              type="button"
              variant="secondary"
            >
              Rerun debug
            </Button>
            <Button
              aria-label="Close"
              className="size-10"
              onClick={props.onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <ProfileSourceDebugReviewModalContent
          artifact={artifact}
          busy={props.busy}
          details={details}
          errorMessage={props.errorMessage}
          loading={props.loading}
          onLoadRun={props.onLoadRun}
          onVerify={props.onVerify}
          recentRuns={props.recentRuns}
          recentRunsLabelId={recentRunsLabelId}
          selectedRunId={selectedRun?.id ?? null}
        />
      </div>
    </div>,
    document.body,
  );
}
