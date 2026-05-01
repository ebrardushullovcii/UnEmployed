import type { SourceAccessPrompt } from '@unemployed/contracts'
import { History, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { Chip } from '@renderer/components/ui/chip'
import { JOB_FINDER_ROUTE_HREFS } from '../../lib/job-finder-route-hrefs'

type SectionValue =
  | string
  | {
      key: string
      label: string
    }

export function DiscoverySessionSummary(props: {
  hasRecommendedSourceAccessPrompt: boolean
  isBlocked: boolean
  isBrowserSessionVisible: boolean
  isReady: boolean
  needsLogin: boolean
  onOpenBrowserSessionForTarget: (targetId: string) => void
  primarySourceAccessPrompt: SourceAccessPrompt | null
  sectionDetail: string
  isBrowserSessionPendingForTarget: (targetId: string) => boolean
}) {
  const {
    hasRecommendedSourceAccessPrompt,
    isBlocked,
    isBrowserSessionVisible,
    isBrowserSessionPendingForTarget,
    isReady,
    needsLogin,
    onOpenBrowserSessionForTarget,
    primarySourceAccessPrompt,
    sectionDetail,
  } = props

  return (
    <>
      {sectionDetail ? (
        <p className="max-w-full wrap-break-word text-(length:--text-field) leading-7 text-foreground-soft">
          {sectionDetail}
        </p>
      ) : null}

      {isBrowserSessionVisible ? (
        <div className="grid gap-2">
          {primarySourceAccessPrompt ? (
            <div
              aria-live="polite"
              className={
                primarySourceAccessPrompt.state === 'prompt_login_required'
                  ? 'rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--warning-text)'
                  : 'rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)'
              }
              role="status"
            >
              <p className="font-medium">{primarySourceAccessPrompt.summary}</p>
              {primarySourceAccessPrompt.detail ? (
                <p className="mt-1 opacity-90">{primarySourceAccessPrompt.detail}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId)
                  }
                  pending={isBrowserSessionPendingForTarget(
                    primarySourceAccessPrompt.targetId,
                  )}
                  size="sm"
                  type="button"
                  variant={
                    primarySourceAccessPrompt.state === 'prompt_login_required'
                      ? 'primary'
                      : 'secondary'
                  }
                >
                  {primarySourceAccessPrompt.actionLabel}
                </Button>
                {primarySourceAccessPrompt.rerunLabel ? (
                  <span className="self-center text-(length:--text-small) opacity-80">
                    {`Then ${primarySourceAccessPrompt.rerunLabel}.`}
                  </span>
                ) : null}
              </div>
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
          {isReady ? (
            <div
              role="status"
              className="rounded-(--radius-small) border border-(--success-border) bg-(--success-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--success-text)"
            >
              You're signed in on sources that need the browser.
            </div>
          ) : null}
          {hasRecommendedSourceAccessPrompt && !primarySourceAccessPrompt && !needsLogin && !isBlocked ? (
            <div
              role="status"
              className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-description) leading-6 text-(--info-text)"
            >
              Some sources work without sign-in, but the browser can improve coverage.
            </div>
          ) : null}
          {!needsLogin && !isBlocked && !isReady ? (
            <p className="text-(length:--text-description) leading-6 text-foreground-soft">
              The browser will reopen automatically on the next run.
            </p>
          ) : null}
        </div>
      ) : null}

      <Link
        className="text-(length:--text-small) font-medium text-primary underline-offset-4 hover:underline"
        to={JOB_FINDER_ROUTE_HREFS.profile.slice(1)}
      >
        Edit search in Profile
      </Link>
    </>
  )
}

export function DiscoverySearchSections(props: {
  sectionHeadingPrefix: string
  sections: ReadonlyArray<{
    label: string
    values: SectionValue[]
    empty: string
  }>
}) {
  const { sectionHeadingPrefix, sections } = props

  return (
    <>
      {sections.map((section, index) => {
        const sectionHeadingId = `${sectionHeadingPrefix}-${section.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}`

        return (
          <section
            aria-labelledby={sectionHeadingId}
            key={section.label}
            className={
              index === 0
                ? 'min-w-0 px-4 py-4'
                : 'min-w-0 border-t border-(--surface-panel-border) px-4 py-4'
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
                        typeof value === 'string'
                          ? `${section.label}_${value}`
                          : `${section.label}_${value.key}`
                      }
                      className="surface-card-tint border-(--surface-panel-border) text-foreground-soft"
                    >
                      {typeof value === 'string' ? value : value.label}
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
        )
      })}
    </>
  )
}

export function DiscoveryRunOneSourceSection(props: {
  enabledSourceAccessPrompts: readonly SourceAccessPrompt[]
  enabledTargets: ReadonlyArray<{ id: string; label: string }>
  isBrowserSessionPendingForTarget: (targetId: string) => boolean
  isTargetPending: (targetId: string) => boolean
  activeTargetId: string | null
  onOpenBrowserSessionForTarget: (targetId: string) => void
  onRunDiscoveryForTarget: (targetId: string) => void
  primarySourceAccessPrompt: SourceAccessPrompt | null
  runOneSourceHeadingId: string
}) {
  const {
    activeTargetId,
    enabledSourceAccessPrompts,
    enabledTargets,
    isBrowserSessionPendingForTarget,
    isTargetPending,
    onOpenBrowserSessionForTarget,
    onRunDiscoveryForTarget,
    primarySourceAccessPrompt,
    runOneSourceHeadingId,
  } = props

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
            const isActiveSingleTarget = activeTargetId === target.id
            const targetPrompt =
              enabledSourceAccessPrompts.find((prompt) => prompt.targetId === target.id) ??
              null

            return (
              <div className="grid gap-2" key={target.id}>
                <Button
                  aria-label={`Run discovery for ${target.label}`}
                  className="h-auto min-h-11 w-full justify-between whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal)"
                  pending={isTargetPending(target.id)}
                  onClick={() => onRunDiscoveryForTarget(target.id)}
                  size="sm"
                  type="button"
                  variant={isActiveSingleTarget ? 'secondary' : 'ghost'}
                >
                  <span className="truncate">{target.label}</span>
                  <span className="text-(length:--text-small) text-foreground-muted">
                    {isActiveSingleTarget ? 'Running now' : 'Search only this source'}
                  </span>
                </Button>
                {targetPrompt && targetPrompt !== primarySourceAccessPrompt ? (
                  <div
                    className={
                      targetPrompt.state === 'prompt_login_required'
                        ? 'rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) px-3 py-3 text-(length:--text-small) leading-6 text-(--warning-text)'
                        : 'rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) px-3 py-3 text-(length:--text-small) leading-6 text-(--info-text)'
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
                          targetPrompt.state === 'prompt_login_required'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {targetPrompt.actionLabel}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function DiscoveryFiltersFooter(props: {
  actionMessage: string | null
  canRunDiscovery: boolean
  isBrowserSessionPending: boolean
  isBrowserSessionPendingForTarget: (targetId: string) => boolean
  isDiscoveryAllPending: boolean
  isReady: boolean
  onOpenBrowserSession: () => void
  onOpenBrowserSessionForTarget: (targetId: string) => void
  onRunAgentDiscovery: (() => void) | undefined
  onViewProgress: () => void
  primarySourceAccessPrompt: SourceAccessPrompt | null
}) {
  const {
    actionMessage,
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
  } = props

  return (
    <div className="mt-auto grid gap-3 border-t border-(--surface-panel-border) px-4 py-4">
      <div className="grid gap-2">
        <Button
          className="h-auto min-h-12 w-full justify-start whitespace-normal px-4 py-3 text-left normal-case tracking-(--tracking-normal)"
          pending={
            primarySourceAccessPrompt
              ? isBrowserSessionPendingForTarget(primarySourceAccessPrompt.targetId)
              : isBrowserSessionPending
          }
          onClick={() => {
            if (primarySourceAccessPrompt) {
              onOpenBrowserSessionForTarget(primarySourceAccessPrompt.targetId)
              return
            }

            onOpenBrowserSession()
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Search className="size-4" />
          {primarySourceAccessPrompt
            ? primarySourceAccessPrompt.actionLabel
            : isReady
              ? 'Reopen browser'
              : 'Open browser'}
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
          pending={isDiscoveryAllPending}
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
  )
}
