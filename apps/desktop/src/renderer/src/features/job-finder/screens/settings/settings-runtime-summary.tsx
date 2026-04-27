import { ShieldAlert, ShieldCheck } from 'lucide-react'
import type { BrowserSessionState, JobFinderSettings } from '@unemployed/contracts'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getSessionTone } from '../../lib/job-finder-utils'

interface SettingsRuntimeSummaryProps {
  browserSession: BrowserSessionState
  settings: JobFinderSettings
}

function getBrowserLabel(driver: BrowserSessionState['driver']): string {
  switch (driver) {
    case 'chrome_profile_agent':
      return 'Connected Chrome session'
    default:
      return 'Catalog search only'
  }
}

export function SettingsRuntimeSummary({
  browserSession,
  settings
}: SettingsRuntimeSummaryProps) {
  return (
    <section className="surface-panel-shell relative grid content-start gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3.5">
      <div className="grid gap-0.5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-4 text-primary" />
          <p className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Live status</p>
        </div>
        <h2 className="text-[1.02rem] font-semibold text-(--text-headline)">Runtime guardrails</h2>
        <p className="text-(length:--text-description) leading-5 text-foreground-soft">
          Keep the live browser state and apply safety visible here without mixing them into the editable defaults.
        </p>
      </div>

      <section className="surface-card-tint grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Browser</span>
          <StatusBadge tone={getSessionTone(browserSession)}>{formatStatusLabel(browserSession.status)}</StatusBadge>
        </div>
        <strong className="text-(length:--text-body) font-semibold text-foreground">{getBrowserLabel(browserSession.driver)}</strong>
        <p className="text-(length:--text-description) leading-5 text-foreground-soft">
          {browserSession.detail?.trim() || browserSession.label}
        </p>
        <p className="text-(length:--text-small) leading-5 text-foreground-soft">
          Browser session persistence is currently {settings.keepSessionAlive ? 'on' : 'off'}.
        </p>
      </section>

      <section className="surface-card-tint grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Workspace carry-over</span>
          <StatusBadge tone={settings.discoveryOnly ? 'muted' : 'active'}>
            {settings.discoveryOnly ? 'Shortlist only' : 'Keep discoveries'}
          </StatusBadge>
        </div>
        <strong className="text-(length:--text-body) font-semibold text-foreground">
          {settings.discoveryOnly ? 'New search noise stays lower' : 'Every new result can stay visible'}
        </strong>
        <p className="text-(length:--text-description) leading-5 text-foreground-soft">
          {settings.discoveryOnly
            ? 'Only jobs you actively shortlist are kept in the workspace.'
            : 'Fresh search results remain available until you clean them up or move them forward.'}
        </p>
      </section>

      <section className="surface-card-tint grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) px-3.5 py-3.5">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-4 text-destructive" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Apply safeguard</h2>
        </div>
        <strong className="text-(length:--text-body) font-semibold text-foreground">Approved PDF required</strong>
        <p className="text-(length:--text-description) leading-5 text-foreground-soft">
          Every supported application still stops until the current job has a fresh approved PDF from the resume workspace.
        </p>
      </section>
    </section>
  )
}
