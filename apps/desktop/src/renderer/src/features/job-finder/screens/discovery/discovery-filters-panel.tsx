import { RefreshCw, Search } from 'lucide-react'
import type { BrowserSessionState, JobSearchPreferences } from '@unemployed/contracts'
import { Chip } from '@renderer/components/ui/chip'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { getSessionTone } from '../../lib/job-finder-utils'

interface DiscoveryFiltersPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  onCheckBrowserSession: () => void
  onOpenBrowserSession: () => void
  onRunAgentDiscovery: (() => void) | undefined
  searchPreferences: JobSearchPreferences
}

export function DiscoveryFiltersPanel({
  actionMessage,
  browserSession,
  busy,
  onCheckBrowserSession,
  onOpenBrowserSession,
  onRunAgentDiscovery,
  searchPreferences
}: DiscoveryFiltersPanelProps) {
  const sections = [
    { label: 'Roles', values: searchPreferences.targetRoles, empty: 'No role targets configured yet.' },
    { label: 'Locations', values: searchPreferences.locations, empty: 'No preferred locations configured yet.' },
    { label: 'Work modes', values: searchPreferences.workModes, empty: 'No work modes configured yet.' }
  ]

  const isChromeAgent = browserSession.driver === 'chrome_profile_agent'
  const isReady = browserSession.status === 'ready'
  const needsLogin = browserSession.status === 'login_required'
  const isBlocked = browserSession.status === 'blocked'

  return (
    <section className="grid min-h-[31rem] min-w-0 content-start gap-4 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5">
      <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Search controls</p>

      <div className="grid min-h-[26.5rem] min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)]">
        <div className="grid min-w-0 gap-3 border-b border-[var(--surface-panel-border)] px-4 py-4">
          <StatusBadge tone={getSessionTone(browserSession)}>{browserSession.label}</StatusBadge>
          <p className="max-w-[28rem] text-[0.9rem] leading-7 text-foreground-soft">{browserSession.detail}</p>

          {isChromeAgent ? (
            <div className="grid gap-2">
              {needsLogin || isBlocked ? (
                <div role="status" className="rounded-[var(--radius-small)] border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[0.85rem] leading-6 text-amber-600 dark:text-amber-400">
                  Log into LinkedIn in the Chrome window that opened, then click <strong>Check login status</strong> below.
                </div>
              ) : null}
              {isReady ? (
                <div role="status" className="rounded-[var(--radius-small)] border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[0.85rem] leading-6 text-emerald-600 dark:text-emerald-400">
                  LinkedIn session is active. You can run discovery or check login again at any time.
                </div>
              ) : null}
            </div>
          ) : (
            <div role="status" className="rounded-[var(--radius-small)] border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[0.85rem] leading-6 text-amber-600 dark:text-amber-400">
              Browser agent is not enabled. Set <strong>UNEMPLOYED_LINKEDIN_BROWSER_AGENT=1</strong> in your <strong>.env.local</strong> and restart the app.
            </div>
          )}
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
          {isChromeAgent ? (
            <div className="grid gap-2">
              <Button
                className="h-11 w-full"
                disabled={busy}
                onClick={onOpenBrowserSession}
                type="button"
                variant="secondary"
              >
                <Search className="size-4" />
                {isReady ? 'Reopen Chrome profile' : 'Open Chrome profile'}
              </Button>

              <Button
                className="h-11 w-full"
                disabled={busy}
                onClick={onCheckBrowserSession}
                type="button"
                variant="ghost"
              >
                <RefreshCw className="size-4" />
                Check login status
              </Button>
            </div>
          ) : null}

          <Button
            className="h-11 w-full"
            disabled={busy || !isReady}
            onClick={onRunAgentDiscovery}
            type="button"
            variant="primary"
          >
            Run AI Agent Discovery
          </Button>

          {actionMessage ? (
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{actionMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
