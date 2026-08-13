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

  const pixelDelta =
    input.deltaMode === WHEEL_DELTA_LINE
      ? input.deltaY * 16
      : input.deltaMode === WHEEL_DELTA_PAGE
        ? input.deltaY * input.clientHeight
        : input.deltaY;
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);

  return Math.max(0, Math.min(maxScrollTop, input.scrollTop + pixelDelta));
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
  topClassName,
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
      const nestedScrollPane = eventTarget?.closest<HTMLElement>(
        "[data-locked-pane-scroll-region]",
      );

      if (event.deltaY > 0) {
        const nextLockedHeaderScrollTop = getLockedHeaderWheelTarget({
          deltaY: event.deltaY,
          scrollTop: scrollArea.scrollTop,
          topHeight,
          viewportWidth: window.innerWidth,
        });

        if (nextLockedHeaderScrollTop !== null) {
          event.preventDefault();
          scrollArea.scrollTop = nextLockedHeaderScrollTop;
          return;
        }
      }

      if (nestedScrollPane && content.contains(nestedScrollPane)) {
        const nextNestedScrollTop = getNestedPaneWheelTarget({
          clientHeight: nestedScrollPane.clientHeight,
          deltaMode: event.deltaMode,
          deltaY: event.deltaY,
          scrollHeight: nestedScrollPane.scrollHeight,
          scrollTop: nestedScrollPane.scrollTop,
        });

        if (nextNestedScrollTop !== null) {
          event.preventDefault();
          nestedScrollPane.scrollTop = nextNestedScrollTop;
          return;
        }
      }

      if (event.deltaY < 0) {
        const nextLockedHeaderScrollTop = getLockedHeaderWheelTarget({
          deltaY: event.deltaY,
          scrollTop: scrollArea.scrollTop,
          topHeight,
          viewportWidth: window.innerWidth,
        });

        if (nextLockedHeaderScrollTop !== null) {
          event.preventDefault();
          scrollArea.scrollTop = nextLockedHeaderScrollTop;
        }
      }
    };

    content.addEventListener("wheel", handleContentWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      content.removeEventListener("wheel", handleContentWheel, {
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
