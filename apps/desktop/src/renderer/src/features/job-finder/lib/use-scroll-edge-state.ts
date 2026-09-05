import { useCallback, useEffect, useRef, useState } from "react";

export interface ScrollEdgeState {
  /** The owner has content hidden below the visible box. */
  canScrollDown: boolean;
  /** The owner has content hidden above the visible box. */
  canScrollUp: boolean;
  /** The owner has any vertical range at all. */
  isScrollable: boolean;
}

const IDLE_EDGE_STATE: ScrollEdgeState = {
  canScrollDown: false,
  canScrollUp: false,
  isScrollable: false,
};

// One device pixel of slack. Sub-pixel layout leaves a scrolled-to-bottom owner
// a fraction of a pixel short of its own range, and a stricter comparison makes
// a "Scroll for more" affordance flicker on every settle.
const EDGE_TOLERANCE = 1;

function readScrollEdgeState(element: HTMLElement): ScrollEdgeState {
  const range = element.scrollHeight - element.clientHeight;

  if (range <= EDGE_TOLERANCE) {
    return IDLE_EDGE_STATE;
  }

  return {
    canScrollDown: element.scrollTop < range - EDGE_TOLERANCE,
    canScrollUp: element.scrollTop > EDGE_TOLERANCE,
    isScrollable: true,
  };
}

function areEdgeStatesEqual(a: ScrollEdgeState, b: ScrollEdgeState): boolean {
  return (
    a.canScrollDown === b.canScrollDown &&
    a.canScrollUp === b.canScrollUp &&
    a.isScrollable === b.isScrollable
  );
}

/**
 * Tracks whether a scroll owner has content above or below the fold, without
 * making the app pay a React render for every scroll event.
 *
 * Two rules, both required by the nested-scroll work:
 *  - the `scroll` listener is **passive** and does nothing but request one
 *    animation frame, so scrolling stays on the compositor fast path;
 *  - state is written **only on an edge transition**. A continuous gesture over
 *    a long list produces exactly two renders (leaving the top, reaching the
 *    bottom) instead of one per wheel event.
 *
 * Use this instead of a `useState` written from a raw scroll handler. Panels
 * that render a "Scroll for more" affordance, a fading mask, or a sticky shadow
 * are the intended callers.
 */
export function useScrollEdgeState(): {
  edgeState: ScrollEdgeState;
  scrollRef: (node: HTMLElement | null) => void;
} {
  const [edgeState, setEdgeState] = useState<ScrollEdgeState>(IDLE_EDGE_STATE);
  const elementRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef<ScrollEdgeState>(IDLE_EDGE_STATE);
  const [element, setElement] = useState<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const node = elementRef.current;
    if (!node) {
      return;
    }

    const next = readScrollEdgeState(node);
    if (areEdgeStatesEqual(next, latestRef.current)) {
      return;
    }

    latestRef.current = next;
    setEdgeState(next);
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  const scrollRef = useCallback((node: HTMLElement | null) => {
    elementRef.current = node;
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) {
      latestRef.current = IDLE_EDGE_STATE;
      setEdgeState(IDLE_EDGE_STATE);
      return undefined;
    }

    measure();
    element.addEventListener("scroll", scheduleMeasure, { passive: true });

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasure);
    observer?.observe(element);

    return () => {
      element.removeEventListener("scroll", scheduleMeasure);
      observer?.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [element, measure, scheduleMeasure]);

  return { edgeState, scrollRef };
}

export const __testing = {
  areEdgeStatesEqual,
  readScrollEdgeState,
};
