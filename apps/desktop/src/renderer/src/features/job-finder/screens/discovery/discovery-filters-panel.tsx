import { Radar, Search } from 'lucide-react'
import type { BrowserSessionState, JobSearchPreferences } from '@unemployed/contracts'
import { Button } from '../../../../components/ui/button'
import { PreferenceList } from '../../components/preference-list'
import { StatusBadge } from '../../components/status-badge'
import { formatStatusLabel, getSessionTone } from '../../lib/job-finder-utils'

interface DiscoveryFiltersPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  onOpenBrowserSession: () => void
  onRefreshDiscovery: () => void
  searchPreferences: JobSearchPreferences
}

export function DiscoveryFiltersPanel({
  actionMessage,
  browserSession,
  busy,
  onOpenBrowserSession,
  onRefreshDiscovery,
  searchPreferences
}: DiscoveryFiltersPanelProps) {
  return (
    <section className="border border-border/20 bg-card px-4 py-4 grid content-start gap-6 min-w-0">
      <p className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Critical Filters</p>
      <div className="grid gap-2 border border-border/20 bg-secondary px-3 py-3">
        <StatusBadge tone={getSessionTone(browserSession)}>{browserSession.label}</StatusBadge>
        <p className="text-[11px] leading-6 text-muted-foreground">{browserSession.detail}</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Search string</p>
          <div className="border-b border-border bg-background px-3 py-2 font-mono text-xs text-primary">
            {searchPreferences.targetRoles.join(', ') || 'NO_QUERY_SET'}
          </div>
        </div>
        <div className="grid gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Location</p>
          <div className="border-b border-border bg-background px-3 py-2 font-mono text-xs text-foreground-soft">
            {searchPreferences.locations.join(' / ') || 'REMOTE_GLOBAL'}
          </div>
        </div>
        <PreferenceList compact label="Work modes" values={searchPreferences.workModes.map(formatStatusLabel)} />
      </div>
      {browserSession.driver !== 'catalog_seed' ? (
        <Button className="w-full justify-center gap-2" variant="secondary" disabled={busy} onClick={onOpenBrowserSession} type="button">
          <Search className="size-4" />
          Open Chrome profile
        </Button>
      ) : null}
      <Button className="w-full justify-center gap-2" variant="primary" disabled={busy} onClick={onRefreshDiscovery} type="button">
        <Radar className="size-4" />
        Start discovery op
      </Button>
      {actionMessage ? <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary">{actionMessage}</p> : null}
    </section>
  )
}
