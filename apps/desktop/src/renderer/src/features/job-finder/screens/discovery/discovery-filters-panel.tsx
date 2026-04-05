import { useId, useMemo } from "react";
import { History, Search } from "lucide-react";
import type {
  BrowserSessionState,
  DiscoveryAdapterSessionState,
  JobSearchPreferences,
} from "@unemployed/contracts";
import { Chip } from "@renderer/components/ui/chip";
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "../../components/status-badge";
import { getSessionTone } from "../../lib/job-finder-utils";

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
  actionMessage: string | null;
  busy: boolean;
  discoverySessions: readonly DiscoveryAdapterSessionState[];
  onOpenBrowserSession: () => void;
  onRunAgentDiscovery: (() => void) | undefined;
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
      return "Sign-in needed";
    case "blocked":
      return "Needs attention";
    default:
      return "Optional";
  }
}

export function DiscoveryFiltersPanel({
  actionMessage,
  busy,
  discoverySessions,
  onOpenBrowserSession,
  onRunAgentDiscovery,
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
        values: searchPreferences.discovery.targets.map((target) => ({
          key: target.id,
          label: `${target.label}${target.enabled ? "" : " (off)"}`,
        })),
        empty: "No sources added yet.",
      },
    ],
    [searchPreferences],
  );

  const enabledTargets = searchPreferences.discovery.targets.filter(
    (target) => target.enabled,
  );
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

  return (
    <section
      aria-labelledby={searchControlsHeadingId}
      className="surface-panel-shell relative flex min-h-124 min-w-0 flex-col gap-4 overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) p-5 xl:h-full xl:min-h-0"
    >
      <h2
        className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
        id={searchControlsHeadingId}
      >
        Search setup
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
                  The browser needs sign-in or attention. You can still start
                  the search, and we'll tell you exactly where it stops.
                </div>
              ) : null}
              {isReady ? (
                <div
                  role="status"
                  className="rounded-(--radius-small) border border-(--success-border) bg-(--success-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--success-text)"
                >
                  The browser is ready for sources that work better when you're
                  signed in.
                </div>
              ) : null}
              {!needsLogin && !isBlocked && !isReady ? (
                <div
                  role="status"
                  className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
                >
                  Open the browser if you want to sign in or prepare a site
                  before the next search.
                </div>
              ) : null}
            </div>
          ) : null}
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
              {isReady ? "Refresh browser" : "Open browser"}
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
            View search history
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
              Run search
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
