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
  Keyboard,
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
import { countDiscoveryStrongMatches } from "../screens/discovery/discovery-result-groups";
import { buildJobFinderGlobalSearchEntries } from "../lib/build-job-finder-global-search-entries";
import type { JobFinderGlobalSearchEntry } from "../lib/job-finder-global-search";
import {
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
import { JobFinderShellBrand } from "./job-finder-shell-brand";
import {
  BoundedFloatingSurfaceScrollHint,
  boundedFloatingSurfaceStyle,
  useBoundedFloatingSurface,
  useBoundedFloatingSurfaceScrollState,
} from "./bounded-floating-surface";
import {
  JOB_FINDER_SHORTCUTS_DIALOG_LABEL,
  JobFinderShortcutsDialog,
} from "./job-finder-shortcuts-dialog";

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
  "rapid-review": "Quick review",
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

// The More menu's own preferred width, and the height it needs for seven
// destinations plus their group labels and the shortcuts entry. Supplying the
// desired height keeps the menu below its trigger whenever it genuinely fits
// there and only flips it upward when it does not.
// The main window is frameless on Windows (`frame: !(isMac || isWindows)` in
// main/setup/window-shell.ts) and this header paints its own caption buttons,
// so there is no Window Controls Overlay and no `env(titlebar-area-*)` to read.
// The reserved width is therefore the exact width of the buttons rendered
// below: minimize (w-11) + maximize (w-11) + close (w-12) = 8.5rem.
const WINDOWS_CAPTION_CONTROLS_INSET = "8.5rem";
// macOS uses `titleBarStyle: "hiddenInset"`, so the native traffic lights are
// painted over the left edge of this header outside native fullscreen.
const MACOS_TRAFFIC_LIGHT_INSET = "5.5rem";
const MORE_MENU_WIDTH_PX = 264;
const NO_GLOBAL_SEARCH_ENTRIES: readonly JobFinderGlobalSearchEntry[] = [];
const MORE_MENU_DESIRED_HEIGHT_PX = 440;

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

export const SIDEBAR_COLLAPSED_STORAGE_KEY =
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
  "ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-(--input) px-1.5 text-(length:--text-tiny) text-foreground";

export function getInitialSidebarCollapsedState(): boolean {
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
  const isWindows = platform === "win32";
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const [windowControlsState, setWindowControlsState] =
    useState<DesktopWindowControlsState>({
      isClosable: true,
      isFullScreen: false,
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
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  const [focusedMoreMenuItemIndex, setFocusedMoreMenuItemIndex] = useState(0);
  // Only the compact top navigation owns a More trigger now: the expanded
  // 17rem sidebar and the 4rem rail list every secondary destination inline,
  // so there is no second trigger for the popover to anchor to.
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuScrollRef = useRef<HTMLDivElement | null>(null);
  const moreMenuItemRefs = useRef<Array<HTMLElement | null>>([]);
  const moreMenuInitialFocusRef = useRef<"first" | "last">("first");
  const compactRouteScrollRef = useRef<HTMLDivElement | null>(null);
  const [compactRouteScrollEdges, setCompactRouteScrollEdges] =
    useState<CompactRouteScrollEdges>(NO_ROUTE_SCROLL_EDGES);
  // The palette index used to be rebuilt on every workspace commit even while
  // the palette was closed. It is only ever read by the open dialog, so it is
  // built on demand and stays a stable empty list the rest of the time.
  const globalSearchEntries = useMemo(
    () =>
      isGlobalSearchOpen
        ? buildJobFinderGlobalSearchEntries(workspace)
        : NO_GLOBAL_SEARCH_ENTRIES,
    [isGlobalSearchOpen, workspace],
  );

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
        // The badge counts the results actually worth opening. Adding the
        // weaker and clearly mismatched rows made the headline oversell a
        // search the app itself had already scored well below the targets.
        label: "Find jobs",
        count: toCountBadge(
          countDiscoveryStrongMatches(
            workspace.discoveryJobs.filter((job) => campaignJobIds.has(job.id)),
          ),
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
        // The default plan alone is not a count worth a badge; only extra
        // plans signal something the user chose.
        count: toCountBadge(
          (workspace.campaigns ?? []).length > 1
            ? (workspace.campaigns ?? []).length
            : 0,
        ),
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
  // Grouped by what each destination *is*, not by which part of the product
  // introduced it. Documents holds the user's own files and used to sit under
  // "Safety and setup"; Companies is a data browser and used to sit beside two
  // settings pages.
  // Order follows the declared id list rather than the order the definitions
  // happen to be built in, so the menu's reading order is the one written here.
  const selectMenuScreens = (ids: readonly JobFinderScreen[]) =>
    ids.flatMap((id) => screenDefinitions.filter((screen) => screen.id === id));
  const menuGroups = [
    {
      label: "Your data",
      screens: selectMenuScreens(["documents", "companies", "analytics"]),
    },
    {
      label: "Setup and safety",
      screens: selectMenuScreens([
        "campaigns",
        "resume-strategies",
        "safeguards",
        "settings",
      ]),
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
  // The sidebar leads with the journey. The reference and configuration
  // surfaces follow it inline under "Everything else": the 17rem rail has the
  // room, so hiding seven destinations behind a dropdown inside a persistent
  // navigation column only added a click and a second mental model. The
  // compact top navigation, which genuinely has no room, keeps its More menu.
  const sidebarGroups = [
    {
      label: "Your job search",
      screens: primaryScreens,
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

  // One bounded placement for the menu: it flips above its trigger when the
  // space below cannot hold it, shifts back inside the viewport horizontally,
  // and never claims more height than the window actually has.
  const moreMenuPlacement = useBoundedFloatingSurface({
    // The compact trigger opens leftward; alignment stays automatic so a
    // narrow window can still shift the surface back inside the viewport.
    alignment: "auto",
    desiredHeight: MORE_MENU_DESIRED_HEIGHT_PX,
    open: isMoreOpen,
    preferredWidth: MORE_MENU_WIDTH_PX,
    minWidth: 96,
    triggerRef: moreButtonRef,
  });

  const moreMenuScrollState = useBoundedFloatingSurfaceScrollState(
    moreMenuScrollRef,
    isMoreOpen,
    `${moreMenuItemCount}:${moreMenuPlacement?.maxHeight ?? 0}`,
  );

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }
    // The shortcuts entry is the trailing item at index `moreMenuItemCount`.
    const initialIndex =
      moreMenuInitialFocusRef.current === "last" ? moreMenuItemCount : 0;
    setFocusedMoreMenuItemIndex(initialIndex);
    const frame = requestAnimationFrame(() => {
      moreMenuItemRefs.current[initialIndex]?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isMoreOpen, moreMenuItemCount]);

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

  function openShortcutsDialog() {
    setIsMoreOpen(false);
    setIsShortcutsDialogOpen(true);
  }

  function handleGlobalSearchNavigate(entry: JobFinderGlobalSearchEntry) {
    if (onNavigate) {
      onNavigate(entry.href);
      return;
    }
    void navigate(entry.href);
  }

  // One row treatment for every sidebar destination, primary or secondary, so
  // the inline "Everything else" groups cannot drift from the journey rows.
  const SIDEBAR_GROUP_EYEBROW_CLASS = cn(
    "whitespace-nowrap px-2 text-(length:--text-eyebrow) uppercase tracking-(--tracking-caps) text-muted-foreground",
    isSidebarCollapsed && "sr-only",
  );
  const SIDEBAR_ROW_CLASS =
    "inline-flex min-h-9 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-(--radius-button) border-l-2 border-transparent px-2 py-1.5 text-left text-sm font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40";
  const SIDEBAR_ROW_COLLAPSED_CLASS =
    "relative justify-center border-l-0 px-0 text-center";
  // Exactly one count treatment for every sidebar row, primary or secondary: a
  // plain right-aligned tabular number with no fill. A per-kind chip made the
  // Companies count read as a selected block beside plain neighbours, and a
  // pale chip on the active fill previously dropped the digit to ~3.5:1.
  // Inheriting the row's own colour keeps the class string identical while the
  // active row still contrasts against its fill.
  const SIDEBAR_COUNT_CLASS =
    "mr-1 ml-auto inline-flex h-5 min-w-7 shrink-0 items-center justify-end bg-transparent px-0 text-(length:--text-tiny) text-current tabular-nums";
  // The collapsed rail has no room for an inline number, so every count moves
  // to the same corner marker — still one treatment, just a different state.
  const SIDEBAR_COLLAPSED_COUNT_CLASS =
    "absolute bottom-0 right-0 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-(--input) px-1 text-(length:--text-tiny) text-foreground tabular-nums";

  function renderSidebarDestination(screen: ShellScreenDefinition) {
    const isActive = activeScreen === screen.id;
    return (
      <Tooltip delayDuration={0} key={screen.id}>
        <TooltipTrigger asChild>
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={getScreenAccessibleName(
              screen.label,
              screen.count,
              screen.countKind,
            )}
            className={cn(
              SIDEBAR_ROW_CLASS,
              isSidebarCollapsed && SIDEBAR_ROW_COLLAPSED_CLASS,
              // Hover styling is scoped to inactive rows so it cannot wash the
              // selected fill back out. In the light theme a solid hover fill
              // read as a second selection, so hover is a translucent wash plus
              // a border tick: exactly one row is ever filled.
              isActive
                ? ""
                : "hover:border-l-(--border-strong) hover:bg-secondary/50 hover:text-foreground",
              // The selected destination needs a fill the eye separates from
              // the rail, not a 2px bar over a near-identical tint:
              // --nav-active-surface stays >=3:1 non-text against
              // --shell-header-bg in both themes, and the bolder label plus the
              // accent bar keep the state legible without relying on color.
              isActive
                ? "border-l-(--nav-active-bar) bg-(--nav-active-surface) font-semibold text-(--nav-active-foreground)"
                : "",
            )}
            onClick={() => handleScreenChange(screen.id)}
            type="button"
          >
            <screen.icon aria-hidden="true" className="size-4 shrink-0" />
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
                className={
                  isSidebarCollapsed
                    ? SIDEBAR_COLLAPSED_COUNT_CLASS
                    : SIDEBAR_COUNT_CLASS
                }
                count={screen.count}
                kind={screen.countKind}
              />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{screen.label}</TooltipContent>
      </Tooltip>
    );
  }

  useJobFinderShellShortcuts({
    isOverlayOpen: isMoreOpen || isGlobalSearchOpen || isShortcutsDialogOpen,
    isSearchOpen: isGlobalSearchOpen,
    onOpenGlobalSearch: openGlobalSearch,
    onOpenShortcuts: openShortcutsDialog,
    onToggleSidebar: toggleSidebar,
  });

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
            className={cn(
              // Three header regions on one row: wordmark left, module
              // switcher centred, native window-control inset right. The two
              // side tracks are `minmax(0,1fr)`, so they are always exactly
              // equal and the middle track sits on the window centre line —
              // never absolute positioning, which fought the macOS
              // traffic-light inset and the right-hand utilities.
              "col-start-1 row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-6",
              // At the wide layout column 1 is the 17rem sidebar column. The
              // wordmark fits there; the wordmark plus the module switcher does
              // not, and it wrapped onto a second line that spilled out of the
              // 3.5rem header and under the page title. The brand row therefore
              // spans the sidebar column and the content column (col-end-3,
              // never the col-span shorthand, which would reset col-start) so
              // the switcher stays on one line in the top bar, exactly as it
              // does at compact widths.
              "min-[1440px]:col-end-3",
            )}
            data-desktop-brand
            style={{
              ...dragRegionStyle,
              // Keep clear of visible macOS traffic lights in normal and
              // maximized windows, then reclaim the space in native fullscreen.
              // The same reserve is mirrored on the trailing edge so reserving
              // it cannot push the centred middle track off the window centre.
              paddingInlineStart:
                isMac && !windowControlsState.isFullScreen
                  ? MACOS_TRAFFIC_LIGHT_INSET
                  : undefined,
              paddingInlineEnd:
                isMac && !windowControlsState.isFullScreen
                  ? MACOS_TRAFFIC_LIGHT_INSET
                  : undefined,
            }}
          >
            <div
              className="col-start-1 flex min-w-0 items-center justify-self-start"
              data-desktop-brand-region
            >
              <JobFinderShellBrand />
            </div>

            <nav
              aria-label="UnEmployed modules"
              className={cn(
                "col-start-2 hidden h-14 items-center justify-center justify-self-center",
                // The switcher owns the centre track: it is sized by its
                // content (`auto`), so the two side regions give way first and
                // it never wraps or runs under the page title.
                "min-[900px]:flex",
              )}
              data-desktop-module-navigation
              style={dragRegionStyle}
            >
              <div
                className="flex flex-nowrap items-center gap-6"
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
                        className="whitespace-nowrap text-[14px] font-semibold tracking-(--tracking-badge) text-(--text-headline) sm:text-[15px]"
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
                          "h-auto whitespace-nowrap rounded-sm border-0 bg-transparent px-0 py-0 text-[14px] font-semibold tracking-(--tracking-badge) shadow-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:text-[15px]",
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

            {/* Trailing region. Windows paints its caption buttons over this
                edge (the window is frameless, so there is no Window Controls
                Overlay to measure); reserving their exact width here keeps
                header content out from under them without moving the centred
                switcher, because the reserve lives inside the right track
                rather than as padding on the row. */}
            <div
              aria-hidden="true"
              className="col-start-3 min-w-0 justify-self-end"
              data-desktop-header-window-control-inset
              style={{
                ...dragRegionStyle,
                inlineSize: isWindows
                  ? WINDOWS_CAPTION_CONTROLS_INSET
                  : undefined,
              }}
            />
          </div>

          <div
            className="absolute right-0 top-0 z-40 flex h-14 items-stretch justify-end"
            style={dragRegionStyle}
          >
            {isWindows ? (
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
            // The destination card is centred on the same axis as the module
            // switcher above it instead of hugging the left edge. The
            // notification/action group is absolutely positioned over this
            // row, so its reserved width has to grow with the labels it shows
            // and the card centres inside whatever space is left: on macOS
            // that group moves up to the header row at >=900px, so this row is
            // free and the card lands on the true window centre. Elsewhere the
            // group stays here until 1440px, and reserving it on both sides
            // would squeeze the card into a scroller at the 1024px minimum, so
            // the trailing reserve is kept one-sided and the card centres in
            // the remaining width rather than clipping or wrapping.
            className={cn(
              "col-span-2 col-start-1 row-start-2 flex min-w-0 items-center justify-center overflow-visible sm:col-span-1 sm:col-start-1 sm:justify-center min-[1440px]:hidden",
              isMac
                ? "sm:pr-64 max-[899px]:pr-40 min-[900px]:pr-0"
                : "sm:pr-64 max-[899px]:pr-40 min-[900px]:pr-80",
            )}
            style={noDragRegionStyle}
          >
            <div
              className="relative flex w-fit min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-visible rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel) p-1 sm:gap-1.5"
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
                          "inline-flex h-9 min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-(--radius-button) border-b-2 border-transparent px-2 py-2 text-(length:--text-small) font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:gap-2 sm:px-3",
                          // The compact row used --accent, which sits at
                          // 1.16-1.27:1 on the nav bar and cannot be told from
                          // a hovered neighbour. It now uses the same
                          // --nav-active-surface treatment the sidebar adopted,
                          // plus a bar and a bolder label so the state does not
                          // rest on colour alone.
                          activeScreen === screen.id
                            ? "border-b-(--nav-active-bar) bg-(--nav-active-surface) font-semibold text-(--nav-active-foreground)"
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
                    "inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-(--radius-button) px-2.5 py-2 text-(length:--text-small) font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 sm:gap-2 sm:px-3 border border-(--control-border) bg-(--surface-panel-raised)",
                    menuGroups.some((group) =>
                      group.screens.some(
                        (screen) => activeScreen === screen.id,
                      ),
                    )
                      ? "border-(--nav-active-bar) bg-(--nav-active-surface) font-semibold text-(--nav-active-foreground)"
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
                  {/* An icon-only control gave compact widths no readable
                      label; the accessible name still comes from aria-label. */}
                  <span
                    className="whitespace-nowrap leading-tight"
                    data-job-finder-compact-more-label
                  >
                    More
                  </span>
                  {hiddenAttentionCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-(length:--text-tiny) text-primary-foreground">
                      {hiddenAttentionCount}
                    </span>
                  ) : null}
                </button>
                {isMoreOpen
                  ? createPortal(
                      <div
                        aria-label="More"
                        className="fixed z-[60] grid min-w-0 max-w-[calc(100vw-1rem)] grid-rows-[minmax(0,1fr)_auto] gap-1 overflow-hidden rounded-2xl border border-(--control-border) bg-(--surface-panel-raised) p-2 shadow-xl"
                        data-job-finder-more-menu
                        data-side={moreMenuPlacement?.side ?? "bottom"}
                        style={boundedFloatingSurfaceStyle(moreMenuPlacement)}
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
                          const menuItems = moreMenuItemRefs.current.filter(
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
                        {/* The scroll row has to be a *bounded* box, not just
                            a `min-h-0` block: a plain block child sizes to its
                            content, so at short window heights the destination
                            list grew past this row, was clipped by the surface,
                            and painted across the footer entry — Settings and
                            Keyboard shortcuts overlapped and neither was
                            hittable. `grid-rows-[minmax(0,1fr)]` pins the
                            region to the row the surface actually has, which is
                            what makes `overflow-y-auto` below engage. */}
                        <div className="relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
                          <div
                            className="min-h-0 min-w-0 overflow-y-auto overscroll-contain"
                            data-job-finder-more-menu-scroll-region
                            ref={moreMenuScrollRef}
                          >
                            {menuGroups.map((group) => (
                              <div
                                key={group.label}
                                className="grid gap-1"
                                role="group"
                                aria-label={group.label}
                              >
                                <span className="px-3 pt-1 text-(length:--text-tiny) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
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
                                        "inline-flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-(length:--text-small) font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 max-[899px]:min-h-8 max-[899px]:py-1",
                                        activeScreen === screen.id
                                          ? "bg-secondary text-foreground"
                                          : "",
                                      )}
                                      onClick={() => {
                                        setIsMoreOpen(false);
                                        handleScreenChange(screen.id);
                                      }}
                                      onFocus={() =>
                                        setFocusedMoreMenuItemIndex(
                                          menuItemIndex,
                                        )
                                      }
                                      ref={(element) => {
                                        moreMenuItemRefs.current[
                                          menuItemIndex
                                        ] = element;
                                      }}
                                      tabIndex={
                                        menuItemIndex ===
                                        focusedMoreMenuItemIndex
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
                          </div>
                          {/* Hints sit at the edge they describe; the previous
                            affordance printed "More content above ↑" in the
                            popover's bottom footer. */}
                          <BoundedFloatingSurfaceScrollHint
                            edge="start"
                            visible={
                              moreMenuScrollState.hasOverflow &&
                              !moreMenuScrollState.atStart
                            }
                          />
                          <BoundedFloatingSurfaceScrollHint
                            edge="end"
                            visible={
                              moreMenuScrollState.hasOverflow &&
                              !moreMenuScrollState.atEnd
                            }
                          />
                        </div>
                        {/* Reference material, not a destination: one row that
                            opens the shortcuts dialog, instead of the ~270px
                            shortcut table that stopped this menu from showing
                            its own destinations. */}
                        <button
                          className="inline-flex min-h-10 min-w-0 shrink-0 items-center justify-between gap-3 rounded-xl border-t border-(--surface-panel-border) px-3 py-2 text-left text-(length:--text-small) font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          data-job-finder-more-menu-shortcuts-entry
                          onClick={openShortcutsDialog}
                          onFocus={() =>
                            setFocusedMoreMenuItemIndex(moreMenuItemCount)
                          }
                          ref={(element) => {
                            moreMenuItemRefs.current[moreMenuItemCount] =
                              element;
                          }}
                          tabIndex={
                            focusedMoreMenuItemIndex === moreMenuItemCount
                              ? 0
                              : -1
                          }
                          type="button"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Keyboard
                              aria-hidden="true"
                              className="size-4 shrink-0"
                            />
                            <span className="truncate">
                              {JOB_FINDER_SHORTCUTS_DIALOG_LABEL}
                            </span>
                          </span>
                          <kbd className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-(--radius-field) border border-(--surface-panel-border) bg-(--input) px-1.5 py-0.5 text-(length:--text-tiny) font-medium text-foreground">
                            ?
                          </kbd>
                        </button>
                      </div>,
                      document.body,
                    )
                  : null}
              </div>
              <a
                aria-label="Open Interview Helper"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-(--radius-button) border border-(--control-border) bg-(--surface-panel-raised) px-2.5 py-2 text-(length:--text-small) font-medium text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-9 min-[900px]:hidden"
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
              "col-span-2 col-start-1 row-start-3 flex min-w-0 items-center justify-center gap-1.5 pr-2 max-[899px]:gap-1 max-[899px]:pr-1 sm:absolute sm:z-10 sm:w-auto sm:justify-end min-[1440px]:gap-2",
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
              className="inline-flex h-10 min-h-10 min-w-10 items-center justify-center rounded-(--radius-button) border border-(--control-border) bg-(--surface-panel) px-2 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 max-[899px]:min-w-9 max-[899px]:px-1.5"
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
                  "inline-flex h-10 min-h-10 min-w-10 items-center justify-center gap-2 rounded-(--radius-button) border border-(--control-border) bg-(--surface-panel) px-2.5 py-2 text-(length:--text-small) font-medium text-muted-foreground outline-none transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 min-[1440px]:px-3 max-[899px]:gap-1 max-[899px]:px-2",
                  activeScreen === "actions"
                    ? "border-(--nav-active-bar) bg-(--nav-active-surface) font-semibold text-(--nav-active-foreground)"
                    : "",
                )}
                onClick={() => handleScreenChange("actions")}
                title={`Needs you: ${actionScreen.count ?? 0} unresolved`}
                type="button"
              >
                <BellRing aria-hidden="true" className="size-4 shrink-0" />
                {/* A bare bell and a number read as an unlabelled glyph pill
                    beside the task-center pill. The compact navigation row
                    reserves the width this label needs. */}
                <span className="hidden whitespace-nowrap min-[900px]:inline">
                  Needs you
                </span>
                {(actionScreen.count ?? 0) > 0 ? (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-(length:--text-tiny) text-primary-foreground">
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
        // The rail owns its own vertical scrolling: at short window heights the
        // journey plus every secondary destination is taller than the column,
        // and a clipped rail hides real destinations. `overflow-hidden` here
        // keeps the pinned toggle row out of that inner scroller.
        className="fixed bottom-0 left-0 top-14 z-40 hidden w-(--job-finder-side-width) overflow-hidden border-r border-border/15 bg-(--shell-header-bg) min-[1440px]:block"
        data-job-finder-sidebar
      >
        <div
          className={cn(
            "flex h-full min-h-0 flex-col",
            isSidebarCollapsed ? "px-2 py-3" : "px-4 py-4",
          )}
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
            className={cn(
              // `content-start` keeps the grid rows at their own height once the
              // nav becomes the flexible scroll owner, so a short list is not
              // stretched down the column.
              "grid min-h-0 min-w-0 flex-1 content-start overflow-x-hidden overflow-y-auto overscroll-contain",
              isSidebarCollapsed ? "gap-2" : "gap-4",
            )}
            data-job-finder-sidebar-scroll-region
          >
            {sidebarGroups.map((group) => (
              <section
                key={group.label}
                aria-label={group.label}
                className="grid min-w-0 gap-1"
                role="group"
              >
                <span
                  className={cn(SIDEBAR_GROUP_EYEBROW_CLASS, "font-semibold")}
                >
                  {group.label}
                </span>
                <div className="grid min-w-0 gap-0.5 overflow-hidden">
                  {group.screens.map((screen) =>
                    renderSidebarDestination(screen),
                  )}
                </div>
              </section>
            ))}
            <section
              aria-label="Everything else"
              className={cn(
                "grid min-w-0",
                isSidebarCollapsed ? "gap-2" : "gap-3",
              )}
              data-job-finder-sidebar-secondary
              role="group"
            >
              <span
                className={cn(SIDEBAR_GROUP_EYEBROW_CLASS, "font-semibold")}
              >
                Everything else
              </span>
              {menuGroups.map((group) => (
                <div
                  key={group.label}
                  aria-label={group.label}
                  className="grid min-w-0 gap-1"
                  role="group"
                >
                  <span
                    className={cn(SIDEBAR_GROUP_EYEBROW_CLASS, "font-medium")}
                  >
                    {group.label}
                  </span>
                  <div className="grid min-w-0 gap-0.5 overflow-hidden">
                    {group.screens.map((screen) =>
                      renderSidebarDestination(screen),
                    )}
                  </div>
                </div>
              ))}
              <div className="grid min-w-0 gap-0.5 overflow-hidden">
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      aria-keyshortcuts={getJobFinderAriaKeyshortcuts(
                        "?",
                        platform,
                      )}
                      aria-label={JOB_FINDER_SHORTCUTS_DIALOG_LABEL}
                      className={cn(
                        SIDEBAR_ROW_CLASS,
                        isSidebarCollapsed && SIDEBAR_ROW_COLLAPSED_CLASS,
                        "hover:border-l-(--border-strong) hover:bg-secondary/50 hover:text-foreground",
                      )}
                      data-job-finder-sidebar-shortcuts-entry
                      onClick={openShortcutsDialog}
                      type="button"
                    >
                      <Keyboard
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          isSidebarCollapsed && "sr-only",
                        )}
                      >
                        {JOB_FINDER_SHORTCUTS_DIALOG_LABEL}
                      </span>
                      {isSidebarCollapsed ? null : (
                        <kbd className="mr-1 ml-auto inline-flex min-w-6 shrink-0 items-center justify-center rounded-(--radius-field) border border-(--surface-panel-border) bg-(--input) px-1.5 py-0.5 text-(length:--text-tiny) font-medium text-foreground">
                          ?
                        </kbd>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {JOB_FINDER_SHORTCUTS_DIALOG_LABEL}
                  </TooltipContent>
                </Tooltip>
              </div>
            </section>
          </nav>
        </div>
      </aside>

      {saveState && onRetrySave ? (
        <JobFinderSaveStatus
          layoutKey={location.pathname}
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

      <JobFinderShortcutsDialog
        onClose={() => setIsShortcutsDialogOpen(false)}
        open={isShortcutsDialogOpen}
        platform={platform}
      />

      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {routeAnnouncement}
      </span>

      {/* Content passes under the fixed header with no seam, so a title or a
          card sitting at the boundary paints sliced through its glyphs. A
          short fade in the header's own colour ends the page there instead. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-[7.25rem] z-30 hidden h-4 bg-gradient-to-b from-(--shell-header-bg) to-transparent sm:block min-[1440px]:top-14 min-[1440px]:left-(--job-finder-side-width)"
        data-job-finder-shell-header-mask
      />
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
              usesLockedScreenLayout ? "h-full min-h-0" : "min-h-full",
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
