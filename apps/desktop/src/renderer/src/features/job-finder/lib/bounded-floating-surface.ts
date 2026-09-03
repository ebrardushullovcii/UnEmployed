/**
 * One placement rule for every floating surface in Job Finder.
 *
 * Popovers, menus, dropdowns and floating panels used to anchor below their
 * trigger unconditionally and take whatever height was left under it. At short
 * window heights that produced surfaces whose content could only be reached by
 * resizing the window: the sidebar More menu anchored at y=391 and squeezed
 * seven destinations into 241px while 391px of window sat unused above it.
 *
 * This module owns the arithmetic so the behaviour is identical everywhere and
 * can be unit-tested without a browser:
 *
 * - collision avoidance in both axes (flip vertically, shift horizontally),
 * - a viewport-derived max height, never a fixed one,
 * - enough remaining height that an internal scroll region is usable.
 *
 * The rendering half (the scroll region and its edge indicators) lives in
 * `components/bounded-floating-surface.tsx`, which consumes this solver.
 */

export type BoundedFloatingSurfaceSide = "bottom" | "top";

/**
 * `auto` lines the surface up with whichever trigger edge points back into the
 * window: triggers in the left half open rightward, triggers in the right half
 * open leftward. The sidebar and the compact top bar host the same menu from
 * opposite sides, so the choice cannot be a constant.
 */
export type BoundedFloatingSurfaceAlignment = "auto" | "end" | "start";

export interface BoundedFloatingSurfaceRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface BoundedFloatingSurfaceViewport {
  height: number;
  width: number;
}

export interface BoundedFloatingSurfaceInput {
  /** Trigger rectangle in viewport coordinates. */
  anchor: BoundedFloatingSurfaceRect;
  /**
   * Which trigger edge the surface lines up with. `start` keeps the surface's
   * left edge on the trigger's left edge; `end` keeps the right edges together.
   */
  alignment?: BoundedFloatingSurfaceAlignment;
  /** Gap between the trigger and the surface. */
  gap?: number;
  /**
   * Content height the surface would take if nothing constrained it. When it
   * fits on the preferred side the surface stays there even if the opposite
   * side is roomier, so a menu does not jump around as its content changes.
   */
  desiredHeight?: number;
  /** Distance the surface keeps from every viewport edge. */
  margin?: number;
  /**
   * Below this height a side is treated as unusable, so the solver flips even
   * when the preferred side technically has a few pixels left.
   */
  minUsableHeight?: number;
  minWidth?: number;
  preferredWidth: number;
  /** Preferred side; the solver only leaves it when the other side is better. */
  side?: BoundedFloatingSurfaceSide;
  viewport: BoundedFloatingSurfaceViewport;
}

export interface BoundedFloatingSurfacePlacement {
  /** Height available on the chosen side, before the surface is clamped. */
  availableHeight: number;
  left: number;
  maxHeight: number;
  side: BoundedFloatingSurfaceSide;
  top: number;
  width: number;
}

export const BOUNDED_FLOATING_SURFACE_DEFAULT_GAP_PX = 4;
export const BOUNDED_FLOATING_SURFACE_DEFAULT_MARGIN_PX = 8;
/**
 * A header row plus roughly two rows of content. Under this a surface cannot
 * show enough to be operated, so flipping is always preferable.
 */
export const BOUNDED_FLOATING_SURFACE_MIN_USABLE_HEIGHT_PX = 160;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Resolve one bounded, collision-aware placement.
 *
 * Vertical rule: stay on the preferred side when the desired height fits there
 * and that side is usable; otherwise take whichever side offers more room.
 * The returned `maxHeight` is always the space actually available on the chosen
 * side, so the caller can render an internal scroll region rather than paint
 * outside the window.
 *
 * Horizontal rule: line the surface up with the requested trigger edge, then
 * shift it back inside the viewport margins, narrowing it only when the
 * viewport itself is narrower than the preferred width.
 */
export function resolveBoundedFloatingSurfacePlacement(
  input: BoundedFloatingSurfaceInput,
): BoundedFloatingSurfacePlacement {
  const gap = input.gap ?? BOUNDED_FLOATING_SURFACE_DEFAULT_GAP_PX;
  const margin = input.margin ?? BOUNDED_FLOATING_SURFACE_DEFAULT_MARGIN_PX;
  const minUsableHeight =
    input.minUsableHeight ?? BOUNDED_FLOATING_SURFACE_MIN_USABLE_HEIGHT_PX;
  const preferredSide = input.side ?? "bottom";

  const availableBelow = Math.max(
    0,
    input.viewport.height - input.anchor.bottom - gap - margin,
  );
  const availableAbove = Math.max(0, input.anchor.top - gap - margin);

  const preferredAvailable =
    preferredSide === "bottom" ? availableBelow : availableAbove;
  const oppositeAvailable =
    preferredSide === "bottom" ? availableAbove : availableBelow;
  const desiredHeight = input.desiredHeight ?? 0;

  // Stay put when the content fits and the side is usable. Only a genuinely
  // roomier opposite side earns a flip, so the surface does not oscillate.
  const fitsOnPreferredSide =
    desiredHeight > 0 &&
    preferredAvailable >= desiredHeight &&
    preferredAvailable >= minUsableHeight;
  const keepsPreferredSide =
    fitsOnPreferredSide || oppositeAvailable <= preferredAvailable;

  const side: BoundedFloatingSurfaceSide = keepsPreferredSide
    ? preferredSide
    : preferredSide === "bottom"
      ? "top"
      : "bottom";

  const availableHeight = side === "bottom" ? availableBelow : availableAbove;
  // A viewport too short for either side still gets a positive, scrollable box
  // instead of a zero-height surface with unreachable content.
  const maxHeight = Math.max(
    1,
    Math.min(availableHeight, input.viewport.height - margin * 2),
  );

  const maxWidth = Math.max(1, input.viewport.width - margin * 2);
  const minWidth = Math.min(input.minWidth ?? 0, maxWidth);
  const width = clamp(input.preferredWidth, minWidth, maxWidth);

  const requestedAlignment = input.alignment ?? "start";
  const alignment =
    requestedAlignment === "auto"
      ? (input.anchor.left + input.anchor.right) / 2 > input.viewport.width / 2
        ? "end"
        : "start"
      : requestedAlignment;
  const unshiftedLeft =
    alignment === "end" ? input.anchor.right - width : input.anchor.left;
  const left = clamp(
    unshiftedLeft,
    margin,
    Math.max(margin, input.viewport.width - margin - width),
  );

  const top =
    side === "bottom"
      ? input.anchor.bottom + gap
      : Math.max(margin, input.anchor.top - gap - maxHeight);

  return { availableHeight, left, maxHeight, side, top, width };
}
