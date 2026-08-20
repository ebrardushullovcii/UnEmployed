import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BellRing,
  Building2,
  ClipboardCheck,
  Compass,
  FileText,
  House,
  Layers3,
  Minus,
  Settings,
  ShieldCheck,
  Square,
  UserRound,
  X,
} from "lucide-react";
import type {
  DesktopWindowControlsState,
  DiscoveryActivityEvent,
  GroupedManualAnswerDecision,
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
import { countActiveSafeguardBlockers } from "../lib/safeguards-blocker-count";
import {
  formatStatusLabel,
  getDefaultProfileRoute,
} from "../lib/job-finder-utils";

interface JobFinderShellProps {
  children: ReactNode;
  isDiscoveryPending?: boolean;
  isResumeImportPending?: boolean;
  liveDiscoveryEvents?: readonly DiscoveryActivityEvent[];
  onCancelApplyRun?: (runId: string) => Promise<boolean>;
  onCancelDiscovery?: () => void;
  onDismissSavedStatus?: () => void;
  onNavigate?: (path: string) => void;
  onRetrySave?: () => void;
  platform: "darwin" | "linux" | "win32";
  resumeImportProgress?: ResumeImportProgressEvent | null;
  saveState?: JobFinderSaveState;
  workspace: JobFinderWorkspaceSnapshot;
}

const screenRouteMap: Record<
  Exclude<
    JobFinderScreen,
    "profile" | "rapid-review" | "resume-strategies" | "safeguards"
  >,
  string
> = {
  home: "/job-finder/home",
  discovery: "/job-finder/discovery",
  "review-queue": "/job-finder/review-queue",
  applications: "/job-finder/applications",
  campaigns: "/job-finder/campaigns",
  actions: "/job-finder/actions",
  analytics: "/job-finder/analytics",
  settings: "/job-finder/settings",
  companies: "/job-finder/companies",
};

const screenLabelMap: Record<JobFinderScreen, string> = {
  home: "Home",
  profile: "Profile",
  discovery: "Find jobs",
  "review-queue": "Shortlisted",
  applications: "Applications",
  campaigns: "Campaigns",
  actions: "Needs you",
  analytics: "Analytics",
  settings: "Settings",
  "rapid-review": "Rapid review",
  "resume-strategies": "Resume strategies",
  safeguards: "Safeguards",
  companies: "Companies",
};

export function countUnresolvedUserActions(
  requests: JobFinderWorkspaceSnapshot["userActionRequests"] | undefined,
  groupedDecisions?: readonly GroupedManualAnswerDecision[],
): number {
  const unresolved = (requests ?? []).filter(
    (request) =>
      !["resolved", "skipped", "cancelled", "expired", "superseded"].includes(
        request.state,
      ),
  );
  const pendingDecisions = (groupedDecisions ?? []).filter(
    (decision) => decision.approval === "pending",
  );
  // A pending grouped decision represents its member requests on the Actions
  // screen, so the badge counts the decision card instead of the hidden
  // ordinary member cards.
  const representedRequestIds = new Set(
    pendingDecisions.flatMap((decision) =>
      decision.lineage.map((entry) => entry.requestId),
    ),
  );
  const unrepresentedRequests = unresolved.filter(
    (request) => !representedRequestIds.has(request.id),
  );
  return unrepresentedRequests.length + pendingDecisions.length;
}

const LOCKED_LAYOUT_SCREENS: readonly JobFinderScreen[] = [
  "profile",
  "discovery",
  "review-queue",
  "applications",
];

function getActiveScreen(pathname: string): JobFinderScreen {
  if (pathname === "/job-finder" || pathname === "/job-finder/") {
    return "home";
  }

  if (pathname.endsWith("/home")) {
    return "home";
  }

  if (pathname.endsWith("/discovery")) {
    return "discovery";
  }

  if (pathname.includes("/review-queue")) {
    return "review-queue";
  }

  if (pathname.endsWith("/applications")) {
    return "applications";
  }

  if (pathname.endsWith("/rapid-review")) {
    return "rapid-review";
  }

  if (pathname.endsWith("/campaigns")) {
    return "campaigns";
  }

  if (pathname.endsWith("/actions")) {
    return "actions";
  }

  if (pathname.endsWith("/analytics")) {
    return "analytics";
  }

  if (pathname.endsWith("/settings")) {
    return "settings";
  }

  if (pathname.endsWith("/resume-strategies")) {
    return "resume-strategies";
  }

  if (pathname.endsWith("/safeguards")) {
    return "safeguards";
  }

  if (pathname.includes("/companies")) {
    return "companies";
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [focusedMoreMenuItemIndex, setFocusedMoreMenuItemIndex] = useState(0);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const moreMenuInitialFocusRef = useRef<"first" | "last">("first");

  const activeScreen = useMemo(
    () => getActiveScreen(location.pathname),
    [location.pathname],
  );
  const activeScreenLabel = screenLabelMap[activeScreen];
  const usesLockedScreenLayout = useMemo(
    () => LOCKED_LAYOUT_SCREENS.includes(activeScreen),
    [activeScreen],
  );
  const screenDefinitions = useMemo(() => {
    const activeCampaign = workspace.campaigns?.find(
      (campaign) => campaign.id === workspace.activeCampaignId,
    );
    const campaignJobIds = new Set(
      activeCampaign?.jobIds ?? workspace.discoveryJobs.map((job) => job.id),
    );

    return [
      { id: "home", label: "Home", count: null, icon: House },
      { id: "profile", label: "Profile", count: null, icon: UserRound },
      {
        id: "discovery",
        label: "Find jobs",
        count: workspace.discoveryJobs.filter((job) =>
          campaignJobIds.has(job.id),
        ).length,
        icon: Compass,
      },
      {
        id: "review-queue",
        label: "Shortlisted",
        count: workspace.reviewQueue.filter((item) =>
          campaignJobIds.has(item.jobId),
        ).length,
        icon: ClipboardCheck,
      },
      {
        id: "applications",
        label: "Applications",
        count: workspace.applicationRecords.filter((record) =>
          campaignJobIds.has(record.jobId),
        ).length,
        icon: FileText,
      },
      {
        id: "campaigns",
        label: "Campaigns",
        count: (workspace.campaignNotifications ?? []).filter(
          (notification) => notification.unread,
        ).length,
        icon: Layers3,
      },
      {
        id: "actions",
        label: "Needs you",
        count: countUnresolvedUserActions(
          workspace.userActionRequests,
          workspace.intelligence?.groupedDecisions ?? [],
        ),
        icon: BellRing,
      },
      {
        id: "analytics",
        label: "Analytics",
        count:
          (workspace.intelligence?.outcomeEvents ?? []).length > 0
            ? (workspace.intelligence?.outcomeEvents ?? []).length
            : null,
        icon: BarChart3,
      },
      {
        id: "resume-strategies",
        label: "Strategies",
        count:
          (workspace.intelligence?.resumeStrategies ?? []).length > 0
            ? (workspace.intelligence?.resumeStrategies ?? []).length
            : null,
        icon: Layers3,
      },
      {
        id: "companies",
        label: "Companies",
        count:
          (workspace.intelligence?.companies ?? []).filter((company) =>
            company.mergeReviewCandidates.some(
              (candidate) => candidate.decision === "pending",
            ),
          ).length || null,
        icon: Building2,
      },
      {
        id: "safeguards",
        label: "Safeguards",
        count:
          countActiveSafeguardBlockers(
            workspace.intelligence?.safeguards ?? {
              companyApplicationCaps: [],
              simultaneousApplicationConflicts: [],
              listingSignals: [],
              abnormalFailurePauses: [],
              preparedBatchSampleReviews: [],
              contradictoryAnswerDetections: [],
              safeguardDismissals: [],
              updatedAt: null,
            },
          ) || null,
        icon: ShieldCheck,
      },
      { id: "settings", label: "Settings", count: null, icon: Settings },
    ];
  }, [
    workspace.activeCampaignId,
    workspace.applicationRecords,
    workspace.campaigns ?? [],
    workspace.campaignNotifications ?? [],
    workspace.discoveryJobs,
    workspace.intelligence?.groupedDecisions ?? [],
    workspace.intelligence?.outcomeEvents ?? [],
    workspace.intelligence?.resumeStrategies ?? [],
    workspace.intelligence?.companies ?? [],
    workspace.intelligence?.safeguards ?? [],
    workspace.reviewQueue,
    workspace.userActionRequests ?? [],
  ]);

  const actionScreen = screenDefinitions.find(
    (screen) => screen.id === "actions",
  );
  const primaryScreens = screenDefinitions.filter((screen) =>
    ["home", "profile", "discovery", "review-queue", "applications"].includes(
      screen.id,
    ),
  );
  const menuGroups = [
    {
      label: "Manage",
      screens: screenDefinitions.filter((screen) =>
        ["campaigns", "companies"].includes(screen.id),
      ),
    },
    {
      label: "Improve",
      screens: screenDefinitions.filter((screen) =>
        ["analytics", "resume-strategies"].includes(screen.id),
      ),
    },
    {
      label: "Safety and settings",
      screens: screenDefinitions.filter((screen) =>
        ["safeguards", "settings"].includes(screen.id),
      ),
    },
  ];
  const moreMenuItemCount = menuGroups.reduce(
    (count, group) => count + group.screens.length,
    0,
  );
  const moreMenuItemIndexes = new Map(
    menuGroups
      .flatMap((group) => group.screens)
      .map((screen, index) => [screen.id, index] as const),
  );
  const hiddenAttentionCount =
    (screenDefinitions.find((screen) => screen.id === "campaigns")?.count ??
      0) +
    (screenDefinitions.find((screen) => screen.id === "companies")?.count ??
      0) +
    (screenDefinitions.find((screen) => screen.id === "safeguards")?.count ??
      0);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !moreButtonRef.current?.contains(target) &&
        !moreMenuRef.current?.contains(target)
      ) {
        setIsMoreOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isMoreOpen) {
        return;
      }
      event.preventDefault();
      setIsMoreOpen(false);
      moreButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }
    const initialIndex =
      moreMenuInitialFocusRef.current === "last"
        ? Math.max(moreMenuItemCount - 1, 0)
        : 0;
    setFocusedMoreMenuItemIndex(initialIndex);
    const frame = requestAnimationFrame(() => {
      moreMenuItemRefs.current[initialIndex]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isMoreOpen, moreMenuItemCount]);

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
        : nextScreen === "resume-strategies"
          ? "/job-finder/resume-strategies"
          : nextScreen === "safeguards"
            ? "/job-finder/safeguards"
            : screenRouteMap[
                nextScreen as Exclude<
                  JobFinderScreen,
                  | "profile"
                  | "rapid-review"
                  | "resume-strategies"
                  | "safeguards"
                >
              ];

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
        <div className="job-finder-shell-grid grid grid-rows-[3.5rem_2.5rem_auto_3.75rem] items-stretch pl-2 pr-0 sm:grid-rows-[3.5rem_2.5rem_auto_3.75rem] sm:pl-3 sm:pr-0 lg:grid-rows-[3.5rem_2.5rem_7rem] 2xl:grid-rows-[2.5rem_4rem]">
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
            className="col-span-2 col-start-1 row-start-2 flex items-center justify-center sm:col-span-1 lg:col-span-2 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:h-14 2xl:h-10"
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
            className="absolute right-0 top-0 z-[60] flex h-14 items-stretch justify-end 2xl:h-10"
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
            className="col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center px-1 sm:col-span-1 lg:absolute lg:inset-x-0 lg:top-24 lg:z-10 lg:min-h-28 lg:px-16 xl:px-32 2xl:top-10 2xl:h-16 2xl:min-h-0 2xl:px-52"
            style={noDragRegionStyle}
          >
            <div className="relative flex w-full min-w-0 max-w-4xl items-center gap-1 rounded-3xl border border-(--surface-panel-border) bg-(--surface-panel) p-1 sm:gap-1.5 2xl:rounded-full">
              {primaryScreens.map((screen) => (
                <button
                  aria-current={activeScreen === screen.id ? "page" : undefined}
                  key={screen.id}
                  className={cn(
                    "inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-1.5 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-2 sm:text-[0.76rem] 2xl:px-4 2xl:text-(length:--text-small)",
                    activeScreen === screen.id
                      ? "bg-secondary text-foreground"
                      : "",
                  )}
                  onClick={() => handleScreenChange(screen.id)}
                  type="button"
                >
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
              <div className="relative shrink-0">
                <button
                  aria-expanded={isMoreOpen}
                  aria-haspopup="menu"
                  aria-label={`More Job Finder sections${hiddenAttentionCount > 0 ? `: ${hiddenAttentionCount} need attention` : ""}`}
                  className={cn(
                    "inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-full px-2.5 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-3 sm:text-[0.76rem] 2xl:px-4 2xl:text-(length:--text-small)",
                    menuGroups.some((group) =>
                      group.screens.some(
                        (screen) => activeScreen === screen.id,
                      ),
                    )
                      ? "bg-secondary text-foreground"
                      : "",
                  )}
                  onClick={() => {
                    moreMenuInitialFocusRef.current = "first";
                    setIsMoreOpen((open) => !open);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                      return;
                    }
                    if (!isMoreOpen) {
                      event.preventDefault();
                      moreMenuInitialFocusRef.current =
                        event.key === "ArrowUp" ? "last" : "first";
                      setIsMoreOpen(true);
                    }
                  }}
                  ref={moreButtonRef}
                  type="button"
                >
                  <Layers3 aria-hidden="true" className="size-3.5" />
                  <span>More</span>
                  {hiddenAttentionCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">
                      {hiddenAttentionCount}
                    </span>
                  ) : null}
                </button>
                {isMoreOpen ? (
                  <div
                    aria-label="More Job Finder sections"
                    aria-orientation="vertical"
                    className="absolute right-0 top-full z-50 mt-1 grid min-w-64 gap-2 rounded-2xl border border-(--surface-panel-border) bg-(--surface-panel-raised) p-2 shadow-xl"
                    onKeyDown={(event) => {
                      if (event.key === "Tab") {
                        setIsMoreOpen(false);
                        return;
                      }
                      if (
                        event.key !== "ArrowDown" &&
                        event.key !== "ArrowUp" &&
                        event.key !== "Home" &&
                        event.key !== "End"
                      ) {
                        return;
                      }

                      const menuItems = Array.from(
                        moreMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                          '[role="menuitem"]',
                        ) ?? [],
                      );
                      if (menuItems.length === 0) {
                        return;
                      }

                      event.preventDefault();
                      const activeIndex = menuItems.findIndex(
                        (item) => item === document.activeElement,
                      );
                      const currentIndex =
                        activeIndex >= 0
                          ? activeIndex
                          : focusedMoreMenuItemIndex;
                      const nextIndex =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? menuItems.length - 1
                            : event.key === "ArrowDown"
                              ? (currentIndex + 1) % menuItems.length
                              : (currentIndex - 1 + menuItems.length) %
                                menuItems.length;
                      setFocusedMoreMenuItemIndex(nextIndex);
                      menuItems[nextIndex]?.focus();
                    }}
                    ref={moreMenuRef}
                    role="menu"
                  >
                    {menuGroups.map((group) => (
                      <div
                        key={group.label}
                        className="grid gap-1"
                        role="group"
                        aria-label={group.label}
                      >
                        <span className="px-3 pt-1 text-[0.65rem] font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                          {group.label}
                        </span>
                        {group.screens.map((screen) => {
                          const menuItemIndex =
                            moreMenuItemIndexes.get(screen.id) ?? 0;
                          return (
                            <button
                              aria-current={
                                activeScreen === screen.id ? "page" : undefined
                              }
                              key={screen.id}
                              className={cn(
                                "inline-flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                                activeScreen === screen.id
                                  ? "bg-secondary text-foreground"
                                  : "",
                              )}
                              onClick={() => {
                                setIsMoreOpen(false);
                                handleScreenChange(screen.id);
                              }}
                              onFocus={() =>
                                setFocusedMoreMenuItemIndex(menuItemIndex)
                              }
                              ref={(element) => {
                                moreMenuItemRefs.current[menuItemIndex] =
                                  element;
                              }}
                              role="menuitem"
                              tabIndex={
                                menuItemIndex === focusedMoreMenuItemIndex
                                  ? 0
                                  : -1
                              }
                              type="button"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <screen.icon
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                                <span className="truncate">{screen.label}</span>
                              </span>
                              {screen.count !== null ? (
                                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--input) px-1.5 text-[0.65rem] text-foreground">
                                  {screen.count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </nav>

          <div
            aria-label="Notifications and actions"
            className="col-span-2 col-start-1 row-start-4 flex min-w-0 items-center justify-center gap-2 pr-2 sm:col-span-1 sm:col-start-1 sm:row-start-4 sm:justify-end lg:col-span-1 lg:col-start-3 lg:row-start-3 lg:absolute lg:right-0 lg:top-24 lg:z-20 lg:h-28 lg:w-auto 2xl:top-10 2xl:h-16"
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
                  "inline-flex h-[3.125rem] min-h-[3.125rem] min-w-10 items-center justify-center gap-2 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[0.76rem] 2xl:px-4 2xl:text-(length:--text-small)",
                  activeScreen === "actions"
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "",
                )}
                onClick={() => handleScreenChange("actions")}
                type="button"
              >
                <BellRing aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden whitespace-nowrap sm:inline lg:hidden 2xl:inline">
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
        className="flex h-screen min-h-screen flex-col sm:h-full sm:min-h-0 sm:pt-[13rem] 2xl:pt-[6.75rem]"
        data-job-finder-shell-content
      >
        <main
          aria-label={activeScreenLabel}
          className={cn(
            "flex-1 overflow-x-hidden outline-none",
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
