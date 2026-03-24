import { Search } from 'lucide-react'
import type { BrowserSessionState, JobSearchPreferences } from '@unemployed/contracts'
import { Chip } from '@renderer/components/ui/chip'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { getSessionTone } from '../../lib/job-finder-utils'

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
  const sections = [
    { label: 'Roles', values: searchPreferences.targetRoles, empty: 'No role targets configured yet.' },
    { label: 'Locations', values: searchPreferences.locations, empty: 'No preferred locations configured yet.' },
    { label: 'Work modes', values: searchPreferences.workModes, empty: 'No work modes configured yet.' }
  ]

  return (
    <section className="grid min-h-[31rem] min-w-0 content-start gap-4 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5">
      <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Search controls</p>

      <div className="grid min-h-[26.5rem] min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)]">
        <div className="grid min-w-0 gap-3 border-b border-[var(--surface-panel-border)] px-4 py-4">
          <StatusBadge tone={getSessionTone(browserSession)}>{browserSession.label}</StatusBadge>
          <p className="max-w-[28rem] text-[0.9rem] leading-7 text-foreground-soft">{browserSession.detail}</p>
        </div>

        <div className="grid min-w-0 content-start gap-0">
          {sections.map((section, index) => (
            <div key={section.label} className={index === 0 ? 'min-w-0 px-4 py-4' : 'min-w-0 border-t border-[var(--surface-panel-border)] px-4 py-4'}>
              <div className="grid min-w-0 gap-3">
                <p className="text-[0.62rem] uppercase tracking-[var(--tracking-badge)] text-foreground-muted">{section.label}</p>
                {section.values.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {section.values.map((value) => (
                      <Chip key={`${section.label}_${value}`} className="border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] text-foreground-soft">
                        {value}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-[0.9rem] leading-7 text-foreground-soft">{section.empty}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto grid gap-3 border-t border-[var(--surface-panel-border)] px-4 py-4">
          {browserSession.driver !== 'catalog_seed' ? (
            <Button className="h-11 w-full" disabled={busy} onClick={onOpenBrowserSession} type="button" variant="secondary">
              <Search className="size-4" />
              Open Chrome profile
            </Button>
          ) : null}

          <Button className="h-11 w-full" disabled={busy} onClick={onRefreshDiscovery} type="button" variant="primary">
            Run LinkedIn discovery
          </Button>

          {actionMessage ? (
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{actionMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
