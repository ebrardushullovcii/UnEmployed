import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Chip({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center border border-border bg-surface-strong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-foreground-soft transition-[background-color,border-color] duration-150',
        className
      )}
      {...props}
    />
  )
}

export { Chip }
