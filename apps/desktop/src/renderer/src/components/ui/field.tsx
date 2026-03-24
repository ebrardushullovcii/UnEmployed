import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { Label } from '@renderer/components/ui/label'

function Field({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('grid min-w-0 gap-[0.44rem]', className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn(
        'text-[9px] tracking-[0.18em] text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldLabel }
