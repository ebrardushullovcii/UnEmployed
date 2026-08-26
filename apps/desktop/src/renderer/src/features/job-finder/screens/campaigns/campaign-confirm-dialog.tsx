import { Button } from "@renderer/components/ui/button";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalFocusTrap } from "../../components/profile/use-modal-focus-trap";

/**
 * App-owned confirmation for destructive campaign actions. Names the exact
 * action and its consequence, resolves Escape, backdrop, and the first
 * (initially focused) button to the safe stay outcome, and never touches
 * `window.confirm`. The confirmed callback runs exactly once per opened
 * dialog and only after an explicit confirm click; the once-per-open guard
 * keeps a racing second activation from repeating the action.
 */
export function CampaignConfirmDialog(props: {
  cancelLabel?: string;
  confirmLabel: string;
  detail: string;
  eyebrow: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelledRef = useRef(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (!props.open) {
      cancelledRef.current = false;
      confirmedRef.current = false;
    }
  }, [props.open]);

  const stay = () => {
    if (cancelledRef.current || confirmedRef.current) {
      return;
    }
    cancelledRef.current = true;
    props.onCancel();
  };

  // Escape (while topmost), tab cycling, app-root aria-hidden/inert, focus
  // restore, and initial focus on the first control — the safe cancel button
  // below — are owned by the shared modal focus trap.
  useModalFocusTrap(props.open, dialogRef, stay);

  if (!props.open) {
    return null;
  }

  const confirmOnce = () => {
    if (cancelledRef.current || confirmedRef.current) {
      return;
    }
    confirmedRef.current = true;
    props.onConfirm();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
      onClick={stay}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="surface-panel-shell grid w-full max-w-lg gap-5 rounded-(--radius-panel) border border-(--surface-panel-border) p-6 shadow-(--modal-shadow)"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <div className="grid gap-2">
          <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-destructive">
            {props.eyebrow}
          </p>
          <h2
            className="text-xl font-semibold text-(--text-headline)"
            id={titleId}
          >
            {props.title}
          </h2>
          <p
            className="text-sm leading-6 text-foreground-soft"
            id={descriptionId}
          >
            {props.detail}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {/* Staying is the safe outcome, so it owns the first (initially
              focused) position in the dialog's tab order. */}
          <Button onClick={stay} type="button" variant="secondary">
            {props.cancelLabel ?? "Cancel"}
          </Button>
          <Button onClick={confirmOnce} type="button" variant="destructive">
            {props.confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
