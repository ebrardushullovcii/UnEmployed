import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'

const panelVariants = cva('rounded-(--radius-field) border border-border-subtle bg-(--panel-surface-muted)', {
  variants: {
    spacing: {
      default: null,
      shell: 'grid content-start gap-4 p-4',
      spacious: 'grid content-start gap-(--gap-card) p-6'
    },
    tone: {
      default: null,
      muted: 'border-dashed border-border-strong bg-(--surface-fill-subtle)'
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
