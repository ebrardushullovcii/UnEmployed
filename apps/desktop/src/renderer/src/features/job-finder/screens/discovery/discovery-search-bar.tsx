import type {
  BrowserSessionState,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@renderer/components/ui/button";
import { formatCountLabel } from "@renderer/features/job-finder/lib/job-finder-utils";
import { cn } from "@renderer/lib/cn";
import {
  getDiscoveryRuntimeProjection,
  getDiscoverySearchReadiness,
} from "./discovery-search-readiness";

export const DISCOVERY_SEARCH_SETUP_PANEL_ID = "discovery-search-setup-panel";

export interface DiscoverySearchChip {
  id: string;
  label: string;
}

/**
 * The three settings a job seeker actually edits, as short chips. Results own
 * the page, so the setup that used to be a peer tab is summarized here and
 * opens in place instead of costing a whole navigation act.
 */
export function getDiscoverySearchChips(
  searchPreferences: JobSearchPreferences,
): readonly DiscoverySearchChip[] {
  const searchTargetCount =
    searchPreferences.targetRoles.length + searchPreferences.jobFamilies.length;
  const enabledSourceCount =
    getDiscoverySearchReadiness(searchPreferences).enabledSourceCount;
  const isRemoteOnlySearch =
    searchPreferences.locations.length === 0 &&
    searchPreferences.workModes.length > 0 &&
    searchPreferences.workModes.every((workMode) => workMode === "remote");

  return [
    {
      id: "roles",
      label:
        searchTargetCount > 0
          ? formatCountLabel(searchTargetCount, "search target")
          : "No search targets",
    },
    {
      id: "places",
      label: isRemoteOnlySearch
        ? "Remote only"
        : searchPreferences.locations.length > 0
          ? formatCountLabel(searchPreferences.locations.length, "location")
          : searchPreferences.workModes.length > 0
            ? formatCountLabel(searchPreferences.workModes.length, "work mode")
            : "Anywhere",
    },
    {
      id: "sources",
      label:
        enabledSourceCount > 0
          ? formatCountLabel(enabledSourceCount, "enabled source")
          : "No enabled sources",
    },
  ];
}

/**
 * Whole seconds since the running search started, or `null` when nothing is
 * running or the start time is unusable. Measured from the run's own recorded
 * start, so a re-render or a route return never restarts the count.
 */
function useSearchElapsedSeconds(startedAt: string | null): number | null {
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const isMeasurable = Number.isFinite(startedAtMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isMeasurable) {
      return;
    }

    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [isMeasurable, startedAtMs]);

  if (!isMeasurable) {
    return null;
  }

  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
}

/**
 * `null` when the offline catalog runtime owns the page: there is no live
 * browser to open, and the setup panel already states that fact once. A second
 * "Offline catalog" copy here would only duplicate that owner.
 */
function getBrowserChipLabel(
  browserSession: BrowserSessionState,
  isPending: boolean,
): string | null {
  if (getDiscoveryRuntimeProjection(browserSession).isOffline) {
    return null;
  }
  switch (browserSession.status) {
    case "ready":
      return "Browser ready";
    case "login_required":
      return "Browser needs sign-in";
    case "blocked":
      return "Browser blocked";
    default:
      return isPending ? "Starting browser" : "Browser not open";
  }
}

/**
 * One interactive strip above the results: what the search is set to, one
 * search command, and the browser as a small link rather than the first block
 * on the page.
 */
export function DiscoverySearchBar(props: {
  browserSession: BrowserSessionState;
  isBrowserSessionPending: boolean;
  isSearchPending: boolean;
  isSearchDisabled: boolean;
  isSetupOpen: boolean;
  /**
   * Which chip owns the open panel, so a chip reports its OWN state instead
   * of all three lighting up together whenever any section is open.
   */
  openSetupChipId?: string | null;
  /**
   * ISO start time of the run in progress. A search takes several seconds, so
   * the wait is reported beside the control that started it rather than only
   * inside a separate activity panel.
   */
  searchStartedAt?: string | null;
  /** Live "n new jobs saved" style progress for the run in progress. */
  searchProgressLabel?: string | null;
  isStopPending?: boolean;
  onOpenBrowserSession: () => void;
  onRunAgentDiscovery: (() => void) | undefined;
  onStopSearch?: (() => void) | undefined;
  onToggleSetup: (chipId: string | null) => void;
  searchActionDescribedBy?: string | undefined;
  searchPreferences: JobSearchPreferences;
  isSearchRunning: boolean;
}) {
  const {
    browserSession,
    isBrowserSessionPending,
    isSearchDisabled,
    isSearchPending,
    isSearchRunning,
    isSetupOpen,
    openSetupChipId = null,
    searchStartedAt = null,
    searchProgressLabel = null,
    isStopPending = false,
    onOpenBrowserSession,
    onRunAgentDiscovery,
    onStopSearch,
    onToggleSetup,
    searchActionDescribedBy,
    searchPreferences,
  } = props;
  const chips = getDiscoverySearchChips(searchPreferences);
  const elapsedSeconds = useSearchElapsedSeconds(
    isSearchRunning ? searchStartedAt : null,
  );
  const browserChipLabel = getBrowserChipLabel(
    browserSession,
    isBrowserSessionPending,
  );

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 rounded-(--radius-button) border border-(--surface-panel-border) bg-(--surface-panel) px-2 py-1.5"
      data-testid="discovery-search-bar"
    >
      <SlidersHorizontal
        aria-hidden="true"
        className="size-3.5 shrink-0 text-foreground-muted"
      />
      {chips.map((chip) => {
        const isChipOpen = isSetupOpen && openSetupChipId === chip.id;

        return (
          <button
            aria-controls={DISCOVERY_SEARCH_SETUP_PANEL_ID}
            aria-expanded={isChipOpen}
            className={cn(
              "inline-flex min-h-7 shrink-0 items-center rounded-(--radius-small) border border-(--control-border) px-2.5 text-(length:--text-small) font-medium outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30",
              isChipOpen
                ? "border-primary bg-accent text-accent-foreground"
                : "text-foreground-soft",
            )}
            data-discovery-search-chip={chip.id}
            key={chip.id}
            onClick={() => onToggleSetup(isChipOpen ? null : chip.id)}
            type="button"
          >
            {chip.label}
          </button>
        );
      })}
      {browserChipLabel === null ? null : (
        <button
          className="inline-flex min-h-7 shrink-0 items-center rounded-(--radius-small) px-2 text-xs text-foreground-muted underline-offset-2 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
          data-testid="discovery-search-bar-browser"
          onClick={onOpenBrowserSession}
          type="button"
        >
          {browserChipLabel}
        </button>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {isSearchRunning && onStopSearch ? (
          <Button
            data-testid="discovery-header-stop-search"
            onClick={onStopSearch}
            pending={isStopPending}
            size="xs"
            type="button"
            variant="outline"
          >
            Stop search
          </Button>
        ) : null}
        {isSearchRunning && (elapsedSeconds !== null || searchProgressLabel) ? (
          <span
            aria-live="polite"
            className="shrink-0 whitespace-nowrap text-(length:--text-small) tabular-nums text-foreground-soft"
            data-testid="discovery-search-progress"
          >
            {[
              elapsedSeconds === null ? null : `${elapsedSeconds}s`,
              searchProgressLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        <Button
          aria-describedby={searchActionDescribedBy}
          data-testid="discovery-search-now"
          disabled={isSearchDisabled}
          onClick={onRunAgentDiscovery}
          pending={isSearchPending}
          size="sm"
          type="button"
          variant="primary"
        >
          {isSearchRunning ? "Searching" : "Search now"}
        </Button>
      </div>
    </div>
  );
}
