import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type WheelEvent,
} from "react";
import { cn } from "@renderer/lib/cn";

const LOCKED_PANE_BREAKPOINT = 1280;

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
    input.deltaY <= 0 ||
    input.topHeight <= 0 ||
    input.scrollTop >= input.topHeight
  ) {
    return null;
  }

  return Math.min(input.topHeight, input.scrollTop + input.deltaY);
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

  const layoutStyle: CSSProperties = {
    ...(getLockedScreenLayoutHeight(topHeight, lockTopContent)
      ? { height: getLockedScreenLayoutHeight(topHeight, lockTopContent) }
      : {}),
    ...(reserveRightRail
      ? { paddingRight: "min(31rem, calc(100vw - 32rem))" }
      : {}),
  };

  function handleContentWheel(event: WheelEvent<HTMLDivElement>) {
    const scrollArea = scrollRef.current;

    if (!scrollArea) {
      return;
    }

    const nextScrollTop = getLockedHeaderWheelTarget({
      deltaY: event.deltaY,
      scrollTop: scrollArea.scrollTop,
      topHeight,
      viewportWidth: window.innerWidth,
    });

    if (nextScrollTop === null) {
      return;
    }

    event.preventDefault();
    scrollArea.scrollTop = nextScrollTop;
  }

  return (
    <section className="h-full min-h-0">
      <div
        className="screen-scroll-area h-full overflow-y-auto overflow-x-hidden pr-1"
        ref={scrollRef}
      >
        <div
          className="grid min-h-full min-w-0 grid-rows-[auto_minmax(0,1fr)] transition-[padding-right] duration-200"
          onWheelCapture={handleContentWheel}
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
