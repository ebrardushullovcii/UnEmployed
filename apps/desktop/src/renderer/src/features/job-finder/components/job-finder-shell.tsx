import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
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
import { formatStatusLabel, getDefaultProfileRoute } from '../lib/job-finder-utils'

interface JobFinderShellProps {
  actionMessage: string | null
  children: ReactNode
  onNavigate?: (path: string) => void
  platform: 'darwin' | 'linux' | 'win32'
  workspace: JobFinderWorkspaceSnapshot
}

const screenRouteMap: Record<Exclude<JobFinderScreen, 'profile'>, string> = {
  discovery: '/job-finder/discovery',
  'review-queue': '/job-finder/review-queue',
  applications: '/job-finder/applications',
  settings: '/job-finder/settings'
}

const LOCKED_LAYOUT_SCREENS: readonly JobFinderScreen[] = [
  'profile',
  'discovery',
  'review-queue',
  'applications'
]

function getActiveScreen(pathname: string): JobFinderScreen {
  if (pathname.endsWith('/discovery')) {
    return 'discovery'
  }

  if (pathname.includes('/review-queue')) {
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

export function JobFinderShell({ actionMessage, children, onNavigate, platform, workspace }: JobFinderShellProps) {
  const isMac = platform === 'darwin'
  const location = useLocation()
  const navigate = useNavigate()
  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const [windowControlsState, setWindowControlsState] = useState<DesktopWindowControlsState>({
    isClosable: true,
    isMaximized: false,
    isMinimizable: true
  })

  const activeScreen = useMemo(() => getActiveScreen(location.pathname), [location.pathname])
  const usesLockedScreenLayout = useMemo(
    () => LOCKED_LAYOUT_SCREENS.includes(activeScreen),
    [activeScreen]
  )
  void actionMessage

  const screenDefinitions = useMemo(
    () => [
      { id: 'profile', label: 'Profile', count: null, icon: UserRound },
      { id: 'discovery', label: 'Find jobs', count: workspace.discoveryJobs.length, icon: Compass },
      { id: 'review-queue', label: 'Shortlisted', count: workspace.reviewQueue.length, icon: ClipboardCheck },
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
    const nextPath =
      nextScreen === 'profile'
        ? getDefaultProfileRoute(workspace.profileSetupState)
        : screenRouteMap[nextScreen as Exclude<JobFinderScreen, 'profile'>]

    if (onNavigate) {
      onNavigate(nextPath)
      return
    }

    void navigate(nextPath)
  }

  return (
    <div className={cn('h-screen overflow-hidden text-foreground', `platform-${platform}`)}>
      <header
        className="fixed inset-x-0 top-0 z-50 border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm"
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[2.5rem_4rem] items-stretch pl-2 pr-0 sm:pl-3 sm:pr-0">
          <div className="row-span-2 flex min-w-0 items-center pl-2 sm:pl-3" style={dragRegionStyle}>
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-[2.35rem] font-black leading-none tracking-[-0.08em] text-(var(--headline-primary)) sm:text-[2.7rem]">UNEMPLOYED</span>
              <span className="text-[0.72rem] uppercase tracking-(var(--tracking-caps)) text-muted-foreground sm:text-(length:var(--text-tiny))">Job Finder</span>
            </div>
          </div>

          <div className="col-start-2 row-start-1 flex items-center justify-center" style={dragRegionStyle}>
            <div className="flex items-center gap-6" role="list" style={noDragRegionStyle}>
              {suiteModules.map((moduleName, index) => (
                <div key={moduleName} className="flex items-center gap-6" role="listitem">
                  {index > 0 ? <span aria-hidden="true" className="h-4 w-px bg-border/50" /> : null}
                  <span
                    aria-current={moduleName === 'job-finder' ? 'page' : undefined}
                    className={cn(
                      'h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[14px] font-semibold tracking-(--tracking-badge) shadow-none sm:text-[15px]',
                      moduleName === 'job-finder'
                        ? 'text-(--text-headline)'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatStatusLabel(moduleName)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="col-start-3 row-start-1 flex h-full items-start justify-end self-start" style={dragRegionStyle}>
            {!isMac ? (
              <div className="flex h-full items-stretch gap-0" role="group" aria-label="Window controls" style={noDragRegionStyle}>
                <Button
                  aria-label="Minimize window"
                  className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
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
                  className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
                  onClick={toggleWindowExpand}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Square className="size-3.5" />
                </Button>
                <Button
                  aria-label="Close window"
                  className="h-full w-12 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--button-close-hover) hover:text-primary-foreground"
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

          <nav className="col-start-2 row-start-2 hidden min-w-0 items-center justify-center lg:flex" style={noDragRegionStyle}>
            <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) p-1">
              {primaryScreens.map((screen) => (
                <button
                  aria-current={activeScreen === screen.id ? 'page' : undefined}
                  key={screen.id}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.76rem] font-medium text-muted-foreground transition-colors hover:text-foreground xl:px-4 xl:text-(length:--text-small)',
                    activeScreen === screen.id ? 'bg-secondary text-foreground' : ''
                  )}
                  onClick={() => handleScreenChange(screen.id)}
                  type="button"
                >
                  <span>{screen.label}</span>
                  {screen.count !== null ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--input) px-1.5 text-[0.65rem] text-foreground">
                      {screen.count}
                    </span>
                  ) : null}
                </button>
              ))}
              <span aria-hidden="true" className="mx-1 h-4 w-px bg-border/50" />
              <button
                aria-current={activeScreen === 'settings' ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.76rem] font-medium transition-colors xl:px-4 xl:text-(length:--text-small)',
                  activeScreen === 'settings'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleScreenChange('settings')}
                type="button"
              >
                <Settings2 className="size-4" />
                <span>Settings</span>
              </button>
            </div>
          </nav>

          <div className="col-start-3 row-start-2 hidden lg:block" aria-hidden="true" />
        </div>
      </header>

      <div className="flex h-full flex-col pt-[6.75rem]">
        <main className={cn(
          'flex-1 overflow-x-hidden',
          usesLockedScreenLayout
            ? 'overflow-hidden px-2 pb-4 pt-0 sm:px-4'
            : 'screen-scroll-area overflow-y-auto px-4 pb-12 pt-8 sm:px-6'
        )}>
          <div className={cn('mx-auto w-full max-w-472 min-w-0', usesLockedScreenLayout ? 'h-full min-h-full' : 'min-h-full')}>
            {children}
          </div>
        </main>

      </div>
    </div>
  )
}
