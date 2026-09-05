import type { CSSProperties } from "react";

import { Button } from "@renderer/components/ui/button";
import { ProgressBar } from "@renderer/components/ui/progress-bar";
import { cn } from "@renderer/lib/cn";

import {
  formatResumeOperationElapsed,
  isWaitLongRunning,
  RESUME_OPERATION_LONG_RUNNING_MS,
  WAIT_ELAPSED_RESERVED_WIDTH,
  WAIT_ELAPSED_VISIBLE_AFTER_SECONDS,
} from "../lib/wait-state";

/**
 * The one wait surface for Job Finder.
 *
 * `docs/PRODUCT.md` "Honest loading" asks for elapsed *and* expected time on
 * every wait. Before this component the tree had six different half-answers:
 * a bare spinner with neither, an expectation with no clock (so nothing could
 * tell the user it had been exceeded), and three dots on a measured ~22s model
 * round-trip. `WaitIndicator` renders all four parts together — an
 * indeterminate signal, a live elapsed clock in a reserved slot, the stated
 * expectation, and, past the escalation threshold, a recovery action — so a
 * screen cannot adopt three of the four by accident.
 *
 * There is deliberately no `percent` prop. Nothing behind these waits reports
 * a completion fraction, and the last invented one climbed to a 94% ceiling in
 * ~15s and then froze for the remaining ~42s of a 57.7s draft. A determinate
 * signal belongs to the surfaces that have real counts (import stages,
 * "Preparing N of M"), not here.
 */
export interface WaitIndicatorProps {
  className?: string;
  /** Whole seconds since the operation began. */
  elapsedSeconds: number;
  /**
   * Offered only once the wait escalates. Without one the escalation still
   * states what is safe to do; with one the user has something to press.
   */
  escalationAction?: { label: string; onClick: () => void };
  /** Replaces `message` past the threshold. */
  escalationMessage?: string;
  /** e.g. `RESUME_ASSISTANT_EXPECTED_WAIT_LABEL`. Required — see above. */
  expectationLabel: string;
  /** Names the operation, and is the accessible name of the signal. */
  label: string;
  /**
   * Escalation threshold. Defaults to the shared 30s; the Assistant passes its
   * own 20s because a measured reply lands at 24-27s and a 30s threshold only
   * ever fired after the wait was already over.
   */
  longRunningMs?: number;
  /** Ordinary reassurance shown before the threshold. */
  message?: string;
  /**
   * `panel` is the bounded-pane form (a bordered block that fills the slot the
   * loaded content will occupy); `inline` is the transcript-row form.
   */
  variant?: "inline" | "panel";
}

/**
 * Every escalation says the same two true things — the work may still be
 * running, and nothing saved has changed — so a surface that supplies no copy
 * of its own still escalates honestly rather than silently.
 */
export const WAIT_DEFAULT_ESCALATION_MESSAGE =
  "This is taking longer than expected. Nothing you have saved has changed, and the request may still finish on its own.";

const ELAPSED_SLOT_STYLE: CSSProperties = {
  minWidth: WAIT_ELAPSED_RESERVED_WIDTH,
};

export function WaitIndicator({
  className,
  elapsedSeconds,
  escalationAction,
  escalationMessage,
  expectationLabel,
  label,
  longRunningMs = RESUME_OPERATION_LONG_RUNNING_MS,
  message,
  variant = "panel",
}: WaitIndicatorProps) {
  const isLongRunning = isWaitLongRunning(elapsedSeconds, longRunningMs);
  // The slot is reserved from the first frame; only the digits wait. A
  // sub-second round trip that flashed `0:00` and vanished read as a glitch,
  // but withholding the *box* would move the row when the clock appeared.
  const showsElapsedValue =
    elapsedSeconds >= WAIT_ELAPSED_VISIBLE_AFTER_SECONDS;

  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className={cn(
        "grid min-w-0 gap-2 text-left",
        variant === "panel"
          ? "rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-5"
          : null,
        className,
      )}
      data-wait-indicator
      data-wait-long-running={isLongRunning ? "true" : "false"}
      data-wait-variant={variant}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-3">
        <span className="label-mono-xs text-foreground-muted">{label}</span>
        <span
          className={cn(
            "text-right tabular-nums text-foreground-soft",
            variant === "panel"
              ? "text-[1.15rem] text-(--text-headline)"
              : "font-mono text-(length:--text-tiny)",
          )}
          data-wait-elapsed
          data-wait-elapsed-visible={showsElapsedValue ? "true" : "false"}
          style={ELAPSED_SLOT_STYLE}
        >
          {showsElapsedValue
            ? formatResumeOperationElapsed(elapsedSeconds)
            : ""}
        </span>
      </div>
      <ProgressBar
        ariaLabel={label}
        className={cn(
          "w-full overflow-hidden rounded-full bg-(--surface-progress-track)",
          variant === "panel" ? "h-2.5" : "h-1.5",
        )}
        indeterminate
      />
      <p
        className="text-(length:--text-small) leading-5 text-foreground-muted"
        data-wait-expectation
      >
        {expectationLabel}
      </p>
      {isLongRunning ? (
        <div className="grid min-w-0 gap-2" data-wait-escalation>
          <p className="text-(length:--text-small) leading-5 text-foreground-muted">
            {escalationMessage ?? WAIT_DEFAULT_ESCALATION_MESSAGE}
          </p>
          {escalationAction ? (
            <Button
              className="w-fit"
              data-wait-escalation-action
              onClick={escalationAction.onClick}
              type="button"
              variant="secondary"
            >
              {escalationAction.label}
            </Button>
          ) : null}
        </div>
      ) : message ? (
        <p
          className="text-(length:--text-small) leading-5 text-foreground-muted"
          data-wait-message
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
