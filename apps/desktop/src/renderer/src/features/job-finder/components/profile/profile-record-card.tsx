import { useState, type ReactNode } from 'react'
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
  const detailSummary = summary?.trim() || 'Expand to review and edit the full details.'

  return (
    <details
      className={cn(
        'group rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4 [&_summary::-webkit-details-marker]:hidden',
        className
      )}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="text-[0.96rem] font-semibold text-[var(--text-headline)]">{title}</p>
            <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{detailSummary}</p>
          </div>

          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--field-border)] bg-[var(--field)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-muted transition-transform group-open:[&_svg]:rotate-180">
            <ChevronDown className="size-3 transition-transform duration-200" />
            Details
          </span>
        </div>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-[var(--surface-panel-border)] pt-4">{children}</div>
    </details>
  )
}
