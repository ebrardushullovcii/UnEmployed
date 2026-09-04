import {
  isRunnableJobDiscoveryTarget,
  type BrowserSessionState,
  type JobSearchPreferences,
} from "@unemployed/contracts";
import { JOB_FINDER_BROWSER_NAME_SENTENCE_START } from "../../lib/job-finder-browser-handoff-copy";

/**
 * Copy shared by the route header and search controls when only the seeded
 * catalog runtime is available. "Filters are complete" deliberately names
 * setup without suggesting that a current-source search can run.
 */
export const DISCOVERY_OFFLINE_SEARCH_REASON =
  "Filters are complete, but live source search is unavailable in this build.";

/**
 * Catalog rows remain useful for local review, but their unbound source,
 * activity, and fit evidence must not read as proof of a live search.
 */
export const DISCOVERY_OFFLINE_CATALOG_NOTICE =
  "Catalog jobs are review-only; they do not confirm a live source search.";

export const DISCOVERY_OFFLINE_SETUP_NOTICE = `${DISCOVERY_OFFLINE_SEARCH_REASON} ${DISCOVERY_OFFLINE_CATALOG_NOTICE}`;

export const DISCOVERY_OFFLINE_RUNTIME_LABEL = "Offline catalog";

/**
 * Only a genuinely errored browser session blocks a current-source search.
 * A browser that is simply not open yet (or still starting) never blocks:
 * the discovery run opens and attaches the browser itself, so the UI gate
 * must not be stricter than the runtime it fronts.
 */
export const DISCOVERY_BROWSER_BLOCKED_REASON = `${JOB_FINDER_BROWSER_NAME_SENTENCE_START} needs attention before the next search.`;

export type DiscoveryRuntimeCapability = "agent_backed" | "offline_catalog";

export interface DiscoveryRuntimeProjection {
  capability: DiscoveryRuntimeCapability;
  isOffline: boolean;
  sourceSearchAvailable: boolean;
}

/**
 * `catalog_seed` is the explicit offline/catalog execution lane. A ready
 * status there only means the deterministic catalog can be read; it is not a
 * live source-search capability. An agent-backed driver keeps current-source
 * search available unless its session is genuinely blocked: a closed,
 * starting, or sign-in-pending browser is opened or handled by the run.
 */
export function getDiscoveryRuntimeProjection(
  session: Pick<BrowserSessionState, "driver" | "status">,
): DiscoveryRuntimeProjection {
  const isOffline = session.driver === "catalog_seed";

  return {
    capability: isOffline ? "offline_catalog" : "agent_backed",
    isOffline,
    sourceSearchAvailable: !isOffline && session.status !== "blocked",
  };
}

/**
 * The single cause that currently disables Search, so every control derives
 * its label and target from the same fact instead of guessing. `null` means
 * the search is ready.
 */
export type DiscoverySearchBlocker =
  | "no_enabled_sources"
  | "no_search_roles"
  | "offline_runtime"
  | "browser_blocked";

export interface DiscoverySearchReadiness {
  enabledSourceCount: number;
  hasSearchRoles: boolean;
  setupReady: boolean;
  sourceSearchAvailable: boolean;
  ready: boolean;
  reason: string | null;
  blocker: DiscoverySearchBlocker | null;
}

/**
 * Visible reason used by every Find-jobs search control while campaign
 * activity is paused. Non-color, one sentence, and distinct from the source
 * readiness reason so the two states are never confused.
 */
export const DISCOVERY_PAUSED_SEARCH_REASON =
  "Search is paused, so new searches stay unavailable.";

export function getDiscoverySearchReadiness(
  searchPreferences: JobSearchPreferences,
  session?: Pick<BrowserSessionState, "driver" | "status">,
  options?: {
    /**
     * A discovery run that is active right now, or whose newest attempt
     * completed successfully, proves the runtime works; a stale blocked
     * session snapshot must not gate the next search behind a warning that
     * contradicts the results on screen.
     */
    trustRecentRun?: boolean;
  },
): DiscoverySearchReadiness {
  const hasSearchRoles =
    searchPreferences.targetRoles.length > 0 ||
    searchPreferences.jobFamilies.length > 0;
  const enabledSourceCount = searchPreferences.discovery.targets.filter(
    isRunnableJobDiscoveryTarget,
  ).length;
  const setupReady = enabledSourceCount > 0 && hasSearchRoles;
  const runtime = session ? getDiscoveryRuntimeProjection(session) : null;
  const sourceSearchAvailable = runtime
    ? runtime.isOffline
      ? false
      : runtime.sourceSearchAvailable || options?.trustRecentRun === true
    : true;
  const blocker: DiscoverySearchBlocker | null =
    enabledSourceCount === 0
      ? "no_enabled_sources"
      : !hasSearchRoles
        ? "no_search_roles"
        : runtime?.isOffline
          ? "offline_runtime"
          : !sourceSearchAvailable
            ? "browser_blocked"
            : null;

  return {
    enabledSourceCount,
    hasSearchRoles,
    setupReady,
    sourceSearchAvailable,
    ready: setupReady && sourceSearchAvailable,
    reason:
      blocker === "no_enabled_sources"
        ? "Add or enable at least one valid public job-source URL before searching."
        : blocker === "no_search_roles"
          ? "Add at least one target role or job family before searching so results stay relevant."
          : blocker === "offline_runtime"
            ? DISCOVERY_OFFLINE_SEARCH_REASON
            : blocker === "browser_blocked"
              ? DISCOVERY_BROWSER_BLOCKED_REASON
              : null,
    blocker,
  };
}
