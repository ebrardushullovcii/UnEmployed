import type { ReactNode } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { BadgeTone } from '../lib/job-finder-types'

interface StatusBadgeProps {
  children: ReactNode
  className?: string
  tone: BadgeTone
}

export function StatusBadge({ children, className, tone }: StatusBadgeProps) {
  const toneClassName = {
    active: 'border-primary/25 bg-primary/10 text-primary',
    critical: 'border-destructive/30 bg-destructive/10 text-destructive',
    muted: 'border-border bg-secondary text-muted-foreground',
    neutral: 'border-border bg-surface text-foreground-soft',
    positive: 'border-positive/30 bg-positive/10 text-positive'
  }[tone]

  return (
    <Badge className={cn(toneClassName, className)} variant="status">
      {children}
    </Badge>
  )
}
