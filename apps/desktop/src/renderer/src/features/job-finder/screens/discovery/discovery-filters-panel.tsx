import { useId, useMemo } from "react";
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  DiscoveryRunRecord,
  SourceAccessPrompt,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { StatusBadge } from "../../components/status-badge";
import { getSessionTone } from "../../lib/job-finder-utils";
import {
  DiscoveryFiltersFooter,
  DiscoveryRunOneSourceSection,
  DiscoverySearchSections,
  DiscoverySessionSummary,
} from './discovery-filters-panel-sections'

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
  actionMessage: string | null;
  browserSession: BrowserSessionState;
  discoverySessions: readonly DiscoveryAdapterSessionState[];
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

function getBrowserStatusLabel(status: BrowserSessionState["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "login_required":
      return "Needs sign-in";
    case "blocked":
      return "Blocked";
    default:
      return "Starting";
  }
}

export function DiscoveryFiltersPanel({
  activeRun,
  actionMessage,
  browserSession,
  discoverySessions,
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
  const sections = useMemo<
    Array<{
      label: string;
      values: SectionValue[];
      empty: string;
    }>
  >(
    () => [
      {
        label: "Roles",
        values: searchPreferences.targetRoles,
        empty: "No roles added yet.",
      },
      {
        label: "Locations",
        values: searchPreferences.locations,
        empty: "No locations added yet.",
      },
      {
        label: "Work modes",
        values: searchPreferences.workModes,
        empty: "No work modes added yet.",
      },
      {
        label: "Sources",
        values: searchPreferences.discovery.targets.filter((target) => target.enabled).map((target) => ({
          key: target.id,
          label: target.label,
        })),
        empty: "No sources added yet.",
      },
    ],
    [searchPreferences],
  );

  const enabledTargets = searchPreferences.discovery.targets.filter(
    (target) => target.enabled,
  );
  const enabledTargetIds = new Set(enabledTargets.map((target) => target.id));
  const enabledSourceAccessPrompts = sourceAccessPrompts.filter((prompt) =>
    enabledTargetIds.has(prompt.targetId),
  );
  const runOneSourceHeadingId = `${sectionHeadingPrefix}-run-one-source`;
  const hasRunnableTarget = enabledTargets.length > 0;
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
  const canRunDiscovery =
    Boolean(onRunAgentDiscovery) && hasRunnableTarget && !isDiscoveryAllPending;
  const activeTargetId =
    activeRun?.state === "running" && activeRun.scope === "single_target"
      ? activeRun.targetIds[0] ?? null
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
      className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-5 xl:h-full xl:min-h-0"
    >
      <h2
        className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
        id={searchControlsHeadingId}
      >
        Current search
      </h2>

      <div className="surface-card-tint flex min-h-106 min-w-0 flex-1 flex-col overflow-hidden rounded-(--radius-panel) border border-(--surface-panel-border) xl:min-h-0">
          <div className="grid min-w-0 gap-3 border-b border-(--surface-panel-border) px-4 py-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <StatusBadge tone={getSessionTone(displaySessionSnapshot)}>
                {getBrowserStatusLabel(displaySessionSnapshot.status)}
              </StatusBadge>
                <span className="rounded-full border border-(--surface-panel-border) px-2.5 py-1 text-(length:--text-count) uppercase tracking-(--tracking-label) text-foreground-muted">
                  {isBrowserSessionVisible ? "Browser" : "Search"}
                </span>
              </div>
          <DiscoverySessionSummary
            hasRecommendedSourceAccessPrompt={hasRecommendedSourceAccessPrompt}
            isBlocked={isBlocked}
            isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
            isBrowserSessionVisible={isBrowserSessionVisible}
            isReady={isReady}
            needsLogin={needsLogin}
            onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
            primarySourceAccessPrompt={primarySourceAccessPrompt}
            sectionDetail={sessionDetail}
          />
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-0 overflow-y-auto">
          <DiscoverySearchSections
            sectionHeadingPrefix={sectionHeadingPrefix}
            sections={sections}
          />

          {enabledTargets.length > 0 && onRunDiscoveryForTarget ? (
            <DiscoveryRunOneSourceSection
              activeTargetId={activeTargetId}
              enabledSourceAccessPrompts={enabledSourceAccessPrompts}
              enabledTargets={enabledTargets.map((target) => ({
                id: target.id,
                label: target.label,
              }))}
              isBrowserSessionPendingForTarget={isBrowserSessionPendingForTarget}
              isTargetPending={isTargetPending}
              onOpenBrowserSessionForTarget={onOpenBrowserSessionForTarget}
              onRunDiscoveryForTarget={onRunDiscoveryForTarget}
              primarySourceAccessPrompt={primarySourceAccessPrompt}
              runOneSourceHeadingId={runOneSourceHeadingId}
            />
          ) : null}
        </div>

        <DiscoveryFiltersFooter
          actionMessage={actionMessage}
          canRunDiscovery={canRunDiscovery}
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
      </div>
    </section>
  );
}
