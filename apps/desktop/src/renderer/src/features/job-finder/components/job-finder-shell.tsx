import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ClipboardCheck,
  Compass,
  FileText,
  LayoutGrid,
  Plus,
  Settings,
  TerminalSquare,
  UserRound
} from 'lucide-react'
import type { DesktopWindowControlsState, JobFinderWorkspaceSnapshot } from '@unemployed/contracts'
import { suiteModules } from '@unemployed/contracts'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '../../../components/ui/tabs'
import { cn } from '../../../lib/cn'
import type { JobFinderScreen } from '../lib/job-finder-types'
import { formatStatusLabel, getSessionTone } from '../lib/job-finder-utils'
import { StatusBadge } from './status-badge'

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
    <div className={cn('h-screen overflow-hidden bg-background text-foreground', `platform-${platform}`)}>
      <header
        className={cn(
          'fixed top-0 z-50 flex h-14 w-full items-center justify-between border-b border-border/20 bg-[#0e0e0e] px-6 font-display text-xs font-bold uppercase tracking-[0.05em] text-primary',
          isMac ? 'pt-2' : ''
        )}
      >
        <div className="flex min-w-0 items-center gap-8" style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
          <div className="flex items-center">
            <span className="font-display text-xl font-black tracking-tighter text-primary">UNEMPLOYED</span>
          </div>
          <div className="hidden min-w-max items-center gap-6 md:flex" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <span className="border-b border-primary px-1 py-0.5 font-display text-xs font-bold tracking-[0.05em] text-primary">SESSION_ACTIVE</span>
            <span className="px-1 py-0.5 font-display text-xs font-bold tracking-[0.05em] text-muted-foreground hover:bg-secondary hover:text-foreground">PROXY_LHR_01</span>
            <span className="px-1 py-0.5 font-display text-xs font-bold tracking-[0.05em] text-muted-foreground hover:bg-secondary hover:text-foreground">BROWSER_SYNCED</span>
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <div className="hidden items-center gap-1 md:flex">
            {suiteModules.map((moduleName) => (
              <Button
                key={moduleName}
                className={cn(
                  'h-8 rounded-none border-0 px-2 text-[10px] font-display font-bold tracking-[0.12em] shadow-none',
                  moduleName === 'job-finder'
                    ? 'bg-secondary text-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
                type="button"
              >
                {formatStatusLabel(moduleName)}
              </Button>
            ))}
          </div>
          <Button className="h-8 w-8 rounded-none border-0 bg-transparent text-primary hover:bg-secondary hover:text-primary" size="icon-sm" type="button">
            <Bell className="size-4" />
          </Button>
          <Button className="h-8 w-8 rounded-none border-0 bg-transparent text-primary hover:bg-secondary hover:text-primary" size="icon-sm" type="button">
            <TerminalSquare className="size-4" />
          </Button>
          <div className="flex h-8 w-8 items-center justify-center border border-border/30 bg-surface-container-high">
            <Bot className="size-4 text-primary" />
          </div>
          {!isMac ? (
            <div className="ml-2 flex items-center justify-end gap-1" role="group" aria-label="Window controls">
              <Button
                aria-label="Minimize window"
                className="h-7 w-8 rounded-[0.22rem] border-0 bg-transparent p-0 text-base text-foreground-muted shadow-none hover:bg-white/6 hover:text-foreground"
                disabled={!windowControlsState.isMinimizable}
                onClick={minimizeWindow}
                type="button"
              >
                <span aria-hidden="true">-</span>
              </Button>
              <Button
                aria-label={windowControlsState.isMaximized ? 'Restore window' : 'Maximize window'}
                className="h-7 w-8 rounded-[0.22rem] border-0 bg-transparent p-0 text-[0.84rem] text-foreground-muted shadow-none hover:bg-white/6 hover:text-foreground"
                onClick={toggleWindowExpand}
                type="button"
              >
                <span aria-hidden="true">{windowControlsState.isMaximized ? '❐' : '□'}</span>
              </Button>
              <Button
                aria-label="Close window"
                className="h-7 w-8 rounded-[0.22rem] border-0 bg-transparent p-0 text-base text-foreground-muted shadow-none hover:bg-[#8a1f17] hover:text-white"
                disabled={!windowControlsState.isClosable}
                onClick={closeWindow}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <Tabs className="h-screen" onValueChange={handleScreenChange} orientation="vertical" value={activeScreen}>
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-border/20 bg-[#131313] pt-20">
          <div className="px-6 pb-8">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div>
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-primary">UNEMPLOYED_OPS</h2>
                <p className="font-mono text-[9px] text-muted-foreground">STATUS: COMMAND_READY</p>
              </div>
            </div>
            <Button className="w-full justify-center gap-2 rounded-none" variant="primary">
              <Plus className="size-4" />
              NEW_SEARCH
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <TabsList className="px-2 py-2" variant="line">
              {screenDefinitions.map((screen) => {
                const Icon = screen.icon

                return (
                  <TabsTrigger key={screen.id} className="justify-start gap-3 px-4" value={screen.id}>
                    <Icon className="size-4" />
                    {screen.label.replace(' ', '_').toUpperCase()}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </ScrollArea>

          <div className="mt-auto border-t border-border/10 p-4">
            <div className="grid grid-cols-3 gap-px bg-border/20">
              {[
                ['Saved', workspace.discoveryJobs.length, 'jobs'],
                ['Queue', workspace.reviewQueue.length, 'items'],
                ['Tracked', workspace.applicationRecords.length, 'active']
              ].map(([label, value, meta]) => (
                <div key={label} className="grid gap-1 bg-card px-3 py-3 text-center">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
                  <strong className="font-display text-base font-bold text-primary">{value}</strong>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-foreground-soft">{meta}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="ml-64 flex h-screen flex-col bg-surface pt-14">
          <main className="flex-1 overflow-y-auto overflow-x-hidden pb-12">
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-border/10 bg-surface-container-low px-8">
              <div className="flex items-center gap-4">
                <span className="font-display text-lg font-bold tracking-[0.08em] text-primary">{(screenDefinitions.find((screen) => screen.id === activeScreen)?.label ?? 'PROFILE').replace('Review Queue', 'REVIEW_QUEUE').replace(' ', '_').toUpperCase()}</span>
                <StatusBadge tone={getSessionTone(workspace.browserSession)}>{workspace.browserSession.label}</StatusBadge>
              </div>
              <div className="flex items-center gap-2">
                <Button className="rounded-none" size="compact" variant="secondary" type="button">
                  <LayoutGrid className="size-4" />
                  VIEW
                </Button>
                <Button className="rounded-none" size="compact" variant="secondary" type="button">
                  <BriefcaseBusiness className="size-4" />
                  JOB_FINDER
                </Button>
              </div>
            </div>
            <div className="px-8 py-6">{children}</div>
          </main>

          <footer className="flex items-center justify-between gap-3 border-t border-border/10 bg-surface-muted px-8 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>Job Finder MVP</span>
            {actionMessage ? <span className="truncate text-primary">{actionMessage}</span> : null}
          </footer>
        </div>
      </Tabs>
    </div>
  )
}
