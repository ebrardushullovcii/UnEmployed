import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@renderer/components/ui/button";
import { useModalFocusTrap } from "../../components/profile/use-modal-focus-trap";

interface SettingsWorkspaceControlsProps {
  isWorkspaceResetPending: boolean;
  onResetWorkspace: () => void;
}

export function SettingsWorkspaceControls({
  isWorkspaceResetPending,
  onResetWorkspace,
}: SettingsWorkspaceControlsProps) {
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(showResetConfirmation, dialogRef, () => {
    if (!isWorkspaceResetPending) {
      setShowResetConfirmation(false);
    }
  });

  function confirmReset() {
    setShowResetConfirmation(false);
    onResetWorkspace();
  }

  return (
    <>
      <section className="surface-panel-shell relative grid gap-3.5 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <div className="grid gap-1.5">
          <p className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">
            Start over
          </p>
          <h2 className="font-display text-lg font-semibold text-(--text-headline)">
            Reset this device workspace
          </h2>
          <p className="text-sm leading-6 text-foreground-soft">
            Your workspace and resume stay on this device until you choose to
            reset them. Reset permanently removes your profile, imported
            resume, saved jobs, tailored resumes, application history, and
            browser session data from this device.
          </p>
        </div>
        <div className="grid justify-items-start gap-2">
          <p className="text-(length:--text-description) leading-5 text-foreground-soft">
            Use this only when you want a genuinely clean restart. It is not a
            settings reset button.
          </p>
          <Button
            variant="destructive"
            pending={isWorkspaceResetPending}
            onClick={() => setShowResetConfirmation(true)}
            type="button"
          >
            Reset everything
          </Button>
        </div>
      </section>

      {showResetConfirmation
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
              onClick={() => {
                if (!isWorkspaceResetPending) {
                  setShowResetConfirmation(false);
                }
              }}
            >
              <div
                aria-describedby={dialogDescriptionId}
                aria-labelledby={dialogTitleId}
                aria-modal="true"
                className="surface-panel-shell grid w-full max-w-lg gap-5 rounded-(--radius-panel) border border-(--surface-panel-border) p-6 shadow-(--modal-shadow)"
                onClick={(event) => event.stopPropagation()}
                ref={dialogRef}
                role="dialog"
                tabIndex={-1}
              >
                <div className="grid gap-2">
                  <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-destructive">
                    Permanent device reset
                  </p>
                  <h2
                    className="font-display text-xl font-semibold text-(--text-headline)"
                    id={dialogTitleId}
                  >
                    Reset this device workspace?
                  </h2>
                  <p
                    className="text-sm leading-6 text-foreground-soft"
                    id={dialogDescriptionId}
                  >
                    This permanently deletes your profile, imported resume,
                    saved jobs, tailored resumes, application history, and
                    browser session data from this device. This cannot be
                    undone.
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    disabled={isWorkspaceResetPending}
                    onClick={() => setShowResetConfirmation(false)}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    pending={isWorkspaceResetPending}
                    onClick={confirmReset}
                    type="button"
                    variant="destructive"
                  >
                    Reset workspace
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
