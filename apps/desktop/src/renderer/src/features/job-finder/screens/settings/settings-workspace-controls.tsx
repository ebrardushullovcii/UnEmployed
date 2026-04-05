import { Button } from '@renderer/components/ui/button'

interface SettingsWorkspaceControlsProps {
  busy: boolean
  onResetWorkspace: () => void
}

export function SettingsWorkspaceControls({ busy, onResetWorkspace }: SettingsWorkspaceControlsProps) {
  return (
    <section className="surface-panel-shell relative rounded-(--radius-field) border border-(--surface-panel-border) px-6 py-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="grid gap-2.5">
        <p className="font-mono text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Start fresh</p>
        <h2 className="font-display text-2xl font-black uppercase tracking-tight text-primary">Reset workspace</h2>
        <p className="text-sm leading-7 text-foreground-soft">
          Resetting removes your profile, imported resume, saved jobs, generated resumes, and browser session data from this device.
        </p>
      </div>
      <div className="grid justify-items-start gap-2.5 lg:justify-items-end">
        <Button variant="secondary" disabled={busy} onClick={onResetWorkspace} type="button">
          Reset workspace
        </Button>
      </div>
    </section>
  )
}
