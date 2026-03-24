import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const panelVariants = cva('rounded-[var(--radius-field)] border border-border-subtle bg-[rgba(17,17,17,0.9)]', {
  variants: {
    spacing: {
      default: null,
      shell: 'grid content-start gap-4 p-4',
      spacious: 'grid content-start gap-[var(--gap-card)] p-6'
    },
    tone: {
      default: null,
      muted: 'border-dashed border-border-strong bg-white/2'
    }
  },
  defaultVariants: {
    spacing: 'default',
    tone: 'default'
  }
})

type PanelProps = React.ComponentProps<'div'> & VariantProps<typeof panelVariants>

function Panel({ className, spacing, tone, ...props }: PanelProps) {
  return <div className={cn(panelVariants({ spacing, tone }), className)} {...props} />
}

export { Panel, panelVariants }
