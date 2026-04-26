import { Button } from '@renderer/components/ui/button'

interface SettingsWorkspaceControlsProps {
  isWorkspaceResetPending: boolean
  onResetWorkspace: () => void
}

export function SettingsWorkspaceControls({ isWorkspaceResetPending, onResetWorkspace }: SettingsWorkspaceControlsProps) {
  return (
    <section className="surface-panel-shell relative grid gap-5 rounded-(--radius-field) border border-(--surface-panel-border) px-6 py-6">
      <div className="grid gap-2.5">
        <p className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Start over</p>
        <h2 className="font-display text-xl font-semibold text-(--text-headline)">Reset everything on this device</h2>
        <p className="text-sm leading-7 text-foreground-soft">
          This permanently removes your profile, imported resume, saved jobs, tailored resumes, and browser session data from this device.
        </p>
      </div>
      <div className="grid justify-items-start gap-2.5">
        <Button variant="destructive" pending={isWorkspaceResetPending} onClick={onResetWorkspace} type="button">
          Reset everything
        </Button>
      </div>
    </section>
  )
}
