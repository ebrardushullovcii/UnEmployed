/**
 * The gutters the Job Finder shell keeps around a scrolling route, named once
 * so a route that has to reason about them cannot drift from the shell.
 *
 * Both are ordinary padding on the shell's `<main>`, which is also the scroll
 * owner for those routes. That makes them invisible to routes that only stack
 * content, and load-bearing for the two that do not:
 *
 * - Bottom: `position: sticky` is clamped to its containing block, and that
 *   block ends where this padding starts. A route with bottom-anchored sticky
 *   chrome (the Settings unsaved-changes bar) therefore came to rest 40px above
 *   the window bottom, with the page's own cards still rendering under and
 *   below it. Such a route cancels the gutter with the paired class and paints
 *   its own bottom edge.
 * - Top: content scrolls through this band, and a route's sticky
 *   sub-navigation cannot cover it for the same clamping reason. The shell's
 *   header mask has to be opaque across at least this much, or a readable
 *   half-line of the page floats between the header and the sub-navigation.
 *
 * The pixel values exist so tests can assert the relationships (cancel ==
 * gutter, mask >= top gutter) instead of restating the classes.
 */
export const SHELL_SCROLLING_ROUTE_BOTTOM_GUTTER_CLASS = "pb-10";
export const SHELL_SCROLLING_ROUTE_BOTTOM_GUTTER_CANCEL_CLASS = "-mb-10";
export const SHELL_SCROLLING_ROUTE_BOTTOM_GUTTER_PX = 40;

export const SHELL_SCROLLING_ROUTE_TOP_GUTTER_CLASS = "pt-3";
export const SHELL_SCROLLING_ROUTE_TOP_GUTTER_PX = 12;

/**
 * The shell header mask is exactly the top gutter, fully opaque, and nothing
 * more: any fade tail past the gutter lands on the first row of every route at
 * scroll 0 and reads as a shadow across its controls. Nested scrollers that
 * show their edge treatment only while clipping (the Find jobs inspector) keep
 * the fade below, sized from the shared stop.
 */
/**
 * How far a route's bottom-anchored sticky chrome ends up above the scrollport
 * bottom, in px. `0` means flush.
 *
 * A sticky box is clamped to its containing block, so both the scroll owner's
 * own bottom padding and any padding the route leaves *after* the chrome push
 * the chrome up off the window edge — the route then renders live content in
 * the band the chrome vacated. A route cancels the shell gutter with a
 * negative bottom margin (pass it as a negative number) and leaves no trailing
 * padding of its own.
 */
export function getStickyBottomChromeGapPx(input: {
  routeBottomMarginPx: number;
  routeTrailingPaddingPx: number;
  scrollOwnerBottomPaddingPx: number;
}): number {
  return Math.max(
    0,
    input.scrollOwnerBottomPaddingPx +
      input.routeBottomMarginPx +
      input.routeTrailingPaddingPx,
  );
}

export const SHELL_HEADER_MASK_HEIGHT_CLASS = "h-3";
export const SHELL_HEADER_MASK_HEIGHT_PX = 12;
export const SHELL_HEADER_MASK_OPAQUE_STOP_CLASS = "from-60%";
export const SHELL_HEADER_MASK_OPAQUE_STOP_FRACTION = 0.6;

/**
 * How much of a mask of this height is fully opaque, in px.
 *
 * The ratio lives here and only here. A surface that masks a differently
 * sized gutter — the Find jobs inspector's own scroller pads its edges by 24px
 * where the shell's route gutter is 12px — needs a different mask height, and
 * hand-computing the opaque band beside that height is how the two chrome
 * defects this module exists to prevent were introduced in the first place.
 * Pass a candidate height in, compare against the gutter it has to cover.
 *
 * The invariant every masked surface must satisfy:
 *
 *     getMaskOpaqueBandPx(maskHeightPx) >= that container's gutter
 *
 * Below that, a row sitting between the opaque band and the end of the gutter
 * renders semi-transparent and reads as a glyph cut through the middle.
 */
export function getMaskOpaqueBandPx(maskHeightPx: number): number {
  return maskHeightPx * SHELL_HEADER_MASK_OPAQUE_STOP_FRACTION;
}

/**
 * The smallest mask height whose opaque band covers `gutterPx`.
 *
 * Returned as a number rather than a class because Tailwind only emits classes
 * it can find as literal text in the source; the literal still has to be
 * written at the surface that uses it, and pinned there by a test that calls
 * this. That keeps the arithmetic in one place while leaving the class
 * scannable.
 */
export function getMinimumMaskHeightPxForGutter(gutterPx: number): number {
  return Math.ceil(gutterPx / SHELL_HEADER_MASK_OPAQUE_STOP_FRACTION);
}
