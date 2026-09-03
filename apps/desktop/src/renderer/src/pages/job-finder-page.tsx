import {
  getInitialSidebarCollapsedState,
  JobFinderShell,
} from "@renderer/features/job-finder/components/job-finder-shell";
import { JobFinderShellBrand } from "@renderer/features/job-finder/components/job-finder-shell-brand";
import { StartupDatabaseRecoveryNotice } from "@renderer/features/job-finder/components/startup-database-recovery-notice";
import { ThemeProvider } from "@renderer/app/theme-provider";
import { Button } from "@renderer/components/ui/button";
import { useModalFocusTrap } from "@renderer/features/job-finder/components/profile/use-modal-focus-trap";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Compass,
  FileText,
  House,
  Layers3,
  Menu,
  Minus,
  Settings,
  ShieldCheck,
  Square,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import type { DesktopWindowControlsState } from "@unemployed/contracts";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { buildJobFinderStartupDatabaseRecoveryBlockedDetail } from "../../../shared/job-finder-startup-db-recovery";
import { WorkspaceStateScreen } from "./job-finder-page-routes";
import { jobFinderPendingActions } from "./job-finder-pending-actions";
import { JobFinderUnsavedChangesDialog } from "./job-finder-unsaved-changes-dialog";
import { JobFinderWindowCloseGuard } from "./job-finder-window-close-guard";
import {
  type ApplyCopilotVisualCheckpointRequest,
  useJobFinderPageController,
} from "./use-job-finder-page-controller";

export {
  JobFinderActionsRoute,
  JobFinderAnalyticsRoute,
  JobFinderApplicationsRoute,
  JobFinderCampaignsRoute,
  JobFinderCompaniesRoute,
  JobFinderCompanyDetailRoute,
  JobFinderDiscoveryRoute,
  JobFinderDocumentsRoute,
  JobFinderHomeRoute,
  JobFinderProfileRoute,
  JobFinderProfileSetupRoute,
  JobFinderResumeStrategiesRoute,
  JobFinderRouteErrorBoundary,
  JobFinderResumeWorkspaceRoute,
  JobFinderReviewQueueRoute,
  JobFinderSafeguardsRoute,
  JobFinderSettingsRoute,
} from "./job-finder-page-routes";
export type { JobFinderPageContext } from "./job-finder-page-context";

/**
 * Exactly one window-close responder stays mounted across every render state
 * of this page (loading, both post-ready error branches, loaded shell). It is
 * always the stable first child of the returned tree, so React preserves its
 * subscription and any parked close dialog across branch switches instead of
 * tearing the handshake down mid-decision.
 */
function withJobFinderWindowCloseGuard(content: ReactNode): ReactNode {
  return (
    <>
      <JobFinderWindowCloseGuard />
      {content}
    </>
  );
}

function markJobFinderTiming(markName: string, startMarkName?: string) {
  const performanceApi = globalThis.performance;
  if (!performanceApi?.mark) {
    return;
  }

  performanceApi.mark(markName);
  if (startMarkName && performanceApi.measure) {
    try {
      performanceApi.measure(markName, startMarkName, markName);
    } catch {
      // Performance diagnostics must never affect rendering or navigation.
    }
  }
}

function measureFromLatestJobFinderMark(
  measureName: string,
  startMarkName: string,
  endMarkName: string,
) {
  const performanceApi = globalThis.performance;
  if (!performanceApi?.getEntriesByName || !performanceApi.measure) {
    return;
  }

  const starts = performanceApi.getEntriesByName(startMarkName);
  const ends = performanceApi.getEntriesByName(endMarkName);
  const start = starts.at(-1);
  const end = ends.at(-1);
  if (!start || !end) {
    return;
  }

  try {
    performanceApi.measure(measureName, {
      start: start.startTime,
      end: end.startTime,
    });
  } catch {
    // Performance diagnostics must never affect rendering or navigation.
  }
}

function JobFinderRouteReadyMarker() {
  const location = useLocation();

  useEffect(() => {
    const routePath = location.pathname;
    const routeMark = `job-finder:route:${routePath}:meaningful-paint`;
    markJobFinderTiming(
      routeMark,
      `job-finder:route:${routePath}:navigation-start`,
    );
  }, [location.pathname]);

  return null;
}

const openingShellDestinations = [
  { icon: House, label: "Home", path: "/job-finder/home" },
  { icon: UserRound, label: "Profile", path: "/job-finder/profile" },
  { icon: Compass, label: "Find jobs", path: "/job-finder/discovery" },
  {
    icon: ClipboardCheck,
    label: "Shortlisted",
    path: "/job-finder/review-queue",
  },
  {
    icon: FileText,
    label: "Applications",
    path: "/job-finder/applications",
  },
] as const;

const openingShellSidebarGroups: readonly {
  label: string;
  destinations: readonly {
    icon: LucideIcon;
    label: string;
    path: string;
  }[];
}[] = [
  {
    label: "Overview",
    destinations: [openingShellDestinations[0]],
  },
  {
    label: "Your job search",
    destinations: openingShellDestinations.slice(1),
  },
  // Same grouping as the loaded shell's More menu: grouped by what each
  // destination is, so the opening skeleton does not teach a different map.
  {
    label: "Your data",
    destinations: [
      {
        icon: FileText,
        label: "Documents",
        path: "/job-finder/documents",
      },
      {
        icon: Building2,
        label: "Companies",
        path: "/job-finder/companies",
      },
      {
        icon: BarChart3,
        label: "Outcomes",
        path: "/job-finder/analytics",
      },
    ],
  },
  {
    label: "Setup and safety",
    destinations: [
      {
        icon: Layers3,
        label: "Search plans",
        path: "/job-finder/campaigns",
      },
      {
        icon: Layers3,
        label: "Resume approaches",
        path: "/job-finder/resume-strategies",
      },
      {
        icon: ShieldCheck,
        label: "Safeguards",
        path: "/job-finder/safeguards",
      },
      {
        icon: Settings,
        label: "Settings",
        path: "/job-finder/settings",
      },
    ],
  },
];

function readInitialDesktopPlatform(): "darwin" | "linux" | "win32" | null {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("mac") || userAgent.includes("macintosh")) {
    return "darwin";
  }
  if (platform.includes("win") || userAgent.includes("windows")) {
    return "win32";
  }
  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }
  return null;
}

function getOpeningRouteLabel(pathname: string): string {
  return (
    openingShellSidebarGroups
      .flatMap((group) => group.destinations)
      .find((destination) => pathname.startsWith(destination.path))?.label ??
    "Home"
  );
}

function isOpeningDestinationActive(
  pathname: string,
  destinationPath: string,
): boolean {
  if (
    destinationPath === "/job-finder/home" &&
    (pathname === "/job-finder" || pathname === "/job-finder/")
  ) {
    return true;
  }
  return pathname.startsWith(destinationPath);
}

function JobFinderOpeningShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<"darwin" | "linux" | "win32" | null>(
    readInitialDesktopPlatform,
  );
  const [windowControlsState, setWindowControlsState] =
    useState<DesktopWindowControlsState>({
      isClosable: true,
      isFullScreen: false,
      isMaximized: false,
      isMinimizable: true,
    });
  const [isSidebarCollapsed] = useState(getInitialSidebarCollapsedState);

  useLayoutEffect(() => {
    markJobFinderTiming("job-finder:opening-shell:committed");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.unemployed
      .ping()
      .then((response) => {
        if (!cancelled) {
          setPlatform(response.platform);
        }
      })
      .catch(() => {
        // The workspace owner reports bootstrap errors; the opening header
        // simply keeps a neutral, inset-free platform state until then.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const windowBridge = window.unemployed.window;
    if (
      !windowBridge ||
      typeof windowBridge.onControlsStateChange !== "function" ||
      typeof windowBridge.getControlsState !== "function"
    ) {
      return;
    }
    let cancelled = false;
    const unsubscribe = windowBridge.onControlsStateChange((state) => {
      if (!cancelled) {
        setWindowControlsState(state);
      }
    });
    void windowBridge
      .getControlsState()
      .then((state) => {
        if (!cancelled) {
          setWindowControlsState(state);
        }
      })
      .catch(() => {
        // The native controls retain their safe default state while opening.
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isMac = platform === "darwin";
  const isWindows = platform === "win32";
  const openingRouteLabel = getOpeningRouteLabel(location.pathname);
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

  async function runWindowAction(
    action: () => Promise<typeof windowControlsState>,
  ): Promise<void> {
    try {
      setWindowControlsState(await action());
    } catch {
      // Keep the opening shell usable if a native window action fails.
    }
  }

  return (
    <div
      className={`platform-${platform ?? "unknown"} h-screen overflow-hidden bg-canvas text-foreground`}
      data-job-finder-shell
      data-job-finder-opening-shell
      style={
        {
          "--job-finder-side-width": isSidebarCollapsed ? "4rem" : "17rem",
        } as CSSProperties
      }
    >
      <header
        className="fixed inset-x-0 top-0 z-50 overflow-visible border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm min-[1440px]:h-14"
        data-job-finder-shell-header
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[3.5rem_3.75rem] items-stretch overflow-visible px-3 min-[1440px]:!grid-rows-[3.5rem]">
          {/* Mirrors the shell header: wordmark left, module switcher centred
              in an `auto` middle track between two equal `minmax(0,1fr)` side
              tracks, native window-control inset right. Centring through the
              grid rather than absolute positioning is what keeps the switcher
              off the macOS traffic lights and the Windows caption buttons. */}
          <div
            className="col-start-1 row-start-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-6 px-3"
            data-desktop-brand
            style={
              {
                WebkitAppRegion: "drag",
                // Reserve visible macOS traffic lights while opening, but
                // reclaim their space in native fullscreen. The trailing edge
                // mirrors the reserve so it cannot shift the centred track.
                paddingInlineStart:
                  isMac && !windowControlsState.isFullScreen
                    ? "5.5rem"
                    : undefined,
                paddingInlineEnd:
                  isMac && !windowControlsState.isFullScreen
                    ? "5.5rem"
                    : undefined,
              } as CSSProperties
            }
          >
            <div
              className="col-start-1 flex min-w-0 items-center justify-self-start"
              data-desktop-brand-region
            >
              <JobFinderShellBrand />
            </div>
            <nav
              aria-label="UnEmployed modules"
              className="col-start-2 hidden h-14 items-center justify-center justify-self-center min-[900px]:flex"
              data-desktop-module-navigation
              style={dragRegionStyle}
            >
              <div
                className="flex flex-nowrap items-center gap-6"
                style={noDragRegionStyle}
              >
                <span
                  aria-current="page"
                  className="whitespace-nowrap text-[15px] font-semibold tracking-(--tracking-badge) text-(--text-headline)"
                >
                  Job Finder
                </span>
                <span aria-hidden="true" className="h-4 w-px bg-border/50" />
                <a
                  className="whitespace-nowrap text-[15px] font-semibold tracking-(--tracking-badge) text-muted-foreground hover:text-foreground"
                  href="#/interview-helper"
                >
                  Interview Helper
                </a>
              </div>
            </nav>
            <div
              aria-hidden="true"
              className="col-start-3 min-w-0 justify-self-end"
              data-desktop-header-window-control-inset
              style={
                {
                  WebkitAppRegion: "drag",
                  inlineSize: isWindows ? "8.5rem" : undefined,
                } as CSSProperties
              }
            />
          </div>

          {isWindows ? (
            <div
              aria-label="Window controls"
              className="absolute right-0 top-0 z-40 flex h-14 items-stretch"
              role="group"
              style={noDragRegionStyle}
            >
              <Button
                aria-label="Minimize window"
                className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
                disabled={!windowControlsState.isMinimizable}
                onClick={() => {
                  void runWindowAction(() =>
                    window.unemployed.window.minimize(),
                  );
                }}
                type="button"
                variant="ghost"
              >
                <Minus aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                aria-label={
                  windowControlsState.isMaximized
                    ? "Restore window"
                    : "Maximize window"
                }
                className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
                onClick={() => {
                  void runWindowAction(() =>
                    window.unemployed.window.toggleMaximize(),
                  );
                }}
                type="button"
                variant="ghost"
              >
                <Square aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                aria-label="Close window"
                className="h-full w-12 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--button-close-hover) hover:text-primary-foreground"
                disabled={!windowControlsState.isClosable}
                onClick={() => {
                  void window.unemployed.window.close();
                }}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          ) : null}

          <nav
            aria-label="Job Finder sections"
            // Centred on the same axis as the module switcher above, exactly
            // as the loaded shell centres its destination card.
            className="col-start-1 row-start-2 mx-auto flex w-fit min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel) p-1 min-[1440px]:hidden"
            style={noDragRegionStyle}
          >
            {openingShellDestinations.map((destination) => (
              <Button
                aria-current={
                  isOpeningDestinationActive(
                    location.pathname,
                    destination.path,
                  )
                    ? "page"
                    : undefined
                }
                className="h-9 shrink-0 px-3 text-(length:--text-small)"
                key={destination.path}
                onClick={() => {
                  void navigate(destination.path);
                }}
                type="button"
                variant={
                  isOpeningDestinationActive(
                    location.pathname,
                    destination.path,
                  )
                    ? "secondary"
                    : "ghost"
                }
              >
                {destination.label}
              </Button>
            ))}
          </nav>
        </div>
      </header>

      <aside
        aria-label="Job Finder sidebar"
        className="fixed bottom-0 left-0 top-14 z-40 hidden w-(--job-finder-side-width) overflow-hidden border-r border-border/15 bg-(--shell-header-bg) min-[1440px]:block"
        data-job-finder-sidebar
      >
        <div
          className={`flex h-full min-h-0 flex-col ${isSidebarCollapsed ? "px-2 py-3" : "px-4 py-4"}`}
        >
          <div
            className={`mb-1 flex h-10 shrink-0 items-center text-muted-foreground ${isSidebarCollapsed ? "justify-center" : "px-2"}`}
          >
            <Menu aria-hidden="true" className="size-5" />
          </div>
          <nav
            aria-label="Job Finder sidebar destinations"
            className={`grid min-h-0 flex-1 content-start overflow-x-hidden overflow-y-auto overscroll-contain ${isSidebarCollapsed ? "gap-2" : "gap-4"}`}
            data-job-finder-sidebar-scroll-region
            style={noDragRegionStyle}
          >
            {openingShellSidebarGroups.map((group) => (
              <section
                aria-label={group.label}
                className="grid gap-1"
                key={group.label}
                role="group"
              >
                {/* An eyebrow is never a heading tag: the sidebar group labels
                  are 11px eyebrows, so they must not enter the heading
                  outline ahead of the route's own h1. */}
                <span
                  className={`px-2 text-(length:--text-eyebrow) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground ${isSidebarCollapsed ? "sr-only" : ""}`}
                >
                  {group.label}
                </span>
                <div className="grid gap-0.5">
                  {group.destinations.map((destination) => (
                    <button
                      aria-current={
                        isOpeningDestinationActive(
                          location.pathname,
                          destination.path,
                        )
                          ? "page"
                          : undefined
                      }
                      className={`inline-flex min-h-9 items-center gap-2 rounded-(--radius-button) border-l-2 px-2 py-1.5 text-left text-sm font-medium ${isSidebarCollapsed ? "justify-center border-l-0 px-0" : ""} ${
                        isOpeningDestinationActive(
                          location.pathname,
                          destination.path,
                        )
                          ? "border-l-primary bg-accent text-accent-foreground"
                          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                      key={destination.path}
                      onClick={() => {
                        void navigate(destination.path);
                      }}
                      type="button"
                    >
                      <destination.icon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span className={isSidebarCollapsed ? "sr-only" : ""}>
                        {destination.label}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </div>
      </aside>

      <div
        className="flex min-h-screen flex-col pt-[7.25rem] min-[1440px]:pt-14 min-[1440px]:pl-(--job-finder-side-width)"
        data-job-finder-shell-content
      >
        <main
          aria-busy="true"
          aria-label={`Opening ${openingRouteLabel}`}
          className="flex-1 overflow-hidden px-3 pb-10 pt-3 min-[1440px]:px-4"
        >
          <div className="mx-auto grid w-full max-w-472 gap-5">
            <div
              aria-atomic="true"
              aria-live="polite"
              className="grid gap-1"
              role="status"
            >
              <h1>{openingRouteLabel}</h1>
              <p className="text-muted-foreground">
                {openingRouteLabel === "Home"
                  ? "See progress, open tasks, and the best next step."
                  : `Opening your saved ${openingRouteLabel.toLowerCase()} workspace.`}
              </p>
              <div className="mt-3 flex min-h-8 items-center gap-3">
                <span className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-2 py-1 text-(length:--text-tiny) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                  Opening saved workspace
                </span>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="grid gap-3 md:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]"
              data-job-finder-opening-placeholder
            >
              <div className="surface-panel-shell min-h-56 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
                <div className="h-4 w-36 rounded bg-(--surface-panel-raised)" />
                <div className="mt-5 h-10 w-64 max-w-full rounded bg-(--surface-panel-raised)" />
                <div className="mt-8 grid grid-cols-3 gap-3">
                  <div className="h-20 rounded bg-(--surface-panel-raised)" />
                  <div className="h-20 rounded bg-(--surface-panel-raised)" />
                  <div className="h-20 rounded bg-(--surface-panel-raised)" />
                </div>
              </div>
              <div className="surface-panel-shell min-h-56 rounded-(--radius-panel) border border-(--surface-panel-border) p-5">
                <div className="h-4 w-28 rounded bg-(--surface-panel-raised)" />
                <div className="mt-5 h-12 rounded bg-(--surface-panel-raised)" />
                <div className="mt-3 h-12 rounded bg-(--surface-panel-raised)" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export { JobFinderOpeningShell };

/**
 * The gate that runs before Job Finder opens a browser at a real employer's
 * application page. It used to be titled "Use visual checkpoints?" — a
 * sub-option — and both of its buttons proceeded, so the only way out was an
 * unlabelled header X. It is now framed around the commitment itself: it names
 * the job and employer, says a Job Finder browser window will open, states the
 * never-submits boundary as its own line, and offers a real Cancel.
 *
 * Visual checkpoints became an optional, unchecked checkbox rather than a fork,
 * so the safety property is unchanged and stronger: confirming without touching
 * anything resolves with checkpoints off, exactly as "Continue without" did, and
 * Escape, the scrim, Cancel and the header X all resolve through onClose, which
 * cancels the request. Nothing here submits an application.
 */
export function ApplyCopilotVisualCheckpointDialog(props: {
  onClose: () => void;
  onResolve: (visualCheckpointsEnabled: boolean) => void;
  request: ApplyCopilotVisualCheckpointRequest | null;
}) {
  const dialogTitleId = useId();
  const descriptionId = useId();
  const boundaryId = useId();
  const checkpointsId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [visualCheckpointsEnabled, setVisualCheckpointsEnabled] =
    useState(false);
  const open = props.request !== null;
  useModalFocusTrap(open, dialogRef, props.onClose);

  // Every open starts from the privacy-preserving default; consent is per run
  // and is never carried over from a previous preparation.
  useEffect(() => {
    if (open) {
      setVisualCheckpointsEnabled(false);
    }
  }, [open, props.request]);

  // Declared after the shared trap so it runs second on open. Confirming
  // resolves with checkpoints off unless the user ticks the box, so initial
  // focus on the confirm action cannot enable screenshot sharing by accident.
  useEffect(() => {
    if (!open) {
      return;
    }
    confirmRef.current?.focus();
  }, [open]);

  if (!open) {
    return null;
  }

  // Identity and the honest statement of what will happen both come from the
  // request, so this shell renders whatever the caller supplies rather than
  // owning that copy.
  const jobIdentityLine = (props.request?.subject ?? "").trim() || null;
  const commitmentDescription = (props.request?.description ?? "").trim();
  // Safety backstop, not copy ownership: the caller's description carries the
  // never-submits boundary, and this shell states it itself if that sentence
  // is ever missing, so the gate can never appear without it.
  const describesSubmitBoundary = /submit|sending the application/i.test(
    commitmentDescription,
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-(--modal-scrim) px-4 py-6 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        aria-describedby={
          describesSubmitBoundary
            ? descriptionId
            : `${descriptionId} ${boundaryId}`
        }
        aria-labelledby={dialogTitleId}
        aria-modal="true"
        className="surface-panel-shell grid max-h-[calc(100dvh-3rem)] w-full max-w-lg gap-5 overflow-y-auto rounded-(--radius-field) border border-(--surface-panel-border) p-5 shadow-(--modal-shadow)"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              Prepare application
            </p>
            {/* The heading is the identity: which application this gate is
                actually about. Group 6 supplies the subject line. */}
            <h2
              className="text-(--text-headline)"
              data-apply-checkpoint-dialog-job
              id={dialogTitleId}
            >
              {jobIdentityLine ?? "Prepare this application"}
            </h2>
          </div>
          {/* One close-affordance shape across every Job Finder dialog. */}
          <Button
            aria-label="Close"
            className="shrink-0"
            onClick={props.onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3">
          <p
            className="text-(length:--text-item) leading-6 text-foreground-soft"
            id={descriptionId}
          >
            {commitmentDescription}
          </p>
          {describesSubmitBoundary ? null : (
            <p
              className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-3 py-2 text-(length:--text-item) font-medium leading-6 text-foreground"
              data-apply-checkpoint-dialog-boundary
              id={boundaryId}
            >
              Job Finder never submits the application. You review everything
              and send it yourself.
            </p>
          )}
        </div>
        {/* Checkpoints are an option on this commitment, not a second way to
            confirm it. Unchecked by default; confirming without touching it
            behaves exactly as the old "Continue without" choice. */}
        <label
          className="flex items-start gap-3 rounded-(--radius-field) border border-(--surface-panel-border) p-3"
          htmlFor={checkpointsId}
        >
          <input
            checked={visualCheckpointsEnabled}
            className="mt-1 size-4 shrink-0 accent-(--primary)"
            id={checkpointsId}
            onChange={(event) =>
              setVisualCheckpointsEnabled(event.target.checked)
            }
            type="checkbox"
          />
          <span className="grid gap-1">
            <span className="text-(length:--text-item) font-medium text-foreground">
              Take temporary screenshots while it works
            </span>
            <span className="text-(length:--text-small) leading-5 text-foreground-soft">
              Optional. Screenshots of the application page help Job Finder
              notice a stuck or misfilled form, and are deleted after the run.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <Button onClick={props.onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            onClick={() => props.onResolve(visualCheckpointsEnabled)}
            ref={confirmRef}
            type="button"
            variant="primary"
          >
            Prepare application
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function JobFinderPage() {
  const location = useLocation();
  const shellMarkedRef = useRef(false);
  const {
    appearanceTheme,
    applyCopilotVisualCheckpointRequest,
    cancelApplyCopilotVisualCheckpointRequest,
    context,
    dismissSavedStatus,
    navigateFromShell,
    platform,
    resolveResumeWorkspaceLeaveRequest,
    resolveUnsavedChangesLeave,
    resolveUnsavedChangesStay,
    retryLastSave,
    resumeWorkspaceLeaveConfirmation,
    saveState,
    resolveApplyCopilotVisualCheckpointRequest,
    unsavedChangesConfirmation,
    workspace,
    workspaceState,
  } = useJobFinderPageController();

  // One shared closure for both consumers of the existing fenced
  // cancellation request: the shell Task Center and the Discovery route's
  // header stop action. No new IPC or controller action is introduced.
  const cancelDiscovery = useCallback(() => {
    window.unemployed.jobFinder.cancelAgentDiscovery();
  }, []);
  // The route context gains only this optional member; memoized on the same
  // inputs so outlet consumers keep the controller's context identity.
  const routeContext = useMemo(
    () =>
      context ? { ...context, onCancelDiscovery: cancelDiscovery } : context,
    [cancelDiscovery, context],
  );

  useEffect(() => {
    if (!context || shellMarkedRef.current) {
      return;
    }

    shellMarkedRef.current = true;
    markJobFinderTiming("job-finder:shell:mounted");
    measureFromLatestJobFinderMark(
      "job-finder:shell:time",
      "job-finder:workspace:bootstrap:ready",
      "job-finder:shell:mounted",
    );
  }, [context]);

  useEffect(() => {
    // The marker is a post-commit signal for direct hash changes and older
    // preload builds that do not expose bootstrap timing marks.
    if (!context) {
      return;
    }
    markJobFinderTiming(`job-finder:route:${location.pathname}:committed`);
  }, [context, location.pathname]);

  if (!context || !workspace || !platform) {
    if (workspaceState.status === "loading") {
      return withJobFinderWindowCloseGuard(<JobFinderOpeningShell />);
    }

    if (
      workspaceState.status === "error" &&
      workspaceState.startupDatabaseRecovery
    ) {
      // A typed recovery incident blocks the workspace on purpose: no retry
      // action is offered because retrying would re-run recovery without any
      // new information and every retained file stays untouched.
      return withJobFinderWindowCloseGuard(
        <WorkspaceStateScreen
          kicker="Workspace error"
          message={buildJobFinderStartupDatabaseRecoveryBlockedDetail({
            incidentId: workspaceState.startupDatabaseRecovery.incidentId,
            outcome: workspaceState.startupDatabaseRecovery.outcome,
          })}
          title="Couldn't open Job Finder"
          tone="error"
        />,
      );
    }

    return withJobFinderWindowCloseGuard(
      <WorkspaceStateScreen
        {...(workspaceState.status === "error"
          ? {
              action: {
                label: "Retry opening Job Finder",
                onClick: workspaceState.retry,
              },
            }
          : {})}
        kicker="Workspace error"
        message={
          workspaceState.status === "error"
            ? workspaceState.message
            : "Job Finder couldn't load."
        }
        title="Couldn't open Job Finder"
        tone="error"
      />,
    );
  }

  return withJobFinderWindowCloseGuard(
    <ThemeProvider preference={appearanceTheme || "system"}>
      <JobFinderShell
        isDiscoveryPending={context.isAnyPending([
          jobFinderPendingActions.discoveryAll(),
          ...workspace.searchPreferences.discovery.targets.map((target) =>
            jobFinderPendingActions.discoveryTarget(target.id),
          ),
        ])}
        isResumeImportPending={context.isPending(
          jobFinderPendingActions.profileImport(),
        )}
        liveDiscoveryEvents={context.liveDiscoveryEvents}
        onCancelApplyRun={(runId) => {
          const assignedResults = workspace.applyJobResults.filter(
            (result) =>
              result.runId === runId && result.applicationRecordId !== null,
          );
          if (assignedResults.length !== 1) {
            return Promise.resolve(false);
          }
          const result = assignedResults[0];
          if (!result?.applicationRecordId) {
            return Promise.resolve(false);
          }
          return context.onCancelApplyRun({
            runId,
            jobId: result.jobId,
            applicationRecordId: result.applicationRecordId,
          });
        }}
        onCancelDiscovery={cancelDiscovery}
        onDismissSavedStatus={dismissSavedStatus}
        onNavigate={navigateFromShell}
        onRetrySave={retryLastSave}
        onStopTailoredDraftPreparation={context.onStopTailoredDraftPreparation}
        platform={platform}
        resumeImportProgress={context.resumeImportProgress}
        saveState={saveState}
        tailoredDraftPreparation={context.tailoredDraftPreparation}
        workspace={workspace}
      >
        <Suspense
          fallback={
            <WorkspaceStateScreen
              fillAvailableViewport
              kicker="Job Finder"
              message="We’re opening this workspace surface."
              title="Loading screen"
            />
          }
        >
          <Outlet context={routeContext} />
          <JobFinderRouteReadyMarker />
        </Suspense>
      </JobFinderShell>
      <ApplyCopilotVisualCheckpointDialog
        onClose={cancelApplyCopilotVisualCheckpointRequest}
        onResolve={resolveApplyCopilotVisualCheckpointRequest}
        request={applyCopilotVisualCheckpointRequest}
      />
      <JobFinderUnsavedChangesDialog
        confirmation={unsavedChangesConfirmation}
        onLeaveWithoutSaving={resolveUnsavedChangesLeave}
        onStay={resolveUnsavedChangesStay}
      />
      {/* Same branded dialog, second parked decision: actions that leave
          dirty Resume Studio work ask it through the controller's async
          request instead of a native window.confirm. */}
      <JobFinderUnsavedChangesDialog
        confirmation={resumeWorkspaceLeaveConfirmation}
        onLeaveWithoutSaving={() => resolveResumeWorkspaceLeaveRequest(true)}
        onStay={() => resolveResumeWorkspaceLeaveRequest(false)}
      />
      {/* The window-close responder is mounted once by
          withJobFinderWindowCloseGuard above this tree so it also answers on
          loading and error screens. */}
      <StartupDatabaseRecoveryNotice />
    </ThemeProvider>,
  );
}
