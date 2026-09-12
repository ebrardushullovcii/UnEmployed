import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  BrowserSessionState,
  DiscoveryJobView,
  JobDiscoveryTarget,
  ListingActivity,
  SavedJob,
  WorkMode,
} from "@unemployed/contracts";
import { fitRecommendationValues, workModeValues } from "@unemployed/contracts";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { SelectableRow } from "@renderer/components/ui";
import { EmptyState } from "@renderer/features/job-finder/components/empty-state";
import {
  jobFinderListRegionClassName,
  jobFinderListRowBadgeSlotClassName,
  jobFinderListRowClassName,
  jobFinderListRowCompactClassName,
  jobFinderListRowLinesClassName,
  jobFinderListRowMetaClassName,
  jobFinderListRowStatusClassName,
  jobFinderListRowTitleClassName,
  jobFinderListRowTitleLineClassName,
} from "@renderer/features/job-finder/components/list-row";
import {
  CollectionNoMatches,
  CollectionSearchToolbar,
  matchesCollectionSearch,
} from "@renderer/features/job-finder/components/collection-search-toolbar";
import { StatusBadge } from "@renderer/features/job-finder/components/status-badge";
import { usePersistedCollectionView } from "@renderer/features/job-finder/hooks/use-persisted-collection-view";
import {
  focusCollectionItem,
  getAdjacentCollectionItemId,
} from "@renderer/features/job-finder/lib/collection-keyboard-navigation";
import { Link } from "react-router-dom";
import { JOB_FINDER_ROUTE_PATHS } from "@renderer/features/job-finder/lib/job-finder-route-hrefs";
import {
  formatJobEmployerLocationLine,
  scrubJobAbsencePlaceholders,
} from "@renderer/features/job-finder/lib/job-employer-location-display";
import {
  formatDiscoveryResultBandLabel,
  formatDiscoveryResultBandTotal,
} from "@renderer/features/job-finder/lib/discovery-run-count-label";
import { cn } from "@renderer/lib/cn";
import {
  formatStatusLabel,
  formatWorkModeLabel,
  getApplicationTone,
  getPostedDateLabel,
} from "@renderer/features/job-finder/lib/job-finder-utils";
import {
  fitRecommendationCopy,
  getMatchAssessmentPresentation,
} from "@renderer/features/job-finder/lib/match-assessment-presentation";
import {
  listingActivityStatuses,
  presentListingActivity,
} from "@renderer/features/job-finder/lib/listing-activity-presentation";
import {
  DISCOVERY_DETAIL_REGION_ID,
  focusDiscoveryDetailAfterKeyboardSelection,
  revealDiscoveryDetailAfterPointerSelection,
} from "./discovery-accessibility";
import {
  buildDiscoveryHeadedGroupByJobId,
  buildDiscoveryResultGroupHeadings,
  countDiscoveryUncheckedResults,
} from "./discovery-result-groups";
// One name for that window, from the one module that owns it.
import { JOB_FINDER_BROWSER_NAME } from "@renderer/features/job-finder/lib/job-finder-browser-handoff-copy";
import {
  compareDiscoveryResults,
  type DiscoveryResultsSortField,
  useDiscoveryResultsSort,
} from "./discovery-results-sort";
import { getDiscoveryListingRecencyKey } from "@unemployed/job-finder/discovery-ordering";
import type { DiscoveryLatestRunVerdict } from "./discovery-run-feedback";
import { getDiscoverySourceLabels } from "./discovery-source-attribution";
import {
  DISCOVERY_OFFLINE_SETUP_NOTICE,
  getDiscoveryRuntimeProjection,
} from "./discovery-search-readiness";

interface DiscoveryResultsPanelProps {
  alsoFoundCount?: number;
  areAlsoFoundShown?: boolean;
  browserSession: BrowserSessionState;
  discoveryTargets?: readonly JobDiscoveryTarget[];
  emptyClassName?: string;
  // Active search plan/campaign identity from the discovery screen. Facet
  // snapshots are scoped by it so switching plans restores each plan's own
  // filters instead of leaking them across plans.
  facetScopeId?: string | null;
  hasCompletedSearch?: boolean;
  hiddenAlsoFoundCount?: number;
  isSearchInProgress?: boolean;
  jobs: readonly SavedJob[];
  latestRunVerdict?: DiscoveryLatestRunVerdict | null;
  onDisplayedSelectedJobIdChange?: (selectedJobId: string | null) => void;
  onRecoveryAction?: (() => void) | null;
  onShowAlsoFound?: (() => void) | null;
  onToggleAlsoFound?: (() => void) | null;
  onSelectJob: (jobId: string) => void;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
  searchSetupBlocker?: {
    title: string;
    description: string;
    actionLabel?: string | null;
    actionHref?: string | null;
    nextStep?: string | null;
  } | null;
  selectedJob: DiscoveryResultJob | null;
}

type DiscoveryResultJob = SavedJob &
  Partial<Pick<DiscoveryJobView, "listingActivity">>;

export const DISCOVERY_RESULTS_PAGE_SIZE = 50;
const DISCOVERY_RESULT_DENSITIES = ["compact", "comfortable"] as const;
export const DISCOVERY_OFFLINE_CATALOG_NOTICE_ID =
  "discovery-offline-catalog-notice";
export const DISCOVERY_SEARCH_SETUP_BLOCKER_ID =
  "discovery-search-setup-blocker";

const DISCOVERY_RESULTS_SORT_OPTIONS = [
  { field: "fit", label: "Best match" },
  { field: "recent", label: "Newest listing date" },
  { field: "company", label: "Company" },
] as const satisfies readonly {
  readonly field: DiscoveryResultsSortField;
  readonly label: string;
}[];

/**
 * One box metric for every control on the results toolbar row (Filters
 * disclosure, sort field, sort direction). They used to disagree on all three
 * of height, radius and weight: the direction toggle rendered at the `xs`
 * button size — 24px tall with `rounded-md` — beside a 32px `h-8` select, and
 * the Filters disclosure used `min-h-8` rather than a fixed height, so a row
 * of three sibling controls read as three unrelated boxes. Border colour is
 * deliberately not folded in here: the sort field keeps the editable-field
 * trio it shares with the search input above, while the two non-field
 * controls carry the interactive `--control-border`. Pinned by
 * `discovery-results-panel.toolbar-metrics.test.tsx`.
 */
export const DISCOVERY_RESULTS_TOOLBAR_CONTROL_CLASS =
  "h-8 rounded-(--radius-button) text-xs font-medium";

const SOURCE_UNAVAILABLE_FILTER = "Source unavailable";
const WORK_MODE_UNSPECIFIED_FILTER = "Not specified";

// Facet selections survive route remounts per active search plan in one
// bounded, versioned local snapshot following the results-sort persistence
// convention. The storage key stays constant; each plan's last-used facets
// live in a capped most-recently-used scope list inside the payload, so
// storage can never grow with plan count and plans never see each other's
// filters.
const FACET_FILTERS_STORAGE_KEY =
  "unemployed.job-finder.discovery.result-filters.v2";
// Legacy unscoped snapshot from before plan scoping existed. Read once as
// the migrating value for whichever plan is active, then removed after the
// first successful scoped write.
const LEGACY_FACET_FILTERS_STORAGE_KEY =
  "unemployed.job-finder.discovery.result-filters.v1";
const FACET_SCOPE_FALLBACK = "default";
const MAX_FACET_SCOPES = 8;
const MAX_PERSISTED_FACET_VALUES = 24;
const MAX_PERSISTED_FACET_VALUE_LENGTH = 200;

interface PersistedDiscoveryFacetFilters {
  readonly activity: readonly string[];
  readonly recommendation: readonly string[];
  readonly source: readonly string[];
  readonly workMode: readonly string[];
}

interface PersistedFacetScope extends PersistedDiscoveryFacetFilters {
  readonly id: string;
}

const EMPTY_PERSISTED_FACET_FILTERS: PersistedDiscoveryFacetFilters = {
  activity: [],
  recommendation: [],
  source: [],
  workMode: [],
};

// Static validity domains: a stored value outside its facet's known value
// space is discarded at read time instead of silently hiding every result.
const ACTIVITY_FILTER_DOMAIN = new Set<string>(listingActivityStatuses);
const RECOMMENDATION_FILTER_DOMAIN = new Set<string>(fitRecommendationValues);
const WORK_MODE_FILTER_DOMAIN = new Set<string>([
  WORK_MODE_UNSPECIFIED_FILTER,
  ...workModeValues,
]);

function normalizeFacetScopeKey(
  facetScopeId: string | null | undefined,
): string {
  const trimmed = (facetScopeId ?? "").trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : FACET_SCOPE_FALLBACK;
}

function readBoundedFacetValues(
  value: unknown,
  validDomain?: ReadonlySet<string>,
): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.slice(0, MAX_PERSISTED_FACET_VALUE_LENGTH))
    .filter((entry) => !validDomain || validDomain.has(entry))
    .slice(0, MAX_PERSISTED_FACET_VALUES);
}

/**
 * Validates any stored facet payload (legacy global snapshot or a scoped
 * entry) into the four bounded facet lists. Source labels depend on the
 * loaded result set, so they get no static domain here; they are validated
 * dynamically against the visible options after render instead.
 */
function parseFacetPayload(
  value: unknown,
): PersistedDiscoveryFacetFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  return {
    activity: readBoundedFacetValues(
      candidate.activity,
      ACTIVITY_FILTER_DOMAIN,
    ),
    recommendation: readBoundedFacetValues(
      candidate.recommendation,
      RECOMMENDATION_FILTER_DOMAIN,
    ),
    source: readBoundedFacetValues(candidate.source),
    workMode: readBoundedFacetValues(
      candidate.workMode,
      WORK_MODE_FILTER_DOMAIN,
    ),
  };
}

function parsePersistedFacetScopes(
  raw: string,
): readonly PersistedFacetScope[] {
  const parsed = JSON.parse(raw) as { scopes?: unknown };
  if (!Array.isArray(parsed.scopes)) return [];
  return parsed.scopes
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.id !== "string") return [];
      const facets = parseFacetPayload(entry);
      if (!facets) return [];
      return [{ ...facets, id: candidate.id.slice(0, 120) } as const];
    })
    .slice(0, MAX_FACET_SCOPES);
}

function readScopedFacetFilters(
  scopeKey: string,
): PersistedDiscoveryFacetFilters {
  try {
    const raw = window.localStorage.getItem(FACET_FILTERS_STORAGE_KEY);
    if (raw) {
      const match = parsePersistedFacetScopes(raw).find(
        (scope) => scope.id === scopeKey,
      );
      return match
        ? {
            activity: match.activity,
            recommendation: match.recommendation,
            source: match.source,
            workMode: match.workMode,
          }
        : EMPTY_PERSISTED_FACET_FILTERS;
    }
    // One-time migration: the legacy global snapshot belonged to whatever
    // plan is active right now; every other plan starts clean instead of
    // inheriting cross-plan filters.
    const legacyRaw = window.localStorage.getItem(
      LEGACY_FACET_FILTERS_STORAGE_KEY,
    );
    if (legacyRaw) {
      return (
        parseFacetPayload(JSON.parse(legacyRaw)) ??
        EMPTY_PERSISTED_FACET_FILTERS
      );
    }
  } catch {
    // Unreadable snapshots fall back to unfiltered results.
  }
  return EMPTY_PERSISTED_FACET_FILTERS;
}

function writeScopedFacetFilters(
  scopeKey: string,
  filters: PersistedDiscoveryFacetFilters,
): void {
  const bound = (values: readonly string[]) =>
    values
      .slice(0, MAX_PERSISTED_FACET_VALUES)
      .map((value) => value.slice(0, MAX_PERSISTED_FACET_VALUE_LENGTH));
  try {
    const raw = window.localStorage.getItem(FACET_FILTERS_STORAGE_KEY);
    const previous = raw ? parsePersistedFacetScopes(raw) : [];
    const entry: PersistedFacetScope = {
      activity: bound(filters.activity),
      id: scopeKey,
      recommendation: bound(filters.recommendation),
      source: bound(filters.source),
      workMode: bound(filters.workMode),
    };
    const scopes = [
      entry,
      ...previous.filter((scope) => scope.id !== scopeKey),
    ].slice(0, MAX_FACET_SCOPES);
    window.localStorage.setItem(
      FACET_FILTERS_STORAGE_KEY,
      JSON.stringify({ version: 2, scopes }),
    );
    // The scoped snapshot supersedes the legacy global one.
    window.localStorage.removeItem(LEGACY_FACET_FILTERS_STORAGE_KEY);
  } catch {
    // Filters still work when durable renderer preferences are unavailable.
  }
}

/**
 * Drops selected values that no longer appear among the visible options, so a
 * restored (or surviving) selection can never reference a value no current
 * result offers and silently blank the list. Returns the original reference
 * when nothing changed to avoid needless re-renders and storage churn. The
 * options come from the unfiltered scoped job collection, so another active
 * facet temporarily hiding every row that offers a value never erases it.
 */
function pruneFilterSelection(
  current: ReadonlySet<string>,
  presentOptions: ReadonlySet<string>,
): ReadonlySet<string> {
  if (current.size === 0) return current;
  const kept = [...current].filter((value) => presentOptions.has(value));
  // Same size means nothing was dropped: returning the original reference
  // keeps the pruning effect from re-rendering (Sets have no .length).
  return kept.length === current.size ? current : new Set(kept);
}

function getListingActivity(job: DiscoveryResultJob): ListingActivity {
  return job.listingActivity ?? { status: "unknown" };
}

function toggleFilterValue(
  values: ReadonlySet<string>,
  value: string,
): Set<string> {
  const next = new Set(values);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

export function getDiscoveryResultsPage(
  jobs: readonly SavedJob[],
  page: number,
): readonly SavedJob[] {
  const pageCount = Math.max(
    1,
    Math.ceil(jobs.length / DISCOVERY_RESULTS_PAGE_SIZE),
  );
  const boundedPage = Math.min(Math.max(0, page), pageCount - 1);
  const startIndex = boundedPage * DISCOVERY_RESULTS_PAGE_SIZE;

  return jobs.slice(startIndex, startIndex + DISCOVERY_RESULTS_PAGE_SIZE);
}

/**
 * Truthful streaming-progress count: reports what is actually visible after
 * the user's persisted search query and filters, never the raw saved total.
 */
export function getDiscoveryProgressCountLabel(
  visibleCount: number,
  totalCount: number,
): string {
  const noun = totalCount === 1 ? "match" : "matches";
  return visibleCount === totalCount
    ? `${totalCount} ${noun} ready to review.`
    : `${visibleCount} of ${totalCount} ${noun} ready to review.`;
}

/**
 * Truthful listing-date badge for a results row, kept consistent with the
 * shared recency key: when the only posting evidence is a relative source
 * label ("2 days ago"), the badge keeps the provider's wording but marks the
 * row as "not date-ranked" instead of implying that Newest sort ranked it by
 * a posting date it cannot derive (and never by the hidden provider-update
 * time either).
 */
export function getDiscoveryListingDateBadge(input: {
  postedAt: string | null;
  postedAtText: string | null;
  providerUpdatedAt: string | null;
}): { rankable: boolean; shown: boolean; text: string } {
  if (!input.postedAt && !input.postedAtText && !input.providerUpdatedAt) {
    return { rankable: false, shown: false, text: "" };
  }

  const listingDate = getPostedDateLabel(input);
  const recency = getDiscoveryListingRecencyKey(input);
  const unrankedRelativeLabel =
    recency.basis === null && Boolean(input.postedAtText?.trim());

  return {
    rankable: recency.basis !== null,
    shown: true,
    text: `${listingDate.label} ${listingDate.value}${unrankedRelativeLabel ? " · not date-ranked" : ""}`,
  };
}

function getSelectedJobPage(
  jobs: readonly SavedJob[],
  selectedJobId: string | null,
): number {
  if (!selectedJobId) {
    return 0;
  }

  const selectedIndex = jobs.findIndex((job) => job.id === selectedJobId);
  return selectedIndex < 0
    ? 0
    : Math.floor(selectedIndex / DISCOVERY_RESULTS_PAGE_SIZE);
}

function RecoveryCallout(props: {
  description: string;
  onRecoveryAction?: (() => void) | null;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
}) {
  const recoveryActionProps = props.onRecoveryAction
    ? { onClick: props.onRecoveryAction }
    : {};
  const recoveryPendingProps = props.recoveryActionPending
    ? { pending: true }
    : {};

  return (
    <div
      aria-atomic="true"
      className="rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--warning-text)"
      role="alert"
    >
      <p>{props.description}</p>
      {props.recoveryActionLabel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            type="button"
            variant="primary"
            {...recoveryActionProps}
            {...recoveryPendingProps}
          >
            {props.recoveryActionLabel}
          </Button>
          <span className="text-(length:--text-small) opacity-80">
            {props.recoveryActionNextStep ?? "Then search again."}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function ResultsEmptyState(props: {
  actionHref?: string | null;
  className?: string;
  description: string;
  onRecoveryAction?: (() => void) | null;
  recoveryActionLabel?: string | null;
  recoveryActionNextStep?: string | null;
  recoveryActionPending?: boolean;
  title: string;
}) {
  const emptyStateProps = props.className ? { className: props.className } : {};
  const recoveryActionProps = props.onRecoveryAction
    ? { onClick: props.onRecoveryAction }
    : {};
  const recoveryPendingProps = props.recoveryActionPending
    ? { pending: true }
    : {};
  const actionButton = props.recoveryActionLabel ? (
    props.actionHref ? (
      <Button asChild size="sm" type="button" variant="primary">
        <Link to={props.actionHref}>{props.recoveryActionLabel}</Link>
      </Button>
    ) : (
      <Button
        size="sm"
        type="button"
        variant="primary"
        {...recoveryActionProps}
        {...recoveryPendingProps}
      >
        {props.recoveryActionLabel}
      </Button>
    )
  ) : null;

  return (
    <div className="grid gap-4">
      <EmptyState
        description={props.description}
        title={props.title}
        {...emptyStateProps}
      />
      {props.recoveryActionLabel ? (
        <div className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--warning-border) bg-(--warning-surface) px-4 py-4 text-left text-(length:--text-description) text-(--warning-text)">
          <div className="grid gap-1">
            <p className="font-medium">Next step</p>
            <p className="leading-6">
              {props.recoveryActionNextStep ??
                `Open ${JOB_FINDER_BROWSER_NAME}, then search again.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{actionButton}</div>
        </div>
      ) : null}
    </div>
  );
}

export function DiscoveryResultsPanel({
  alsoFoundCount = 0,
  areAlsoFoundShown = false,
  browserSession,
  discoveryTargets = [],
  emptyClassName,
  facetScopeId = null,
  hasCompletedSearch = false,
  hiddenAlsoFoundCount = 0,
  isSearchInProgress = false,
  jobs,
  latestRunVerdict = null,
  onDisplayedSelectedJobIdChange,
  onRecoveryAction,
  onShowAlsoFound,
  onToggleAlsoFound,
  onSelectJob,
  recoveryActionLabel,
  recoveryActionNextStep,
  recoveryActionPending = false,
  searchSetupBlocker = null,
  selectedJob,
}: DiscoveryResultsPanelProps) {
  const resultsScrollRegionRef = useRef<HTMLDivElement | null>(null);
  const runtimeProjection = getDiscoveryRuntimeProjection(browserSession);
  const isOfflineRuntime = runtimeProjection.isOffline;
  const view = usePersistedCollectionView("discovery-results", "comfortable");
  // Two row shapes, two options. A third density produced a visibly different
  // row layout for the same list, so a stored "detailed" normalizes back to
  // the comfortable row instead of stranding an unreachable state.
  const density = view.density === "detailed" ? "comfortable" : view.density;
  const deferredQuery = useDeferredValue(view.query);
  // One bounded snapshot read per mount feeds every facet's initial value;
  // route remounts re-read it, which is what makes selections survive
  // navigation and restarts. The scope key keeps each search plan's filters
  // separate.
  const facetScopeKey = normalizeFacetScopeKey(facetScopeId);
  const [persistedFacetFilters] = useState(() =>
    readScopedFacetFilters(facetScopeKey),
  );
  const [recommendationFilters, setRecommendationFilters] = useState<
    ReadonlySet<string>
  >(() => new Set(persistedFacetFilters.recommendation));
  const [sourceFilters, setSourceFilters] = useState<ReadonlySet<string>>(
    () => new Set(persistedFacetFilters.source),
  );
  const [workModeFilters, setWorkModeFilters] = useState<ReadonlySet<string>>(
    () => new Set(persistedFacetFilters.workMode),
  );
  const [activityFilters, setActivityFilters] = useState<ReadonlySet<string>>(
    () => new Set(persistedFacetFilters.activity),
  );
  const sourceLabelsByJobId = useMemo(
    () =>
      new Map(
        jobs.map((job) => {
          const labels = getDiscoverySourceLabels(
            job.provenance ?? [],
            discoveryTargets,
          );
          return [
            job.id,
            labels.length > 0 ? labels : [SOURCE_UNAVAILABLE_FILTER],
          ] as const;
        }),
      ),
    [discoveryTargets, jobs],
  );
  const recommendationOptions = useMemo(
    () =>
      fitRecommendationValues.filter((value) =>
        jobs.some(
          (job) =>
            (job.matchAssessment.recommendation ?? "review_before_applying") ===
            value,
        ),
      ),
    [jobs],
  );
  const sourceOptions = useMemo(
    () =>
      [...new Set([...sourceLabelsByJobId.values()].flat())].sort(
        (left, right) =>
          left.localeCompare(right, "en", { sensitivity: "base" }),
      ),
    [sourceLabelsByJobId],
  );
  const workModeOptions = useMemo(
    () => [
      ...workModeValues.filter((value) =>
        jobs.some((job) => job.workMode.includes(value)),
      ),
      ...(jobs.some((job) => job.workMode.length === 0)
        ? [WORK_MODE_UNSPECIFIED_FILTER]
        : []),
    ],
    [jobs],
  );
  // Restored selections stay active only while they name an option still
  // present in the current result set ("restore only what is still valid").
  // An empty result set defines no scope, so pruning waits until results
  // exist rather than wiping restored selections during transient loads.
  // Options derive from the unfiltered scoped collection, and re-running on
  // facet changes heals values restored by a plan switch or named view; the
  // same-reference no-op keeps this from looping.
  useEffect(() => {
    if (jobs.length === 0) return;
    const recommendationScope = new Set(recommendationOptions);
    const sourceScope = new Set(sourceOptions);
    const workModeScope = new Set(workModeOptions);
    setRecommendationFilters((current) =>
      pruneFilterSelection(current, recommendationScope),
    );
    setSourceFilters((current) => pruneFilterSelection(current, sourceScope));
    setWorkModeFilters((current) =>
      pruneFilterSelection(current, workModeScope),
    );
  }, [
    jobs.length,
    recommendationFilters,
    recommendationOptions,
    sourceFilters,
    sourceOptions,
    workModeFilters,
    workModeOptions,
  ]);
  // The scoped snapshot mirrors state on every change, so Clear filters and
  // plan switches stay truthful: what is active is exactly what is stored
  // for the current scope. The ref guard skips the transient commit between
  // a scope change and its restore, so one plan's facets can never flash
  // into another plan's stored snapshot.
  useEffect(() => {
    if (lastFacetScopeRef.current !== facetScopeKey) return;
    writeScopedFacetFilters(facetScopeKey, {
      activity: [...activityFilters],
      recommendation: [...recommendationFilters],
      source: [...sourceFilters],
      workMode: [...workModeFilters],
    });
  }, [
    activityFilters,
    facetScopeKey,
    recommendationFilters,
    sourceFilters,
    workModeFilters,
  ]);
  const activeFilterCount =
    recommendationFilters.size +
    sourceFilters.size +
    workModeFilters.size +
    activityFilters.size;
  const filteredJobs = useMemo(() => {
    if (
      deferredQuery.trim() === "" &&
      recommendationFilters.size === 0 &&
      sourceFilters.size === 0 &&
      workModeFilters.size === 0 &&
      activityFilters.size === 0
    ) {
      return jobs;
    }

    return jobs.filter((job) => {
      const recommendation =
        job.matchAssessment.recommendation ?? "review_before_applying";
      const sourceLabels = sourceLabelsByJobId.get(job.id) ?? [
        SOURCE_UNAVAILABLE_FILTER,
      ];
      const workModes =
        job.workMode.length > 0 ? job.workMode : [WORK_MODE_UNSPECIFIED_FILTER];
      const activity = getListingActivity(job);

      return (
        (recommendationFilters.size === 0 ||
          recommendationFilters.has(recommendation)) &&
        (sourceFilters.size === 0 ||
          sourceLabels.some((label) => sourceFilters.has(label))) &&
        (workModeFilters.size === 0 ||
          workModes.some((workMode) => workModeFilters.has(workMode))) &&
        (activityFilters.size === 0 || activityFilters.has(activity.status)) &&
        matchesCollectionSearch(deferredQuery, [
          job.title,
          job.company,
          job.location,
          job.salaryText,
          job.status,
          job.applyPath,
          ...job.workMode,
          fitRecommendationCopy[recommendation].label,
          presentListingActivity(activity).label,
        ])
      );
    });
  }, [
    activityFilters,
    deferredQuery,
    jobs,
    recommendationFilters,
    sourceFilters,
    sourceLabelsByJobId,
    workModeFilters,
  ]);
  const resultsSort = useDiscoveryResultsSort();
  const sortDirection = resultsSort.sort.direction;
  const sortField = resultsSort.sort.field;
  // The default fit ranking arrives pre-sorted from the discovery screen, so
  // skip re-sorting (and re-allocating) the full result set entirely.
  const orderedJobs = useMemo(() => {
    if (sortDirection === "desc" && sortField === "fit") {
      return filteredJobs;
    }
    return filteredJobs
      .map((job, sourceIndex) => ({ job, sourceIndex }))
      .sort((left, right) =>
        compareDiscoveryResults(
          left.job,
          right.job,
          resultsSort.sort,
          left.sourceIndex,
          right.sourceIndex,
        ),
      )
      .map((entry) => entry.job);
  }, [filteredJobs, resultsSort.sort, sortDirection, sortField]);
  const jobCount = filteredJobs.length;
  const pageCount = Math.max(
    1,
    Math.ceil(jobCount / DISCOVERY_RESULTS_PAGE_SIZE),
  );
  const selectedJobId = selectedJob?.id ?? null;
  const [pagination, setPagination] = useState(() => ({
    page: getSelectedJobPage(orderedJobs, selectedJobId),
    selectedJobId,
  }));
  // Tracks which plan scope the facet state currently mirrors so the restore
  // effect above only fires on real scope changes.
  const lastFacetScopeRef = useRef(facetScopeKey);
  const currentPage = Math.min(Math.max(0, pagination.page), pageCount - 1);
  const visibleJobs = useMemo(
    () => getDiscoveryResultsPage(orderedJobs, currentPage),
    [currentPage, orderedJobs],
  );
  // Band dividers only make sense while the list is in its canonical
  // best-match order; any other sort re-interleaves the bands. Headings are
  // built from the rows actually on screen so every page keeps its dividers
  // and each count describes the rows under it rather than the whole set.
  const groupHeadingOptions = useMemo(
    () => ({
      ranked: sortDirection === "desc" && sortField === "fit",
      // The whole ranked list with a page window, never the page slice alone:
      // a divider counts the whole run it names, so a band split across pages
      // reports the same total as the also-found control beside it.
      window: {
        end: (currentPage + 1) * DISCOVERY_RESULTS_PAGE_SIZE,
        start: currentPage * DISCOVERY_RESULTS_PAGE_SIZE,
      },
    }),
    [currentPage, sortDirection, sortField],
  );
  const groupHeadingsByJobId = useMemo(
    () =>
      buildDiscoveryResultGroupHeadings(
        orderedJobs,
        groupHeadingOptions.ranked,
        { window: groupHeadingOptions.window },
      ),
    [groupHeadingOptions, orderedJobs],
  );
  // Which divider each row actually sits under, so a row can stay quiet about
  // a claim the divider above it already makes — and only then.
  const headedGroupByJobId = useMemo(
    () =>
      buildDiscoveryHeadedGroupByJobId(
        orderedJobs,
        groupHeadingOptions.ranked,
        { window: groupHeadingOptions.window },
      ),
    [groupHeadingOptions, orderedJobs],
  );
  // The inspector is a sibling pane, so this panel owns the truth about which
  // job is actually on screen. When the selection falls off the visible page
  // through pagination, search, or sorting, the displayed (inspected) job
  // synchronizes to the top of what is actually shown instead of silently
  // describing a row the user cannot see.
  const displayedSelectedJobId = visibleJobs.some(
    (job) => job.id === selectedJobId,
  )
    ? selectedJobId
    : (visibleJobs[0]?.id ?? null);

  useLayoutEffect(() => {
    if (pagination.selectedJobId === selectedJobId) {
      return;
    }

    const selectedJobPage = getSelectedJobPage(orderedJobs, selectedJobId);
    setPagination({
      page: selectedJobPage,
      selectedJobId,
    });
    if (selectedJobPage !== currentPage && resultsScrollRegionRef.current) {
      resultsScrollRegionRef.current.scrollTop = 0;
    }
  }, [currentPage, orderedJobs, pagination.selectedJobId, selectedJobId]);

  // Report after the page-snap effect so a freshly opened deep-linked page is
  // reported in its final position.
  const reportedDisplayedSelectionRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!onDisplayedSelectedJobIdChange) {
      return;
    }
    if (reportedDisplayedSelectionRef.current === displayedSelectedJobId) {
      return;
    }
    reportedDisplayedSelectionRef.current = displayedSelectedJobId;
    onDisplayedSelectedJobIdChange(displayedSelectedJobId);
  }, [displayedSelectedJobId, onDisplayedSelectedJobIdChange]);

  const firstVisibleJobNumber =
    jobCount === 0 ? 0 : currentPage * DISCOVERY_RESULTS_PAGE_SIZE + 1;
  const lastVisibleJobNumber = Math.min(
    jobCount,
    firstVisibleJobNumber + visibleJobs.length - 1,
  );

  const moveToPage = useCallback((page: number) => {
    setPagination((current) => ({
      ...current,
      page,
    }));
    if (resultsScrollRegionRef.current) {
      resultsScrollRegionRef.current.scrollTop = 0;
    }
  }, []);
  const clearFilters = useCallback(() => {
    setRecommendationFilters(new Set());
    setSourceFilters(new Set());
    setWorkModeFilters(new Set());
    setActivityFilters(new Set());
    moveToPage(0);
  }, [moveToPage]);

  // Revealing or hiding the also-found pool must visibly change the list. On
  // any page but the first, the revealed rows join the end of the ranking and
  // nothing on screen moves, so the control reads as a no-op. Returning to the
  // first page keeps the pressed state, the label, and the list in agreement.
  const lastAlsoFoundShownRef = useRef(areAlsoFoundShown);
  useEffect(() => {
    if (lastAlsoFoundShownRef.current === areAlsoFoundShown) return;
    lastAlsoFoundShownRef.current = areAlsoFoundShown;
    moveToPage(0);
  }, [areAlsoFoundShown, moveToPage]);

  // Switching the active search plan swaps in that plan's own facets; the
  // prune and snapshot effects then validate and persist them under the new
  // scope, so nothing leaks between plans.
  useEffect(() => {
    if (lastFacetScopeRef.current === facetScopeKey) return;
    lastFacetScopeRef.current = facetScopeKey;
    const scoped = readScopedFacetFilters(facetScopeKey);
    setRecommendationFilters(new Set(scoped.recommendation));
    setSourceFilters(new Set(scoped.source));
    setWorkModeFilters(new Set(scoped.workMode));
    setActivityFilters(new Set(scoped.activity));
    moveToPage(0);
  }, [facetScopeKey, moveToPage]);

  const sessionNeedsAttention =
    !isOfflineRuntime &&
    (browserSession.status === "login_required" ||
      browserSession.status === "blocked");
  const sessionWaitingOnRuntime =
    browserSession.status === "unknown" &&
    browserSession.driver !== "catalog_seed" &&
    recoveryActionPending;
  const allResultsHidden = jobs.length === 0 && hiddenAlsoFoundCount > 0;
  // Three populations, one arithmetic. Title-only rows are never hidden
  // behind the also-found reveal, so every one of them is already in `jobs`
  // and counting them here yields the same population the bands, the Home
  // badge, and the dividers all derive from.
  const titleMatchCount = countDiscoveryUncheckedResults(jobs);
  // The honest headline: how many results are actually worth opening. Weaker
  // rows and clear mismatches are one "also found" pool, and rows checked no
  // further than their title are their own band; neither is ever added into
  // the number that describes the search.
  const strongMatchCount = Math.max(
    0,
    jobs.length - (alsoFoundCount - hiddenAlsoFoundCount) - titleMatchCount,
  );
  const bandCounts = {
    worthOpening: strongMatchCount,
    titleMatches: titleMatchCount,
    alsoFound: alsoFoundCount,
  };
  const isCountFiltered =
    deferredQuery.trim().length > 0 || activeFilterCount > 0;
  const resultCountLabel = isCountFiltered
    ? `${filteredJobs.length} of ${jobs.length} results`
    : formatDiscoveryResultBandLabel(bandCounts);
  // Home and Search history describe the same run as "n new jobs saved". This
  // states the total the bands add up to, so the two vocabularies visibly
  // reconcile instead of reading as three different numbers.
  const resultCountTotalLabel =
    !isCountFiltered && (alsoFoundCount > 0 || titleMatchCount > 0)
      ? formatDiscoveryResultBandTotal(bandCounts)
      : null;
  // Terminal empty-state truth: prefer the explicit newest-run verdict; when a
  // caller does not provide one, fall back to the legacy completed-search flag
  // so existing behavior is unchanged.
  const emptyRunVerdict: DiscoveryLatestRunVerdict =
    latestRunVerdict ??
    (hasCompletedSearch ? { kind: "completed" } : { kind: "none" });
  const showSearchingEmptyState =
    isSearchInProgress || emptyRunVerdict.kind === "running";
  // Box metrics for a continuous list row: the one treatment shared with
  // Shortlisted and Applications. The shared `SelectableRow` primitive owns
  // selection (tint plus an inset accent bar that consumes no layout space);
  // `jobFinderListRowClassName` only turns its default card shape into this
  // flush, bottom-ruled row. Nothing here varies with selection, which is what
  // the primitive's dev-time guard enforces.
  const baseButtonClasses = jobFinderListRowClassName;
  const densityClasses =
    density === "compact" ? jobFinderListRowCompactClassName : null;
  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, jobId: string) => {
      const nextId = getAdjacentCollectionItemId(
        orderedJobs.map((job) => job.id),
        jobId,
        event.key,
      );
      if (!nextId) return;

      const nextIndex = orderedJobs.findIndex((job) => job.id === nextId);
      const nextPage = Math.floor(nextIndex / DISCOVERY_RESULTS_PAGE_SIZE);
      event.preventDefault();
      if (nextPage !== currentPage) {
        moveToPage(nextPage);
      }
      onSelectJob(nextId);
      // Scoped to the results scroll region so the deferred frame can never
      // land focus in another surface's rows.
      focusCollectionItem(nextId, {
        region: resultsScrollRegionRef.current,
      });
    },
    [currentPage, moveToPage, onSelectJob, orderedJobs],
  );

  return (
    <section
      aria-labelledby="discovery-job-results-heading"
      className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-(--surface-panel-border) xl:h-full xl:min-h-0"
    >
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-(--surface-panel-border) px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            className="text-(--text-headline)"
            id="discovery-job-results-heading"
          >
            Job results
          </h2>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="text-(length:--text-small) tabular-nums text-foreground-muted"
            data-testid="discovery-result-count"
          >
            {resultCountLabel}
            {/* Visible, not sr-only: this is the sentence that reconciles the
                banded headline with the "kept" count Home prints. */}
            {resultCountTotalLabel ? (
              <span> · {resultCountTotalLabel}</span>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* One reveal control for one pool. Its accessible name is exactly
              its visible label, so the state a user reads is the state
              assistive technology and automation report. */}
          {alsoFoundCount > 0 && jobs.length > 0 && onToggleAlsoFound ? (
            <Button
              aria-pressed={areAlsoFoundShown}
              className="shrink-0 whitespace-nowrap"
              data-testid="discovery-toggle-also-found"
              onClick={onToggleAlsoFound}
              size="xs"
              type="button"
              variant={areAlsoFoundShown ? "secondary" : "outline"}
            >
              {areAlsoFoundShown
                ? `Hide also found (${alsoFoundCount})`
                : `Show also found (${alsoFoundCount})`}
            </Button>
          ) : null}
        </div>
      </header>

      {jobs.length > 0 ? (
        <>
          <CollectionSearchToolbar
            compact
            densities={DISCOVERY_RESULT_DENSITIES}
            density={density}
            hideCompactCount
            label="Find a job"
            onDensityChange={view.setDensity}
            onQueryChange={(query) => {
              view.setQuery(query);
              moveToPage(0);
            }}
            placeholder="Search results"
            placement="panel"
            query={view.query}
            totalCount={jobs.length}
            visibleCount={filteredJobs.length}
          />
          {/* Two control groups on one row instead of four spread over two:
              the filter disclosure no longer sits alone with ~940px of empty
              row beside it, and sorting is where the filtering is. */}
          <div
            className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-(--surface-panel-border) px-4 py-2"
            data-testid="discovery-results-toolbar"
          >
            <details className="group relative min-w-0 [&[open]]:w-full [&[open]]:order-last">
              {/* `--control-border` rather than the inert
                  `--surface-panel-border`: this border is the disclosure's
                  entire boundary, so it has to read as a control beside the
                  sort field and direction toggle. */}
              <summary
                className={cn(
                  DISCOVERY_RESULTS_TOOLBAR_CONTROL_CLASS,
                  "flex w-fit cursor-pointer list-none items-center gap-2 whitespace-nowrap border border-(--control-border) px-3 text-foreground-soft outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden",
                )}
              >
                Filters
                {activeFilterCount > 0 ? (
                  <span
                    aria-label={`${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`}
                    className="rounded-full bg-accent px-1.5 py-0.5 tabular-nums text-accent-foreground"
                  >
                    {activeFilterCount}
                  </span>
                ) : null}
              </summary>
              <div className="mt-2 grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) p-3 sm:grid-cols-2 xl:grid-cols-4">
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold text-foreground">
                    Recommendation
                  </legend>
                  <div className="grid gap-2">
                    {recommendationOptions.map((recommendation) => (
                      <label
                        className="flex min-w-0 items-start gap-2 text-xs leading-6 text-foreground-soft"
                        key={recommendation}
                      >
                        <input
                          checked={recommendationFilters.has(recommendation)}
                          className="size-6 shrink-0 accent-current"
                          onChange={() => {
                            setRecommendationFilters((current) =>
                              toggleFilterValue(current, recommendation),
                            );
                            moveToPage(0);
                          }}
                          type="checkbox"
                        />
                        <span className="min-w-0 break-words">
                          {fitRecommendationCopy[recommendation].label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold text-foreground">
                    Source
                  </legend>
                  <div className="grid max-h-32 gap-2 overflow-y-auto">
                    {sourceOptions.map((source) => (
                      <label
                        className="flex min-w-0 items-start gap-2 text-xs leading-6 text-foreground-soft"
                        key={source}
                        title={source}
                      >
                        <input
                          checked={sourceFilters.has(source)}
                          className="size-6 shrink-0 accent-current"
                          onChange={() => {
                            setSourceFilters((current) =>
                              toggleFilterValue(current, source),
                            );
                            moveToPage(0);
                          }}
                          type="checkbox"
                        />
                        <span className="min-w-0 break-words">{source}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold text-foreground">
                    Work mode
                  </legend>
                  <div className="grid gap-2">
                    {workModeOptions.map((workMode) => (
                      <label
                        className="flex min-w-0 items-start gap-2 text-xs leading-6 text-foreground-soft"
                        key={workMode}
                      >
                        <input
                          checked={workModeFilters.has(workMode)}
                          className="size-6 shrink-0 accent-current"
                          onChange={() => {
                            setWorkModeFilters((current) =>
                              toggleFilterValue(current, workMode),
                            );
                            moveToPage(0);
                          }}
                          type="checkbox"
                        />
                        <span className="min-w-0 break-words">
                          {workMode === WORK_MODE_UNSPECIFIED_FILTER
                            ? workMode
                            : formatWorkModeLabel(workMode as WorkMode)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold text-foreground">
                    Listing activity
                  </legend>
                  <div className="grid gap-2">
                    {listingActivityStatuses.map((status) => (
                      <label
                        className="flex min-w-0 items-start gap-2 text-xs leading-6 text-foreground-soft"
                        key={status}
                      >
                        <input
                          checked={activityFilters.has(status)}
                          className="size-6 shrink-0 accent-current"
                          onChange={() => {
                            setActivityFilters((current) =>
                              toggleFilterValue(current, status),
                            );
                            moveToPage(0);
                          }}
                          type="checkbox"
                        />
                        <span>{formatStatusLabel(status)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {activeFilterCount > 0 ? (
                  <div className="sm:col-span-2 xl:col-span-4">
                    <Button
                      onClick={clearFilters}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : null}
              </div>
            </details>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <select
                aria-label="Sort results"
                className={cn(
                  DISCOVERY_RESULTS_TOOLBAR_CONTROL_CLASS,
                  "min-w-0 max-w-full border border-(--field-border) bg-(--field) px-2 text-foreground-soft outline-none focus-visible:border-(--field-focus-border) focus-visible:bg-(--field-strong) focus-visible:shadow-[var(--field-focus-shadow)]",
                )}
                onChange={(event) => {
                  const match = DISCOVERY_RESULTS_SORT_OPTIONS.find(
                    (option) => option.field === event.target.value,
                  );
                  if (!match) return;
                  resultsSort.setSortField(match.field);
                  moveToPage(0);
                }}
                value={sortField}
              >
                {DISCOVERY_RESULTS_SORT_OPTIONS.map((option) => (
                  <option key={option.field} value={option.field}>
                    {option.label}
                  </option>
                ))}
              </select>
              {/* A lone arrow says nothing about what it reorders, so the
                    direction is spelled out beside it. */}
              <Button
                aria-label={
                  sortDirection === "desc"
                    ? "Sort direction: highest first. Select to sort lowest first."
                    : "Sort direction: lowest first. Select to sort highest first."
                }
                className={cn(
                  DISCOVERY_RESULTS_TOOLBAR_CONTROL_CLASS,
                  "whitespace-nowrap",
                )}
                onClick={() => {
                  resultsSort.toggleSortDirection();
                  moveToPage(0);
                }}
                size="compact"
                type="button"
                variant="outline"
              >
                {sortDirection === "desc" ? (
                  <ArrowDown aria-hidden="true" className="size-3.5" />
                ) : (
                  <ArrowUp aria-hidden="true" className="size-3.5" />
                )}
                <span aria-hidden="true">
                  {sortDirection === "desc" ? "Highest first" : "Lowest first"}
                </span>
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {allResultsHidden ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description={`The ${hiddenAlsoFoundCount === 1 ? "result scored" : `${hiddenAlsoFoundCount} results scored`} well below your saved targets, or conflict with them. Nothing was deleted.`}
            {...(onShowAlsoFound !== undefined
              ? { onRecoveryAction: onShowAlsoFound }
              : {})}
            recoveryActionLabel={`Show also found (${hiddenAlsoFoundCount})`}
            recoveryActionNextStep="Open a job to judge it yourself; a low score alone is not a reason to skip it."
            title="Nothing scored close to your targets"
          />
        </div>
      ) : null}

      {!allResultsHidden && searchSetupBlocker && jobs.length === 0 ? (
        <div className="px-5 pt-4" id={DISCOVERY_SEARCH_SETUP_BLOCKER_ID}>
          <ResultsEmptyState
            actionHref={
              searchSetupBlocker.actionHref ?? JOB_FINDER_ROUTE_PATHS.profile
            }
            className={emptyClassName ?? "min-h-56"}
            description={searchSetupBlocker.description}
            recoveryActionLabel={
              searchSetupBlocker.actionLabel ?? "Edit search in Profile"
            }
            recoveryActionNextStep={
              searchSetupBlocker.nextStep ?? "Then search again."
            }
            title={searchSetupBlocker.title}
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      showSearchingEmptyState &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description="Results will appear here as each saved source finishes. You can follow the live run in Search history."
            title="Searching your sources"
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !showSearchingEmptyState &&
      isOfflineRuntime &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            actionHref={JOB_FINDER_ROUTE_PATHS.profileSources}
            className="min-h-0 py-4"
            description={DISCOVERY_OFFLINE_SETUP_NOTICE}
            recoveryActionLabel="Review job sources"
            recoveryActionNextStep="Review saved sources in Profile; this catalog cannot search current openings."
            title="Live source search unavailable"
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      sessionNeedsAttention &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description={`Open ${JOB_FINDER_BROWSER_NAME}, sign in or fix the issue, then search again.`}
            title="Search blocked by browser"
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined
              ? { recoveryActionLabel }
              : {})}
            {...(recoveryActionNextStep !== undefined
              ? { recoveryActionNextStep }
              : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !isSearchInProgress &&
      sessionWaitingOnRuntime &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description="New results will appear here after browser-based sources are ready."
            title="Browser is starting"
          />
        </div>
      ) : null}

      {sessionNeedsAttention && jobs.length > 0 ? (
        <div className="px-5 py-4">
          <RecoveryCallout
            description={`You're viewing results from the last completed search. Open ${JOB_FINDER_BROWSER_NAME} when you're ready to run a new one.`}
            {...(onRecoveryAction !== undefined ? { onRecoveryAction } : {})}
            {...(recoveryActionLabel !== undefined
              ? { recoveryActionLabel }
              : {})}
            {...(recoveryActionNextStep !== undefined
              ? { recoveryActionNextStep }
              : {})}
            {...(recoveryActionPending ? { recoveryActionPending: true } : {})}
          />
        </div>
      ) : null}

      {sessionWaitingOnRuntime && jobs.length > 0 ? (
        <div className="px-5 py-4">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            role="status"
          >
            You're viewing results from the last completed search while the
            browser gets ready.
          </div>
        </div>
      ) : null}

      {isOfflineRuntime && jobs.length > 0 ? (
        <div className="px-5 py-4">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="min-w-0 break-words rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            id={DISCOVERY_OFFLINE_CATALOG_NOTICE_ID}
            role="status"
          >
            <strong>Offline catalog · review-only.</strong>{" "}
            {DISCOVERY_OFFLINE_SETUP_NOTICE}
          </div>
        </div>
      ) : null}

      {isSearchInProgress && jobs.length > 0 ? (
        <div className="px-5 py-4">
          <div
            aria-atomic="true"
            aria-live="polite"
            className="rounded-(--radius-panel) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            role="status"
          >
            <strong>
              {getDiscoveryProgressCountLabel(filteredJobs.length, jobs.length)}
            </strong>{" "}
            Search is still checking the remaining sources; stronger matches may
            move to the top.
          </div>
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !showSearchingEmptyState &&
      !isOfflineRuntime &&
      !sessionNeedsAttention &&
      !sessionWaitingOnRuntime &&
      emptyRunVerdict.kind === "interrupted" &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description={
              emptyRunVerdict.interruptState === "cancelled"
                ? "The newest search was cancelled before every enabled source was checked. An empty list here does not prove your sources have no matches. Select Search now to try again."
                : emptyRunVerdict.interruptState === "sources_failed"
                  ? "The newest search finished, but at least one enabled source failed, so an empty list here does not prove your sources have no matches. Select Search now to try again."
                  : "The newest search stopped before every enabled source was checked. An empty list here does not prove your sources have no matches. Select Search now to try again."
            }
            title={
              emptyRunVerdict.interruptState === "cancelled"
                ? "The last search was cancelled"
                : emptyRunVerdict.interruptState === "sources_failed"
                  ? "The last search finished, but sources failed"
                  : "The last search stopped before finishing"
            }
          />
          {emptyRunVerdict.hasEarlierCompleted ? (
            <div
              aria-atomic="true"
              aria-live="polite"
              className="mt-3 rounded-(--radius-field) border border-(--info-border) bg-(--info-surface) px-3 py-2.5 text-(length:--text-description) leading-6 text-(--info-text)"
              role="status"
            >
              An earlier completed search exists behind this stopped attempt,
              but it is not on screen right now.
            </div>
          ) : null}
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !showSearchingEmptyState &&
      !sessionNeedsAttention &&
      !sessionWaitingOnRuntime &&
      !isOfflineRuntime &&
      emptyRunVerdict.kind === "completed" &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            actionHref={JOB_FINDER_ROUTE_PATHS.profileTargetRoles}
            className={emptyClassName ?? "min-h-56"}
            description="No saved source returned a role that met this search. Broaden a role or location, enable another source, then run it again."
            recoveryActionLabel="Broaden search"
            recoveryActionNextStep="Review roles, locations, and enabled sources, then return here and search again."
            title="No matches from this search"
          />
        </div>
      ) : null}

      {!allResultsHidden &&
      !searchSetupBlocker &&
      !showSearchingEmptyState &&
      !sessionNeedsAttention &&
      !sessionWaitingOnRuntime &&
      !isOfflineRuntime &&
      emptyRunVerdict.kind === "none" &&
      jobs.length === 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-56"}
            description="Your search setup is ready. Select Search now to check every enabled source."
            title="Ready for your first search"
          />
        </div>
      ) : null}

      {jobs.length > 0 && filteredJobs.length === 0 && activeFilterCount > 0 ? (
        <div className="px-5 pt-4">
          <ResultsEmptyState
            className={emptyClassName ?? "min-h-48"}
            description="No saved result meets every active filter. Nothing was removed."
            onRecoveryAction={clearFilters}
            recoveryActionLabel="Clear filters"
            recoveryActionNextStep="Review the complete result list, then apply a broader filter if needed."
            title="No jobs match these filters"
          />
        </div>
      ) : jobs.length > 0 && filteredJobs.length === 0 ? (
        <CollectionNoMatches
          noun="jobs"
          onClear={() => view.setQuery("")}
          query={view.query}
        />
      ) : null}

      {filteredJobs.length > 0 ? (
        // Below the two-pane breakpoint the results panel and the inspector
        // share one page scroller, so the list must take its content height:
        // a short result set that stretches to the viewport leaves hundreds of
        // pixels of empty bordered area that reads as a loading failure and
        // pushes the inspector — and its primary action — off screen.
        <div
          className="flex min-h-0 flex-col overflow-hidden xl:flex-1"
          data-job-results-stack
        >
          <div
            aria-label="Job results list"
            // The scroll padding keeps the last card clear of the two-pane
            // scroller's bottom edge. Below that breakpoint the list has no
            // scroller of its own and takes its content height, so the same
            // padding is only an empty grey strip under the last result.
            className="min-h-0 overflow-y-auto overscroll-contain xl:flex-1 xl:pb-8"
            data-locked-pane-scroll-region
            data-job-results-scroll-region
            ref={resultsScrollRegionRef}
            role="region"
            tabIndex={0}
          >
            <ul
              aria-label="Results"
              className={cn(jobFinderListRegionClassName, "xl:min-h-full")}
            >
              {visibleJobs.map((job) => {
                const isSelected = displayedSelectedJobId === job.id;
                const recommendation =
                  fitRecommendationCopy[
                    job.matchAssessment.recommendation ??
                      "review_before_applying"
                  ];
                const assessment = getMatchAssessmentPresentation(job);
                // A title-only row sitting under the rendered "Title matches ·
                // not yet checked" divider would otherwise repeat that exact
                // claim twice more — "Title match only" plus a two-line
                // caption — on every row of a band that can be the whole list.
                // The divider states it once for the run; the row drops the
                // visible restatement and keeps an assistive-technology line,
                // because a row button is reachable by keyboard without ever
                // reading the divider. Provisional rows share this band but
                // not its claim, so they keep their own verdict, and a
                // title-only row banded as a mismatch keeps it too: no divider
                // above it says the title was all that was read.
                const isCoveredByUncheckedBand =
                  assessment.isTitleOnly &&
                  // An unbound assessment is title-only by evidence depth but
                  // presents as "Fit not assessed", which is a different claim
                  // from the one the divider makes; it keeps its own verdict.
                  !assessment.isProvisional &&
                  headedGroupByJobId.get(job.id) === "unchecked";
                // One sentence on the row saying why: what is missing when the
                // score is withheld, otherwise the hard-conflict reason. Rows
                // whose score stands on its own evidence stay quiet.
                const rowReason =
                  assessment.withheldReason ??
                  (job.matchAssessment.recommendation === "skip"
                    ? scrubJobAbsencePlaceholders(
                        job.matchAssessment.recommendationRationale ?? "",
                      ) || null
                    : null);
                const listingDateBadge = getDiscoveryListingDateBadge(job);
                const listingDateExplanation = listingDateBadge.shown
                  ? listingDateBadge.rankable
                    ? undefined
                    : "The source shows a posting label without a full date, so Newest cannot rank this listing by its posting date."
                  : undefined;
                const sourceLabels = sourceLabelsByJobId.get(job.id) ?? [];
                const sourceText =
                  sourceLabels.length > 0
                    ? sourceLabels.join(", ")
                    : "Source unavailable";
                // A careers-site source repeats the employer's own name; the
                // meta line then read "Canonical • Remote · Canonical".
                const sourceRepeatsEmployer =
                  sourceLabels.length === 1 &&
                  Boolean(job.company) &&
                  sourceLabels[0]?.trim().toLowerCase() ===
                    job.company?.trim().toLowerCase();
                const listingActivity = getListingActivity(job);
                const activity = presentListingActivity(listingActivity);
                const activityDescription =
                  listingActivity.status === "inactive"
                    ? `Not found in a source inventory observation on ${activity.observedDate}. This does not prove the listing is closed. ${listingActivity.explanation}`
                    : activity.description;

                const groupHeading = groupHeadingsByJobId.get(job.id);

                return (
                  <li key={job.id} className="min-w-0">
                    {groupHeading ? (
                      <div
                        className="grid gap-1 border-y border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-2.5"
                        data-testid={`discovery-results-group-${groupHeading.id}`}
                      >
                        <span className="text-(length:--text-small) font-semibold text-(--text-headline)">
                          {groupHeading.label} ({groupHeading.count})
                        </span>
                        <span className="text-(length:--text-tiny) leading-5 text-foreground-soft">
                          {groupHeading.description}
                        </span>
                      </div>
                    ) : null}
                    <SelectableRow
                      aria-controls={DISCOVERY_DETAIL_REGION_ID}
                      data-job-result-id={job.id}
                      className={cn(baseButtonClasses, densityClasses)}
                      aria-keyshortcuts="ArrowUp ArrowDown Home End"
                      data-collection-item-id={job.id}
                      onClick={(event) => {
                        onSelectJob(job.id);
                        if (event.detail === 0) {
                          focusDiscoveryDetailAfterKeyboardSelection();
                        } else {
                          revealDiscoveryDetailAfterPointerSelection();
                        }
                      }}
                      onKeyDown={(event) => handleListKeyDown(event, job.id)}
                      selected={isSelected}
                    >
                      {/* One shared line rhythm for all three lists: title line (with
                          the one trailing badge slot), then meta, then status. */}
                      <div className={jobFinderListRowLinesClassName}>
                        <div className={jobFinderListRowTitleLineClassName}>
                          <strong
                            className={jobFinderListRowTitleClassName}
                            title={job.title}
                          >
                            {job.title}
                          </strong>
                          <div className={jobFinderListRowBadgeSlotClassName}>
                            {isCoveredByUncheckedBand ? null : (
                              <span
                                aria-label={assessment.headlineScoreAriaLabel}
                                className={cn(
                                  "text-(length:--text-small) font-semibold tabular-nums",
                                  assessment.isScoreWithheld
                                    ? "text-foreground-soft"
                                    : "text-(--text-headline)",
                                )}
                                data-testid={`discovery-result-fit-${job.id}`}
                              >
                                {assessment.headlineScoreLabel}
                              </span>
                            )}
                            {/* The default "review before applying" verdict is the
                                baseline for every row, so only a stronger or
                                weaker verdict earns a badge in the list; the
                                inspector keeps the full assessment. */}
                            {job.matchAssessment.recommendation !==
                            "review_before_applying" ? (
                              <StatusBadge
                                tone={
                                  assessment.isProvisional
                                    ? "neutral"
                                    : recommendation.tone
                                }
                              >
                                {recommendation.label}
                              </StatusBadge>
                            ) : null}
                            {assessment.isProvisional ? (
                              <Badge variant="outline">
                                Provisional assessment
                              </Badge>
                            ) : null}
                            {listingActivity.status !== "active" ? (
                              <Badge
                                aria-label={`${activity.label} listing status${activity.observedDate ? ` observed ${activity.observedDate}` : ""}. ${activityDescription}`}
                                title={activityDescription}
                                variant="outline"
                              >
                                {activity.label}
                                {activity.observedDate
                                  ? ` · ${activity.observedDate}`
                                  : ""}
                              </Badge>
                            ) : (
                              <span className="sr-only">
                                {`${activity.label} listing status${activity.observedDate ? ` observed ${activity.observedDate}` : ""}. ${activityDescription}`}
                              </span>
                            )}
                            {job.status === "shortlisted" ||
                            job.status === "submitted" ? (
                              <StatusBadge
                                tone={getApplicationTone(job.status)}
                              >
                                {formatStatusLabel(job.status)}
                              </StatusBadge>
                            ) : null}
                            {listingDateBadge.shown && density !== "compact" ? (
                              <Badge
                                {...(listingDateExplanation
                                  ? { title: listingDateExplanation }
                                  : {})}
                                variant="outline"
                              >
                                {listingDateBadge.text}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        {(() => {
                          const employerLocationLine =
                            formatJobEmployerLocationLine({
                              company: job.company,
                              location: job.location,
                              canonicalUrl: job.canonicalUrl,
                              separator: " • ",
                            });
                          // One meta line: employer and location, then the
                          // source it was found on. A source on its own line
                          // read as a second, unexplained company name.
                          // Exactly one accessible source mention per row:
                          // the visible separator is decorative and the
                          // sr-only prefix completes the sentence.
                          return (
                            <span
                              className={cn(
                                jobFinderListRowMetaClassName,
                                "flex min-w-0 items-baseline gap-1.5",
                              )}
                              {...(employerLocationLine
                                ? {}
                                : {
                                    "data-testid": `discovery-result-source-${job.id}`,
                                    title: `Employer not listed · ${sourceText}`,
                                  })}
                            >
                              <span
                                className={cn(
                                  "min-w-0 break-words",
                                  employerLocationLine
                                    ? "font-medium"
                                    : "shrink-0",
                                )}
                                data-testid={`discovery-result-employer-${job.id}`}
                                title={employerLocationLine || undefined}
                              >
                                {employerLocationLine || "Employer not listed"}
                              </span>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "shrink-0",
                                  sourceRepeatsEmployer &&
                                    employerLocationLine &&
                                    "sr-only",
                                )}
                              >
                                {" · "}
                              </span>
                              <span
                                className={cn(
                                  "flex min-w-0 max-w-[45%] shrink-0",
                                  sourceRepeatsEmployer &&
                                    employerLocationLine &&
                                    "sr-only",
                                )}
                                {...(employerLocationLine
                                  ? {
                                      "data-testid": `discovery-result-source-${job.id}`,
                                      title: `Found on ${sourceText}`,
                                    }
                                  : {})}
                              >
                                <span className="sr-only">Found on </span>
                                <span className="min-w-0 truncate">
                                  {sourceText}
                                </span>
                              </span>
                            </span>
                          );
                        })()}

                        {/* The fit verdict sits on the title line beside its
                          badge (see the badge slot above). The reason behind
                          it is a comfortable-density line only; compact rows
                          stay two lines. When the evidence behind the number
                          is only the listing title the number is withheld and
                          kept inside "How this was scored" with its evidence. */}
                        {isCoveredByUncheckedBand ? (
                          <span
                            className="sr-only"
                            data-testid={`discovery-result-fit-sr-${job.id}`}
                          >
                            {rowReason
                              ? `${assessment.headlineScoreAriaLabel}. ${rowReason}`
                              : assessment.headlineScoreAriaLabel}
                          </span>
                        ) : rowReason && density !== "compact" ? (
                          <span
                            className={cn(
                              jobFinderListRowStatusClassName,
                              "text-foreground-soft",
                            )}
                            data-testid={`discovery-result-fit-reason-${job.id}`}
                          >
                            {rowReason}
                          </span>
                        ) : null}
                      </div>

                      {/* Below xl the inspector stacks under this list, so a
                          highlighted row is the only sign that anything more
                          exists — and it sits past the fold. This names the
                          pane by its own visible heading; it does not promise
                          listing detail the app may not have read.

                          Rendered on every row so the slot is reserved and
                          selection can never reflow the list (see
                          SelectableRow), and revealed on the selected row
                          through this element's OWN `data-details-cue`.

                          That attribute, rather than a `group-data-*` variant
                          keyed on the row's selected state, is deliberate. The
                          group form left both rows carrying byte-identical
                          class strings, so whether the cue actually painted
                          depended entirely on a stylesheet the renderer tests
                          never load: a DOM query passed while every row showed
                          the cue on screen. State that decides what is painted
                          has to be observable in the DOM, so both the shown
                          and the hidden case can be pinned.

                          Decorative: the row already exposes the detail region
                          through `aria-controls`, so this is not announced a
                          second time. Nothing here scrolls — the default
                          selection is not a user action, and only an explicit
                          click reveals the detail region. */}
                      <span
                        aria-hidden="true"
                        className="invisible flex items-center gap-1 text-(length:--text-tiny) font-medium text-foreground-soft data-[details-cue=visible]:visible xl:hidden"
                        data-details-cue={isSelected ? "visible" : "hidden"}
                        data-testid={`discovery-result-details-below-${job.id}`}
                      >
                        <ChevronDown aria-hidden="true" className="size-3.5" />
                        Job details below
                      </span>
                    </SelectableRow>
                  </li>
                );
              })}
            </ul>
          </div>
          {pageCount > 1 ? (
            <nav
              aria-label="Job result pages"
              className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-(--surface-panel-border) bg-(--surface-panel) px-5 py-3"
              data-job-results-pagination
            >
              <Button
                disabled={currentPage === 0}
                onClick={() => moveToPage(Math.max(0, currentPage - 1))}
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <span
                aria-live="polite"
                className="text-center text-(length:--text-small) text-foreground-muted"
              >
                {firstVisibleJobNumber}–{lastVisibleJobNumber} of {jobCount}
              </span>
              <Button
                disabled={currentPage >= pageCount - 1}
                onClick={() =>
                  moveToPage(Math.min(pageCount - 1, currentPage + 1))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
