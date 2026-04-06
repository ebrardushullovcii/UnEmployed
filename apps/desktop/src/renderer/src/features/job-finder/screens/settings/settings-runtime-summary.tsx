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
    <section className="surface-panel-shell relative grid content-start gap-6 rounded-(--radius-field) border border-(--surface-panel-border) px-6 py-6">
      <div className="grid gap-2">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-4 text-primary" />
          <p className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Live status</p>
        </div>
        <h2 className="text-[1.05rem] font-semibold text-(--text-headline)">Browser and apply checks</h2>
        <p className="text-(length:--text-description) leading-6 text-foreground-soft">
          This side rail keeps the live browser state visible without duplicating the editable defaults.
        </p>
      </div>

      <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Browser</span>
          <StatusBadge tone={getSessionTone(browserSession)}>{formatStatusLabel(browserSession.status)}</StatusBadge>
        </div>
        <strong className="text-(length:--text-body) font-semibold text-foreground">{getBrowserLabel(browserSession.driver)}</strong>
        <p className="text-(length:--text-description) leading-6 text-foreground-soft">
          {browserSession.detail?.trim() || browserSession.label}
        </p>
        <p className="text-(length:--text-small) leading-6 text-foreground-soft">
          Browser session persistence is currently {settings.keepSessionAlive ? 'on' : 'off'}.
        </p>
      </section>

      <section className="surface-card-tint grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-4 text-destructive" />
          <h2 className="font-display text-sm font-bold uppercase tracking-(--tracking-badge) text-foreground">Apply safeguard</h2>
        </div>
        <strong className="text-(length:--text-body) font-semibold text-foreground">Approved PDF required</strong>
        <p className="text-(length:--text-description) leading-6 text-foreground-soft">
          Every supported application still stops until the current job has a fresh approved PDF from the resume workspace.
        </p>
      </section>
    </section>
  )
}
