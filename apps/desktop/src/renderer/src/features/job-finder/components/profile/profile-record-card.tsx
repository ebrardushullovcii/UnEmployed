import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface ProfileRecordCardProps {
  children: ReactNode
  className?: string
  defaultOpen?: boolean
  summary?: string
  title: string
}

export function ProfileRecordCard({ children, className, defaultOpen = false, summary, title }: ProfileRecordCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const detailSummary = summary?.trim() || 'Review and edit this entry.'

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <details
      className={cn(
        'surface-card-tint group rounded-(--radius-panel) border border-(--surface-panel-border) p-4 [&_summary::-webkit-details-marker]:hidden',
        className
      )}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="flex items-start justify-between gap-3 list-none cursor-pointer">
        <span className="grid gap-1 min-w-0">
          <span className="text-[0.96rem] font-semibold text-(--text-headline)">{title}</span>
          <span className="text-(length:--text-description) leading-6 text-foreground-muted">{detailSummary}</span>
        </span>

        <span className="inline-flex items-center gap-1 rounded-full border border-(--field-border) bg-(--field) px-2.5 py-1 text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted transition-transform group-open:[&_svg]:rotate-180">
          <ChevronDown className="size-3 transition-transform duration-200" />
          <span>{isOpen ? 'Collapse' : 'Expand'}</span>
        </span>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-(--surface-panel-border) pt-4">{children}</div>
    </details>
  )
}
