import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BellRing,
  Building2,
  Menu,
  ClipboardCheck,
  Compass,
  FileText,
  House,
  Layers3,
  Minus,
  Search,
  Settings,
  ShieldCheck,
  Square,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/cn";
import type { JobFinderScreen } from "../lib/job-finder-types";
import type { JobFinderSaveState } from "@renderer/pages/job-finder-save-state";
import type { TailoredDraftPreparationViewState } from "../screens/review-queue/review-queue-status";
import { JobFinderSaveStatus } from "./job-finder-save-status";
import {
  JOB_FINDER_GLOBAL_SEARCH_LABEL,
  JobFinderGlobalSearchDialog,
} from "./job-finder-global-search";
import { JobFinderTaskCenter } from "./task-center/job-finder-task-center";
import { StartupResetRecoveryBanner } from "./startup-reset-recovery-banner";
import { countActiveSafeguardBlockers } from "../lib/safeguards-blocker-count";
import { buildJobFinderGlobalSearchEntries } from "../lib/build-job-finder-global-search-entries";
import type { JobFinderGlobalSearchEntry } from "../lib/job-finder-global-search";
import {
  buildJobFinderShortcutHelp,
  formatJobFinderShortcutCombo,
  getJobFinderAriaKeyshortcuts,
} from "../lib/job-finder-shortcuts";
import { isImeComposingEvent } from "../lib/job-finder-shortcuts";
import { useJobFinderOverlayOwnership } from "../lib/job-finder-overlay-ownership";
import { useJobFinderShellShortcuts } from "../lib/use-job-finder-shell-shortcuts";
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
  onStopTailoredDraftPreparation?: () => void;
  platform: "darwin" | "linux" | "win32";
  resumeImportProgress?: ResumeImportProgressEvent | null;
  saveState?: JobFinderSaveState;
  tailoredDraftPreparation?: TailoredDraftPreparationViewState | null;
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
  documents: "/job-finder/documents",
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
  analytics: "Outcomes",
  documents: "Documents",
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

export function countUnreadCampaignNotifications(
  notifications:
    | JobFinderWorkspaceSnapshot["campaignNotifications"]
    | undefined,
): number {
  return (notifications ?? []).filter((notification) => notification.unread)
    .length;
}

const LOCKED_LAYOUT_SCREENS: readonly JobFinderScreen[] = [
  "profile",
  "discovery",
  "review-queue",
  "applications",
];

// Below this computed planning-menu height the expanded shortcuts list always
// severs its header from its rows at the menu's scroll cut, so the section
// collapses into a native disclosure instead of leaving an orphan label.
const MORE_MENU_COMPACT_SHORTCUTS_MAX_HEIGHT_PX = 480;

interface CompactRouteScrollEdges {
  end: boolean;
  start: boolean;
}

function readCompactRouteScrollEdges(
  element: HTMLDivElement,
): CompactRouteScrollEdges {
  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  return {
    start: element.scrollLeft > 1,
    end: element.scrollLeft < maxScrollLeft - 1,
  };
}

const NO_ROUTE_SCROLL_EDGES: CompactRouteScrollEdges = {
  end: false,
  start: false,
};

const SIDEBAR_COLLAPSED_STORAGE_KEY =
  "unemployed.job-finder.sidebar-collapsed.v1";

function toCountBadge(count: number): number | null {
  return count > 0 ? count : null;
}

/**
 * Inventory counts describe workspace volume and stay label-only; attention
 * counts describe work waiting on the user and stay announced to assistive
 * technology in every navigation surface.
 */
type ScreenCountKind = "attention" | "inventory";

interface ScreenCountBadgeProps {
  className?: string;
  count: number;
  kind: ScreenCountKind;
}

function ScreenCountBadge({ className, count, kind }: ScreenCountBadgeProps) {
  return (
    <span
      aria-hidden={kind === "inventory" ? true : undefined}
      className={className}
    >
      {count}
    </span>
  );
}

function getScreenAccessibleName(
  label: string,
  count: number | null,
  kind: ScreenCountKind,
): string {
  return kind === "attention" && count !== null && count > 0
    ? `${label}: ${count} need attention`
    : label;
}

const NAV_PILL_COUNT_BADGE_CLASS =
  "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--input) px-1.5 text-[0.65rem] text-foreground";

function getInitialSidebarCollapsedState(): boolean {
  try {
    return (
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

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

  if (pathname.endsWith("/documents")) {
    return "documents";
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
  onStopTailoredDraftPreparation,
  platform,
  resumeImportProgress = null,
  saveState,
  tailoredDraftPreparation = null,
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    getInitialSidebarCollapsedState,
  );
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchFocusRequest, setGlobalSearchFocusRequest] = useState(0);
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
  const moreMenuItemRefs = useRef<Array<HTMLElement | null>>([]);
  const moreMenuInitialFocusRef = useRef<"first" | "last">("first");
  const compactRouteScrollRef = useRef<HTMLDivElement | null>(null);
  const [compactRouteScrollEdges, setCompactRouteScrollEdges] =
    useState<CompactRouteScrollEdges>(NO_ROUTE_SCROLL_EDGES);
  const [isShortcutsDisclosureOpen, setIsShortcutsDisclosureOpen] =
    useState(false);
  const globalSearchEntries = useMemo(
    () => buildJobFinderGlobalSearchEntries(workspace),
    [workspace],
  );
  const shortcutHelpEntries = useMemo(
    () => buildJobFinderShortcutHelp(platform),
    [platform],
  );
  const isMoreMenuShortcutsCollapsed =
    moreMenuPosition !== null &&
    moreMenuPosition.maxHeight > 0 &&
    moreMenuPosition.maxHeight < MORE_MENU_COMPACT_SHORTCUTS_MAX_HEIGHT_PX;

  const activeScreen = useMemo(
    () => getActiveScreen(location.pathname),
    [location.pathname],
  );
  const activeScreenLabel = screenLabelMap[activeScreen];
  const usesLockedScreenLayout = useMemo(
    () => LOCKED_LAYOUT_SCREENS.includes(activeScreen),
    [activeScreen],
  );
  interface ShellScreenDefinition {
    id: string;
    label: string;
    count: number | null;
    countKind: ScreenCountKind;
    icon: LucideIcon;
  }

  const screenDefinitions = useMemo<readonly ShellScreenDefinition[]>(() => {
    const activeCampaign = workspace.campaigns?.find(
      (campaign) => campaign.id === workspace.activeCampaignId,
    );
    const campaignJobIds = new Set(
      activeCampaign?.jobIds ?? workspace.discoveryJobs.map((job) => job.id),
    );

    return [
      {
        id: "home",
        label: "Home",
        count: null,
        countKind: "inventory",
        icon: House,
      },
      {
        id: "profile",
        label: "Profile",
        count: null,
        countKind: "inventory",
        icon: UserRound,
      },
      {
        id: "discovery",
        label: "Find jobs",
        count: toCountBadge(
          workspace.discoveryJobs.filter((job) => campaignJobIds.has(job.id))
            .length,
        ),
        countKind: "inventory",
        icon: Compass,
      },
      {
        id: "review-queue",
        label: "Shortlisted",
        count: toCountBadge(
          workspace.reviewQueue.filter((item) => campaignJobIds.has(item.jobId))
            .length,
        ),
        countKind: "inventory",
        icon: ClipboardCheck,
      },
      {
        id: "applications",
        label: "Applications",
        count: toCountBadge(
          workspace.applicationRecords.filter((record) =>
            campaignJobIds.has(record.jobId),
          ).length,
        ),
        countKind: "inventory",
        icon: FileText,
      },
      {
        id: "campaigns",
        label: "Search plans",
        count: toCountBadge((workspace.campaigns ?? []).length),
        countKind: "inventory",
        icon: Layers3,
      },
      {
        id: "actions",
        label: "Needs you",
        count: toCountBadge(
          countUnresolvedUserActions(
            workspace.userActionRequests,
            workspace.intelligence?.groupedDecisions ?? [],
          ),
        ),
        countKind: "attention",
        icon: BellRing,
      },
      {
        id: "analytics",
        label: "Outcomes",
        count:
          (workspace.intelligence?.outcomeEvents ?? []).length > 0
            ? (workspace.intelligence?.outcomeEvents ?? []).length
            : null,
        countKind: "inventory",
        icon: BarChart3,
      },
      {
        id: "resume-strategies",
        label: "Resume approaches",
        count:
          (workspace.intelligence?.resumeStrategies ?? []).length > 0
            ? (workspace.intelligence?.resumeStrategies ?? []).length
            : null,
        countKind: "inventory",
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
        countKind: "attention",
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
        countKind: "attention",
        icon: ShieldCheck,
      },
      {
        id: "documents",
        label: "Documents",
        count: null,
        countKind: "inventory",
        icon: FileText,
      },
      {
        id: "settings",
        label: "Settings",
        count: null,
        countKind: "inventory",
        icon: Settings,
      },
    ];
  }, [
    workspace.activeCampaignId,
    workspace.applicationRecords,
    workspace.campaigns ?? [],
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
        ["safeguards", "documents", "settings"].includes(screen.id),
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
    countUnreadCampaignNotifications(workspace.campaignNotifications) +
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
        ["safeguards", "documents", "settings"].includes(screen.id),
      ),
    },
  ];

  const moreMenuClose = useCallback(() => {
    setIsMoreOpen(false);
    moreButtonRef.current?.focus();
  }, []);

  // Register the Planning popover on the shared LIFO stack while it is open so
  // stacked surfaces close one per Escape and shell aliases stay blocked.
  const { isTopmost: isMoreMenuTopmost } = useJobFinderOverlayOwnership({
    active: isMoreOpen,
    close: moreMenuClose,
  });

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
      // Inner controls and overlays above this menu keep first claim.
      if (event.defaultPrevented || isImeComposingEvent(event)) {
        return;
      }
      if (event.key !== "Escape" || !isMoreMenuTopmost()) {
        return;
      }
      event.preventDefault();
      moreMenuClose();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMoreMenuTopmost, isMoreOpen, moreMenuClose]);

  useEffect(() => {
    if (!isMoreOpen) {
      setIsShortcutsDisclosureOpen(false);
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
  }, [isMoreOpen, moreMenuPosition]);

  useLayoutEffect(() => {
    compactRouteScrollRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeScreen]);

  useLayoutEffect(() => {
    const element = compactRouteScrollRef.current;
    if (!element) {
      return;
    }
    setCompactRouteScrollEdges(readCompactRouteScrollEdges(element));
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            setCompactRouteScrollEdges(readCompactRouteScrollEdges(element));
          });
    const handleWindowResize = () => {
      setCompactRouteScrollEdges(readCompactRouteScrollEdges(element));
    };
    observer?.observe(element);
    // Route buttons and badges resize without resizing the scrollport box,
    // so the content wrapper is observed too or fades drift out of truth.
    const contentElement = element.firstElementChild;
    if (contentElement instanceof HTMLElement) {
      observer?.observe(contentElement);
    }
    window.addEventListener("resize", handleWindowResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

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

  function toggleSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          String(next),
        );
      } catch {
        // The layout still works when persistence is unavailable.
      }
      return next;
    });
  }

  function openGlobalSearch() {
    setIsMoreOpen(false);
    setIsGlobalSearchOpen(true);
    setGlobalSearchFocusRequest((request) => request + 1);
  }

  function handleGlobalSearchNavigate(entry: JobFinderGlobalSearchEntry) {
    if (onNavigate) {
      onNavigate(entry.href);
      return;
    }
    void navigate(entry.href);
  }

  useJobFinderShellShortcuts({
    isOverlayOpen: isMoreOpen || isGlobalSearchOpen,
    isSearchOpen: isGlobalSearchOpen,
    onOpenGlobalSearch: openGlobalSearch,
    onToggleSidebar: toggleSidebar,
  });

  const shortcutHelpRows = shortcutHelpEntries.map((entry) => (
    <div
      className="flex items-start justify-between gap-3 px-3 py-1 text-[0.72rem] text-muted-foreground"
      key={entry.id}
    >
      <span className="grid min-w-0 gap-0.5">
        <span>{entry.label}</span>
        {/* The scope line keeps the help honest about where each combo fires. */}
        <span className="text-[0.65rem] leading-4 opacity-80">
          {entry.scope}
        </span>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1">
        {entry.combos.map((combo) => (
          <kbd
            className="rounded-(--radius-field) bg-(--input) px-1.5 py-0.5 text-[0.65rem] font-medium text-foreground"
            key={combo}
          >
            {combo}
          </kbd>
        ))}
      </span>
    </div>
  ));

  return (
    <div
      data-job-finder-shell
      data-sidebar-collapsed={isSidebarCollapsed ? "true" : "false"}
      className={cn(
        "h-screen overflow-x-hidden overflow-y-auto text-foreground sm:overflow-hidden",
        `platform-${platform}`,
      )}
      style={
        {
          "--job-finder-side-width": isSidebarCollapsed ? "4rem" : "17rem",
          "--job-finder-side-width-sm": isSidebarCollapsed ? "4rem" : "17rem",
        } as CSSProperties
      }
    >
      <header
        data-job-finder-shell-header
        className="relative z-50 overflow-visible border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm sm:fixed sm:inset-x-0 sm:top-0 min-[1440px]:h-14"
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[3.5rem_auto_auto] items-stretch overflow-visible pl-2 pr-2 sm:grid-rows-[3.5rem_3.75rem] sm:pl-3 sm:pr-3 min-[1440px]:!grid-rows-[3.5rem]">
          <div
            className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center justify-between gap-3 gap-y-1 pl-2 pr-2 sm:pl-3 sm:pr-3"
            data-desktop-brand
            style={{
              ...dragRegionStyle,
              paddingInlineStart:
                isMac && !windowControlsState.isMaximized
                  ? "5.5rem"
                  : undefined,
            }}
          >
            <div
              className={cn(
                "flex min-w-0 flex-col",
                isSidebarCollapsed && "min-[1440px]:hidden",
              )}
            >
              <span
                className={cn(
                  "font-display text-[1.45rem] font-black leading-none tracking-[-0.08em] text-(var(--headline-primary)) max-[639px]:hidden sm:text-[2rem]",
                  isMac ? "xl:text-[2rem]" : "xl:text-[2rem]",
                )}
              >
                UNEMPLOYED
              </span>
              <span className="text-[0.72rem] uppercase tracking-(var(--tracking-caps)) text-muted-foreground sm:text-(length:var(--text-tiny))">
                Job Finder
              </span>
            </div>

            <nav
              aria-label="UnEmployed modules"
              className={cn(
                "hidden h-14 min-w-0 items-center justify-center",
                "min-[900px]:!absolute min-[900px]:inset-x-0 min-[900px]:top-0 min-[900px]:z-10 min-[900px]:flex",
              )}
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
                    {moduleName === "job-finder" ? (
                      // The current module is where the user already is: it
                      // must not be a focusable button that does nothing.
                      // aria-current carries the state; styling is unchanged.
                      <span
                        aria-current="page"
                        className="text-[14px] font-semibold tracking-(--tracking-badge) text-(--text-headline) sm:text-[15px]"
                      >
                        {formatStatusLabel(moduleName)}
                      </span>
                    ) : (
                      <button
                        aria-label="Open Interview Helper"
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate("/interview-helper");
                          } else {
                            void navigate("/interview-helper");
                          }
                        }}
                        className={cn(
                          "h-auto rounded-sm border-0 bg-transparent px-0 py-0 text-[14px] font-semibold tracking-(--tracking-badge) shadow-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[15px]",
                          "cursor-pointer hover:text-foreground",
                          "text-muted-foreground",
                        )}
                        type="button"
                      >
                        {formatStatusLabel(moduleName)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </nav>
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
            className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center justify-center overflow-visible px-1 sm:col-span-1 sm:col-start-1 sm:justify-start sm:pr-64 max-[899px]:pr-40 min-[1440px]:hidden"
            style={noDragRegionStyle}
          >
            <div
              className="relative flex w-full min-w-0 max-w-5xl flex-nowrap items-center gap-1 overflow-visible rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel) p-1 sm:gap-1.5"
              data-job-finder-compact-navigation
            >
              <div className="relative min-w-0 flex-1">
                <div
                  className="overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  data-job-finder-compact-navigation-scroll
                  onScroll={(event) => {
                    setCompactRouteScrollEdges(
                      readCompactRouteScrollEdges(event.currentTarget),
                    );
                  }}
                  ref={compactRouteScrollRef}
                >
                  <div
                    className="flex min-w-max flex-nowrap items-center gap-1 sm:gap-1.5"
                    data-job-finder-compact-navigation-content
                  >
                    {primaryScreens.map((screen) => (
                      <button
                        aria-current={
                          activeScreen === screen.id ? "page" : undefined
                        }
                        key={screen.id}
                        className={cn(
                          "inline-flex h-9 min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-(--radius-button) px-2 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:gap-2 sm:px-3 sm:text-[0.76rem]",
                          activeScreen === screen.id
                            ? "bg-accent text-accent-foreground"
                            : "",
                        )}
                        onClick={() => handleScreenChange(screen.id)}
                        onFocus={(event) => {
                          event.currentTarget.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                          });
                        }}
                        type="button"
                      >
                        <span className="shrink-0 whitespace-nowrap leading-tight">
                          {screen.label}
                        </span>
                        {screen.count !== null ? (
                          <ScreenCountBadge
                            className={NAV_PILL_COUNT_BADGE_CLASS}
                            count={screen.count}
                            kind={screen.countKind}
                          />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Edge fades assume LTR; the product ships LTR-only today. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-(--surface-panel) to-transparent",
                    compactRouteScrollEdges.start ? "opacity-100" : "opacity-0",
                  )}
                  data-job-finder-compact-navigation-fade-start
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-(--surface-panel) to-transparent",
                    compactRouteScrollEdges.end ? "opacity-100" : "opacity-0",
                  )}
                  data-job-finder-compact-navigation-fade-end
                />
              </div>
              <div className="relative z-10 shrink-0">
                <button
                  aria-expanded={isMoreOpen}
                  aria-label={`More${hiddenAttentionCount > 0 ? `: ${hiddenAttentionCount} need attention` : ""}`}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-(--radius-button) px-2.5 py-2 text-[0.72rem] font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-3 sm:text-[0.76rem] border border-(--surface-panel-border) bg-(--surface-panel-raised)",
                    menuGroups.some((group) =>
                      group.screens.some(
                        (screen) => activeScreen === screen.id,
                      ),
                    )
                      ? "bg-accent text-accent-foreground"
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
                  title="More"
                  type="button"
                >
                  <Layers3 aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">More</span>
                  {hiddenAttentionCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">
                      {hiddenAttentionCount}
                    </span>
                  ) : null}
                </button>
                {isMoreOpen
                  ? createPortal(
                      <div
                        aria-label="More"
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

                          // Roving order comes from the managed refs so the
                          // popover never needs menu semantics to stay
                          // keyboard-navigable.
                          const menuItems =
                            moreMenuItemRefs.current.filter(
                              (element): element is HTMLElement =>
                                element instanceof HTMLElement,
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
                        role="navigation"
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
                                  aria-label={getScreenAccessibleName(
                                    screen.label,
                                    screen.count,
                                    screen.countKind,
                                  )}
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
                                    <ScreenCountBadge
                                      className={NAV_PILL_COUNT_BADGE_CLASS}
                                      count={screen.count}
                                      kind={screen.countKind}
                                    />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        {isMoreMenuShortcutsCollapsed ? (
                          <details
                            className="mt-1 border-t border-(--surface-panel-border) pt-2"
                            data-job-finder-planning-shortcuts-disclosure
                            onToggle={(event) => {
                              setIsShortcutsDisclosureOpen(
                                event.currentTarget.open,
                              );
                            }}
                          >
                            <summary
                              aria-expanded={isShortcutsDisclosureOpen}
                              className="cursor-pointer list-none rounded-sm px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden"
                              onClick={(event) => {
                                // Activation behavior flips `open` after
                                // dispatch, so mirror the incoming state now;
                                // the async toggle event reconciles below.
                                const details =
                                  event.currentTarget.closest("details");
                                setIsShortcutsDisclosureOpen(
                                  !(details?.open ?? false),
                                );
                              }}
                              onFocus={() => setFocusedMoreMenuItemIndex(-1)}
                              ref={(element) => {
                                moreMenuItemRefs.current[moreMenuItemCount] =
                                  element;
                              }}
                              tabIndex={
                                focusedMoreMenuItemIndex === -1 ? 0 : -1
                              }
                            >
                              Shortcuts
                            </summary>
                            <div className="grid gap-1">{shortcutHelpRows}</div>
                          </details>
                        ) : (
                          <div
                            aria-label="Keyboard shortcuts"
                            className="mt-1 grid gap-1 border-t border-(--surface-panel-border) pt-2"
                            role="group"
                          >
                            <span className="px-3 pt-1 text-[0.65rem] font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                              Shortcuts
                            </span>
                            {shortcutHelpRows}
                          </div>
                        )}
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
              <a
                aria-label="Open Interview Helper"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-(--radius-button) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-2.5 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:text-[0.76rem] min-[900px]:hidden"
                href="#/interview-helper"
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  if (onNavigate) {
                    onNavigate("/interview-helper");
                  } else {
                    void navigate("/interview-helper");
                  }
                }}
              >
                Interview Helper
              </a>
            </div>
          </nav>

          <div
            aria-label="Notifications and actions"
            className={cn(
              "col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center gap-2 pr-2 max-[899px]:gap-1 max-[899px]:pr-1 sm:absolute sm:z-10 sm:w-auto sm:justify-end",
              isMac
                ? "sm:right-0 sm:top-14 sm:h-[3.75rem] min-[900px]:!top-0 min-[900px]:!h-14"
                : "sm:right-0 sm:top-14 sm:h-[3.75rem] min-[1440px]:!right-36 min-[1440px]:!top-0 min-[1440px]:!h-14 min-[1440px]:!z-40",
            )}
            role="group"
            style={noDragRegionStyle}
          >
            <button
              aria-keyshortcuts={getJobFinderAriaKeyshortcuts(
                "mod+k",
                platform,
              )}
              aria-label={JOB_FINDER_GLOBAL_SEARCH_LABEL}
              className="inline-flex h-10 min-h-10 min-w-10 items-center justify-center rounded-(--radius-button) border border-(--surface-panel-border) bg-(--surface-panel) px-2 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 max-[899px]:min-w-9 max-[899px]:px-1.5"
              onClick={openGlobalSearch}
              title={`${JOB_FINDER_GLOBAL_SEARCH_LABEL} (${formatJobFinderShortcutCombo("mod+k", platform)})`}
              type="button"
            >
              <Search aria-hidden="true" className="size-4 shrink-0" />
            </button>
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
              onStopTailoredDraftPreparation={onStopTailoredDraftPreparation}
              resumeImportProgress={resumeImportProgress}
              tailoredDraftPreparation={tailoredDraftPreparation}
              workspace={workspace}
            />
            {actionScreen ? (
              <button
                aria-current={activeScreen === "actions" ? "page" : undefined}
                aria-label={`Needs you: ${actionScreen.count ?? 0} unresolved`}
                className={cn(
                  "inline-flex h-10 min-h-10 min-w-10 items-center justify-center gap-2 rounded-(--radius-button) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-[0.72rem] font-medium text-muted-foreground outline-none transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:px-4 sm:text-[0.76rem] max-[899px]:gap-1 max-[899px]:px-2",
                  activeScreen === "actions"
                    ? "border-primary/55 bg-accent text-accent-foreground"
                    : "",
                )}
                onClick={() => handleScreenChange("actions")}
                type="button"
              >
                <BellRing aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden whitespace-nowrap min-[1440px]:inline">
                  Needs you
                </span>
                {(actionScreen.count ?? 0) > 0 ? (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">
                    {actionScreen.count}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <aside
        aria-label="Job Finder sidebar"
        className={cn(
          "fixed bottom-0 left-0 top-14 z-40 hidden w-(--job-finder-side-width) overflow-x-hidden overflow-y-auto border-r border-border/15 bg-(--shell-header-bg) min-[1440px]:block",
          isSidebarCollapsed ? "px-2 py-3" : "px-4 py-4",
        )}
        data-job-finder-sidebar
      >
        <div
          className={cn(
            "mb-1 flex h-10 shrink-0 items-center",
            isSidebarCollapsed ? "justify-center" : "justify-start",
          )}
          data-job-finder-sidebar-toggle
          style={{ ...noDragRegionStyle }}
        >
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                aria-keyshortcuts={getJobFinderAriaKeyshortcuts(
                  "mod+b",
                  platform,
                )}
                aria-label={
                  isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
                className="flex size-9 items-center justify-center rounded-(--radius-field) text-foreground-muted outline-none transition-colors hover:bg-(--surface-panel-raised) hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                onClick={toggleSidebar}
                type="button"
              >
                <Menu aria-hidden="true" className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side={isSidebarCollapsed ? "right" : "bottom"}>
              {`${isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} · ${formatJobFinderShortcutCombo("mod+b", platform)}`}
            </TooltipContent>
          </Tooltip>
        </div>
        <nav
          aria-label="Job Finder sidebar destinations"
          className={cn("grid min-w-0", isSidebarCollapsed ? "gap-2" : "gap-4")}
        >
          {sidebarGroups.map((group) => (
            <section key={group.label} className="grid min-w-0 gap-1">
              <h2
                className={cn(
                  "whitespace-nowrap px-2 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                  isSidebarCollapsed && "sr-only",
                )}
              >
                {group.label}
              </h2>
              <div className="grid min-w-0 gap-0.5 overflow-hidden">
                {group.screens.map((screen) => {
                  return (
                    <Tooltip delayDuration={0} key={screen.id}>
                      <TooltipTrigger asChild>
                        <button
                          aria-current={
                            activeScreen === screen.id ? "page" : undefined
                          }
                          aria-label={getScreenAccessibleName(
                            screen.label,
                            screen.count,
                            screen.countKind,
                          )}
                          className={cn(
                            "inline-flex min-h-9 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-(--radius-button) border-l-2 border-transparent px-2 py-1.5 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                            isSidebarCollapsed &&
                              "relative justify-center border-l-0 px-0 text-center",
                            activeScreen === screen.id
                              ? "border-l-primary bg-accent text-accent-foreground"
                              : "",
                          )}
                          onClick={() => handleScreenChange(screen.id)}
                          type="button"
                        >
                          <screen.icon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          <span
                            className={cn(
                              "min-w-0 truncate",
                              isSidebarCollapsed && "sr-only",
                            )}
                          >
                            {screen.label}
                          </span>
                          {screen.count !== null ? (
                            <ScreenCountBadge
                              className={cn(
                                "mr-1 ml-auto inline-flex h-5 min-w-7 shrink-0 items-center justify-end px-0 text-[0.65rem] tabular-nums",
                                isSidebarCollapsed &&
                                  "absolute bottom-0 right-0 mr-0 ml-0 h-4 min-w-4 justify-center rounded-full bg-(--input) px-1 text-[0.58rem]",
                                screen.id === "actions" && screen.count > 0
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-transparent text-foreground-muted",
                              )}
                              count={screen.count}
                              kind={screen.countKind}
                            />
                          ) : null}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {screen.label}
                      </TooltipContent>
                    </Tooltip>
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

      {isGlobalSearchOpen ? (
        <JobFinderGlobalSearchDialog
          entries={globalSearchEntries}
          focusRequest={globalSearchFocusRequest}
          onClose={() => setIsGlobalSearchOpen(false)}
          onNavigate={handleGlobalSearchNavigate}
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
        className="flex min-h-screen flex-col sm:h-full sm:min-h-0 sm:pt-[7.25rem] min-[1440px]:!pt-14 min-[1440px]:pl-(--job-finder-side-width)"
        data-job-finder-shell-content
      >
        <main
          aria-label={activeScreenLabel}
          className={cn(
            "flex-1 overflow-x-hidden outline-none",
            usesLockedScreenLayout
              ? "overflow-hidden px-2 pb-3 pt-0 sm:px-3 min-[1440px]:px-4"
              : "screen-scroll-area overflow-y-auto px-3 pb-10 pt-3 min-[1440px]:px-4",
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
            <StartupResetRecoveryBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
