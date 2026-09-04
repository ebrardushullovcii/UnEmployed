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

/* -------------------------------------------------------------------------
 * The bottom-right dock.
 *
 * Three unrelated surfaces used to claim that corner without knowing about
 * each other: the Assistant/Copilot launcher pill (lifted off two page-level
 * markers), the startup database recovery notice (`fixed bottom-4 right-4`,
 * which simply painted on top of the pill), and the save status lane (whose
 * `maxHeight` ran to the window bottom, straight through both). This is the
 * one arbitration they all read.
 * ------------------------------------------------------------------------- */

/**
 * Every action row in the renderer marked with a `data-*-actions` attribute.
 *
 * CSS has no attribute-name wildcard, so the set is named once here instead of
 * being re-derived per surface — the pill previously cleared only
 * `[data-profile-workspace-actions]` and `[data-profile-section-tabs]`, which
 * is why at 1200x640 it landed on a section's own `Add experience` button. The
 * adoption guard asserts this list still covers every `data-*-actions`
 * attribute literal in the feature tree, so a new marker fails a test rather
 * than silently losing its clearance.
 */
export const BOTTOM_RIGHT_DOCK_ACTION_ROW_ATTRIBUTES = [
  "data-page-header-actions",
  "data-profile-copilot-review-actions",
  "data-profile-workspace-actions",
  "data-resume-assistant-quick-actions",
  "data-resume-workspace-top-actions",
] as const;

/**
 * Rows a dock occupant must clear that are not `*-actions` attributes.
 *
 * These are not launcher-specific and never were: the startup recovery notice
 * is still a dock occupant, and it must no more cover the Profile section tabs
 * (below xl the only route between sections) or the Studio tools column's
 * provenance/undo row than the retired launcher pill did. They were emptied
 * with the launcher's own entries by mistake and are restored here.
 *
 * `data-resume-entry-bullet-actions` is deliberately NOT here, and did not
 * come back to the list above: it never existed. The only attribute in the
 * tree with that prefix is `data-resume-entry-bullet-actions-legend`, and a
 * greedy scan backtracked the `-legend` suffix off to invent a row nothing
 * renders.
 */
export const BOTTOM_RIGHT_DOCK_EXTRA_NO_COVER_SELECTORS: readonly string[] = [
  "[data-profile-section-tabs]",
  "[data-resume-draft-provenance]",
];

export const BOTTOM_RIGHT_DOCK_NO_COVER_SELECTOR = [
  ...BOTTOM_RIGHT_DOCK_ACTION_ROW_ATTRIBUTES.map(
    (attribute) => `[${attribute}]`,
  ),
  ...BOTTOM_RIGHT_DOCK_EXTRA_NO_COVER_SELECTORS,
].join(", ");

/** Distance the dock keeps from a row it may not cover. */
export const BOTTOM_RIGHT_DOCK_CLEARANCE_GAP_PX = 24;
/** Distance between two stacked dock occupants. */
export const BOTTOM_RIGHT_DOCK_STACK_GAP_PX = 12;
export const BOTTOM_RIGHT_DOCK_DEFAULT_INSET_PX = 16;

/**
 * Who sits where in the stack; lower is nearer the bottom edge.
 *
 * The Assistant/Copilot launcher is deliberately absent. It used to be `0`
 * here, parked in this corner over whatever screen was behind it; it is an
 * ordinary button in each screen's own action row now, so the dock holds only
 * transient status surfaces.
 */
export const BOTTOM_RIGHT_DOCK_ORDER = {
  notice: 0,
} as const;

export interface BottomRightDockOccupant {
  /** Stable identity; also the key the registry stores the surface under. */
  readonly id: string;
  readonly height: number;
  /**
   * Lower sorts nearer the bottom edge, so the surface most likely to already
   * be on screen keeps its place when another appears above it. The dock holds
   * only transient status surfaces; see `BOTTOM_RIGHT_DOCK_ORDER`.
   */
  readonly order: number;
  readonly width: number;
}

export interface BottomRightDockInput {
  readonly clearanceGap?: number;
  readonly inset?: number;
  /** Highest viewport y the dock may reach; usually the shell header bottom. */
  readonly minTopOffset: number;
  readonly noCoverRects: readonly BoundedFloatingSurfaceRect[];
  readonly occupants: readonly BottomRightDockOccupant[];
  readonly stackGap?: number;
  readonly viewport: BoundedFloatingSurfaceViewport;
}

export interface BottomRightDockSlot {
  /** Distance from the viewport bottom to this surface's bottom edge. */
  readonly bottom: number;
  readonly id: string;
  readonly right: number;
}

export interface BottomRightDockPlacement {
  /**
   * Distance the whole stack is lifted off the viewport bottom. Equal to the
   * inset when nothing is in the way.
   */
  readonly clearance: number;
  readonly slots: readonly BottomRightDockSlot[];
  /**
   * Viewport y of the topmost painted dock pixel. Surfaces that are not dock
   * occupants — the save status lane — bound themselves against this instead
   * of running to the window bottom.
   */
  readonly stackTop: number;
}

/**
 * Stack the dock's occupants from the bottom-right corner upward, then lift
 * the whole stack above any no-cover row it would sit on.
 *
 * Lifting the stack as one unit (rather than per occupant) is what keeps the
 * occupants from re-ordering or overlapping as rows move under them, and the
 * lift is re-checked after each pass because two rows can overlap each other.
 */
export function resolveBottomRightDockPlacement(
  input: BottomRightDockInput,
): BottomRightDockPlacement {
  const inset = input.inset ?? BOTTOM_RIGHT_DOCK_DEFAULT_INSET_PX;
  const stackGap = input.stackGap ?? BOTTOM_RIGHT_DOCK_STACK_GAP_PX;
  const clearanceGap = input.clearanceGap ?? BOTTOM_RIGHT_DOCK_CLEARANCE_GAP_PX;
  const occupants = [...input.occupants]
    .filter((occupant) => occupant.height > 0 || occupant.width > 0)
    .sort((left, right) =>
      left.order === right.order
        ? left.id.localeCompare(right.id)
        : left.order - right.order,
    );

  const stackHeight = occupants.reduce(
    (total, occupant, index) =>
      total + Math.max(0, occupant.height) + (index === 0 ? 0 : stackGap),
    0,
  );
  const stackWidth = occupants.reduce(
    (widest, occupant) => Math.max(widest, Math.max(0, occupant.width)),
    0,
  );

  const columnRight = input.viewport.width - inset;
  const columnLeft = columnRight - stackWidth;
  // A dock that would be pushed above its own ceiling stops at the ceiling and
  // scrolls/overlaps honestly rather than leaving the window.
  const maxClearance = Math.max(
    inset,
    input.viewport.height - stackHeight - Math.max(0, input.minTopOffset),
  );

  const targets = input.noCoverRects.filter(
    (rect) =>
      Number.isFinite(rect.left) &&
      Number.isFinite(rect.right) &&
      Number.isFinite(rect.top) &&
      Number.isFinite(rect.bottom) &&
      rect.bottom > 0 &&
      rect.top < input.viewport.height &&
      rect.right > columnLeft &&
      rect.left < columnRight,
  );

  let clearance = inset;
  if (stackHeight > 0) {
    for (let pass = 0; pass <= targets.length; pass += 1) {
      const stackBottom = input.viewport.height - clearance;
      const stackTop = stackBottom - stackHeight;
      const overlapping = targets.find(
        (rect) =>
          rect.bottom + clearanceGap > stackTop &&
          rect.top - clearanceGap < stackBottom,
      );

      if (!overlapping) {
        break;
      }

      const needed = input.viewport.height - overlapping.top + clearanceGap;
      const nextClearance = Math.min(needed, maxClearance);

      if (nextClearance <= clearance) {
        break;
      }

      clearance = nextClearance;
    }
  }

  clearance = Math.ceil(clearance);

  const slots: BottomRightDockSlot[] = [];
  let cursor = clearance;
  for (const occupant of occupants) {
    slots.push({ bottom: Math.ceil(cursor), id: occupant.id, right: inset });
    cursor += Math.max(0, occupant.height) + stackGap;
  }

  return {
    clearance,
    slots,
    // Clamped at the window top: a stack taller than the space available would
    // otherwise report a negative y, and a reader bounding itself against that
    // would compute a negative height rather than simply stopping at the edge.
    stackTop: Math.max(0, input.viewport.height - (clearance + stackHeight)),
  };
}
