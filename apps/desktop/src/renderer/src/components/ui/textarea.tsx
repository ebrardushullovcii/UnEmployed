import * as React from "react"

import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full resize-none overflow-y-auto rounded-(--radius-field) border border-(--field-border) bg-(--field) px-3.5 py-2.5 text-(length:--text-field) leading-[1.45] tracking-normal text-foreground transition-[border-color,background-color,color] outline-none placeholder:text-muted-foreground focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-(--field-strong) focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
