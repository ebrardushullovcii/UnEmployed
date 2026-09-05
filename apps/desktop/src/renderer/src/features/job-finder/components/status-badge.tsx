import type { ReactNode } from "react";
import { Badge } from "@renderer/components/ui/badge";
import { cn } from "@renderer/lib/utils";
import type { BadgeTone } from "../lib/job-finder-types";

interface StatusBadgeProps {
  children: ReactNode;
  className?: string;
  tone: BadgeTone;
}

export function StatusBadge({ children, className, tone }: StatusBadgeProps) {
  // Tinted status fills at /10 with a /25-/30 border composited to
  // 1.18-1.4:1 in the light theme, so the chips read as tinted text runs and
  // the status grammar collapsed. The fills and borders below keep the same
  // hue families but survive both themes.
  //
  // The tinted borders are /75, not /65. The /65 alpha was measured for the
  // warning family alone and inherited by the rest, where it fell below the
  // 3:1 non-text floor against each chip's OWN tint: 2.97:1 for positive and
  // 2.86:1 for active in light. Re-measured per tone, /75 is the lowest alpha
  // that clears 3:1 for every tone in both themes (min 3.48). Pinned by
  // styles/globals.test.ts.
  const toneClassName = {
    active: "border-primary/75 bg-primary/15 text-primary",
    critical: "border-critical/75 bg-critical/15 text-critical",
    muted: "border-(--control-border) bg-secondary text-muted-foreground",
    neutral: "border-(--control-border) bg-surface text-foreground-soft",
    positive: "border-positive/75 bg-positive/15 text-positive",
    warning: "border-warning/75 bg-(--warning-surface) text-(--warning-text)",
  }[tone];

  return (
    <Badge
      className={cn(
        "inline-block w-auto min-w-0 max-w-full shrink whitespace-normal break-words text-center leading-4 [overflow-wrap:anywhere]",
        toneClassName,
        className,
      )}
      variant="status"
    >
      {children}
    </Badge>
  );
}
