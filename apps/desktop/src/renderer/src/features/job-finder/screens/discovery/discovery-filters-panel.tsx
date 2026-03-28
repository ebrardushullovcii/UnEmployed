import { History, Search } from 'lucide-react'
import type { BrowserSessionState, DiscoveryAdapterSessionState, JobSearchPreferences, JobSource } from '@unemployed/contracts'
import { Chip } from '@renderer/components/ui/chip'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'
import { getSessionTone } from '../../lib/job-finder-utils'

function targetRequiresManagedSession(target: JobSearchPreferences['discovery']['targets'][number]): boolean {
  return resolveManagedSessionSource(target) !== null
}

function resolveManagedSessionSource(target: JobSearchPreferences['discovery']['targets'][number]): JobSource | null {
  if (target.adapterKind === 'linkedin') {
    return 'linkedin'
  }

  if (target.adapterKind === 'generic_site') {
    return null
  }

  try {
    const hostname = new URL(target.startingUrl).hostname.toLowerCase()
    return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com') ? 'linkedin' : null
  } catch {
    return null
  }
}

interface DiscoveryFiltersPanelProps {
  actionMessage: string | null
  browserSession: BrowserSessionState
  busy: boolean
  discoverySessions: readonly DiscoveryAdapterSessionState[]
  onOpenBrowserSession: () => void
  onRunAgentDiscovery: (() => void) | undefined
  onViewProgress: () => void
  searchPreferences: JobSearchPreferences
}

type SectionValue =
  | string
  | {
      key: string
      label: string
    }

export function DiscoveryFiltersPanel({
  actionMessage,
  browserSession,
  busy,
  discoverySessions,
  onOpenBrowserSession,
  onRunAgentDiscovery,
  onViewProgress,
  searchPreferences
}: DiscoveryFiltersPanelProps) {
  const neutralSessionSnapshot: BrowserSessionState = {
    source: 'generic_site',
    status: 'unknown',
    driver: 'catalog_seed',
    label: 'No managed session required',
    detail: 'The current target mix can run without opening a managed Chrome session first.',
    lastCheckedAt: new Date(0).toISOString()
  }
  const sections: Array<{ label: string; values: SectionValue[]; empty: string }> = [
    { label: 'Roles', values: searchPreferences.targetRoles, empty: 'No role targets configured yet.' },
    { label: 'Locations', values: searchPreferences.locations, empty: 'No preferred locations configured yet.' },
    { label: 'Work modes', values: searchPreferences.workModes, empty: 'No work modes configured yet.' },
    {
      label: 'Discovery targets',
      values: searchPreferences.discovery.targets.map((target) => ({
        key: target.id,
        label: `${target.label}${target.enabled ? '' : ' (disabled)'}`
      })),
      empty: 'No discovery targets configured yet.'
    }
  ]

  const enabledTargets = searchPreferences.discovery.targets.filter((target) => target.enabled)
  const hasRunnableTarget = enabledTargets.length > 0
  const requiresManagedSession = enabledTargets.some(targetRequiresManagedSession)
  const managedSessionSources = Array.from(new Set(enabledTargets
    .map(resolveManagedSessionSource)
    .filter((source): source is JobSource => source !== null)))
  const managedSessions = managedSessionSources.map((source) =>
    discoverySessions.find((session) => session.adapterKind === source)
  )
  const displaySessionSnapshot: BrowserSessionState = requiresManagedSession
    ? (() => {
        const displaySession = managedSessions[0]

        if (!displaySession) {
          return {
            source: managedSessionSources[0] ?? 'linkedin',
            status: 'unknown',
            driver: 'catalog_seed',
            label: 'Session unavailable',
            detail: 'The selected target requires a managed browser session, but no matching session snapshot is available yet.',
            lastCheckedAt: new Date(0).toISOString()
          }
        }

        return {
          source: displaySession.adapterKind,
          status: displaySession.status,
          driver: displaySession.driver,
          label: displaySession.label,
          detail: displaySession.detail,
          lastCheckedAt: displaySession.lastCheckedAt
        }
      })()
    : neutralSessionSnapshot
  const isChromeAgent = displaySessionSnapshot.driver === 'chrome_profile_agent'
  const isReady = displaySessionSnapshot.status === 'ready'
  const needsLogin = displaySessionSnapshot.status === 'login_required'
  const isBlocked = displaySessionSnapshot.status === 'blocked'
  const requiredSessionsReady = managedSessionSources.length === 0 || managedSessions.every((session) => session?.status === 'ready')
  const canRunDiscovery = Boolean(onRunAgentDiscovery) && hasRunnableTarget && !busy && (!requiresManagedSession || requiredSessionsReady)

  return (
    <section className="flex min-h-[31rem] min-w-0 flex-col gap-4 overflow-hidden rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-5 xl:h-full xl:min-h-0">
      <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">Search controls</p>

      <div className="flex min-h-[26.5rem] min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] xl:min-h-0">
        <div className="grid min-w-0 gap-3 border-b border-[var(--surface-panel-border)] px-4 py-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <StatusBadge tone={getSessionTone(displaySessionSnapshot)}>{displaySessionSnapshot.label}</StatusBadge>
            <span className="rounded-full border border-[var(--surface-panel-border)] px-2.5 py-1 text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">
              {requiresManagedSession ? (isChromeAgent ? 'Managed profile' : 'Session required') : 'Target-ready'}
            </span>
          </div>
          <p className="max-w-full break-words text-[0.92rem] leading-7 text-foreground-soft">{displaySessionSnapshot.detail}</p>

          {requiresManagedSession ? (isChromeAgent ? (
            <div className="grid gap-2">
              {needsLogin || isBlocked ? (
                <div role="status" className="rounded-[var(--radius-small)] border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[0.85rem] leading-6 text-amber-600 dark:text-amber-400">
                  Open the browser profile, finish the login if needed, and this same action will refresh the session state for you.
                </div>
              ) : null}
              {isReady ? (
                <div role="status" className="rounded-[var(--radius-small)] border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-[0.85rem] leading-6 text-emerald-600 dark:text-emerald-400">
                  The active adapter session is ready. Open the profile any time if you want to confirm the browser state before another run.
                </div>
              ) : null}
            </div>
          ) : (
            <div role="status" className="rounded-[var(--radius-small)] border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-[0.85rem] leading-6 text-amber-600 dark:text-amber-400">
              Browser agent is not enabled. Remove <strong>UNEMPLOYED_LINKEDIN_BROWSER_AGENT</strong> or delete any <strong>=0</strong>/<strong>=false</strong> override in your <strong>.env.local</strong>, then restart the app.
            </div>
          )) : (
            <div role="status" className="rounded-[var(--radius-small)] border border-sky-500/20 bg-sky-500/5 px-3 py-3 text-[0.85rem] leading-6 text-sky-600 dark:text-sky-400">
              The current target mix can run without a prevalidated managed session. Open Chrome only if the site needs a logged-in browser context.
            </div>
          )}
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-0 overflow-y-auto">
          {sections.map((section, index) => (
            <div key={section.label} className={index === 0 ? 'min-w-0 px-4 py-4' : 'min-w-0 border-t border-[var(--surface-panel-border)] px-4 py-4'}>
              <div className="grid min-w-0 gap-3">
                <p className="text-[0.62rem] uppercase tracking-[var(--tracking-badge)] text-foreground-muted">{section.label}</p>
                {section.values.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {section.values.map((value) => (
                      <Chip
                        key={typeof value === 'string' ? `${section.label}_${value}` : `${section.label}_${value.key}`}
                        className="border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] text-foreground-soft"
                      >
                        {typeof value === 'string' ? value : value.label}
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
          {requiresManagedSession ? (
            <div className="grid gap-2">
              <Button
                className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-3 text-left normal-case tracking-[0.01em]"
                disabled={busy || !isChromeAgent}
                onClick={onOpenBrowserSession}
                size="sm"
                type="button"
                variant={isChromeAgent ? 'secondary' : 'ghost'}
              >
                <Search className="size-4" />
                {isChromeAgent
                  ? (isReady ? 'Refresh Chrome session' : 'Open Chrome profile')
                  : 'Chrome profile unavailable'}
              </Button>
              {!isChromeAgent ? (
                <p className="text-[0.82rem] leading-6 text-foreground-muted">
                  Browser-profile discovery is disabled for this desktop session. Remove <code>UNEMPLOYED_LINKEDIN_BROWSER_AGENT</code> or delete any <code>=0</code> / <code>=false</code> override to restore the default browser-agent runtime.
                </p>
              ) : null}
            </div>
          ) : null}

          <Button
            className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-3 text-left normal-case tracking-[0.01em]"
            onClick={onViewProgress}
            size="sm"
            type="button"
            variant="ghost"
          >
            <History className="size-4" />
            View progress and full history
          </Button>

          {onRunAgentDiscovery ? (
            <Button
              className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center normal-case tracking-[0.01em]"
              disabled={!canRunDiscovery}
              onClick={onRunAgentDiscovery}
              size="sm"
              type="button"
              variant="primary"
            >
              Run discovery across targets
            </Button>
          ) : null}

          {actionMessage ? (
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{actionMessage}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
