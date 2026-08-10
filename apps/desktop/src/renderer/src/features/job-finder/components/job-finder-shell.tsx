import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  ClipboardCheck,
  Compass,
  FileText,
  Minus,
  Settings2,
  Settings,
  Square,
  UserRound,
  X,
} from "lucide-react";
import type {
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  JobFinderWorkspaceSnapshot,
  ResumeImportProgressEvent,
} from "@unemployed/contracts";
import { suiteModules } from "@unemployed/contracts";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";
import type { JobFinderScreen } from "../lib/job-finder-types";
import type { JobFinderSaveState } from "@renderer/pages/job-finder-save-state";
import { JobFinderSaveStatus } from "./job-finder-save-status";
import { JobFinderTaskCenter } from "./task-center/job-finder-task-center";
import {
  formatStatusLabel,
  getDefaultProfileRoute,
} from "../lib/job-finder-utils";

interface JobFinderShellProps {
  children: ReactNode;
  isDiscoveryPending?: boolean;
  isResumeImportPending?: boolean;
  liveDiscoveryEvents?: readonly DiscoveryActivityEvent[];
  onCancelApplyRun?: (runId: string) => void;
  onCancelDiscovery?: () => void;
  onDismissSavedStatus?: () => void;
  onNavigate?: (path: string) => void;
  onRetrySave?: () => void;
  platform: "darwin" | "linux" | "win32";
  resumeImportProgress?: ResumeImportProgressEvent | null;
  saveState?: JobFinderSaveState;
  workspace: JobFinderWorkspaceSnapshot;
}

const screenRouteMap: Record<Exclude<JobFinderScreen, "profile">, string> = {
  discovery: "/job-finder/discovery",
  "review-queue": "/job-finder/review-queue",
  applications: "/job-finder/applications",
  actions: "/job-finder/actions",
  settings: "/job-finder/settings",
};

const screenLabelMap: Record<JobFinderScreen, string> = {
  profile: "Profile",
  discovery: "Find jobs",
  "review-queue": "Shortlisted",
  applications: "Applications",
  actions: "Needs you",
  settings: "Settings",
};

export function countUnresolvedUserActions(
  requests: JobFinderWorkspaceSnapshot["userActionRequests"] | undefined,
): number {
  return (requests ?? []).filter(
    (request) =>
      !["resolved", "skipped", "cancelled", "expired", "superseded"].includes(
        request.state,
      ),
  ).length;
}

const LOCKED_LAYOUT_SCREENS: readonly JobFinderScreen[] = [
  "profile",
  "discovery",
  "review-queue",
  "applications",
];

function getActiveScreen(pathname: string): JobFinderScreen {
  if (pathname.endsWith("/discovery")) {
    return "discovery";
  }

  if (pathname.includes("/review-queue")) {
    return "review-queue";
  }

  if (pathname.endsWith("/applications")) {
    return "applications";
  }

  if (pathname.endsWith("/actions")) {
    return "actions";
  }

  if (pathname.endsWith("/settings")) {
    return "settings";
  }

  return "profile";
}

export function JobFinderShell({
  children,
  isDiscoveryPending = false,
  isResumeImportPending = false,
  liveDiscoveryEvents = [],
  onCancelApplyRun,
  onCancelDiscovery,
  onDismissSavedStatus,
  onNavigate,
  onRetrySave,
  platform,
  resumeImportProgress = null,
  saveState,
  workspace,
}: JobFinderShellProps) {
  const isMac = platform === "darwin";
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const [windowControlsState, setWindowControlsState] =
    useState<DesktopWindowControlsState>({
      isClosable: true,
      isMaximized: false,
      isMinimizable: true,
    });
  const [routeAnnouncement, setRouteAnnouncement] = useState("");

  const activeScreen = useMemo(
    () => getActiveScreen(location.pathname),
    [location.pathname],
  );
  const activeScreenLabel = screenLabelMap[activeScreen];
  const usesLockedScreenLayout = useMemo(
    () => LOCKED_LAYOUT_SCREENS.includes(activeScreen),
    [activeScreen],
  );
  const screenDefinitions = useMemo(
    () => [
      { id: "profile", label: "Profile", count: null, icon: UserRound },
      {
        id: "discovery",
        label: "Find jobs",
        count: workspace.discoveryJobs.length,
        icon: Compass,
      },
      {
        id: "review-queue",
        label: "Shortlisted",
        count: workspace.reviewQueue.length,
        icon: ClipboardCheck,
      },
      {
        id: "applications",
        label: "Applications",
        count: workspace.applicationRecords.length,
        icon: FileText,
      },
      {
        id: "actions",
        label: "Needs you",
        count: countUnresolvedUserActions(workspace.userActionRequests),
        icon: BellRing,
      },
      { id: "settings", label: "Settings", count: null, icon: Settings },
    ],
    [
      workspace.applicationRecords.length,
      workspace.discoveryJobs.length,
      workspace.reviewQueue.length,
      workspace.userActionRequests ?? [],
    ],
  );

  const workflowScreens = screenDefinitions.filter(
    (screen) => !["actions", "settings"].includes(screen.id),
  );
  const actionScreen = screenDefinitions.find(
    (screen) => screen.id === "actions",
  );

  useLayoutEffect(() => {
    const main = mainRef.current;
    const usesNarrowShellReflow =
      window.matchMedia?.("(max-width: 639px)").matches ?? false;
    document.title = `${activeScreenLabel} | Job Finder | UnEmployed`;
    setRouteAnnouncement("");
    main?.scrollTo({ top: 0 });
    main?.focus({ preventScroll: true });
    if (usesNarrowShellReflow) {
      main?.scrollIntoView({ block: "start" });
    }

    const frame = window.requestAnimationFrame(() => {
      main?.scrollTo({ top: 0 });
      setRouteAnnouncement(`${activeScreenLabel} opened.`);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeScreenLabel, location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = window.unemployed.window.onControlsStateChange(
      (controlsState) => {
        if (!cancelled) {
          setWindowControlsState(controlsState);
        }
      },
    );

    void window.unemployed.window
      .getControlsState()
      .then((controlsState) => {
        if (!cancelled) {
          setWindowControlsState(controlsState);
        }
      })
      .catch(() => {
        // Keep the initial fallback state when the window bridge is unavailable.
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function runWindowAction(
    action: () => Promise<DesktopWindowControlsState>,
  ): Promise<void> {
    try {
      const nextControlsState = await action();
      setWindowControlsState(nextControlsState);
    } catch {
      // Keep the current controls state if the desktop action fails.
    }
  }

  function minimizeWindow() {
    void runWindowAction(() => window.unemployed.window.minimize());
  }

  function toggleWindowExpand() {
    void runWindowAction(() => window.unemployed.window.toggleMaximize());
  }

  function closeWindow() {
    void window.unemployed.window.close();
  }

  function handleScreenChange(nextScreen: string) {
    const nextPath =
      nextScreen === "profile"
        ? getDefaultProfileRoute(workspace.profileSetupState)
        : screenRouteMap[nextScreen as Exclude<JobFinderScreen, "profile">];

    if (onNavigate) {
      onNavigate(nextPath);
      return;
    }

    void navigate(nextPath);
  }

  return (
    <div
      data-job-finder-shell
      className={cn(
        "h-screen overflow-x-hidden overflow-y-auto text-foreground sm:overflow-hidden",
        `platform-${platform}`,
      )}
    >
      <header
        data-job-finder-shell-header
        className="relative z-50 border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm sm:fixed sm:inset-x-0 sm:top-0"
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[3.5rem_2.5rem_9rem_3.75rem] items-stretch pl-2 pr-0 sm:grid-rows-[3.5rem_2.5rem_7rem] sm:pl-3 sm:pr-0 xl:grid-rows-[2.5rem_4rem]">
          <div
            className="col-start-1 row-start-1 flex min-w-0 items-center pl-2 sm:pl-3 xl:row-span-2"
            data-desktop-brand
            style={{
              ...dragRegionStyle,
              paddingInlineStart: isMac ? "5.5rem" : undefined,
            }}
          >
            <div className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "font-display text-[1.45rem] font-black leading-none tracking-[-0.08em] text-(var(--headline-primary)) sm:text-[2rem]",
                  isMac ? "xl:text-[2rem]" : "xl:text-[2.7rem]",
                )}
              >
                UNEMPLOYED
              </span>
              <span className="text-[0.72rem] uppercase tracking-(var(--tracking-caps)) text-muted-foreground sm:text-(length:var(--text-tiny))">
                Job Finder
              </span>
            </div>
          </div>

          <div
            className="col-span-2 col-start-1 row-start-2 flex items-center justify-center lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:h-14 xl:h-10"
            data-desktop-module-navigation
            style={dragRegionStyle}
          >
            <div
              className="flex items-center gap-6"
              role="list"
              style={noDragRegionStyle}
            >
              {suiteModules.map((moduleName, index) => (
                <div
                  key={moduleName}
                  className="flex items-center gap-6"
                  role="listitem"
                >
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-px bg-border/50"
                    />
                  ) : null}
                  <button
                    aria-current={
                      moduleName === "job-finder" ? "page" : undefined
                    }
                    aria-label={
                      moduleName === "interview-helper"
                        ? "Open Interview Helper"
                        : "Job Finder"
                    }
                    onClick={() => {
                      if (moduleName === "interview-helper") {
                        if (onNavigate) {
                          onNavigate("/interview-helper");
                        } else {
                          void navigate("/interview-helper");
                        }
                      }
                    }}
                    className={cn(
                      "h-auto rounded-sm border-0 bg-transparent px-0 py-0 text-[14px] font-semibold tracking-(--tracking-badge) shadow-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[15px]",
                      moduleName === "interview-helper"
                        ? "cursor-pointer hover:text-foreground"
                        : "",
                      moduleName === "job-finder"
                        ? "text-(--text-headline)"
                        : "text-muted-foreground",
                    )}
                    type="button"
                  >
                    {formatStatusLabel(moduleName)}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            className="absolute right-0 top-0 z-[60] flex h-14 items-stretch justify-end xl:h-10"
            style={dragRegionStyle}
          >
            {!isMac ? (
              <div
                className="flex h-full items-stretch gap-0"
                role="group"
                aria-label="Window controls"
                style={noDragRegionStyle}
              >
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
                  aria-label={
                    windowControlsState.isMaximized
                      ? "Restore window"
                      : "Maximize window"
                  }
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

          <nav
            aria-label="Job Finder sections"
            className="col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center px-1 lg:absolute lg:inset-x-0 lg:top-24 lg:z-10 lg:h-28 lg:px-64 xl:top-10 xl:h-16 xl:px-52"
            style={noDragRegionStyle}
          >
            <div className="grid w-full min-w-0 grid-cols-2 items-stretch gap-1 rounded-3xl border border-(--surface-panel-border) bg-(--surface-panel) p-1 sm:grid-cols-3 lg:inline-flex lg:w-auto lg:max-w-full lg:shrink-0 lg:flex-nowrap lg:rounded-full">
              {workflowScreens.map((screen) => (
                <button
                  aria-current={activeScreen === screen.id ? "page" : undefined}
                  key={screen.id}
                  className={cn(
                    "inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-2 sm:text-[0.76rem] lg:w-auto lg:px-3 xl:px-4 xl:text-(length:--text-small)",
                    activeScreen === screen.id
                      ? "bg-secondary text-foreground"
                      : "",
                  )}
                  onClick={() => handleScreenChange(screen.id)}
                  type="button"
                >
                  <screen.icon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 md:hidden"
                  />
                  <span className="min-w-0 leading-tight sm:whitespace-nowrap">
                    {screen.label}
                  </span>
                  {screen.count !== null ? (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--input) px-1.5 text-[0.65rem] text-foreground">
                      {screen.count}
                    </span>
                  ) : null}
                </button>
              ))}
              <span
                aria-hidden="true"
                className="mx-1 hidden h-4 w-px bg-border/50 lg:block"
              />
              <button
                aria-current={activeScreen === "settings" ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[0.72rem] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-2 sm:text-[0.76rem] lg:w-auto lg:px-3 xl:px-4 xl:text-(length:--text-small)",
                  activeScreen === "settings"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleScreenChange("settings")}
                type="button"
              >
                <Settings2
                  aria-hidden="true"
                  className="size-4 shrink-0 md:hidden xl:block"
                />
                <span className="min-w-0 leading-tight sm:whitespace-nowrap">
                  Settings
                </span>
              </button>
            </div>
          </nav>

          <div
            aria-label="Notifications and actions"
            className="col-span-2 col-start-1 row-start-4 flex min-w-0 items-center justify-center gap-2 pr-2 sm:col-span-1 sm:col-start-3 sm:row-start-3 sm:justify-end lg:absolute lg:right-0 lg:top-24 lg:z-20 lg:h-28 lg:w-auto xl:top-10 xl:h-16"
            role="group"
            style={noDragRegionStyle}
          >
            <JobFinderTaskCenter
              isDiscoveryPending={isDiscoveryPending}
              isResumeImportPending={isResumeImportPending}
              liveDiscoveryEvents={liveDiscoveryEvents}
              onCancelApplyRun={onCancelApplyRun}
              onCancelDiscovery={onCancelDiscovery}
              onNavigate={(path) => {
                if (onNavigate) {
                  onNavigate(path);
                } else {
                  void navigate(path);
                }
              }}
              resumeImportProgress={resumeImportProgress}
              workspace={workspace}
            />
            {actionScreen ? (
              <button
                aria-current={activeScreen === "actions" ? "page" : undefined}
                aria-label={`Needs you: ${actionScreen.count ?? 0} unresolved`}
                className={cn(
                  "inline-flex h-[3.125rem] min-h-[3.125rem] min-w-10 items-center justify-center gap-2 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[0.76rem] xl:px-4 xl:text-(length:--text-small)",
                  activeScreen === "actions"
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "",
                )}
                onClick={() => handleScreenChange("actions")}
                type="button"
              >
                <BellRing aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden whitespace-nowrap sm:inline">
                  Needs you
                </span>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[0.65rem]",
                    (actionScreen.count ?? 0) > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-(--input) text-foreground",
                  )}
                >
                  {actionScreen.count}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {saveState && onRetrySave ? (
        <JobFinderSaveStatus
          onDismissSaved={onDismissSavedStatus}
          onRetry={onRetrySave}
          saveState={saveState}
        />
      ) : null}

      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {routeAnnouncement}
      </span>

      <div
        className="flex h-screen min-h-screen flex-col sm:h-full sm:min-h-0 sm:pt-[13rem] xl:pt-[6.75rem]"
        data-job-finder-shell-content
      >
        <main
          aria-label={activeScreenLabel}
          className={cn(
            "flex-1 overflow-x-hidden",
            usesLockedScreenLayout
              ? "overflow-hidden px-2 pb-4 pt-0 sm:px-4"
              : "screen-scroll-area overflow-y-auto px-4 pb-12 pt-8 sm:px-6",
          )}
          ref={mainRef}
          tabIndex={-1}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-472 min-w-0",
              usesLockedScreenLayout ? "h-full min-h-full" : "min-h-full",
            )}
            key={location.pathname}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
