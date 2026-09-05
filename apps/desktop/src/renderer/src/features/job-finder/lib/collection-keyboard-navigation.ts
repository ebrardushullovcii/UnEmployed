import {
  findCollectionItemWithinRegion,
  revealBelowShellHeader,
  type JobFinderRevealView,
} from "./job-finder-scroll-reveal";

export function getAdjacentCollectionItemId(
  itemIds: readonly string[],
  currentItemId: string | null,
  key: string,
): string | null {
  if (itemIds.length === 0) return null;
  const currentIndex = currentItemId ? itemIds.indexOf(currentItemId) : -1;

  switch (key) {
    case "ArrowDown":
      return itemIds[Math.min(itemIds.length - 1, currentIndex + 1)] ?? null;
    case "ArrowUp":
      return (
        itemIds[Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1)] ?? null
      );
    case "Home":
      return itemIds[0] ?? null;
    case "End":
      return itemIds[itemIds.length - 1] ?? null;
    default:
      return null;
  }
}

export interface FocusCollectionItemOptions {
  /**
   * Collection region that owns the requested row. The lookup is scoped to
   * this subtree so a deferred frame can never land focus in another
   * surface's rows when two paginated collections share a page.
   */
  region?: ParentNode | null;
}

function focusCollectionItemInFrame(
  itemId: string,
  options: FocusCollectionItemOptions,
): void {
  const target = findCollectionItemWithinRegion(options.region, itemId);

  // Declared fallback: when the row is absent from the scoped region (for
  // example a filter dropped it between pages), focus is left untouched
  // instead of silently stealing context from wherever the person is.
  if (!target) {
    return;
  }

  const view: JobFinderRevealView | null =
    target.ownerDocument.defaultView ?? null;

  if (view) {
    // Contained reveal first, then an intentional focus claim. preventScroll
    // stops the browser from performing uncontrolled ancestor jumps; the
    // explicit alignment below clears the shell header through scroller math.
    revealBelowShellHeader(target, view);
  }

  target.focus({ preventScroll: true });
}

/**
 * Defer cross-page row focus until after React commits the requested page and
 * the frame settles, so lookup always sees the committed rows. Schedules one
 * animation frame and returns its handle so effect cleanups can cancel a
 * superseded request; without `window.requestAnimationFrame` the focus lands
 * synchronously and the returned handle is `null`.
 */
export function focusCollectionItem(
  itemId: string,
  options: FocusCollectionItemOptions = {},
): number | null {
  if (typeof window.requestAnimationFrame !== "function") {
    focusCollectionItemInFrame(itemId, options);
    return null;
  }

  return window.requestAnimationFrame(() => {
    focusCollectionItemInFrame(itemId, options);
  });
}
