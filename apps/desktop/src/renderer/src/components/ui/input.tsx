import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] px-3.5 py-0 text-[var(--text-field)] tracking-normal text-foreground transition-[border-color,background-color,color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-[rgba(235,233,225,0.35)] focus-visible:bg-[var(--field-strong)] focus-visible:ring-0",
        "aria-invalid:border-destructive aria-invalid:ring-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }
