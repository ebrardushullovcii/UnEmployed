import type { SourceAccessPrompt } from "@unemployed/contracts";
import { History, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { JOB_FINDER_ROUTE_PATHS } from "../../lib/job-finder-route-hrefs";
import { DISCOVERY_PAUSED_SEARCH_REASON } from "./discovery-search-readiness";

type SectionValue =
  | string
  | {
      key: string;
      label: string;
    };

export function DiscoverySessionSummary(props: {
  hasRecommendedSourceAccessPrompt: boolean;
  isBlocked: boolean;
  isBrowserSessionVisible: boolean;
  isReady: boolean;
  isTargetPending: (targetId: string) => boolean;
  needsLogin: boolean;
  onConfirmSignedInForTarget?: (targetId: string) => void;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  primarySourceAccessPrompt: SourceAccessPrompt | null;
  sectionDetail: string;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
}) {
  const {
    hasRecommendedSourceAccessPrompt,
    isBlocked,
    isBrowserSessionVisible,
    isBrowserSessionPendingForTarget,
    isReady,
    isTargetPending,
    needsLogin,
    onConfirmSignedInForTarget,
    onOpenBrowserSessionForTarget,
    primarySourceAccessPrompt,
    sectionDetail,
  } = props;

  return (
    <>
      {sectionDetail ? (
        <p className="max-w-full break-words text-sm leading-5 text-foreground-soft">
          {sectionDetail}
        </p>
      ) : null}

      {isBrowserSessionVisible ? (
        <div className="grid gap-2">
          {primarySourceAccessPrompt ? (
            <div
              aria-live="polite"
              className={
                primarySourceAccessPrompt.state === "prompt_login_required"
                  ? "rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--warning-text)"
                  : "rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
              }
              role="status"
            >
              <p className="font-medium">{primarySourceAccessPrompt.summary}</p>
              {primarySourceAccessPrompt.detail ? (
                <p className="mt-1 opacity-90">
                  {primarySourceAccessPrompt.detail}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    onOpenBrowserSessionForTarget(
                      primarySourceAccessPrompt.targetId,
                    )
                  }
                  pending={isBrowserSessionPendingForTarget(
                    primarySourceAccessPrompt.targetId,
                  )}
                  size="sm"
                  type="button"
                  variant={
                    primarySourceAccessPrompt.state === "prompt_login_required"
                      ? "primary"
                      : "secondary"
                  }
                >
                  {primarySourceAccessPrompt.actionLabel}
                </Button>
                {primarySourceAccessPrompt.state === "prompt_login_required" &&
                onConfirmSignedInForTarget ? (
                  <Button
                    onClick={() =>
                      onConfirmSignedInForTarget(
                        primarySourceAccessPrompt.targetId,
                      )
                    }
                    pending={isTargetPending(
                      primarySourceAccessPrompt.targetId,
                    )}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {`I'm signed in — retry ${primarySourceAccessPrompt.targetLabel}`}
                  </Button>
                ) : null}
              </div>
              {primarySourceAccessPrompt.state === "prompt_login_required" ? (
                <p className="mt-2 text-(length:--text-small) opacity-80">
                  Job Finder waits here and never handles your credentials.
                  Finish sign-in in the browser, return here, then confirm to
                  retry only this source.
                </p>
              ) : primarySourceAccessPrompt.rerunLabel ? (
                <p className="mt-2 text-(length:--text-small) opacity-80">
                  {`Then ${primarySourceAccessPrompt.rerunLabel}.`}
                </p>
              ) : null}
            </div>
          ) : null}
          {(needsLogin || isBlocked) && !primarySourceAccessPrompt ? (
            <div
              role="status"
              className="rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--warning-text)"
            >
              Some sources may need sign-in before the next search can finish.
            </div>
          ) : null}
          {isReady && !primarySourceAccessPrompt ? (
            <div
              role="status"
              className="rounded-(--radius-small) border border-(--success-border) bg-(--success-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--success-text)"
            >
              Browser ready. Any signed-in source sessions in this dedicated
              profile will be reused.
            </div>
          ) : null}
          {hasRecommendedSourceAccessPrompt &&
          !primarySourceAccessPrompt &&
          !needsLogin &&
          !isBlocked ? (
            <div
              role="status"
              className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            >
              The browser can improve coverage for sources that support sign-in.
            </div>
          ) : null}
          {!sectionDetail && !needsLogin && !isBlocked && !isReady ? (
            <p className="text-(length:--text-description) leading-5 text-foreground-soft">
              Open the browser only when a source needs sign-in or a warm
              browser session.
            </p>
          ) : null}
        </div>
      ) : null}

      <Link
        className="text-(length:--text-small) font-medium text-primary underline-offset-4 hover:underline"
        to={JOB_FINDER_ROUTE_PATHS.profileSources}
      >
        Edit sources and preferences
      </Link>
    </>
  );
}
export function DiscoverySearchSections(props: {
  sectionHeadingPrefix: string;
  sections: ReadonlyArray<{
    label: string;
    values: SectionValue[];
    empty: string;
    editAction?: { label: string; href: string };
  }>;
}) {
  const { sectionHeadingPrefix, sections } = props;

  return (
    <>
      {sections.map((section, index) => {
        const sectionHeadingId = `${sectionHeadingPrefix}-${section.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`;
        const editAction =
          section.values.length === 0 ? (section.editAction ?? null) : null;

        return (
          <section
            aria-labelledby={sectionHeadingId}
            key={section.label}
            className={
              (index === 0
                ? "min-w-0 px-4 "
                : "min-w-0 border-t border-(--surface-panel-border) px-4 ") +
              (editAction ? "py-2.5" : "py-4")
            }
          >
            {editAction ? (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3
                  className="shrink-0 text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-badge) text-foreground-muted"
                  id={sectionHeadingId}
                >
                  {section.label}
                </h3>
                <p className="min-w-0 text-(length:--text-small) leading-5 text-foreground-muted">
                  {section.empty}{" "}
                  <Link
                    className="font-medium whitespace-nowrap text-primary underline underline-offset-4 hover:no-underline"
                    to={editAction.href.slice(1)}
                  >
                    {editAction.label}
                  </Link>
                </p>
              </div>
            ) : (
              <div className="grid min-w-0 gap-3">
                <h3
                  className="text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-badge) text-foreground-muted"
                  id={sectionHeadingId}
                >
                  {section.label}
                </h3>
                {section.values.length > 0 ? (
                  // Saved criteria are read-only facts, not controls: flat
                  // inert text with strong contrast, no border, fill, hover,
                  // or tooltip chrome that could read as a disabled button.
                  <p className="min-w-0 text-(length:--text-small) leading-5 text-foreground [overflow-wrap:anywhere]">
                    {section.values
                      .map((value) =>
                        typeof value === "string" ? value : value.label,
                      )
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="text-(length:--text-item) leading-7 text-foreground-soft">
                    {section.empty}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export function DiscoveryRunOneSourceSection(props: {
  enabledSourceAccessPrompts: readonly SourceAccessPrompt[];
  enabledTargets: ReadonlyArray<{ id: string; label: string }>;
  isAnyDiscoveryRunActive?: boolean;
  isSearchUnavailable?: boolean;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
  isTargetPending: (targetId: string) => boolean;
  activeTargetId: string | null;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onConfirmSignedInForTarget: (targetId: string) => void;
  onRunDiscoveryForTarget: (targetId: string) => void;
  primarySourceAccessPrompt: SourceAccessPrompt | null;
  runOneSourceHeadingId: string;
}) {
  const {
    activeTargetId,
    enabledSourceAccessPrompts,
    enabledTargets,
    isAnyDiscoveryRunActive = false,
    isSearchUnavailable = false,
    isBrowserSessionPendingForTarget,
    isTargetPending,
    onOpenBrowserSessionForTarget,
    onConfirmSignedInForTarget,
    onRunDiscoveryForTarget,
    primarySourceAccessPrompt,
    runOneSourceHeadingId,
  } = props;

  return (
    <section
      aria-labelledby={runOneSourceHeadingId}
      className="min-w-0 border-t border-(--surface-panel-border) px-4 py-4"
    >
      <div className="grid min-w-0 gap-3">
        <h3
          className="text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-badge) text-foreground-muted"
          id={runOneSourceHeadingId}
        >
          Run one source
        </h3>
        <div className="grid gap-2">
          {enabledTargets.map((target) => {
            const isActiveSingleTarget = activeTargetId === target.id;
            const targetPrompt =
              enabledSourceAccessPrompts.find(
                (prompt) => prompt.targetId === target.id,
              ) ?? null;

            return (
              <div className="grid gap-2" key={target.id}>
                <Button
                  aria-label={`Run discovery for ${target.label}`}
                  className="h-auto min-h-11 w-full min-w-0 max-w-full justify-between overflow-hidden whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal) [&>span]:w-full [&>span]:min-w-0 [&>span]:justify-between"
                  disabled={
                    isTargetPending(target.id) ||
                    isSearchUnavailable ||
                    (isAnyDiscoveryRunActive && !isActiveSingleTarget)
                  }
                  pending={isTargetPending(target.id)}
                  onClick={() => onRunDiscoveryForTarget(target.id)}
                  size="sm"
                  type="button"
                  variant={isActiveSingleTarget ? "secondary" : "ghost"}
                >
                  <span
                    className="min-w-0 max-w-full truncate"
                    title={target.label}
                  >
                    {target.label}
                  </span>
                  <span className="shrink-0 text-(length:--text-small) text-foreground-muted">
                    {isActiveSingleTarget
                      ? "Running now"
                      : "Search only this source"}
                  </span>
                </Button>
                {targetPrompt &&
                targetPrompt.targetId !==
                  primarySourceAccessPrompt?.targetId ? (
                  <div
                    className={
                      targetPrompt.state === "prompt_login_required"
                        ? "rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-small) leading-6 text-(--warning-text)"
                        : "rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-small) leading-6 text-(--info-text)"
                    }
                    role="status"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{targetPrompt.summary}</span>
                      <Button
                        onClick={() => onOpenBrowserSessionForTarget(target.id)}
                        pending={isBrowserSessionPendingForTarget(target.id)}
                        size="sm"
                        type="button"
                        variant={
                          targetPrompt.state === "prompt_login_required"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {targetPrompt.actionLabel}
                      </Button>
                      {targetPrompt.state === "prompt_login_required" ? (
                        <Button
                          onClick={() => onConfirmSignedInForTarget(target.id)}
                          pending={isTargetPending(target.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          I'm signed in — retry
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function DiscoveryFiltersFooter(props: {
  canRunDiscovery: boolean;
  isBrowserSessionPending: boolean;
  isBrowserSessionPendingForTarget: (targetId: string) => boolean;
  isDiscoveryAllPending: boolean;
  isReady: boolean;
  onOpenBrowserSession: () => void;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onRunAgentDiscovery: (() => void) | undefined;
  onViewProgress: () => void;
  primarySourceAccessPrompt: SourceAccessPrompt | null;
  searchDisabledReason: string | null;
  searchSetupHref: string;
}) {
  const {
    canRunDiscovery,
    isBrowserSessionPending,
    isBrowserSessionPendingForTarget,
    isDiscoveryAllPending,
    isReady,
    onOpenBrowserSession,
    onOpenBrowserSessionForTarget,
    onRunAgentDiscovery,
    onViewProgress,
    primarySourceAccessPrompt,
    searchDisabledReason,
    searchSetupHref,
  } = props;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-(--surface-panel-border) px-3 py-2.5">
      {onRunAgentDiscovery ? (
        <div className="grid min-w-0 gap-2">
          <Button
            aria-describedby={
              searchDisabledReason
                ? "discovery-search-disabled-reason"
                : undefined
            }
            className="h-9 w-full whitespace-nowrap px-3 text-center text-xs normal-case tracking-normal"
            disabled={!canRunDiscovery}
            pending={isDiscoveryAllPending}
            onClick={onRunAgentDiscovery}
            size="sm"
            type="button"
            variant="primary"
          >
            Search jobs
          </Button>
          {searchDisabledReason ? (
            <p
              className="text-(length:--text-description) leading-6 text-(--warning-text)"
              id="discovery-search-disabled-reason"
              role="status"
            >
              {searchDisabledReason}
              {searchDisabledReason === DISCOVERY_PAUSED_SEARCH_REASON ? null : (
                <>
                  {" "}
                  <Link
                    className="font-medium underline underline-offset-4"
                    to={searchSetupHref}
                  >
                    Fix search setup
                  </Link>
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={
          onRunAgentDiscovery
            ? "grid min-w-0 gap-2"
            : "col-span-2 grid min-w-0 gap-2"
        }
      >
        <Button
          className="h-9 w-auto min-w-0 justify-center whitespace-nowrap px-3 text-xs normal-case tracking-normal"
          pending={
            primarySourceAccessPrompt
              ? isBrowserSessionPendingForTarget(
                  primarySourceAccessPrompt.targetId,
                )
              : isBrowserSessionPending
          }
          onClick={() => {
            if (primarySourceAccessPrompt) {
              onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId);
              return;
            }

            onOpenBrowserSession();
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Search className="size-3.5 shrink-0" />
          {primarySourceAccessPrompt
            ? primarySourceAccessPrompt.actionLabel
            : isReady
              ? "Reopen browser"
              : "Open browser"}
        </Button>
      </div>

      {/* Navigation register, not a third command: link styling keeps Search
          history clearly below the primary and secondary actions. */}
      <Button
        className="col-span-2 h-auto w-full justify-start gap-1.5 px-0 py-0.5 text-left text-xs normal-case tracking-normal"
        onClick={onViewProgress}
        size="sm"
        type="button"
        variant="link"
      >
        <History className="size-3.5" />
        Search history
      </Button>
    </div>
  );
}
