import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { Label } from './label'

function Field({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('grid min-w-0 content-start gap-[var(--gap-field)] h-full', className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn(
        'text-[var(--text-field-label)] font-medium tracking-[var(--tracking-label)] text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldLabel }
