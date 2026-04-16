import { useId, useMemo } from "react";
import { History, Search } from "lucide-react";
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  DiscoveryRunRecord,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { Chip } from "@renderer/components/ui/chip";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";
import { getSessionTone } from "../../lib/job-finder-utils";
import { Link } from 'react-router-dom'

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
  busy: boolean;
  discoverySessions: readonly DiscoveryAdapterSessionState[];
  onOpenBrowserSession: () => void;
  onRunAgentDiscovery: (() => void) | undefined;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onViewProgress: () => void;
  searchPreferences: JobSearchPreferences;
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
  busy,
  discoverySessions,
  onOpenBrowserSession,
  onRunAgentDiscovery,
  onRunDiscoveryForTarget,
  onViewProgress,
  searchPreferences,
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
  const runOneSourceHeadingId = `${sectionHeadingPrefix}-run-one-source`;
  const hasRunnableTarget = enabledTargets.length > 0;
  const chromeProfileSession =
    discoverySessions.find(
      (session) => session.driver === "chrome_profile_agent",
    ) ?? null;
  const displaySessionSnapshot: BrowserSessionState = chromeProfileSession
    ? {
        source: chromeProfileSession.adapterKind,
        status: chromeProfileSession.status,
        driver: chromeProfileSession.driver,
        label: chromeProfileSession.label,
        detail: chromeProfileSession.detail ?? "",
        lastCheckedAt: chromeProfileSession.lastCheckedAt,
      }
    : NEUTRAL_SESSION_SNAPSHOT;
  const sessionDetail = displaySessionSnapshot.detail?.trim() ?? "";
  const isChromeAgent =
    displaySessionSnapshot.driver === "chrome_profile_agent";
  const isReady = displaySessionSnapshot.status === "ready";
  const needsLogin = displaySessionSnapshot.status === "login_required";
  const isBlocked = displaySessionSnapshot.status === "blocked";
  const canRunDiscovery =
    Boolean(onRunAgentDiscovery) && hasRunnableTarget && !busy;
  const activeTargetId =
    activeRun?.state === "running" && activeRun.scope === "single_target"
      ? activeRun.targetIds[0] ?? null
      : null;

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
                {isChromeAgent ? "Browser" : "Search"}
              </span>
            </div>
            {sessionDetail ? (
            <p className="max-w-full wrap-break-word text-(length:--text-field) leading-7 text-foreground-soft">
              {sessionDetail}
            </p>
          ) : null}

          {isChromeAgent ? (
            <div className="grid gap-2">
              {needsLogin || isBlocked ? (
                <div
                  role="status"
                  className="rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--warning-text)"
                >
                  Some sources need you to sign in before the next search can finish.
                </div>
              ) : null}
              {isReady ? (
                <div
                  role="status"
                  className="rounded-(--radius-small) border border-(--success-border) bg-(--success-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--success-text)"
                >
                  You're signed in on sources that need the browser.
                </div>
              ) : null}
              {!needsLogin && !isBlocked && !isReady ? (
                <div
                  role="status"
                  className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
                >
                  The browser is starting. You can review past results while it gets ready.
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="text-(length:--text-description) leading-6 text-foreground-soft">
            Review the search this run will use. Edit it in Profile when needed.
          </p>
          <Link className="text-(length:--text-small) font-medium text-primary underline-offset-4 hover:underline" to="/job-finder/profile">
            Edit search in Profile
          </Link>
        </div>

        <div className="grid min-h-0 min-w-0 flex-1 content-start gap-0 overflow-y-auto">
          {sections.map((section, index) => {
            const sectionHeadingId = `${sectionHeadingPrefix}-${section.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`;

            return (
            <section
              aria-labelledby={sectionHeadingId}
              key={section.label}
              className={
                index === 0
                  ? "min-w-0 px-4 py-4"
                  : "min-w-0 border-t border-(--surface-panel-border) px-4 py-4"
              }
            >
              <div className="grid min-w-0 gap-3">
                <h3
                  className="text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-badge) text-foreground-muted"
                  id={sectionHeadingId}
                >
                  {section.label}
                </h3>
                {section.values.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {section.values.map((value) => (
                      <Chip
                        key={
                          typeof value === "string"
                            ? `${section.label}_${value}`
                            : `${section.label}_${value.key}`
                        }
                        className="surface-card-tint border-(--surface-panel-border) text-foreground-soft"
                      >
                        {typeof value === "string" ? value : value.label}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-(length:--text-item) leading-7 text-foreground-soft">
                    {section.empty}
                  </p>
                )}
              </div>
            </section>
          )})}

          {enabledTargets.length > 0 ? (
            <section aria-labelledby={runOneSourceHeadingId} className="min-w-0 border-t border-(--surface-panel-border) px-4 py-4">
              <div className="grid min-w-0 gap-3">
                <h3 className="text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-badge) text-foreground-muted" id={runOneSourceHeadingId}>
                  Run one source
                </h3>
                <div className="grid gap-2">
                  {enabledTargets.map((target) => {
                    const isActiveSingleTarget = activeTargetId === target.id;

                    return (
                      <Button
                        className="h-auto min-h-11 w-full justify-between whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal)"
                        disabled={busy || !onRunDiscoveryForTarget}
                        key={target.id}
                        onClick={() => onRunDiscoveryForTarget?.(target.id)}
                        size="sm"
                        type="button"
                        variant={isActiveSingleTarget ? "secondary" : "ghost"}
                      >
                        <span className="truncate">{target.label}</span>
                        <span className="text-(length:--text-small) text-foreground-muted">
                          {isActiveSingleTarget ? "Running now" : "Search only this source"}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-auto grid gap-3 border-t border-(--surface-panel-border) px-4 py-4">
          <div className="grid gap-2">
            <Button
              className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal)"
              disabled={busy}
              onClick={onOpenBrowserSession}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Search className="size-4" />
              {isReady ? "Reopen browser" : "Open browser"}
            </Button>
          </div>

          <Button
            className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal)"
            onClick={onViewProgress}
            size="sm"
            type="button"
            variant="ghost"
          >
            <History className="size-4" />
            Search history
          </Button>

          {onRunAgentDiscovery ? (
            <Button
              className="h-auto min-h-12 w-full whitespace-normal px-4 py-3 text-center normal-case tracking-(--tracking-normal)"
              disabled={!canRunDiscovery}
              onClick={onRunAgentDiscovery}
              size="sm"
              type="button"
              variant="primary"
            >
              Search jobs
            </Button>
          ) : null}

          {actionMessage ? (
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-(length:--text-description) leading-6 text-foreground-muted"
              role="status"
            >
              {actionMessage}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
