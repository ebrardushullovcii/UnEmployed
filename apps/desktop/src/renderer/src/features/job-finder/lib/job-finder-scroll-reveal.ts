export interface JobFinderRevealView {
  innerWidth: number;
  getComputedStyle: (element: Element) => CSSStyleDeclaration;
  matchMedia?: (query: string) => Pick<MediaQueryList, "matches">;
}

// Shell header geometry mirrors `job-finder-shell`: below the sm breakpoint
// the page header scrolls in flow; from sm up it is fixed over the page
// (`sm:fixed sm:inset-x-0 sm:top-0`) with content padded by 7.25rem (116px),
// and once the persistent sidebar lands at 1440px the fixed band shrinks to
// h-14 (`min-[1440px]:!pt-14`, 56px).
export const JOB_FINDER_SM_MIN_VIEWPORT_WIDTH_PX = 640;
export const JOB_FINDER_WIDE_SHELL_MIN_VIEWPORT_WIDTH_PX = 1440;
export const JOB_FINDER_FIXED_HEADER_HEIGHT_PX = 116;
export const JOB_FINDER_WIDE_HEADER_HEIGHT_PX = 56;
// Shared breathing gap between a revealed target and whatever sits above it.
export const JOB_FINDER_REVEAL_TOP_GAP_PX = 16;

// Tailwind scale: `scroll-mt-4` = 16px gap; the sm band adds the fixed-header
// height (116px + 16px = 132px = 8.25rem); the wide band adds the short fixed
// header (56px + 16px = 72px = 4.5rem). Consumers must render these exact
// tokens so native `scrollIntoView` reveals cannot drift from this geometry.
export const JOB_FINDER_REVEAL_SCROLL_MARGIN_CLASSES = {
  base: "scroll-mt-4",
  fixedHeader: "sm:scroll-mt-[8.25rem]",
  wideFixedHeader: "min-[1440px]:scroll-mt-[4.5rem]",
} as const;

export type JobFinderRevealChromeMode =
  | "static-header"
  | "fixed-header"
  | "wide-fixed-header";

export function resolveJobFinderRevealChromeMode(
  viewportWidthPx: number,
): JobFinderRevealChromeMode {
  if (viewportWidthPx < JOB_FINDER_SM_MIN_VIEWPORT_WIDTH_PX) {
    return "static-header";
  }

  return viewportWidthPx >= JOB_FINDER_WIDE_SHELL_MIN_VIEWPORT_WIDTH_PX
    ? "wide-fixed-header"
    : "fixed-header";
}

export function resolveJobFinderRevealClearancePx(
  mode: JobFinderRevealChromeMode,
): number {
  switch (mode) {
    case "fixed-header":
      return JOB_FINDER_FIXED_HEADER_HEIGHT_PX + JOB_FINDER_REVEAL_TOP_GAP_PX;
    case "wide-fixed-header":
      return JOB_FINDER_WIDE_HEADER_HEIGHT_PX + JOB_FINDER_REVEAL_TOP_GAP_PX;
    default:
      return JOB_FINDER_REVEAL_TOP_GAP_PX;
  }
}

function isVerticalScrollport(
  element: Element,
  view: JobFinderRevealView,
): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const overflowY = view.getComputedStyle(element).overflowY;

  return (
    (overflowY === "auto" || overflowY === "scroll") &&
    element.scrollHeight > element.clientHeight
  );
}

/**
 * Nearest ancestor (excluding `start`) that actually scrolls vertically.
 * Starts searching at `from` so a pinned scrollport can be skipped by passing
 * its parent on the next attempt.
 */
export function findNearestVerticalScrollportFrom(
  start: Element | null,
  view: JobFinderRevealView,
): HTMLElement | null {
  let node: Element | null = start?.parentElement ?? null;

  while (node) {
    if (isVerticalScrollport(node, view)) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

/**
 * Contained reveal: aligns `target` so its viewport top clears the shell
 * header plus the shared breathing gap, using only explicit scroller
 * adjustments. Never animates, never delegates scrolling to the browser, and
 * never scrolls an inner scroller that is pinned at its boundary — pinned
 * levels hand the remaining correction to the next outer scroller instead,
 * which is what lets a stacked page-level reveal clear the fixed header.
 */
export function revealBelowShellHeader(
  target: HTMLElement,
  view: JobFinderRevealView,
  maxAttempts = 6,
): void {
  const clearancePx = resolveJobFinderRevealClearancePx(
    resolveJobFinderRevealChromeMode(view.innerWidth),
  );
  let searchFrom: Element | null = target;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const errorPx = target.getBoundingClientRect().top - clearancePx;

    if (errorPx >= 0) {
      return;
    }

    const scrollport = findNearestVerticalScrollportFrom(searchFrom, view);

    if (!scrollport) {
      return;
    }

    const previousScrollTop = scrollport.scrollTop;
    scrollport.scrollTop = Math.max(0, previousScrollTop + errorPx);

    if (scrollport.scrollTop === previousScrollTop) {
      searchFrom = scrollport;
      continue;
    }
  }
}

/**
 * Scoped collection lookup shared by cross-page row navigation. `null` scope
 * falls back to the whole document for callers without a region ref yet.
 */
export function findCollectionItemWithinRegion(
  region: ParentNode | null | undefined,
  itemId: string,
): HTMLElement | null {
  const scope: ParentNode = region ?? document;

  return (
    Array.from(scope.querySelectorAll<HTMLElement>("[data-collection-item-id]"))
      .find((item) => item.dataset.collectionItemId === itemId)
      ?? null
  );
}
