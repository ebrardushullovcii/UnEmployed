import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@renderer/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        // A label has no fill or border of its own, so the disabled idiom it
        // can carry is the disabled text token. At 50% opacity this uppercase
        // 11px label composited to 2.29:1 (light) / 2.84:1 (dark) - the field
        // it names became unreadable at the same moment its content did.
        "flex items-center gap-2 font-display text-(length:--text-field-label) leading-none font-medium uppercase tracking-(--tracking-caps) text-muted-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-(--disabled-foreground) peer-disabled:cursor-not-allowed peer-disabled:text-(--disabled-foreground)",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
