import { Button } from '../../../../components/ui/button'

interface SettingsWorkspaceControlsProps {
  busy: boolean
  onResetWorkspace: () => void
}

export function SettingsWorkspaceControls({ busy, onResetWorkspace }: SettingsWorkspaceControlsProps) {
  return (
    <section className="border border-border/20 bg-card px-6 py-6 grid grid-cols-1 items-start gap-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Current profile</p>
        <h2 className="font-display text-2xl font-black uppercase tracking-tight text-primary">Workspace controls</h2>
        <p className="text-sm leading-7 text-foreground-soft">
          Resetting clears the current profile, imported resume data, saved jobs, generated assets, and browser session state so you can start fresh.
        </p>
      </div>
      <div className="grid justify-items-start gap-2.5">
        <Button variant="secondary" disabled={busy} onClick={onResetWorkspace} type="button">
          Reset defaults
        </Button>
      </div>
    </section>
  )
}
