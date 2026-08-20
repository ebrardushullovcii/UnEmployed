import { useDeferredValue, useId, useMemo, useState } from "react";
import { Input } from "@renderer/components/ui/input";
import {
  searchJobFinderEntries,
  type JobFinderGlobalSearchEntry,
  type JobFinderGlobalSearchKind,
} from "../lib/job-finder-global-search";

const kindLabels: Record<JobFinderGlobalSearchKind, string> = {
  application: "Applications",
  campaign: "Campaigns",
  company: "Companies",
  document: "Documents",
  job: "Jobs and companies",
};

export function JobFinderGlobalSearch(props: {
  campaignId?: string | null;
  entries: readonly JobFinderGlobalSearchEntry[];
  onNavigate: (entry: JobFinderGlobalSearchEntry) => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const groups = useMemo(
    () =>
      deferredQuery.trim().length >= 2
        ? searchJobFinderEntries(props.entries, deferredQuery, {
            ...(props.campaignId !== undefined
              ? { campaignId: props.campaignId }
              : {}),
          })
        : [],
    [deferredQuery, props.campaignId, props.entries],
  );
  const resultCount = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );

  return (
    <section
      className="relative grid gap-2"
      aria-labelledby={`${inputId}-label`}
    >
      <label
        className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
        htmlFor={inputId}
        id={`${inputId}-label`}
      >
        Search Job Finder
      </label>
      <Input
        autoComplete="off"
        id={inputId}
        onChange={(event) => setQuery(event.target.value.slice(0, 200))}
        placeholder="Search jobs, companies, applications, campaigns, or documents"
        type="search"
        value={query}
      />
      {query.trim().length >= 2 ? (
        <div className="surface-panel-shell absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(32rem,70vh)] overflow-y-auto rounded-(--radius-panel) border border-(--surface-panel-border) p-3 shadow-(--modal-shadow)">
          <p
            aria-live="polite"
            className="px-2 pb-2 text-xs text-foreground-muted"
            role="status"
          >
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </p>
          {groups.length === 0 ? (
            <p className="rounded-(--radius-field) px-3 py-5 text-center text-sm text-foreground-soft">
              No local records match this search.
            </p>
          ) : (
            groups.map((group) => (
              <section className="grid gap-1 py-1" key={group.kind}>
                <h3 className="px-2 text-xs font-semibold uppercase tracking-(--tracking-label) text-foreground-muted">
                  {kindLabels[group.kind]}
                </h3>
                {group.entries.map((entry) => (
                  <button
                    className="grid w-full min-w-0 rounded-(--radius-field) px-3 py-2 text-left hover:bg-(--surface-panel-raised) focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    key={`${entry.kind}:${entry.id}`}
                    onClick={() => {
                      props.onNavigate(entry);
                      setQuery("");
                    }}
                    type="button"
                  >
                    <strong
                      className="min-w-0 break-words text-sm text-(--text-headline)"
                      title={entry.title}
                    >
                      {entry.title}
                    </strong>
                    <span
                      className="min-w-0 break-words text-xs text-foreground-muted"
                      title={entry.subtitle}
                    >
                      {entry.subtitle}
                    </span>
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
