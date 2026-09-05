import { ChevronRight } from "lucide-react";
import { cn } from "@renderer/lib/utils";

/**
 * One disclosure affordance for the Applications detail pane.
 *
 * The round-eight review found four stacked disclosure links in a single
 * column, three of them named "…details", all rendered as identical
 * low-contrast blue-grey text with no underline, chevron or box, and none of
 * them saying what they opened. Hue alone was carrying "this is clickable",
 * and the names were carrying nothing at all.
 *
 * This summary always paints a rotating chevron and an underline, so the
 * affordance never depends on colour, and it takes a `count` so a disclosure
 * can say how much is behind it before it is opened.
 */
export function ApplicationsDisclosureSummary(props: {
  children: React.ReactNode;
  className?: string;
  count?: number | undefined;
  "data-testid"?: string;
}) {
  const { children, className, count } = props;

  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center gap-1.5 text-(length:--text-small) font-semibold text-(--link) underline decoration-(--link)/50 underline-offset-4 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      data-testid={props["data-testid"]}
    >
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 no-underline transition-transform group-open:rotate-90 motion-reduce:transition-none"
        focusable="false"
      />
      <span>{children}</span>
      {typeof count === "number" ? (
        <span className="no-underline text-foreground-soft">({count})</span>
      ) : null}
    </summary>
  );
}
