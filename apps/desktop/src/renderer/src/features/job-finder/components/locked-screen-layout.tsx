import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@renderer/lib/cn";

const LOCKED_PANE_BREAKPOINT = 1280;
const SCROLL_BOUNDARY_TOLERANCE = 1;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const INTERACTIVE_KEYBOARD_TARGET_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]',
  '[role="treeitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function normalizeWheelDeltaY(
  deltaY: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (deltaMode === WHEEL_DELTA_LINE) {
    return deltaY * 16;
  }
  if (deltaMode === WHEEL_DELTA_PAGE) {
    return deltaY * pageSize;
  }
  return deltaY;
}

export function getLockedScreenLayoutHeight(
  topHeight: number,
  lockTopContent: boolean,
): string | undefined {
  return lockTopContent && topHeight > 0
    ? `calc(100% + ${topHeight}px)`
    : undefined;
}

export function getLockedHeaderWheelTarget(input: {
  deltaY: number;
  scrollTop: number;
  topHeight: number;
  viewportWidth: number;
}): number | null {
  if (
    input.viewportWidth < LOCKED_PANE_BREAKPOINT ||
    input.deltaY === 0 ||
    input.topHeight <= 0 ||
    (input.deltaY > 0 &&
      input.scrollTop >= input.topHeight - SCROLL_BOUNDARY_TOLERANCE) ||
    (input.deltaY < 0 && input.scrollTop <= SCROLL_BOUNDARY_TOLERANCE)
  ) {
    return null;
  }

  return Math.max(0, Math.min(input.topHeight, input.scrollTop + input.deltaY));
}

export function canNestedPaneConsumeWheel(input: {
  clientHeight: number;
  deltaY: number;
  scrollHeight: number;
  scrollTop: number;
}): boolean {
  if (input.deltaY > 0) {
    return input.scrollTop + input.clientHeight < input.scrollHeight - 1;
  }
  if (input.deltaY < 0) {
    return input.scrollTop > 1;
  }
  return false;
}

export function getNestedPaneWheelTarget(input: {
  clientHeight: number;
  deltaMode: number;
  deltaY: number;
  scrollHeight: number;
  scrollTop: number;
}): number | null {
  if (!canNestedPaneConsumeWheel(input)) {
    return null;
  }

  const pixelDelta = normalizeWheelDeltaY(
    input.deltaY,
    input.deltaMode,
    input.clientHeight,
  );
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);

  return Math.max(0, Math.min(maxScrollTop, input.scrollTop + pixelDelta));
}

function isNativeWheelOwnerElement(element: HTMLElement): boolean {
  return (
    element.isContentEditable ||
    element.hasAttribute("contenteditable") ||
    element.tagName === "INPUT" ||
    element.tagName === "SELECT" ||
    element.tagName === "TEXTAREA"
  );
}

export function isVerticallyScrollableElement(element: HTMLElement): boolean {
  const overflowY = window.getComputedStyle(element).overflowY;

  if (overflowY !== "auto" && overflowY !== "scroll") {
    return false;
  }

  return element.scrollHeight > element.clientHeight + SCROLL_BOUNDARY_TOLERANCE;
}

/**
 * Walks ancestors from the wheel target up to the layout content root and
 * collects the vertical scroll owners under the pointer, deepest first. The
 * nearest marked pane ends the chain; everything above it stays owned by the
 * header and outer page. Returns null when the pointer is over a text control
 * so the browser keeps native ownership of the event, including chaining.
 */
export function collectLockedWheelScrollChain(input: {
  contentRoot: Element;
  target: Element;
}): HTMLElement[] | null {
  const chain: HTMLElement[] = [];
  let node: Element | null = input.target;

  while (node && node !== input.contentRoot) {
    if (node instanceof HTMLElement) {
      if (isNativeWheelOwnerElement(node)) {
        return null;
      }
      if (node.dataset.lockedPaneScrollRegion !== undefined) {
        chain.push(node);
        return chain;
      }
      if (isVerticallyScrollableElement(node)) {
        chain.push(node);
      }
    }
    node = node.parentElement;
  }

  return chain;
}

interface LockedScreenLayoutProps {
  children: ReactNode;
  contentClassName?: string;
  lockTopContent?: boolean;
  reserveRightRail?: boolean;
  topClassName?: string;
  topContent: ReactNode;
}

export function LockedScreenLayout({
  children,
  contentClassName,
  lockTopContent = true,
  reserveRightRail = false,
  topClassName = "pb-2 pt-2",
  topContent,
}: LockedScreenLayoutProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [topHeight, setTopHeight] = useState(0);

  useLayoutEffect(() => {
    const node = topRef.current;

    if (!node) {
      return undefined;
    }

    const updateTopHeight = () => {
      setTopHeight(node.getBoundingClientRect().height);
    };

    updateTopHeight();

    const observer = new ResizeObserver(() => {
      updateTopHeight();
    });

    observer.observe(node);
    window.addEventListener("resize", updateTopHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTopHeight);
    };
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    const scrollArea = scrollRef.current;

    if (!content || !scrollArea) {
      return undefined;
    }

    const handleContentWheel = (event: WheelEvent) => {
      if (
        !lockTopContent ||
        window.innerWidth < LOCKED_PANE_BREAKPOINT ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const eventTarget = event.target instanceof Element ? event.target : null;
      if (!eventTarget || !content.contains(eventTarget)) {
        return;
      }

      const scrollChain = collectLockedWheelScrollChain({
        contentRoot: content,
        target: eventTarget,
      });
      if (!scrollChain) {
        return;
      }

      const pageSize =
        (scrollChain[0]?.clientHeight ?? scrollArea.clientHeight) ||
        window.innerHeight * 0.85;
      let remainingDeltaY = normalizeWheelDeltaY(
        event.deltaY,
        event.deltaMode,
        pageSize,
      );
      if (remainingDeltaY === 0) {
        return;
      }

      const initialOuterScrollTop = scrollArea.scrollTop;
      let nextOuterScrollTop = initialOuterScrollTop;
      const paneTargets = new Map<HTMLElement, number>();
      let didManualConsumption = false;

      const consumeLockedHeader = () => {
        const headerTarget = getLockedHeaderWheelTarget({
          deltaY: remainingDeltaY,
          scrollTop: nextOuterScrollTop,
          topHeight,
          viewportWidth: window.innerWidth,
        });
        if (headerTarget === null) {
          return;
        }

        const consumedDeltaY = headerTarget - nextOuterScrollTop;
        nextOuterScrollTop = headerTarget;
        remainingDeltaY -= consumedDeltaY;
        didManualConsumption ||= consumedDeltaY !== 0;
      };

      // The chain is ordered deepest first: an unmarked inner well consumes
      // before its marked pane, and the marked pane consumes before the
      // outer page.
      const consumeChainScroller = (scrollable: HTMLElement) => {
        const paneStart = scrollable.scrollTop;
        const paneTarget = getNestedPaneWheelTarget({
          clientHeight: scrollable.clientHeight,
          deltaMode: 0,
          deltaY: remainingDeltaY,
          scrollHeight: scrollable.scrollHeight,
          scrollTop: paneStart,
        });
        if (paneTarget === null) {
          return;
        }

        paneTargets.set(scrollable, paneTarget);
        remainingDeltaY -= paneTarget - paneStart;
        didManualConsumption ||= paneTarget !== paneStart;
      };

      if (remainingDeltaY > 0) {
        consumeLockedHeader();
        scrollChain.forEach(consumeChainScroller);
      } else {
        scrollChain.forEach(consumeChainScroller);
        if (remainingDeltaY < 0) {
          consumeLockedHeader();
        }
      }

      // If a scroller or the header reached its boundary during this event, let
      // any remaining delta continue through the outer scroll owner. Setting
      // scrollTop keeps the handoff deterministic while the browser still
      // clamps to the outer element's real scroll range.
      if (didManualConsumption && remainingDeltaY !== 0) {
        nextOuterScrollTop = Math.max(0, nextOuterScrollTop + remainingDeltaY);
      }

      const outerMoved = nextOuterScrollTop !== initialOuterScrollTop;
      const movedPaneTargets: Array<[HTMLElement, number]> = [];
      for (const [scrollable, paneTarget] of paneTargets) {
        if (scrollable.scrollTop !== paneTarget) {
          movedPaneTargets.push([scrollable, paneTarget]);
        }
      }
      if (!outerMoved && movedPaneTargets.length === 0) {
        return;
      }

      event.preventDefault();
      if (outerMoved) {
        scrollArea.scrollTop = nextOuterScrollTop;
      }
      for (const [scrollable, paneTarget] of movedPaneTargets) {
        scrollable.scrollTop = paneTarget;
      }
    };

    const handleContentKeyDown = (event: KeyboardEvent) => {
      if (
        !lockTopContent ||
        window.innerWidth < LOCKED_PANE_BREAKPOINT ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const eventTarget = target instanceof Element ? target : null;
      if (!eventTarget || !content.contains(eventTarget)) {
        return;
      }

      const nestedScrollPane = eventTarget.closest<HTMLElement>(
        "[data-locked-pane-scroll-region]",
      );

      // A focusable nested pane owns scrolling only while the pane itself has
      // focus. Descendant controls retain their native keyboard behavior.
      if (nestedScrollPane && eventTarget !== nestedScrollPane) {
        return;
      }

      // Leave keyboard ownership with controls and other interactive
      // descendants. In particular, Space must still activate buttons,
      // links, summaries, and custom role=button elements.
      if (
        eventTarget !== nestedScrollPane &&
        eventTarget.closest<HTMLElement>(INTERACTIVE_KEYBOARD_TARGET_SELECTOR)
      ) {
        return;
      }

      const key = event.key;
      const isArrowDown = key === "ArrowDown";
      const isArrowUp = key === "ArrowUp";
      const isPageDown = key === "PageDown";
      const isPageUp = key === "PageUp";
      const isHome = key === "Home";
      const isEnd = key === "End";
      const isSpace = key === " " || key === "Spacebar" || key === "Space";

      if (
        !isArrowDown &&
        !isArrowUp &&
        !isPageDown &&
        !isPageUp &&
        !isHome &&
        !isEnd &&
        !isSpace
      ) {
        return;
      }

      if (isHome || isEnd) {
        if (nestedScrollPane && content.contains(nestedScrollPane)) {
          const maxPaneTop = Math.max(
            0,
            nestedScrollPane.scrollHeight - nestedScrollPane.clientHeight,
          );
          if (
            isHome &&
            nestedScrollPane.scrollTop > SCROLL_BOUNDARY_TOLERANCE
          ) {
            event.preventDefault();
            nestedScrollPane.scrollTop = 0;
            return;
          }
          if (
            isEnd &&
            nestedScrollPane.scrollTop < maxPaneTop - SCROLL_BOUNDARY_TOLERANCE
          ) {
            event.preventDefault();
            nestedScrollPane.scrollTop = maxPaneTop;
            return;
          }
        }

        if (isHome && scrollArea.scrollTop > SCROLL_BOUNDARY_TOLERANCE) {
          event.preventDefault();
          scrollArea.scrollTop = 0;
          return;
        }

        if (isEnd) {
          const maxOuter = Math.max(
            0,
            scrollArea.scrollHeight - scrollArea.clientHeight,
          );
          const targetTop = Math.max(topHeight, maxOuter);
          if (scrollArea.scrollTop < targetTop - SCROLL_BOUNDARY_TOLERANCE) {
            event.preventDefault();
            scrollArea.scrollTop = targetTop;
          }
        }
        return;
      }

      let deltaY: number | null = null;
      if (isArrowDown) deltaY = 40;
      else if (isArrowUp) deltaY = -40;
      else if (isPageDown)
        deltaY =
          (nestedScrollPane?.clientHeight ?? scrollArea.clientHeight) ||
          window.innerHeight * 0.85;
      else if (isPageUp)
        deltaY = -(
          (nestedScrollPane?.clientHeight ?? scrollArea.clientHeight) ||
          window.innerHeight * 0.85
        );
      else if (isSpace) {
        const pageSize =
          (nestedScrollPane?.clientHeight ?? scrollArea.clientHeight) ||
          window.innerHeight * 0.85;
        deltaY = event.shiftKey ? -pageSize : pageSize;
      }

      if (deltaY === null) {
        return;
      }

      let remainingDeltaY = deltaY;
      const initialOuterScrollTop = scrollArea.scrollTop;
      let nextOuterScrollTop = initialOuterScrollTop;
      let nextNestedScrollTop: number | null = null;

      const consumeLockedHeader = () => {
        const headerTarget = getLockedHeaderWheelTarget({
          deltaY: remainingDeltaY,
          scrollTop: nextOuterScrollTop,
          topHeight,
          viewportWidth: window.innerWidth,
        });
        if (headerTarget === null) {
          return;
        }

        const consumedDeltaY = headerTarget - nextOuterScrollTop;
        nextOuterScrollTop = headerTarget;
        remainingDeltaY -= consumedDeltaY;
      };

      const consumeNestedPane = () => {
        if (!nestedScrollPane || !content.contains(nestedScrollPane)) {
          return;
        }

        const paneStart = nestedScrollPane.scrollTop;
        const paneTarget = getNestedPaneWheelTarget({
          clientHeight: nestedScrollPane.clientHeight,
          deltaMode: 0,
          deltaY: remainingDeltaY,
          scrollHeight: nestedScrollPane.scrollHeight,
          scrollTop: paneStart,
        });
        if (paneTarget === null) {
          return;
        }

        nextNestedScrollTop = paneTarget;
        remainingDeltaY -= paneTarget - paneStart;
      };

      if (remainingDeltaY > 0) {
        consumeLockedHeader();
        consumeNestedPane();
      } else {
        consumeNestedPane();
        if (remainingDeltaY < 0) {
          consumeLockedHeader();
        }
      }

      if (remainingDeltaY !== 0) {
        const maxOuterScrollTop = Math.max(
          0,
          scrollArea.scrollHeight - scrollArea.clientHeight,
        );
        const candidateOuterScrollTop = Math.max(
          0,
          nextOuterScrollTop + remainingDeltaY,
        );
        nextOuterScrollTop =
          maxOuterScrollTop > 0
            ? Math.min(maxOuterScrollTop, candidateOuterScrollTop)
            : candidateOuterScrollTop;
      }

      const outerMoved = nextOuterScrollTop !== initialOuterScrollTop;
      const paneMoved =
        nextNestedScrollTop !== null &&
        nextNestedScrollTop !== nestedScrollPane?.scrollTop;
      if (!outerMoved && !paneMoved) {
        return;
      }

      event.preventDefault();
      if (outerMoved) {
        scrollArea.scrollTop = nextOuterScrollTop;
      }
      const nestedTarget = nextNestedScrollTop;
      if (paneMoved && nestedScrollPane && nestedTarget !== null) {
        nestedScrollPane.scrollTop = nestedTarget;
      }
    };

    content.addEventListener("wheel", handleContentWheel, {
      capture: true,
      passive: false,
    });
    content.addEventListener("keydown", handleContentKeyDown, {
      capture: true,
    });

    return () => {
      content.removeEventListener("wheel", handleContentWheel, {
        capture: true,
      });
      content.removeEventListener("keydown", handleContentKeyDown, {
        capture: true,
      });
    };
  }, [lockTopContent, topHeight]);

  const layoutStyle: CSSProperties = {
    ...(getLockedScreenLayoutHeight(topHeight, lockTopContent)
      ? { height: getLockedScreenLayoutHeight(topHeight, lockTopContent) }
      : {}),
    ...(reserveRightRail
      ? { paddingRight: "min(31rem, calc(100vw - 32rem))" }
      : {}),
  };

  return (
    <section className="h-full min-h-0">
      <div
        className="screen-scroll-area h-full overflow-y-auto overflow-x-hidden pr-1"
        ref={scrollRef}
      >
        <div
          className="grid min-h-full min-w-0 grid-rows-[auto_minmax(0,1fr)] transition-[padding-right] duration-200"
          ref={contentRef}
          style={layoutStyle}
        >
          <div ref={topRef} className={cn("min-w-0", topClassName)}>
            {topContent}
          </div>
          <div className={cn("min-h-0 min-w-0", contentClassName)}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
