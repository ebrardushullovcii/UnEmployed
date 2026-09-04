import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@renderer/lib/utils";

/**
 * The canonical expander.
 *
 * 49 `<details>` elements shipped across roughly 18 container recipes - three
 * radii, four border tokens, and summaries that ranged from a bordered control
 * to a bare `group min-w-0` span reading as body text beside real controls.
 * This keeps the native element (so it stays keyboard-operable and findable by
 * in-page search when open) and gives it one box: one radius token, one border
 * token, one chevron that rotates on open, and a summary height from the
 * published control scale.
 *
 * It supports both an uncontrolled `defaultOpen` and a fully controlled `open`
 * so a caller can mirror the state without forking the markup.
 */
export type DisclosureSize = "toolbar" | "field";

const DISCLOSURE_SUMMARY_SIZE_CLASS = {
  toolbar: "h-8 px-2.5 text-xs",
  field: "h-11 px-3.5 text-sm",
} as const satisfies Record<DisclosureSize, string>;

function Disclosure({
  children,
  className,
  contentClassName,
  defaultOpen = false,
  onOpenChange,
  open,
  size = "toolbar",
  summary,
  summaryClassName,
  ...props
}: Omit<React.ComponentProps<"details">, "onToggle" | "open"> & {
  contentClassName?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  size?: DisclosureSize;
  summary: React.ReactNode;
  summaryClassName?: string;
}) {
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = isControlled ? open : uncontrolledOpen;

  return (
    <details
      className={cn("group min-w-0", className)}
      data-slot="disclosure"
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        if (!isControlled) {
          setUncontrolledOpen(nextOpen);
        }

        if (nextOpen !== isOpen) {
          onOpenChange?.(nextOpen);
        }
      }}
      open={isOpen}
      {...props}
    >
      <summary
        className={cn(
          "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-(--radius-button) border border-(--control-border) bg-transparent font-medium whitespace-nowrap text-foreground-soft transition-[background-color,border-color,color] outline-none select-none marker:hidden hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
          DISCLOSURE_SUMMARY_SIZE_CLASS[size],
          summaryClassName,
        )}
        data-slot="disclosure-summary"
      >
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div
        className={cn("min-w-0 pt-2", contentClassName)}
        data-slot="disclosure-content"
      >
        {children}
      </div>
    </details>
  );
}

export { Disclosure, DISCLOSURE_SUMMARY_SIZE_CLASS };
