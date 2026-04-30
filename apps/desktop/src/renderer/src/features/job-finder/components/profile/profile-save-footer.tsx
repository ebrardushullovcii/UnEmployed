import { Button } from '@renderer/components/ui/button'

interface ProfileSaveFooterProps {
  actionMessage: string | null
  hasUnsavedChanges: boolean
  isSavePending: boolean
  onSave: () => void
  validationMessage: string | null
}

export function ProfileSaveFooter({
  actionMessage,
  hasUnsavedChanges,
  isSavePending,
  onSave,
  validationMessage
}: ProfileSaveFooterProps) {
  return (
    <div className="border-t border-(--surface-panel-border) bg-(--surface-fill-soft) px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-2">
          <p className="text-(length:--text-description) leading-6 text-foreground-muted">
            {hasUnsavedChanges
              ? 'You have unsaved changes. Save your profile, job preferences, and source setup before leaving this page.'
              : 'Save your profile, job preferences, and source setup from one place.'}
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

        <Button className="w-full sm:w-auto sm:shrink-0" pending={isSavePending} onClick={onSave} type="button" variant="primary">
          Save changes
        </Button>
      </div>
    </div>
  )
}
