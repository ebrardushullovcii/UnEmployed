import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/cn";
import { isImeComposingEvent } from "../lib/job-finder-shortcuts";
import { useJobFinderOverlayOwnership } from "../lib/job-finder-overlay-ownership";
import type {
  SavedCollectionView,
  SavedViewMetadata,
} from "../hooks/use-persisted-collection-view";

export type CollectionDensity = "compact" | "comfortable" | "detailed";

/**
 * Search fields must never slice their hint mid-word at narrow widths.
 * Chromium ignores `text-overflow` on `::placeholder` itself (the
 * pseudo-element only accepts a limited property subset), so the ellipsis
 * rides on the input element: nowrap plus hidden overflow make an overflowing
 * hint — and an overflowing typed value left unscrolled — fade out with “…”
 * instead of a hard clip, without growing the toolbar. The complete search
 * scope stays available to assistive technology through each field's label or
 * aria-label.
 */
export const collectionSearchFieldClass =
  "overflow-hidden whitespace-nowrap text-ellipsis";

/**
 * Seam ownership for the toolbar row. The default keeps both borders;
 * `"page"` defers all seams to the page header stack and body gap, and
 * `"panel"` lets the panel header above own the top seam.
 */
export type CollectionSearchToolbarPlacement = "page" | "panel";

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
  compact?: boolean;
  density?: CollectionDensity;
  hideCompactCount?: boolean;
  label: string;
  onDensityChange?: (density: CollectionDensity) => void;
  onQueryChange: (query: string) => void;
  placement?: CollectionSearchToolbarPlacement;
  placeholder: string;
  query: string;
  totalCount: number;
  viewActions?: ReactNode;
  visibleCount: number;
}) {
  const inputId = useId();
  const showingSubset = props.visibleCount !== props.totalCount;
  const countLabel = showingSubset
    ? `${props.visibleCount} of ${props.totalCount} results`
    : `${props.totalCount} ${props.totalCount === 1 ? "result" : "results"}`;
  const topSeam =
    props.placement === "panel"
      ? undefined
      : "border-t border-(--surface-panel-border)";

  if (props.compact) {
    return (
      <div
        className={cn(
          "relative z-20 flex min-w-0 flex-wrap items-center gap-2 border-b border-(--surface-panel-border) px-4 py-2.5",
          topSeam,
          props.className,
        )}
        data-collection-toolbar-compact
      >
        <label className="sr-only" htmlFor={inputId}>
          {props.label}
        </label>
        <Input
          autoComplete="off"
          className={cn("h-9 min-w-48 flex-1", collectionSearchFieldClass)}
          id={inputId}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={props.placeholder}
          type="search"
          value={props.query}
        />
        {props.density && props.onDensityChange ? (
          <div
            aria-label="List density"
            className="flex shrink-0 items-center overflow-hidden rounded-(--radius-button) border border-(--surface-panel-border)"
            role="group"
          >
            {(["compact", "comfortable", "detailed"] as const).map(
              (density) => (
                <Button
                  aria-label={density[0]?.toUpperCase() + density.slice(1)}
                  aria-pressed={props.density === density}
                  className="rounded-none border-0 px-2.5 text-xs"
                  key={density}
                  onClick={() => props.onDensityChange?.(density)}
                  size="sm"
                  type="button"
                  variant={props.density === density ? "secondary" : "ghost"}
                >
                  {density === "comfortable"
                    ? "Comfort"
                    : density === "detailed"
                      ? "Detail"
                      : "Compact"}
                </Button>
              ),
            )}
          </div>
        ) : null}
        <div className="flex min-w-0 shrink-0 items-center gap-1">
          {!props.hideCompactCount ? (
            <span
              aria-atomic="true"
              aria-live="polite"
              className="mr-1 text-xs tabular-nums text-foreground-muted"
            >
              {countLabel}
            </span>
          ) : null}
          {props.viewActions}
          {props.query ? (
            <Button
              onClick={() => props.onQueryChange("")}
              size="xs"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-0 gap-2",
        props.placement === "page"
          ? "py-3"
          : "border-y border-(--surface-panel-border) px-5 py-3",
        props.compact && "relative z-20 px-4 py-2",
        props.className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-end gap-2",
          props.compact && "grid gap-1.5",
        )}
      >
        <div className="min-w-0 w-full flex-1 sm:min-w-56">
          <div className="mb-1 flex min-w-0 items-center justify-between gap-3">
            <label
              className="block text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted"
              htmlFor={inputId}
            >
              {props.label}
            </label>
            {props.compact ? (
              <p
                aria-atomic="true"
                aria-live="polite"
                className="min-w-0 truncate text-xs text-foreground-muted"
              >
                {countLabel}
              </p>
            ) : null}
          </div>
          <Input
            autoComplete="off"
            className={cn(collectionSearchFieldClass, props.compact && "h-9")}
            id={inputId}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={props.placeholder}
            type="search"
            value={props.query}
          />
        </div>
        {!props.compact && props.density && props.onDensityChange ? (
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
        {!props.compact ? props.viewActions : null}
      </div>
      <div className="flex min-h-5 min-w-0 flex-wrap items-center justify-between gap-2">
        {props.compact ? (
          <div className="flex min-w-0 items-center gap-1">
            {props.density && props.onDensityChange ? (
              <div
                aria-label="List density"
                className="flex gap-1"
                role="group"
              >
                {(["compact", "comfortable", "detailed"] as const).map(
                  (density) => (
                    <Button
                      aria-label={density[0]?.toUpperCase() + density.slice(1)}
                      aria-pressed={props.density === density}
                      className="px-2 text-xs"
                      key={density}
                      onClick={() => props.onDensityChange?.(density)}
                      size="sm"
                      type="button"
                      variant={
                        props.density === density ? "secondary" : "ghost"
                      }
                    >
                      {density === "comfortable"
                        ? "Comfort"
                        : density === "detailed"
                          ? "Detail"
                          : "Compact"}
                    </Button>
                  ),
                )}
              </div>
            ) : null}
            {props.viewActions}
          </div>
        ) : (
          <p
            aria-atomic="true"
            aria-live="polite"
            className="min-w-0 text-(length:--text-small) text-foreground-muted"
          >
            {countLabel}
          </p>
        )}
        {props.query ? (
          <Button
            onClick={() => props.onQueryChange("")}
            size={props.compact ? "xs" : "sm"}
            type="button"
            variant="ghost"
          >
            {props.compact ? "Clear" : "Clear search"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CollectionSavedViews(props: {
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string, metadata?: SavedViewMetadata) => void;
  // Opaque payload captured with the view at save time; the toolbar never
  // interprets it. The owning collection supplies and restores its meaning.
  savedViewMetadata?: SavedViewMetadata;
  views: readonly SavedCollectionView[];
}) {
  const [name, setName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    left: 8,
    maxHeight: 320,
    top: 8,
  });
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Closing through Escape returns focus to the trigger; a focusout Tab-out
  // closes without dragging focus back.
  const closeMenu = useCallback((restoreFocus: boolean) => {
    setIsOpen(false);
    if (restoreFocus) {
      anchorRef.current?.focus();
    }
  }, []);

  const { isTopmost: isMenuTopmost } = useJobFinderOverlayOwnership({
    active: isOpen,
    close: () => closeMenu(true),
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const viewportPadding = 8;
      const menuGap = 8;
      const menuWidth = Math.min(288, window.innerWidth - viewportPadding * 2);
      const anchorRect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchorRect.bottom - menuGap;
      const spaceAbove = anchorRect.top - menuGap;
      const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(
        160,
        Math.min(384, openBelow ? spaceBelow : spaceAbove),
      );
      const top = openBelow
        ? anchorRect.bottom + menuGap
        : Math.max(viewportPadding, anchorRect.top - menuGap - maxHeight);
      const left = Math.min(
        window.innerWidth - menuWidth - viewportPadding,
        Math.max(viewportPadding, anchorRect.right - menuWidth),
      );

      setMenuPosition({ left, maxHeight, top });
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !anchorRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeComposingEvent(event)) {
        return;
      }
      if (event.key !== "Escape" || !isMenuTopmost()) {
        return;
      }
      event.preventDefault();
      closeMenu(true);
    };

    updatePosition();
    // The portaled dialog never receives focus by default; claim it for the
    // naming field so keyboard and screen reader users land inside the dialog.
    const frame = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [closeMenu, isOpen, isMenuTopmost]);

  return (
    <div
      className="relative z-40"
      onBlur={(event) => {
        // React blur bubbles (focusout), so moves inside the trigger or the
        // portaled dialog keep the menu open; leaving both closes it while
        // the browser continues the ordinary Tab traversal untouched.
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          (anchorRef.current?.contains(nextTarget) ||
            menuRef.current?.contains(nextTarget))
        ) {
          return;
        }
        closeMenu(false);
      }}
    >
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="flex h-8 cursor-pointer items-center whitespace-nowrap rounded-(--radius-button) px-2 text-xs text-foreground-soft hover:bg-secondary"
        onClick={() => setIsOpen((open) => !open)}
        ref={anchorRef}
        type="button"
      >
        Saved views{props.views.length > 0 ? ` (${props.views.length})` : ""}
      </button>
      {isOpen
        ? createPortal(
            <div
              aria-label="Saved views"
              className="surface-panel-shell fixed z-100 grid w-[min(18rem,calc(100vw-1rem))] gap-3 overflow-y-auto rounded-(--radius-panel) border border-(--surface-panel-border) p-3 shadow-(--modal-shadow)"
              data-saved-views-menu
              ref={menuRef}
              role="dialog"
              style={menuPosition}
            >
              <div className="flex gap-2">
                <Input
                  aria-label="Saved view name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name this view"
                  ref={nameInputRef}
                  value={name}
                />
                <Button
                  disabled={!name.trim()}
                  onClick={() => {
                    // Preserve the historical single-argument contract for
                    // consumers without a payload; metadata rides along only
                    // when the collection actually supplied one.
                    const savedViewMetadata = props.savedViewMetadata;
                    if (savedViewMetadata === undefined) {
                      props.onSave(name);
                    } else {
                      props.onSave(name, savedViewMetadata);
                    }
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
                  Save this search and density for quick reuse.
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
            </div>,
            document.body,
          )
        : null}
    </div>
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
