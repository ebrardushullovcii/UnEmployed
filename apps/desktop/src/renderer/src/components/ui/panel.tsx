import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const panelVariants = cva(
  "rounded-(--radius-panel) border border-(--surface-panel-border) bg-(--surface-panel)",
  {
    variants: {
      spacing: {
        default: null,
        shell: "grid content-start gap-4 p-4",
        spacious: "grid content-start gap-(--gap-card) p-6",
      },
      tone: {
        default: null,
        muted: "border-dashed border-border-strong bg-(--surface-fill-subtle)",
        // Read-only well: inert content (a detail row, a disclosure body, a
        // technical-details block) recessed into the panel it sits in. It is
        // the published pair of the well tokens, so consumers stop spelling a
        // well as `bg-background/NN` - which composites to 1.00-1.08:1 and is
        // literally no fill at all on the canvas.
        well: "border-(--surface-well-border) bg-(--surface-well)",
      },
    },
    defaultVariants: {
      spacing: "default",
      tone: "default",
    },
  },
);

type PanelProps = React.ComponentProps<"div"> &
  VariantProps<typeof panelVariants>;

function Panel({ className, spacing, tone, ...props }: PanelProps) {
  return (
    <div
      className={cn(panelVariants({ spacing, tone }), className)}
      {...props}
    />
  );
}

export { Panel, panelVariants };
