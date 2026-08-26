import { Button } from "@renderer/components/ui/button";

interface ProfileSaveFooterProps {
  actionMessage: string | null;
  hasUnsavedChanges: boolean;
  isSavePending: boolean;
  onSave: () => void;
  validationMessage: string | null;
}

export function ProfileSaveFooter({
  actionMessage,
  hasUnsavedChanges,
  isSavePending,
  onSave,
  validationMessage,
}: ProfileSaveFooterProps) {
  return (
    <div
      className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) px-4 py-4 sm:px-5"
      data-profile-workspace-actions
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-2">
          <p className="text-(length:--text-description) leading-6 text-foreground-muted">
            {hasUnsavedChanges
              ? "Save your changes before leaving this page."
              : "Your profile and job-search settings are up to date."}
          </p>
          {validationMessage ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-(length:--text-description) leading-6 text-foreground-muted"
              role="status"
            >
              {validationMessage}
            </p>
          ) : null}
          {actionMessage ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-(length:--text-description) leading-6 text-primary"
              role="status"
            >
              {actionMessage}
            </p>
          ) : null}
        </div>

        {/* Save-state copy stays in role="status" live regions only: wiring
            these messages to the button via aria-describedby would announce
            them a second time when focus lands on the control. The shared
            Button owns the pending semantics (aria-busy + aria-disabled while
            isSavePending keeps focus on the control), and the clean state
            keeps native disabled semantics. */}
        <Button
          className="w-full sm:w-auto sm:shrink-0"
          disabled={!hasUnsavedChanges}
          pending={isSavePending}
          onClick={onSave}
          type="button"
          variant="primary"
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}
