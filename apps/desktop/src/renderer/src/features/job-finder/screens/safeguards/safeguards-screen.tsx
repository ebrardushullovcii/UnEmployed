import { useMemo, useRef, useState } from "react";
import type {
  JobFinderWorkspaceSnapshot,
  SafeguardMutationInput,
} from "@unemployed/contracts";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/features/job-finder/components/empty-state";
import { Input } from "@renderer/components/ui/input";
import { StatusBadge } from "@renderer/features/job-finder/components/status-badge";
import { cn } from "@renderer/lib/utils";
import {
  buildSafeguardsPresentationModel,
  filterSafeguardRows,
  safeguardMutationKey,
  type SafeguardControl,
  type SafeguardRow,
  type SafeguardTabId,
} from "./safeguards-presentation";

const TAB_ORDER: readonly { id: SafeguardTabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "caps", label: "Application limits" },
  { id: "conflicts", label: "Conflicts" },
  { id: "signals", label: "Listing signals" },
  { id: "pauses", label: "Automatic pauses" },
  { id: "reviews", label: "Reviews" },
  { id: "contradictions", label: "Conflicting answers" },
  { id: "dismissals", label: "Dismissals" },
];

function SafeguardRowCard(props: {
  isPending: (controlId: string) => boolean;
  onMutate: (mutation: SafeguardMutationInput) => Promise<boolean>;
  row: SafeguardRow;
}) {
  const { isPending, onMutate, row } = props;
  const [error, setError] = useState<string | null>(null);

  async function runControl(control: SafeguardControl) {
    setError(null);
    const ok = await onMutate(control.mutation);
    if (!ok) {
      setError("That safeguard change could not be saved. Try again.");
    }
  }

  return (
    <article
      aria-label={row.title}
      className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-4 py-3"
      data-safeguard-kind={row.kind}
      data-safeguard-blocked={row.blocked ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-semibold text-foreground">{row.title}</h3>
          <p className="break-words text-(length:--text-small) text-foreground-soft">
            {row.subtitle}
          </p>
        </div>
        <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
      </div>

      <div className="grid gap-1 text-(length:--text-small) leading-5">
        <p className="text-foreground">{row.explanation}</p>
        <p className="text-foreground-soft">Recovery: {row.recoveryGuidance}</p>
      </div>

      {row.lineage.jobs.length > 0 ||
      row.lineage.companies.length > 0 ||
      row.lineage.campaigns.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-(length:--text-small) leading-5">
          {row.lineage.jobs.length > 0 ? (
            <>
              <dt className="text-foreground-muted">Jobs</dt>
              <dd className="text-foreground">
                {row.lineage.jobs.map((label) => (
                  <span className="block truncate" key={label} title={label}>
                    {label}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          {row.lineage.companies.length > 0 ? (
            <>
              <dt className="text-foreground-muted">Companies</dt>
              <dd className="text-foreground">
                {row.lineage.companies.map((label) => (
                  <span className="block truncate" key={label} title={label}>
                    {label}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
          {row.lineage.campaigns.length > 0 ? (
            <>
              <dt className="text-foreground-muted">Campaigns</dt>
              <dd className="text-foreground">
                {row.lineage.campaigns.map((label) => (
                  <span className="block truncate" key={label} title={label}>
                    {label}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="ml-auto flex flex-wrap justify-end gap-2">
          {row.controls.map((control) => (
            <Button
              disabled={isPending(safeguardMutationKey(control.mutation))}
              key={control.id}
              onClick={() => void runControl(control)}
              size="sm"
              type="button"
              variant={control.kind === "resolve" ? "primary" : "outline"}
            >
              {isPending(safeguardMutationKey(control.mutation))
                ? "Working…"
                : control.label}
            </Button>
          ))}
        </span>
      </div>
      {error ? (
        <p
          className="rounded-md border border-(--warning-border) bg-(--warning-surface) px-3 py-2 text-(length:--text-small) leading-5 text-foreground-soft"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function SafeguardsScreen(props: {
  actionMessage: string | null;
  isPending: (controlId: string) => boolean;
  onMutateSafeguards: (input: SafeguardMutationInput) => Promise<boolean>;
  workspace: JobFinderWorkspaceSnapshot | null;
}) {
  const { actionMessage, isPending, onMutateSafeguards, workspace } = props;
  const [tab, setTab] = useState<SafeguardTabId>("all");
  const [query, setQuery] = useState("");
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const tabButtonRefs = useRef<
    Partial<Record<SafeguardTabId, HTMLButtonElement | null>>
  >({});

  const model = useMemo(
    () =>
      workspace
        ? buildSafeguardsPresentationModel({
            safeguards: workspace.intelligence.safeguards,
            workspace,
          })
        : null,
    [workspace],
  );

  if (!workspace || !model) {
    return (
      <div className="grid min-h-72 place-items-center" role="status">
        <p className="text-(length:--text-small) text-foreground-soft">
          Loading safeguards…
        </p>
      </div>
    );
  }

  const visibleRows = filterSafeguardRows(model.rows, tab, query);
  const blockedCount = model.counts.blockers;
  const isEmpty = model.rows.length === 0;
  const isNoMatch = !isEmpty && visibleRows.length === 0;

  function moveTabFrom(currentId: SafeguardTabId, direction: -1 | 1) {
    const currentIndex = TAB_ORDER.findIndex((entry) => entry.id === currentId);
    const nextIndex =
      (currentIndex + direction + TAB_ORDER.length) % TAB_ORDER.length;
    moveTabTo(TAB_ORDER[nextIndex]!.id);
  }

  function moveTabTo(nextId: SafeguardTabId) {
    setTab(nextId);
    tabButtonRefs.current[nextId]?.focus();
  }

  return (
    <section aria-label="High-volume safeguards" className="grid gap-4">
      <header className="grid gap-2">
        <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-foreground-muted">
          Quality and reputation
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-(--text-headline)">
          Safeguards
        </h1>
        <p className="max-w-3xl text-(length:--text-small) leading-6 text-foreground-soft">
          Automatic pauses and quality gates that keep high-volume discovery and
          application preparation safe. These are local tracking facts: they can
          pause discovery or preparation, but never grant credentials, CAPTCHA,
          MFA, consent, account creation, or final-submit authority.
        </p>
      </header>

      {blockedCount > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-(--radius-field) border border-destructive/30 bg-destructive/10 px-3 py-2 text-(length:--text-small) text-foreground"
          role="status"
        >
          <ShieldAlert aria-hidden="true" className="size-4 text-destructive" />
          <span>
            {blockedCount} active blocker{blockedCount === 1 ? "" : "s"}.
            Resolve, dismiss, or retry below to continue discovery and
            application preparation.
          </span>
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center gap-2 rounded-(--radius-field) border border-positive/30 bg-positive/10 px-3 py-2 text-(length:--text-small) text-foreground"
          role="status"
        >
          <ShieldCheck aria-hidden="true" className="size-4 text-positive" />
          <span>
            No active safeguard blockers. Discovery and preparation are clear.
          </span>
        </div>
      )}

      {actionMessage ? (
        <p
          className="rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 px-3 py-2 text-(length:--text-small) leading-5 text-foreground-soft"
          role="status"
        >
          {actionMessage}
        </p>
      ) : null}

      <div
        className="grid min-w-0 gap-3 lg:grid-cols-[minmax(14rem,1fr)_minmax(0,3fr)] lg:items-start"
        data-safeguard-toolbar
      >
        <div className="relative min-w-0">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search safeguards"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search jobs, companies, signals, or reasons…"
            ref={queryInputRef}
            type="search"
            value={query}
          />
        </div>
        <div
          aria-label="Safeguard categories"
          className="flex min-w-0 w-full flex-wrap items-center gap-1 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) p-1"
          data-safeguard-categories
          role="tablist"
        >
          {TAB_ORDER.map((entry) => {
            const count =
              entry.id === "all"
                ? model.counts.blockers
                : entry.id === "caps"
                  ? model.counts.caps
                  : entry.id === "conflicts"
                    ? model.counts.conflicts
                    : entry.id === "signals"
                      ? model.counts.signals
                      : entry.id === "pauses"
                        ? model.counts.pauses
                        : entry.id === "reviews"
                          ? model.counts.reviews
                          : entry.id === "contradictions"
                            ? model.counts.contradictions
                            : model.counts.dismissals;
            return (
              <button
                aria-selected={tab === entry.id}
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full px-3 text-(length:--text-small) font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  tab === entry.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-tab-id={entry.id}
                key={entry.id}
                onClick={() => setTab(entry.id)}
                onKeyDown={(event) => {
                  const currentId = event.currentTarget.dataset.tabId as
                    | SafeguardTabId
                    | undefined;
                  if (!currentId) return;
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveTabFrom(currentId, -1);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveTabFrom(currentId, 1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveTabTo(TAB_ORDER[0]!.id);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveTabTo(TAB_ORDER[TAB_ORDER.length - 1]!.id);
                  }
                }}
                ref={(button) => {
                  tabButtonRefs.current[entry.id] = button;
                }}
                role="tab"
                type="button"
              >
                {entry.label}
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--input) px-1 text-[0.65rem] tabular-nums text-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          description="No caps, conflicts, listing signals, failure pauses, sample reviews, or contradictory answers have been recorded yet. They appear here automatically when the pipeline detects them."
          title="No safeguards yet"
        />
      ) : isNoMatch ? (
        <EmptyState
          description="Nothing in this category matches your search. Try a different term or clear the search box."
          title="No matching safeguards"
        />
      ) : (
        <div className="grid gap-3">
          {visibleRows.map((row) => (
            <SafeguardRowCard
              isPending={isPending}
              key={row.key}
              onMutate={onMutateSafeguards}
              row={row}
            />
          ))}
        </div>
      )}
    </section>
  );
}
