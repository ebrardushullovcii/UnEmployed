import { Button } from '@renderer/components/ui/button'

interface SettingsWorkspaceControlsProps {
  busy: boolean
  onResetWorkspace: () => void
}

export function SettingsWorkspaceControls({ busy, onResetWorkspace }: SettingsWorkspaceControlsProps) {
  return (
    <section className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-6 py-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="grid gap-2.5">
        <p className="font-mono text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Current profile</p>
        <h2 className="font-display text-2xl font-black uppercase tracking-tight text-primary">Workspace controls</h2>
        <p className="text-sm leading-7 text-foreground-soft">
          Resetting clears the current profile, imported resume data, saved jobs, generated assets, and browser session state so you can start fresh.
        </p>
      </div>
      <div className="grid justify-items-start gap-2.5 lg:justify-items-end">
        <Button variant="secondary" disabled={busy} onClick={onResetWorkspace} type="button">
          Reset defaults
        </Button>
      </div>
    </section>
  )
}
