import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  ClipboardCheck,
  Compass,
  FileText,
  Minus,
  Settings2,
  Settings,
  Square,
  UserRound,
  X
} from 'lucide-react'
import type { DesktopWindowControlsState, JobFinderWorkspaceSnapshot } from '@unemployed/contracts'
import { suiteModules } from '@unemployed/contracts'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import type { JobFinderScreen } from '../lib/job-finder-types'
import { formatStatusLabel } from '../lib/job-finder-utils'

interface JobFinderShellProps {
  actionMessage: string | null
  children: ReactNode
  platform: 'darwin' | 'linux' | 'win32'
  workspace: JobFinderWorkspaceSnapshot
}

const screenRouteMap: Record<JobFinderScreen, string> = {
  profile: '/job-finder/profile',
  discovery: '/job-finder/discovery',
  'review-queue': '/job-finder/review-queue',
  applications: '/job-finder/applications',
  settings: '/job-finder/settings'
}

function getActiveScreen(pathname: string): JobFinderScreen {
  if (pathname.endsWith('/discovery')) {
    return 'discovery'
  }

  if (pathname.endsWith('/review-queue')) {
    return 'review-queue'
  }

  if (pathname.endsWith('/applications')) {
    return 'applications'
  }

  if (pathname.endsWith('/settings')) {
    return 'settings'
  }

  return 'profile'
}

export function JobFinderShell({ actionMessage, children, platform, workspace }: JobFinderShellProps) {
  const isMac = platform === 'darwin'
  const location = useLocation()
  const navigate = useNavigate()
  const [windowControlsState, setWindowControlsState] = useState<DesktopWindowControlsState>({
    isClosable: true,
    isMaximized: false,
    isMinimizable: true
  })

  const activeScreen = useMemo(() => getActiveScreen(location.pathname), [location.pathname])

  const screenDefinitions = useMemo(
    () => [
      { id: 'profile', label: 'Profile', count: null, icon: UserRound },
      { id: 'discovery', label: 'Discovery', count: workspace.discoveryJobs.length, icon: Compass },
      { id: 'review-queue', label: 'Review Queue', count: workspace.reviewQueue.length, icon: ClipboardCheck },
      { id: 'applications', label: 'Applications', count: workspace.applicationRecords.length, icon: FileText },
      { id: 'settings', label: 'Settings', count: null, icon: Settings }
    ],
    [workspace.applicationRecords.length, workspace.discoveryJobs.length, workspace.reviewQueue.length]
  )

  const primaryScreens = screenDefinitions.filter((screen) => screen.id !== 'settings')

  useEffect(() => {
    let cancelled = false

    const unsubscribe = window.unemployed.window.onControlsStateChange((controlsState) => {
      if (!cancelled) {
        setWindowControlsState(controlsState)
      }
    })

    void window.unemployed.window
      .getControlsState()
      .then((controlsState) => {
        if (!cancelled) {
          setWindowControlsState(controlsState)
        }
      })
      .catch(() => {
        // Keep the initial fallback state when the window bridge is unavailable.
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  async function runWindowAction(action: () => Promise<DesktopWindowControlsState>): Promise<void> {
    try {
      const nextControlsState = await action()
      setWindowControlsState(nextControlsState)
    } catch {
      // Keep the current controls state if the desktop action fails.
    }
  }

  function minimizeWindow() {
    void runWindowAction(() => window.unemployed.window.minimize())
  }

  function toggleWindowExpand() {
    void runWindowAction(() => window.unemployed.window.toggleMaximize())
  }

  function closeWindow() {
    void window.unemployed.window.close()
  }

  function handleScreenChange(nextScreen: string) {
    void navigate(screenRouteMap[nextScreen as JobFinderScreen])
  }

  return (
    <div className={cn('h-screen overflow-hidden text-foreground', `platform-${platform}`)}>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/15 bg-[rgba(12,12,12,0.92)] backdrop-blur-sm">
        <div className="mx-auto flex h-10 max-w-[118rem] items-center justify-center px-4 sm:px-6">
          <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as CSSProperties} />
          <div className="flex items-center gap-6" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {suiteModules.map((moduleName) => (
              <Button
                key={moduleName}
                className={cn(
                  'h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[10px] font-semibold tracking-[var(--tracking-badge)] shadow-none',
                  moduleName === 'job-finder'
                    ? 'text-[var(--text-headline)]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                type="button"
              >
                {formatStatusLabel(moduleName)}
              </Button>
            ))}
          </div>
          <div className="flex flex-1 justify-end" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {!isMac ? (
              <div className="flex items-center gap-1" role="group" aria-label="Window controls">
                <Button
                  aria-label="Minimize window"
                  className="h-7 w-7 rounded-[var(--radius-badge)] border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-[var(--surface-panel-border)] hover:bg-[var(--surface-panel-raised)] hover:text-foreground"
                  disabled={!windowControlsState.isMinimizable}
                  onClick={minimizeWindow}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Minus className="size-3.5" />
                </Button>
                <Button
                  aria-label={windowControlsState.isMaximized ? 'Restore window' : 'Maximize window'}
                  className="h-7 w-7 rounded-[var(--radius-badge)] border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-[var(--surface-panel-border)] hover:bg-[var(--surface-panel-raised)] hover:text-foreground"
                  onClick={toggleWindowExpand}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Square className="size-3.5" />
                </Button>
                <Button
                  aria-label="Close window"
                  className="h-7 w-7 rounded-[var(--radius-badge)] border border-transparent bg-transparent p-0 text-muted-foreground shadow-none hover:border-[var(--button-close-hover)] hover:bg-[var(--button-close-hover)] hover:text-white"
                  disabled={!windowControlsState.isClosable}
                  onClick={closeWindow}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mx-auto grid h-16 max-w-[118rem] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 sm:px-6">
          <div className="min-w-0 justify-self-start" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-[2rem] font-black leading-none tracking-[-0.08em] text-[var(--headline-primary)]">UNEMPLOYED</span>
              <span className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-caps)] text-muted-foreground">Job Finder Desktop</span>
            </div>
          </div>

          <nav className="hidden min-w-0 justify-self-center lg:flex" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-1">
              {primaryScreens.map((screen) => (
                <button
                  key={screen.id}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.76rem] font-medium text-muted-foreground transition-colors hover:text-foreground xl:px-4 xl:text-[var(--text-small)]',
                    activeScreen === screen.id ? 'bg-secondary text-foreground' : ''
                  )}
                  onClick={() => handleScreenChange(screen.id)}
                  type="button"
                >
                  <span>{screen.label}</span>
                  {screen.count !== null ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--input)] px-1.5 text-[0.65rem] text-[var(--text-badge)]">
                      {screen.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex items-center justify-self-end gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            {[
              ['Saved', workspace.discoveryJobs.length],
              ['Queue', workspace.reviewQueue.length],
              ['Tracked', workspace.applicationRecords.length]
            ].map(([label, value]) => (
              <div key={label} className="hidden h-12 min-w-[4.35rem] rounded-[var(--radius-button)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] px-2.5 xl:grid xl:content-center xl:text-center">
                <div className="text-[0.58rem] uppercase leading-none tracking-[var(--tracking-caps)] text-muted-foreground">{label}</div>
                <div className="mt-1 text-[1.05rem] font-semibold leading-none text-[var(--text-headline)]">{value}</div>
              </div>
            ))}
            <Button
              className={cn(
                'h-11 rounded-[var(--radius-button)] px-4 text-[0.72rem] tracking-[var(--tracking-caps)] xl:h-12',
                activeScreen === 'settings'
                  ? 'border-primary/35 bg-primary/15 text-[var(--text-headline)]'
                  : 'border-[var(--surface-panel-border)] bg-[var(--surface-panel)] text-[var(--text-headline)] hover:bg-[var(--surface-panel-raised)]'
              )}
              onClick={() => handleScreenChange('settings')}
              size="default"
              type="button"
              variant="secondary"
            >
              <Settings2 className="size-4" />
              Settings
            </Button>
            <Button className="h-10 w-10 rounded-[var(--radius-button)] border-[var(--surface-panel-border)] bg-[var(--surface-panel)] text-[var(--text-headline)] hover:bg-[var(--surface-panel-raised)] md:hidden" size="icon-sm" type="button" variant="secondary">
              <Bell className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-full flex-col pt-[6.5rem]">
        <main className="screen-scroll-area flex-1 overflow-y-auto overflow-x-hidden px-4 pb-12 pt-8 sm:px-6">
          <div className="mx-auto w-full max-w-[118rem]">{children}</div>
        </main>

        <footer className="border-t border-border/10 px-4 py-3 text-[var(--text-tiny)] uppercase tracking-[var(--tracking-caps)] text-muted-foreground sm:px-6">
          <div className="mx-auto flex max-w-[118rem] items-center justify-between gap-3">
            <span>Job Finder MVP</span>
            {actionMessage ? <span className="truncate text-foreground-soft">{actionMessage}</span> : null}
          </div>
        </footer>
      </div>
    </div>
  )
}
