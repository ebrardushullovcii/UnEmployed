import type { CSSProperties, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  campaigns: "Search plans",
  actions: "Needs you",
  analytics: "Analytics",
  settings: "Settings",
  "rapid-review": "Rapid review",
  "resume-strategies": "Resume approaches",
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

function getFocusableElements(excludedRoot: HTMLElement | null): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    if (excludedRoot?.contains(element)) {
      return false;
    }

    return (
      element.tabIndex >= 0 && element.getAttribute("aria-hidden") !== "true"
    );
  });
}

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
  const [moreMenuPosition, setMoreMenuPosition] = useState<{
    top: number;
    right: number;
    maxHeight: number;
    width: number;
  } | null>(null);
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
        label: "Search plans",
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
        label: "Resume approaches",
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
      label: "Plan and improve",
      screens: screenDefinitions.filter((screen) =>
        ["campaigns", "resume-strategies", "companies", "analytics"].includes(
          screen.id,
        ),
      ),
    },
    {
      label: "Safety and setup",
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
  const sidebarGroups = [
    {
      label: "Overview",
      screens: screenDefinitions.filter((screen) => screen.id === "home"),
    },
    {
      label: "Your job search",
      screens: screenDefinitions.filter((screen) =>
        ["profile", "discovery", "review-queue", "applications"].includes(
          screen.id,
        ),
      ),
    },
    {
      label: "Plan and improve",
      screens: screenDefinitions.filter((screen) =>
        ["campaigns", "resume-strategies", "companies", "analytics"].includes(
          screen.id,
        ),
      ),
    },
    {
      label: "Safety and setup",
      screens: screenDefinitions.filter((screen) =>
        ["actions", "safeguards", "settings"].includes(screen.id),
      ),
    },
  ];
  const sidebarWorkflowNumbers = new Map(
    ["profile", "discovery", "review-queue", "applications"].map(
      (screenId, index) => [screenId, index + 1] as const,
    ),
  );
  const sidebarDisplayLabels: Record<string, string> = {
    campaigns: "Search plans",
    "resume-strategies": "Resume approaches",
    analytics: "Results",
  };

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
    const updatePosition = () => {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportRect = document.documentElement.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? viewportRect.width;
      const viewportHeight =
        window.visualViewport?.height ?? viewportRect.height;
      const right = Math.max(8, viewportWidth - rect.right);
      const top = rect.bottom + 4;
      const maxHeight = viewportHeight - top - 8;
      const width = Math.max(96, Math.min(256, viewportWidth - 16));
      setMoreMenuPosition({ top, right, maxHeight, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    const frame = requestAnimationFrame(() => {
      moreMenuItemRefs.current[initialIndex]?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [isMoreOpen, moreMenuItemCount]);

  useLayoutEffect(() => {
    if (!isMoreOpen || !moreMenuPosition) return;
    const frame = requestAnimationFrame(() => {
      const menuRect = moreMenuRef.current?.getBoundingClientRect();
      if (!menuRect || menuRect.left >= 0) return;
      setMoreMenuPosition((current) => {
        if (!current) return current;
        const width = Math.max(96, current.width + menuRect.left - 8);
        if (width === current.width && current.right === 8) return current;
        return { ...current, right: 8, width };
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    isMoreOpen,
    moreMenuPosition,
  ]);

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
      try {
        globalThis.performance?.mark?.(
          `job-finder:route:${location.pathname}:feedback-committed`,
        );
      } catch {
        // Navigation timing is diagnostic only and must never block routing.
      }
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

    const nextPathname = nextPath.split(/[?#]/, 1)[0] ?? nextPath;
    try {
      globalThis.performance?.mark?.(
        `job-finder:route:${nextPathname}:navigation-start`,
      );
    } catch {
      // Navigation timing is diagnostic only and must never block routing.
    }

    if (onNavigate) {
      onNavigate(nextPath);
      return;
    }

    void navigate(nextPath);
  }

  function closeMoreMenuAndMoveFocus(direction: -1 | 1) {
    const trigger = moreButtonRef.current;
    const focusableElements = getFocusableElements(moreMenuRef.current);
    const triggerIndex = trigger ? focusableElements.indexOf(trigger) : -1;
    const target =
      triggerIndex >= 0
        ? (focusableElements[triggerIndex + direction] ?? trigger)
        : trigger;

    setIsMoreOpen(false);
    requestAnimationFrame(() => target?.focus());
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
        className="relative z-50 overflow-visible border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm sm:fixed sm:inset-x-0 sm:top-0 min-[1440px]:h-14"
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[3.5rem_auto_auto] items-stretch overflow-visible pl-2 pr-2 sm:grid-rows-[3.5rem_3.75rem] sm:pl-3 sm:pr-3 min-[1440px]:grid-rows-[3.5rem]">
          <div
            className="col-start-1 row-start-1 flex min-w-0 items-center pl-2 sm:pl-3"
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
                  isMac ? "xl:text-[2rem]" : "xl:text-[2rem]",
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
            className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-center"
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
            className="absolute right-0 top-0 z-40 flex h-14 items-stretch justify-end"
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
            className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center justify-center overflow-visible px-1 sm:col-span-1 sm:col-start-1 sm:justify-start sm:pr-56 max-[899px]:pr-28 min-[1440px]:hidden"
            style={noDragRegionStyle}
          >
            <div className="relative flex w-full min-w-0 max-w-5xl items-center gap-1 overflow-x-auto overscroll-x-contain rounded-3xl border border-(--surface-panel-border) bg-(--surface-panel) p-1 [scrollbar-width:thin] sm:gap-1.5">
              {primaryScreens.map((screen) => (
                <button
                  aria-current={activeScreen === screen.id ? "page" : undefined}
                  key={screen.id}
                  className={cn(
                    "inline-flex h-9 min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:gap-2 sm:px-3 sm:text-[0.76rem]",
                    activeScreen === screen.id
                      ? "bg-secondary text-foreground"
                      : "",
                  )}
                  onClick={() => handleScreenChange(screen.id)}
                  type="button"
                >
                  <span className="shrink-0 whitespace-nowrap leading-tight">
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
                  aria-label={`Planning and settings${hiddenAttentionCount > 0 ? `: ${hiddenAttentionCount} need attention` : ""}`}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-3 sm:text-[0.76rem] max-[899px]:sticky max-[899px]:right-0 max-[899px]:z-10 max-[899px]:border max-[899px]:border-(--surface-panel-border) max-[899px]:bg-(--surface-panel-raised)",
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
                  title="Planning & settings"
                  type="button"
                >
                  <Layers3 aria-hidden="true" className="size-3.5" />
                  <span className="max-[899px]:sr-only">
                    Planning &amp; settings
                  </span>
                  {hiddenAttentionCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">
                      {hiddenAttentionCount}
                    </span>
                  ) : null}
                </button>
                {isMoreOpen
                  ? createPortal(
                      <div
                        aria-label="Planning and settings"
                        aria-orientation="vertical"
                        className="fixed z-[60] grid max-h-[min(80vh,24rem)] min-w-0 max-w-[calc(100vw-1rem)] gap-2 overflow-y-auto rounded-2xl border border-(--surface-panel-border) bg-(--surface-panel-raised) p-2 shadow-xl max-[899px]:gap-1"
                        style={
                          moreMenuPosition
                            ? {
                                top: moreMenuPosition.top,
                                right: moreMenuPosition.right,
                                maxHeight: moreMenuPosition.maxHeight,
                                width: moreMenuPosition.width,
                              }
                            : undefined
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Tab") {
                            event.preventDefault();
                            closeMoreMenuAndMoveFocus(event.shiftKey ? -1 : 1);
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
                        <p className="px-3 pt-1 text-xs leading-relaxed text-muted-foreground max-[899px]:sr-only">
                          Set up search plans and resume approaches after your
                          profile, then review results before preparing
                          applications.
                        </p>
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
                                  aria-label={screen.label}
                                  aria-current={
                                    activeScreen === screen.id
                                      ? "page"
                                      : undefined
                                  }
                                  key={screen.id}
                                  className={cn(
                                    "inline-flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[0.78rem] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 max-[899px]:min-h-8 max-[899px]:py-1",
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
                                    <span className="truncate">
                                      {screen.label}
                                    </span>
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
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
          </nav>

          <div
            aria-label="Notifications and actions"
            className="col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center gap-2 pr-2 sm:absolute sm:right-0 sm:top-14 sm:z-10 sm:h-[3.75rem] sm:w-auto sm:justify-end max-[899px]:gap-1 max-[899px]:pr-1 min-[1440px]:right-36 min-[1440px]:top-0 min-[1440px]:z-40 min-[1440px]:h-14"
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
                  "inline-flex h-[3.125rem] min-h-[3.125rem] min-w-10 items-center justify-center gap-2 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:px-4 sm:text-[0.76rem] max-[899px]:gap-1 max-[899px]:px-2",
                  activeScreen === "actions"
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "",
                )}
                onClick={() => handleScreenChange("actions")}
                type="button"
              >
                <BellRing aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden whitespace-nowrap min-[900px]:inline min-[1024px]:hidden min-[1440px]:inline">
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

      <aside
        aria-label="Job Finder sidebar"
        className="fixed inset-y-14 left-0 z-40 hidden w-[15.5rem] overflow-x-hidden overflow-y-auto border-r border-border/15 bg-(--shell-header-bg) px-3 py-5 min-[1440px]:block"
        data-job-finder-sidebar
      >
        <nav
          aria-label="Job Finder sidebar destinations"
          className="grid gap-5"
        >
          {sidebarGroups.map((group) => (
            <section key={group.label} className="grid gap-1">
              <h2 className="whitespace-nowrap px-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="grid gap-0.5">
                {group.screens.map((screen) => {
                  const workflowNumber = sidebarWorkflowNumbers.get(screen.id);
                  const displayLabel =
                    sidebarDisplayLabels[screen.id] ?? screen.label;
                  const accessibleLabel =
                    displayLabel === screen.label
                      ? screen.label
                      : `${screen.label}: ${displayLabel}`;
                  return (
                    <button
                      aria-current={
                        activeScreen === screen.id ? "page" : undefined
                      }
                      aria-label={accessibleLabel}
                      className={cn(
                        "inline-flex min-h-10 min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        activeScreen === screen.id
                          ? "bg-secondary text-foreground"
                          : "",
                      )}
                      key={screen.id}
                      onClick={() => handleScreenChange(screen.id)}
                      type="button"
                    >
                      {workflowNumber ? (
                        <span
                          aria-hidden="true"
                          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/60 text-[0.65rem] font-semibold"
                        >
                          {workflowNumber}
                        </span>
                      ) : (
                        <screen.icon
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                      )}
                      <span className="min-w-0 truncate">{displayLabel}</span>
                      {screen.count !== null ? (
                        <span
                          className={cn(
                            "ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[0.65rem]",
                            screen.id === "actions" && screen.count > 0
                              ? "bg-primary text-primary-foreground"
                              : "bg-(--input) text-foreground",
                          )}
                        >
                          {screen.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

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
        className="flex min-h-screen flex-col sm:h-full sm:min-h-0 sm:pt-[7.25rem] min-[1440px]:pt-14 min-[1440px]:pl-[15.5rem]"
        data-job-finder-shell-content
      >
        <main
          aria-label={activeScreenLabel}
          className={cn(
            "flex-1 overflow-x-hidden outline-none",
            usesLockedScreenLayout
              ? "overflow-hidden px-2 pb-4 pt-0 sm:px-4 min-[1440px]:px-6"
              : "screen-scroll-area overflow-y-auto px-4 pb-12 pt-8 sm:px-6 min-[1440px]:px-6",
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
