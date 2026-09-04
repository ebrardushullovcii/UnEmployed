import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@renderer/lib/utils";

/**
 * The one floating surface shell.
 *
 * Three popover implementations existed - a portalled `role="dialog"` doing
 * its own clamp arithmetic, an unportalled `absolute` fieldset trapped inside
 * an `overflow-hidden` section, and the shell More menu - across three z
 * layers, three radii and three shadows. This is one z layer (below the modal
 * scrim), one radius token and one shadow token.
 *
 * It deliberately does NOT solve its own placement. The shared bounded
 * placement solver owns flipping above, shifting inside the viewport and
 * deriving an available height; this shell renders exactly the rect it is
 * given, so a surface can never quietly re-implement a second clamp with a
 * different floor. `maxHeight` is applied verbatim - including a value larger
 * than the viewport, which is the solver's business to prevent, not this
 * component's business to silently correct.
 */
export const POPOVER_SURFACE_CLASS =
  "fixed z-[70] overflow-y-auto overscroll-contain rounded-(--radius-panel) border border-(--surface-panel-border) bg-popover text-popover-foreground shadow-(--select-shadow)";

export interface PopoverPlacement {
  readonly top: number;
  readonly left: number;
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxHeight?: number;
}

function Popover({
  children,
  className,
  label,
  open,
  placement,
  role = "dialog",
  style,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> & {
  label: string;
  open: boolean;
  placement: PopoverPlacement;
  role?: "dialog" | "group" | "listbox" | "menu";
}) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      aria-label={label}
      className={cn(POPOVER_SURFACE_CLASS, className)}
      data-slot="popover"
      role={role}
      style={{
        top: placement.top,
        left: placement.left,
        ...(placement.width === undefined ? {} : { width: placement.width }),
        ...(placement.minWidth === undefined
          ? {}
          : { minWidth: placement.minWidth }),
        ...(placement.maxHeight === undefined
          ? {}
          : { maxHeight: placement.maxHeight }),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

export { Popover };
