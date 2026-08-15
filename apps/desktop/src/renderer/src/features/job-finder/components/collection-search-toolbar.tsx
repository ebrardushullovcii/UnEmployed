import {
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/cn";
import type { SavedCollectionView } from "../hooks/use-persisted-collection-view";

export type CollectionDensity = "compact" | "comfortable" | "detailed";

export function normalizeCollectionSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function matchesCollectionSearch(
  query: string,
  values: readonly (string | null | undefined)[],
): boolean {
  const normalizedQuery = normalizeCollectionSearch(query);
  if (!normalizedQuery) return true;

  return values.some((value) =>
    value?.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function useCollectionSearch<T>(
  items: readonly T[],
  matcher: (item: T, query: string) => boolean,
) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredItems = useMemo(
    () => items.filter((item) => matcher(item, deferredQuery)),
    [deferredQuery, items, matcher],
  );

  return { deferredQuery, filteredItems, query, setQuery };
}

export function CollectionSearchToolbar(props: {
  className?: string;
  density?: CollectionDensity;
  label: string;
  onDensityChange?: (density: CollectionDensity) => void;
  onQueryChange: (query: string) => void;
  placeholder: string;
  query: string;
  totalCount: number;
  viewActions?: ReactNode;
  visibleCount: number;
}) {
  const inputId = useId();
  const showingSubset = props.visibleCount !== props.totalCount;

  return (
    <div
      className={cn(
        "grid gap-2 border-y border-(--surface-panel-border) px-5 py-3",
        props.className,
      )}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label
            className="mb-1 block text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
            htmlFor={inputId}
          >
            {props.label}
          </label>
          <Input
            autoComplete="off"
            id={inputId}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={props.placeholder}
            type="search"
            value={props.query}
          />
        </div>
        {props.density && props.onDensityChange ? (
          <div aria-label="List density" className="flex gap-1" role="group">
            {(["compact", "comfortable", "detailed"] as const).map(
              (density) => (
                <Button
                  aria-pressed={props.density === density}
                  key={density}
                  onClick={() => props.onDensityChange?.(density)}
                  size="sm"
                  type="button"
                  variant={props.density === density ? "secondary" : "ghost"}
                >
                  {density[0]?.toUpperCase()}
                  {density.slice(1)}
                </Button>
              ),
            )}
          </div>
        ) : null}
        {props.viewActions}
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p
          aria-atomic="true"
          aria-live="polite"
          className="text-(length:--text-small) text-foreground-muted"
        >
          {showingSubset
            ? `${props.visibleCount} of ${props.totalCount} results`
            : `${props.totalCount} ${props.totalCount === 1 ? "result" : "results"}`}
        </p>
        {props.query ? (
          <Button
            onClick={() => props.onQueryChange("")}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear search
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CollectionSavedViews(props: {
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
  views: readonly SavedCollectionView[];
}) {
  const [name, setName] = useState("");
  return (
    <details className="relative">
      <summary className="flex h-8 cursor-pointer items-center rounded-(--radius-button) px-3 text-sm text-foreground-soft hover:bg-secondary">
        Saved views{props.views.length > 0 ? ` (${props.views.length})` : ""}
      </summary>
      <div className="surface-panel-shell absolute right-0 top-full z-30 mt-2 grid w-72 gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) p-3 shadow-(--modal-shadow)">
        <div className="flex gap-2">
          <Input
            aria-label="Saved view name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this view"
            value={name}
          />
          <Button
            disabled={!name.trim()}
            onClick={() => {
              props.onSave(name);
              setName("");
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            Save
          </Button>
        </div>
        {props.views.length === 0 ? (
          <p className="text-xs text-foreground-muted">
            Save the current search and density for quick reuse.
          </p>
        ) : (
          <ul className="grid gap-1">
            {props.views.map((view) => (
              <li
                className="flex items-center justify-between gap-2"
                key={view.id}
              >
                <button
                  className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
                  onClick={() => props.onApply(view.id)}
                  type="button"
                >
                  {view.name}
                </button>
                <button
                  aria-label={`Delete saved view ${view.name}`}
                  className="text-xs text-foreground-muted underline"
                  onClick={() => props.onDelete(view.id)}
                  type="button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export interface CollectionColumnOption {
  id: string;
  label: string;
  required?: boolean;
  visible: boolean;
}

export function CollectionColumnPicker(props: {
  columns: readonly CollectionColumnOption[];
  onChange: (columnId: string, visible: boolean) => void;
}) {
  return (
    <details className="relative">
      <summary className="flex h-8 cursor-pointer items-center rounded-(--radius-button) px-3 text-sm text-foreground-soft hover:bg-secondary">
        Columns
      </summary>
      <fieldset className="surface-panel-shell absolute right-0 top-full z-30 mt-2 grid w-56 gap-2 rounded-(--radius-panel) border border-(--surface-panel-border) p-3 shadow-(--modal-shadow)">
        <legend className="sr-only">Visible columns</legend>
        {props.columns.map((column) => (
          <label className="flex items-center gap-2 text-sm" key={column.id}>
            <input
              checked={column.visible}
              disabled={column.required}
              onChange={(event) =>
                props.onChange(column.id, event.target.checked)
              }
              type="checkbox"
            />
            {column.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export function CollectionNoMatches(props: {
  noun: string;
  onClear: () => void;
  query: string;
}) {
  return (
    <div className="grid min-h-48 place-items-center px-5 py-8 text-center">
      <div className="grid max-w-md gap-3">
        <p className="font-semibold text-(--text-headline)">
          No {props.noun} match “{props.query.trim()}”
        </p>
        <p className="text-sm text-foreground-soft">
          Try a company, role, location, status, or a shorter phrase. Your other
          filters and selections have not changed.
        </p>
        <Button onClick={props.onClear} type="button" variant="secondary">
          Clear search
        </Button>
      </div>
    </div>
  );
}
