import { useId, useMemo } from "react";
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  DiscoveryRunRecord,
  SourceAccessPrompt,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { Ban, CircleCheck, CircleDashed, KeyRound } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";
import { DISCOVERY_PAUSED_SEARCH_REASON } from "./discovery-search-readiness";
import { formatCountLabel, getSessionTone } from "../../lib/job-finder-utils";
import {
  DiscoveryFiltersFooter,
  DiscoveryRunOneSourceSection,
  DiscoverySearchSections,
  DiscoverySessionSummary,
} from "./discovery-filters-panel-sections";
import { getDiscoverySearchReadiness } from "./discovery-search-readiness";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";

const NEUTRAL_SESSION_SNAPSHOT: BrowserSessionState = {
  source: "target_site",
  status: "unknown",
  driver: "chrome_profile_agent",
  label: "Browser optional",
  detail:
    "You can run this search without opening the browser first. Open it when you want to sign in or prepare a site before the next run.",
  lastCheckedAt: new Date(0).toISOString(),
};

interface DiscoveryFiltersPanelProps {
  activeRun: DiscoveryRunRecord | null;
  activityPaused?: boolean;
  browserSession: BrowserSessionState;
  discoverySessions: readonly DiscoveryAdapterSessionState[];
  isAnyDiscoveryRunActive?: boolean;
  isBrowserSessionPending: boolean;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
  isDiscoveryAllPending: boolean;
  isTargetPending: (targetId: string) => boolean;
  onOpenBrowserSession: () => void;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onRunAgentDiscovery: (() => void) | undefined;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onViewProgress: () => void;
  searchPreferences: JobSearchPreferences;
  sourceAccessPrompts: readonly SourceAccessPrompt[];
}

type SectionValue =
  | string
  | {
      key: string;
      label: string;
    };

interface OtherActiveCriterion {
  label: string;
  value: string;
}

export function getDiscoveryOtherActiveCriteria(
  searchPreferences: JobSearchPreferences,
): {
  preferences: OtherActiveCriterion[];
  hardExclusions: OtherActiveCriterion[];
} {
  const preferences: OtherActiveCriterion[] = [];
  const hardExclusions: OtherActiveCriterion[] = [];
  const addList = (
    target: OtherActiveCriterion[],
    label: string,
    values: readonly string[],
  ) => {
    if (values.length > 0) {
      target.push({ label, value: values.join(" · ") });
    }
  };

  addList(preferences, "Job families", searchPreferences.jobFamilies);
  addList(preferences, "Seniority", searchPreferences.seniorityLevels);
  addList(preferences, "Employment types", searchPreferences.employmentTypes);
  addList(preferences, "Industries", searchPreferences.targetIndustries);
  addList(preferences, "Company stages", searchPreferences.targetCompanyStages);
  addList(
    preferences,
    "Preferred companies",
    searchPreferences.companyWhitelist,
  );

  const { compensation } = searchPreferences;
  const formatCompensation = (amount: number) => {
    const formattedAmount = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(amount);
    const currency =
      compensation.currencyStatus === "needs_clarification" ||
      compensation.currency === null
        ? "currency needs clarification"
        : compensation.currency;
    return `${formattedAmount} ${currency} per ${compensation.interval}`;
  };
  if (compensation.minimum !== null) {
    preferences.push({
      label: "Minimum compensation",
      value: formatCompensation(compensation.minimum),
    });
  }
  if (compensation.maximum !== null) {
    preferences.push({
      label: "Target compensation",
      value: formatCompensation(compensation.maximum),
    });
  }
  if (searchPreferences.discovery.runJobBudget != null) {
    preferences.push({
      label: "Collection limit",
      value: `${formatCountLabel(searchPreferences.discovery.runJobBudget, "job")} per run`,
    });
  }

  addList(
    hardExclusions,
    "Excluded locations",
    searchPreferences.excludedLocations,
  );
  addList(
    hardExclusions,
    "Excluded companies",
    searchPreferences.companyBlacklist,
  );
  if (searchPreferences.discovery.collectOnlyHardCriteriaMatches === true) {
    hardExclusions.push({
      label: "Strict collection",
      value: "Only jobs meeting hard criteria",
    });
  }

  return { preferences, hardExclusions };
}

function getBrowserStatusLabel(
  status: BrowserSessionState["status"],
  isPending: boolean,
): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "login_required":
      return "Needs sign-in";
    case "blocked":
      return "Blocked";
    default:
      return isPending ? "Starting" : "Not open";
  }
}

/**
 * Non-color cue for the current-search status: each state carries a distinct
 * glyph shape so Ready / Needs sign-in / Blocked stay distinguishable without
 * relying on badge tone alone.
 */
function getSessionStatusIcon(status: BrowserSessionState["status"]) {
  switch (status) {
    case "ready":
      return CircleCheck;
    case "login_required":
      return KeyRound;
    case "blocked":
      return Ban;
    default:
      return CircleDashed;
  }
}

export function DiscoveryFiltersPanel({
  activeRun,
  activityPaused = false,
  browserSession,
  discoverySessions,
  isAnyDiscoveryRunActive = false,
  isBrowserSessionPending,
  isBrowserSessionPendingForTarget,
  isDiscoveryAllPending,
  isTargetPending,
  onOpenBrowserSession,
  onOpenBrowserSessionForTarget,
  onRunAgentDiscovery,
  onRunDiscoveryForTarget,
  onViewProgress,
  searchPreferences,
  sourceAccessPrompts,
}: DiscoveryFiltersPanelProps) {
  const searchControlsHeadingId = useId();
  const sectionHeadingPrefix = useId();
  const totalSourceCount = searchPreferences.discovery.targets.length;
  const sections = useMemo<
    Array<{
      label: string;
      values: SectionValue[];
      empty: string;
      editAction?: { label: string; href: string };
    }>
  >(
    () => [
      {
        label: "Roles",
        values: searchPreferences.targetRoles,
        empty: "No roles added yet.",
        editAction: {
          label: "Add roles",
          href: JOB_FINDER_ROUTE_PATHS.profileTargetRoles,
        },
      },
      {
        label: "Locations",
        values: searchPreferences.locations,
        empty: "No locations added yet.",
        editAction: {
          label: "Add locations",
          href: JOB_FINDER_ROUTE_PATHS.profile,
        },
      },
      {
        label: "Work modes",
        values: searchPreferences.workModes,
        empty: "No work modes added yet.",
        editAction: {
          label: "Set work modes",
          href: JOB_FINDER_ROUTE_PATHS.profile,
        },
      },
      {
        label: "Sources",
        values: searchPreferences.discovery.targets
          .filter((target) => target.enabled)
          .map((target) => ({
            key: target.id,
            label: target.label,
          })),
        // Truthful states: "nothing saved" differs from "saved but all
        // disabled", which previously read as if no sources existed.
        empty:
          totalSourceCount === 0
            ? "No sources added yet."
            : `${formatCountLabel(totalSourceCount, "source")} saved, none enabled yet.`,
        editAction: {
          label: totalSourceCount === 0 ? "Add sources" : "Enable sources",
          href: JOB_FINDER_ROUTE_PATHS.profileSources,
        },
      },
    ],
    [searchPreferences, totalSourceCount],
  );

  const enabledTargets = searchPreferences.discovery.targets.filter(
    (target) => target.enabled,
  );
  const otherActiveCriteria =
    getDiscoveryOtherActiveCriteria(searchPreferences);
  const otherActiveCriteriaCount =
    otherActiveCriteria.preferences.length +
    otherActiveCriteria.hardExclusions.length;
  const enabledTargetIds = new Set(enabledTargets.map((target) => target.id));
  const enabledSourceAccessPrompts = sourceAccessPrompts.filter((prompt) =>
    enabledTargetIds.has(prompt.targetId),
  );
  const runOneSourceHeadingId = `${sectionHeadingPrefix}-run-one-source`;
  const searchReadiness = getDiscoverySearchReadiness(searchPreferences);
  const chromeProfileSession =
    discoverySessions.find(
      (session) => session.driver === "chrome_profile_agent",
    ) ?? null;
  const isNeutralBrowserSessionSnapshot =
    browserSession.driver === "catalog_seed" &&
    browserSession.status === "unknown";
  const browserSessionSnapshot = isNeutralBrowserSessionSnapshot
    ? NEUTRAL_SESSION_SNAPSHOT
    : browserSession;
  const displaySessionSnapshot: BrowserSessionState = chromeProfileSession
    ? {
        source: chromeProfileSession.adapterKind,
        status: chromeProfileSession.status,
        driver: chromeProfileSession.driver,
        label: chromeProfileSession.label,
        detail: chromeProfileSession.detail ?? "",
        lastCheckedAt: chromeProfileSession.lastCheckedAt,
      }
    : browserSessionSnapshot;
  const sessionDetail = displaySessionSnapshot.detail?.trim() ?? "";
  const isBrowserSessionVisible =
    Boolean(chromeProfileSession) || !isNeutralBrowserSessionSnapshot;
  const isReady = displaySessionSnapshot.status === "ready";
  const needsLogin = displaySessionSnapshot.status === "login_required";
  const isBlocked = displaySessionSnapshot.status === "blocked";
  const SessionStatusIcon = getSessionStatusIcon(displaySessionSnapshot.status);
  const canRunDiscovery =
    Boolean(onRunAgentDiscovery) &&
    searchReadiness.ready &&
    !isDiscoveryAllPending &&
    !isAnyDiscoveryRunActive &&
    !activityPaused;
  const searchDisabledOverrideReason = activityPaused
    ? DISCOVERY_PAUSED_SEARCH_REASON
    : null;
  const activeTargetId =
    activeRun?.state === "running" && activeRun.scope === "single_target"
      ? (activeRun.targetIds[0] ?? null)
      : null;
  const primarySourceAccessPrompt =
    enabledSourceAccessPrompts.find(
      (prompt) => prompt.state === "prompt_login_required",
    ) ?? null;
  const hasRecommendedSourceAccessPrompt = enabledSourceAccessPrompts.some(
    (prompt) => prompt.state === "prompt_login_recommended",
  );

  return (
    <section
      aria-labelledby={searchControlsHeadingId}
      className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-panel) border border-(--surface-panel-border) xl:h-full xl:min-h-0"
    >
      <h2
        className="border-b border-(--surface-panel-border) px-4 py-3 text-base font-semibold text-(--text-headline)"
        id={searchControlsHeadingId}
      >
        Search setup
      </h2>

      <div className="flex min-h-106 min-w-0 flex-1 flex-col overflow-hidden xl:min-h-0">
        <div className="grid min-w-0 gap-2 border-b border-(--surface-panel-border) px-3 py-3">
          <p className="text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-label) text-foreground-muted">
            Current search
          </p>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <StatusBadge tone={getSessionTone(displaySessionSnapshot)}>
              <SessionStatusIcon aria-hidden="true" />
              {getBrowserStatusLabel(
                displaySessionSnapshot.status,
                isBrowserSessionPending,
              )}
            </StatusBadge>
          </div>
          <DiscoverySessionSummary
            hasRecommendedSourceAccessPrompt={hasRecommendedSourceAccessPrompt}
            isBlocked={isBlocked}
            isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
            isBrowserSessionVisible={isBrowserSessionVisible}
            isReady={isReady}
            isTargetPending={isTargetPending}
            needsLogin={needsLogin}
            onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
            {...(onRunDiscoveryForTarget
              ? { onConfirmSignedInForTarget: onRunDiscoveryForTarget }
              : {})}
            primarySourceAccessPrompt={primarySourceAccessPrompt}
            sectionDetail={sessionDetail}
          />
        </div>

        <DiscoveryFiltersFooter
          canRunDiscovery={canRunDiscovery}
          searchDisabledReason={
            searchDisabledOverrideReason ?? searchReadiness.reason
          }
          searchSetupHref={JOB_FINDER_ROUTE_PATHS.profileSources}
          isBrowserSessionPending={isBrowserSessionPending}
          isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
          isDiscoveryAllPending={isDiscoveryAllPending}
          isReady={isReady}
          onOpenBrowserSession={onOpenBrowserSession}
          onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
          onRunAgentDiscovery={onRunAgentDiscovery}
          onViewProgress={onViewProgress}
          primarySourceAccessPrompt={primarySourceAccessPrompt}
        />

        <div
          aria-label="Current search details"
          className="grid min-h-0 min-w-0 flex-1 content-start gap-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          data-locked-pane-scroll-region
          role="region"
          tabIndex={0}
        >
          <DiscoverySearchSections
            sectionHeadingPrefix={sectionHeadingPrefix}
            sections={sections}
          />

          {otherActiveCriteriaCount > 0 ? (
            <details className="min-w-0 border-t border-(--surface-panel-border) px-4 py-3">
              <summary className="cursor-pointer text-(length:--text-small) font-medium text-foreground-soft">
                Other active criteria ({otherActiveCriteriaCount}
                {otherActiveCriteria.hardExclusions.length > 0
                  ? `, including ${formatCountLabel(otherActiveCriteria.hardExclusions.length, "hard exclusion")}`
                  : ""}
                )
              </summary>
              <div className="mt-3 grid gap-3 text-(length:--text-small)">
                {otherActiveCriteria.preferences.length > 0 ? (
                  <section aria-label="Other search preferences">
                    <h3 className="font-medium text-foreground-muted">
                      Preferences
                    </h3>
                    <ul className="mt-1 grid gap-1 text-foreground-soft">
                      {otherActiveCriteria.preferences.map((criterion) => (
                        <li className="break-words" key={criterion.label}>
                          <span className="font-medium">
                            {criterion.label}:
                          </span>{" "}
                          {criterion.value}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {otherActiveCriteria.hardExclusions.length > 0 ? (
                  <section aria-label="Hard exclusions">
                    <h3 className="font-medium text-(--warning-text)">
                      Hard exclusions
                    </h3>
                    <ul className="mt-1 grid gap-1 text-foreground-soft">
                      {otherActiveCriteria.hardExclusions.map((criterion) => (
                        <li className="break-words" key={criterion.label}>
                          <span className="font-medium">
                            {criterion.label}:
                          </span>{" "}
                          {criterion.value}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            </details>
          ) : null}

          {enabledTargets.length > 0 && onRunDiscoveryForTarget ? (
            <DiscoveryRunOneSourceSection
              activeTargetId={activeTargetId}
              enabledSourceAccessPrompts={enabledSourceAccessPrompts}
              enabledTargets={enabledTargets.map((target) => ({
                id: target.id,
                label: target.label,
              }))}
              isAnyDiscoveryRunActive={isAnyDiscoveryRunActive}
              isSearchUnavailable={activityPaused}
              isBrowserSessionPendingForTarget={
                isBrowserSessionPendingForTarget
              }
              isTargetPending={isTargetPending}
              onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
              onConfirmSignedInForTarget={onRunDiscoveryForTarget}
              onRunDiscoveryForTarget={onRunDiscoveryForTarget}
              primarySourceAccessPrompt={primarySourceAccessPrompt}
              runOneSourceHeadingId={runOneSourceHeadingId}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
