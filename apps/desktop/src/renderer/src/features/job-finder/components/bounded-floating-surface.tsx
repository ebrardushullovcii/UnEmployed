import { cn } from "@renderer/lib/cn";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import type {
  BoundedFloatingSurfaceAlignment,
  BoundedFloatingSurfacePlacement,
  BoundedFloatingSurfaceSide,
} from "../lib/bounded-floating-surface";
import { resolveBoundedFloatingSurfacePlacement } from "../lib/bounded-floating-surface";

/**
 * Shared floating-surface layer. Every popover, menu, dropdown and floating
 * panel in Job Finder goes through this so the bound is applied once instead of
 * being re-derived per call site: collision avoidance (flip and shift), a
 * viewport-derived max height, and an internal scroll region whose edge
 * indicators sit at the edge they describe.
 *
 * Exported for other surfaces (the Studio Assistant panel, search history) so
 * they inherit the same behaviour without copying the measurement code.
 */

export interface UseBoundedFloatingSurfaceOptions {
  alignment?: BoundedFloatingSurfaceAlignment;
  /**
   * Height the surface wants when nothing constrains it. Supplying it keeps a
   * comfortably-fitting surface on its preferred side instead of flipping just
   * because the other side happens to be a few pixels roomier.
   */
  desiredHeight?: number;
  gap?: number;
  margin?: number;
  minWidth?: number;
  open: boolean;
  preferredWidth: number;
  side?: BoundedFloatingSurfaceSide;
  /** Resolves the current trigger; sidebar and compact triggers can differ. */
  triggerRef: RefObject<HTMLElement | null> | (() => HTMLElement | null);
}

function readViewport(): { height: number; width: number } {
  const documentRect = document.documentElement.getBoundingClientRect();
  return {
    height: window.visualViewport?.height ?? documentRect.height,
    width: window.visualViewport?.width ?? documentRect.width,
  };
}

/**
 * Measure the trigger and keep one bounded placement in sync with the window.
 * Returns `null` until the first measurement lands so callers never paint an
 * unbounded surface for a frame.
 */
export function useBoundedFloatingSurface(
  options: UseBoundedFloatingSurfaceOptions,
): BoundedFloatingSurfacePlacement | null {
  const {
    alignment,
    desiredHeight,
    gap,
    margin,
    minWidth,
    open,
    preferredWidth,
    side,
    triggerRef,
  } = options;
  const [placement, setPlacement] =
    useState<BoundedFloatingSurfacePlacement | null>(null);

  const resolveTrigger = useCallback((): HTMLElement | null => {
    if (typeof triggerRef === "function") {
      return triggerRef();
    }
    return triggerRef.current;
  }, [triggerRef]);

  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }

    const update = () => {
      const trigger = resolveTrigger();
      if (!trigger) {
        return;
      }
      const anchor = trigger.getBoundingClientRect();
      const next = resolveBoundedFloatingSurfacePlacement({
        anchor,
        viewport: readViewport(),
        preferredWidth,
        ...(alignment === undefined ? {} : { alignment }),
        ...(desiredHeight === undefined ? {} : { desiredHeight }),
        ...(gap === undefined ? {} : { gap }),
        ...(margin === undefined ? {} : { margin }),
        ...(minWidth === undefined ? {} : { minWidth }),
        ...(side === undefined ? {} : { side }),
      });
      setPlacement((current) =>
        current &&
        current.left === next.left &&
        current.maxHeight === next.maxHeight &&
        current.side === next.side &&
        current.top === next.top &&
        current.width === next.width
          ? current
          : next,
      );
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [
    alignment,
    desiredHeight,
    gap,
    margin,
    minWidth,
    open,
    preferredWidth,
    resolveTrigger,
    side,
  ]);

  return placement;
}

export function boundedFloatingSurfaceStyle(
  placement: BoundedFloatingSurfacePlacement | null,
): CSSProperties | undefined {
  if (!placement) {
    return undefined;
  }
  return {
    left: placement.left,
    maxHeight: placement.maxHeight,
    top: placement.top,
    width: placement.width,
  };
}

export interface BoundedFloatingSurfaceScrollState {
  atEnd: boolean;
  atStart: boolean;
  hasOverflow: boolean;
}

export const NO_BOUNDED_FLOATING_SURFACE_SCROLL_STATE: BoundedFloatingSurfaceScrollState =
  { atEnd: true, atStart: true, hasOverflow: false };

/**
 * Track whether a bounded surface's scroll region actually overflows, so the
 * "more above"/"more below" hints only appear at an edge that has content past
 * it. `revision` re-measures when the surface's content changes.
 */
export function useBoundedFloatingSurfaceScrollState(
  scrollRef: RefObject<HTMLElement | null>,
  active: boolean,
  revision?: unknown,
): BoundedFloatingSurfaceScrollState {
  const [state, setState] = useState<BoundedFloatingSurfaceScrollState>(
    NO_BOUNDED_FLOATING_SURFACE_SCROLL_STATE,
  );

  useLayoutEffect(() => {
    if (!active) {
      setState(NO_BOUNDED_FLOATING_SURFACE_SCROLL_STATE);
      return undefined;
    }
    const region = scrollRef.current;
    if (!region) {
      return undefined;
    }

    const measure = () => {
      const maxScrollTop = Math.max(
        0,
        region.scrollHeight - region.clientHeight,
      );
      const hasOverflow = maxScrollTop > 1;
      const next: BoundedFloatingSurfaceScrollState = {
        atEnd: !hasOverflow || region.scrollTop >= maxScrollTop - 1,
        atStart: !hasOverflow || region.scrollTop <= 1,
        hasOverflow,
      };
      setState((current) =>
        current.atEnd === next.atEnd &&
        current.atStart === next.atStart &&
        current.hasOverflow === next.hasOverflow
          ? current
          : next,
      );
    };

    measure();
    region.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(region);
    return () => {
      region.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [active, revision, scrollRef]);

  return state;
}

export interface BoundedFloatingSurfaceScrollHintProps {
  edge: "end" | "start";
  visible: boolean;
}

/**
 * A hint printed at the edge it describes. The previous More-menu affordance
 * printed "More content above ↑" in the popover's bottom footer.
 */
export function BoundedFloatingSurfaceScrollHint({
  edge,
  visible,
}: BoundedFloatingSurfaceScrollHintProps): ReactNode {
  if (!visible) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 flex h-6 items-center justify-center gap-1 text-(length:--text-tiny) font-medium text-foreground-muted",
        edge === "start"
          ? "top-0 bg-gradient-to-b from-(--surface-panel-raised) to-transparent"
          : "bottom-0 bg-gradient-to-t from-(--surface-panel-raised) to-transparent",
      )}
      data-bounded-floating-surface-scroll-hint={edge}
    >
      {edge === "start" ? "↑" : "↓"}
    </div>
  );
}
