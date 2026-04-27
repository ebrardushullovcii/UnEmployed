import { Button } from '@renderer/components/ui/button'

interface SettingsWorkspaceControlsProps {
  isWorkspaceResetPending: boolean
  onResetWorkspace: () => void
}

export function SettingsWorkspaceControls({ isWorkspaceResetPending, onResetWorkspace }: SettingsWorkspaceControlsProps) {
  return (
    <section className="surface-panel-shell relative grid gap-3.5 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
      <div className="grid gap-1.5">
        <p className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Start over</p>
        <h2 className="font-display text-lg font-semibold text-(--text-headline)">Reset this device workspace</h2>
        <p className="text-sm leading-6 text-foreground-soft">
          This permanently removes your profile, imported resume, saved jobs, tailored resumes, and browser session data from this device.
        </p>
      </div>
      <div className="grid justify-items-start gap-2">
        <p className="text-(length:--text-description) leading-5 text-foreground-soft">
          Use this only when you want a genuinely clean restart. It is not a settings reset button.
        </p>
        <Button variant="destructive" pending={isWorkspaceResetPending} onClick={onResetWorkspace} type="button">
          Reset everything
        </Button>
      </div>
    </section>
  )
}
