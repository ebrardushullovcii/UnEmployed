import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import { formatStatusLabel } from "../../lib/job-finder-utils";

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute("hidden") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0 &&
      (element.offsetParent !== null || element === document.activeElement),
  );
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString();
}

function formatEvidenceCount(
  details: SourceDebugRunDetails,
  attemptId: string,
): number {
  return details.evidenceRefs.filter((entry) => entry.attemptId === attemptId)
    .length;
}

function formatInstructionActionLabel(
  artifact: SourceInstructionArtifact | null,
): string | null {
  if (!artifact) {
    return null;
  }

  return artifact.status === "draft" || artifact.status === "validated"
    ? "Verify instructions"
    : null;
}

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
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const selectedRun = useMemo(
    () =>
      props.recentRuns.find((run) => run.id === props.selectedRunId) ??
      props.recentRuns[0] ??
      null,
    [props.recentRuns, props.selectedRunId],
  );

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const appRoot = document.getElementById("root");
    const previousAriaHidden = appRoot?.getAttribute("aria-hidden") ?? null;
    const hadInert = appRoot?.hasAttribute("inert") ?? false;

    appRoot?.setAttribute("aria-hidden", "true");
    appRoot?.setAttribute("inert", "");

    const focusableElements = getFocusableElements(dialog);
    (focusableElements[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const nextFocusableElements = getFocusableElements(dialog);
      if (nextFocusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = nextFocusableElements[0];
      const lastFocusable = nextFocusableElements[nextFocusableElements.length - 1];
      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);

      if (appRoot) {
        if (previousAriaHidden === null) {
          appRoot.removeAttribute("aria-hidden");
        } else {
          appRoot.setAttribute("aria-hidden", previousAriaHidden);
        }

        if (hadInert) {
          appRoot.setAttribute("inert", "");
        } else {
          appRoot.removeAttribute("inert");
        }
      }

      previousFocusRef.current?.focus();
    };
  }, [props.onClose, props.open]);

  if (!props.open) {
    return null;
  }

  const artifact = props.details?.instructionArtifact ?? null;
  const primaryActionLabel = formatInstructionActionLabel(artifact);
  const details = props.details;

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="mx-auto flex min-h-0 max-h-[min(88vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) shadow-[0_32px_120px_rgba(0,0,0,0.55)]"
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

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside
            aria-labelledby={recentRunsLabelId}
            className="grid min-h-0 content-start gap-3 overflow-y-auto border-b border-(--surface-panel-border) px-4 py-4 lg:border-b-0 lg:border-r"
          >
            <p
              className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted"
              id={recentRunsLabelId}
            >
              Recent runs
            </p>
            <ul className="grid gap-2 pb-1">
              {props.recentRuns.map((run) => {
                const isSelected = run.id === selectedRun?.id;
                return (
                  <li key={run.id}>
                    <button
                      aria-current={isSelected ? "true" : undefined}
                      className={[
                        "grid w-full gap-1 rounded-(--radius-panel) border px-3 py-3 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-(--surface-panel-border) bg-(--surface-panel-raised) text-foreground-soft hover:bg-secondary",
                      ].join(" ")}
                      onClick={() => props.onLoadRun(run.id)}
                      type="button"
                    >
                      <span className="text-[0.82rem] font-medium text-foreground">
                        {formatStatusLabel(run.state)}
                      </span>
                      <span className="text-[0.76rem] text-foreground-muted">
                        {formatTimestamp(run.completedAt ?? run.updatedAt)}
                      </span>
                      {run.finalSummary ? (
                        <span className="line-clamp-3 text-[0.78rem] leading-5 text-foreground-soft">
                          {run.finalSummary}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 py-4">
            {props.loading ? (
              <div
                aria-atomic="true"
                aria-live="polite"
                className="rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4 text-[0.9rem] text-foreground-soft"
                role="status"
              >
                Loading run details…
              </div>
            ) : props.errorMessage ? (
              <div
                aria-atomic="true"
                aria-live="assertive"
                className="rounded-(--radius-panel) border border-critical/35 bg-(--workspace-state-card-bg-error) px-4 py-4 text-[0.9rem] text-foreground"
                role="alert"
              >
                {props.errorMessage}
              </div>
            ) : details ? (
              <>
                <article className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
                        Run outcome
                      </p>
                      <p className="text-[1rem] font-medium text-foreground">
                        {formatStatusLabel(details.run.state)}
                        {formatTimestamp(
                          details.run.completedAt ?? details.run.updatedAt,
                        )
                          ? ` • ${formatTimestamp(details.run.completedAt ?? details.run.updatedAt)}`
                          : ""}
                      </p>
                    </div>
                    {artifact ? (
                      <div className="flex flex-wrap gap-2">
                        {primaryActionLabel ? (
                          <Button
                            disabled={props.busy}
                            onClick={() => props.onVerify(artifact.id)}
                            type="button"
                            variant="ghost"
                          >
                            {primaryActionLabel}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {details.run.finalSummary ? (
                    <p className="text-[0.92rem] leading-6 text-foreground">
                      {details.run.finalSummary}
                    </p>
                  ) : null}
                  {details.run.manualPrerequisiteSummary ? (
                    <p className="text-[0.85rem] leading-6 text-foreground-soft">
                      {details.run.manualPrerequisiteSummary}
                    </p>
                  ) : null}
                </article>

                <div className="grid gap-3">
                  {details.attempts.map((attempt) => {
                    const evidenceCount = formatEvidenceCount(
                      details,
                      attempt.id,
                    );
                    return (
                      <article
                        className="grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4"
                        key={attempt.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid gap-1">
                            <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
                              {formatStatusLabel(attempt.phase)}
                            </p>
                            <p className="text-[0.95rem] font-medium text-foreground">
                              {formatStatusLabel(attempt.outcome)} •{" "}
                              {formatStatusLabel(attempt.completionMode)}
                            </p>
                          </div>
                          <div className="text-right text-[0.76rem] text-foreground-muted">
                            <p>
                              {formatTimestamp(
                                attempt.completedAt ?? attempt.startedAt,
                              )}
                            </p>
                            <p>{evidenceCount} evidence refs</p>
                          </div>
                        </div>
                        <p className="text-[0.92rem] leading-6 text-foreground">
                          {attempt.resultSummary}
                        </p>
                        {attempt.completionReason ? (
                          <p className="text-[0.84rem] leading-6 text-foreground-soft">
                            End reason: {attempt.completionReason}
                          </p>
                        ) : null}
                        {attempt.phaseEvidence ? (
                          <div className="grid gap-2 text-[0.84rem] text-foreground-soft">
                            {attempt.phaseEvidence.visibleControls.length >
                            0 ? (
                              <p>
                                Visible controls:{" "}
                                {attempt.phaseEvidence.visibleControls.join(
                                  " • ",
                                )}
                              </p>
                            ) : null}
                            {attempt.phaseEvidence.routeSignals.length > 0 ? (
                              <p>
                                Route signals:{" "}
                                {attempt.phaseEvidence.routeSignals.join(" • ")}
                              </p>
                            ) : null}
                            {attempt.phaseEvidence.attemptedControls.length >
                            0 ? (
                              <p>
                                Attempted controls:{" "}
                                {attempt.phaseEvidence.attemptedControls.join(
                                  " • ",
                                )}
                              </p>
                            ) : null}
                            {attempt.phaseEvidence.warnings.length > 0 ? (
                              <p>
                                Warnings:{" "}
                                {attempt.phaseEvidence.warnings.join(" • ")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4 text-[0.9rem] text-foreground-soft">
                No retained run details are available for this target yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
