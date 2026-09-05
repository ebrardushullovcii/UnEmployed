import type { CSSProperties } from "react";

import { cn } from "@renderer/lib/cn";

/**
 * One brand lockup for both workspace opening and the interactive shell.
 * macOS traffic lights occupy the leading title-bar area; callers keep that
 * reservation on the containing brand row so the centered module switcher is
 * never shifted with the wordmark.
 */
export function JobFinderShellBrand(props: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        // Keep the system face's painted ascenders/descenders away from the
        // hiddenInset edge. The 56px shell row still has room for the full
        // lockup at native 125% and when the sidebar is collapsed.
        "relative z-20 flex w-max shrink-0 flex-col whitespace-nowrap py-1",
        props.className,
      )}
      data-desktop-brand-lockup
      style={props.style}
    >
      <span
        className="font-display text-[1.45rem] font-black leading-[1.05] tracking-[-0.08em] text-(--headline-primary) max-[639px]:hidden sm:text-[2rem] xl:text-[2rem]"
        data-desktop-brand-wordmark
      >
        UNEMPLOYED
      </span>
      <span
        className="whitespace-nowrap text-[0.72rem] uppercase leading-[1.1] tracking-(--tracking-caps) text-muted-foreground sm:text-(length:--text-tiny)"
        data-desktop-brand-subtitle
      >
        Job Finder
      </span>
    </div>
  );
}
